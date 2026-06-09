"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link2, Loader2, Plug, RefreshCw, Trash2 } from "lucide-react";

type Provider = "hubspot" | "linkedin" | "x";

type Integration = {
  provider: Provider;
  account_id: string | null;
  account_label: string | null;
  connected_at: string;
  updated_at: string;
};

type Signal = { summary: string; fetched_at: string };

export function IntegrationsPanel({
  initialFlash,
  locale,
}: {
  initialFlash: { kind: "ok" | "error"; detail?: string } | null;
  locale: "ko" | "en";
}) {
  const t = useTranslations("mrai.integrations");
  const tProv = useTranslations("mrai.integrations.providers");

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [latestSignal, setLatestSignal] = useState<Record<string, Signal>>({});
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialFlash?.kind === "error" ? initialFlash.detail ?? "error" : null);
  const [toast, setToast] = useState<string | null>(initialFlash?.kind === "ok" ? t("successToast") : null);

  useEffect(() => {
    loadStatus();
    if (toast) {
      const tid = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(tid);
    }
  }, [toast]);

  async function loadStatus() {
    const res = await fetch("/api/mrai/integrations/status", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { integrations: Integration[]; latestSignal: Record<string, Signal> };
    setIntegrations(data.integrations);
    setLatestSignal(data.latestSignal);
  }

  function connect(provider: Provider) {
    // Top-level redirect — server handles OAuth bounce.
    window.location.href = `/api/mrai/integrations/${provider}/connect`;
  }

  async function disconnect(provider: Provider, accountId?: string | null) {
    if (!confirm(t("disconnectConfirm", { provider: tProv(provider) }))) return;
    const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
    const res = await fetch(`/api/mrai/integrations/${provider}/disconnect${qs}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setIntegrations((prev) =>
        prev.filter((i) =>
          accountId
            ? !(i.provider === provider && i.account_id === accountId)
            : i.provider !== provider,
        ),
      );
      if (!accountId) {
        setLatestSignal((prev) => {
          const next = { ...prev };
          delete next[provider];
          return next;
        });
      }
    }
  }

  async function sync(provider: "hubspot") {
    setSyncing(provider);
    setError(null);
    try {
      const res = await fetch(`/api/mrai/integrations/${provider}/sync`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "sync_failed");
      }
      const data = (await res.json()) as { dealCount: number; summary: string };
      setToast(t("syncedToast", { count: data.dealCount }));
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "sync_error");
    } finally {
      setSyncing(null);
    }
  }

  const hubspot = integrations.find((i) => i.provider === "hubspot");
  const hubspotSignal = latestSignal.hubspot;
  const linkedin = integrations.find((i) => i.provider === "linkedin");
  const xAccounts = integrations.filter((i) => i.provider === "x");

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-sky-50 to-white">
        <Plug className="w-4 h-4 text-sky-600" />
        <h2 className="text-sm font-semibold text-slate-900">{t("title")}</h2>
      </header>

      {(toast || error) && (
        <div className="px-5 pt-3">
          {toast && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 mb-2">
              {toast}
            </div>
          )}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-2">
              {t("errorToast")}: {error}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-5">
        {/* HubSpot card */}
        <div className="border border-slate-200 rounded-md p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded bg-orange-100 text-orange-700 font-bold text-xs">
              HS
            </span>
            <div className="font-semibold text-slate-900">{tProv("hubspot")}</div>
          </div>
          {hubspot ? (
            <>
              <div className="text-xs text-slate-500 mb-3">
                {hubspot.account_label
                  ? t("connectedAs", { label: hubspot.account_label })
                  : t("connectedAs", { label: "—" })}
              </div>
              {hubspotSignal && (
                <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 mb-3 leading-relaxed">
                  {hubspotSignal.summary}
                </p>
              )}
              <div className="text-[11px] text-slate-400 mb-3">
                {t("lastSyncedPrefix")}:{" "}
                {hubspotSignal
                  ? new Date(hubspotSignal.fetched_at).toLocaleString(locale === "ko" ? "ko-KR" : "en-US")
                  : t("lastSyncNever")}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => sync("hubspot")}
                  disabled={syncing === "hubspot"}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 rounded"
                >
                  {syncing === "hubspot" ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {t("syncing")}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3" />
                      {t("syncNow")}
                    </>
                  )}
                </button>
                <button
                  onClick={() => disconnect("hubspot")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-3 h-3" />
                  {t("disconnect")}
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => connect("hubspot")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 rounded"
            >
              <Link2 className="w-3 h-3" />
              {t("connect")}
            </button>
          )}
        </div>

        {/* LinkedIn — publish channel */}
        <PublishChannelCard
          name={tProv("linkedin")}
          badge="in"
          badgeClass="bg-blue-100 text-blue-700"
          connectClass="bg-blue-600 hover:bg-blue-700"
          integration={linkedin ?? null}
          locale={locale}
          connectedAs={(label) => t("connectedAs", { label })}
          connectLabel={t("connect")}
          disconnectLabel={t("disconnect")}
          publishHint={t("publishHint")}
          onConnect={() => connect("linkedin")}
          onDisconnect={() => disconnect("linkedin")}
        />

        {/* X (Twitter) — multi-account publish channel (브랜드/시장별) */}
        <XMultiAccountCard
          accounts={xAccounts}
          locale={locale}
          connectedAs={(label) => t("connectedAs", { label })}
          connectLabel={t("connect")}
          addLabel={locale === "ko" ? "계정 추가" : "Add account"}
          disconnectLabel={t("disconnect")}
          publishHint={t("publishHint")}
          onConnect={() => connect("x")}
          onDisconnect={(accountId) => disconnect("x", accountId)}
        />
      </div>
    </section>
  );
}

/**
 * Publish-only OAuth channel card (LinkedIn / X). Unlike HubSpot these
 * have no sync/signal step — they're write-only outbound channels, so
 * the card just shows connect / connected-account / disconnect.
 */
function PublishChannelCard({
  name,
  badge,
  badgeClass,
  connectClass,
  integration,
  locale,
  connectedAs,
  connectLabel,
  disconnectLabel,
  publishHint,
  onConnect,
  onDisconnect,
}: {
  name: string;
  badge: string;
  badgeClass: string;
  connectClass: string;
  integration: Integration | null;
  locale: "ko" | "en";
  connectedAs: (label: string) => string;
  connectLabel: string;
  disconnectLabel: string;
  publishHint: string;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="border border-slate-200 rounded-md p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`inline-flex items-center justify-center w-8 h-8 rounded font-bold text-xs ${badgeClass}`}
        >
          {badge}
        </span>
        <div className="font-semibold text-slate-900">{name}</div>
      </div>
      {integration ? (
        <>
          <div className="text-xs text-slate-500 mb-1">
            {connectedAs(integration.account_label || "—")}
          </div>
          <div className="text-[11px] text-slate-400 mb-3">
            {new Date(integration.connected_at).toLocaleString(
              locale === "ko" ? "ko-KR" : "en-US",
            )}
          </div>
          <button
            onClick={onDisconnect}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded"
          >
            <Trash2 className="w-3 h-3" />
            {disconnectLabel}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-500 leading-relaxed mb-3">
            {publishHint}
          </p>
          <button
            onClick={onConnect}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded ${connectClass}`}
          >
            <Link2 className="w-3 h-3" />
            {connectLabel}
          </button>
        </>
      )}
    </div>
  );
}

