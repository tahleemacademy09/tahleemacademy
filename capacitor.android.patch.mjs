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

[
  "POST_NOTIFICATIONS",
  "FOREGROUND_SERVICE",
  "FOREGROUND_SERVICE_MICROPHONE",
  "WAKE_LOCK",
  "RECORD_AUDIO",
].forEach(addPermission);

addApplicationNode(
  `<receiver android:name="io.capawesome.capacitorjs.plugins.foregroundservice.NotificationActionBroadcastReceiver" />`,
  "NotificationActionBroadcastReceiver",
);

addApplicationNode(
  `<service android:name="io.capawesome.capacitorjs.plugins.foregroundservice.AndroidForegroundService" android:foregroundServiceType="microphone" />`,
  "AndroidForegroundService",
);

fs.writeFileSync(manifestPath, xml);
console.log("Android foreground service manifest entries are ready.");