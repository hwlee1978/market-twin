import { headers } from "next/headers";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { AppShell } from "@/components/AppShell";
import { getOrCreatePrimaryWorkspace, listMyWorkspaces } from "@/lib/workspace";
import { isMraiEnabledForHost } from "@/lib/mrai/config/enabled";

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

  const workspaces = await listMyWorkspaces();

  // Host-aware Mr.AI gate: show the Mr.AI menu only on mrai.* (or when the
  // build flag forces it on). markettwin.ai stays simulation-only.
  const host = (await headers()).get("host");
  const mraiEnabled = isMraiEnabledForHost(host);

  return (
    <AppShell
      userEmail={ctx!.email}
      workspaces={workspaces}
      mraiEnabled={mraiEnabled}
    >
      {children}
    </AppShell>
  );
}
