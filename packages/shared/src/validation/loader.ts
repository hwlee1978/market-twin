/**
 * Ground truth loader. Reads JSON files from `validation/ground-truth/`,
 * parses them with the schema, and exposes filtered views (by split,
 * by category) for benchmark runners.
 *
 * Loader is filesystem-based, not bundled — ground truth must be discoverable
 * at runtime so benchmark CI can swap the dataset without rebuild.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { parseGroundTruth, type GroundTruth, type ProductCategory } from "./schema";

export interface LoadedTruth {
  /** Filename without extension. Used as stable product slug. */
  slug: string;
  /** Absolute path of the JSON file. */
  path: string;
  truth: GroundTruth;
}

const DEFAULT_DIR = path.resolve(process.cwd(), "validation", "ground-truth");

export async function loadAllGroundTruth(dir: string = DEFAULT_DIR): Promise<LoadedTruth[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    throw new Error(`Could not read ground-truth dir '${dir}': ${(err as Error).message}`);
  }
  const jsonFiles = entries.filter((f) => f.endsWith(".json"));
  const out: LoadedTruth[] = [];
  for (const file of jsonFiles) {
    const full = path.join(dir, file);
    const raw = JSON.parse(await fs.readFile(full, "utf8"));
    let truth: GroundTruth;
    try {
      truth = parseGroundTruth(raw);
    } catch (err) {
      throw new Error(`Invalid ground truth '${file}': ${(err as Error).message}`);
    }
    out.push({ slug: file.replace(/\.json$/, ""), path: full, truth });
  }
  return out;
}

export function filterBySplit(items: LoadedTruth[], split: "TUNING" | "HOLDOUT"): LoadedTruth[] {
  return items.filter((i) => i.truth.split === split);
}

export function filterByCategory(items: LoadedTruth[], category: ProductCategory): LoadedTruth[] {
  return items.filter((i) => i.truth.category === category);
}

/**
 * Quick coverage summary for governance — call from `npm run validation:status`.
 */
export interface CoverageSummary {
  total: number;
  byCategory: Record<string, number>;
  bySplit: Record<"TUNING" | "HOLDOUT", number>;
  byPriceBand: Record<"<$5" | "$5-20" | "$20-100" | "$100+", number>;
  leakageHighRiskCount: number;
}

export function summarizeCoverage(items: LoadedTruth[]): CoverageSummary {
  const byCategory: Record<string, number> = {};
  const bySplit = { TUNING: 0, HOLDOUT: 0 };
  const byPriceBand = { "<$5": 0, "$5-20": 0, "$20-100": 0, "$100+": 0 };
  let leak = 0;
  for (const { truth } of items) {
    byCategory[truth.category] = (byCategory[truth.category] ?? 0) + 1;
    bySplit[truth.split]++;
    const p = truth.priceUsd;
    if (p < 5) byPriceBand["<$5"]++;
    else if (p < 20) byPriceBand["$5-20"]++;
    else if (p < 100) byPriceBand["$20-100"]++;
    else byPriceBand["$100+"]++;
    if (truth.leakageRisk.inTrainingData) leak++;
  }
  return {
    total: items.length,
    byCategory,
    bySplit,
    byPriceBand,
    leakageHighRiskCount: leak,
  };
}
