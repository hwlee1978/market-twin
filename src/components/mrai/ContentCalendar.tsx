"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type CalendarDraft = {
  id: string;
  channelId: string;
  platform: string;
  handle: string;
  displayName: string | null;
  variantLabel: string;
  campaignLabel: string | null;
  bodyText: string;
  imageUrl: string | null;
  scheduledAt: string; // ISO
};

const PLATFORM_COLOR: Record<string, string> = {
  instagram: "bg-pink-100 text-pink-800 border-pink-200",
  x_twitter: "bg-slate-100 text-slate-800 border-slate-300",
  threads: "bg-slate-100 text-slate-800 border-slate-300",
  tiktok: "bg-rose-100 text-rose-800 border-rose-200",
  youtube: "bg-red-100 text-red-800 border-red-200",
  naver_blog: "bg-emerald-100 text-emerald-800 border-emerald-200",
  naver_smartstore: "bg-emerald-100 text-emerald-800 border-emerald-200",
  kakao_channel: "bg-yellow-100 text-yellow-800 border-yellow-200",
  facebook: "bg-blue-100 text-blue-800 border-blue-200",
  linkedin: "bg-sky-100 text-sky-800 border-sky-200",
  reddit: "bg-orange-100 text-orange-800 border-orange-200",
};

const PLATFORM_LABEL: Record<string, string> = {
  x_twitter: "X",
  instagram: "IG",
  tiktok: "TT",
  youtube: "YT",
  naver_blog: "N블",
  threads: "Th",
  kakao_channel: "Kk",
  naver_smartstore: "N쇼",
  facebook: "FB",
  linkedin: "LI",
  reddit: "Rd",
};

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function ContentCalendar({
  locale,
  drafts,
}: {
  locale: string;
  drafts: CalendarDraft[];
}) {
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));

  // Build a 6-week grid starting from the Sunday before the 1st of the month.
  const gridDays = useMemo(() => {
    const first = startOfMonth(cursor);
    const offset = first.getDay(); // 0=Sun
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [cursor]);

  // Bucket drafts by yyyy-mm-dd
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarDraft[]>();
    for (const d of drafts) {
      const date = new Date(d.scheduledAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(d);
    }
    return m;
  }, [drafts]);

  const today = new Date();
  const monthLabel = cursor.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setCursor((c) => addMonths(c, -1))}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
          title="이전 달"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="text-base font-semibold text-slate-900 min-w-[110px] text-center">
          {monthLabel}
        </h2>
        <button
          type="button"
          onClick={() => setCursor((c) => addMonths(c, 1))}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
          title="다음 달"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setCursor(startOfMonth(new Date()))}
          className="ml-auto text-xs text-indigo-600 hover:text-indigo-800"
        >
          오늘
        </button>
        <span className="text-[11px] text-slate-500">
          스케줄된 드래프트 {drafts.length}개
        </span>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 text-[11px] font-medium text-slate-500 border-b border-slate-100">
        {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
          <div
            key={w}
            className={`px-2 py-1.5 text-center ${
              i === 0
                ? "text-red-500"
                : i === 6
                  ? "text-blue-500"
                  : "text-slate-500"
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 grid-rows-6">
        {gridDays.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = sameDay(d, today);
          const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const dayDrafts = byDay.get(dayKey) ?? [];
          return (
            <div
              key={dayKey}
              className={`min-h-[110px] border-r border-b border-slate-100 px-1.5 py-1 ${
                inMonth ? "bg-white" : "bg-slate-50/60"
              }`}
            >
              <div
                className={`text-[11px] font-medium ${
                  isToday
                    ? "text-white bg-indigo-600 inline-block w-5 h-5 rounded-full text-center leading-5"
                    : inMonth
                      ? d.getDay() === 0
                        ? "text-red-500"
                        : d.getDay() === 6
                          ? "text-blue-500"
                          : "text-slate-700"
                      : "text-slate-300"
                }`}
              >
                {d.getDate()}
              </div>
              <div className="mt-1 space-y-0.5">
                {dayDrafts.slice(0, 3).map((dr) => {
                  const color =
                    PLATFORM_COLOR[dr.platform] ??
                    "bg-slate-100 text-slate-800 border-slate-200";
                  const platformLabel =
                    PLATFORM_LABEL[dr.platform] ??
                    dr.platform.slice(0, 2).toUpperCase();
                  const time = new Date(dr.scheduledAt).toLocaleTimeString(
                    "ko-KR",
                    { hour: "2-digit", minute: "2-digit" },
                  );
                  const snippet =
                    dr.bodyText.split("\n")[0].slice(0, 40) || "(no body)";
                  return (
                    <Link
                      key={dr.id}
                      href={`/${locale}/mr-ai/channels/${dr.channelId}`}
                      title={`${time} ${platformLabel} · ${snippet}`}
                      className={`block text-[10px] px-1.5 py-0.5 rounded border truncate ${color} hover:opacity-80`}
                    >
                      <span className="font-semibold mr-1">
                        {platformLabel}
                      </span>
                      {time} {snippet}
                    </Link>
                  );
                })}
                {dayDrafts.length > 3 && (
                  <div className="text-[10px] text-slate-500 pl-1.5">
                    +{dayDrafts.length - 3}개 더
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
