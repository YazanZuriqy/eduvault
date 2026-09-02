"use client";

import { type FormEvent, useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import type { QuizDoc, SessionDoc, UserDoc } from "@/types";

interface StudentProfileProps {
  student: UserDoc;
  onClose: () => void;
}

type SessionWithId = SessionDoc & { id: string };
type QuizWithId = QuizDoc & { id: string };

const StudentProfile = ({ student, onClose }: StudentProfileProps) => {
  const [displayName, setDisplayName] = useState(student.displayName);
  const [phone, setPhone] = useState(student.phone ?? "");
  const [parentEmail, setParentEmail] = useState(student.parentEmail ?? "");
  const [gradeLevel, setGradeLevel] = useState(student.gradeLevel ?? "");
  const [sessions, setSessions] = useState<SessionWithId[]>([]);
  const [quizzes, setQuizzes] = useState<QuizWithId[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const db = getFirebaseDb();
    const unsubscribeSessions = onSnapshot(
      query(collection(db, "sessions"), where("studentId", "==", student.uid)),
      (snapshot) => setSessions(snapshot.docs.map((entry) => ({ ...(entry.data() as SessionDoc), id: entry.id }))),
    );
    const unsubscribeQuizzes = onSnapshot(
      query(collection(db, "quizzes"), where("studentIds", "array-contains", student.uid)),
      (snapshot) => setQuizzes(snapshot.docs.map((entry) => ({ ...(entry.data() as QuizDoc), id: entry.id }))),
    );
    return () => {
      unsubscribeSessions();
      unsubscribeQuizzes();
    };
  }, [student.uid]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      await updateDoc(doc(getFirebaseDb(), "users", student.uid), {
        displayName,
        phone: phone || null,
        parentEmail: parentEmail || null,
        gradeLevel: gradeLevel || null,
      });
      setMessage("تم حفظ بيانات الطالب فورًا.");
    } catch {
      setMessage("تعذر حفظ بيانات الطالب.");
    } finally {
      setIsSaving(false);
    }
  };

  const completedSessions = sessions.filter((session) => session.quizPassed).length;
  const progress = sessions.length ? Math.round((completedSessions / sessions.length) * 100) : 0;

  return (
    <section className="student-profile" aria-label={`ملف ${student.displayName}`}>
      <header className="student-profile-header">
        <div>
          <p className="dashboard-eyebrow">STUDENT FILE</p>
          <h2>{student.displayName}</h2>
          <p>{student.email}</p>
        </div>
        <button type="button" className="logout-button" onClick={onClose}>إغلاق الملف</button>
      </header>

      <div className="student-report-grid">
        <div><strong>{sessions.length}</strong><span>جلسات مخصصة</span></div>
        <div><strong>{completedSessions}</strong><span>اختبارات مجتازة</span></div>
        <div><strong>{quizzes.length}</strong><span>اختبارات مكلّف بها</span></div>
        <div><strong>{progress}%</strong><span>نسبة الإنجاز</span></div>
      </div>

      <div className="student-profile-columns">
        <form className="link-form" onSubmit={(event) => void handleSave(event)}>
          <h3>بيانات الحساب</h3>
          <label className="field"><span>الاسم</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <label className="field"><span>رقم الهاتف</span><input value={phone} onChange={(event) => setPhone(event.target.value)} dir="ltr" /></label>
          <label className="field"><span>بريد ولي الأمر</span><input value={parentEmail} onChange={(event) => setParentEmail(event.target.value)} dir="ltr" /></label>
          <label className="field"><span>المرحلة الدراسية</span><input value={gradeLevel} onChange={(event) => setGradeLevel(event.target.value)} /></label>
          <label className="field"><span>معرّف ملف Drive</span><input value={student.driveFolderId ?? "لم يُنشأ بعد"} readOnly dir="ltr" /></label>
          <p className="quiz-hint">لا يمكن إظهار كلمة المرور القديمة بصورة آمنة. أنشئ حسابًا جديدًا أو أضف مسار إعادة تعيين كلمة المرور لاحقًا عند الحاجة.</p>
          {message && <p className="form-feedback">{message}</p>}
          <button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? "جارٍ الحفظ..." : "حفظ البيانات"}</button>
        </form>

        <div className="student-activity">
          <h3>الجلسات والاختبارات</h3>
          <ul className="session-list">
            {sessions.map((session) => (
              <li key={session.id}>
                <span className="session-title">{session.videoTitle}</span>
                <span className={session.quizPassed ? "badge badge-pass" : "badge badge-pending"}>{session.quizPassed ? "مكتمل" : "بانتظار الاختبار"}</span>
              </li>
            ))}
            {sessions.length === 0 && <li className="empty-state">لا توجد جلسات لهذا الطالب.</li>}
          </ul>
          <ul className="session-list">
            {quizzes.map((quiz) => (
              <li key={quiz.id}>
                <span className="session-title">{quiz.title ?? "اختبار بلا عنوان"}</span>
                <span className="student-email">{quiz.type === "comprehensive" ? "اختبار شامل" : "اختبار يومي"}</span>
              </li>
            ))}
            {quizzes.length === 0 && <li className="empty-state">لا توجد اختبارات مكلّف بها بعد.</li>}
          </ul>
        </div>
      </div>
    </section>
  );
};

export default StudentProfile;
