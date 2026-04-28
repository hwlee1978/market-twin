-- TH (Thailand) reference data — Phase B seed.
-- Sources:
--   • NSO Thailand — Labor Force Survey 2023
--   • JobsDB / Adecco Thailand Salary Guide 2023
--   • Nielsen / Kantar Thailand consumer 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('TH', 2024, 'Thailand', 'ประเทศไทย', 'THB',
   71800000, 360000, 7300,
   'NSO Thailand Labor Force Survey 2023',
   'https://www.nso.go.th')
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
   'employed', '30-39', 240000::numeric, 360000::numeric, 480000::numeric,
   '연 ฿240k-฿480k (~$7-13k USD)', '฿240k-฿480k annually (~$7-13k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원 (방콕)","en":"Office Worker (Bangkok)"}'::jsonb,
   'employed', '30-39', 300000, 480000, 750000,
   '연 ฿300k-฿750k (~$8-21k USD)', '฿300k-฿750k annually (~$8-21k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (방콕 외자계)","en":"Senior Software Engineer (Bangkok Foreign Cos)"}'::jsonb,
   'employed', '30-39', 750000, 1200000, 1900000,
   '연 ฿750k-฿1.9M (~$21-53k USD)', '฿750k-฿1.9M annually (~$21-53k USD)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 600000, 900000, 1400000,
   '연 ฿600k-฿1.4M (~$17-39k USD)', '฿600k-฿1.4M annually (~$17-39k USD)'),
  ('nurse',
   '{"ko":"간호사 (พยาบาล)","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 240000, 360000, 540000,
   '연 ฿240k-฿540k (~$7-15k USD)', '฿240k-฿540k annually (~$7-15k USD)'),
  ('doctor',
   '{"ko":"의사 (แพทย์)","en":"Physician"}'::jsonb,
   'employed', '40-49', 800000, 1500000, 2800000,
   '연 ฿800k-฿2.8M (~$22-78k USD)', '฿800k-฿2.8M annually (~$22-78k USD)'),
  ('factory_worker',
   '{"ko":"공장 노동자","en":"Factory Worker"}'::jsonb,
   'employed', '30-39', 180000, 240000, 360000,
   '연 ฿180k-฿360k (~$5-10k USD)', '฿180k-฿360k annually (~$5-10k USD)'),
  ('grab_driver',
   '{"ko":"Grab·LineMan 드라이버","en":"Grab / LineMan Driver"}'::jsonb,
   'employed', '30-39', 200000, 320000, 480000,
   '연 ฿200k-฿480k (~$5-13k USD), 변동 큼',
   '฿200k-฿480k annually (~$5-13k USD), variable'),
  ('small_business_owner',
   '{"ko":"자영업자 (SME)","en":"Small Business Owner (SME)"}'::jsonb,
   'self_employed', '40-49', 240000, 600000, 1200000,
   '사업소득 연 ฿240k-฿1.2M (변동 큼, ~$7-33k USD)',
   'Annual ฿240k-฿1.2M (highly variable, ~$7-33k USD)'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 30000, 80000, 150000,
   '용돈+알바 연 ฿30k-฿150k (~$0.8-4k USD), 부모 지원 별도',
   'Allowance + part-time ฿30k-฿150k/yr (~$0.8-4k USD)'),
  ('homemaker',
   '{"ko":"전업주부 (แม่บ้าน)","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 ฿600k-฿1.2M, 본인 가처분 월 ฿3k-฿10k',
   'No personal salary. Household ฿600k-฿1.2M/yr; personal disposable ฿3k-฿10k/month'),
  ('retiree',
   '{"ko":"은퇴자","en":"Retiree"}'::jsonb,
   'retiree', '60+', 120000, 200000, 360000,
   '국가연금 연 ฿120k-฿360k (~$3-10k USD)',
   'State pension ฿120k-฿360k/yr (~$3-10k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 90000, 150000, 240000,
   '연 ฿90k-฿240k (~$2.5-7k USD)', '฿90k-฿240k annually (~$2.5-7k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'TH', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'THB',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'NSO Thailand 2023 / JobsDB Salary'
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
  ('TH', 2024, 'food',
   '{"ko":["FDA Thailand 인증","할랄 인증 (CICOT)","Tops·Big C·Lotus''s PB","Pantip 후기","Facebook·LINE 추천"],"en":["Thai FDA certification","Halal cert (CICOT)","Tops / Big C / Lotus''s PB","Pantip reviews","Facebook / LINE"]}'::jsonb,
   '{"ko":["가격 부담","수입품 관세","유통기한","위생 우려"],"en":["Price","Import tariffs","Expiry","Sanitation concerns"]}'::jsonb,
   '{"ko":["Shopee","Lazada","Tops","Big C","Lotus''s","7-Eleven","GrabFood","Foodpanda","local market"],"en":["Shopee","Lazada","Tops","Big C","Lotus''s","7-Eleven","GrabFood","Foodpanda","local market"]}'::jsonb,
   '7-Eleven is uniquely powerful in Thailand — convenient, dense, high trust. Shopee dominates e-commerce. Pantip forum drives consumer trust. Wet markets remain economically central. K-food and Japanese food trending.',
   'Nielsen Thailand 2023'),
  ('TH', 2024, 'beauty',
   '{"ko":["FDA Thailand 등록","Watsons·Boots 진열","Pantip·LIPS 리뷰","K-beauty 신뢰","Mistine·Srichand 로컬 브랜드"],"en":["Thai FDA registration","Watsons / Boots","Pantip / LIPS reviews","K-beauty trust","Mistine / Srichand local brands"]}'::jsonb,
   '{"ko":["피부 트러블","위조품","수입 가격","열대 기후 (자외선)"],"en":["Skin reaction","Counterfeit","Imported price","Tropical climate (UV)"]}'::jsonb,
   '{"ko":["Shopee","Lazada","Watsons","Boots","Sephora TH","Konvy","TikTok Shop"],"en":["Shopee","Lazada","Watsons","Boots","Sephora TH","Konvy","TikTok Shop"]}'::jsonb,
   'Konvy is the dominant beauty specialist online. Watsons / Boots dominate retail. K-beauty has overwhelming preference. Local masstige brands (Mistine, Srichand, BSC) hold strong. UV / heat-resistant focus.',
   'Euromonitor TH'),
  ('TH', 2024, 'electronics',
   '{"ko":["JIB·Banana IT·Power Buy","Lazada·Shopee 평점","공식 단증 (수입 절차)","TCAS 인증","Mi·Oppo 가성비"],"en":["JIB / Banana IT / Power Buy","Lazada / Shopee ratings","Official import documentation","TCAS certification","Mi / Oppo value"]}'::jsonb,
   '{"ko":["수입 관세","위조품","공식 vs 그레이"],"en":["Import tariffs","Counterfeit","Official vs gray"]}'::jsonb,
   '{"ko":["Shopee","Lazada","JIB","Banana IT","Power Buy","Apple Store"],"en":["Shopee","Lazada","JIB","Banana IT","Power Buy","Apple Store"]}'::jsonb,
   'JIB and Banana IT lead specialist electronics retail. Power Buy is the major appliance chain. Apple has high prestige with significant price premium. Shopee and Lazada dominate online — both with extensive grading systems.',
   'IDC Thailand'),
  ('TH', 2024, 'fashion',
   '{"ko":["Shopee·Lazada Fashion","Central·Robinson 백화점","Instagram·TikTok 인플루언서","SHEIN 가성비","Pomelo 등 로컬 브랜드"],"en":["Shopee / Lazada Fashion","Central / Robinson department","Instagram / TikTok influencer","SHEIN value","Pomelo local brands"]}'::jsonb,
   '{"ko":["사이즈 표준","수입 럭셔리 부담","위조품"],"en":["Size standards","Imported luxury markup","Counterfeit"]}'::jsonb,
   '{"ko":["Shopee","Lazada","Pomelo","Central","Robinson","Uniqlo","Zara","TikTok Shop"],"en":["Shopee","Lazada","Pomelo","Central","Robinson","Uniqlo","Zara","TikTok Shop"]}'::jsonb,
   'Pomelo is the iconic local fashion brand. Central Department Store anchors premium. SHEIN dominates ultra-budget. K-fashion and Japanese minimalism (Uniqlo) lead aspirational. TikTok Shop is reshaping fashion discovery.',
   'Euromonitor TH Fashion'),
  ('TH', 2024, 'health',
   '{"ko":["FDA Thailand 등록","의사 처방 (정부병원·private)","Boots·Watsons·Tsuruha 약국","Thai 전통 의학 (สมุนไพร)","수입 보충제"],"en":["Thai FDA registration","Doctor prescription (gov / private)","Boots / Watsons / Tsuruha","Thai traditional medicine","Imported supplements"]}'::jsonb,
   '{"ko":["효능 의심","위조품","약가","공공 vs 사보험"],"en":["Efficacy doubt","Counterfeit","Drug price","Public vs private insurance"]}'::jsonb,
   '{"ko":["Boots","Watsons","Tsuruha","Pure","Shopee","Lazada","local pharmacy"],"en":["Boots","Watsons","Tsuruha","Pure","Shopee","Lazada","local pharmacy"]}'::jsonb,
   'Pharmacy chains (Boots, Watsons, Tsuruha) dominate. Thai traditional medicine has cultural depth. Universal coverage via 30-baht scheme. Medical tourism makes Thailand a regional health hub.',
   'BMI Thailand Healthcare'),
  ('TH', 2024, 'saas',
   '{"ko":["태국어 지원","대기업 (CP·Siam Commercial Bank) reference","로컬 결제 (PromptPay)","PDPA 준수","무료 체험"],"en":["Thai language support","Enterprise (CP / Siam Commercial Bank) reference","Local payment (PromptPay)","PDPA compliance","Free trial"]}'::jsonb,
   '{"ko":["태국어 미지원","USD 결제 부담","PDPA 컴플라이언스","현지 SI 부족"],"en":["No Thai support","USD pricing","PDPA compliance","Limited local SI"]}'::jsonb,
   '{"ko":["AWS Marketplace","SaaS 직접 영업","TRUE·AIS B2B","현지 SI"],"en":["AWS Marketplace","Direct SaaS sales","TRUE / AIS B2B","Local SI"]}'::jsonb,
   'Thai B2B SaaS adoption is rapidly growing post-COVID. PDPA Act 2022 brought formal data privacy. Thai language support increasingly expected. Major SI partners gate enterprise.',
   'IDC Thailand SaaS')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
