/**
 * Inject v0.2-A brandStrategy hints into the 3 multi-category brands
 * (Buldak / KGC / Binggrae) for v0.2-A→E generalization test.
 * Hints are at the brand's overseas-decision quarter (no hindsight).
 */
import { createClient } from "@supabase/supabase-js";

const TARGET_WORKSPACE = "0c8e774f-356a-4bf2-ba3d-8bfb41e6d019";

const STRATEGY = [
  {
    productName: "Samyang Buldak Spicy Chicken Ramen",
    founderBackground:
      "삼양식품 1961년 창립 가족경영 식품 대기업. CEO 김정수 영업총괄 출신. 불닭 brand는 2012년 출시된 corporate 신제품으로 sleeper hit (2016-2017 매출 폭증). 전통 식품 회사 영업·유통 중심 운영, KOL/influencer 전담 조직 부재.",
    channelPriority: "retail_first",
    kolRelationships:
      "공식 KOL 계약 없음. 2017-2018 YouTube에 spicy-challenge 영상 자발 출현 시작 (Mukbang 채널 중심). 마케팅 예산은 광고/유통 중심으로 KOL 직접 활용 안 함. SNS 자생 콘텐츠가 무료 마케팅으로 작동 중.",
  },
  {
    productName: "KGC Cheong Kwan Jang Korean Red Ginseng Extract",
    founderBackground:
      "KGC = 한국인삼공사, KT&G 자회사. 1899년 조선 정부 인삼 전매로 시작, 1995년 민영화. CEO 황건호 (식약처 출신, 2020 임명). 한국 인삼 단일 1위 brand (60%+ 점유). 전통적 보수적 corporate 경영, family-friendly 마케팅.",
    channelPriority: "duty_free_first",
    kolRelationships:
      "전통 광고 (TV·신문) 중심. 한류 스타 광고 모델 (배우 김혜수·황정민) 활용 사례 있음. SNS 인플루언서·KOL 본격 활용 안 함. 미국·동남아 한인 커뮤니티에서 inbound 관심 있음.",
  },
  {
    productName: "Binggrae Banana Milk",
    founderBackground:
      "Binggrae Co. 1967년 창립, 가족경영 출발 후 1989 상장. 바나나우유는 1974년 출시 후 50년 한국 국민음료. CEO 정원섭 (2010~). 전통 corporate 운영. 단지 패키지 디자인은 SNS-친화적 iconic 컨테이너.",
    channelPriority: "wholesale_first",
    kolRelationships:
      "공식 KOL 활용 부족. 그러나 단지 패키지가 Instagram/TikTok 자발 viral content로 자주 등장 (BTS·블랙핑크 멤버들 단지 사진). K-Drama PPL 있음. 해외 한인 커뮤니티 + 한류 팬덤이 인지도 추동.",
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
    console.log(`+ ${(existing.id as string).slice(0, 8)} ${s.productName}`);
    console.log(`   channel: ${s.channelPriority}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
