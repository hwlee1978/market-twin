-- IP & Content category seed — consumer norms + competitor brands per country.
--
-- Covers the 10 markets that matter most for K-IP export:
--   • KR — origin market context
--   • US, JP — top-tier targets (largest manga / anime / merch markets)
--   • TW, GB — secondary developed markets
--   • ID, TH, VN, PH, MY — SEA, where K-content fandom is strongest
--
-- Sources informing these rows:
--   • Naver Webtoon IR / Kakao Entertainment IR (platform stats)
--   • Anime News Network · ICv2 industry coverage
--   • KOCCA (한국콘텐츠진흥원) export reports
--   • Statista — Manga / Webtoon / Licensed merchandise market reports
--   • Public reporting from Polygon / Variety / Forbes on K-IP licensing
--
-- "IP" in this seed means consumer-facing IP commerce — webtoon platforms,
-- manga / anime publishing, character-goods merchandise, collectibles. Not
-- B2B IP licensing deals (rights to studios) — those have a different buyer
-- profile and would need a separate category.
--
-- Re-run safely: ON CONFLICT DO UPDATE makes this idempotent.

-- ─── country_consumer_norms (IP) ──────────────────────────────────
insert into public.country_consumer_norms
  (country_code, data_year, category, trust_factors, common_objections,
   preferred_channels, cultural_notes, source)
