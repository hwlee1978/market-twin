"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Dropdown that swaps the A or B simulation in the comparison view by
 * mutating the ?a / ?b query param on the same page. Disables the slot
 * the OPPOSITE selector currently has so the user can't pick the same
 * sim on both sides.
 */
export function CompareSelector({
  projectId: _projectId,
  label,
  slot,
  currentValue,
  oppositeValue,
  options,
}: {
  projectId: string;
  label: string;
  slot: "a" | "b";
  currentValue: string;
  oppositeValue: string;
  options: Array<{
    id: string;
    label: string;
    personaCount: number;
    modelProvider: string | null;
  }>;
}) {
  void _projectId;
  const router = useRouter();
  const searchParams = useSearchParams();

  const onChange = (next: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set(slot, next);
    router.replace(`?${sp.toString()}`);
  };

  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
        {label}
      </div>
      <select
        className="input"
        value={currentValue}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={o.id === oppositeValue}>
            {o.label}
            {o.modelProvider ? ` · ${o.modelProvider}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
