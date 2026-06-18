import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Public beta feedback from the /beta landing page.
 *
 * POST → anonymous { rating?, category?, message, name?, email?, website? }.
 *
 * No auth required (the page is public). Spam is mitigated with a hidden
 * honeypot field (`website` — humans never fill it) and length limits. The
 * row is written with the service role so the table can stay locked down
 * (RLS-enabled, no policies); operators read it out of band. If the visitor
 * happens to be logged in we attach their user id for context.
 */

const FeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  category: z
    .enum(["bug", "idea", "usability", "pricing", "praise", "other"])
    .optional(),
  message: z.string().trim().min(1).max(2000),
  name: z.string().trim().max(100).optional(),
  email: z.string().trim().max(200).email().optional().or(z.literal("")),
  // Honeypot: must be empty. Bots auto-fill it.
  website: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Honeypot tripped → pretend success, drop silently.
  if (parsed.data.website && parsed.data.website.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  // Best-effort: attach the user id if they're signed in (anon is fine).
  let submittedBy: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    submittedBy = user?.id ?? null;
  } catch {
    // not signed in / no session — keep anonymous
  }

  const { rating, category, message, name, email } = parsed.data;

  const service = createServiceClient();
  const { error } = await service.from("beta_public_feedback").insert({
    rating: rating ?? null,
    category: category ?? null,
    message,
    name: name || null,
    email: email || null,
    locale: req.headers.get("x-locale") || null,
    user_agent: req.headers.get("user-agent")?.slice(0, 500) || null,
    submitted_by: submittedBy,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
