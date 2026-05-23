import { createServiceClient } from "@/lib/supabase/server";
import { getLLMProvider } from "@/lib/llm";

/**
 * HubSpot integration — OAuth + Deals/Contacts pull + LLM-summarized
 * signal storage.
 *
 * Env required (Vercel + .env.local):
 *   HUBSPOT_CLIENT_ID      — from your HubSpot dev app
 *   HUBSPOT_CLIENT_SECRET  — same
 *   APP_BASE_URL           — public origin used to build redirect URI,
 *                            e.g. https://markettwin.ai or http://localhost:3000
 *
 * The redirect URI you register with HubSpot must be:
 *   ${APP_BASE_URL}/api/mrai/integrations/hubspot/callback
 *
 * Scopes we request: crm.objects.deals.read, crm.objects.contacts.read,
 * crm.schemas.deals.read, oauth. Low-blast-radius — read only on the CRM
 * objects we need.
 */

export const HUBSPOT_SCOPES = [
  "crm.objects.deals.read",
  "crm.objects.contacts.read",
  "crm.schemas.deals.read",
  "oauth",
];

const AUTHORIZE_URL = "https://app.hubspot.com/oauth/authorize";
const TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";
const API_BASE = "https://api.hubapi.com";

export function hubspotRedirectUri(): string {
  const base = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/mrai/integrations/hubspot/callback`;
}

export function hubspotAuthorizeUrl(state: string): string {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  if (!clientId) throw new Error("HUBSPOT_CLIENT_ID not set");
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", hubspotRedirectUri());
  url.searchParams.set("scope", HUBSPOT_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface TokenMetaResponse {
  hub_id?: number;
  hub_domain?: string;
  user?: string;
  user_id?: number;
  scopes?: string[];
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("HUBSPOT_CLIENT_ID/SECRET not set");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: hubspotRedirectUri(),
    code,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`token exchange ${res.status}: ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("HUBSPOT_CLIENT_ID/SECRET not set");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`refresh ${res.status}: ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function fetchTokenMeta(accessToken: string): Promise<TokenMetaResponse> {
  const res = await fetch(`${API_BASE}/oauth/v1/access-tokens/${accessToken}`);
  if (!res.ok) return {};
  return (await res.json()) as TokenMetaResponse;
}

/**
 * Save a fresh OAuth grant for this workspace. Upserts on
 * (workspace_id, provider) so reconnecting overwrites the old row.
 */
export async function storeHubSpotTokens(input: {
  workspaceId: string;
  userId: string;
  tokens: TokenResponse;
}): Promise<void> {
  const supabase = createServiceClient();
  const expiresAt = new Date(Date.now() + input.tokens.expires_in * 1000).toISOString();
  const meta = await fetchTokenMeta(input.tokens.access_token).catch(
    (): TokenMetaResponse => ({}),
  );

  const row = {
    workspace_id: input.workspaceId,
    provider: "hubspot" as const,
    access_token: input.tokens.access_token,
    refresh_token: input.tokens.refresh_token,
    expires_at: expiresAt,
    scope: meta.scopes?.join(" ") ?? null,
    account_id: meta.hub_id ? String(meta.hub_id) : null,
    account_label: meta.hub_domain ?? meta.user ?? null,
    connected_by: input.userId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("mrai_integrations")
    .upsert(row, { onConflict: "workspace_id,provider" });
  if (error) throw new Error(`store tokens: ${error.message}`);
}

interface IntegrationRow {
  id: string;
  workspace_id: string;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  account_label: string | null;
}

/**
 * Get a fresh access token, refreshing it if it's within 60s of expiry.
 * Updates the row in-place when refresh happens.
 */
export async function getValidHubSpotToken(workspaceId: string): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("mrai_integrations")
    .select("id, workspace_id, provider, access_token, refresh_token, expires_at, account_label")
    .eq("workspace_id", workspaceId)
    .eq("provider", "hubspot")
    .maybeSingle();
  if (error) throw new Error(`load integration: ${error.message}`);
  if (!data) throw new Error("hubspot not connected for this workspace");
  const row = data as IntegrationRow;

  const expires = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expires - Date.now() > 60_000) return row.access_token;
  if (!row.refresh_token) throw new Error("token expired and no refresh_token");

  const refreshed = await refreshTokens(row.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  const { error: uErr } = await supabase
    .from("mrai_integrations")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (uErr) throw new Error(`update tokens: ${uErr.message}`);
  return refreshed.access_token;
}

interface HubSpotDeal {
  id: string;
  properties: Record<string, string | null>;
}

interface DealsListResponse {
  results: HubSpotDeal[];
  paging?: { next?: { after?: string } };
}

/**
 * Pull deals updated in the last `days` window. Limited to 100 most
 * recently changed — enough for a daily briefing snapshot, way short
 * of HubSpot's daily API quota.
 */
export async function fetchRecentDeals(
  accessToken: string,
  days = 30,
): Promise<HubSpotDeal[]> {
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

  const url = new URL(`${API_BASE}/crm/v3/objects/deals/search`);
  const body = {
    filterGroups: [
      {
        filters: [
          { propertyName: "hs_lastmodifieddate", operator: "GTE", value: String(sinceMs) },
        ],
      },
    ],
    sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
    properties: [
      "dealname",
      "dealstage",
      "amount",
      "pipeline",
      "closedate",
      "hs_lastmodifieddate",
      "hs_deal_stage_probability",
      "hubspot_owner_id",
    ],
    limit: 100,
  };

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`hubspot deals ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as DealsListResponse;
  return json.results ?? [];
}

