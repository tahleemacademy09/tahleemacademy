import re
# 1) Native: add readLog() to ApkInstallerPlugin
p='android/app/src/main/java/com/tahleemacademy/app/ApkInstallerPlugin.java'
s=open(p).read()
if 'readLog' not in s:
    method='''
    /** Returns this app's own recent logcat lines about the updater (debug aid). */
    @PluginMethod
    public void readLog(final PluginCall call) {
        exec.execute(() -> {
            try {
                Process pr = Runtime.getRuntime().exec(new String[]{"logcat", "-d", "-t", "1500"});
                java.io.BufferedReader br = new java.io.BufferedReader(new java.io.InputStreamReader(pr.getInputStream()));
                java.util.ArrayList<String> keep = new java.util.ArrayList<>();
                String line;
                while ((line = br.readLine()) != null) {
                    String l = line.toLowerCase();
                    if (l.contains("capgo") || l.contains("updater") || l.contains("okhttp") || l.contains("zipexception") || l.contains("ioexception") || l.contains("w system.err")) {
                        keep.add(line.length() > 220 ? line.substring(0, 220) : line);
                    }
                }
                int from = Math.max(0, keep.size() - 14);
                JSObject ret = new JSObject();
                ret.put("log", android.text.TextUtils.join("\\n", keep.subList(from, keep.size())));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("readLog failed: " + e);
            }
        });
    }
'''
    i=s.rstrip().rfind('}')
    s=s[:i]+method+'}\n'
    open(p,'w').write(s)
    print("java patched")
else:
    print("java already patched")

# 2) JS: append that log to the OTA error text
p='src/lib/otaUpdate.ts'
s=open(p).read()
if 'readLog' not in s:
    s=s.replace('import { Capacitor, CapacitorHttp } from "@capacitor/core";','import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";')
    old='status("failed", { error: String(e?.message ?? e) + probe });'
    new='''try {
      const AI = registerPlugin<any>("ApkInstaller");
      const lg = await AI.readLog();
      probe += " | NATIVE LOG: " + String(lg?.log ?? "").replace(/\\n/g, " ¶ ");
    } catch (le: any) { probe += " | readLog failed: " + String(le?.message ?? le); }
    status("failed", { error: String(e?.message ?? e) + probe });'''
    assert old in s, "otaUpdate pattern not found"
    s=s.replace(old,new)
    open(p,'w').write(s)
    print("ts patched")
else:
    print("ts already patched")
