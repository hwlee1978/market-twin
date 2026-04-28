-- IN (India) reference data — Phase B seed.
-- Tier-1 metro (Mumbai, Bangalore, Delhi-NCR, Hyderabad) salaries; Tier-2/3 lower.
-- Sources:
--   • MoSPI / NSO — Periodic Labour Force Survey (PLFS) 2022-23
--   • Naukri JobSpeak / Indeed India Salary Reports 2023
--   • Kantar / Nielsen India consumer 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('IN', 2024, 'India', 'भारत', 'INR',
   1428600000, 350000, 2500,
   'MoSPI PLFS 2022-23',
   'https://www.mospi.gov.in')
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
   '{"ko":"초등학교 교사 (Tier-1 도시)","en":"Elementary School Teacher (Tier-1)"}'::jsonb,
   'employed', '30-39', 350000::numeric, 550000::numeric, 800000::numeric,
   '연 ₹350k-₹800k (~$4-10k USD)', '₹350k-₹800k annually (~$4-10k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 400000, 700000, 1200000,
   '연 ₹400k-₹1.2M (~$5-14k USD)', '₹400k-₹1.2M annually (~$5-14k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (Bangalore·HYD 빅테크)","en":"Senior Software Engineer (Bangalore/HYD Big Tech)"}'::jsonb,
   'employed', '30-39', 1800000, 3200000, 5500000,
   '연 ₹1.8M-₹5.5M (~$22-66k USD, 외자계 더 높음)',
   '₹1.8M-₹5.5M annually (~$22-66k USD, foreign cos higher)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 1200000, 2000000, 3500000,
   '연 ₹1.2M-₹3.5M (~$14-42k USD)', '₹1.2M-₹3.5M annually (~$14-42k USD)'),
  ('nurse',
   '{"ko":"간호사","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 250000, 400000, 600000,
   '연 ₹250k-₹600k (~$3-7k USD)', '₹250k-₹600k annually (~$3-7k USD)'),
  ('doctor',
   '{"ko":"의사","en":"Physician"}'::jsonb,
   'employed', '40-49', 1500000, 3000000, 6000000,
   '연 ₹1.5M-₹6M (~$18-72k USD)', '₹1.5M-₹6M annually (~$18-72k USD)'),
  ('factory_worker',
   '{"ko":"공장 노동자","en":"Factory Worker"}'::jsonb,
   'employed', '30-39', 200000, 350000, 550000,
   '연 ₹200k-₹550k (~$2-7k USD)', '₹200k-₹550k annually (~$2-7k USD)'),
  ('domestic_helper',
   '{"ko":"가사도우미","en":"Domestic Helper"}'::jsonb,
   'employed', '40-49', 100000, 180000, 280000,
   '연 ₹100k-₹280k (~$1-3k USD)', '₹100k-₹280k annually (~$1-3k USD)'),
  ('small_business_owner',
   '{"ko":"자영업자 (Kirana·Small Shop)","en":"Small Business Owner (Kirana / Small Shop)"}'::jsonb,
   'self_employed', '40-49', 300000, 700000, 1500000,
   '사업소득 연 ₹300k-₹1.5M (변동 큼, ~$4-18k USD)',
   'Annual ₹300k-₹1.5M (highly variable, ~$4-18k USD)'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 50000, 120000, 250000,
   '용돈+알바 연 ₹50k-₹250k (~$0.6-3k USD), 부모 지원 별도',
   'Allowance + part-time ₹50k-₹250k/yr (~$0.6-3k USD)'),
  ('homemaker',
   '{"ko":"전업주부 (Homemaker)","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 ₹800k-₹1.8M, 본인 가처분 월 ₹5k-₹20k',
   'No personal salary. Household ₹800k-₹1.8M/yr; personal disposable ₹5k-₹20k/month'),
  ('retiree',
   '{"ko":"은퇴자","en":"Retiree"}'::jsonb,
   'retiree', '60+', 150000, 350000, 700000,
   'EPF·연금 연 ₹150k-₹700k (~$2-8k USD)',
   'EPF + pension ₹150k-₹700k/yr (~$2-8k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자 (Gig·Swiggy·Zomato)","en":"Gig Worker (Swiggy / Zomato / Uber)"}'::jsonb,
   'employed', '20-29', 180000, 300000, 480000,
   '연 ₹180k-₹480k (~$2-6k USD), 변동 큼',
   '₹180k-₹480k annually (~$2-6k USD), variable')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'IN', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'INR',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'MoSPI PLFS 2022-23 / Naukri Salary'
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
  ('IN', 2024, 'food',
   '{"ko":["FSSAI 인증","Veg·Non-Veg 라벨","Big Bazaar·Reliance Fresh PB","WhatsApp·Instagram 추천","로컬 kirana 신뢰"],"en":["FSSAI certification","Veg / Non-Veg label","Big Bazaar / Reliance Fresh PB","WhatsApp / Instagram","Local kirana trust"]}'::jsonb,
   '{"ko":["가격 부담","수입품 관세","Veg/Non-Veg 구분","유통기한"],"en":["Price","Import tariffs","Veg/Non-Veg distinction","Expiry"]}'::jsonb,
   '{"ko":["Amazon India","Flipkart","BigBasket","Zepto","Blinkit","Swiggy Instamart","Reliance Fresh","DMart","local kirana"],"en":["Amazon India","Flipkart","BigBasket","Zepto","Blinkit","Swiggy Instamart","Reliance Fresh","DMart","local kirana"]}'::jsonb,
   'Quick commerce (Zepto, Blinkit, Swiggy Instamart) has revolutionized food delivery in metros. Local kirana stores remain dominant. FSSAI certification and Veg/Non-Veg labeling are non-negotiable. Cash-on-delivery still significant.',
   'Nielsen India 2023'),
  ('IN', 2024, 'beauty',
   '{"ko":["Nykaa·Myntra Beauty","Mamaearth·Sugar 등 D2C","피부과 추천","Ayurveda 전통","Instagram·YouTube 인플루언서"],"en":["Nykaa / Myntra Beauty","Mamaearth / Sugar D2C","Dermatologist endorsement","Ayurveda tradition","Instagram / YouTube influencer"]}'::jsonb,
   '{"ko":["피부 트러블","위조품","수입 가격","피부 톤 다양성 부족"],"en":["Skin reaction","Counterfeit","Imported price","Skin tone diversity gap"]}'::jsonb,
   '{"ko":["Nykaa","Myntra","Amazon India","Flipkart","Sephora","local pharmacy"],"en":["Nykaa","Myntra","Amazon India","Flipkart","Sephora","local pharmacy"]}'::jsonb,
   'Nykaa is the dominant beauty platform. Mamaearth, Sugar, Plum lead D2C beauty. Ayurveda has institutional trust (Patanjali, Forest Essentials). K-beauty growing among Gen Z. Pricing tiers matter — premium vs masstige.',
   'Euromonitor India / Nykaa'),
  ('IN', 2024, 'electronics',
   '{"ko":["Flipkart·Amazon EMI 분할","Croma·Reliance Digital 매장","BIS 인증","Mi·Realme 가성비","12·24개월 분할"],"en":["Flipkart / Amazon EMI installments","Croma / Reliance Digital","BIS certification","Mi / Realme value","12-24 month installments"]}'::jsonb,
   '{"ko":["수입 관세","위조품","EMI 이자 부담","수리 비용"],"en":["Import tariffs","Counterfeit","EMI interest","Repair cost"]}'::jsonb,
   '{"ko":["Amazon India","Flipkart","Croma","Reliance Digital","Vijay Sales","Apple Store"],"en":["Amazon India","Flipkart","Croma","Reliance Digital","Vijay Sales","Apple Store"]}'::jsonb,
   'EMI (no-cost installments) drives big-ticket purchases. Mi (Xiaomi) and Realme dominate value smartphones. Apple has aspirational status; Made-in-India production has reduced premiums. Flipkart and Amazon dominate online.',
   'IDC India / Counterpoint'),
  ('IN', 2024, 'fashion',
   '{"ko":["Myntra·Ajio·Flipkart Fashion","Manyavar·Fabindia (전통복)","Instagram 인플루언서","SHEIN·H&M 가성비","결혼 시즌 (큰 시장)"],"en":["Myntra / Ajio / Flipkart Fashion","Manyavar / Fabindia (ethnic wear)","Instagram influencer","SHEIN / H&M value","Wedding season (huge market)"]}'::jsonb,
   '{"ko":["사이즈 표준","수입 럭셔리 부담","위조품","COD 반품"],"en":["Size standards","Imported luxury markup","Counterfeit","COD return friction"]}'::jsonb,
   '{"ko":["Myntra","Ajio","Amazon India","Flipkart","Tata Cliq","Manyavar","Reliance Trends"],"en":["Myntra","Ajio","Amazon India","Flipkart","Tata Cliq","Manyavar","Reliance Trends"]}'::jsonb,
   'Myntra and Ajio dominate online fashion. Ethnic wear (Manyavar, Fabindia) is a massive segment. Wedding fashion is ~$50B/yr. SHEIN re-launched as Reliance partnership. COD-driven returns are a logistics challenge.',
   'Euromonitor India / RAI'),
  ('IN', 2024, 'health',
   '{"ko":["AYUSH 인증 (Ayurveda)","의사 처방","Apollo·Tata 1mg 약국","Ayurveda 전통","FDA 미국 인증 우대"],"en":["AYUSH cert (Ayurveda)","Doctor prescription","Apollo / Tata 1mg pharmacy","Ayurveda tradition","US FDA preference"]}'::jsonb,
   '{"ko":["효능 의심","위조 의약품","약가 부담","Ayurveda vs allopathy"],"en":["Efficacy doubt","Counterfeit drugs","Drug price","Ayurveda vs allopathy"]}'::jsonb,
   '{"ko":["Tata 1mg","Apollo","PharmEasy","Netmeds","Amazon Pharmacy","local chemist"],"en":["Tata 1mg","Apollo","PharmEasy","Netmeds","Amazon Pharmacy","local chemist"]}'::jsonb,
   'Tata 1mg, Apollo, PharmEasy lead online pharmacy. Local chemist ("medical store") still dominates offline. Ayurveda (Patanjali, Dabur) coexists with allopathy. Telemedicine via Practo, mfine surged post-COVID.',
   'IDC India Healthcare'),
  ('IN', 2024, 'saas',
   '{"ko":["영어 지원 (디폴트)","Hindi·regional 옵션","대기업 (TCS·Infosys·Reliance) reference","UPI 결제","DPDP Act 2023 준수"],"en":["English support (default)","Hindi / regional optional","Enterprise (TCS / Infosys / Reliance) reference","UPI payment","DPDP Act 2023 compliance"]}'::jsonb,
   '{"ko":["USD 결제 부담","DPDP Act 컴플라이언스","로컬 SI 의존","결제 게이트웨이"],"en":["USD pricing","DPDP Act compliance","Local SI dependency","Payment gateway"]}'::jsonb,
   '{"ko":["AWS Marketplace","SaaS 직접 영업","TCS·Infosys·Wipro SI","Razorpay·Stripe India 결제"],"en":["AWS Marketplace","Direct SaaS sales","TCS / Infosys / Wipro SI","Razorpay / Stripe India"]}'::jsonb,
   'India is a sophisticated B2B SaaS market — many global SaaS companies are India-built (Freshworks, Zoho). UPI has revolutionized payments. DPDP Act 2023 brought GDPR-like compliance. Major SI partners are global delivery giants.',
   'NASSCOM / IDC India SaaS')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
