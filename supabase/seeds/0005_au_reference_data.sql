-- AU (Australia) reference data — Phase B seed.
-- Sources:
--   • ABS — Average Weekly Earnings May 2023, Survey of Income and Housing 2019-20
--   • Hays / Robert Half Salary Guide AU 2023
--   • Roy Morgan / Nielsen AU consumer research 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('AU', 2024, 'Australia', 'Australia', 'AUD',
   26900000, 95000, 64600,
   'ABS Survey of Income and Housing 2019-20',
   'https://www.abs.gov.au')
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

with rows(profession_canonical, profession_localized, life_stage, age_group,
          p25, median, p75, display_ko, display_en) as (values
  ('elementary_teacher',
   '{"ko":"초등학교 교사","en":"Primary School Teacher"}'::jsonb,
   'employed', '30-39', 75000::numeric, 88000::numeric, 105000::numeric,
   '연 A$75k-A$105k (~$50-70k USD)', 'A$75k-A$105k annually (~$50-70k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 65000, 82000, 105000,
   '연 A$65k-A$105k (~$43-70k USD)', 'A$65k-A$105k annually (~$43-70k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어","en":"Senior Software Engineer"}'::jsonb,
   'employed', '30-39', 130000, 165000, 210000,
   '연 A$130k-A$210k (~$87-140k USD)', 'A$130k-A$210k annually (~$87-140k USD)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 95000, 125000, 160000,
   '연 A$95k-A$160k (~$63-107k USD)', 'A$95k-A$160k annually (~$63-107k USD)'),
  ('nurse',
   '{"ko":"간호사","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 75000, 90000, 110000,
   '연 A$75k-A$110k (~$50-73k USD)', 'A$75k-A$110k annually (~$50-73k USD)'),
  ('doctor',
   '{"ko":"의사","en":"General Practitioner"}'::jsonb,
   'employed', '40-49', 200000, 280000, 380000,
   '연 A$200k-A$380k (~$133-253k USD)', 'A$200k-A$380k annually (~$133-253k USD)'),
  ('barista',
   '{"ko":"바리스타","en":"Barista"}'::jsonb,
   'employed', '20-29', 45000, 55000, 65000,
   '연 A$45k-A$65k (~$30-43k USD)', 'A$45k-A$65k annually (~$30-43k USD)'),
  ('tradesperson',
   '{"ko":"숙련 기능공 (전기·배관 등)","en":"Tradesperson (Electrician / Plumber)"}'::jsonb,
   'employed', '30-39', 75000, 95000, 130000,
   '연 A$75k-A$130k (~$50-87k USD)', 'A$75k-A$130k annually (~$50-87k USD)'),
  ('small_business_owner',
   '{"ko":"자영업자","en":"Small Business Owner"}'::jsonb,
   'self_employed', '40-49', 60000, 100000, 180000,
   '사업소득 연 A$60k-A$180k (변동 큼, ~$40-120k USD)',
   'Annual A$60k-A$180k (highly variable, ~$40-120k USD)'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 8000, 18000, 30000,
   '파트타임 연 A$8k-A$30k (~$5-20k USD), Centrelink·HECS 별도',
   'Part-time A$8k-A$30k/yr (~$5-20k USD), Centrelink / HECS separate'),
  ('homemaker',
   '{"ko":"전업주부","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 A$120k-A$180k, 본인 가처분 월 A$500-A$1,500',
   'No personal salary. Household A$120k-A$180k/yr; personal disposable A$500-A$1,500/month'),
  ('retiree',
   '{"ko":"은퇴자","en":"Retiree"}'::jsonb,
   'retiree', '60+', 28000, 45000, 75000,
   'Aged Pension + Superannuation 연 A$28k-A$75k (~$19-50k USD)',
   'Aged Pension + Super A$28k-A$75k/yr (~$19-50k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 25000, 38000, 55000,
   '연 A$25k-A$55k (~$17-37k USD)', 'A$25k-A$55k annually (~$17-37k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'AU', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'AUD',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'ABS Average Weekly Earnings 2023 / Hays Salary Guide'
from rows
on conflict (country_code, profession_canonical, age_group, data_year, life_stage)
  do update set
    income_p25 = excluded.income_p25,
    income_median = excluded.income_median,
    income_p75 = excluded.income_p75,
    display_band = excluded.display_band,
    profession_localized = excluded.profession_localized;

insert into public.country_consumer_norms
  (country_code, data_year, category, trust_factors, common_objections,
   preferred_channels, cultural_notes, source)
values
  ('AU', 2024, 'food',
   '{"ko":["Australian Made 인증","Heart Foundation Tick","Coles·Woolworths PB","ProductReview.com.au","ABC The Checkout 등 미디어"],"en":["Australian Made certification","Heart Foundation Tick","Coles / Woolworths PB","ProductReview.com.au","Media (ABC The Checkout)"]}'::jsonb,
   '{"ko":["가격 부담 (호주 식품 비쌈)","수입품 보존료 우려","유사 제품 과포화"],"en":["Premium pricing (AU food expensive)","Imported preservative concerns","Saturated similar products"]}'::jsonb,
   '{"ko":["Coles","Woolworths","Aldi","IGA","Costco","Amazon AU","HelloFresh"],"en":["Coles","Woolworths","Aldi","IGA","Costco","Amazon AU","HelloFresh"]}'::jsonb,
   'Coles and Woolworths duopoly dominate. Aldi has gained share with private-label value. Australian-Made labeling drives premium positioning. Meal-kit subscriptions (HelloFresh, Marley Spoon) are mainstream.',
   'Roy Morgan AU Consumer 2023'),
  ('AU', 2024, 'beauty',
   '{"ko":["Mecca·Sephora 진열","Adore Beauty","호주 토종 브랜드 (Aesop, Frank Body)","피부과 추천","TGA 등록"],"en":["Mecca / Sephora placement","Adore Beauty","Local AU brands (Aesop, Frank Body)","Dermatologist endorsement","TGA registration"]}'::jsonb,
   '{"ko":["피부 트러블","고가 부담","수입 브랜드 가격"],"en":["Skin reaction","Premium price","Imported brand markup"]}'::jsonb,
   '{"ko":["Mecca","Sephora","Adore Beauty","Chemist Warehouse","Priceline","Amazon AU"],"en":["Mecca","Sephora","Adore Beauty","Chemist Warehouse","Priceline","Amazon AU"]}'::jsonb,
   'Mecca is the dominant prestige beauty retailer. Chemist Warehouse and Priceline drive mass beauty. Aesop is the iconic AU premium brand. K-beauty has gained traction.',
   'Roy Morgan AU Beauty'),
  ('AU', 2024, 'electronics',
   '{"ko":["JB Hi-Fi·Harvey Norman 매장","StaticICE 가격 비교","Apple Store","Australian Standards 인증","2년 통계 보증"],"en":["JB Hi-Fi / Harvey Norman stores","StaticICE price comparison","Apple Store","Australian Standards","Statutory 2yr warranty"]}'::jsonb,
   '{"ko":["수입 가전 가격","호주 표준 호환성 (전압 240V)","수리 비용"],"en":["Imported price markup","AU standards (240V)","Repair cost"]}'::jsonb,
   '{"ko":["JB Hi-Fi","Harvey Norman","The Good Guys","Officeworks","Amazon AU","Apple Store","eBay AU"],"en":["JB Hi-Fi","Harvey Norman","The Good Guys","Officeworks","Amazon AU","Apple Store","eBay AU"]}'::jsonb,
   'JB Hi-Fi dominates electronics retail. Statutory warranty (Australian Consumer Law) is strong protection. eBay AU is significant for refurbished/used.',
   'IBISWorld AU Electronics'),
  ('AU', 2024, 'fashion',
   '{"ko":["The Iconic","Cotton On·Country Road","Sustainability 인증","David Jones·Myer","Instagram 인플루언서"],"en":["The Iconic","Cotton On / Country Road","Sustainability cert","David Jones / Myer","Instagram influencer"]}'::jsonb,
   '{"ko":["사이즈 표준","반품 비용","수입 럭셔리 부담","Fast fashion 윤리"],"en":["Size standards","Return cost","Imported luxury markup","Fast fashion ethics"]}'::jsonb,
   '{"ko":["The Iconic","Cotton On","David Jones","Myer","Zara","Uniqlo","ASOS","Amazon AU"],"en":["The Iconic","Cotton On","David Jones","Myer","Zara","Uniqlo","ASOS","Amazon AU"]}'::jsonb,
   'The Iconic is the top online fashion player. Country Road and Cotton On are local heroes. David Jones / Myer dominate department-store luxury.',
   'Roy Morgan AU Fashion'),
  ('AU', 2024, 'health',
   '{"ko":["TGA 등록","의사 처방","Chemist Warehouse 약사","Australian Made","피부과 추천"],"en":["TGA registration","Doctor prescription","Chemist Warehouse pharmacist","Australian Made","Dermatologist"]}'::jsonb,
   '{"ko":["효능 의심","Medicare 비커버 시 비용","수입 보충제 진위"],"en":["Efficacy doubt","Out-of-pocket cost","Imported supplement authenticity"]}'::jsonb,
   '{"ko":["Chemist Warehouse","Priceline","Amcal","iHerb","Amazon AU"],"en":["Chemist Warehouse","Priceline","Amcal","iHerb","Amazon AU"]}'::jsonb,
   'Chemist Warehouse dominates pharmacy. Medicare covers many prescriptions. iHerb is popular for non-TGA imports. Australian Made supplements (Swisse, Blackmores) export heavily to Asia.',
   'TGA / IBISWorld AU Health'),
  ('AU', 2024, 'saas',
   '{"ko":["G2 리뷰","무료 체험","호주 지원 시간대 (AEST)","대기업 reference","SOC 2 컴플라이언스"],"en":["G2 reviews","Free trial","Local support hours (AEST)","Enterprise reference","SOC 2 compliance"]}'::jsonb,
   '{"ko":["가격 부담 (USD 환율)","Privacy Act 컴플라이언스","Vendor lock-in"],"en":["USD pricing","Privacy Act compliance","Vendor lock-in"]}'::jsonb,
   '{"ko":["AWS Marketplace","SaaS 직접 영업","Telstra·Optus B2B","파트너 채널"],"en":["AWS Marketplace","Direct SaaS sales","Telstra / Optus B2B","Partner channel"]}'::jsonb,
   'Australian B2B prefers self-serve free trials and rapid onboarding. Privacy Act compliance is increasingly important. Local timezone support is valued.',
   'Gartner AU SaaS / Hays')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
