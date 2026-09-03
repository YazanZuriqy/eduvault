"use client";

import { type FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuthUser } from "@/utils/useAuthUser";
import {
  createCheckoutSession,
  getPaymentPlan,
  requestSubscriptionCancellation,
  type SubscriptionPlanId,
} from "@/utils/paymentGateway";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/eduvault";

const CheckoutContent = () => {
  const { userDoc } = useAuthUser();
  const searchParams = useSearchParams();
  const status = searchParams.get("status");

  const [teacherEmail, setTeacherEmail] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [studentPhone, setStudentPhone] = useState("");
  const [studentParentEmail, setStudentParentEmail] = useState("");
  const [studentGrade, setStudentGrade] = useState("");
  const [isRedirecting, setIsRedirecting] = useState<SubscriptionPlanId | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const buildUrls = () => {
    const origin = `${window.location.origin}${basePath}/checkout`;
    return { successUrl: `${origin}?status=success`, cancelUrl: `${origin}?status=cancelled` };
  };

  const handleTeacherCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setIsRedirecting("teacher_monthly_license");
    try {
      const { successUrl, cancelUrl } = buildUrls();
      const { url } = await createCheckoutSession({
        planId: "teacher_monthly_license",
        email: teacherEmail,
        displayName: teacherEmail,
        successUrl,
        cancelUrl,
      });
      window.location.href = url;
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "تعذر بدء عملية الدفع.");
      setIsRedirecting(null);
    }
  };

  const handleStudentCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setIsRedirecting("student_premium");
    try {
      const { successUrl, cancelUrl } = buildUrls();
      const { url } = await createCheckoutSession({
        planId: "student_premium",
        email: studentEmail,
        displayName: studentName,
        phone: studentPhone,
        parentEmail: studentParentEmail || undefined,
        gradeLevel: studentGrade || undefined,
        successUrl,
        cancelUrl,
      });
      window.location.href = url;
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "تعذر بدء عملية الدفع.");
      setIsRedirecting(null);
    }
  };

  const handleCancel = async () => {
    if (!userDoc?.stripeSubscriptionId) return;
    if (!window.confirm("سيتوقف التجديد التلقائي القادم، مع بقاء وصولك ساريًا حتى نهاية الفترة الحالية. متابعة؟")) return;

    setFeedback(null);
    setIsCancelling(true);
    try {
      await requestSubscriptionCancellation(userDoc.stripeSubscriptionId);
      setFeedback("تم إلغاء التجديد التلقائي بنجاح. سيبقى وصولك فعّالًا حتى نهاية الفترة المدفوعة الحالية.");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "تعذر إلغاء الاشتراك.");
    } finally {
      setIsCancelling(false);
    }
  };

  const teacherPlan = getPaymentPlan("teacher_monthly_license");
  const studentPlan = getPaymentPlan("student_premium");

  return (
    <main className="checkout-page">
      <div className="auth-glow" aria-hidden="true" />
      <div className="checkout-inner">
        <header className="checkout-header">
          <p className="auth-eyebrow">EDUVAULT PREMIUM</p>
          <h1>باقات الاشتراك</h1>
          <p className="quiz-hint">اختر الباقة المناسبة لك — دفع آمن عبر Stripe.</p>
        </header>

        {status === "success" && (
          <p className="form-feedback checkout-feedback">تم الدفع بنجاح! تحقق من بريدك الإلكتروني خلال دقائق لتصلك تفاصيل إكمال تسجيل حسابك.</p>
        )}
        {status === "cancelled" && <p className="auth-error checkout-feedback">تم إلغاء عملية الدفع، لم يُخصم أي مبلغ.</p>}
        {feedback && <p className="form-feedback checkout-feedback">{feedback}</p>}

        <div className="pricing-grid">
          <article className="pricing-card">
            <p className="pricing-badge">{teacherPlan.price} {teacherPlan.currency} / شهريًا</p>
            <h2>{teacherPlan.name}</h2>
            <p className="quiz-hint">{teacherPlan.description}</p>
            <form className="auth-form" onSubmit={(event) => void handleTeacherCheckout(event)}>
              <label className="field">
                <span>البريد الإلكتروني</span>
                <input required type="email" value={teacherEmail} onChange={(event) => setTeacherEmail(event.target.value)} dir="ltr" placeholder="teacher@example.com" />
              </label>
              <button className="primary-button" type="submit" disabled={isRedirecting === "teacher_monthly_license"}>
                {isRedirecting === "teacher_monthly_license" ? "جارٍ التحويل..." : "اشترك الآن"}
              </button>
            </form>

            {userDoc?.role === "teacher" && userDoc.stripeSubscriptionId && (
              <button type="button" className="logout-button cancel-subscription-button" onClick={() => void handleCancel()} disabled={isCancelling}>
                {isCancelling ? "جارٍ الإلغاء..." : "إلغاء الاشتراك التلقائي"}
              </button>
            )}
          </article>

          <article className="pricing-card">
            <p className="pricing-badge">{studentPlan.price} {studentPlan.currency} / سنويًا</p>
            <h2>{studentPlan.name}</h2>
            <p className="quiz-hint">{studentPlan.description}</p>
            <form className="auth-form" onSubmit={(event) => void handleStudentCheckout(event)}>
              <label className="field">
                <span>اسم الطالب</span>
                <input required type="text" value={studentName} onChange={(event) => setStudentName(event.target.value)} />
              </label>
              <label className="field">
                <span>البريد الإلكتروني</span>
                <input required type="email" value={studentEmail} onChange={(event) => setStudentEmail(event.target.value)} dir="ltr" placeholder="student@example.com" />
              </label>
              <label className="field">
                <span>رقم الهاتف</span>
                <input required type="tel" value={studentPhone} onChange={(event) => setStudentPhone(event.target.value)} dir="ltr" placeholder="05xxxxxxxx" />
              </label>
              <label className="field">
                <span>بريد ولي الأمر (اختياري)</span>
                <input type="email" value={studentParentEmail} onChange={(event) => setStudentParentEmail(event.target.value)} dir="ltr" placeholder="parent@example.com" />
              </label>
              <label className="field">
                <span>المرحلة الدراسية (اختياري)</span>
                <input type="text" value={studentGrade} onChange={(event) => setStudentGrade(event.target.value)} placeholder="مثال: الصف العاشر" />
              </label>
              <button className="primary-button" type="submit" disabled={isRedirecting === "student_premium"}>
                {isRedirecting === "student_premium" ? "جارٍ التحويل..." : "اشترك الآن"}
              </button>
            </form>
          </article>
        </div>

        <Link href="/" className="checkout-back-link">العودة إلى الصفحة الرئيسية</Link>
      </div>
    </main>
  );
};

const CheckoutPage = () => (
  <Suspense fallback={<main className="checkout-page" />}>
    <CheckoutContent />
  </Suspense>
);

export default CheckoutPage;
