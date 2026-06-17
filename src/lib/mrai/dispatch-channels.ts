import { createServiceClient } from "@/lib/supabase/server";

/**
 * Mr. AI Channel Auto-Publish — adapters + dispatch + log.
 *
 * Adapters speak a tiny common shape: take a formatted payload, push it
 * to the destination, return ok|error. The orchestrator picks the right
 * adapter based on channel.channel_type, formats per-channel (Slack
 * uses blocks; email uses HTML), writes a mrai_dispatches row.
 *
 * Auto-trigger: briefing.ts calls dispatchToAllChannels() after each
 * generate, sending to all enabled channels with send_briefing=true.
 */

export type ChannelType = "slack_webhook" | "email" | "generic_webhook";
export type DispatchSourceType = "briefing" | "chat_message" | "manual" | "test";

export interface ChannelRow {
  id: string;
  workspace_id: string;
  channel_type: ChannelType;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  send_briefing: boolean;
}

export interface DispatchPayload {
  /** Plain-text title shown in Slack message, email subject, etc. */
  title: string;
  /** Markdown body for Slack/email. Raw text fallback for webhook. */
  body: string;
  /** Optional URL the recipient can click to open the original (briefing page, etc.) */
  link?: string;
}

interface AdapterResult {
  ok: boolean;
  error?: string;
}

// ---------- adapters ----------

async function sendSlackWebhook(
  config: Record<string, unknown>,
  payload: DispatchPayload,
): Promise<AdapterResult> {
  const url = typeof config.webhookUrl === "string" ? config.webhookUrl : "";
  if (!url || !/^https:\/\/hooks\.slack\.com\//.test(url)) {
    return { ok: false, error: "invalid slack webhook url" };
  }

  // Slack Block Kit — title as section, body as mrkdwn. Click link as
  // accessory if provided. Keep it small so mobile renders well.
  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: payload.title.slice(0, 150), emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: payload.body.slice(0, 2900) },
    },
  ];
  if (payload.link) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open in Mr. AI" },
          url: payload.link,
        },
      ],
    });
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: payload.title, blocks }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `slack ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

async function sendEmail(
  config: Record<string, unknown>,
  payload: DispatchPayload,
): Promise<AdapterResult> {
  const to = typeof config.emailTo === "string" ? config.emailTo : "";
  if (!to || !/.+@.+\..+/.test(to)) {
    return { ok: false, error: "invalid email recipient" };
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set" };
  }
  const from = process.env.RESEND_FROM || "Mr. AI <noreply@markettwin.ai>";

  // Convert markdown-ish body to minimal HTML — newlines become <br>,
  // bullets to <li>. Good enough for CEO morning brief.
  const html = `<div style="font-family:system-ui,sans-serif;max-width:600px;line-height:1.6;color:#1e293b;">
    <h2 style="color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">${escapeHtml(payload.title)}</h2>
    <div>${markdownToHtml(payload.body)}</div>
    ${payload.link ? `<p style="margin-top:24px;"><a href="${escapeAttr(payload.link)}" style="color:#f59e0b;font-weight:600;">Open in Mr. AI →</a></p>` : ""}
  </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: payload.title.slice(0, 200),
        html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

