-- PH (Philippines) reference data — Phase C seed.
-- Sources:
--   • PSA (Philippine Statistics Authority) — Family Income and Expenditure Survey 2023
--   • Bangko Sentral ng Pilipinas
--   • JobStreet PH / Hays Philippines Salary Guide 2024
--   • Nielsen Philippines / Kantar Worldpanel PH 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('PH', 2024, 'Philippines', 'Pilipinas', 'PHP',
   117340000, 312000, 3950,
   'PSA Family Income and Expenditure Survey 2023',
   'https://psa.gov.ph')
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
   '{"ko":"초등학교 교사 (DepEd 공립)","en":"Primary School Teacher (DepEd public)"}'::jsonb,
   'employed', '30-39', 280000::numeric, 380000::numeric, 540000::numeric,
   '연 ₱280k-₱540k (~$5-9.6k USD)', '₱280k-540k annually (~$5-9.6k USD)'),
  ('office_worker',
   '{"ko":"사무직 (Manila Metro)","en":"Office Worker (Metro Manila)"}'::jsonb,
   'employed', '30-39', 240000, 360000, 600000,
   '연 ₱240k-₱600k (~$4.3-10.7k USD)', '₱240k-600k annually (~$4.3-10.7k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (Manila·Cebu BPO/Tech)","en":"Senior Software Engineer (Manila/Cebu BPO/Tech)"}'::jsonb,
   'employed', '30-39', 720000, 1100000, 1800000,
   '연 ₱720k-₱1.8M (~$12.8-32.1k USD), 외국계 비중 큼',
   '₱720k-1.8M annually (~$12.8-32.1k USD), foreign employers dominant'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 720000, 1100000, 1800000,
   '연 ₱720k-₱1.8M (~$12.8-32.1k USD)',
   '₱720k-1.8M annually (~$12.8-32.1k USD)'),
  ('nurse_local',
   '{"ko":"간호사 (국내 근무)","en":"Registered Nurse (domestic)"}'::jsonb,
   'employed', '30-39', 220000, 320000, 450000,
   '연 ₱220k-₱450k (~$3.9-8k USD), 해외 송출 경우 별도 더 높음',
   '₱220k-450k annually (~$3.9-8k USD); much higher if working abroad'),
  ('doctor',
   '{"ko":"의사","en":"Physician"}'::jsonb,
   'employed', '40-49', 900000, 1500000, 2800000,
   '연 ₱900k-₱2.8M (~$16-50k USD)',
   '₱900k-2.8M annually (~$16-50k USD)'),
  ('bpo_agent',
   '{"ko":"BPO 콜센터 직원 (Concentrix·Teleperformance)","en":"BPO/Call Center Agent (Concentrix/Teleperformance)"}'::jsonb,
   'employed', '20-29', 240000, 320000, 480000,
   '연 ₱240k-₱480k (~$4.3-8.6k USD), 야간 수당 별도. PH 경제 핵심 산업.',
   '₱240k-480k annually (~$4.3-8.6k USD), night differential separate. Core to PH economy.'),
  ('jeepney_driver_or_riding',
   '{"ko":"비정규직 (Jeepney driver, riding-in-tandem 등)","en":"Informal worker (jeepney driver, motorcycle taxi)"}'::jsonb,
   'self_employed', '30-39', 120000, 200000, 320000,
   '소득 연 ₱120k-₱320k (~$2.1-5.7k USD), 정부 통계 미포함 영역',
   '₱120k-320k annually (~$2.1-5.7k USD), informal sector'),
  ('ofw_remittance',
   '{"ko":"OFW 가족 (해외 노동자 송금 수령)","en":"OFW family (Overseas Filipino Worker remittance)"}'::jsonb,
   'employed', '30-39', 180000, 360000, 720000,
   '본인 소득 + 해외 송금 연 ₱180k-₱720k (~$3.2-12.8k USD). PH GDP 8%가 OFW 송금.',
   'Own income + remittance ₱180k-720k/yr (~$3.2-12.8k USD). 8% of PH GDP is OFW remittance.'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 24000, 60000, 120000,
   '용돈+알바 연 ₱24k-₱120k (~$0.4-2.1k USD), 부모 지원 별도',
   'Allowance + part-time ₱24k-120k/yr (~$0.4-2.1k USD)'),
  ('homemaker',
   '{"ko":"전업주부","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 ₱400k-₱900k, 본인 가처분 월 ₱3,000-₱8,000',
   'No personal salary. Household ₱400k-900k/yr; personal disposable ₱3,000-8,000/month'),
  ('retiree',
   '{"ko":"은퇴자 (SSS·GSIS 연금)","en":"Retiree (SSS / GSIS pension)"}'::jsonb,
   'retiree', '60+', 60000, 120000, 240000,
   'SSS·GSIS 연금 연 ₱60k-₱240k (~$1.1-4.3k USD), 해외 자녀 송금 의존도 높음',
   'SSS / GSIS pension ₱60k-240k/yr (~$1.1-4.3k USD); often supplemented by overseas children'),
  ('part_time_worker',
   '{"ko":"파트타임·비정규 근로자","en":"Part-time / Informal Worker"}'::jsonb,
   'employed', '30-39', 100000, 180000, 280000,
   '연 ₱100k-₱280k (~$1.8-5k USD)', '₱100k-280k annually (~$1.8-5k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'PH', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'PHP',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'PSA FIES 2023 / JobStreet PH Salary Report 2024'
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
  ('PH', 2024, 'food',
   '{"ko":["FDA Philippines 인증","SM Supermarket·Robinsons·Puregold","Jollibee·McDonald''s 신뢰","로컬 sari-sari store","GrabFood·foodpanda"],"en":["FDA Philippines certification","SM Supermarket / Robinsons / Puregold","Jollibee / McDonald''s trust","Local sari-sari stores","GrabFood / foodpanda"]}'::jsonb,
   '{"ko":["가격 매우 민감","수입 식품 가격 부담","Sari-sari 작은 단위 구매 선호","Halal vs Christian 구분 (남부 민다나오)"],"en":["Very price-sensitive","Imported food premium","Tingi (small-pack) buying preference","Halal/Christian split (southern Mindanao)"]}'::jsonb,
   '{"ko":["SM Supermarket","Robinsons","Puregold","Sari-sari stores (~1.3M개)","Shopee Mart","Lazada","GrabFood","foodpanda"],"en":["SM Supermarket","Robinsons","Puregold","Sari-sari stores (~1.3M nationwide)","Shopee Mart","Lazada","GrabFood","foodpanda"]}'::jsonb,
   'Sari-sari (corner stores, ~1.3M nationwide) handle small "tingi" packs of every product — driving demand for sachets and single-serve packaging. Jollibee is the iconic local fast food (larger than McDonald''s in PH). Strong family meal culture.',
   'Nielsen Philippines / Kantar PH'),
  ('PH', 2024, 'beauty',
   '{"ko":["Watsons·Mercury Drug","SM Beauty·Beauty Section","Sephora·Rustan''s","K-beauty 매우 인기","Skin whitening 트렌드"],"en":["Watsons / Mercury Drug","SM Beauty / Beauty Section","Sephora / Rustan''s","K-beauty very popular","Skin whitening trend"]}'::jsonb,
   '{"ko":["프리미엄 부담","피부 트러블 (열대 기후)","위조품 (parallel imports)","sachet 단가 선호"],"en":["Premium price","Skin issues (tropical climate)","Counterfeits/parallel imports","Sachet pricing preference"]}'::jsonb,
   '{"ko":["Watsons","Mercury Drug","SM Beauty","Lazada","Shopee","Sephora","Rustan''s"],"en":["Watsons","Mercury Drug","SM Beauty","Lazada","Shopee","Sephora","Rustan''s"]}'::jsonb,
   'Watsons + Mercury Drug dominate health & beauty retail. K-beauty (Innisfree, Laneige, Some By Mi) extremely popular among Gen Z + millennials. Whitening skincare is a major (controversial) category. Sachet/small-pack pricing is critical for mass adoption.',
   'Euromonitor PH Beauty / Watsons IR'),
  ('PH', 2024, 'electronics',
   '{"ko":["SM Cyberzone·Abenson","Lazada·Shopee","Apple Authorized Reseller","Xiaomi·Realme 강세","2년 보증"],"en":["SM Cyberzone / Abenson","Lazada / Shopee","Apple Authorized Reseller","Xiaomi/Realme strong","2-year warranty"]}'::jsonb,
   '{"ko":["수입 가격","아이폰 가격 부담 (BPO 외)","Xiaomi·Realme 가성비 선호","평행수입 위험"],"en":["Imported price","iPhone affordability outside BPO segment","Strong Xiaomi/Realme value preference","Parallel-import risk"]}'::jsonb,
   '{"ko":["Lazada","Shopee","SM Cyberzone","Abenson","Globe·Smart 통신사","Apple Authorized","Power Mac Center"],"en":["Lazada","Shopee","SM Cyberzone","Abenson","Globe/Smart carriers","Apple Authorized","Power Mac Center"]}'::jsonb,
   'Lazada and Shopee dominate online (PH is one of the most online-shopping-heavy markets in SEA). Xiaomi has ~25% smartphone share; Realme ~15%; Samsung ~17%; Apple ~7%. Telecom carriers (Globe, Smart) drive smartphone bundling.',
   'IDC Philippines / Counterpoint SEA'),
  ('PH', 2024, 'fashion',
   '{"ko":["Lazada·Shopee·Zalora","SM Mall·Robinsons","Uniqlo·H&M·Bench (자국)","TikTok Shop 급성장","아울렛·thrift 시장"],"en":["Lazada / Shopee / Zalora","SM Mall / Robinsons","Uniqlo / H&M / Bench (local)","TikTok Shop fast-growing","Outlet / thrift market"]}'::jsonb,
   '{"ko":["가격 매우 민감","열대 기후 통기성","사이즈 표준 (아시아 핏)","Made in PH 약함"],"en":["Very price-sensitive","Tropical climate breathability","Asian sizing","Weak local manufacturing"]}'::jsonb,
   '{"ko":["Shopee","Lazada","Zalora","SM Mall","Robinsons Place","Uniqlo PH","H&M","Bench","Penshoppe"],"en":["Shopee","Lazada","Zalora","SM Mall","Robinsons Place","Uniqlo PH","H&M","Bench","Penshoppe"]}'::jsonb,
   'Bench and Penshoppe are the iconic Filipino apparel brands. SM Malls are anchor offline destinations (SM Megamall, MOA among the largest in Asia). TikTok Shop has captured huge fashion mindshare among Gen Z.',
   'Euromonitor PH Apparel'),
  ('PH', 2024, 'health',
   '{"ko":["FDA Philippines 등록 (필수)","Mercury Drug·Watsons·SouthStar","의사 처방·PhilHealth","Centrum·Conzace 같은 외국 비타민","천연·전통 요법 인기"],"en":["FDA Philippines registration (mandatory)","Mercury Drug / Watsons / SouthStar","Doctor prescription / PhilHealth","Imported vitamins (Centrum, Conzace)","Natural/traditional remedies popular"]}'::jsonb,
   '{"ko":["효능 의심","고가 보충제","FDA 미등록 위험","sachet 단가 선호"],"en":["Efficacy doubt","Premium supplement cost","Non-FDA registered risk","Sachet pricing preference"]}'::jsonb,
   '{"ko":["Mercury Drug","Watsons","SouthStar","Generika","Lazada","Shopee","iHerb"],"en":["Mercury Drug","Watsons","SouthStar","Generika","Lazada","Shopee","iHerb"]}'::jsonb,
   'Mercury Drug (~1,500 stores) is the dominant pharmacy chain. Generika offers cheap generic alternatives. PhilHealth provides limited supplement coverage. Catholic background means low taboo on supplement use; high adoption of multivitamins (Centrum, Conzace).',
   'FDA Philippines / Mercury Drug IR'),
  ('PH', 2024, 'saas',
   '{"ko":["G2·Capterra 평가","대기업 (Globe·SM·Ayala·SMC) reference","Data Privacy Act 준수","영어로 충분 (PH는 SEA 최고 영어 능통)","BPO 산업 핵심 시장"],"en":["G2 / Capterra reviews","Enterprise reference (Globe / SM / Ayala / SMC)","Data Privacy Act compliance","English-native (PH has top SEA English proficiency)","BPO industry core market"]}'::jsonb,
   '{"ko":["Data Privacy Act 컴플라이언스","외화 결제","현지 데이터 거주성","BPO·콜센터 산업 의존도 높음"],"en":["Data Privacy Act compliance","Foreign currency","Local data residency","BPO/call-center industry dependency"]}'::jsonb,
   '{"ko":["AWS Marketplace","Microsoft Marketplace","Globe Business","Direct SaaS sales","BPO·외주 SaaS 마켓 큼"],"en":["AWS Marketplace","Microsoft Marketplace","Globe Business","Direct SaaS sales","Strong BPO/outsourced SaaS market"]}'::jsonb,
   'Philippines is a major BPO hub (~$30B industry, 1.4M+ employees) — call centers, IT outsourcing, KPO. SaaS GTM into PH should target both local SMB AND multinational clients with PH operations. English-native enterprise market.',
   'IDC Philippines / IT-BPM Roadmap')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
