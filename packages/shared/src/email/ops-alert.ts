/**
 * Operational alerts for silent failures.
 *
 * The pipeline is full of places that degrade rather than fail: an LLM
 * response clipped at max_tokens whose partial JSON still parses, a
 * narrative merge that falls back to a template, a market whose pricing
 * samples all failed to parse and so drops out of the comparison table.
 * None of these throw. The run completes, the customer gets a report
 * that is quietly worse, and the only trace is a console.warn nobody
 * reads.
 *
 * `alertOps` is the other end of that: the point where "we handled it"
 * becomes "someone should know". It is deliberately cheap to call from
 * inside a catch block — it never throws, never blocks the work it is
 * reporting on, and collapses repeats so a six-sim ensemble hitting the
 * same fallback six times sends one email, not six.
 */
import { createServiceClient } from "@/lib/supabase/admin";
import { getFromAddress, getOpsRecipient, sendEmail } from "./client";

/** What went quietly wrong. One value per distinct failure mode. */
export type OpsAlertKind =
  | "narrative_fallback"
  | "llm_output_truncated"
  | "market_dropped"
  | "country_scores_empty"
  | "price_hallucination"
  | "low_sim_success_rate"
  | "pdf_font_missing"
  | "quality_audit_failed";

export type OpsAlertSeverity = "warn" | "critical";

export interface OpsAlertInput {
  kind: OpsAlertKind;
  severity?: OpsAlertSeverity;
  /** One line. Becomes the email subject. */
  summary: string;
  /** What the reader needs to act — ids, counts, the failing stage. */
  details?: Record<string, unknown>;
  /** Ensemble / simulation this concerns, when there is one. */
  ensembleId?: string;
  simulationId?: string;
  workspaceId?: string;
  /**
   * Collapse window. A second alert of the same kind within this many
   * minutes is recorded but not emailed. Defaults to 60.
   */
  dedupeMinutes?: number;
  /**
   * Extra key folded into the dedupe identity, so alerts about
   * different ensembles are not collapsed into each other.
   */
  dedupeKey?: string;
}

const KIND_LABEL: Record<OpsAlertKind, string> = {
  narrative_fallback: "내러티브 병합 폴백",
  llm_output_truncated: "LLM 출력 잘림",
  market_dropped: "시장 누락",
  country_scores_empty: "국가 점수 전량 실패",
  price_hallucination: "가격 환각 감지",
  low_sim_success_rate: "시뮬 성공률 저하",
  pdf_font_missing: "PDF 폰트 누락",
  quality_audit_failed: "품질 감사 실패",
};

/**
 * Two actions, not one. The dedupe lookup matches only the delivered
 * form, so an alert that failed to send does not claim the suppression
 * window — otherwise a deployment with no mail key sends nothing, logs
 * a row anyway, and then silently suppresses every alert of that kind
 * for the next hour. Splitting by action keeps the lookup on the
 * (action, resource_id, ts) index rather than filtering on metadata.
 */
const AUDIT_ACTION = "ops_alert";
const AUDIT_ACTION_FAILED = "ops_alert_failed";

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Record a silent failure and, unless an identical one was just
 * reported, email whoever runs this deployment.
 *
 * Never throws. Returns what it did, which the caller is free to
 * ignore — the return value exists for tests and for the monitoring
 * cron, not for control flow.
 */
