import Link from "next/link";

const featureCards = [
  { number: "01", title: "جلساتك في مكان واحد", detail: "فيديوهات مخصصة ومسار تعلم واضح لكل طالب." },
  { number: "02", title: "تقدم يمكن متابعته", detail: "اختبارات قصيرة ومؤشرات إنجاز دقيقة." },
  { number: "03", title: "خصوصية محكمة", detail: "وصول آمن مصمم للمحتوى التعليمي الخاص." },
];

const Home = () => (
  <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
    <div className="pointer-events-none absolute bottom-0 left-1/2 h-[78vh] w-full max-w-3xl -translate-x-1/2 opacity-80 sm:left-auto sm:right-0 sm:h-[88vh] sm:w-1/2 sm:translate-x-0">
      <img
        src="https://raw.githubusercontent.com/YazanZuriqy/eduvault/main/1762011839721%281%29%281%29.png"
        alt=""
        className="h-full w-full object-contain object-bottom"
      />
    </div>
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-indigo-600/30 blur-[120px]"
    />
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -left-32 top-1/3 h-[28rem] w-[28rem] rounded-full bg-cyan-500/20 blur-[120px]"
    />
    <div aria-hidden="true" className="grid-noise pointer-events-none absolute inset-0" />

    <section
      aria-labelledby="site-title"
      className="relative mx-auto flex max-w-7xl flex-col px-6 pb-24 pt-8 sm:px-10 lg:px-16"
    >
      <nav aria-label="التنقل الرئيسي" className="flex items-center justify-between" dir="ltr">
        <a href="#site-title" className="text-2xl font-bold tracking-tight text-white">
          EduVault<span className="text-cyan-400">.</span>
        </a>
        <Link
          href="/auth"
          className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-6 py-2.5 text-sm font-semibold text-cyan-200 transition hover:border-cyan-300 hover:bg-cyan-400/20 hover:text-white hover:shadow-[0_0_24px_-4px_rgba(34,211,238,0.6)]"
        >
          دخول المنصة
        </Link>
      </nav>

      <div className="z-10 mt-20 max-w-3xl sm:mt-28 lg:mt-36">
        <p className="font-mono text-xs uppercase tracking-[0.35em] text-cyan-400">
          PRIVATE LEARNING PLATFORM
        </p>
        <h1
          id="site-title"
          className="mt-5 text-5xl font-black leading-[1.1] tracking-tight text-white sm:text-6xl lg:text-8xl"
        >
          تعليمٌ شخصي
          <br />
          <span className="bg-gradient-to-l from-indigo-400 via-cyan-300 to-indigo-400 bg-clip-text text-transparent">
            بمساحةٍ آمنة.
          </span>
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-loose text-slate-400">
          منصة تعليمية خاصة تجمع الجلسات، التقييم، والمتابعة في تجربة واحدة هادئة وواضحة.
        </p>

        <div className="mt-12 flex flex-wrap items-baseline gap-x-6 gap-y-2" aria-label="اسم منشئ المنصة">
          <span className="name-shimmer text-2xl font-bold text-indigo-300 sm:text-3xl">أ. يزن الزريقي</span>
          <span
            className="name-shimmer font-mono text-xs tracking-[0.2em] text-cyan-400"
            style={{ animationDelay: "1.3s" }}
          >
            T. YAZAN ZURIQY
          </span>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="mt-24 flex items-center gap-3 font-mono text-xs tracking-[0.15em] text-slate-500"
        dir="ltr"
      >
        <span className="text-base font-semibold text-slate-300">EV</span>
        <i className="block h-2 w-2 rotate-45 bg-indigo-400" />
        <small>EST. 2026</small>
      </div>
    </section>

    <section
      aria-label="مزايا المنصة"
      className="relative mx-auto grid max-w-7xl gap-6 px-6 pb-28 sm:px-10 md:grid-cols-3 lg:px-16"
    >
      {featureCards.map((feature) => (
        <article
          key={feature.number}
          className="group rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm transition hover:border-cyan-400/40 hover:bg-white/[0.08]"
        >
          <span className="font-mono text-xs tracking-[0.2em] text-indigo-400">{feature.number}</span>
          <h2 className="mt-8 text-xl font-semibold leading-relaxed text-white">{feature.title}</h2>
          <p className="mt-2 text-sm leading-loose text-slate-400">{feature.detail}</p>
        </article>
      ))}
    </section>
  </main>
);

export default Home;