/**
 * X (Twitter) card supporting MULTIPLE connected accounts per workspace
 * (e.g. @brand_us / @brand_kr for market-specific publishing). Lists each
 * connected account with its own disconnect, plus an "add account" action
 * that re-runs the OAuth flow. To connect a different handle the user must
 * be logged into THAT account on x.com first (an X OAuth constraint).
 */
function XMultiAccountCard({
  accounts,
  locale,
  connectedAs,
  connectLabel,
  addLabel,
  disconnectLabel,
  publishHint,
  onConnect,
  onDisconnect,
}: {
  accounts: Integration[];
  locale: "ko" | "en";
  connectedAs: (label: string) => string;
  connectLabel: string;
  addLabel: string;
  disconnectLabel: string;
  publishHint: string;
  onConnect: () => void;
  onDisconnect: (accountId: string | null) => void;
}) {
  return (
    <div className="border border-slate-200 rounded-md p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded font-bold text-xs bg-slate-900 text-white">
          𝕏
        </span>
        <div className="font-semibold text-slate-900">X (Twitter)</div>
        {accounts.length > 0 && (
          <span className="ml-auto text-[11px] text-slate-400">
            {locale === "ko" ? `${accounts.length}개 계정` : `${accounts.length} accounts`}
          </span>
        )}
      </div>

      {accounts.length === 0 ? (
        <p className="text-xs text-slate-500 leading-relaxed mb-3">{publishHint}</p>
      ) : (
        <ul className="space-y-2 mb-3">
          {accounts.map((a) => (
            <li
              key={a.account_id ?? a.connected_at}
              className="flex items-center justify-between gap-2 border border-slate-100 rounded px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <div className="text-xs text-slate-700 truncate">
                  {connectedAs(a.account_label || "—")}
                </div>
                <div className="text-[10px] text-slate-400">
                  {new Date(a.connected_at).toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}
                </div>
              </div>
              <button
                onClick={() => onDisconnect(a.account_id)}
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-3 h-3" />
                {disconnectLabel}
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={onConnect}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded bg-slate-900 hover:bg-black"
      >
        <Link2 className="w-3 h-3" />
        {accounts.length === 0 ? connectLabel : addLabel}
      </button>
    </div>
  );
}
