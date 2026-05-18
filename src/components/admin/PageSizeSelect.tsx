"use client";

import { useRouter } from "next/navigation";

const SIZE_OPTIONS = [50, 100, 250, 500, 1000];

export function PageSizeSelect({
  baseHref,
  pageSize,
}: {
  baseHref: string;
  pageSize: number;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2">
      <span className="text-slate-500">페이지당</span>
      <select
        defaultValue={pageSize}
        onChange={(e) => {
          const next = parseInt(e.currentTarget.value, 10);
          router.push(`${baseHref}?page=1&pageSize=${next}`);
        }}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
      >
        {SIZE_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}
