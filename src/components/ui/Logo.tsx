import { clsx } from "clsx";

/**
 * Two overlapping squares — one filled, one outlined — that read as a
 * "twin" (market reality vs simulated reality). Inline SVG so it
 * inherits color from the parent via currentColor, which means the
 * same component works on the navy sidebar AND on light cards without
 * separate light/dark assets.
 */
export function LogoMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      className={clsx("shrink-0", className)}
    >
      <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" />
      <rect
        x="11"
        y="11"
        width="18"
        height="18"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
    </svg>
  );
}

/**
 * Mark + "Market Twin" wordmark. Used on auth pages and email headers
 * where we want the full brand presence rather than just the icon.
 */
export function LogoFull({
  className,
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={clsx("inline-flex items-center gap-2.5", className)}
      aria-label="Market Twin"
    >
      <LogoMark size={size} />
      <span
        className="font-semibold tracking-tight"
        style={{ fontSize: size * 0.62, letterSpacing: "-0.01em" }}
      >
        Market Twin
      </span>
    </span>
  );
}
