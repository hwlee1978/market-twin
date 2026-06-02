import { notFound } from "next/navigation";
import { MRAI_ENABLED } from "@/lib/mrai/config/enabled";
import { MrAITabs } from "@/components/mrai/MrAITabs";

/**
 * Mr.AI feature-gate + tab shell.
 *
 * Gate: NEXT_PUBLIC_MRAI_ENABLED controls availability. False = notFound().
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
  if (!MRAI_ENABLED) {
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
