/**
 * DART region segment parser — Phase F.1-B v2 (auto-generated F.1-B replacement
 * for the manual brand-region-revenue.json, scoped to multi-segment K-IFRS 8
 * disclosing companies).
 *
 * Two-stage:
 *   1. fetchDartReportXml(corpCode, year) — pull latest 사업보고서 ZIP and
 *      return the main report XML as string.
 *   2. extractRegionSegment(xml) — regex out the K-IFRS 8 "지역에 대한 공시"
 *      table (4-region aggregate: 본사 국가 / 아시아 / 아메리카 / 유럽 / 기타).
 *
 * Limitations (per [[PHASE_F1B_AUTOMATION_FEASIBILITY]]):
 *   - K-IFRS 8 single-segment entities (빙그레, 삼양식품, 하이트진로) are
 *     legally allowed to skip segment disclosure → parser returns null.
 *   - Output is broad 4-region only (not country-level CN $X / JP $Y).
 *     Sub-allocation requires KOTRA compSucsCase overlay or LLM extraction.
 *   - DART API quota: 10K calls/day shared with other DART work.
 */

import JSZip from "jszip";

const LIST_ENDPOINT = "https://opendart.fss.or.kr/api/list.json";
const DOC_ENDPOINT = "https://opendart.fss.or.kr/api/document.xml";
const TIMEOUT_MS = 20000;

export interface DartRegionRow {
  /** Region name as disclosed (한국어: 본사 소재지 국가 / 아시아 / 아메리카 / 유럽 / 기타 국가). */
  regionKo: string;
  /** English name from XML ENG attribute when available. */
  regionEn: string | null;
  /** Net revenue in KRW (영업수익 row, post inter-segment elimination). */
  revenueKrw: number;
}

export interface DartRegionSegment {
  corpCode: string;
  reportRceptNo: string;
  reportDate: string;
  reportName: string;
  rows: DartRegionRow[];
  /** Total / sanity-check revenue. */
  totalRevenueKrw: number;
}

