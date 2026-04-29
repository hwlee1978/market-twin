import { getTranslations, setRequestLocale } from "next-intl/server";
import { getLLMProvider } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";

// The DB column current_stage uses runner-specific names (regulatory, personas,
// scoring, pricing, recommend). The LLM config layer uses different names
// (personas, countries, pricing, synthesis) — this table maps each DB stage
// to the env-var prefix the runner actually reads when picking a model.
type StageMeta = {
  dbStage: string;            // value stored in simulations.current_stage
  envStage:                   // arg passed to getLLMProvider({ stage })
    | "personas"
    | "countries"
    | "pricing"
    | "synthesis";
  envHint: string;            // human-readable env override prefix
};

const STAGES: StageMeta[] = [
  { dbStage: "regulatory", envStage: "synthesis", envHint: "LLM_SYNTHESIS_*" },
  { dbStage: "personas",   envStage: "personas",  envHint: "LLM_PERSONAS_*" },
  { dbStage: "scoring",    envStage: "countries", envHint: "LLM_COUNTRIES_*" },
  { dbStage: "pricing",    envStage: "pricing",   envHint: "LLM_PRICING_*" },
  { dbStage: "recommend",  envStage: "synthesis", envHint: "LLM_SYNTHESIS_*" },
];

type SimRow = {
  status: string;
  current_stage: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export default async function AdminModelsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.models");

  const admin = createServiceClient();

  // Resolve each stage's effective provider/model by asking the same factory
  // the runner uses — that way this page reflects what would actually run if
  // a simulation started right now, including the env-override fallback chain.
  const resolved = STAGES.map((s) => {
    const llm = getLLMProvider({ stage: s.envStage });
    return { ...s, provider: llm.name, model: llm.model };
  });

  // Default fallback (used when stage envs aren't set)
  const defaultLLM = getLLMProvider({});
  const defaultProviderEnv = process.env.LLM_DEFAULT_PROVIDER ?? null;
  const defaultModelEnv = process.env.LLM_DEFAULT_MODEL ?? null;

  // 7-day per-stage stats. Failed sims now retain current_stage (after the
  // runner fix), so this groups failures by the actual breaking stage —
  // not a generic 'failed' bucket like before.
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from("simulations")
    .select("status, current_stage, started_at, completed_at")
    .gte("created_at", since7d);

  const sims = (recent ?? []) as SimRow[];

  const statsByStage = new Map<
    string,
    { total: number; failed: number; durations: number[] }
  >();
  for (const s of sims) {
    const stage = s.current_stage ?? "unknown";
    let agg = statsByStage.get(stage);
    if (!agg) {
      agg = { total: 0, failed: 0, durations: [] };
      statsByStage.set(stage, agg);
    }
    agg.total += 1;
    if (s.status === "failed") agg.failed += 1;
    if (s.status === "completed" && s.started_at && s.completed_at) {
      agg.durations.push(
        new Date(s.completed_at).getTime() - new Date(s.started_at).getTime(),
      );
    }
  }

  const tableRows = resolved.map((r) => {
    const agg = statsByStage.get(r.dbStage);
    return {
      ...r,
      total: agg?.total ?? 0,
      failed: agg?.failed ?? 0,
      avgMs:
        agg && agg.durations.length > 0
          ? Math.round(agg.durations.reduce((a, b) => a + b, 0) / agg.durations.length)
          : null,
    };
  });

  // Anything in current_stage we didn't recognise — usually 'completed' (final
  // state) or 'failed' (legacy rows from before the runner fix). Surfacing
  // these helps spot legacy data without polluting the main table.
  const knownStages = new Set(STAGES.map((s) => s.dbStage));
  knownStages.add("completed");
  const unknownRows = Array.from(statsByStage.entries())
    .filter(([stage]) => !knownStages.has(stage))
    .map(([stage, agg]) => ({ stage, ...agg }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
      </div>

      <div className="card">
        <h2 className="text-base font-semibold mb-3">{t("default.title")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Field label={t("default.provider")}>
            <span className="font-mono">{defaultLLM.name}</span>
            {defaultProviderEnv ? (
              <span className="ml-2 text-xs text-slate-400">
                ← LLM_DEFAULT_PROVIDER
              </span>
            ) : (
              <span className="ml-2 text-xs text-warn">
                ({t("default.hardcoded")})
              </span>
            )}
          </Field>
          <Field label={t("default.model")}>
            <span className="font-mono">{defaultLLM.model}</span>
            {defaultModelEnv ? (
              <span className="ml-2 text-xs text-slate-400">
                ← LLM_DEFAULT_MODEL
              </span>
            ) : (
              <span className="ml-2 text-xs text-warn">
                ({t("default.hardcoded")})
              </span>
            )}
          </Field>
        </div>
        <p className="mt-3 text-xs text-slate-500">{t("default.hint")}</p>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold">{t("stages.title")}</h2>
          <p className="text-xs text-slate-500 mt-1">{t("stages.hint")}</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-6 py-2 font-medium">{t("stages.col.stage")}</th>
              <th className="text-left px-6 py-2 font-medium">{t("stages.col.envOverride")}</th>
              <th className="text-left px-6 py-2 font-medium">{t("stages.col.provider")}</th>
              <th className="text-left px-6 py-2 font-medium">{t("stages.col.model")}</th>
              <th className="text-right px-6 py-2 font-medium">{t("stages.col.runs7d")}</th>
              <th className="text-right px-6 py-2 font-medium">{t("stages.col.failures")}</th>
              <th className="text-right px-6 py-2 font-medium">{t("stages.col.avgRuntime")}</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <tr key={row.dbStage} className="border-t border-slate-100">
                <td className="px-6 py-3 capitalize">{row.dbStage}</td>
                <td className="px-6 py-3 font-mono text-xs text-slate-500">
                  {row.envHint}
                </td>
                <td className="px-6 py-3 capitalize">{row.provider}</td>
                <td className="px-6 py-3 font-mono text-xs">{row.model}</td>
                <td className="px-6 py-3 text-right tabular-nums text-slate-600">
                  {row.total}
                </td>
                <td
                  className={`px-6 py-3 text-right tabular-nums ${
                    row.failed > 0 ? "text-risk" : "text-slate-600"
                  }`}
                >
                  {row.failed}
                </td>
                <td className="px-6 py-3 text-right tabular-nums text-slate-500">
                  {row.avgMs !== null ? formatDuration(row.avgMs) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unknownRows.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold mb-2">{t("legacy.title")}</h3>
          <p className="text-xs text-slate-500 mb-3">{t("legacy.hint")}</p>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left pb-2 font-medium">{t("stages.col.stage")}</th>
                <th className="text-right pb-2 font-medium">{t("stages.col.runs7d")}</th>
                <th className="text-right pb-2 font-medium">{t("stages.col.failures")}</th>
              </tr>
            </thead>
            <tbody>
              {unknownRows.map((r) => (
                <tr key={r.stage} className="border-t border-slate-100">
                  <td className="py-2 font-mono text-xs">{r.stage}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">
                    {r.total}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-500">
                    {r.failed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">
        {label}
      </div>
      <div className="text-sm text-slate-900">{children}</div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest === 0 ? `${min}m` : `${min}m ${rest}s`;
}
