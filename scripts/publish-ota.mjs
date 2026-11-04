import { execSync } from "node:child_process";
import { writeFileSync, rmSync, statSync } from "node:fs";

const RAW = process.env.OTA_BASE_URL?.trim();
const BASE = RAW ? (/^https?:\/\//i.test(RAW) ? RAW : `https://${RAW}`).replace(/\/$/, "") : undefined;
const BUCKET = process.env.OTA_BUCKET || "tahleem-mushaf";
const notes = process.argv[2] || "";
if (!BASE) { console.error("Set OTA_BASE_URL"); process.exit(1); }

const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

const d = new Date();
const p = (n) => String(n).padStart(2, "0");
const version = `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;

// versionCode in build.gradle is computed automatically now (minutes since 1970), so there is no
// number to read. 0 = every installed APK may take this update. Only raise it by hand when the
// update needs native code the old APK doesn't have.
const minNativeBuild = Number(process.env.OTA_MIN_NATIVE_BUILD || 0);

console.log(`\n▶ Building ${version}`);
run("npx vite build", { VITE_OTA_VERSION: version, VITE_OTA_BASE_URL: BASE });

rmSync("ota.zip", { force: true });
run("cd dist && zip -qr ../ota.zip .");
console.log(`  bundle size: ${(statSync("ota.zip").size / 1024 / 1024).toFixed(1)} MB`);

const manifest = { version, url: `${BASE}/ota/${version}.zip`, minNativeBuild, notes };
writeFileSync("ota-manifest.json", JSON.stringify(manifest, null, 2));

console.log("\n▶ Uploading bundle");
run(`npx wrangler r2 object put ${BUCKET}/ota/${version}.zip --file ota.zip --content-type application/zip --remote`);
console.log("\n▶ Publishing manifest");
run(`npx wrangler r2 object put ${BUCKET}/ota/manifest.json --file ota-manifest.json --content-type application/json --cache-control no-cache --remote`);

rmSync("ota.zip", { force: true });
rmSync("ota-manifest.json", { force: true });

// The upload can succeed while phones still can't reach it (worker not deployed, wrong
// OTA_BASE_URL secret). Fetch it the way a phone would and fail this run if it doesn't work.
console.log("\n▶ Checking phones can reach it");
const fail = (msg) => { console.error(`\n❌ ${msg}`); process.exit(1); };
try {
  const r = await fetch(`${BASE}/ota/manifest.json?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) fail(`${BASE}/ota/manifest.json returned HTTP ${r.status}. Deploy cloudflare/ota-serve and/or fix the OTA_BASE_URL secret.`);
  const live = await r.json();
  if (live.version !== version) fail(`Manifest at ${BASE} says ${live.version}, expected ${version} (stale cache or wrong bucket).`);
  const z = await fetch(manifest.url, { method: "HEAD" });
  if (!z.ok) fail(`Bundle ${manifest.url} returned HTTP ${z.status}.`);
} catch (e) {
  fail(`Could not reach ${BASE}: ${e.message}`);
}
console.log(`\n✅ Published ${version}`);
