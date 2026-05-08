import Link from "next/link";
import { Compass } from "lucide-react";

/**
 * Root 404 — falls through here when the URL doesn't match any locale
 * subtree or app route. Brand-styled so the page reads as ours
 * rather than a Next.js default. Locale-aware routes get their own
 * 404 inside the (app) tree; this one stays English to avoid
 * second-guessing which locale a stray external link expected.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-50 text-brand mb-5">
          <Compass size={28} />
        </div>
        <div className="text-[10px] uppercase tracking-wider text-brand font-semibold mb-2">
          MARKET TWIN
        </div>
        <div className="text-5xl sm:text-6xl font-bold text-slate-900 tracking-tight">404</div>
        <h1 className="mt-3 text-lg font-semibold text-slate-900">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          The link may be outdated or the page was moved. Head back to the
          start and pick up from there.
        </p>
        <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-2">
          <Link href="/" className="btn-primary">
            Go home
          </Link>
          <Link href="/ko" className="btn-ghost">
            한국어로 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
