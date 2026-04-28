"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
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
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";

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
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 bg-brand text-white flex flex-col">
        <div className="px-5 py-5 text-lg font-semibold tracking-tight">
          {tCommon("appName")}
        </div>
        <nav className="flex-1 px-2 space-y-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-brand-600 text-white"
                    : "text-brand-100 hover:bg-brand-600 hover:text-white",
                )}
              >
                <item.icon size={16} />
                {tNav(item.key)}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-brand-600 space-y-2">
          <div className="px-2 text-xs text-brand-100 truncate">{userEmail}</div>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <button
              onClick={logout}
              className="ml-auto inline-flex items-center gap-1.5 text-xs text-brand-100 hover:text-white"
            >
              <LogOut size={14} />
              {tCommon("logout")}
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="max-w-7xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
