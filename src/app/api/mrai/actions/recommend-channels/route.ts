import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { recommendChannels } from "@/lib/mrai/agents/channel-recommender";
import { withLLMContext } from "@/lib/llm-context";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const Body = z.object({
  countries: z.array(z.string().length(2)).min(1).max(6),
  ensembleId: z.string().uuid().nullable().optional(),
  productName: z.string().max(200).optional(),
  category: z.string().max(80).optional(),
  locale: z.enum(["ko", "en"]).default("ko"),
});

/**
 * POST /api/mrai/actions/recommend-channels
 *
 * Body: { countries, ensembleId?, productName?, category? }
 * Returns: { recommendations: [...], inserted }
 *
 * Curates marketing channels per target country and saves them to
 * mrai_channel_recommendations so the chat card + future content
 * generator can read from a stable list.
 */
export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await withLLMContext(
      {
        workspaceId: ctx.workspaceId,
        stageLabel: "mrai-recommend-channels",
        ensembleId: parsed.data.ensembleId ?? undefined,
      },
      () =>
        recommendChannels({
          workspaceId: ctx.workspaceId,
          ensembleId: parsed.data.ensembleId ?? null,
          countries: parsed.data.countries,
          productName: parsed.data.productName,
          category: parsed.data.category,
          locale: parsed.data.locale,
        }),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    console.error("[mrai/actions/recommend-channels]", msg);
    return NextResponse.json(
      { error: "recommend_failed", detail: msg },
      { status: 500 },
    );
  }
}
