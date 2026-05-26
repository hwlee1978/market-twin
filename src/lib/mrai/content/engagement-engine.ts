/**
 * Engagement growth model — simulates how a virtual publication
 * accumulates views/likes/comments/shares/followers over time.
 *
 * Inputs (from the most recent persona-reaction simulation on the
 * draft this publication is for):
 *   • like_rate, click_rate, share_rate, save_rate, comment_rate
 *   • reaction_distribution (love/like/neutral/dislike/ignore)
 *
 * Decay curve (cumulative % of total expected reach by day):
 *   Day 1 (publish day) → 35%   (algorithm push)
 *   Day 2               → 55%
 *   Day 3               → 70%
 *   Day 4               → 80%
 *   Day 5               → 86%
 *   Day 6               → 90%
 *   Day 7               → 93%
 *   Day 8-14            → +1%/day
 *   Day 15+             → +0.3%/day until tail
 *
 * Each tick computes the DELTA between cumulative% at current day and
 * previous-tick day. That delta drives new_views; the rates project
 * the rest.
 *
 * Followers: a small fraction (1-3%) of people who hit "love" or
 * "save" become followers. This is the conversion path the user can
 * monitor over time.
 *
 * Stochastic noise: ±15% per tick keeps the curve from looking too
 * mechanical when rendered.
 */

export type EngagementInputs = {
  followerCount: number;        // real channel followers at tick time
  personaPoolCap: number;       // workspace persona count (max plausible reach)
  likeRate: number;             // 0-100
  clickRate: number;            // 0-100
  shareRate: number;            // 0-100
  saveRate: number;             // 0-100
  commentRate: number;          // 0-100
  daysSincePublish: number;     // 0 = first tick, 1 = day 2, etc.
  prevCumulativePct: number;    // 0-100, from previous tick's cumulative%
};

export type TickDelta = {
  day_n: number;
  ts: string;
  cumulative_pct: number;       // 0-100 — total reach % after this tick
  new_views: number;
  new_likes: number;
  new_comments: number;
  new_shares: number;
  new_saves: number;
  new_follows: number;
};

/**
 * Reach curve — % of total expected reach achieved by day N. Models a
 * realistic small-account: slow ramp on day 0 (algorithm tests the
 * content with a small explore-page sample), then growing exposure if
 * engagement signal is good.
 *
 * Modeled as a saturation curve: gradual ramp then long tail. New
 * accounts don't get a 35% day-0 push — that's only true for
 * established accounts with a large follower base.
 */
function cumulativeReachPct(dayN: number): number {
  if (dayN < 0) return 0;
  const milestones: Array<[number, number]> = [
    [0, 8],   // day 0: small initial explore push
    [1, 22],
    [2, 38],
    [3, 52],
    [4, 64],
    [5, 73],
    [6, 80],
    [7, 85],
  ];
  for (const [d, pct] of milestones) {
    if (dayN <= d) return pct;
  }
  if (dayN <= 14) return 85 + (dayN - 7) * 1.5;
  if (dayN <= 30) return Math.min(100, 95 + (dayN - 14) * 0.3);
  return 100;
}

/**
 * Compute the "total potential reach ceiling" for a post.
 *
 *   reach = follower_count × engagement_pull          (followers see it)
 *         + algorithm_spillover                        (explore/recs)
 *
 * For a brand-new account with 0 followers, this is just the algorithm
 * spillover (~30-80 views depending on quality signal). Once you have
 * real followers, reach scales with them. Capped at the workspace's
 * persona pool — that's the theoretical max audience that could plausibly
 * see this content.
 */
export function computeTotalReachCeiling(
  followerCount: number,
  personaPoolCap: number,
  likeRate: number,
): number {
  // Algorithm spillover scales with content quality (like_rate signal):
  // weak content (like_rate < 10%) → ~20-40 views from explore
  // strong content (like_rate > 30%) → ~80-200 views
  const spillover = Math.round(20 + likeRate * 4);
  const followerReach = Math.round(followerCount * (0.4 + likeRate / 250));
  const raw = followerReach + spillover;
  // Theoretical cap = the persona pool itself (can't reach more humans
  // than exist in the target market).
  return Math.max(1, Math.min(raw, personaPoolCap));
}

