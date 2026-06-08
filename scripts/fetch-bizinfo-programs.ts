/**
 * 기업마당 (bizinfo.go.kr) 지원사업정보 API → ch_pp_programs.
 *
 * 1,385+ 정부 지원사업 공개 데이터 (중기부·산업부·고용부·과기부·문체부·
 * 농식품부 등) — 챌린지 제공 데이터 도착 전 매칭 엔진 작동 데모용.
 *
 * 인증키 발급:
 *   1. https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi 접속
 *   2. 기관(기업)명·신청자명·이메일·전화·시스템명·IP 제출 → 즉시 발급
 *   3. .env.local에 BIZINFO_API_KEY=... 설정
 *
 * Usage:
 *   npm run fetch:bizinfo              # 전체 카테고리 (페이지네이션 자동)
 *   npm run fetch:bizinfo -- --category 01  # 금융만
 *   npm run fetch:bizinfo -- --dry-run       # API 호출만, DB 저장 안 함
 *
 * 카테고리 코드:
 *   01-금융 / 02-기술 / 03-인력 / 04-수출 / 05-내수 /
 *   06-창업 / 07-경영 / 08-기타
 */

import { Client } from "pg";

const BASE_URL = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do";
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

interface BizinfoItem {
  pblancNm?: string;            // 사업공고명
  pldirSportRealmLclasCodeNm?: string;  // 분야 (대)
  pldirSportRealmMlsfcCodeNm?: string;  // 분야 (중)
  jrsdInsttNm?: string;         // 소관기관
  excInsttNm?: string;          // 운영기관
  bsnsSumryCn?: string;         // 사업개요
  trgetNm?: string;             // 지원대상 (요약)
  reqstBeginEndDe?: string;     // 신청기간 (YYYYMMDD~YYYYMMDD)
  pblancUrl?: string;           // 공고 URL
  hashtags?: string;
  pldirSportRealmLclasCode?: string;
  inqireCo?: string;            // 조회수
}

interface BizinfoResponse {
  jsonArray?: BizinfoItem[];
  totalCount?: number;
}

interface Args {
  category: string | null;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const catIdx = argv.indexOf("--category");
  return {
    category: catIdx >= 0 ? argv[catIdx + 1] ?? null : null,
    dryRun: argv.includes("--dry-run"),
  };
}

async function fetchPage(
  apiKey: string,
  category: string | null,
  pageIndex: number,
): Promise<BizinfoResponse> {
  const params = new URLSearchParams({
    crtfcKey: apiKey,
    dataType: "json",
    pageUnit: String(PAGE_SIZE),
    pageIndex: String(pageIndex),
  });
  if (category) params.set("searchLclasId", category);

  const url = `${BASE_URL}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`bizinfo API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const text = await res.text();
  // bizinfo는 jsonArray 키 또는 직접 array 응답 가능 — 둘 다 처리.
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json)) return { jsonArray: json };
    return json as BizinfoResponse;
  } catch {
    throw new Error(`bizinfo non-JSON response: ${text.slice(0, 200)}`);
  }
}

