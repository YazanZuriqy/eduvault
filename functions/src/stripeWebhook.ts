import Stripe from "stripe";
import { randomBytes } from "crypto";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";
import { sendStudentInviteEmail, sendTeacherInviteEmail } from "./mailer";

export const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
export const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

const ALLOWED_ORIGIN = "https://yazanzuriqy.github.io";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ANNUAL_MS = 365 * 24 * 60 * 60 * 1000;

const randomCode = (length: number): string =>
  Array.from(randomBytes(length), (byte) => CODE_CHARS[byte % CODE_CHARS.length]).join("");

let cachedStripe: Stripe | null = null;
const getStripe = (): Stripe => {
  if (!cachedStripe) cachedStripe = new Stripe(stripeSecretKey.value());
  return cachedStripe;
};

interface CheckoutMetadata {
  planId: "teacher_monthly_license" | "student_premium";
  email: string;
  displayName: string;
  phone?: string;
  parentEmail?: string;
  gradeLevel?: string;
}

// ينشئ جلسة دفع Stripe Checkout حقيقية؛ الواجهة الأمامية (checkout/page.tsx) تستدعي هذه الدالة ثم
// تُحوّل المستخدم إلى session.url. بيانات الطالب/المعلّم تُمرَّر عبر metadata لتتوفر لاحقًا داخل
// الويب هوك عند نجاح الدفع — لا حاجة لأي كتابة مباشرة من المتصفح إلى Firestore هنا.
export const createCheckoutSession = onRequest(
  { secrets: [stripeSecretKey], cors: [ALLOWED_ORIGIN] },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method not allowed.");
      return;
    }

    const { planId, email, displayName, phone, parentEmail, gradeLevel, successUrl, cancelUrl } = request.body ?? {};
    const isTeacherPlan = planId === "teacher_monthly_license";
    const isStudentPlan = planId === "student_premium";

    if (!isTeacherPlan && !isStudentPlan) {
      response.status(400).send("Invalid planId.");
      return;
    }
    if (!email || !displayName || !successUrl || !cancelUrl || (isStudentPlan && !phone)) {
      response.status(400).send("Missing required checkout fields.");
      return;
    }

    const metadata: CheckoutMetadata = { planId, email, displayName, phone, parentEmail, gradeLevel };

    // JOD ISO 4217 currency has 3 minor-unit decimals (1 JOD = 1000 fils), unlike most 2-decimal
    // currencies — VERIFY this against Stripe's current currency support/docs for the live account
    // before going live; if Stripe doesn't settle in JOD, charge in a supported currency instead and
    // only *display* the JOD-equivalent price for localization.
    const unitAmount = isTeacherPlan ? 10 * 1000 : 20 * 1000;

    try {
      const session = await getStripe().checkout.sessions.create({
        mode: isTeacherPlan ? "subscription" : "payment",
        customer_email: email,
        line_items: [
          {
            price_data: {
              currency: "jod",
              unit_amount: unitAmount,
              product_data: {
                name: isTeacherPlan ? "EduVault - باقة المعلّم الشهرية" : "EduVault - باقة التميّز السنوية للطالب",
              },
              ...(isTeacherPlan ? { recurring: { interval: "month" as const } } : {}),
            },
            quantity: 1,
          },
        ],
        metadata: metadata as unknown as Record<string, string>,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      response.json({ url: session.url });
    } catch (error) {
      console.error("createCheckoutSession failed", error);
      response.status(500).send("Unable to start checkout.");
    }
  },
);

const handleTeacherCheckout = async (session: Stripe.Checkout.Session, metadata: CheckoutMetadata) => {
  const code = randomCode(8);
  await getFirestore()
    .collection("teacherInvites")
    .doc(code)
    .set({
      code,
      email: metadata.email.trim().toLowerCase(),
      createdAt: Date.now(),
      used: false,
      ...(typeof session.subscription === "string" ? { stripeSubscriptionId: session.subscription } : {}),
      ...(typeof session.customer === "string" ? { stripeCustomerId: session.customer } : {}),
    });
  await sendTeacherInviteEmail(metadata.email, code);
};

const handleStudentCheckout = async (metadata: CheckoutMetadata) => {
  const code = randomCode(6);
  await getFirestore()
    .collection("studentInvites")
    .doc(code)
    .set({
      code,
      email: metadata.email.trim().toLowerCase(),
      displayName: metadata.displayName,
      phone: metadata.phone ?? "",
      createdAt: Date.now(),
      used: false,
      premiumExpiresAt: Date.now() + ANNUAL_MS,
      ...(metadata.parentEmail ? { parentEmail: metadata.parentEmail } : {}),
      ...(metadata.gradeLevel ? { gradeLevel: metadata.gradeLevel } : {}),
    });
  await sendStudentInviteEmail(metadata.email, metadata.displayName, code);
};

// نقطة الويب هوك التي يستدعيها خادم Stripe مباشرة (وليس المتصفح) عند اكتمال الدفع؛ التحقق من
// التوقيع عبر rawBody إلزامي كي لا يُقبل أي طلب مزيّف كأنه دفعة ناجحة حقيقية.
export const handleStripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (request, response) => {
    const signature = request.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
      response.status(400).send("Missing Stripe signature.");
      return;
    }

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(request.rawBody, signature, stripeWebhookSecret.value());
    } catch (error) {
      console.error("Stripe webhook signature verification failed", error);
      response.status(400).send("Invalid signature.");
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata as unknown as Partial<CheckoutMetadata> | null;

      try {
        if (metadata?.planId === "teacher_monthly_license" && metadata.email && metadata.displayName) {
          await handleTeacherCheckout(session, metadata as CheckoutMetadata);
        } else if (metadata?.planId === "student_premium" && metadata.email && metadata.displayName) {
          await handleStudentCheckout(metadata as CheckoutMetadata);
        }
      } catch (error) {
        console.error("Failed to process checkout.session.completed", error);
      }
    }

    response.json({ received: true });
  },
);

// يوقف التجديد التلقائي المستقبلي فقط (cancel_at_period_end)، مع إبقاء الوصول ساريًا حتى نهاية
// الفترة المدفوعة الحالية — امتثالًا لمعيار الإلغاء الدولي المعتاد بدل قطع الوصول فورًا.
export const cancelSubscription = onRequest(
  { secrets: [stripeSecretKey], cors: [ALLOWED_ORIGIN] },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method not allowed.");
      return;
    }

    const { subscriptionId } = request.body ?? {};
    if (!subscriptionId || typeof subscriptionId !== "string") {
      response.status(400).send("Missing subscriptionId.");
      return;
    }

    try {
      await getStripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
      response.json({ cancelled: true });
    } catch (error) {
      console.error("cancelSubscription failed", error);
      response.status(500).send("Unable to cancel subscription.");
    }
  },
);
