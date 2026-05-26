"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  Loader2,
  X as CloseX,
  Trash2,
  Hash,
  Image as ImageIcon,
  Target,
  PlayCircle,
  Heart,
  MousePointer2,
  Repeat2,
  Bookmark,
  MessageSquare,
  TrendingUp,
} from "lucide-react";

type Draft = {
  id: string;
  campaign_label: string | null;
  variant_label: string;
  parent_draft_id: string | null;
  body_text: string;
  hashtags: string[] | null;
  cta_text: string | null;
  image_prompt: string | null;
  image_url: string | null;
  source: string;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[] | null;
  seo_meta: {
    translations?: {
      ko?: {
        body_text?: string | null;
        cta_text?: string | null;
        seo_title?: string | null;
        seo_description?: string | null;
      };
    };
  } | null;
  seo_score: number | null;
  seo_notes: Record<string, { weight: number; score: number; note: string }> | null;
  seo_scored_at: string | null;
  created_at: string;
};

export function ContentDraftsPanel({
  channelId,
  platform,
}: {
  channelId: string;
  platform: string;
}) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(`/api/mrai/marketing-channels/${channelId}/drafts`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const json = (await res.json()) as { drafts: Draft[] };
    setDrafts(json.drafts);
  };

  useEffect(() => {
    void load();
  }, [channelId]);

  const generate = async (payload: {
    topic: string;
    campaignLabel?: string;
    goal?: string;
    variantCount: number;
  }) => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/mrai/marketing-channels/${channelId}/drafts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "생성 실패");
      // Prepend the new variants
      setDrafts((prev) => [...(json.drafts as Draft[]), ...(prev ?? [])]);
      setOpenModal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setGenerating(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("이 드래프트를 삭제할까요?")) return;
    const res = await fetch(`/api/mrai/content-drafts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDrafts((prev) => prev?.filter((d) => d.id !== id) ?? null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-600" />
            콘텐츠 드래프트
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            플랫폼/타겟에 맞춰 A/B/C 변형을 자동 생성. 각 변형은 별도 SEO 점수를 받습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpenModal(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-medium hover:from-violet-700 hover:to-indigo-700"
        >
          <Sparkles className="w-3.5 h-3.5" /> AI 콘텐츠 생성
        </button>
      </div>
      <div className="px-5 py-4">
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        {drafts === null ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…
          </div>
        ) : drafts.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-8">
            아직 드래프트가 없습니다. 위 "AI 콘텐츠 생성" 버튼으로 첫 캠페인을 시작하세요.
          </div>
        ) : (
          <ul className="space-y-3">
            {drafts.map((d) => (
              <DraftCard
                key={d.id}
                draft={d}
                platform={platform}
                onDelete={() => remove(d.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {openModal && (
        <GenerateModal
          onClose={() => setOpenModal(false)}
          onSubmit={generate}
          busy={generating}
        />
      )}
    </div>
  );
}

type SimulationRow = {
  id: string;
  persona_sample_size: number;
  sample_market: string | null;
  like_rate: number;
  click_rate: number;
  share_rate: number;
  save_rate: number;
  comment_rate: number;
  reaction_distribution: Record<string, number>;
  top_positive_quotes: Array<{ quote: string; quote_ko?: string | null; persona: string }>;
  top_objection_quotes: Array<{
    quote: string;
    quote_ko?: string | null;
    persona: string;
    reason: string | null;
    reason_ko?: string | null;
  }>;
  segment_breakdown: Record<string, { like_rate: number; n: number }>;
  llm_cost_usd: number | null;
  created_at: string;
};

function DraftCard({
  draft,
  platform: _platform,
  onDelete,
}: {
  draft: Draft;
  platform: string;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [latestSim, setLatestSim] = useState<SimulationRow | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [sampleSize, setSampleSize] = useState(30);
  const [simError, setSimError] = useState<string | null>(null);
  const score = draft.seo_score ?? null;

  // Load latest simulation when card mounts (lightweight — single row)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/mrai/content-drafts/${draft.id}/simulations`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const { simulations } = (await res.json()) as { simulations: SimulationRow[] };
      if (!cancelled && simulations.length > 0) setLatestSim(simulations[0]);
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.id]);

  const simulate = async () => {
    setSimulating(true);
    setSimError(null);
    try {
      const res = await fetch(`/api/mrai/content-drafts/${draft.id}/simulate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sampleSize }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "시뮬레이션 실패");
      setLatestSim(json.simulation as SimulationRow);
    } catch (e) {
      setSimError(e instanceof Error ? e.message : "시뮬레이션 실패");
    } finally {
      setSimulating(false);
    }
  };

  const scoreColor =
    score === null
      ? "text-slate-400"
      : score >= 80
        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
        : score >= 60
          ? "text-amber-700 bg-amber-50 border-amber-200"
          : "text-red-700 bg-red-50 border-red-200";

  return (
    <li className="rounded-lg border border-slate-200 hover:border-slate-300 transition">
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-violet-100 text-violet-800 text-xs font-bold">
              {draft.variant_label}
            </span>
            {draft.campaign_label && (
              <span className="text-xs font-medium text-slate-700">
                {draft.campaign_label}
              </span>
            )}
            {score !== null && (
              <span
                className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded ${scoreColor}`}
              >
                SEO {score}
              </span>
            )}
            {draft.source === "ai-drafted" && (
              <span className="text-[10px] text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">
                AI
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onDelete}
            className="shrink-0 text-slate-300 hover:text-red-600 p-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {draft.seo_title && (
          <div className="mb-1">
            <div className="text-sm font-semibold text-slate-900">{draft.seo_title}</div>
            {draft.seo_meta?.translations?.ko?.seo_title && (
              <div className="text-xs text-slate-500 mt-0.5">
                ↳ {draft.seo_meta.translations.ko.seo_title}
              </div>
            )}
          </div>
        )}

        <p
          className={`text-sm text-slate-800 whitespace-pre-line leading-relaxed ${
            expanded ? "" : "line-clamp-4"
          }`}
        >
          {draft.body_text}
        </p>
        {expanded && draft.seo_meta?.translations?.ko?.body_text && (
          <div className="mt-1.5 pl-3 border-l-2 border-slate-200 text-xs text-slate-600 whitespace-pre-line leading-relaxed">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              ↳ 한국어 번역
            </div>
            {draft.seo_meta.translations.ko.body_text}
          </div>
        )}
        {(draft.body_text.length > 200 || draft.seo_meta?.translations?.ko?.body_text) && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-[11px] text-indigo-600 hover:text-indigo-800 mt-1"
          >
            {expanded ? "접기" : "더 보기 / 한국어"}
          </button>
        )}

        {draft.hashtags && draft.hashtags.length > 0 && (
          <div className="mt-2 text-xs text-sky-700">
            {draft.hashtags.join(" ")}
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap gap-2 text-[11px]">
          {draft.cta_text && (
            <span
              className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"
              title={draft.seo_meta?.translations?.ko?.cta_text ?? undefined}
            >
              <Target className="w-3 h-3" /> {draft.cta_text}
              {draft.seo_meta?.translations?.ko?.cta_text && (
                <span className="text-amber-500 ml-1">
                  ↳ {draft.seo_meta.translations.ko.cta_text}
                </span>
              )}
            </span>
          )}
          {draft.image_prompt && (
            <span
              className="inline-flex items-center gap-1 text-slate-600 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded max-w-md truncate"
              title={draft.image_prompt}
            >
              <ImageIcon className="w-3 h-3" /> {draft.image_prompt.slice(0, 60)}
              {draft.image_prompt.length > 60 ? "…" : ""}
            </span>
          )}
          {draft.seo_keywords && draft.seo_keywords.length > 0 && (
            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
              <Hash className="w-3 h-3" /> {draft.seo_keywords.slice(0, 3).join(", ")}
            </span>
          )}
        </div>

        {expanded && draft.seo_notes && (
          <div className="mt-3 rounded-md bg-slate-50 border border-slate-100 p-2.5 text-[11px] space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
              SEO 분석
            </div>
            {Object.entries(draft.seo_notes).map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-2">
                <span className="text-slate-500 w-28 shrink-0">{k}</span>
                <span
                  className={`shrink-0 font-mono w-12 text-right ${
                    v.score >= 0.8
                      ? "text-emerald-700"
                      : v.score >= 0.5
                        ? "text-amber-700"
                        : "text-red-700"
                  }`}
                >
                  {(v.score * 100).toFixed(0)}
                </span>
                <span className="text-slate-600 truncate">{v.note}</span>
              </div>
            ))}
          </div>
        )}

        {/* Simulation row: button + last result */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={simulate}
            disabled={simulating}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 text-white text-[11px] font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            {simulating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <PlayCircle className="w-3 h-3" />
            )}
            {simulating ? "시뮬레이션 중…" : latestSim ? "재실행" : "🎯 페르소나 반응 시뮬"}
          </button>
          {!latestSim && (
            <select
              value={sampleSize}
              onChange={(e) => setSampleSize(Number(e.target.value))}
              disabled={simulating}
              className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5 bg-white"
            >
              <option value={15}>15명 (빠름 · ~$0.05)</option>
              <option value={30}>30명 (표준 · ~$0.10)</option>
              <option value={50}>50명 (정밀 · ~$0.18)</option>
              <option value={100}>100명 (대량 · ~$0.36)</option>
            </select>
          )}
          {latestSim && (
            <span className="text-[10px] text-slate-400 ml-auto">
              {latestSim.persona_sample_size}명 · {new Date(latestSim.created_at).toLocaleString("ko-KR")}
              {latestSim.llm_cost_usd ? ` · $${latestSim.llm_cost_usd.toFixed(3)}` : ""}
            </span>
          )}
        </div>

        {simError && <p className="text-xs text-red-600 mt-2">{simError}</p>}

        {latestSim && <SimulationResults sim={latestSim} expanded={expanded} />}
      </div>
    </li>
  );
}

