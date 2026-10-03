package com.tahleemacademy.app

import android.app.Activity
import android.content.Context
import android.media.projection.MediaProjectionManager
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
import io.livekit.android.room.track.Track
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

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
        // Android shows its own "Start recording or casting?" dialog
        startActivityForResult(call, manager.createScreenCaptureIntent(), "onProjectionResult")
    }

    @ActivityCallback
    private fun onProjectionResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) { starting = false; return }
        val data = result.data
        if (result.resultCode != Activity.RESULT_OK || data == null) {
            starting = false
            call.reject("Screen capture permission was denied", "DENIED")
            return
        }
        val url = call.getString("url").orEmpty()
        val token = call.getString("token").orEmpty()

        scope.launch {
            val newRoom = LiveKit.create(context.applicationContext)
            try {
                newRoom.connect(url, token)
                newRoom.localParticipant.setScreenShareEnabled(true, data)
                room = newRoom
                watch(newRoom)
                call.resolve()
            } catch (e: Throwable) {
                runCatching { newRoom.disconnect() }
                runCatching { newRoom.release() }
                call.reject(e.message ?: "Could not start screen share", "FAILED")
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
                    if (event is RoomEvent.Disconnected) onEnded()
                }
            }
            launch {
                delay(3000)
                while (true) {
                    delay(1000)
                    if (r.localParticipant.getTrackPublication(Track.Source.SCREEN_SHARE) == null) {
                        onEnded()
                        break
                    }
                }
            }
        }
    }

    private fun onEnded() {
        if (room == null) return
        teardown()
        notifyListeners("stopped", JSObject())
    }

    private fun teardown() {
        watcher?.cancel()
        watcher = null
        room?.let {
            runCatching { it.disconnect() }
            runCatching { it.release() }
        }
        room = null
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
