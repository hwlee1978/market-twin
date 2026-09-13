/**
 * 랭킹 주체 플래그 — 국가 순위를 누가 정하는가.
 *
 * 기본(off): LLM이 낸 finalScore를 버리고 6개 컴포넌트의 고정 가중합으로
 * 다시 계산한다(FINAL_SCORE_WEIGHTS).
 * on: LLM이 낸 finalScore를 그대로 순위에 쓰고, 컴포넌트는 근거 표시용으로만
 * 남긴다. 규제 하한 캡은 두 모드 모두 적용된다(진입 차단 요인은 안전장치).
 *
 * 근거 — 2026-09-13 절제 실험(N=19, scripts/_ablation-2x2.ts):
 *   현행 엔진            top-1 47%
 *   같은 모델·같은 그라운딩으로 총체적 랭킹만 시킨 경우  top-1 68%
 * 엔진은 브랜드 정보와 그라운딩을 둘 다 갖고도 둘 다 없는 조건(47%)과 같은
 * 점수였다. 손실 지점이 이 재계산 단계로 특정됐다.
 * 함께 보라: scripts/_rescore-collinearity.ts — marketSize와 나머지 5개가
 * 음의 상관(-0.25~-0.53)이라 가중합 안에서 서로 상쇄된다.
 *
 * 켜기: SIM_HOLISTIC_RANKING=on  (env 한 줄, 즉시 롤백 가능)
 */
export function holisticRankingEnabled(): boolean {
  return process.env.SIM_HOLISTIC_RANKING === "on";
}
