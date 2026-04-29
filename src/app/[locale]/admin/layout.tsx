import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { AdminShell } from "@/components/AdminShell";
import { getAdminContext } from "@/lib/admin";

// Next 16's typed routes infer LayoutProps' params as Promise<unknown> for
// nested dynamic routes that don't directly own the segment, so we cast the
// resolved object instead of relying on inference here.
export default async function AdminLayout(props: {
  children: React.ReactNode;
  params: Promise<unknown>;
}) {
  const { locale } = (await props.params) as { locale: string };
  setRequestLocale(locale);

  const ctx = await getAdminContext();
  // Non-admins (or logged-out users) get bounced back to the regular dashboard.
  // The middleware already enforces login, so a logged-in non-admin landing on
  // /admin shouldn't see anything resembling admin UI.
  if (!ctx) redirect({ href: "/dashboard", locale });

  return (
    <AdminShell userEmail={ctx!.email} role={ctx!.role}>
      {props.children}
    </AdminShell>
  );
}
