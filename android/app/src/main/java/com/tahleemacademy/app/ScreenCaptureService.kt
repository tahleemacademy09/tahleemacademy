package com.tahleemacademy.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CompletableDeferred

/**
 * Android 10+ refuses to hand out a MediaProjection unless a foreground service of
 * type "mediaProjection" is already running (hard SecurityException on Android 14+).
 * This is that service. ScreenSharePlugin starts it right after the user taps
 * "Start now" on the system dialog and stops it when sharing ends.
 */
class ScreenCaptureService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val channelId = "tahleem_screen_share"
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(
                NotificationChannel(channelId, "Screen sharing", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_stat_icon)
            .setContentTitle("Sharing your screen")
            .setContentText("Your class can see your screen")
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIF_ID, notification)
        }
        ready?.complete(Unit)          // tells the plugin it is now safe to capture
        return START_NOT_STICKY
    }

    companion object {
        private const val NOTIF_ID = 4107
        @Volatile var ready: CompletableDeferred<Unit>? = null

        fun start(ctx: Context) {
            ready = CompletableDeferred()
            ContextCompat.startForegroundService(ctx, Intent(ctx, ScreenCaptureService::class.java))
        }

        fun stop(ctx: Context) {
            ready = null
            ctx.stopService(Intent(ctx, ScreenCaptureService::class.java))
        }
    }
}
