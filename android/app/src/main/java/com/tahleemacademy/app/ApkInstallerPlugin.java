package com.tahleemacademy.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * ApkInstaller — downloads the new APK inside the app (with progress) and
 * hands it to Android's installer, so nobody is sent to the browser.
 *
 * JS side: src/lib/apkUpdater.ts
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    private final ExecutorService exec = Executors.newSingleThreadExecutor();

    private File updatesDir() {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url");
        String requested = call.getString("fileName", "tahleem-update.apk");
        if (url == null || url.isEmpty()) {
            call.reject("url is required", "BAD_ARGS");
            return;
        }
        final String safeName = requested.replaceAll("[^A-Za-z0-9._-]", "_");
        exec.execute(() -> {
            HttpURLConnection c = null;
            File dir = updatesDir();
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) f.delete();   // drop stale downloads
            File tmp = new File(dir, safeName + ".part");
            File out = new File(dir, safeName);
            try {
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(20000);
                c.setReadTimeout(30000);
                c.setInstanceFollowRedirects(true);
                int code = c.getResponseCode();
                if (code != 200) {
                    call.reject("Download failed (HTTP " + code + ")", "HTTP");
                    return;
                }
                long total = c.getContentLengthLong();
                long done = 0;
                long lastEmit = 0;
                try (InputStream in = c.getInputStream(); FileOutputStream os = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        os.write(buf, 0, n);
                        done += n;
                        long now = System.currentTimeMillis();
                        if (now - lastEmit > 150) {
                            lastEmit = now;
                            JSObject p = new JSObject();
                            p.put("received", done);
                            p.put("total", total);
                            notifyListeners("progress", p);
                        }
                    }
                }
                if (total > 0 && tmp.length() != total) {
                    tmp.delete();
                    call.reject("Download was interrupted. Please try again.", "INCOMPLETE");
                    return;
                }
                if (out.exists()) out.delete();
                if (!tmp.renameTo(out)) {
                    call.reject("Could not save the update", "IO");
                    return;
                }
                // Make sure it's really this app's APK before we offer to install it.
                Context ctx = getContext();
                PackageInfo info = ctx.getPackageManager().getPackageArchiveInfo(out.getAbsolutePath(), 0);
                if (info == null || !ctx.getPackageName().equals(info.packageName)) {
                    out.delete();
                    call.reject("The downloaded file is not a valid Tahleem Academy update", "INVALID_APK");
                    return;
                }
                JSObject r = new JSObject();
                r.put("path", out.getAbsolutePath());
                r.put("size", out.length());
                call.resolve(r);
            } catch (Exception e) {
                tmp.delete();
                call.reject(e.getMessage() != null ? e.getMessage() : "Download failed", "DOWNLOAD", e);
            } finally {
                if (c != null) c.disconnect();
            }
        });
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        boolean allowed = Build.VERSION.SDK_INT < 26
            || getContext().getPackageManager().canRequestPackageInstalls();
        r.put("allowed", allowed);
        call.resolve(r);
    }

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("path is required", "BAD_ARGS");
            return;
        }
        try {
            Context ctx = getContext();
            File f = new File(path);
            // Only ever install files this plugin downloaded.
            if (!f.getCanonicalPath().startsWith(updatesDir().getCanonicalPath() + File.separator) || !f.exists()) {
                call.reject("Update file not found", "NOT_FOUND");
                return;
            }
            JSObject r = new JSObject();
            if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
                Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + ctx.getPackageName()));
                s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(s);
                r.put("started", false);
                r.put("needsPermission", true);
                call.resolve(r);
                return;
            }
            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            r.put("started", true);
            r.put("needsPermission", false);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Could not start the installer", "INSTALL", e);
        }
    }
}
