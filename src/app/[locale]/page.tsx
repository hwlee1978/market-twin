import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Root route — pure redirect. Marketing / sales lives separately on
 * markettwin.ai, so this domain doesn't double as a landing page.
 *
 * Logged-in user → /dashboard
 * Anonymous user → /login
 */
export default async function RootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect({ href: "/dashboard", locale });
  redirect({ href: "/login", locale });
}
