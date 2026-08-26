import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LogoMark } from "@/components/ui/Logo";
import { AcceptInvite } from "@/components/team/AcceptInvite";
import { getCurrentUser, normalizeEmail, peekInvitation } from "@/lib/team";

export const dynamic = "force-dynamic";

/**
 * Seat-invitation landing page.
 *
 * Accepting is a POST from the client component below, never a side effect
 * of this render — a link preview or prefetch must not silently join
 * someone to a workspace.
 *
 * Four states are possible here: the token is bad/expired, the visitor is
 * signed out, the visitor is signed in as the wrong person, or everything
 * lines up and they can join.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("invite");

  const [preview, me] = await Promise.all([
    peekInvitation(token),
    getCurrentUser(),
  ]);

  const nextPath = `/${locale}/invite/${encodeURIComponent(token)}`;

  if (preview.state !== "pending") {
    return (
      <Shell title={t("title")}>
        <p className="text-sm text-slate-600 leading-relaxed">
          {preview.state === "expired" ? t("expired") : preview.state === "used" ? t("used") : t("notFound")}
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {t("goToApp")}
        </Link>
      </Shell>
    );
  }

  const roleLabel = t(`roles.${preview.role}` as "roles.analyst");

  if (!me) {
    return (
      <Shell title={t("title")}>
        <Summary
          workspace={preview.workspaceName}
          roleLabel={roleLabel}
          email={preview.email}
          emailNote={t("signedOutNote", { email: preview.email })}
        />
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={`/login?next=${encodeURIComponent(nextPath)}`}
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {t("loginCta")}
          </Link>
          <Link
            href={`/signup?next=${encodeURIComponent(nextPath)}`}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t("signupCta")}
          </Link>
        </div>
      </Shell>
    );
  }

  if (normalizeEmail(me.email) !== preview.email) {
    return (
      <Shell title={t("title")}>
        <Summary
          workspace={preview.workspaceName}
          roleLabel={roleLabel}
          email={preview.email}
          emailNote={t("mismatch", { invited: preview.email, current: me.email })}
        />
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center justify-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t("goToApp")}
        </Link>
      </Shell>
    );
  }

  return (
    <Shell title={t("title")}>
      <Summary
        workspace={preview.workspaceName}
        roleLabel={roleLabel}
        email={preview.email}
      />
      <AcceptInvite token={token} />
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-2.5 mb-6">
          <LogoMark className="w-7 h-7 text-[#0A1F4D]" />
          <span className="text-sm font-semibold tracking-tight text-[#0A1F4D]">
            AI Market Twin
          </span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 mb-3">
          {title}
        </h1>
        {children}
      </div>
    </main>
  );
}

function Summary({
  workspace,
  roleLabel,
  email,
  emailNote,
}: {
  workspace: string;
  roleLabel: string;
  email: string;
  emailNote?: string;
}) {
  return (
    <>
      <dl className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
        <Row label="Workspace" value={workspace} />
        <Row label="Role" value={roleLabel} />
        <Row label="Email" value={email} />
      </dl>
      {emailNote ? (
        <p className="mt-4 text-sm leading-relaxed text-slate-600">{emailNote}</p>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900 truncate">{value}</dd>
    </div>
  );
}