/** Fetch the latest 사업보고서 rcept_no for a corp_code, in a year range. */
export async function findLatestAnnualReport(
  corpCode: string,
  apiKey: string,
  yearRange = { bgnDe: "20240101", endDe: "20251231" },
): Promise<{ rceptNo: string; reportName: string; rceptDate: string } | null> {
  const params = new URLSearchParams({
    crtfc_key: apiKey,
    corp_code: corpCode,
    bgn_de: yearRange.bgnDe,
    end_de: yearRange.endDe,
    pblntf_ty: "A",
    page_count: "10",
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${LIST_ENDPOINT}?${params}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      list?: Array<{ rcept_no: string; rcept_dt: string; report_nm: string }>;
    };
    const annual = json.list?.find(
      (r) =>
        r.report_nm.includes("사업보고서") && !r.report_nm.startsWith("[기재정정]"),
    );
    // Prefer amended (정정) over original if both present
    const amended = json.list?.find((r) => r.report_nm.startsWith("[기재정정]사업보고서"));
    const picked = amended ?? annual ?? null;
    return picked
      ? { rceptNo: picked.rcept_no, reportName: picked.report_nm, rceptDate: picked.rcept_dt }
      : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/** Pull the document.xml ZIP and return the main report XML as a string. */
export async function fetchReportXml(
  rceptNo: string,
  apiKey: string,
): Promise<string | null> {
  const url = `${DOC_ENDPOINT}?crtfc_key=${apiKey}&rcept_no=${rceptNo}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS * 2);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    // Main report XML has no underscore in the filename (audit reports do)
    const mainFile = Object.keys(zip.files).find(
      (f) => f.endsWith(".xml") && !f.includes("_") && !zip.files[f].dir,
    );
    if (!mainFile) return null;
    return await zip.files[mainFile].async("string");
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Extract the K-IFRS 8 region disclosure table from a 사업보고서 XML string.
 * Returns null if no such table is present (single-segment entities).
 *
 * Strategy: locate marker text ("지역에 대한 공시" or "지역별 영업현황"),
 * find the next <TABLE>...</TABLE> block, parse THEAD as column headers,
 * find TBODY row whose first cell text matches "영업수익" or "Revenue".
 */
export function extractRegionSegment(xml: string): DartRegionRow[] | null {
  const markers = ["지역에 대한 공시", "지역별 영업현황"];
  let markerPos = -1;
  for (const m of markers) {
    const p = xml.indexOf(m);
    if (p >= 0 && (markerPos < 0 || p < markerPos)) markerPos = p;
  }
  if (markerPos < 0) return null;

  // Search forward for the first TABLE with both region headers and a revenue row.
  // CJ structure has 2 preliminary TABLEs (label + unit note) before the data TABLE.
  let pos = markerPos;
  for (let attempt = 0; attempt < 4; attempt++) {
    const tableStart = xml.indexOf("<TABLE", pos);
    if (tableStart < 0) return null;
    const tableEnd = xml.indexOf("</TABLE>", tableStart);
    if (tableEnd < 0) return null;
    const tableXml = xml.slice(tableStart, tableEnd + "</TABLE>".length);

    // Parse THEAD column headers — <TH ... ENG="Asia"><P>아시아</P></TH>
    const theadMatch = tableXml.match(/<THEAD[\s\S]*?<\/THEAD>/);
    if (!theadMatch) {
      pos = tableEnd + 1;
      continue;
    }
    const headers: Array<{ ko: string; en: string | null }> = [];
    const thRegex = /<TH[^>]*?(?:ENG="([^"]*)")?[^>]*>([\s\S]*?)<\/TH>/g;
    let thm: RegExpExecArray | null;
    while ((thm = thRegex.exec(theadMatch[0])) !== null) {
      const en = thm[1] ?? null;
      const inner = thm[2];
      const pMatch = inner.match(/<P[^>]*>([\s\S]*?)<\/P>/);
      const ko = (pMatch?.[1] ?? inner).replace(/<[^>]+>/g, "").trim();
      headers.push({ ko: ko === "　" || ko === "" ? "(label)" : ko, en });
    }
    if (headers.length < 3) {
      pos = tableEnd + 1;
      continue;
    }

    // Parse TBODY rows, find the row whose first <TE>...</TE> contains 영업수익 or Revenue.
    const tbodyMatch = tableXml.match(/<TBODY[\s\S]*?<\/TBODY>/);
    if (!tbodyMatch) {
      pos = tableEnd + 1;
      continue;
    }
    const rowRegex = /<TR[^>]*>([\s\S]*?)<\/TR>/g;
    let revenueCells: string[] | null = null;
    let rm: RegExpExecArray | null;
    while ((rm = rowRegex.exec(tbodyMatch[0])) !== null) {
      const cellsXml = rm[1];
      const cellRegex = /<TE[^>]*>([\s\S]*?)<\/TE>/g;
      const cells: string[] = [];
      let cm: RegExpExecArray | null;
      while ((cm = cellRegex.exec(cellsXml)) !== null) {
        const inner = cm[1];
        const pMatch = inner.match(/<P[^>]*>([\s\S]*?)<\/P>/);
        const text = (pMatch?.[1] ?? inner).replace(/<[^>]+>/g, "").trim();
        cells.push(text);
      }
      if (cells.length === 0) continue;
      const label = cells[0];
      if (
        label === "영업수익" ||
        label === "Revenue" ||
        label.includes("영업수익") ||
        label.includes("매출액") && !label.includes("내부")
      ) {
        revenueCells = cells;
        // "영업수익" is the post-elimination preferred row; if "총 매출액" was
        // seen first, keep searching for the "영업수익" row.
        if (label === "영업수익" || label.includes("영업수익")) break;
      }
    }
    if (!revenueCells) {
      pos = tableEnd + 1;
      continue;
    }

    // Map cells (skip first label cell) → headers (skip first label header)
    const rows: DartRegionRow[] = [];
    for (let i = 1; i < Math.min(headers.length, revenueCells.length); i++) {
      const hdr = headers[i];
      // Skip "지역 합계" / Total columns
      if (hdr.ko.includes("합계") || hdr.ko === "Total of Geographical areas") continue;
      const rawValue = revenueCells[i].replace(/,/g, "").replace(/[()]/g, "");
      const n = parseFloat(rawValue);
      if (!Number.isFinite(n)) continue;
      rows.push({ regionKo: hdr.ko, regionEn: hdr.en, revenueKrw: n * 1000 }); // unit was thousand KRW
    }
    if (rows.length === 0) {
      pos = tableEnd + 1;
      continue;
    }
    return rows;
  }
  return null;
}

/** Top-level: corp_code → DartRegionSegment | null. */
export async function fetchDartRegionSegment(
  corpCode: string,
  apiKey: string,
): Promise<DartRegionSegment | null> {
  const report = await findLatestAnnualReport(corpCode, apiKey);
  if (!report) return null;
  const xml = await fetchReportXml(report.rceptNo, apiKey);
  if (!xml) return null;
  const rows = extractRegionSegment(xml);
  if (!rows || rows.length === 0) return null;
  const totalRevenueKrw = rows.reduce((a, r) => a + r.revenueKrw, 0);
  return {
    corpCode,
    reportRceptNo: report.rceptNo,
    reportDate: report.rceptDate,
    reportName: report.reportName,
    rows,
    totalRevenueKrw,
  };
}
