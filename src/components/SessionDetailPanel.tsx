"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import VideoPlayer from "@/components/VideoPlayer";
import QuizModal from "@/components/QuizModal";
import type { NoteDoc, SessionDoc } from "@/types";

type SessionWithId = SessionDoc & { id: string };

interface SessionDetailPanelProps {
  session: SessionWithId;
  studentId: string;
  studentEmail: string;
  studentPhone: string;
}

const formatTimestamp = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
};

// لوحة تفصيل جلسة واحدة (فيديو ← زر الاختبار ← الملاحظات الزمنية) بالترتيب الرأسي نفسه في كل
// مكان تُعرض فيه: صفحة الجلسة المستقلة وشجرة لوحة الطالب عند توسيع درس معيّن، بلا ازدواجية منطق.
const SessionDetailPanel = ({ session, studentId, studentEmail, studentPhone }: SessionDetailPanelProps) => {
  const [notes, setNotes] = useState<NoteDoc[]>([]);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [noteMinutes, setNoteMinutes] = useState("");
  const [noteSeconds, setNoteSeconds] = useState("");

  useEffect(() => {
    if (!session.watchedAt) {
      void updateDoc(doc(getFirebaseDb(), "sessions", session.id), { watchedAt: Date.now() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  useEffect(() => {
    const notesQuery = query(
      collection(getFirebaseDb(), "notes"),
      where("sessionId", "==", session.id),
      where("studentId", "==", studentId),
    );

    const unsubscribe = onSnapshot(notesQuery, (snapshot) => {
      const nextNotes = snapshot.docs
        .map((docSnapshot) => docSnapshot.data() as NoteDoc)
        .sort((a, b) => a.timestampSeconds - b.timestampSeconds);
      setNotes(nextNotes);
    });

    return unsubscribe;
  }, [session.id, studentId]);

  const handleAddNote = async () => {
    const totalSeconds = (Number(noteMinutes) || 0) * 60 + (Number(noteSeconds) || 0);

    const note: Omit<NoteDoc, "noteId"> = {
      sessionId: session.id,
      studentId,
      label: `ملاحظة عند ${formatTimestamp(totalSeconds)}`,
      timestampSeconds: totalSeconds,
      createdAt: Date.now(),
    };

    await addDoc(collection(getFirebaseDb(), "notes"), note);
    setNoteMinutes("");
    setNoteSeconds("");
  };

  return (
    <div className="session-detail-panel">
      <VideoPlayer driveFileId={session.driveFileId} studentEmail={studentEmail} studentPhone={studentPhone} />

      <div className="player-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => setIsQuizOpen(true)}
          disabled={session.quizPassed}
        >
          {session.quizPassed ? "تم اجتياز الاختبار" : "بدء الاختبار"}
        </button>
      </div>

      <div className="note-timestamp-form">
        <label className="field">
          <span>دقيقة</span>
          <input type="number" min={0} value={noteMinutes} onChange={(event) => setNoteMinutes(event.target.value)} placeholder="00" />
        </label>
        <label className="field">
          <span>ثانية</span>
          <input type="number" min={0} max={59} value={noteSeconds} onChange={(event) => setNoteSeconds(event.target.value)} placeholder="00" />
        </label>
        <button type="button" className="primary-button" onClick={() => void handleAddNote()}>
          إضافة ملاحظة عند هذه اللحظة
        </button>
      </div>

      <ul className="notes-list">
        {notes.map((note) => (
          <li key={`${note.sessionId}-${note.timestampSeconds}`}>
            <span>{formatTimestamp(note.timestampSeconds)} — {note.label}</span>
          </li>
        ))}
        {notes.length === 0 && <li className="empty-state">لا توجد ملاحظات محفوظة بعد.</li>}
      </ul>

      {isQuizOpen && <QuizModal sessionId={session.id} onClose={() => setIsQuizOpen(false)} />}
    </div>
  );
};

export default SessionDetailPanel;
