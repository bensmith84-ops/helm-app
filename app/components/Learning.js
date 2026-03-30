"use client";
import { useState, useEffect, useRef } from "react";
import { T } from "../tokens";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useResponsive } from "../lib/responsive";

/* ─── design tokens ─── */
const G = {
  get bg() { return T.bg; }, get surface() { return T.surface; }, get surface2() { return T.surface2; },
  get surface3() { return T.surface3 || T.surface2; }, get border() { return T.border; },
  accent: "#6C63FF", accentDim: "#6C63FF15", accentGlow: "#6C63FF40",
  green: "#34D399", greenDim: "#34D39915", yellow: "#FBBF24", yellowDim: "#FBBF2415",
  red: "#F87171", redDim: "#F8717115",
  get text() { return T.text; }, get text2() { return T.text2; }, get text3() { return T.text3; },
  gradient: "linear-gradient(135deg, #6C63FF 0%, #B24BF3 50%, #FF6B9D 100%)",
  cardGlow: "0 0 40px rgba(108,99,255,0.04)",
};
const CATS = { onboarding: { icon: "🌱", color: "#34D399", label: "Onboarding" }, compliance: { icon: "📋", color: "#FBBF24", label: "Compliance" }, product: { icon: "📦", color: "#6C63FF", label: "Product" }, safety: { icon: "🛡️", color: "#F87171", label: "Safety" }, process: { icon: "⚙️", color: "#38BDF8", label: "Process" }, skills: { icon: "💡", color: "#B24BF3", label: "Skills" }, other: { icon: "📚", color: "#9CA3C0", label: "Other" } };
const STATUS = { not_started: { color: G.text3, label: "Not Started", bg: G.surface3 }, in_progress: { color: G.yellow, label: "In Progress", bg: G.yellowDim }, completed: { color: G.green, label: "Completed", bg: G.greenDim }, expired: { color: G.red, label: "Expired", bg: G.redDim } };
const inp = { width: "100%", padding: "10px 14px", fontSize: 13, borderRadius: 10, border: `1px solid ${G.border}`, background: G.surface2, color: G.text, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" };

/* ─── progress ring ─── */
const ProgressRing = ({ pct, size = 52, stroke = 4, color = G.accent }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={G.surface3} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill={G.text} fontSize={size < 40 ? 9 : 12} fontWeight={700} style={{ transform: "rotate(90deg)", transformOrigin: "center" }}>{pct}%</text>
    </svg>
  );
};

/* ─── badge ─── */
const Badge = ({ label, color, bg }) => <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: bg || color + "18", color, letterSpacing: "0.03em" }}>{label}</span>;

