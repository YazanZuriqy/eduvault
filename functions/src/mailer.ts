import nodemailer from "nodemailer";
import { defineSecret } from "firebase-functions/params";

export const gmailSenderEmail = defineSecret("GMAIL_SENDER_EMAIL");
export const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");

let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;

// Gmail SMTP + an App Password (not the main account password, generated at
// https://myaccount.google.com/apppasswords) — far lower-risk than an OAuth client secret, and easy
// for the teacher to revoke on its own without affecting Drive access.
const getTransporter = () => {
  if (cachedTransporter) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailSenderEmail.value(), pass: gmailAppPassword.value() },
  });
  return cachedTransporter;
};

export const sendStudentInviteEmail = async (to: string, studentName: string, code: string): Promise<void> => {
  await getTransporter().sendMail({
    from: gmailSenderEmail.value(),
    to,
    subject: "رمز تسجيل حسابك في EduVault",
    text: `مرحبًا ${studentName}،\n\nرمز تسجيل حسابك في منصة EduVault هو: ${code}\n\nافتح صفحة تسجيل الدخول، اختر تبويب "تسجيل طالب"، وأكمل بياناتك بهذا الرمز لإنشاء كلمة مرورك الخاصة.\n\nبالتوفيق!`,
  });
};

export const sendTeacherInviteEmail = async (to: string, code: string): Promise<void> => {
  await getTransporter().sendMail({
    from: gmailSenderEmail.value(),
    to,
    subject: "كود دعوة معلّم في EduVault",
    text: `مرحبًا،\n\nتم تفعيل اشتراكك بنجاح. كود دعوتك لتسجيل حساب معلّم في منصة EduVault هو: ${code}\n\nافتح صفحة تسجيل الدخول، اختر تبويب "تسجيل معلّم"، وأكمل التسجيل بهذا الكود.\n\nبالتوفيق!`,
  });
};
