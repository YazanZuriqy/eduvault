"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import {
  completeStudentActivation,
  loginUser,
  registerStudentWithInvite,
  registerUser,
  requestPasswordReset,
  translateFirebaseError,
} from "@/utils/auth";
import { useAuthUser } from "@/utils/useAuthUser";
import type { UserDoc } from "@/types";

type Mode = "login" | "register" | "student-register";

const AuthPage = () => {
  const router = useRouter();
  const { firebaseUser, userDoc, isLoading } = useAuthUser();
  const [mode, setMode] = useState<Mode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activationPassword, setActivationPassword] = useState("");
  const [activationConfirmation, setActivationConfirmation] = useState("");
  const [pendingStudent, setPendingStudent] = useState<UserDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teacherInviteCode, setTeacherInviteCode] = useState("");

  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const [srCode, setSrCode] = useState("");
  const [srName, setSrName] = useState("");
  const [srEmail, setSrEmail] = useState("");
  const [srPhone, setSrPhone] = useState("");
  const [srParentEmail, setSrParentEmail] = useState("");
  const [srPassword, setSrPassword] = useState("");
  const [srConfirmPassword, setSrConfirmPassword] = useState("");

  const needsActivation = Boolean(
    pendingStudent ?? (userDoc?.role === "student" && userDoc.activationPending ? userDoc : null),
  );

  // جلسة صالحة بالفعل (مثلًا بعد ضغط زر الرجوع في المتصفح) تُوجَّه مباشرة إلى لوحتها بدل عرض نموذج
  // دخول يوحي بأن الحساب أُغلق؛ إغلاق الحساب الفعلي يبقى حصرًا عبر زر تسجيل الخروج في اللوحة نفسها.
  useEffect(() => {
    if (isLoading || !firebaseUser || !userDoc || needsActivation) return;
    router.replace(`/dashboard/${userDoc.role}`);
  }, [isLoading, firebaseUser, userDoc, needsActivation, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const resultDoc =
        mode === "login"
          ? await loginUser(email, password)
          : await registerUser({ email, password, displayName, role: "teacher", teacherInviteCode });

      if (mode === "login" && resultDoc.role === "student" && resultDoc.activationPending) {
        setPendingStudent(resultDoc);
        return;
      }
      router.push(`/dashboard/${resultDoc.role}`);
    } catch (err) {
      const message =
        err instanceof FirebaseError ? translateFirebaseError(err.code) : err instanceof Error ? err.message : "حدث خطأ غير متوقع. حاول مجددًا.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStudentRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (srPassword !== srConfirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await registerStudentWithInvite({
        code: srCode,
        email: srEmail,
        password: srPassword,
        displayName: srName,
        phone: srPhone,
        parentEmail: srParentEmail || undefined,
      });
      router.push("/dashboard/student");
    } catch (err) {
      const message =
        err instanceof FirebaseError
          ? translateFirebaseError(err.code)
          : err instanceof Error
            ? err.message
            : "تعذر إكمال التسجيل.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActivation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activationPassword !== activationConfirmation) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await completeStudentActivation(activationPassword);
      router.push("/dashboard/student");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تفعيل الحساب.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // إشعار ثنائي اللغة (عربي/إنجليزي) فور نجاح إرسال رابط إعادة التعيين، مطابقًا لطلب المهمة.
  const handleForgotPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResetMessage(null);
    setIsSendingReset(true);
    try {
      await requestPasswordReset(resetEmail);
      setResetMessage("تم إرسال رابط إعادة التعيين إلى بريدك. / Password reset link sent to your email.");
    } catch (err) {
      setResetMessage(
        err instanceof FirebaseError
          ? translateFirebaseError(err.code)
          : "تعذر إرسال رابط إعادة التعيين. / Could not send the reset link.",
      );
    } finally {
      setIsSendingReset(false);
    }
  };

  if (isLoading || (firebaseUser && userDoc && !needsActivation)) {
    return (
      <main className="auth-page">
        <div className="auth-glow" aria-hidden="true" />
        <div className="auth-card">
          <p className="auth-eyebrow">EDUVAULT ACCESS</p>
          <p className="quiz-hint">جارٍ التحقق من الجلسة...</p>
        </div>
      </main>
    );
  }

  if (needsActivation) {
    return (
      <main className="auth-page">
        <div className="auth-glow" aria-hidden="true" />
        <div className="auth-card">
          <p className="auth-eyebrow">FIRST ACCESS</p>
          <h1>تفعيل حساب الطالب</h1>
          <p className="quiz-hint">تم التحقق من رمز التفعيل وربط هذا الجهاز بالحساب. اختر الآن كلمة مرورك الخاصة.</p>
          <form className="auth-form" onSubmit={(event) => void handleActivation(event)}>
            <label className="field"><span>كلمة المرور الجديدة</span><input required type="password" minLength={6} value={activationPassword} onChange={(event) => setActivationPassword(event.target.value)} dir="ltr" /></label>
            <label className="field"><span>تأكيد كلمة المرور</span><input required type="password" minLength={6} value={activationConfirmation} onChange={(event) => setActivationConfirmation(event.target.value)} dir="ltr" /></label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? "جارٍ التفعيل..." : "تفعيل الحساب والدخول"}</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-glow" aria-hidden="true" />
      <div className="auth-card">
        <p className="auth-eyebrow">EDUVAULT ACCESS</p>
        <h1>{mode === "login" ? "تسجيل الدخول" : mode === "register" ? "تسجيل معلّم جديد" : "تسجيل حساب طالب"}</h1>

        <div className="auth-tabs" role="tablist" aria-label="نوع العملية">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "active" : ""}
            onClick={() => { setMode("login"); setError(null); }}
          >
            دخول
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "active" : ""}
            onClick={() => { setMode("register"); setError(null); }}
          >
            تسجيل معلّم
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "student-register"}
            className={mode === "student-register" ? "active" : ""}
            onClick={() => { setMode("student-register"); setError(null); }}
          >
            تسجيل طالب
          </button>
        </div>

        {mode !== "student-register" && (
          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "register" && (
              <label className="field">
                <span>الاسم الكامل</span>
                <input
                  required
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="مثال: أحمد الزريقي"
                />
              </label>
            )}

            <label className="field">
              <span>البريد الإلكتروني</span>
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                dir="ltr"
              />
            </label>

            <label className="field">
              <span>كلمة المرور</span>
              <input
                required
                type="password"
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                dir="ltr"
              />
            </label>

            {mode === "login" && (
              <button type="button" className="forgot-password-link" onClick={() => { setIsResetOpen(true); setResetEmail(email); setResetMessage(null); }}>
                نسيت كلمة المرور؟
              </button>
            )}

            {mode === "register" && (
              <label className="field">
                <span>كود دعوة المعلّم</span>
                <input
                  required
                  type="text"
                  className="code-input"
                  value={teacherInviteCode}
                  onChange={(event) => setTeacherInviteCode(event.target.value.toUpperCase())}
                  placeholder="مثال: 7K3PXQ9M"
                  dir="ltr"
                />
              </label>
            )}

            {mode === "register" && (
              <p className="quiz-hint">
                هذا التسجيل مخصص للمعلّمين فقط، ويلزم كود دعوة صادر عن مالك المنصة. حسابات الطلاب
                يبدأها المعلّم برمز من لوحته، ثم يُكمل الطالب تسجيله بنفسه من تبويب «تسجيل طالب».
              </p>
            )}

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "جارٍ المعالجة..." : mode === "login" ? "دخول" : "إنشاء الحساب"}
            </button>
          </form>
        )}

        {mode === "student-register" && (
          <form className="auth-form" onSubmit={(event) => void handleStudentRegister(event)}>
            <p className="quiz-hint">اطلب من معلّمك رمز التسجيل الخاص بك، ثم أكمل بياناتك واختر كلمة مرورك هنا.</p>

            <label className="field">
              <span>رمز التسجيل</span>
              <input
                required
                type="text"
                className="code-input"
                value={srCode}
                onChange={(event) => setSrCode(event.target.value.toUpperCase())}
                placeholder="مثال: 7K3PXQ"
                dir="ltr"
              />
            </label>
            <label className="field">
              <span>الاسم الكامل</span>
              <input required type="text" value={srName} onChange={(event) => setSrName(event.target.value)} placeholder="مثال: سارة أحمد" />
            </label>
            <label className="field">
              <span>البريد الإلكتروني (نفسه الذي سجّله المعلّم)</span>
              <input required type="email" value={srEmail} onChange={(event) => setSrEmail(event.target.value)} placeholder="student@example.com" dir="ltr" />
            </label>
            <label className="field">
              <span>رقم الهاتف</span>
              <input required type="tel" value={srPhone} onChange={(event) => setSrPhone(event.target.value)} placeholder="05xxxxxxxx" dir="ltr" />
            </label>
            <label className="field">
              <span>بريد ولي الأمر (اختياري)</span>
              <input type="email" value={srParentEmail} onChange={(event) => setSrParentEmail(event.target.value)} placeholder="parent@example.com" dir="ltr" />
            </label>
            <label className="field">
              <span>كلمة المرور الخاصة بك</span>
              <input required type="password" minLength={6} value={srPassword} onChange={(event) => setSrPassword(event.target.value)} dir="ltr" />
            </label>
            <label className="field">
              <span>تأكيد كلمة المرور</span>
              <input required type="password" minLength={6} value={srConfirmPassword} onChange={(event) => setSrConfirmPassword(event.target.value)} dir="ltr" />
            </label>

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "جارٍ إكمال التسجيل..." : "إكمال التسجيل والدخول"}
            </button>
          </form>
        )}
      </div>

      {isResetOpen && (
        <div className="quiz-modal-backdrop" role="dialog" aria-modal="true">
          <div className="quiz-modal reset-modal">
            <header className="quiz-modal-header">
              <h2>إعادة تعيين كلمة المرور</h2>
              <button type="button" className="logout-button" onClick={() => setIsResetOpen(false)}>إغلاق</button>
            </header>
            <form className="auth-form" onSubmit={(event) => void handleForgotPassword(event)}>
              <label className="field">
                <span>البريد الإلكتروني / Email</span>
                <input required type="email" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} placeholder="name@example.com" dir="ltr" />
              </label>
              {resetMessage && <p className="form-feedback">{resetMessage}</p>}
              <button className="auth-submit" type="submit" disabled={isSendingReset}>
                {isSendingReset ? "جارٍ الإرسال... / Sending..." : "إرسال رابط إعادة التعيين / Send reset link"}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};

export default AuthPage;
