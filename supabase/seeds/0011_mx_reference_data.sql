-- MX (Mexico) reference data — Phase B seed.
-- Sources:
--   • INEGI — ENIGH (Encuesta Nacional de Ingresos y Gastos de los Hogares) 2022
--   • INEGI — Encuesta Nacional de Ocupación y Empleo 2023
--   • OCC Mundial / Indeed Mexico Salary Reports 2023
--   • Kantar Worldpanel Mexico 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('MX', 2024, 'Mexico', 'México', 'MXN',
   128500000, 200000, 13900,
   'INEGI ENIGH 2022 / ENOE 2023',
   'https://www.inegi.org.mx')
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
   '{"ko":"초등학교 교사 (Maestro)","en":"Elementary School Teacher"}'::jsonb,
   'employed', '30-39', 120000::numeric, 180000::numeric, 240000::numeric,
   '연 MX$120k-MX$240k (~$7-14k USD)',
   'MX$120k-MX$240k annually (~$7-14k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 150000, 240000, 380000,
   '연 MX$150k-MX$380k (~$9-22k USD)',
   'MX$150k-MX$380k annually (~$9-22k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (CDMX·Monterrey)","en":"Senior Software Engineer (CDMX / Monterrey)"}'::jsonb,
   'employed', '30-39', 450000, 700000, 1100000,
   '연 MX$450k-MX$1.1M (~$26-65k USD, 외자계 더 높음)',
   'MX$450k-MX$1.1M annually (~$26-65k USD, foreign cos higher)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 320000, 500000, 750000,
   '연 MX$320k-MX$750k (~$19-44k USD)',
   'MX$320k-MX$750k annually (~$19-44k USD)'),
  ('nurse',
   '{"ko":"간호사 (Enfermera)","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 130000, 200000, 280000,
   '연 MX$130k-MX$280k (~$8-16k USD)',
   'MX$130k-MX$280k annually (~$8-16k USD)'),
  ('doctor',
   '{"ko":"의사","en":"Physician"}'::jsonb,
   'employed', '40-49', 350000, 600000, 1000000,
   '연 MX$350k-MX$1M (~$20-59k USD)',
   'MX$350k-MX$1M annually (~$20-59k USD)'),
  ('factory_worker',
   '{"ko":"공장 노동자 (Maquila 산업)","en":"Factory Worker (Maquila)"}'::jsonb,
   'employed', '30-39', 90000, 130000, 180000,
   '연 MX$90k-MX$180k (~$5-11k USD)',
   'MX$90k-MX$180k annually (~$5-11k USD)'),
  ('domestic_worker',
   '{"ko":"가사도우미","en":"Domestic Worker"}'::jsonb,
   'employed', '40-49', 60000, 90000, 130000,
   '연 MX$60k-MX$130k (~$4-8k USD)',
   'MX$60k-MX$130k annually (~$4-8k USD)'),
  ('small_business_owner',
   '{"ko":"자영업자 (Pequeño Negocio)","en":"Small Business Owner"}'::jsonb,
   'self_employed', '40-49', 120000, 280000, 600000,
   '사업소득 연 MX$120k-MX$600k (변동 큼, ~$7-35k USD)',
   'Annual MX$120k-MX$600k (highly variable, ~$7-35k USD)'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 24000, 60000, 120000,
   '용돈+알바 연 MX$24k-MX$120k (~$1.4-7k USD), 부모 지원 별도',
   'Allowance + part-time MX$24k-MX$120k/yr (~$1.4-7k USD)'),
  ('homemaker',
   '{"ko":"전업주부 (Ama de Casa)","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 MX$300k-MX$600k, 본인 가처분 월 MX$2k-MX$8k',
   'No personal salary. Household MX$300k-MX$600k/yr; personal disposable MX$2k-MX$8k/month'),
  ('retiree',
   '{"ko":"은퇴자 (Jubilado)","en":"Retiree"}'::jsonb,
   'retiree', '60+', 80000, 150000, 280000,
   'IMSS·AFORE 연 MX$80k-MX$280k (~$5-16k USD)',
   'IMSS / AFORE pension MX$80k-MX$280k/yr (~$5-16k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 50000, 90000, 150000,
   '연 MX$50k-MX$150k (~$3-9k USD)',
   'MX$50k-MX$150k annually (~$3-9k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'MX', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'MXN',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'INEGI ENIGH 2022 / OCC Mundial Salary'
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
  ('MX', 2024, 'food',
   '{"ko":["COFEPRIS 식품 등록","PROFECO 평가","Walmart·Soriana PB","WhatsApp·Facebook 추천","Tianguis (전통시장) 신뢰"],"en":["COFEPRIS food registration","PROFECO consumer protection","Walmart / Soriana PB","WhatsApp / Facebook recommendation","Tianguis market trust"]}'::jsonb,
   '{"ko":["가격 부담","수입품 관세","유통기한","위생 의심"],"en":["Price","Import tariffs","Expiry","Sanitation concerns"]}'::jsonb,
   '{"ko":["Mercado Libre","Walmart","Soriana","Costco","Amazon MX","Rappi","Tianguis"],"en":["Mercado Libre","Walmart","Soriana","Costco","Amazon MX","Rappi","Tianguis"]}'::jsonb,
   'Walmart dominates organized retail; Costco grows fast in middle-class segments. Tianguis (open-air markets) remain culturally and economically significant. Rappi drives delivery. WhatsApp marketing groups are a major informal channel.',
   'Kantar Worldpanel MX 2023'),
  ('MX', 2024, 'beauty',
   '{"ko":["Sephora·Ulta MX","Liverpool·Palacio de Hierro","Instagram·TikTok 인플루언서","Made in México 우대","피부과 추천"],"en":["Sephora / Ulta MX","Liverpool / Palacio de Hierro","Instagram / TikTok influencer","Made-in-México preference","Dermatologist endorsement"]}'::jsonb,
   '{"ko":["피부 트러블","위조품","수입 가격 부담"],"en":["Skin reaction","Counterfeit","Imported price"]}'::jsonb,
   '{"ko":["Sephora MX","Liverpool","Palacio de Hierro","Mercado Libre","Amazon MX","Walmart"],"en":["Sephora MX","Liverpool","Palacio de Hierro","Mercado Libre","Amazon MX","Walmart"]}'::jsonb,
   'Department stores (Liverpool, Palacio de Hierro) anchor premium beauty. Sephora has expanded but local pharmacy channels (Farmacias Guadalajara) drive volume. K-beauty interest growing.',
   'Euromonitor MX'),
  ('MX', 2024, 'electronics',
   '{"ko":["Liverpool·Costco·Best Buy MX","Mercado Libre 평점","12·24개월 분할 결제","수입 단증 (DOF)","NOM 인증"],"en":["Liverpool / Costco / Best Buy MX","Mercado Libre rating","12-24 month installments","Import documentation (DOF)","NOM certification"]}'::jsonb,
   '{"ko":["수입 관세 부담","위조품","분할 이자","수리 비용"],"en":["Import tariffs","Counterfeit","Installment interest","Repair cost"]}'::jsonb,
   '{"ko":["Mercado Libre","Amazon MX","Liverpool","Best Buy MX","Costco","Coppel"],"en":["Mercado Libre","Amazon MX","Liverpool","Best Buy MX","Costco","Coppel"]}'::jsonb,
   'Mercado Libre and Amazon dominate online. Coppel offers credit-based purchasing for unbanked consumers. Best Buy operates in Mexico with localized SKUs. Apple has prestige but pricing 30%+ above US.',
   'Euromonitor MX Electronics'),
  ('MX', 2024, 'fashion',
   '{"ko":["Liverpool·Suburbia","Mercado Libre 패션","Made in México 우대","Instagram 인플루언서","Shein 가성비"],"en":["Liverpool / Suburbia","Mercado Libre Fashion","Made-in-México preference","Instagram influencer","Shein value"]}'::jsonb,
   '{"ko":["사이즈 표준","수입 럭셔리 부담","위조품"],"en":["Size standards","Imported luxury markup","Counterfeit"]}'::jsonb,
   '{"ko":["Liverpool","Suburbia","Mercado Libre","Amazon MX","Zara","Shein","H&M"],"en":["Liverpool","Suburbia","Mercado Libre","Amazon MX","Zara","Shein","H&M"]}'::jsonb,
   'Liverpool and Suburbia dominate department-store fashion. Shein has surged among Gen Z. Made-in-México apparel has growing pride momentum. Tianguis fashion stalls remain massive informal channel.',
   'Euromonitor MX Fashion'),
  ('MX', 2024, 'health',
   '{"ko":["COFEPRIS 등록","의사 처방 (IMSS·private)","Farmacias Guadalajara·Benavides","NOM 인증","약사 상담"],"en":["COFEPRIS registration","Doctor prescription (IMSS / private)","Farmacias Guadalajara / Benavides","NOM cert","Pharmacist consult"]}'::jsonb,
   '{"ko":["효능 의심","위조품","IMSS vs private 비용"],"en":["Efficacy doubt","Counterfeit","IMSS vs private cost"]}'::jsonb,
   '{"ko":["Farmacias Guadalajara","Farmacias Benavides","Farmacias del Ahorro","Mercado Libre","Amazon MX","Walmart"],"en":["Farmacias Guadalajara","Farmacias Benavides","Farmacias del Ahorro","Mercado Libre","Amazon MX","Walmart"]}'::jsonb,
   'Farmacias Similares introduced low-cost generics movement. Major chains (Guadalajara, Benavides) offer doctor consultations. IMSS public health covers basics; private supplements common.',
   'COFEPRIS / Euromonitor MX'),
  ('MX', 2024, 'saas',
   '{"ko":["스페인어 지원 필수","대기업 도입 (Bimbo, Cemex 등)","Factura electrónica (CFDI) 발행","SAT 컴플라이언스","무료 체험"],"en":["Spanish support (mandatory)","Enterprise references (Bimbo, Cemex)","Electronic invoicing (CFDI)","SAT compliance","Free trial"]}'::jsonb,
   '{"ko":["스페인어 미지원","CFDI 발행 미지원","USD 결제","현지 SI 부족"],"en":["No Spanish support","No CFDI invoicing","USD pricing","Limited local SI"]}'::jsonb,
   '{"ko":["AWS Marketplace","SaaS 직접 영업","Telmex·Totalplay B2B","현지 SI (Softtek)"],"en":["AWS Marketplace","Direct SaaS sales","Telmex / Totalplay B2B","Local SI (Softtek)"]}'::jsonb,
   'Mexican B2B requires Spanish support and CFDI electronic invoicing (SAT mandate). Softtek and other domestic SI gate enterprise. USD pricing creates friction for SMB.',
   'IDC LATAM / Hays MX')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
