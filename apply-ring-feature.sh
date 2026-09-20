#!/bin/bash
set -e
cd /workspaces/tahleemacademy

echo "── 1/5: Writing native Java files ──────────────────────────────────"
mkdir -p android/app/src/main/java/com/tahleemacademy/app

cat > android/app/src/main/java/com/tahleemacademy/app/RingMessagingService.java << 'JAVAEOF'
package com.tahleemacademy.app;

import androidx.annotation.NonNull;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;

import java.util.Map;

public class RingMessagingService extends FirebaseMessagingService {

    private static final String RING_CHANNEL_ID = "tahleem_ring";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");
        if ("class_ring".equals(type) || "admin_class_ring".equals(type) || "ring".equals(type)) {
            showRing(data);
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        PushNotificationsPlugin.onNewToken(token);
    }

    private void showRing(Map<String, String> data) {
        String title = data.get("title") != null ? data.get("title") : "Class is live now";
        String message = data.get("message") != null ? data.get("message") : "";
        String path = data.get("url") != null ? data.get("url") : "/";

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel channel = new NotificationChannel(
                RING_CHANNEL_ID, "Class Ring", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Full-screen ring when a live class starts");
            channel.enableVibration(true);
            channel.setSound(null, null);
            nm.createNotificationChannel(channel);
        }

        Intent fullScreenIntent = new Intent(this, IncomingClassRingActivity.class);
        fullScreenIntent.putExtra("title", title);
        fullScreenIntent.putExtra("message", message);
        fullScreenIntent.putExtra("path", path);
        fullScreenIntent.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK |
            Intent.FLAG_ACTIVITY_CLEAR_TOP |
            Intent.FLAG_ACTIVITY_SINGLE_TOP
        );

        int requestCode = path.hashCode();
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
            this, requestCode, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, RING_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_icon)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setAutoCancel(true);

        if (nm != null) nm.notify(requestCode, builder.build());
    }
}
JAVAEOF

cat > android/app/src/main/java/com/tahleemacademy/app/IncomingClassRingActivity.java << 'JAVAEOF'
package com.tahleemacademy.app;

import android.app.KeyguardManager;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

public class IncomingClassRingActivity extends AppCompatActivity {

    private Ringtone ringtone;
    private Vibrator vibrator;
    private final Handler ringHandler = new Handler(Looper.getMainLooper());
    private boolean ringing = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }

        setContentView(buildLayout());
        startRinging();
    }

    private LinearLayout buildLayout() {
        String title = getIntent().getStringExtra("title");
        String message = getIntent().getStringExtra("message");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(64, 220, 64, 120);
        root.setBackgroundColor(0xFF064E3B);
        root.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView label = new TextView(this);
        label.setText("CLASS IS LIVE NOW");
        label.setTextColor(0xFFD4AF37);
        label.setTextSize(13);
        root.addView(label);

        TextView titleView = new TextView(this);
        titleView.setText(title != null ? title : "Live Class");
        titleView.setTextColor(0xFFFFFFFF);
        titleView.setTextSize(26);
        titleView.setPadding(0, 28, 0, 0);
        root.addView(titleView);

        if (message != null && !message.isEmpty()) {
            TextView msgView = new TextView(this);
            msgView.setText(message);
            msgView.setTextColor(0xCCFFFFFF);
            msgView.setTextSize(14);
            msgView.setPadding(0, 16, 0, 0);
            root.addView(msgView);
        }

        LinearLayout spacer = new LinearLayout(this);
        spacer.setLayoutParams(new LinearLayout.LayoutParams(0, 0, 1f));
        root.addView(spacer);

        LinearLayout buttonRow = new LinearLayout(this);
        buttonRow.setOrientation(LinearLayout.HORIZONTAL);
        buttonRow.setWeightSum(2f);

        Button dismissBtn = new Button(this);
        dismissBtn.setText("Dismiss");
        LinearLayout.LayoutParams dismissParams =
            new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        dismissParams.setMargins(0, 0, 20, 0);
        dismissBtn.setLayoutParams(dismissParams);
        dismissBtn.setOnClickListener(v -> { stopRinging(); finish(); });
        buttonRow.addView(dismissBtn);

        Button joinBtn = new Button(this);
        joinBtn.setText("Join Now");
        joinBtn.setLayoutParams(
            new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        joinBtn.setOnClickListener(v -> { stopRinging(); openClass(); });
        buttonRow.addView(joinBtn);

        root.addView(buttonRow);
        return root;
    }

    private void openClass() {
        String path = getIntent().getStringExtra("path");
        if (path == null || path.isEmpty()) path = "/";
        Uri deepLink = Uri.parse("tahleemacademy://ring" + path);
        Intent intent = new Intent(Intent.ACTION_VIEW, deepLink, this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finish();
    }

    private void startRinging() {
        ringing = true;
        try {
            Uri ringUri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE);
            ringtone = RingtoneManager.getRingtone(this, ringUri);
            if (ringtone != null) {
                ringtone.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            }
        } catch (Exception ignored) {}

        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        long[] pattern = {0, 400, 200, 400, 1600};
        if (vibrator != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
            }
        }

        ringHandler.post(ringLoopRunnable);
    }

    private final Runnable ringLoopRunnable = new Runnable() {
        @Override
        public void run() {
            if (!ringing || ringtone == null) return;
            if (!ringtone.isPlaying()) ringtone.play();
            ringHandler.postDelayed(this, 2600);
        }
    };

    private void stopRinging() {
        ringing = false;
        ringHandler.removeCallbacks(ringLoopRunnable);
        if (ringtone != null && ringtone.isPlaying()) ringtone.stop();
        if (vibrator != null) vibrator.cancel();
    }

    @Override
    protected void onDestroy() {
        stopRinging();
        super.onDestroy();
    }
}
JAVAEOF

