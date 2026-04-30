"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  FileText,
  CreditCard,
  Users,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";
import { clsx } from "clsx";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { LogoMark } from "./ui/Logo";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/dashboard", icon: LayoutDashboard, key: "dashboard" as const },
  { href: "/projects", icon: FolderOpen, key: "projects" as const },
  { href: "/reports", icon: FileText, key: "reports" as const },
  { href: "/billing", icon: CreditCard, key: "billing" as const },
  { href: "/team", icon: Users, key: "team" as const },
  { href: "/settings", icon: SettingsIcon, key: "settings" as const },
];

export function AppShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail?: string;
}) {
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-64 shrink-0 bg-brand text-white flex flex-col">
        <div className="px-6 pt-6 pb-5 flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 text-white">
            <LogoMark size={22} />
          </span>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">
              Market Twin
            </div>
            <div className="text-[10px] uppercase tracking-wider text-brand-200 mt-0.5">
              {tCommon("appTagline")}
            </div>
          </div>
        </div>

        <div className="px-3 pt-2 pb-1">
          <div className="text-[10px] uppercase tracking-wider text-brand-200 px-3 pb-2">
            {tNav("dashboard")}
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-0.5">
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
        <div className="flex-1 max-w-7xl w-full mx-auto px-8 py-10 space-y-8">
          {children}
        </div>
        <footer className="border-t border-slate-200/70 bg-white/60">
          <div className="max-w-7xl mx-auto px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div>
              © {new Date().getFullYear()} Market Twin
            </div>
            <div className="flex items-center gap-4">
              <Link href="/privacy" className="hover:text-brand">
                {tCommon("nav.privacy")}
              </Link>
              <Link href="/terms" className="hover:text-brand">
                {tCommon("nav.terms")}
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
