import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";
import {
  effortLabel,
  impactLabel,
  stripActionScoreNotation,
} from "@/lib/simulation/grade-copy";
import { categoryLabel, normalizeActionCategory } from "@/lib/simulation/taxonomy";

/**
 * Split one merged action into spreadsheet columns.
 *
 * Exported actions are 150–400 characters and arrive as a single cell,
 * which Excel cannot show even at maximum column width — the user has
 * to click each row and read the formula bar. The text has a reliable
 * shape, so give each part its own column instead:
 *
 *   【즉시 착수 — 2026년 10월】 제목: 상세 … KPI: 측정 기준
 *    └ timing              └ title └ detail  └ kpi
 *
 * The score notation ("effort=2, impact=2") is stripped here as it is
 * everywhere else — it was still reaching the CSV, where it read as
 * part of the timing label.
 *
 * Every part is optional. The title split only fires on a colon near
 * the start of the text, so a body that doesn't follow the convention
 * stays whole in the detail column rather than being cut mid-sentence.
 */
const TITLE_MAX = 70;

/**
 * Break a paragraph after its first sentence so a spreadsheet shows the
 * gist in one column and the evidence in the next.
 *
 * Returns an empty head when there's no sensible boundary — under 20
 * characters is an abbreviation ("U.S. market"), and past `max` the
 * "summary" would be as unreadable as the paragraph it came from. The
 * caller then keeps the text whole rather than cutting it somewhere
 * arbitrary.
 */
function splitFirstSentence(
  text: string,
  max: number,
): { head: string; rest: string } {
  const at = text.search(/[.。!?]\s/);
  if (at < 20 || at > max) return { head: "", rest: text };
  return { head: text.slice(0, at + 1).trim(), rest: text.slice(at + 1).trim() };
}

/** "SFA 수입 등록 미완료 — 싱가포르 전 채널 판매 차단" → the two halves. */
function splitFactor(factor: string): { name: string; impact: string } {
  const dash = factor.indexOf(" — ");
  if (dash <= 0) return { name: factor.trim(), impact: "" };
  return {
    name: factor.slice(0, dash).trim(),
    impact: factor.slice(dash + 3).trim(),
  };
}

function splitAction(raw: string): {
  timing: string;
  title: string;
  detail: string;
  kpi: string;
} {
  const text = stripActionScoreNotation(raw).trim();
  const bracket = text.match(/^【([^】]*)】\s*/);
  const timing = bracket ? bracket[1].trim() : "";
  const rest = bracket ? text.slice(bracket[0].length) : text;

  const kpiAt = rest.search(/KPI\s*[:：]/);
  const body = (kpiAt >= 0 ? rest.slice(0, kpiAt) : rest).trim();
  const kpi = kpiAt >= 0 ? rest.slice(kpiAt).replace(/^KPI\s*[:：]\s*/, "").trim() : "";

  const colon = body.search(/[:：]\s/);
  if (colon > 0 && colon <= TITLE_MAX) {
    return {
      timing,
      title: body.slice(0, colon).trim(),
      detail: body.slice(colon + 1).trim(),
      kpi,
    };
  }
  return { timing, title: "", detail: body, kpi };
}

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

  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const stem = `ensemble-${id.slice(0, 8)}`;

  if (format === "xlsx") {
    // One workbook, every section as its own sheet. CSV can carry no
    // formatting at all — no column widths, no wrapping, no frozen
    // header — so a 300-character action cell is unreadable however
    // wide the column is dragged. Here those are properties of the file.
    const sheets: Sheet[] = [
      buildCountriesSheet(aggregate, isKo),
      buildRisksSheet(aggregate, isKo),
      buildActionsSheet(aggregate, locale, isKo),
      await buildPersonasSheet(supabase, id, isKo),
    ];
    const buffer = await toWorkbook(sheets);
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${stem}.xlsx"`,
      },
    });
  }

  let sheet: Sheet;
  switch (type) {
    case "countries":
      sheet = buildCountriesSheet(aggregate, isKo);
      break;
    case "risks":
      sheet = buildRisksSheet(aggregate, isKo);
      break;
    case "actions":
      sheet = buildActionsSheet(aggregate, locale, isKo);
      break;
    case "personas":
      sheet = await buildPersonasSheet(supabase, id, isKo);
      break;
    default:
      return NextResponse.json({ error: `unknown type: ${type}` }, { status: 400 });
  }

  // Prepend BOM so Excel opens UTF-8 Korean correctly. Without it, "한국"
  // renders as garbled mojibake when the user double-clicks the file
  // on Windows Excel.
  return new NextResponse("﻿" + toCsv(sheet.headers, sheet.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${stem}-${type}.csv"`,
    },
  });
}

/** One tab's worth of data plus how it should be laid out. */
interface Sheet {
  name: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  /** Character widths, one per column. */
  widths: number[];
  /** Indices of columns that hold prose and should wrap. */
  wrap?: number[];
  /** Column index holding a severity value, for the colour fill. */
  severityCol?: number;
}

