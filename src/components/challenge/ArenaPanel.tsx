"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Swords,
  Trophy,
  AlertTriangle,
  RotateCw,
  Check,
} from "lucide-react";

type ContentType =
  | "market_analysis"
  | "spec_ko"
  | "spec_en"
  | "spec_ja"
  | "spec_zh_tw"
  | "spec_zh_cn"
  | "detail_page"
  | "generic";

const CONTENT_TYPE_OPTS: Array<{ value: ContentType; label: string }> = [
  { value: "market_analysis", label: "시장분석 리포트" },
  { value: "spec_ko", label: "한국어 상품 카피" },
  { value: "spec_en", label: "영어 상품 카피" },
  { value: "spec_ja", label: "일본어 상품 카피" },
  { value: "spec_zh_tw", label: "繁體中文 상품 카피" },
  { value: "spec_zh_cn", label: "简体中文 상품 카피" },
  { value: "detail_page", label: "상품 상세페이지" },
  { value: "generic", label: "자유 prompt" },
];

const MODEL_LABELS: Record<string, { name: string; tone: string }> = {
  anthropic: { name: "Anthropic Claude", tone: "bg-orange-100 text-orange-800 border-orange-200" },
  openai: { name: "OpenAI GPT", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  gemini: { name: "Google Gemini", tone: "bg-blue-100 text-blue-800 border-blue-200" },
  deepseek: { name: "DeepSeek", tone: "bg-violet-100 text-violet-800 border-violet-200" },
};

type BattleState =
  | { stage: "idle" }
  | { stage: "loading" }
  | {
      stage: "vote";
      battleId: string;
      output_a: string;
      output_b: string;
      meta: { ms: number; cost_usd: number };
    }
  | {
      stage: "revealed";
      battleId: string;
      output_a: string;
      output_b: string;
      winner: "A" | "B" | "tie";
      models: { a: string; b: string };
    };

type LeaderRow = {
  model: string;
  appearances: number;
  wins: number;
  ties: number;
  losses: number;
  win_rate: number;
};

export function ArenaPanel() {
  const [contentType, setContentType] = useState<ContentType>("market_analysis");
  const [prompt, setPrompt] = useState("");
  const [battle, setBattle] = useState<BattleState>({ stage: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[] | null>(null);

  const loadLeaderboard = useCallback(async () => {
    const res = await fetch("/api/challenge/arena/leaderboard", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { leaderboard: LeaderRow[] };
    setLeaderboard(json.leaderboard);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLeaderboard(); // fetch-on-mount: setState inside async callback is intentional
  }, [loadLeaderboard]);

  const start = async () => {
    if (!prompt.trim() || prompt.trim().length < 5) {
      setError("prompt를 5자 이상 입력하세요");
      return;
    }
    setBattle({ stage: "loading" });
    setError(null);
    try {
      const res = await fetch("/api/challenge/arena/battle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), content_type: contentType }),
      });
      if (!res.ok) throw new Error("battle 생성 실패");
      const json = (await res.json()) as {
        battleId: string;
        output_a: string;
        output_b: string;
        meta: { ms: number; cost_usd: number };
      };
      setBattle({ stage: "vote", ...json });
    } catch (e) {
      setError(e instanceof Error ? e.message : "battle 시작 실패");
      setBattle({ stage: "idle" });
    }
  };

  const vote = async (winner: "A" | "B" | "tie") => {
    if (battle.stage !== "vote") return;
    try {
      const res = await fetch("/api/challenge/arena/battle", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ battle_id: battle.battleId, winner }),
      });
      if (!res.ok) throw new Error("vote 실패");
      const json = (await res.json()) as { revealedModels: { a: string; b: string } };
      setBattle({
        stage: "revealed",
        battleId: battle.battleId,
        output_a: battle.output_a,
        output_b: battle.output_b,
        winner,
        models: json.revealedModels,
      });
      void loadLeaderboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "vote 실패");
    }
  };

  const nextBattle = () => {
    setBattle({ stage: "idle" });
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Setup */}
      {(battle.stage === "idle" || battle.stage === "loading") && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Swords className="w-4 h-4 text-rose-600" />
              새 battle 시작
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              prompt를 입력하면 4개 LLM 중 랜덤 2개가 같은 prompt로 답변 생성. 모델명 숨김 상태에서 더 좋은 쪽을 선택.
            </p>
          </header>
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
                콘텐츠 타입
              </label>
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value as ContentType)}
                disabled={battle.stage === "loading"}
                className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900"
              >
                {CONTENT_TYPE_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
                Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                disabled={battle.stage === "loading"}
                placeholder="예: 메리노 울 스니커즈 (가격 ₩159k, 메이트 페블 그레이 컬러) — 30대 직장인 여성 타겟 한국어 상품 카피"
                className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
              />
            </div>
            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" /> {error}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void start()}
                disabled={battle.stage === "loading"}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-60"
              >
                {battle.stage === "loading" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Swords className="w-4 h-4" />
                )}
                {battle.stage === "loading" ? "두 LLM이 생성 중… (15-30초)" : "Battle 시작"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Battle vote */}
      {battle.stage === "vote" && (
        <section className="space-y-4">
          <div className="text-center">
            <h2 className="text-base font-semibold text-slate-900">
              어느 쪽이 더 좋은가요? (모델명 숨김)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {(battle.meta.ms / 1000).toFixed(1)}초 · 비용 ${battle.meta.cost_usd.toFixed(3)}
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <OutputCard label="A" text={battle.output_a} />
            <OutputCard label="B" text={battle.output_b} />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => void vote("A")}
              className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-md hover:bg-emerald-700"
            >
              ⬅ A 가 더 좋음
            </button>
            <button
              type="button"
              onClick={() => void vote("tie")}
              className="px-5 py-2.5 bg-slate-500 text-white text-sm font-semibold rounded-md hover:bg-slate-600"
            >
              ⚖ 동등
            </button>
            <button
              type="button"
              onClick={() => void vote("B")}
              className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-md hover:bg-emerald-700"
            >
              B 가 더 좋음 ➡
            </button>
          </div>
        </section>
      )}

      {/* Reveal */}
      {battle.stage === "revealed" && (
        <section className="space-y-4">
          <div className="text-center">
            <h2 className="text-base font-semibold text-slate-900 flex items-center justify-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" /> 평가 완료
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              승자: <strong>{battle.winner === "tie" ? "동등" : battle.winner}</strong>
              {" · "}
              모델 공개:{" "}
              <code className="text-slate-700">{MODEL_LABELS[battle.models.a]?.name ?? battle.models.a}</code> vs{" "}
              <code className="text-slate-700">{MODEL_LABELS[battle.models.b]?.name ?? battle.models.b}</code>
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <OutputCard
              label="A"
              text={battle.output_a}
              modelName={MODEL_LABELS[battle.models.a]?.name ?? battle.models.a}
              modelTone={MODEL_LABELS[battle.models.a]?.tone}
              isWinner={battle.winner === "A"}
              isTie={battle.winner === "tie"}
            />
            <OutputCard
              label="B"
              text={battle.output_b}
              modelName={MODEL_LABELS[battle.models.b]?.name ?? battle.models.b}
              modelTone={MODEL_LABELS[battle.models.b]?.tone}
              isWinner={battle.winner === "B"}
              isTie={battle.winner === "tie"}
            />
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={nextBattle}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
            >
              <RotateCw className="w-3.5 h-3.5" /> 새 battle
            </button>
          </div>
        </section>
      )}

      {/* Leaderboard */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-600" /> 모델 leaderboard
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            누적 battle 결과 — tie는 양측에 0.5승 부여 (LMArena 표준 convention)
          </p>
        </header>
        <div className="px-5 py-4">
          {leaderboard === null ? (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…
            </div>
          ) : leaderboard.length === 0 ? (
            <p className="text-xs text-slate-500">
              아직 평가된 battle이 없습니다. 첫 battle을 시작하세요.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-slate-500 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="text-left py-1.5">순위</th>
                  <th className="text-left">모델</th>
                  <th className="text-right">승률</th>
                  <th className="text-right">W</th>
                  <th className="text-right">T</th>
                  <th className="text-right">L</th>
                  <th className="text-right">battle</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r, i) => {
                  const meta = MODEL_LABELS[r.model];
                  return (
                    <tr key={r.model} className="border-t border-slate-100">
                      <td className="py-1.5 font-bold text-slate-900">{i + 1}</td>
                      <td>
                        <span
                          className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded ${
                            meta?.tone ?? "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {meta?.name ?? r.model}
                        </span>
                      </td>
                      <td className="text-right font-bold text-slate-900 tabular-nums">
                        {(r.win_rate * 100).toFixed(1)}%
                      </td>
                      <td className="text-right tabular-nums text-emerald-700">{r.wins}</td>
                      <td className="text-right tabular-nums text-slate-500">{r.ties}</td>
                      <td className="text-right tabular-nums text-red-600">{r.losses}</td>
                      <td className="text-right tabular-nums text-slate-500">{r.appearances}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function OutputCard({
  label,
  text,
  modelName,
  modelTone,
  isWinner,
  isTie,
}: {
  label: string;
  text: string;
  modelName?: string;
  modelTone?: string;
  isWinner?: boolean;
  isTie?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white shadow-sm overflow-hidden ${
        isWinner
          ? "border-emerald-400 ring-2 ring-emerald-200"
          : isTie
            ? "border-slate-300 ring-1 ring-slate-200"
            : "border-slate-200"
      }`}
    >
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-900">{label}</span>
        {modelName ? (
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
              modelTone ?? "bg-slate-100 text-slate-700"
            }`}
          >
            {modelName}
            {isWinner && " 🏆"}
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">모델 숨김</span>
        )}
      </div>
      <div className="px-4 py-3 max-h-[480px] overflow-y-auto">
        <pre className="text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
          {text}
        </pre>
      </div>
    </div>
  );
}
