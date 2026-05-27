"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PenSquare,
  Radio,
  Palette,
  TrendingUp,
  Settings as SettingsIcon,
} from "lucide-react";

type TabDef = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Match prefix — when /mr-ai/content/x is active, the content tab
   *  should highlight too. */
  matchPrefix?: string;
};

/**
 * Top-tab navigation for the Mr.AI shell.
 *
 * Sub-routes:
 *   /mr-ai            → 대시보드 (briefing + KPIs + recent activity)
 *   /mr-ai/content    → 드래프트 + 캘린더 링크 + 가상 피드
 *   /mr-ai/channels   → 마케팅 채널 관리
 *   /mr-ai/brand      → 브랜드 자산 / 제품 프로필 / SEO / 크롤
 *   /mr-ai/analytics  → LLM 가시성 감사 / 추세
 *   /mr-ai/settings   → 온보딩 / 통합 / 이미지 설정 / 프리셋
 *
 * Mr.AI 채팅은 /mr-ai/chat 또는 floating button으로 별도 처리 (이후 결정).
 */
export function MrAITabs({ locale }: { locale: string }) {
  const pathname = usePathname();
  const base = `/${locale}/mr-ai`;

  const tabs: TabDef[] = [
    {
      href: base,
      label: "대시보드",
      icon: LayoutDashboard,
    },
    {
      href: `${base}/content`,
      label: "콘텐츠",
      icon: PenSquare,
      matchPrefix: `${base}/content`,
    },
    {
      href: `${base}/channels`,
      label: "채널",
      icon: Radio,
      matchPrefix: `${base}/channels`,
    },
    {
      href: `${base}/brand`,
      label: "브랜드",
      icon: Palette,
      matchPrefix: `${base}/brand`,
    },
    {
      href: `${base}/analytics`,
      label: "분석",
      icon: TrendingUp,
      matchPrefix: `${base}/analytics`,
    },
    {
      href: `${base}/settings`,
      label: "설정",
      icon: SettingsIcon,
      matchPrefix: `${base}/settings`,
    },
  ];

  const isActive = (tab: TabDef): boolean => {
    if (tab.matchPrefix) {
      return pathname === tab.matchPrefix || pathname.startsWith(`${tab.matchPrefix}/`);
    }
    // Dashboard tab — exact match only (otherwise it'd also match sub-routes)
    return pathname === tab.href;
  };

  return (
    <div className="border-b border-slate-200 bg-white sticky top-0 z-10">
      <div className="max-w-[1400px] mx-auto px-6">
        <nav className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const active = isActive(tab);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition border-b-2 -mb-px ${
                  active
                    ? "border-violet-600 text-violet-700"
                    : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
