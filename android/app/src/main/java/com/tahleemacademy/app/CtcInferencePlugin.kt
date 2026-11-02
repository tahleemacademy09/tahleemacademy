package com.tahleemacademy.app

import ai.onnxruntime.OnnxJavaType
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import ai.onnxruntime.TensorInfo
import android.content.Context
import android.media.AudioAttributes
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors

/**
 * CtcInference — runs the Quran CTC model (FastConformer, ONNX) with ONNX Runtime Mobile instead of WASM.
 *
 * Why: the WASM build runs at ~0.3x real time on a phone (one thread), so it can never keep up with a student who
 * is still reciting. The native build uses several CPU threads and the ARM int8 kernels, which is what makes
 * word-by-word checking while reciting possible.
 *
 * This plugin ONLY does the heavy part (log-mel features in -> CTC log-probabilities out). Tokenising, alignment,
 * the live matcher and the grading all stay in TypeScript (src/lib/ctcAlign.ts, src/lib/ctcNative.ts), so the
 * result is identical to the WASM engine's.
 *
 * Also exposes vibrate(): a mistake buzz that is not muted while the microphone is recording.
 *
 * JS side: src/lib/ctcNative.ts
 */
@CapacitorPlugin(name = "CtcInference")
class CtcInferencePlugin : Plugin() {

    // one thread: calls run strictly one after another (the session is also given its own intra-op threads)
    private val exec = Executors.newSingleThreadExecutor()
    private var env: OrtEnvironment? = null
    private var session: OrtSession? = null
    private var loadedPath: String? = null
    private var inputNames: List<String> = emptyList()
    private var usedThreads = 0

    @PluginMethod
    fun load(call: PluginCall) {
        val path = call.getString("path")
        if (path.isNullOrEmpty()) {
            call.reject("path is required", "BAD_ARGS")
            return
        }
        val wanted = call.getInt("threads", 0) ?: 0
        exec.execute {
            try {
                if (session != null && loadedPath == path) {
                    call.resolve(info())
                    return@execute
                }
                try { session?.close() } catch (_: Throwable) { }
                session = null
                val e = OrtEnvironment.getEnvironment()
                env = e
                val cores = Runtime.getRuntime().availableProcessors()
                // big cores do the work; using every core just makes the little ones the bottleneck
                val threads = if (wanted > 0) wanted else maxOf(2, minOf(4, cores / 2))
                val opts = OrtSession.SessionOptions()
                opts.setIntraOpNumThreads(threads)
                opts.setInterOpNumThreads(1)
                opts.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
                val s = e.createSession(path, opts)
                session = s
                loadedPath = path
                usedThreads = threads
                inputNames = s.inputNames.toList()
                call.resolve(info())
            } catch (t: Throwable) {
                session = null
                loadedPath = null
                call.reject("load failed: " + (t.message ?: t.javaClass.simpleName), "LOAD_FAILED")
            }
        }
    }

    private fun info(): JSObject {
        val o = JSObject()
        o.put("threads", usedThreads)
        val names = JSArray()
        inputNames.forEach { names.put(it) }
        o.put("inputs", names)
        return o
    }

