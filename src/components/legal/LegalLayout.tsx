import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LogoMark } from "@/components/ui/Logo";

/**
 * Shared chrome for legal pages (privacy, terms). Top brand bar +
 * narrow reading column + footer with cross-links to the other
 * legal pages and home.
 */
export async function LegalLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations("legal");
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-slate-50/80 backdrop-blur supports-[backdrop-filter]:bg-slate-50/70 border-b border-slate-200/70">
        <div className="max-w-3xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5 text-brand">
            <LogoMark size={20} />
            <span className="text-base font-semibold tracking-tight text-slate-900">
              Market Twin
            </span>
          </Link>
          <Link href="/" className="text-sm text-slate-600 hover:text-brand">
            {t("backToHome")}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 lg:px-8 py-12 lg:py-16">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-xs text-slate-500 uppercase tracking-wider">
          {t("lastUpdated")}: {lastUpdated}
        </p>
        <div className="mt-10 prose-legal">{children}</div>
      </main>

      <footer className="border-t border-slate-200/70 bg-white">
        <div className="max-w-3xl mx-auto px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-5 text-slate-600">
            <Link href="/" className="hover:text-brand">
              {t("nav.home")}
            </Link>
            <Link href="/privacy" className="hover:text-brand">
              {t("nav.privacy")}
            </Link>
            <Link href="/terms" className="hover:text-brand">
              {t("nav.terms")}
            </Link>
          </div>
          <div className="text-xs text-slate-400">
            © {new Date().getFullYear()} Market Twin
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * Section block for legal copy. Use for each top-level numbered
 * heading (1. Information We Collect, 2. How We Use It, etc.).
 */
export function LegalSection({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
        {num}. {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm text-slate-700 leading-[1.75] text-justify">
        {children}
      </div>
    </section>
  );
}
