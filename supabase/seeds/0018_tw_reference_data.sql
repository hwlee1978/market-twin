-- TW (Taiwan) reference data — Phase B+ seed.
-- Sources:
--   • DGBAS (主計總處) — Family Income & Expenditure Survey 2023
--   • Ministry of Labor 統計處 — Wages & Hours Worked 2023
--   • 104人力銀行 / 1111 Salary Survey 2023
--   • Nielsen Taiwan / Kantar Taiwan 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('TW', 2024, 'Taiwan', '臺灣', 'TWD',
   23420000, 1150000, 33000,
   'DGBAS Family Income & Expenditure Survey 2023',
   'https://www.dgbas.gov.tw')
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
   '{"ko":"초등학교 교사 (公立小學)","en":"Primary School Teacher (Public)"}'::jsonb,
   'employed', '30-39', 720000::numeric, 920000::numeric, 1200000::numeric,
   '연 NT$72만-NT$120만 (~$23-38k USD)', 'NT$720k-1.2M annually (~$23-38k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원 (上班族)","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 540000, 720000, 960000,
   '연 NT$54만-NT$96만 (~$17-31k USD)', 'NT$540k-960k annually (~$17-31k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (TSMC·Tech)","en":"Senior Software Engineer (TSMC / Tech)"}'::jsonb,
   'employed', '30-39', 1300000, 1800000, 2800000,
   '연 NT$130만-NT$280만 (~$42-90k USD, 보너스 별도)',
   'NT$1.3M-2.8M annually (~$42-90k USD, bonus separate)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 900000, 1200000, 1700000,
   '연 NT$90만-NT$170만 (~$29-55k USD)',
   'NT$900k-1.7M annually (~$29-55k USD)'),
  ('nurse',
   '{"ko":"간호사 (護理師)","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 700000, 850000, 1100000,
   '연 NT$70만-NT$110만 (~$23-35k USD), 야간 수당 별도',
   'NT$700k-1.1M annually (~$23-35k USD), night shift bonus separate'),
  ('doctor',
   '{"ko":"의사 (醫師)","en":"Physician"}'::jsonb,
   'employed', '40-49', 2500000, 4000000, 6500000,
   '연 NT$250만-NT$650만 (~$80-209k USD)',
   'NT$2.5M-6.5M annually (~$80-209k USD)'),
  ('shop_owner',
   '{"ko":"자영업 (점포 운영, 中小企業)","en":"Shop / SMB Owner"}'::jsonb,
   'self_employed', '40-49', 480000, 850000, 1500000,
   '사업소득 연 NT$48만-NT$150만 (변동 큼, ~$15-48k USD)',
   'Annual NT$480k-1.5M (highly variable, ~$15-48k USD)'),
  ('semiconductor_engineer',
   '{"ko":"반도체 엔지니어 (TSMC·UMC)","en":"Semiconductor Engineer (TSMC / UMC)"}'::jsonb,
   'employed', '30-39', 1100000, 1600000, 2400000,
   '연 NT$110만-NT$240만 (~$35-77k USD, 분홍 보너스 별도)',
   'NT$1.1M-2.4M annually (~$35-77k USD, bonus separate)'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 80000, 150000, 280000,
   '용돈+알바 연 NT$8만-NT$28만 (~$2.6-9k USD), 부모 지원 별도',
   'Allowance + part-time NT$80k-280k/yr (~$2.6-9k USD)'),
  ('homemaker',
   '{"ko":"전업주부 (家庭主婦)","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 NT$120만-NT$200만, 본인 가처분 월 NT$10k-30k',
   'No personal salary. Household NT$1.2M-2.0M/yr; personal disposable NT$10-30k/month'),
  ('retiree',
   '{"ko":"은퇴자 (退休)","en":"Retiree"}'::jsonb,
   'retiree', '60+', 250000, 480000, 800000,
   '勞保·軍公教 연금 연 NT$25만-NT$80만 (~$8-26k USD)',
   'Labor / civil servant pension NT$250k-800k/yr (~$8-26k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자 (時薪)","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 200000, 320000, 480000,
   '연 NT$20만-NT$48만 (~$6-15k USD), 시급 NT$185-300',
   'NT$200k-480k annually (~$6-15k USD), hourly NT$185-300')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'TW', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'TWD',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'DGBAS 2023 / 104人力銀行 Salary Survey'
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
  ('TW', 2024, 'food',
   '{"ko":["TFDA 식품안전 인증","產銷履歷·有機認證","PChome·momo 리뷰","夜市·便利商店 신뢰","國產 (대만 국산)"],"en":["TFDA food safety","產銷履歷 traceability / organic cert","PChome / momo reviews","Night market / convenience store trust","Made-in-Taiwan preference"]}'::jsonb,
   '{"ko":["가격 부담","식품 안전 사건 (잔여 우려)","수입 대만 vs 중국산 구분","건강 트렌드"],"en":["Price","Past food safety scandals","Origin: TW vs CN","Health trends"]}'::jsonb,
   '{"ko":["PChome","momo購物","蝦皮購物 (Shopee)","Yahoo奇摩","便利商店 (7-Eleven, 全家)","UberEats","FoodPanda"],"en":["PChome","momo Shopping","Shopee TW","Yahoo TW","Convenience stores (7-Eleven, FamilyMart)","UberEats","FoodPanda"]}'::jsonb,
   'TW has dense convenience store culture (~12k stores nationwide). Night market culture is core. 產銷履歷 (traceability) carries gov-backed trust after 2014 食安風暴 scandals. PChome and momo are dominant e-commerce.',
   'Nielsen TW / Kantar Worldpanel TW'),
  ('TW', 2024, 'beauty',
   '{"ko":["皮膚科 醫師 추천","屈臣氏·康是美·寶雅 추천","TFDA 인증","Dcard 美妝板","K-beauty·J-beauty·MIT 신뢰"],"en":["Dermatologist endorsement","Watsons / Cosmed / POYA","TFDA certification","Dcard beauty board","K-beauty / J-beauty / MIT (Made in Taiwan)"]}'::jsonb,
   '{"ko":["피부 트러블 (敏感肌)","고가 부담","平輸 (병행수입) 진위","아열대 기후 영향"],"en":["Skin reaction (sensitive skin)","Premium price","Parallel import authenticity","Subtropical climate"]}'::jsonb,
   '{"ko":["屈臣氏 (Watsons)","康是美 (Cosmed)","寶雅 (POYA)","蝦皮","momo","Sephora TW","Dcard","小紅書"],"en":["Watsons TW","Cosmed","POYA","Shopee TW","momo","Sephora TW","Dcard","Xiaohongshu"]}'::jsonb,
   'POYA (寶雅) is uniquely TW — combines beauty + lifestyle goods, dominant in younger demos. Dcard is the top community for beauty reviews. K-beauty and J-beauty have strong followings; MIT (Made in Taiwan) is rising premium tier.',
   'Euromonitor TW Beauty / Dcard insight'),
  ('TW', 2024, 'electronics',
   '{"ko":["燦坤·全國電子","PChome·momo","Apple Premium Reseller","T客邦·Mobile01 리뷰","2년 보증 (BSMI)"],"en":["Tsann Kuen / E-Life","PChome / momo","Apple Premium Reseller","T客邦 / Mobile01 reviews","2-year warranty (BSMI)"]}'::jsonb,
   '{"ko":["수입 가격","平輸 vs 公司貨 (정식 수입품)","지역 보증","新台幣 환율"],"en":["Imported price","Parallel vs official import","Regional warranty","TWD exchange rate"]}'::jsonb,
   '{"ko":["PChome","momo","蝦皮","燦坤","全國電子","Apple Online","三井Outlet"],"en":["PChome","momo","Shopee","Tsann Kuen","E-Life","Apple Online","Mitsui Outlet"]}'::jsonb,
   'Mobile01 forum is the enthusiast trust anchor for tech. TW is itself an electronics manufacturing hub (TSMC/Foxconn) — local consumers are tech-literate. PChome 24-hour delivery is iconic.',
   'IDC TW / Mobile01 community survey'),
  ('TW', 2024, 'fashion',
   '{"ko":["Shopee·momo","東京著衣·Pazzo·Lulus 등 로컬 브랜드","UNIQLO·GU","Instagram·TikTok 인플루언서","東區·西門 거리"],"en":["Shopee / momo","Local brands (東京著衣, Pazzo, Lulus)","UNIQLO / GU","Instagram / TikTok influencer","East District / Ximending"]}'::jsonb,
   '{"ko":["사이즈 (아시아 핏)","아열대 기후 소재","수입 럭셔리 부담","快時尚 환경 우려"],"en":["Asian sizing fit","Subtropical climate fabric","Imported luxury markup","Fast-fashion sustainability concerns"]}'::jsonb,
   '{"ko":["Shopee","momo","PChome","Yahoo","UNIQLO","GU","Net-a-Porter","ZOZOTOWN TW"],"en":["Shopee","momo","PChome","Yahoo","UNIQLO","GU","Net-a-Porter","ZOZOTOWN TW"]}'::jsonb,
   'East District (東區) and Ximending (西門) anchor offline shopping. Local women-fashion brands like 東京著衣 and Pazzo lead online. UNIQLO and GU dominate everyday wear. Subtropical climate drives breathable-fabric preference.',
   'Euromonitor TW Apparel'),
  ('TW', 2024, 'health',
   '{"ko":["TFDA 건강식품 인증 (小綠人)","醫師 처방·健保","屈臣氏·康是美 약사","Dcard·Mobile01 리뷰","國產 製造"],"en":["TFDA health-food cert (小綠人 mark)","Doctor prescription / National Health Insurance","Watsons / Cosmed pharmacist","Dcard / Mobile01 reviews","Made-in-Taiwan"]}'::jsonb,
   '{"ko":["효능 의심","고가 보충제 부담","평행수입 진위","健保 비급여"],"en":["Efficacy doubt","Premium supplement cost","Parallel import authenticity","NHI non-coverage"]}'::jsonb,
   '{"ko":["屈臣氏","康是美","大樹藥局","PChome","momo","蝦皮","iHerb"],"en":["Watsons","Cosmed","Daiso Pharmacy","PChome","momo","Shopee","iHerb"]}'::jsonb,
   'TW has universal NHI (健保) covering most healthcare. TFDA approval (小綠人 little green man mark) is the key health-food trust signal. Watsons and Cosmed dominate retail pharmacy. Mobile01 and Dcard drive supplement purchase decisions.',
   'TFDA / Euromonitor TW'),
  ('TW', 2024, 'saas',
   '{"ko":["G2·Capterra 평가","行政院 數位部 (MODA) 인증","대기업 (TSMC·鴻海) reference","個資法 준수","무료 체험"],"en":["G2 / Capterra reviews","MODA (Ministry of Digital Affairs) certification","Enterprise reference (TSMC / Foxconn)","Personal Data Protection Act compliance","Free trial"]}'::jsonb,
   '{"ko":["個資法 컴플라이언스","외화 결제","Vendor lock-in","현지 데이터 거주성","중국어 번역"],"en":["PDPA compliance","Foreign currency","Vendor lock-in","Local data residency","Traditional Chinese localization"]}'::jsonb,
   '{"ko":["AWS Marketplace","Microsoft Marketplace","中華電信 B2B","SaaS 직접 영업","台灣經貿網"],"en":["AWS Marketplace","Microsoft Marketplace","Chunghwa Telecom B2B","Direct SaaS sales","Taiwan Trade"]}'::jsonb,
   'TW has strong tech procurement culture due to semiconductor / hardware ecosystem. Traditional Chinese localization is essential (Simplified Chinese is often a deal-breaker for branding reasons). 個資法 (PDPA) is the compliance baseline.',
   'Gartner APAC / IDC TW')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
