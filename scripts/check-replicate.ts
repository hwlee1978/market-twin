import fs from "fs";

function loadEnv() {
  if (process.env.REPLICATE_API_TOKEN) return;
  try {
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
      }
    }
  } catch {}
}
loadEnv();

const token = process.env.REPLICATE_API_TOKEN!;

// A real public test image (small portrait jpeg from Replicate's sample bucket)
const TEST_IMAGE =
  "https://replicate.delivery/pbxt/IIaslJM5KOZ1aXOZIa7izRl0ZqLp4MTaO0V9obQGyhjqyXfA/output.png";

async function getLatestVersion(owner: string, name: string): Promise<string | null> {
  const r = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { latest_version?: { id?: string } };
  return j.latest_version?.id ?? null;
}

async function tryVersion(owner: string, name: string) {
  const version = await getLatestVersion(owner, name);
  if (!version) {
    console.log(`${owner}/${name}: cannot fetch version`);
    return;
  }
  const t0 = Date.now();
  const r = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({ version, input: { image: TEST_IMAGE } }),
  });
  const elapsed = Date.now() - t0;
  const body = await r.text();
  console.log(`${owner}/${name} (${version.slice(0, 8)}) → ${r.status} in ${elapsed}ms`);
  if (r.status !== 200 && r.status !== 201) {
    console.log("  body:", body.slice(0, 400));
  } else {
    try {
      const j = JSON.parse(body) as { status: string; output: unknown; error: string | null };
      console.log(`  status=${j.status}, output=${JSON.stringify(j.output)?.slice(0, 200)}, error=${j.error}`);
    } catch {
      console.log("  parse fail body:", body.slice(0, 200));
    }
  }
}

async function main() {
  console.log("Token org: hwlee78\n");
  for (const [o, n] of [
    ["lucataco", "remove-bg"],
    ["851-labs", "background-remover"],
    ["cjwbw", "rembg"],
  ] as Array<[string, string]>) {
    await tryVersion(o, n);
    await new Promise((r) => setTimeout(r, 500));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
