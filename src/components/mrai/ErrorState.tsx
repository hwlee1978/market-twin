import type { LucideIcon } from "lucide-react";
import { AlertCircle } from "lucide-react";

/**
 * Friendly error state for Mr.AI panels when an operation fails.
 *
 * Pair-component to `EmptyState`. Audit (2026-05-30) found 6 panels
 * with identical `bg-red-50 border border-red-200 px-3 py-2 text-xs
 * text-red-700 + AlertCircle` blocks and 16 panels using the same
 * setError → conditional render flow. This component is the canonical
 * shape so the visual rhythm + retry affordance stays consistent.
 *
 * Variants:
 *   - **card** (default): bg-tinted panel with optional icon · title ·
 *     description · action. Use for prominent operation failures (LLM
 *     generation failed, sync failed).
 *   - **inline**: single-line text block, no icon ball, no rounded
 *     background. Use inside forms or compact panels where a full card
 *     would crowd the layout.
 */
export function ErrorState({
  icon: Icon = AlertCircle,
  title,
  description,
  action,
  tone = "red",
  variant = "card",
  showIcon = true,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** red = error (default), amber = warning, slate = neutral diagnostic */
  tone?: "red" | "amber" | "slate";
  /** card = prominent panel, inline = compact form-row error */
  variant?: "card" | "inline";
  showIcon?: boolean;
}) {
  const toneClass: Record<NonNullable<typeof tone>, {
    bg: string;
    border: string;
    text: string;
    iconBg: string;
    iconText: string;
  }> = {
    red: {
      bg: "bg-red-50",
      border: "border-red-200",
      text: "text-red-700",
      iconBg: "bg-red-100",
      iconText: "text-red-600",
    },
    amber: {
      bg: "bg-amber-50",
      border: "border-amber-200",
      text: "text-amber-800",
      iconBg: "bg-amber-100",
      iconText: "text-amber-600",
    },
    slate: {
      bg: "bg-slate-50",
      border: "border-slate-200",
      text: "text-slate-700",
      iconBg: "bg-slate-200",
      iconText: "text-slate-600",
    },
  };
  const t = toneClass[tone];

  if (variant === "inline") {
    return (
      <div
        className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${t.bg} ${t.border} ${t.text}`}
        role="alert"
      >
        {showIcon && <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="font-medium">{title}</div>
          {description && <div className="mt-0.5 opacity-90">{description}</div>}
          {action && <div className="mt-1.5">{action}</div>}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${t.bg} ${t.border}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        {showIcon && (
          <div
            className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${t.iconBg}`}
          >
            <Icon className={`w-4 h-4 ${t.iconText}`} strokeWidth={2} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className={`text-sm font-semibold ${t.text}`}>{title}</h4>
          {description && (
            <p className={`mt-1 text-xs leading-relaxed ${t.text} opacity-90 whitespace-pre-line`}>
              {description}
            </p>
          )}
          {action && <div className="mt-2.5">{action}</div>}
        </div>
      </div>
    </div>
  );
}

/**
 * Tiny helper for the common `catch (e) { setError(e instanceof Error ? e.message : "fallback") }`
 * pattern. Use as: `setError(errMsg(e, "저장 실패"))`.
 *
 * The 30+ catch-block boilerplate audit confirmed every callsite shapes
 * the message identically, so pulling it here trims noise without
 * changing semantics.
 */
export function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}