function SimulationResults({ sim, expanded }: { sim: SimulationRow; expanded: boolean }) {
  const reactionDist = sim.reaction_distribution ?? {};
  return (
    <div className="mt-3 space-y-2.5">
      {/* Rates row */}
      <div>
        <div
          className="text-[10px] uppercase tracking-wider text-slate-500 mb-1"
          title="각 행동을 실제로 할 확률이 50% 이상인 페르소나 비율. 5개 행동이 독립적이라 합계 100% 안 됨."
        >
          📊 예상 행동률 <span className="text-slate-400 normal-case">(각 행동 독립)</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          <RateChip icon={<Heart className="w-3 h-3" />} label="like" value={sim.like_rate} positive />
          <RateChip icon={<MousePointer2 className="w-3 h-3" />} label="click" value={sim.click_rate} positive />
          <RateChip icon={<Repeat2 className="w-3 h-3" />} label="share" value={sim.share_rate} positive />
          <RateChip icon={<Bookmark className="w-3 h-3" />} label="save" value={sim.save_rate} positive />
          <RateChip icon={<MessageSquare className="w-3 h-3" />} label="comment" value={sim.comment_rate} positive />
        </div>
      </div>

      {/* Reaction distribution bar */}
      <div>
        <div
          className="text-[10px] uppercase tracking-wider text-slate-500 mb-1"
          title="페르소나가 느낀 주된 감정. 5개 중 1개만 선택하므로 합계 100%."
        >
          💭 주된 감정 반응 분포 <span className="text-slate-400 normal-case">(1인당 1개)</span>
        </div>
        <div className="flex h-2 rounded overflow-hidden bg-slate-100">
          <div className="bg-rose-500" style={{ width: `${reactionDist.love ?? 0}%` }} title={`love ${reactionDist.love ?? 0}%`} />
          <div className="bg-emerald-500" style={{ width: `${reactionDist.like ?? 0}%` }} title={`like ${reactionDist.like ?? 0}%`} />
          <div className="bg-slate-400" style={{ width: `${reactionDist.neutral ?? 0}%` }} title={`neutral ${reactionDist.neutral ?? 0}%`} />
          <div className="bg-orange-400" style={{ width: `${reactionDist.dislike ?? 0}%` }} title={`dislike ${reactionDist.dislike ?? 0}%`} />
          <div className="bg-slate-700" style={{ width: `${reactionDist.ignore ?? 0}%` }} title={`ignore ${reactionDist.ignore ?? 0}%`} />
        </div>
        <div className="flex justify-between text-[9px] text-slate-500 mt-0.5">
          <span>💖 {reactionDist.love ?? 0}%</span>
          <span>👍 {reactionDist.like ?? 0}%</span>
          <span>😐 {reactionDist.neutral ?? 0}%</span>
          <span>👎 {reactionDist.dislike ?? 0}%</span>
          <span>🚫 {reactionDist.ignore ?? 0}%</span>
        </div>
      </div>

      {expanded && (
        <>
          {/* Top positive quotes */}
          {sim.top_positive_quotes && sim.top_positive_quotes.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 mb-1">
                👍 좋아한 페르소나
              </div>
              <ul className="space-y-1.5 text-[11px]">
                {sim.top_positive_quotes.slice(0, 4).map((q, i) => (
                  <BilingualQuoteLine
                    key={i}
                    native={q.quote}
                    ko={q.quote_ko ?? null}
                    persona={q.persona}
                    tone="positive"
                  />
                ))}
              </ul>
            </div>
          )}

          {/* Top objections */}
          {sim.top_objection_quotes && sim.top_objection_quotes.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-red-700 mb-1">
                👎 거부한 페르소나
              </div>
              <ul className="space-y-1.5 text-[11px]">
                {sim.top_objection_quotes.slice(0, 4).map((q, i) => (
                  <BilingualQuoteLine
                    key={i}
                    native={q.quote}
                    ko={q.quote_ko ?? null}
                    persona={q.persona}
                    reason={q.reason ?? null}
                    reasonKo={q.reason_ko ?? null}
                    tone="negative"
                  />
                ))}
              </ul>
            </div>
          )}

          {/* Segment breakdown */}
          {sim.segment_breakdown && Object.keys(sim.segment_breakdown).length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                <TrendingUp className="w-3 h-3 inline" /> 세그먼트별 호감도
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                {Object.entries(sim.segment_breakdown).map(([k, v]) => (
                  <div key={k} className="rounded bg-slate-50 px-2 py-1 text-[11px] flex justify-between">
                    <span className="text-slate-600">{k}</span>
                    <span className="font-mono text-slate-900">
                      {v.like_rate.toFixed(0)}% <span className="text-slate-400">(n={v.n})</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BilingualQuoteLine({
  native,
  ko,
  persona,
  reason,
  reasonKo,
  tone,
}: {
  native: string;
  ko: string | null;
  persona: string;
  reason?: string | null;
  reasonKo?: string | null;
  tone: "positive" | "negative";
}) {
  const bg =
    tone === "positive"
      ? "bg-emerald-50/50 border-emerald-100"
      : "bg-red-50/50 border-red-100";
  const reasonColor = tone === "positive" ? "text-emerald-700" : "text-red-700";

  // If translation is identical to native (e.g. Korean persona) or missing, render single line.
  const showKo = ko && ko.trim().length > 0 && ko.trim() !== native.trim();
  const reasonShowKo =
    reason && reasonKo && reasonKo.trim().length > 0 && reasonKo.trim() !== reason.trim();

  return (
    <li className={`rounded ${bg} border px-2 py-1.5`}>
      <div className="text-slate-800 italic leading-snug">"{native}"</div>
      {showKo && (
        <div className="text-slate-500 text-[10.5px] leading-snug mt-0.5">
          ↳ {ko}
        </div>
      )}
      {reason && (
        <div className={`${reasonColor} text-[10px] mt-0.5`}>
          [{reason}
          {reasonShowKo ? ` / ${reasonKo}` : ""}]
        </div>
      )}
      <div className="text-[10px] text-slate-500 mt-0.5">— {persona}</div>
    </li>
  );
}

function RateChip({
  icon,
  label,
  value,
  positive,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  positive?: boolean;
}) {
  const tone =
    value >= 30
      ? positive
        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
        : "text-red-700 bg-red-50 border-red-200"
      : value >= 10
        ? "text-amber-700 bg-amber-50 border-amber-200"
        : "text-slate-500 bg-slate-50 border-slate-200";
  return (
    <div className={`rounded border ${tone} px-1.5 py-1 text-center`}>
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider">
        {icon} {label}
      </div>
      <div className="font-bold text-sm">{value.toFixed(0)}%</div>
    </div>
  );
}

function GenerateModal({
  onClose,
  onSubmit,
  busy,
}: {
  onClose: () => void;
  onSubmit: (p: {
    topic: string;
    campaignLabel?: string;
    goal?: string;
    variantCount: number;
  }) => void;
  busy: boolean;
}) {
  const [topic, setTopic] = useState("");
  const [campaignLabel, setCampaignLabel] = useState("");
  const [goal, setGoal] = useState("");
  const [variantCount, setVariantCount] = useState(3);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">AI 콘텐츠 생성</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
          >
            <CloseX className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              주제 <span className="text-red-500">*</span>
            </label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="예: 가을 FW26 캐시미어 컬렉션 런칭"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              캠페인 라벨 (선택)
            </label>
            <input
              value={campaignLabel}
              onChange={(e) => setCampaignLabel(e.target.value)}
              placeholder="FW26 런칭"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              목표/메시지 (선택)
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={2}
              placeholder="신규 컬렉션 인지도 + 사전예약 유도"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              변형 개수
            </label>
            <div className="flex gap-2">
              {[2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setVariantCount(n)}
                  className={`text-xs px-3 py-1.5 rounded-md border ${
                    variantCount === n
                      ? "border-violet-500 bg-violet-50 text-violet-800 font-semibold"
                      : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              A=직접형 · B=스토리형 · C=역발상 · D=데이터형 · E=감각형
            </p>
          </div>
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
            disabled={busy || topic.trim().length < 3}
            onClick={() =>
              onSubmit({
                topic: topic.trim(),
                campaignLabel: campaignLabel.trim() || undefined,
                goal: goal.trim() || undefined,
                variantCount,
              })
            }
            className="inline-flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm px-3 py-1.5 rounded-md hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {busy ? "생성 중… (10-30초)" : `${variantCount}개 변형 생성`}
          </button>
        </div>
      </div>
    </div>
  );
}
