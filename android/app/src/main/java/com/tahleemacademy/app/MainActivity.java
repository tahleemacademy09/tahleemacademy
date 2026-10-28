package com.tahleemacademy.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local (in-app) Capacitor plugins must be registered before super.onCreate()
        registerPlugin(ScreenSharePlugin.class);
        registerPlugin(ApkInstallerPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        askFullScreenIntentPermissionOnce();
    }

    // Android 14+ turns USE_FULL_SCREEN_INTENT off by default for non-call apps,
    // so the lock-screen "class is live" ring screen never appears. Send the user
    // to the one settings page that enables it - once only.
    private void askFullScreenIntentPermissionOnce() {
        if (Build.VERSION.SDK_INT < 34) return;
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null || nm.canUseFullScreenIntent()) return;
            SharedPreferences prefs = getSharedPreferences("tahleem_ring", MODE_PRIVATE);
            if (prefs.getBoolean("fsi_prompted", false)) return;
            prefs.edit().putBoolean("fsi_prompted", true).apply();
            Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Exception ignored) {}
    }
}
