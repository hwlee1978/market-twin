-- US reference data — Phase B seed (manually curated from BLS / Census).
-- Same structure as 0001_kr_reference_data.sql.
--
-- Sources informing the values below:
--   • U.S. Bureau of Labor Statistics — Occupational Employment and Wage Statistics 2023
--   • U.S. Census Bureau — Income in the United States 2023
--   • Pew Research / Nielsen — US consumer behavior reports 2023
--
-- Re-run safely: ON CONFLICT DO UPDATE makes this idempotent.

-- ─── country_stats ─────────────────────────────────────────────
insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('US', 2024, 'United States', 'United States', 'USD',
   334900000, 75000, 81600,
   'U.S. Census Bureau Income & Poverty 2023',
   'https://www.census.gov/library/publications/2024/demo/p60-282.html')
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
-- Annual personal income, in USD. BLS national medians; high-cost cities
-- (SF, NY) typically run 30-50% above these.

with rows(profession_canonical, profession_localized, life_stage, age_group,
          p25, median, p75, display_ko, display_en) as (values
  -- Employed — common professions
  ('elementary_teacher',
   '{"ko":"초등학교 교사","en":"Elementary School Teacher"}'::jsonb,
   'employed', '20-29', 45000::numeric, 52000::numeric, 60000::numeric,
   '연 $45k-$60k', '$45k-$60k annually'),
  ('elementary_teacher',
   '{"ko":"초등학교 교사","en":"Elementary School Teacher"}'::jsonb,
   'employed', '30-39', 55000, 65000, 78000,
   '연 $55k-$78k', '$55k-$78k annually'),
  ('elementary_teacher',
   '{"ko":"초등학교 교사","en":"Elementary School Teacher"}'::jsonb,
   'employed', '40-49', 65000, 78000, 95000,
   '연 $65k-$95k', '$65k-$95k annually'),

  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '20-29', 42000, 55000, 70000,
   '연 $42k-$70k', '$42k-$70k annually'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 60000, 78000, 100000,
   '연 $60k-$100k', '$60k-$100k annually'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '40-49', 75000, 95000, 130000,
   '연 $75k-$130k', '$75k-$130k annually'),

  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어","en":"Senior Software Engineer"}'::jsonb,
   'employed', '30-39', 130000, 175000, 240000,
   '연 $130k-$240k (대도시 기준 더 높음)', '$130k-$240k annually (higher in major cities)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어","en":"Senior Software Engineer"}'::jsonb,
   'employed', '40-49', 160000, 210000, 320000,
   '연 $160k-$320k', '$160k-$320k annually'),

  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 85000, 115000, 150000,
   '연 $85k-$150k', '$85k-$150k annually'),

  ('nurse',
   '{"ko":"간호사","en":"Registered Nurse"}'::jsonb,
   'employed', '20-29', 65000, 78000, 92000,
   '연 $65k-$92k', '$65k-$92k annually'),
  ('nurse',
   '{"ko":"간호사","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 75000, 90000, 110000,
   '연 $75k-$110k', '$75k-$110k annually'),

  ('doctor',
   '{"ko":"의사","en":"Physician"}'::jsonb,
   'employed', '30-39', 220000, 280000, 380000,
   '연 $220k-$380k', '$220k-$380k annually'),
  ('doctor',
   '{"ko":"의사","en":"Physician"}'::jsonb,
   'employed', '40-49', 280000, 380000, 550000,
   '연 $280k-$550k', '$280k-$550k annually'),

  ('barista',
   '{"ko":"바리스타","en":"Barista"}'::jsonb,
   'employed', '20-29', 26000, 32000, 38000,
   '연 $26k-$38k', '$26k-$38k annually'),

  ('production_worker',
   '{"ko":"생산직 근로자","en":"Production Worker"}'::jsonb,
   'employed', '30-39', 38000, 48000, 60000,
   '연 $38k-$60k', '$38k-$60k annually'),

  ('small_business_owner',
   '{"ko":"자영업자 (소상공인)","en":"Small Business Owner"}'::jsonb,
   'self_employed', '40-49', 45000, 75000, 130000,
   '사업소득 연 $45k-$130k (변동 큼)', 'Annual $45k-$130k (highly variable)'),

  -- Non-employed life stages
  ('college_student',
   '{"ko":"대학생","en":"College Student"}'::jsonb,
   'student', '20-29', 5000, 10000, 18000,
   '파트타임 연 $5k-$18k, 부모 지원·학자금 별도',
   'Part-time $5k-$18k/yr, parental support / loans separate'),

  ('high_school_student',
   '{"ko":"고등학생","en":"High School Student"}'::jsonb,
   'student', '20-29', 0, 3000, 8000,
   '파트타임 연 $0-$8k, 주로 부모 지원',
   'Part-time $0-$8k/yr, mostly parental support'),

  ('homemaker',
   '{"ko":"전업주부","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 $90k-$150k, 본인 가처분 월 $400-$1,200',
   'No personal salary. Household $90k-$150k/yr; personal disposable $400-$1,200/month'),
  ('homemaker',
   '{"ko":"전업주부","en":"Homemaker"}'::jsonb,
   'homemaker', '40-49', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 $100k-$180k, 본인 가처분 월 $500-$1,500',
   'No personal salary. Household $100k-$180k/yr; personal disposable $500-$1,500/month'),

  ('retiree',
   '{"ko":"은퇴자","en":"Retiree"}'::jsonb,
   'retiree', '60+', 22000, 35000, 55000,
   'Social Security + 401k 연 $22k-$55k',
   'Social Security + 401k $22k-$55k/yr'),

  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 18000, 28000, 40000,
   '연 $18k-$40k', '$18k-$40k annually')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'US', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'USD',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'BLS Occupational Employment & Wage Statistics 2023'
