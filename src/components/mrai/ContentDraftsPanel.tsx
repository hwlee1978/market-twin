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
  const score = draft.seo_score ?? null;
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
          <div className="text-sm font-semibold text-slate-900 mb-1">
            {draft.seo_title}
          </div>
        )}

        <p
          className={`text-sm text-slate-800 whitespace-pre-line leading-relaxed ${
            expanded ? "" : "line-clamp-4"
          }`}
        >
          {draft.body_text}
        </p>
        {draft.body_text.length > 200 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-[11px] text-indigo-600 hover:text-indigo-800 mt-1"
          >
            {expanded ? "접기" : "더 보기"}
          </button>
        )}

        {draft.hashtags && draft.hashtags.length > 0 && (
          <div className="mt-2 text-xs text-sky-700">
            {draft.hashtags.join(" ")}
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap gap-2 text-[11px]">
          {draft.cta_text && (
            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              <Target className="w-3 h-3" /> {draft.cta_text}
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
      </div>
    </li>
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
