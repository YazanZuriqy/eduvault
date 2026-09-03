"use client";

import { type FormEvent, useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, where } from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { getFirebaseDb } from "@/utils/firebase";
import { createStudentInvite, deleteStudentAccount, translateFirebaseError } from "@/utils/auth";
import { createStudentDriveFolder, isGoogleDriveConfigured, requestGoogleDriveToken } from "@/utils/googleDrive";
import StudentProfile from "@/components/StudentProfile";
import type { StudentInviteDoc, UserDoc } from "@/types";

interface StudentManagerProps {
  students: UserDoc[];
  onAddSession: (student: UserDoc) => void;
  onAddQuiz: (student: UserDoc) => void;
}

interface GeneratedInvite {
  email: string;
  code: string;
  displayName: string;
}

// رابط بريد جاهز (mailto) يفتح تطبيق بريد المعلّم نفسه برسالة معبّأة مسبقًا — يعمل فورًا بلا أي
// خادم أو مفاتيح API، بانتظار تفعيل الإرسال التلقائي عبر دالة سحابية لاحقًا.
const buildInviteMailto = (email: string, name: string, code: string): string => {
  const subject = encodeURIComponent("رمز تسجيل حسابك في EduVault");
  const body = encodeURIComponent(
    `مرحبًا ${name}،\n\nرمز تسجيل حسابك في منصة EduVault هو: ${code}\n\nافتح صفحة تسجيل الدخول، اختر تبويب "تسجيل طالب"، وأكمل بياناتك بهذا الرمز لإنشاء كلمة مرورك الخاصة.\n\nبالتوفيق!`,
  );
  return `mailto:${email}?subject=${subject}&body=${body}`;
};

