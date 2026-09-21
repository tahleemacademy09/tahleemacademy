package com.tahleemacademy.app;

import androidx.annotation.NonNull;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class RingMessagingService extends FirebaseMessagingService {

    private static final String RING_CHANNEL_ID    = "tahleem_ring";
    private static final String GENERAL_CHANNEL_ID = "tahleem_general";
    private static final String GROUP_KEY           = "com.tahleemacademy.app.NOTIFICATIONS";
    private static final int    SUMMARY_ID          = 0;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");
        if ("class_ring".equals(type) || "admin_class_ring".equals(type) || "ring".equals(type)) {
            showRing(data);
        } else if (data.get("title") != null || data.get("message") != null) {
            showGeneral(data);
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        PushNotificationsPlugin.onNewToken(token);
    }

    // A direct-into-app deep link via our own custom scheme, handled by
    // MainActivity's existing appUrlOpen -> navigateToUrl SPA bridge. Never
    // an http(s) URL here, so Android never routes this to a browser.
    private PendingIntent buildJoinPendingIntent(String path, int requestCode) {
        Uri deepLinkUri = Uri.parse("tahleemacademy://ring" + path);
        Intent joinIntent = new Intent(Intent.ACTION_VIEW, deepLinkUri);
        joinIntent.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK |
            Intent.FLAG_ACTIVITY_CLEAR_TOP |
            Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        return PendingIntent.getActivity(
            this, requestCode, joinIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void showRing(Map<String, String> data) {
        String title = data.get("title") != null ? data.get("title") : "Class is live now";
        String message = data.get("message") != null ? data.get("message") : "";
        String path = data.get("url") != null ? data.get("url") : "/";

        Uri ringUri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE);
        if (ringUri == null) {
            ringUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        }

        long[] vibrationPattern = { 0, 1000, 500, 1000, 500, 1000, 500, 1000 };

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel channel = new NotificationChannel(
                RING_CHANNEL_ID, "Class Ring", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Rings when a live class starts");
            channel.enableVibration(true);
            channel.setVibrationPattern(vibrationPattern);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            channel.setSound(ringUri, audioAttributes);

            nm.createNotificationChannel(channel);
        }

        int requestCode = path.hashCode();

        // Full-screen intent: what the OS auto-launches when the phone is
        // locked/off — shows the incoming-call style screen with Join/Dismiss.
        Intent fullScreenIntent = new Intent(this, IncomingClassRingActivity.class);
        fullScreenIntent.putExtra("title", title);
        fullScreenIntent.putExtra("message", message);
        fullScreenIntent.putExtra("path", path);
        fullScreenIntent.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK |
            Intent.FLAG_ACTIVITY_CLEAR_TOP |
            Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
            this, requestCode, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Plain tap on the notification banner (phone unlocked, full-screen
        // UI didn't auto-launch): go straight into the class, no extra screen.
        PendingIntent tapPendingIntent = buildJoinPendingIntent(path, requestCode + 1);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, RING_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_icon)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setContentIntent(tapPendingIntent)
            .setSound(ringUri)
            .setVibrate(vibrationPattern)
            .setAutoCancel(true);

        if (nm != null) nm.notify(requestCode, builder.build());
    }

    private void showGeneral(Map<String, String> data) {
        String title = data.get("title") != null ? data.get("title") : "Tahleem Academy";
        String message = data.get("message") != null ? data.get("message") : "";
        String path = data.get("url") != null ? data.get("url") : "/";

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel channel = new NotificationChannel(
                GENERAL_CHANNEL_ID, "Tahleem Academy", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("General notifications");
            channel.enableVibration(true);
            nm.createNotificationChannel(channel);
        }

        int requestCode = (path + "-" + System.currentTimeMillis()).hashCode();
        PendingIntent contentPendingIntent = buildJoinPendingIntent(path, requestCode);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, GENERAL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_icon)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(contentPendingIntent)
            .setGroup(GROUP_KEY);

        if (nm != null) {
            nm.notify(requestCode, builder.build());
            updateSummary(nm);
        }
    }

    private void updateSummary(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;

        int count = 0;
        List<String> lines = new ArrayList<>();
        StatusBarNotification[] active = nm.getActiveNotifications();
        for (StatusBarNotification sbn : active) {
            if (sbn.getId() == SUMMARY_ID) continue;
            if (!GROUP_KEY.equals(sbn.getNotification().getGroup())) continue;
            count++;
            CharSequence t = sbn.getNotification().extras.getCharSequence(Notification.EXTRA_TITLE);
            if (t != null) lines.add(t.toString());
        }
        if (count <= 1) return;

        NotificationCompat.InboxStyle inbox = new NotificationCompat.InboxStyle()
            .setBigContentTitle("Tahleem Academy")
            .setSummaryText(count + " new notifications");
        for (String line : lines) inbox.addLine(line);

        NotificationCompat.Builder summary = new NotificationCompat.Builder(this, GENERAL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_icon)
            .setContentTitle("Tahleem Academy")
            .setContentText(count + " new notifications")
            .setStyle(inbox)
            .setGroup(GROUP_KEY)
            .setGroupSummary(true)
            .setAutoCancel(true);

        nm.notify(SUMMARY_ID, summary.build());
    }
}
