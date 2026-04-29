import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import {
  ArrowRight,
  BarChart3,
  Compass,
  Database,
  Globe2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { CountryChip } from "@/components/ui/CountryChip";
import { createClient } from "@/lib/supabase/server";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Logged-in users skip the marketing page and head straight to the
  // dashboard — the marketing page is only for first-touch visitors.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect({ href: "/dashboard", locale });

  const t = await getTranslations("landing");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header />

      <main>
        <Hero />
        <Stats />
        <HowItWorks />
        <Features />
        <Markets />
        <Sources />
        <FinalCta />
      </main>

      <Footer />
    </div>
  );
}

async function Header() {
  const t = await getTranslations("landing.nav");
  return (
    <header className="sticky top-0 z-30 bg-slate-50/80 backdrop-blur supports-[backdrop-filter]:bg-slate-50/70 border-b border-slate-200/70">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 text-brand"
        >
          <LogoMark size={22} />
          <span className="text-base font-semibold tracking-tight text-slate-900">
            Market Twin
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm text-slate-700">
          <a href="#solution" className="hover:text-brand transition-colors">
            {t("solution")}
          </a>
          <a href="#features" className="hover:text-brand transition-colors">
            {t("features")}
          </a>
          <a href="#markets" className="hover:text-brand transition-colors">
            {t("markets")}
          </a>
          <a href="#sources" className="hover:text-brand transition-colors">
            {t("sources")}
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-brand text-white px-4 py-2 text-sm font-semibold hover:bg-brand-600 transition-colors"
          >
            {t("login")}
          </Link>
        </div>
      </div>
    </header>
  );
}

async function Hero() {
  const t = await getTranslations("landing.hero");
  return (
    <section className="relative overflow-hidden bg-brand text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[860px] h-[860px] rounded-full bg-accent/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 pt-20 pb-24 lg:pt-28 lg:pb-32 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3.5 py-1.5 text-xs font-medium text-brand-100">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
          {t("badge")}
        </span>

        <h1 className="mt-6 text-4xl lg:text-6xl font-bold tracking-tight leading-[1.1] break-keep">
          {t("titleLine1")}
          <br />
          {t("titleLine2")}
        </h1>

        <p className="mt-7 max-w-2xl mx-auto text-base lg:text-lg text-brand-100 leading-relaxed break-keep">
          {t("subtitleLine1")}
          <br />
          {t("subtitleLine2")}
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white text-brand px-6 py-3 text-sm font-semibold hover:bg-brand-50 transition-colors min-w-[180px]"
          >
            {t("ctaPrimary")}
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/25 text-white px-6 py-3 text-sm font-semibold hover:bg-white/10 transition-colors min-w-[180px]"
          >
            {t("ctaSecondary")}
            <ArrowRight size={14} />
          </a>
        </div>
      </div>
    </section>
  );
}

