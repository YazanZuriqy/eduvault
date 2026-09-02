"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { completeStudentActivation, loginUser, registerUser, translateFirebaseError } from "@/utils/auth";
import type { UserDoc } from "@/types";

type Mode = "login" | "register";

const AuthPage = () => {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activationPassword, setActivationPassword] = useState("");
  const [activationConfirmation, setActivationConfirmation] = useState("");
  const [pendingStudent, setPendingStudent] = useState<UserDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const userDoc =
        mode === "login"
          ? await loginUser(email, password)
          : await registerUser({ email, password, displayName, role: "teacher" });

      if (mode === "login" && userDoc.role === "student" && userDoc.activationPending) {
        setPendingStudent(userDoc);
        return;
      }
      router.push(`/dashboard/${userDoc.role}`);
    } catch (err) {
      const message =
        err instanceof FirebaseError ? translateFirebaseError(err.code) : err instanceof Error ? err.message : "حدث خطأ غير متوقع. حاول مجددًا.";
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

  if (pendingStudent) {
    return (
      <main className="auth-page">
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
      <div className="auth-card">
        <p className="auth-eyebrow">EDUVAULT ACCESS</p>
        <h1>{mode === "login" ? "تسجيل الدخول" : "تسجيل معلّم جديد"}</h1>

        <div className="auth-tabs" role="tablist" aria-label="نوع العملية">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            دخول
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            تسجيل جديد
          </button>
        </div>

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

          {mode === "register" && (
            <p className="quiz-hint">
              هذا التسجيل مخصص للمعلّمين فقط. حسابات الطلاب يُنشئها المعلّم من لوحته الخاصة مع كلمة
              مرور جاهزة، ولا يوجد تسجيل ذاتي للطلاب.
            </p>
          )}

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "جارٍ المعالجة..." : mode === "login" ? "دخول" : "إنشاء الحساب"}
          </button>
        </form>
      </div>
    </main>
  );
};

export default AuthPage;
