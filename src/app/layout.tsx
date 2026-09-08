import type { Metadata } from "next";
import { Cairo, Space_Grotesk } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "EduVault | Private Learning",
  description: "Secure, personalized learning sessions.",
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <html lang="ar" dir="rtl">
    <head>
      {/* 👇 ضع السطر الأمني هنا بالتحديد لمنع حظر المتصفح لصور درايف وحسابات جوجل */}
      <meta 
        httpEquiv="Content-Security-Policy"
        content="default-src * 'unsafe-inline' 'unsafe-eval'; img-src * data: blob: https://google.com https://*.google.com; frame-src * https://google.com https://google.com;" 
        />
      </head>
    <body className={`${cairo.variable} ${spaceGrotesk.variable}`}>{children}</body>
  </html>
);

export default RootLayout;
