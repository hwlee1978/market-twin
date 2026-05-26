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
  audienceTotal: number;       // workspace persona count for this market
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
 * Reach curve — % of total expected reach (= followers + spillover via
 * recommendations) achieved by day N.
 * Modeled as a saturation curve: fast ramp then long tail.
 */
function cumulativeReachPct(dayN: number): number {
  if (dayN < 0) return 0;
  const milestones: Array<[number, number]> = [
    [0, 35],
    [1, 55],
    [2, 70],
    [3, 80],
    [4, 86],
    [5, 90],
    [6, 93],
  ];
  for (const [d, pct] of milestones) {
    if (dayN <= d) return pct;
  }
  if (dayN <= 13) return 93 + (dayN - 6) * 1;
  if (dayN <= 30) return 100 - Math.max(0, 7 - (dayN - 13) * 0.3);
  return 100;
}

function jitter(base: number, pct: number): number {
  const j = base * pct * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(base + j));
}

export function computeTickDelta(input: EngagementInputs): TickDelta {
  const totalExpectedReach = Math.max(input.audienceTotal, 100);
  const cumPctNow = cumulativeReachPct(input.daysSincePublish);
  const cumPct = Math.max(input.prevCumulativePct, cumPctNow); // never go backwards
  const deltaPct = Math.max(0, cumPct - input.prevCumulativePct);

  const newViewsBase = Math.round((deltaPct / 100) * totalExpectedReach);
  const newViews = jitter(newViewsBase, 0.15);

  // Engagement rates apply to views, then add stochastic noise.
  const newLikes = jitter(Math.round((input.likeRate / 100) * newViews), 0.2);
  const newComments = jitter(Math.round((input.commentRate / 100) * newViews), 0.3);
  const newShares = jitter(Math.round((input.shareRate / 100) * newViews), 0.3);
  const newSaves = jitter(Math.round((input.saveRate / 100) * newViews), 0.25);

  // Follow conversion: 1-3% of engaged viewers (likes ∪ saves) follow.
  const engaged = Math.max(newLikes, newSaves);
  const followConversion = 0.012 + Math.random() * 0.022;
  const newFollows = Math.round(engaged * followConversion);

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