export async function alertOps(
  input: OpsAlertInput,
): Promise<{ recorded: boolean; emailed: boolean; reason?: string }> {
  const severity = input.severity ?? "warn";
  const dedupeMinutes = input.dedupeMinutes ?? 60;
  const dedupeKey = input.dedupeKey ?? input.ensembleId ?? input.simulationId ?? "global";
  const identity = `${input.kind}:${dedupeKey}`;

  // The log line goes out first and unconditionally. If everything
  // below fails — no DB, no mail key — the detail is still somewhere.
  console.error(
    `[ops-alert] ${severity.toUpperCase()} ${input.kind}: ${input.summary}`,
    input.details ?? {},
  );

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (err) {
    return {
      recorded: false,
      emailed: false,
      reason: `service client unavailable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Suppress a repeat of the same thing about the same subject.
  let suppressed = false;
  try {
    const since = new Date(Date.now() - dedupeMinutes * 60_000).toISOString();
    const { data } = await supabase
      .from("audit_logs")
      .select("id")
      .eq("action", AUDIT_ACTION)
      .eq("resource_id", identity)
      .gte("ts", since)
      .limit(1);
    suppressed = Boolean(data && data.length > 0);
  } catch (err) {
    // A dedupe lookup that fails should not swallow the alert. Better a
    // duplicate email than a missing one.
    console.warn("[ops-alert] dedupe lookup failed, sending anyway:", err);
  }

  let emailed = false;
  let emailError: string | undefined;
  if (!suppressed) {
    const to = getOpsRecipient();
    if (!to) {
      emailError = "no recipient (set OPS_ALERT_EMAIL or SUPERADMIN_EMAILS)";
      console.error(`[ops-alert] ${emailError}`);
    } else {
      const label = KIND_LABEL[input.kind] ?? input.kind;
      const rows = Object.entries(input.details ?? {})
        .map(
          ([k, v]) =>
            `<tr><td style="padding:6px 10px;border-bottom:1px solid #eef2f7;color:#64748b;white-space:nowrap">${esc(k)}</td>` +
            `<td style="padding:6px 10px;border-bottom:1px solid #eef2f7;font-family:ui-monospace,monospace">${esc(
              typeof v === "object" ? JSON.stringify(v) : v,
            )}</td></tr>`,
        )
        .join("");
      const ids = [
        input.ensembleId ? `ensemble ${input.ensembleId}` : null,
        input.simulationId ? `sim ${input.simulationId}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      const result = await sendEmail(
        {
          from: getFromAddress(),
          to: [to],
          subject: `[Market Twin] ${severity === "critical" ? "🔴" : "🟡"} ${label} — ${input.summary}`,
          html:
            `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px">` +
            `<p style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#2563eb;font-weight:700">Silent failure</p>` +
            `<h2 style="margin:6px 0 4px;font-size:17px;color:#0f172a">${esc(label)}</h2>` +
            `<p style="margin:0 0 14px;color:#334155;line-height:1.6">${esc(input.summary)}</p>` +
            (ids ? `<p style="margin:0 0 10px;color:#64748b;font-size:12px">${esc(ids)}</p>` : "") +
            (rows
              ? `<table style="border-collapse:collapse;width:100%;font-size:12.5px">${rows}</table>`
              : "") +
            `<p style="color:#94a3b8;font-size:11.5px;margin-top:16px;line-height:1.6">` +
            `이 알림은 실행이 실패해서가 아니라 <b>결과물의 품질이 조용히 낮아졌기 때문에</b> 발송됩니다. ` +
            `같은 종류의 알림은 ${dedupeMinutes}분 동안 한 번만 보냅니다.</p></div>`,
          text:
            `[${severity}] ${label}\n${input.summary}\n${ids}\n\n` +
            Object.entries(input.details ?? {})
              .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
              .join("\n"),
        },
        `ops-alert ${input.kind}`,
      );
      emailed = result.ok;
      emailError = result.error;
    }
  }

  // Write the marker AFTER attempting delivery, and record whether it
  // landed. Writing it first — which is what the health-alert cron did —
  // means a send that fails also locks out every retry for the whole
  // dedupe window.
  let recorded = false;
  try {
    await supabase.from("audit_logs").insert({
      // A suppressed alert counts as delivered — the earlier one was.
      action: emailed || suppressed ? AUDIT_ACTION : AUDIT_ACTION_FAILED,
      resource_type: input.kind,
      resource_id: identity,
      workspace_id: input.workspaceId ?? null,
      metadata: {
        severity,
        summary: input.summary,
        details: input.details ?? {},
        ensembleId: input.ensembleId ?? null,
        simulationId: input.simulationId ?? null,
        emailed,
        suppressed,
        ...(emailError ? { emailError } : {}),
      },
    });
    recorded = true;
  } catch (err) {
    console.warn("[ops-alert] audit write failed:", err);
  }

  return {
    recorded,
    emailed,
    reason: suppressed ? "deduped" : emailError,
  };
}

/**
 * Fire-and-forget form for call sites inside hot paths.
 *
 * Still awaits internally so a serverless function does not exit before
 * the send completes — the caller just doesn't have to.
 */
export function alertOpsAsync(input: OpsAlertInput): Promise<void> {
  return alertOps(input).then(
    () => undefined,
    (err) => {
      console.warn("[ops-alert] unexpected failure:", err);
    },
  );
}