function inferIntent(item: BizinfoItem): "domestic" | "export" {
  // 카테고리 04 = 수출
  if (item.pldirSportRealmLclasCode === "04") return "export";
  // 사업명·분야명·본문·해시태그 통합 키워드 검색 (NFC 정규화 — 한글 unicode 일관성)
  const txt = [
    item.pblancNm,
    item.pldirSportRealmLclasCodeNm,
    item.pldirSportRealmMlsfcCodeNm,
    item.bsnsSumryCn,
    item.hashtags,
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFC")
    .toLowerCase();
  const exportKeywords = [
    "수출", "해외", "글로벌", "무역", "수입", "관세", "fta",
    "export", "overseas", "global", "international",
  ];
  if (exportKeywords.some((k) => txt.includes(k))) return "export";
  return "domestic";
}

async function main() {
  const args = parseArgs();
  const apiKey = process.env.BIZINFO_API_KEY;
  if (!apiKey) {
    console.error(
      "BIZINFO_API_KEY 미설정.\n" +
        "https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi 에서 발급 후\n" +
        ".env.local에 BIZINFO_API_KEY=... 추가하세요.",
    );
    process.exit(1);
  }
  if (!args.dryRun && !process.env.DATABASE_URL) {
    console.error("DATABASE_URL 미설정 (use --env-file=.env.local).");
    process.exit(1);
  }

  console.log(
    `[fetch-bizinfo] category=${args.category ?? "ALL"} pageSize=${PAGE_SIZE} dryRun=${args.dryRun}`,
  );

  const allItems: BizinfoItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    process.stdout.write(`  page ${page} ... `);
    const res = await fetchPage(apiKey, args.category, page);
    const items = res.jsonArray ?? [];
    console.log(`${items.length} items`);
    if (items.length === 0) break;
    allItems.push(...items);
    if (items.length < PAGE_SIZE) break;
    // 짧은 throttle (서버 부담 방지)
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`[fetch-bizinfo] 총 ${allItems.length} 사업 수집됨`);

  if (args.dryRun) {
    console.log("\nsample (first 3):");
    for (const it of allItems.slice(0, 3)) {
      console.log("---");
      console.log(`  사업명: ${it.pblancNm}`);
      console.log(`  소관: ${it.jrsdInsttNm}`);
      console.log(`  분야: ${it.pldirSportRealmLclasCodeNm} / ${it.pldirSportRealmMlsfcCodeNm}`);
      console.log(`  대상: ${(it.trgetNm ?? "").slice(0, 80)}`);
      console.log(`  기간: ${it.reqstBeginEndDe}`);
      console.log(`  intent: ${inferIntent(it)}`);
    }
    return;
  }

  // 분류: 내수 → ch_pp_programs, 수출 → ch_voucher_programs
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let domesticInserted = 0;
  let exportInserted = 0;
  try {
    for (const it of allItems) {
      const intent = inferIntent(it);
      const sourceId = it.pblancUrl ?? it.pblancNm ?? "";
      const programName = it.pblancNm ?? "(이름 없음)";
      const purpose = it.bsnsSumryCn ?? null;
      const eligibility = it.trgetNm ?? null;
      const supportContent = `${it.pldirSportRealmLclasCodeNm ?? ""} / ${it.pldirSportRealmMlsfcCodeNm ?? ""}`.trim();
      const organization = it.jrsdInsttNm ?? it.excInsttNm ?? null;
      const applicationPeriod = it.reqstBeginEndDe ?? null;
      const categoryNormalized = it.pldirSportRealmLclasCodeNm ?? null;

      if (intent === "domestic") {
        await client.query(
          `INSERT INTO ch_pp_programs (source_id, program_name, program_purpose, eligibility, support_content, organization, application_period, category_normalized, raw)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
          [
            sourceId,
            programName,
            purpose,
            eligibility,
            supportContent || null,
            organization,
            applicationPeriod,
            categoryNormalized,
            JSON.stringify(it),
          ],
        );
        domesticInserted++;
      } else {
        await client.query(
          `INSERT INTO ch_voucher_programs (source_id, program_name, eligibility, support_content, organization, application_period, category_normalized, raw)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
          [
            sourceId,
            programName,
            eligibility,
            (purpose ? `${purpose}\n\n` : "") + (supportContent || ""),
            organization,
            applicationPeriod,
            categoryNormalized,
            JSON.stringify(it),
          ],
        );
        exportInserted++;
      }
    }
  } finally {
    await client.end();
  }

  console.log(
    `\n[fetch-bizinfo] ✓ 적재 완료 — 내수 ${domesticInserted} + 수출 ${exportInserted}`,
  );
  console.log("다음 단계: npm run embed:challenge -- pp-programs && npm run embed:challenge -- voucher-programs");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
