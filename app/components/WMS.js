"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";
import { useResponsive } from "../lib/responsive";

// ═══════════════════════════════════════════════════════════════════════════════
// WMS — Warehouse Management System (Mobile-first)
// Receive, Put-away, Pick, Pack, Count, Transfer, Returns
// ═══════════════════════════════════════════════════════════════════════════════

const fmtN = n => new Intl.NumberFormat("en-US").format(n || 0);

const TaskCard = ({ task, onClick, color }) => (
  <div onClick={onClick} style={{ background: T.surface, border: `1px solid ${T.border}`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer", marginBottom: 8 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{task.title}</span>
      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: color + "20", color, textTransform: "capitalize" }}>{task.status}</span>
    </div>
    {task.description && <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.4, marginBottom: 6 }}>{task.description}</div>}
    <div style={{ display: "flex", gap: 10, fontSize: 11, color: T.text3 }}>
      <span style={{ textTransform: "capitalize" }}>{task.task_type}</span>
      {task.due_at && <span>Due {new Date(task.due_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
    </div>
  </div>
);

export default function WMSView() {
  const { user } = useAuth();
  const { isMobile } = useResponsive();
  const [view, setView] = useState("tasks");
  const [tasks, setTasks] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [variants, setVariants] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [lots, setLots] = useState([]);
  const [bins, setBins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanInput, setScanInput] = useState("");
  const scanRef = useRef(null);

  // Active workflow state
  const [activeTask, setActiveTask] = useState(null);
  const [workflowStep, setWorkflowStep] = useState(0);
  const [workflowData, setWorkflowData] = useState({});

  useEffect(() => {
    const load = async () => {
      const [{ data: t }, { data: f }, { data: v }, { data: inv }, { data: lt }, { data: b }] = await Promise.all([
        supabase.from("erp_wms_tasks").select("*").order("priority").order("due_at"),
        supabase.from("erp_facilities").select("*").order("name"),
        supabase.from("erp_product_variants").select("*").order("sku"),
        supabase.from("erp_inventory").select("*"),
        supabase.from("erp_inventory_lots").select("*").order("created_at", { ascending: false }),
        supabase.from("erp_bin_locations").select("*").order("code"),
      ]);
      setTasks(t || []); setFacilities(f || []); setVariants(v || []); setInventory(inv || []); setLots(lt || []); setBins(b || []);
      if (f?.length) setSelectedFacility(f.find(x => x.is_default)?.id || f[0].id);
      setLoading(false);
    };
    if (user) load();
  }, [user]);

  const TASK_COLORS = { receive: "#10B981", putaway: "#3B82F6", pick: "#F59E0B", pack: "#8B5CF6", count: "#EC4899", transfer: "#0EA5E9", return_inspect: "#EF4444" };
  const VIEWS = [
    { key: "tasks", icon: "📋", label: "Tasks" },
    { key: "receive", icon: "📥", label: "Receive" },
    { key: "pick", icon: "🛒", label: "Pick" },
    { key: "count", icon: "📊", label: "Count" },
    { key: "lookup", icon: "🔍", label: "Lookup" },
  ];

  const facilityTasks = tasks.filter(t => !selectedFacility || t.facility_id === selectedFacility);
  const pendingTasks = facilityTasks.filter(t => t.status === "pending" || t.status === "assigned");
  const inProgressTasks = facilityTasks.filter(t => t.status === "in_progress");
  const facilityBins = bins.filter(b => !selectedFacility || b.facility_id === selectedFacility);
  const facilityInv = inventory.filter(i => !selectedFacility || i.facility_id === selectedFacility);

  const getVariant = id => variants.find(v => v.id === id);

  // Handle barcode scan
  const handleScan = (val) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    // Try to match: variant SKU, barcode, lot number, or bin code
    const matchVariant = variants.find(v => v.sku === trimmed || v.barcode === trimmed);
    const matchLot = lots.find(l => l.lot_number === trimmed);
    const matchBin = facilityBins.find(b => b.code === trimmed || b.barcode === trimmed);
    if (matchVariant) setWorkflowData(d => ({ ...d, scannedVariant: matchVariant, lastScan: trimmed, scanType: "variant" }));
    else if (matchLot) setWorkflowData(d => ({ ...d, scannedLot: matchLot, lastScan: trimmed, scanType: "lot" }));
    else if (matchBin) setWorkflowData(d => ({ ...d, scannedBin: matchBin, lastScan: trimmed, scanType: "bin" }));
    else setWorkflowData(d => ({ ...d, lastScan: trimmed, scanType: "unknown" }));
    setScanInput("");
  };

  // Start a task
  const startTask = async (task) => {
    await supabase.from("erp_wms_tasks").update({ status: "in_progress", started_at: new Date().toISOString(), assigned_to: user?.id }).eq("id", task.id);
    setTasks(p => p.map(t => t.id === task.id ? { ...t, status: "in_progress", started_at: new Date().toISOString() } : t));
    setActiveTask(task);
    setWorkflowStep(0);
    setWorkflowData({});
    if (task.task_type === "receive") setView("receive");
    else if (task.task_type === "pick") setView("pick");
    else if (task.task_type === "count") setView("count");
  };

  const completeTask = async (task) => {
    await supabase.from("erp_wms_tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", task.id);
    setTasks(p => p.map(t => t.id === task.id ? { ...t, status: "completed" } : t));
    setActiveTask(null);
    setView("tasks");
  };

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: T.text3 }}>Loading WMS…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>📦 WMS</span>
          <select value={selectedFacility || ""} onChange={e => setSelectedFacility(e.target.value)}
            style={{ padding: "4px 8px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none" }}>
            {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B" }}>{pendingTasks.length} pending</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#3B82F6" }}>{inProgressTasks.length} active</span>
        </div>
      </div>

      {/* Scan bar — always visible */}
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${T.border}`, background: T.surface2, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input ref={scanRef} value={scanInput} onChange={e => setScanInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { handleScan(scanInput); } }}
            placeholder="Scan barcode or enter SKU / Lot / Bin…"
            style={{ flex: 1, padding: "10px 14px", fontSize: 14, background: T.surface, border: `2px solid ${T.accent}40`, borderRadius: 10, color: T.text, outline: "none", fontFamily: "monospace" }} />
          <button onClick={() => handleScan(scanInput)}
            style={{ padding: "10px 16px", fontSize: 14, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer" }}>Scan</button>
        </div>
        {workflowData.lastScan && (
          <div style={{ marginTop: 6, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: workflowData.scanType === "unknown" ? "#EF4444" : "#10B981", fontWeight: 700 }}>
              {workflowData.scanType === "variant" ? `✓ SKU: ${workflowData.scannedVariant.sku} — ${workflowData.scannedVariant.name}` :
               workflowData.scanType === "lot" ? `✓ Lot: ${workflowData.scannedLot.lot_number}` :
               workflowData.scanType === "bin" ? `✓ Bin: ${workflowData.scannedBin.code} (${workflowData.scannedBin.zone})` :
               `✗ Not found: ${workflowData.lastScan}`}
            </span>
          </div>
        )}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px 14px" }}>
        {/* TASKS VIEW */}
        {view === "tasks" && (
          <>
            {/* Quick stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[{ l: "Pending", v: pendingTasks.length, c: "#F59E0B" }, { l: "In Progress", v: inProgressTasks.length, c: "#3B82F6" }, { l: "Today", v: facilityTasks.filter(t => t.due_at && new Date(t.due_at).toDateString() === new Date().toDateString()).length, c: T.accent }].map(s => (
                <div key={s.l} style={{ textAlign: "center", padding: 10, background: T.surface, borderRadius: 10, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 10, color: T.text3 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* In Progress */}
            {inProgressTasks.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>🔄 In Progress</div>
                {inProgressTasks.map(t => <TaskCard key={t.id} task={t} color={TASK_COLORS[t.task_type] || T.accent} onClick={() => startTask(t)} />)}
              </div>
            )}

            {/* Pending */}
            {pendingTasks.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>📋 Pending ({pendingTasks.length})</div>
                {pendingTasks.map(t => <TaskCard key={t.id} task={t} color={TASK_COLORS[t.task_type] || T.text3} onClick={() => startTask(t)} />)}
              </div>
            )}

            {pendingTasks.length === 0 && inProgressTasks.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: T.text3 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>All caught up!</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>No pending tasks at this facility</div>
              </div>
            )}
          </>
        )}

        {/* RECEIVE VIEW */}
        {view === "receive" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#10B981" }}>📥 Receive</div>
              <button onClick={() => setView("tasks")} style={{ fontSize: 12, color: T.text3, background: "none", border: "none", cursor: "pointer" }}>← Back</button>
            </div>
            {activeTask && <div style={{ padding: "10px 14px", background: "#10B98115", border: "1px solid #10B98140", borderRadius: 10, fontSize: 12, color: T.text }}>{activeTask.title}</div>}
            <div style={{ fontSize: 13, color: T.text3 }}>1. Scan the product barcode or SKU</div>
            {workflowData.scannedVariant && (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{workflowData.scannedVariant.name}</div>
                <div style={{ fontSize: 12, fontFamily: "monospace", color: T.accent, marginTop: 2 }}>{workflowData.scannedVariant.sku}</div>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div><div style={{ fontSize: 11, color: T.text3, marginBottom: 2 }}>Quantity</div><input type="number" value={workflowData.receiveQty || ""} onChange={e => setWorkflowData(d => ({ ...d, receiveQty: e.target.value }))} placeholder="0" style={{ width: "100%", padding: "10px 14px", fontSize: 16, fontWeight: 700, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, outline: "none", boxSizing: "border-box", textAlign: "center" }} /></div>
                  <div><div style={{ fontSize: 11, color: T.text3, marginBottom: 2 }}>Bin Location</div><input value={workflowData.receiveBin || ""} onChange={e => setWorkflowData(d => ({ ...d, receiveBin: e.target.value }))} placeholder="Scan or type bin code" style={{ width: "100%", padding: "10px 14px", fontSize: 14, fontFamily: "monospace", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
                  <button onClick={async () => {
                    const qty = parseInt(workflowData.receiveQty);
                    if (!qty) return;
                    const lotNum = `LOT-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${String(lots.length+1).padStart(3,"0")}`;
                    const { data: lot } = await supabase.from("erp_inventory_lots").insert({ lot_number: lotNum, variant_id: workflowData.scannedVariant.id, received_date: new Date().toISOString().slice(0,10), status: "available" }).select().single();
                    if (lot) {
                      setLots(p => [lot, ...p]);
                      const { data: inv } = await supabase.from("erp_inventory").insert({ variant_id: workflowData.scannedVariant.id, facility_id: selectedFacility, lot_id: lot.id, quantity: qty, bin_location: workflowData.receiveBin || null }).select().single();
                      if (inv) setInventory(p => [...p, inv]);
                      await supabase.from("erp_inventory_movements").insert({ variant_id: workflowData.scannedVariant.id, facility_id: selectedFacility, lot_id: lot.id, movement_type: "receipt", quantity: qty, notes: `WMS receive: ${qty} units, lot ${lotNum}` });
                    }
                    if (activeTask) await completeTask(activeTask);
                    else { setWorkflowData({}); alert(`✅ Received ${qty}x ${workflowData.scannedVariant.sku}`); }
                  }} style={{ width: "100%", padding: "14px", fontSize: 16, fontWeight: 800, background: "#10B981", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer" }}>
                    ✓ Confirm Receipt
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PICK VIEW */}
        {view === "pick" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#F59E0B" }}>🛒 Pick</div>
              <button onClick={() => setView("tasks")} style={{ fontSize: 12, color: T.text3, background: "none", border: "none", cursor: "pointer" }}>← Back</button>
            </div>
            {activeTask ? (
              <div style={{ padding: "10px 14px", background: "#F59E0B15", border: "1px solid #F59E0B40", borderRadius: 10, fontSize: 12, color: T.text }}>{activeTask.title}</div>
            ) : (
              <div style={{ fontSize: 12, color: T.text3 }}>No active pick task. Start one from the task queue, or scan an item to begin ad-hoc picking.</div>
            )}
            <div style={{ fontSize: 13, color: T.text3 }}>1. Go to bin location → 2. Scan bin → 3. Pick item → 4. Scan item to verify</div>
            {workflowData.scannedBin && (
              <div style={{ padding: "10px 14px", background: "#3B82F615", border: "1px solid #3B82F640", borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#3B82F6" }}>📍 At Bin: {workflowData.scannedBin.code}</div>
                <div style={{ fontSize: 11, color: T.text3 }}>Zone: {workflowData.scannedBin.zone} · Type: {workflowData.scannedBin.bin_type}</div>
              </div>
            )}
            {workflowData.scannedVariant && (
              <div style={{ padding: "10px 14px", background: "#10B98115", border: "1px solid #10B98140", borderRadius: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>✓ Scanned: {workflowData.scannedVariant.sku}</div>
                <div style={{ fontSize: 12, color: T.text3 }}>{workflowData.scannedVariant.name}</div>
                <div style={{ marginTop: 8 }}><div style={{ fontSize: 11, color: T.text3, marginBottom: 2 }}>Picked Quantity</div><input type="number" value={workflowData.pickQty || ""} onChange={e => setWorkflowData(d => ({ ...d, pickQty: e.target.value }))} placeholder="0" style={{ width: "100%", padding: "10px", fontSize: 16, fontWeight: 700, textAlign: "center", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
                <button onClick={async () => {
                  if (activeTask) await completeTask(activeTask);
                  else { alert(`✅ Picked ${workflowData.pickQty || 0}x ${workflowData.scannedVariant.sku}`); setWorkflowData({}); }
                }} style={{ width: "100%", marginTop: 8, padding: "14px", fontSize: 16, fontWeight: 800, background: "#F59E0B", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer" }}>✓ Confirm Pick</button>
              </div>
            )}
          </div>
        )}

        {/* COUNT VIEW */}
        {view === "count" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#EC4899" }}>📊 Cycle Count</div>
              <button onClick={() => setView("tasks")} style={{ fontSize: 12, color: T.text3, background: "none", border: "none", cursor: "pointer" }}>← Back</button>
            </div>
            {activeTask && <div style={{ padding: "10px 14px", background: "#EC489915", border: "1px solid #EC489940", borderRadius: 10, fontSize: 12, color: T.text }}>{activeTask.title}</div>}
            <div style={{ fontSize: 13, color: T.text3 }}>Scan a bin location to start counting</div>
            {workflowData.scannedBin && (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>📍 Bin: {workflowData.scannedBin.code}</div>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>Zone: {workflowData.scannedBin.zone}</div>
                {/* Show expected inventory at this bin */}
                {facilityInv.filter(i => i.bin_location === workflowData.scannedBin.code).map(inv => {
                  const v = getVariant(inv.variant_id);
                  return (
                    <div key={inv.id} style={{ padding: "8px 10px", background: T.surface2, borderRadius: 8, marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div><div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{v?.sku || "?"}</div><div style={{ fontSize: 11, color: T.text3 }}>{v?.name || "Unknown"}</div></div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 10, color: T.text3 }}>Expected: {fmtN(inv.quantity)}</div>
                          <input type="number" placeholder="Count" style={{ width: 80, padding: "6px", fontSize: 14, fontWeight: 700, textAlign: "center", background: T.surface, border: `2px solid ${T.accent}40`, borderRadius: 8, color: T.text, outline: "none", marginTop: 4 }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {facilityInv.filter(i => i.bin_location === workflowData.scannedBin.code).length === 0 && (
                  <div style={{ fontSize: 12, color: T.text3, textAlign: "center", padding: 12 }}>No inventory expected at this bin</div>
                )}
                <button onClick={() => { if (activeTask) completeTask(activeTask); else { alert("Count submitted"); setWorkflowData({}); } }}
                  style={{ width: "100%", marginTop: 8, padding: "14px", fontSize: 16, fontWeight: 800, background: "#EC4899", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer" }}>✓ Submit Count</button>
              </div>
            )}
          </div>
        )}

        {/* LOOKUP VIEW */}
        {view === "lookup" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.accent }}>🔍 Inventory Lookup</div>
            <div style={{ fontSize: 13, color: T.text3 }}>Scan a SKU, lot, or bin to see current inventory</div>
            {workflowData.scannedVariant && (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{workflowData.scannedVariant.name}</div>
                <div style={{ fontSize: 12, fontFamily: "monospace", color: T.accent }}>{workflowData.scannedVariant.sku}</div>
                <div style={{ marginTop: 8 }}>
                  {facilityInv.filter(i => i.variant_id === workflowData.scannedVariant.id).map(inv => {
                    const lot = lots.find(l => l.id === inv.lot_id);
                    return (
                      <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                        <div><span style={{ fontWeight: 600 }}>{inv.bin_location || "—"}</span>{lot && <span style={{ color: T.text3, marginLeft: 6 }}>Lot: {lot.lot_number}</span>}</div>
                        <span style={{ fontWeight: 700, color: T.text }}>{fmtN(inv.quantity)}</span>
                      </div>
                    );
                  })}
                  {facilityInv.filter(i => i.variant_id === workflowData.scannedVariant.id).length === 0 && (
                    <div style={{ fontSize: 12, color: T.text3 }}>No stock at this facility</div>
                  )}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: T.text }}>
                  Total: {fmtN(facilityInv.filter(i => i.variant_id === workflowData.scannedVariant.id).reduce((s, i) => s + (i.quantity || 0), 0))} units
                </div>
              </div>
            )}
            {workflowData.scannedBin && (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>📍 Bin: {workflowData.scannedBin.code}</div>
                <div style={{ fontSize: 11, color: T.text3 }}>Zone: {workflowData.scannedBin.zone} · Type: {workflowData.scannedBin.bin_type}{workflowData.scannedBin.max_capacity ? ` · Cap: ${fmtN(workflowData.scannedBin.max_capacity)}` : ""}</div>
                <div style={{ marginTop: 8 }}>
                  {facilityInv.filter(i => i.bin_location === workflowData.scannedBin.code).map(inv => {
                    const v = getVariant(inv.variant_id);
                    return (
                      <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                        <span><span style={{ fontWeight: 600, fontFamily: "monospace", color: T.accent }}>{v?.sku}</span> {v?.name}</span>
                        <span style={{ fontWeight: 700 }}>{fmtN(inv.quantity)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ display: "flex", borderTop: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {VIEWS.map(v => (
          <button key={v.key} onClick={() => { setView(v.key); setWorkflowData({}); }}
            style={{ flex: 1, padding: "10px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none", cursor: "pointer", color: view === v.key ? T.accent : T.text3 }}>
            <span style={{ fontSize: 20 }}>{v.icon}</span>
            <span style={{ fontSize: 9, fontWeight: view === v.key ? 700 : 500 }}>{v.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
