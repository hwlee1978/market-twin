"use client";

import { useState } from "react";
import { Globe, Check, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { clsx } from "clsx";

export type RecommendedChannelItem = {
  id: string;
  countryCode: string;
  channelType: string;
  channelName: string;
  rationale: string;
  priority: number;
  metadata: Record<string, unknown>;
  selected?: boolean;
};

const CHANNEL_LABEL: Record<string, { icon: string; label: string }> = {
  reddit: { icon: "🟠", label: "Reddit" },
  instagram: { icon: "📷", label: "Instagram" },
  tiktok: { icon: "🎵", label: "TikTok" },
  twitter: { icon: "✕", label: "X (Twitter)" },
  youtube: { icon: "▶", label: "YouTube" },
  linkedin: { icon: "💼", label: "LinkedIn" },
  facebook: { icon: "👥", label: "Facebook" },
  naver_blog: { icon: "🟢", label: "네이버 블로그" },
  naver_cafe: { icon: "🟢", label: "네이버 카페" },
  kakao_channel: { icon: "💛", label: "카카오 채널" },
  note: { icon: "📝", label: "Note (JP)" },
  ameba_blog: { icon: "📔", label: "Ameba (JP)" },
  weibo: { icon: "🟡", label: "Weibo (CN)" },
  xiaohongshu: { icon: "🔴", label: "샤오훙슈 (CN)" },
  wirecutter: { icon: "📰", label: "Wirecutter" },
  press_release: { icon: "📢", label: "보도자료" },
  newsletter: { icon: "✉", label: "Newsletter" },
  other: { icon: "🔗", label: "기타" },
};

const COUNTRY_FLAG: Record<string, string> = {
  US: "🇺🇸", JP: "🇯🇵", KR: "🇰🇷", TW: "🇹🇼", CN: "🇨🇳", SG: "🇸🇬",
  VN: "🇻🇳", TH: "🇹🇭", ID: "🇮🇩", MY: "🇲🇾", PH: "🇵🇭",
};

export function ChannelRecommendationCard({
  initial,
  countries,
}: {
  initial: RecommendedChannelItem[];
  countries: string[];
}) {
  const [items, setItems] = useState<RecommendedChannelItem[]>(initial);
  const [expanded, setExpanded] = useState(true);

  const toggle = async (id: string, next: boolean) => {
    // Optimistic update
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, selected: next } : p)));
    try {
      const res = await fetch(`/api/mrai/channel-recommendations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selected: next }),
      });
      if (!res.ok) throw new Error("toggle_failed");
    } catch {
      // Rollback
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, selected: !next } : p)));
    }
  };

  const byCountry: Record<string, RecommendedChannelItem[]> = {};
  for (const it of items) {
    (byCountry[it.countryCode] ??= []).push(it);
  }

  const selectedCount = items.filter((i) => i.selected).length;

  return (
    <section className="rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50/40 to-fuchsia-50/40 p-4 mt-2">
      <header className="flex items-start gap-3 mb-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-violet-600 text-white shrink-0">
          <Globe size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-violet-900">
            마케팅 채널 추천 ({countries.join(", ")})
          </h3>
          <p className="text-xs text-violet-700 mt-0.5 leading-relaxed">
            {items.length}개 채널 추천 · {selectedCount}개 활성화됨. 활성화한 채널은 다음 단계 (콘텐츠 자동 생성)에 연결됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-violet-600 hover:text-violet-900 p-1"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </header>

      {expanded && (
        <div className="space-y-3">
          {countries.map((c) => {
            const list = byCountry[c] ?? [];
            if (list.length === 0) return null;
            return (
              <div key={c} className="bg-white rounded-lg border border-violet-100 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">{COUNTRY_FLAG[c] ?? "🏳"}</span>
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    {c}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {list.length}개 · {list.filter((i) => i.selected).length}개 활성
                  </span>
                </div>
                <div className="space-y-1.5">
                  {list.map((it) => {
                    const meta = CHANNEL_LABEL[it.channelType] ?? CHANNEL_LABEL.other;
                    const url = typeof it.metadata?.url === "string" ? it.metadata.url : undefined;
                    return (
                      <div
                        key={it.id}
                        className={clsx(
                          "flex items-start gap-2 px-2.5 py-2 rounded-md border transition-colors",
                          it.selected
                            ? "border-violet-400 bg-violet-50"
                            : "border-slate-200 bg-white hover:bg-slate-50",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggle(it.id, !it.selected)}
                          className={clsx(
                            "shrink-0 w-5 h-5 rounded border-2 inline-flex items-center justify-center mt-0.5 transition-colors",
                            it.selected
                              ? "bg-violet-600 border-violet-600 text-white"
                              : "border-slate-300 hover:border-violet-400 bg-white",
                          )}
                          aria-label={it.selected ? "deselect" : "select"}
                        >
                          {it.selected && <Check size={12} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{meta.icon}</span>
                            <span className="text-xs font-semibold text-slate-700">{meta.label}</span>
                            <span className="text-xs text-slate-900 font-medium truncate">{it.channelName}</span>
                            {url && (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-violet-500 hover:text-violet-700 shrink-0"
                                aria-label="open"
                              >
                                <ExternalLink size={10} />
                              </a>
                            )}
                            <span className="ml-auto text-[10px] font-mono text-slate-400 shrink-0">
                              priority {it.priority}
                            </span>
                          </div>
                          {it.rationale && (
                            <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                              {it.rationale}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
