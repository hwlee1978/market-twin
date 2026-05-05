import { setRequestLocale } from "next-intl/server";
import { TossSuccessHandler } from "@/components/billing/TossSuccessHandler";

/**
 * Landing page after Toss redirects the user back from card-entry.
 * Toss appends ?authKey=&customerKey= to the success URL we passed.
 * We hand them to the client component which POSTs to
 * /api/billing/toss/issue (server exchanges authKey → billingKey,
 * fires the first charge) and redirects the user to /billing.
 *
 * Kept as a thin server-render wrapper so we can preserve the route
 * pattern (every protected page is server-first) and so client-side
 * code can read the locale from the URL without an extra fetch.
 */
export default async function TossSuccessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TossSuccessHandler locale={locale} />;
}