async function Stats() {
  const t = await getTranslations("landing.stats");
  const items = [
    { value: "48h", label: t("analysisTime") },
    { value: "10,000", label: t("personas") },
    { value: "20", label: t("markets"), suffix: t("countries") },
    { value: "100×", label: t("costSaving") },
  ];
  return (
    <section className="border-b border-slate-200/70 bg-brand">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-10 gap-x-6 text-center text-white">
          {items.map((s) => (
            <div key={s.label}>
              <div className="text-3xl lg:text-4xl font-bold tabular-nums tracking-tight">
                {s.value}
                {s.suffix && (
                  <span className="text-xl lg:text-2xl ml-1 text-brand-100">
                    {s.suffix}
                  </span>
                )}
              </div>
              <div className="mt-2 text-xs lg:text-sm text-brand-100">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

async function HowItWorks() {
  const t = await getTranslations("landing.howItWorks");
  const steps = [
    { n: "01", icon: Compass, key: "step1" as const },
    { n: "02", icon: Sparkles, key: "step2" as const },
    { n: "03", icon: BarChart3, key: "step3" as const },
  ];
  return (
    <section id="how-it-works" className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <SectionLabel>{t("eyebrow")}</SectionLabel>
        <SectionTitle>{t("title")}</SectionTitle>
        <SectionDescription>{t("description")}</SectionDescription>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((s) => (
            <div
              key={s.key}
              className="card relative bg-white border-slate-200/70"
            >
              <div className="absolute -top-3 left-6 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-brand text-white shadow-card">
                <s.icon size={18} />
              </div>
              <div className="pt-4">
                <div className="text-[11px] font-mono font-semibold tracking-wider text-slate-400">
                  {s.n}
                </div>
                <div className="mt-2 text-base font-semibold text-slate-900">
                  {t(`${s.key}.title`)}
                </div>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed break-keep">
                  {t(`${s.key}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

async function Features() {
  const t = await getTranslations("landing.features");
  const items = [
    { icon: Sparkles, key: "personas" as const },
    { icon: Globe2, key: "countries" as const },
    { icon: ShieldCheck, key: "regulatory" as const },
    { icon: BarChart3, key: "pricing" as const },
    { icon: Users, key: "personasDrill" as const },
    { icon: Database, key: "sources" as const },
  ];
  return (
    <section id="features" className="py-20 lg:py-28 bg-white border-y border-slate-200/70">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <SectionLabel>{t("eyebrow")}</SectionLabel>
        <SectionTitle>{t("title")}</SectionTitle>
        <SectionDescription>{t("description")}</SectionDescription>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((it) => (
            <div
              key={it.key}
              className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 hover:border-brand-100 hover:bg-white transition-colors"
            >
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-brand-50 text-brand">
                <it.icon size={18} />
              </span>
              <div className="mt-4 text-base font-semibold text-slate-900">
                {t(`${it.key}.title`)}
              </div>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed break-keep">
                {t(`${it.key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

async function Markets() {
  const t = await getTranslations("landing.markets");
  const codes = [
    "KR", "JP", "CN", "TW", "US", "CA", "GB", "DE", "FR", "AE",
    "SA", "SG", "MY", "AU", "IN", "VN", "TH", "ID", "BR", "MX",
  ];
  return (
    <section id="markets" className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <SectionLabel>{t("eyebrow")}</SectionLabel>
        <SectionTitle>{t("title")}</SectionTitle>
        <SectionDescription>{t("description")}</SectionDescription>

        <div className="mt-12 flex flex-wrap justify-center gap-2">
          {codes.map((c) => (
            <CountryChip key={c} code={c} className="text-sm px-3 py-1.5" />
          ))}
        </div>
      </div>
    </section>
  );
}

async function Sources() {
  const t = await getTranslations("landing.sources");
  const items = [
    { name: "KOSIS", country: "KR" },
    { name: "BLS", country: "US" },
    { name: "e-Stat", country: "JP" },
    { name: "DGBAS", country: "TW" },
    { name: "DOSM", country: "MY" },
    { name: "GASTAT", country: "SA" },
    { name: "DOSM", country: "MY" },
    { name: "Eurostat", country: "EU" },
  ];
  return (
    <section id="sources" className="py-20 lg:py-28 bg-white border-y border-slate-200/70">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <SectionLabel>{t("eyebrow")}</SectionLabel>
        <SectionTitle>{t("title")}</SectionTitle>
        <SectionDescription>{t("description")}</SectionDescription>

        <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-w-3xl mx-auto">
          {items.map((it, i) => (
            <div
              key={`${it.name}-${i}`}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-center"
            >
              <div className="text-sm font-mono font-semibold text-brand tracking-tight">
                {it.name}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                {it.country}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

async function FinalCta() {
  const t = await getTranslations("landing.finalCta");
  return (
    <section className="py-20 lg:py-28">
      <div className="max-w-4xl mx-auto px-6 lg:px-8">
        <div className="card bg-brand text-white border-brand-700/50 text-center py-14">
          <h2 className="text-3xl lg:text-4xl font-bold tracking-tight break-keep">
            {t("title")}
          </h2>
          <p className="mt-4 max-w-xl mx-auto text-sm lg:text-base text-brand-100 leading-relaxed break-keep">
            {t("description")}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-lg bg-white text-brand px-6 py-3 text-sm font-semibold hover:bg-brand-50 transition-colors min-w-[180px]"
            >
              {t("ctaPrimary")}
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg border border-white/25 text-white px-6 py-3 text-sm font-semibold hover:bg-white/10 transition-colors min-w-[180px]"
            >
              {t("ctaSecondary")}
            </Link>
          </div>
          <p className="mt-5 text-[11px] text-brand-200">{t("reassure")}</p>
        </div>
      </div>
    </section>
  );
}

async function Footer() {
  const t = await getTranslations("landing.footer");
  return (
    <footer className="border-t border-slate-200/70 bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <div className="inline-flex items-center gap-2 text-slate-700">
          <span className="text-brand">
            <LogoMark size={16} />
          </span>
          <span className="font-semibold tracking-tight">Market Twin</span>
        </div>
        <div>{t("copyright", { year: new Date().getFullYear() })}</div>
      </div>
    </footer>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wider text-brand text-center">
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-3 text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 text-center break-keep">
      {children}
    </h2>
  );
}

function SectionDescription({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 max-w-2xl mx-auto text-sm lg:text-base text-slate-600 leading-relaxed text-center break-keep">
      {children}
    </p>
  );
}
