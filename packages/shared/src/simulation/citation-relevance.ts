/**
 * Pick which fetched sources are allowed to be cited as evidence for a
 * market-size figure.
 *
 * The market-profile builder used to take the first three search
 * results verbatim — no filtering at all — so whatever the search
 * engine happened to rank first became a citation. A granola-bar
 * report shipped citing "Taiwan Pet Food Market Size & Share Outlook
 * to 2031": a real report about a real market, and not this product's.
 *
 * This is not a relevance model. It is two narrow rules that catch the
 * way that goes wrong in practice:
 *
 *   1. A source about an obviously different consumer domain (pet,
 *      automotive, pharmaceutical…) is dropped outright when the
 *      project is not in that domain. Wrong-domain citations are worse
 *      than no citation: they make an unverified figure look sourced.
 *   2. Among what remains, a source that actually states a market size
 *      is preferred over one that merely mentions the country — a GDP
 *      news item is context, not evidence for a TAM.
 *
 * Everything it drops is logged, so a citation list that comes back
 * thin is visible rather than mysterious.
 */

export interface CitableSnippet {
  url: string;
  title: string;
  content?: string;
  /** Search-engine relevance, when the provider supplies one. */
  score?: number;
}

/**
 * Domains that look adjacent to consumer goods but are separate
 * markets. Each entry: the terms that identify it, and the category
 * substrings for which it is legitimately the subject.
 */
const FOREIGN_DOMAINS: Array<{ terms: RegExp; ownedBy: RegExp }> = [
  {
    terms: /\b(pet food|pet care|dog food|cat food|animal feed|petfood|veterinary)\b|반려동물|애완|펫푸드/i,
    ownedBy: /pet|animal|vet/i,
  },
  {
    terms: /\b(automotive|vehicle|automobile|ev charging)\b|자동차/i,
    ownedBy: /auto|vehicle|mobility/i,
  },
  {
    terms: /\b(pharmaceutical|prescription drug|clinical trial)\b|의약품|제약/i,
    ownedBy: /pharma|medic|drug|health/i,
  },
  {
    terms: /\b(semiconductor|foundry|wafer)\b|반도체/i,
    ownedBy: /semi|chip|electronic/i,
  },
  {
    terms: /\b(real estate|property market|construction)\b|부동산|건설/i,
    ownedBy: /real estate|property|construction/i,
  },
];

/** A market-size claim looks like "$1.2 billion", "USD 850 million", "12억 달러". */
const SIZE_CLAIM =
  /(\$|usd\s*)\s*\d[\d,.]*\s*(billion|million|bn|mn|b\b|m\b)|\d[\d,.]*\s*(억|조)\s*(달러|원)|market size|시장\s*규모/i;

export interface CitationFilterResult {
  kept: CitableSnippet[];
  /** Dropped as belonging to a different market, with the reason. */
  rejected: Array<{ title: string; reason: string }>;
}

/**
 * Filter and rank snippets for use as market-size citations.
 *
 * `category` is the project's category string and `productName` its
 * name — both are used only to decide whether a foreign-domain match is
 * actually this project's own domain.
 */
export function selectMarketSizeCitations(
  snippets: CitableSnippet[],
  opts: { category: string; productName: string; limit?: number },
): CitationFilterResult {
  const limit = opts.limit ?? 3;
  const subject = `${opts.category} ${opts.productName}`;
  const rejected: CitationFilterResult["rejected"] = [];

  const eligible = snippets.filter((s) => {
    const haystack = `${s.title} ${s.content ?? ""}`;
    for (const domain of FOREIGN_DOMAINS) {
      if (domain.terms.test(haystack) && !domain.ownedBy.test(subject)) {
        rejected.push({
          title: s.title,
          reason: `different market (${domain.terms.source.split("|")[0].replace(/\\b|\(|\)/g, "")})`,
        });
        return false;
      }
    }
    return true;
  });

  // Stable sort: sources that state a size first, then by whatever
  // relevance the provider gave us, then original order.
  const ranked = eligible
    .map((s, i) => ({
      s,
      i,
      hasSize: SIZE_CLAIM.test(`${s.title} ${s.content ?? ""}`) ? 1 : 0,
      score: s.score ?? 0,
    }))
    .sort((a, b) => b.hasSize - a.hasSize || b.score - a.score || a.i - b.i)
    .map((x) => x.s);

  return { kept: ranked.slice(0, limit), rejected };
}
