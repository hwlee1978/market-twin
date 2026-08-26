/**
 * Small colored "flag substitute" badge — shows the ISO-2 country code in a
 * gradient circle. We deliberately avoid flag emoji here: CountryChip.tsx
 * (existing convention) documents that regional-indicator flag emoji render
 * as bare letter pairs on Windows browsers without the right font fallback,
 * which looks broken. This keeps the rich dashboard visually close to the
 * approved prototype (which uses flag emoji) while staying Windows-safe.
 */
const PALETTE = [
  "#4f46e5",
  "#0891b2",
  "#0d9c72",
  "#d97706",
  "#e11d48",
  "#7c3aed",
  "#2563eb",
  "#14b8a6",
];

/**
 * Deterministic categorical color for any short string (country code,
 * email, id, ...). Exported so other "colorful chip/avatar" spots (e.g.
 * team member avatars) can reuse the same hashing + palette instead of
 * inventing a second one.
 */
export function paletteColor(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function CountryMark({
  code,
  size = "md",
}: {
  code: string;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? 38 : size === "sm" ? 22 : 28;
  const fontSize = size === "lg" ? 12.5 : size === "sm" ? 9 : 10.5;
  const upper = code.toUpperCase();
  const bg = paletteColor(upper);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-extrabold text-white shrink-0"
      style={{
        width: dim,
        height: dim,
        fontSize,
        letterSpacing: "-0.03em",
        background: `linear-gradient(150deg, ${bg}, ${bg}cc)`,
      }}
    >
      {upper}
    </span>
  );
}
