"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, FileText, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { FeedbackButtons } from "./FeedbackButtons";
import { EmptyState } from "./EmptyState";

type Briefing = {
  id: string;
  content_md: string;
  locale: "ko" | "en";
  generated_at: string;
};

export function BriefingPanel({
  initialBriefing,
  locale,
}: {
  initialBriefing: Briefing | null;
  locale: "ko" | "en";
}) {
  const t = useTranslations("mrai.briefing");
  const [briefing, setBriefing] = useState<Briefing | null>(initialBriefing);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mrai/briefings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "generate_failed");
      }
      const data = (await res.json()) as { briefing: Briefing };
      setBriefing(data.briefing);
      setCollapsed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }

  const generatedLabel = briefing
    ? t("generatedAt", { time: new Date(briefing.generated_at).toLocaleString(locale === "ko" ? "ko-KR" : "en-US") })
    : null;

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-white">
        <Sparkles className="w-4 h-4 text-amber-600" />
        <h2 className="text-sm font-semibold text-slate-900">{t("title")}</h2>
        {generatedLabel && (
          <span className="text-xs text-slate-500" suppressHydrationWarning>
            · {generatedLabel}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 rounded-md"
          >
            {loading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                {t("generating")}
              </>
            ) : briefing ? (
              <>
                <RefreshCw className="w-3 h-3" />
                {t("regenerate")}
              </>
            ) : (
              <>
                <FileText className="w-3 h-3" />
                {t("generate")}
              </>
            )}
          </button>
          {briefing && (
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="inline-flex items-center justify-center w-7 h-7 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100"
              aria-label={collapsed ? t("expand") : t("collapse")}
            >
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          )}
        </div>
      </header>

      {!collapsed && (
        <div className="px-5 py-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">
              {t("errorPrefix")}: {error}
            </div>
          )}
          {briefing ? (
            <>
              <BriefingMarkdown md={briefing.content_md} />
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end">
                <FeedbackButtons
                  targetType="briefing"
                  targetId={briefing.id}
                  locale={locale}
                  size="sm"
                />
              </div>
            </>
          ) : (
            <EmptyState
              icon={Sparkles}
              title={t("empty")}
              description={
                locale === "ko"
                  ? "오늘의 핵심 이슈 · 기회 · 다음 액션을 3개 카드로 정리해 드립니다."
                  : "We'll summarize today's key issues, opportunities and next actions in three cards."
              }
              tone="amber"
              action={
                <button
                  onClick={generate}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 rounded-md"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {t("generating")}
                    </>
                  ) : (
                    <>
                      <FileText className="w-3 h-3" />
                      {t("generate")}
                    </>
                  )}
                </button>
              }
            />
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Minimal markdown renderer for briefing output. The generator always
 * produces "## header\n- bullet" pattern — we don't need a full md parser
 * for this scope. Headers get color-coded section pills; bullets render
 * as a tight list.
 */
function BriefingMarkdown({ md }: { md: string }) {
  // Split into sections by ## headers.
  const sections = md
    .split(/^##\s+/m)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {sections.map((sec, i) => {
        const lines = sec.split("\n");
        const title = lines[0]?.trim() ?? "";
        const body = lines
          .slice(1)
          .map((l) => l.trim())
          .filter((l) => l && !/^-{3,}$/.test(l));
        return (
          <div key={i} className="border border-slate-200 rounded-md p-3 bg-slate-50/50">
            <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
              {title}
            </div>
            <ul className="space-y-1.5">
              {body.map((line, j) => (
                <li key={j} className="text-sm text-slate-800 leading-relaxed">
                  {line.startsWith("- ") ? line.slice(2) : line}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
