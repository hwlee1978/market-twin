-- DE (Germany) reference data — Phase B seed.
-- Sources:
--   • Destatis — Verdienststrukturerhebung 2018 + Verdienste 2023 update
--   • Bundesagentur für Arbeit — Entgeltatlas 2023
--   • Hays / Robert Half Germany Salary Guide 2023
--   • GfK Germany consumer 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('DE', 2024, 'Germany', 'Deutschland', 'EUR',
   84500000, 47000, 52800,
   'Destatis Verdienste 2023',
   'https://www.destatis.de')
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
   '{"ko":"초등학교 교사 (Grundschullehrer)","en":"Elementary School Teacher"}'::jsonb,
   'employed', '30-39', 45000::numeric, 55000::numeric, 65000::numeric,
   '연 €45k-€65k (~$49-70k USD)', '€45k-€65k annually (~$49-70k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 42000, 55000, 72000,
   '연 €42k-€72k (~$45-78k USD)', '€42k-€72k annually (~$45-78k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (Berlin·Munich)","en":"Senior Software Engineer (Berlin / Munich)"}'::jsonb,
   'employed', '30-39', 70000, 90000, 120000,
   '연 €70k-€120k (~$76-130k USD)', '€70k-€120k annually (~$76-130k USD)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 60000, 80000, 105000,
   '연 €60k-€105k (~$65-114k USD)', '€60k-€105k annually (~$65-114k USD)'),
  ('nurse',
   '{"ko":"간호사 (Krankenpflegerin)","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 38000, 46000, 56000,
   '연 €38k-€56k (~$41-61k USD)', '€38k-€56k annually (~$41-61k USD)'),
  ('doctor',
   '{"ko":"의사 (Arzt, Hausarzt)","en":"General Practitioner"}'::jsonb,
   'employed', '40-49', 95000, 130000, 180000,
   '연 €95k-€180k (~$103-195k USD)', '€95k-€180k annually (~$103-195k USD)'),
  ('barista',
   '{"ko":"바리스타 / 카페 직원","en":"Barista / Café Worker"}'::jsonb,
   'employed', '20-29', 26000, 30000, 35000,
   '연 €26k-€35k (~$28-38k USD), Mindestlohn 기준',
   '€26k-€35k annually (~$28-38k USD), at or near Mindestlohn'),
  ('tradesperson',
   '{"ko":"숙련 기능공 (Handwerker)","en":"Tradesperson (Handwerker)"}'::jsonb,
   'employed', '30-39', 42000, 55000, 72000,
   '연 €42k-€72k (~$45-78k USD)', '€42k-€72k annually (~$45-78k USD)'),
  ('self_employed',
   '{"ko":"자영업자 (Selbstständige)","en":"Self-employed"}'::jsonb,
   'self_employed', '40-49', 35000, 65000, 110000,
   '사업소득 연 €35k-€110k (변동 큼, ~$38-119k USD)',
   'Annual €35k-€110k (highly variable, ~$38-119k USD)'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 5000, 11000, 18000,
   '용돈+알바 연 €5k-€18k (~$5-20k USD), BAföG 보조 별도',
   'Allowance + part-time €5k-€18k/yr (~$5-20k USD), BAföG separate'),
  ('homemaker',
   '{"ko":"전업주부 (Hausfrau)","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 €70k-€105k, 본인 가처분 월 €300-€800',
   'No personal salary. Household €70k-€105k/yr; personal disposable €300-€800/month'),
  ('retiree',
   '{"ko":"은퇴자 (Rentner)","en":"Retiree"}'::jsonb,
   'retiree', '60+', 18000, 28000, 42000,
   '국가연금 (gesetzliche Rente) 연 €18k-€42k (~$20-46k USD)',
   'State pension €18k-€42k/yr (~$20-46k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자 (Minijob 포함)","en":"Part-time Worker (incl. Minijob)"}'::jsonb,
   'employed', '30-39', 8000, 18000, 30000,
   '연 €8k-€30k (~$9-32k USD)', '€8k-€30k annually (~$9-32k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'DE', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'EUR',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'Destatis 2023 / Bundesagentur Entgeltatlas'
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
  ('DE', 2024, 'food',
   '{"ko":["Bio EU 유기농","Stiftung Warentest 평가","Made in Germany","Edeka·Rewe PB","Aldi·Lidl 가성비"],"en":["Bio EU organic","Stiftung Warentest","Made in Germany","Edeka / Rewe PB","Aldi / Lidl value"]}'::jsonb,
   '{"ko":["가격 부담 (Inflation)","유전자조작 우려","유통기한","수입품 거부감"],"en":["Price (inflation)","GMO concerns","Expiry","Imported food resistance"]}'::jsonb,
   '{"ko":["Aldi","Lidl","Edeka","Rewe","Kaufland","Amazon DE","dm","Rossmann","Wochenmarkt"],"en":["Aldi","Lidl","Edeka","Rewe","Kaufland","Amazon DE","dm","Rossmann","Wochenmarkt"]}'::jsonb,
   'Germany has the world''s most price-sensitive grocery — Aldi/Lidl invented the hard discount model. Bio (organic) certification is mainstream. Stiftung Warentest is the trusted consumer authority. Wochenmarkt (farmer''s market) culture remains strong.',
   'GfK Germany 2023'),
  ('DE', 2024, 'beauty',
   '{"ko":["dm·Rossmann 진열","Stiftung Warentest 평가","피부과 추천","Made in Germany 우대 (Nivea, Weleda)","Cruelty Free 인증"],"en":["dm / Rossmann placement","Stiftung Warentest","Dermatologist endorsement","Made-in-Germany preference","Cruelty Free cert"]}'::jsonb,
   '{"ko":["피부 트러블","고가 부담","수입 브랜드 가격"],"en":["Skin reaction","Premium price","Imported brand markup"]}'::jsonb,
   '{"ko":["dm","Rossmann","Müller","Douglas","Amazon DE","Flaconi"],"en":["dm","Rossmann","Müller","Douglas","Amazon DE","Flaconi"]}'::jsonb,
   'dm and Rossmann are iconic drugstores with massive beauty selection — German "drugstore beauty" is uniquely strong. Douglas anchors prestige. Made-in-Germany (Nivea, Weleda) drives trust.',
   'GfK Germany Beauty'),
  ('DE', 2024, 'electronics',
   '{"ko":["MediaMarkt·Saturn 매장","Idealo 가격 비교","Stiftung Warentest","2년 의무 보증","Made in EU 우대"],"en":["MediaMarkt / Saturn","Idealo price comparison","Stiftung Warentest","Statutory 2-year warranty","Made in EU preference"]}'::jsonb,
   '{"ko":["수입 가격","수리 가능성 (Recht auf Reparatur)","개인정보 우려"],"en":["Imported price","Repairability (Recht auf Reparatur)","Privacy concerns"]}'::jsonb,
   '{"ko":["Amazon DE","MediaMarkt","Saturn","Idealo","Apple Store","Otto"],"en":["Amazon DE","MediaMarkt","Saturn","Idealo","Apple Store","Otto"]}'::jsonb,
   'MediaMarkt-Saturn dominates electronics retail. Idealo is the dominant price-comparison site. Germans research extensively before buying. EU-mandated repairability index plus consumer-rights warranty. Datenschutz (privacy) is a major purchase factor.',
   'GfK Germany Electronics'),
  ('DE', 2024, 'fashion',
   '{"ko":["Zalando","Otto","Vinted (중고)","Sustainability 인증 (Grüner Knopf)","Made in EU 우대"],"en":["Zalando","Otto","Vinted (resale)","Sustainability cert (Grüner Knopf)","Made in EU preference"]}'::jsonb,
   '{"ko":["사이즈 표준","Fast fashion 윤리","수입 럭셔리 부담"],"en":["Size standards","Fast fashion ethics","Imported luxury markup"]}'::jsonb,
   '{"ko":["Zalando","Otto","Amazon DE","H&M","Zara","Vinted","About You"],"en":["Zalando","Otto","Amazon DE","H&M","Zara","Vinted","About You"]}'::jsonb,
   'Zalando is the dominant fashion e-commerce in Europe (HQ in Berlin). Otto is the legacy mail-order giant turned digital. Sustainability mainstream — Grüner Knopf government label. Vinted has normalized resale.',
   'GfK Germany Fashion'),
  ('DE', 2024, 'health',
   '{"ko":["BfArM 승인","의사 처방 (gesetzliche·private Krankenkasse)","Apotheke (약국) 약사 상담","Stiftung Warentest","DocMorris·Shop Apotheke"],"en":["BfArM approval","Doctor prescription (statutory / private insurance)","Apotheke pharmacist","Stiftung Warentest","DocMorris / Shop Apotheke"]}'::jsonb,
   '{"ko":["효능 의심","수입 보충제 진위","처방 의약품 vs OTC"],"en":["Efficacy doubt","Imported supplement authenticity","Prescription vs OTC"]}'::jsonb,
   '{"ko":["Apotheke","DocMorris","Shop Apotheke","dm·Rossmann","Amazon DE"],"en":["Apotheke","DocMorris","Shop Apotheke","dm / Rossmann","Amazon DE"]}'::jsonb,
   'Pharmacy (Apotheke) ownership is restricted to pharmacists — pharmacy chains in the US/UK sense don''t exist. DocMorris and Shop Apotheke are the major mail-order players. Statutory health insurance (gesetzliche) covers most.',
   'BfArM / IQVIA Germany'),
  ('DE', 2024, 'saas',
   '{"ko":["G2·OMR 리뷰","독일어 지원 필수","DSGVO (GDPR) 준수","대기업 (SAP·Allianz·Siemens) reference","Made in EU·DE 우대"],"en":["G2 / OMR reviews","German support (mandatory)","DSGVO (GDPR) compliance","Enterprise (SAP / Allianz / Siemens) reference","Made in EU/DE preference"]}'::jsonb,
   '{"ko":["DSGVO 컴플라이언스","미국 클라우드 데이터 거주성","독일어 지원 부담","현지 SI"],"en":["DSGVO compliance","US cloud data residency","German support burden","Local SI"]}'::jsonb,
   '{"ko":["AWS Marketplace","SAP Store","SaaS 직접 영업","T-Systems·Atos SI","OVH Cloud"],"en":["AWS Marketplace","SAP Store","Direct SaaS sales","T-Systems / Atos SI","OVH Cloud"]}'::jsonb,
   'Germany B2B SaaS is data-residency obsessed — Made-in-EU cloud preferred. SAP Store and major SI partners (T-Systems, Atos) gate enterprise deals. German-language support is non-negotiable. OMR is the dominant SaaS event/community.',
   'IDC Germany / Hays')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
