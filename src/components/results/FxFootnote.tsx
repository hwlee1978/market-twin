"use client";

import { EXCHANGE_RATES_TO_USD } from "@/lib/simulation/fx-rates";

/**
 * Exchange rates for whatever currencies the text above actually used.
 *
 * A Singapore market page quoted competitor prices as "SGD 3.50–4.50"
 * with no reference anywhere on the page. A Korean reader has no sense
 * of what an SGD is worth, and the figure may as well be unlabelled.
 *
 * Scans the rendered strings for currency codes we hold a rate for and
 * prints only those — a page that never leaves USD gets no footnote.
 * The rates are the same static snapshot the pricing path uses, so the
 * note and the numbers can't disagree; it says they're approximate
 * because they are.
 */
export function FxFootnote({
  texts,
  isKo,
  className = "",
}: {
  /** Any strings rendered in the section this footnote belongs to. */
  texts: Array<string | null | undefined>;
  isKo: boolean;
  className?: string;
}) {
  const haystack = texts.filter(Boolean).join(" ");
  if (!haystack) return null;

  const found = Object.keys(EXCHANGE_RATES_TO_USD)
    .filter((code) => code !== "USD")
    // Word boundary so "SGD" matches and "USGD" doesn't. Currency codes
    // appear as standalone tokens in this prose ("SGD 3.50", "약 SGD 30").
    .filter((code) => new RegExp(`\\b${code}\\b`).test(haystack));
  if (found.length === 0) return null;

  const rate = (code: string) => {
    const perUsd = 1 / EXCHANGE_RATES_TO_USD[code];
    // Rates below 10 per dollar need decimals to mean anything; above
    // that, decimals are noise.
    return perUsd >= 10 ? Math.round(perUsd).toLocaleString() : perUsd.toFixed(2);
  };

  return (
    <p className={`text-[11px] leading-relaxed text-slate-500 ${className}`}>
      {isKo ? "환율 기준: " : "Exchange rates: "}
      {found.map((code, i) => (
        <span key={code}>
          {i > 0 ? " · " : ""}
          {`$1 = ${rate(code)} ${code}`}
        </span>
      ))}
      {isKo
        ? " (근사치이며 실제 거래 환율과 다를 수 있습니다)"
        : " (approximate; actual rates will differ)"}
    </p>
  );
}