async function sendGenericWebhook(
  config: Record<string, unknown>,
  payload: DispatchPayload,
): Promise<AdapterResult> {
  const url = typeof config.url === "string" ? config.url : "";
  if (!url || !/^https?:\/\//.test(url)) {
    return { ok: false, error: "invalid webhook url" };
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  const extra = config.headers && typeof config.headers === "object" ? config.headers : {};
  for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
    if (typeof v === "string") headers[k] = v;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        source: "mr-ai",
        title: payload.title,
        body: payload.body,
        link: payload.link,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `webhook ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

// ---------- helpers ----------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function markdownToHtml(md: string): string {
  // Tiny converter — enough for the briefing markdown we produce
  // (## headers, - bullets). Not a general-purpose md parser.
  const escaped = escapeHtml(md);
  const lines = escaped.split("\n");
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^##\s+/.test(t)) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(`<h3 style="color:#92400e;margin-top:20px;">${t.replace(/^##\s+/, "")}</h3>`);
    } else if (/^-\s+/.test(t)) {
      if (!inList) {
        out.push('<ul style="padding-left:20px;">');
        inList = true;
      }
      // Bold **text** → <strong>
      const content = t
        .replace(/^-\s+/, "")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      out.push(`<li>${content}</li>`);
    } else if (t === "" || /^-{3,}$/.test(t)) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (t === "") out.push("<br>");
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(`<p>${t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

// ---------- public API ----------

export async function dispatchToChannel(input: {
  channel: ChannelRow;
  payload: DispatchPayload;
  sourceType: DispatchSourceType;
  sourceId?: string | null;
}): Promise<{ ok: boolean; error?: string; dispatchId: string }> {
  if (!input.channel.enabled) {
    return { ok: false, error: "channel disabled", dispatchId: "" };
  }

  let result: AdapterResult;
  switch (input.channel.channel_type) {
    case "slack_webhook":
      result = await sendSlackWebhook(input.channel.config, input.payload);
      break;
    case "email":
      result = await sendEmail(input.channel.config, input.payload);
      break;
    case "generic_webhook":
      result = await sendGenericWebhook(input.channel.config, input.payload);
      break;
    default:
      result = { ok: false, error: "unknown channel type" };
  }

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("mrai_dispatches")
    .insert({
      workspace_id: input.channel.workspace_id,
      channel_id: input.channel.id,
      source_type: input.sourceType,
      source_id: input.sourceId ?? null,
      status: result.ok ? "sent" : "failed",
      error: result.error ?? null,
    })
    .select("id")
    .single();

  return {
    ok: result.ok,
    error: result.error,
    dispatchId: (row?.id as string) ?? "",
  };
}

/**
 * Fan-out a payload to every enabled channel for this workspace that
 * opts into the given event. Used by briefing auto-dispatch.
 */
export async function dispatchToAllChannels(input: {
  workspaceId: string;
  event: "briefing";
  payload: DispatchPayload;
  sourceId?: string | null;
}): Promise<Array<{ channelId: string; channelName: string; ok: boolean; error?: string }>> {
  const supabase = createServiceClient();

  const filterColumn = input.event === "briefing" ? "send_briefing" : "send_briefing";
  const { data } = await supabase
    .from("mrai_channels")
    .select("id, workspace_id, channel_type, name, config, enabled, send_briefing")
    .eq("workspace_id", input.workspaceId)
    .eq("enabled", true)
    .eq(filterColumn, true);

  const channels = (data ?? []) as ChannelRow[];
  if (channels.length === 0) return [];

  // Sequential — channel APIs (Slack, Resend) have soft per-app rate
  // limits. Parallel would mostly win for >10 channels which we won't
  // have for a long time.
  const results: Array<{ channelId: string; channelName: string; ok: boolean; error?: string }> = [];
  for (const ch of channels) {
    const r = await dispatchToChannel({
      channel: ch,
      payload: input.payload,
      sourceType: input.event,
      sourceId: input.sourceId ?? null,
    });
    results.push({ channelId: ch.id, channelName: ch.name, ok: r.ok, error: r.error });
  }
  return results;
}

export async function listChannels(workspaceId: string): Promise<ChannelRow[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("mrai_channels")
    .select("id, workspace_id, channel_type, name, config, enabled, send_briefing")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ChannelRow[];
}

export async function listRecentDispatches(
  workspaceId: string,
  limit = 20,
): Promise<
  Array<{
    id: string;
    channel_id: string | null;
    source_type: DispatchSourceType;
    status: "pending" | "sent" | "failed";
    error: string | null;
    dispatched_at: string;
  }>
> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("mrai_dispatches")
    .select("id, channel_id, source_type, status, error, dispatched_at")
    .eq("workspace_id", workspaceId)
    .order("dispatched_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Array<{
    id: string;
    channel_id: string | null;
    source_type: DispatchSourceType;
    status: "pending" | "sent" | "failed";
    error: string | null;
    dispatched_at: string;
  }>;
}
