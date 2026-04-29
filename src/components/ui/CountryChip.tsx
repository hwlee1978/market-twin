import { clsx } from "clsx";

/**
 * Small country code chip used wherever we'd otherwise want a flag emoji.
 * Flag emojis (🇰🇷 etc.) don't render on Windows browsers without the
 * regional-indicator font fallback, so they show up as bare letter pairs
 * — exactly the "broken" look we want to avoid.
 */
export function CountryChip({
  code,
  size = "md",
  className,
}: {
  code: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const sizeCls =
    size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";
  return (
    <span
      className={clsx(
        "inline-flex items-center font-mono font-semibold tracking-wide rounded-md bg-slate-100 text-slate-700",
        sizeCls,
        className,
      )}
    >
      {code.toUpperCase()}
    </span>
  );
}

export function CountryChipRow({
  codes,
  size,
  className,
}: {
  codes: string[];
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span className={clsx("inline-flex flex-wrap gap-1", className)}>
      {codes.map((c) => (
        <CountryChip key={c} code={c} size={size} />
      ))}
    </span>
  );
}
