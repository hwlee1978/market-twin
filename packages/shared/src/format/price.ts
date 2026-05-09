/**
 * Shared price formatter for PDF + dashboard. The earlier per-component
 * fmtPrice helpers all hardcoded `$` + .toFixed(2), which broke any
 * non-USD project (a 121,900 KRW base price showed up as "$121900.00").
 *
 * Conventions:
 *   - `cents` is the project's chosen currency × 100, matching the wizard's
 *     `Math.round(parseFloat(form.basePrice) * 100)` storage convention
 *   - currencies in ZERO_DECIMAL_CURRENCIES (KRW/JPY/VND/IDR/CLP/PYG)
 *     drop the fractional part because they have no minor unit
 *   - falls back to "1,234.56 XYZ" when Intl doesn't recognise the code
 */

const ZERO_DECIMAL_CURRENCIES = new Set([
  "KRW",
  "JPY",
  "VND",
  "IDR",
  "CLP",
  "PYG",
]);

export function formatPrice(cents: number, currency: string | null | undefined): string {
  const ccy = (currency ?? "USD").toUpperCase();
  const isZeroDec = ZERO_DECIMAL_CURRENCIES.has(ccy);
  const value = isZeroDec ? Math.round(cents / 100) : cents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: ccy,
      minimumFractionDigits: isZeroDec ? 0 : 2,
      maximumFractionDigits: isZeroDec ? 0 : 2,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: isZeroDec ? 0 : 2,
      maximumFractionDigits: isZeroDec ? 0 : 2,
    }).format(value)} ${ccy}`;
  }
}
