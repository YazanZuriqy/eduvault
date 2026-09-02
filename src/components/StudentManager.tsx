"use client";

import { type FormEvent, useState } from "react";
import { FirebaseError } from "firebase/app";
import { createStudentAccount, deleteStudentAccount, generateStudentPassword, translateFirebaseError } from "@/utils/auth";
import { createStudentDriveFolder, isGoogleDriveConfigured, requestGoogleDriveToken } from "@/utils/googleDrive";
import type { UserDoc } from "@/types";

interface StudentManagerProps {
  students: UserDoc[];
}

interface GeneratedCredentials {
  email: string;
  password: string;
}

const StudentManager = ({ students }: StudentManagerProps) => {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [createDriveFolder, setCreateDriveFolder] = useState(isGoogleDriveConfigured());
  const [isCreating, setIsCreating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [generatedCredentials, setGeneratedCredentials] = useState<GeneratedCredentials | null>(null);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState("all");
  const gradeLevels = [...new Set(students.map((student) => student.gradeLevel).filter(Boolean))] as string[];
  const visibleStudents = gradeFilter === "all" ? students : students.filter((student) => student.gradeLevel === gradeFilter);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setIsCreating(true);

    try {
      const password = generateStudentPassword();
      const token = createDriveFolder ? await requestGoogleDriveToken() : null;
      const driveFolderId = token ? await createStudentDriveFolder(token, displayName, gradeLevel) : undefined;
      await createStudentAccount({
        email,
        password,
        displayName,
        phone,
        parentEmail: parentEmail || undefined,
        gradeLevel: gradeLevel || undefined,
        driveFolderId,
      });
      setGeneratedCredentials({ email, password });
      setDisplayName("");
      setEmail("");
      setPhone("");
      setParentEmail("");
      setGradeLevel("");
    } catch (err) {
      const message =
        err instanceof FirebaseError ? translateFirebaseError(err.code) : "تعذر إنشاء حساب الطالب. حاول مرة أخرى.";
      setFeedback(message);
    } finally {
      setIsCreating(false);
    }
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
          سيتم توليد كلمة مرور عشوائية آمنة للطالب تلقائيًا عند الإنشاء — لا يختارها الطالب بنفسه، ما يمنع
          تسجيل حسابات عشوائية.
        </p>

        {feedback && <p className="auth-error">{feedback}</p>}

        <button type="submit" className="primary-button" disabled={isCreating}>
          {isCreating ? "جارٍ الإنشاء..." : "إنشاء حساب الطالب"}
        </button>
      </form>

      {generatedCredentials && (
        <div className="generated-credentials">
          <p>تم إنشاء الحساب بنجاح. احفظ كلمة المرور الآن قبل الإغلاق — لن تظهر مرة أخرى:</p>
          <div className="credential-row">
            <span>البريد:</span>
            <code dir="ltr">{generatedCredentials.email}</code>
          </div>
          <div className="credential-row">
            <span>كلمة المرور:</span>
            <code dir="ltr">{generatedCredentials.password}</code>
            <button
              type="button"
              className="logout-button"
              onClick={() => void navigator.clipboard.writeText(generatedCredentials.password)}
            >
              نسخ
            </button>
          </div>
          <button type="button" className="logout-button" onClick={() => setGeneratedCredentials(null)}>
            إغلاق
          </button>
        </div>
      )}

      <ul className="student-list">
        <li className="student-filter">
          <label className="field">
            <span>تصفية حسب المرحلة</span>
            <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}>
              <option value="all">كل المراحل</option>
              {gradeLevels.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </label>
        </li>
        {visibleStudents.map((student) => (
          <li key={student.uid}>
            <span className="student-name">{student.displayName}</span>
            <span className="student-email">{student.email}{student.gradeLevel ? ` - ${student.gradeLevel}` : ""}</span>
            <button
              type="button"
              className="logout-button"
              disabled={deletingUid === student.uid}
              onClick={() => void handleDelete(student.uid, student.displayName)}
            >
              {deletingUid === student.uid ? "جارٍ الحذف..." : "حذف"}
            </button>
          </li>
        ))}
        {visibleStudents.length === 0 && <li className="empty-state">لا يوجد طلاب مطابقون للتصفية.</li>}
      </ul>
    </div>
  );
};

export default StudentManager;
