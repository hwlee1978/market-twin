import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { ShareViewer } from "@/components/share/ShareViewer";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";

export const dynamic = "force-dynamic";

/**
 * Public read-only ensemble result viewer.
 *
 * Resolves the URL token against ensembles.share_token + share_expires_at;
 * if valid, renders a stripped-down EnsembleDashboard (no PDF download
 * button, no run-new-analysis button, no auth required). If the token
 * doesn't exist or has expired, shows 404 — we don't differentiate the
 * two cases since both should land the user at "this link doesn't work."
 *
 * Service role used because there's no authenticated session — RLS
 * would otherwise reject the read. Workspace ownership doesn't matter
 * here: possession of the token is the access proof.
 */
export default async function SharedEnsemblePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const admin = createServiceClient();
  const { data: ensemble } = await admin
    .from("ensembles")
    .select(
      "id, status, tier, parallel_sims, per_sim_personas, llm_providers, aggregate_result, completed_at, share_expires_at, project_id",
    )
    .eq("share_token", token)
    .single();

  if (!ensemble || !ensemble.share_expires_at) {
    notFound();
  }
  if (new Date(ensemble.share_expires_at).getTime() < Date.now()) {
    notFound();
  }
  if (ensemble.status !== "completed" || !ensemble.aggregate_result) {
    notFound();
  }

  const { data: project } = await admin
    .from("projects")
    .select(
      "name, product_name, category, description, base_price_cents, currency, objective, originating_country, candidate_countries",
    )
    .eq("id", ensemble.project_id)
    .single();

  return (
    <ShareViewer
      locale={locale}
      ensemble={{
        id: ensemble.id,
        tier: ensemble.tier as
          | "hypothesis"
          | "decision"
          | "decision_plus"
          | "deep"
          | "deep_pro",
        parallel_sims: ensemble.parallel_sims,
        per_sim_personas: ensemble.per_sim_personas,
        llm_providers: ensemble.llm_providers ?? ["anthropic"],
        aggregate: ensemble.aggregate_result as EnsembleAggregate,
        completed_at: ensemble.completed_at,
        project: project ?? null,
      }}
      shareExpiresAt={ensemble.share_expires_at}
    />
  );
}
