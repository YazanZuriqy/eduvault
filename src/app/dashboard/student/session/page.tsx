"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDoc, collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import { useAuthUser } from "@/utils/useAuthUser";
import VideoPlayer from "@/components/VideoPlayer";
import QuizModal from "@/components/QuizModal";
import type { NoteDoc, SessionDoc } from "@/types";

type SessionWithId = SessionDoc & { id: string };

const formatTimestamp = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
};

const SessionViewerContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("id") ?? "";
  const { firebaseUser, userDoc, isLoading } = useAuthUser();

  const [session, setSession] = useState<SessionWithId | null>(null);
  const [notes, setNotes] = useState<NoteDoc[]>([]);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [noteMinutes, setNoteMinutes] = useState("");
  const [noteSeconds, setNoteSeconds] = useState("");

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

  useEffect(() => {
    if (!session || session.watchedAt) return;
    void updateDoc(doc(getFirebaseDb(), "sessions", session.id), { watchedAt: Date.now() });
  }, [session]);

  useEffect(() => {
    if (!sessionId || userDoc?.role !== "student") return;

    const notesQuery = query(
      collection(getFirebaseDb(), "notes"),
      where("sessionId", "==", sessionId),
      where("studentId", "==", userDoc.uid),
    );

    const unsubscribe = onSnapshot(notesQuery, (snapshot) => {
      const nextNotes = snapshot.docs
        .map((docSnapshot) => docSnapshot.data() as NoteDoc)
        .sort((a, b) => a.timestampSeconds - b.timestampSeconds);
      setNotes(nextNotes);
    });

    return unsubscribe;
  }, [sessionId, userDoc]);

  const handleAddNote = async () => {
    if (!userDoc || !session) return;

    const totalSeconds = (Number(noteMinutes) || 0) * 60 + (Number(noteSeconds) || 0);

    const note: Omit<NoteDoc, "noteId"> = {
      sessionId: session.id,
      studentId: userDoc.uid,
      label: `ملاحظة عند ${formatTimestamp(totalSeconds)}`,
      timestampSeconds: totalSeconds,
      createdAt: Date.now(),
    };

    await addDoc(collection(getFirebaseDb(), "notes"), note);
    setNoteMinutes("");
    setNoteSeconds("");
  };

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

      <section className="session-viewer-grid">
        <div className="panel player-panel">
          <VideoPlayer
            driveFileId={session.driveFileId}
            studentEmail={userDoc.email}
            studentPhone={userDoc.phone ?? "—"}
          />

          <div className="note-timestamp-form">
            <label className="field">
              <span>دقيقة</span>
              <input
                type="number"
                min={0}
                value={noteMinutes}
                onChange={(event) => setNoteMinutes(event.target.value)}
                placeholder="00"
              />
            </label>
            <label className="field">
              <span>ثانية</span>
              <input
                type="number"
                min={0}
                max={59}
                value={noteSeconds}
                onChange={(event) => setNoteSeconds(event.target.value)}
                placeholder="00"
              />
            </label>
          </div>

          <div className="player-actions">
            <button type="button" className="primary-button" onClick={() => void handleAddNote()}>
              إضافة ملاحظة عند هذه اللحظة
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => setIsQuizOpen(true)}
              disabled={session.quizPassed}
            >
              {session.quizPassed ? "تم اجتياز الاختبار" : "بدء الاختبار"}
            </button>
          </div>
        </div>

        <aside className="panel notes-panel">
          <h2>ملاحظاتي الزمنية</h2>
          <ul className="notes-list">
            {notes.map((note) => (
              <li key={`${note.sessionId}-${note.timestampSeconds}`}>
                <span>{formatTimestamp(note.timestampSeconds)} — {note.label}</span>
              </li>
            ))}
            {notes.length === 0 && <li className="empty-state">لا توجد ملاحظات محفوظة بعد.</li>}
          </ul>
        </aside>
      </section>

      {isQuizOpen && <QuizModal sessionId={session.id} onClose={() => setIsQuizOpen(false)} />}
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
