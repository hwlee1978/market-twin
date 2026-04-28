import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function BillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("nav.billing")}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { name: "Starter", price: "$299", quota: "3 reports / mo" },
          { name: "Growth", price: "$999", quota: "Unlimited reports" },
          { name: "Enterprise", price: "$5,000+", quota: "API + custom models" },
        ].map((plan) => (
          <div key={plan.name} className="card">
            <div className="text-xs uppercase tracking-wide text-slate-500">{plan.name}</div>
            <div className="mt-2 text-3xl font-semibold">{plan.price}</div>
            <div className="mt-1 text-xs text-slate-500">/ month</div>
            <div className="mt-4 text-sm text-slate-700">{plan.quota}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">Stripe checkout integration arrives in v0.2.</p>
    </div>
  );
}
