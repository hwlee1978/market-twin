-- GB (United Kingdom) reference data — Phase B seed.
-- Sources:
--   • ONS — ASHE (Annual Survey of Hours and Earnings) 2023
--   • ONS — Family Resources Survey 2022/23
--   • Hays / Robert Half UK Salary Guide 2023
--   • Mintel / Kantar UK consumer 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('GB', 2024, 'United Kingdom', 'United Kingdom', 'GBP',
   67700000, 35000, 49500,
   'ONS ASHE 2023 / Family Resources Survey 2022/23',
   'https://www.ons.gov.uk')
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
   '{"ko":"초등학교 교사","en":"Primary School Teacher"}'::jsonb,
   'employed', '30-39', 32000::numeric, 38000::numeric, 48000::numeric,
   '연 £32k-£48k (~$40-60k USD)', '£32k-£48k annually (~$40-60k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 30000, 42000, 60000,
   '연 £30k-£60k (~$38-75k USD)', '£30k-£60k annually (~$38-75k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (London)","en":"Senior Software Engineer (London)"}'::jsonb,
   'employed', '30-39', 70000, 95000, 130000,
   '연 £70k-£130k (~$87-163k USD, London 기준)',
   '£70k-£130k annually (~$87-163k USD, London-based)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 50000, 65000, 90000,
   '연 £50k-£90k (~$63-113k USD)', '£50k-£90k annually (~$63-113k USD)'),
  ('nurse',
   '{"ko":"간호사 (NHS)","en":"NHS Nurse"}'::jsonb,
   'employed', '30-39', 30000, 38000, 48000,
   '연 £30k-£48k (~$38-60k USD), NHS Band 5-7',
   '£30k-£48k annually (~$38-60k USD), NHS Band 5-7'),
  ('doctor',
   '{"ko":"의사 (NHS GP)","en":"NHS General Practitioner"}'::jsonb,
   'employed', '40-49', 75000, 110000, 150000,
   '연 £75k-£150k (~$94-188k USD)', '£75k-£150k annually (~$94-188k USD)'),
  ('barista',
   '{"ko":"바리스타","en":"Barista"}'::jsonb,
   'employed', '20-29', 22000, 26000, 30000,
   '연 £22k-£30k (~$28-38k USD), National Living Wage 기준',
   '£22k-£30k annually (~$28-38k USD), at or near National Living Wage'),
  ('tradesperson',
   '{"ko":"숙련 기능공 (전기·배관 등)","en":"Tradesperson (Electrician / Plumber)"}'::jsonb,
   'employed', '30-39', 38000, 50000, 70000,
   '연 £38k-£70k (~$48-88k USD)', '£38k-£70k annually (~$48-88k USD)'),
  ('self_employed',
   '{"ko":"자영업자","en":"Self-employed"}'::jsonb,
   'self_employed', '40-49', 25000, 50000, 100000,
   '사업소득 연 £25k-£100k (변동 큼, ~$31-125k USD)',
   'Annual £25k-£100k (highly variable, ~$31-125k USD)'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 5000, 12000, 22000,
   '파트타임 연 £5k-£22k (~$6-28k USD), 학자금 별도',
   'Part-time £5k-£22k/yr (~$6-28k USD), Student Finance separate'),
  ('homemaker',
   '{"ko":"전업주부","en":"Homemaker / Stay-at-home Parent"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 £55k-£90k, 본인 가처분 월 £200-£600',
   'No personal salary. Household £55k-£90k/yr; personal disposable £200-£600/month'),
  ('retiree',
   '{"ko":"은퇴자","en":"Retiree"}'::jsonb,
   'retiree', '60+', 14000, 22000, 38000,
   'State Pension + Workplace Pension 연 £14k-£38k (~$18-48k USD)',
   'State + Workplace Pension £14k-£38k/yr (~$18-48k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 14000, 22000, 32000,
   '연 £14k-£32k (~$18-40k USD)', '£14k-£32k annually (~$18-40k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'GB', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'GBP',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'ONS ASHE 2023 / Hays UK Salary Guide'
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
  ('GB', 2024, 'food',
   '{"ko":["Red Tractor 인증","Soil Association 유기농","Which? 평가","Tesco·Sainsbury''s·M&S PB","Mumsnet 추천"],"en":["Red Tractor certification","Soil Association organic","Which? reviews","Tesco / Sainsbury''s / M&S PB","Mumsnet recommendation"]}'::jsonb,
   '{"ko":["가격 부담 (Cost-of-living crisis)","Brexit 후 수입 가격 상승","유통기한 (Best before vs Use by)"],"en":["Price (Cost-of-living crisis)","Post-Brexit imported price rise","Date labels (Best before vs Use by)"]}'::jsonb,
   '{"ko":["Tesco","Sainsbury''s","Asda","Lidl·Aldi","M&S","Waitrose","Amazon UK","Ocado","Just Eat·Deliveroo"],"en":["Tesco","Sainsbury''s","Asda","Lidl / Aldi","M&S","Waitrose","Amazon UK","Ocado","Just Eat / Deliveroo"]}'::jsonb,
   'Big 4 (Tesco, Sainsbury''s, Asda, Morrisons) plus discounters (Lidl, Aldi) dominate. M&S and Waitrose hold premium. Mumsnet word-of-mouth has outsized influence. Ocado is the dominant pure-online grocer.',
   'Mintel UK Food 2023'),
  ('GB', 2024, 'beauty',
   '{"ko":["Boots·Superdrug 진열","Trustpilot 평가","Beauty editor (Sali Hughes 등) 추천","Cruelty Free 인증","NHS·Pharmacist 추천"],"en":["Boots / Superdrug placement","Trustpilot reviews","Beauty editor recommendation (Sali Hughes etc)","Cruelty Free cert","NHS / Pharmacist recommendation"]}'::jsonb,
   '{"ko":["피부 트러블","고가 부담","Brexit 후 EU 브랜드 가격 상승"],"en":["Skin reaction","Premium price","Post-Brexit EU brand price rise"]}'::jsonb,
   '{"ko":["Boots","Superdrug","Look Fantastic","Cult Beauty","Sephora UK","Amazon UK","Space NK"],"en":["Boots","Superdrug","Look Fantastic","Cult Beauty","Sephora UK","Amazon UK","Space NK"]}'::jsonb,
   'Boots and Superdrug dominate mass beauty. Look Fantastic and Cult Beauty drive online prestige. K-beauty has strong following via Cult Beauty. Sali Hughes (Guardian) is a major beauty journalist voice.',
   'Mintel UK Beauty 2023'),
  ('GB', 2024, 'electronics',
   '{"ko":["Currys 매장 체험","Argos 픽업","Trustpilot 평가","Which? 평가","2년 의무 보증 (Consumer Rights Act)"],"en":["Currys in-store","Argos click-and-collect","Trustpilot","Which?","Statutory 2-year warranty (Consumer Rights Act)"]}'::jsonb,
   '{"ko":["Brexit 후 수입 가격","수리 가능성 (Right-to-Repair)","개인정보 우려"],"en":["Post-Brexit import price","Right-to-Repair","Privacy concerns"]}'::jsonb,
   '{"ko":["Amazon UK","Currys","John Lewis","Argos","Apple Store","eBay UK","AO.com"],"en":["Amazon UK","Currys","John Lewis","Argos","Apple Store","eBay UK","AO.com"]}'::jsonb,
   'Currys is the dominant electronics retailer. John Lewis has strong customer-service trust. Statutory 2-year warranty under Consumer Rights Act is mainstream. AO.com is rising in white goods.',
   'GfK UK / Which?'),
  ('GB', 2024, 'fashion',
   '{"ko":["ASOS·Boohoo","M&S·John Lewis","Vinted (중고)","Sustainability 인증","Influencer (TikTok·Instagram)"],"en":["ASOS / Boohoo","M&S / John Lewis","Vinted (resale)","Sustainability cert","Influencer (TikTok / Instagram)"]}'::jsonb,
   '{"ko":["사이즈 표준","Fast fashion 윤리 (Boohoo 사례)","반품 비용"],"en":["Size standards","Fast fashion ethics (Boohoo issues)","Return cost"]}'::jsonb,
   '{"ko":["ASOS","Amazon UK","Next","M&S","John Lewis","Zara","Vinted","Depop"],"en":["ASOS","Amazon UK","Next","M&S","John Lewis","Zara","Vinted","Depop"]}'::jsonb,
   'ASOS and Boohoo dominate online fashion (with reputational headwinds for Boohoo). Vinted and Depop are mainstream resale. M&S has reinvented for younger shoppers. Sustainability scrutiny is high.',
   'Mintel UK Fashion'),
  ('GB', 2024, 'health',
   '{"ko":["MHRA 승인","NHS 처방","약사 (Pharmacist) 상담","Boots·Superdrug","Which? 평가"],"en":["MHRA approval","NHS prescription","Pharmacist consult","Boots / Superdrug","Which? reviews"]}'::jsonb,
   '{"ko":["효능 의심","NHS vs private 비용","수입 보충제 진위"],"en":["Efficacy doubt","NHS vs private cost","Imported supplement authenticity"]}'::jsonb,
   '{"ko":["Boots","Superdrug","Holland & Barrett","LloydsPharmacy","Amazon UK"],"en":["Boots","Superdrug","Holland & Barrett","LloydsPharmacy","Amazon UK"]}'::jsonb,
   'NHS prescriptions dominate. Holland & Barrett is the natural-health specialist. Boots provides mainstream pharmacy. MHRA approval is mandatory. UK has growing OTC market.',
   'MHRA / Mintel UK Health'),
  ('GB', 2024, 'saas',
   '{"ko":["G2 평가","UK GDPR 준수","대기업 reference","무료 체험","London 헤드쿼터"],"en":["G2 reviews","UK GDPR compliance","Enterprise reference","Free trial","London headquarters"]}'::jsonb,
   '{"ko":["UK GDPR (Brexit 후)","SOC 2","Vendor lock-in","파운드/달러 환율"],"en":["UK GDPR (post-Brexit)","SOC 2","Vendor lock-in","GBP/USD FX"]}'::jsonb,
   '{"ko":["AWS Marketplace","Microsoft Marketplace","SaaS 직접 영업","Capgemini·Accenture SI"],"en":["AWS Marketplace","Microsoft Marketplace","Direct SaaS sales","Capgemini / Accenture SI"]}'::jsonb,
   'UK SMB favours self-serve free trials. Enterprise prefers established US brands with London presence. UK GDPR (post-Brexit) adds compliance complexity vs EU GDPR.',
   'Gartner UK SaaS / Hays')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
