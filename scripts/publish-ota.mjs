import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";

const BASE = process.env.OTA_BASE_URL?.replace(/\/$/, "");
const BUCKET = process.env.OTA_BUCKET || "tahleem-ota";
const notes = process.argv[2] || "";
if (!BASE) { console.error("Set OTA_BASE_URL"); process.exit(1); }

const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

const d = new Date();
const p = (n) => String(n).padStart(2, "0");
const version = `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;

const gradle = readFileSync("android/app/build.gradle", "utf8");
const minNativeBuild = Number(gradle.match(/versionCode\s+(\d+)/)?.[1] ?? 0);

console.log(`\n▶ Building ${version} (native build ${minNativeBuild})`);
run("npx vite build", { VITE_OTA_VERSION: version, VITE_OTA_BASE_URL: BASE });

rmSync("ota.zip", { force: true });
run("cd dist && zip -qr ../ota.zip .");

const manifest = { version, url: `${BASE}/ota/${version}.zip`, minNativeBuild, notes };
writeFileSync("ota-manifest.json", JSON.stringify(manifest, null, 2));

console.log("\n▶ Uploading bundle");
run(`npx wrangler r2 object put ${BUCKET}/ota/${version}.zip --file ota.zip --content-type application/zip --remote`);
console.log("\n▶ Publishing manifest");
run(`npx wrangler r2 object put ${BUCKET}/ota/manifest.json --file ota-manifest.json --content-type application/json --cache-control no-cache --remote`);

rmSync("ota.zip", { force: true });
rmSync("ota-manifest.json", { force: true });
console.log(`\n✅ Published ${version}`);
