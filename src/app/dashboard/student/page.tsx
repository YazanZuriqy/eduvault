"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import { changeOwnPassword, logoutUser } from "@/utils/auth";
import { useAuthUser } from "@/utils/useAuthUser";
import SessionDetailPanel from "@/components/SessionDetailPanel";
import DriveFolderExplorer from "@/components/DriveFolderExplorer";
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
const CIRCLE_R = 54;
const CIRCLE_C = 2 * Math.PI * CIRCLE_R;

const buildCurriculumTree = (sessions: SessionWithId[]): TermNode[] => {
  const termOrder: string[] = [];
  const terms: Record<
    string,
    {
      units: Record<string, { unitOrder: string[]; lessonOrder: string[]; lessons: Record<string, LessonNode> }>;
      unitOrder: string[];
    }
  > = {};

  sessions.forEach((session) => {
    const curriculum = session.curriculum;
    const termLabel = curriculum?.track === "foundation" ? "التأسيس" : curriculum?.term ?? "غير مصنّف";
    const unitLabel = curriculum?.unit ?? "بلا وحدة";
    const lessonLabel = curriculum?.lesson ?? session.videoTitle;

    if (!terms[termLabel]) {
      terms[termLabel] = { units: {}, unitOrder: [] };
      termOrder.push(termLabel);
    }
        const termNode = terms[termLabel];

    if (!termNode.units[unitLabel]) {
      termNode.units[unitLabel] = { unitOrder: [], lessonOrder: [], lessons: {} };
      termNode.unitOrder.push(unitLabel);
    }
    const unitNode = termNode.units[unitLabel];

    if (!unitNode.lessons[lessonLabel]) {
      unitNode.lessons[lessonLabel] = { label: lessonLabel, sessions: [] };
      unitNode.lessonOrder.push(lessonLabel);
    }
    unitNode.lessons[lessonLabel].sessions.push(session);
  });

    return termOrder.map((tl) => ({
    label: tl,
    units: terms[tl].unitOrder.map((ul) => ({
      label: ul,
      lessons: terms[tl].units[ul].lessonOrder.map((ll) => terms[tl].units[ul].lessons[ll]),
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
  const progressCircleRef = useRef<SVGCircleElement | null>(null);

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

    // Circular-progress geometry
  const progressPct = sessions.length ? Math.round((completedSessions / sessions.length) * 100) : 0;
  const strokeDashoffset = CIRCLE_C - (CIRCLE_C * progressPct) / 100;

  // Drive root folder for this student — read directly from userDoc (no hook needed)
  const studentDriveFolderId: string | null = userDoc.driveFolderId ?? null;

  return (
    <main className="student-dark-shell">
      <header className="student-dark-header">
        <div>
          <p className="student-eyebrow">STUDENT DASHBOARD</p>
          <h1 className="student-heading">مرحبًا، {userDoc.displayName}</h1>
        </div>
        <div className="dashboard-header-actions">
          <Link href="/checkout" className="student-btn-outline">الاشتراك المميّز</Link>
          <button type="button" className="student-btn-outline" onClick={() => setIsSettingsOpen((previous) => !previous)}>
            إعدادات الحساب
          </button>
          <button
            type="button"
            className="student-btn-outline"
            onClick={async () => {
              await logoutUser();
              router.replace("/auth");
            }}
          >
            تسجيل الخروج
          </button>
        </div>
      </header>

      {/* شارة حالة الاشتراك المميّز: تُعرض فقط للطلاب الذين لديهم اشتراك فعلي وغير منتهٍ (studentPremiumExpiresAt)،
          وليس لكل الطلاب بشكل ثابت، كي لا تُظهر حالة دفع وهمية لمن لم يشترك فعلًا. */}
                  {userDoc.studentPremiumExpiresAt && userDoc.studentPremiumExpiresAt > Date.now() ? (
        <div className="student-premium-badge">
          <p><strong>نوع الباقة الحالية:</strong> باقة التميّز السنوية للرياضيات 🎓</p>
          <p><strong>قيمة الاشتراك:</strong> 20 دينار أردني / سنوياً 🇯🇴</p>
          <p><strong>حالة الحساب:</strong> حساب نَشِط ومحمّي بالبصمة 🔐</p>
        </div>
      ) : null}

            {isSettingsOpen && (
        <section className="student-dark-card account-settings-panel">
          <h2 className="student-card-title">تغيير كلمة المرور</h2>
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

            <section className="student-dashboard-grid">

        {/* ── Animated Circular Progress Card ── */}
        <article className="student-dark-card panel-wide student-progress-card">
          <div className="student-progress-inner">
            <div className="student-progress-ring-wrap">
              <svg width="136" height="136" viewBox="0 0 136 136" className="student-progress-svg" aria-hidden="true">
                <circle cx="68" cy="68" r={CIRCLE_R} fill="none" stroke="#1e3a2f" strokeWidth="10" />
                <circle
                  ref={progressCircleRef}
                  cx="68"
                  cy="68"
                  r={CIRCLE_R}
                  fill="none"
                  stroke="#d4ef58"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={CIRCLE_C}
                  strokeDashoffset={strokeDashoffset}
                  transform="rotate(-90 68 68)"
                  style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1)" }}
                />
              </svg>
              <div className="student-progress-pct-label">
                <span className="student-progress-pct">{progressPct}%</span>
                <span className="student-progress-pct-sub">إنجاز</span>
              </div>
            </div>
            <div className="student-progress-stats">
              <p className="student-eyebrow">LEARNING STATUS</p>
              <h2 className="student-card-title">مسار إنجازك</h2>
              <div className="student-stat-grid">
                <div className="student-stat-cell"><strong>{sessions.length}</strong><span>إجمالي الجلسات</span></div>
                <div className="student-stat-cell"><strong>{viewedSessions}</strong><span>تمت مشاهدتها</span></div>
                <div className="student-stat-cell"><strong>{completedSessions}</strong><span>تم اجتيازها</span></div>
                <div className="student-stat-cell student-stat-cell--accent"><strong>{progressPct}%</strong><span>معدل الإنجاز</span></div>
              </div>
            </div>
          </div>
        </article>

        {notifications.length > 0 && (
          <article className="student-dark-card panel-wide student-notification-card">
            <h2 className="student-card-title">إشعارات جديدة</h2>
            <ul className="student-notification-list">
              {notifications.map((notification) => (
                <li key={notification} className="student-notification-item">{notification}</li>
              ))}
            </ul>
          </article>
        )}

        {/* ── Real-Time Drive Folder Explorer ── */}
        {studentDriveFolderId && (
          <article className="student-dark-card panel-wide">
            <p className="student-eyebrow">GOOGLE DRIVE</p>
            <h2 className="student-card-title">مستكشف ملفاتي الدراسية</h2>
            <p className="student-drive-hint">استعرض مجلداتك: الدوسيات، أوراق العمل، الفيديوهات — مباشرةً من Google Drive.</p>
            <DriveFolderExplorer rootFolderId={studentDriveFolderId} />
          </article>
        )}

        <article className="student-dark-card panel-wide">
          <h2 className="student-card-title">جلساتي حسب المسار الدراسي</h2>
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
                          const isExpanded = expandedSessionId === session.id;
                          return (
                            <div key={session.id} className="curriculum-lesson">
                              <button
                                type="button"
                                className="curriculum-lesson-row student-lesson-row"
                                disabled={false}
                                onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                              >
                                <span className="session-title">{lesson.label}</span>
                                <span
                                  className={
                                    session.quizPassed
                                      ? "badge badge-pass"
                                      : session.watchedAt
                                        ? "badge badge-pending"
                                        : "badge badge-locked"
                                  }
                                >
                                  {session.quizPassed
                                    ? "مكتملة"
                                    : session.watchedAt
                                      ? "تمت المشاهدة"
                                      : "لم تُشاهد"}
                                </span>
                                <span className="curriculum-lesson-chevron">{isExpanded ? "▾" : "◂"}</span>
                              </button>
                              {isExpanded && (
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

