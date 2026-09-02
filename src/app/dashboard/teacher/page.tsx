"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import { logoutUser } from "@/utils/auth";
import { useAuthUser } from "@/utils/useAuthUser";
import QuizBuilder from "@/components/QuizBuilder";
import StudentManager from "@/components/StudentManager";
import type { SessionDoc, UserDoc } from "@/types";

type SessionWithId = SessionDoc & { id: string };
type Workspace = "overview" | "sessions" | "students" | "quiz";

const TeacherDashboardPage = () => {
  const router = useRouter();
  const { firebaseUser, userDoc, isLoading } = useAuthUser();

  const [students, setStudents] = useState<UserDoc[]>([]);
  const [sessions, setSessions] = useState<SessionWithId[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [driveFileId, setDriveFileId] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionTrack, setSessionTrack] = useState<"foundation" | "term">("term");
  const [sessionTerm, setSessionTerm] = useState("الفصل الأول");
  const [sessionUnit, setSessionUnit] = useState("");
  const [sessionLesson, setSessionLesson] = useState("");
  const [workspace, setWorkspace] = useState<Workspace>("overview");
  const [quizStudentId, setQuizStudentId] = useState<string | undefined>();

  useEffect(() => {
    if (!isLoading && (!firebaseUser || userDoc?.role !== "teacher")) {
      router.replace("/auth");
    }
  }, [isLoading, firebaseUser, userDoc, router]);

  useEffect(() => {
    if (userDoc?.role !== "teacher") return;

    const db = getFirebaseDb();
    const studentsQuery = query(collection(db, "users"), where("role", "==", "student"));
    const unsubscribeStudents = onSnapshot(studentsQuery, (snapshot) => {
      setStudents(snapshot.docs.map((docSnapshot) => docSnapshot.data() as UserDoc));
    });

    const sessionsQuery = query(collection(db, "sessions"), orderBy("createdAt", "desc"));
    const unsubscribeSessions = onSnapshot(sessionsQuery, (snapshot) => {
      setSessions(
        snapshot.docs.map((docSnapshot) => ({ ...(docSnapshot.data() as SessionDoc), id: docSnapshot.id })),
      );
    });

    return () => {
      unsubscribeStudents();
      unsubscribeSessions();
    };
  }, [userDoc]);

  const handleLinkVideo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    if (!selectedStudentId || !videoTitle || !driveFileId) {
      setFeedback("يرجى تعبئة جميع الحقول قبل الربط.");
      return;
    }

    setIsLinking(true);

    try {
      const session: Omit<SessionDoc, "sessionId"> = {
        studentId: selectedStudentId,
        videoTitle,
        driveFileId,
        quizPassed: false,
        curriculum: {
          track: sessionTrack,
          ...(sessionTrack === "term" ? { term: sessionTerm } : {}),
          ...(sessionUnit.trim() ? { unit: sessionUnit.trim() } : {}),
          ...(sessionLesson.trim() ? { lesson: sessionLesson.trim() } : {}),
        },
        createdAt: Date.now(),
      };

      // لا توجد دالة سحابية على خطة Spark: على المعلّم مشاركة الملف يدويًا من Google Drive
      // مع بريد الطالب كـ"عارض" وتفعيل "منع التنزيل/النسخ/الطباعة" قبل لصق المعرّف هنا.
      if (editingSessionId) {
        await updateDoc(doc(getFirebaseDb(), "sessions", editingSessionId), session);
        setEditingSessionId(null);
      } else {
        await addDoc(collection(getFirebaseDb(), "sessions"), session);
      }

      setVideoTitle("");
      setDriveFileId("");
      setSessionUnit("");
      setSessionLesson("");
      setFeedback(editingSessionId ? "تم تحديث الجلسة بنجاح." : "تم ربط الجلسة بنجاح.");
    } catch {
      setFeedback("تعذر ربط الجلسة. حاول مرة أخرى.");
    } finally {
      setIsLinking(false);
    }
  };

  const handleCopySession = async (session: SessionWithId) => {
    await addDoc(collection(getFirebaseDb(), "sessions"), {
      studentId: session.studentId,
      videoTitle: `${session.videoTitle} (نسخة)`,
      driveFileId: session.driveFileId,
      quizPassed: false,
      createdAt: Date.now(),
    });
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm("حذف هذه الجلسة؟")) return;
    await deleteDoc(doc(getFirebaseDb(), "sessions", sessionId));
  };

  const openStudentSession = (student: UserDoc) => {
    setSelectedStudentId(student.uid);
    setVideoTitle("");
    setDriveFileId("");
    setEditingSessionId(null);
    setWorkspace("sessions");
  };

  const openStudentQuiz = (student: UserDoc) => {
    setQuizStudentId(student.uid);
    setWorkspace("quiz");
  };

  if (isLoading || userDoc?.role !== "teacher") {
    return (
      <main className="dashboard-shell">
        <p>جارٍ التحقق من الصلاحيات...</p>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">TEACHER DASHBOARD</p>
          <h1>مرحبًا، {userDoc.displayName}</h1>
        </div>
        <button
          type="button"
          className="logout-button"
          onClick={async () => {
            await logoutUser();
            router.replace("/auth");
          }}
        >
          تسجيل الخروج
        </button>
      </header>

      <section className="dashboard-grid">
        <article className="panel panel-wide teacher-command-panel">
          <div>
            <p className="dashboard-eyebrow">WORKSPACE</p>
            <h2>مساحة إدارة التعليم</h2>
          </div>
          <div className="teacher-command-bar">
            <button type="button" className={workspace === "overview" ? "primary-button" : "logout-button"} onClick={() => setWorkspace("overview")}>نظرة عامة</button>
            <button type="button" className={workspace === "students" ? "primary-button" : "logout-button"} onClick={() => setWorkspace("students")}>ملفات الطلاب</button>
            <button type="button" className={workspace === "sessions" ? "primary-button" : "logout-button"} onClick={() => setWorkspace("sessions")}>الجلسات والفيديو</button>
            <button type="button" className={workspace === "quiz" ? "primary-button" : "logout-button"} onClick={() => setWorkspace("quiz")}>بناء اختبار</button>
          </div>
        </article>

        {workspace === "overview" && <>
        <article className="panel dashboard-summary">
          <strong>{students.length}</strong><span>طالب نشط</span>
          <button type="button" className="logout-button" onClick={() => setWorkspace("students")}>إدارة الطلاب</button>
        </article>
        <article className="panel dashboard-summary">
          <strong>{sessions.length}</strong><span>جلسة مرتبطة</span>
          <button type="button" className="logout-button" onClick={() => setWorkspace("sessions")}>إدارة الجلسات</button>
        </article>
        </>}

        {workspace === "sessions" && <>
        <article className="panel">
          <h2>{editingSessionId ? "تعديل الجلسة" : "ربط فيديو جديد بطالب"}</h2>
          <form className="link-form" onSubmit={handleLinkVideo}>
            <label className="field">
              <span>الطالب</span>
              <select
                required
                value={selectedStudentId}
                onChange={(event) => setSelectedStudentId(event.target.value)}
              >
                <option value="">اختر طالبًا</option>
                {students.map((student) => (
                  <option key={student.uid} value={student.uid}>
                    {student.displayName} — {student.email}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>عنوان الجلسة</span>
              <input
                required
                type="text"
                value={videoTitle}
                onChange={(event) => setVideoTitle(event.target.value)}
                placeholder="مثال: الدرس الأول - الجبر"
              />
            </label>

            <label className="field">
              <span>معرّف ملف Google Drive</span>
              <input
                required
                type="text"
                value={driveFileId}
                onChange={(event) => setDriveFileId(event.target.value)}
                placeholder="Drive File ID أو رابط المشاركة كاملاً"
                dir="ltr"
              />
            </label>
            <div className="curriculum-grid">
              <label className="field"><span>المسار</span><select value={sessionTrack} onChange={(event) => setSessionTrack(event.target.value as "foundation" | "term")}><option value="foundation">التأسيس</option><option value="term">الفصل الدراسي</option></select></label>
              {sessionTrack === "term" && <label className="field"><span>الفصل</span><input value={sessionTerm} onChange={(event) => setSessionTerm(event.target.value)} /></label>}
              <label className="field"><span>الوحدة</span><input value={sessionUnit} onChange={(event) => setSessionUnit(event.target.value)} placeholder="الوحدة الأولى" /></label>
              <label className="field"><span>الدرس</span><input value={sessionLesson} onChange={(event) => setSessionLesson(event.target.value)} placeholder="اسم الدرس" /></label>
            </div>
            <p className="quiz-hint">
              لكي يظهر الفيديو فعليًا داخل الموقع لكل طالب، يجب مشاركة الملف من Google Drive كـ«أي شخص
              لديه الرابط: عارض» (وليس بريدًا محددًا فقط)، ثم تفعيل «تقييد التنزيل والطباعة والنسخ» من
              إعدادات المشاركة المتقدمة. يمكنك لصق المعرّف وحده أو رابط المشاركة كاملاً.
            </p>

            {feedback && <p className="form-feedback">{feedback}</p>}

            <button type="submit" className="primary-button" disabled={isLinking}>
              {isLinking ? "جارٍ الحفظ..." : editingSessionId ? "حفظ التعديل" : "ربط الجلسة"}
            </button>
          </form>
        </article>

        <article className="panel panel-wide">
          <h2>الجلسات المرتبطة ({sessions.length})</h2>
          <ul className="session-list">
            {sessions.map((session) => {
              const student = students.find((entry) => entry.uid === session.studentId);
              return (
                <li key={session.id}>
                  <span className="session-title">{session.videoTitle}</span>
                  <span className="session-student">{student?.displayName ?? session.studentId}</span>
                  <span className={session.quizPassed ? "badge badge-pass" : "badge badge-pending"}>{session.quizPassed ? "اجتاز الاختبار" : "بانتظار الاختبار"}</span>
                  <button type="button" className="logout-button" onClick={() => {
                    setSelectedStudentId(session.studentId); setVideoTitle(session.videoTitle); setDriveFileId(session.driveFileId); setEditingSessionId(session.id);
                    setSessionTrack(session.curriculum?.track ?? "term"); setSessionTerm(session.curriculum?.term ?? "الفصل الأول"); setSessionUnit(session.curriculum?.unit ?? ""); setSessionLesson(session.curriculum?.lesson ?? "");
                  }}>تعديل</button>
                  <button type="button" className="logout-button" onClick={() => void handleCopySession(session)}>نسخ</button>
                  <button type="button" className="logout-button" onClick={() => void handleDeleteSession(session.id)}>حذف</button>
                </li>
              );
            })}
            {sessions.length === 0 && <li className="empty-state">لم يتم ربط أي جلسات بعد.</li>}
          </ul>
        </article>
        </>}

        {workspace === "students" && <article className="panel panel-wide">
          <h2>إدارة الطلاب ({students.length})</h2>
          <StudentManager students={students} onAddSession={openStudentSession} onAddQuiz={openStudentQuiz} />
        </article>
        }

        {workspace === "quiz" && <article className="panel panel-wide">
          <h2>بناء اختبار جديد</h2>
          <QuizBuilder sessions={sessions.map(({ id, videoTitle }) => ({ id, videoTitle }))} students={students} assignedStudentId={quizStudentId} />
        </article>
        }
      </section>
    </main>
  );
};

export default TeacherDashboardPage;
