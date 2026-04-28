-- ID (Indonesia) reference data — Phase B seed.
-- Sources:
--   • BPS — Statistik Tenaga Kerja 2023 (National Labor Force Survey)
--   • Kelly Services / Robert Walters Indonesia Salary Guide 2023
--   • Nielsen / Kantar Indonesia consumer 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('ID', 2024, 'Indonesia', 'Indonesia', 'IDR',
   278800000, 60000000, 4900,
   'BPS Statistik Tenaga Kerja 2023',
   'https://www.bps.go.id')
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
   '{"ko":"초등학교 교사 (자카르타)","en":"Elementary School Teacher (Jakarta)"}'::jsonb,
   'employed', '30-39', 36000000::numeric, 60000000::numeric, 96000000::numeric,
   '연 Rp 36M-Rp 96M (~$2.3-6k USD)', 'Rp 36M-Rp 96M annually (~$2.3-6k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원 (자카르타 초·중급)","en":"Office Worker (Jakarta Junior-Mid)"}'::jsonb,
   'employed', '30-39', 60000000, 120000000, 200000000,
   '연 Rp 60M-Rp 200M (~$3.7-12k USD)', 'Rp 60M-Rp 200M annually (~$3.7-12k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (Tech 유니콘)","en":"Senior Software Engineer (Tech Unicorn)"}'::jsonb,
   'employed', '30-39', 250000000, 400000000, 700000000,
   '연 Rp 250M-Rp 700M (~$15-43k USD, Gojek·Tokopedia 등)',
   'Rp 250M-Rp 700M annually (~$15-43k USD, Gojek/Tokopedia tier)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 180000000, 300000000, 500000000,
   '연 Rp 180M-Rp 500M (~$11-31k USD)',
   'Rp 180M-Rp 500M annually (~$11-31k USD)'),
  ('nurse',
   '{"ko":"간호사 (Perawat)","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 48000000, 80000000, 130000000,
   '연 Rp 48M-Rp 130M (~$3-8k USD)', 'Rp 48M-Rp 130M annually (~$3-8k USD)'),
  ('doctor',
   '{"ko":"의사 (Dokter)","en":"Physician"}'::jsonb,
   'employed', '40-49', 240000000, 480000000, 900000000,
   '연 Rp 240M-Rp 900M (~$15-55k USD)', 'Rp 240M-Rp 900M annually (~$15-55k USD)'),
  ('factory_worker',
   '{"ko":"공장 노동자","en":"Factory Worker"}'::jsonb,
   'employed', '30-39', 36000000, 54000000, 78000000,
   '연 Rp 36M-Rp 78M (~$2.2-5k USD)', 'Rp 36M-Rp 78M annually (~$2.2-5k USD)'),
  ('gojek_grab_driver',
   '{"ko":"Gojek·Grab 드라이버","en":"Gojek / Grab Driver"}'::jsonb,
   'employed', '30-39', 36000000, 60000000, 96000000,
   '연 Rp 36M-Rp 96M (~$2.3-6k USD), 변동 큼',
   'Rp 36M-Rp 96M annually (~$2.3-6k USD), variable'),
  ('small_business_owner',
   '{"ko":"자영업자 (Warung·UMKM)","en":"Small Business Owner (UMKM)"}'::jsonb,
   'self_employed', '40-49', 50000000, 120000000, 300000000,
   '사업소득 연 Rp 50M-Rp 300M (변동 큼, ~$3-18k USD)',
   'Annual Rp 50M-Rp 300M (highly variable, ~$3-18k USD)'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 6000000, 18000000, 36000000,
   '용돈+알바 연 Rp 6M-Rp 36M (~$0.4-2k USD), 부모 지원 별도',
   'Allowance + part-time Rp 6M-Rp 36M/yr (~$0.4-2k USD)'),
  ('homemaker',
   '{"ko":"전업주부 (Ibu Rumah Tangga)","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 Rp 150M-Rp 350M, 본인 가처분 월 Rp 1M-Rp 4M',
   'No personal salary. Household Rp 150M-Rp 350M/yr; personal disposable Rp 1M-Rp 4M/month'),
  ('retiree',
   '{"ko":"은퇴자","en":"Retiree"}'::jsonb,
   'retiree', '60+', 24000000, 48000000, 96000000,
   'BPJS·기업연금 연 Rp 24M-Rp 96M (~$1.5-6k USD)',
   'BPJS + corporate pension Rp 24M-Rp 96M/yr (~$1.5-6k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 18000000, 36000000, 60000000,
   '연 Rp 18M-Rp 60M (~$1.1-3.7k USD)',
   'Rp 18M-Rp 60M annually (~$1.1-3.7k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'ID', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'IDR',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'BPS 2023 / Robert Walters Indonesia'
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
  ('ID', 2024, 'food',
   '{"ko":["BPOM 인증","할랄 인증 (MUI)","Tokopedia·Shopee 평점","Instagram·TikTok 인플루언서","대형 슈퍼 PB"],"en":["BPOM certification","Halal certification (MUI)","Tokopedia / Shopee ratings","Instagram / TikTok influencer","Major supermarket PB"]}'::jsonb,
   '{"ko":["가격 부담","할랄 인증 신뢰","유통기한","수입품 관세"],"en":["Price","Halal certification trust","Expiry","Import tariffs"]}'::jsonb,
   '{"ko":["Tokopedia","Shopee","GoFood","GrabFood","Indomaret","Alfamart","Hypermart","Amazon"],"en":["Tokopedia","Shopee","GoFood","GrabFood","Indomaret","Alfamart","Hypermart","Amazon"]}'::jsonb,
   'Indonesia is a Halal-required market. Tokopedia and Shopee dominate e-commerce. Convenience stores (Indomaret, Alfamart) drive impulse food. GoFood and GrabFood are major delivery channels. Live commerce on TikTok Shop is exploding.',
   'Nielsen Indonesia 2023'),
  ('ID', 2024, 'beauty',
   '{"ko":["BPOM 인증","Halal MUI","Sociolla·Female Daily 리뷰","피부과 의사 추천","K-beauty·국산 (Wardah, MS Glow) 신뢰"],"en":["BPOM certification","Halal MUI","Sociolla / Female Daily reviews","Dermatologist endorsement","K-beauty + local brands (Wardah, MS Glow)"]}'::jsonb,
   '{"ko":["피부 트러블","고가 부담","위조품"],"en":["Skin reaction","Premium price","Counterfeits"]}'::jsonb,
   '{"ko":["Sociolla","Tokopedia","Shopee","Watsons","Guardian","Sephora ID","TikTok Shop"],"en":["Sociolla","Tokopedia","Shopee","Watsons","Guardian","Sephora ID","TikTok Shop"]}'::jsonb,
   'Sociolla is the dominant beauty-specialist platform. Wardah is the iconic local Halal beauty brand. K-beauty has massive following. Female Daily reviews drive trust. TikTok Shop is reshaping beauty discovery.',
   'Sociolla / Euromonitor ID'),
  ('ID', 2024, 'electronics',
   '{"ko":["Tokopedia·Shopee 평점","Erafone·iBox","공식 단증 (수입 절차)","BPOM SNI 인증","Cicilan 12개월 분할"],"en":["Tokopedia / Shopee ratings","Erafone / iBox","Official import documentation","BPOM SNI certification","12-month installments"]}'::jsonb,
   '{"ko":["수입 가격 (관세)","공식 단증 vs 회색 수입","위조품"],"en":["Import tariffs","Official vs gray-market imports","Counterfeit"]}'::jsonb,
   '{"ko":["Tokopedia","Shopee","Erafone","iBox","Blibli","JD.ID","Apple Store"],"en":["Tokopedia","Shopee","Erafone","iBox","Blibli","JD.ID","Apple Store"]}'::jsonb,
   'Erafone and iBox are trusted offline electronics retailers. Cicilan (installment payment) is mainstream for big-ticket items. Apple has high prestige but pricing 30-50% above US. Xiaomi and Samsung dominate smartphones.',
   'IDC Indonesia / Euromonitor'),
  ('ID', 2024, 'fashion',
   '{"ko":["Tokopedia·Shopee 패션","Zalora","Hijabi 패션 (히잡)","로컬 브랜드 (Erigo, Kids 24:7)","TikTok Shop"],"en":["Tokopedia / Shopee Fashion","Zalora","Hijabi fashion","Local brands (Erigo, Kids 24:7)","TikTok Shop"]}'::jsonb,
   '{"ko":["사이즈 표준","수입 럭셔리 가격","Cicilan vs 일시불"],"en":["Size standards","Imported luxury markup","Cicilan vs lump sum"]}'::jsonb,
   '{"ko":["Tokopedia","Shopee","Zalora","TikTok Shop","Lazada","H&M","Uniqlo"],"en":["Tokopedia","Shopee","Zalora","TikTok Shop","Lazada","H&M","Uniqlo"]}'::jsonb,
   'Modest fashion (hijabi) is a major segment. Local streetwear brands (Erigo) have global ambitions. TikTok Shop has revolutionized live-commerce fashion in Indonesia.',
   'Euromonitor ID Fashion'),
  ('ID', 2024, 'health',
   '{"ko":["BPOM 인증","의사 처방","Kimia Farma·Century 약국","Halid Tradisional (Jamu) 신뢰","Tokopedia·Shopee 보충제"],"en":["BPOM certification","Doctor prescription","Kimia Farma / Century pharmacy","Traditional Jamu trust","Tokopedia / Shopee supplements"]}'::jsonb,
   '{"ko":["효능 의심","Halal 인증","위조품"],"en":["Efficacy doubt","Halal cert","Counterfeit"]}'::jsonb,
   '{"ko":["Kimia Farma","Century","Guardian","Watsons","Tokopedia","Shopee","Halodoc"],"en":["Kimia Farma","Century","Guardian","Watsons","Tokopedia","Shopee","Halodoc"]}'::jsonb,
   'Pharmacy chains (Kimia Farma, Century) are primary OTC. Halodoc telemedicine has gained mainstream adoption. Traditional Jamu (herbal) coexists with modern pharma. Halal certification matters for ingestibles.',
   'BPOM / Euromonitor ID'),
  ('ID', 2024, 'saas',
   '{"ko":["Bahasa Indonesia 지원","무료 체험","대기업 (Astra·Indofood) 도입","현지 결제 (GoPay·OVO·QRIS)","UU PDP 준수"],"en":["Bahasa Indonesia support","Free trial","Enterprise (Astra / Indofood) reference","Local payment (GoPay / OVO / QRIS)","UU PDP compliance"]}'::jsonb,
   '{"ko":["언어 지원 부족","해외 카드 결제 부담","UU PDP 데이터 거주성"],"en":["Lack of language support","Overseas card payment friction","UU PDP data residency"]}'::jsonb,
   '{"ko":["AWS Marketplace","Telkomsel·Indosat B2B","SaaS 직접 영업","현지 SI (Mitra Integrasi)"],"en":["AWS Marketplace","Telkomsel / Indosat B2B","Direct SaaS sales","Local SI (Mitra Integrasi)"]}'::jsonb,
   'Indonesian B2B requires Bahasa support and local payment integration. UU PDP (Personal Data Protection) is the new compliance baseline. Major SaaS plays via local SI partners.',
   'IDC Indonesia / Robert Walters')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
