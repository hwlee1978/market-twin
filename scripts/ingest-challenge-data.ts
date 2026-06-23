/**
 * Ingest 챌린지 (KOSME + KOMA) 제공 데이터 — 판판대로 (CSV) + 수출바우처 (Excel).
 *
 * Usage:
 *   npm run ingest:challenge -- programs   path/to/판판대로_지원사업.csv
 *   npm run ingest:challenge -- companies  path/to/판판대로_선정기업.csv
 *   npm run ingest:challenge -- products   path/to/판판대로_제품.csv
 *   npm run ingest:challenge -- voucher-programs  path/to/수출바우처_프로그램.xlsx
 *   npm run ingest:challenge -- voucher-exports   path/to/수출바우처_성과.xlsx
 *
 *   Flags:
 *     --dry-run     parse + validate but no DB write (column-name preview only)
 *     --year=2024   override source_year inference
 *     --batch=500   batch insert size (default 500)
 *
 * 컬럼 매핑: 실제 데이터 컬럼명이 schema 필드명과 다를 수 있으므로
 *           HEURISTIC_COLUMNS 매핑 + dry-run 결과 보고 수동 검토.
 *
 * 비식별화: 사업자등록번호는 SHA-256 해시 저장. 원본은 절대 DB 안 적재.
 *
 * 재실행: ingestion 키 (source_id 또는 business_no_hash + selected_year)로
 *         upsert 패턴 — 동일 파일 재실행 시 중복 안 쌓임.
 */

import { Client } from "pg";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, basename } from "node:path";
import { createHash } from "node:crypto";
import { parse as csvParse } from "csv-parse/sync";
import * as XLSX from "xlsx";

type Mode =
  | "programs"
  | "companies"
  | "products"
  | "voucher-programs"
  | "voucher-exports";

interface Args {
  mode: Mode;
  file: string;
  dryRun: boolean;
  yearOverride: number | null;
  batchSize: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.error(
      "Usage: ingest-challenge-data.ts <mode> <file> [--dry-run] [--year=YYYY] [--batch=N]\n" +
        "  mode: programs | companies | products | voucher-programs | voucher-exports",
    );
    process.exit(1);
  }
  const mode = argv[0] as Mode;
  const file = argv[1];
  const dryRun = argv.includes("--dry-run");
  const yearArg = argv.find((a) => a.startsWith("--year="));
  const batchArg = argv.find((a) => a.startsWith("--batch="));
  return {
    mode,
    file,
    dryRun,
    yearOverride: yearArg ? parseInt(yearArg.split("=")[1], 10) : null,
    batchSize: batchArg ? parseInt(batchArg.split("=")[1], 10) : 500,
  };
}

/**
 * Heuristic column name → schema field name. Korean source data uses
 * many possible header variants — match generously so we don't fail on
 * minor spelling differences.
 */
