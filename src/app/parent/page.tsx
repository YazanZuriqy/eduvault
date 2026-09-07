"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import type { SessionDoc, UserDoc } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ParentData {
  student: UserDoc;
  sessions: (SessionDoc & { id: string })[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const formatDate = (ms: number) =>
  new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));

// ─── Inner component (uses useSearchParams — must be inside Suspense) ─────────
const ParentPortalContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email") ?? "";

  const [inputEmail, setInputEmail] = useState(emailParam);
  const [data, setData] = useState<ParentData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-load when email is passed via URL
  useEffect(() => {
    if (emailParam) void handleLookup(emailParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailParam]);

  const handleLookup = async (lookupEmail: string) => {
    const normalized = lookupEmail.trim().toLowerCase();
    if (!normalized) return;
    setIsLoading(true);
    setError(null);
    setData(null);

    try {
      const db = getFirebaseDb();

      // البحث عن الطالب بعنوان البريد الإلكتروني لولي الأمر
      const studentsSnap = await getDocs(
        query(collection(db, "users"), where("parentEmail", "==", normalized), where("role", "==", "student")),
      );

      if (studentsSnap.empty) {
        setError("لم يتم العثور على طالب مرتبط بهذا البريد الإلكتروني.");
        return;
      }

      const student = studentsSnap.docs[0].data() as UserDoc;

      const sessionsSnap = await getDocs(
        query(collection(db, "sessions"), where("studentId", "==", student.uid)),
      );
      const sessions = sessionsSnap.docs
        .map((d) => ({ ...(d.data() as SessionDoc), id: d.id }))
        .sort((a, b) => a.createdAt - b.createdAt);

      setData({ student, sessions });
    } catch {
      setError("تعذر جلب بيانات الطالب. تأكد من البريد الإلكتروني وحاول مجدداً.");
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Derived stats ──────────────────────────────────────────────────────────
  const totalSessions   = data?.sessions.length ?? 0;
  const watched         = data?.sessions.filter((s) => s.watchedAt).length ?? 0;
  const passed          = data?.sessions.filter((s) => s.quizPassed).length  ?? 0;
  const progressPct     = totalSessions ? Math.round((passed / totalSessions) * 100) : 0;

  // SVG ring
  const R  = 48;
  const C  = 2 * Math.PI * R;
  const dashOffset = C - (C * progressPct) / 100;

  return (
    <main className="parent-shell">
      {/* ── Ambient glow ── */}
      <div className="parent-glow" aria-hidden="true" />

      <header className="parent-header">
        <div>
          <p className="parent-eyebrow">PARENTS PORTAL · بوابة ولي الأمر</p>
          <h1 className="parent-heading">متابعة تقدم ابنك</h1>
        </div>
        <button type="button" className="parent-back-btn" onClick={() => router.push("/auth")}>
          ← العودة
        </button>
      </header>

      {/* ── Lookup form ── */}
      <section className="parent-lookup-card">
        <p className="parent-hint">
          أدخل البريد الإلكتروني لولي الأمر المسجّل لدى المعلّم لعرض تقرير تقدّم الطالب.
        </p>
        <form
          className="parent-lookup-form"
          onSubmit={(e) => { e.preventDefault(); void handleLookup(inputEmail); }}
        >
          <input
            type="email"
            className="parent-lookup-input"
            placeholder="parent@example.com"
            dir="ltr"
            value={inputEmail}
            onChange={(e) => setInputEmail(e.target.value)}
            required
          />
          <button type="submit" className="parent-lookup-btn" disabled={isLoading}>
            {isLoading ? "جارٍ البحث..." : "عرض التقرير"}
          </button>
        </form>
        {error && <p className="parent-error">{error}</p>}
      </section>

      {/* ── Report ── */}
      {data && (
        <section className="parent-report">

          {/* Student info strip */}
          <div className="parent-student-strip">
            <div className="parent-student-avatar" aria-hidden="true">
              {data.student.displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="parent-student-name">{data.student.displayName}</h2>
              <p className="parent-student-meta">
                {data.student.gradeLevel ?? "المرحلة غير محددة"} · {data.student.email}
              </p>
            </div>
            {data.student.studentPremiumActive &&
              data.student.studentPremiumExpiresAt &&
              data.student.studentPremiumExpiresAt > Date.now() && (
                <span className="parent-premium-badge">⭐ اشتراك مميّز فعّال</span>
            )}
          </div>

          {/* KPI row */}
          <div className="parent-kpi-row">
            {/* Circular progress */}
            <div className="parent-ring-wrap">
              <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
                <circle
                  cx="60" cy="60" r={R}
                  fill="none"
                  stroke="#d4ef58"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 60 60)"
                  style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.34,1.56,0.64,1)" }}
                />
              </svg>
              <div className="parent-ring-label">
                <span className="parent-ring-pct">{progressPct}%</span>
                <span className="parent-ring-sub">إنجاز</span>
              </div>
            </div>

            {/* KPI cells */}
            <div className="parent-kpi-grid">
              <div className="parent-kpi-cell">
                <strong>{totalSessions}</strong>
                <span>إجمالي الجلسات</span>
              </div>
              <div className="parent-kpi-cell">
                <strong>{watched}</strong>
                <span>تمت مشاهدتها</span>
              </div>
              <div className="parent-kpi-cell parent-kpi-cell--accent">
                <strong>{passed}</strong>
                <span>اختبارات مجتازة</span>
              </div>
              <div className="parent-kpi-cell">
                <strong>{totalSessions - passed}</strong>
                <span>لم تُجتز بعد</span>
              </div>
            </div>
          </div>

          {/* Sessions table */}
          <div className="parent-sessions-wrap">
            <h3 className="parent-section-title">سجلّ الجلسات التفصيلي</h3>
            {data.sessions.length === 0 ? (
              <p className="parent-empty">لم يتم تعيين أي جلسات لهذا الطالب بعد.</p>
            ) : (
              <table className="parent-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>عنوان الجلسة</th>
                    <th>الوحدة / الدرس</th>
                    <th>تاريخ التكليف</th>
                    <th>المشاهدة</th>
                    <th>الاختبار</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.map((session, index) => (
                    <tr key={session.id}>
                      <td className="parent-td-num">{index + 1}</td>
                      <td className="parent-td-title">{session.videoTitle}</td>
                      <td className="parent-td-meta">
                        {[session.curriculum?.unit, session.curriculum?.lesson]
                          .filter(Boolean)
                          .join(" / ") || "—"}
                      </td>
                      <td className="parent-td-date">{formatDate(session.createdAt)}</td>
                      <td>
                        {session.watchedAt ? (
                          <span className="parent-badge parent-badge--watched">✓ شوهدت</span>
                        ) : (
                          <span className="parent-badge parent-badge--pending">لم تُشاهد</span>
                        )}
                      </td>
                      <td>
                        {session.quizPassed ? (
                          <span className="parent-badge parent-badge--pass">✓ مجتاز</span>
                        ) : (
                          <span className="parent-badge parent-badge--fail">لم يُجتز</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Disclaimer */}
          <p className="parent-disclaimer">
            هذه بوابة قراءة فقط · البيانات تُحدَّث لحظيًا من منصة EduVault ·
            للتواصل مع المعلّم يرجى مراسلته مباشرةً.
          </p>
        </section>
      )}
    </main>
  );
};

// ─── Page wrapper (Suspense required for useSearchParams in static export) ────
const ParentPortalPage = () => (
  <Suspense
    fallback={
      <main className="parent-shell">
        <p style={{ color: "#84efb8", padding: "40px" }}>جارٍ التحميل...</p>
      </main>
    }
  >
    <ParentPortalContent />
  </Suspense>
);

export default ParentPortalPage;