function buildCountriesSheet(aggregate: EnsembleAggregate, isKo: boolean): Sheet {
  return {
    name: isKo ? "국가별 점수" : "Country scores",
    headers: isKo
      ? ["국가", "평균 점수", "중앙값", "표준편차", "최소", "최대", "범위", "수요(중앙값)", "경쟁(중앙값)", "CAC(중앙값, USD)"]
      : ["country", "mean", "median", "std", "min", "max", "range", "demand_median", "competition_median", "cac_median_usd"],
    rows: aggregate.countryStats.map((c) => [
      c.country,
      c.finalScore.mean,
      c.finalScore.median,
      // Combined std (within + across) when available — matches the
      // dashboard/PDF surfaces so a downstream KOTRA-style review
      // sees the same noise figure in every export channel.
      c.finalScore.combinedStd ?? c.finalScore.std,
      c.finalScore.min,
      c.finalScore.max,
      c.finalScore.range,
      c.demandScore.median,
      c.competitionScore.median,
      // Prefer the server-computed persona-derived cacRange — same
      // priority dashboard/PDF/ShareViewer use after 6aaac4f. Falls
      // back to the LLM-emitted median for legacy ensembles only.
      c.cacRange?.medianUsd ?? c.cacEstimateUsd.median,
    ]),
    widths: [10, 12, 10, 11, 8, 8, 8, 14, 14, 18],
  };
}

function buildRisksSheet(aggregate: EnsembleAggregate, isKo: boolean): Sheet {
  const risks = aggregate.narrative?.mergedRisks ?? [];
  return {
    name: isKo ? "통합 리스크" : "Risks",
    headers: isKo
      ? ["우선순위", "심각도", "리스크", "파급", "요약", "근거", "적용 범위", "언급 시뮬 수"]
      : ["rank", "severity", "risk", "impact", "summary", "evidence", "scope", "surfaced_in_sims"],
    rows: risks.map((r, i) => {
      const { name, impact } = splitFactor(r.factor);
      // Descriptions run 200–500 characters. 200 is the widest first
      // sentence worth calling a summary on real output.
      const { head, rest } = splitFirstSentence(r.description ?? "", 200);
      const ext = r as unknown as { scope?: string; affectedCountries?: string[] };
      const scopeText = ext.scope
        ? ext.affectedCountries?.length
          ? `${ext.scope} (${ext.affectedCountries.join(", ")})`
          : ext.scope
        : "";
      return [i + 1, r.severity, name, impact, head, rest, scopeText, r.surfacedInSims];
    }),
    widths: [8, 10, 26, 30, 52, 70, 18, 12],
    wrap: [4, 5],
    severityCol: 1,
  };
}

function buildActionsSheet(
  aggregate: EnsembleAggregate,
  locale: "ko" | "en",
  isKo: boolean,
): Sheet {
  const actions = aggregate.narrative?.mergedActions ?? [];
  return {
    name: isKo ? "권장 액션" : "Actions",
    headers: isKo
      ? ["우선순위", "시점", "액션", "상세", "KPI", "분류", "영향", "난이도", "구체성", "권장 시뮬 수"]
      : ["rank", "timing", "action", "detail", "kpi", "category", "impact", "effort", "specificity", "recommended_in_sims"],
    rows: actions.map((a, i) => {
      const { timing, title, detail, kpi } = splitAction(a.action);
      const code = normalizeActionCategory(a.actionCategory);
      return [
        i + 1,
        timing,
        title,
        detail,
        kpi,
        code ? categoryLabel("action", code, locale) : "",
        impactLabel(a.impact, locale) ?? "",
        effortLabel(a.effort, locale) ?? "",
        a.specificity?.score ?? "",
        a.surfacedInSims,
      ];
    }),
    widths: [8, 20, 40, 70, 46, 16, 14, 14, 10, 12],
    wrap: [2, 3, 4],
  };
}

async function buildPersonasSheet(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  isKo: boolean,
): Promise<Sheet> {
  // Heavy path — pull every persona from every completed sim under
  // this ensemble. For deep_pro that's up to 10K rows.
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
  return {
    name: isKo ? "페르소나" : "Personas",
    headers: isKo
      ? ["시뮬 #", "이름", "국가", "나이", "성별", "직업", "소득", "구매의향", "코멘트"]
      : ["sim_index", "name", "country", "age_range", "gender", "profession", "income_band", "purchase_intent", "voice"],
    rows: out,
    widths: [8, 16, 8, 10, 8, 20, 14, 12, 70],
    wrap: [8],
  };
}

const SEVERITY_FILL: Record<string, string> = {
  high: "FFFDE7E9",
  medium: "FFFFF4E5",
  low: "FFF1F5F9",
};

/** Build the workbook: widths, wrapping, frozen header, autofilter. */
async function toWorkbook(sheets: Sheet[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Market Twin";
  wb.created = new Date();

  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws.columns = s.headers.map((h, i) => ({
      header: h,
      width: s.widths[i] ?? 16,
    }));
    for (const row of s.rows) ws.addRow(row);

    const header = ws.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: "middle" };
    header.height = 22;
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: s.headers.length },
    };

    const wrapCols = new Set(s.wrap ?? []);
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      row.alignment = { vertical: "top" };
      for (const c of wrapCols) {
        row.getCell(c + 1).alignment = { vertical: "top", wrapText: true };
      }
      if (s.severityCol != null) {
        const level = String(row.getCell(s.severityCol + 1).value ?? "").toLowerCase();
        const fill = SEVERITY_FILL[level];
        if (fill) {
          row.getCell(s.severityCol + 1).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: fill },
          };
        }
      }
    }
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
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
