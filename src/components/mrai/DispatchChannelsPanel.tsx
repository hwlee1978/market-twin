"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, Plus, Send, Trash2, Webhook, XCircle } from "lucide-react";
import { ErrorState, errMsg } from "./ErrorState";

type ChannelType = "slack_webhook" | "email" | "generic_webhook";

type Channel = {
  id: string;
  channel_type: ChannelType;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  send_briefing: boolean;
};

type Dispatch = {
  id: string;
  channel_id: string | null;
  source_type: string;
  status: "pending" | "sent" | "failed";
  error: string | null;
  dispatched_at: string;
};

export function DispatchChannelsPanel({ locale }: { locale: "ko" | "en" }) {
  const t = useTranslations("mrai.channels");
  const tField = useTranslations("mrai.channels.field");
  const tType = useTranslations("mrai.channels.type");

  const [channels, setChannels] = useState<Channel[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (toast) {
      const tid = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(tid);
    }
  }, [toast]);

  async function loadStatus() {
    const res = await fetch("/api/mrai/dispatch-channels", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { channels: Channel[]; dispatches: Dispatch[] };
    setChannels(data.channels);
    setDispatches(data.dispatches);
  }

  async function testChannel(id: string) {
    setBusy(`test-${id}`);
    try {
      const res = await fetch(`/api/mrai/dispatch-channels/${id}`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "test_failed");
      }
      setToast({ kind: "ok", text: t("testOk") });
      await loadStatus();
    } catch (e) {
      setToast({ kind: "error", text: `${t("testFailed")}: ${errMsg(e, "error")}` });
    } finally {
      setBusy(null);
    }
  }

  async function removeChannel(id: string) {
    if (!confirm(t("removeConfirm"))) return;
    setBusy(`del-${id}`);
    const res = await fetch(`/api/mrai/dispatch-channels/${id}`, { method: "DELETE" });
    if (res.ok) {
      setChannels((prev) => prev.filter((c) => c.id !== id));
    }
    setBusy(null);
  }

  function lastDispatchFor(channelId: string): Dispatch | undefined {
    return dispatches.find((d) => d.channel_id === channelId);
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-violet-50 to-white">
        <Webhook className="w-4 h-4 text-violet-600" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-slate-900">{t("title")}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-md"
        >
          <Plus className="w-3 h-3" />
          {t("addChannel")}
        </button>
      </header>

      {toast && (
        <div className={`px-5 pt-3`}>
          <div
            className={`text-sm rounded-md border px-3 py-2 ${
              toast.kind === "ok"
                ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                : "text-red-700 bg-red-50 border-red-200"
            }`}
          >
            {toast.text}
          </div>
        </div>
      )}

      <div className="px-5 py-4 space-y-2">
        {channels.length === 0 && !adding ? (
          <p className="text-sm text-slate-500 leading-relaxed">{t("empty")}</p>
        ) : (
          channels.map((c) => {
            const last = lastDispatchFor(c.id);
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 border border-slate-200 rounded-md px-3 py-2.5"
              >
                <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-violet-100 text-violet-700 text-[10px] font-semibold uppercase">
                  {c.channel_type === "slack_webhook" ? "SL" : c.channel_type === "email" ? "EM" : "WH"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{c.name}</div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2">
                    <span>{tType(c.channel_type)}</span>
                    {last && (
                      <>
                        <span>·</span>
                        {last.status === "sent" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="w-3 h-3" />
                            {new Date(last.dispatched_at).toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600">
                            <XCircle className="w-3 h-3" />
                            {last.error ?? "failed"}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => testChannel(c.id)}
                  disabled={busy === `test-${c.id}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-700 border border-slate-200 hover:bg-slate-50 rounded"
                >
                  {busy === `test-${c.id}` ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Send className="w-3 h-3" />
                  )}
                  {t("test")}
                </button>
                <button
                  onClick={() => removeChannel(c.id)}
                  disabled={busy === `del-${c.id}`}
                  className="inline-flex items-center justify-center w-7 h-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                  aria-label={t("remove")}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })
        )}

        {adding && (
          <AddChannelForm
            tField={tField}
            tType={tType}
            t={t}
            onCancel={() => setAdding(false)}
            onSaved={async () => {
              setAdding(false);
              await loadStatus();
            }}
          />
        )}
      </div>
    </section>
  );
}

function AddChannelForm({
  tField,
  tType,
  t,
  onCancel,
  onSaved,
}: {
  tField: (k: string) => string;
  tType: (k: string) => string;
  t: (k: string) => string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [channelType, setChannelType] = useState<ChannelType>("slack_webhook");
  const [name, setName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [genericUrl, setGenericUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const config =
      channelType === "slack_webhook"
        ? { webhookUrl }
        : channelType === "email"
        ? { emailTo }
        : { url: genericUrl };

    try {
      const res = await fetch("/api/mrai/dispatch-channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channelType, name, config, sendBriefing: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ? JSON.stringify(err.detail) : err.error || "save_failed");
      }
      onSaved();
    } catch (e) {
      setError(errMsg(e, "error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="border border-violet-200 bg-violet-50/30 rounded-md p-3 space-y-3"
    >
      <div className="flex items-center gap-2">
        {(["slack_webhook", "email", "generic_webhook"] as ChannelType[]).map((c) => (
          <button
            type="button"
            key={c}
            onClick={() => setChannelType(c)}
            className={`px-3 py-1.5 text-xs rounded ${
              channelType === c
                ? "bg-violet-600 text-white"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {tType(c)}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={tField("name")}
        required
        className="w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
      />

      {channelType === "slack_webhook" && (
        <>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder={tField("webhookUrl")}
            required
            className="w-full text-sm font-mono border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
          <p className="text-[11px] text-slate-500 leading-relaxed">{t("slackHelp")}</p>
        </>
      )}

      {channelType === "email" && (
        <>
          <input
            type="email"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            placeholder={tField("emailTo")}
            required
            className="w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
          <p className="text-[11px] text-slate-500 leading-relaxed">{t("emailHelp")}</p>
        </>
      )}

      {channelType === "generic_webhook" && (
        <input
          type="url"
          value={genericUrl}
          onChange={(e) => setGenericUrl(e.target.value)}
          placeholder={tField("url")}
          required
          className="w-full text-sm font-mono border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
        />
      )}

      {error && (
        <ErrorState title="채널 작업 오류" description={error} variant="inline" />
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 rounded"
        >
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          {t("save")}
        </button>
      </div>
    </form>
  );
}
