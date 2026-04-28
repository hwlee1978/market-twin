-- BR (Brazil) reference data — Phase B seed.
-- Sources:
--   • IBGE — PNAD Continua 2023 (Pesquisa Nacional por Amostra de Domicílios)
--   • DIEESE — Salário e Mercado de Trabalho 2023
--   • Catho / Vagas.com salary surveys 2023
--   • Kantar Worldpanel Brazil 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('BR', 2024, 'Brazil', 'Brasil', 'BRL',
   215300000, 42000, 9700,
   'IBGE PNAD Continua 2023',
   'https://www.ibge.gov.br')
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
   'employed', '30-39', 36000::numeric, 48000::numeric, 65000::numeric,
   '연 R$36k-R$65k (~$7-13k USD)', 'R$36k-R$65k annually (~$7-13k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 36000, 60000, 95000,
   '연 R$36k-R$95k (~$7-19k USD)', 'R$36k-R$95k annually (~$7-19k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (상파울루·리우)","en":"Senior Software Engineer (SP / RJ)"}'::jsonb,
   'employed', '30-39', 130000, 200000, 320000,
   '연 R$130k-R$320k (~$26-65k USD, 외자계 더 높음)',
   'R$130k-R$320k annually (~$26-65k USD, foreign cos higher)'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 90000, 140000, 220000,
   '연 R$90k-R$220k (~$18-45k USD)', 'R$90k-R$220k annually (~$18-45k USD)'),
  ('nurse',
   '{"ko":"간호사 (Enfermeiro)","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 45000, 70000, 95000,
   '연 R$45k-R$95k (~$9-19k USD)', 'R$45k-R$95k annually (~$9-19k USD)'),
  ('doctor',
   '{"ko":"의사","en":"Physician"}'::jsonb,
   'employed', '40-49', 200000, 360000, 600000,
   '연 R$200k-R$600k (~$41-122k USD)', 'R$200k-R$600k annually (~$41-122k USD)'),
  ('production_worker',
   '{"ko":"생산직 근로자","en":"Production Worker"}'::jsonb,
   'employed', '30-39', 24000, 36000, 50000,
   '연 R$24k-R$50k (~$5-10k USD)', 'R$24k-R$50k annually (~$5-10k USD)'),
  ('domestic_worker',
   '{"ko":"가사도우미","en":"Domestic Worker"}'::jsonb,
   'employed', '40-49', 18000, 24000, 32000,
   '연 R$18k-R$32k (~$4-7k USD)', 'R$18k-R$32k annually (~$4-7k USD)'),
  ('small_business_owner',
   '{"ko":"자영업자 (Microempreendedor)","en":"Small Business Owner (MEI)"}'::jsonb,
   'self_employed', '40-49', 30000, 70000, 150000,
   '사업소득 연 R$30k-R$150k (변동 큼, ~$6-31k USD)',
   'Annual R$30k-R$150k (highly variable, ~$6-31k USD)'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 6000, 14000, 25000,
   '용돈+알바 연 R$6k-R$25k (~$1-5k USD), 부모 지원·Bolsa 별도',
   'Allowance + part-time R$6k-R$25k/yr (~$1-5k USD)'),
  ('homemaker',
   '{"ko":"전업주부 (Dona de Casa)","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 R$60k-R$120k, 본인 가처분 월 R$300-R$1,000',
   'No personal salary. Household R$60k-R$120k/yr; personal disposable R$300-R$1,000/month'),
  ('retiree',
   '{"ko":"은퇴자","en":"Retiree (Aposentado)"}'::jsonb,
   'retiree', '60+', 18000, 28000, 48000,
   'INSS 연 R$18k-R$48k (~$4-10k USD)',
   'INSS pension R$18k-R$48k/yr (~$4-10k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 12000, 22000, 36000,
   '연 R$12k-R$36k (~$2-7k USD)', 'R$12k-R$36k annually (~$2-7k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'BR', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'BRL',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       'IBGE PNAD Continua 2023 / Catho Salary Survey'
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
  ('BR', 2024, 'food',
   '{"ko":["ANVISA 식품 등록","Reclame Aqui 평가","대형마트 PB (Pão de Açúcar, Carrefour)","Instagram 인플루언서","Globo TV 광고"],"en":["ANVISA food registration","Reclame Aqui rating","Major retailer PB (Pão de Açúcar, Carrefour)","Instagram influencer","Globo TV ads"]}'::jsonb,
   '{"ko":["가격 부담 (인플레이션)","수입품 비쌈","유통기한","WhatsApp으로 가격 비교"],"en":["Price (inflation)","Imported markup","Expiry","WhatsApp price comparison"]}'::jsonb,
   '{"ko":["Mercado Livre","Amazon BR","Carrefour","Pão de Açúcar","iFood","Rappi","Atacadão"],"en":["Mercado Livre","Amazon BR","Carrefour","Pão de Açúcar","iFood","Rappi","Atacadão"]}'::jsonb,
   'Mercado Livre is the dominant marketplace. iFood / Rappi drive food delivery. Reclame Aqui is the consumer trust gatekeeper. WhatsApp groups share deals heavily.',
   'Kantar Worldpanel BR 2023'),
  ('BR', 2024, 'beauty',
   '{"ko":["Natura·Boticário 토종 브랜드","ANVISA 등록","피부과 추천","Sephora·Sephoras","유튜버 리뷰"],"en":["Natura / Boticário local","ANVISA registration","Dermatologist","Sephora","YouTuber reviews"]}'::jsonb,
   '{"ko":["피부 트러블","수입 브랜드 가격","위조품 우려"],"en":["Skin reaction","Imported brand price","Counterfeit concerns"]}'::jsonb,
   '{"ko":["Natura","Boticário","Sephora","Beleza na Web","Mercado Livre","Amazon BR"],"en":["Natura","Boticário","Sephora","Beleza na Web","Mercado Livre","Amazon BR"]}'::jsonb,
   'Natura and Boticário are iconic local beauty brands with strong direct-sales networks. Sephora has expanded but local brands hold ground. K-beauty growing via Beleza na Web.',
   'Euromonitor BR Beauty'),
  ('BR', 2024, 'electronics',
   '{"ko":["Magazine Luiza·Casas Bahia 신뢰","Mercado Livre 평점","INMETRO 인증","Reclame Aqui","12·24개월 분할 결제"],"en":["Magazine Luiza / Casas Bahia","Mercado Livre rating","INMETRO certification","Reclame Aqui","12-24 month installments"]}'::jsonb,
   '{"ko":["수입품 관세","위조품","분할 결제 이자","수리 비용"],"en":["Import tariffs","Counterfeit","Installment interest","Repair cost"]}'::jsonb,
   '{"ko":["Mercado Livre","Magazine Luiza","Casas Bahia","Amazon BR","Submarino"],"en":["Mercado Livre","Magazine Luiza","Casas Bahia","Amazon BR","Submarino"]}'::jsonb,
   'Massive import tariffs make foreign electronics very expensive. Installment payments (12-24x sem juros) are universal — purchases are mentally divided into monthly payments.',
   'IBGE / Reclame Aqui'),
  ('BR', 2024, 'fashion',
   '{"ko":["Renner·C&A 신뢰","Mercado Livre 패션","Instagram 인플루언서","SPC·Serasa 결제 신용","feiras (전통시장)"],"en":["Renner / C&A","Mercado Livre Fashion","Instagram influencer","SPC / Serasa credit","feiras (traditional markets)"]}'::jsonb,
   '{"ko":["사이즈 표준","수입 럭셔리 부담","위조품"],"en":["Size standards","Imported luxury markup","Counterfeit"]}'::jsonb,
   '{"ko":["Renner","C&A","Riachuelo","Mercado Livre","Amazon BR","Shein","feiras"],"en":["Renner","C&A","Riachuelo","Mercado Livre","Amazon BR","Shein","feiras"]}'::jsonb,
   'Renner / C&A / Riachuelo are dominant department stores. Shein has exploded among Gen Z. Traditional feiras still drive low-cost fashion in many regions.',
   'Euromonitor BR Fashion'),
  ('BR', 2024, 'health',
   '{"ko":["ANVISA 등록","약사 상담","Drogasil·Pacheco 약국","의사 처방 (SUS·plano de saúde)","INMETRO"],"en":["ANVISA registration","Pharmacist consult","Drogasil / Pacheco pharmacy","Doctor prescription (SUS / private)","INMETRO"]}'::jsonb,
   '{"ko":["효능 의심","SUS vs plano de saúde","약가 부담","위조품"],"en":["Efficacy doubt","SUS vs private","Drug price","Counterfeit"]}'::jsonb,
   '{"ko":["Drogasil","Drogaria São Paulo","Pacheco","Mercado Livre","Amazon BR","Pague Menos"],"en":["Drogasil","Drogaria São Paulo","Pacheco","Mercado Livre","Amazon BR","Pague Menos"]}'::jsonb,
   'Pharmacy chains (Drogasil, São Paulo) dominate. SUS (public health) covers basics; private plano de saúde for more. Generic drugs are widely accepted thanks to ANVISA.',
   'ANVISA / Euromonitor BR'),
  ('BR', 2024, 'saas',
   '{"ko":["포르투갈어 지원 필수","Reclame Aqui 평가","대기업 도입 (Petrobras·Vale)","Pix 결제","Nota Fiscal 발행"],"en":["Portuguese support (mandatory)","Reclame Aqui rating","Enterprise references (Petrobras, Vale)","Pix payment","Nota Fiscal invoicing"]}'::jsonb,
   '{"ko":["포르투갈어 미지원","USD 결제 부담","Nota Fiscal 발행 미지원","현지 SI 부족"],"en":["No Portuguese support","USD pricing","No Nota Fiscal","Limited local SI"]}'::jsonb,
   '{"ko":["AWS Marketplace","Globant·Stefanini SI","SaaS 직접 영업","Mercado Livre B2B"],"en":["AWS Marketplace","Globant / Stefanini SI","Direct SaaS sales","Mercado Livre B2B"]}'::jsonb,
   'Brazilian B2B requires Portuguese-language support and Nota Fiscal compliance. Pix has revolutionized payments. Major SI partners (Stefanini, TOTVS) gate enterprise.',
   'IDC LATAM / Reclame Aqui')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
