-- KR reference data — Phase A seed (manually curated from KOSIS / 통계청 sources).
-- This is a stopgap until the automated KOSIS fetcher (Phase A.2.5) lands.
-- All figures are approximations of public statistics and rounded to be
-- realistic anchors, not precise authoritative values.
--
-- Sources informing the values below:
--   • KOSIS 임금구조 기본통계조사 2023
--   • KOSIS 가계금융복지조사 2023
--   • 통계청 사회조사 (소비자 행동) 2023
--   • 한국소비자원 식품 선택 영향 요인 조사
--
-- Re-run safely: ON CONFLICT DO UPDATE makes this idempotent.

-- ─── country_stats ─────────────────────────────────────────────
insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('KR', 2024, 'South Korea', '대한민국', 'KRW',
   51740000, 67500000, 33800,
   'KOSIS 가계금융복지조사 2023', 'https://kosis.kr')
on conflict (country_code, data_year) do update set
  country_name_en = excluded.country_name_en,
  country_name_local = excluded.country_name_local,
  currency = excluded.currency,
  population = excluded.population,
  median_household_income = excluded.median_household_income,
  gdp_per_capita_usd = excluded.gdp_per_capita_usd,
  source = excluded.source,
  source_url = excluded.source_url,
  fetched_at = now();

-- ─── country_profession_income ────────────────────────────────
-- Annual personal income, in KRW. Curated to span employed + non-employed
-- life stages so the persona prompt has realistic anchors for each.

