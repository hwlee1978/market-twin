"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Plus, Trash2, Loader2, Megaphone, X as CloseX, Sparkles, ExternalLink } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";

type MarketingChannel = {
  id: string;
  platform: string;
  handle: string;
  display_name: string | null;
  market_country: string | null;
  target_segments: string[];
  posting_style: string | null;
  bio_text: string | null;
  brand_assets: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

const PLATFORM_LABELS: Record<string, { label: string; icon: string }> = {
  x_twitter: { label: "X (Twitter)", icon: "𝕏" },
  instagram: { label: "Instagram", icon: "📷" },
  tiktok: { label: "TikTok", icon: "🎵" },
  youtube: { label: "YouTube", icon: "▶️" },
  threads: { label: "Threads", icon: "@" },
  naver_blog: { label: "네이버 블로그", icon: "N" },
  naver_smartstore: { label: "네이버 스마트스토어", icon: "🛒" },
  kakao_channel: { label: "카카오 채널", icon: "💬" },
  facebook: { label: "Facebook", icon: "f" },
  linkedin: { label: "LinkedIn", icon: "in" },
  reddit: { label: "Reddit", icon: "r/" },
  other: { label: "기타", icon: "🔗" },
};

const COUNTRY_OPTIONS = [
  { code: "KR", label: "한국" },
  { code: "US", label: "미국" },
  { code: "JP", label: "일본" },
  { code: "TW", label: "대만" },
  { code: "CN", label: "중국" },
  { code: "VN", label: "베트남" },
  { code: "TH", label: "태국" },
  { code: "ID", label: "인도네시아" },
  { code: "SG", label: "싱가포르" },
  { code: "GB", label: "영국" },
  { code: "DE", label: "독일" },
  { code: "FR", label: "프랑스" },
];

export function MarketingChannelsPanel() {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? "ko";
  const [channels, setChannels] = useState<MarketingChannel[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    const res = await fetch("/api/mrai/marketing-channels", { cache: "no-store" });
    if (!res.ok) {
      setError("채널 목록을 불러올 수 없습니다");
      return;
    }
    const { channels: data } = (await res.json()) as { channels: MarketingChannel[] };
    setChannels(data);
  };

  useEffect(() => {
    void load();
  }, []);

  const autoSeed = async () => {
    setSeeding(true);
    setError(null);
    try {
      const res = await fetch("/api/mrai/marketing-channels/auto-seed", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "시드 실패");
      setChannels(json.channels as MarketingChannel[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "시드 실패");
    } finally {
      setSeeding(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("이 마케팅 채널을 삭제할까요?")) return;
    const res = await fetch(`/api/mrai/marketing-channels/${id}`, { method: "DELETE" });
    if (res.ok) {
      setChannels((prev) => prev?.filter((c) => c.id !== id) ?? null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-amber-600" />
            마케팅 채널
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            X · Instagram · TikTok · 네이버 등 콘텐츠를 발행할 가상 계정 등록. 페르소나 반응 시뮬레이션의 기반이 됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {channels !== null && channels.length === 0 && (
            <button
              type="button"
              onClick={autoSeed}
              disabled={seeding}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-xs font-medium disabled:opacity-60"
              title="X / Instagram / YouTube / 네이버 블로그 / TikTok 5개를 한 번에 생성"
            >
              {seeding ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              AI 자동 시드 (5개)
            </button>
          )}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
          >
            <Plus className="w-3.5 h-3.5" /> 채널 추가
          </button>
        </div>
      </div>
      <div className="px-5 py-4">
        {error && (
          <p className="text-xs text-red-600 mb-3">{error}</p>
        )}
        {channels === null ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : channels.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="등록된 마케팅 채널이 없어요"
            description="X · Instagram · TikTok · 네이버 블로그 등 채널을 1개 이상 등록하면 콘텐츠/시뮬레이션이 활성화됩니다."
            tone="emerald"
            action={
              <button
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md"
              >
                <Plus className="w-3 h-3" />
                채널 추가
              </button>
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {channels.map((c) => (
              <li key={c.id} className="py-3 flex items-start gap-3 group">
                <Link
                  href={`/${locale}/mr-ai/channels/${c.id}`}
                  className="flex-1 flex items-start gap-3 -mx-2 px-2 -my-1 py-1 rounded-md hover:bg-slate-50 transition min-w-0"
                >
                  <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-amber-50 text-amber-700 text-base font-bold">
                    {PLATFORM_LABELS[c.platform]?.icon ?? "🔗"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900 group-hover:underline">
                        {PLATFORM_LABELS[c.platform]?.label ?? c.platform}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        @{c.handle}
                      </span>
                      {c.market_country && (
                        <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          {c.market_country}
                        </span>
                      )}
                      {!c.enabled && (
                        <span className="text-[10px] uppercase text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          disabled
                        </span>
                      )}
                      <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-indigo-600" />
                    </div>
                    {c.display_name && (
                      <div className="text-xs text-slate-700 mt-0.5">
                        {c.display_name}
                      </div>
                    )}
                    {c.bio_text && (
                      <div className="text-xs text-slate-500 mt-1 leading-snug line-clamp-2">
                        {c.bio_text}
                      </div>
                    )}
                    {c.target_segments.length > 0 && (
                      <div className="mt-1.5 flex gap-1 flex-wrap">
                        {c.target_segments.map((s, i) => (
                          <span
                            key={i}
                            className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    {c.posting_style && (
                      <div className="text-xs text-slate-500 mt-1.5 italic line-clamp-2">
                        tone: {c.posting_style}
                      </div>
                    )}
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  className="shrink-0 text-slate-400 hover:text-red-600 p-1"
                  title="삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && (
        <CreateMarketingChannelModal
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            setChannels((prev) => [c, ...(prev ?? [])]);
          }}
        />
      )}
    </div>
  );
}

function CreateMarketingChannelModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: MarketingChannel) => void;
}) {
  const [platform, setPlatform] = useState("x_twitter");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [marketCountry, setMarketCountry] = useState("KR");
  const [targetSegments, setTargetSegments] = useState("");
  const [postingStyle, setPostingStyle] = useState("");
  const [bioText, setBioText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!handle.trim()) {
      setErr("핸들(예: lemouton_official)을 입력하세요");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/mrai/marketing-channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform,
          handle: handle.trim().replace(/^@/, ""),
          displayName: displayName.trim() || undefined,
          marketCountry: marketCountry || undefined,
          targetSegments: targetSegments
            .split(/[,\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
          postingStyle: postingStyle.trim() || undefined,
          bioText: bioText.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "생성 실패");
      }
      onCreated(json.channel as MarketingChannel);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "생성 실패");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
    >
      <div
        className="bg-white rounded-xl w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">새 마케팅 채널</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
          >
            <CloseX className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">플랫폼</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900"
            >
              {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              핸들 <span className="text-red-500">*</span>
            </label>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="lemouton_official"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              표시명
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="르무통 공식"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              타겟 시장
            </label>
            <select
              value={marketCountry}
              onChange={(e) => setMarketCountry(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900"
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              타겟 세그먼트 (콤마/줄바꿈 구분)
            </label>
            <input
              value={targetSegments}
              onChange={(e) => setTargetSegments(e.target.value)}
              placeholder="25-34세, 여성, 프리미엄 가격대 수용, K-패션 관심"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              계정 Bio
            </label>
            <textarea
              value={bioText}
              onChange={(e) => setBioText(e.target.value)}
              rows={2}
              placeholder="르무통 · K-comfort 캐시미어 · @markettwin.ai"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              포스팅 톤 / 스타일
            </label>
            <textarea
              value={postingStyle}
              onChange={(e) => setPostingStyle(e.target.value)}
              rows={2}
              placeholder="K-comfort 스토리텔링 중심, 제품 베네핏 + 일상 신 위주"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 resize-none"
            />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-sm px-3 py-1.5 rounded-md hover:bg-slate-800 disabled:opacity-60"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {busy ? "생성 중…" : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}
