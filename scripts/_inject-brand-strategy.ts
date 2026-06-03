/**
 * One-shot: inject v0.2-A brandStrategy hints into the 3 K-Beauty
 * methodology projects (Anua/Tirtir/BoJ) so we can re-sim and compare
 * against the baseline runs from the methodology v3 benchmark.
 *
 * Hints are at the brand's overseas-launch decision point — same
 * "no hindsight" rule as the description text.
 */
import { createClient } from "@supabase/supabase-js";

const TARGET_WORKSPACE = "0c8e774f-356a-4bf2-ba3d-8bfb41e6d019";

const STRATEGY = [
  {
    productName: "Anua Heartleaf Pore Control Cleansing Oil",
    founderBackground:
      "The Founders Inc subsidiary (창업 2017). Functional clean-beauty positioning with 어성초 77% as hero ingredient. Olive Young Korea bestseller in sensitive-skin category — not yet a global D2C brand at decision point.",
    channelPriority: "online_first",
    kolRelationships:
      "Olive Young Korea sensitive-skin authority + dermatology-aware K-beauty reviewers. Minimal Western influencer relationships pre-launch; Reddit r/AsianBeauty mentions starting to surface organically.",
  },
  {
    productName: "Tirtir Mask Fit Red Cushion",
    founderBackground:
      "D2C-native brand founded by influencer 이유빈 (group-buy origin 2017, TIRTIR Inc 법인 2019). Korean retail via Olive Young + Lotte Duty Free entry 2019. No traditional ATL marketing budget.",
    channelPriority: "online_first",
    kolRelationships:
      "Founder Lee Yu-bin's existing Instagram following + Korean beauty YouTube reviewers via Olive Young exposure. Group-buy customers act as word-of-mouth nucleus. No paid Western KOL contracts at decision point.",
  },
  {
    productName: "Beauty of Joseon Dynasty Cream",
    founderBackground:
      "Niche indie founded 2016 by Sumin Lee, acquired by Goodai Global 2019. ~$83K global revenue 2020 — micro-brand scale. Royal court Joseon heritage positioning (규합총서 reference).",
    channelPriority: "online_first",
    kolRelationships:
      "Strong organic Reddit r/AsianBeauty community + Western K-beauty YouTube reviewers (James Welsh era). Minimal Korea domestic marketing — overseas LLM-SEO surface is essentially the brand's only awareness channel.",
  },
] as const;

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  for (const s of STRATEGY) {
    const { data: existing, error: lookupErr } = await sb
      .from("projects")
      .select("id, founder_background, channel_priority, kol_relationships")
      .eq("workspace_id", TARGET_WORKSPACE)
      .eq("product_name", s.productName)
      .limit(1)
      .maybeSingle();
    if (lookupErr) {
      console.error(`✗ lookup ${s.productName}:`, lookupErr.message);
      continue;
    }
    if (!existing) {
      console.error(`✗ project not found: ${s.productName}`);
      continue;
    }

    const { error: updateErr } = await sb
      .from("projects")
      .update({
        founder_background: s.founderBackground,
        channel_priority: s.channelPriority,
        kol_relationships: s.kolRelationships,
      })
      .eq("id", existing.id);
    if (updateErr) {
      console.error(`✗ update ${s.productName}:`, updateErr.message);
      continue;
    }
    console.log(`+ ${(existing.id as string).slice(0, 8)} ${s.productName}`);
    console.log(`   founder:  ${s.founderBackground.slice(0, 80)}...`);
    console.log(`   channel:  ${s.channelPriority}`);
    console.log(`   kol:      ${s.kolRelationships.slice(0, 80)}...\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
