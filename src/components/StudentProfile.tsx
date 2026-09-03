"use client";

import { type FormEvent, useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import { allowAdditionalStudentDevice, unbindStudentDevice } from "@/utils/auth";
import DriveFolderExplorer from "@/components/DriveFolderExplorer";
import type { QuizDoc, SessionDoc, StudentCredentialDoc, UserDoc } from "@/types";

interface StudentProfileProps {
  student: UserDoc;
  onClose: () => void;
  onAddSession: (student: UserDoc) => void;
  onAddQuiz: (student: UserDoc) => void;
}

type SessionWithId = SessionDoc & { id: string };
type QuizWithId = QuizDoc & { id: string };

const StudentProfile = ({ student, onClose, onAddSession, onAddQuiz }: StudentProfileProps) => {
  const [displayName, setDisplayName] = useState(student.displayName);
  const [phone, setPhone] = useState(student.phone ?? "");
  const [parentEmail, setParentEmail] = useState(student.parentEmail ?? "");
  const [gradeLevel, setGradeLevel] = useState(student.gradeLevel ?? "");
  const [sessions, setSessions] = useState<SessionWithId[]>([]);
  const [quizzes, setQuizzes] = useState<QuizWithId[]>([]);
  const [credential, setCredential] = useState<StudentCredentialDoc | null>(null);
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
    const unsubscribeCredential = onSnapshot(doc(db, "studentCredentials", student.uid), (snapshot) => {
      setCredential(snapshot.exists() ? (snapshot.data() as StudentCredentialDoc) : null);
    });
    return () => {
      unsubscribeSessions();
      unsubscribeQuizzes();
      unsubscribeCredential();
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

  const handleUnbindDevice = async () => {
    if (!window.confirm("سيفقد الطالب ارتباطه بكل الأجهزة، وسيُعتمد أول جهاز يسجّل الدخول كجهاز أساسي جديد. متابعة؟")) return;
    setMessage(null);
    try {
      await unbindStudentDevice(student.uid);
      setMessage("تم فك ارتباط الجهاز الحالي. سيُعتمد أول جهاز يسجّل الدخول كجهاز أساسي.");
    } catch {
      setMessage("تعذر فك ارتباط الجهاز.");
    }
  };

  const handleAllowSecondaryDevice = async () => {
    setMessage(null);
    try {
      await allowAdditionalStudentDevice(student.uid);
      setMessage("تم فتح نافذة السماح. أول دخول تالٍ من جهاز مختلف سيُعتمد تلقائيًا كجهاز إضافي.");
    } catch {
      setMessage("تعذر فتح نافذة السماح.");
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
      <div className="student-profile-actions">
        <button type="button" className="primary-button" onClick={() => onAddSession(student)}>رفع جلسة لهذا الطالب</button>
        <button type="button" className="logout-button" onClick={() => onAddQuiz(student)}>إضافة اختبار لهذا الطالب</button>
      </div>

      <div className="student-profile-columns">
        <form className="link-form" onSubmit={(event) => void handleSave(event)}>
          <h3>بيانات الحساب</h3>
          <label className="field"><span>الاسم</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <label className="field"><span>رقم الهاتف</span><input value={phone} onChange={(event) => setPhone(event.target.value)} dir="ltr" /></label>
          <label className="field"><span>بريد ولي الأمر</span><input value={parentEmail} onChange={(event) => setParentEmail(event.target.value)} dir="ltr" /></label>
          <label className="field"><span>المرحلة الدراسية</span><input value={gradeLevel} onChange={(event) => setGradeLevel(event.target.value)} /></label>
          <label className="field"><span>معرّف ملف Drive</span><input value={student.driveFolderId ?? "لم يُنشأ بعد"} readOnly dir="ltr" /></label>
          {student.studentCode && (
            <div className="activation-code-box">
              <span>رمز الطالب</span>
              <code dir="ltr">{student.studentCode}</code>
            </div>
          )}
          {credential?.activationCode && (
            <div className="activation-code-box">
              <span>كلمة المرور المؤقتة (حساب قديم)</span>
              <code dir="ltr">{credential.activationCode}</code>
              <small>تُستخدم مرة واحدة فقط عند أول دخول، ثم يختار الطالب كلمة مروره الخاصة.</small>
            </div>
          )}
          <div className="device-status-grid">
            <div className="device-status-row">
              <span>الجهاز الأساسي</span>
              <span>{student.primaryDeviceId ?? student.deviceId ? "مرتبط" : "غير مرتبط"}</span>
            </div>
            <div className="device-status-row">
              <span>الجهاز الإضافي</span>
              <span>{student.secondaryDeviceId ? "مرتبط" : student.secondaryDeviceWindowOpen ? "بانتظار أول دخول" : "—"}</span>
            </div>
          </div>
          <div className="device-control">
            <button type="button" className="logout-button" onClick={() => void handleUnbindDevice()}>فكّ ارتباط الجهاز الحالي</button>
            <button type="button" className="logout-button" onClick={() => void handleAllowSecondaryDevice()}>السماح بجهاز إضافي</button>
          </div>
          {message && <p className="form-feedback">{message}</p>}
          <button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? "جارٍ الحفظ..." : "حفظ البيانات"}</button>
        </form>

        <div className="student-activity">
          <h3>الجلسات والاختبارات</h3>
          <ul className="session-list">
            {sessions.map((session) => (
              <li key={session.id} className="list-row">
                <div className="list-row-info">
                  <span className="session-title">{session.videoTitle}</span>
                  <span className={session.quizPassed ? "badge badge-pass" : "badge badge-pending"}>{session.quizPassed ? "مكتمل" : "بانتظار الاختبار"}</span>
                </div>
              </li>
            ))}
            {sessions.length === 0 && <li className="empty-state">لا توجد جلسات لهذا الطالب.</li>}
          </ul>
          <ul className="session-list">
            {quizzes.map((quiz) => (
              <li key={quiz.id} className="list-row">
                <div className="list-row-info">
                  <span className="session-title">{quiz.title ?? "اختبار بلا عنوان"}</span>
                  <span className="student-email">{quiz.type === "comprehensive" ? "اختبار شامل" : "اختبار يومي"}</span>
                </div>
              </li>
            ))}
            {quizzes.length === 0 && <li className="empty-state">لا توجد اختبارات مكلّف بها بعد.</li>}
          </ul>
          {student.driveFolderId && (
            <>
              <h3>ملفات الطالب على Google Drive</h3>
              <DriveFolderExplorer rootFolderId={student.driveFolderId} />
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default StudentProfile;
