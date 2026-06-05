/**
 * Inject brandStrategy hints into the 3 multi-category v2 brands.
 * Decision-quarter vintage (2017 Q1 ~ 2020 Q4) — no hindsight.
 */
import { createClient } from "@supabase/supabase-js";

const TARGET_WORKSPACE = "0c8e774f-356a-4bf2-ba3d-8bfb41e6d019";

const STRATEGY = [
  {
    productName: "MUSINSA Standard Basics",
    founderBackground:
      "무신사 1세대 패션 D2C 플랫폼 (2003 설립). CEO 조만호 패션 도메인 전문가. Standard 라인은 platform 자체 PB로 매거진 + 기자단 + 자체 쇼룸 (서울 홍대) 활용. ATL 광고 예산 없음, MUSINSA 플랫폼 후광 + KOL piggyback 전략.",
    channelPriority: "online_first",
    kolRelationships:
      "MUSINSA 매거진 콘텐츠 + 인스타그램 mid-tier 인플루언서 (~10만 follower) 자체 보유. Standard 라인 자체 KOL 한정. 일본 직구 비율 자국 외 1위 — JP 한류 패션 매거진 (vogue.jp, mer 등) inbound coverage 있음.",
  },
  {
    productName: "Cuckoo Premium Pressure Rice Cooker",
    founderBackground:
      "쿠쿠 1978 설립, 한국 밥솥 1위 (70%+ 점유). 구본학 CEO 가족 경영. 전통 가전 corporate, 영업·유통 + R&D 중심. 글로벌 진출 = 한식 globalization piggyback + 한인 디아스포라 잡기.",
    channelPriority: "retail_first",
    kolRelationships:
      "공식 KOL 계약 없음. 그러나 한국 음식 YouTube (Maangchi 채널 등) + Korean-American 콘텐츠 자생 추종. K-Drama 한식 장면 PPL 빈번. Costco US 입점 검토 중.",
  },
  {
    productName: "Celltrion Biosimilar (Remsima / Truxima portfolio)",
    founderBackground:
      "셀트리온 1991 설립, 2002 바이오시밀러 본격. CEO 서정진 바이오 도메인 전문가. R&D + 임상 데이터 + regulatory 승인 중심 corporate. 2013 EMA Remsima 승인이 글로벌 진입 첫 anchor.",
    channelPriority: "wholesale_first",
    kolRelationships:
      "의학계 KOL = 학회 발표 + peer-reviewed paper. SNS/influencer marketing 무관. EU 의사 referral 네트워크 확보 (Remsima 처방 경험 confidence). FDA 승인 지연 = US 진입 보류 신호.",
  },
] as const;

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  for (const s of STRATEGY) {
    const { data: existing, error: lookupErr } = await sb
      .from("projects")
      .select("id")
      .eq("workspace_id", TARGET_WORKSPACE)
      .eq("product_name", s.productName)
      .limit(1)
      .maybeSingle();
    if (lookupErr || !existing) {
      console.error(`✗ lookup ${s.productName}:`, lookupErr?.message ?? "not found");
      continue;
    }

    const { error: updateErr } = await sb
      .from("projects")
      .update({
        founder_background: s.founderBackground,
        channel_priority: s.channelPriority,
        kol_relationships: s.kolRelationships,
      })
      .eq("id", existing.id);
    if (updateErr) {
      console.error(`✗ update ${s.productName}:`, updateErr.message);
      continue;
    }
    console.log(`+ ${(existing.id as string).slice(0, 8)} ${s.productName} — ${s.channelPriority}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
