package com.tahleemacademy.app

import android.app.Activity
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.provider.Settings
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.LocalVideoTrackOptions
import io.livekit.android.room.track.VideoCaptureParameter
import io.livekit.android.room.track.Track
import io.livekit.android.room.participant.VideoTrackPublishOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

/**
 * ScreenShare — shares the phone's whole screen into the live class.
 *
 * The WebView has no getDisplayMedia(), so this plugin does it natively:
 *   1. asks Android for screen-capture permission (MediaProjection dialog),
 *   2. joins the class's LiveKit room as a second, publish-only participant
 *      ("<userId>::screen" — the token comes from the livekit-token function),
 *   3. publishes the screen as that participant's screen-share track.
 * Everyone in the class sees it through the normal screen-share tile.
 *
 * JS side: src/lib/nativeScreenShare.ts
 */
@CapacitorPlugin(name = "ScreenShare")
class ScreenSharePlugin : Plugin() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var room: Room? = null
    private var watcher: Job? = null
    private var starting = false
    private var screenTrack: LocalVideoTrack? = null
    private var savedFilter: Int? = null          // Do Not Disturb state to restore afterwards

    /** Reject with a message that says WHICH step broke, on which Android version, and why. */
    private fun fail(call: PluginCall, stage: String, e: Throwable?, extra: String = "") {
        val why = if (e == null) extra else "${e.javaClass.simpleName}: ${e.message ?: "no message"}"
        call.reject("[$stage] $why (Android API ${Build.VERSION.SDK_INT}, ${Build.MANUFACTURER} ${Build.MODEL})", stage.uppercase())
    }

    private fun nm() = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    @PluginMethod
    fun hasDndAccess(call: PluginCall) {
        call.resolve(JSObject().put("granted", nm().isNotificationPolicyAccessGranted))
    }

    @PluginMethod
    fun openDndSettings(call: PluginCall) {
        val i = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(i)
        call.resolve()
    }

    /** Alarms-only Do Not Disturb: no heads-up pop-ups reach the shared screen. */
    private fun silenceNotifications(on: Boolean) {
        val m = nm()
        if (!m.isNotificationPolicyAccessGranted) return
        if (on) {
            if (savedFilter == null) savedFilter = m.currentInterruptionFilter
            m.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALARMS)
        } else {
            savedFilter?.let { m.setInterruptionFilter(it) }
            savedFilter = null
        }
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        screenTrack?.enabled = false
        call.resolve()
    }

    @PluginMethod
    fun resume(call: PluginCall) {
        screenTrack?.enabled = true
        call.resolve()
    }

    @PluginMethod
    fun start(call: PluginCall) {
        val url = call.getString("url")
        val token = call.getString("token")
        if (url.isNullOrBlank() || token.isNullOrBlank()) {
            call.reject("url and token are required", "BAD_ARGS")
            return
        }
        if (room != null) {                       // already sharing — nothing to do
            call.resolve()
            return
        }
        if (starting) {
            call.reject("Screen share is already starting", "BUSY")
            return
        }
        starting = true
        val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val sdk = Build.VERSION.SDK_INT
        // Android shows its own capture dialog. On Android 14+ it offers "one app" or "entire screen";
        // we ask for exactly what the user picked in the app so single-app sharing is explicit.
        val mode = call.getString("mode") ?: "app"
        try {
            val intent = if (sdk >= 34) {
                manager.createScreenCaptureIntent(
                    if (mode == "screen") MediaProjectionConfig.createConfigForDefaultDisplay()
                    else MediaProjectionConfig.createConfigForUserChoice()
                )
            } else manager.createScreenCaptureIntent()
            startActivityForResult(call, intent, "onProjectionResult")
        } catch (e: Throwable) {
            starting = false
            fail(call, "dialog", e)
        }
    }

    @ActivityCallback
    private fun onProjectionResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) { starting = false; return }
        val data = result.data
        if (result.resultCode != Activity.RESULT_OK || data == null) {
            starting = false
            if (result.resultCode == Activity.RESULT_CANCELED) {
                call.reject("[permission] You cancelled the Android share dialog (or Android refused it). Tap Share and choose Start now / the app to share.", "DENIED")
            } else {
                fail(call, "permission", null, "Android returned resultCode=${result.resultCode}, data=${if (data == null) "null" else "ok"}")
            }
            return
        }
        val url = call.getString("url").orEmpty()
        val token = call.getString("token").orEmpty()
        val quality = call.getString("quality") ?: "medium"
        val silence = call.getBoolean("silenceNotifications") ?: false

        scope.launch {
            // Must be running BEFORE the projection is used (Android 10+ / hard requirement on 14+).
            // Picking a single app makes Android launch that app immediately, so the first start can
            // race with Tahleem going to the background — retry a few times.
            try {
                var attempt = 0
                while (true) {
                    try {
                        ScreenCaptureService.start(context.applicationContext)
                        withTimeout(4000) { ScreenCaptureService.ready?.await() }
                        break
                    } catch (e: Throwable) {
                        if (++attempt >= 3) throw e
                        ScreenCaptureService.stop(context.applicationContext)
                        delay(300)
                    }
                }
            } catch (e: Throwable) {
                ScreenCaptureService.stop(context.applicationContext)
                starting = false
                fail(call, "service", e)
                return@launch
            }
            val newRoom = LiveKit.create(context.applicationContext)
            val dm = context.resources.displayMetrics
            val sw = dm.widthPixels.coerceAtLeast(1)
            val sh = dm.heightPixels.coerceAtLeast(1)
            val (maxDim, fps) = when (quality) {
                "low" -> 960f to 10
                "high" -> 1920f to 20
                else -> 1280f to 15
            }
            val k = minOf(1f, maxDim / maxOf(sw, sh))
            val cw = ((sw * k).toInt() / 2) * 2
            val ch = ((sh * k).toInt() / 2) * 2
            var stage = "connect"
            try {
                newRoom.connect(url, token)
                stage = "capture"
                val screenTrack = newRoom.localParticipant.createScreencastTrack(
                    "screen", data,
                    LocalVideoTrackOptions(isScreencast = true, captureParams = VideoCaptureParameter(cw, ch, fps))
                )
                screenTrack.startCapture()
                stage = "publish"
                newRoom.localParticipant.publishVideoTrack(
                    screenTrack,
                    VideoTrackPublishOptions(source = Track.Source.SCREEN_SHARE, simulcast = false)
                )
                this@ScreenSharePlugin.screenTrack = screenTrack
                if (silence) silenceNotifications(true)
                room = newRoom
                watch(newRoom)
                call.resolve()
            } catch (e: Throwable) {
                runCatching { newRoom.disconnect() }
                runCatching { newRoom.release() }
                ScreenCaptureService.stop(context.applicationContext)
                fail(call, stage, e)
            } finally {
                starting = false
            }
        }
    }

    /** Tell the web page when sharing ends without the user tapping Stop in the app. */
    private fun watch(r: Room) {
        watcher = scope.launch {
            launch {
                r.events.collect { event ->
                    if (event is RoomEvent.Disconnected) onEnded("Connection to the class was lost")
                }
            }
            launch {
                delay(3000)
                while (true) {
                    delay(1000)
                    if (r.localParticipant.getTrackPublication(Track.Source.SCREEN_SHARE) == null) {
                        onEnded("Android stopped the capture (the shared app was closed, or the system ended sharing)")
                        break
                    }
                }
            }
        }
    }

    private fun onEnded(reason: String) {
        if (room == null) return
        teardown()
        notifyListeners("stopped", JSObject().put("reason", reason))
    }

    private fun teardown() {
        watcher?.cancel()
        watcher = null
        room?.let {
            runCatching { it.disconnect() }
            runCatching { it.release() }
        }
        room = null
        screenTrack = null
        silenceNotifications(false)
        ScreenCaptureService.stop(context.applicationContext)
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        teardown()
        call.resolve()
    }

    @PluginMethod
    fun isSharing(call: PluginCall) {
        call.resolve(JSObject().put("sharing", room != null))
    }

    override fun handleOnDestroy() {
        teardown()
        scope.cancel()
        super.handleOnDestroy()
    }
}
