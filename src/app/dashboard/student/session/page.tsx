"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import { useAuthUser } from "@/utils/useAuthUser";
import SessionDetailPanel from "@/components/SessionDetailPanel";
import type { SessionDoc } from "@/types";

type SessionWithId = SessionDoc & { id: string };

const SessionViewerContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("id") ?? "";
  const { firebaseUser, userDoc, isLoading } = useAuthUser();

  const [session, setSession] = useState<SessionWithId | null>(null);

  useEffect(() => {
    if (!isLoading && (!firebaseUser || userDoc?.role !== "student")) {
      router.replace("/auth");
    }
  }, [isLoading, firebaseUser, userDoc, router]);

  useEffect(() => {
    if (!sessionId || userDoc?.role !== "student") return;

    const sessionRef = doc(getFirebaseDb(), "sessions", sessionId);
    const unsubscribe = onSnapshot(sessionRef, (snapshot) => {
      if (!snapshot.exists()) {
        setSession(null);
        return;
      }

      const data = snapshot.data() as SessionDoc;

      if (data.studentId !== userDoc.uid) {
        router.replace("/dashboard/student");
        return;
      }

      setSession({ ...data, id: snapshot.id });
    });

    return unsubscribe;
  }, [sessionId, userDoc, router]);

  if (isLoading || userDoc?.role !== "student") {
    return (
      <main className="dashboard-shell">
        <p>جارٍ التحقق من الصلاحيات...</p>
      </main>
    );
  }

  if (!sessionId || !session) {
    return (
      <main className="dashboard-shell">
        <p>تعذر العثور على هذه الجلسة.</p>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">SESSION VIEWER</p>
          <h1>{session.videoTitle}</h1>
        </div>
        <button type="button" className="logout-button" onClick={() => router.push("/dashboard/student")}>
          العودة إلى لوحتي
        </button>
      </header>

      <section className="dashboard-grid">
        <article className="panel panel-wide">
          <SessionDetailPanel
            session={session}
            studentId={userDoc.uid}
            studentEmail={userDoc.email}
            studentPhone={userDoc.phone ?? "—"}
          />
        </article>
      </section>
    </main>
  );
};

const SessionViewerPage = () => (
  <Suspense
    fallback={
      <main className="dashboard-shell">
        <p>جارٍ التحميل...</p>
      </main>
    }
  >
    <SessionViewerContent />
  </Suspense>
);

export default SessionViewerPage;