from rows
on conflict (country_code, profession_canonical, age_group, data_year, life_stage)
  do update set
    income_p25 = excluded.income_p25,
    income_median = excluded.income_median,
    income_p75 = excluded.income_p75,
    display_band = excluded.display_band,
    profession_localized = excluded.profession_localized;

-- ─── country_consumer_norms ───────────────────────────────────
-- Curated from Pew / Nielsen / public industry reports. Captures real
-- US consumer behavior patterns per category.

insert into public.country_consumer_norms
  (country_code, data_year, category, trust_factors, common_objections,
   preferred_channels, cultural_notes, source)
values
  ('US', 2024, 'food',
   '{"ko":["FDA/USDA Organic 인증","Whole Foods·Trader Joe''s 진열","Reddit r/foodscience 토론","인플루언서 추천 (TikTok / Instagram)","원재료 투명성"],"en":["FDA / USDA Organic certification","Whole Foods / Trader Joe''s placement","Reddit r/foodscience discussion","Influencer endorsement (TikTok / Instagram)","Ingredient transparency"]}'::jsonb,
   '{"ko":["가격이 비쌈","유사 제품 과포화","건강 효능 의심","과장 광고 우려","구독·번거로운 결제"],"en":["Price too high","Saturated similar products","Health claim skepticism","Marketing hype concerns","Subscription friction"]}'::jsonb,
   '{"ko":["Amazon / Amazon Fresh","Whole Foods Market","Trader Joe''s","Costco","Instacart / DoorDash","Target","브랜드 D2C"],"en":["Amazon / Amazon Fresh","Whole Foods Market","Trader Joe''s","Costco","Instacart / DoorDash","Target","Brand DTC"]}'::jsonb,
   'US consumers heavily comparison-shop online. Subscriptions (e.g. Athletic Greens model) work but face strong cancellation friction. Whole Foods placement signals premium positioning. D2C brands have proven viable since 2015.',
   'Pew Research / Nielsen US consumer reports 2023'),

  ('US', 2024, 'beauty',
   '{"ko":["Sephora / Ulta 진열","Reddit r/SkincareAddiction 추천","피부과 전문의 endorsement","FDA 승인 성분","Clean beauty 인증"],"en":["Sephora / Ulta placement","Reddit r/SkincareAddiction recommendation","Dermatologist endorsement","FDA-approved ingredients","Clean beauty certification"]}'::jsonb,
   '{"ko":["피부 트러블 우려","고가 부담","유사 제품 과포화","Greenwashing 의심"],"en":["Skin reaction concerns","Premium price","Saturated similar products","Greenwashing skepticism"]}'::jsonb,
   '{"ko":["Sephora","Ulta","Amazon","Target","브랜드 DTC","Costco","TikTok Shop"],"en":["Sephora","Ulta","Amazon","Target","Brand DTC","Costco","TikTok Shop"]}'::jsonb,
   'Sephora and Ulta are the dominant offline+online destinations. K-beauty has strong brand recognition. Reddit reviews drive informed purchase decisions. Clean beauty is a major positioning vector.',
   'Nielsen US Beauty 2023 / NPD Group'),

  ('US', 2024, 'electronics',
   '{"ko":["Apple ecosystem 통합","BestBuy 매장 체험","r/BuyItForLife 추천","Wirecutter / The Verge 리뷰","Costco 보증 정책"],"en":["Apple ecosystem integration","BestBuy in-store experience","r/BuyItForLife recommendation","Wirecutter / The Verge reviews","Costco return policy"]}'::jsonb,
   '{"ko":["Apple ecosystem 호환성","수리 가능 여부 (Right-to-Repair)","개인정보 우려","구독 모델 거부감"],"en":["Apple ecosystem compatibility","Repairability (Right-to-Repair)","Privacy concerns","Subscription fatigue"]}'::jsonb,
   '{"ko":["Amazon","BestBuy","Apple Store / apple.com","Costco","Target","브랜드 DTC"],"en":["Amazon","BestBuy","Apple Store / apple.com","Costco","Target","Brand DTC"]}'::jsonb,
   'Apple has a near-religious customer base for premium consumer electronics. Wirecutter / Reddit reviews drive informed purchase. Right-to-Repair movement is strong. Subscription-based hardware (printers, peloton) faces resistance.',
   'CNET / The Verge consumer electronics 2023'),

  ('US', 2024, 'fashion',
   '{"ko":["TikTok / Instagram 인플루언서","Sustainability 인증 (B Corp)","Nordstrom 진열","StockX 인증 (스니커즈)","DTC 브랜드 스토리"],"en":["TikTok / Instagram influencer","Sustainability cert (B Corp)","Nordstrom placement","StockX authentication (sneakers)","DTC brand storytelling"]}'::jsonb,
   '{"ko":["사이즈 표준 다양성","반품 비용","Fast fashion 윤리적 우려","Greenwashing"],"en":["Size standard variability","Return shipping cost","Fast fashion ethics","Greenwashing"]}'::jsonb,
   '{"ko":["Amazon","Nordstrom","Zara","브랜드 DTC","ThredUp / Poshmark","Target","Costco"],"en":["Amazon","Nordstrom","Zara","Brand DTC","ThredUp / Poshmark","Target","Costco"]}'::jsonb,
   'TikTok shop and Instagram drive Gen Z fashion. Resale (ThredUp, Poshmark) is mainstream. Sustainability messaging works but consumers are skeptical of greenwashing. Free returns are table stakes.',
   'BoF / McKinsey US Fashion 2023'),

  ('US', 2024, 'health',
   '{"ko":["FDA 승인","주치의 / 피부과 추천","GoodRx 가격 비교","CVS / Walgreens 약사 상담","Examine.com 보충제 리서치"],"en":["FDA approval","Primary care / dermatologist recommendation","GoodRx price comparison","CVS / Walgreens pharmacist consult","Examine.com supplement research"]}'::jsonb,
   '{"ko":["효능 의심","장기 안전성","건강보험 처리","약물 상호작용"],"en":["Doubt about efficacy","Long-term safety","Insurance coverage","Drug interactions"]}'::jsonb,
   '{"ko":["CVS","Walgreens","Amazon","GNC","iHerb","Vitamin Shoppe","의사 처방"],"en":["CVS","Walgreens","Amazon","GNC","iHerb","Vitamin Shoppe","Doctor prescription"]}'::jsonb,
   'US consumers research supplements heavily on Reddit and Examine.com. Doctor recommendation drives prescription drugs. GoodRx and similar tools have shifted price negotiation power to consumers.',
   'CDC / Pew Research US Health Behaviors 2023'),

  ('US', 2024, 'saas',
   '{"ko":["G2 / Capterra 리뷰","Free trial / freemium","Slack / Zapier 통합","ProductHunt 런칭","대기업 reference (Fortune 500)"],"en":["G2 / Capterra reviews","Free trial / freemium","Slack / Zapier integrations","ProductHunt launch","Fortune 500 reference"]}'::jsonb,
   '{"ko":["가격 부담","Vendor lock-in","데이터 마이그레이션","SOC 2 / GDPR 컴플라이언스","구독 비용 누적"],"en":["Pricing pressure","Vendor lock-in","Data migration","SOC 2 / GDPR compliance","Subscription stack cost"]}'::jsonb,
   '{"ko":["SaaS 직접 영업","AWS Marketplace","ProductHunt","G2","파트너 채널 (HubSpot / Salesforce ISV)"],"en":["Direct SaaS sales","AWS Marketplace","ProductHunt","G2","Partner channel (HubSpot / Salesforce ISV)"]}'::jsonb,
   'US SMB buyers want self-serve free trials and quick payback. Enterprise sales rely on G2/peer references. Subscription stack consolidation is a real pain point — bundled offerings (e.g. HubSpot suite) win.',
   'Gartner / Forrester SaaS 2023')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
