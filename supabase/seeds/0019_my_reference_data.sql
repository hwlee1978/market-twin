-- MY (Malaysia) reference data — Phase B+ seed.
-- Sources:
--   • DOSM (Department of Statistics Malaysia) — Household Income Survey 2022
--   • Bank Negara Malaysia
--   • Hays / JobStreet Malaysia Salary Guide 2023
--   • Nielsen Malaysia / Kantar Malaysia 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('MY', 2024, 'Malaysia', 'Malaysia', 'MYR',
   33800000, 76000, 13300,
   'DOSM Household Income & Expenditure Survey 2022',
   'https://www.dosm.gov.my')
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
   '{"ko":"초등학교 교사 (Sekolah Kebangsaan)","en":"Primary School Teacher (Public)"}'::jsonb,
   'employed', '30-39', 36000::numeric, 50000::numeric, 70000::numeric,
   '연 RM 36k-RM 70k (~$8-15k USD)', 'RM 36k-70k annually (~$8-15k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 36000, 60000, 90000,
   '연 RM 36k-RM 90k (~$8-19k USD)', 'RM 36k-90k annually (~$8-19k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (KL Tech Hub)","en":"Senior Software Engineer (KL Tech Hub)"}'::jsonb,
   'employed', '30-39', 96000, 150000, 240000,
   '연 RM 96k-RM 240k (~$21-52k USD)',
   'RM 96k-240k annually (~$21-52k USD)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 90000, 130000, 200000,
   '연 RM 90k-RM 200k (~$19-43k USD)',
   'RM 90k-200k annually (~$19-43k USD)'),
  ('nurse',
   '{"ko":"간호사","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 36000, 50000, 75000,
   '연 RM 36k-RM 75k (~$8-16k USD)', 'RM 36k-75k annually (~$8-16k USD)'),
  ('doctor',
   '{"ko":"의사","en":"Physician"}'::jsonb,
   'employed', '40-49', 120000, 220000, 380000,
   '연 RM 120k-RM 380k (~$26-82k USD)',
   'RM 120k-380k annually (~$26-82k USD)'),
  ('shop_owner',
   '{"ko":"자영업 (소매점·F&B)","en":"Shop / F&B Owner"}'::jsonb,
   'self_employed', '40-49', 30000, 60000, 130000,
   '사업소득 연 RM 30k-RM 130k (변동 큼, ~$6-28k USD)',
   'Annual RM 30k-130k (highly variable, ~$6-28k USD)'),
  ('factory_worker',
   '{"ko":"공장 근로자 (Penang·Selangor)","en":"Factory Worker (Penang / Selangor)"}'::jsonb,
   'employed', '30-39', 22000, 32000, 48000,
   '연 RM 22k-RM 48k (~$5-10k USD), 잔업 수당 별도',
   'RM 22k-48k annually (~$5-10k USD), overtime separate'),
  ('grab_driver',
   '{"ko":"Grab 드라이버","en":"Grab Driver"}'::jsonb,
   'self_employed', '30-39', 24000, 40000, 65000,
   '연 RM 24k-RM 65k (변동 큼, ~$5-14k USD)',
   'RM 24k-65k annually (highly variable, ~$5-14k USD)'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 6000, 12000, 22000,
   '용돈+알바 연 RM 6k-RM 22k (~$1.3-4.7k USD), 부모 지원 별도',
   'Allowance + part-time RM 6k-22k/yr (~$1.3-4.7k USD)'),
  ('homemaker',
   '{"ko":"전업주부 (Suri Rumah)","en":"Homemaker (Suri Rumah)"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 RM 80k-RM 150k, 본인 가처분 월 RM 500-RM 1,500',
   'No personal salary. Household RM 80k-150k/yr; personal disposable RM 500-1,500/month'),
  ('retiree',
   '{"ko":"은퇴자","en":"Retiree"}'::jsonb,
   'retiree', '60+', 12000, 24000, 48000,
   'EPF·KWAP 연금 연 RM 12k-RM 48k (~$2.5-10k USD)',
   'EPF / KWAP pension RM 12k-48k/yr (~$2.5-10k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 14000, 22000, 32000,
   '연 RM 14k-RM 32k (~$3-7k USD)', 'RM 14k-32k annually (~$3-7k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'MY', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'MYR',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'DOSM 2022 / Hays Malaysia Salary Guide 2023'
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
  ('MY', 2024, 'food',
   '{"ko":["Halal 인증 (JAKIM)","KKM 식품안전","Tesco·Lotus·AEON","로컬 브랜드 (Mamee·Munchy''s)","Mamak·Pasar Malam 신뢰"],"en":["Halal certification (JAKIM)","Ministry of Health food safety","Tesco / Lotus / AEON","Local brands (Mamee, Munchy''s)","Mamak / night market trust"]}'::jsonb,
   '{"ko":["Halal vs non-Halal 명확성","가격 부담 (수입품)","유통기한","건강 트렌드 (청년층)"],"en":["Halal vs non-Halal clarity","Price (imports)","Expiry","Health trends (youth)"]}'::jsonb,
   '{"ko":["Tesco","Lotus''s","AEON","Mydin","Shopee","Lazada","FoodPanda","GrabFood","Mamak","Pasar Malam"],"en":["Tesco","Lotus''s","AEON","Mydin","Shopee","Lazada","FoodPanda","GrabFood","Mamak","Night market"]}'::jsonb,
   'Halal certification (JAKIM) is a non-negotiable trust signal for ~60% Muslim majority. Mamak culture (24-hour Indian-Muslim eateries) is core to social life. Pasar Malam (night market) is dominant for fresh goods. Tesco/Lotus and AEON anchor modern grocery.',
   'Nielsen Malaysia / JAKIM directory'),
  ('MY', 2024, 'beauty',
   '{"ko":["Halal 화장품 인증 (JAKIM)","Watsons·Guardian·SaSa","KKM (NPRA) 등록","로컬 브랜드 (Sasa·SimplySiti·SAFI)","K-beauty·J-beauty 신뢰"],"en":["Halal cosmetics cert (JAKIM)","Watsons / Guardian / SaSa","KKM (NPRA) notification","Local brands (SimplySiti, SAFI)","K-beauty / J-beauty trust"]}'::jsonb,
   '{"ko":["Halal vs non-Halal","피부 트러블 (열대 기후)","가격 부담","위조품"],"en":["Halal vs non-Halal","Skin reaction (tropical climate)","Price","Counterfeits"]}'::jsonb,
   '{"ko":["Watsons","Guardian","SaSa","Hermo","Shopee","Lazada","Sephora MY","Zalora"],"en":["Watsons","Guardian","SaSa","Hermo","Shopee","Lazada","Sephora MY","Zalora"]}'::jsonb,
   'Halal-certified cosmetics is a fast-growing segment driven by Muslim consumers. SimplySiti (founded by 다툰 시티 누르할리자) and SAFI lead local Halal beauty. Watsons and Guardian dominate mass; Sephora and SaSa premium. Hermo is popular online beauty native.',
   'Euromonitor MY Beauty / NPRA'),
  ('MY', 2024, 'electronics',
   '{"ko":["Senheng·Harvey Norman","Lazada·Shopee","Apple Reseller","Lowyat.NET 리뷰","2년 보증 (SIRIM)"],"en":["Senheng / Harvey Norman","Lazada / Shopee","Apple Authorized Reseller","Lowyat.NET reviews","2-year warranty (SIRIM)"]}'::jsonb,
   '{"ko":["수입 가격","평행수입 vs 정식","Ringgit 환율","지역 보증"],"en":["Imported price","Parallel vs official import","MYR exchange rate","Regional warranty"]}'::jsonb,
   '{"ko":["Lazada","Shopee","Senheng","Harvey Norman","Apple MY","Lowyat Plaza","Plaza Low Yat"],"en":["Lazada","Shopee","Senheng","Harvey Norman","Apple MY","Lowyat Plaza","Plaza Low Yat"]}'::jsonb,
   'Lowyat.NET is the enthusiast tech forum and Plaza Low Yat the iconic offline tech mall. Senheng dominates electronics retail nationwide. SIRIM certification is the gov-backed quality signal. Samsung and Xiaomi lead smartphones; Apple has growing prestige tier.',
   'IDC Malaysia / Lowyat.NET'),
  ('MY', 2024, 'fashion',
   '{"ko":["Shopee·Lazada·Zalora","로컬 브랜드 (Padini·Vincci·Brands Outlet)","UNIQLO","Instagram·TikTok 인플루언서","Pavilion·KLCC·Mid Valley"],"en":["Shopee / Lazada / Zalora","Local brands (Padini, Vincci, Brands Outlet)","UNIQLO","Instagram / TikTok influencer","Pavilion / KLCC / Mid Valley"]}'::jsonb,
   '{"ko":["사이즈 (아시아 핏)","Modest fashion 수요 (히잡 등)","열대 기후 소재","수입 럭셔리 부담"],"en":["Asian sizing fit","Modest fashion demand (hijab etc)","Tropical climate fabric","Imported luxury markup"]}'::jsonb,
   '{"ko":["Shopee","Lazada","Zalora","Padini","UNIQLO","H&M","Mid Valley Megamall","Pavilion KL"],"en":["Shopee","Lazada","Zalora","Padini","UNIQLO","H&M","Mid Valley Megamall","Pavilion KL"]}'::jsonb,
   'Padini Holdings is the dominant local apparel group (Padini, Vincci, Brands Outlet, SEED). Modest fashion (hijab + abaya + baju kurung) has a multi-billion ringgit market. Tropical climate drives breathable / lightweight fabrics. Zalora is the biggest online fashion retailer.',
   'Euromonitor MY Apparel'),
  ('MY', 2024, 'health',
   '{"ko":["KKM (NPRA) 등록","JAKIM Halal 인증 (Halal supplements)","Watsons·Guardian 약사","로컬 브랜드 (HOVID·Pharmaniaga)","의사 처방"],"en":["KKM (NPRA) registration","JAKIM Halal cert (Halal supplements)","Watsons / Guardian pharmacist","Local brands (HOVID / Pharmaniaga)","Doctor prescription"]}'::jsonb,
   '{"ko":["효능 의심","고가 보충제","Halal 여부","평행수입 진위"],"en":["Efficacy doubt","Premium supplement cost","Halal status","Parallel import authenticity"]}'::jsonb,
   '{"ko":["Watsons","Guardian","Caring Pharmacy","Pharmaniaga","Lazada","Shopee","iHerb"],"en":["Watsons","Guardian","Caring Pharmacy","Pharmaniaga","Lazada","Shopee","iHerb"]}'::jsonb,
   'NPRA notification is mandatory for OTC health products. Halal-certified supplements are growing fast (BiO LIFE, VitaHealth). Watsons / Guardian / Caring Pharmacy are the big-3 retail pharmacy chains. iHerb popular for imported supplements.',
   'NPRA / Euromonitor MY Health'),
  ('MY', 2024, 'saas',
   '{"ko":["G2·Capterra 평가","MyDIGITAL 인증","대기업 (Maybank·CIMB·Petronas) reference","PDPA 준수","무료 체험"],"en":["G2 / Capterra reviews","MyDIGITAL certification","Enterprise reference (Maybank / CIMB / Petronas)","PDPA compliance","Free trial"]}'::jsonb,
   '{"ko":["PDPA 컴플라이언스","외화 결제","Vendor lock-in","현지 데이터 거주성","Bahasa Malaysia 번역"],"en":["PDPA compliance","Foreign currency","Vendor lock-in","Local data residency","Bahasa Malaysia localization"]}'::jsonb,
   '{"ko":["AWS Marketplace","Microsoft Marketplace","TM·Maxis B2B","SaaS 직접 영업","MDEC 파트너"],"en":["AWS Marketplace","Microsoft Marketplace","TM / Maxis B2B","Direct SaaS sales","MDEC partners"]}'::jsonb,
   'Malaysia is positioning as ASEAN digital hub via MDEC (Malaysia Digital Economy Corporation). PDPA 2010 is the baseline compliance. Big-bank reference (Maybank, CIMB, Public Bank) carries enterprise weight. Bahasa Malaysia localization helps for SMB segments.',
   'Gartner ASEAN / IDC Malaysia')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
