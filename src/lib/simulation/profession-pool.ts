/**
 * Per-category profession pools for slot-based persona generation.
 *
 * Why this exists:
 * - Soft "diversity rules" in the prompt didn't survive parallel batches.
 *   Each batch independently picks the easiest 1-2 archetypes (대학생 +
 *   일러스트레이터 for KR, 마케팅 매니저 + 바리스타 for US) and the across-
 *   batch result is ~70% concentration on 2 professions.
 * - Pre-assigning each persona slot with a specific base profession from
 *   a wide pool guarantees diversity by construction. The LLM still has
 *   freedom in specialization (e.g. "프리랜서 일러스트레이터 (웹툰 채색
 *   전문)"), age, income, intent, and all other fields — only the base
 *   profession is locked.
 *
 * Pools are locale-keyed; English mirrors KO order so a slot index maps
 * to the same archetype across locales.
 */

import type { PromptLocale } from "./prompts";

interface CategoryPool {
  /** Diverse buyer archetypes for this category, in pool-cycle order. */
  archetypes: string[];
  /** Generic / catch-all professions — capped per simulation to prevent
   *  the LLM from defaulting to them. Map: profession → max occurrences. */
  caps: Record<string, number>;
}

const POOLS_KO: Record<string, CategoryPool> = {
  ip: {
    archetypes: [
      // Creative industry
      "프리랜서 일러스트레이터",
      "만화·웹툰 작가 (신인)",
      "만화·웹툰 작가 (지망생)",
      "캐릭터 디자이너",
      "콘셉트 아티스트",
      "게임 디자이너",
      "콘텐츠 PD",
      "애니메이션 감독·연출",
      // Media & distribution
      "출판사 편집자",
      "라이선싱·MD 매니저",
      "콘텐츠 큐레이터",
      "영상 편집자",
      "PR·홍보 담당자",
      // Fan economy
      "전업 코스플레이어",
      "굿즈샵 운영자",
      "동인 작가",
      "콘텐츠 크리에이터·유튜버",
      "트위치 스트리머",
      "팬 인플루언서",
      // Tech & games
      "게임 개발자",
      "UX·UI 디자이너",
      "모바일 앱 개발자",
      "데이터 분석가",
      // Adjacent (still K-IP relevant)
      "만화방·코믹카페 운영자",
      "일러스트 학원 강사",
      "사진작가",
      "사무직 회사원 (키덜트 수집가)",
      "학부모 (자녀 선물 구매)",
      "은퇴자 (수집가 취미)",
      // Always-eligible (capped — see caps below)
      "대학생",
      "마케팅 매니저",
      "일반 회사원",
    ],
    caps: {
      "대학생": 3,
      "마케팅 매니저": 2,
      "일반 회사원": 2,
    },
  },
  beauty: {
    archetypes: [
      // Beauty industry professionals
      "메이크업 아티스트 (프리랜서)",
      "헤어·뷰티 살롱 매니저",
      "미용사",
      "네일 아티스트",
      "에스테틱 원장",
      "백화점 뷰티 카운슬러",
      "화장품 MD·바이어",
      "패션 에디터",
      // Adjacent professional buyers (high skincare/grooming relevance)
      "약사",
      "피부과 간호사·코디네이터",
      "치과 위생사",
      "호텔리어",
      "항공 승무원",
      "방송 작가·아나운서",
      // Influencer / content
      "뷰티 인플루언서·블로거",
      "뷰티 유튜버",
      // Engaged consumer segments
      "사무직 회사원 (스킨케어 루틴 중시)",
      "서비스직 (메이크업 일상 사용)",
      "프리랜서 디자이너",
      "자녀 둔 직장맘",
      "전업주부",
      "임산부",
      "남성 그루밍 소비자 (직장인)",
      "50대 안티에이징 관심 사무직",
      "피부 트러블 관리 소비자",
      "트랜스·논바이너리 뷰티 소비자",
      "의대·간호대 학생",
      // Always-eligible (capped)
      "대학생",
      "마케팅 매니저",
      "일반 회사원",
    ],
    caps: {
      "대학생": 3,
      "마케팅 매니저": 2,
      "일반 회사원": 2,
    },
  },
  saas: {
    archetypes: [
      // RevOps / GTM decision-makers
      "RevOps 매니저",
      "마케팅 운영 매니저 (Marketing Ops)",
      "B2B 세일즈 매니저",
      "세일즈 인에이블먼트 매니저",
      "카스토머 석세스 매니저",
      "그로스 마케터",
      "콘텐츠 마케터",
      "PR·커뮤니케이션 디렉터",
      // People / Finance / Ops
      "HR Ops 매니저",
      "인사총무 팀장",
      "재무 매니저",
      "경영기획·전략 매니저",
      // Tech buyers
      "IT 인프라 관리자",
      "개발팀 리더",
      "DevOps 엔지니어",
      "데이터 엔지니어",
      "프로덕트 매니저",
      "솔루션 아키텍트",
      // Founders / executives
      "CTO (스타트업)",
      "CEO (SMB·스타트업)",
      "COO",
      // Vertical / consultants
      "디지털 트랜스포메이션 컨설턴트",
      "교육기관 IT 담당",
      "의료 IT 담당",
      "정부·공공기관 IT 담당",
      "소상공인·자영업자 (10명 이하)",
      "프리랜서 컨설턴트",
      "풀스택 디자이너 (스타트업)",
      // Always-eligible (heavily capped — B2B SaaS buyers are professionals)
      "마케팅 매니저",
      "일반 회사원",
      "대학생",
    ],
    caps: {
      "마케팅 매니저": 2,
      "일반 회사원": 2,
      "대학생": 1,
    },
  },
  food: {
    archetypes: [
      // Industry professionals
      "셰프·요리사 (호텔·레스토랑)",
      "베이커리 점주",
      "카페 점주",
      "푸드 스타일리스트",
      "식품 MD·바이어",
      "영양사 (학교·병원)",
      "호텔 F&B 매니저",
      // Influencer / content
      "푸드 블로거·인플루언서",
      "요리 유튜버",
      "와인·스피릿 소믈리에",
      // Health-focused buyers
      "다이어터 (피트니스 진지)",
      "비건·식물성 식단 실천자",
      "글루텐프리·알레르기 관리 소비자",
      "건강기능식품 정기구독자",
      "운동선수·트레이너",
      // Household / family buyers
      "자녀 영양 관리 직장맘",
      "전업주부",
      "초등 자녀 둔 학부모",
      "신혼부부 (장보기 학습 중)",
      "1인 가구 시니어",
      // Convenience / D2C buyers
      "자취 직장인 (HMR 의존)",
      "야간 근무자 (편의점 식사 중심)",
      "캠핑·아웃도어 푸드 마니아",
      "홈카페·홈베이킹 마니아",
      // Adjacent
      "의료인 (식이 권고 영향력)",
      "식음료 박람회 참관 바이어",
      "구독 박스 큐레이터",
      // Always-eligible (capped)
      "대학생",
      "마케팅 매니저",
      "일반 회사원",
    ],
    caps: {
      "대학생": 3,
      "마케팅 매니저": 2,
      "일반 회사원": 2,
    },
  },
  health: {
    archetypes: [
      // Healthcare professionals
      "약사",
      "약국 운영자",
      "의사 (가정의학·내과)",
      "간호사",
      "영양사",
      // Fitness / sports
      "피트니스 트레이너 (PT·헬스장 운영)",
      "요가·필라테스 강사",
      "스포츠 코치·감독",
      "세미프로 운동선수",
      "등산·러닝 동호회원",
      // Condition-driven buyers
      "만성질환 관리자 (당뇨·고혈압)",
      "알레르기·자가면역 관리자",
      "회복기 환자 (수술 후·암 관해)",
      "수면 트래킹 마니아",
      // Life-stage buyers
      "임산부·수유부",
      "생후 1년차 부모 (아기 영양 관심)",
      "갱년기 관리 50대 여성",
      "안티에이징 관심 30대 여성",
      "은퇴자 (자기 건강 관리)",
      "시니어 케어 (노부모 돌봄 중)",
      "근감소 예방 관심 60+",
      // Adjacent / influencers
      "헬스케어 D2C 스타트업 마케터",
      "보험사 헬스케어 매니저",
      "건강 유튜버·블로거",
      "명상·웰니스 강사",
      "다이어트 진지 사무직",
      "비건·식물성 보충제 사용자",
      // Always-eligible (capped — health buyers skew older / professional)
      "대학생",
      "마케팅 매니저",
      "일반 회사원",
    ],
    caps: {
      "대학생": 2,
      "마케팅 매니저": 2,
      "일반 회사원": 2,
    },
  },
  fashion: {
    archetypes: [
      // Industry professionals
      "패션 에디터",
      "스타일리스트 (광고·연예인)",
      "패션 MD·바이어",
      "브랜드 인하우스 디자이너",
      "프리랜서 패션 디자이너",
      "편집숍 바이어",
      "빈티지샵 운영자",
      "모델 (프리랜서)",
      // Influencer / content
      "패션 인플루언서 (Instagram)",
      "패션 유튜버",
      // Adjacent professional buyers
      "사진작가",
      "음악·예술 종사자",
      "항공 승무원",
      "호텔리어",
      // Engaged consumer segments
      "사무직 (오피스룩 진지)",
      "IT 직장인 (스니커즈·캐주얼 마니아)",
      "서비스직 (드레스코드 직군)",
      "결혼식·정장 자주 입는 직장인",
      "운동복·애슬레저 마니아",
      "캠핑·아웃도어 패션 마니아",
      "자녀 옷 자주 사는 직장맘",
      "빅사이즈·플러스 사이즈 소비자",
      "임산부 (임부복)",
      "시니어 (50+ 패션 관심)",
      "세컨드핸드·resale 활동자",
      "모데스트 패션 소비자",
      "드랙·스트리트 컬처 종사자",
      // Always-eligible (capped — students relevant for fashion)
      "대학생",
      "마케팅 매니저",
      "일반 회사원",
    ],
    caps: {
      "대학생": 3,
      "마케팅 매니저": 2,
      "일반 회사원": 2,
    },
  },
  electronics: {
    archetypes: [
      // Pro tech buyers
      "IT 인프라 관리자",
      "백엔드·풀스택 개발자",
      "게임 개발자",
      "데이터 사이언티스트",
      "UX·UI 디자이너",
      "프로덕트 매니저",
      // Creator / production
      "영상 편집자",
      "전문 사진작가",
      "음향 엔지니어",
      "음악 프로듀서",
      "유튜버 (장비 리뷰)",
      "스트리머·트위치 방송인",
      // Gamers
      "PC 빌더·게임 마니아",
      "하드코어 모바일 게이머",
      // Home / family
      "원격근무 사무직 (홈오피스 셋업)",
      "스마트홈 마니아",
      "자녀 둔 학부모 (디지털 기기 구매)",
      "시니어 부모 (사용 학습 중)",
      "헬스 트래커 마니아 (스마트워치)",
      "의료기기 사용자 (혈압·당뇨 등)",
      // Lifestyle / niche
      "캠핑·아웃도어 가전 마니아 (휴대 전원)",
      "차량용 액세서리 소비자 (출퇴근 운전자)",
      "키덜트 수집가 (레트로·콜렉터블 가전)",
      "요리 유튜버 (주방가전)",
      // SMB / commercial
      "카페·소상공인 (커머셜 가전)",
      "1인 사업자 (POS·B2B 디바이스)",
      "학원 강사 (디지털 수업 도구)",
      // Always-eligible (capped)
      "대학생",
      "마케팅 매니저",
      "일반 회사원",
    ],
    caps: {
      "대학생": 2,
      "마케팅 매니저": 2,
      "일반 회사원": 2,
    },
  },
  home: {
    archetypes: [
      // Household formations
      "신혼부부",
      "동거 커플 (혼인 전)",
      "자녀 둔 직장맘",
      "자녀 둔 직장 아빠",
      "다자녀 가정",
      "전업주부",
      "1인 가구 직장인 (자취)",
      "1인 가구 시니어",
      "룸메이트 공동생활자",
      // Industry / professional
      "인테리어 디자이너 (프리랜서)",
      "가구·소품 MD·바이어",
      "인테리어·홈스타일링 인플루언서",
      "Airbnb·게스트하우스 호스트",
      "카페·소상공인 (공간 꾸밈)",
      // Lifestyle segments
      "셀프 인테리어 마니아 (DIY)",
      "미니멀리스트 라이프스타일러",
      "홈카페·홈베이킹 마니아",
      "캠핑카·차박 라이프스타일러",
      "제로웨이스트 실천자",
      // Life events
      "신축 입주자",
      "이사 자주 다니는 직장인",
      "임차인 (전월세 비용 의식)",
      // Specialty buyers
      "반려동물 보호자 (펫 가구·용품)",
      "베이비·키즈 가구 구매 부모",
      "시니어 부모 (안전 가구 교체)",
      "분리수거·정리 정돈 마니아",
      "풍수·인테리어 운세 관심층",
      // Always-eligible (capped — students less central for home)
      "대학생",
      "마케팅 매니저",
      "일반 회사원",
    ],
    caps: {
      "대학생": 2,
      "마케팅 매니저": 2,
      "일반 회사원": 2,
    },
  },
};