echo "── 2/5: Patching capacitor.android.patch.mjs ───────────────────────"
python3 - << 'PYEOF'
path = "capacitor.android.patch.mjs"
with open(path) as f:
    content = f.read()

if "RingMessagingService" in content:
    print("Already patched — skipping.")
else:
    addition = '''
// ── Class ring: replace push-notifications' default FCM service with ours ──
if (!xml.includes("xmlns:tools=")) {
  xml = xml.replace(/<manifest ([^>]*)>/, (m, attrs) => `<manifest ${attrs} xmlns:tools="http://schemas.android.com/tools">`);
}

addPermission("USE_FULL_SCREEN_INTENT");

addApplicationNode(
  `<service android:name="com.capacitorjs.plugins.pushnotifications.MessagingService" tools:node="remove" />`,
  \'pushnotifications.MessagingService" tools:node="remove"\',
);
addApplicationNode(
  `<service android:name=".RingMessagingService" android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>`,
  ".RingMessagingService",
);
addApplicationNode(
  `<activity android:name=".IncomingClassRingActivity" android:exported="false" android:launchMode="singleTop" />`,
  ".IncomingClassRingActivity",
);

function addMainActivityRingDeepLink() {
  if (xml.includes(\'android:scheme="tahleemacademy"\')) return;
  const activityRe = /<activity\\b([^>]*android:name="[^"]*\\.MainActivity"[^>]*)>/;
  const match = xml.match(activityRe);
  if (!match) {
    console.warn("MainActivity <activity> tag not found — skipping ring deep link patch.");
    return;
  }
  const intentFilter =
    `
        <intent-filter>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="tahleemacademy" android:host="ring" />
        </intent-filter>`;
  xml = xml.replace(activityRe, `${match[0]}${intentFilter}`);
}
addMainActivityRingDeepLink();

'''
    marker = 'fs.writeFileSync(manifestPath, xml);'
    content = content.replace(marker, addition + marker)
    with open(path, "w") as f:
        f.write(content)
    print("Patched capacitor.android.patch.mjs")
PYEOF

echo "── 3/5: Patching send-notification/index.ts ─────────────────────────"
python3 - << 'PYEOF'
path = "supabase/functions/send-notification/index.ts"
with open(path) as f:
    content = f.read()

old = '''    const accessToken = await getGoogleAccessToken(serviceAccountJson);
    const body = {
      message: {
        token: fcmToken,
        notification: { title: payload.title, body: payload.message },
        data: { url: payload.url, type: payload.type },
        android: { priority: "high", notification: { sound: "default", click_action: "FLUTTER_NOTIFICATION_CLICK", channel_id: "tahleem_default" } },
        apns: { payload: { aps: { sound: "default", badge: 1 } } },
      },
    };'''

new = '''    const accessToken = await getGoogleAccessToken(serviceAccountJson);

    const isRingType = ["class_ring", "admin_class_ring", "ring"].includes(payload.type);

    const body = isRingType
      ? {
          message: {
            token: fcmToken,
            data: {
              url: payload.url,
              type: payload.type,
              title: payload.title,
              message: payload.message,
            },
            android: { priority: "high" },
          },
        }
      : {
          message: {
            token: fcmToken,
            notification: { title: payload.title, body: payload.message },
            data: { url: payload.url, type: payload.type },
            android: { priority: "high", notification: { sound: "default", click_action: "FLUTTER_NOTIFICATION_CLICK", channel_id: "tahleem_default" } },
            apns: { payload: { aps: { sound: "default", badge: 1 } } },
          },
        };'''

if old not in content:
    print("WARNING: exact block not found — file may have changed. No changes made.")
elif new.split("\n")[5] in content:
    print("Already patched — skipping.")
else:
    content = content.replace(old, new)
    with open(path, "w") as f:
        f.write(content)
    print("Patched send-notification/index.ts")
PYEOF

echo "── 4/5: Re-running manifest patch, sync, and build ──────────────────"
node capacitor.android.patch.mjs
npx cap sync android
cd android && export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
./gradlew assembleDebug > /tmp/build.log 2>&1; tail -40 /tmp/build.log
cd ..

echo "── 5/5: Deploying edge function ──────────────────────────────────────"
supabase functions deploy send-notification || echo "Deploy command failed or not configured — deploy manually and check above."

echo "── Done. Check for BUILD SUCCESSFUL above. ──────────────────────────"