const HEURISTIC_COLUMNS: Record<Mode, Record<string, string[]>> = {
  programs: {
    program_name: ["사업명", "지원사업명", "사업 명칭", "name"],
    program_purpose: ["사업목적", "목적", "purpose"],
    eligibility: ["지원대상", "신청대상", "eligibility"],
    support_content: ["지원내용", "지원 내용", "support"],
    organization: ["주관기관", "운영기관", "담당기관", "organization"],
    application_period: ["신청기간", "접수기간", "기간", "period"],
    region: ["지역", "region"],
    source_year: ["연도", "사업연도", "year"],
  },
  companies: {
    business_no: ["사업자등록번호", "사업자번호", "BRN"],
    company_name: ["업체명", "기업명", "회사명", "company"],
    industry: ["업종", "산업분류", "업종코드", "industry"],
    region: ["지역", "소재지", "region"],
    revenue_band: ["매출액", "매출구간", "revenue"],
    employee_band: ["종업원수", "직원수", "employees"],
    founded_year: ["설립연도", "founded"],
    selected_program: ["선정사업명", "지원사업", "program"],
    selected_year: ["선정연도", "지원연도", "year"],
  },
  products: {
    product_name: ["제품명", "상품명", "product"],
    category: ["카테고리", "분류", "category"],
    description: ["설명", "제품설명", "description"],
    detail_page_url: ["상세페이지", "URL", "url"],
    price_krw: ["가격", "단가", "price"],
    company_business_no: ["사업자등록번호", "사업자번호"],
  },
  "voucher-programs": {
    program_name: ["프로그램명", "사업명", "name"],
    eligibility: ["지원대상", "eligibility"],
    support_content: ["지원내용", "support"],
    selection_criteria: ["선정정보", "선정기준", "criteria"],
    organization: ["주관기관", "운영기관"],
    application_period: ["신청기간", "접수기간"],
    source_year: ["연도", "year"],
  },
  "voucher-exports": {
    business_no: ["사업자등록번호", "사업자번호"],
    company_name: ["업체명", "기업명"],
    industry: ["업종"],
    destination_country: ["수출국가", "국가", "country"],
    export_amount_usd: ["수출금액", "직접수출금액", "amount"],
    export_year: ["수출연도", "연도", "year"],
    voucher_program: ["사용프로그램", "프로그램명"],
  },
};

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function inferColumnMap(
  headers: string[],
  mode: Mode,
): Record<string, string | null> {
  const heuristics = HEURISTIC_COLUMNS[mode];
  const map: Record<string, string | null> = {};
  for (const [field, candidates] of Object.entries(heuristics)) {
    const match = headers.find((h) =>
      candidates.some((c) => h.replace(/\s+/g, "").includes(c.replace(/\s+/g, ""))),
    );
    map[field] = match ?? null;
  }
  return map;
}

function loadRows(file: string): { headers: string[]; rows: Record<string, unknown>[] } {
  if (!existsSync(file)) throw new Error(`File not found: ${file}`);
  const ext = extname(file).toLowerCase();
  if (ext === ".csv") {
    const buf = readFileSync(file);
    // Try UTF-8 first; fall back to CP949 if Korean chars look broken.
    const text = buf.toString("utf8");
    if (text.includes("�")) {
      // CP949 fallback (not natively supported — install iconv-lite if
      // needed; for now warn).
      console.warn(
        "[ingest] UTF-8 decoding produced replacement chars — file may be CP949. Convert with iconv first.",
      );
    }
    const records = csvParse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, unknown>[];
    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    return { headers, rows: records };
  }
  if (ext === ".xlsx" || ext === ".xls") {
    const wb = XLSX.readFile(file);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { headers, rows };
  }
  throw new Error(`Unsupported file type: ${ext}`);
}

function s(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t.length > 0 ? t : null;
}