const POOLS_EN: Record<string, CategoryPool> = {
  ip: {
    archetypes: [
      // Creative industry
      "Freelance illustrator",
      "Manga / webtoon author (debut)",
      "Manga / webtoon author (aspiring)",
      "Character designer",
      "Concept artist",
      "Game designer",
      "Content PD",
      "Animation director",
      // Media & distribution
      "Publishing-house editor",
      "Licensing / MD manager",
      "Content curator",
      "Video editor",
      "PR specialist",
      // Fan economy
      "Full-time cosplayer",
      "Merch-shop owner",
      "Doujin author",
      "Content creator / YouTuber",
      "Twitch streamer",
      "Fan influencer",
      // Tech & games
      "Game developer",
      "UX / UI designer",
      "Mobile app developer",
      "Data analyst",
      // Adjacent
      "Manga café / comic-shop owner",
      "Illustration academy instructor",
      "Photographer",
      "Office worker (kidult collector)",
      "Parent buying for children",
      "Retiree (hobbyist collector)",
      // Always-eligible (capped)
      "College student",
      "Marketing manager",
      "Office worker",
    ],
    caps: {
      "College student": 3,
      "Marketing manager": 2,
      "Office worker": 2,
    },
  },
  beauty: {
    archetypes: [
      // Beauty industry professionals
      "Freelance makeup artist",
      "Hair & beauty salon manager",
      "Hairstylist",
      "Nail artist",
      "Esthetician (clinic owner)",
      "Department store beauty counselor",
      "Cosmetics MD / buyer",
      "Fashion editor",
      // Adjacent professional buyers
      "Pharmacist",
      "Dermatology clinic nurse / coordinator",
      "Dental hygienist",
      "Hotel staff",
      "Flight attendant",
      "Broadcast writer / news anchor",
      // Influencer / content
      "Beauty influencer / blogger",
      "Beauty YouTuber",
      // Engaged consumer segments
      "Office worker (skincare-routine focused)",
      "Service industry (daily makeup user)",
      "Freelance designer",
      "Working mother (with kids)",
      "Full-time homemaker",
      "Expecting mother",
      "Male grooming consumer (office worker)",
      "Anti-aging focused 50s office worker",
      "Acne / skin-issue management consumer",
      "Trans / non-binary beauty consumer",
      "Medical / nursing student",
      // Always-eligible (capped)
      "College student",
      "Marketing manager",
      "Office worker",
    ],
    caps: {
      "College student": 3,
      "Marketing manager": 2,
      "Office worker": 2,
    },
  },
  saas: {
    archetypes: [
      // RevOps / GTM decision-makers
      "RevOps manager",
      "Marketing Operations manager",
      "B2B Sales manager",
      "Sales Enablement manager",
      "Customer Success manager",
      "Growth marketer",
      "Content marketer",
      "PR / Communications director",
      // People / Finance / Ops
      "HR Operations manager",
      "HR & Admin team lead",
      "Finance manager",
      "Corporate strategy manager",
      // Tech buyers
      "IT infrastructure manager",
      "Engineering team lead",
      "DevOps engineer",
      "Data engineer",
      "Product manager",
      "Solution architect",
      // Founders / executives
      "Startup CTO",
      "SMB / startup CEO",
      "COO",
      // Vertical / consultants
      "Digital transformation consultant",
      "Education sector IT lead",
      "Healthcare IT lead",
      "Government / public-sector IT lead",
      "SMB owner (under 10 employees)",
      "Freelance consultant",
      "Full-stack designer (startup)",
      // Always-eligible (heavily capped)
      "Marketing manager",
      "Office worker",
      "College student",
    ],
    caps: {
      "Marketing manager": 2,
      "Office worker": 2,
      "College student": 1,
    },
  },
  food: {
    archetypes: [
      // Industry professionals
      "Chef / cook (hotel / restaurant)",
      "Bakery owner",
      "Café owner",
      "Food stylist",
      "Food MD / buyer",
      "Dietitian (school / hospital)",
      "Hotel F&B manager",
      // Influencer / content
      "Food blogger / influencer",
      "Cooking YouTuber",
      "Wine / spirits sommelier",
      // Health-focused buyers
      "Serious dieter (fitness-driven)",
      "Vegan / plant-based eater",
      "Gluten-free / allergy management consumer",
      "Health supplement subscriber",
      "Athlete / personal trainer",
      // Household / family buyers
      "Nutrition-focused working mother",
      "Full-time homemaker",
      "Parent of elementary kids",
      "Newlywed (learning grocery shopping)",
      "Senior single-person household",
      // Convenience / D2C buyers
      "Single working professional (HMR-dependent)",
      "Night-shift worker (convenience-store meals)",
      "Camping / outdoor food enthusiast",
      "Home café / home baking enthusiast",
      // Adjacent
      "Medical professional (dietary advice influencer)",
      "Food expo trade buyer",
      "Subscription-box curator",
      // Always-eligible (capped)
      "College student",
      "Marketing manager",
      "Office worker",
    ],
    caps: {
      "College student": 3,
      "Marketing manager": 2,
      "Office worker": 2,
    },
  },
  health: {
    archetypes: [
      // Healthcare professionals
      "Pharmacist",
      "Pharmacy owner",
      "Family / internal medicine physician",
      "Nurse",
      "Dietitian",
      // Fitness / sports
      "Fitness trainer (PT / gym owner)",
      "Yoga / Pilates instructor",
      "Sports coach / director",
      "Semi-pro athlete",
      "Hiking / running club member",
      // Condition-driven buyers
      "Chronic-condition manager (diabetes / hypertension)",
      "Allergy / autoimmune manager",
      "Recovery patient (post-surgery / cancer remission)",
      "Sleep-tracking enthusiast",
      // Life-stage buyers
      "Pregnant / nursing mother",
      "Parent of infant (first-year nutrition)",
      "Menopausal management 50s woman",
      "Anti-aging focused 30s woman",
      "Retiree (own-health management)",
      "Senior caregiver (caring for elderly parents)",
      "Sarcopenia-prevention focused 60+",
      // Adjacent / influencers
      "Healthcare D2C startup marketer",
      "Insurer healthcare manager",
      "Health YouTuber / blogger",
      "Meditation / wellness instructor",
      "Diet-serious office worker",
      "Vegan / plant-based supplement user",
      // Always-eligible (capped)
      "College student",
      "Marketing manager",
      "Office worker",
    ],
    caps: {
      "College student": 2,
      "Marketing manager": 2,
      "Office worker": 2,
    },
  },
  fashion: {
    archetypes: [
      // Industry professionals
      "Fashion editor",
      "Stylist (advertising / celebrity)",
      "Fashion MD / buyer",
      "In-house brand designer",
      "Freelance fashion designer",
      "Concept-store buyer",
      "Vintage shop owner",
      "Freelance model",
      // Influencer / content
      "Fashion influencer (Instagram)",
      "Fashion YouTuber",
      // Adjacent professional buyers
      "Photographer",
      "Music / arts professional",
      "Flight attendant",
      "Hotel staff",
      // Engaged consumer segments
      "Office worker (office-look focused)",
      "Tech worker (sneaker / casual enthusiast)",
      "Service industry (uniform / dress-code role)",
      "Office worker (frequent suit / formal wear)",
      "Athleisure / activewear enthusiast",
      "Camping / outdoor fashion enthusiast",
      "Working mom buying kids' clothes often",
      "Plus-size consumer",
      "Expecting mother (maternity wear)",
      "Senior (50+ fashion-engaged)",
      "Secondhand / resale active buyer",
      "Modest-fashion consumer",
      "Drag / street culture professional",
      // Always-eligible (capped)
      "College student",
      "Marketing manager",
      "Office worker",
    ],
    caps: {
      "College student": 3,
      "Marketing manager": 2,
      "Office worker": 2,
    },
  },
  electronics: {
    archetypes: [
      // Pro tech buyers
      "IT infrastructure manager",
      "Backend / full-stack developer",
      "Game developer",
      "Data scientist",
      "UX / UI designer",
      "Product manager",
      // Creator / production
      "Video editor",
      "Professional photographer",
      "Audio engineer",
      "Music producer",
      "Gear-review YouTuber",
      "Streamer / Twitch broadcaster",
      // Gamers
      "PC builder / gaming enthusiast",
      "Hardcore mobile gamer",
      // Home / family
      "Remote-work office worker (home-office setup)",
      "Smart-home enthusiast",
      "Parent buying digital devices for kids",
      "Senior parent (learning to use)",
      "Health-tracker enthusiast (smartwatch)",
      "Medical-device user (BP / glucose etc.)",
      // Lifestyle / niche
      "Camping / outdoor electronics enthusiast (portable power)",
      "Car-accessories consumer (commuter driver)",
      "Kidult collector (retro / collectible electronics)",
      "Cooking YouTuber (kitchen appliances)",
      // SMB / commercial
      "Café / SMB owner (commercial appliances)",
      "Solo entrepreneur (POS / B2B devices)",
      "Academy instructor (digital teaching tools)",
      // Always-eligible (capped)
      "College student",
      "Marketing manager",
      "Office worker",
    ],
    caps: {
      "College student": 2,
      "Marketing manager": 2,
      "Office worker": 2,
    },
  },
  home: {
    archetypes: [
      // Household formations
      "Newlyweds",
      "Cohabiting couple (pre-marriage)",
      "Working mother (with kids)",
      "Working father (with kids)",
      "Family with multiple kids",
      "Full-time homemaker",
      "Single working professional (living alone)",
      "Single senior household",
      "Roommates / co-living",
      // Industry / professional
      "Freelance interior designer",
      "Furniture / decor MD / buyer",
      "Interior / home-styling influencer",
      "Airbnb / guesthouse host",
      "Café / SMB owner (space styling)",
      // Lifestyle segments
      "Self-interior DIY enthusiast",
      "Minimalist lifestyle adopter",
      "Home café / home baking enthusiast",
      "Camper-van / car-camping lifestyler",
      "Zero-waste practitioner",
      // Life events
      "New-build resident",
      "Frequent-mover office worker",
      "Renter (cost-conscious lease)",
      // Specialty buyers
      "Pet owner (pet furniture / supplies)",
      "Parent buying baby / kids furniture",
      "Senior parent (replacing for safety)",
      "Decluttering / organizing enthusiast",
      "Feng-shui / lifestyle-fortune interested",
      // Always-eligible (capped)
      "College student",
      "Marketing manager",
      "Office worker",
    ],
    caps: {
      "College student": 2,
      "Marketing manager": 2,
      "Office worker": 2,
    },
  },
};

