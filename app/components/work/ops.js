"use client";
// Shared view logic: turning a view config into grouped tasks, and what
// "drop these tasks into that group" means for each kind of grouping.
import { useMemo } from "react";
import { applyFilters, sortTasks, groupTasks, dueBucketDate } from "./model";

export function useViewCtx(store, projectId) {
  const { sectionsOf, people, projectsById, fields, fieldValues, labelsOfMap } = store;
  return useMemo(() => ({
    sections: projectId ? sectionsOf.get(projectId) || [] : [], people, projects: projectsById,
    fields: projectId ? fields.filter((f) => f.project_id === projectId) : [],
    cfValue: (tid, fid) => fieldValues[tid]?.[fid], labelsOf: (tid) => labelsOfMap.get(tid) || [],
  }), [projectId, sectionsOf, people, projectsById, fields, fieldValues, labelsOfMap]);
}

export function useGroups(tasks, view, ctx, extraQ) {
  return useMemo(() => {
    const f = extraQ ? { ...view.filters, q: extraQ } : view.filters;
    const visible = sortTasks(applyFilters(tasks, f, ctx), view.sort, ctx);
    return { groups: groupTasks(visible, view.group, ctx), count: visible.length, visible };
  }, [tasks, view.filters, view.sort, view.group, ctx, extraQ]);
}

// Move tasks into group `g`, reading `orderedIds` as the group's final order (ignored when the view is sorted).
export async function moveToGroup(store, g, moved, orderedIds, sorted) {
  const ids = moved.map((t) => t.id); let patch = {};
  if (g.field === "section_id") {
    const linked = moved.filter((t) => t._link); linked.forEach((t) => store.moveLink(t._link, g.value));
    const home = moved.filter((t) => !t._link); if (!home.length) return;
    return store.placeTasks(home.map((t) => t.id), { section_id: g.value }, sorted ? [] : orderedIds);
  }
  if (g.field === "due_bucket") { const d = dueBucketDate(g.value); if (d !== undefined) patch = { due_date: d }; }
  else if (g.field?.startsWith("cf:")) { for (const t of moved) store.setFieldValue(t.id, g.field.slice(3), g.value); }
  else if (g.field) patch = { [g.field]: g.value };
  return store.placeTasks(ids, patch, sorted ? [] : orderedIds);
}
export const createInGroup = (g) => {
  if (!g || !g.field) return {};
  if (g.field === "due_bucket") { const d = dueBucketDate(g.value); return d ? { due_date: d } : {}; }
  if (g.field.startsWith("cf:")) return {};
  return { [g.field]: g.value };
};
