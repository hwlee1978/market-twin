/**
 * Per-category profession pools for slot-based persona generation.
 *
 * Why this exists:
 * - Soft "diversity rules" in the prompt didn't survive parallel batches.
 *   Each batch independently picks the easiest 1-2 archetypes (대학생 +
 *   일러스트레이터 for KR, 마케팅 매니저 + 바리스타 for US) and the across-
 *   batch result is ~70% concentration on 2 professions.
 * - Pre-assigning each persona slot with a specific base profession from
 *   a wide pool guarantees diversity by construction. The LLM still has
 *   freedom in specialization (e.g. "프리랜서 일러스트레이터 (웹툰 채색
 *   전문)"), age, income, intent, and all other fields — only the base
 *   profession is locked.
 *
 * Pools are locale-keyed; English mirrors KO order so a slot index maps
 * to the same archetype across locales.
 */

import type { PromptLocale } from "./prompts";

interface CategoryPool {
  /** Diverse buyer archetypes for this category, in pool-cycle order. */
  archetypes: string[];
  /** Generic / catch-all professions — capped per simulation to prevent
   *  the LLM from defaulting to them. Map: profession → max occurrences. */
  caps: Record<string, number>;
}

const POOLS_KO: Record<string, CategoryPool> = {
  ip: {
    archetypes: [
      // Creative industry
      "프리랜서 일러스트레이터",
      "만화·웹툰 작가 (신인)",
      "만화·웹툰 작가 (지망생)",
      "캐릭터 디자이너",
      "콘셉트 아티스트",
      "게임 디자이너",
      "콘텐츠 PD",
      "애니메이션 감독·연출",
      // Media & distribution
      "출판사 편집자",
      "라이선싱·MD 매니저",
      "콘텐츠 큐레이터",
      "영상 편집자",
      "PR·홍보 담당자",
      // Fan economy
      "전업 코스플레이어",
      "굿즈샵 운영자",
      "동인 작가",
      "콘텐츠 크리에이터·유튜버",
      "트위치 스트리머",
      "팬 인플루언서",
      // Tech & games
      "게임 개발자",
      "UX·UI 디자이너",
      "모바일 앱 개발자",
      "데이터 분석가",
      // Adjacent (still K-IP relevant)
      "만화방·코믹카페 운영자",
      "일러스트 학원 강사",
      "사진작가",
      "사무직 회사원 (키덜트 수집가)",
      "학부모 (자녀 선물 구매)",
      "은퇴자 (수집가 취미)",
      // Always-eligible (capped — see caps below)
      "대학생",
      "마케팅 매니저",
      "일반 회사원",
    ],
    caps: {
      "대학생": 3,
      "마케팅 매니저": 2,
      "일반 회사원": 2,
    },
  },
};

const POOLS_EN: Record<string, CategoryPool> = {
  ip: {
    archetypes: [
      // Creative industry
      "Freelance illustrator",
      "Manga / webtoon author (debut)",
      "Manga / webtoon author (aspiring)",
      "Character designer",
      "Concept artist",
      "Game designer",
      "Content PD",
      "Animation director",
      // Media & distribution
      "Publishing-house editor",
      "Licensing / MD manager",
      "Content curator",
      "Video editor",
      "PR specialist",
      // Fan economy
      "Full-time cosplayer",
      "Merch-shop owner",
      "Doujin author",
      "Content creator / YouTuber",
      "Twitch streamer",
      "Fan influencer",
      // Tech & games
      "Game developer",
      "UX / UI designer",
      "Mobile app developer",
      "Data analyst",
      // Adjacent
      "Manga café / comic-shop owner",
      "Illustration academy instructor",
      "Photographer",
      "Office worker (kidult collector)",
      "Parent buying for children",
      "Retiree (hobbyist collector)",
      // Always-eligible (capped)
      "College student",
      "Marketing manager",
      "Office worker",
    ],
    caps: {
      "College student": 3,
      "Marketing manager": 2,
      "Office worker": 2,
    },
  },
};

export interface PersonaSlot {
  country: string;
  /** Empty string when category has no pool — slot is free for the LLM. */
  profession: string;
}

/** Returns the profession pool for the category, or null when the category
 *  has no pre-assigned pool (LLM gets free profession choice instead). */
export function getProfessionPool(
  category: string,
  locale: PromptLocale,
): CategoryPool | null {
  const map = locale === "ko" ? POOLS_KO : POOLS_EN;
  return map[category] ?? null;
}

/**
 * Deterministic-ish shuffle (Fisher-Yates) using a simple LCG seed so the
 * profession order rotates across runs without depending on Math.random
 * timing — same simulationId reproduces, but different sims get different
 * orderings.
 */
function shuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Hash a string into a 32-bit seed for the shuffle. */
function seedFromString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Pre-assign a profession to every persona slot, guaranteeing across-batch
 * diversity by construction. Slots are returned in a deterministic order
 * derived from `seed` (use simulationId for reproducibility); caller decides
 * how to slice them across parallel batches.
 *
 * Algorithm:
 *   1. Even-distribute total count across candidate countries (existing
 *      computeCountryQuota logic, replicated here so this module is
 *      self-contained).
 *   2. Shuffle the category's archetype pool.
 *   3. For each persona slot, advance through the pool — skip any
 *      profession that has hit its cap. Wrap around if the pool is shorter
 *      than the slot count.
 *
 * For categories without a pool, returns slots with `profession: ""` —
 * the prompt then falls back to free-choice generation with the diversity
 * rule guidance.
 */
export function planSlots(
  personaCount: number,
  candidateCountries: string[],
  category: string,
  locale: PromptLocale,
  seed: string,
): PersonaSlot[] {
  if (candidateCountries.length === 0) return [];

  // Even split across countries (mirrors computeCountryQuota in runner.ts).
  const base = Math.floor(personaCount / candidateCountries.length);
  const remainder = personaCount - base * candidateCountries.length;
  const perCountry: Record<string, number> = {};
  candidateCountries.forEach((c, i) => {
    perCountry[c] = base + (i < remainder ? 1 : 0);
  });

  const pool = getProfessionPool(category, locale);
  if (!pool) {
    // No pool — slots carry country only.
    const slots: PersonaSlot[] = [];
    for (const [country, count] of Object.entries(perCountry)) {
      for (let i = 0; i < count; i++) slots.push({ country, profession: "" });
    }
    return slots;
  }

  const shuffled = shuffle(pool.archetypes, seedFromString(seed));
  const used = new Map<string, number>();
  const slots: PersonaSlot[] = [];
  let cursor = 0;

  for (const [country, count] of Object.entries(perCountry)) {
    for (let i = 0; i < count; i++) {
      // Find next archetype that hasn't hit its cap. Wrap if needed.
      let attempts = 0;
      let chosen = "";
      while (attempts < shuffled.length * 2) {
        const candidate = shuffled[cursor % shuffled.length];
        cursor++;
        attempts++;
        const cap = pool.caps[candidate] ?? Infinity;
        const usedCount = used.get(candidate) ?? 0;
        if (usedCount < cap) {
          used.set(candidate, usedCount + 1);
          chosen = candidate;
          break;
        }
      }
      // Fallback if all caps exhausted (should be rare — happens only when
      // personaCount > pool size + sum of caps): just use the next candidate.
      if (!chosen) {
        chosen = shuffled[cursor % shuffled.length];
        cursor++;
      }
      slots.push({ country, profession: chosen });
    }
  }
  return slots;
}
