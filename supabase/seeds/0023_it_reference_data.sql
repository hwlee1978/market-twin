-- IT (Italy) reference data — Phase C seed.
-- Sources:
--   • ISTAT (Istituto Nazionale di Statistica) — Indagine sui consumi delle famiglie 2023
--   • INPS — Osservatorio sui lavoratori dipendenti 2023
--   • Hays Italia / Michael Page Salary Guide 2024
--   • Nielsen Italy / GfK Italy 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('IT', 2024, 'Italy', 'Italia', 'EUR',
   58940000, 33000, 36800,
   'ISTAT Indagine sui consumi delle famiglie 2023',
   'https://www.istat.it')
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
   '{"ko":"초등학교 교사 (Insegnante elementare)","en":"Primary School Teacher"}'::jsonb,
   'employed', '30-39', 26000::numeric, 31000::numeric, 38000::numeric,
   '연 €26k-€38k (~$28-41k USD)', '€26k-38k annually (~$28-41k USD)'),
  ('office_worker',
   '{"ko":"사무직 (Impiegato)","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 24000, 32000, 45000,
   '연 €24k-€45k (~$26-49k USD)', '€24k-45k annually (~$26-49k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (Milano/Roma 테크 허브)","en":"Senior Software Engineer (Milan/Rome tech)"}'::jsonb,
   'employed', '30-39', 45000, 60000, 85000,
   '연 €45k-€85k (~$49-92k USD), 13~14개월 급여 별도',
   '€45k-85k annually (~$49-92k USD), 13th-14th month bonus'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 50000, 70000, 100000,
   '연 €50k-€100k (~$54-108k USD)',
   '€50k-100k annually (~$54-108k USD)'),
  ('nurse',
   '{"ko":"간호사 (Infermiere/a)","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 26000, 32000, 42000,
   '연 €26k-€42k (~$28-46k USD)', '€26k-42k annually (~$28-46k USD)'),
  ('doctor',
   '{"ko":"의사 (Medico)","en":"Physician"}'::jsonb,
   'employed', '40-49', 70000, 100000, 160000,
   '연 €70k-€160k (~$76-173k USD)',
   '€70k-160k annually (~$76-173k USD)'),
  ('self_employed',
   '{"ko":"자영업자 (Lavoratore autonomo, Partita IVA)","en":"Self-employed (Partita IVA)"}'::jsonb,
   'self_employed', '40-49', 22000, 38000, 70000,
   '사업소득 연 €22k-€70k (변동 큼, ~$24-76k USD)',
   'Annual €22k-70k (highly variable, ~$24-76k USD)'),
  ('fashion_artisan',
   '{"ko":"패션·디자인 장인 (Made in Italy)","en":"Fashion / Design Artisan"}'::jsonb,
   'employed', '30-39', 26000, 38000, 55000,
   '연 €26k-€55k (~$28-60k USD), 명품 브랜드 외주 多',
   '€26k-55k annually (~$28-60k USD), luxury supplier work'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 4000, 9000, 16000,
   '용돈+알바 연 €4k-€16k (~$4-17k USD), 부모 지원 별도',
   'Allowance + part-time €4k-16k/yr (~$4-17k USD)'),
  ('homemaker',
   '{"ko":"전업주부 (Casalinga)","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 €40k-€80k, 본인 가처분 월 €300-€800',
   'No personal salary. Household €40k-80k/yr; personal disposable €300-800/month'),
  ('retiree',
   '{"ko":"은퇴자 (Pensionato, INPS 연금)","en":"Retiree (INPS pension)"}'::jsonb,
   'retiree', '60+', 14000, 22000, 35000,
   'INPS 연금 연 €14k-€35k (~$15-38k USD)',
   'INPS pension €14k-35k/yr (~$15-38k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 12000, 18000, 26000,
   '연 €12k-€26k (~$13-28k USD)', '€12k-26k annually (~$13-28k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'IT', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'EUR',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'ISTAT 2023 / Hays Italia Salary Guide 2024'
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
  ('IT', 2024, 'food',
   '{"ko":["DOP·IGP·DOC 등 원산지 인증","Made in Italy","Coop·Esselunga·Conad","로컬·전통 강조","팜투테이블 신뢰"],"en":["DOP/IGP/DOC origin certification","Made in Italy","Coop / Esselunga / Conad","Local / traditional emphasis","Farm-to-table trust"]}'::jsonb,
   '{"ko":["가격 부담","수입 식품 신뢰도 낮음","과도한 가공 거부감","북부·남부 지역색 차이"],"en":["Price","Distrust of imported food","Reluctance to ultra-processed","North/South regional taste differences"]}'::jsonb,
   '{"ko":["Esselunga","Coop","Conad","Lidl","Carrefour Italia","Eataly","Glovo","Just Eat","Deliveroo"],"en":["Esselunga","Coop","Conad","Lidl","Carrefour Italia","Eataly","Glovo","Just Eat","Deliveroo"]}'::jsonb,
   'Italy is one of the most regional food cultures in Europe — North (Po Valley) vs Center vs South vs Sicily/Sardinia all have distinct preferences. DOP/IGP/DOC origin marks carry massive trust. Eataly anchors premium Italian-food retail globally. Hard discount (Lidl, Eurospin) gained share post-2020 inflation.',
   'Nielsen Italy / Coop Italia 2023'),
  ('IT', 2024, 'beauty',
   '{"ko":["Sephora·Douglas","로컬 약국(Farmacia) 추천","KIKO Milano (자국 브랜드)","피부과 의사·아포테카리오","Made in Italy 화장품"],"en":["Sephora / Douglas","Local pharmacy (Farmacia)","KIKO Milano (domestic)","Dermatologist / Apothecary","Made in Italy cosmetics"]}'::jsonb,
   '{"ko":["고가 럭셔리 부담","수입 K-beauty·J-beauty 인지도 점진","피부 트러블 (남부 햇볕)","위조품 (paralleli)"],"en":["Premium price","K/J-beauty awareness gradual","Skin issues (southern sun)","Parallel imports / counterfeits"]}'::jsonb,
   '{"ko":["Sephora IT","Douglas","Farmacia","KIKO Milano","Profumerie Limoni","Notino","Amazon IT"],"en":["Sephora IT","Douglas","Farmacia","KIKO Milano","Limoni perfumeries","Notino","Amazon IT"]}'::jsonb,
   'KIKO Milano is the iconic Italian mass-market makeup brand. Profumerie (specialty perfumeries) like Limoni still anchor offline. Pharmacy-grade dermo-cosmetics (La Roche-Posay, Bioderma) carry strong trust through Farmacia channel.',
   'Cosmetica Italia / Euromonitor IT'),
  ('IT', 2024, 'electronics',
   '{"ko":["MediaWorld (=MediaMarkt)","Unieuro·Euronics","Apple Italia 매장","Amazon IT","2년 EU 보증"],"en":["MediaWorld (=MediaMarkt)","Unieuro / Euronics","Apple Italia stores","Amazon IT","2-year EU warranty"]}'::jsonb,
   '{"ko":["수입 가격 (EU 중 비싼 편)","아이폰 가격 부담","SIM-free vs 통신사 묶음 선호","리퍼·중고 시장 활성"],"en":["Imported price","iPhone affordability","SIM-free vs carrier-locked preference","Active refurbished/used market"]}'::jsonb,
   '{"ko":["Amazon IT","MediaWorld","Unieuro","Apple Online","ePrice","Subito.it (중고)"],"en":["Amazon IT","MediaWorld","Unieuro","Apple Online","ePrice","Subito.it (used)"]}'::jsonb,
   'Italians have one of the highest mobile penetration rates in EU but carrier-locked smartphones are less popular than in DE/FR. Apple has ~25% smartphone share. Refurbished electronics very popular through Subito.it and Backmarket.',
   'IDC Italy / Confindustria Digitale'),
  ('IT', 2024, 'fashion',
   '{"ko":["Made in Italy 럭셔리 (Gucci·Prada·Versace)","Zara·H&M","Inditex 브랜드","Yoox·Net-a-Porter","빈티지·중고 (Vinted)"],"en":["Made in Italy luxury (Gucci/Prada/Versace)","Zara / H&M","Inditex brands","Yoox / Net-a-Porter","Vintage / used (Vinted)"]}'::jsonb,
   '{"ko":["럭셔리 부담","fast fashion 환경 우려 (북부)","사이즈 표준 차이","빈티지 선호 증가"],"en":["Luxury price","Fast-fashion sustainability concerns (north)","Sizing differences","Rising vintage preference"]}'::jsonb,
   '{"ko":["Yoox","Zalando","Amazon Fashion","Vinted","Made in Italy 부띠끄","아울렛 (Serravalle, The Mall)"],"en":["Yoox","Zalando","Amazon Fashion","Vinted","Made in Italy boutiques","Outlets (Serravalle, The Mall)"]}'::jsonb,
   'Italy is the home market for luxury fashion — Milan is one of the Big-4 fashion weeks. Yoox (now part of Richemont) is the iconic luxury e-commerce. Outlet villages (Serravalle, The Mall) drive 1-3 hour pilgrimage shopping. Vinted very popular among young Italians for sustainable fashion.',
   'Camera Nazionale della Moda Italiana / Yoox IR'),
  ('IT', 2024, 'health',
   '{"ko":["Farmacia 약사","Servizio Sanitario Nazionale (SSN)","Esi·Pegaso 등 로컬 보충제","의사 처방","DOP 식품 (기능성)"],"en":["Farmacia (pharmacy)","SSN (national health service)","Local supplements (Esi, Pegaso)","Doctor prescription","DOP functional foods"]}'::jsonb,
   '{"ko":["효능 의심","수입 보충제 신뢰도","SSN 비커버리지 부담","고령화 인구 약사 의존"],"en":["Efficacy doubt","Trust in imported supplements","SSN out-of-pocket","Aging population pharmacy reliance"]}'::jsonb,
   '{"ko":["Farmacia","Parafarmacia","Amazon IT","Notino","iHerb","Erboristeria"],"en":["Farmacia","Parafarmacia","Amazon IT","Notino","iHerb","Herbalist shops"]}'::jsonb,
   'Italy has universal SSN coverage but private supplement market thrives. Pharmacy is the dominant trust signal. Erboristeria (herbalist shops) a uniquely Italian channel for natural health. Aging population means high consumer demand for senior supplements.',
   'Federfarma / Euromonitor IT Health'),
  ('IT', 2024, 'saas',
   '{"ko":["G2·Capterra 평가","대기업 (UniCredit·Eni·ENEL) reference","GDPR 준수","Agid (디지털청) 인증","무료 체험"],"en":["G2 / Capterra reviews","Enterprise reference (UniCredit / Eni / ENEL)","GDPR compliance","AgID (digital agency) certification","Free trial"]}'::jsonb,
   '{"ko":["GDPR 컴플라이언스","외화 결제","현지 데이터 거주성 (PA 시장)","이탈리아어 번역","느린 의사결정"],"en":["GDPR compliance","Foreign currency","Local data residency (PA market)","Italian localization","Slow procurement cycle"]}'::jsonb,
   '{"ko":["AWS Marketplace","Microsoft Marketplace","TIM Cloud","SaaS 직접 영업","Var·Reseller 채널 강함"],"en":["AWS Marketplace","Microsoft Marketplace","TIM Cloud","Direct SaaS sales","Strong VAR / reseller channel"]}'::jsonb,
   'Italy''s B2B SaaS market is more reseller-driven than US/UK — direct DTC SMB sales are tougher. PA (Pubblica Amministrazione) requires AgID approval. Italian-language localization is essential for SMB. Procurement cycles are longer than EU average.',
   'IDC Italy / Anitec-Assinform')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