values
  ('KR', 2024, 'ip',
   '{"ko":["네이버 웹툰·카카오웹툰 정식 라이선스","KOCCA 콘텐츠 진흥 인증","원작자 직접 콜라보·서명","한정판 넘버링","팬 커뮤니티 (디시·아카라이브·트위터) 인증"],"en":["Naver Webtoon / Kakao Webtoon official license","KOCCA content-export endorsement","Original creator collab / signature","Numbered limited edition","Fan-community validation (Twitter / DC / Arca)"]}'::jsonb,
   '{"ko":["국내 굿즈 시장 작음 (수집가 문화 미성숙)","가격 부담 (수입 라이선스 굿즈)","한정 발매 FOMO","번역 IP의 재구매 가치 의문"],"en":["Domestic merch market still small","Premium pricing","Limited-drop FOMO","Translated-IP repurchase value uncertain"]}'::jsonb,
   '{"ko":["네이버 시리즈 / 웹툰","카카오웹툰 / 카카오페이지","레진코믹스","ALAND","KAKAO FRIENDS","Tenbyten","교보문고 굿즈"],"en":["Naver Series / Webtoon","Kakao Webtoon / Page","Lezhin Comics","ALAND","KAKAO FRIENDS","Tenbyten","Kyobo merch"]}'::jsonb,
   'Korea is the origin of webtoon — Naver and Kakao dominate digital. Physical merch market is smaller than Japan but growing via crossover with K-pop fandom infrastructure (POP-UP stores, character cafes). KOCCA actively underwrites overseas licensing deals as part of cultural-export policy.',
   'Naver Webtoon IR / KOCCA 2023'),

  ('US', 2024, 'ip',
   '{"ko":["VIZ Media · Yen Press 정식 출판","Crunchyroll 라이선스","Webtoon (Naver) 영문판","TAPAS (카카오) 인증","Reddit r/manga · r/webtoons 추천","Comic-Con 출전 IP","NYT 베스트셀러 만화 차트"],"en":["VIZ Media / Yen Press official publishing","Crunchyroll license","Webtoon (Naver) English","TAPAS (Kakao) verified","Reddit r/manga / r/webtoons","Comic-Con presence","NYT graphic-novel bestseller list"]}'::jsonb,
   '{"ko":["위조품·해적판 만연","번역·로컬라이징 품질","한정판 봇 구매 경쟁","해외 배송비"],"en":["Counterfeit / piracy","Translation & localization quality","Bot resale on limited drops","International shipping fees"]}'::jsonb,
   '{"ko":["Crunchyroll Store","RightStuf Anime","Barnes & Noble","Amazon","Hot Topic","BookOff USA","Webtoon (Naver) 앱","TAPAS","Comic-Con 부스"],"en":["Crunchyroll Store","RightStuf Anime","Barnes & Noble","Amazon","Hot Topic","BookOff USA","Webtoon (Naver) app","TAPAS","Comic-Con booth"]}'::jsonb,
   'Webtoon (Naver) US has 20M+ MAU and is the fastest-growing K-IP entry vector. Manga book market is dominated by Japanese IP via VIZ / Yen Press, but K-Webtoons are converting to print + adaptations rapidly. Comic-Con / Anime Expo are the global launch moments for new IPs.',
   'ICv2 / Webtoon Naver IR 2023'),

  ('JP', 2024, 'ip',
   '{"ko":["일본 출판사 정식 라이선스 (소학관·집영사·코단샤)","Animate · Mandarake 진열","Piccoma (카카오) 매출 1위 만화 앱","LINE Manga (네이버) 라이선스","코미케 출품"],"en":["Japanese publisher license (Shogakukan / Shueisha / Kodansha)","Animate / Mandarake shelf","Piccoma (Kakao) #1 manga-app revenue","LINE Manga (Naver) license","Comic Market exhibition"]}'::jsonb,
   '{"ko":["일본 IP 대비 한국 IP 인지도 격차","일본어 번역 품질 (현지 작가 대비)","일본 망가 시장의 포화"],"en":["K-IP vs J-IP brand-recognition gap","Translation quality vs native authors","Japanese manga market saturation"]}'::jsonb,
   '{"ko":["Piccoma","LINE Manga","Animate","Mandarake","Tora no Ana","Amazon JP","Yodobashi Camera","출판사 직판"],"en":["Piccoma","LINE Manga","Animate","Mandarake","Tora no Ana","Amazon JP","Yodobashi Camera","Publisher direct"]}'::jsonb,
   'Japan is the world''s largest manga market. K-IP penetrates digitally — Piccoma (Kakao) tops the manga-app revenue chart, and LINE Manga (Naver) is a major player. Print publishing for K-IP is harder due to Japanese IP saturation. Comic Market still anchors the doujin economy.',
   'Piccoma IR / Oricon 2023'),

  ('TW', 2024, 'ip',
   '{"ko":["Books.com.tw 진열","Eslite 코너","Webtoon (Naver) 정체자 라이선스","Bilibili Taiwan 정식 채널","KOCCA 라이선스 인증"],"en":["Books.com.tw shelf","Eslite section","Webtoon (Naver) Traditional-Chinese","Bilibili Taiwan license","KOCCA license badge"]}'::jsonb,
   '{"ko":["번체-간체 번역 품질","수입 가격","제한 발매"],"en":["Trad vs Simp Chinese localization","Imported pricing","Limited-drop scarcity"]}'::jsonb,
   '{"ko":["Books.com.tw","Eslite","Shopee TW","Bilibili TW","Webtoon TW","KKDay (이벤트)"],"en":["Books.com.tw","Eslite","Shopee TW","Bilibili TW","Webtoon TW","KKDay (events)"]}'::jsonb,
   'Taiwan has a strong tri-source IP appetite (KR + JP + CN). K-content recognition is high. Eslite and Books.com.tw are the trusted bookstore brands. Government enforcement of licensed IP is meaningful — official licensing badges matter.',
   'Books.com.tw / Webtoon TW IR'),

  ('ID', 2024, 'ip',
   '{"ko":["Webtoon (Naver) 인도네시아어 정식 번역","K-pop·드라마 한류 신뢰","Shopee·Tokopedia 평점","KOL·유튜버 추천","KCON 출연"],"en":["Webtoon (Naver) Bahasa Indonesia","Hallyu (K-pop / K-drama) crossover trust","Shopee / Tokopedia ratings","KOL / YouTuber endorsement","KCON presence"]}'::jsonb,
   '{"ko":["가격 부담 (소득 대비)","위조품 흔함","환율 변동","현지화 품질"],"en":["Price (relative to income)","Widespread counterfeit","FX volatility","Localization quality"]}'::jsonb,
   '{"ko":["Shopee ID","Tokopedia","Webtoon ID 앱","Lazada ID","Periplus","Mall 내 K-pop·anime 매장"],"en":["Shopee ID","Tokopedia","Webtoon ID app","Lazada ID","Periplus","Mall K-pop / anime stores"]}'::jsonb,
   'Indonesia is the #1 SEA market for Webtoon (Naver) — Indonesian is one of its biggest non-Korean languages by reader count. K-content fandom is enormous (KCON Jakarta sells out). Price-sensitive — premium collectibles harder; digital + low-priced merch wins.',
   'Webtoon Naver IR / Statista SEA'),

  ('TH', 2024, 'ip',
   '{"ko":["Lazada·Shopee 평점","Webtoon (Naver) 태국어 라이선스","KCON 태국 출연","BL 팬덤 KOL 추천","현지 출판사 정식 번역"],"en":["Lazada / Shopee ratings","Webtoon (Naver) Thai","KCON Thailand presence","Thai BL-fandom KOLs","Local publisher official translation"]}'::jsonb,
   '{"ko":["가격 부담","태국어 번역 품질","위조품"],"en":["Price","Thai-translation quality","Counterfeit"]}'::jsonb,
   '{"ko":["Shopee TH","Lazada TH","Webtoon TH","B2S","Asia Books","Facebook Live commerce"],"en":["Shopee TH","Lazada TH","Webtoon TH","B2S","Asia Books","Facebook Live commerce"]}'::jsonb,
   'Thailand is a powerhouse for K-content (drama + K-pop + BL). Thai BL-fandom has strong crossover with K-BL webtoons. Facebook Live commerce drives meaningful K-merch volume. Webtoon (Naver) TH is rapidly growing.',
   'Webtoon Naver IR / KCON Thailand'),

  ('VN', 2024, 'ip',
   '{"ko":["Webtoon (Naver) 베트남어","한류 콘텐츠 인지","Tiki·Shopee 평점","Facebook 추천","현지 출판사 라이선스"],"en":["Webtoon (Naver) Vietnamese","Hallyu content recognition","Tiki / Shopee ratings","Facebook recommendations","Local publisher license"]}'::jsonb,
   '{"ko":["가격 부담 (소득 대비)","위조품","베트남어 번역 품질"],"en":["Price (relative to income)","Counterfeit","Vietnamese-translation quality"]}'::jsonb,
   '{"ko":["Shopee VN","Lazada VN","Tiki","Webtoon VN","Fahasa","Facebook Live"],"en":["Shopee VN","Lazada VN","Tiki","Webtoon VN","Fahasa","Facebook Live"]}'::jsonb,
   'K-content cultural influence is large in Vietnam. Highly price-sensitive — digital and lower-priced collectibles preferred. Webtoon (Naver) is the dominant platform; Fahasa is the main book retail chain.',
   'Statista VN / Webtoon Naver'),

  ('PH', 2024, 'ip',
   '{"ko":["Lazada·Shopee 평점","Webtoon (Naver) 영어판 직접 소비","K-pop 팬덤 강력","KOL·유튜버 추천","KCON Manila"],"en":["Lazada / Shopee ratings","Webtoon (Naver) English direct consumption","Strong K-pop fandom","KOL / YouTuber endorsement","KCON Manila"]}'::jsonb,
   '{"ko":["가격 부담","위조품","영어 vs 타갈로그 우선순위"],"en":["Price","Counterfeit","English vs Tagalog priority"]}'::jsonb,
   '{"ko":["Shopee PH","Lazada PH","Webtoon PH","National Book Store","로컬 코믹·anime 페어"],"en":["Shopee PH","Lazada PH","Webtoon PH","National Book Store","Local comic / anime fairs"]}'::jsonb,
   'Philippines has very strong K-pop and K-drama fandom. English fluency means consumers can engage K-IP directly in English without waiting for Tagalog translations. Collector culture is active. KCON Manila is a major event.',
   'KCON / Webtoon Naver IR'),

  ('MY', 2024, 'ip',
   '{"ko":["Shopee·Lazada 평점","K-pop·드라마 한류","Webtoon (Naver) 영어·말레이어","KOL·유튜버","Popular Bookstore 진열"],"en":["Shopee / Lazada ratings","K-pop / drama Hallyu","Webtoon (Naver) English / Malay","KOL / YouTuber","Popular Bookstore shelf"]}'::jsonb,
   '{"ko":["환율","가격 부담","일본 IP와 경쟁","다민족 로컬라이징"],"en":["FX","Price","J-IP competition","Multi-ethnic localization"]}'::jsonb,
   '{"ko":["Shopee MY","Lazada MY","Webtoon MY","Popular Bookstore","Kinokuniya KL","Facebook·Instagram 광고"],"en":["Shopee MY","Lazada MY","Webtoon MY","Popular Bookstore","Kinokuniya KL","Facebook / Instagram ads"]}'::jsonb,
   'Multi-ethnic market (Malay / Chinese / Indian) — all three communities consume K-content. Lower censorship friction than some neighbors. Kinokuniya KL is the trusted Japanese-style bookstore where K-IP also gets shelf space.',
   'Statista MY'),

  ('GB', 2024, 'ip',
   '{"ko":["Anime-Limited 라이선스","Forbidden Planet 진열","VIZ Media UK · Yen Press UK","Crunchyroll UK","MCM Comic Con","Waterstones 그래픽노블 코너"],"en":["Anime-Limited license","Forbidden Planet shelf","VIZ Media UK / Yen Press UK","Crunchyroll UK","MCM Comic Con","Waterstones graphic-novel section"]}'::jsonb,
   '{"ko":["UK 만화 시장 작음 (북미 대비)","가격 (수입품)","라이선스 가용성 제한"],"en":["UK manga market is smaller than NA","Premium pricing on imports","Limited license availability"]}'::jsonb,
   '{"ko":["Anime-Limited","Forbidden Planet","Waterstones","Amazon UK","Crunchyroll Store EU","MCM Comic Con","Webtoon UK"],"en":["Anime-Limited","Forbidden Planet","Waterstones","Amazon UK","Crunchyroll Store EU","MCM Comic Con","Webtoon UK"]}'::jsonb,
   'UK manga / anime market is smaller than the US but well-established. J-IP dominates physical, but Webtoon (Naver) is converting English-speaking digital readers. MCM Comic Con (London / Birmingham) is the main fan-event circuit.',
   'ICv2 / Anime-Limited UK')
