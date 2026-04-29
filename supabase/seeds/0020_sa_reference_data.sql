-- SA (Saudi Arabia) reference data — Phase B+ seed.
-- Sources:
--   • GASTAT (General Authority for Statistics) — Household Income & Expenditure Survey 2018 + 2023 update
--   • Ministry of Human Resources & Social Development — Wage data 2023
--   • Hays Saudi Arabia / Robert Half GCC Salary Guide 2023-2024
--   • Nielsen Saudi / Kantar GCC consumer 2023
--
-- Note: SA's population is ~36% expat. Income bands below reflect the *Saudi national*
-- typical ranges. Expat wages for the same role are often substantially lower (especially
-- in service jobs) — the LLM persona prompt should treat nationality as a heavy modifier.

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('SA', 2024, 'Saudi Arabia', 'المملكة العربية السعودية', 'SAR',
   36400000, 156000, 32000,
   'GASTAT Household Income & Expenditure Survey 2023',
   'https://www.stats.gov.sa')
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
   '{"ko":"초등학교 교사 (公立 / 사우디 국적)","en":"Primary School Teacher (Public, Saudi national)"}'::jsonb,
   'employed', '30-39', 110000::numeric, 150000::numeric, 200000::numeric,
   '연 SAR 110k-SAR 200k (~$29-53k USD)', 'SAR 110k-200k annually (~$29-53k USD)'),
  ('office_worker_saudi',
   '{"ko":"사무직 (사우디 국적)","en":"Office Worker (Saudi national)"}'::jsonb,
   'employed', '30-39', 96000, 150000, 240000,
   '연 SAR 96k-SAR 240k (~$26-64k USD)', 'SAR 96k-240k annually (~$26-64k USD)'),
  ('office_worker_expat',
   '{"ko":"사무직 (외국인 거주자)","en":"Office Worker (Expat)"}'::jsonb,
   'employed', '30-39', 60000, 96000, 180000,
   '연 SAR 60k-SAR 180k (~$16-48k USD)', 'SAR 60k-180k annually (~$16-48k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (Aramco·STC·NEOM)","en":"Senior Software Engineer (Aramco / STC / NEOM)"}'::jsonb,
   'employed', '30-39', 240000, 360000, 540000,
   '연 SAR 240k-SAR 540k (~$64-144k USD, 주거 보조 별도)',
   'SAR 240k-540k annually (~$64-144k USD, housing allowance separate)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 200000, 300000, 480000,
   '연 SAR 200k-SAR 480k (~$53-128k USD)',
   'SAR 200k-480k annually (~$53-128k USD)'),
  ('nurse_expat',
   '{"ko":"간호사 (필리핀·인도 출신 외국인)","en":"Registered Nurse (Filipino / Indian expat)"}'::jsonb,
   'employed', '30-39', 60000, 90000, 144000,
   '연 SAR 60k-SAR 144k (~$16-38k USD), 숙소·항공권 제공',
   'SAR 60k-144k annually (~$16-38k USD), housing and flights provided'),
  ('doctor',
   '{"ko":"의사","en":"Physician"}'::jsonb,
   'employed', '40-49', 360000, 720000, 1500000,
   '연 SAR 360k-SAR 1.5M (~$96-400k USD)',
   'SAR 360k-1.5M annually (~$96-400k USD)'),
  ('petroleum_engineer',
   '{"ko":"석유 엔지니어 (Aramco·SABIC)","en":"Petroleum Engineer (Aramco / SABIC)"}'::jsonb,
   'employed', '30-39', 360000, 540000, 900000,
   '연 SAR 360k-SAR 900k (~$96-240k USD, 보너스·복리 별도)',
   'SAR 360k-900k annually (~$96-240k USD, bonus + benefits separate)'),
  ('shop_owner',
   '{"ko":"자영업 (소매·F&B, 사우디 국적)","en":"Shop / F&B Owner (Saudi national)"}'::jsonb,
   'self_employed', '40-49', 120000, 240000, 480000,
   '사업소득 연 SAR 120k-SAR 480k (변동 큼, ~$32-128k USD)',
   'Annual SAR 120k-480k (highly variable, ~$32-128k USD)'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 18000, 36000, 60000,
   '용돈+장학금 연 SAR 18k-SAR 60k (~$5-16k USD), 부모 지원 별도',
   'Allowance + scholarship SAR 18k-60k/yr (~$5-16k USD)'),
  ('homemaker',
   '{"ko":"전업주부 (سيدة منزل, 가구 가처분 소득 큼)","en":"Homemaker (Saudi household)"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 SAR 200k-SAR 500k, 본인 가처분 월 SAR 3,000-SAR 10,000',
   'No personal salary. Household SAR 200-500k/yr; personal disposable SAR 3,000-10,000/month'),
  ('retiree',
   '{"ko":"은퇴자 (GOSI·PPA 연금)","en":"Retiree (GOSI / PPA pension)"}'::jsonb,
   'retiree', '60+', 60000, 108000, 180000,
   'GOSI·PPA 연금 연 SAR 60k-SAR 180k (~$16-48k USD)',
   'GOSI / PPA pension SAR 60k-180k/yr (~$16-48k USD)'),
  ('domestic_helper',
   '{"ko":"가사도우미 (필리핀·방글라데시 출신 외국인)","en":"Domestic Helper (Filipino / Bangladeshi expat)"}'::jsonb,
   'employed', '30-39', 14400, 18000, 24000,
   '연 SAR 14.4k-SAR 24k (~$3.8-6.4k USD), 숙소·식사·항공권 제공',
   'SAR 14.4k-24k annually (~$3.8-6.4k USD), housing / meals / flights provided')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'SA', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'SAR',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'GASTAT 2023 / Hays Saudi Salary Guide 2023-2024'
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
  ('SA', 2024, 'food',
   '{"ko":["SFDA (식약청) 인증","Halal 인증 (필수)","Almarai·Almunajem·Saudia Dairy 로컬 브랜드","Lulu·Panda·Carrefour 신뢰","Snapchat·인스타 인플루언서"],"en":["SFDA (Food & Drug Authority) certification","Halal certification (mandatory)","Local brands (Almarai, Almunajem, Saudia Dairy)","Lulu / Panda / Carrefour trust","Snapchat / Instagram influencer"]}'::jsonb,
   '{"ko":["Halal 명확성 (필수)","수입 가격","유통기한","Ramadan·이드 시기 수요 폭발","현지화 부족"],"en":["Halal clarity (mandatory)","Imported price","Expiry","Ramadan / Eid demand spikes","Lack of localization"]}'::jsonb,
   '{"ko":["Lulu Hypermarket","Panda","Carrefour","Tamimi Markets","Danube","HungerStation","Jahez","Talabat","ToYou","NoonFood"],"en":["Lulu Hypermarket","Panda","Carrefour","Tamimi Markets","Danube","HungerStation","Jahez","Talabat","ToYou","NoonFood"]}'::jsonb,
   'Saudi Arabia is fully Halal-mandated; SFDA approval is non-negotiable. Almarai is the dominant local dairy brand (Gulf-wide). Ramadan and Eid drive massive seasonal demand swings (food spending +40-60%). Snapchat is uniquely dominant for food / restaurant discovery in SA (vs Instagram in most other markets). HungerStation and Jahez are top food delivery apps.',
   'Nielsen Saudi / Kantar Worldpanel KSA'),
  ('SA', 2024, 'beauty',
   '{"ko":["SFDA 화장품 등록 (필수)","Halal 화장품 인증 (선호)","Sephora ME·Faces·Boots ME","로컬 브랜드 (Aresa·Hindash)","Snapchat·TikTok 뷰티 크리에이터"],"en":["SFDA cosmetics registration (mandatory)","Halal cosmetics cert (preferred)","Sephora ME / Faces / Boots ME","Local brands (Aresa, Hindash)","Snapchat / TikTok beauty creators"]}'::jsonb,
   '{"ko":["Halal·알코올 함유 여부","고가 부담","Ramadan 메이크업 수요","열사·건조 기후 영향","사이즈 / 톤 부족"],"en":["Halal / alcohol-free formulation","Premium price","Ramadan makeup demand","Hot / arid climate","Limited shade range"]}'::jsonb,
   '{"ko":["Sephora ME","Faces","Boots ME","Nice One","Noon","Amazon SA","Mall of Arabia (Riyadh)","Kingdom Centre"],"en":["Sephora ME","Faces","Boots ME","Nice One","Noon","Amazon SA","Mall of Arabia (Riyadh)","Kingdom Centre"]}'::jsonb,
   'Saudi beauty market is among the largest per-capita globally (women shopping despite traditional segregation rules eased post-2018). Halal cosmetics (alcohol-free) is a strong differentiator. Local creator economy on Snapchat / TikTok drives discovery. Faces is the leading regional beauty retailer. Major malls (Mall of Arabia, Kingdom Centre, Riyadh Park) anchor offline.',
   'Euromonitor KSA Beauty / Snapchat KSA insights'),
  ('SA', 2024, 'electronics',
   '{"ko":["eXtra·Jarir Bookstore (전자제품)","Amazon SA·Noon","SASO 인증 (필수)","Apple Premium Reseller","Snapchat·Twitter 리뷰"],"en":["eXtra / Jarir Bookstore (electronics)","Amazon SA / Noon","SASO certification (mandatory)","Apple Premium Reseller","Snapchat / Twitter reviews"]}'::jsonb,
   '{"ko":["수입 가격","SASO 인증 미통과 위험 (그레이 마켓)","SAR 환율","지역 보증","아랍어 UI"],"en":["Imported price","Non-SASO compliant gray market risk","SAR exchange rate","Regional warranty","Arabic UI"]}'::jsonb,
   '{"ko":["Amazon SA","Noon","eXtra","Jarir","Lulu Electronics","Apple Online SA","Mobile.sa","SaudiSouq"],"en":["Amazon SA","Noon","eXtra","Jarir","Lulu Electronics","Apple Online SA","Mobile.sa","SaudiSouq"]}'::jsonb,
   'eXtra is the dominant electronics retail chain. Jarir Bookstore counterintuitively is huge for laptops / tablets / printers. SASO certification is mandatory — non-compliant items get blocked at customs. Amazon SA and Noon dominate online. Apple has high prestige; Samsung is mass-market leader for smartphones. Twitter (X) is highly active for tech complaints / customer service.',
   'IDC Saudi Arabia / GfK GCC'),
  ('SA', 2024, 'fashion',
   '{"ko":["Modest fashion (Abaya·Hijab) 핵심","Centrepoint·Namshi·Ounass","로컬 브랜드 (Lomar·Roan·Mauzan abayas)","Snapchat·TikTok 인플루언서","Vision 2030 여성 의류 다양화"],"en":["Modest fashion (Abaya / Hijab) core","Centrepoint / Namshi / Ounass","Local brands (Lomar, Roan, Mauzan abayas)","Snapchat / TikTok influencer","Vision 2030 women apparel diversification"]}'::jsonb,
   '{"ko":["Modest fashion 적합성","사이즈 (걸프 핏)","수입 럭셔리 부담","건조·고온 기후 소재","상의 길이 / 노출 정도"],"en":["Modest fashion fit","Gulf sizing","Imported luxury markup","Arid / hot climate fabric","Top length / coverage"]}'::jsonb,
   '{"ko":["Namshi","Ounass","Centrepoint","6thStreet","Faces","SHEIN","ZARA SA","Riyadh Park","Mall of Arabia"],"en":["Namshi","Ounass","Centrepoint","6thStreet","Faces","SHEIN","ZARA SA","Riyadh Park","Mall of Arabia"]}'::jsonb,
   'Modest fashion is the dominant frame — abaya is everyday wear for Saudi women, evolving from black-only to colorful / designer abayas post-2017 Vision 2030 reforms. Lomar, Roan, and Mauzan lead premium abaya. Namshi (online) and Centrepoint (mall) anchor mass. Ounass is the regional luxury platform. Major weddings drive significant occasion-wear spending.',
   'Euromonitor KSA Apparel / Vision 2030 fashion industry reports'),
  ('SA', 2024, 'health',
   '{"ko":["SFDA 의약품·보충제 등록 (필수)","Nahdi·Tamimi·Al-Dawaa 약국 (Big-3)","의사 처방·MoH (보건부)","Halal 보충제","iHerb (외국인 거주자 인기)"],"en":["SFDA drug / supplement registration (mandatory)","Nahdi / Tamimi / Al-Dawaa pharmacies (big-3)","Doctor prescription / Ministry of Health","Halal supplements","iHerb (popular with expats)"]}'::jsonb,
   '{"ko":["Halal·알코올 미함유","효능 의심","고가 보충제","SFDA 미등록 위험","비만·당뇨 만성"],"en":["Halal / alcohol-free","Efficacy doubt","Premium supplement cost","Non-SFDA registered risk","Obesity / diabetes chronic burden"]}'::jsonb,
   '{"ko":["Nahdi Pharmacy","Tamimi Pharmacy","Al-Dawaa","Whites Pharmacy","Noon","Amazon SA","iHerb"],"en":["Nahdi Pharmacy","Tamimi Pharmacy","Al-Dawaa","Whites Pharmacy","Noon","Amazon SA","iHerb"]}'::jsonb,
   'Nahdi (~1,200 stores), Al-Dawaa (~700), and Tamimi anchor retail pharmacy. SFDA approval is mandatory and rigorously enforced — non-compliant supplements get blocked. Saudi Arabia has high obesity (30%) and diabetes (~20% adult) rates, driving weight-management and diabetic-friendly product demand. iHerb is the go-to for expats wanting US/EU supplements.',
   'SFDA / Euromonitor KSA Health'),
  ('SA', 2024, 'saas',
   '{"ko":["NCA (사이버보안청) 인증","CITC (통신정보기술위) 라이센스","Vision 2030 디지털 트랜스포메이션","대기업 (Aramco·SABIC·STC·SNB) reference","PDPL (개인정보법) 준수","아랍어 RTL UI"],"en":["NCA (Cybersecurity Authority) certification","CITC (Communications & IT Commission) license","Vision 2030 digital transformation","Enterprise reference (Aramco / SABIC / STC / SNB)","PDPL (Personal Data Protection Law) compliance","Arabic RTL UI"]}'::jsonb,
   '{"ko":["PDPL 컴플라이언스","외화 결제","현지 데이터 거주성 (필수)","아랍어 RTL 미지원","Vendor lock-in"],"en":["PDPL compliance","Foreign currency","Local data residency (mandatory)","No Arabic RTL support","Vendor lock-in"]}'::jsonb,
   '{"ko":["AWS Marketplace (KSA region)","Microsoft Marketplace (Riyadh region)","STC Cloud B2B","NEOM Tech 파트너","SaaS 직접 영업"],"en":["AWS Marketplace (KSA region)","Microsoft Marketplace (Riyadh region)","STC Cloud B2B","NEOM Tech partners","Direct SaaS sales"]}'::jsonb,
   'Saudi Arabia is the largest GCC SaaS market via Vision 2030 digital push. PDPL (effective 2023) requires data residency for sensitive data — AWS / Microsoft both opened Saudi regions. NCA cybersecurity controls are mandatory for gov + critical infra. Aramco / SABIC / SNB enterprise references are decisive. Arabic RTL (right-to-left) UI support is increasingly required for SMB. NEOM tech ecosystem is emerging.',
   'Gartner GCC / IDC Saudi Arabia / Vision 2030 NDS')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
