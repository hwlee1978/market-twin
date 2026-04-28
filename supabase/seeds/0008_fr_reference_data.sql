-- FR (France) reference data — Phase B seed.
-- Sources:
--   • INSEE — Salaires et revenus d'activité 2023
--   • DARES — Postes et salaires dans le privé 2023
--   • Apec / Hays Salary Guide France 2023
--   • Kantar / Nielsen France consumer 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('FR', 2024, 'France', 'France', 'EUR',
   68000000, 38000, 44400,
   'INSEE Salaires et Revenus 2023',
   'https://www.insee.fr')
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
   '{"ko":"초등학교 교사 (Professeur des écoles)","en":"Elementary School Teacher"}'::jsonb,
   'employed', '30-39', 28000::numeric, 35000::numeric, 42000::numeric,
   '연 €28k-€42k (~$30-45k USD)', '€28k-€42k annually (~$30-45k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 32000, 42000, 55000,
   '연 €32k-€55k (~$35-60k USD)', '€32k-€55k annually (~$35-60k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (Paris)","en":"Senior Software Engineer (Paris)"}'::jsonb,
   'employed', '30-39', 55000, 70000, 95000,
   '연 €55k-€95k (~$59-103k USD)', '€55k-€95k annually (~$59-103k USD)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 50000, 65000, 85000,
   '연 €50k-€85k (~$54-92k USD)', '€50k-€85k annually (~$54-92k USD)'),
  ('nurse',
   '{"ko":"간호사 (Infirmier·ère)","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 30000, 38000, 46000,
   '연 €30k-€46k (~$32-50k USD)', '€30k-€46k annually (~$32-50k USD)'),
  ('doctor',
   '{"ko":"의사 (Médecin généraliste)","en":"General Practitioner"}'::jsonb,
   'employed', '40-49', 75000, 110000, 160000,
   '연 €75k-€160k (~$81-173k USD)', '€75k-€160k annually (~$81-173k USD)'),
  ('barista',
   '{"ko":"바리스타 / 카페 직원","en":"Barista / Café Worker"}'::jsonb,
   'employed', '20-29', 22000, 26000, 30000,
   '연 €22k-€30k (~$24-32k USD), SMIC 기준',
   '€22k-€30k annually (~$24-32k USD), at or near SMIC'),
  ('artisan',
   '{"ko":"자영업 장인 (Artisan, 제빵·미용 등)","en":"Self-employed Artisan (Baker / Hairdresser)"}'::jsonb,
   'self_employed', '40-49', 25000, 45000, 80000,
   '사업소득 연 €25k-€80k (변동 큼, ~$27-87k USD)',
   'Annual €25k-€80k (highly variable, ~$27-87k USD)'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 4000, 9000, 16000,
   '용돈+알바 연 €4k-€16k (~$4-17k USD), CAF 보조 별도',
   'Allowance + part-time €4k-€16k/yr (~$4-17k USD), CAF subsidies separate'),
  ('homemaker',
   '{"ko":"전업주부 (Femme/Homme au foyer)","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 €55k-€85k, 본인 가처분 월 €200-€600',
   'No personal salary. Household €55k-€85k/yr; personal disposable €200-€600/month'),
  ('retiree',
   '{"ko":"은퇴자 (Retraité·e)","en":"Retiree"}'::jsonb,
   'retiree', '60+', 18000, 28000, 42000,
   '국가연금 연 €18k-€42k (~$19-45k USD)',
   'State pension €18k-€42k/yr (~$19-45k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 14000, 20000, 28000,
   '연 €14k-€28k (~$15-30k USD)', '€14k-€28k annually (~$15-30k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'FR', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'EUR',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'INSEE 2023 / Apec Salary Guide'
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
  ('FR', 2024, 'food',
   '{"ko":["AOC·AOP 원산지 인증","Bio EU 유기농","60 Millions de Consommateurs 평가","Yuka 앱 점수","대형마트 PB (Carrefour, Monoprix)"],"en":["AOC / AOP origin certification","Bio EU organic","60 Millions de Consommateurs","Yuka app score","Major retailer PB"]}'::jsonb,
   '{"ko":["가격 부담","수입 식품 거부감","AOC 미인증 의심","유전자조작 우려"],"en":["Price","Imported food resistance","AOC absence skepticism","GMO concerns"]}'::jsonb,
   '{"ko":["Carrefour","Leclerc","Monoprix","Casino","Amazon FR","La Ruche Qui Dit Oui","Marché (전통시장)"],"en":["Carrefour","Leclerc","Monoprix","Casino","Amazon FR","La Ruche Qui Dit Oui","Marché"]}'::jsonb,
   'Yuka app has revolutionized ingredient transparency in France. AOC / AOP / Bio certification drives premium. Local marché (farmer''s market) culture remains strong. Imported food faces "made in France" preference.',
   'Kantar France Consumer 2023'),
  ('FR', 2024, 'beauty',
   '{"ko":["피부과 의사 추천","Sephora 진열","Monoprix·Marionnaud","Yuka 앱 (성분 분석)","프랑스 럭셔리 브랜드 신뢰 (L''Oréal, Lancôme)"],"en":["Dermatologist endorsement","Sephora placement","Monoprix / Marionnaud","Yuka app (ingredient analysis)","French luxury brand trust"]}'::jsonb,
   '{"ko":["피부 트러블","고가 부담","합성 성분 우려","수입 K-beauty 신뢰성"],"en":["Skin reaction","Premium price","Synthetic ingredient concerns","K-beauty authenticity"]}'::jsonb,
   '{"ko":["Sephora","Monoprix Beauté","Marionnaud","Nocibé","Amazon FR","Pharmacy"],"en":["Sephora","Monoprix Beauté","Marionnaud","Nocibé","Amazon FR","Pharmacy"]}'::jsonb,
   'France is iconic for premium beauty. Pharmacy beauty (La Roche-Posay, Avène) has strong dermatologist credibility. Yuka has shifted ingredient awareness. K-beauty has gained foothold via Sephora.',
   'L''Oréal / Yuka France 2023'),
  ('FR', 2024, 'electronics',
   '{"ko":["Fnac·Darty 매장","Que Choisir 평가","2년 의무 보증","Apple Store","Boulanger"],"en":["Fnac / Darty stores","Que Choisir reviews","Statutory 2-year warranty","Apple Store","Boulanger"]}'::jsonb,
   '{"ko":["Made in EU 선호","수입 가전 가격","수리 가능성 (지표 의무 표시)"],"en":["Made-in-EU preference","Imported markup","Repairability (mandatory index)"]}'::jsonb,
   '{"ko":["Fnac","Darty","Boulanger","Amazon FR","Cdiscount","Apple Store"],"en":["Fnac","Darty","Boulanger","Amazon FR","Cdiscount","Apple Store"]}'::jsonb,
   'France mandates a "repairability index" (indice de réparabilité) on consumer electronics. Fnac and Darty are merged but operate as competing brands. Que Choisir is the trusted consumer review.',
   'GfK France / Que Choisir'),
  ('FR', 2024, 'fashion',
   '{"ko":["Made in France 신뢰","Galeries Lafayette·Printemps","Vinted (중고 의류)","Sustainability EU 인증","La Redoute"],"en":["Made in France trust","Galeries Lafayette / Printemps","Vinted (resale)","Sustainability EU cert","La Redoute"]}'::jsonb,
   '{"ko":["사이즈 표준","Fast fashion 윤리","수입 럭셔리 가격"],"en":["Size standards","Fast fashion ethics","Imported luxury markup"]}'::jsonb,
   '{"ko":["Galeries Lafayette","Printemps","La Redoute","Zara","Uniqlo","Vinted","Amazon FR"],"en":["Galeries Lafayette","Printemps","La Redoute","Zara","Uniqlo","Vinted","Amazon FR"]}'::jsonb,
   'Vinted has normalized resale fashion in France. Department stores (Galeries Lafayette, Printemps) maintain luxury status. Made-in-France labeling drives premium. SHEIN faces ethical resistance.',
   'Kantar France Fashion'),
  ('FR', 2024, 'health',
   '{"ko":["ANSM 인증","의사 처방 (Sécurité sociale)","약국 (Pharmacie) 약사 상담","Que Choisir 평가","Made in France 우대"],"en":["ANSM approval","Doctor prescription (Sécurité sociale)","Pharmacy pharmacist","Que Choisir","Made in France preference"]}'::jsonb,
   '{"ko":["효능 의심","수입 보충제 진위","Sécu 비커버"],"en":["Efficacy doubt","Imported supplement authenticity","Out-of-pocket cost"]}'::jsonb,
   '{"ko":["Pharmacy","Parapharmacie","Amazon FR","Doctipharma","Newpharma"],"en":["Pharmacy","Parapharmacie","Amazon FR","Doctipharma","Newpharma"]}'::jsonb,
   'France has strong public healthcare (Sécu). Pharmacies are the primary OTC channel and pharmacists are deeply trusted. Parapharmacie distinguishes from prescription drugs.',
   'ANSM / Que Choisir'),
  ('FR', 2024, 'saas',
   '{"ko":["프랑스어 지원 필수","RGPD (GDPR) 준수","대기업 도입 사례","Made in France·EU 우대","Capterra 평가"],"en":["French support (mandatory)","RGPD (GDPR) compliance","Enterprise references","Made in France/EU preference","Capterra reviews"]}'::jsonb,
   '{"ko":["RGPD 컴플라이언스","미국 클라우드 데이터 거주","번역 품질 의심","높은 부가가치세 (TVA 20%)"],"en":["GDPR compliance","US cloud data residency","Translation quality","TVA 20% VAT"]}'::jsonb,
   '{"ko":["AWS Marketplace","OVH Cloud","SaaS 직접 영업","Capgemini·Atos SI","Bpifrance B2B"],"en":["AWS Marketplace","OVH Cloud","Direct SaaS sales","Capgemini / Atos SI","Bpifrance B2B"]}'::jsonb,
   'France emphasizes data sovereignty (OVH and "Made in France" cloud). RGPD compliance is non-negotiable. Major SI (Capgemini, Atos) gate enterprise. French-language support is essential.',
   'IDC France / Apec')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
