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

async function dump(path: string, label: string) {
  console.log(`\n=== ${label} (${path}) ===`);
  const r = await fetch(`https://api.replicate.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("status:", r.status);
  for (const [k, v] of r.headers.entries()) {
    if (/ratelimit|retry-after/i.test(k)) console.log("hdr", k, "=", v);
  }
  const body = await r.text();
  console.log("body:", body.slice(0, 1500));
}

async function main() {
  await dump("/v1/account", "Account");

  // List recent predictions to see what's been billed
  await dump("/v1/predictions?limit=5", "Recent predictions");

  // Try a tiny prediction to see the live throttle response
  console.log("\n=== One prediction attempt ===");
  const version = "a029dff38972b5fda4ec5d75598ff6b1b85ec3779ee2c2b97e9aa1d1a8a89f1b"; // 851-labs/background-remover
  const r = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      version,
      input: {
        image:
          "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=512",
      },
    }),
  });
  console.log("status:", r.status);
  for (const [k, v] of r.headers.entries()) {
    if (/ratelimit|retry-after/i.test(k)) console.log("hdr", k, "=", v);
  }
  console.log("body:", (await r.text()).slice(0, 1000));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
