"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import { changeOwnPassword, logoutUser } from "@/utils/auth";
import { useAuthUser } from "@/utils/useAuthUser";
import SessionDetailPanel from "@/components/SessionDetailPanel";
import type { QuizDoc, SessionDoc } from "@/types";

type SessionWithId = SessionDoc & { id: string };

interface LessonNode {
  label: string;
  sessions: SessionWithId[];
}

interface UnitNode {
  label: string;
  lessons: LessonNode[];
}

interface TermNode {
  label: string;
  units: UnitNode[];
}

// يبني شجرة منهجية حقيقية بثلاثة مستويات (فصل/تأسيس ← وحدة ← درس) بدل تسمية مسطّحة واحدة،
// مع الحفاظ على ترتيب الظهور الأول لكل مستوى كما أنشأه المعلّم.
const buildCurriculumTree = (sessions: SessionWithId[]): TermNode[] => {
  const termOrder: string[] = [];
  const terms: Record<string, { units: Record<string, { unitOrder: string[]; lessons: Record<string, LessonNode> } & { lessonOrder: string[] }> ; unitOrder: string[] }> = {};

  sessions.forEach((session) => {
    const curriculum = session.curriculum;
    const termLabel = curriculum?.track === "foundation" ? "التأسيس" : curriculum?.term ?? "غير مصنّف";
    const unitLabel = curriculum?.unit ?? "بلا وحدة";
    const lessonLabel = curriculum?.lesson ?? session.videoTitle;

    if (!terms[termLabel]) {
      terms[termLabel] = { units: {}, unitOrder: [] };
      termOrder.push(termLabel);
    }
    const term = terms[termLabel];

    if (!term.units[unitLabel]) {
      term.units[unitLabel] = { unitOrder: [], lessonOrder: [], lessons: {} };
      term.unitOrder.push(unitLabel);
    }
    const unit = term.units[unitLabel];

    if (!unit.lessons[lessonLabel]) {
      unit.lessons[lessonLabel] = { label: lessonLabel, sessions: [] };
      unit.lessonOrder.push(lessonLabel);
    }
    unit.lessons[lessonLabel].sessions.push(session);
  });

  return termOrder.map((termLabel) => ({
    label: termLabel,
    units: terms[termLabel].unitOrder.map((unitLabel) => ({
      label: unitLabel,
      lessons: terms[termLabel].units[unitLabel].lessonOrder.map(
        (lessonLabel) => terms[termLabel].units[unitLabel].lessons[lessonLabel],
      ),
    })),
  }));
};

