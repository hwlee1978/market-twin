/**
 * Audit persona-objection quality by income bracket. Answers the
 * question: \"do high-income personas reflexively raise generic price
 * objections at the same rate as low-income ones?\" — if yes, the LLM
 * is ignoring persona attributes and the 90%+ generic-price-objection
 * counts in our reports are noise, not signal.
 *
 * Usage:
 *   npm run audit:price-objections                    # latest decision_plus ensemble
 *   npm run audit:price-objections -- <id-prefix>     # specific ensemble
 */
import { Client } from "pg";
import { isGenericPriceObjection } from "../packages/shared/src/simulation/surfaced-recount";

interface Persona {
  country?: string;
  incomeBand?: string;
  profession?: string;
  ageRange?: string;
  objections?: string[];
  voice?: string;
  purchaseIntent?: number;
}

/**
 * Extract a representative USD value from incomeBand text. Each
 * persona-prompt rule requires a USD equivalent in parentheses for
 * non-USD currencies; native-USD personas write `$X-$Y` directly.
 * Returns the midpoint (k-USD) when a range is found, the single
 * value when one number, null when nothing parses.
 */
function parseUsdK(incomeBand: string | undefined): number | null {
  if (!incomeBand) return null;
  // Match patterns like "$50-75k", "$80-120k USD", "~$34-42k", "$200k+", "$5-12k"
  const range = incomeBand.match(/\$\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*k/i);
  if (range) {
    return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
  }
  const single = incomeBand.match(/\$\s*(\d+(?:\.\d+)?)\s*k/i);
  if (single) return parseFloat(single[1]);
  // Single value with explicit "USD" but no k suffix — assume thousands.
  const explicit = incomeBand.match(/\$\s*(\d+(?:,\d+)?)\s*USD/i);
  if (explicit) {
    const n = parseFloat(explicit[1].replace(/,/g, ""));
    return n / 1000;
  }
  return null;
}

