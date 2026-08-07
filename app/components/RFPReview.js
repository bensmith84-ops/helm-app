"use client";
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

// Read-only evaluation workspace. Reviewers see submissions, the comparison matrix,
// attachments and each other's feedback - but cannot edit portals, approve access,
// or see anything else in 3PL Billing.
export default function RFPReview() {
  const { user, profile, orgId } = useAuth();

  const [portals, setPortals] = useState([]);
  const [code, setCode] = useState(null);
  const [content, setContent] = useState(null);
  const [subs, setSubs] = useState([]);
  const [comments, setComments] = useState([]);
  const [scores, setScores] = useState([]);
  const [people, setPeople] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("compare");
  const [openSub, setOpenSub] = useState(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("rfp_portal_content")
        .select("rfp_code,title,rfp_type,status").order("rfp_code");
      setPortals(data || []);
      const withSubs = (data || []).find(p => p.status === "active");
      setCode(c => c || withSubs?.rfp_code || (data || [])[0]?.rfp_code || null);
    })();
  }, []);

  const load = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    const [{ data: c }, { data: s }, { data: cm }, { data: sc }] = await Promise.all([
      supabase.from("rfp_portal_content").select("content").eq("rfp_code", code).maybeSingle(),
      supabase.from("rfp_submissions").select("*").eq("rfp_code", code).order("created_at", { ascending: false }),
      supabase.from("rfp_review_comments").select("*").eq("rfp_code", code).order("created_at"),
      supabase.from("rfp_review_scores").select("*").eq("rfp_code", code),
    ]);
    setContent(c?.content || null);
    setSubs(s || []);
    setComments(cm || []);
    setScores(sc || []);
    const ids = [...new Set([...(cm || []).map(x => x.author_id), ...(sc || []).map(x => x.reviewer_id)])];
    if (ids.length) {
      const { data: pr } = await supabase.from("profiles").select("id,display_name,email").in("id", ids);
      setPeople(Object.fromEntries((pr || []).map(p => [p.id, p.display_name || p.email])));
    }
    setLoading(false);
  }, [code]);
  useEffect(() => { load(); }, [load]);

  const schema = content?.response_form || null;
  const criteria = (content?.eval_rows || []).map(r => r[0]);
  const proposals = subs.filter(s => s.submission_type === "proposal");
  const structured = proposals.filter(s => s.structured && Object.keys(s.structured).length);
  const questions = subs.filter(s => s.submission_type === "question");

  const addComment = async (subId) => {
    const body = (draft[subId] || "").trim();
    if (!body) return;
    setBusy(true);
    const { data, error } = await supabase.from("rfp_review_comments")
      .insert({ rfp_code: code, submission_id: subId, author_id: user.id, body, org_id: orgId })
      .select().single();
    setBusy(false);
    if (error) { alert("Could not post: " + error.message); return; }
    setComments(c => [...c, data]);
    setDraft(d => ({ ...d, [subId]: "" }));
    setPeople(p => ({ ...p, [user.id]: profile?.display_name || profile?.email || "You" }));
  };

  const setScore = async (subId, criterion, score) => {
    const existing = scores.find(x => x.submission_id === subId && x.reviewer_id === user.id && x.criterion === criterion);
    const row = { rfp_code: code, submission_id: subId, reviewer_id: user.id, criterion, score, org_id: orgId, updated_at: new Date().toISOString() };
    setScores(list => existing
      ? list.map(x => x === existing ? { ...x, score } : x)
      : [...list, { ...row, id: "tmp" + Date.now() }]);
    await supabase.from("rfp_review_scores").upsert(row, { onConflict: "submission_id,reviewer_id,criterion" });
  };

  const openFile = async (att) => {
    try {
      const { data, error } = await supabase.storage.from("rfp-submissions").createSignedUrl(att.path, 300);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener");
    } catch (e) { alert("Could not open file: " + (e.message || e)); }
  };

  const avgScore = (subId) => {
    const rows = scores.filter(x => x.submission_id === subId);
    if (!rows.length) return null;
    return (rows.reduce((n, x) => n + x.score, 0) / rows.length).toFixed(1);
  };
  const myScore = (subId, criterion) => scores.find(x => x.submission_id === subId && x.reviewer_id === user?.id && x.criterion === criterion)?.score || 0;
  const teamScore = (subId, criterion) => {
    const rows = scores.filter(x => x.submission_id === subId && x.criterion === criterion);
    return rows.length ? (rows.reduce((n, x) => n + x.score, 0) / rows.length).toFixed(1) : null;
  };

  const fmtNode = (n) => [n.address1, n.city, n.state, n.zip].filter(Boolean).join(", ");
  const fmtVal = (f, v) => {
    if (v === undefined || v === null || v === "") return null;
    if (f.t === "nodes" && Array.isArray(v)) return v.map((n, i) => `${i + 1}. ${fmtNode(n)}`).join("\n");
    if (Array.isArray(v)) return v.join(", ");
    if (f.t === "cur" && typeof v === "number") return "$" + v.toLocaleString(undefined, { minimumFractionDigits: f.dp ?? 2, maximumFractionDigits: f.dp ?? 2 });
    if (f.t === "num" && typeof v === "number") return v.toLocaleString() + (f.unit ? ` ${f.unit}` : "");
    return String(v);
  };
  const extremes = (f, vals) => {
    const nums = vals.filter(v => typeof v === "number");
    if (nums.length < 2) return {};
    const lower = f.t === "cur" || ["impl_weeks", "escalator"].includes(f.k);
    return { best: lower ? Math.min(...nums) : Math.max(...nums), worst: lower ? Math.max(...nums) : Math.min(...nums) };
  };

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 };
  const btn = { padding: "7px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none" };
  const btnGhost = { ...btn, background: T.surface2, color: T.text2, border: `1px solid ${T.border}` };
  const btnPrimary = { ...btn, background: T.accent, color: "#fff" };
  const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12.5, fontFamily: "inherit" };

  const CommentThread = ({ sub }) => {
    const mine = comments.filter(c => c.submission_id === sub.id);
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 7 }}>
          Team feedback {mine.length > 0 && `(${mine.length})`}
        </div>
        {mine.map(c => (
          <div key={c.id} style={{ marginBottom: 8, padding: "8px 11px", background: T.surface2, borderRadius: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <b style={{ fontSize: 12, color: T.text }}>{people[c.author_id] || "Someone"}</b>
              <span style={{ fontSize: 11, color: T.text3 }}>{new Date(c.created_at).toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 12.5, color: T.text2, whiteSpace: "pre-wrap", marginTop: 3 }}>{c.body}</div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <textarea rows={2} value={draft[sub.id] || ""} onChange={e => setDraft(d => ({ ...d, [sub.id]: e.target.value }))}
            placeholder="Add your read on this bidder…" style={{ ...inputStyle, resize: "vertical", flex: 1 }} />
          <button onClick={() => addComment(sub.id)} disabled={busy || !(draft[sub.id] || "").trim()} style={{ ...btnPrimary, alignSelf: "flex-end" }}>Post</button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <b style={{ fontSize: 15, color: T.text }}>RFP Review</b>
        <select value={code || ""} onChange={e => { setCode(e.target.value); setOpenSub(null); }} style={{ ...inputStyle, maxWidth: 340 }}>
          {portals.map(p => <option key={p.rfp_code} value={p.rfp_code}>{p.title || p.rfp_code}{p.status !== "active" ? " (closed)" : ""}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 2, background: T.surface2, borderRadius: 8, padding: 3 }}>
          {[["compare", `Compare${structured.length ? ` (${structured.length})` : ""}`], ["proposals", `Proposals${proposals.length ? ` (${proposals.length})` : ""}`], ["questions", `Questions${questions.length ? ` (${questions.length})` : ""}`]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ ...btn, background: tab === k ? T.surface : "transparent", color: tab === k ? T.text : T.text3 }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ ...card, padding: "9px 13px", marginBottom: 14, fontSize: 12, color: T.text2, display: "flex", gap: 9, alignItems: "center" }}>
        <span>👀</span>
        <span>Read-only evaluation view. Score bidders, leave feedback for the team, and open their attachments. Portal content, access approvals and pricing edits stay with the RFP owner.</span>
      </div>

      {loading && <div style={{ padding: 30, color: T.text3, fontSize: 13 }}>Loading…</div>}

      {!loading && tab === "compare" && (
        !schema || !structured.length ? (
          <div style={{ ...card, padding: 36, textAlign: "center", color: T.text3, fontSize: 13 }}>
            No structured proposals yet for this RFP. They appear here as bidders submit.
          </div>
        ) : (
          <div style={{ ...card, overflow: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
              <thead><tr>
                <th style={{ position: "sticky", left: 0, background: T.surface2, textAlign: "left", padding: "9px 12px", borderBottom: `1px solid ${T.border}`, minWidth: 250, zIndex: 2 }}>Field</th>
                {structured.map(s => (
                  <th key={s.id} style={{ textAlign: "left", padding: "9px 12px", borderBottom: `1px solid ${T.border}`, background: T.surface2, minWidth: 165, color: T.text }}>
                    {s.company || "(unnamed)"}
                    {avgScore(s.id) && <div style={{ fontWeight: 400, fontSize: 11, color: T.accent }}>avg score {avgScore(s.id)}/5</div>}
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {schema.map(sec => (
                  <React.Fragment key={sec.s}>
                    <tr><td colSpan={structured.length + 1} style={{ padding: "9px 12px", background: T.accent + "12", fontWeight: 700, color: T.accent, fontSize: 12, borderBottom: `1px solid ${T.border}` }}>{sec.s}</td></tr>
                    {(sec.f || []).map(f => {
                      const vals = structured.map(s => s.structured?.[f.k]);
                      const ex = extremes(f, vals);
                      return (
                        <tr key={f.k}>
                          <td style={{ position: "sticky", left: 0, background: T.surface, padding: "7px 12px", borderBottom: `1px solid ${T.border}`, color: T.text2, zIndex: 1 }}>{f.l}</td>
                          {vals.map((v, i) => {
                            const disp = fmtVal(f, v);
                            const best = typeof v === "number" && v === ex.best && ex.best !== ex.worst;
                            const worst = typeof v === "number" && v === ex.worst && ex.best !== ex.worst;
                            return (
                              <td key={i} style={{ padding: "7px 12px", borderBottom: `1px solid ${T.border}`,
                                whiteSpace: (f.t === "area" || f.t === "nodes") ? "pre-line" : "nowrap",
                                color: disp ? T.text : T.text3, fontWeight: best ? 700 : 400,
                                background: best ? "rgba(52,168,83,0.13)" : worst ? "rgba(251,188,5,0.13)" : "transparent",
                                maxWidth: (f.t === "area" || f.t === "nodes") ? 300 : undefined }}>{disp || "-"}</td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {!loading && tab === "proposals" && (
        !proposals.length ? (
          <div style={{ ...card, padding: 36, textAlign: "center", color: T.text3, fontSize: 13 }}>No proposals submitted yet.</div>
        ) : proposals.map(s => {
          const open = openSub === s.id;
          const cCount = comments.filter(c => c.submission_id === s.id).length;
          return (
            <div key={s.id} style={{ ...card, marginBottom: 9, overflow: "hidden" }}>
              <div onClick={() => setOpenSub(open ? null : s.id)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", cursor: "pointer", flexWrap: "wrap" }}>
                <b style={{ fontSize: 13.5, color: T.text }}>{s.company}</b>
                <span style={{ fontSize: 12, color: T.text2 }}>{s.contact_name}</span>
                {avgScore(s.id) && <span style={{ fontSize: 11.5, fontWeight: 700, color: T.accent }}>avg {avgScore(s.id)}/5</span>}
                {cCount > 0 && <span style={{ fontSize: 11.5, color: T.text3 }}>💬 {cCount}</span>}
                {Array.isArray(s.attachments) && s.attachments.length > 0 && <span style={{ fontSize: 11.5, color: T.text3 }}>📎 {s.attachments.length}</span>}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11.5, color: T.text3 }}>{new Date(s.created_at).toLocaleDateString()}</span>
                <span style={{ color: T.text3, fontSize: 11 }}>{open ? "▲" : "▼"}</span>
              </div>
              {open && (
                <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", gap: 15, flexWrap: "wrap", margin: "12px 0", fontSize: 12.5 }}>
                    <a href={`mailto:${s.email}`} style={{ color: T.accent }}>{s.email}</a>
                    {s.rate_card_url && <a href={s.rate_card_url} target="_blank" rel="noreferrer" style={{ color: T.accent }}>Pricing workbook ↗</a>}
                    {s.proposal_url && <a href={s.proposal_url} target="_blank" rel="noreferrer" style={{ color: T.accent }}>Full proposal ↗</a>}
                  </div>
                  {Array.isArray(s.attachments) && s.attachments.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
                      {s.attachments.map((a, i) => (
                        <button key={i} onClick={() => openFile(a)} style={{ ...btnGhost, fontSize: 11.5 }}>📎 {a.name}</button>
                      ))}
                    </div>
                  )}
                  {s.summary && (<>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Executive summary</div>
                    <div style={{ fontSize: 12.5, color: T.text, whiteSpace: "pre-wrap", marginBottom: 10 }}>{s.summary}</div>
                  </>)}

                  {criteria.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 7 }}>Your scores (1-5)</div>
                      {criteria.map(cr => (
                        <div key={cr} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12.5, color: T.text2, flex: 1, minWidth: 220 }} dangerouslySetInnerHTML={{ __html: cr }} />
                          <div style={{ display: "flex", gap: 4 }}>
                            {[1, 2, 3, 4, 5].map(n => (
                              <button key={n} onClick={() => setScore(s.id, cr, n)}
                                style={{ width: 28, height: 26, borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700,
                                  border: `1px solid ${myScore(s.id, cr) === n ? T.accent : T.border}`,
                                  background: myScore(s.id, cr) === n ? T.accent : T.surface2,
                                  color: myScore(s.id, cr) === n ? "#fff" : T.text3 }}>{n}</button>
                            ))}
                          </div>
                          {teamScore(s.id, cr) && <span style={{ fontSize: 11.5, color: T.text3, minWidth: 64 }}>team {teamScore(s.id, cr)}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  <CommentThread sub={s} />
                </div>
              )}
            </div>
          );
        })
      )}

      {!loading && tab === "questions" && (
        !questions.length ? (
          <div style={{ ...card, padding: 36, textAlign: "center", color: T.text3, fontSize: 13 }}>No questions submitted yet.</div>
        ) : questions.map(q => (
          <div key={q.id} style={{ ...card, marginBottom: 9, padding: "13px 15px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
              <b style={{ fontSize: 13, color: T.text }}>{q.company}</b>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 99,
                background: q.published ? "rgba(52,168,83,0.15)" : "rgba(251,188,5,0.15)",
                color: q.published ? "#34a853" : "#b8860b" }}>{q.published ? "published" : "not published"}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, color: T.text3 }}>{new Date(q.created_at).toLocaleDateString()}</span>
            </div>
            <div style={{ fontSize: 12.5, color: T.text, whiteSpace: "pre-wrap" }}>{q.questions}</div>
            {q.answer && (
              <div style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${T.border}`, fontSize: 12.5, color: T.text2, whiteSpace: "pre-wrap" }}>
                <b style={{ color: T.text }}>Answer: </b>{q.answer}
              </div>
            )}
            <CommentThread sub={q} />
          </div>
        ))
      )}
    </div>
  );
}