    /**
     * mel:    base64 little-endian float32, row-major [80, frames]   (same layout the WASM engine feeds the model)
     * frames: number of mel frames
     * ->      lp: base64 little-endian float32 [T, V] (raw model output; the JS side normalises if needed), T, V, ms
     */
    @PluginMethod
    fun run(call: PluginCall) {
        val melB64 = call.getString("mel")
        val frames = call.getInt("frames", 0) ?: 0
        if (melB64.isNullOrEmpty() || frames <= 0) {
            call.reject("mel and frames are required", "BAD_ARGS")
            return
        }
        exec.execute {
            val s = session
            val e = env
            if (s == null || e == null) {
                call.reject("model not loaded", "NOT_LOADED")
                return@execute
            }
            var melT: OnnxTensor? = null
            var lenT: OnnxTensor? = null
            try {
                val t0 = System.nanoTime()
                val bytes = Base64.decode(melB64, Base64.NO_WRAP)
                if (bytes.size != 80 * frames * 4) {
                    call.reject("mel size mismatch: ${bytes.size} bytes for $frames frames", "BAD_ARGS")
                    return@execute
                }
                val direct = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.LITTLE_ENDIAN)
                direct.put(bytes)
                direct.rewind()
                val mt = OnnxTensor.createTensor(e, direct.asFloatBuffer(), longArrayOf(1, 80, frames.toLong()))
                melT = mt
                val feeds = HashMap<String, OnnxTensor>()
                feeds[inputNames[0]] = mt
                if (inputNames.size > 1) {
                    val lt = OnnxTensor.createTensor(e, longArrayOf(frames.toLong()))
                    lenT = lt
                    feeds[inputNames[1]] = lt
                }
                s.run(feeds).use { result ->
                    // same rule as the WASM worker: the 3-D float output whose last dim is the vocabulary (not the 512-wide encoder)
                    var best: OnnxTensor? = null
                    var shape: LongArray? = null
                    for (entry in result) {
                        val v = entry.value as? OnnxTensor ?: continue
                        val ti = v.info as? TensorInfo ?: continue
                        if (ti.type != OnnxJavaType.FLOAT) continue
                        val sh = ti.shape
                        if (sh.size == 3 && sh[2] > 100 && sh[1] != 512L) { best = v; shape = sh; break }
                    }
                    if (best == null || shape == null) {
                        call.reject("log-prob output not found", "BAD_OUTPUT")
                        return@use
                    }
                    val fb = best.floatBuffer
                    val out = ByteBuffer.allocate(fb.remaining() * 4).order(ByteOrder.LITTLE_ENDIAN)
                    out.asFloatBuffer().put(fb)
                    val res = JSObject()
                    res.put("lp", Base64.encodeToString(out.array(), Base64.NO_WRAP))
                    res.put("T", shape[1])
                    res.put("V", shape[2])
                    res.put("ms", (System.nanoTime() - t0) / 1_000_000)
                    call.resolve(res)
                }
            } catch (t: Throwable) {
                call.reject("run failed: " + (t.message ?: t.javaClass.simpleName), "RUN_FAILED")
            } finally {
                try { melT?.close() } catch (_: Throwable) { }
                try { lenT?.close() } catch (_: Throwable) { }
            }
        }
    }

    @PluginMethod
    fun unload(call: PluginCall) {
        exec.execute {
            try { session?.close() } catch (_: Throwable) { }
            session = null
            loadedPath = null
            call.resolve()
        }
    }

    /**
     * Mistake buzz. pattern = waveform timings in ms [off, on, off, on, ...].
     * Sent with ALARM usage so Android does not drop it while the microphone is recording, or in silent mode.
     */
    @PluginMethod
    @Suppress("DEPRECATION")
    fun vibrate(call: PluginCall) {
        try {
            val arr = call.getArray("pattern")
            val n = arr?.length() ?: 0
            val pattern = if (n > 0) LongArray(n) { i -> arr!!.getLong(i) } else longArrayOf(0, 150)
            val ctx = context
            val vib: Vibrator? = if (Build.VERSION.SDK_INT >= 31) {
                (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            } else {
                ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            if (vib == null || !vib.hasVibrator()) {
                call.reject("no vibrator", "NO_VIBRATOR")
                return
            }
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            if (Build.VERSION.SDK_INT >= 26) {
                vib.vibrate(VibrationEffect.createWaveform(pattern, -1), attrs)
            } else {
                vib.vibrate(pattern, -1, attrs)   // minSdk 24: pre-VibrationEffect overload
            }
            call.resolve()
        } catch (t: Throwable) {
            call.reject("vibrate failed: " + (t.message ?: t.javaClass.simpleName), "VIBRATE_FAILED")
        }
    }

    override fun handleOnDestroy() {
        try { session?.close() } catch (_: Throwable) { }
        session = null
        exec.shutdown()
        super.handleOnDestroy()
    }
}
