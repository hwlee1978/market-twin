-- AE (UAE) reference data — Phase B seed (manually curated).
-- Mostly expat-driven labor market; salary by sector and nationality.
--
-- Sources informing the values below:
--   • FCSC — UAE Federal Competitiveness and Statistics Centre 2023
--   • SCAD Abu Dhabi / DSC Dubai labor market reports 2023
--   • Mercer / Hays 2023 Salary Guide for UAE
--   • Nielsen MENA consumer behavior 2023
--
-- Re-run safely: ON CONFLICT DO UPDATE makes this idempotent.

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('AE', 2024, 'United Arab Emirates', 'الإمارات العربية المتحدة', 'AED',
   9700000, 220000, 51400,
   'FCSC UAE 2023 / Mercer Salary Guide',
   'https://fcsc.gov.ae')
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
   'employed', '30-39', 110000::numeric, 140000::numeric, 180000::numeric,
   '연 AED 110k-180k (~$30-49k USD)', 'AED 110k-180k annually (~$30-49k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 90000, 120000, 180000,
   '연 AED 90k-180k (~$24-49k USD)', 'AED 90k-180k annually (~$24-49k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (외국인 익스팻)","en":"Senior Software Engineer (Expat)"}'::jsonb,
   'employed', '30-39', 250000, 360000, 480000,
   '연 AED 250k-480k (~$68-131k USD, 외국인 익스팻 패키지)',
   'AED 250k-480k annually (~$68-131k USD, expat package)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 220000, 320000, 450000,
   '연 AED 220k-450k (~$60-123k USD)', 'AED 220k-450k annually (~$60-123k USD)'),
  ('nurse',
   '{"ko":"간호사 (인도·필리핀 출신 익스팻)","en":"Registered Nurse (Indian / Filipino Expat)"}'::jsonb,
   'employed', '30-39', 80000, 110000, 150000,
   '연 AED 80k-150k (~$22-41k USD)', 'AED 80k-150k annually (~$22-41k USD)'),
  ('doctor',
   '{"ko":"의사","en":"Physician"}'::jsonb,
   'employed', '40-49', 350000, 550000, 850000,
   '연 AED 350k-850k (~$95-231k USD)', 'AED 350k-850k annually (~$95-231k USD)'),
  ('construction_worker',
   '{"ko":"건설 노동자 (남아시아 출신 익스팻)","en":"Construction Worker (South Asian Expat)"}'::jsonb,
   'employed', '20-29', 18000, 28000, 40000,
   '연 AED 18k-40k (~$5-11k USD), 숙소·식사 회사 제공',
   'AED 18k-40k annually (~$5-11k USD), housing and meals provided'),
  ('emirati_government_employee',
   '{"ko":"정부 공무원 (자국민)","en":"Government Employee (Emirati National)"}'::jsonb,
   'employed', '30-39', 250000, 380000, 550000,
   '연 AED 250k-550k (~$68-150k USD, 자국민 우대)',
   'AED 250k-550k annually (~$68-150k USD, Emirati preference)'),
  ('self_employed_business_owner',
   '{"ko":"자영업자 (Free Zone 법인)","en":"Self-employed (Free Zone Business)"}'::jsonb,
   'self_employed', '40-49', 150000, 350000, 800000,
   '사업소득 연 AED 150k-800k (변동 큼, ~$41-218k USD)',
   'Annual AED 150k-800k (highly variable, ~$41-218k USD)'),
  ('college_student',
   '{"ko":"대학생","en":"College Student"}'::jsonb,
   'student', '20-29', 0, 12000, 30000,
   '용돈+알바 연 AED 0-30k (~$0-8k USD), 부모 지원 별도',
   'Allowance + part-time AED 0-30k/yr (~$0-8k USD)'),
  ('homemaker',
   '{"ko":"전업주부 (자국민)","en":"Homemaker (Emirati)"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 AED 400k-800k, 본인 가처분 월 AED 8k-20k',
   'No personal salary. Household AED 400k-800k/yr; personal disposable AED 8k-20k/month'),
  ('retiree_emirati',
   '{"ko":"은퇴자 (자국민, 정부 연금)","en":"Retiree (Emirati, Govt Pension)"}'::jsonb,
   'retiree', '60+', 80000, 130000, 200000,
   '정부연금 연 AED 80k-200k (~$22-54k USD)',
   'Government pension AED 80k-200k/yr (~$22-54k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 25000, 45000, 70000,
   '연 AED 25k-70k (~$7-19k USD)', 'AED 25k-70k annually (~$7-19k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'AE', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'AED',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'FCSC UAE 2023 / Mercer Salary Guide'
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
  ('AE', 2024, 'food',
   '{"ko":["할랄 인증","UAE municipality 식품 안전 인증","Carrefour·Lulu PB 신뢰","Instagram 인플루언서","원산지 표기"],"en":["Halal certification","UAE municipality food safety","Carrefour / Lulu PB trust","Instagram influencer","Country-of-origin label"]}'::jsonb,
   '{"ko":["가격 부담","할랄 인증 신뢰성 의심","유통기한","수입 식품 신선도"],"en":["Premium pricing","Halal cert authenticity concerns","Expiry","Imported food freshness"]}'::jsonb,
   '{"ko":["Carrefour","Lulu Hypermarket","Spinneys","Talabat","Noon","Amazon UAE","Instashop"],"en":["Carrefour","Lulu Hypermarket","Spinneys","Talabat","Noon","Amazon UAE","Instashop"]}'::jsonb,
   'Halal certification is non-negotiable. Lulu and Carrefour dominate hypermarket. Talabat (food delivery) and Noon (Amazon competitor) are major channels. Premium imported food is normal in UAE due to expat affluence.',
   'Nielsen MENA consumer 2023'),
  ('AE', 2024, 'beauty',
   '{"ko":["피부과 의사 추천","Sephora ME 진열","Instagram 인플루언서","Sharaf DG·Faces 매장","유럽 럭셔리 브랜드 신뢰"],"en":["Dermatologist endorsement","Sephora ME placement","Instagram influencer","Sharaf DG / Faces stores","European luxury brand trust"]}'::jsonb,
   '{"ko":["기후 영향 (선크림 필수)","고가 럭셔리 부담","피부 트러블"],"en":["Climate factors (sunscreen essential)","Luxury price","Skin reaction"]}'::jsonb,
   '{"ko":["Sephora ME","Faces","Sharaf DG","Noon","Amazon UAE","Boots","면세점"],"en":["Sephora ME","Faces","Sharaf DG","Noon","Amazon UAE","Boots","Duty-free"]}'::jsonb,
   'High disposable income drives premium beauty. Climate-specific products (high-SPF, hydrating) are essential. Influencer-led trends move quickly across English and Arabic Instagram.',
   'Mercer UAE / Euromonitor'),
  ('AE', 2024, 'electronics',
   '{"ko":["Apple/Samsung 우세","Sharaf DG·Jumbo·Emax 매장","아마존 글로벌 직구","Noon Apple Store","공식 보증 (UAE 워런티)"],"en":["Apple/Samsung dominate","Sharaf DG / Jumbo / Emax stores","Amazon global","Noon Apple Store","Official UAE warranty"]}'::jsonb,
   '{"ko":["UAE 워런티 vs 글로벌 워런티","220V 호환성","수리 비용"],"en":["UAE vs global warranty","220V compatibility","Repair cost"]}'::jsonb,
   '{"ko":["Sharaf DG","Jumbo","Emax","Noon","Amazon UAE","Apple Store"],"en":["Sharaf DG","Jumbo","Emax","Noon","Amazon UAE","Apple Store"]}'::jsonb,
   'UAE consumers favor premium brands. Tax-free pricing (5% VAT only) makes UAE a regional electronics hub. Sharaf DG and Jumbo are the dominant electronics retailers.',
   'Euromonitor UAE'),
  ('AE', 2024, 'fashion',
   '{"ko":["Dubai Mall·Mall of Emirates 백화점","Instagram 인플루언서","Sustainability 일부 관심","면세점 럭셔리"],"en":["Dubai Mall / Mall of Emirates department stores","Instagram influencer","Some sustainability interest","Duty-free luxury"]}'::jsonb,
   '{"ko":["여름 더위로 셔츠·소재 선택","고가 럭셔리 부담","사이즈 표준"],"en":["Summer heat affects fabric choice","Luxury price","Size standards"]}'::jsonb,
   '{"ko":["Dubai Mall","Mall of Emirates","Namshi","Ounass","Farfetch ME","H&M","Zara"],"en":["Dubai Mall","Mall of Emirates","Namshi","Ounass","Farfetch ME","H&M","Zara"]}'::jsonb,
   'Mall culture is dominant — Dubai Mall is the world''s largest. Modest fashion has a strong market alongside Western styles. Namshi is the top regional online fashion player.',
   'Euromonitor UAE Fashion'),
  ('AE', 2024, 'health',
   '{"ko":["UAE Ministry of Health 인증","의사 처방","Boots·Aster 약국","아랍어 라벨","수입 보충제 신뢰"],"en":["UAE MoH certification","Doctor prescription","Boots / Aster pharmacies","Arabic labeling","Imported supplements trust"]}'::jsonb,
   '{"ko":["효능 의심","규제 다양성 (각 emirate)","가격"],"en":["Efficacy doubt","Regulatory variance per emirate","Price"]}'::jsonb,
   '{"ko":["Boots","Aster Pharmacy","Life Pharmacy","Noon","Amazon UAE","iHerb"],"en":["Boots","Aster Pharmacy","Life Pharmacy","Noon","Amazon UAE","iHerb"]}'::jsonb,
   'Pharmacy chains (Aster, Life, Boots) are the primary channel. iHerb is popular for imported supplements. UAE MoH certification gates legitimate sales.',
   'UAE MoH / Euromonitor'),
  ('AE', 2024, 'saas',
   '{"ko":["영어·아랍어 지원","두바이 대기업 도입 사례","Free Zone 결제 호환","Microsoft·AWS 파트너","현지 SI 파트너"],"en":["English + Arabic support","Dubai enterprise adoption","Free Zone billing compatibility","Microsoft / AWS partner","Local SI partner"]}'::jsonb,
   '{"ko":["VAT 5% 처리","현지 결제 게이트웨이","아랍어 미지원"],"en":["VAT 5% handling","Local payment gateway","Lack of Arabic support"]}'::jsonb,
   '{"ko":["AWS Marketplace","Microsoft Marketplace","SaaS 직접 영업","Etisalat·du B2B"],"en":["AWS Marketplace","Microsoft Marketplace","Direct SaaS sales","Etisalat / du B2B"]}'::jsonb,
   'UAE B2B is split between government/enterprise (procurement-heavy, prefers established brands) and Free Zone startups (cloud-native, English-speaking). Hub for MENA distribution.',
   'IDC MEA SaaS / Hays UAE')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
