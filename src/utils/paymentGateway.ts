// Boilerplate/architecture only — NOT wired to a real Stripe account. No API keys live here or
// anywhere client-side; Stripe's secret key can only ever be used from a trusted server (a Cloud
// Function), never from this static frontend. This file exists so a future billing feature has a
// clean, typed seam to build against instead of scattering ad-hoc fetch calls later.
//
// To actually activate payments later:
//   1. Create a Stripe account and put the PUBLISHABLE key (safe client-side) in
//      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (.env.local), never the secret key.
//   2. Add a Cloud Function (functions/src/, alongside driveClient.ts/mailer.ts) that uses the
//      Stripe SECRET key (via `defineSecret`, set through `firebase functions:secrets:set`, never
//      pasted in chat/committed) to create Checkout Sessions and verify webhook signatures.
//   3. Point `createCheckoutSession` below at that Cloud Function's HTTPS URL.

export type SubscriptionPlanId = "student_premium" | "teacher_monthly_license";

export interface PaymentPlan {
  id: SubscriptionPlanId;
  name: string;
  description: string;
  priceUsd: number;
  interval: "month" | "one_time";
}

// Placeholder catalogue for the two billing models mentioned in the spec. Prices are illustrative
// only — replace once real Stripe Price IDs exist.
export const PAYMENT_PLANS: PaymentPlan[] = [
  {
    id: "student_premium",
    name: "Student Premium Unlock",
    description: "فتح ميزات إضافية لحساب الطالب (مثل تنزيلات إضافية أو محتوى موسّع).",
    priceUsd: 4.99,
    interval: "one_time",
  },
  {
    id: "teacher_monthly_license",
    name: "Teacher Monthly License",
    description: "اشتراك شهري لتفعيل صلاحيات المعلّم الكاملة على المنصة.",
    priceUsd: 19.99,
    interval: "month",
  },
];

export interface CheckoutSessionRequest {
  planId: SubscriptionPlanId;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  url: string;
}

export const isPaymentGatewayConfigured = (): boolean => Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

// Deliberately not implemented — creating a real Checkout Session requires the Stripe secret key,
// which must live only in a Cloud Function. Calling this today throws instead of silently pretending
// to charge anyone.
export const createCheckoutSession = async (
  _request: CheckoutSessionRequest,
): Promise<CheckoutSessionResult> => {
  throw new Error(
    "Payment gateway not configured yet: this requires a Cloud Function backed by a real Stripe account.",
  );
};