function bracketFor(usdK: number | null): string {
  if (usdK == null) return "(unparsed)";
  if (usdK < 30) return "<$30k (low)";
  if (usdK < 60) return "$30-60k (mid-low)";
  if (usdK < 100) return "$60-100k (mid)";
  if (usdK < 150) return "$100-150k (high)";
  return "$150k+ (very high)";
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL env var is required.");
    process.exit(1);
  }
  const prefix = process.argv[2];
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const where = prefix
      ? `where e.id::text like '${prefix}%'`
      : "where e.tier in ('decision_plus','deep','deep_pro') and e.status='completed'";
    const { rows: ens } = await c.query<{
      id: string;
      tier: string;
      product_name: string;
      base_price_cents: number | null;
      currency: string | null;
    }>(
      `select e.id::text as id, e.tier, p.product_name,
              p.base_price_cents, p.currency
         from public.ensembles e
         join public.projects p on p.id = e.project_id
         ${where}
         order by e.created_at desc
         limit 1`,
    );
    if (ens.length === 0) {
      console.log("No matching ensemble.");
      return;
    }
    const e = ens[0];
    const inputUsd = (() => {
      if (!e.base_price_cents || !e.currency) return null;
      const ccy = e.currency.toUpperCase();
      const rates: Record<string, number> = {
        USD: 1,
        KRW: 1 / 1390,
        JPY: 1 / 152,
        CNY: 1 / 7.2,
        TWD: 1 / 32,
        EUR: 1 / 0.93,
        GBP: 1 / 0.79,
        AUD: 1 / 1.55,
        CAD: 1 / 1.4,
      };
      const rate = rates[ccy] ?? null;
      if (!rate) return null;
      return Math.round((e.base_price_cents / 100) * rate);
    })();

    console.log(`\n══ Ensemble ${e.id.slice(0, 8)} · ${e.tier} ══`);
    console.log(`Product   : ${e.product_name}`);
    console.log(`Input price: ${e.base_price_cents != null ? `${(e.base_price_cents / 100).toLocaleString()} ${e.currency}` : "—"}${inputUsd != null ? ` (~$${inputUsd} USD)` : ""}`);

    const { rows: sims } = await c.query<{ personas: Persona[] | null }>(
      `select r.personas
         from public.simulations s
         join public.simulation_results r on r.simulation_id = s.id
        where s.ensemble_id = $1`,
      [e.id],
    );

    interface Bucket {
      total: number;
      withGenericPrice: number;
      withSpecificPrice: number;
      meanIntent: number;
      intentSum: number;
    }
    const buckets = new Map<string, Bucket>();
    let totalPersonas = 0;
    let totalWithGenericPrice = 0;
    let totalWithAnyPriceObjection = 0;

    for (const sim of sims) {
      for (const p of sim.personas ?? []) {
        const bracket = bracketFor(parseUsdK(p.incomeBand));
        const cur =
          buckets.get(bracket) ??
          ({ total: 0, withGenericPrice: 0, withSpecificPrice: 0, meanIntent: 0, intentSum: 0 } as Bucket);
        cur.total += 1;
        cur.intentSum += p.purchaseIntent ?? 0;
        const objs = p.objections ?? [];
        const hasGeneric = objs.some(isGenericPriceObjection);
        const hasAnyPrice = objs.some((o) =>
          /가격|비싸|비쌈|부담|expensive|costly|pricey|cost|too\s+(high|much)/i.test(o),
        );
        if (hasGeneric) cur.withGenericPrice += 1;
        if (hasAnyPrice && !hasGeneric) cur.withSpecificPrice += 1;
        buckets.set(bracket, cur);

        totalPersonas += 1;
        if (hasGeneric) totalWithGenericPrice += 1;
        if (hasAnyPrice) totalWithAnyPriceObjection += 1;
      }
    }

    console.log(`\nTotal personas: ${totalPersonas.toLocaleString()}`);
    console.log(
      `  ANY price objection (incl. specific): ${totalWithAnyPriceObjection} (${Math.round((totalWithAnyPriceObjection / totalPersonas) * 100)}%)`,
    );
    console.log(
      `  Generic price grumble only:           ${totalWithGenericPrice} (${Math.round((totalWithGenericPrice / totalPersonas) * 100)}%)`,
    );

    console.log(`\nBy income bracket:`);
    console.log(
      `  ${"Bracket".padEnd(22)} ${"N".padStart(5)}  ${"Generic".padStart(8)} ${"%".padStart(5)}  ${"Specific".padStart(9)} ${"%".padStart(5)}  ${"meanIntent".padStart(11)}`,
    );
    const order = [
      "<$30k (low)",
      "$30-60k (mid-low)",
      "$60-100k (mid)",
      "$100-150k (high)",
      "$150k+ (very high)",
      "(unparsed)",
    ];
    for (const key of order) {
      const b = buckets.get(key);
      if (!b) continue;
      const genPct = Math.round((b.withGenericPrice / b.total) * 100);
      const specPct = Math.round((b.withSpecificPrice / b.total) * 100);
      const meanIntent = b.total > 0 ? Math.round(b.intentSum / b.total) : 0;
      console.log(
        `  ${key.padEnd(22)} ${String(b.total).padStart(5)}  ${String(b.withGenericPrice).padStart(8)} ${String(genPct + "%").padStart(5)}  ${String(b.withSpecificPrice).padStart(9)} ${String(specPct + "%").padStart(5)}  ${String(meanIntent + "/100").padStart(11)}`,
      );
    }

    console.log(`\nInterpretation:`);
    console.log(`  - If high-income brackets ($100k+) show generic-price > 30%, the LLM is`);
    console.log(`    ignoring income context and emitting price-as-objection reflexively.`);
    console.log(`  - A healthy distribution: low-income > mid > high (price sensitivity should`);
    console.log(`    decline with income for an \$87 USD-class product).`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
