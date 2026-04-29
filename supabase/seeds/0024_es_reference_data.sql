-- ES (Spain) reference data — Phase C seed.
-- Sources:
--   • INE (Instituto Nacional de Estadística) — Encuesta de Presupuestos Familiares 2023
--   • Hays España / Michael Page Spain Salary Guide 2024
--   • Nielsen España / Kantar España 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('ES', 2024, 'Spain', 'España', 'EUR',
   48590000, 32500, 32100,
   'INE Encuesta de Presupuestos Familiares 2023',
   'https://www.ine.es')
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
   '{"ko":"초등학교 교사 (Profesor/a de primaria)","en":"Primary School Teacher"}'::jsonb,
   'employed', '30-39', 25000::numeric, 32000::numeric, 40000::numeric,
   '연 €25k-€40k (~$27-43k USD)', '€25k-40k annually (~$27-43k USD)'),
  ('office_worker',
   '{"ko":"사무직 (Empleado administrativo)","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 22000, 30000, 42000,
   '연 €22k-€42k (~$24-46k USD)', '€22k-42k annually (~$24-46k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (Madrid·Barcelona 테크)","en":"Senior Software Engineer (Madrid/Barcelona)"}'::jsonb,
   'employed', '30-39', 40000, 55000, 80000,
   '연 €40k-€80k (~$43-87k USD)', '€40k-80k annually (~$43-87k USD)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 45000, 65000, 95000,
   '연 €45k-€95k (~$49-103k USD)',
   '€45k-95k annually (~$49-103k USD)'),
  ('nurse',
   '{"ko":"간호사 (Enfermero/a)","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 24000, 30000, 38000,
   '연 €24k-€38k (~$26-41k USD)', '€24k-38k annually (~$26-41k USD)'),
  ('doctor',
   '{"ko":"의사 (Médico)","en":"Physician"}'::jsonb,
   'employed', '40-49', 60000, 90000, 140000,
   '연 €60k-€140k (~$65-152k USD)',
   '€60k-140k annually (~$65-152k USD)'),
  ('self_employed',
   '{"ko":"자영업자 (Autónomo)","en":"Self-employed (Autónomo)"}'::jsonb,
   'self_employed', '40-49', 18000, 32000, 60000,
   '사업소득 연 €18k-€60k (~$20-65k USD), Autónomo 분담금 별도',
   'Annual €18k-60k (~$20-65k USD), Autónomo SS contributions extra'),
  ('hospitality_worker',
   '{"ko":"호스피탈리티 (Camarero/a, 호텔 직원)","en":"Hospitality Worker (waiter/hotel staff)"}'::jsonb,
   'employed', '20-29', 16000, 22000, 30000,
   '연 €16k-€30k (~$17-33k USD), 팁 별도',
   '€16k-30k annually (~$17-33k USD), tips separate'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 4000, 9000, 16000,
   '용돈+알바 연 €4k-€16k (~$4-17k USD), 부모 지원 별도',
   'Allowance + part-time €4k-16k/yr (~$4-17k USD)'),
  ('homemaker',
   '{"ko":"전업주부 (Ama de casa)","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 €38k-€75k, 본인 가처분 월 €300-€800',
   'No personal salary. Household €38k-75k/yr; personal disposable €300-800/month'),
  ('retiree',
   '{"ko":"은퇴자 (Jubilado, Seguridad Social 연금)","en":"Retiree (Social Security pension)"}'::jsonb,
   'retiree', '60+', 13000, 19000, 30000,
   'Seguridad Social 연금 연 €13k-€30k (~$14-33k USD)',
   'Social Security pension €13k-30k/yr (~$14-33k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 11000, 16000, 24000,
   '연 €11k-€24k (~$12-26k USD)', '€11k-24k annually (~$12-26k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'ES', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'EUR',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'INE 2023 / Hays España Salary Guide 2024'
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
  ('ES', 2024, 'food',
   '{"ko":["Mercadona·Carrefour ES·DIA","Denominación de Origen Protegida (DOP)","Hipercor·El Corte Inglés","로컬·신선 강조","Glovo·Just Eat·Uber Eats"],"en":["Mercadona / Carrefour ES / DIA","DOP (Denominación de Origen Protegida)","Hipercor / El Corte Inglés","Local / fresh emphasis","Glovo / Just Eat / Uber Eats"]}'::jsonb,
   '{"ko":["가격 부담 (인플레이션 후)","수입 식품 신뢰도 낮음","과도한 가공 거부감","북부·남부 지역색 차이"],"en":["Price (post-inflation)","Distrust of imported food","Reluctance to ultra-processed","North/South regional differences"]}'::jsonb,
   '{"ko":["Mercadona","Carrefour","DIA","Lidl","Hipercor","El Corte Inglés","Glovo","Just Eat","Uber Eats"],"en":["Mercadona","Carrefour","DIA","Lidl","Hipercor","El Corte Inglés","Glovo","Just Eat","Uber Eats"]}'::jsonb,
   'Mercadona is the dominant grocer (~25% market share); strong PB strategy. Glovo is Spanish-origin food delivery, now pan-European. Iberian DOP marks (Jamón Ibérico, Manchego) carry massive trust. Tapas culture means convenience F&B and small-plate formats sell well.',
   'Nielsen España / Kantar Worldpanel ES'),
  ('ES', 2024, 'beauty',
   '{"ko":["Sephora·Druni·Primor","Mercadona Deliplus (PB)","로컬 약국(Farmacia)","피부과 의사","K-beauty 점진적 인기"],"en":["Sephora / Druni / Primor","Mercadona Deliplus PB","Local pharmacy","Dermatologist","K-beauty rising"]}'::jsonb,
   '{"ko":["고가 럭셔리 부담","수입 K-beauty·J-beauty 인지도 점진","피부 트러블 (남부 햇볕)","가격 인상 민감"],"en":["Premium price","K/J-beauty awareness gradual","Skin issues (southern sun)","Price-sensitive"]}'::jsonb,
   '{"ko":["Sephora ES","Druni","Primor","Farmacia","Notino","Amazon ES","Mercadona Deliplus"],"en":["Sephora ES","Druni","Primor","Farmacia","Notino","Amazon ES","Mercadona Deliplus"]}'::jsonb,
   'Druni and Primor are the iconic Spanish beauty perfumeries; Druni has ~250 stores. Mercadona''s Deliplus PB is one of Europe''s largest mass beauty brands. Pharmacy carries strong dermo-cosmetic trust.',
   'Stanpa Spain / Euromonitor ES'),
  ('ES', 2024, 'electronics',
   '{"ko":["MediaMarkt·Worten·El Corte Inglés","Apple Premium Reseller","Amazon ES","2년 EU 보증","Movistar 통신사 묶음"],"en":["MediaMarkt / Worten / El Corte Inglés","Apple Premium Reseller","Amazon ES","2-year EU warranty","Movistar carrier bundles"]}'::jsonb,
   '{"ko":["수입 가격","아이폰 가격 부담","리퍼·중고 시장 활성","Made in Spain 약함"],"en":["Imported price","iPhone affordability","Active refurbished market","Weak local manufacturing"]}'::jsonb,
   '{"ko":["Amazon ES","MediaMarkt","Worten","El Corte Inglés","Apple Online","Movistar 매장","BackMarket"],"en":["Amazon ES","MediaMarkt","Worten","El Corte Inglés","Apple Online","Movistar stores","BackMarket"]}'::jsonb,
   'Apple has ~22% smartphone share. Worten (Portuguese-origin) competes with MediaMarkt in offline. BackMarket popular for refurbished.',
   'IDC Spain / GfK Spain'),
  ('ES', 2024, 'fashion',
   '{"ko":["Inditex 본사 (Zara·Pull&Bear·Bershka·Massimo Dutti)","El Corte Inglés","Mango (자국 브랜드)","Decathlon","Vinted (중고)"],"en":["Inditex HQ (Zara / Pull&Bear / Bershka / Massimo Dutti)","El Corte Inglés","Mango (domestic)","Decathlon","Vinted (used)"]}'::jsonb,
   '{"ko":["Made in Spain 럭셔리 약함","Inditex 본가 가격 매력 약함","fast fashion 환경 우려"],"en":["Weak luxury Made-in-Spain","Inditex pricing not as attractive at HQ","Fast-fashion sustainability"]}'::jsonb,
   '{"ko":["Zara ES","Mango","Pull&Bear","Massimo Dutti","Amazon Fashion","Zalando","Vinted","El Corte Inglés"],"en":["Zara ES","Mango","Pull&Bear","Massimo Dutti","Amazon Fashion","Zalando","Vinted","El Corte Inglés"]}'::jsonb,
   'Spain is HQ to Inditex (Zara) — the world''s largest fashion retailer. Mango is the second iconic Spanish brand. El Corte Inglés is the dominant department store. Vinted very popular for sustainable fashion among Gen Z.',
   'Inditex IR / Mango IR'),
  ('ES', 2024, 'health',
   '{"ko":["Farmacia 약사","Servicio de Salud (SNS)","Aquilea·Solgar 보충제","의사 처방","고령화 인구 약사 의존"],"en":["Farmacia (pharmacy)","SNS (national health service)","Local supplements (Aquilea, Solgar)","Doctor prescription","Aging population pharmacy reliance"]}'::jsonb,
   '{"ko":["효능 의심","수입 보충제 신뢰도","SNS 비커버리지 부담","천연·식이 보충제 선호"],"en":["Efficacy doubt","Trust in imported","SNS out-of-pocket","Preference for natural/dietary supplements"]}'::jsonb,
   '{"ko":["Farmacia","Parafarmacia","Amazon ES","Notino","Druni","iHerb"],"en":["Farmacia","Parafarmacia","Amazon ES","Notino","Druni","iHerb"]}'::jsonb,
   'Spain has universal SNS coverage; supplement market is mature. Pharmacy is the dominant trust channel. Aquilea and Solgar are leading domestic supplement brands.',
   'Federación Española de Farmacia / Euromonitor ES'),
  ('ES', 2024, 'saas',
   '{"ko":["G2·Capterra 평가","대기업 (Telefónica·Banco Santander·BBVA) reference","GDPR 준수","스페인어 번역 필수","무료 체험"],"en":["G2 / Capterra reviews","Enterprise reference (Telefónica / Santander / BBVA)","GDPR compliance","Spanish localization required","Free trial"]}'::jsonb,
   '{"ko":["GDPR 컴플라이언스","외화 결제","Latam 시장 게이트웨이","스페인어 번역","느린 의사결정"],"en":["GDPR compliance","Foreign currency","LATAM market gateway","Spanish localization","Slow procurement"]}'::jsonb,
   '{"ko":["AWS Marketplace","Microsoft Marketplace","Telefónica Cloud","SaaS 직접 영업","Reseller 채널"],"en":["AWS Marketplace","Microsoft Marketplace","Telefónica Cloud","Direct SaaS sales","Reseller channel"]}'::jsonb,
   'Spain is the gateway market for LATAM expansion — Spanish-language localization unlocks Mexico, Colombia, Argentina. Telefónica is a dominant cloud + B2B partner. Procurement slower than US/UK.',
   'IDC Spain / AMETIC')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
