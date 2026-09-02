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
    <body className={`${cairo.variable} ${spaceGrotesk.variable}`}>{children}</body>
  </html>
);

export default RootLayout;