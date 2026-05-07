import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { resolveCompetitors } from "@/lib/simulation/competitor-resolver";

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  productName: z.string().min(1),
  category: z.string(),
  description: z.string().min(10),
  basePriceCents: z.number().int().nonnegative(),
  currency: z.string(),
  objective: z.enum(["awareness", "conversion", "retention", "expansion"]),
  // Defaults to KR — covers older clients that don't send the field yet.
  originatingCountry: z.string().default("KR"),
  candidateCountries: z.array(z.string()).min(1),
  /** Free-text competitor names typed by the user (one per textarea
   *  line). The server runs an LLM resolution pass to find URLs and
   *  add 2-3 more competitors before storing. */
  competitorNames: z.array(z.string()).default([]),
  competitorUrls: z.array(z.string().url()).default([]),
  /** Optional locale hint for the resolver's output language. */
  locale: z.enum(["ko", "en"]).default("ko"),
  assetDescriptions: z.array(z.string()).default([]),
  assetUrls: z.array(z.string().url()).default([]),
});

export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json(
      { error: `workspace_${ctx.status}` },
      { status: 403 },
    );
  }

  const body = await req.json();
  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // Competitor resolution — runs synchronously before persist so the
  // user lands on a project that already has the enriched competitor
  // list. Adds ~3-8s to wizard submit (LLM + 2s HEAD validations in
  // parallel) but avoids "competitors are still loading" UI states.
  // Best-effort: if the resolver hits an error it falls back to the
  // user's raw input with empty URLs.
  const resolved = await resolveCompetitors({
    productName: input.productName,
    category: input.category,
    description: input.description,
    candidateCountries: input.candidateCountries,
    userNames: input.competitorNames,
    userUrls: input.competitorUrls,
    locale: input.locale,
  });
  // Derived competitor_urls — feeds the existing extraction pipeline
  // (puppeteer price scraper, country prompt). Empty URLs (LLM
  // couldn't find / validation failed) are dropped.
  const derivedCompetitorUrls = Array.from(
    new Set(
      resolved
        .map((c) => c.url)
        .filter((u) => u && /^https?:\/\//.test(u)),
    ),
  );

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      name: input.name,
      product_name: input.productName,
      category: input.category,
      description: input.description,
      base_price_cents: input.basePriceCents,
      currency: input.currency,
      objective: input.objective,
      originating_country: input.originatingCountry,
      candidate_countries: input.candidateCountries,
      competitor_urls: derivedCompetitorUrls,
      competitor_names_user: input.competitorNames,
      competitors_resolved: resolved,
      asset_descriptions: input.assetDescriptions,
      asset_urls: input.assetUrls,
      status: "ready",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projectId: data.id });
}
