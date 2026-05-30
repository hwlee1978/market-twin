import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { setRequestLocale } from "next-intl/server";
import { Building2, FileText, Layers, BookOpen, Users, ExternalLink } from "lucide-react";

/**
 * 챌린지 전용 레이아웃 — Mr.AI 사이드바·워크스페이스 셀렉터·챗 모두
 * 제외. 정부 사업 (2026 AI+ OpenData, 과제번호 20457281) 응모/심사용
 * 독립 페이지.
 *
 * 디자인 톤: 정부 표준 청색·회색 (Mr.AI 보라색과 분리). Pretendard 폰트.
 * 헤더 + 탑 navigation + 푸터.
 */
export default async function ChallengeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const nav: Array<{ href: string; label: string; icon: typeof Building2 }> = [
    { href: "/sme-strategy", label: "시스템 개요", icon: Layers },
    { href: "/sme-strategy/recommend", label: "Task 1 · 적합 판로 추천", icon: Building2 },
    { href: "/sme-strategy/content", label: "Task 2 · 마케팅 콘텐츠", icon: FileText },
    { href: "/sme-strategy/api", label: "API 문서", icon: BookOpen },
    { href: "/sme-strategy/about", label: "팀·아키텍처", icon: Users },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center gap-4">
          <Link href="/sme-strategy" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center text-white font-bold text-sm">
              SME
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 leading-tight">
                시장진출 전략 추천 시스템
              </div>
              <div className="text-[10px] text-slate-500 leading-tight">
                중소벤처기업진흥공단 · 한국중소벤처기업유통원 ·{" "}
                <span className="text-slate-700 font-medium">2026 AI+ OpenData 챌린지</span>
              </div>
            </div>
          </Link>
          <div className="flex-1" />
          <a
            href="https://markettwin.ai"
            target="_blank"
            rel="noopener"
            className="text-[11px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
          >
            제작: ㈜미스터에이아이 <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <nav className="border-t border-slate-100">
          <div className="max-w-[1400px] mx-auto px-6 flex gap-1 overflow-x-auto">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300 transition-colors"
              >
                <n.icon className="w-3.5 h-3.5" />
                {n.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-slate-900 text-slate-400 mt-12">
        <div className="max-w-[1400px] mx-auto px-6 py-6 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-slate-300">㈜미스터에이아이 (Mr.AI Inc.)</span>
            <span>· 대표이사 이현우</span>
            <span>· 사업자등록번호 693-87-03907</span>
            <span>· 통신판매업신고 제2026-용인수지-2253호</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>경기도 용인시 수지구 죽전로27번길 14-30, 604-803호</span>
            <span>·</span>
            <a href="mailto:contact@markettwin.ai" className="hover:text-white">
              contact@markettwin.ai
            </a>
            <span>·</span>
            <a href="https://markettwin.ai/privacy.html" target="_blank" rel="noopener" className="hover:text-white">
              개인정보처리방침
            </a>
            <a href="https://markettwin.ai/terms.html" target="_blank" rel="noopener" className="hover:text-white">
              이용약관
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
