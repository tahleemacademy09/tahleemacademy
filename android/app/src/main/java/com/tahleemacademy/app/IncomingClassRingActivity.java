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
