// Client seam for Stripe Checkout. The actual money-moving logic (secret key, webhook signature
// verification) lives only in functions/src/stripeWebhook.ts — this file just knows how to call
// those Cloud Function URLs and never touches a secret key itself.
//
// To actually go live:
//   1. Create a real Stripe account, confirm it can settle in JOD (Stripe's supported-currency and
//      supported-country list should be checked directly in the Stripe Dashboard for this specific
//      account — don't assume).
//   2. Set NEXT_PUBLIC_FUNCTIONS_BASE_URL (.env.local) to the deployed functions region+project URL.
//   3. Set the two Cloud Function secrets yourself via `firebase functions:secrets:set
//      STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` (typed directly into your own terminal — never
//      paste them in chat), then `firebase deploy --only functions`.
//   4. Register the deployed handleStripeWebhook URL as a webhook endpoint in the Stripe Dashboard.

export type SubscriptionPlanId = "student_premium" | "teacher_monthly_license";

export interface PaymentPlan {
  id: SubscriptionPlanId;
  name: string;
  description: string;
  price: number;
  currency: "JOD";
  billing: "recurring_monthly" | "one_time_annual";
}

export const PAYMENT_PLANS: PaymentPlan[] = [
  {
    id: "teacher_monthly_license",
    name: "باقة المعلّم الشهرية",
    description: "تفعيل صلاحيات المعلّم الكاملة على المنصة، بتجديد شهري تلقائي.",
    price: 10,
    currency: "JOD",
    billing: "recurring_monthly",
  },
  {
    id: "student_premium",
    name: "باقة التميّز السنوية للطالب",
    description: "دفعة واحدة تمنح الطالب سنة كاملة من الوصول المميّز، دون أي تجديد تلقائي.",
    price: 20,
    currency: "JOD",
    billing: "one_time_annual",
  },
];

export const getPaymentPlan = (planId: SubscriptionPlanId): PaymentPlan =>
  PAYMENT_PLANS.find((plan) => plan.id === planId)!;

export interface CheckoutSessionRequest {
  planId: SubscriptionPlanId;
  email: string;
  displayName: string;
  phone?: string;
  parentEmail?: string;
  gradeLevel?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  url: string;
}

const getFunctionsBaseUrl = (): string | undefined => process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL;

export const isPaymentGatewayConfigured = (): boolean => Boolean(getFunctionsBaseUrl());

// يفتح جلسة دفع Stripe حقيقية عبر الدالة السحابية createCheckoutSession، ثم يُحوَّل المستخدم إلى
// رابط الدفع المُعاد. يرمي خطأً واضحًا بدل التعليق أو التظاهر بالنجاح إن لم يكن الخادم مُهيّأ بعد.
export const createCheckoutSession = async (request: CheckoutSessionRequest): Promise<CheckoutSessionResult> => {
  const baseUrl = getFunctionsBaseUrl();
  if (!baseUrl) throw new Error("بوابة الدفع غير مُفعّلة بعد. تواصل مع الدعم.");

  const response = await fetch(`${baseUrl}/createCheckoutSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) throw new Error("تعذر بدء عملية الدفع. حاول مرة أخرى لاحقًا.");
  return (await response.json()) as CheckoutSessionResult;
};

// يطلب من Stripe وقف التجديد التلقائي المستقبلي فقط (cancel_at_period_end)، مع إبقاء الوصول ساريًا
// حتى نهاية الفترة المدفوعة الحالية.
export const requestSubscriptionCancellation = async (subscriptionId: string): Promise<void> => {
  const baseUrl = getFunctionsBaseUrl();
  if (!baseUrl) throw new Error("بوابة الدفع غير مُفعّلة بعد. تواصل مع الدعم.");

  const response = await fetch(`${baseUrl}/cancelSubscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscriptionId }),
  });

  if (!response.ok) throw new Error("تعذر إلغاء الاشتراك. حاول مرة أخرى لاحقًا.");
};