export interface PersonaSlot {
  country: string;
  /** Empty string when category has no pool — slot is free for the LLM. */
  profession: string;
}

/** Returns the profession pool for the category, or null when the category
 *  has no pre-assigned pool (LLM gets free profession choice instead). */
export function getProfessionPool(
  category: string,
  locale: PromptLocale,
): CategoryPool | null {
  const map = locale === "ko" ? POOLS_KO : POOLS_EN;
  return map[category] ?? null;
}

/**
 * Deterministic-ish shuffle (Fisher-Yates) using a simple LCG seed so the
 * profession order rotates across runs without depending on Math.random
 * timing — same simulationId reproduces, but different sims get different
 * orderings.
 */
function shuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Hash a string into a 32-bit seed for the shuffle. */
function seedFromString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Pre-assign a profession to every persona slot, guaranteeing across-batch
 * diversity by construction. Slots are returned in a deterministic order
 * derived from `seed` (use simulationId for reproducibility); caller decides
 * how to slice them across parallel batches.
 *
 * Algorithm:
 *   1. Even-distribute total count across candidate countries (existing
 *      computeCountryQuota logic, replicated here so this module is
 *      self-contained).
 *   2. Shuffle the category's archetype pool.
 *   3. For each persona slot, advance through the pool — skip any
 *      profession that has hit its cap. Wrap around if the pool is shorter
 *      than the slot count.
 *
 * For categories without a pool, returns slots with `profession: ""` —
 * the prompt then falls back to free-choice generation with the diversity
 * rule guidance.
 */
