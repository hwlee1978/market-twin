"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  LayoutDashboard,
  Building2,
  FolderOpen,
  PlayCircle,
  CreditCard,
  Cpu,
  Activity,
  ClipboardList,
  ShieldCheck,
  ArrowLeftCircle,
  LogOut,
} from "lucide-react";
import { clsx } from "clsx";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { createClient } from "@/lib/supabase/client";
import type { AdminRole } from "@/lib/admin";

const NAV = [
  { href: "/admin", icon: LayoutDashboard, key: "overview" as const, exact: true },
  { href: "/admin/customers", icon: Building2, key: "customers" as const },
  { href: "/admin/simulations", icon: PlayCircle, key: "simulations" as const },
  { href: "/admin/projects", icon: FolderOpen, key: "projects" as const },
  { href: "/admin/billing", icon: CreditCard, key: "billing" as const },
  { href: "/admin/models", icon: Cpu, key: "models" as const },
  { href: "/admin/health", icon: Activity, key: "health" as const },
  { href: "/admin/audit", icon: ClipboardList, key: "audit" as const },
];

export function AdminShell({
  children,
  userEmail,
  role,
}: {
  children: React.ReactNode;
  userEmail: string;
  role: AdminRole;
}) {
  const t = useTranslations("admin.nav");
  const tCommon = useTranslations("common");
  const tAdmin = useTranslations("admin");
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      <aside className="w-60 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="px-5 py-5">
          <div className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <ShieldCheck size={18} className="text-accent-400" />
            {tAdmin("title")}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
            {tAdmin(`role.${role}` as "role.super")}
          </div>
        </div>
        <nav className="flex-1 px-2 space-y-0.5">
          {NAV.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-slate-800 text-white"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100",
                )}
              >
                <item.icon size={15} />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-slate-800 space-y-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-2 text-xs text-slate-400 hover:text-slate-200"
          >
            <ArrowLeftCircle size={13} />
            {tAdmin("backToWorkspace")}
          </Link>
          <div className="px-2 text-xs text-slate-500 truncate">{userEmail}</div>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <button
              onClick={logout}
              className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
            >
              <LogOut size={13} />
              {tCommon("logout")}
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 bg-slate-50 text-slate-900">
        <div className="max-w-7xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
