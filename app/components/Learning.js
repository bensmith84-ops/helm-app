"use client";
import { useState, useEffect } from "react";
import { T } from "../tokens";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useResponsive } from "../lib/responsive";

const Card = ({ children, style, ...p }) => <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, ...style }} {...p}>{children}</div>;
const CATEGORIES = ["onboarding", "compliance", "product", "safety", "process", "skills", "other"];
const CAT_ICONS = { onboarding: "🌱", compliance: "📋", product: "📦", safety: "🛡️", process: "⚙️", skills: "💡", other: "📚" };
const STATUS_COLORS = { not_started: T.text3, in_progress: "#F59E0B", completed: "#22c55e", expired: "#EF4444" };
const inp = { width: "100%", padding: "8px 12px", fontSize: 12, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, outline: "none", boxSizing: "border-box" };

export default function LearningView() {
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

  const isAdmin = profile?.email?.includes("ben.smith@earthbreeze") || false;

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [r1, r2, r3, r4, r5, r6, r7, r8, r9, r10] = await Promise.all([
        supabase.from("lms_courses").select("*").is("deleted_at", null).order("title"),
        supabase.from("lms_lessons").select("*").order("sort_order"),
        supabase.from("lms_quizzes").select("*"),
        supabase.from("lms_assignments").select("*"),
        supabase.from("lms_progress").select("*").eq("user_id", user.id),
        supabase.from("lms_quiz_attempts").select("*").eq("user_id", user.id).order("attempted_at", { ascending: false }),
        supabase.from("profiles").select("id,display_name,email,department"),
        supabase.from("teams").select("*").is("deleted_at", null),
        supabase.from("team_members").select("*"),
        supabase.from("lms_progress").select("*"),
      ]);
      setCourses(r1.data || []); setLessons(r2.data || []); setQuizzes(r3.data || []);
      setAssignments(r4.data || []); setProgress(r5.data || []); setQuizAttempts(r6.data || []);
      setMembers(r7.data || []); setTeams(r8.data || []); setTeamMembers(r9.data || []);
      setAllProgress(r10.data || []); setLoading(false);
    })();
  }, [user?.id]);

  const getCourseLessons = cid => lessons.filter(l => l.course_id === cid).sort((a, b) => a.sort_order - b.sort_order);
  const getCourseQuiz = cid => quizzes.find(q => q.course_id === cid);
  const getMyProgress = cid => progress.find(p => p.course_id === cid);
  const getMemberName = id => members.find(m => m.id === id)?.display_name || "Unknown";

  // My assigned courses
  const myTeamIds = teamMembers.filter(tm => tm.user_id === user?.id).map(tm => tm.team_id);
  const myCourseIds = [...new Set([
    ...assignments.filter(a => a.user_id === user?.id).map(a => a.course_id),
    ...assignments.filter(a => myTeamIds.includes(a.team_id)).map(a => a.course_id),
  ])];
  const publishedCourses = courses.filter(c => c.status === "published");
  const myCourses = publishedCourses.filter(c => myCourseIds.includes(c.id) || c.is_required);

  // Complete lesson
  const completeLesson = async (courseId, lessonId) => {
    let prog = getMyProgress(courseId);
    const completed = [...(prog?.completed_lessons || [])];
    if (completed.includes(lessonId)) return;
    completed.push(lessonId);
    const cLessons = getCourseLessons(courseId);
    const allDone = cLessons.every(l => completed.includes(l.id));
    const quiz = getCourseQuiz(courseId);
    const qPassed = quizAttempts.some(a => a.course_id === courseId && a.passed);
    const done = allDone && (!quiz || qPassed);
    if (prog) {
      const patch = { completed_lessons: completed, status: done ? "completed" : "in_progress", completed_at: done ? new Date().toISOString() : null };
      await supabase.from("lms_progress").update(patch).eq("id", prog.id);
      setProgress(p => p.map(x => x.id === prog.id ? { ...x, ...patch } : x));
    } else {
      const row = { org_id: "a0000000-0000-0000-0000-000000000001", course_id: courseId, user_id: user.id, status: done ? "completed" : "in_progress", completed_lessons: completed, started_at: new Date().toISOString(), completed_at: done ? new Date().toISOString() : null };
      const { data } = await supabase.from("lms_progress").insert(row).select().single();
      if (data) setProgress(p => [...p, data]);
    }
  };

  // Submit quiz
  const submitQuiz = async () => {
    if (!showQuiz) return;
    const qs = showQuiz.questions || [];
    let correct = 0, total = 0;
    qs.forEach((q, i) => { total += q.points || 1; if (quizAnswers[i] === q.correct) correct += (q.points || 1); });
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const passed = score >= (showQuiz.passing_score || 70);
    const attempt = { quiz_id: showQuiz.id, user_id: user.id, course_id: showQuiz.course_id, answers: Object.entries(quizAnswers).map(([i, v]) => ({ question_index: parseInt(i), selected: v })), score, passed };
    const { data } = await supabase.from("lms_quiz_attempts").insert(attempt).select().single();
    if (data) setQuizAttempts(p => [data, ...p]);
    setQuizResult({ score, passed, correct, total: qs.length });
    if (passed) {
      const prog = getMyProgress(showQuiz.course_id);
      const cLessons = getCourseLessons(showQuiz.course_id);
      if (prog && cLessons.every(l => (prog.completed_lessons || []).includes(l.id))) {
        await supabase.from("lms_progress").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", prog.id);
        setProgress(p => p.map(x => x.id === prog.id ? { ...x, status: "completed", completed_at: new Date().toISOString() } : x));
      }
    }
  };

  // Save course
  const saveCourse = async () => {
    if (!courseForm.title.trim()) return;
    const row = { title: courseForm.title, description: courseForm.description, category: courseForm.category, is_required: courseForm.is_required, passing_score: parseInt(courseForm.passing_score) || 70, refresh_interval_days: courseForm.refresh_interval_days ? parseInt(courseForm.refresh_interval_days) : null, estimated_minutes: courseForm.estimated_minutes ? parseInt(courseForm.estimated_minutes) : null };
    if (editingCourse) {
      await supabase.from("lms_courses").update(row).eq("id", editingCourse.id);
      setCourses(p => p.map(c => c.id === editingCourse.id ? { ...c, ...row } : c));
    } else {
      const { data } = await supabase.from("lms_courses").insert({ ...row, status: "draft", created_by: user.id, org_id: "a0000000-0000-0000-0000-000000000001" }).select().single();
      if (data) setCourses(p => [...p, data]);
    }
    setShowNewCourse(false); setEditingCourse(null);
    setCourseForm({ title: "", description: "", category: "onboarding", is_required: false, refresh_interval_days: "", estimated_minutes: "", passing_score: 70 });
  };

  // Publish / archive course
  const togglePublish = async (c) => {
    const next = c.status === "published" ? "draft" : "published";
    await supabase.from("lms_courses").update({ status: next }).eq("id", c.id);
    setCourses(p => p.map(x => x.id === c.id ? { ...x, status: next } : x));
  };

  // Save lesson
  const saveLesson = async () => {
    if (!lessonForm.title.trim() || !showLessonForm) return;
    const maxOrd = lessons.filter(l => l.course_id === showLessonForm).reduce((m, l) => Math.max(m, l.sort_order), -1);
    const { data } = await supabase.from("lms_lessons").insert({ course_id: showLessonForm, title: lessonForm.title, content_type: lessonForm.content_type, content: lessonForm.content, sort_order: maxOrd + 1, estimated_minutes: lessonForm.estimated_minutes ? parseInt(lessonForm.estimated_minutes) : null }).select().single();
    if (data) setLessons(p => [...p, data]);
    setShowLessonForm(null); setLessonForm({ title: "", content_type: "text", content: "", estimated_minutes: "" });
  };

  // Delete lesson
  const deleteLesson = async (lid) => {
    if (!window.confirm("Delete this lesson?")) return;
    await supabase.from("lms_lessons").delete().eq("id", lid);
    setLessons(p => p.filter(l => l.id !== lid));
  };

  // Save quiz
  const saveQuiz = async () => {
    if (!showQuizBuilder) return;
    const validQs = quizForm.questions.filter(q => q.q.trim());
    if (validQs.length === 0) return;
    const existing = getCourseQuiz(showQuizBuilder);
    if (existing) {
      await supabase.from("lms_quizzes").update({ title: quizForm.title, questions: validQs, passing_score: quizForm.passing_score }).eq("id", existing.id);
      setQuizzes(p => p.map(q => q.id === existing.id ? { ...q, title: quizForm.title, questions: validQs, passing_score: quizForm.passing_score } : q));
    } else {
      const { data } = await supabase.from("lms_quizzes").insert({ course_id: showQuizBuilder, title: quizForm.title, questions: validQs, passing_score: quizForm.passing_score }).select().single();
      if (data) setQuizzes(p => [...p, data]);
    }
    setShowQuizBuilder(null);
    setQuizForm({ title: "Quiz", questions: [{ q: "", type: "multiple_choice", options: ["", "", "", ""], correct: 0, points: 1 }], passing_score: 70 });
  };

  // Assign course
  const assignCourse = async () => {
    if (!showAssign || (!assignForm.user_id && !assignForm.team_id)) return;
    const row = { org_id: "a0000000-0000-0000-0000-000000000001", course_id: showAssign, assigned_by: user.id, due_date: assignForm.due_date || null, is_mandatory: assignForm.is_mandatory };
    if (assignForm.user_id) row.user_id = assignForm.user_id;
    if (assignForm.team_id) row.team_id = assignForm.team_id;
    const { data } = await supabase.from("lms_assignments").insert(row).select().single();
    if (data) setAssignments(p => [...p, data]);
    setShowAssign(null); setAssignForm({ user_id: "", team_id: "", due_date: "", is_mandatory: true });
  };

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3 }}>Loading…</div>;

  // ═══ COURSE PLAYER ═══
  if (selectedCourse) {
    const c = selectedCourse;
    const cLessons = getCourseLessons(c.id);
    const prog = getMyProgress(c.id);
    const completedLessons = prog?.completed_lessons || [];
    const quiz = getCourseQuiz(c.id);
    const activeLesson = cLessons[activeLessonIdx];
    const lessonDone = activeLesson && completedLessons.includes(activeLesson.id);
    const allLessonsDone = cLessons.every(l => completedLessons.includes(l.id));
    const qPassed = quizAttempts.some(a => a.course_id === c.id && a.passed);
    const pct = cLessons.length > 0 ? Math.round((completedLessons.length / cLessons.length) * 100) : 0;

    return (
      <div style={{ display: "flex", height: "100%", overflow: "hidden", flexDirection: isMobile ? "column" : "row" }}>
        {/* Sidebar — lesson list */}
        <div style={{ width: isMobile ? "100%" : 260, borderRight: isMobile ? "none" : `1px solid ${T.border}`, borderBottom: isMobile ? `1px solid ${T.border}` : "none", overflow: "auto", padding: "12px 8px", flexShrink: 0 }}>
          <button onClick={() => { setSelectedCourse(null); setActiveLessonIdx(0); }} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.text3, background: "none", border: "none", cursor: "pointer", marginBottom: 12, padding: "4px 8px" }}>← Back to courses</button>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, padding: "0 8px", marginBottom: 4 }}>{c.title}</div>
          <div style={{ padding: "0 8px", marginBottom: 12 }}>
            <div style={{ height: 4, background: T.surface2, borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", background: pct === 100 ? "#22c55e" : T.accent, width: `${pct}%`, transition: "width 0.3s" }} /></div>
            <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>{pct}% complete · {completedLessons.length}/{cLessons.length} lessons</div>
          </div>
          {cLessons.map((l, i) => {
            const done = completedLessons.includes(l.id);
            const active = i === activeLessonIdx;
            return (
              <button key={l.id} onClick={() => setActiveLessonIdx(i)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: active ? T.accentDim : "transparent", color: active ? T.accent : T.text2, fontSize: 12, fontWeight: active ? 600 : 400, textAlign: "left", marginBottom: 2 }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{done ? "✅" : `${i + 1}.`}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</span>
              </button>
            );
          })}
          {quiz && (
            <button onClick={() => { setShowQuiz(quiz); setQuizAnswers({}); setQuizResult(null); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: qPassed ? "#22c55e15" : T.surface2, color: qPassed ? "#22c55e" : T.text2, fontSize: 12, fontWeight: 600, textAlign: "left", marginTop: 8 }}>
              <span>{qPassed ? "✅" : "📝"}</span> {quiz.title} {qPassed && "(Passed)"}
            </button>
          )}
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflow: "auto", padding: isMobile ? 16 : 32 }}>
          {activeLesson ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{activeLesson.title}</div>
                  <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>{activeLesson.content_type === "text" ? "📄 Text" : activeLesson.content_type === "video" ? "🎥 Video" : activeLesson.content_type === "document" ? "📎 Document" : "🔗 Link"}{activeLesson.estimated_minutes ? ` · ~${activeLesson.estimated_minutes} min` : ""}</div>
                </div>
                {lessonDone && <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: "#22c55e15", color: "#22c55e" }}>✅ Complete</span>}
              </div>
              {/* Lesson content */}
              {activeLesson.content_type === "text" && (
                <div style={{ fontSize: 14, lineHeight: 1.8, color: T.text, whiteSpace: "pre-wrap" }}>{activeLesson.content}</div>
              )}
              {activeLesson.content_type === "video" && activeLesson.content && (
                <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: 12, marginBottom: 16 }}>
                  <iframe src={activeLesson.content.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/")} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none", borderRadius: 12 }} allowFullScreen />
                </div>
              )}
              {(activeLesson.content_type === "document" || activeLesson.content_type === "link") && activeLesson.content && (
                <a href={activeLesson.content} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", background: T.accentDim, color: T.accent, borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none", marginBottom: 16 }}>
                  {activeLesson.content_type === "document" ? "📎 Open Document" : "🔗 Open Link"} →
                </a>
              )}
              {/* Actions */}
              <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
                {!lessonDone && (
                  <button onClick={async () => {
                    await completeLesson(c.id, activeLesson.id);
                    if (activeLessonIdx < cLessons.length - 1) setActiveLessonIdx(activeLessonIdx + 1);
                  }} style={{ padding: "10px 20px", fontSize: 13, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
                    ✓ Mark Complete{activeLessonIdx < cLessons.length - 1 ? " & Next" : ""}
                  </button>
                )}
                {lessonDone && activeLessonIdx < cLessons.length - 1 && (
                  <button onClick={() => setActiveLessonIdx(activeLessonIdx + 1)} style={{ padding: "10px 20px", fontSize: 13, fontWeight: 600, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, cursor: "pointer" }}>Next Lesson →</button>
                )}
                {allLessonsDone && quiz && !qPassed && (
                  <button onClick={() => { setShowQuiz(quiz); setQuizAnswers({}); setQuizResult(null); }} style={{ padding: "10px 20px", fontSize: 13, fontWeight: 700, background: "#F59E0B", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>📝 Take Quiz</button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: 40, color: T.text3 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📚</div>
              <div style={{ fontSize: 14 }}>No lessons in this course yet</div>
            </div>
          )}
        </div>

        {/* Quiz Modal */}
        {showQuiz && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => { setShowQuiz(null); setQuizResult(null); }}>
            <div onClick={e => e.stopPropagation()} style={{ width: "min(600px, 95vw)", maxHeight: "85vh", overflow: "auto", background: T.surface, borderRadius: 16, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
              {quizResult ? (
                <div style={{ textAlign: "center", padding: 20 }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>{quizResult.passed ? "🎉" : "😔"}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: quizResult.passed ? "#22c55e" : "#EF4444" }}>{quizResult.score}%</div>
                  <div style={{ fontSize: 14, color: T.text2, marginTop: 8 }}>{quizResult.correct}/{quizResult.total} correct</div>
                  <div style={{ fontSize: 13, color: quizResult.passed ? "#22c55e" : "#EF4444", marginTop: 8, fontWeight: 600 }}>{quizResult.passed ? "Congratulations — you passed!" : `You need ${showQuiz.passing_score || 70}% to pass. Try again.`}</div>
                  <button onClick={() => { setShowQuiz(null); setQuizResult(null); }} style={{ marginTop: 16, padding: "10px 24px", fontSize: 13, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Close</button>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 4 }}>{showQuiz.title}</div>
                  <div style={{ fontSize: 12, color: T.text3, marginBottom: 20 }}>Pass mark: {showQuiz.passing_score || 70}% · {(showQuiz.questions || []).length} questions</div>
                  {(showQuiz.questions || []).map((q, qi) => (
                    <div key={qi} style={{ marginBottom: 20, padding: 16, background: T.surface2, borderRadius: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 10 }}>{qi + 1}. {q.q}</div>
                      {q.type === "true_false" ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          {["True", "False"].map((opt, oi) => (
                            <button key={oi} onClick={() => setQuizAnswers(p => ({ ...p, [qi]: oi }))} style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: `2px solid ${quizAnswers[qi] === oi ? T.accent : T.border}`, background: quizAnswers[qi] === oi ? T.accentDim : "transparent", color: quizAnswers[qi] === oi ? T.accent : T.text2, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{opt}</button>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {(q.options || []).map((opt, oi) => (
                            <button key={oi} onClick={() => setQuizAnswers(p => ({ ...p, [qi]: oi }))} style={{ padding: "8px 12px", borderRadius: 6, border: `2px solid ${quizAnswers[qi] === oi ? T.accent : T.border}`, background: quizAnswers[qi] === oi ? T.accentDim : "transparent", color: quizAnswers[qi] === oi ? T.accent : T.text2, fontSize: 12, cursor: "pointer", textAlign: "left" }}>{opt}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setShowQuiz(null)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                    <button onClick={submitQuiz} disabled={Object.keys(quizAnswers).length < (showQuiz.questions || []).length} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: Object.keys(quizAnswers).length < (showQuiz.questions || []).length ? 0.5 : 1 }}>Submit Answers</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══ NAV TABS ═══
  const tabs = [
    { id: "my_learning", label: "My Learning", icon: "📖" },
    { id: "catalog", label: "Course Catalog", icon: "📚" },
  ];
  if (isAdmin) {
    tabs.push({ id: "course_builder", label: "Course Builder", icon: "🏗️" });
    tabs.push({ id: "manage", label: "Manage & Track", icon: "📊" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: isMobile ? "16px 12px" : "20px 32px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>📚 Learning</div>
          <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{publishedCourses.length} courses · {myCourses.length} assigned to you</div>
        </div>
        <div style={{ display: "flex", gap: 3, background: T.surface2, borderRadius: 8, padding: 2 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setView(t.id)} style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", borderRadius: 6, background: view === t.id ? T.surface : "transparent", color: view === t.id ? T.accent : T.text3 }}>{t.icon} {t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "16px 12px" : "24px 32px" }}>

        {/* ═══ MY LEARNING ═══ */}
        {view === "my_learning" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
              {[
                { l: "Assigned", v: myCourses.length, c: T.accent },
                { l: "Completed", v: progress.filter(p => p.status === "completed").length, c: "#22c55e" },
                { l: "In Progress", v: progress.filter(p => p.status === "in_progress").length, c: "#F59E0B" },
                { l: "Not Started", v: myCourses.filter(c => !getMyProgress(c.id)).length, c: T.text3 },
              ].map(s => <Card key={s.l} style={{ textAlign: "center", padding: 12 }}><div style={{ fontSize: 22, fontWeight: 900, color: s.c }}>{s.v}</div><div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{s.l}</div></Card>)}
            </div>
            {myCourses.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: T.text3 }}><div style={{ fontSize: 32, marginBottom: 8 }}>🎓</div>No courses assigned yet</div>
            ) : myCourses.map(c => {
              const prog = getMyProgress(c.id);
              const cLessons = getCourseLessons(c.id);
              const pct = cLessons.length > 0 ? Math.round(((prog?.completed_lessons || []).length / cLessons.length) * 100) : 0;
              const quiz = getCourseQuiz(c.id);
              const qPassed = quizAttempts.some(a => a.course_id === c.id && a.passed);
              const status = prog?.status || "not_started";
              const asgn = assignments.find(a => a.course_id === c.id && (a.user_id === user?.id || myTeamIds.includes(a.team_id)));
              return (
                <Card key={c.id} style={{ cursor: "pointer", borderLeft: `4px solid ${STATUS_COLORS[status]}` }} onClick={() => { setSelectedCourse(c); setActiveLessonIdx(0); }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 24 }}>{CAT_ICONS[c.category] || "📚"}</span>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{c.title}</div>
                        <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{c.category} · {cLessons.length} lessons{quiz ? " + quiz" : ""}{c.estimated_minutes ? ` · ~${c.estimated_minutes} min` : ""}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: STATUS_COLORS[status] + "18", color: STATUS_COLORS[status] }}>{status.replace("_", " ").toUpperCase()}</span>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <div style={{ height: 6, background: T.surface2, borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", background: pct === 100 ? "#22c55e" : T.accent, width: `${pct}%` }} /></div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: T.text3 }}>{pct}% · {(prog?.completed_lessons || []).length}/{cLessons.length} lessons</span>
                      {asgn?.due_date && <span style={{ fontSize: 10, color: new Date(asgn.due_date) < new Date() ? "#EF4444" : T.text3, fontWeight: 600 }}>Due: {new Date(asgn.due_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                    </div>
                  </div>
                  {c.description && <div style={{ fontSize: 12, color: T.text3, marginTop: 8, lineHeight: 1.5 }}>{c.description}</div>}
                </Card>
              );
            })}
          </div>
        )}

        {/* ═══ CATALOG ═══ */}
        {view === "catalog" && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12 }}>
            {publishedCourses.map(c => {
              const cLessons = getCourseLessons(c.id);
              const prog = getMyProgress(c.id);
              const quiz = getCourseQuiz(c.id);
              return (
                <Card key={c.id} style={{ cursor: "pointer" }} onClick={() => { setSelectedCourse(c); setActiveLessonIdx(0); }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 28 }}>{CAT_ICONS[c.category] || "📚"}</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{c.title}</div>
                      <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{c.category} · {cLessons.length} lessons{quiz ? " + quiz" : ""}</div>
                    </div>
                  </div>
                  {c.description && <div style={{ fontSize: 11, color: T.text3, marginBottom: 8, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.description}</div>}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {c.is_required && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: "#EF444418", color: "#EF4444" }}>REQUIRED</span>}
                    {c.refresh_interval_days && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: "#F59E0B18", color: "#F59E0B" }}>↻ Every {c.refresh_interval_days}d</span>}
                    {prog?.status === "completed" && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: "#22c55e18", color: "#22c55e" }}>✅ DONE</span>}
                    {c.estimated_minutes && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: T.surface2, color: T.text3 }}>~{c.estimated_minutes} min</span>}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* ═══ COURSE BUILDER (Admin) ═══ */}
        {view === "course_builder" && isAdmin && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>All Courses ({courses.length})</div>
              <button onClick={() => { setCourseForm({ title: "", description: "", category: "onboarding", is_required: false, refresh_interval_days: "", estimated_minutes: "", passing_score: 70 }); setEditingCourse(null); setShowNewCourse(true); }} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>+ New Course</button>
            </div>
            {courses.map(c => {
              const cLessons = getCourseLessons(c.id);
              const quiz = getCourseQuiz(c.id);
              const assignCount = assignments.filter(a => a.course_id === c.id).length;
              return (
                <Card key={c.id} style={{ borderLeft: `4px solid ${c.status === "published" ? "#22c55e" : T.text3}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{CAT_ICONS[c.category] || "📚"} {c.title}</div>
                      <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{cLessons.length} lessons{quiz ? " + quiz" : ""} · {assignCount} assigned · {c.category}</div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: c.status === "published" ? "#22c55e18" : T.surface2, color: c.status === "published" ? "#22c55e" : T.text3 }}>{c.status.toUpperCase()}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    <button onClick={() => setShowLessonForm(c.id)} style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, background: T.accentDim, color: T.accent, border: "none", borderRadius: 5, cursor: "pointer" }}>+ Lesson</button>
                    <button onClick={() => { const existing = getCourseQuiz(c.id); setShowQuizBuilder(c.id); if (existing) setQuizForm({ title: existing.title, questions: existing.questions, passing_score: existing.passing_score }); else setQuizForm({ title: "Quiz", questions: [{ q: "", type: "multiple_choice", options: ["", "", "", ""], correct: 0, points: 1 }], passing_score: 70 }); }} style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, background: "#F59E0B18", color: "#F59E0B", border: "none", borderRadius: 5, cursor: "pointer" }}>{quiz ? "✏️ Edit Quiz" : "📝 Add Quiz"}</button>
                    <button onClick={() => { setShowAssign(c.id); setAssignForm({ user_id: "", team_id: "", due_date: "", is_mandatory: true }); }} style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, background: "#8B5CF618", color: "#8B5CF6", border: "none", borderRadius: 5, cursor: "pointer" }}>👥 Assign</button>
                    <button onClick={() => { setEditingCourse(c); setCourseForm({ title: c.title, description: c.description || "", category: c.category, is_required: c.is_required, refresh_interval_days: c.refresh_interval_days || "", estimated_minutes: c.estimated_minutes || "", passing_score: c.passing_score || 70 }); setShowNewCourse(true); }} style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, background: T.surface2, color: T.text3, border: "none", borderRadius: 5, cursor: "pointer" }}>✏️ Edit</button>
                    <button onClick={() => togglePublish(c)} style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, background: c.status === "published" ? "#EF444418" : "#22c55e18", color: c.status === "published" ? "#EF4444" : "#22c55e", border: "none", borderRadius: 5, cursor: "pointer" }}>{c.status === "published" ? "Unpublish" : "Publish"}</button>
                  </div>
                  {/* Lessons list */}
                  {cLessons.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                      {cLessons.map((l, i) => (
                        <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                          <span style={{ fontSize: 11, color: T.text2 }}>{i + 1}. {l.title} <span style={{ color: T.text3 }}>({l.content_type})</span></span>
                          <button onClick={() => deleteLesson(l.id)} style={{ fontSize: 10, color: "#EF4444", background: "none", border: "none", cursor: "pointer" }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* ═══ MANAGE & TRACK (Admin) ═══ */}
        {view === "manage" && isAdmin && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Team Progress</div>
            {publishedCourses.map(c => {
              const courseAssignments = assignments.filter(a => a.course_id === c.id);
              const assignedUserIds = [...new Set([
                ...courseAssignments.filter(a => a.user_id).map(a => a.user_id),
                ...courseAssignments.filter(a => a.team_id).flatMap(a => teamMembers.filter(tm => tm.team_id === a.team_id).map(tm => tm.user_id)),
                ...(c.is_required ? members.map(m => m.id) : []),
              ])];
              const completedCount = allProgress.filter(p => p.course_id === c.id && p.status === "completed" && assignedUserIds.includes(p.user_id)).length;
              const inProgressCount = allProgress.filter(p => p.course_id === c.id && p.status === "in_progress" && assignedUserIds.includes(p.user_id)).length;
              const notStartedCount = assignedUserIds.length - completedCount - inProgressCount;
              const pct = assignedUserIds.length > 0 ? Math.round((completedCount / assignedUserIds.length) * 100) : 0;
              return (
                <Card key={c.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{CAT_ICONS[c.category] || "📚"} {c.title}</div>
                      <div style={{ fontSize: 11, color: T.text3 }}>{assignedUserIds.length} assigned</div>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 900, color: pct === 100 ? "#22c55e" : pct > 0 ? "#F59E0B" : T.text3 }}>{pct}%</span>
                  </div>
                  <div style={{ height: 8, background: T.surface2, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ height: "100%", display: "flex" }}>
                      <div style={{ width: `${(completedCount / Math.max(assignedUserIds.length, 1)) * 100}%`, background: "#22c55e" }} />
                      <div style={{ width: `${(inProgressCount / Math.max(assignedUserIds.length, 1)) * 100}%`, background: "#F59E0B" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 11, color: T.text3 }}>
                    <span>✅ {completedCount} completed</span>
                    <span>🔄 {inProgressCount} in progress</span>
                    <span>⬜ {notStartedCount} not started</span>
                  </div>
                  {/* Individual member status */}
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 4 }}>
                    {assignedUserIds.slice(0, 10).map(uid => {
                      const p = allProgress.find(p => p.course_id === c.id && p.user_id === uid);
                      const st = p?.status || "not_started";
                      return (
                        <div key={uid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                          <span style={{ color: T.text2 }}>{getMemberName(uid)}</span>
                          <span style={{ fontWeight: 600, color: STATUS_COLORS[st] }}>{st.replace("_", " ")}{p?.completed_at ? ` · ${new Date(p.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</span>
                        </div>
                      );
                    })}
                    {assignedUserIds.length > 10 && <div style={{ fontSize: 10, color: T.text3, textAlign: "center" }}>+{assignedUserIds.length - 10} more</div>}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ NEW/EDIT COURSE MODAL ═══ */}
      {showNewCourse && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowNewCourse(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "min(500px, 95vw)", background: T.surface, borderRadius: 16, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{editingCourse ? "Edit Course" : "New Course"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input value={courseForm.title} onChange={e => setCourseForm(p => ({ ...p, title: e.target.value }))} placeholder="Course title" style={inp} />
              <textarea value={courseForm.description} onChange={e => setCourseForm(p => ({ ...p, description: e.target.value }))} placeholder="Description" rows={3} style={{ ...inp, resize: "vertical" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <select value={courseForm.category} onChange={e => setCourseForm(p => ({ ...p, category: e.target.value }))} style={inp}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
                <input value={courseForm.estimated_minutes} onChange={e => setCourseForm(p => ({ ...p, estimated_minutes: e.target.value }))} placeholder="Est. minutes" type="number" style={inp} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input value={courseForm.passing_score} onChange={e => setCourseForm(p => ({ ...p, passing_score: e.target.value }))} placeholder="Pass score %" type="number" style={inp} />
                <input value={courseForm.refresh_interval_days} onChange={e => setCourseForm(p => ({ ...p, refresh_interval_days: e.target.value }))} placeholder="Refresh days (blank=once)" type="number" style={inp} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.text2, cursor: "pointer" }}>
                <input type="checkbox" checked={courseForm.is_required} onChange={e => setCourseForm(p => ({ ...p, is_required: e.target.checked }))} /> Required for all team members
              </label>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowNewCourse(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={saveCourse} disabled={!courseForm.title.trim()} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>{editingCourse ? "Save" : "Create Course"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ADD LESSON MODAL ═══ */}
      {showLessonForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowLessonForm(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "min(500px, 95vw)", background: T.surface, borderRadius: 16, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Add Lesson</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input value={lessonForm.title} onChange={e => setLessonForm(p => ({ ...p, title: e.target.value }))} placeholder="Lesson title" style={inp} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <select value={lessonForm.content_type} onChange={e => setLessonForm(p => ({ ...p, content_type: e.target.value }))} style={inp}>
                  <option value="text">📄 Text</option>
                  <option value="video">🎥 Video URL</option>
                  <option value="document">📎 Document URL</option>
                  <option value="link">🔗 External Link</option>
                </select>
                <input value={lessonForm.estimated_minutes} onChange={e => setLessonForm(p => ({ ...p, estimated_minutes: e.target.value }))} placeholder="Est. minutes" type="number" style={inp} />
              </div>
              <textarea value={lessonForm.content} onChange={e => setLessonForm(p => ({ ...p, content: e.target.value }))} placeholder={lessonForm.content_type === "text" ? "Lesson content (supports markdown)" : "URL"} rows={lessonForm.content_type === "text" ? 8 : 2} style={{ ...inp, resize: "vertical" }} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowLessonForm(null)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={saveLesson} disabled={!lessonForm.title.trim()} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Add Lesson</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ QUIZ BUILDER MODAL ═══ */}
      {showQuizBuilder && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowQuizBuilder(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "min(600px, 95vw)", maxHeight: "85vh", overflow: "auto", background: T.surface, borderRadius: 16, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Quiz Builder</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input value={quizForm.title} onChange={e => setQuizForm(p => ({ ...p, title: e.target.value }))} placeholder="Quiz title" style={inp} />
                <input value={quizForm.passing_score} onChange={e => setQuizForm(p => ({ ...p, passing_score: parseInt(e.target.value) || 70 }))} placeholder="Pass %" type="number" style={inp} />
              </div>
              {quizForm.questions.map((q, qi) => (
                <div key={qi} style={{ padding: 12, background: T.surface2, borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.text3 }}>Question {qi + 1}</span>
                    {quizForm.questions.length > 1 && <button onClick={() => setQuizForm(p => ({ ...p, questions: p.questions.filter((_, i) => i !== qi) }))} style={{ fontSize: 10, color: "#EF4444", background: "none", border: "none", cursor: "pointer" }}>Remove</button>}
                  </div>
                  <input value={q.q} onChange={e => { const qs = [...quizForm.questions]; qs[qi] = { ...qs[qi], q: e.target.value }; setQuizForm(p => ({ ...p, questions: qs })); }} placeholder="Question text" style={inp} />
                  <select value={q.type} onChange={e => { const qs = [...quizForm.questions]; qs[qi] = { ...qs[qi], type: e.target.value }; setQuizForm(p => ({ ...p, questions: qs })); }} style={inp}>
                    <option value="multiple_choice">Multiple Choice</option>
                    <option value="true_false">True/False</option>
                  </select>
                  {q.type === "multiple_choice" && (q.options || []).map((opt, oi) => (
                    <div key={oi} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="radio" name={`correct-${qi}`} checked={q.correct === oi} onChange={() => { const qs = [...quizForm.questions]; qs[qi] = { ...qs[qi], correct: oi }; setQuizForm(p => ({ ...p, questions: qs })); }} />
                      <input value={opt} onChange={e => { const qs = [...quizForm.questions]; const opts = [...qs[qi].options]; opts[oi] = e.target.value; qs[qi] = { ...qs[qi], options: opts }; setQuizForm(p => ({ ...p, questions: qs })); }} placeholder={`Option ${oi + 1}`} style={{ ...inp, flex: 1 }} />
                    </div>
                  ))}
                  {q.type === "true_false" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      {["True", "False"].map((opt, oi) => (
                        <button key={oi} onClick={() => { const qs = [...quizForm.questions]; qs[qi] = { ...qs[qi], correct: oi }; setQuizForm(p => ({ ...p, questions: qs })); }} style={{ flex: 1, padding: "6px", borderRadius: 6, border: `2px solid ${q.correct === oi ? T.accent : T.border}`, background: q.correct === oi ? T.accentDim : "transparent", color: q.correct === oi ? T.accent : T.text3, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{opt} {q.correct === oi ? "✓" : ""}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <button onClick={() => setQuizForm(p => ({ ...p, questions: [...p.questions, { q: "", type: "multiple_choice", options: ["", "", "", ""], correct: 0, points: 1 }] }))} style={{ padding: "8px", fontSize: 11, fontWeight: 600, border: `1px dashed ${T.border}`, background: "transparent", borderRadius: 8, color: T.text3, cursor: "pointer" }}>+ Add Question</button>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowQuizBuilder(null)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={saveQuiz} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Save Quiz</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ASSIGN MODAL ═══ */}
      {showAssign && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowAssign(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "min(400px, 95vw)", background: T.surface, borderRadius: 16, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Assign Course</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 4 }}>Assign to Person</div>
                <select value={assignForm.user_id} onChange={e => setAssignForm(p => ({ ...p, user_id: e.target.value, team_id: "" }))} style={inp}>
                  <option value="">— Select person —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.display_name || m.email}</option>)}
                </select>
              </div>
              <div style={{ textAlign: "center", fontSize: 11, color: T.text3 }}>— or —</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 4 }}>Assign to Team</div>
                <select value={assignForm.team_id} onChange={e => setAssignForm(p => ({ ...p, team_id: e.target.value, user_id: "" }))} style={inp}>
                  <option value="">— Select team —</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <input type="date" value={assignForm.due_date} onChange={e => setAssignForm(p => ({ ...p, due_date: e.target.value }))} style={inp} />
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.text2 }}>
                <input type="checkbox" checked={assignForm.is_mandatory} onChange={e => setAssignForm(p => ({ ...p, is_mandatory: e.target.checked }))} /> Mandatory
              </label>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowAssign(null)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={assignCourse} disabled={!assignForm.user_id && !assignForm.team_id} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Assign</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
