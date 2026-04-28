-- VN (Vietnam) reference data — Phase B seed.
-- Sources:
--   • GSO Vietnam — Statistical Yearbook 2023, Labour Force Survey
--   • Adecco / Talentnet / VietnamWorks Salary Guide 2023
--   • Nielsen / Kantar Vietnam consumer 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('VN', 2024, 'Vietnam', 'Việt Nam', 'VND',
   100400000, 130000000, 4400,
   'GSO Vietnam Statistical Yearbook 2023',
   'https://www.gso.gov.vn')
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
   '{"ko":"초등학교 교사 (Giáo viên)","en":"Elementary School Teacher"}'::jsonb,
   'employed', '30-39', 96000000::numeric, 144000000::numeric, 200000000::numeric,
   '연 ₫96M-₫200M (~$4-8k USD)', '₫96M-₫200M annually (~$4-8k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원 (호치민·하노이)","en":"Office Worker (HCMC / Hanoi)"}'::jsonb,
   'employed', '30-39', 150000000, 250000000, 380000000,
   '연 ₫150M-₫380M (~$6-15k USD)', '₫150M-₫380M annually (~$6-15k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (호치민 외자계)","en":"Senior Software Engineer (HCMC Foreign Cos)"}'::jsonb,
   'employed', '30-39', 450000000, 700000000, 1100000000,
   '연 ₫450M-₫1.1B (~$18-44k USD)', '₫450M-₫1.1B annually (~$18-44k USD)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 350000000, 550000000, 850000000,
   '연 ₫350M-₫850M (~$14-34k USD)', '₫350M-₫850M annually (~$14-34k USD)'),
  ('nurse',
   '{"ko":"간호사 (Y tá)","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 96000000, 150000000, 220000000,
   '연 ₫96M-₫220M (~$4-9k USD)', '₫96M-₫220M annually (~$4-9k USD)'),
  ('doctor',
   '{"ko":"의사 (Bác sĩ)","en":"Physician"}'::jsonb,
   'employed', '40-49', 350000000, 600000000, 1000000000,
   '연 ₫350M-₫1B (~$14-40k USD)', '₫350M-₫1B annually (~$14-40k USD)'),
  ('factory_worker',
   '{"ko":"공장 노동자 (FDI 공장)","en":"Factory Worker (FDI Factory)"}'::jsonb,
   'employed', '30-39', 90000000, 130000000, 180000000,
   '연 ₫90M-₫180M (~$4-7k USD)', '₫90M-₫180M annually (~$4-7k USD)'),
  ('grab_driver',
   '{"ko":"Grab·BE 드라이버","en":"Grab / BE Driver"}'::jsonb,
   'employed', '30-39', 100000000, 160000000, 240000000,
   '연 ₫100M-₫240M (~$4-10k USD), 변동 큼',
   '₫100M-₫240M annually (~$4-10k USD), variable'),
  ('small_business_owner',
   '{"ko":"자영업자 (소상공인)","en":"Small Business Owner"}'::jsonb,
   'self_employed', '40-49', 120000000, 280000000, 600000000,
   '사업소득 연 ₫120M-₫600M (변동 큼, ~$5-24k USD)',
   'Annual ₫120M-₫600M (highly variable, ~$5-24k USD)'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 24000000, 60000000, 120000000,
   '용돈+알바 연 ₫24M-₫120M (~$1-5k USD), 부모 지원 별도',
   'Allowance + part-time ₫24M-₫120M/yr (~$1-5k USD)'),
  ('homemaker',
   '{"ko":"전업주부","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 ₫300M-₫600M, 본인 가처분 월 ₫1.5M-₫5M',
   'No personal salary. Household ₫300M-₫600M/yr; personal disposable ₫1.5M-₫5M/month'),
  ('retiree',
   '{"ko":"은퇴자","en":"Retiree"}'::jsonb,
   'retiree', '60+', 60000000, 96000000, 150000000,
   '국가연금 연 ₫60M-₫150M (~$2-6k USD)',
   'State pension ₫60M-₫150M/yr (~$2-6k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 36000000, 72000000, 120000000,
   '연 ₫36M-₫120M (~$1.5-5k USD)',
   '₫36M-₫120M annually (~$1.5-5k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'VN', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'VND',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'GSO 2023 / VietnamWorks Salary Guide'
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
  ('VN', 2024, 'food',
   '{"ko":["Bộ Y Tế (보건부) 식품 등록","VietGAP·GlobalGAP 인증","Tiki·Shopee 평점","Facebook·Zalo 추천","Bach Hoa Xanh PB"],"en":["Ministry of Health food registration","VietGAP / GlobalGAP","Tiki / Shopee ratings","Facebook / Zalo recommendation","Bach Hoa Xanh PB"]}'::jsonb,
   '{"ko":["가격 부담","위생 신뢰성","수입품 관세","유통기한"],"en":["Price","Sanitation trust","Import tariffs","Expiry"]}'::jsonb,
   '{"ko":["Shopee","Lazada","Tiki","GrabFood","Baemin","Bach Hoa Xanh","Co.opmart","Winmart","local market"],"en":["Shopee","Lazada","Tiki","GrabFood","Baemin","Bach Hoa Xanh","Co.opmart","Winmart","local market"]}'::jsonb,
   'Shopee dominates VN e-commerce. Bach Hoa Xanh is the rapidly-growing modern grocery. Wet markets (chợ) remain culturally and economically central. Cash-on-delivery still common. TikTok Shop growing fast.',
   'Nielsen Vietnam 2023'),
  ('VN', 2024, 'beauty',
   '{"ko":["Hasaki·Guardian VN","Watsons","Facebook·TikTok 인플루언서","K-beauty 신뢰 (강력)","피부과 추천"],"en":["Hasaki / Guardian VN","Watsons","Facebook / TikTok influencer","K-beauty trust (strong)","Dermatologist endorsement"]}'::jsonb,
   '{"ko":["피부 트러블","위조품","수입 가격"],"en":["Skin reaction","Counterfeit","Imported price"]}'::jsonb,
   '{"ko":["Shopee","Lazada","Tiki","Hasaki","Watsons","Guardian","TikTok Shop"],"en":["Shopee","Lazada","Tiki","Hasaki","Watsons","Guardian","TikTok Shop"]}'::jsonb,
   'Hasaki has emerged as the dominant beauty specialist (online + offline). K-beauty has overwhelming preference. TikTok Shop has rapidly grown for beauty discovery. Counterfeit is a major concern — official channels matter.',
   'Euromonitor VN'),
  ('VN', 2024, 'electronics',
   '{"ko":["Thế Giới Di Động·FPT Shop","Tiki·Lazada 평점","공식 단증 (수입 절차)","Mi·Oppo 가성비","6·12개월 분할"],"en":["The Gioi Di Dong / FPT Shop","Tiki / Lazada ratings","Official import documentation","Mi / Oppo value","6-12 month installments"]}'::jsonb,
   '{"ko":["수입 관세","위조품","공식 vs 그레이"],"en":["Import tariffs","Counterfeit","Official vs gray"]}'::jsonb,
   '{"ko":["Shopee","Lazada","Tiki","Thế Giới Di Động","FPT Shop","Apple Store"],"en":["Shopee","Lazada","Tiki","The Gioi Di Dong","FPT Shop","Apple Store"]}'::jsonb,
   'Thế Giới Di Động (Mobile World) and FPT Shop dominate offline electronics. Apple has high prestige; Vietnamese consumers value official imports for warranty. Xiaomi and Oppo dominate Android.',
   'IDC Vietnam'),
  ('VN', 2024, 'fashion',
   '{"ko":["Shopee·Lazada Fashion","Local 브랜드 (Canifa, Coolmate)","Facebook 라이브","K-fashion·J-fashion 영향","SHEIN 가성비"],"en":["Shopee / Lazada Fashion","Local brands (Canifa, Coolmate)","Facebook live","K-fashion / J-fashion influence","SHEIN value"]}'::jsonb,
   '{"ko":["사이즈 표준","수입 럭셔리 부담","위조품"],"en":["Size standards","Imported luxury markup","Counterfeit"]}'::jsonb,
   '{"ko":["Shopee","Lazada","Tiki","Canifa","Coolmate","Uniqlo","local stores"],"en":["Shopee","Lazada","Tiki","Canifa","Coolmate","Uniqlo","local stores"]}'::jsonb,
   'Local brands (Canifa, Coolmate) have strong loyalty. Facebook live commerce drives huge fashion volume. K-fashion and J-fashion lead aspirational styling. SHEIN is dominant for ultra-budget.',
   'Euromonitor VN Fashion'),
  ('VN', 2024, 'health',
   '{"ko":["보건부 (Bộ Y Tế) 등록","의사 처방","Pharmacity·Long Châu 약국","TCM·Đông Y 전통","Hapacol·Boganic 등 로컬 브랜드"],"en":["Ministry of Health registration","Doctor prescription","Pharmacity / Long Chau pharmacy","TCM / Đông Y tradition","Hapacol / Boganic local brands"]}'::jsonb,
   '{"ko":["효능 의심","위조품","약가 부담"],"en":["Efficacy doubt","Counterfeit","Drug price"]}'::jsonb,
   '{"ko":["Pharmacity","Long Châu","An Khang","Shopee","Tiki","local chemist"],"en":["Pharmacity","Long Chau","An Khang","Shopee","Tiki","local chemist"]}'::jsonb,
   'Pharmacy chains (Pharmacity, Long Châu) have rapidly modernized. Local chemists (nhà thuốc) remain dominant. Traditional Đông Y coexists with modern. Telemedicine adoption growing.',
   'BMI Vietnam Healthcare'),
  ('VN', 2024, 'saas',
   '{"ko":["베트남어 지원","대기업 (Vingroup·FPT) reference","FPT·CMC SI 파트너","로컬 결제 (MoMo·ZaloPay)","무료 체험"],"en":["Vietnamese support","Enterprise (Vingroup / FPT) reference","FPT / CMC SI partner","Local payment (MoMo / ZaloPay)","Free trial"]}'::jsonb,
   '{"ko":["베트남어 미지원","USD 결제 부담","현지 SI 의존","규제 변화"],"en":["No Vietnamese support","USD pricing","Local SI dependency","Regulatory shifts"]}'::jsonb,
   '{"ko":["AWS Marketplace","SaaS 직접 영업","FPT·CMC SI","Viettel·VNPT B2B"],"en":["AWS Marketplace","Direct SaaS sales","FPT / CMC SI","Viettel / VNPT B2B"]}'::jsonb,
   'Vietnam B2B SaaS skews enterprise — major SI partners (FPT, CMC) gate deals. Vietnamese-language support is increasingly required. MoMo / ZaloPay are local payment must-haves.',
   'IDC Vietnam SaaS')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