const StudentDashboardPage = () => {
  const router = useRouter();
  const { firebaseUser, userDoc, isLoading } = useAuthUser();
  const [sessions, setSessions] = useState<SessionWithId[]>([]);
  const [quizzes, setQuizzes] = useState<QuizDoc[]>([]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (!isLoading && (!firebaseUser || userDoc?.role !== "student")) {
      router.replace("/auth");
    }
  }, [isLoading, firebaseUser, userDoc, router]);

  useEffect(() => {
    if (userDoc?.role !== "student") return;

    // القيد على studentId يضمن ألا يرى الطالب سوى الجلسات المخصّصة له، بدعم من قواعد Firestore الأمنية.
    // الترتيب حسب createdAt يحدد التسلسل الزمني المستخدم في قفل الجلسات اللاحقة.
    const sessionsQuery = query(
      collection(getFirebaseDb(), "sessions"),
      where("studentId", "==", userDoc.uid),
      orderBy("createdAt", "asc"),
    );
    const unsubscribe = onSnapshot(sessionsQuery, (snapshot) => {
      setSessions(
        snapshot.docs.map((docSnapshot) => ({ ...(docSnapshot.data() as SessionDoc), id: docSnapshot.id })),
      );
    });

    const quizzesQuery = query(collection(getFirebaseDb(), "quizzes"), where("studentIds", "array-contains", userDoc.uid));
    const unsubscribeQuizzes = onSnapshot(quizzesQuery, (snapshot) => setQuizzes(snapshot.docs.map((entry) => entry.data() as QuizDoc)));

    return () => {
      unsubscribe();
      unsubscribeQuizzes();
    };
  }, [userDoc]);

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSettingsMessage(null);

    if (newPassword !== confirmPassword) {
      setSettingsMessage("كلمتا المرور غير متطابقتين.");
      return;
    }

    setIsChangingPassword(true);
    try {
      await changeOwnPassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setSettingsMessage("تم تغيير كلمة المرور بنجاح.");
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : "تعذر تغيير كلمة المرور.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (isLoading || userDoc?.role !== "student") {
    return (
      <main className="dashboard-shell">
        <p>جارٍ التحقق من الصلاحيات...</p>
      </main>
    );
  }

  const viewedSessions = sessions.filter((session) => session.watchedAt).length;
  const completedSessions = sessions.filter((session) => session.quizPassed).length;
  const recentThreshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const notifications = [
    ...sessions.filter((session) => session.createdAt > recentThreshold).map((session) => `جلسة جديدة: ${session.videoTitle}`),
    ...quizzes.filter((quiz) => (quiz as QuizDoc & { createdAt?: number }).createdAt && (quiz as QuizDoc & { createdAt?: number }).createdAt! > recentThreshold).map((quiz) => `اختبار جديد: ${quiz.title ?? "اختبار مكلّف"}`),
  ];
  const curriculumTree = buildCurriculumTree(sessions);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">STUDENT DASHBOARD</p>
          <h1>مرحبًا، {userDoc.displayName}</h1>
        </div>
        <div className="dashboard-header-actions">
          <button type="button" className="logout-button" onClick={() => setIsSettingsOpen((previous) => !previous)}>
            إعدادات الحساب
          </button>
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
        </div>
      </header>

      {isSettingsOpen && (
        <section className="panel account-settings-panel">
          <h2>تغيير كلمة المرور</h2>
          <form className="link-form" onSubmit={(event) => void handleChangePassword(event)}>
            <label className="field">
              <span>كلمة المرور الجديدة</span>
              <input required type="password" minLength={6} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} dir="ltr" />
            </label>
            <label className="field">
              <span>تأكيد كلمة المرور</span>
              <input required type="password" minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} dir="ltr" />
            </label>
            {settingsMessage && <p className="form-feedback">{settingsMessage}</p>}
            <button type="submit" className="primary-button" disabled={isChangingPassword}>
              {isChangingPassword ? "جارٍ التغيير..." : "تغيير كلمة المرور"}
            </button>
          </form>
        </section>
      )}

      <section className="dashboard-grid">
        <article className="panel panel-wide student-overview">
          <div><p className="dashboard-eyebrow">LEARNING STATUS</p><h2>مسار إنجازك</h2></div>
          <div className="student-report-grid">
            <div><strong>{sessions.length}</strong><span>إجمالي الجلسات</span></div>
            <div><strong>{viewedSessions}</strong><span>تمت مشاهدتها</span></div>
            <div><strong>{completedSessions}</strong><span>تم اجتيازها</span></div>
            <div><strong>{sessions.length ? Math.round((completedSessions / sessions.length) * 100) : 0}%</strong><span>الإنجاز</span></div>
          </div>
        </article>
        {notifications.length > 0 && <article className="panel panel-wide notification-panel">
          <h2>إشعارات جديدة</h2>
          <ul>{notifications.map((notification) => <li key={notification}>{notification}</li>)}</ul>
        </article>}

        <article className="panel panel-wide">
          <h2>جلساتي حسب المسار الدراسي</h2>
          <div className="curriculum-tree">
            {curriculumTree.map((term) => (
              <section key={term.label} className="curriculum-term">
                <h3 className="curriculum-term-title">{term.label}</h3>
                {term.units.map((unit) => (
                  <div key={unit.label} className="curriculum-unit">
                    <p className="curriculum-unit-title">{unit.label}</p>
                    <div className="curriculum-lesson-list">
                      {unit.lessons.map((lesson) =>
                        lesson.sessions.map((session) => {
                          const index = sessions.findIndex((entry) => entry.id === session.id);
                          const previousSession = index > 0 ? sessions[index - 1] : null;
                          const isLocked = Boolean(previousSession && !previousSession.quizPassed);
                          const isExpanded = expandedSessionId === session.id;

                          return (
                            <div key={session.id} className="curriculum-lesson">
                              <button
                                type="button"
                                className={isLocked ? "curriculum-lesson-row locked" : "curriculum-lesson-row"}
                                disabled={isLocked}
                                onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                              >
                                <span className="session-title">{lesson.label}</span>
                                <span
                                  className={
                                    session.quizPassed
                                      ? "badge badge-pass"
                                      : isLocked
                                        ? "badge badge-locked"
                                        : session.watchedAt
                                          ? "badge badge-pending"
                                          : "badge badge-locked"
                                  }
                                >
                                  {isLocked
                                    ? "مقفلة حتى اجتياز الجلسة السابقة"
                                    : session.quizPassed
                                      ? "مكتملة"
                                      : session.watchedAt
                                        ? "تمت المشاهدة"
                                        : "لم تُشاهد"}
                                </span>
                                {!isLocked && <span className="curriculum-lesson-chevron">{isExpanded ? "▾" : "◂"}</span>}
                              </button>
                              {isExpanded && !isLocked && (
                                <SessionDetailPanel
                                  session={session}
                                  studentId={userDoc.uid}
                                  studentEmail={userDoc.email}
                                  studentPhone={userDoc.phone ?? "—"}
                                />
                              )}
                            </div>
                          );
                        }),
                      )}
                    </div>
                  </div>
                ))}
              </section>
            ))}
            {sessions.length === 0 && <p className="empty-state">لم يتم تعيين أي جلسات لك بعد. تواصل مع معلّمك.</p>}
          </div>
        </article>
      </section>
    </main>
  );
};

export default StudentDashboardPage;

