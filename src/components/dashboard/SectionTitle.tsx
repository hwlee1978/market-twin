import type { LucideIcon } from "lucide-react";

/**
 * Section header row used between dashboard blocks — small gradient icon
 * chip + heading + optional right-aligned note. Mirrors the approved
 * prototype's `.sec-title` pattern.
 */
export function SectionTitle({
  icon: Icon,
  gradient,
  title,
  note,
}: {
  icon: LucideIcon;
  gradient: string;
  title: string;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 mt-6 mb-3">
      <span
        className="w-6 h-6 rounded-[7px] flex items-center justify-center text-white shrink-0"
        style={{ background: gradient }}
      >
        <Icon size={14} strokeWidth={2.4} />
      </span>
      <h2 className="text-[15px] font-extrabold text-slate-900 tracking-tight">{title}</h2>
      {note && (
        <span className="ml-auto text-[11.5px] font-semibold text-slate-400">{note}</span>
      )}
    </div>
  );
}
