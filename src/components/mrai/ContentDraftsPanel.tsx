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
  Camera,
  RefreshCw,
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
  image_urls: Array<{ url: string; frame_index: number; size: string }> | null;
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
        image_prompt?: string | null;
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
  const [brandAssetCount, setBrandAssetCount] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/mrai/brand-assets", { cache: "no-store" });
      if (!res.ok) return;
      const { assets } = (await res.json()) as { assets: unknown[] };
      setBrandAssetCount(assets.length);
    })();
  }, []);

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
      if (!res.ok) {
        const msg = json.detail ?? json.error ?? "생성 실패";
        throw new Error(msg);
      }
      if (!Array.isArray(json.drafts) || json.drafts.length === 0) {
        throw new Error("LLM이 0개 variant를 반환했습니다. 다시 시도하세요.");
      }
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
                brandAssetCount={brandAssetCount}
                onDelete={() => remove(d.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {openModal && (
        <GenerateModal
          channelId={channelId}
          onClose={() => setOpenModal(false)}
          onSubmit={generate}
          busy={generating}
          serverError={error}
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
  brandAssetCount,
  onDelete,
}: {
  draft: Draft;
  platform: string;
  brandAssetCount: number | null;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [latestSim, setLatestSim] = useState<SimulationRow | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [sampleSize, setSampleSize] = useState(30);
  const [simError, setSimError] = useState<string | null>(null);
  const score = draft.seo_score ?? null;
  const [imageState, setImageState] = useState<{
    image_url: string | null;
    image_urls: Array<{ url: string; frame_index: number; size: string }>;
  }>({
    image_url: draft.image_url,
    image_urls: draft.image_urls ?? [],
  });
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [frameBusy, setFrameBusy] = useState<number | null>(null);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  // Local override of image_prompt so the modal can refresh it inline
  // without having to fully refetch the draft.
  const [livePrompt, setLivePrompt] = useState({
    en: draft.image_prompt ?? "",
    ko: draft.seo_meta?.translations?.ko?.image_prompt ?? "",
  });

  const generateImages = async () => {
    setGeneratingImage(true);
    setImageError(null);
    try {
      const res = await fetch(`/api/mrai/content-drafts/${draft.id}/images`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "이미지 생성 실패");
      setImageState({
        image_url: json.draft.image_url,
        image_urls: json.draft.image_urls ?? [],
      });
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "이미지 생성 실패");
    } finally {
      setGeneratingImage(false);
    }
  };

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

        {/* Image gallery (cover + carousel) */}
        {imageState.image_url ? (
          <div className="mb-3">
            <div className="grid grid-cols-2 gap-1.5">
              <FrameCell
                key={imageState.image_url}
                url={imageState.image_url}
                frameIndex={0}
                label="커버"
                spanFull
                draftId={draft.id}
                busyFrameIndex={frameBusy}
                onRemoved={(next) => setImageState(next)}
                onRegenerated={(next) => setImageState(next)}
                onBusy={setFrameBusy}
              />
              {imageState.image_urls.map((img) => (
                <FrameCell
                  key={img.url}
                  url={img.url}
                  frameIndex={img.frame_index}
                  label={`프레임 ${img.frame_index + 1}`}
                  draftId={draft.id}
                  busyFrameIndex={frameBusy}
                  onRemoved={(next) => setImageState(next)}
                  onRegenerated={(next) => setImageState(next)}
                  onBusy={setFrameBusy}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={generateImages}
              disabled={generatingImage || frameBusy !== null}
              className="mt-1.5 text-[11px] text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
              {generatingImage ? "전체 재생성 중…" : "🔄 전체 재생성"}
            </button>
          </div>
        ) : draft.image_prompt ? (
          <div className="mb-3 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs text-slate-600 flex-1 min-w-0">
                <div className="flex items-center gap-1 text-slate-500 mb-0.5">
                  <Camera className="w-3 h-3" />
                  <span className="text-[10px] uppercase tracking-wider">이미지 프롬프트</span>
                </div>
                <div className="whitespace-pre-line leading-snug">
                  {livePrompt.en || draft.image_prompt}
                </div>
                {livePrompt.ko && (
                  <div className="mt-1.5 pl-2 border-l-2 border-slate-200 text-[11px] text-slate-500 whitespace-pre-line leading-snug">
                    ↳ {livePrompt.ko}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPromptModalOpen(true)}
                disabled={generatingImage}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gradient-to-r from-violet-600 to-pink-500 text-white text-[11px] font-medium hover:from-violet-700 hover:to-pink-600 disabled:opacity-60"
              >
                {generatingImage ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Camera className="w-3 h-3" />
                )}
                {generatingImage ? "생성 중… (40-80초)" : "🖼 이미지 생성"}
              </button>
            </div>
            {/* Brand asset reference status */}
            {brandAssetCount !== null && (
              <div
                className={`mt-2 text-[10px] flex items-center gap-1 ${
                  brandAssetCount === 0 ? "text-red-700" : "text-emerald-700"
                }`}
              >
                {brandAssetCount === 0 ? (
                  <>
                    ⚠ 참조 사진 없음 — 일반 컨셉 이미지 생성됨. 실제 제품 사진을 "브랜드 자산 라이브러리"에 업로드 권장.
                  </>
                ) : (
                  <>
                    ✓ {Math.min(brandAssetCount, 4)}장의 브랜드 자산 reference 사용 (image-edit mode)
                  </>
                )}
              </div>
            )}
          </div>
        ) : null}
        {imageError && <p className="text-xs text-red-600 mb-2">{imageError}</p>}

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
          {draft.image_prompt && expanded && (
            <span className="inline-flex items-start gap-1 text-slate-600 bg-slate-50 border border-slate-200 px-1.5 py-1 rounded text-[11px] leading-snug w-full">
              <ImageIcon className="w-3 h-3 shrink-0 mt-0.5" />
              <span className="whitespace-pre-line">{draft.image_prompt}</span>
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

      {promptModalOpen && (
        <ImagePromptPreviewModal
          draftId={draft.id}
          initialEn={livePrompt.en || draft.image_prompt || ""}
          initialKo={
            livePrompt.ko ||
            draft.seo_meta?.translations?.ko?.image_prompt ||
            ""
          }
          onClose={() => setPromptModalOpen(false)}
          onUpdated={(p) => setLivePrompt(p)}
          onGenerate={async () => {
            setPromptModalOpen(false);
            await generateImages();
          }}
          busy={generatingImage}
        />
      )}
    </li>
  );
}

function ImagePromptPreviewModal({
  draftId,
  initialEn,
  initialKo,
  onClose,
  onUpdated,
  onGenerate,
  busy,
}: {
  draftId: string;
  initialEn: string;
  initialKo: string;
  onClose: () => void;
  onUpdated: (p: { en: string; ko: string }) => void;
  onGenerate: () => void | Promise<void>;
  busy: boolean;
}) {
  const [en, setEn] = useState(initialEn);
  const [ko, setKo] = useState(initialKo);
  const [refreshing, setRefreshing] = useState(false);
  const [userHint, setUserHint] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    setRefreshing(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/mrai/content-drafts/${draftId}/image-prompt/refresh`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            user_hint: userHint.trim() || undefined,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail ?? json.error ?? "새로고침 실패");
      setEn(json.image_prompt);
      setKo(json.image_prompt_ko);
      onUpdated({ en: json.image_prompt, ko: json.image_prompt_ko });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "새로고침 실패");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Camera className="w-4 h-4 text-violet-600" />
            이미지 프롬프트 미리보기
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={refreshing || busy}
            className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
          >
            <CloseX className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
              한국어 (미리보기)
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 whitespace-pre-line leading-relaxed">
              {ko || "(번역 없음 — 새로고침으로 생성)"}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
              English (실제 AI에 전달)
            </div>
            <textarea
              value={en}
              onChange={(e) => {
                setEn(e.target.value);
                onUpdated({ en: e.target.value, ko });
              }}
              rows={5}
              className="w-full text-xs border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-700 leading-relaxed resize-y font-mono"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              직접 수정 가능. 저장 별도 없음 — 아래 "생성" 누르면 이 텍스트로 이미지 생성.
            </p>
          </div>

          <div className="rounded-md border border-violet-200 bg-violet-50/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-violet-700 mb-1.5">
              🔄 다른 프롬프트로 새로고침 (선택)
            </div>
            <input
              value={userHint}
              onChange={(e) => setUserHint(e.target.value)}
              placeholder="추가 지시 (선택) — '더 어두운 톤' / '미니멀 스튜디오' / 'NYC 거리 씬'"
              disabled={refreshing || busy}
              className="w-full text-xs border border-violet-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 mb-2"
            />
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing || busy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-violet-600 text-white text-[11px] font-medium hover:bg-violet-700 disabled:opacity-60"
            >
              {refreshing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {refreshing ? "프롬프트 생성 중…" : "🔄 다른 프롬프트 생성"}
            </button>
          </div>

          {err && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1.5 rounded">
              {err}
            </p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={refreshing || busy}
            className="text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              onUpdated({ en, ko });
              void onGenerate();
            }}
            disabled={refreshing || busy || en.trim().length < 5}
            className="inline-flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-pink-500 text-white text-sm px-3 py-1.5 rounded-md hover:from-violet-700 hover:to-pink-600 disabled:opacity-60"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {busy ? "이미지 생성 중…" : "📷 이 프롬프트로 이미지 생성"}
          </button>
        </div>
      </div>
    </div>
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

type ImageState = {
  image_url: string | null;
  image_urls: Array<{ url: string; frame_index: number; size: string }>;
};

function FrameCell({
  url,
  frameIndex,
  label,
  spanFull,
  draftId,
  busyFrameIndex,
  onRemoved,
  onRegenerated,
  onBusy,
}: {
  url: string;
  frameIndex: number;
  label: string;
  spanFull?: boolean;
  draftId: string;
  busyFrameIndex: number | null;
  onRemoved: (next: ImageState) => void;
  onRegenerated: (next: ImageState) => void;
  onBusy: (idx: number | null) => void;
}) {
  const isBusy = busyFrameIndex === frameIndex;
  const anyBusy = busyFrameIndex !== null;

  const remove = async () => {
    if (!confirm(`${label}를 삭제할까요?`)) return;
    onBusy(frameIndex);
    try {
      const res = await fetch(`/api/mrai/content-drafts/${draftId}/images/frame`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ frame_index: frameIndex }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`❌ ${json.detail ?? json.error ?? "삭제 실패"}`);
        return;
      }
      onRemoved({
        image_url: json.draft.image_url,
        image_urls: json.draft.image_urls ?? [],
      });
    } finally {
      onBusy(null);
    }
  };

  const regenerate = async () => {
    const override = prompt(
      `이 프레임만 재생성. 추가 지시사항 (선택, 공란이면 원래 image_prompt만 사용):`,
      "",
    );
    if (override === null) return;
    onBusy(frameIndex);
    try {
      const res = await fetch(`/api/mrai/content-drafts/${draftId}/images/frame`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          frame_index: frameIndex,
          prompt_override: override.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`❌ ${json.detail ?? json.error ?? "재생성 실패"}`);
        return;
      }
      onRegenerated({
        image_url: json.draft.image_url,
        image_urls: json.draft.image_urls ?? [],
      });
    } finally {
      onBusy(null);
    }
  };

  return (
    <div className={`relative group ${spanFull ? "col-span-2" : ""}`}>
      <img
        src={url}
        alt={label}
        className={`w-full rounded-md border border-slate-200 object-cover ${spanFull ? "aspect-[4/3]" : "aspect-square"} ${isBusy ? "opacity-50" : ""}`}
      />
      {isBusy && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/30 rounded-md">
          <Loader2 className="w-6 h-6 animate-spin text-white" />
        </div>
      )}
      {!isBusy && (
        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <button
            type="button"
            onClick={regenerate}
            disabled={anyBusy}
            className="bg-white/95 backdrop-blur text-slate-700 hover:text-indigo-700 rounded p-1 shadow-sm"
            title="이 프레임만 재생성"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={anyBusy}
            className="bg-white/95 backdrop-blur text-slate-700 hover:text-red-700 rounded p-1 shadow-sm"
            title="삭제"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="text-[10px] text-slate-400 mt-0.5">{label}</div>
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

type TopicSuggestion = {
  topic: string;
  rationale: string;
  campaign_label: string | null;
  goal: string | null;
  tag: string;
};

const TAG_COLOR: Record<string, string> = {
  "신상품": "text-emerald-700 bg-emerald-50 border-emerald-200",
  "트렌드": "text-sky-700 bg-sky-50 border-sky-200",
  "경쟁사 대응": "text-red-700 bg-red-50 border-red-200",
  "브랜드 스토리": "text-violet-700 bg-violet-50 border-violet-200",
  "계절/시즌": "text-amber-700 bg-amber-50 border-amber-200",
  "고객 인사이트": "text-indigo-700 bg-indigo-50 border-indigo-200",
  "이벤트": "text-pink-700 bg-pink-50 border-pink-200",
};

function GenerateModal({
  channelId,
  onClose,
  onSubmit,
  busy,
  serverError,
}: {
  channelId: string;
  onClose: () => void;
  onSubmit: (p: {
    topic: string;
    campaignLabel?: string;
    goal?: string;
    variantCount: number;
  }) => void;
  busy: boolean;
  serverError: string | null;
}) {
  const [topic, setTopic] = useState("");
  const [campaignLabel, setCampaignLabel] = useState("");
  const [goal, setGoal] = useState("");
  const [variantCount, setVariantCount] = useState(3);

  // Topic suggestions
  const [suggestions, setSuggestions] = useState<TopicSuggestion[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestErr, setSuggestErr] = useState<string | null>(null);
  const [sourcesUsed, setSourcesUsed] = useState<{
    brand_memories: number;
    crawled_memories: number;
    recent_campaigns: number;
  } | null>(null);

  const fetchSuggestions = async () => {
    setSuggesting(true);
    setSuggestErr(null);
    try {
      const res = await fetch(`/api/mrai/marketing-channels/${channelId}/topic-suggestions`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail ?? json.error ?? "제안 실패");
      setSuggestions((json.suggestions as TopicSuggestion[]) ?? []);
      setSourcesUsed(json.sources_used ?? null);
    } catch (e) {
      setSuggestErr(e instanceof Error ? e.message : "제안 실패");
    } finally {
      setSuggesting(false);
    }
  };

  const pickSuggestion = (s: TopicSuggestion) => {
    setTopic(s.topic);
    if (s.campaign_label) setCampaignLabel(s.campaign_label);
    if (s.goal) setGoal(s.goal);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl"
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
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Topic suggestion section */}
          <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <div className="text-xs font-semibold text-violet-900">
                  💡 주제 제안 받기
                </div>
                <div className="text-[10px] text-violet-700">
                  워크스페이스 메모리 + 최근 14일 자동 크롤 데이터를 종합해 5개 주제 제안
                </div>
              </div>
              <button
                type="button"
                onClick={fetchSuggestions}
                disabled={suggesting || busy}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[11px] font-semibold hover:opacity-90 disabled:opacity-60"
              >
                {suggesting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {suggesting
                  ? "분석 중… (15-30초)"
                  : suggestions
                    ? "다시 제안"
                    : "AI 주제 제안"}
              </button>
            </div>
            {suggestErr && (
              <p className="text-xs text-red-600 mb-2">{suggestErr}</p>
            )}
            {sourcesUsed && (
              <p className="text-[10px] text-violet-700 mb-2">
                참고 소스: 브랜드 메모리 {sourcesUsed.brand_memories}개 · 크롤 메모리(14일) {sourcesUsed.crawled_memories}개
                {sourcesUsed.crawled_memories === 0 && (
                  <span className="text-amber-700"> ⚠ 자동 크롤 소스 미등록 — 최신 정보 부족</span>
                )}
              </p>
            )}
            {suggestions && suggestions.length > 0 && (
              <ul className="space-y-2">
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    className="rounded border border-slate-200 bg-white px-2.5 py-2 cursor-pointer hover:border-violet-400 transition"
                    onClick={() => pickSuggestion(s)}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`shrink-0 text-[9px] uppercase tracking-wider border px-1.5 py-0.5 rounded ${
                          TAG_COLOR[s.tag] ?? "text-slate-700 bg-slate-50 border-slate-200"
                        }`}
                      >
                        {s.tag}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 leading-snug">
                          {s.topic}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                          {s.rationale}
                        </div>
                        {(s.campaign_label || s.goal) && (
                          <div className="flex flex-wrap gap-1 mt-1 text-[10px]">
                            {s.campaign_label && (
                              <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                #{s.campaign_label}
                              </span>
                            )}
                            {s.goal && (
                              <span className="text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                                🎯 {s.goal}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {suggestions && suggestions.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-3">
                제안 없음 — 직접 입력 또는 메모리 추가 후 다시 시도
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              주제 <span className="text-red-500">*</span>
            </label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="예: 메이트 페블 그레이, 일주일 신은 후기 — 워싱이 다른 이유"
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
              placeholder="FW26 메이트 신상"
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
              placeholder="신상 인지도 + 사전예약 유도 / Allbirds 대비 차별점 강조 등"
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

          {/* Submit-side error — shows the most recent /drafts POST error
              from the parent so it's not hidden behind the modal overlay. */}
          {serverError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <div className="font-semibold mb-0.5">❌ 생성 실패</div>
              <div className="whitespace-pre-line">{serverError}</div>
            </div>
          )}
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
