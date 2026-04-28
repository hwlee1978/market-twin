import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

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

  if (user) {
    redirect({ href: "/dashboard", locale });
  }
  redirect({ href: "/login", locale });
}
