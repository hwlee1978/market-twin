import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  productName: z.string().min(1),
  category: z.string(),
  description: z.string().min(10),
  basePriceCents: z.number().int().nonnegative(),
  currency: z.string(),
  objective: z.enum(["awareness", "conversion", "retention", "expansion"]),
  candidateCountries: z.array(z.string()).min(1),
  competitorUrls: z.array(z.string().url()).default([]),
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
      candidate_countries: input.candidateCountries,
      competitor_urls: input.competitorUrls,
      status: "ready",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projectId: data.id });
}
