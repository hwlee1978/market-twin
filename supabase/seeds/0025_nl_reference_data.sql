-- NL (Netherlands) reference data — Phase C seed.
-- Sources:
--   • CBS (Centraal Bureau voor de Statistiek) — Inkomenspanel onderzoek 2023
--   • UWV / Sociaal-economische verkenning 2023
--   • Hays Netherlands / Michael Page NL Salary Guide 2024
--   • GfK Netherlands / Nielsen NL 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('NL', 2024, 'Netherlands', 'Nederland', 'EUR',
   17810000, 48000, 58300,
   'CBS Inkomenspanel onderzoek 2023',
   'https://www.cbs.nl')
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
   '{"ko":"초등학교 교사 (Basisschoolleraar)","en":"Primary School Teacher"}'::jsonb,
   'employed', '30-39', 38000::numeric, 48000::numeric, 60000::numeric,
   '연 €38k-€60k (~$41-65k USD)', '€38k-60k annually (~$41-65k USD)'),
  ('office_worker',
   '{"ko":"사무직 (Kantoormedewerker)","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 36000, 48000, 65000,
   '연 €36k-€65k (~$39-71k USD)', '€36k-65k annually (~$39-71k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (Amsterdam·Eindhoven 테크)","en":"Senior Software Engineer (Amsterdam/Eindhoven)"}'::jsonb,
   'employed', '30-39', 65000, 85000, 115000,
   '연 €65k-€115k (~$71-125k USD), 30% ruling 적용 시 추가 절세',
   '€65k-115k annually (~$71-125k USD), 30% ruling tax break possible'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 65000, 85000, 115000,
   '연 €65k-€115k (~$71-125k USD)',
   '€65k-115k annually (~$71-125k USD)'),
  ('nurse',
   '{"ko":"간호사 (Verpleegkundige)","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 36000, 45000, 55000,
   '연 €36k-€55k (~$39-60k USD)', '€36k-55k annually (~$39-60k USD)'),
  ('doctor',
   '{"ko":"의사 (Arts)","en":"Physician"}'::jsonb,
   'employed', '40-49', 90000, 130000, 200000,
   '연 €90k-€200k (~$98-218k USD)',
   '€90k-200k annually (~$98-218k USD)'),
  ('zzp_freelancer',
   '{"ko":"프리랜서 (ZZP, Zelfstandige zonder personeel)","en":"Freelancer (ZZP)"}'::jsonb,
   'self_employed', '30-39', 35000, 60000, 100000,
   '사업소득 연 €35k-€100k (~$38-109k USD), Dutch 세제 활용',
   'Annual €35k-100k (~$38-109k USD), Dutch tax structures'),
  ('logistics_worker',
   '{"ko":"물류·창고 직원 (Schiphol·Rotterdam 항)","en":"Logistics Worker (Schiphol/Rotterdam)"}'::jsonb,
   'employed', '30-39', 28000, 38000, 50000,
   '연 €28k-€50k (~$30-54k USD), 야간·주말 수당 별도',
   '€28k-50k annually (~$30-54k USD), shift premium separate'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 6000, 14000, 24000,
   '용돈+알바+장학금(DUO) 연 €6k-€24k (~$7-26k USD)',
   'Allowance + part-time + DUO loan €6k-24k/yr (~$7-26k USD)'),
  ('homemaker',
   '{"ko":"전업주부","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 €60k-€120k, 본인 가처분 월 €600-€1,500 (NL은 맞벌이 비율 매우 높음)',
   'No personal salary. Household €60k-120k/yr; personal disposable €600-1,500/month. (Dual-earner is the norm in NL)'),
  ('retiree',
   '{"ko":"은퇴자 (AOW + 직장 연금)","en":"Retiree (AOW + occupational pension)"}'::jsonb,
   'retiree', '60+', 22000, 32000, 50000,
   'AOW + 직장 연금 연 €22k-€50k (~$24-54k USD)',
   'AOW + occupational pension €22k-50k/yr (~$24-54k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자 (NL 비율 높음 ~50%)","en":"Part-time Worker (NL has highest PT rate in EU ~50%)"}'::jsonb,
   'employed', '30-39', 16000, 24000, 36000,
   '연 €16k-€36k (~$17-39k USD)', '€16k-36k annually (~$17-39k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'NL', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'EUR',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'CBS 2023 / Hays Netherlands Salary Guide 2024'
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
  ('NL', 2024, 'food',
   '{"ko":["Albert Heijn (지배적 grocer)","Bio·EKO 인증 (유기농)","Beter Leven (동물복지) 라벨","로컬·지속가능성 강조","Picnic·Crisp (온라인 grocer)"],"en":["Albert Heijn (dominant grocer)","Bio / EKO organic cert","Beter Leven animal welfare label","Local / sustainability emphasis","Picnic / Crisp online grocers"]}'::jsonb,
   '{"ko":["환경·동물복지 의식 매우 높음","수입 식품 신뢰도","인플레이션 후 가격 민감"],"en":["Strong sustainability/animal-welfare consciousness","Trust in imported","Price-sensitive post-inflation"]}'::jsonb,
   '{"ko":["Albert Heijn","Jumbo","Lidl","Plus","Picnic","Crisp","Thuisbezorgd.nl","Uber Eats"],"en":["Albert Heijn","Jumbo","Lidl","Plus","Picnic","Crisp","Thuisbezorgd.nl","Uber Eats"]}'::jsonb,
   'Albert Heijn has ~35% market share — by far the dominant grocer. Picnic (NL-origin) is the largest online grocery in EU. Sustainability and animal-welfare labels (Beter Leven, EKO Bio) carry strong consumer trust. Dutch consumers are among the most price-conscious in EU despite high incomes.',
   'Nielsen NL / Albert Heijn IR'),
  ('NL', 2024, 'beauty',
   '{"ko":["Etos·Kruidvat (drogisterij)","Douglas·Sephora ME","Holland & Barrett","의사 추천","Bio·자연주의 강조"],"en":["Etos / Kruidvat drogisterij","Douglas / Sephora","Holland & Barrett","Doctor recommendation","Bio / natural emphasis"]}'::jsonb,
   '{"ko":["프리미엄 럭셔리 인기 약함","K-beauty·J-beauty 인지도 점진","민감 피부 (북유럽 기후)","천연 성분 선호"],"en":["Premium luxury weak","K/J-beauty awareness gradual","Sensitive skin (Northern climate)","Natural-ingredient preference"]}'::jsonb,
   '{"ko":["Etos","Kruidvat","Douglas","Sephora","Holland & Barrett","Bol.com","Amazon NL"],"en":["Etos","Kruidvat","Douglas","Sephora","Holland & Barrett","Bol.com","Amazon NL"]}'::jsonb,
   'Kruidvat and Etos are the dominant drogisterij (drugstore) chains. Douglas leads premium beauty. Dutch consumers are pragmatic about beauty — luxury cosmetics underperform vs DE/FR. Strong demand for transparent ingredient sourcing.',
   'Euromonitor NL Beauty / GfK NL'),
  ('NL', 2024, 'electronics',
   '{"ko":["MediaMarkt·Coolblue·BCC","Apple NL 매장","Amazon NL·Bol.com","2년 EU 보증","Coolblue 5* 서비스"],"en":["MediaMarkt / Coolblue / BCC","Apple NL stores","Amazon NL / Bol.com","2-year EU warranty","Coolblue 5-star service"]}'::jsonb,
   '{"ko":["수입 가격 (EU 평균)","아이폰 점유율 매우 높음 (~40%)","Coolblue 충성도 높음","리퍼 시장 활성"],"en":["Imported price","iPhone share very high (~40%)","High Coolblue loyalty","Active refurbished market"]}'::jsonb,
   '{"ko":["Coolblue","Bol.com","MediaMarkt","Amazon NL","Apple Online","BCC","Refurbed"],"en":["Coolblue","Bol.com","MediaMarkt","Amazon NL","Apple Online","BCC","Refurbed"]}'::jsonb,
   'Coolblue (NL-origin) is the iconic electronics retailer with cult-like customer service ("the customer is god"). Bol.com is the dominant general e-commerce. iPhone share among the highest in Europe. Strong refurbished market via Refurbed.',
   'IDC Netherlands / GfK NL'),
  ('NL', 2024, 'fashion',
   '{"ko":["Bol.com·Zalando","Hema (가성비 SPA)","H&M·Zara","Vinted (중고)","지속가능성 인증 (B-Corp)"],"en":["Bol.com / Zalando","Hema (value SPA)","H&M / Zara","Vinted (used)","Sustainability cert (B-Corp)"]}'::jsonb,
   '{"ko":["Made in NL 럭셔리 약함","fast fashion 환경 우려 강함","사이즈 표준 차이","Bike-friendly 의류 수요"],"en":["Weak local luxury","Strong fast-fashion sustainability concerns","Sizing differences","Bike-friendly apparel demand"]}'::jsonb,
   '{"ko":["Zalando","Bol.com","Vinted","H&M","Zara","Hema","Decathlon","Wehkamp"],"en":["Zalando","Bol.com","Vinted","H&M","Zara","Hema","Decathlon","Wehkamp"]}'::jsonb,
   'Hema is the iconic Dutch value retailer (basics + household). Sustainability concerns are stronger in NL than most of EU — second-hand market via Vinted is huge. Cycling culture means demand for waterproof/practical apparel.',
   'Euromonitor NL Apparel'),
  ('NL', 2024, 'health',
   '{"ko":["Etos·Kruidvat·Holland & Barrett","Apotheek (약국)","Zorgverzekering (의무 건강보험)","의사 처방","KOAG-KAG 인증"],"en":["Etos / Kruidvat / Holland & Barrett","Apotheek (pharmacy)","Zorgverzekering (mandatory health insurance)","Doctor prescription","KOAG-KAG certification"]}'::jsonb,
   '{"ko":["효능 의심","수입 보충제 신뢰","천연·자연주의 선호","의무 건강보험 자기부담"],"en":["Efficacy doubt","Trust in imported","Natural / clean preference","Mandatory insurance copay"]}'::jsonb,
   '{"ko":["Holland & Barrett","Etos","Kruidvat","Apotheek","Bol.com","iHerb"],"en":["Holland & Barrett","Etos","Kruidvat","Apotheek","Bol.com","iHerb"]}'::jsonb,
   'Holland & Barrett (UK-origin but huge NL footprint) leads health/wellness. Mandatory health insurance covers prescriptions but not most supplements. KOAG-KAG advertising code carries trust. Strong preference for plant-based and clean-label.',
   'KNMP / Euromonitor NL Health'),
  ('NL', 2024, 'saas',
   '{"ko":["G2·Capterra 평가","대기업 (ASML·Philips·ING) reference","GDPR 준수","영어로 충분 (NL은 EU 영어 능통률 1위)","무료 체험"],"en":["G2 / Capterra reviews","Enterprise reference (ASML / Philips / ING)","GDPR compliance","English OK (NL has top EU English proficiency)","Free trial"]}'::jsonb,
   '{"ko":["GDPR 컴플라이언스","유로 결제","현지 데이터 거주성 (정부 시장)","B2B 진입 장벽 낮음 (영어)"],"en":["GDPR compliance","EUR payment","Local data residency (gov market)","Low entry barrier (English)"]}'::jsonb,
   '{"ko":["AWS Marketplace","Microsoft Marketplace","KPN Cloud","SaaS 직접 영업","NL은 EU SaaS 진입의 좋은 베타 시장"],"en":["AWS Marketplace","Microsoft Marketplace","KPN Cloud","Direct SaaS sales","NL is excellent EU beta market"]}'::jsonb,
   'Netherlands is the easiest EU market for English-only SaaS — 90%+ business English proficiency means localization is optional for SMB. Strong tech ecosystem (Adyen, Booking.com, MessageBird, Mollie). Often used as the EU GTM beta market by US SaaS.',
   'IDC Netherlands / Dutch Digital Delta')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