on conflict (country_code, category, data_year) do update set
  trust_factors = excluded.trust_factors,
  common_objections = excluded.common_objections,
  preferred_channels = excluded.preferred_channels,
  cultural_notes = excluded.cultural_notes,
  source = excluded.source;

-- ─── category_competitors (IP) ────────────────────────────────────
-- 3-4 brands per market, role-tagged so the LLM can frame the landscape
-- without re-extracting it from cultural_notes every time.

insert into public.category_competitors
  (category, country_code, brand_name, brand_role, segment, notes, source)
values
  -- KR — origin market platforms
  ('ip', 'KR', 'Naver Webtoon', 'leader', 'mass',
   'Origin platform for the global webtoon format. ~150M MAU globally; ~10M+ daily readers in KR alone. Owns the format conversion to print / film / drama via Studio N.',
   'Naver Webtoon IR'),
  ('ip', 'KR', 'Kakao Webtoon / Kakao Page', 'challenger', 'mass',
   'Kakao Entertainment''s flagship — strong premium-tier serialized webtoons. Owns Piccoma (top-grossing JP manga app). Studio Dragon adaptation pipeline.',
   'Kakao Entertainment IR'),
  ('ip', 'KR', 'Lezhin Comics', 'niche', 'premium',
   'Premium / mature webtoon platform. Strong adult and BL segments. Profitable smaller player vs Naver / Kakao duopoly.',
   'Lezhin IR'),
  ('ip', 'KR', 'KOCCA', 'leader', 'mass',
   'Korea Creative Content Agency — government body underwriting overseas K-IP licensing deals via funding, attendance at MIPCOM / Comic-Con.',
   'KOCCA annual report'),

  -- US — biggest export target
  ('ip', 'US', 'Webtoon (Naver)', 'leader', 'mass',
   'Naver''s US-focused arm. ~20M MAU in US. Top-grossing webtoon platform globally; converting hits to Netflix / Amazon adaptations.',
   'Webtoon Naver IR'),
  ('ip', 'US', 'Crunchyroll', 'leader', 'mass',
   'Sony-owned anime streaming + retail (Crunchyroll Store). Anchor of US licensed-anime distribution. Expanded into manga / merch.',
   'Sony Pictures IR'),
  ('ip', 'US', 'VIZ Media', 'leader', 'premium',
   'Largest English-language manga publisher (Naruto, One Piece, Demon Slayer). Owns Shonen Jump app. Limited K-IP catalog so far.',
   'ICv2 manga publishing'),
  ('ip', 'US', 'Yen Press', 'challenger', 'mass',
   'Hachette-owned. Prolific in light novels and manga. Has begun publishing K-Webtoon adaptations in print.',
   'Hachette annual'),
  ('ip', 'US', 'TAPAS (Kakao)', 'challenger', 'mass',
   'Kakao Entertainment''s US webtoon platform; competes directly with Webtoon Naver in the English market.',
   'Kakao Entertainment IR'),

  -- JP — manga superpower
  ('ip', 'JP', 'Piccoma (Kakao)', 'leader', 'mass',
   'Kakao Entertainment''s Japan-localized webtoon app. #1 grossing manga app in Japan since 2020 — overtook Shueisha''s Shonen Jump+ in revenue.',
   'data.ai / Piccoma IR'),
  ('ip', 'JP', 'LINE Manga (Naver)', 'challenger', 'mass',
   'Naver''s JP arm via LINE. Major K-Webtoon distribution channel in Japan. Strong female-skewed reader base.',
   'LINE Yahoo IR'),
  ('ip', 'JP', 'Shueisha / Kodansha / Shogakukan', 'leader', 'premium',
   'The Big Three Japanese manga publishers. K-IP must navigate around (or partner with) these incumbents for print.',
   'Oricon publishing reports'),
  ('ip', 'JP', 'Animate', 'leader', 'mass',
   'Largest anime / manga / character-merch retail chain in Japan. ~150 stores. Defines what counts as ''officially merchandised'' in the eyes of fans.',
   'Animate IR'),

  -- TW — tri-IP market
  ('ip', 'TW', 'Webtoon (Naver) TW', 'leader', 'mass',
   'Traditional-Chinese localization of Webtoon. Dominant in young-reader webtoon space.',
   'Webtoon Naver IR'),
  ('ip', 'TW', 'Books.com.tw', 'leader', 'mass',
   'Taiwan''s top online bookstore — major distribution channel for licensed manga / webtoon print editions.',
   'Books.com.tw IR'),
  ('ip', 'TW', 'Eslite', 'challenger', 'premium',
   'Trusted curated bookstore chain. K-IP print editions and merch get prime shelf placement here.',
   'Eslite Spectrum IR'),

  -- ID — SEA powerhouse
  ('ip', 'ID', 'Webtoon (Naver) ID', 'leader', 'mass',
   'Bahasa Indonesia is one of Webtoon''s biggest non-Korean languages by reader count. Indonesia is the #1 SEA market for the platform.',
   'Webtoon Naver IR'),
  ('ip', 'ID', 'Shopee Indonesia', 'leader', 'mass',
   'Dominant e-commerce platform for K-merch. Shopee Live drives meaningful K-IP collectibles volume.',
   'Sea Group IR'),
  ('ip', 'ID', 'Periplus / Gramedia', 'challenger', 'mass',
   'Major bookstore chains carrying licensed manga / webtoon print editions.',
   'Indonesia bookstore reports'),

  -- TH — strong K-content fandom
  ('ip', 'TH', 'Webtoon (Naver) TH', 'leader', 'mass',
   'Thai-language Webtoon platform. Strong BL crossover with Thai BL fandom.',
   'Webtoon Naver IR'),
  ('ip', 'TH', 'Shopee Thailand', 'leader', 'mass',
   'Dominant e-commerce + Live commerce platform. Major channel for K-IP merch.',
   'Sea Group IR'),
  ('ip', 'TH', 'B2S / Asia Books', 'challenger', 'mass',
   'Bookstore chains carrying licensed manga / webtoon. Asia Books is the English-language anchor.',
   'Central Group IR'),

  -- VN — price-sensitive but strong K-content love
  ('ip', 'VN', 'Webtoon (Naver) VN', 'leader', 'mass',
   'Vietnamese Webtoon platform — fast-growing in young-reader segment.',
   'Webtoon Naver IR'),
  ('ip', 'VN', 'Tiki / Shopee VN', 'leader', 'mass',
   'Major e-commerce platforms for K-IP merch. Cash-on-delivery still common.',
   'Statista Vietnam'),
  ('ip', 'VN', 'Fahasa', 'challenger', 'mass',
   'Vietnam''s largest bookstore chain. Carries licensed manga / webtoon print editions.',
   'Fahasa public data'),

  -- PH — very strong K-pop / drama fandom
  ('ip', 'PH', 'Webtoon (Naver) PH', 'leader', 'mass',
   'Philippines reads Webtoon mostly in English (high English fluency), driving direct engagement without waiting for Tagalog.',
   'Webtoon Naver IR'),
  ('ip', 'PH', 'Shopee Philippines', 'leader', 'mass',
   'Major channel for K-merch and collectibles. Shopee Live is meaningful for limited drops.',
   'Sea Group IR'),
  ('ip', 'PH', 'National Book Store', 'challenger', 'mass',
   'Largest Philippine bookstore chain. Carries licensed manga / webtoon collected editions.',
   'NBS public data'),

  -- MY — multi-ethnic K-content market
  ('ip', 'MY', 'Webtoon (Naver) MY', 'leader', 'mass',
   'English / Malay Webtoon variants. Multi-ethnic readership.',
   'Webtoon Naver IR'),
  ('ip', 'MY', 'Shopee Malaysia', 'leader', 'mass',
   'Dominant e-commerce; major channel for K-merch.',
   'Sea Group IR'),
  ('ip', 'MY', 'Kinokuniya KL / Popular Bookstore', 'challenger', 'mass',
   'Trusted bookstore brands — Kinokuniya as the Japanese-style cross-cultural anchor; Popular for mass-market.',
   'Industry public data'),

  -- GB — UK fan-event scene
  ('ip', 'GB', 'Webtoon (Naver) UK', 'challenger', 'mass',
   'English Webtoon serves UK readers — direct overlap with US edition. Growing fanbase.',
   'Webtoon Naver IR'),
  ('ip', 'GB', 'Anime-Limited', 'leader', 'premium',
   'UK''s leading anime distributor and licensed-merchandise retailer. Trusted by collectors.',
   'Anime-Limited public'),
  ('ip', 'GB', 'Forbidden Planet', 'leader', 'mass',
   'Iconic UK chain for comics / manga / sci-fi. ~10 stores plus online. Gateway shelf for licensed manga / webtoon print.',
   'Forbidden Planet public'),
  ('ip', 'GB', 'MCM Comic Con', 'challenger', 'mass',
   'UK''s largest fan-convention circuit (London / Birmingham / Manchester). Major launch venue for new IP.',
   'ReedPop UK')
on conflict (category, country_code, brand_name) do update set
  brand_role = excluded.brand_role,
  segment = excluded.segment,
  notes = excluded.notes,
  source = excluded.source;
