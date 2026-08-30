import type { ProjectInput } from "./schemas";

/**
 * Shape of the `projects` columns every simulation entry point reads back.
 * Loose on purpose — callers select different column subsets (the secondary
 * routes skip the per-country GTM arrays), so everything is optional.
 */
export interface ProjectBrandStrategyRow {
  founder_background?: string | null;
  channel_priority?: string | null;
  kol_relationships?: string | null;
  existing_markets?: string[] | null;
  partner_markets?: string[] | null;
  network_markets?: string[] | null;
}

/**
 * Rebuild `ProjectInput.brandStrategy` from a DB row, or undefined when the
 * user never opened the wizard's hint section.
 *
 * Extracted because this mapping was copy-pasted across the orchestrator and
 * the four secondary-analysis routes, and the inline run-ensemble path had
 * quietly omitted it — a wizard-entered partner market silently vanished
 * whenever the Cloud Run dispatch fell back to inline orchestration.
 */
export function brandStrategyFromRow(
  row: ProjectBrandStrategyRow | Record<string, unknown> | null | undefined,
): ProjectInput["brandStrategy"] | undefined {
  if (!row) return undefined;
  const r = row as ProjectBrandStrategyRow;
  const founderBackground = r.founder_background ?? null;
  const channelPriority = r.channel_priority ?? null;
  const kolRelationships = r.kol_relationships ?? null;
  const existingMarkets = r.existing_markets ?? null;
  const partnerMarkets = r.partner_markets ?? null;
  const networkMarkets = r.network_markets ?? null;
  if (
    !founderBackground &&
    !channelPriority &&
    !kolRelationships &&
    !existingMarkets?.length &&
    !partnerMarkets?.length &&
    !networkMarkets?.length
  ) {
    return undefined;
  }
  return {
    ...(founderBackground ? { founderBackground } : {}),
    ...(channelPriority
      ? {
          channelPriority: channelPriority as NonNullable<
            ProjectInput["brandStrategy"]
          >["channelPriority"],
        }
      : {}),
    ...(kolRelationships ? { kolRelationships } : {}),
    ...(existingMarkets?.length ? { existingMarkets } : {}),
    ...(partnerMarkets?.length ? { partnerMarkets } : {}),
    ...(networkMarkets?.length ? { networkMarkets } : {}),
  };
}