with rows(profession_canonical, profession_localized, life_stage, age_group,
          p25, median, p75, display_ko, display_en) as (values
  -- Employed — common professions across age bands
  ('elementary_teacher',
   '{"ko":"초등학교 교사","en":"Elementary School Teacher"}'::jsonb,
   'employed', '20-29', 30000000::numeric, 35000000::numeric, 40000000::numeric,
   '연 ₩30M-₩40M (~$23-30k USD)', '₩30M-₩40M annually (~$23-30k USD)'),
  ('elementary_teacher',
   '{"ko":"초등학교 교사","en":"Elementary School Teacher"}'::jsonb,
   'employed', '30-39', 42000000, 48000000, 55000000,
   '연 ₩42M-₩55M (~$32-42k USD)', '₩42M-₩55M annually (~$32-42k USD)'),
  ('elementary_teacher',
   '{"ko":"초등학교 교사","en":"Elementary School Teacher"}'::jsonb,
   'employed', '40-49', 55000000, 65000000, 75000000,
   '연 ₩55M-₩75M (~$42-57k USD)', '₩55M-₩75M annually (~$42-57k USD)'),

  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '20-29', 28000000, 35000000, 42000000,
   '연 ₩28M-₩42M (~$21-32k USD)', '₩28M-₩42M annually (~$21-32k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 38000000, 48000000, 60000000,
   '연 ₩38M-₩60M (~$29-46k USD)', '₩38M-₩60M annually (~$29-46k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '40-49', 50000000, 65000000, 80000000,
   '연 ₩50M-₩80M (~$38-61k USD)', '₩50M-₩80M annually (~$38-61k USD)'),

  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어","en":"Senior Software Engineer"}'::jsonb,
   'employed', '30-39', 75000000, 95000000, 130000000,
   '연 ₩75M-₩130M (~$57-99k USD)', '₩75M-₩130M annually (~$57-99k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어","en":"Senior Software Engineer"}'::jsonb,
   'employed', '40-49', 100000000, 130000000, 180000000,
   '연 ₩100M-₩180M (~$76-137k USD)', '₩100M-₩180M annually (~$76-137k USD)'),

  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 50000000, 65000000, 85000000,
   '연 ₩50M-₩85M (~$38-65k USD)', '₩50M-₩85M annually (~$38-65k USD)'),

  ('nurse',
   '{"ko":"간호사","en":"Nurse"}'::jsonb,
   'employed', '20-29', 35000000, 42000000, 50000000,
   '연 ₩35M-₩50M (~$27-38k USD)', '₩35M-₩50M annually (~$27-38k USD)'),
  ('nurse',
   '{"ko":"간호사","en":"Nurse"}'::jsonb,
   'employed', '30-39', 45000000, 55000000, 68000000,
   '연 ₩45M-₩68M (~$34-52k USD)', '₩45M-₩68M annually (~$34-52k USD)'),

  ('doctor',
   '{"ko":"의사","en":"Physician"}'::jsonb,
   'employed', '30-39', 90000000, 130000000, 200000000,
   '연 ₩90M-₩200M (~$68-152k USD)', '₩90M-₩200M annually (~$68-152k USD)'),
  ('doctor',
   '{"ko":"의사","en":"Physician"}'::jsonb,
   'employed', '40-49', 130000000, 200000000, 350000000,
   '연 ₩130M-₩350M (~$99-266k USD)', '₩130M-₩350M annually (~$99-266k USD)'),

  ('barista',
   '{"ko":"바리스타","en":"Barista"}'::jsonb,
   'employed', '20-29', 24000000, 28000000, 33000000,
   '연 ₩24M-₩33M (~$18-25k USD)', '₩24M-₩33M annually (~$18-25k USD)'),

  ('production_worker',
   '{"ko":"생산직 근로자","en":"Production Worker"}'::jsonb,
   'employed', '30-39', 35000000, 42000000, 52000000,
   '연 ₩35M-₩52M (~$27-40k USD)', '₩35M-₩52M annually (~$27-40k USD)'),

  ('small_business_owner',
   '{"ko":"자영업자 (소상공인)","en":"Small Business Owner"}'::jsonb,
   'self_employed', '40-49', 30000000, 50000000, 80000000,
   '사업소득 연 ₩30M-₩80M (변동 큼, ~$23-61k USD)', 'Annual ₩30M-₩80M (highly variable, ~$23-61k USD)'),

  -- Non-employed life stages
  ('college_student',
   '{"ko":"대학생","en":"College Student"}'::jsonb,
   'student', '20-29', 2000000, 5000000, 9000000,
   '용돈+알바 연 ₩2M-₩9M (~$1.5-7k USD), 부모 지원 별도',
   'Allowance + part-time ₩2M-₩9M/yr (~$1.5-7k USD)'),

  ('high_school_student',
   '{"ko":"고등학생","en":"High School Student"}'::jsonb,
   'student', '20-29', 600000, 1200000, 2000000,
   '용돈 연 ₩600k-₩2M (~$450-1.5k USD)',
   'Allowance only ₩600k-₩2M/yr (~$450-1.5k USD)'),

  ('homemaker',
   '{"ko":"전업주부","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 ₩60M-₩90M, 본인 가처분 월 ₩300k-₩600k',
   'No personal salary. Household ₩60M-₩90M/yr; personal disposable ₩300k-₩600k/month'),
  ('homemaker',
   '{"ko":"전업주부","en":"Homemaker"}'::jsonb,
   'homemaker', '40-49', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 ₩70M-₩110M, 본인 가처분 월 ₩400k-₩800k',
   'No personal salary. Household ₩70M-₩110M/yr; personal disposable ₩400k-₩800k/month'),

  ('retiree',
   '{"ko":"은퇴자","en":"Retiree"}'::jsonb,
   'retiree', '60+', 12000000, 20000000, 32000000,
   '국민연금+개인연금 연 ₩12M-₩32M (~$9-24k USD)',
   'Pension ₩12M-₩32M/yr (~$9-24k USD)'),

  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 12000000, 18000000, 26000000,
   '연 ₩12M-₩26M (~$9-20k USD)', '₩12M-₩26M annually (~$9-20k USD)'),

  -- Industry-adjacent professions for IP / content / creator-economy targeting.
  -- Without these, ko-locale runs over-cluster on 'student' and 'teacher'
  -- because those were the most prominent reference anchors.
  ('graphic_designer',
   '{"ko":"그래픽 디자이너","en":"Graphic Designer"}'::jsonb,
   'employed', '20-29', 26000000, 32000000, 42000000,
   '연 ₩26M-₩42M (~$20-32k USD)', '₩26M-₩42M annually (~$20-32k USD)'),
  ('graphic_designer',
   '{"ko":"그래픽 디자이너","en":"Graphic Designer"}'::jsonb,
   'employed', '30-39', 38000000, 50000000, 65000000,
   '연 ₩38M-₩65M (~$29-50k USD)', '₩38M-₩65M annually (~$29-50k USD)'),

  ('ux_designer',
   '{"ko":"UX·UI 디자이너","en":"UX / UI Designer"}'::jsonb,
   'employed', '20-29', 32000000, 42000000, 55000000,
   '연 ₩32M-₩55M (~$24-42k USD)', '₩32M-₩55M annually (~$24-42k USD)'),
  ('ux_designer',
   '{"ko":"UX·UI 디자이너","en":"UX / UI Designer"}'::jsonb,
   'employed', '30-39', 50000000, 70000000, 95000000,
   '연 ₩50M-₩95M (~$38-72k USD)', '₩50M-₩95M annually (~$38-72k USD)'),

  ('illustrator',
   '{"ko":"일러스트레이터","en":"Illustrator"}'::jsonb,
   'self_employed', '20-29', 18000000, 28000000, 45000000,
   '프리랜서 연 ₩18M-₩45M (변동 큼, ~$14-34k USD)',
   'Freelance ₩18M-₩45M annually (highly variable, ~$14-34k USD)'),
  ('illustrator',
   '{"ko":"일러스트레이터","en":"Illustrator"}'::jsonb,
   'self_employed', '30-39', 28000000, 45000000, 70000000,
   '프리랜서 연 ₩28M-₩70M (~$21-53k USD)',
   'Freelance ₩28M-₩70M annually (~$21-53k USD)'),

  ('freelance_creator',
   '{"ko":"프리랜서 콘텐츠 크리에이터","en":"Freelance Content Creator"}'::jsonb,
   'self_employed', '20-29', 12000000, 30000000, 80000000,
   '프리랜서 연 ₩12M-₩80M (변동 매우 큼, ~$9-61k USD)',
   'Freelance ₩12M-₩80M annually (highly variable, ~$9-61k USD)'),
  ('freelance_creator',
   '{"ko":"프리랜서 콘텐츠 크리에이터","en":"Freelance Content Creator"}'::jsonb,
   'self_employed', '30-39', 20000000, 50000000, 150000000,
   '프리랜서 연 ₩20M-₩150M (~$15-114k USD)',
   'Freelance ₩20M-₩150M annually (~$15-114k USD)'),

  ('content_planner',
   '{"ko":"콘텐츠 기획자·PD","en":"Content Planner / PD"}'::jsonb,
   'employed', '30-39', 45000000, 60000000, 80000000,
   '연 ₩45M-₩80M (~$34-61k USD)', '₩45M-₩80M annually (~$34-61k USD)'),
  ('content_planner',
   '{"ko":"콘텐츠 기획자·PD","en":"Content Planner / PD"}'::jsonb,
   'employed', '40-49', 60000000, 80000000, 110000000,
   '연 ₩60M-₩110M (~$46-84k USD)', '₩60M-₩110M annually (~$46-84k USD)'),

  ('marketing_assistant',
   '{"ko":"마케팅·기획 (주니어)","en":"Marketing / Planning (Junior)"}'::jsonb,
   'employed', '20-29', 30000000, 38000000, 48000000,
   '연 ₩30M-₩48M (~$23-37k USD)', '₩30M-₩48M annually (~$23-37k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'KR', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'KRW',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'KOSIS 임금구조 기본통계조사 2023'
from rows
on conflict (country_code, profession_canonical, age_group, data_year, life_stage)
  do update set
    income_p25 = excluded.income_p25,
    income_median = excluded.income_median,
    income_p75 = excluded.income_p75,
    display_band = excluded.display_band,
    profession_localized = excluded.profession_localized;

-- ─── country_consumer_norms ───────────────────────────────────
-- Curated from 통계청 사회조사 + 한국소비자원 보고서. These describe
-- real cultural patterns Korean consumers exhibit per category.

insert into public.country_consumer_norms
  (country_code, data_year, category, trust_factors, common_objections,
   preferred_channels, cultural_notes, source)
values
  ('KR', 2024, 'food',
   '{"ko":["식약처 인증 (HACCP/유기농 등)","원산지 표기","맘카페·블로그 후기","대형마트 PB 신뢰","유명 셰프·전문가 추천"],"en":["KFDA certifications (HACCP / organic)","Country-of-origin label","Mom-cafe / blog reviews","Trust in major retailer PB","Chef / expert endorsement"]}'::jsonb,
   '{"ko":["가격이 비쌈","유사 제품이 너무 많음","맛이 검증 안 됨","과대광고 의심","유효기간·신선도 우려"],"en":["Price too high","Crowded with similar products","Taste unproven","Skeptical of marketing claims","Concerns about freshness / shelf life"]}'::jsonb,
   '{"ko":["쿠팡","네이버 스마트스토어","마켓컬리","SSG/이마트몰","오프라인 대형마트","편의점"],"en":["Coupang","Naver Smart Store","Market Kurly","SSG/Emart Mall","Offline hypermarkets","Convenience stores"]}'::jsonb,
   'Korean consumers value certifications heavily and are influenced by mom-cafe (맘카페) word-of-mouth. Convenience-store distribution drives impulse purchases for snacks. Premium positioning works if backed by ingredient transparency.',
   '한국소비자원 식품선택 영향요인 조사 2023'),

  ('KR', 2024, 'beauty',
   '{"ko":["성분표 (EWG 등급)","올리브영·다이소 매대 진열","뷰티 유튜버·인플루언서 리뷰","임상 시험 결과","K-뷰티 브랜드 신뢰"],"en":["Ingredient list (EWG grade)","Olive Young / Daiso shelf placement","Beauty YouTuber / influencer reviews","Clinical trial results","K-beauty brand trust"]}'::jsonb,
   '{"ko":["피부 트러블 우려","비싼 가격","유사 제품이 너무 많음","마케팅 과장 우려"],"en":["Skin reaction concerns","Premium price","Saturated similar products","Marketing exaggeration"]}'::jsonb,
   '{"ko":["올리브영","쿠팡","네이버","무신사 뷰티","면세점","공식 브랜드몰"],"en":["Olive Young","Coupang","Naver","Musinsa Beauty","Duty-free","Brand DTC"]}'::jsonb,
   'Olive Young is the dominant offline+online channel. Influencer-led trends move fast. Korean consumers are highly ingredient-aware and prefer evidence-backed claims.',
   '한국소비자원 화장품 소비행태 2023'),

  ('KR', 2024, 'electronics',
   '{"ko":["삼성·LG 같은 국내 대기업 브랜드","공식 AS 가능 여부","뽐뿌·다나와 가격 비교","유튜브 리뷰","가전 매장 직접 체험"],"en":["Domestic majors (Samsung, LG)","After-sales service availability","Ppomppu / Danawa price comparison","YouTube reviews","In-store hands-on experience"]}'::jsonb,
   '{"ko":["AS가 안 될까 걱정","해외 직구 대비 가격 부담","호환성 우려"],"en":["After-sales coverage concern","Pricier than overseas direct purchase","Compatibility worries"]}'::jsonb,
   '{"ko":["쿠팡","11번가","하이마트","삼성·LG 공식몰","오프라인 양판점"],"en":["Coupang","11st","Hi-mart","Samsung/LG official","Offline category retailers"]}'::jsonb,
   'Samsung and LG dominate; Korean consumers prefer brands with strong after-sales networks. Online comparison shopping (Danawa) is near-universal.',
   '통계청 가계동향조사 2023'),

  ('KR', 2024, 'fashion',
   '{"ko":["무신사·29CM 같은 큐레이션 플랫폼","인플루언서 착장","브랜드 스토리","오프라인 시착"],"en":["Curated platforms (Musinsa, 29CM)","Influencer outfits","Brand storytelling","In-store fitting"]}'::jsonb,
   '{"ko":["사이즈가 안 맞을 우려","반품 번거로움","유행이 빨리 지나감"],"en":["Sizing concerns","Return friction","Fast trend turnover"]}'::jsonb,
   '{"ko":["무신사","29CM","에이블리","쿠팡","로드샵","백화점"],"en":["Musinsa","29CM","Ably","Coupang","Street stores","Department stores"]}'::jsonb,
   'Musinsa is the dominant online destination for under-35s. Trend cycles are short. Premium fashion still relies on department stores.',
   '통계청 사회조사 2023'),

  ('KR', 2024, 'health',
   '{"ko":["식약처 건강기능식품 인증","약사·의사 추천","임상 시험 결과","아이허브·국내 전문몰 후기","K-헬스 브랜드 신뢰"],"en":["KFDA functional food certification","Pharmacist / doctor endorsement","Clinical trial results","iHerb / specialist reviews","Korean health brand trust"]}'::jsonb,
   '{"ko":["효과가 의심됨","장기 복용 안전성","가격 부담"],"en":["Doubt about efficacy","Long-term safety","Premium price"]}'::jsonb,
   '{"ko":["쿠팡","아이허브","약국","네이버 스마트스토어","올리브영","건강기능식품 전문몰"],"en":["Coupang","iHerb","Pharmacies","Naver Smart Store","Olive Young","Specialist HF stores"]}'::jsonb,
   'KFDA certification for health-functional foods (건기식) is non-negotiable for trust. Pharmacist recommendation in physical pharmacies still drives purchase for older demographics.',
   '식품의약품안전처 건강기능식품 시장조사 2023'),

  ('KR', 2024, 'saas',
   '{"ko":["국내 사례·레퍼런스","한국어 고객지원","무료 체험","대기업 도입 사례","공공기관 도입 여부"],"en":["Local case studies","Korean-language support","Free trial","Enterprise adoption","Public-sector adoption"]}'::jsonb,
   '{"ko":["한국어 지원이 부족할까","데이터 해외 저장 우려","결제·세금계산서 처리"],"en":["Limited Korean support","Data residency offshore","Korean tax invoice handling"]}'::jsonb,
   '{"ko":["G마켓 B2B","네이버 클라우드 마켓플레이스","SaaS 사 직접 영업","파트너 SI"],"en":["GMarket B2B","Naver Cloud Marketplace","Direct SaaS sales","SI partner channel"]}'::jsonb,
   'Korean SMB buyers want Korean-language support and 세금계산서 (tax invoice) compatibility. Enterprise sales often go through SI partners.',
   '소프트웨어정책연구소 SW산업 실태조사 2023')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
