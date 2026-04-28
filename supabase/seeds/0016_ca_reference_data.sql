-- CA (Canada) reference data — Phase B seed.
-- Sources:
--   • Statistics Canada — Canadian Income Survey 2022
--   • Statistics Canada — Labour Force Survey 2023
--   • Robert Half / Hays Canada Salary Guide 2023
--   • Numerator / Nielsen Canada consumer 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('CA', 2024, 'Canada', 'Canada', 'CAD',
   40100000, 92000, 53400,
   'Statistics Canada Canadian Income Survey 2022',
   'https://www.statcan.gc.ca')
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
   '{"ko":"초등학교 교사","en":"Elementary School Teacher"}'::jsonb,
   'employed', '30-39', 65000::numeric, 80000::numeric, 95000::numeric,
   '연 C$65k-C$95k (~$48-70k USD)', 'C$65k-C$95k annually (~$48-70k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 55000, 72000, 95000,
   '연 C$55k-C$95k (~$41-70k USD)', 'C$55k-C$95k annually (~$41-70k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (Toronto·Vancouver)","en":"Senior Software Engineer (Toronto / Vancouver)"}'::jsonb,
   'employed', '30-39', 110000, 145000, 200000,
   '연 C$110k-C$200k (~$81-148k USD)', 'C$110k-C$200k annually (~$81-148k USD)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 80000, 105000, 140000,
   '연 C$80k-C$140k (~$59-104k USD)', 'C$80k-C$140k annually (~$59-104k USD)'),
  ('nurse',
   '{"ko":"간호사 (RN)","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 75000, 92000, 110000,
   '연 C$75k-C$110k (~$56-81k USD)', 'C$75k-C$110k annually (~$56-81k USD)'),
  ('doctor',
   '{"ko":"의사 (Family Physician)","en":"Family Physician"}'::jsonb,
   'employed', '40-49', 220000, 320000, 450000,
   '연 C$220k-C$450k (~$163-333k USD)', 'C$220k-C$450k annually (~$163-333k USD)'),
  ('barista',
   '{"ko":"바리스타","en":"Barista"}'::jsonb,
   'employed', '20-29', 32000, 38000, 45000,
   '연 C$32k-C$45k (~$24-33k USD)', 'C$32k-C$45k annually (~$24-33k USD)'),
  ('tradesperson',
   '{"ko":"숙련 기능공 (전기·배관 등)","en":"Tradesperson (Electrician / Plumber)"}'::jsonb,
   'employed', '30-39', 70000, 90000, 120000,
   '연 C$70k-C$120k (~$52-89k USD)', 'C$70k-C$120k annually (~$52-89k USD)'),
  ('self_employed',
   '{"ko":"자영업자","en":"Self-employed"}'::jsonb,
   'self_employed', '40-49', 50000, 90000, 160000,
   '사업소득 연 C$50k-C$160k (변동 큼, ~$37-119k USD)',
   'Annual C$50k-C$160k (highly variable, ~$37-119k USD)'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 6000, 14000, 25000,
   '파트타임 연 C$6k-C$25k (~$4-19k USD), OSAP·CSP 별도',
   'Part-time C$6k-C$25k/yr (~$4-19k USD), OSAP / CSP separate'),
  ('homemaker',
   '{"ko":"전업주부 / Stay-at-home Parent","en":"Homemaker / Stay-at-home Parent"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 C$110k-C$170k, 본인 가처분 월 C$400-C$1,200',
   'No personal salary. Household C$110k-C$170k/yr; personal disposable C$400-C$1,200/month'),
  ('retiree',
   '{"ko":"은퇴자","en":"Retiree"}'::jsonb,
   'retiree', '60+', 28000, 45000, 75000,
   'CPP + OAS + RRSP 연 C$28k-C$75k (~$21-56k USD)',
   'CPP + OAS + RRSP C$28k-C$75k/yr (~$21-56k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 22000, 35000, 50000,
   '연 C$22k-C$50k (~$16-37k USD)', 'C$22k-C$50k annually (~$16-37k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'CA', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'CAD',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'StatCan 2022 / Robert Half Canada'
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
  ('CA', 2024, 'food',
   '{"ko":["CFIA 식품 안전","Made in Canada 우대","Loblaws·Sobeys·Costco PB","Reddit r/Canada 추천","ProductReview·CBC Marketplace"],"en":["CFIA food safety","Made in Canada preference","Loblaws / Sobeys / Costco PB","Reddit r/Canada","ProductReview / CBC Marketplace"]}'::jsonb,
   '{"ko":["가격 부담 (Inflation)","Carbon tax 영향","유통기한","수입품 표기"],"en":["Price (inflation)","Carbon tax impact","Expiry","Import labeling"]}'::jsonb,
   '{"ko":["Loblaws·No Frills","Sobeys·FreshCo","Metro","Costco","Walmart Canada","Amazon Canada","Instacart","HelloFresh"],"en":["Loblaws / No Frills","Sobeys / FreshCo","Metro","Costco","Walmart Canada","Amazon Canada","Instacart","HelloFresh"]}'::jsonb,
   'Loblaws (and President''s Choice PB) and Sobeys dominate grocery. Costco has cult-like loyalty. Quebec preferences differ — local Loblaws-owned Maxi, Provigo. Bilingual labeling required.',
   'Numerator Canada 2023'),
  ('CA', 2024, 'beauty',
   '{"ko":["Sephora·Shoppers Drug Mart","Beauty Boutique by Shoppers","Reddit r/SkincareAddiction","Health Canada 인증","Made-in-Canada 우대"],"en":["Sephora / Shoppers Drug Mart","Beauty Boutique by Shoppers","Reddit r/SkincareAddiction","Health Canada cert","Made-in-Canada preference"]}'::jsonb,
   '{"ko":["피부 트러블","고가 부담","수입 가격 (USD 환율)"],"en":["Skin reaction","Premium price","Imported price (USD FX)"]}'::jsonb,
   '{"ko":["Sephora","Shoppers Drug Mart","Murale","Amazon Canada","Walmart","Costco"],"en":["Sephora","Shoppers Drug Mart","Murale","Amazon Canada","Walmart","Costco"]}'::jsonb,
   'Shoppers Drug Mart Beauty Boutique is uniquely powerful — chain pharmacy + premium beauty. Sephora is dominant prestige. K-beauty has strong following.',
   'Numerator Canada Beauty'),
  ('CA', 2024, 'electronics',
   '{"ko":["Best Buy Canada·Costco","Apple Store","Reddit r/bapcsalescanada","CSA 인증","2년 보증"],"en":["Best Buy Canada / Costco","Apple Store","Reddit r/bapcsalescanada","CSA certification","2-year warranty"]}'::jsonb,
   '{"ko":["수입 관세·세금","USD 환율","수리 비용","Repair Cafe 운동"],"en":["Import tariffs","USD FX","Repair cost","Repair Cafe movement"]}'::jsonb,
   '{"ko":["Best Buy Canada","Costco","Amazon Canada","Apple Store","Walmart","Canada Computers"],"en":["Best Buy Canada","Costco","Amazon Canada","Apple Store","Walmart","Canada Computers"]}'::jsonb,
   'Best Buy is the dominant electronics retailer (Future Shop merger). Costco has strong consumer-electronics presence with extended warranties. Apple has loyal base; Right-to-Repair gaining momentum.',
   'GfK Canada'),
  ('CA', 2024, 'fashion',
   '{"ko":["Hudson''s Bay·Holt Renfrew","Aritzia·Roots 등 로컬 브랜드","Sustainability 인증","Reddit·TikTok 인플루언서","SSENSE 럭셔리"],"en":["Hudson''s Bay / Holt Renfrew","Aritzia / Roots local brands","Sustainability cert","Reddit / TikTok influencer","SSENSE luxury"]}'::jsonb,
   '{"ko":["사이즈 표준","Fast fashion 윤리","겨울복 비용"],"en":["Size standards","Fast fashion ethics","Winter wear cost"]}'::jsonb,
   '{"ko":["Hudson''s Bay","Aritzia","Amazon Canada","SSENSE","Lululemon","Roots","H&M","Zara","Winners"],"en":["Hudson''s Bay","Aritzia","Amazon Canada","SSENSE","Lululemon","Roots","H&M","Zara","Winners"]}'::jsonb,
   'Aritzia, Lululemon, Roots are iconic Canadian brands. SSENSE is a global luxury e-commerce powerhouse from Montreal. Hudson''s Bay has historic heritage. Winter wear is a unique market segment.',
   'Numerator Canada Fashion'),
  ('CA', 2024, 'health',
   '{"ko":["Health Canada 승인","Shoppers Drug Mart 약사","의사 처방 (Provincial healthcare)","NPN 등록 (Natural Product Number)","Reddit r/CanadaHealth"],"en":["Health Canada approval","Shoppers Drug Mart pharmacist","Doctor prescription (Provincial healthcare)","NPN registration","Reddit r/CanadaHealth"]}'::jsonb,
   '{"ko":["수입 보충제 진위","Provincial vs federal 약가","Out-of-pocket 비용"],"en":["Imported supplement authenticity","Provincial vs federal drug pricing","Out-of-pocket cost"]}'::jsonb,
   '{"ko":["Shoppers Drug Mart","Rexall","Pharmasave","Amazon Canada","Costco","Well.ca"],"en":["Shoppers Drug Mart","Rexall","Pharmasave","Amazon Canada","Costco","Well.ca"]}'::jsonb,
   'Shoppers Drug Mart and Rexall dominate pharmacy. Provincial healthcare covers basics; supplemental insurance common. NPN registration required for natural health products. Cannabis legalization has changed wellness landscape.',
   'Health Canada / Numerator'),
  ('CA', 2024, 'saas',
   '{"ko":["G2·Capterra 평가","English·French 지원 (Quebec)","대기업 (RBC·TD) reference","PIPEDA·Quebec Law 25 준수","무료 체험"],"en":["G2 / Capterra reviews","English + French support (Quebec)","Enterprise (RBC / TD) reference","PIPEDA / Quebec Law 25","Free trial"]}'::jsonb,
   '{"ko":["Quebec Law 25 (강력)","미국 데이터 거주성","French 지원 부담"],"en":["Quebec Law 25 (strong)","US data residency","French support burden"]}'::jsonb,
   '{"ko":["AWS Marketplace","Microsoft Marketplace","SaaS 직접 영업","CGI·Bell B2B"],"en":["AWS Marketplace","Microsoft Marketplace","Direct SaaS sales","CGI / Bell B2B"]}'::jsonb,
   'Canada B2B is largely an extension of US market but with PIPEDA federal privacy + Quebec Law 25 (very strict). French-language support is mandatory in Quebec. Toronto and Montreal are the major B2B markets.',
   'IDC Canada / Hays')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