export function planSlots(
  personaCount: number,
  candidateCountries: string[],
  category: string,
  locale: PromptLocale,
  seed: string,
): PersonaSlot[] {
  if (candidateCountries.length === 0) return [];

  // Even split across countries (mirrors computeCountryQuota in runner.ts).
  const base = Math.floor(personaCount / candidateCountries.length);
  const remainder = personaCount - base * candidateCountries.length;
  const perCountry: Record<string, number> = {};
  candidateCountries.forEach((c, i) => {
    perCountry[c] = base + (i < remainder ? 1 : 0);
  });

  const pool = getProfessionPool(category, locale);
  if (!pool) {
    // No pool — slots carry country only.
    const slots: PersonaSlot[] = [];
    for (const [country, count] of Object.entries(perCountry)) {
      for (let i = 0; i < count; i++) slots.push({ country, profession: "" });
    }
    return slots;
  }

  const shuffled = shuffle(pool.archetypes, seedFromString(seed));
  const used = new Map<string, number>();
  const slots: PersonaSlot[] = [];
  let cursor = 0;

  for (const [country, count] of Object.entries(perCountry)) {
    for (let i = 0; i < count; i++) {
      // Find next archetype that hasn't hit its cap. Wrap if needed.
      let attempts = 0;
      let chosen = "";
      while (attempts < shuffled.length * 2) {
        const candidate = shuffled[cursor % shuffled.length];
        cursor++;
        attempts++;
        const cap = pool.caps[candidate] ?? Infinity;
        const usedCount = used.get(candidate) ?? 0;
        if (usedCount < cap) {
          used.set(candidate, usedCount + 1);
          chosen = candidate;
          break;
        }
      }
      // Fallback if all caps exhausted (should be rare — happens only when
      // personaCount > pool size + sum of caps): just use the next candidate.
      if (!chosen) {
        chosen = shuffled[cursor % shuffled.length];
        cursor++;
      }
      slots.push({ country, profession: chosen });
    }
  }
  return slots;
}
