import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth + email confirmation callback. Lives outside the [locale] segment so the
// redirect URL we hand to Supabase is locale-stable.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
