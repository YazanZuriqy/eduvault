"use client";

import { type FormEvent, useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, where } from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import { createTeacherAccountDirect, createTeacherInvite } from "@/utils/auth";
import type { TeacherInviteDoc } from "@/types";

// رابط بريد جاهز (mailto) يعمل فورًا بلا أي خادم أو مفاتيح API لإرسال كود دعوة المعلّم يدويًا.
const buildTeacherInviteMailto = (email: string, code: string): string => {
  const subject = encodeURIComponent("كود دعوة معلّم في EduVault");
  const body = encodeURIComponent(
    `مرحبًا،\n\nكود دعوتك لتسجيل حساب معلّم في منصة EduVault هو: ${code}\n\nافتح صفحة تسجيل الدخول، اختر تبويب "تسجيل معلّم"، وأكمل التسجيل بهذا الكود.\n\nبالتوفيق!`,
  );
  return `mailto:${email}?subject=${subject}&body=${body}`;
};

// لوحة حصرية للمالك (isOwner) فقط: تولّد كود دعوة معلّم من 8 محارف مرتبط ببريد محدد — بوابة مكافحة
// التسلّل التي تمنع أي شخص من تسجيل نفسه كمعلّم دون إذن صريح من المالك.
const TeacherInviteManager = () => {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [createDirect, setCreateDirect] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<{ email: string; code: string } | null>(null);
  const [pendingInvites, setPendingInvites] = useState<TeacherInviteDoc[]>([]);

  useEffect(() => {
    const invitesQuery = query(collection(getFirebaseDb(), "teacherInvites"), where("used", "==", false));
    const unsubscribe = onSnapshot(invitesQuery, (snapshot) => {
      const invites = snapshot.docs.map((entry) => entry.data() as TeacherInviteDoc);
      invites.sort((a, b) => b.createdAt - a.createdAt);
      setPendingInvites(invites);
    });
    return unsubscribe;
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setSuccessMessage(null);
    setIsCreating(true);
    try {
      if (createDirect) {
        await createTeacherAccountDirect({ email, displayName });
        setSuccessMessage("تم إنشاء حساب المعلّم مباشرةً وفعّلًا بلا أي معاملات معلّقة، وأُرسل رابط تعيين كلمة المرور إلى بريده مباشرةً.");
      } else {
        const invite = await createTeacherInvite(email);
        setGeneratedCode({ email: invite.email, code: invite.code });
      }
      setEmail("");
      setDisplayName("");
    } catch {
      setFeedback(createDirect ? "تعذر إنشاء حساب المعلّم. حاول مرة أخرى." : "تعذر توليد كود المعلّم. حاول مرة أخرى.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteInvite = async (code: string) => {
    if (!window.confirm("حذف كود الدعوة هذا؟")) return;
    await deleteDoc(doc(getFirebaseDb(), "teacherInvites", code));
  };

  return (
    <div className="student-manager">
      <form className="link-form" onSubmit={(event) => void handleCreate(event)}>
        <label className="field">
          <span>البريد الإلكتروني للمعلّم المدعو</span>
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teacher@example.com" dir="ltr" />
        </label>

        <label className="checkbox-field">
          <input type="checkbox" checked={createDirect} onChange={(event) => setCreateDirect(event.target.checked)} />
          <span>إنشاء الحساب مباشرة وتفعيله فورًا (تخطي كود الدعوة) — بلا أي معاملات معلّقة</span>
        </label>

        {createDirect && (
          <label className="field">
            <span>اسم المعلّم</span>
            <input required type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="مثال: أحمد الزريقي" />
          </label>
        )}

        <p className="quiz-hint">
          {createDirect
            ? "سيُنشأ الحساب فورًا ونشطًا بالكامل، ويصل المعلّم رابط Firebase الرسمي لتعيين كلمة مروره — لن تراها أنت إطلاقًا."
            : "سيتولّد كود من 8 محارف يُشترط لإتمام تسجيل حساب معلّم بهذا البريد تحديدًا — لن يقبل أي بريد آخر هذا الكود، ولن يُقبل مرتين."}
        </p>
        {feedback && <p className="auth-error">{feedback}</p>}
        {successMessage && <p className="form-feedback">{successMessage}</p>}
        <button type="submit" className="primary-button" disabled={isCreating}>
          {isCreating ? "جارٍ الإنشاء..." : createDirect ? "إنشاء حساب المعلّم مباشرة" : "توليد كود المعلم"}
        </button>
      </form>

      {generatedCode && (
        <div className="generated-credentials">
          <p>تم توليد الكود بنجاح. أرسله للمعلّم المدعو:</p>
          <div className="credential-row">
            <span>البريد:</span>
            <code dir="ltr">{generatedCode.email}</code>
          </div>
          <div className="credential-row">
            <span>الكود:</span>
            <code dir="ltr">{generatedCode.code}</code>
            <button type="button" className="logout-button" onClick={() => void navigator.clipboard.writeText(generatedCode.code)}>نسخ</button>
            <a className="logout-button" href={buildTeacherInviteMailto(generatedCode.email, generatedCode.code)}>إرسال بالبريد</a>
          </div>
          <button type="button" className="logout-button" onClick={() => setGeneratedCode(null)}>إغلاق</button>
        </div>
      )}

      <div className="pending-invites">
        <h3>أكواد بانتظار الاستخدام ({pendingInvites.length})</h3>
        <ul className="student-list">
          {pendingInvites.map((invite) => (
            <li key={invite.code} className="list-row">
              <div className="list-row-info">
                <span className="student-email">{invite.email}</span>
                <code className="student-code-badge" dir="ltr">{invite.code}</code>
              </div>
              <div className="list-row-actions">
                <button type="button" className="logout-button" onClick={() => void navigator.clipboard.writeText(invite.code)}>نسخ</button>
                <a className="logout-button" href={buildTeacherInviteMailto(invite.email, invite.code)}>إرسال</a>
                <button type="button" className="logout-button" onClick={() => void handleDeleteInvite(invite.code)}>حذف</button>
              </div>
            </li>
          ))}
          {pendingInvites.length === 0 && <li className="empty-state">لا توجد أكواد بانتظار الاستخدام.</li>}
        </ul>
      </div>
    </div>
  );
};

export default TeacherInviteManager;
