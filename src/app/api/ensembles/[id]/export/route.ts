import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";

export const dynamic = "force-dynamic";

/**
 * GET /api/ensembles/:id/export?type=countries|risks|actions|personas
 *
 * Streams a CSV of one section of the ensemble result. Personas type
 * pulls from simulation_results (heavy) and may include up to ~10K
 * rows; the others are aggregated and small (handful of rows each).
 *
 * CSV is the lowest-common-denominator export — opens directly in
 * Excel / Google Sheets / Notion (file import). Header row is locale-
 * aware so a Korean user gets Korean column names.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "countries";
  const locale = (url.searchParams.get("locale") ?? "ko") === "en" ? "en" : "ko";
  const isKo = locale === "ko";

  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: ensemble, error: ensErr } = await supabase
    .from("ensembles")
    .select("id, status, aggregate_result, project_id")
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (ensErr || !ensemble) {
    return NextResponse.json({ error: "ensemble not found" }, { status: 404 });
  }
  if (!ensemble.aggregate_result) {
    return NextResponse.json({ error: "no aggregate" }, { status: 409 });
  }
  const aggregate = ensemble.aggregate_result as EnsembleAggregate;

  let csv = "";
  let filename = `ensemble-${id.slice(0, 8)}-${type}.csv`;

  switch (type) {
    case "countries": {
      const headers = isKo
        ? ["국가", "평균 점수", "중앙값", "표준편차", "최소", "최대", "범위", "수요(중앙값)", "경쟁(중앙값)", "CAC(중앙값, USD)"]
        : ["country", "mean", "median", "std", "min", "max", "range", "demand_median", "competition_median", "cac_median_usd"];
      const rows = aggregate.countryStats.map((c) => [
        c.country,
        c.finalScore.mean,
        c.finalScore.median,
        c.finalScore.std,
        c.finalScore.min,
        c.finalScore.max,
        c.finalScore.range,
        c.demandScore.median,
        c.competitionScore.median,
        c.cacEstimateUsd.median,
      ]);
      csv = toCsv(headers, rows);
      break;
    }
    case "risks": {
      const headers = isKo
        ? ["우선순위", "심각도", "리스크 항목", "상세 설명", "언급 시뮬 수"]
        : ["rank", "severity", "factor", "description", "surfaced_in_sims"];
      const risks = aggregate.narrative?.mergedRisks ?? [];
      const rows = risks.map((r, i) => [i + 1, r.severity, r.factor, r.description, r.surfacedInSims]);
      csv = toCsv(headers, rows);
      break;
    }
    case "actions": {
      const headers = isKo
        ? ["우선순위", "권장 액션", "권장 시뮬 수"]
        : ["rank", "action", "recommended_in_sims"];
      const actions = aggregate.narrative?.mergedActions ?? [];
      const rows = actions.map((a, i) => [i + 1, a.action, a.surfacedInSims]);
      csv = toCsv(headers, rows);
      break;
    }
    case "personas": {
      // Heavy path — pull every persona from every completed sim under
      // this ensemble. For deep_pro that's up to 10K rows; flush as one
      // CSV and let the client download it as a stream.
      type SimRow = {
        ensemble_index: number | null;
        simulation_results: { personas?: unknown } | { personas?: unknown }[] | null;
      };
      const { data: rawRows } = await supabase
        .from("simulations")
        .select(`ensemble_index, simulation_results ( personas )`)
        .eq("ensemble_id", id)
        .eq("status", "completed");
      const rows = (rawRows ?? []) as unknown as SimRow[];
      const headers = isKo
        ? ["시뮬 #", "이름", "국가", "나이", "성별", "직업", "소득", "구매의향", "코멘트"]
        : ["sim_index", "name", "country", "age_range", "gender", "profession", "income_band", "purchase_intent", "voice"];
      const out: Array<Array<string | number>> = [];
      for (const r of rows) {
        const result = Array.isArray(r.simulation_results)
          ? r.simulation_results[0]
          : r.simulation_results;
        const personas = (result?.personas ?? []) as Array<Record<string, unknown>>;
        for (const p of personas) {
          out.push([
            (r.ensemble_index ?? 0) + 1,
            (p.name as string) ?? "",
            (p.country as string) ?? "",
            (p.ageRange as string) ?? "",
            (p.gender as string) ?? "",
            (p.profession as string) ?? "",
            (p.incomeBand as string) ?? "",
            typeof p.purchaseIntent === "number" ? p.purchaseIntent : 0,
            (p.voice as string) ?? "",
          ]);
        }
      }
      csv = toCsv(headers, out);
      break;
    }
    default:
      return NextResponse.json({ error: `unknown type: ${type}` }, { status: 400 });
  }

  // Prepend BOM so Excel opens UTF-8 Korean correctly. Without it, "한국"
  // renders as garbled mojibake when the user double-clicks the file
  // on Windows Excel.
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const escape = (cell: string | number): string => {
    const s = String(cell ?? "");
    // Quote when the cell contains comma, quote, or newline. Double up
    // any embedded quotes per RFC 4180.
    if (/[,"\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(escape).join(",")];
  for (const r of rows) lines.push(r.map(escape).join(","));
  return lines.join("\n");
}
