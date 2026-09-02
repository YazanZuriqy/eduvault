"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import { logoutUser } from "@/utils/auth";
import { useAuthUser } from "@/utils/useAuthUser";
import type { QuizDoc, SessionDoc } from "@/types";

type SessionWithId = SessionDoc & { id: string };

const StudentDashboardPage = () => {
  const router = useRouter();
  const { firebaseUser, userDoc, isLoading } = useAuthUser();
  const [sessions, setSessions] = useState<SessionWithId[]>([]);
  const [quizzes, setQuizzes] = useState<QuizDoc[]>([]);

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
  const groups = sessions.reduce<Record<string, SessionWithId[]>>((result, session) => {
    const curriculum = session.curriculum;
    const label = curriculum?.track === "foundation"
      ? `التأسيس${curriculum.unit ? ` / ${curriculum.unit}` : ""}${curriculum.lesson ? ` / ${curriculum.lesson}` : ""}`
      : `${curriculum?.term ?? "غير مصنّف"}${curriculum?.unit ? ` / ${curriculum.unit}` : ""}${curriculum?.lesson ? ` / ${curriculum.lesson}` : ""}`;
    (result[label] ??= []).push(session);
    return result;
  }, {});

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">STUDENT DASHBOARD</p>
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
          <div className="curriculum-session-groups">
          {Object.entries(groups).map(([label, groupSessions]) => (
            <section key={label} className="curriculum-session-group">
              <h3>{label}</h3>
              <ul className="session-list">
            {groupSessions.map((session) => {
              const index = sessions.findIndex((entry) => entry.id === session.id);
              const previousSession = index > 0 ? sessions[index - 1] : null;
              const isLocked = Boolean(previousSession && !previousSession.quizPassed);

              return (
                <li key={session.id} className={isLocked ? "session-item-locked" : undefined}>
                  {isLocked ? (
                    <>
                      <span className="session-title">{session.videoTitle}</span>
                      <span className="badge badge-locked">مقفلة حتى اجتياز الجلسة السابقة</span>
                    </>
                  ) : (
                    <Link href={`/dashboard/student/session?id=${session.id}`} className="session-link">
                      <span className="session-title">{session.videoTitle}</span>
                      <span className={session.quizPassed ? "badge badge-pass" : session.watchedAt ? "badge badge-pending" : "badge badge-locked"}>
                        {session.quizPassed ? "مكتملة" : session.watchedAt ? "تمت المشاهدة" : "لم تُشاهد"}
                      </span>
                    </Link>
                  )}
                </li>
              );
            })}
              </ul>
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
