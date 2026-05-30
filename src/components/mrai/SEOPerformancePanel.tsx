"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Loader2,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { EmptyState } from "./EmptyState";
import { ErrorState, errMsg } from "./ErrorState";

type Status =
  | { connected: false }
  | {
      connected: true;
      email: string;
      connected_at: string;
      last_gsc_sync: string | null;
      last_ga4_sync: string | null;
      last_error: string | null;
      last_error_at: string | null;
      scopes: string[];
      rollup_28d: { gsc_clicks: number; gsc_impressions: number; ga4_sessions: number; ga4_conversions: number };
      rollup_prev_28d: { gsc_clicks: number; gsc_impressions: number; ga4_sessions: number; ga4_conversions: number };
    };

type Details = {
  top_queries: Array<{ query: string; clicks: number; impressions: number; ctr: number; avg_position: number }>;
  top_pages: Array<{ page: string; clicks: number; impressions: number }>;
  traffic_sources: Array<{ source: string; medium: string; sessions: number; conversions: number }>;
  daily_series: Array<{ date: string; clicks: number; impressions: number; sessions: number }>;
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function delta(cur: number, prev: number): { pct: number; dir: "up" | "down" | "flat" } {
  if (prev === 0) return { pct: cur > 0 ? 100 : 0, dir: cur > 0 ? "up" : "flat" };
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 1) return { pct, dir: "flat" };
  return { pct, dir: pct > 0 ? "up" : "down" };
}

export function SEOPerformancePanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<"queries" | "pages" | "sources" | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/mrai/seo/google/status", { cache: "no-store" });
    if (!res.ok) {
      setError("연결 상태를 불러오지 못했습니다");
      return;
    }
    const s = (await res.json()) as Status;
    setStatus(s);
    if (s.connected) {
      const dres = await fetch("/api/mrai/seo/google/details", { cache: "no-store" });
      if (dres.ok) setDetails((await dres.json()) as Details);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const sync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/mrai/seo/google/sync", { method: "POST" });
      if (!res.ok) throw new Error("sync 실패");
      await loadStatus();
    } catch (e) {
      setError(errMsg(e, "sync 실패"));
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Google 연결을 해제할까요? 저장된 SEO 성과 데이터는 유지됩니다.")) return;
    await fetch("/api/mrai/seo/google/status", { method: "DELETE" });
    setStatus({ connected: false });
    setDetails(null);
  };

  if (status === null) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm px-5 py-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…
        </div>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Search className="w-4 h-4 text-emerald-600" />
            구글 SEO 성과 (GSC · GA4)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Search Console + Analytics를 한 번에 연결. 클릭·노출·평균 순위·세션·전환을 매일 자동 수집.
          </p>
        </div>
        <div className="px-5 py-6">
          <EmptyState
            icon={Search}
            tone="emerald"
            title="Google 계정 연결이 필요해요"
            description="브랜드 SEO 자산 패널에서 등록한 GSC 속성·GA4 ID와 연결됩니다. 읽기 전용 권한만 요청, 다른 데이터엔 접근하지 않습니다."
            action={
              <a
                href="/api/mrai/seo/google/start"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Google 계정 연결
              </a>
            }
          />
        </div>
      </div>
    );
  }

  const dClicks = delta(status.rollup_28d.gsc_clicks, status.rollup_prev_28d.gsc_clicks);
  const dImpr = delta(status.rollup_28d.gsc_impressions, status.rollup_prev_28d.gsc_impressions);
  const dSess = delta(status.rollup_28d.ga4_sessions, status.rollup_prev_28d.ga4_sessions);
  const dConv = delta(status.rollup_28d.ga4_conversions, status.rollup_prev_28d.ga4_conversions);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Search className="w-4 h-4 text-emerald-600" />
            구글 SEO 성과 (지난 28일)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            연결: {status.email}
            {status.last_gsc_sync && (
              <> · 마지막 동기화 {new Date(status.last_gsc_sync).toLocaleString("ko-KR")}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void sync()}
            disabled={syncing}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-60"
          >
            {syncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {syncing ? "동기화 중…" : "지금 동기화"}
          </button>
          <button
            type="button"
            onClick={() => void disconnect()}
            title="연결 해제"
            className="p-1.5 text-slate-400 hover:text-red-600 rounded"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {(error || status.last_error) && (
        <div className="mx-5 mt-3">
          <ErrorState
            title="동기화 오류"
            description={error || status.last_error || ""}
            variant="inline"
          />
        </div>
      )}

      <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="클릭 (GSC)" value={status.rollup_28d.gsc_clicks} d={dClicks} tone="emerald" />
        <KPI label="노출 (GSC)" value={status.rollup_28d.gsc_impressions} d={dImpr} tone="sky" />
        <KPI label="세션 (GA4)" value={status.rollup_28d.ga4_sessions} d={dSess} tone="violet" />
        <KPI label="전환 (GA4)" value={status.rollup_28d.ga4_conversions} d={dConv} tone="amber" />
      </div>

      {details && details.daily_series.length > 1 && (
        <div className="px-5 pb-4">
          <DailySparkline series={details.daily_series} />
        </div>
      )}

      {details && (
        <div className="border-t border-slate-100">
          <ExpandableSection
            label={`상위 쿼리 (${details.top_queries.length})`}
            open={expanded === "queries"}
            onToggle={() => setExpanded(expanded === "queries" ? null : "queries")}
          >
            <QueryTable rows={details.top_queries} />
          </ExpandableSection>
          <ExpandableSection
            label={`상위 페이지 (${details.top_pages.length})`}
            open={expanded === "pages"}
            onToggle={() => setExpanded(expanded === "pages" ? null : "pages")}
          >
            <PageTable rows={details.top_pages} />
          </ExpandableSection>
          <ExpandableSection
            label={`유입 소스 (${details.traffic_sources.length})`}
            open={expanded === "sources"}
            onToggle={() => setExpanded(expanded === "sources" ? null : "sources")}
          >
            <SourceTable rows={details.traffic_sources} />
          </ExpandableSection>
        </div>
      )}
    </div>
  );
}

