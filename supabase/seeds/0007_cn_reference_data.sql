-- CN (China) reference data — Phase B seed.
-- Note: large variance between Tier-1 cities (北京/上海/深圳/广州) and lower tiers.
-- These figures center on Tier-1/2 urban professionals.
--
-- Sources:
--   • 国家统计局 (NBS) — 城镇单位就业人员平均工资 2023
--   • 智联招聘 / 拉勾 / BOSS直聘 薪酬报告 2023
--   • CTR / Nielsen China consumer research 2023

insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('CN', 2024, 'China', '中国', 'CNY',
   1410000000, 110000, 12700,
   '国家统计局 城镇单位就业人员平均工资 2023',
   'https://www.stats.gov.cn')
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
   '{"ko":"초등학교 교사 (Tier-1 도시)","en":"Elementary School Teacher (Tier-1 City)"}'::jsonb,
   'employed', '30-39', 80000::numeric, 120000::numeric, 180000::numeric,
   '연 ¥80k-¥180k 元 (~$11-25k USD)', '¥80k-¥180k CNY annually (~$11-25k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원 (白领, Tier-1 도시)","en":"Office Worker (White-collar, Tier-1)"}'::jsonb,
   'employed', '30-39', 100000, 180000, 280000,
   '연 ¥100k-¥280k 元 (~$14-39k USD)', '¥100k-¥280k CNY annually (~$14-39k USD)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어 (北京·上海 빅테크)","en":"Senior Software Engineer (Big Tech BJ/SH)"}'::jsonb,
   'employed', '30-39', 350000, 550000, 900000,
   '연 ¥350k-¥900k 元 (~$48-124k USD), 빅테크 RSU 별도',
   '¥350k-¥900k CNY annually (~$48-124k USD), Big Tech RSU separate'),
  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 200000, 320000, 480000,
   '연 ¥200k-¥480k 元 (~$28-66k USD)', '¥200k-¥480k CNY annually (~$28-66k USD)'),
  ('nurse',
   '{"ko":"간호사 (护士)","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 80000, 120000, 180000,
   '연 ¥80k-¥180k 元 (~$11-25k USD)', '¥80k-¥180k CNY annually (~$11-25k USD)'),
  ('doctor',
   '{"ko":"의사 (大型公立医院)","en":"Physician (Major Public Hospital)"}'::jsonb,
   'employed', '40-49', 200000, 350000, 600000,
   '연 ¥200k-¥600k 元 (~$28-83k USD)', '¥200k-¥600k CNY annually (~$28-83k USD)'),
  ('factory_worker',
   '{"ko":"공장 노동자","en":"Factory Worker"}'::jsonb,
   'employed', '30-39', 50000, 75000, 100000,
   '연 ¥50k-¥100k 元 (~$7-14k USD)', '¥50k-¥100k CNY annually (~$7-14k USD)'),
  ('delivery_rider',
   '{"ko":"배달 라이더 (外卖小哥)","en":"Delivery Rider"}'::jsonb,
   'employed', '20-29', 60000, 90000, 130000,
   '연 ¥60k-¥130k 元 (~$8-18k USD), 변동 큼',
   '¥60k-¥130k CNY annually (~$8-18k USD), highly variable'),
  ('small_business_owner',
   '{"ko":"자영업자 (个体户)","en":"Small Business Owner"}'::jsonb,
   'self_employed', '40-49', 80000, 200000, 500000,
   '사업소득 연 ¥80k-¥500k 元 (변동 큼, ~$11-69k USD)',
   'Annual ¥80k-¥500k CNY (highly variable, ~$11-69k USD)'),
  ('university_student',
   '{"ko":"대학생","en":"University Student"}'::jsonb,
   'student', '20-29', 6000, 18000, 36000,
   '용돈+알바 연 ¥6k-¥36k 元 (~$0.8-5k USD), 부모 지원 별도',
   'Allowance + part-time ¥6k-¥36k/yr (~$0.8-5k USD)'),
  ('homemaker',
   '{"ko":"전업주부 (全职太太)","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 ¥250k-¥600k 元, 본인 가처분 월 ¥3k-¥10k',
   'No personal salary. Household ¥250k-¥600k CNY/yr; personal disposable ¥3k-¥10k/month'),
  ('retiree',
   '{"ko":"은퇴자 (退休)","en":"Retiree"}'::jsonb,
   'retiree', '60+', 36000, 60000, 100000,
   '국가연금 (城镇职工养老保险) 연 ¥36k-¥100k 元 (~$5-14k USD)',
   'Urban pension ¥36k-¥100k CNY/yr (~$5-14k USD)'),
  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 24000, 48000, 80000,
   '연 ¥24k-¥80k 元 (~$3-11k USD)', '¥24k-¥80k CNY annually (~$3-11k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'CN', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'CNY',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       '国家统计局 / 智联招聘 薪酬报告 2023'
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
  ('CN', 2024, 'food',
   '{"ko":["小红书·抖音 KOL 추천","대형 e커머스 Tmall·京东 평점","ISO·HACCP 인증","원산지 표기","오프라인 hema·盒马 신뢰"],"en":["Xiaohongshu / Douyin KOL endorsement","Tmall / JD ratings","ISO / HACCP certification","Country-of-origin label","Offline Hema / Freshippo trust"]}'::jsonb,
   '{"ko":["식품 안전 우려 (역사적)","위조품·산자이","수입품 관세","WeChat 가짜 정보"],"en":["Food safety concerns (historical)","Counterfeits / shanzhai","Import tariffs","WeChat misinfo"]}'::jsonb,
   '{"ko":["天猫 (Tmall)","京东 (JD.com)","拼多多 (Pinduoduo)","抖音商城 (Douyin Shop)","小红书 (Xiaohongshu)","盒马 (Hema)","美团 (Meituan)"],"en":["Tmall","JD.com","Pinduoduo","Douyin Shop","Xiaohongshu","Hema","Meituan"]}'::jsonb,
   'Chinese consumers research heavily on Xiaohongshu before buying. Live-streaming commerce (Douyin / Taobao Live) drives huge sales. Hema (Alibaba''s Freshippo) is the trusted offline grocer. Pinduoduo dominates value tier.',
   'CTR Nielsen China 2023'),
  ('CN', 2024, 'beauty',
   '{"ko":["小红书 리뷰 (강력)","CFDA 등록","李佳琦 같은 KOL 라이브","Sephora·Watsons","K-beauty 신뢰"],"en":["Xiaohongshu reviews (powerful)","CFDA registration","KOL livestreams (Li Jiaqi)","Sephora / Watsons","K-beauty trust"]}'::jsonb,
   '{"ko":["피부 트러블","위조품 (특히 럭셔리)","KOL 수익 모델 의심","빠른 트렌드 변화"],"en":["Skin reaction","Counterfeits (esp. luxury)","KOL incentive skepticism","Fast-moving trends"]}'::jsonb,
   '{"ko":["天猫","京东","小红书","抖音","Sephora","Watsons (屈臣氏)","SaSa"],"en":["Tmall","JD.com","Xiaohongshu","Douyin","Sephora","Watsons","SaSa"]}'::jsonb,
   'Xiaohongshu is the dominant beauty research platform. Live commerce hosts (Li Jiaqi etc.) move massive volume. Domestic C-beauty brands (Florasis, Perfect Diary) have surged. CFDA approval is mandatory.',
   'CBNData 美妆消费报告'),
  ('CN', 2024, 'electronics',
   '{"ko":["京东 가격·정품 신뢰","小米·华为 국산 우대","Tmall 旗舰店","拼多多 가성비","Reddit·V2EX 리뷰"],"en":["JD.com price / authenticity trust","Xiaomi / Huawei domestic preference","Tmall flagship","Pinduoduo value","Reddit / V2EX reviews"]}'::jsonb,
   '{"ko":["위조품 우려","해외 직구 vs 국내 보증","Apple iCloud 사용 어려움"],"en":["Counterfeit concerns","Overseas direct vs domestic warranty","Apple iCloud limitations"]}'::jsonb,
   '{"ko":["京东","天猫","拼多多","抖音商城","小米 공식몰","华为 공식몰"],"en":["JD.com","Tmall","Pinduoduo","Douyin Shop","Xiaomi official","Huawei official"]}'::jsonb,
   'JD.com is the trusted platform for electronics (perceived as more authentic than Tmall). Domestic brands (Xiaomi, Huawei, Vivo, Oppo) dominate smartphones. Apple has high prestige but strong domestic competition.',
   'IDC China / 国家统计局'),
  ('CN', 2024, 'fashion',
   '{"ko":["小红书 코디","Taobao 라이브 스트리밍","국내 브랜드 (李宁, ANTA) 신뢰","SHEIN 가성비","面料 (소재) 확인"],"en":["Xiaohongshu styling","Taobao live streaming","Domestic brands (Li-Ning, ANTA)","SHEIN value","Fabric quality check"]}'::jsonb,
   '{"ko":["사이즈 표준 (S/M가 아시아 작음)","위조품","트렌드 빠름"],"en":["Asian sizing standards","Counterfeit","Fast trend cycle"]}'::jsonb,
   '{"ko":["天猫","Taobao","京东","小红书","抖音","得物 (Poizon)","拼多多"],"en":["Tmall","Taobao","JD.com","Xiaohongshu","Douyin","Poizon","Pinduoduo"]}'::jsonb,
   'Taobao live commerce drives huge fashion volume. National pride has elevated domestic athletic brands (Li-Ning, ANTA). Poizon authenticates streetwear/sneakers. SHEIN is dominant globally but slightly less iconic at home.',
   'iiMedia China Fashion'),
  ('CN', 2024, 'health',
   '{"ko":["NMPA 인증","의사 처방 (병원 의약과)","药房 (오프라인 약국)","小红书 보충제 리뷰","수입 보충제 (BLACKMORES, Swisse)"],"en":["NMPA certification","Doctor prescription (hospital pharmacy)","Offline pharmacy","Xiaohongshu supplement reviews","Imported supplements"]}'::jsonb,
   '{"ko":["효능 의심","위조 의약품 우려","保健品 (건강식품) 사기 이력"],"en":["Efficacy doubt","Counterfeit drug concerns","健康食品 scam history"]}'::jsonb,
   '{"ko":["京东健康","阿里健康","药房","小红书","平安好医生 (Ping An Good Doctor)"],"en":["JD Health","Alibaba Health","Offline pharmacy","Xiaohongshu","Ping An Good Doctor"]}'::jsonb,
   'JD Health and Alibaba Health dominate online pharmacy. NMPA-approved imports (Australian Swisse, BLACKMORES) have premium positioning. Telemedicine via Ping An / WeChat Health is mainstream.',
   'IDC China Healthcare'),
  ('CN', 2024, 'saas',
   '{"ko":["중국어 지원 필수","ICP 등록","대기업 도입 사례","DingTalk·Feishu 통합","개인정보보호법 (PIPL) 준수"],"en":["Chinese support (mandatory)","ICP registration","Enterprise references","DingTalk / Feishu integration","PIPL compliance"]}'::jsonb,
   '{"ko":["GFW 우회 우려","해외 데이터 저장 금지","결제 (위챗페이·알리페이)","ICP 미등록"],"en":["GFW concerns","Cross-border data residency","Payment (WeChat Pay / Alipay)","No ICP filing"]}'::jsonb,
   '{"ko":["阿里云 마켓플레이스","腾讯云 마켓플레이스","SaaS 직접 영업","DingTalk·Feishu 앱스토어"],"en":["Alibaba Cloud Marketplace","Tencent Cloud Marketplace","Direct SaaS sales","DingTalk / Feishu app stores"]}'::jsonb,
   'Foreign SaaS faces structural barriers: ICP filing, PIPL data residency, GFW. Domestic giants (DingTalk, Feishu, WeChat Work) dominate enterprise productivity. Most foreign SaaS goes through JV or local partner.',
   'IDC China SaaS / 艾瑞咨询')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