export default function LearningView({ modulePerms = {} }) {
  const { user, profile } = useAuth();
  const { isMobile } = useResponsive();
  const [view, setView] = useState("my_learning");
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [progress, setProgress] = useState([]);
  const [allProgress, setAllProgress] = useState([]);
  const [quizAttempts, setQuizAttempts] = useState([]);
  const [members, setMembers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [activeLessonIdx, setActiveLessonIdx] = useState(0);
  const [showQuiz, setShowQuiz] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);
  const [showNewCourse, setShowNewCourse] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [showAssign, setShowAssign] = useState(null);
  const [assignForm, setAssignForm] = useState({ user_id: "", team_id: "", due_date: "", is_mandatory: true });
  const [courseForm, setCourseForm] = useState({ title: "", description: "", category: "onboarding", is_required: false, refresh_interval_days: "", estimated_minutes: "", passing_score: 70 });
  const [showLessonForm, setShowLessonForm] = useState(null);
  const [lessonForm, setLessonForm] = useState({ title: "", content_type: "text", content: "", estimated_minutes: "" });
  const [showQuizBuilder, setShowQuizBuilder] = useState(null);
  const [quizForm, setQuizForm] = useState({ title: "Quiz", questions: [{ q: "", type: "multiple_choice", options: ["", "", "", ""], correct: 0, points: 1 }], passing_score: 70 });
  const [catFilter, setCatFilter] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [courseStarted, setCourseStarted] = useState(false);
  const isAdmin = profile?.email?.includes("ben.smith@earthbreeze") || false;
  // LMS Admin: full admin OR has learning.manage_courses permission
  const isLmsAdmin = isAdmin || modulePerms["learning.manage_courses"] !== false;
  const canAssign = isLmsAdmin || modulePerms["learning.assign_courses"] !== false;
  const canViewAnalytics = isLmsAdmin || modulePerms["learning.view_analytics"] !== false;

  // Scroll to top when changing lessons
  useEffect(() => {
    const el = document.querySelector("[data-lms-scroll]");
    if (el) el.scrollTop = 0;
  }, [activeLessonIdx]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [r1,r2,r3,r4,r5,r6,r7,r8,r9,r10] = await Promise.all([
        supabase.from("lms_courses").select("*").is("deleted_at", null).order("title"),
        supabase.from("lms_lessons").select("*").order("sort_order"),
        supabase.from("lms_quizzes").select("*"),
        supabase.from("lms_assignments").select("*"),
        supabase.from("lms_progress").select("*").eq("user_id", user.id),
        supabase.from("lms_quiz_attempts").select("*").eq("user_id", user.id).order("attempted_at",{ascending:false}),
        supabase.from("profiles").select("id,display_name,email,department"),
        supabase.from("teams").select("*").is("deleted_at", null),
        supabase.from("team_members").select("*"),
        supabase.from("lms_progress").select("*"),
      ]);
      setCourses(r1.data||[]); setLessons(r2.data||[]); setQuizzes(r3.data||[]);
      setAssignments(r4.data||[]); setProgress(r5.data||[]); setQuizAttempts(r6.data||[]);
      setMembers(r7.data||[]); setTeams(r8.data||[]); setTeamMembers(r9.data||[]);
      setAllProgress(r10.data||[]); setLoading(false);
    })();
  }, [user?.id]);

  const getCourseLessons = cid => lessons.filter(l => l.course_id === cid).sort((a,b) => a.sort_order - b.sort_order);
  const getCourseQuiz = cid => quizzes.find(q => q.course_id === cid);
  const getMyProgress = cid => progress.find(p => p.course_id === cid);
  const getMemberName = id => members.find(m => m.id === id)?.display_name || "Unknown";
  const myTeamIds = teamMembers.filter(tm => tm.user_id === user?.id).map(tm => tm.team_id);
  const myCourseIds = [...new Set([
    ...assignments.filter(a => a.user_id === user?.id).map(a => a.course_id),
    ...assignments.filter(a => myTeamIds.includes(a.team_id)).map(a => a.course_id),
  ])];
  const publishedCourses = courses.filter(c => c.status === "published");
  const myCourses = publishedCourses.filter(c => myCourseIds.includes(c.id) || c.is_required);
  const completedCount = progress.filter(p => p.status === "completed").length;
  const inProgressCount = progress.filter(p => p.status === "in_progress").length;
  const overallPct = myCourses.length > 0 ? Math.round((completedCount / myCourses.length) * 100) : 0;

  /* ─── actions ─── */
  const completeLesson = async (courseId, lessonId) => {
    let prog = getMyProgress(courseId);
    const completed = [...(prog?.completed_lessons || [])];
    if (completed.includes(lessonId)) return;
    completed.push(lessonId);
    const cL = getCourseLessons(courseId);
    const allDone = cL.every(l => completed.includes(l.id));
    const quiz = getCourseQuiz(courseId);
    const qP = quizAttempts.some(a => a.course_id === courseId && a.passed);
    const done = allDone && (!quiz || qP);
    if (prog) {
      const patch = { completed_lessons: completed, status: done?"completed":"in_progress", completed_at: done?new Date().toISOString():null };
      await supabase.from("lms_progress").update(patch).eq("id", prog.id);
      setProgress(p => p.map(x => x.id === prog.id ? {...x,...patch} : x));
    } else {
      const row = { org_id:"a0000000-0000-0000-0000-000000000001", course_id:courseId, user_id:user.id, status:done?"completed":"in_progress", completed_lessons:completed, started_at:new Date().toISOString(), completed_at:done?new Date().toISOString():null };
      const { data } = await supabase.from("lms_progress").insert(row).select().single();
      if (data) setProgress(p => [...p, data]);
    }
  };

  const submitQuiz = async () => {
    if (!showQuiz) return;
    const qs = showQuiz.questions || [];
    let correct = 0, total = 0;
    qs.forEach((q,i) => { total += q.points||1; if (quizAnswers[i] === q.correct) correct += (q.points||1); });
    const score = total > 0 ? Math.round((correct/total)*100) : 0;
    const passed = score >= (showQuiz.passing_score || 70);
    const { data } = await supabase.from("lms_quiz_attempts").insert({ quiz_id:showQuiz.id, user_id:user.id, course_id:showQuiz.course_id, answers:Object.entries(quizAnswers).map(([i,v])=>({question_index:parseInt(i),selected:v})), score, passed }).select().single();
    if (data) setQuizAttempts(p => [data,...p]);
    setQuizResult({ score, passed, correct, total:qs.length });
    if (passed) {
      const prog = getMyProgress(showQuiz.course_id);
      const cL = getCourseLessons(showQuiz.course_id);
      if (prog && cL.every(l => (prog.completed_lessons||[]).includes(l.id))) {
        await supabase.from("lms_progress").update({ status:"completed", completed_at:new Date().toISOString() }).eq("id", prog.id);
        setProgress(p => p.map(x => x.id === prog.id ? {...x, status:"completed", completed_at:new Date().toISOString()} : x));
      }
    }
  };

  const saveCourse = async () => {
    if (!courseForm.title.trim()) return;
    const row = { title:courseForm.title, description:courseForm.description, category:courseForm.category, is_required:courseForm.is_required, passing_score:parseInt(courseForm.passing_score)||70, refresh_interval_days:courseForm.refresh_interval_days?parseInt(courseForm.refresh_interval_days):null, estimated_minutes:courseForm.estimated_minutes?parseInt(courseForm.estimated_minutes):null };
    if (editingCourse) { await supabase.from("lms_courses").update(row).eq("id",editingCourse.id); setCourses(p=>p.map(c=>c.id===editingCourse.id?{...c,...row}:c)); }
    else { const{data}=await supabase.from("lms_courses").insert({...row,status:"draft",created_by:user.id,org_id:"a0000000-0000-0000-0000-000000000001"}).select().single(); if(data) setCourses(p=>[...p,data]); }
    setShowNewCourse(false); setEditingCourse(null); setCourseForm({title:"",description:"",category:"onboarding",is_required:false,refresh_interval_days:"",estimated_minutes:"",passing_score:70});
  };

  const togglePublish = async c => { const n=c.status==="published"?"draft":"published"; await supabase.from("lms_courses").update({status:n}).eq("id",c.id); setCourses(p=>p.map(x=>x.id===c.id?{...x,status:n}:x)); };

  const saveLesson = async () => {
    if (!lessonForm.title.trim()||!showLessonForm) return;
    const mx = lessons.filter(l=>l.course_id===showLessonForm).reduce((m,l)=>Math.max(m,l.sort_order),-1);
    const{data}=await supabase.from("lms_lessons").insert({course_id:showLessonForm,title:lessonForm.title,content_type:lessonForm.content_type,content:lessonForm.content,sort_order:mx+1,estimated_minutes:lessonForm.estimated_minutes?parseInt(lessonForm.estimated_minutes):null}).select().single();
    if(data) setLessons(p=>[...p,data]);
    setShowLessonForm(null); setLessonForm({title:"",content_type:"text",content:"",estimated_minutes:""});
  };

  const deleteLesson = async lid => { if(!window.confirm("Delete this lesson?")) return; await supabase.from("lms_lessons").delete().eq("id",lid); setLessons(p=>p.filter(l=>l.id!==lid)); };

  const saveQuiz = async () => {
    if(!showQuizBuilder) return;
    const validQs = quizForm.questions.filter(q=>q.q.trim());
    if(validQs.length===0) return;
    const existing = getCourseQuiz(showQuizBuilder);
    if(existing) { await supabase.from("lms_quizzes").update({title:quizForm.title,questions:validQs,passing_score:quizForm.passing_score}).eq("id",existing.id); setQuizzes(p=>p.map(q=>q.id===existing.id?{...q,title:quizForm.title,questions:validQs,passing_score:quizForm.passing_score}:q)); }
    else { const{data}=await supabase.from("lms_quizzes").insert({course_id:showQuizBuilder,title:quizForm.title,questions:validQs,passing_score:quizForm.passing_score}).select().single(); if(data) setQuizzes(p=>[...p,data]); }
    setShowQuizBuilder(null); setQuizForm({title:"Quiz",questions:[{q:"",type:"multiple_choice",options:["","","",""],correct:0,points:1}],passing_score:70});
  };

  const assignCourse = async () => {
    if(!showAssign||(!assignForm.user_id&&!assignForm.team_id)) return;
    const row = {org_id:"a0000000-0000-0000-0000-000000000001",course_id:showAssign,assigned_by:user.id,due_date:assignForm.due_date||null,is_mandatory:assignForm.is_mandatory};
    if(assignForm.user_id) row.user_id=assignForm.user_id;
    if(assignForm.team_id) row.team_id=assignForm.team_id;
    const{data}=await supabase.from("lms_assignments").insert(row).select().single();
    if(data) setAssignments(p=>[...p,data]);
    setShowAssign(null); setAssignForm({user_id:"",team_id:"",due_date:"",is_mandatory:true});
  };

  if (loading) return <div style={{ display:"flex", height:"100%", alignItems:"center", justifyContent:"center", background:G.bg }}><div style={{ width:32, height:32, border:`3px solid ${G.border}`, borderTopColor:G.accent, borderRadius:"50%", animation:"lms-spin 0.8s linear infinite" }} /><style>{`@keyframes lms-spin{to{transform:rotate(360deg)}}`}</style></div>;

  /* ─── simple markdown renderer ─── */
  const renderContent = (text) => {
    if (!text) return null;
    // Strip the first H1 line — lesson title is already shown above
    let cleaned = text;
    const firstLine = text.split("\n")[0];
    if (firstLine.startsWith("# ")) cleaned = text.slice(firstLine.length).replace(/^\n+/, "");
    const lines = cleaned.split("\n");
    const elements = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.startsWith("# ")) {
        elements.push(<h1 key={i} style={{ fontSize:26, fontWeight:800, color:G.text, margin:"24px 0 12px", lineHeight:1.3, borderBottom:`2px solid ${G.accent}30`, paddingBottom:10 }}>{line.slice(2)}</h1>);
      } else if (line.startsWith("## ")) {
        elements.push(<h2 key={i} style={{ fontSize:20, fontWeight:700, color:G.text, margin:"20px 0 8px", lineHeight:1.3 }}>{line.slice(3)}</h2>);
      } else if (line.startsWith("### ")) {
        elements.push(<h3 key={i} style={{ fontSize:16, fontWeight:700, color:G.accent, margin:"16px 0 6px" }}>{line.slice(4)}</h3>);
      } else if (line.startsWith("- **") || line.startsWith("- ✅") || line.startsWith("- ❌") || line.startsWith("- [ ]")) {
        const items = [];
        while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("  -"))) {
          const item = lines[i].replace(/^-\s*/, "").replace(/\*\*([^*]+)\*\*/g, "⟨b⟩$1⟨/b⟩");
          items.push(item);
          i++;
        }
        i--;
        elements.push(
          <div key={i} style={{ margin:"8px 0", display:"flex", flexDirection:"column", gap:6 }}>
            {items.map((item, j) => {
              const parts = item.split(/⟨\/?b⟩/);
              const isBold = item.includes("⟨b⟩");
              return (
                <div key={j} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"8px 14px", background:G.surface2, borderRadius:10, borderLeft:`3px solid ${G.accent}30` }}>
                  <span style={{ color:G.accent, fontSize:14, flexShrink:0, marginTop:1 }}>•</span>
                  <span style={{ fontSize:14, color:G.text2, lineHeight:1.6 }}>
                    {isBold ? parts.map((p, k) => k % 2 === 1 ? <strong key={k} style={{ color:G.text, fontWeight:600 }}>{p}</strong> : p) : item}
                  </span>
                </div>
              );
            })}
          </div>
        );
      } else if (line.startsWith("| ")) {
        // Table
        const tableLines = [];
        while (i < lines.length && lines[i].startsWith("| ")) {
          tableLines.push(lines[i]);
          i++;
        }
        i--;
        const headers = tableLines[0]?.split("|").filter(Boolean).map(s => s.trim()) || [];
        const rows = tableLines.slice(2).map(r => r.split("|").filter(Boolean).map(s => s.trim()));
        elements.push(
          <div key={i} style={{ overflowX:"auto", margin:"12px 0", borderRadius:12, border:`1px solid ${G.border}` }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:G.surface2 }}>
                {headers.map((h, j) => <th key={j} style={{ padding:"10px 14px", fontSize:12, fontWeight:700, color:G.accent, textAlign:"left", borderBottom:`2px solid ${G.border}` }}>{h}</th>)}
              </tr></thead>
              <tbody>{rows.map((row, ri) => (
                <tr key={ri} style={{ borderBottom:`1px solid ${G.border}` }}>
                  {row.map((cell, ci) => <td key={ci} style={{ padding:"10px 14px", fontSize:13, color:G.text2 }}>{cell}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        );
      } else if (line.trim() === "") {
        elements.push(<div key={i} style={{ height:8 }} />);
      } else {
        // Regular paragraph — handle inline bold
        const parts = line.replace(/\*\*([^*]+)\*\*/g, "⟨b⟩$1⟨/b⟩").split(/⟨\/?b⟩/);
        const hasBold = line.includes("**");
        elements.push(
          <p key={i} style={{ fontSize:15, lineHeight:1.8, color:G.text2, margin:"4px 0" }}>
            {hasBold ? parts.map((p, k) => k % 2 === 1 ? <strong key={k} style={{ color:G.text, fontWeight:600 }}>{p}</strong> : p) : line}
          </p>
        );
      }
      i++;
    }
    return elements;
  };

  /* ═══ COURSE PLAYER ═══ */
  if (selectedCourse) {
    const c = selectedCourse;
    const cL = getCourseLessons(c.id);
    const prog = getMyProgress(c.id);
    const done = prog?.completed_lessons || [];
    const quiz = getCourseQuiz(c.id);
    const active = cL[activeLessonIdx];
    const lessonDone = active && done.includes(active.id);
    const allLessonsDone = cL.every(l => done.includes(l.id));
    const qPassed = quizAttempts.some(a => a.course_id === c.id && a.passed);
    const pct = cL.length > 0 ? Math.round((done.length / cL.length) * 100) : 0;
    const cat = CATS[c.category] || CATS.other;
    const courseComplete = allLessonsDone && (!quiz || qPassed);

    // ─── START SCREEN ───
    if (!courseStarted && !prog) {
      return (
        <div style={{ display:"flex", height:"100%", overflow:"auto", background:G.bg }}>
          <style>{`@keyframes lms-fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
          <div style={{ maxWidth:640, margin:"0 auto", padding:isMobile?"24px 16px":"60px 32px", animation:"lms-fadeIn 0.4s ease" }}>
            <button onClick={()=>{setSelectedCourse(null);setCourseStarted(false);}} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:G.text3, background:"none", border:"none", cursor:"pointer", marginBottom:24 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={G.text3} strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Back to courses
            </button>
            <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
              <div style={{ width:64, height:64, borderRadius:16, background:cat.color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:32 }}>{cat.icon}</div>
              <div>
                <Badge label={cat.label.toUpperCase()} color={cat.color} />
                {c.is_required && <Badge label="REQUIRED" color={G.red} />}
              </div>
            </div>
            <h1 style={{ fontSize:28, fontWeight:800, color:G.text, lineHeight:1.3, margin:"0 0 12px" }}>{c.title}</h1>
            {c.description && <p style={{ fontSize:15, color:G.text2, lineHeight:1.7, margin:"0 0 24px" }}>{c.description}</p>}
            <div style={{ display:"flex", gap:20, marginBottom:28, flexWrap:"wrap" }}>
              {[
                { icon:"📄", label:`${cL.length} Lessons` },
                quiz && { icon:"📝", label:`Quiz (${(quiz.questions||[]).length} questions)` },
                c.estimated_minutes && { icon:"⏱", label:`~${c.estimated_minutes} min` },
                c.passing_score && quiz && { icon:"🎯", label:`${c.passing_score}% to pass` },
                c.refresh_interval_days && { icon:"🔄", label:`Refresh every ${c.refresh_interval_days} days` },
              ].filter(Boolean).map((s,i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, color:G.text3 }}>
                  <span>{s.icon}</span> {s.label}
                </div>
              ))}
            </div>
            {/* Lesson outline */}
            <div style={{ borderRadius:14, border:`1px solid ${G.border}`, overflow:"hidden", marginBottom:28 }}>
              <div style={{ padding:"12px 16px", background:G.surface2, fontSize:12, fontWeight:700, color:G.text3, textTransform:"uppercase", letterSpacing:"0.05em" }}>Course Outline</div>
              {cL.map((l,i) => (
                <div key={l.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderTop:`1px solid ${G.border}` }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:G.surface2, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:G.accent }}>{i+1}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:G.text }}>{l.title}</div>
                    <div style={{ fontSize:11, color:G.text3 }}>{l.content_type === "text" ? "📄 Reading" : l.content_type === "video" ? "🎥 Video" : "🔗 Resource"}{l.estimated_minutes ? ` · ~${l.estimated_minutes} min` : ""}</div>
                  </div>
                </div>
              ))}
              {quiz && (
                <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderTop:`1px solid ${G.border}`, background:G.yellowDim }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:G.yellow+"25", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>📝</div>
                  <div><div style={{ fontSize:14, fontWeight:600, color:G.text }}>{quiz.title}</div><div style={{ fontSize:11, color:G.text3 }}>{(quiz.questions||[]).length} questions · {quiz.passing_score||70}% to pass</div></div>
                </div>
              )}
            </div>
            <button onClick={()=>setCourseStarted(true)} style={{ padding:"14px 36px", fontSize:15, fontWeight:700, background:G.gradient, color:"#fff", border:"none", borderRadius:12, cursor:"pointer", boxShadow:`0 4px 20px ${G.accentGlow}`, display:"flex", alignItems:"center", gap:8 }}>
              Start Course <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          </div>
        </div>
      );
    }

    // ─── PAGE-BY-PAGE READER ───
    return (
      <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", background:G.bg }}>
        <style>{`@keyframes lms-fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes lms-slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`}</style>
        {/* Top bar */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 20px", borderBottom:`1px solid ${G.border}`, background:G.surface, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={()=>{setSelectedCourse(null);setCourseStarted(false);setActiveLessonIdx(0);}} style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:G.text3, background:"none", border:"none", cursor:"pointer" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={G.text3} strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Exit
            </button>
            <span style={{ fontSize:13, fontWeight:600, color:G.text }}>{c.title}</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:120, height:4, background:G.surface3, borderRadius:2, overflow:"hidden" }}>
              <div style={{ height:"100%", background:pct===100?G.green:G.accent, width:`${pct}%`, transition:"width 0.5s" }} />
            </div>
            <span style={{ fontSize:11, color:G.text3, fontWeight:600 }}>{pct}%</span>
          </div>
        </div>

        {/* Page navigation dots */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"10px 20px", flexShrink:0 }}>
          {cL.map((l,i) => {
            const d = done.includes(l.id);
            const a = i === activeLessonIdx;
            return (
              <button key={l.id} onClick={()=>setActiveLessonIdx(i)} title={l.title}
                style={{ width:a?32:d?10:10, height:10, borderRadius:5, border:"none", cursor:"pointer", background:a?G.accent:d?G.green:G.surface3, transition:"all 0.2s", opacity:a?1:0.7 }} />
            );
          })}
          {quiz && (
            <button onClick={()=>{if(allLessonsDone){setShowQuiz(quiz);setQuizAnswers({});setQuizResult(null);}}} title="Quiz"
              style={{ width:10, height:10, borderRadius:5, border:`2px solid ${qPassed?G.green:allLessonsDone?G.yellow:G.surface3}`, background:qPassed?G.green:"transparent", cursor:allLessonsDone?"pointer":"default" }} />
          )}
        </div>

        {/* Content area */}
        <div data-lms-scroll="1" style={{ flex:1, overflow:"auto", display:"flex", justifyContent:"center" }}>
          <div key={activeLessonIdx} style={{ maxWidth:700, width:"100%", padding:isMobile?"20px 16px":"32px 24px", animation:"lms-slideIn 0.3s ease" }}>
            {active ? (
              <>
                {/* Lesson header */}
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:6, background:cat.color+"15", color:cat.color }}>Lesson {activeLessonIdx+1} of {cL.length}</span>
                  {lessonDone && <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:6, background:G.greenDim, color:G.green }}>✓ Complete</span>}
                  {active.estimated_minutes && <span style={{ fontSize:11, color:G.text3 }}>~{active.estimated_minutes} min read</span>}
                </div>
                <h1 style={{ fontSize:26, fontWeight:800, color:G.text, lineHeight:1.3, margin:"8px 0 20px" }}>{active.title}</h1>

                {/* Content */}
                {active.content_type === "text" && (
                  <div style={{ marginBottom:32 }}>{renderContent(active.content)}</div>
                )}
                {active.content_type === "video" && active.content && (
                  <div style={{ position:"relative", paddingBottom:"56.25%", height:0, borderRadius:12, overflow:"hidden", marginBottom:24, boxShadow:`0 4px 20px rgba(0,0,0,0.15)` }}>
                    <iframe src={active.content.replace("watch?v=","embed/").replace("youtu.be/","youtube.com/embed/")} style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", border:"none" }} allowFullScreen />
                  </div>
                )}
                {(active.content_type === "document" || active.content_type === "link") && active.content && (
                  <a href={active.content} target="_blank" rel="noopener noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"14px 24px", background:G.accentDim, color:G.accent, borderRadius:12, fontSize:14, fontWeight:600, textDecoration:"none", border:`1px solid ${G.accent}25`, marginBottom:24 }}>
                    {active.content_type === "document" ? "📎 Open Document" : "🔗 Open Link"} →
                  </a>
                )}
              </>
            ) : (
              <div style={{ textAlign:"center", padding:60, color:G.text3 }}><div style={{ fontSize:40, marginBottom:12 }}>📚</div>No lessons yet</div>
            )}
          </div>
        </div>

        {/* Bottom navigation bar */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 24px", borderTop:`1px solid ${G.border}`, background:G.surface, flexShrink:0 }}>
          <button onClick={()=>{ if (activeLessonIdx > 0) setActiveLessonIdx(activeLessonIdx - 1); }} disabled={activeLessonIdx === 0}
            style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 18px", fontSize:13, fontWeight:600, background:G.surface2, border:`1px solid ${G.border}`, borderRadius:10, color:activeLessonIdx===0?G.text3:G.text, cursor:activeLessonIdx===0?"default":"pointer", opacity:activeLessonIdx===0?0.4:1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Previous
          </button>
          <div style={{ textAlign:"center" }}>
            {active && <div style={{ fontSize:12, color:G.text3, fontWeight:500 }}>{active.title}</div>}
          </div>
          {active && !lessonDone ? (
            <button onClick={async()=>{ await completeLesson(c.id, active.id); if (activeLessonIdx < cL.length-1) setActiveLessonIdx(activeLessonIdx+1); }}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 22px", fontSize:13, fontWeight:700, background:G.gradient, color:"#fff", border:"none", borderRadius:10, cursor:"pointer", boxShadow:`0 2px 12px ${G.accentGlow}` }}>
              Complete{activeLessonIdx < cL.length-1 ? " & Next" : ""} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          ) : activeLessonIdx < cL.length-1 ? (
            <button onClick={()=>setActiveLessonIdx(activeLessonIdx+1)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 22px", fontSize:13, fontWeight:600, background:G.accent, color:"#fff", border:"none", borderRadius:10, cursor:"pointer" }}>
              Next <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          ) : allLessonsDone && quiz && !qPassed ? (
            <button onClick={()=>{setShowQuiz(quiz);setQuizAnswers({});setQuizResult(null);}}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 22px", fontSize:13, fontWeight:700, background:G.yellow, color:G.bg, border:"none", borderRadius:10, cursor:"pointer" }}>
              📝 Take Quiz
            </button>
          ) : courseComplete ? (
            <button onClick={()=>{setSelectedCourse(null);setCourseStarted(false);setActiveLessonIdx(0);}}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 22px", fontSize:13, fontWeight:700, background:G.green, color:"#fff", border:"none", borderRadius:10, cursor:"pointer" }}>
              🎓 Course Complete!
            </button>
          ) : (
            <div style={{ width:120 }} />
          )}
        </div>

        {/* Quiz Modal */}
        {showQuiz && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }} onClick={()=>{setShowQuiz(null);setQuizResult(null);}}>
            <div onClick={e=>e.stopPropagation()} style={{ width:"min(620px,95vw)", maxHeight:"85vh", overflow:"auto", background:G.surface, borderRadius:20, padding:28, boxShadow:"0 20px 60px rgba(0,0,0,0.4)", border:`1px solid ${G.border}` }}>
              {quizResult ? (
                <div style={{ textAlign:"center", padding:24, animation:"lms-fadeIn 0.4s ease" }}>
                  <div style={{ width:100, height:100, borderRadius:50, background:quizResult.passed?G.greenDim:G.redDim, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", fontSize:40 }}>{quizResult.passed?"🎉":"😔"}</div>
                  <div style={{ fontSize:36, fontWeight:900, color:quizResult.passed?G.green:G.red }}>{quizResult.score}%</div>
                  <div style={{ fontSize:14, color:G.text2, marginTop:4 }}>{quizResult.correct}/{quizResult.total} correct</div>
                  <div style={{ fontSize:13, color:quizResult.passed?G.green:G.red, marginTop:12, fontWeight:600, padding:"8px 16px", background:quizResult.passed?G.greenDim:G.redDim, borderRadius:8, display:"inline-block" }}>{quizResult.passed?"🎓 Congratulations — you passed!":`Need ${showQuiz.passing_score||70}% to pass`}</div>
                  <div style={{ marginTop:20 }}><button onClick={()=>{setShowQuiz(null);setQuizResult(null);}} style={{ padding:"10px 28px", fontSize:13, fontWeight:700, background:G.gradient, color:"#fff", border:"none", borderRadius:10, cursor:"pointer" }}>Close</button></div>
                </div>
              ) : (
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                    <div><div style={{ fontSize:20, fontWeight:800, color:G.text }}>{showQuiz.title}</div><div style={{ fontSize:12, color:G.text3, marginTop:4 }}>Pass: {showQuiz.passing_score||70}% · {(showQuiz.questions||[]).length} questions</div></div>
                    <button onClick={()=>setShowQuiz(null)} style={{ width:32, height:32, borderRadius:8, background:G.surface3, border:"none", color:G.text3, cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
                  </div>
                  {(showQuiz.questions||[]).map((q,qi) => (
                    <div key={qi} style={{ marginBottom:14, padding:18, background:G.surface2, borderRadius:12, border:`1px solid ${quizAnswers[qi]!==undefined?G.accent+"40":G.border}`, transition:"border-color 0.2s" }}>
                      <div style={{ fontSize:14, fontWeight:600, color:G.text, marginBottom:12 }}><span style={{ color:G.accent, marginRight:6 }}>{qi+1}.</span>{q.q}</div>
                      <div style={{ display:"flex", flexDirection:q.type==="true_false"?"row":"column", gap:8 }}>
                        {(q.type==="true_false"?["True","False"]:q.options||[]).map((opt,oi) => (
                          <button key={oi} onClick={()=>setQuizAnswers(p=>({...p,[qi]:oi}))} style={{ flex:q.type==="true_false"?1:undefined, padding:"10px 14px", borderRadius:8, border:`2px solid ${quizAnswers[qi]===oi?G.accent:G.border}`, background:quizAnswers[qi]===oi?G.accentDim:"transparent", color:quizAnswers[qi]===oi?G.accent:G.text2, fontSize:13, cursor:"pointer", textAlign:"left", transition:"all 0.15s", fontWeight:quizAnswers[qi]===oi?600:400 }}>
                            {quizAnswers[qi]===oi && <span style={{ marginRight:6 }}>●</span>}{opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
                    <button onClick={()=>setShowQuiz(null)} style={{ padding:"10px 20px", fontSize:12, background:G.surface3, border:"none", borderRadius:8, color:G.text3, cursor:"pointer" }}>Cancel</button>
                    <button onClick={submitQuiz} disabled={Object.keys(quizAnswers).length<(showQuiz.questions||[]).length} style={{ padding:"10px 24px", fontSize:13, fontWeight:700, background:G.gradient, color:"#fff", border:"none", borderRadius:10, cursor:"pointer", opacity:Object.keys(quizAnswers).length<(showQuiz.questions||[]).length?0.4:1 }}>Submit Answers</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ═══ MAIN VIEWS ═══ */
  const tabs = [
    { id:"my_learning", label:"My Learning", icon:"📖" },
    { id:"catalog", label:"Catalog", icon:"📚" },
    ...(isLmsAdmin ? [{ id:"course_builder", label:"Builder", icon:"🏗️" }, { id:"manage", label:"Analytics", icon:"📊" }] : []),
  ];

  const filteredCatalog = publishedCourses.filter(c => {
    if (catFilter !== "all" && c.category !== catFilter) return false;
    if (searchQ && !c.title.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", background:G.bg }}>
      <style>{`@keyframes lms-spin{to{transform:rotate(360deg)}} @keyframes lms-fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} .lms-card{transition:transform 0.2s, box-shadow 0.2s} .lms-card:hover{transform:translateY(-2px);box-shadow:${G.cardGlow}} .lms-tab:hover{background:${G.surface3} !important}`}</style>

      {/* Header */}
      <div style={{ padding:isMobile?"16px 14px":"20px 32px", borderBottom:`1px solid ${G.border}`, background:G.surface, flexShrink:0 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:G.gradient, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>📚</div>
            <div>
              <div style={{ fontSize:20, fontWeight:800, color:G.text }}>Learning</div>
              <div style={{ fontSize:12, color:G.text3 }}>{publishedCourses.length} courses · {completedCount} completed</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <ProgressRing pct={overallPct} size={42} stroke={3} color={overallPct===100?G.green:G.accent} />
            <div style={{ display:"flex", background:G.surface2, borderRadius:10, padding:3, gap:2 }}>
              {tabs.map(t => (
                <button key={t.id} className="lms-tab" onClick={()=>setView(t.id)} style={{ padding:"7px 14px", fontSize:11, fontWeight:600, border:"none", cursor:"pointer", borderRadius:8, background:view===t.id?G.surface3:"transparent", color:view===t.id?G.text:G.text3, transition:"all 0.15s" }}>{t.icon} {!isMobile&&t.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex:1, overflow:"auto", padding:isMobile?"16px 14px":"24px 32px" }}>

        {/* ═══ MY LEARNING ═══ */}
        {view === "my_learning" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20, animation:"lms-fadeIn 0.3s ease" }}>
            {/* Hero stats */}
            <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)", gap:12 }}>
              {[
                { l:"Assigned", v:myCourses.length, c:G.accent, icon:"📋" },
                { l:"Completed", v:completedCount, c:G.green, icon:"✅" },
                { l:"In Progress", v:inProgressCount, c:G.yellow, icon:"🔄" },
                { l:"Not Started", v:myCourses.filter(c=>!getMyProgress(c.id)).length, c:G.text3, icon:"⬜" },
              ].map(s => (
                <div key={s.l} className="lms-card" style={{ background:G.surface, border:`1px solid ${G.border}`, borderRadius:14, padding:16, textAlign:"center" }}>
                  <div style={{ fontSize:20, marginBottom:4 }}>{s.icon}</div>
                  <div style={{ fontSize:26, fontWeight:900, color:s.c }}>{s.v}</div>
                  <div style={{ fontSize:10, color:G.text3, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Course list */}
            {myCourses.length === 0 ? (
              <div style={{ textAlign:"center", padding:60, color:G.text3 }}><div style={{fontSize:40,marginBottom:12}}>🎓</div><div style={{fontSize:15,fontWeight:600}}>No courses assigned yet</div><div style={{fontSize:12,marginTop:4}}>Check back soon or browse the catalog</div></div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {myCourses.map(c => {
                  const prog = getMyProgress(c.id);
                  const cL = getCourseLessons(c.id);
                  const pct = cL.length>0?Math.round(((prog?.completed_lessons||[]).length/cL.length)*100):0;
                  const quiz = getCourseQuiz(c.id);
                  const qP = quizAttempts.some(a=>a.course_id===c.id&&a.passed);
                  const st = prog?.status||"not_started";
                  const cat = CATS[c.category]||CATS.other;
                  const asgn = assignments.find(a=>a.course_id===c.id&&(a.user_id===user?.id||myTeamIds.includes(a.team_id)));
                  const overdue = asgn?.due_date && new Date(asgn.due_date) < new Date() && st !== "completed";
                  return (
                    <div key={c.id} className="lms-card" onClick={()=>{setSelectedCourse(c);setActiveLessonIdx(0);}} style={{ display:"flex", alignItems:"center", gap:16, padding:16, background:G.surface, border:`1px solid ${overdue?G.red+"40":G.border}`, borderRadius:14, cursor:"pointer" }}>
                      <ProgressRing pct={pct} size={52} stroke={4} color={pct===100?G.green:cat.color} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                          <span style={{ fontSize:16 }}>{cat.icon}</span>
                          <span style={{ fontSize:15, fontWeight:700, color:G.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.title}</span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <span style={{ fontSize:11, color:G.text3 }}>{cL.length} lessons{quiz?" + quiz":""}</span>
                          <Badge label={STATUS[st].label} color={STATUS[st].color} />
                          {c.is_required && <Badge label="REQUIRED" color={G.red} />}
                          {overdue && <Badge label="OVERDUE" color={G.red} bg={G.redDim} />}
                          {asgn?.due_date && !overdue && st!=="completed" && <span style={{ fontSize:10, color:G.text3 }}>Due {new Date(asgn.due_date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
                        </div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={G.text3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ CATALOG ═══ */}
        {view === "catalog" && (
          <div style={{ animation:"lms-fadeIn 0.3s ease" }}>
            <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
              <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search courses…" style={{ ...inp, maxWidth:260, background:G.surface, border:`1px solid ${G.border}` }} />
              <div style={{ display:"flex", gap:3, background:G.surface2, borderRadius:8, padding:3 }}>
                {[{id:"all",label:"All"},...Object.entries(CATS).map(([k,v])=>({id:k,label:v.label,icon:v.icon}))].map(f => (
                  <button key={f.id} onClick={()=>setCatFilter(f.id)} style={{ padding:"5px 10px", fontSize:10, fontWeight:600, border:"none", cursor:"pointer", borderRadius:6, background:catFilter===f.id?G.surface3:"transparent", color:catFilter===f.id?G.text:G.text3 }}>{f.icon||"🔘"} {f.label}</button>
                ))}
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)", gap:14 }}>
              {filteredCatalog.map(c => {
                const cL = getCourseLessons(c.id);
                const prog = getMyProgress(c.id);
                const cat = CATS[c.category]||CATS.other;
                const pct = cL.length>0&&prog?Math.round(((prog.completed_lessons||[]).length/cL.length)*100):0;
                return (
                  <div key={c.id} className="lms-card" onClick={()=>{setSelectedCourse(c);setActiveLessonIdx(0);}} style={{ background:G.surface, border:`1px solid ${G.border}`, borderRadius:16, cursor:"pointer", overflow:"hidden" }}>
                    <div style={{ height:6, background:cat.color+"30" }}><div style={{ height:"100%", background:cat.color, width:`${pct}%`, transition:"width 0.4s" }} /></div>
                    <div style={{ padding:18 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                        <span style={{ fontSize:32 }}>{cat.icon}</span>
                        {prog?.status==="completed" && <Badge label="✅ DONE" color={G.green} />}
                      </div>
                      <div style={{ fontSize:15, fontWeight:700, color:G.text, marginBottom:6, lineHeight:1.3 }}>{c.title}</div>
                      {c.description && <div style={{ fontSize:12, color:G.text3, lineHeight:1.5, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden", marginBottom:10 }}>{c.description}</div>}
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        <Badge label={cat.label} color={cat.color} />
                        <Badge label={`${cL.length} lessons`} color={G.text3} bg={G.surface3} />
                        {c.is_required && <Badge label="REQUIRED" color={G.red} />}
                        {c.estimated_minutes && <Badge label={`~${c.estimated_minutes} min`} color={G.text3} bg={G.surface3} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ COURSE BUILDER ═══ */}
        {view === "course_builder" && isLmsAdmin && (
          <div style={{ animation:"lms-fadeIn 0.3s ease", display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:16, fontWeight:700, color:G.text }}>All Courses ({courses.length})</div>
              <button onClick={()=>{setCourseForm({title:"",description:"",category:"onboarding",is_required:false,refresh_interval_days:"",estimated_minutes:"",passing_score:70});setEditingCourse(null);setShowNewCourse(true);}} style={{ padding:"8px 16px", fontSize:12, fontWeight:700, background:G.gradient, color:"#fff", border:"none", borderRadius:10, cursor:"pointer" }}>+ New Course</button>
            </div>
            {courses.map(c => {
              const cL = getCourseLessons(c.id);
              const quiz = getCourseQuiz(c.id);
              const assignCount = assignments.filter(a=>a.course_id===c.id).length;
              const cat = CATS[c.category]||CATS.other;
              return (
                <div key={c.id} style={{ background:G.surface, border:`1px solid ${G.border}`, borderRadius:14, padding:16, borderLeft:`4px solid ${c.status==="published"?G.green:G.text3}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                    <div><div style={{ fontSize:14, fontWeight:700, color:G.text }}>{cat.icon} {c.title}</div><div style={{ fontSize:11, color:G.text3, marginTop:2 }}>{cL.length} lessons{quiz?" + quiz":""} · {assignCount} assigned</div></div>
                    <Badge label={c.status.toUpperCase()} color={c.status==="published"?G.green:G.text3} />
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {[
                      { l:"+ Lesson", c:G.accent, fn:()=>setShowLessonForm(c.id) },
                      { l:quiz?"✏️ Quiz":"📝 Quiz", c:G.yellow, fn:()=>{setShowQuizBuilder(c.id);if(quiz) setQuizForm({title:quiz.title,questions:quiz.questions,passing_score:quiz.passing_score}); else setQuizForm({title:"Quiz",questions:[{q:"",type:"multiple_choice",options:["","","",""],correct:0,points:1}],passing_score:70});} },
                      { l:"👥 Assign", c:"#B24BF3", fn:()=>{setShowAssign(c.id);setAssignForm({user_id:"",team_id:"",due_date:"",is_mandatory:true});} },
                      { l:"✏️ Edit", c:G.text3, fn:()=>{setEditingCourse(c);setCourseForm({title:c.title,description:c.description||"",category:c.category,is_required:c.is_required,refresh_interval_days:c.refresh_interval_days||"",estimated_minutes:c.estimated_minutes||"",passing_score:c.passing_score||70});setShowNewCourse(true);} },
                      { l:c.status==="published"?"Unpublish":"Publish", c:c.status==="published"?G.red:G.green, fn:()=>togglePublish(c) },
                    ].map(b => <button key={b.l} onClick={b.fn} style={{ padding:"5px 12px", fontSize:10, fontWeight:600, background:b.c+"15", color:b.c, border:"none", borderRadius:6, cursor:"pointer" }}>{b.l}</button>)}
                  </div>
                  {cL.length>0 && (
                    <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${G.border}` }}>
                      {cL.map((l,i) => (
                        <div key={l.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"3px 0", fontSize:11, color:G.text2 }}>
                          <span>{i+1}. {l.title} <span style={{color:G.text3}}>({l.content_type})</span></span>
                          <button onClick={()=>deleteLesson(l.id)} style={{ fontSize:10, color:G.red, background:"none", border:"none", cursor:"pointer" }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ ANALYTICS ═══ */}
        {view === "manage" && isLmsAdmin && (
          <div style={{ animation:"lms-fadeIn 0.3s ease", display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ fontSize:16, fontWeight:700, color:G.text }}>Team Progress Analytics</div>
            {publishedCourses.map(c => {
              const ca = assignments.filter(a=>a.course_id===c.id);
              const uids = [...new Set([...ca.filter(a=>a.user_id).map(a=>a.user_id),...ca.filter(a=>a.team_id).flatMap(a=>teamMembers.filter(tm=>tm.team_id===a.team_id).map(tm=>tm.user_id)),...(c.is_required?members.map(m=>m.id):[])])];
              const comp = allProgress.filter(p=>p.course_id===c.id&&p.status==="completed"&&uids.includes(p.user_id)).length;
              const prog = allProgress.filter(p=>p.course_id===c.id&&p.status==="in_progress"&&uids.includes(p.user_id)).length;
              const notS = uids.length-comp-prog;
              const pct = uids.length>0?Math.round((comp/uids.length)*100):0;
              const cat = CATS[c.category]||CATS.other;
              return (
                <div key={c.id} style={{ background:G.surface, border:`1px solid ${G.border}`, borderRadius:14, padding:18 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <ProgressRing pct={pct} size={48} stroke={4} color={pct===100?G.green:cat.color} />
                      <div><div style={{ fontSize:14, fontWeight:700, color:G.text }}>{cat.icon} {c.title}</div><div style={{ fontSize:11, color:G.text3 }}>{uids.length} people assigned</div></div>
                    </div>
                  </div>
                  <div style={{ height:8, background:G.surface3, borderRadius:4, overflow:"hidden", marginBottom:8, display:"flex" }}>
                    <div style={{ width:`${(comp/Math.max(uids.length,1))*100}%`, background:G.green, transition:"width 0.5s" }} />
                    <div style={{ width:`${(prog/Math.max(uids.length,1))*100}%`, background:G.yellow, transition:"width 0.5s" }} />
                  </div>
                  <div style={{ display:"flex", gap:16, fontSize:11, color:G.text3 }}>
                    <span><span style={{ color:G.green, fontWeight:700 }}>✅ {comp}</span> completed</span>
                    <span><span style={{ color:G.yellow, fontWeight:700 }}>🔄 {prog}</span> in progress</span>
                    <span><span style={{ fontWeight:700 }}>⬜ {notS}</span> not started</span>
                  </div>
                  <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${G.border}`, display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:4 }}>
                    {uids.slice(0,12).map(uid => {
                      const p = allProgress.find(p=>p.course_id===c.id&&p.user_id===uid);
                      const s = p?.status||"not_started";
                      return (
                        <div key={uid} style={{ display:"flex", justifyContent:"space-between", fontSize:11, padding:"3px 0" }}>
                          <span style={{ color:G.text2 }}>{getMemberName(uid)}</span>
                          <span style={{ fontWeight:600, color:STATUS[s].color }}>{STATUS[s].label}{p?.completed_at?` · ${new Date(p.completed_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}`:""}</span>
                        </div>
                      );
                    })}
                    {uids.length>12 && <div style={{ fontSize:10, color:G.text3, gridColumn:"1/-1", textAlign:"center" }}>+{uids.length-12} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ MODALS ═══ */}
      {showNewCourse && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }} onClick={()=>setShowNewCourse(false)}>
          <div onClick={e=>e.stopPropagation()} style={{ width:"min(500px,95vw)", background:G.surface, borderRadius:20, padding:28, border:`1px solid ${G.border}` }}>
            <div style={{ fontSize:18, fontWeight:800, color:G.text, marginBottom:18 }}>{editingCourse?"Edit Course":"New Course"}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <input value={courseForm.title} onChange={e=>setCourseForm(p=>({...p,title:e.target.value}))} placeholder="Course title" style={inp} />
              <textarea value={courseForm.description} onChange={e=>setCourseForm(p=>({...p,description:e.target.value}))} placeholder="Description" rows={3} style={{...inp,resize:"vertical"}} />
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <select value={courseForm.category} onChange={e=>setCourseForm(p=>({...p,category:e.target.value}))} style={inp}>{Object.entries(CATS).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}</select>
                <input value={courseForm.estimated_minutes} onChange={e=>setCourseForm(p=>({...p,estimated_minutes:e.target.value}))} placeholder="Est. minutes" type="number" style={inp} />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <input value={courseForm.passing_score} onChange={e=>setCourseForm(p=>({...p,passing_score:e.target.value}))} placeholder="Pass %" type="number" style={inp} />
                <input value={courseForm.refresh_interval_days} onChange={e=>setCourseForm(p=>({...p,refresh_interval_days:e.target.value}))} placeholder="Refresh days" type="number" style={inp} />
              </div>
              <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:G.text2, cursor:"pointer" }}><input type="checkbox" checked={courseForm.is_required} onChange={e=>setCourseForm(p=>({...p,is_required:e.target.checked}))} /> Required for all</label>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button onClick={()=>setShowNewCourse(false)} style={{ padding:"10px 18px", fontSize:12, background:G.surface3, border:"none", borderRadius:8, color:G.text3, cursor:"pointer" }}>Cancel</button>
                <button onClick={saveCourse} disabled={!courseForm.title.trim()} style={{ padding:"10px 22px", fontSize:13, fontWeight:700, background:G.gradient, color:"#fff", border:"none", borderRadius:10, cursor:"pointer" }}>{editingCourse?"Save":"Create"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLessonForm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }} onClick={()=>setShowLessonForm(null)}>
          <div onClick={e=>e.stopPropagation()} style={{ width:"min(500px,95vw)", background:G.surface, borderRadius:20, padding:28, border:`1px solid ${G.border}` }}>
            <div style={{ fontSize:18, fontWeight:800, color:G.text, marginBottom:18 }}>Add Lesson</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <input value={lessonForm.title} onChange={e=>setLessonForm(p=>({...p,title:e.target.value}))} placeholder="Lesson title" style={inp} />
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <select value={lessonForm.content_type} onChange={e=>setLessonForm(p=>({...p,content_type:e.target.value}))} style={inp}>
                  <option value="text">📄 Text</option><option value="video">🎥 Video</option><option value="document">📎 Document</option><option value="link">🔗 Link</option>
                </select>
                <input value={lessonForm.estimated_minutes} onChange={e=>setLessonForm(p=>({...p,estimated_minutes:e.target.value}))} placeholder="Minutes" type="number" style={inp} />
              </div>
              <textarea value={lessonForm.content} onChange={e=>setLessonForm(p=>({...p,content:e.target.value}))} placeholder={lessonForm.content_type==="text"?"Lesson content…":"URL"} rows={lessonForm.content_type==="text"?8:2} style={{...inp,resize:"vertical"}} />
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button onClick={()=>setShowLessonForm(null)} style={{ padding:"10px 18px", fontSize:12, background:G.surface3, border:"none", borderRadius:8, color:G.text3, cursor:"pointer" }}>Cancel</button>
                <button onClick={saveLesson} disabled={!lessonForm.title.trim()} style={{ padding:"10px 22px", fontSize:13, fontWeight:700, background:G.gradient, color:"#fff", border:"none", borderRadius:10, cursor:"pointer" }}>Add Lesson</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showQuizBuilder && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }} onClick={()=>setShowQuizBuilder(null)}>
          <div onClick={e=>e.stopPropagation()} style={{ width:"min(620px,95vw)", maxHeight:"85vh", overflow:"auto", background:G.surface, borderRadius:20, padding:28, border:`1px solid ${G.border}` }}>
            <div style={{ fontSize:18, fontWeight:800, color:G.text, marginBottom:18 }}>Quiz Builder</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <input value={quizForm.title} onChange={e=>setQuizForm(p=>({...p,title:e.target.value}))} placeholder="Quiz title" style={inp} />
                <input value={quizForm.passing_score} onChange={e=>setQuizForm(p=>({...p,passing_score:parseInt(e.target.value)||70}))} placeholder="Pass %" type="number" style={inp} />
              </div>
              {quizForm.questions.map((q,qi) => (
                <div key={qi} style={{ padding:14, background:G.surface2, borderRadius:12, display:"flex", flexDirection:"column", gap:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:11, fontWeight:700, color:G.text3 }}>Q{qi+1}</span>
                    {quizForm.questions.length>1 && <button onClick={()=>setQuizForm(p=>({...p,questions:p.questions.filter((_,i)=>i!==qi)}))} style={{ fontSize:10, color:G.red, background:"none", border:"none", cursor:"pointer" }}>Remove</button>}
                  </div>
                  <input value={q.q} onChange={e=>{const qs=[...quizForm.questions]; qs[qi]={...qs[qi],q:e.target.value}; setQuizForm(p=>({...p,questions:qs}));}} placeholder="Question" style={inp} />
                  <select value={q.type} onChange={e=>{const qs=[...quizForm.questions]; qs[qi]={...qs[qi],type:e.target.value}; setQuizForm(p=>({...p,questions:qs}));}} style={inp}><option value="multiple_choice">Multiple Choice</option><option value="true_false">True/False</option></select>
                  {q.type==="multiple_choice" && (q.options||[]).map((opt,oi) => (
                    <div key={oi} style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <input type="radio" name={`c-${qi}`} checked={q.correct===oi} onChange={()=>{const qs=[...quizForm.questions]; qs[qi]={...qs[qi],correct:oi}; setQuizForm(p=>({...p,questions:qs}));}} style={{ accentColor:G.accent }} />
                      <input value={opt} onChange={e=>{const qs=[...quizForm.questions]; const opts=[...qs[qi].options]; opts[oi]=e.target.value; qs[qi]={...qs[qi],options:opts}; setQuizForm(p=>({...p,questions:qs}));}} placeholder={`Option ${oi+1}`} style={{...inp,flex:1}} />
                    </div>
                  ))}
                  {q.type==="true_false" && <div style={{display:"flex",gap:8}}>{["True","False"].map((o,oi)=><button key={oi} onClick={()=>{const qs=[...quizForm.questions];qs[qi]={...qs[qi],correct:oi};setQuizForm(p=>({...p,questions:qs}));}} style={{flex:1,padding:8,borderRadius:8,border:`2px solid ${q.correct===oi?G.accent:G.border}`,background:q.correct===oi?G.accentDim:"transparent",color:q.correct===oi?G.accent:G.text3,fontSize:12,fontWeight:600,cursor:"pointer"}}>{o}</button>)}</div>}
                </div>
              ))}
              <button onClick={()=>setQuizForm(p=>({...p,questions:[...p.questions,{q:"",type:"multiple_choice",options:["","","",""],correct:0,points:1}]}))} style={{ padding:10, fontSize:11, fontWeight:600, border:`1px dashed ${G.border}`, background:"transparent", borderRadius:10, color:G.text3, cursor:"pointer" }}>+ Add Question</button>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button onClick={()=>setShowQuizBuilder(null)} style={{ padding:"10px 18px", fontSize:12, background:G.surface3, border:"none", borderRadius:8, color:G.text3, cursor:"pointer" }}>Cancel</button>
                <button onClick={saveQuiz} style={{ padding:"10px 22px", fontSize:13, fontWeight:700, background:G.gradient, color:"#fff", border:"none", borderRadius:10, cursor:"pointer" }}>Save Quiz</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAssign && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }} onClick={()=>setShowAssign(null)}>
          <div onClick={e=>e.stopPropagation()} style={{ width:"min(420px,95vw)", background:G.surface, borderRadius:20, padding:28, border:`1px solid ${G.border}` }}>
            <div style={{ fontSize:18, fontWeight:800, color:G.text, marginBottom:18 }}>Assign Course</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div><div style={{ fontSize:11, fontWeight:600, color:G.text3, marginBottom:4 }}>Person</div><select value={assignForm.user_id} onChange={e=>setAssignForm(p=>({...p,user_id:e.target.value,team_id:""}))} style={inp}><option value="">—</option>{members.map(m=><option key={m.id} value={m.id}>{m.display_name||m.email}</option>)}</select></div>
              <div style={{ textAlign:"center", fontSize:10, color:G.text3 }}>— or —</div>
              <div><div style={{ fontSize:11, fontWeight:600, color:G.text3, marginBottom:4 }}>Team</div><select value={assignForm.team_id} onChange={e=>setAssignForm(p=>({...p,team_id:e.target.value,user_id:""}))} style={inp}><option value="">—</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              <input type="date" value={assignForm.due_date} onChange={e=>setAssignForm(p=>({...p,due_date:e.target.value}))} style={inp} />
              <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:G.text2 }}><input type="checkbox" checked={assignForm.is_mandatory} onChange={e=>setAssignForm(p=>({...p,is_mandatory:e.target.checked}))} style={{accentColor:G.accent}} /> Mandatory</label>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button onClick={()=>setShowAssign(null)} style={{ padding:"10px 18px", fontSize:12, background:G.surface3, border:"none", borderRadius:8, color:G.text3, cursor:"pointer" }}>Cancel</button>
                <button onClick={assignCourse} disabled={!assignForm.user_id&&!assignForm.team_id} style={{ padding:"10px 22px", fontSize:13, fontWeight:700, background:G.gradient, color:"#fff", border:"none", borderRadius:10, cursor:"pointer" }}>Assign</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