function KPI({
  label,
  value,
  d,
  tone,
}: {
  label: string;
  value: number;
  d: { pct: number; dir: "up" | "down" | "flat" };
  tone: "emerald" | "sky" | "violet" | "amber";
}) {
  const toneClass: Record<typeof tone, string> = {
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-200",
    sky: "text-sky-700 bg-sky-50 border-sky-200",
    violet: "text-violet-700 bg-violet-50 border-violet-200",
    amber: "text-amber-700 bg-amber-50 border-amber-200",
  };
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${toneClass[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{fmt(value)}</div>
      <div className="mt-0.5 text-[10px] flex items-center gap-1 opacity-90">
        {d.dir === "up" && <TrendingUp className="w-3 h-3" />}
        {d.dir === "down" && <TrendingDown className="w-3 h-3" />}
        {d.dir === "flat" && <Minus className="w-3 h-3" />}
        {d.dir === "flat" ? "변동 없음" : `${d.pct > 0 ? "+" : ""}${d.pct.toFixed(1)}% vs 직전 28일`}
      </div>
    </div>
  );
}

function ExpandableSection({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-slate-100 first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-3 flex items-center gap-2 text-left hover:bg-slate-50"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
        <span className="text-xs font-semibold text-slate-700">{label}</span>
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

function QueryTable({ rows }: { rows: Details["top_queries"] }) {
  if (rows.length === 0) return <p className="text-xs text-slate-500">데이터 없음 — 첫 동기화 후 노출됩니다.</p>;
  return (
    <table className="w-full text-xs">
      <thead className="text-slate-500 text-[10px] uppercase tracking-wider">
        <tr>
          <th className="text-left py-1.5">쿼리</th>
          <th className="text-right">클릭</th>
          <th className="text-right">노출</th>
          <th className="text-right">CTR</th>
          <th className="text-right">평균 순위</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.query} className="border-t border-slate-100">
            <td className="py-1.5 text-slate-900 truncate max-w-xs">{r.query}</td>
            <td className="text-right tabular-nums">{r.clicks}</td>
            <td className="text-right tabular-nums">{r.impressions}</td>
            <td className="text-right tabular-nums">{(r.ctr * 100).toFixed(1)}%</td>
            <td className="text-right tabular-nums">{r.avg_position.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PageTable({ rows }: { rows: Details["top_pages"] }) {
  if (rows.length === 0) return <p className="text-xs text-slate-500">데이터 없음 — 첫 동기화 후 노출됩니다.</p>;
  return (
    <table className="w-full text-xs">
      <thead className="text-slate-500 text-[10px] uppercase tracking-wider">
        <tr>
          <th className="text-left py-1.5">페이지</th>
          <th className="text-right">클릭</th>
          <th className="text-right">노출</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.page} className="border-t border-slate-100">
            <td className="py-1.5 text-slate-900 truncate max-w-md">{r.page}</td>
            <td className="text-right tabular-nums">{r.clicks}</td>
            <td className="text-right tabular-nums">{r.impressions}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SourceTable({ rows }: { rows: Details["traffic_sources"] }) {
  if (rows.length === 0) return <p className="text-xs text-slate-500">데이터 없음 — 첫 동기화 후 노출됩니다.</p>;
  return (
    <table className="w-full text-xs">
      <thead className="text-slate-500 text-[10px] uppercase tracking-wider">
        <tr>
          <th className="text-left py-1.5">소스 / 매체</th>
          <th className="text-right">세션</th>
          <th className="text-right">전환</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.source}/${r.medium}/${i}`} className="border-t border-slate-100">
            <td className="py-1.5 text-slate-900">
              {r.source || "(direct)"} / {r.medium || "(none)"}
            </td>
            <td className="text-right tabular-nums">{r.sessions}</td>
            <td className="text-right tabular-nums">{r.conversions}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DailySparkline({ series }: { series: Details["daily_series"] }) {
  const maxClicks = Math.max(...series.map((s) => s.clicks), 1);
  const maxSessions = Math.max(...series.map((s) => s.sessions), 1);
  const w = 600;
  const h = 50;
  const stepX = w / Math.max(series.length - 1, 1);
  const clicksPath = series
    .map((s, i) => `${i === 0 ? "M" : "L"}${i * stepX},${h - (s.clicks / maxClicks) * h}`)
    .join(" ");
  const sessionsPath = series
    .map((s, i) => `${i === 0 ? "M" : "L"}${i * stepX},${h - (s.sessions / maxSessions) * h}`)
    .join(" ");
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
        일별 추세 (28일)
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        <path d={clicksPath} fill="none" stroke="rgb(5 150 105)" strokeWidth="1.5" />
        <path d={sessionsPath} fill="none" stroke="rgb(124 58 237)" strokeWidth="1.5" />
      </svg>
      <div className="flex gap-4 mt-1 text-[10px]">
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <span className="w-2 h-0.5 bg-emerald-600" /> 클릭 (GSC)
        </span>
        <span className="inline-flex items-center gap-1 text-violet-700">
          <span className="w-2 h-0.5 bg-violet-600" /> 세션 (GA4)
        </span>
      </div>
    </div>
  );
}
