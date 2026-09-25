/**
 * Static exchange-rate snapshot, in its own leaf module.
 *
 * It used to live in competitor-prices.ts, which imports the LLM
 * providers — the aggregator needs the rates to bucket persona income
 * and cannot drag that in. Nothing here does IO.
 *
 * These are NOT live rates. They are a v0.1 approximation, good enough
 * for the two jobs that use them: pricing anchors (recommendation
 * precision is ±20% anyway) and sorting income into brackets 30k wide,
 * where a rate would have to move by half before anyone changes
 * bracket. Update when rates drift >10%.
 */
export const EXCHANGE_RATES_TO_USD: Record<string, number> = {
  USD: 1,
  KRW: 1 / 1390, // 1 USD ≈ 1390 KRW
  JPY: 1 / 152,
  CNY: 1 / 7.2,
  TWD: 1 / 32,
  HKD: 1 / 7.8,
  SGD: 1 / 1.35,
  THB: 1 / 36,
  VND: 1 / 25500,
  IDR: 1 / 16200,
  MYR: 1 / 4.7,
  PHP: 1 / 58,
  INR: 1 / 84,
  GBP: 1 / 0.79,
  EUR: 1 / 0.93,
  CAD: 1 / 1.4,
  AUD: 1 / 1.55,
};

export function convertCurrencyCents(
  amountCents: number,
  fromCurrency: string,
  toCurrency: string,
): number | null {
  const fromRate = EXCHANGE_RATES_TO_USD[fromCurrency.toUpperCase()];
  const toRate = EXCHANGE_RATES_TO_USD[toCurrency.toUpperCase()];
  if (!fromRate || !toRate) return null;
  // amountCents → USD cents → target cents.
  const usdCents = amountCents * fromRate;
  return Math.round(usdCents / toRate);
}

/** Whole units of `currency` → whole USD. Null when the rate is unknown. */
export function toUsd(amount: number, currency: string): number | null {
  const rate = EXCHANGE_RATES_TO_USD[currency.toUpperCase()];
  return rate == null ? null : amount * rate;
}
