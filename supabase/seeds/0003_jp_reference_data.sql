-- JP reference data — Phase B seed (manually curated from 厚生労働省 / 総務省).
-- Same structure as 0001_kr_reference_data.sql.
--
-- Sources informing the values below:
--   • 厚生労働省 — 賃金構造基本統計調査 2023 (Wage Structure Survey)
--   • 総務省 — 家計調査 2023 (Household Survey)
--   • 総務省 — 全国家計構造調査 2019
--   • @cosme / 価格.com 消費者行動レポート 2023
--
-- Re-run safely: ON CONFLICT DO UPDATE makes this idempotent.

-- ─── country_stats ─────────────────────────────────────────────
insert into public.country_stats
  (country_code, data_year, country_name_en, country_name_local, currency,
   population, median_household_income, gdp_per_capita_usd,
   source, source_url)
values
  ('JP', 2024, 'Japan', '日本', 'JPY',
   123900000, 5400000, 33800,
   '総務省 家計調査 2023',
   'https://www.stat.go.jp/data/kakei/index.html')
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

-- ─── country_profession_income ────────────────────────────────
-- Annual personal income, in JPY. 厚生労働省 nationwide medians;
-- Tokyo-area salaries typically run 20-30% above these.

with rows(profession_canonical, profession_localized, life_stage, age_group,
          p25, median, p75, display_ko, display_en) as (values
  -- Employed — common professions
  ('elementary_teacher',
   '{"ko":"초등학교 교사","en":"Elementary School Teacher"}'::jsonb,
   'employed', '20-29', 3500000::numeric, 4200000::numeric, 4800000::numeric,
   '연 ¥3.5M-¥4.8M (~$23-32k USD)', '¥3.5M-¥4.8M annually (~$23-32k USD)'),
  ('elementary_teacher',
   '{"ko":"초등학교 교사","en":"Elementary School Teacher"}'::jsonb,
   'employed', '30-39', 4500000, 5500000, 6500000,
   '연 ¥4.5M-¥6.5M (~$30-43k USD)', '¥4.5M-¥6.5M annually (~$30-43k USD)'),
  ('elementary_teacher',
   '{"ko":"초등학교 교사","en":"Elementary School Teacher"}'::jsonb,
   'employed', '40-49', 6000000, 7000000, 8500000,
   '연 ¥6M-¥8.5M (~$40-57k USD)', '¥6M-¥8.5M annually (~$40-57k USD)'),

  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '20-29', 3200000, 4000000, 4800000,
   '연 ¥3.2M-¥4.8M (~$21-32k USD)', '¥3.2M-¥4.8M annually (~$21-32k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '30-39', 4500000, 5800000, 7200000,
   '연 ¥4.5M-¥7.2M (~$30-48k USD)', '¥4.5M-¥7.2M annually (~$30-48k USD)'),
  ('office_worker',
   '{"ko":"사무직 회사원","en":"Office Worker"}'::jsonb,
   'employed', '40-49', 5500000, 7200000, 9500000,
   '연 ¥5.5M-¥9.5M (~$37-63k USD)', '¥5.5M-¥9.5M annually (~$37-63k USD)'),

  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어","en":"Senior Software Engineer"}'::jsonb,
   'employed', '30-39', 6500000, 8500000, 12000000,
   '연 ¥6.5M-¥12M (~$43-80k USD, 외자계 더 높음)',
   '¥6.5M-¥12M annually (~$43-80k USD, foreign cos higher)'),
  ('senior_software_engineer',
   '{"ko":"시니어 소프트웨어 엔지니어","en":"Senior Software Engineer"}'::jsonb,
   'employed', '40-49', 8500000, 12000000, 16000000,
   '연 ¥8.5M-¥16M (~$57-107k USD)', '¥8.5M-¥16M annually (~$57-107k USD)'),

  ('marketing_manager',
   '{"ko":"마케팅 매니저","en":"Marketing Manager"}'::jsonb,
   'employed', '30-39', 6000000, 8000000, 11000000,
   '연 ¥6M-¥11M (~$40-73k USD)', '¥6M-¥11M annually (~$40-73k USD)'),

  ('nurse',
   '{"ko":"간호사","en":"Registered Nurse"}'::jsonb,
   'employed', '20-29', 3800000, 4500000, 5200000,
   '연 ¥3.8M-¥5.2M (~$25-35k USD)', '¥3.8M-¥5.2M annually (~$25-35k USD)'),
  ('nurse',
   '{"ko":"간호사","en":"Registered Nurse"}'::jsonb,
   'employed', '30-39', 4500000, 5500000, 6800000,
   '연 ¥4.5M-¥6.8M (~$30-45k USD)', '¥4.5M-¥6.8M annually (~$30-45k USD)'),

  ('doctor',
   '{"ko":"의사","en":"Physician"}'::jsonb,
   'employed', '30-39', 9000000, 13000000, 18000000,
   '연 ¥9M-¥18M (~$60-120k USD)', '¥9M-¥18M annually (~$60-120k USD)'),
  ('doctor',
   '{"ko":"의사","en":"Physician"}'::jsonb,
   'employed', '40-49', 13000000, 18000000, 28000000,
   '연 ¥13M-¥28M (~$87-187k USD)', '¥13M-¥28M annually (~$87-187k USD)'),

  ('barista',
   '{"ko":"바리스타","en":"Barista"}'::jsonb,
   'employed', '20-29', 2500000, 3000000, 3500000,
   '연 ¥2.5M-¥3.5M (~$17-23k USD)', '¥2.5M-¥3.5M annually (~$17-23k USD)'),

  ('production_worker',
   '{"ko":"생산직 근로자","en":"Production Worker"}'::jsonb,
   'employed', '30-39', 3800000, 4500000, 5500000,
   '연 ¥3.8M-¥5.5M (~$25-37k USD)', '¥3.8M-¥5.5M annually (~$25-37k USD)'),

  ('small_business_owner',
   '{"ko":"자영업자 (소상공인)","en":"Small Business Owner"}'::jsonb,
   'self_employed', '40-49', 3500000, 6000000, 10000000,
   '사업소득 연 ¥3.5M-¥10M (변동 큼, ~$23-67k USD)',
   'Annual ¥3.5M-¥10M (highly variable, ~$23-67k USD)'),

  -- Non-employed life stages
  ('college_student',
   '{"ko":"대학생","en":"College Student"}'::jsonb,
   'student', '20-29', 500000, 1200000, 2200000,
   '용돈+알바 연 ¥500k-¥2.2M (~$3-15k USD), 부모 지원 별도',
   'Allowance + part-time ¥500k-¥2.2M/yr (~$3-15k USD)'),

  ('high_school_student',
   '{"ko":"고등학생","en":"High School Student"}'::jsonb,
   'student', '20-29', 120000, 240000, 480000,
   '용돈 연 ¥120k-¥480k (~$800-3.2k USD)',
   'Allowance only ¥120k-¥480k/yr (~$800-3.2k USD)'),

  ('homemaker',
   '{"ko":"전업주부","en":"Homemaker"}'::jsonb,
   'homemaker', '30-39', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 ¥6M-¥9M, 본인 가처분 월 ¥30k-¥80k',
   'No personal salary. Household ¥6M-¥9M/yr; personal disposable ¥30k-¥80k/month'),
  ('homemaker',
   '{"ko":"전업주부","en":"Homemaker"}'::jsonb,
   'homemaker', '40-49', 0, 0, 0,
   '본인 급여 없음. 가구소득 연 ¥7M-¥11M, 본인 가처분 월 ¥40k-¥100k',
   'No personal salary. Household ¥7M-¥11M/yr; personal disposable ¥40k-¥100k/month'),

  ('retiree',
   '{"ko":"은퇴자","en":"Retiree"}'::jsonb,
   'retiree', '60+', 1800000, 2800000, 4500000,
   '국민연금+후생연금 연 ¥1.8M-¥4.5M (~$12-30k USD)',
   'National + corporate pension ¥1.8M-¥4.5M/yr (~$12-30k USD)'),

  ('part_time_worker',
   '{"ko":"파트타임 근로자","en":"Part-time Worker"}'::jsonb,
   'employed', '30-39', 1200000, 1800000, 2800000,
   '연 ¥1.2M-¥2.8M (~$8-19k USD)', '¥1.2M-¥2.8M annually (~$8-19k USD)')
)
insert into public.country_profession_income
  (country_code, data_year, profession_canonical, profession_localized,
   life_stage, age_group, income_p25, income_median, income_p75,
   income_period, currency, display_band, source)