const StudentManager = ({ students, onAddSession, onAddQuiz }: StudentManagerProps) => {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [createDriveFolder, setCreateDriveFolder] = useState(isGoogleDriveConfigured());
  const [isCreating, setIsCreating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [generatedInvite, setGeneratedInvite] = useState<GeneratedInvite | null>(null);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<UserDoc | null>(null);
  const [pendingInvites, setPendingInvites] = useState<StudentInviteDoc[]>([]);
  const gradeLevels = [...new Set(students.map((student) => student.gradeLevel).filter(Boolean))] as string[];
  const searchNeedle = searchTerm.trim().toLowerCase();
  const visibleStudents = students
    .filter((student) => gradeFilter === "all" || student.gradeLevel === gradeFilter)
    .filter(
      (student) =>
        !searchNeedle ||
        student.displayName.toLowerCase().includes(searchNeedle) ||
        student.email.toLowerCase().includes(searchNeedle),
    );

  useEffect(() => {
    if (!selectedStudent) return;
    setSelectedStudent(students.find((student) => student.uid === selectedStudent.uid) ?? null);
  }, [students, selectedStudent]);

  useEffect(() => {
    const invitesQuery = query(collection(getFirebaseDb(), "studentInvites"), where("used", "==", false));
    const unsubscribe = onSnapshot(invitesQuery, (snapshot) => {
      const invites = snapshot.docs.map((entry) => entry.data() as StudentInviteDoc);
      invites.sort((a, b) => b.createdAt - a.createdAt);
      setPendingInvites(invites);
    });
    return unsubscribe;
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setIsCreating(true);

    try {
      const token = createDriveFolder ? await requestGoogleDriveToken() : null;
      const driveFolderId = token ? await createStudentDriveFolder(token, displayName, gradeLevel) : undefined;
      const invite = await createStudentInvite({
        email,
        displayName,
        phone,
        parentEmail: parentEmail || undefined,
        gradeLevel: gradeLevel || undefined,
        driveFolderId,
      });
      setGeneratedInvite({ email: invite.email, code: invite.code, displayName: invite.displayName });
      setDisplayName("");
      setEmail("");
      setPhone("");
      setParentEmail("");
      setGradeLevel("");
    } catch (err) {
      const message =
        err instanceof FirebaseError ? translateFirebaseError(err.code) : "تعذر إنشاء دعوة التسجيل. حاول مرة أخرى.";
      setFeedback(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteInvite = async (code: string) => {
    if (!window.confirm("حذف دعوة التسجيل هذه؟ سيحتاج الطالب رمزًا جديدًا للتسجيل.")) return;
    await deleteDoc(doc(getFirebaseDb(), "studentInvites", code));
  };

  const handleDelete = async (studentUid: string, studentName: string) => {
    const confirmed = window.confirm(
      `هل أنت متأكد من حذف الطالب "${studentName}"؟ سيفقد القدرة على الدخول، وستُحذف جلساته واختباراته المرتبطة.`,
    );
    if (!confirmed) return;

    setFeedback(null);
    setDeletingUid(studentUid);

    try {
      await deleteStudentAccount(studentUid);
    } catch {
      setFeedback("تعذر حذف الطالب. حاول مرة أخرى.");
    } finally {
      setDeletingUid(null);
    }
  };

  return (
    <div className="student-manager">
      <form className="link-form" onSubmit={(event) => void handleCreate(event)}>
        <label className="field">
          <span>اسم الطالب الكامل</span>
          <input
            required
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="مثال: سارة أحمد"
          />
        </label>

        <label className="field">
          <span>البريد الإلكتروني</span>
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="student@example.com"
            dir="ltr"
          />
        </label>

        <label className="field">
          <span>رقم الهاتف (يُستخدم في العلامة المائية للفيديو)</span>
          <input
            required
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="05xxxxxxxx"
            dir="ltr"
          />
        </label>

        <label className="field">
          <span>بريد ولي الأمر (اختياري)</span>
          <input
            type="email"
            value={parentEmail}
            onChange={(event) => setParentEmail(event.target.value)}
            placeholder="parent@example.com"
            dir="ltr"
          />
        </label>

        <label className="field">
          <span>المرحلة الدراسية</span>
          <input
            type="text"
            value={gradeLevel}
            onChange={(event) => setGradeLevel(event.target.value)}
            placeholder="مثال: الصف العاشر"
          />
        </label>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={createDriveFolder}
            disabled={!isGoogleDriveConfigured()}
            onChange={(event) => setCreateDriveFolder(event.target.checked)}
          />
          <span>
            {isGoogleDriveConfigured()
              ? "إنشاء مجلد Google Drive باسم الطالب والمرحلة"
              : "أضف Google Client ID لتفعيل إنشاء مجلد Drive تلقائيًا"}
          </span>
        </label>

        <p className="quiz-hint">
          سيتولّد رمز تسجيل فريد للطالب — يُكمل هو تسجيل حسابه بنفسه ويختار كلمة مروره الخاصة من
          صفحة الدخول، فلا يعرف أحد غيره كلمة مروره الحقيقية.
        </p>

        {feedback && <p className="auth-error">{feedback}</p>}

        <button type="submit" className="primary-button" disabled={isCreating}>
          {isCreating ? "جارٍ الإنشاء..." : "توليد رمز تسجيل للطالب"}
        </button>
      </form>

      {generatedInvite && (
        <div className="generated-credentials">
          <p>تم توليد رمز التسجيل بنجاح. أرسله للطالب ليكمل تسجيله بنفسه:</p>
          <div className="credential-row">
            <span>البريد:</span>
            <code dir="ltr">{generatedInvite.email}</code>
          </div>
          <div className="credential-row">
            <span>رمز التسجيل:</span>
            <code dir="ltr">{generatedInvite.code}</code>
            <button type="button" className="logout-button" onClick={() => void navigator.clipboard.writeText(generatedInvite.code)}>
              نسخ
            </button>
            <a className="logout-button" href={buildInviteMailto(generatedInvite.email, generatedInvite.displayName, generatedInvite.code)}>
              إرسال بالبريد
            </a>
          </div>
          <button type="button" className="logout-button" onClick={() => setGeneratedInvite(null)}>
            إغلاق
          </button>
        </div>
      )}

      {pendingInvites.length > 0 && (
        <div className="pending-invites">
          <h3>دعوات بانتظار إكمال التسجيل ({pendingInvites.length})</h3>
          <ul className="student-list">
            {pendingInvites.map((invite) => (
              <li key={invite.code} className="list-row">
                <div className="list-row-info">
                  <span className="student-name">{invite.displayName}</span>
                  <span className="student-email">{invite.email}</span>
                  <code className="student-code-badge" dir="ltr">{invite.code}</code>
                </div>
                <div className="list-row-actions">
                  <button type="button" className="logout-button" onClick={() => void navigator.clipboard.writeText(invite.code)}>نسخ</button>
                  <a className="logout-button" href={buildInviteMailto(invite.email, invite.displayName, invite.code)}>إرسال</a>
                  <button type="button" className="logout-button" onClick={() => void handleDeleteInvite(invite.code)}>حذف</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="student-list">
        <li className="student-filter-row">
          <label className="field">
            <span>بحث بالاسم أو البريد</span>
            <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="اكتب للبحث..." />
          </label>
          <label className="field">
            <span>تصفية حسب المرحلة</span>
            <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}>
              <option value="all">كل المراحل</option>
              {gradeLevels.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </label>
        </li>
        {visibleStudents.map((student) => (
          <li key={student.uid} className="list-row">
            <div className="list-row-info">
              <span className="student-name">{student.displayName}</span>
              <span className="student-email">{student.email}{student.gradeLevel ? ` - ${student.gradeLevel}` : ""}</span>
              {student.studentCode && <code className="student-code-badge" dir="ltr">{student.studentCode}</code>}
              <span className={student.primaryDeviceId ?? student.deviceId ? "badge badge-pass" : "badge badge-locked"}>
                {student.primaryDeviceId ?? student.deviceId ? "🔒 مرتبط بجهاز" : "🔓 بلا جهاز"}
              </span>
            </div>
            <div className="list-row-actions">
              <button type="button" className="logout-button" onClick={() => setSelectedStudent(student)}>ملف الطالب</button>
              <button
                type="button"
                className="logout-button"
                disabled={deletingUid === student.uid}
                onClick={() => void handleDelete(student.uid, student.displayName)}
              >
                {deletingUid === student.uid ? "جارٍ الحذف..." : "حذف"}
              </button>
            </div>
          </li>
        ))}
        {visibleStudents.length === 0 && <li className="empty-state">لا يوجد طلاب مطابقون للبحث/التصفية.</li>}
      </ul>
      {selectedStudent && <StudentProfile student={selectedStudent} onClose={() => setSelectedStudent(null)} onAddSession={onAddSession} onAddQuiz={onAddQuiz} />}
    </div>
  );
};

export default StudentManager;
