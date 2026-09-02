"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { loginUser, registerUser, translateFirebaseError } from "@/utils/auth";

type Mode = "login" | "register";

const AuthPage = () => {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

      router.push(`/dashboard/${userDoc.role}`);
    } catch (err) {
      const message =
        err instanceof FirebaseError ? translateFirebaseError(err.code) : "حدث خطأ غير متوقع. حاول مجددًا.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

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
