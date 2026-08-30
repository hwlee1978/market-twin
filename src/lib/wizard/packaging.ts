import type { ProductPackaging } from "@/lib/format/packaging";
import { PACKAGING_UNITS } from "@/lib/format/packaging";
import type { FormState } from "./types";

/**
 * Turn the wizard's packaging inputs (all strings, straight off number
 * fields) into the API payload — or undefined when the user skipped the
 * section, so the server stores NULL and prompts render exactly as before.
 *
 * A net content without a unit is dropped rather than sent: "100" with no
 * unit would land in the prompt as a meaningless number. The wizard's
 * pricing-step validation catches that case first; this is the backstop.
 */
export function packagingPayload(form: FormState): ProductPackaging | undefined {
  const num = (v: string): number | undefined => {
    const n = Number(v.trim());
    return v.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const unit = PACKAGING_UNITS.find((u) => u === form.netContentUnit);
  const netContent = unit ? num(form.netContent) : undefined;
  const unitsPerPack = num(form.unitsPerPack);
  const caseQty = num(form.caseQty);
  const packFormat = form.packFormat.trim().slice(0, 60);

  const payload: ProductPackaging = {
    ...(netContent !== undefined ? { netContent } : {}),
    ...(netContent !== undefined && unit ? { netContentUnit: unit } : {}),
    ...(unitsPerPack !== undefined ? { unitsPerPack: Math.round(unitsPerPack) } : {}),
    ...(packFormat ? { packFormat } : {}),
    ...(caseQty !== undefined ? { caseQty: Math.round(caseQty) } : {}),
  };
  return Object.keys(payload).length ? payload : undefined;
}
