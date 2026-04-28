import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { AppShell } from "@/components/AppShell";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) {
    redirect({ href: "/login", locale });
  }

  return <AppShell userEmail={ctx!.email}>{children}</AppShell>;
}
