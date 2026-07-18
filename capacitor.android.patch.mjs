import fs from "node:fs";
import path from "node:path";

const manifestPath = path.join(process.cwd(), "android/app/src/main/AndroidManifest.xml");

if (!fs.existsSync(manifestPath)) {
  console.error("AndroidManifest.xml not found. Run `npx cap add android` first, then run this patch again.");
  process.exit(1);
}

let xml = fs.readFileSync(manifestPath, "utf8");

function addPermission(name) {
  if (xml.includes(`android.permission.${name}`)) return;
  xml = xml.replace(
    /<manifest([^>]*)>/,
    `<manifest$1>\n    <uses-permission android:name="android.permission.${name}" />`,
  );
}

function addApplicationNode(node, marker) {
  if (xml.includes(marker)) return;
  xml = xml.replace(/<application([^>]*)>/, `<application$1>\n        ${node}`);
}

// <queries> is a top-level sibling of <application>, not nested inside it —
// needed so DontKillMyApp can detect which OEM battery/auto-start app is
// installed (Samsung, Xiaomi, Huawei, etc.) to open the right settings screen.
function addManifestQueries(packages, marker) {
  if (xml.includes(marker)) return;
  const block =
    `    <queries>\n` +
    `        <!-- OEM auto-start/battery settings packages — used by DontKillMyApp -->\n` +
    packages.map(p => `        <package android:name="${p}" />`).join("\n") +
    `\n    </queries>\n`;
  xml = xml.replace(/<\/manifest>/, `${block}</manifest>`);
}

[
  "POST_NOTIFICATIONS",
  "FOREGROUND_SERVICE",
  "FOREGROUND_SERVICE_MICROPHONE",
  "WAKE_LOCK",
  "RECORD_AUDIO",
  "REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
].forEach(addPermission);

addApplicationNode(
  `<receiver android:name="io.capawesome.capacitorjs.plugins.foregroundservice.NotificationActionBroadcastReceiver" />`,
  "NotificationActionBroadcastReceiver",
);

addApplicationNode(
  `<service android:name="io.capawesome.capacitorjs.plugins.foregroundservice.AndroidForegroundService" android:foregroundServiceType="microphone" />`,
  "AndroidForegroundService",
);

// OEM auto-start / battery-saver settings packages (Samsung, Xiaomi, Huawei,
// Oppo, Vivo, etc.) — required by @squareetlabs/capacitor-dont-kill-my-app
// so it can detect and open the right manufacturer-specific settings screen
// when prompting the user to whitelist the app from background killing.
addManifestQueries(
  [
    "com.asus.mobilemanager",
    "com.miui.securitycenter",
    "com.letv.android.letvsafe",
    "com.huawei.systemmanager",
    "com.coloros.safecenter",
    "com.oppo.safe",
    "com.iqoo.secure",
    "com.vivo.permissionmanager",
    "com.evenwell.powersaving.g3",
    "com.samsung.android.lool",
    "com.oneplus.security",
    "com.lenovo.powersetting",
    "com.meizu.safe",
  ],
  "OEM auto-start/battery settings packages",
);

fs.writeFileSync(manifestPath, xml);
console.log("Android foreground service manifest entries are ready.");