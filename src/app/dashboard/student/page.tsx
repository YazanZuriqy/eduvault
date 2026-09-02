"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import { logoutUser } from "@/utils/auth";
import { useAuthUser } from "@/utils/useAuthUser";
import type { SessionDoc } from "@/types";

type SessionWithId = SessionDoc & { id: string };

const StudentDashboardPage = () => {
  const router = useRouter();
  const { firebaseUser, userDoc, isLoading } = useAuthUser();
  const [sessions, setSessions] = useState<SessionWithId[]>([]);

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

    return unsubscribe;
  }, [userDoc]);

  if (isLoading || userDoc?.role !== "student") {
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
        <article className="panel panel-wide">
          <h2>جلساتي ({sessions.length})</h2>
          <ul className="session-list">
            {sessions.map((session, index) => {
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
                      <span className={session.quizPassed ? "badge badge-pass" : "badge badge-pending"}>
                        {session.quizPassed ? "تم الاجتياز" : "بانتظار الاختبار"}
                      </span>
                    </Link>
                  )}
                </li>
              );
            })}
            {sessions.length === 0 && (
              <li className="empty-state">لم يتم تعيين أي جلسات لك بعد. تواصل مع معلّمك.</li>
            )}
          </ul>
        </article>
      </section>
    </main>
  );
};

export default StudentDashboardPage;