select 'JP', 2024, profession_canonical, profession_localized,
       life_stage, age_group, p25, median, p75,
       'annual', 'JPY',
       jsonb_build_object('ko', display_ko, 'en', display_en),
       '厚生労働省 賃金構造基本統計調査 2023'
from rows
on conflict (country_code, profession_canonical, age_group, data_year, life_stage)
  do update set
    income_p25 = excluded.income_p25,
    income_median = excluded.income_median,
    income_p75 = excluded.income_p75,
    display_band = excluded.display_band,
    profession_localized = excluded.profession_localized;

-- ─── country_consumer_norms ───────────────────────────────────
-- Curated from 価格.com / @cosme / 総務省 reports. Captures real
-- Japanese consumer behavior patterns per category.

insert into public.country_consumer_norms
  (country_code, data_year, category, trust_factors, common_objections,
   preferred_channels, cultural_notes, source)
values
  ('JP', 2024, 'food',
   '{"ko":["국산 표시 (国産表示)","JAS 인증","대형마트 PB (이온·세븐)","@cosme·Yahoo!知恵袋 후기","TV 방송 추천","원재료 표시"],"en":["Made-in-Japan label","JAS certification","Major retailer PB (Aeon, Seven)","@cosme / Yahoo! Chiebukuro reviews","TV program endorsement","Ingredient labeling"]}'::jsonb,
   '{"ko":["가격 부담","첨가물 우려","유통기한·신선도","익숙하지 않은 브랜드 거부감","과대광고 의심"],"en":["Price concerns","Additive concerns","Expiry / freshness","Reluctance toward unfamiliar brands","Marketing exaggeration skepticism"]}'::jsonb,
   '{"ko":["이온 (Aeon)","세븐일레븐","Amazon Japan","라쿠텐 (楽天市場)","요도바시닷컴","후루사토 납세 (ふるさと納税)","고급 슈퍼 (成城石井)"],"en":["Aeon","Seven-Eleven","Amazon Japan","Rakuten Ichiba","Yodobashi.com","Furusato Nozei","Premium supermarkets (Seijo Ishii)"]}'::jsonb,
   'Japanese consumers are highly quality-conscious and prize Made-in-Japan labeling. Convenience-store distribution is uniquely powerful — Seven Premium PB has near-cult status. Brand familiarity matters more than novelty for everyday food. Furusato Nozei (hometown tax) is a major specialty-food channel.',
   '総務省 家計調査 2023 / 価格.com 食品消費者調査'),

  ('JP', 2024, 'beauty',
   '{"ko":["@cosme 평점·리뷰","피부과 의사 추천","Made-in-Japan 신뢰","드러그스토어 매대 진열","デパコス (백화점 화장품) 브랜드 신뢰","임상 시험 결과"],"en":["@cosme ratings / reviews","Dermatologist endorsement","Made-in-Japan trust","Drugstore shelf placement","Department-store cosmetics brand trust","Clinical trial results"]}'::jsonb,
   '{"ko":["피부 트러블 우려","고가 부담 (デパコス vs プチプラ)","과장 광고","익숙하지 않은 외국 브랜드"],"en":["Skin reaction concerns","Premium price (depacos vs purchase)","Marketing exaggeration","Unfamiliar foreign brands"]}'::jsonb,
   '{"ko":["마쓰모토키요시 (マツモトキヨシ)","코코카라파인 (ココカラファイン)","@cosme STORE","백화점 화장품 매장","Amazon Japan","Qoo10","라쿠텐"],"en":["Matsumoto Kiyoshi","Kokokara Fine","@cosme STORE","Department store beauty counters","Amazon Japan","Qoo10","Rakuten"]}'::jsonb,
   'Japanese consumers split clearly between depacos (department-store premium, Shiseido / Kose) and prichi-pra (drugstore affordable). @cosme is the dominant review platform — being an "@cosme Best Cosme" winner drives massive sales. K-beauty has gained traction since 2018 via Qoo10.',
   '@cosme インサイトレポート 2023'),

  ('JP', 2024, 'electronics',
   '{"ko":["국내 메이커 우선 (SONY, Panasonic, 샤프)","요도바시·빅카메라 매장 체험","価格.com 가격 비교","제조사 5년 보증","유튜브 리뷰 (国内 youtuber)"],"en":["Domestic makers preferred (SONY, Panasonic, Sharp)","Yodobashi / BIC Camera in-store experience","Kakaku.com price comparison","Manufacturer 5-year warranty","Domestic YouTuber reviews"]}'::jsonb,
   '{"ko":["수입 가전 호환성 (전압·플러그)","해외 직구 보증 우려","구독 모델 거부감","개인정보 우려"],"en":["Imported appliance compatibility (voltage / plug)","Overseas direct-purchase warranty concerns","Subscription model resistance","Privacy concerns"]}'::jsonb,
   '{"ko":["요도바시 (ヨドバシ.com)","빅카메라 (ビックカメラ)","야마다전기","Amazon Japan","라쿠텐","제조사 공식몰"],"en":["Yodobashi.com","BIC Camera","Yamada Denki","Amazon Japan","Rakuten","Manufacturer official"]}'::jsonb,
   'Japanese electronics buyers strongly prefer Made-in-Japan brands and compare prices on Kakaku.com religiously. The 量販店 (volume retailer) Yodobashi/BIC Camera in-store experience drives major-purchase decisions. Subscription-based hardware faces the same resistance as in Korea.',
   '価格.com 消費者調査 2023 / 経産省 家電消費動向'),

  ('JP', 2024, 'fashion',
   '{"ko":["ZOZOTOWN 큐레이션","유니클로의 검증된 품질","잡지 (Vogue Japan, ELLE Japan) 게재","백화점 신뢰","インスタ 트렌드"],"en":["ZOZOTOWN curation","Uniqlo proven quality","Magazine (Vogue Japan, ELLE Japan) coverage","Department store trust","Instagram trends"]}'::jsonb,
   '{"ko":["사이즈 표준 (S/M가 한국·미국과 다름)","반품 절차 번거로움","유행이 빨리 지나감","해외 브랜드 가격 부담"],"en":["Size standards (S/M differs from KR/US)","Return process friction","Fast trend turnover","Foreign brand premium pricing"]}'::jsonb,
   '{"ko":["ZOZOTOWN","유니클로","라쿠텐 패션","백화점 (이세탄·미츠코시)","메르카리 (リユース)","Amazon Japan"],"en":["ZOZOTOWN","Uniqlo","Rakuten Fashion","Department stores (Isetan, Mitsukoshi)","Mercari (resale)","Amazon Japan"]}'::jsonb,
   'ZOZOTOWN dominates online fashion with editorial curation. Uniqlo holds the practical-quality position. Department stores still drive premium fashion (Isetan Shinjuku is iconic). Mercari has normalized resale especially for Gen Z. Foreign luxury is bought in tax-free shopping mode.',
   'ZOZOTOWN リサーチ 2023 / 矢野経済研究所'),

  ('JP', 2024, 'health',
   '{"ko":["기능성 표시 식품 (機能性表示食品)","약사 상담","한방 전통 (漢方)","건강 검진 결과 기반","제조사 신뢰성","의사 추천"],"en":["Functional food labeling (機能性表示食品)","Pharmacist consult","Kampo tradition","Health checkup-based","Manufacturer reliability","Doctor recommendation"]}'::jsonb,
   '{"ko":["효능 의심","장기 복용 안전성","고가 부담","부작용 우려"],"en":["Doubt about efficacy","Long-term safety","Premium price","Side-effect concerns"]}'::jsonb,
   '{"ko":["마쓰모토키요시","코코카라파인","Amazon Japan","라쿠텐","아이허브","병원 처방"],"en":["Matsumoto Kiyoshi","Kokokara Fine","Amazon Japan","Rakuten","iHerb","Hospital prescription"]}'::jsonb,
   'Japan has formal 機能性表示食品 (functional food labeling) which carries strong trust. Drugstore pharmacists serve as informal first-line health consultants. Kampo (traditional medicine) has institutional acceptance. Subscription supplements (DHC etc) have been mainstream since the 2000s.',
   '消費者庁 機能性表示食品 / 矢野経済 健康食品市場'),

  ('JP', 2024, 'saas',
   '{"ko":["일본어 고객지원 필수","대기업 도입 사례 (大企業実績)","공공기관 도입","월액 청구서 대응","印鑑 (도장) 업무 호환","무료 체험"],"en":["Japanese-language support (mandatory)","Enterprise adoption (大企業実績)","Public-sector adoption","Monthly invoice support","Inkan / hanko workflow compatibility","Free trial"]}'::jsonb,
   '{"ko":["일본어 미지원 우려","대기업이 안 쓰는데 작은 회사에 적합?","해외 결제 (월정액 카드) 거부감","印鑑 워크플로우 미지원"],"en":["Lack of Japanese support","If big cos don''t use it, why should we?","Overseas card subscription resistance","No inkan workflow support"]}'::jsonb,
   '{"ko":["SaaS사 직접 영업","NTT 데이터·후지쯔 SI","Yahoo! BB B2B","Salesforce ISV 파트너","Microsoft Marketplace"],"en":["Direct SaaS sales","NTT Data / Fujitsu SI","Yahoo! BB B2B","Salesforce ISV partner","Microsoft Marketplace"]}'::jsonb,
   'Japanese B2B SaaS adoption skews conservative — Japanese-language support and enterprise references are non-negotiable. Major SI partners (NTT Data, Fujitsu) gate enterprise deals. Inkan/hanko compatibility, while declining, still matters for procurement workflows in many companies.',
   '矢野経済 国内SaaS市場 2023 / 経産省 DX推進報告書')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;