/**
 * Run a full HubSpot sync for a workspace: refresh-if-needed → fetch
 * deals → LLM-summarize → store as a signal row.
 *
 * Returns the signal row that was inserted so the UI can show "last
 * sync N deals" feedback without a second query.
 */
export async function syncHubSpotForWorkspace(workspaceId: string): Promise<{
  signalId: string;
  dealCount: number;
  summary: string;
}> {
  const accessToken = await getValidHubSpotToken(workspaceId);
  const deals = await fetchRecentDeals(accessToken);

  // Compose a compact LLM summary the briefing layer can drop in
  // verbatim. We deliberately keep this Korean — the briefing layer
  // already passes locale through to its own prompt; the signal is
  // a structured fact, not a localized message, but Korean tends to
  // round-trip cleaner into mixed-locale CEO briefings.
  let summary: string;
  if (deals.length === 0) {
    summary = "최근 30일 변경된 HubSpot deal 없음.";
  } else {
    const stageGroups = new Map<string, { count: number; amount: number }>();
    let totalAmount = 0;
    for (const d of deals) {
      const stage = d.properties.dealstage ?? "unknown";
      const amt = parseFloat(d.properties.amount ?? "0") || 0;
      totalAmount += amt;
      const g = stageGroups.get(stage) ?? { count: 0, amount: 0 };
      g.count += 1;
      g.amount += amt;
      stageGroups.set(stage, g);
    }

    const stageList = Array.from(stageGroups.entries())
      .map(([s, g]) => `- ${s}: ${g.count}건 (₩${Math.round(g.amount).toLocaleString()})`)
      .join("\n");

    // One-shot LLM polish — turn the raw rollup into 2-3 sentences a
    // CEO would read in their briefing.
    const provider = getLLMProvider({ provider: "anthropic" });
    const res = await provider.generate({
      system: "당신은 HubSpot 영업 데이터 요약기입니다. 사실만, 짧게, CEO 보고 톤.",
      prompt: `HubSpot 최근 30일 변경된 deal 요약:\n총 ${deals.length}건, 총액 ₩${Math.round(totalAmount).toLocaleString()}\n\n단계별:\n${stageList}\n\n위 데이터를 2-3 문장의 한국어 핵심 요약으로 정리하세요. "최근 30일 HubSpot:"으로 시작하세요.`,
      temperature: 0.2,
      maxTokens: 300,
      cacheSystem: false,
    });
    summary = (res.text ?? "").trim() || `최근 30일 HubSpot: ${deals.length}건 deal 변경 (총 ₩${Math.round(totalAmount).toLocaleString()}).`;
  }

  const supabase = createServiceClient();
  // Signals are snapshot-style; we don't keep history of every sync
  // (would balloon quickly). Delete the previous hubspot signal for
  // this workspace before inserting the new one.
  await supabase
    .from("mrai_signals")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("source", "hubspot");

  const { data: inserted, error: iErr } = await supabase
    .from("mrai_signals")
    .insert({
      workspace_id: workspaceId,
      source: "hubspot",
      summary,
      raw: { deal_count: deals.length, deals: deals.slice(0, 20) },
      valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (iErr || !inserted) throw new Error(`save signal: ${iErr?.message}`);

  return {
    signalId: inserted.id as string,
    dealCount: deals.length,
    summary,
  };
}
