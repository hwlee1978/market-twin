"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  FileText,
  Sparkles,
  CreditCard,
  Users,
  Settings as SettingsIcon,
  HelpCircle,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { LogoMark } from "./ui/Logo";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { createClient } from "@/lib/supabase/client";
import type { WorkspaceSummary } from "@/lib/workspace";

// Static base nav. The Mr.AI link is conditionally spliced in below
// based on the `mraiEnabled` prop (host-aware, decided server-side) so the
// markettwin.ai (MarketTwin only / beta) surface doesn't show it while
// mrai.markettwin.ai does.
const NAV_BASE = [
  { href: "/dashboard", icon: LayoutDashboard, key: "dashboard" as const },
  { href: "/projects", icon: FolderOpen, key: "projects" as const },
  { href: "/reports", icon: FileText, key: "reports" as const },
  { href: "/billing", icon: CreditCard, key: "billing" as const },
  { href: "/team", icon: Users, key: "team" as const },
  { href: "/settings", icon: SettingsIcon, key: "settings" as const },
  { href: "/help", icon: HelpCircle, key: "help" as const },
  // Admin pages (LLM 사용량 · 사이트 설정 · 챌린지 데이터) now live ONLY in
  // the dedicated /admin console (AdminShell, gated by admin_users), so
  // regular/test users never see them in the workspace sidebar.
];
const MRAI_NAV_ITEM = {
  href: "/mr-ai",
  icon: Sparkles,
  key: "mrAi" as const,
};
// Insert Mr.AI after Reports (position 3) when enabled so the order is
// unchanged for the base case.
function buildNav(mraiEnabled: boolean) {
  return mraiEnabled
    ? [NAV_BASE[0], NAV_BASE[1], NAV_BASE[2], MRAI_NAV_ITEM, ...NAV_BASE.slice(3)]
    : NAV_BASE;
}

export function AppShell({
  children,
  userEmail,
  workspaces = [],
  mraiEnabled = false,
}: {
  children: React.ReactNode;
  userEmail?: string;
  workspaces?: WorkspaceSummary[];
  mraiEnabled?: boolean;
}) {
  const NAV = buildNav(mraiEnabled);
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();

  // Mobile drawer state. Sidebar is always visible on lg+ (desktop);
  // on smaller screens it slides in from the left when opened. We
  // auto-close on route change so navigating doesn't leave the drawer
  // hanging open over the new page.
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const logout = async () => {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Mobile backdrop — only renders + visible when drawer open.
          Clicking it closes the drawer. lg:hidden so desktop never
          sees it. */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={clsx(
          "w-64 shrink-0 bg-brand text-white flex flex-col",
          // Mobile: fixed overlay drawer that slides in from the left.
          "fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-out",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: in-flow, always visible.
          "lg:relative lg:translate-x-0 lg:transition-none",
        )}
      >
        <div className="px-6 pt-6 pb-5 flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 text-white">
            <LogoMark size={22} />
          </span>
          <div className="leading-tight flex-1 min-w-0">
            <div className="text-[15px] font-semibold tracking-tight">
              Market Twin
            </div>
            <div className="text-[10px] uppercase tracking-wider text-brand-200 mt-0.5">
              {tCommon("appTagline")}
            </div>
          </div>
          {/* Close button — mobile only. Lets users dismiss the drawer
              without clicking the backdrop. */}
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="lg:hidden inline-flex items-center justify-center w-8 h-8 rounded-md text-brand-100 hover:bg-brand-600/60"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {workspaces.length > 0 && <WorkspaceSwitcher workspaces={workspaces} />}

        <div className="px-3 pt-2 pb-1">
          <div className="text-[10px] uppercase tracking-wider text-brand-200 px-3 pb-2">
            {tNav("dashboard")}
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className={clsx(
                  "relative flex items-center gap-3 pl-3 pr-3 py-2 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-brand-600 text-white"
                    : "text-brand-100 hover:bg-brand-600/60 hover:text-white",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent"
                  />
                )}
                <item.icon size={16} className={active ? "text-accent" : ""} />
                <span>{tNav(item.key)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-4 pt-4 pb-5 border-t border-brand-600/60 space-y-3">
          {userEmail && (
            <div className="px-1">
              <div className="text-[10px] uppercase tracking-wider text-brand-200 mb-0.5">
                {tCommon("loggedInAs")}
              </div>
              <div className="text-xs text-white truncate" title={userEmail}>
                {userEmail}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <LocaleSwitcher />
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 text-xs text-brand-100 hover:text-white px-2 py-1.5 rounded-md hover:bg-brand-600/60 transition-colors"
            >
              <LogOut size={13} />
              {tCommon("logout")}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar — hamburger + logo. Hidden on lg+ since the
            sidebar is permanently visible there. */}
        <div className="lg:hidden sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center justify-center w-9 h-9 rounded-md text-slate-700 hover:bg-slate-100"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <LogoMark size={20} className="text-brand" />
            <span className="text-sm font-semibold text-slate-900 truncate">Market Twin</span>
          </Link>
        </div>

        <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10 space-y-6 lg:space-y-8">
          {children}
        </div>
        <footer className="border-t border-slate-200/70 bg-white/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col gap-3 text-xs text-slate-500">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                © {new Date().getFullYear()} 주식회사 미스터에이아이
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <Link href="/privacy" className="hover:text-brand">
                  {tCommon("nav.privacy")}
                </Link>
                <Link href="/terms" className="hover:text-brand">
                  {tCommon("nav.terms")}
                </Link>
                <Link href="/refund" className="hover:text-brand">
                  환불정책
                </Link>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 leading-relaxed">
              주식회사 미스터에이아이 (Mr.AI Inc.) · 대표이사 이현우 · 사업자등록번호 693-87-03907
              · 통신판매업신고 제2026-용인수지-2253호
              · 경기도 용인시 수지구 죽전로27번길 14-30, 604-803호
              · 전화 070-8057-6274
              · <a href="mailto:contact@markettwin.ai" className="hover:text-brand">contact@markettwin.ai</a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
