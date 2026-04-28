-- SG (Singapore) reference data — Phase B seed.
-- Sources:
--   • SingStat — Comprehensive Labour Force Survey 2023
--   • Ministry of Manpower (MOM) — Wages and Hours Worked 2023
--   • Hays / Robert Half Singapore Salary Guide 2023
--   • Nielsen Singapore consumer 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('SG', 2024, 'Singapore', 'Singapore', 'SGD',
   5920000, 121000, 84500,
   'SingStat Comprehensive Labour Force Survey 2023',
   'https://www.singstat.gov.sg')
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
   '{"ko":"초등학교 교사 (MOE)","en":"Primary School Teacher (MOE)"}'::jsonb,
   'employed', '30-39', 60000::numeric, 75000::numeric, 95000::numeric,
   '연 S$60k-S$95k (~$45-71k USD)', 'S$60k-S$95k annually (~$45-71k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 55000, 75000, 105000,
   '연 S$55k-S$105k (~$41-78k USD)', 'S$55k-S$105k annually (~$41-78k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (글로벌 빅테크)","en":"Senior Software Engineer (Global Big Tech)"}'::jsonb,
   'employed', '30-39', 130000, 180000, 250000,
   '연 S$130k-S$250k (~$97-187k USD, RSU 별도)',
   'S$130k-S$250k annually (~$97-187k USD, RSU separate)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 90000, 130000, 180000,
   '연 S$90k-S$180k (~$67-134k USD)', 'S$90k-S$180k annually (~$67-134k USD)'),
  ('nurse',
   '{"ko":"간호사","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 50000, 65000, 85000,
   '연 S$50k-S$85k (~$37-63k USD)', 'S$50k-S$85k annually (~$37-63k USD)'),
  ('doctor',
   '{"ko":"의사","en":"Physician"}'::jsonb,
   'employed', '40-49', 180000, 280000, 450000,
   '연 S$180k-S$450k (~$134-336k USD)', 'S$180k-S$450k annually (~$134-336k USD)'),
  ('hawker',
   '{"ko":"호커 (Hawker, 자영업)","en":"Hawker (Self-employed)"}'::jsonb,
   'self_employed', '40-49', 30000, 60000, 100000,
   '사업소득 연 S$30k-S$100k (변동 큼, ~$22-75k USD)',
   'Annual S$30k-S$100k (highly variable, ~$22-75k USD)'),
  ('financial_advisor',
   '{"ko":"금융 자문사 (Financial Advisor)","en":"Financial Advisor"}'::jsonb,
   'employed', '30-39', 70000, 110000, 180000,
   '연 S$70k-S$180k (~$52-134k USD, 변동 큼)',
   'S$70k-S$180k annually (~$52-134k USD, variable)'),
  ('domestic_helper',
   '{"ko":"가사도우미 (필리핀·인도네시아 출신)","en":"Domestic Helper (Filipino / Indonesian)"}'::jsonb,
   'employed', '30-39', 9000, 11000, 14000,
   '연 S$9k-S$14k (~$6.7-10k USD), 숙소·식사 제공',
   'S$9k-S$14k annually (~$6.7-10k USD), housing and meals provided'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 5000, 12000, 22000,
   '용돈+알바 연 S$5k-S$22k (~$3.7-16k USD), 부모 지원 별도',
   'Allowance + part-time S$5k-S$22k/yr (~$3.7-16k USD)'),
  ('homemaker',
   '{"ko":"전업주부","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 S$140k-S$220k, 본인 가처분 월 S$500-S$1,500',
   'No personal salary. Household S$140k-S$220k/yr; personal disposable S$500-S$1,500/month'),
  ('retiree',
   '{"ko":"은퇴자","en":"Retiree"}'::jsonb,
   'retiree', '60+', 18000, 32000, 55000,
   'CPF·private pension 연 S$18k-S$55k (~$13-41k USD)',
   'CPF + private pension S$18k-S$55k/yr (~$13-41k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 18000, 28000, 42000,
   '연 S$18k-S$42k (~$13-31k USD)', 'S$18k-S$42k annually (~$13-31k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'SG', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'SGD',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'SingStat 2023 / Hays Singapore'
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
  ('SG', 2024, 'food',
   '{"ko":["SFA (Singapore Food Agency) 인증","Healthier Choice Symbol","FairPrice·Cold Storage PB","HardwareZone·Reddit Singapore 추천","호커센터 신뢰"],"en":["SFA certification","Healthier Choice Symbol","FairPrice / Cold Storage PB","HardwareZone / Reddit Singapore","Hawker centre trust"]}'::jsonb,
   '{"ko":["가격 부담 (수입 의존)","Halal vs non-Halal","유통기한","건강 소비 트렌드"],"en":["Price (import-dependent)","Halal vs non-Halal","Expiry","Health-conscious trends"]}'::jsonb,
   '{"ko":["FairPrice","Cold Storage","Sheng Siong","RedMart","Amazon SG","Shopee","Lazada","Foodpanda","GrabFood"],"en":["FairPrice","Cold Storage","Sheng Siong","RedMart","Amazon SG","Shopee","Lazada","Foodpanda","GrabFood"]}'::jsonb,
   'Singapore is import-dependent — food safety (SFA) and country-of-origin matter. FairPrice is the dominant value retailer; Cold Storage premium. Hawker centres are cultural institution. Healthier Choice Symbol drives gov-backed health trust.',
   'Nielsen Singapore 2023'),
  ('SG', 2024, 'beauty',
   '{"ko":["피부과 의사 추천","Sephora·Sasa·Watsons","HSA 인증","Reddit Singapore 리뷰","Made in Korea·Made in Japan 신뢰"],"en":["Dermatologist endorsement","Sephora / Sasa / Watsons","HSA certification","Reddit Singapore reviews","Made in KR / JP trust"]}'::jsonb,
   '{"ko":["피부 트러블","고가 부담","위조품 (그레이 마켓)","기후 영향 (열대)"],"en":["Skin reaction","Premium price","Gray market counterfeit","Tropical climate factors"]}'::jsonb,
   '{"ko":["Sephora SG","Sasa","Watsons","Guardian","Lazada","Shopee","Amazon SG"],"en":["Sephora SG","Sasa","Watsons","Guardian","Lazada","Shopee","Amazon SG"]}'::jsonb,
   'Sephora and Sasa anchor prestige beauty. Watsons and Guardian dominate mass. K-beauty and J-beauty have huge followings. Tropical climate drives sun-protection focus.',
   'Euromonitor SG / Nielsen'),
  ('SG', 2024, 'electronics',
   '{"ko":["Apple Store","Best Denki·Harvey Norman·Courts","Lazada·Shopee","HardwareZone 리뷰","2년 보증"],"en":["Apple Store","Best Denki / Harvey Norman / Courts","Lazada / Shopee","HardwareZone reviews","2-year warranty"]}'::jsonb,
   '{"ko":["수입 가격 (수입 의존)","그레이 마켓 위험","지역 보증 vs 글로벌"],"en":["Imported price","Gray market risk","Regional vs global warranty"]}'::jsonb,
   '{"ko":["Lazada","Shopee","Amazon SG","Best Denki","Harvey Norman","Courts","Apple Store"],"en":["Lazada","Shopee","Amazon SG","Best Denki","Harvey Norman","Courts","Apple Store"]}'::jsonb,
   'Singapore is a regional electronics hub — competitive pricing, low import friction. HardwareZone forum drives enthusiast trust. Apple has high prestige; Samsung and Xiaomi compete on smartphones.',
   'IDC SG / HardwareZone'),
  ('SG', 2024, 'fashion',
   '{"ko":["Zalora·Lazada","Shopee","로컬 브랜드 (Charles & Keith, Love Bonito)","Sustainability 일부 관심","Instagram 인플루언서"],"en":["Zalora / Lazada","Shopee","Local brands (Charles & Keith, Love Bonito)","Some sustainability interest","Instagram influencer"]}'::jsonb,
   '{"ko":["사이즈 표준","수입 럭셔리 부담","열대 기후에 맞는 소재"],"en":["Size standards","Imported luxury markup","Climate-appropriate fabrics"]}'::jsonb,
   '{"ko":["Zalora","Shopee","Lazada","Uniqlo","H&M","Charles & Keith","Love Bonito","ION Orchard"],"en":["Zalora","Shopee","Lazada","Uniqlo","H&M","Charles & Keith","Love Bonito","ION Orchard"]}'::jsonb,
   'Charles & Keith is the iconic SG global brand. Love Bonito leads localized womenswear. Orchard Road shopping malls dominate offline. Tropical climate drives breathable-fabric preference.',
   'Euromonitor SG Fashion'),
  ('SG', 2024, 'health',
   '{"ko":["HSA (Health Sciences Authority) 인증","의사 처방 (Polyclinic·private)","Watsons·Guardian 약사","HCS (Healthier Choice)","피부과 추천"],"en":["HSA certification","Doctor prescription (Polyclinic / private)","Watsons / Guardian pharmacist","HCS (Healthier Choice)","Dermatologist"]}'::jsonb,
   '{"ko":["효능 의심","고가 의료비","수입 보충제 진위"],"en":["Efficacy doubt","Premium medical cost","Imported supplement authenticity"]}'::jsonb,
   '{"ko":["Watsons","Guardian","Unity","Lazada","Shopee","Amazon SG","iHerb"],"en":["Watsons","Guardian","Unity","Lazada","Shopee","Amazon SG","iHerb"]}'::jsonb,
   'Singapore has world-class healthcare. HSA approval is required for all OTC. Watsons and Guardian dominate retail pharmacy. iHerb is popular for imported supplements. HCS labelling drives gov-backed trust.',
   'HSA / Euromonitor SG'),
  ('SG', 2024, 'saas',
   '{"ko":["G2·Capterra 평가","SingPass·CorpPass 통합","대기업 (DBS·Singtel) reference","PDPA 준수","무료 체험"],"en":["G2 / Capterra reviews","SingPass / CorpPass integration","Enterprise reference (DBS / Singtel)","PDPA compliance","Free trial"]}'::jsonb,
   '{"ko":["PDPA 컴플라이언스","외화 결제","Vendor lock-in","현지 데이터 거주성"],"en":["PDPA compliance","Foreign currency","Vendor lock-in","Local data residency"]}'::jsonb,
   '{"ko":["AWS Marketplace","Microsoft Marketplace","Singtel·StarHub B2B","SaaS 직접 영업","SGTech 파트너"],"en":["AWS Marketplace","Microsoft Marketplace","Singtel / StarHub B2B","Direct SaaS sales","SGTech partners"]}'::jsonb,
   'Singapore is a regional B2B hub — English-speaking, mature procurement. PDPA (Personal Data Protection Act) is the compliance baseline. SingPass / CorpPass identity integration is increasingly required for gov-adjacent SaaS.',
   'Gartner APAC / IDC Singapore')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
