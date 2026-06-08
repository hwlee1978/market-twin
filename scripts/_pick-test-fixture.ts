import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  // 어느 테이블에 데이터가 있나?
  for (const t of [
    "ch_pp_companies",
    "ch_pp_products",
    "ch_voucher_exports",
    "ch_pp_programs",
    "ch_voucher_programs",
  ]) {
    const r = await svc.from(t).select("id", { count: "exact", head: true });
    console.log(`${t.padEnd(22)} count=${r.count ?? "?"}`);
  }

  // products + companies sample
  console.log("\n=== ch_pp_products 샘플 5개 ===");
  const p = await svc.from("ch_pp_products").select("*").limit(5);
  for (const r of (p.data ?? []) as Array<Record<string, unknown>>) {
    console.log("---");
    console.log(JSON.stringify(r, null, 2).slice(0, 800));
  }

  console.log("\n=== ch_pp_companies 샘플 5개 ===");
  const c = await svc.from("ch_pp_companies").select("*").limit(5);
  for (const r of (c.data ?? []) as Array<Record<string, unknown>>) {
    console.log("---");
    console.log(JSON.stringify(r, null, 2).slice(0, 800));
  }
}

main().catch(console.error);