function jitter(base: number, pct: number): number {
  const j = base * pct * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(base + j));
}

/**
 * Match-quality factor — what fraction of viewers are well-targeted.
 *
 * Persona sim's like_rate represents "if this viewer IS the ideal
 * target, would they like?". But real platform reach includes a lot of
 * casual non-target viewers (algorithm broad-cast). So we discount the
 * sim's like_rate by a match factor that grows as the channel
 * accumulates followers (because the algorithm gets better at targeting
 * once it has engagement signal).
 *
 * Source: this matches the typical 2-7% per-view like rate observed
 * on real IG/X for small/medium accounts, vs the 20-40% persona-sim
 * like_rate which measures "engaged consideration".
 */
function matchQualityFactor(followerCount: number): number {
  if (followerCount < 50) return 0.16;   // brand new — algorithm guesses
  if (followerCount < 200) return 0.21;
  if (followerCount < 1000) return 0.28;
  if (followerCount < 5000) return 0.35;
  if (followerCount < 25000) return 0.42;
  return 0.48;
}

/**
 * Per-action vs per-like behavior dampers — comment / share / save are
 * harder than tapping like (more friction).
 */
const COMMENT_VS_LIKE = 0.18;
const SHARE_VS_LIKE = 0.25;
const SAVE_VS_LIKE = 0.55;

export function computeTickDelta(input: EngagementInputs): TickDelta {
  const totalExpectedReach = computeTotalReachCeiling(
    input.followerCount,
    input.personaPoolCap,
    input.likeRate,
  );
  const cumPctNow = cumulativeReachPct(input.daysSincePublish);
  const cumPct = Math.max(input.prevCumulativePct, cumPctNow); // never go backwards
  const deltaPct = Math.max(0, cumPct - input.prevCumulativePct);

  const newViewsBase = Math.round((deltaPct / 100) * totalExpectedReach);
  const newViews = jitter(newViewsBase, 0.18);

  // Apply match-quality factor: persona sim's "engaged consideration"
  // rate is discounted to a realistic per-view rate.
  const matchFactor = matchQualityFactor(input.followerCount);
  const effectiveLikeRate = input.likeRate * matchFactor;
  const effectiveCommentRate = input.commentRate * matchFactor * COMMENT_VS_LIKE;
  const effectiveShareRate = input.shareRate * matchFactor * SHARE_VS_LIKE;
  const effectiveSaveRate = input.saveRate * matchFactor * SAVE_VS_LIKE;

  const newLikes = jitter(Math.round((effectiveLikeRate / 100) * newViews), 0.22);
  const newComments = jitter(Math.round((effectiveCommentRate / 100) * newViews), 0.35);
  const newShares = jitter(Math.round((effectiveShareRate / 100) * newViews), 0.35);
  const newSaves = jitter(Math.round((effectiveSaveRate / 100) * newViews), 0.28);

  // Follow conversion — only NON-followers can follow. For brand-new
  // accounts most viewers are non-followers (algorithm explore = 100%
  // strangers). As follower base grows, mix shifts toward existing
  // followers seeing the post (who can't re-follow).
  const nonFollowerViewRatio =
    input.followerCount === 0
      ? 1.0
      : Math.max(0.3, 1 - input.followerCount / (input.followerCount + 200));
  const nonFollowerLikes = Math.round(newLikes * nonFollowerViewRatio);
  // Of non-followers who engaged enough to like, 5-12% follow.
  const followRate = input.followerCount < 100 ? 0.10 : 0.06;
  const newFollows = jitter(Math.round(nonFollowerLikes * followRate), 0.3);

  return {
    day_n: input.daysSincePublish,
    ts: new Date().toISOString(),
    cumulative_pct: cumPct,
    new_views: newViews,
    new_likes: newLikes,
    new_comments: newComments,
    new_shares: newShares,
    new_saves: newSaves,
    new_follows: newFollows,
  };
}

/**
 * Compute days since publish, integer days clamped to 0.
 */
export function daysSince(iso: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
