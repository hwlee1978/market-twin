/**
 * 국가 랭킹 프롬프트에 페르소나 요약을 넣을지 여부.
 *
 * 기본(포함)은 원래 설계다 — 1,200명의 반응을 국가 단계가 읽고 순위를 정한다.
 * 그런데 2026-09-13 측정에서 이 블록이 순위 정확도를 깎는 것으로 나왔다.
 * 프롬프트에서 이 블록 하나만 빼고 나머지를 동일하게 두었을 때(N=19,
 * scripts/_rank-first-nopersona.ts):
 *
 *     페르소나 포함   top-1 42% · top-2 63% · top-3 74%
 *     페르소나 제외   top-1 68% · top-2 79% · top-3 95%
 *
 * top-1 +5건, top-3 +4건으로 노이즈(±1건)를 크게 벗어난다. 같은 날 앞선
 * 실험들에서 집계 방식(holistic-ranking.ts)·가중치(_rescore-collinearity.ts)·
 * 채점 루브릭(_rank-first.ts)은 모두 top-1을 움직이지 못했다. 남은 단일
 * 변수가 이것이었다.
 *
 * 해석 — 페르소나 풀 자체가 편향을 갖고 있고(페르소나 구매의향만으로 순위를
 * 매기면 top-1 21%, scripts/_rescore-persona-axis.ts), 그 요약을 국가
 * 프롬프트에 넣으면 모델이 그 편향을 따라간다.
 *
 * ⚠ 이 플래그는 "페르소나를 쓰지 말라"가 아니다. 페르소나는 리포트 서사와
 * 세그먼트 설명에서 그대로 쓰인다. 랭킹 입력에서만 뺀다.
 *
 * 끄기(권장 검증 후): SIM_RANK_WITHOUT_PERSONAS=on
 */
export function personaBlockInRankingEnabled(): boolean {
  return process.env.SIM_RANK_WITHOUT_PERSONAS !== "on";
}