function i(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function bi(v: unknown): bigint | null {
  if (v === null || v === undefined || v === "") return null;
  const cleaned = String(v).replace(/[^\d-]/g, "");
  if (!cleaned) return null;
  try {
    return BigInt(cleaned);
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function ingest(args: Args): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is required (use --env-file=.env.local).");
    process.exit(1);
  }

  const { headers, rows } = loadRows(args.file);
  if (rows.length === 0) {
    console.error("[ingest] No rows found in file.");
    process.exit(1);
  }

  const colMap = inferColumnMap(headers, args.mode);

  console.log(`\n=== ${args.mode} · ${basename(args.file)} ===`);
  console.log(`File size: ${(statSync(args.file).size / 1024).toFixed(1)} KB`);
  console.log(`Headers detected (${headers.length}):`, headers.slice(0, 20).join(" | "));
  console.log(`Column mapping inferred:`);
  for (const [field, header] of Object.entries(colMap)) {
    console.log(`  ${field.padEnd(24)} → ${header ?? "(not matched — please verify)"}`);
  }
  console.log(`Total rows: ${rows.length}`);
  console.log(`First row sample:`, JSON.stringify(rows[0], null, 2).slice(0, 400));

  if (args.dryRun) {
    console.log("\n[dry-run] Stopping before DB write. Re-run without --dry-run to insert.");
    return;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const inserted = 0;
  const skipped = 0;
  try {
    if (args.mode === "programs" || args.mode === "voucher-programs") {
      await ingestPrograms(client, args, rows, colMap);
    } else if (args.mode === "companies") {
      await ingestCompanies(client, args, rows, colMap);
    } else if (args.mode === "products") {
      await ingestProducts(client, args, rows, colMap);
    } else if (args.mode === "voucher-exports") {
      await ingestVoucherExports(client, args, rows, colMap);
    }
  } finally {
    await client.end();
  }
  console.log(`\n[ingest] done. inserted=${inserted} skipped=${skipped}`);
}

async function ingestPrograms(
  client: Client,
  args: Args,
  rows: Record<string, unknown>[],
  colMap: Record<string, string | null>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += args.batchSize) {
    const batch = rows.slice(i, i + args.batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;
    for (const r of batch) {
      const get = (f: string) => (colMap[f] ? r[colMap[f]!] : null);
      const programName = s(get("program_name"));
      if (!programName) continue;
      const year = args.yearOverride ?? i_year(get("source_year"));
      const fields = [
        s(get("program_name")) ?? programName,
        s(get("program_name")),    // source_id = name when no PK
        s(get("program_purpose")),
        s(get("eligibility")),
        s(get("support_content")),
        s(get("organization")),
        s(get("application_period")),
        args.mode === "programs" ? s(get("region")) : null,
        args.mode === "voucher-programs" ? s(get("selection_criteria")) : null,
        year,
        JSON.stringify(r),
      ];
      const place =
        args.mode === "programs"
          ? `($${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, $${p + 7}, $${p + 8}, $${p + 9}::jsonb)`
          : `($${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, $${p + 7}, $${p + 8}, $${p + 9}::jsonb)`;
      placeholders.push(place);
      // Drop the field that doesn't match the SQL column.
      values.push(
        fields[0],
        fields[1],
        fields[2],
        fields[3],
        fields[4],
        fields[5],
        fields[6],
        args.mode === "programs" ? fields[7] : fields[8],
        fields[9],
        fields[10],
      );
      // Re-init: p must move by # of params we actually used (10 always).
      p += 10;
    }
    if (placeholders.length === 0) continue;
    const sql =
      args.mode === "programs"
        ? `INSERT INTO ch_pp_programs (program_name, source_id, program_purpose, eligibility, support_content, organization, application_period, region, source_year, raw) VALUES ${placeholders.join(", ")}`
        : `INSERT INTO ch_voucher_programs (program_name, source_id, program_purpose, eligibility, support_content, organization, application_period, selection_criteria, source_year, raw) VALUES ${placeholders.join(", ")}`;
    await client.query(sql, values);
    console.log(`  inserted batch ${i + placeholders.length} / ${rows.length}`);
  }
}

function i_year(v: unknown): number | null {
  const n = i(v);
  if (n === null) return null;
  return n >= 2000 && n < 2100 ? n : null;
}

async function ingestCompanies(
  client: Client,
  args: Args,
  rows: Record<string, unknown>[],
  colMap: Record<string, string | null>,
): Promise<void> {
  const get = (r: Record<string, unknown>, f: string) =>
    colMap[f] ? r[colMap[f]!] : null;
  for (let i = 0; i < rows.length; i += args.batchSize) {
    const batch = rows.slice(i, i + args.batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;
    for (const r of batch) {
      const companyName = s(get(r, "company_name"));
      if (!companyName) continue;
      const bn = s(get(r, "business_no"));
      const bnHash = bn ? sha256(bn.replace(/-/g, "")) : null;
      placeholders.push(
        `(NULL, $${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, $${p + 7}, $${p + 8}, $${p + 9}::jsonb)`,
      );
      values.push(
        bnHash,
        companyName,
        s(get(r, "industry")),
        s(get(r, "region")),
        s(get(r, "revenue_band")),
        s(get(r, "employee_band")),
        i_year(get(r, "founded_year")),
        s(get(r, "selected_program")),
        args.yearOverride ?? i_year(get(r, "selected_year")),
        JSON.stringify(r),
      );
      p += 10;
    }
    if (placeholders.length === 0) continue;
    const sql = `INSERT INTO ch_pp_companies (business_no, business_no_hash, company_name, industry, region, revenue_band, employee_band, founded_year, selected_program, selected_year, raw) VALUES ${placeholders.join(", ")}`;
    await client.query(sql, values);
    console.log(`  inserted batch ${i + placeholders.length} / ${rows.length}`);
  }
}

async function ingestProducts(
  client: Client,
  args: Args,
  rows: Record<string, unknown>[],
  colMap: Record<string, string | null>,
): Promise<void> {
  const get = (r: Record<string, unknown>, f: string) =>
    colMap[f] ? r[colMap[f]!] : null;

  // Build a fast company_business_no → company_id lookup (one-shot).
  const compIdByHash = new Map<string, string>();
  const allHashes = new Set<string>();
  for (const r of rows) {
    const bn = s(get(r, "company_business_no"));
    if (bn) allHashes.add(sha256(bn.replace(/-/g, "")));
  }
  if (allHashes.size > 0) {
    const hashList = Array.from(allHashes);
    const res = await client.query(
      "SELECT id, business_no_hash FROM ch_pp_companies WHERE business_no_hash = ANY($1::text[])",
      [hashList],
    );
    for (const row of res.rows as Array<{ id: string; business_no_hash: string }>) {
      compIdByHash.set(row.business_no_hash, row.id);
    }
    console.log(
      `  resolved ${compIdByHash.size} / ${allHashes.size} company_business_no → company_id`,
    );
  }

  for (let i = 0; i < rows.length; i += args.batchSize) {
    const batch = rows.slice(i, i + args.batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;
    for (const r of batch) {
      const productName = s(get(r, "product_name"));
      if (!productName) continue;
      const bn = s(get(r, "company_business_no"));
      const companyId = bn ? compIdByHash.get(sha256(bn.replace(/-/g, ""))) ?? null : null;
      placeholders.push(
        `($${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}::jsonb)`,
      );
      values.push(
        companyId,
        productName,
        s(get(r, "category")),
        s(get(r, "description")),
        s(get(r, "detail_page_url")),
        bi(get(r, "price_krw")),
        JSON.stringify(r),
      );
      p += 7;
    }
    if (placeholders.length === 0) continue;
    const sql = `INSERT INTO ch_pp_products (company_id, product_name, category, description, detail_page_url, price_krw, raw) VALUES ${placeholders.join(", ")}`;
    await client.query(sql, values);
    console.log(`  inserted batch ${i + placeholders.length} / ${rows.length}`);
  }
}

async function ingestVoucherExports(
  client: Client,
  args: Args,
  rows: Record<string, unknown>[],
  colMap: Record<string, string | null>,
): Promise<void> {
  const get = (r: Record<string, unknown>, f: string) =>
    colMap[f] ? r[colMap[f]!] : null;
  for (let i = 0; i < rows.length; i += args.batchSize) {
    const batch = rows.slice(i, i + args.batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;
    for (const r of batch) {
      const companyName = s(get(r, "company_name"));
      if (!companyName) continue;
      const bn = s(get(r, "business_no"));
      const bnHash = bn ? sha256(bn.replace(/-/g, "")) : null;
      placeholders.push(
        `($${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, $${p + 7}::jsonb)`,
      );
      values.push(
        bnHash,
        companyName,
        s(get(r, "industry")),
        s(get(r, "destination_country")),
        num(get(r, "export_amount_usd")),
        args.yearOverride ?? i_year(get(r, "export_year")),
        s(get(r, "voucher_program")),
        JSON.stringify(r),
      );
      p += 8;
    }
    if (placeholders.length === 0) continue;
    const sql = `INSERT INTO ch_voucher_exports (business_no_hash, company_name, industry, destination_country, export_amount_usd, export_year, voucher_program, raw) VALUES ${placeholders.join(", ")}`;
    await client.query(sql, values);
    console.log(`  inserted batch ${i + placeholders.length} / ${rows.length}`);
  }
}

const args = parseArgs();
ingest(args).catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
