import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { isMraiEnabledForHost } from "@/lib/mrai/config/enabled";
import { MrAITabs } from "@/components/mrai/MrAITabs";

/**
 * Mr.AI feature-gate + tab shell.
 *
 * Gate: host-aware. Available on the mrai.* subdomain (or when
 * NEXT_PUBLIC_MRAI_ENABLED forces it on); otherwise notFound(). This keeps
 * markettwin.ai (beta, simulation-only) from exposing /mr-ai while
 * mrai.markettwin.ai serves the full product from the same deployment.
 *
 * Shell: renders the top tab bar above every /mr-ai/* page. Each sub-
 * route owns its own panels (dashboard / content / channels / brand /
 * analytics / settings). Migration from the previous monolithic
 * /mr-ai/page.tsx happens commit-by-commit.
 */
export default async function MrAILayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const host = (await headers()).get("host");
  if (!isMraiEnabledForHost(host)) {
    notFound();
  }
  const { locale } = await params;
  const safeLocale: "ko" | "en" = locale === "en" ? "en" : "ko";
  return (
    <>
      <MrAITabs locale={safeLocale} />
      {children}
    </>
  );
}
