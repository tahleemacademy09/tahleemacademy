<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FIXED: GuestClassroom.tsx</title>
<style>
  body{margin:0;background:#1e1e2e;color:#cdd6f4;font-family:monospace;font-size:13px}
  #bar{position:sticky;top:0;background:#181825;padding:12px 16px;display:flex;align-items:center;gap:12px;z-index:10;border-bottom:1px solid #313244}
  #bar h2{margin:0;font-size:14px;color:#89b4fa;flex:1}
  button{background:#89b4fa;color:#1e1e2e;border:none;padding:8px 18px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer}
  button:active{background:#74c7ec}
  #code{white-space:pre-wrap;word-break:break-all;padding:16px;line-height:1.55}
</style>
</head>
<body>
<div id="bar">
  <h2>📄 GuestClassroom.tsx</h2>
  <button onclick="copy()">Copy All</button>
</div>
<div id="code">/*
  GuestClassroom.tsx — Tahleem Academy Public Live Class
  ──────────────────────────────────────────────────────
  WhatsApp-call-style background behaviour:
  • Canvas PiP (Picture-in-Picture) fires automatically when:
      - user presses the Minimize button
      - user presses the Android Back button
      - screen turns off / browser is sent to background
  • Audio keeps playing via silent AudioContext keep-alive
  • MediaSession exposes lock-screen controls (return / leave)
  • Wake-lock prevents screen sleeping mid-class
  • Auto-reconnect: up to 5 attempts, progressive back-off
  • Top bar: compact mobile layout — no overflow/overlap
  
  Fixes:
  • Leave/End button in header — sets intentional flag BEFORE disconnect
  • LiveKit default leave button is hidden (it reconnects without the flag)
  • Participant count badge in header
  • Join/leave chime sounds (Web Audio API — no external file needed)
  • Participant join toast notification
*/

import { useEffect, useState, useRef, useCallback } from &quot;react&quot;;
import { useLocation, useNavigate, useParams } from &quot;react-router-dom&quot;;
import {
  LiveKitRoom, VideoConference, RoomAudioRenderer, useRoomContext,
} from &quot;@livekit/components-react&quot;;
import &quot;@livekit/components-styles&quot;;
import { Track, ConnectionState, RoomEvent, Participant, ConnectionQuality } from &quot;livekit-client&quot;;
import { supabase } from &quot;@/integrations/supabase/client&quot;;
import { storageSupabase } from &quot;../../integrations/supabase/storageClient&quot;;
import {
  UserPlus, Radio, Circle, Loader2,
  Mic, Pause, Play, Square, X, Phone,
  Minimize2, RefreshCw, Users, LogOut,
} from &quot;lucide-react&quot;;
import ClassChatPanel    from &quot;@/components/classroom/ClassChatPanel&quot;;
import ClassPolls        from &quot;@/components/classroom/ClassPolls&quot;;
import ClassParticipants from &quot;@/components/classroom/ClassParticipants&quot;;
import ClassControls     from &quot;@/components/classroom/ClassControls&quot;;
import LiveQuizOverlay   from &quot;@/components/classroom/LiveQuizOverlay&quot;;
import { useIsMobile }   from &quot;@/hooks/use-mobile&quot;;


/* ════════════════════════════════════════════════════════
   STYLES
   ════════════════════════════════════════════════════════ */
const CSS = `
  @import url(&#x27;https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&amp;display=swap&#x27;);

  @keyframes gc-spin      { to { transform:rotate(360deg); } }
  @keyframes gc-pulse     { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.82)} }
  @keyframes gc-rec-pulse { 0%,100%{opacity:1}50%{opacity:.25} }
  @keyframes gc-fade-up   { from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)} }
  @keyframes gc-slide-up  { from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1} }
  @keyframes gc-bounce-in { 0%{transform:scale(.82);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1} }
  @keyframes gc-toast-in  { from{opacity:0;transform:translateY(-14px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes gc-toast-out { from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-8px)} }

  [data-gc-root] {
    font-family:&#x27;Google Sans&#x27;,&#x27;Roboto&#x27;,sans-serif;
    -webkit-font-smoothing:antialiased;
    overscroll-behavior:none;
    -webkit-overflow-scrolling:touch;
    touch-action:pan-y;
    padding-bottom:env(safe-area-inset-bottom,0px);
  }
  [data-gc-root] * { box-sizing:border-box; }
  [data-gc-root] button {
    -webkit-tap-highlight-color:transparent;
    touch-action:manipulation;
    font-family:&#x27;Google Sans&#x27;,&#x27;Roboto&#x27;,sans-serif;
  }

  /* Badge pill */
  .gc-pill {
    display:inline-flex; align-items:center; gap:4px;
    padding:4px 8px; border-radius:20px;
    font-size:11px; font-weight:600; white-space:nowrap; flex-shrink:0;
    font-family:&#x27;Google Sans&#x27;,sans-serif;
  }

  /* Sidebar */
  .gc-sidebar {
    width:280px; display:flex; flex-direction:column;
    background:rgba(32,33,36,.97);
    border-left:1px solid rgba(255,255,255,.07);
    flex-shrink:0; animation:gc-slide-up .22s ease;
  }

  /* Reconnect overlay */
  .gc-reconnect-overlay {
    position:absolute; inset:0; z-index:200;
    background:rgba(32,33,36,.92); backdrop-filter:blur(12px);
    display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:16px;
    animation:gc-fade-up .2s ease;
  }

  /* LK theme override — hide the default leave/disconnect button */
  [data-lk-theme] { height:100%!important; display:flex!important; flex-direction:column!important; }
  .lk-video-conference { height:100%!important; }
  .lk-disconnect-button { display:none!important; }

  /* LK control bar */
  .lk-control-bar {
    border-top: 1px solid rgba(255,255,255,.08) !important;
    background: rgba(22,23,25,.98) !important;
    backdrop-filter: blur(16px) !important;
    padding: 10px 118px 10px 16px !important;
    padding-bottom: calc(10px + env(safe-area-inset-bottom,0px)) !important;
    gap: 10px !important;
    position: relative !important;
  }

  /* Mic and Camera split-button groups — dark pill background like image 3 */
  .lk-button-group {
    background: rgba(255,255,255,.1) !important;
    border-radius: 24px !important;
    overflow: visible !important;
  }
  .lk-button-group .lk-button {
    background: transparent !important;
    border-radius: 24px !important;
  }
  .lk-button-group .lk-button:hover {
    background: rgba(255,255,255,.08) !important;
  }

  /* All other standalone buttons in the control bar */
  .lk-control-bar &gt; .lk-button {
    background: rgba(255,255,255,.08) !important;
    border-radius: 24px !important;
    padding: 10px 14px !important;
  }
  .lk-control-bar &gt; .lk-button:hover {
    background: rgba(255,255,255,.14) !important;
  }

  /* ── Fix: tile containers — LiveKit forces aspect-ratio:16/9 which
     letterboxes portrait phone video. Strip it so tiles fill freely. ── */
  .lk-grid-layout,
  .lk-focus-layout {
    width: 100% !important;
    height: 100% !important;
  }
  .lk-participant-tile {
    overflow: hidden !important;
    aspect-ratio: unset !important;
    width: 100% !important;
  }

  /* ── Fix: videos fill their tile with no black bars ── */
  .lk-participant-tile video,
  .lk-grid-layout video,
  .lk-focus-layout video,
  .lk-video-conference video {
    object-fit: cover !important;
    width: 100% !important;
    height: 100% !important;
  }

  /* ── CSS baseline: strip mirror from all tiles.
     The MutationObserver sets per-tile inline !important which wins. ── */
  .lk-participant-tile video {
    transform: none !important;
    -webkit-transform: none !important;
  }
`;

/* ════════════════════════════════════════════════════════
   CANVAS PiP
   ════════════════════════════════════════════════════════ */
const GOLD = &quot;#c9a84c&quot;;
const DARK_BG = &quot;#0c1f12&quot;;
const PIP_W = 320, PIP_H = 180;

interface PipHandle {
  video:       HTMLVideoElement;
  setMicMuted: (v: boolean) =&gt; void;
  setInitial:  (v: string)  =&gt; void;
  pip:         () =&gt; Promise&lt;void&gt;;
  stop:        () =&gt; void;
}

function buildCanvasPip(
  initialChar: string,
  subjectName: string,
  onTap: () =&gt; void,
): PipHandle | null {
  if (!(&quot;requestPictureInPicture&quot; in HTMLVideoElement.prototype)) return null;

  const cv = document.createElement(&quot;canvas&quot;);
  cv.width = PIP_W; cv.height = PIP_H;
  const ctx = cv.getContext(&quot;2d&quot;);
  if (!ctx) return null;

  let micMuted = true;
  let letter   = initialChar;
  let raf      = 0;

  const drawMic = (mx: number, my: number, r: number) =&gt; {
    ctx.fillStyle = micMuted ? &quot;rgba(239,68,68,.95)&quot; : &quot;rgba(34,120,60,.95)&quot;;
    ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = &quot;#fff&quot;; ctx.strokeStyle = &quot;#fff&quot;; ctx.lineWidth = 1.5;
    const cs = r * 0.28;
    if (micMuted) {
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(mx, my - cs, cs, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = r * 0.18;
      ctx.beginPath();
      ctx.moveTo(mx - r * 0.52, my + r * 0.48);
      ctx.lineTo(mx + r * 0.52, my - r * 0.48);
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(mx, my - cs, cs, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(mx - cs * 1.2, my - cs * 0.3);
      ctx.quadraticCurveTo(mx - cs * 1.2, my + cs * 1.4, mx, my + cs * 1.7);
      ctx.quadraticCurveTo(mx + cs * 1.2, my + cs * 1.4, mx + cs * 1.2, my - cs * 0.3);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, my + cs * 1.7); ctx.lineTo(mx, my + cs * 2.5); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx - cs * 0.9, my + cs * 2.5); ctx.lineTo(mx + cs * 0.9, my + cs * 2.5); ctx.stroke();
    }
  };

  const draw = () =&gt; {
    ctx.clearRect(0, 0, PIP_W, PIP_H);
    ctx.fillStyle = DARK_BG; ctx.fillRect(0, 0, PIP_W, PIP_H);
    ctx.fillStyle = &quot;rgba(201,168,76,0.35)&quot;; ctx.fillRect(0, PIP_H - 2, PIP_W, 2);

    const STRIP = 52;
    ctx.fillStyle = &quot;rgba(255,255,255,0.04)&quot;; ctx.fillRect(0, 0, STRIP, PIP_H);
    const p = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() / 700));
    ctx.fillStyle = `rgba(239,68,68,${p})`;
    ctx.beginPath(); ctx.arc(STRIP / 2, PIP_H / 2 - 10, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(239,68,68,${p * 0.4})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(STRIP / 2, PIP_H / 2 - 10, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = &quot;#fff&quot;; ctx.font = &quot;bold 10px system-ui,sans-serif&quot;;
    ctx.textAlign = &quot;center&quot;; ctx.textBaseline = &quot;middle&quot;;
    ctx.fillText(&quot;LIVE&quot;, STRIP / 2, PIP_H / 2 + 8);
    ctx.fillStyle = &quot;rgba(201,168,76,0.2)&quot;; ctx.fillRect(STRIP, 20, 1, PIP_H - 40);

    const avX = STRIP + 52, avY = PIP_H / 2, avR = 36;
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = DARK_BG;
    ctx.font = `bold ${avR * 0.75}px system-ui,-apple-system,sans-serif`;
    ctx.textAlign = &quot;center&quot;; ctx.textBaseline = &quot;middle&quot;;
    ctx.fillText(letter.toUpperCase().slice(0, 1), avX, avY);

    const nameX = avX + avR + 12;
    const nameW = PIP_W - nameX - 52;
    ctx.fillStyle = &quot;rgba(255,255,255,0.9)&quot;;
    ctx.font = &quot;600 13px system-ui,-apple-system,sans-serif&quot;;
    ctx.textAlign = &quot;left&quot;; ctx.textBaseline = &quot;middle&quot;;
    let name = subjectName;
    while (name.length &gt; 1 &amp;&amp; ctx.measureText(name).width &gt; nameW) name = name.slice(0, -1);
    if (name !== subjectName) name = name.trimEnd() + &quot;…&quot;;
    ctx.fillText(name, nameX, PIP_H / 2 - 8);
    ctx.fillStyle = &quot;rgba(255,255,255,0.4)&quot;; ctx.font = &quot;10px system-ui,sans-serif&quot;;
    ctx.fillText(&quot;Tap to return&quot;, nameX, PIP_H / 2 + 12);

    drawMic(PIP_W - 30, PIP_H / 2, 20);
    raf = requestAnimationFrame(draw);
  };
  draw();

  const vid = document.createElement(&quot;video&quot;);
  vid.srcObject = cv.captureStream(12);
  vid.muted = true; vid.playsInline = true;
  (vid as any).autopictureinpicture = true;
  vid.setAttribute(&quot;autopictureinpicture&quot;, &quot;&quot;);
  vid.style.cssText = &quot;position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;pointer-events:none;opacity:.01;z-index:-999;&quot;;
  document.body.appendChild(vid);
  vid.addEventListener(&quot;leavepictureinpicture&quot;, onTap);

  const keepPlaying = () =&gt; { if (document.body.contains(vid)) vid.play().catch(() =&gt; {}); };
  vid.addEventListener(&quot;pause&quot;, keepPlaying);
  vid.addEventListener(&quot;ended&quot;, keepPlaying);
  keepPlaying();

  const ensurePlaying = async () =&gt; {
    if (vid.paused || vid.readyState &lt; 2) {
      try { await vid.play(); } catch {}
      await new Promise(r =&gt; setTimeout(r, 80));
    }
  };

  const pip = async () =&gt; {
    if (document.pictureInPictureElement === vid) return;
    await ensurePlaying();
    try { await vid.requestPictureInPicture(); } catch {}
  };

  const stop = () =&gt; {
    cancelAnimationFrame(raf);
    vid.removeEventListener(&quot;pause&quot;, keepPlaying);
    vid.removeEventListener(&quot;ended&quot;, keepPlaying);
    (vid.srcObject as MediaStream | null)?.getTracks().forEach(t =&gt; t.stop());
    if (document.pictureInPictureElement === vid) document.exitPictureInPicture().catch(() =&gt; {});
    vid.remove();
  };

  return { video: vid, setMicMuted: v =&gt; { micMuted = v; }, setInitial: v =&gt; { letter = v; }, pip, stop };
}

/* ════════════════════════════════════════════════════════
   HOOKS
   ════════════════════════════════════════════════════════ */
function useSilentAudio(active: boolean) {
  const acRef = useRef&lt;AudioContext | null&gt;(null);
  const srcRef = useRef&lt;AudioBufferSourceNode | null&gt;(null);
  useEffect(() =&gt; {
    if (!active) {
      srcRef.current?.stop(); srcRef.current = null;
      acRef.current?.close(); acRef.current  = null;
      return;
    }
    const start = () =&gt; {
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AC();
        const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        src.connect(ctx.destination); src.start();
        acRef.current = ctx; srcRef.current = src;
      } catch {}
    };
    start();
    const resume = () =&gt; {
      if (document.visibilityState !== &quot;visible&quot;) return;
      const ctx = acRef.current;
      if (!ctx)                      { start(); return; }
      if (ctx.state === &quot;suspended&quot;) ctx.resume().catch(() =&gt; {});
      if (ctx.state === &quot;closed&quot;)    start();
    };
    document.addEventListener(&quot;visibilitychange&quot;, resume);
    window.addEventListener(&quot;focus&quot;, resume);
    return () =&gt; {
      document.removeEventListener(&quot;visibilitychange&quot;, resume);
      window.removeEventListener(&quot;focus&quot;, resume);
      srcRef.current?.stop(); srcRef.current = null;
      acRef.current?.close(); acRef.current  = null;
    };
  }, [active]);
}

function useWakeLock(active: boolean) {
  const lockRef = useRef&lt;WakeLockSentinel | null&gt;(null);
  const request = useCallback(async () =&gt; {
    if (!active || !(&quot;wakeLock&quot; in navigator)) return;
    try { lockRef.current = await navigator.wakeLock.request(&quot;screen&quot;); } catch {}
  }, [active]);
  useEffect(() =&gt; {
    if (!active) { lockRef.current?.release(); lockRef.current = null; return; }
    request();
    const fn = () =&gt; { if (document.visibilityState === &quot;visible&quot;) request(); };
    document.addEventListener(&quot;visibilitychange&quot;, fn);
    return () =&gt; { document.removeEventListener(&quot;visibilitychange&quot;, fn); lockRef.current?.release(); };
  }, [active, request]);
}

function useMediaSession(active: boolean, title: string, onReturn: () =&gt; void, onLeave: () =&gt; void) {
  useEffect(() =&gt; {
    if (!active || !(&quot;mediaSession&quot; in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: &quot;Tahleem Academy&quot;, album: &quot;🟢 Live Class&quot; });
    navigator.mediaSession.playbackState = &quot;playing&quot;;
    const sa = (a: MediaSessionAction, h: () =&gt; void) =&gt; { try { navigator.mediaSession.setActionHandler(a, h); } catch {} };
    sa(&quot;play&quot;, onReturn); sa(&quot;pause&quot;, onReturn); sa(&quot;stop&quot;, onLeave);
    sa(&quot;previoustrack&quot;, onReturn); sa(&quot;nexttrack&quot;, onReturn);
    return () =&gt; {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = &quot;none&quot;;
      ([&quot;play&quot;,&quot;pause&quot;,&quot;stop&quot;,&quot;previoustrack&quot;,&quot;nexttrack&quot;] as MediaSessionAction[])
        .forEach(a =&gt; { try { navigator.mediaSession.setActionHandler(a, null); } catch {} });
    };
  }, [active, title, onReturn, onLeave]);
}

/* ════════════════════════════════════════════════════════
   CHIME — synthesised Google Meet-style join/leave sound
   Shared AudioContext — primed on first user gesture so
   it works after mobile browser autoplay policy.
   ════════════════════════════════════════════════════════ */
let _sharedAC: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!_sharedAC || _sharedAC.state === &quot;closed&quot;) _sharedAC = new AC();
    return _sharedAC;
  } catch { return null; }
}
function primeAudioContext() {
  const ctx = getAudioContext();
  if (ctx &amp;&amp; ctx.state === &quot;suspended&quot;) ctx.resume().catch(() =&gt; {});
}
if (typeof document !== &quot;undefined&quot;) {
  [&quot;touchstart&quot;, &quot;touchend&quot;, &quot;click&quot;, &quot;keydown&quot;].forEach(ev =&gt; {
    document.addEventListener(ev, primeAudioContext, { once: false, passive: true, capture: true });
  });
}

function playChime(type: &quot;join&quot; | &quot;leave&quot;) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const resume = ctx.state === &quot;suspended&quot; ? ctx.resume() : Promise.resolve();
    resume.then(() =&gt; {
      const master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      const notes = type === &quot;join&quot;
        ? [{ freq:880, start:0, dur:0.12 }, { freq:1046, start:0.10, dur:0.18 }]
        : [{ freq:880, start:0, dur:0.12 }, { freq:698, start:0.10, dur:0.18 }];
      notes.forEach(({ freq, start, dur }) =&gt; {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = &quot;sine&quot;;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(1, ctx.currentTime + start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.connect(gain); gain.connect(master);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.05);
      });
    }).catch(() =&gt; {});
  } catch {}
}

/* ════════════════════════════════════════════════════════
   CONNECTION QUALITY INDICATOR (inside LiveKitRoom)
   ════════════════════════════════════════════════════════ */
const ConnectionIndicator = () =&gt; {
  const room = useRoomContext();
  const [quality, setQuality] = useState&lt;&quot;excellent&quot;|&quot;good&quot;|&quot;fair&quot;|&quot;poor&quot;&gt;(&quot;good&quot;);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() =&gt; {
    // RoomEvent.ConnectionQualityChanged fires with (quality: ConnectionQuality, participant: Participant)
    const syncQ = (q: ConnectionQuality, participant: Participant) =&gt; {
      if (participant.identity !== room.localParticipant.identity) return;
      setQuality(
        q === ConnectionQuality.Excellent ? &quot;excellent&quot; :
        q === ConnectionQuality.Good      ? &quot;good&quot;      :
        q === ConnectionQuality.Poor      ? &quot;poor&quot;      : &quot;fair&quot;
      );
    };
    // Also poll from localParticipant directly as fallback
    const pollQ = () =&gt; {
      const q = room.localParticipant.connectionQuality;
      setQuality(
        q === ConnectionQuality.Excellent ? &quot;excellent&quot; :
        q === ConnectionQuality.Good      ? &quot;good&quot;      :
        q === ConnectionQuality.Poor      ? &quot;poor&quot;      : &quot;good&quot;
      );
    };
    const syncS = (s: ConnectionState) =&gt; setReconnecting(s === ConnectionState.Reconnecting);
    room.on(RoomEvent.ConnectionQualityChanged, syncQ);
    room.on(RoomEvent.ConnectionStateChanged, syncS);
    const iv = setInterval(pollQ, 3000);
    pollQ();
    return () =&gt; {
      room.off(RoomEvent.ConnectionQualityChanged, syncQ);
      room.off(RoomEvent.ConnectionStateChanged, syncS);
      clearInterval(iv);
    };
  }, [room]);

  if (reconnecting) return (
    &lt;div style={{ display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:3 }}&gt;
      &lt;RefreshCw style={{ width:10, height:10, color:&quot;#facc15&quot;, animation:&quot;gc-spin .8s linear infinite&quot; }} /&gt;
      &lt;span style={{ fontSize:9, color:&quot;#facc15&quot;, fontWeight:600 }}&gt;SYNC&lt;/span&gt;
    &lt;/div&gt;
  );

  const col = { excellent:&quot;#22c55e&quot;, good:&quot;#86efac&quot;, fair:&quot;#facc15&quot;, poor:&quot;#ef4444&quot; }[quality];
  const bars = { excellent:4, good:3, fair:2, poor:1 }[quality];
  return (
    &lt;div style={{ display:&quot;flex&quot;, alignItems:&quot;flex-end&quot;, gap:2, height:13 }}&gt;
      {[1,2,3,4].map(i =&gt; (
        &lt;div key={i} style={{ width:3, borderRadius:2, height:`${i*3+2}px`, background: i&lt;=bars ? col : &quot;rgba(255,255,255,.18)&quot;, transition:&quot;background .3s&quot; }} /&gt;
      ))}
    &lt;/div&gt;
  );
};

/* ════════════════════════════════════════════════════════
   PARTICIPANT COUNT BADGE (inside LiveKitRoom context)
   ════════════════════════════════════════════════════════ */
const ParticipantCountBadge = ({ onClick }: { onClick?: () =&gt; void }) =&gt; {
  const room = useRoomContext();
  const [count, setCount] = useState(room.numParticipants || 1);

  useEffect(() =&gt; {
    const update = () =&gt; setCount(room.numParticipants || 1);
    room.on(RoomEvent.ParticipantConnected, update);
    room.on(RoomEvent.ParticipantDisconnected, update);
    room.on(RoomEvent.ConnectionStateChanged, update);
    update();
    return () =&gt; {
      room.off(RoomEvent.ParticipantConnected, update);
      room.off(RoomEvent.ParticipantDisconnected, update);
      room.off(RoomEvent.ConnectionStateChanged, update);
    };
  }, [room]);

  return (
    &lt;button
      onClick={onClick}
      title=&quot;Participants&quot;
      className=&quot;gc-pill&quot;
      style={{
        background:&quot;rgba(255,255,255,.07)&quot;, border:&quot;1px solid rgba(255,255,255,.12)&quot;,
        color:&quot;rgba(255,255,255,.8)&quot;, cursor:onClick?&quot;pointer&quot;:&quot;default&quot;,
        gap:4,
      }}
    &gt;
      &lt;Users style={{ width:10, height:10 }} /&gt;
      {count}
    &lt;/button&gt;
  );
};

/* ════════════════════════════════════════════════════════
   PARTICIPANT JOIN/LEAVE SOUNDS + TOAST
   (inside LiveKitRoom context)
   ════════════════════════════════════════════════════════ */
interface JoinToast { id: number; name: string; type: &quot;join&quot;|&quot;leave&quot;; }

const ParticipantEventHandler = ({
  onToast,
  soundEnabled,
}: {
  onToast: (t: JoinToast) =&gt; void;
  soundEnabled: boolean;
}) =&gt; {
  const room = useRoomContext();
  const toastId = useRef(0);
  // Seed with participants already in the room — only toast truly new arrivals.
  const seenRef = useRef&lt;Set&lt;string&gt;&gt;(new Set());

  useEffect(() =&gt; {
    room.remoteParticipants.forEach((_, identity) =&gt; seenRef.current.add(identity));
  }, [room]);

  useEffect(() =&gt; {
    const onJoin = (p: Participant) =&gt; {
      if (seenRef.current.has(p.identity)) return; // reconnect echo — skip
      seenRef.current.add(p.identity);
      if (soundEnabled) playChime(&quot;join&quot;);
      onToast({ id: ++toastId.current, name: p.name || p.identity || &quot;Someone&quot;, type: &quot;join&quot; });
    };
    const onLeave = (p: Participant) =&gt; {
      seenRef.current.delete(p.identity);
      onToast({ id: ++toastId.current, name: p.name || p.identity || &quot;Someone&quot;, type: &quot;leave&quot; });
    };
    room.on(RoomEvent.ParticipantConnected, onJoin);
    room.on(RoomEvent.ParticipantDisconnected, onLeave);
    return () =&gt; {
      room.off(RoomEvent.ParticipantConnected, onJoin);
      room.off(RoomEvent.ParticipantDisconnected, onLeave);
    };
  }, [room, onToast, soundEnabled]);

  return null;
};

/* ════════════════════════════════════════════════════════
   RECONNECT MONITOR (inside LiveKitRoom)
   ════════════════════════════════════════════════════════ */
const ReconnectMonitor = ({ onReconnecting, onReconnected, onDisconnected }: {
  onReconnecting: () =&gt; void; onReconnected: () =&gt; void; onDisconnected: () =&gt; void;
}) =&gt; {
  const room = useRoomContext();
  const onReconnectingRef  = useRef(onReconnecting);
  const onReconnectedRef   = useRef(onReconnected);
  const onDisconnectedRef  = useRef(onDisconnected);
  onReconnectingRef.current  = onReconnecting;
  onReconnectedRef.current   = onReconnected;
  onDisconnectedRef.current  = onDisconnected;

  useEffect(() =&gt; {
    const h = (s: ConnectionState) =&gt; {
      if (s === ConnectionState.Reconnecting)   onReconnectingRef.current();
      else if (s === ConnectionState.Connected)  onReconnectedRef.current();
      else if (s === ConnectionState.Disconnected) onDisconnectedRef.current();
    };
    room.on(RoomEvent.ConnectionStateChanged, h);
    return () =&gt; { room.off(RoomEvent.ConnectionStateChanged, h); };
  }, [room]);
  return null;
};

/* ════════════════════════════════════════════════════════
   RECORDING CONTROLLER (host only)
   ════════════════════════════════════════════════════════ */
const RecordingController = ({ classId, isHost, onSavingChange }: {
  classId: string; isHost: boolean; onSavingChange:(v:boolean)=&gt;void;
}) =&gt; {
  const room = useRoomContext();
  const [recording, setRecording]         = useState(false);
  const [paused, setPaused]               = useState(false);
  const [recTime, setRecTime]             = useState(0);
  const [saving, setSaving]               = useState(false);
  const [mode, setMode]                   = useState&lt;&quot;screen&quot;|&quot;audio&quot;|null&gt;(null);
  const timerRef     = useRef&lt;any&gt;(null);
  const recRef       = useRef&lt;MediaRecorder|null&gt;(null);
  const chunksRef    = useRef&lt;Blob[]&gt;([]);
  const streamsRef   = useRef&lt;MediaStream[]&gt;([]);
  const acRef        = useRef&lt;AudioContext|null&gt;(null);

  useEffect(() =&gt; () =&gt; { clearInterval(timerRef.current); streamsRef.current.forEach(s=&gt;s.getTracks().forEach(t=&gt;t.stop())); }, []);

  const collectAudio = useCallback((): MediaStream|null =&gt; {
    try {
      const ac = new AudioContext(); acRef.current = ac;
      const dest = ac.createMediaStreamDestination();
      let n = 0;
      for (const p of [room.localParticipant, ...Array.from(room.remoteParticipants.values())]) {
        for (const pub of p.trackPublications.values()) {
          if (pub.track &amp;&amp; (pub.source===Track.Source.Microphone||pub.source===Track.Source.ScreenShareAudio)) {
            const mst = pub.track.mediaStreamTrack;
            if (mst?.readyState===&quot;live&quot;) { ac.createMediaStreamSource(new MediaStream([mst])).connect(dest); n++; }
          }
        }
      }
      return n &gt; 0 ? dest.stream : null;
    } catch { return null; }
  }, [room]);

  const start = useCallback(async () =&gt; {
    let stream: MediaStream|null = null; let m: &quot;screen&quot;|&quot;audio&quot; = &quot;audio&quot;;
    if (typeof navigator.mediaDevices.getDisplayMedia === &quot;function&quot;) {
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video:{ width:1280, height:720 } as any, audio:true });
        m = &quot;screen&quot;;
        const ra = collectAudio();
        if (ra &amp;&amp; acRef.current) {
          const ctx=acRef.current; const dest=ctx.createMediaStreamDestination();
          stream.getAudioTracks().forEach(t=&gt;{ ctx.createMediaStreamSource(new MediaStream([t])).connect(dest); });
          ra.getAudioTracks().forEach(t=&gt;{ ctx.createMediaStreamSource(new MediaStream([t])).connect(dest); });
          stream = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
        }
      } catch { stream=null; }
    }
    if (!stream) { m=&quot;audio&quot;; stream=collectAudio(); if (!stream) { try { stream=await navigator.mediaDevices.getUserMedia({audio:true}); } catch { return; } } }
    streamsRef.current.push(stream);
    const isVid = stream.getVideoTracks().length &gt; 0;
    const mime = isVid
      ? (MediaRecorder.isTypeSupported(&quot;video/webm;codecs=vp9,opus&quot;)?&quot;video/webm;codecs=vp9,opus&quot;:&quot;video/webm&quot;)
      : (MediaRecorder.isTypeSupported(&quot;audio/webm;codecs=opus&quot;)?&quot;audio/webm;codecs=opus&quot;:&quot;audio/webm&quot;);
    const rec = new MediaRecorder(stream, { mimeType:mime });
    chunksRef.current = [];
    rec.ondataavailable = e =&gt; { if (e.data.size&gt;0) chunksRef.current.push(e.data); };
    if (isVid) stream.getVideoTracks()[0]?.addEventListener(&quot;ended&quot;, ()=&gt;{ if (recRef.current?.state!==&quot;inactive&quot;) stop(); });
    rec.start(1000); recRef.current=rec; setMode(m); setRecording(true); setPaused(false); setRecTime(0);
    timerRef.current = setInterval(()=&gt;setRecTime(p=&gt;p+1), 1000);
  }, [collectAudio]);

  const stop = useCallback(async () =&gt; {
    clearInterval(timerRef.current);
    const m=mode;
    if (!recRef.current||recRef.current.state===&quot;inactive&quot;) { setRecording(false); setPaused(false); setRecTime(0); return; }
    setSaving(true); onSavingChange(true);
    await new Promise&lt;void&gt;(res=&gt;{ recRef.current!.onstop=()=&gt;res(); recRef.current!.stop(); });
    streamsRef.current.forEach(s=&gt;s.getTracks().forEach(t=&gt;t.stop())); streamsRef.current=[];
    if (acRef.current) { acRef.current.close().catch(()=&gt;{}); acRef.current=null; }
    setRecording(false); setPaused(false); setRecTime(0);
    const isVid=m===&quot;screen&quot;;
    const blob=new Blob(chunksRef.current, { type:isVid?&quot;video/webm&quot;:&quot;audio/webm&quot; });
    chunksRef.current=[];
    if (blob.size&lt;500) { setSaving(false); onSavingChange(false); return; }
    try {
      const { error } = await storageSupabase.storage.from(&quot;subject-files&quot;)
        .upload(`recordings/public-class/${classId}/${Date.now()}.webm`, blob, { contentType:isVid?&quot;video/webm&quot;:&quot;audio/webm&quot;, upsert:false });
      if (error) throw error;
    } catch (e) { console.error(&quot;Recording save failed&quot;, e); }
    finally { setSaving(false); onSavingChange(false); }
  }, [mode, classId, onSavingChange]);

  const fmtT=(s:number)=&gt;`${String(Math.floor(s/60)).padStart(2,&quot;0&quot;)}:${String(s%60).padStart(2,&quot;0&quot;)}`;
  if (!isHost) return null;

  return (
    &lt;div style={{ display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:5 }}&gt;
      {recording &amp;&amp; (
        &lt;div className=&quot;gc-pill&quot; style={{ background:&quot;rgba(239,68,68,.15)&quot;, border:&quot;1px solid rgba(239,68,68,.35)&quot;, color:&quot;#fca5a5&quot;, animation:&quot;gc-rec-pulse 1.4s ease-in-out infinite&quot; }}&gt;
          &lt;Circle style={{ width:6, height:6, fill:&quot;#ef4444&quot;, color:&quot;#ef4444&quot; }} /&gt;
          {fmtT(recTime)}{paused?&quot; ⏸&quot;:&quot;&quot;}
        &lt;/div&gt;
      )}
      {saving &amp;&amp; (
        &lt;div className=&quot;gc-pill&quot; style={{ background:&quot;rgba(255,255,255,.07)&quot;, border:&quot;1px solid rgba(255,255,255,.1)&quot;, color:&quot;rgba(255,255,255,.5)&quot; }}&gt;
          &lt;Loader2 style={{ width:10, height:10, animation:&quot;gc-spin .8s linear infinite&quot; }} /&gt; Saving
        &lt;/div&gt;
      )}
      {!recording &amp;&amp; !saving &amp;&amp; (
        &lt;button onClick={start} style={{ display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:4, padding:&quot;4px 10px&quot;, borderRadius:20, border:&quot;none&quot;, background:&quot;#ef4444&quot;, color:&quot;#fff&quot;, fontSize:11, fontWeight:700, cursor:&quot;pointer&quot; }}&gt;
          &lt;Circle style={{ width:6, height:6, fill:&quot;#fff&quot;, color:&quot;#fff&quot; }} /&gt; REC
        &lt;/button&gt;
      )}
      {recording &amp;&amp; (
        &lt;&gt;
          {paused
            ? &lt;button onClick={()=&gt;{ recRef.current?.resume(); setPaused(false); timerRef.current=setInterval(()=&gt;setRecTime(p=&gt;p+1),1000); }} style={{ display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:3, padding:&quot;4px 9px&quot;, borderRadius:20, border:&quot;1px solid rgba(255,255,255,.2)&quot;, background:&quot;rgba(255,255,255,.08)&quot;, color:&quot;#fff&quot;, fontSize:10, cursor:&quot;pointer&quot; }}&gt;&lt;Play style={{width:9,height:9}}/&gt;Resume&lt;/button&gt;
            : &lt;button onClick={()=&gt;{ recRef.current?.pause(); setPaused(true); clearInterval(timerRef.current); }} style={{ display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:3, padding:&quot;4px 9px&quot;, borderRadius:20, border:&quot;1px solid rgba(255,255,255,.2)&quot;, background:&quot;rgba(255,255,255,.08)&quot;, color:&quot;#fff&quot;, fontSize:10, cursor:&quot;pointer&quot; }}&gt;&lt;Pause style={{width:9,height:9}}/&gt;Pause&lt;/button&gt;
          }
          &lt;button onClick={stop} style={{ display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:3, padding:&quot;4px 9px&quot;, borderRadius:20, border:&quot;none&quot;, background:&quot;#ef4444&quot;, color:&quot;#fff&quot;, fontSize:10, cursor:&quot;pointer&quot; }}&gt;&lt;Square style={{width:9,height:9}}/&gt;Stop&lt;/button&gt;
        &lt;/&gt;
      )}
    &lt;/div&gt;
  );
};

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════ */
const GuestClassroom = () =&gt; {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { roomCode } = useParams&lt;{ roomCode: string }&gt;();
  const isMobile  = useIsMobile();

  const [connected, setConnected]         = useState(false);
  const [ended, setEnded]                 = useState(false);
  const [quizCode, setQuizCode]           = useState&lt;string&gt;(&quot;&quot;);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [classDuration, setClassDuration] = useState(0);
  const [savingRec, setSavingRec]         = useState(false);
  const [minimized, setMinimized]         = useState(false);
  const [reconnecting, setReconnecting]   = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [roomKey, setRoomKey]             = useState(0);
  const [soundEnabled, setSoundEnabled]   = useState(true);
  const intentionalRef = useRef(false);

  // Join/leave toasts
  const [joinToasts, setJoinToasts] = useState&lt;JoinToast[]&gt;([]);
  const addToast = useCallback((t: JoinToast) =&gt; {
    setJoinToasts(prev =&gt; [...prev.slice(-2), t]); // max 3 toasts
    setTimeout(() =&gt; setJoinToasts(prev =&gt; prev.filter(x =&gt; x.id !== t.id)), 3500);
  }, []);

  // Side panels
  const [chatOpen, setChatOpen]           = useState(!isMobile);
  const [partOpen, setPartOpen]           = useState(false);
  const [sideTab, setSideTab]             = useState&lt;&quot;chat&quot;|&quot;polls&quot;&gt;(&quot;chat&quot;);
  const [chatUnread, setChatUnread]       = useState(0);
  const [showQuiz, setShowQuiz]           = useState(false);

  const pipHandle    = useRef&lt;PipHandle|null&gt;(null);
  const handleRetRef = useRef&lt;()=&gt;void&gt;(()=&gt;{});

  const {
    token, url, room: roomName, guestName, classTitle, classTitleAr,
    isHost, classId, sessionId,
  } = (location.state||{}) as {
    token?:string; url?:string; room?:string; guestName?:string;
    classTitle?:string; classTitleAr?:string;
    isHost?:boolean; classId?:string; sessionId?:string;
  };

  const title   = classTitle || &quot;Public Class&quot;;
  const initial = title.charAt(0).toUpperCase();

  useSilentAudio(connected &amp;&amp; !ended);
  useWakeLock(connected &amp;&amp; !ended);

  const handleReturn = useCallback(() =&gt; setMinimized(false), []);
  const handleLeave  = useCallback(() =&gt; {
    intentionalRef.current = true;
    setReconnecting(false);
    setEnded(true);
  }, []);
  handleRetRef.current = handleReturn;

  /* ── Host: end class for everyone ── */
  const handleEndClass = useCallback(() =&gt; {
    setShowEndConfirm(false);
    intentionalRef.current = true;
    setReconnecting(false);
    setEnded(true);
    if (classId) {
      supabase.from(&quot;public_classes&quot;)
        .update({ status: &quot;ended&quot;, actual_end_time: new Date().toISOString() })
        .eq(&quot;id&quot;, classId)
        .then(() =&gt; {}).catch(() =&gt; {});
    }
  }, [classId]);

  /* ── Leave button click (used in header) ──
     Sets intentional flag first, THEN the room will disconnect naturally
     when `ended` causes the LiveKitRoom to unmount. */
  const handleLeaveClick = useCallback(() =&gt; {
    if (isHost) {
      setShowEndConfirm(true);
    } else {
      handleLeave();
    }
  }, [isHost, handleLeave]);

  useMediaSession(connected &amp;&amp; !ended, title, handleReturn, handleLeave);

  useEffect(() =&gt; { if (!token||!url) navigate(&quot;/live&quot;); }, [token, url, navigate]);

  // Duration timer
  useEffect(() =&gt; {
    if (!connected) return;
    const t = setInterval(()=&gt;setClassDuration(p=&gt;p+1), 1000);
    return () =&gt; clearInterval(t);
  }, [connected]);

  // Fetch quiz_code from live_sessions for the post-class quiz auto-fill
  useEffect(() =&gt; {
    if (!classId) return;
    supabase
      .from(&quot;live_sessions&quot;)
      .select(&quot;quiz_code&quot;)
      .eq(&quot;id&quot;, classId)
      .single()
      .then(({ data }) =&gt; { if (data?.quiz_code) setQuizCode(data.quiz_code); });
  }, [classId]);

  // Fix LiveKit video: object-fit cover + un-mirror remote tiles.
  useEffect(() =&gt; {
    if (!connected) return;
    let patching = false;
    const patchVideos = () =&gt; {
      if (patching) return;
      patching = true;
      try {
        const lkRoot = document.querySelector(&quot;[data-lk-theme]&quot;) ?? document.body;
        lkRoot.querySelectorAll&lt;HTMLVideoElement&gt;(&quot;video&quot;).forEach(vid =&gt; {
          const carrier = vid.closest(&quot;[data-lk-local-participant]&quot;) as HTMLElement | null;
          const attr = carrier
            ? carrier.getAttribute(&quot;data-lk-local-participant&quot;)
            : vid.getAttribute(&quot;data-lk-local-participant&quot;);
          const isLocal = attr === &quot;true&quot; || attr === &quot;&quot;;
          const wantedTransform = isLocal ? &quot;scaleX(-1)&quot; : &quot;none&quot;;
          const curTransform = vid.style.getPropertyValue(&quot;transform&quot;);
          const curPriority  = vid.style.getPropertyPriority(&quot;transform&quot;);
          const curObjFit    = vid.style.getPropertyValue(&quot;object-fit&quot;);
          if (curTransform !== wantedTransform || curPriority !== &quot;important&quot; || curObjFit !== &quot;cover&quot;) {
            vid.style.setProperty(&quot;object-fit&quot;, &quot;cover&quot;,          &quot;important&quot;);
            vid.style.setProperty(&quot;width&quot;,      &quot;100%&quot;,           &quot;important&quot;);
            vid.style.setProperty(&quot;height&quot;,     &quot;100%&quot;,           &quot;important&quot;);
            vid.style.setProperty(&quot;transform&quot;,         wantedTransform, &quot;important&quot;);
            vid.style.setProperty(&quot;-webkit-transform&quot;, wantedTransform, &quot;important&quot;);
          }
        });
      } finally {
        patching = false;
      }
    };
    patchVideos();
    const observer = new MutationObserver(() =&gt; { if (!patching) patchVideos(); });
    observer.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: [&quot;style&quot;, &quot;data-lk-local-participant&quot;],
    });
    const poll = setInterval(patchVideos, 300);
    return () =&gt; { observer.disconnect(); clearInterval(poll); };
  }, [connected]);

  // Build PiP once connected
  useEffect(() =&gt; {
    if (!connected) { pipHandle.current?.stop(); pipHandle.current=null; return; }
    const h = buildCanvasPip(initial, title, ()=&gt;handleRetRef.current());
    if (h) { h.video.play().catch(()=&gt;{}); pipHandle.current=h; }
    return () =&gt; { pipHandle.current?.stop(); pipHandle.current=null; };
  }, [connected, initial, title]);

  // Auto-reconnect (up to 5 attempts)
  const endedRef = useRef(false);
  useEffect(() =&gt; { endedRef.current = ended; }, [ended]);

  const autoReconnect = useCallback(() =&gt; {
    if (intentionalRef.current || endedRef.current) return;
    setReconnecting(true);
    setReconnectCount(prev =&gt; {
      if (prev &gt;= 5) { setEnded(true); return prev; }
      setTimeout(() =&gt; { setReconnecting(false); setRoomKey(k=&gt;k+1); }, 2000 + prev*1000);
      return prev+1;
    });
  }, []);

  /* ── Minimize → slide classroom off-screen, PiP floats, JoinClass renders underneath ── */
  const doMinimize = useCallback(async () =&gt; {
    setMinimized(true);
    const h = pipHandle.current;
    if (!h || document.pictureInPictureElement) return;
    const vids = Array.from(document.querySelectorAll(&quot;video&quot;)) as HTMLVideoElement[];
    const live = vids.find(v =&gt; v.readyState&gt;=2 &amp;&amp; v.videoWidth&gt;0 &amp;&amp; v!==h.video);
    if (live) { try { await live.requestPictureInPicture(); return; } catch {} }
    h.pip().catch(()=&gt;{});
  }, []);

  const navigateAway = useCallback(async (to: string) =&gt; {
    if (connected &amp;&amp; !ended) {
      await doMinimize();
      setTimeout(() =&gt; navigate(to), 80);
    } else {
      navigate(to);
    }
  }, [connected, ended, doMinimize, navigate]);

  /* ── Back button: intercept every press while in class.
     Re-push the sentinel entry each time so the back button
     is always caught, whether the user is in or out of minimized. ── */
  useEffect(() =&gt; {
    if (!connected) return;

    // Push sentinel so first back press is caught
    window.history.pushState({ gc: true }, &quot;&quot;);

    const onPop = () =&gt; {
      setMinimized(true);
      setTimeout(() =&gt; pipHandle.current?.pip().catch(() =&gt; {}), 60);
      // Re-push so the NEXT back press is also caught
      window.history.pushState({ gc: true }, &quot;&quot;);
    };

    window.addEventListener(&quot;popstate&quot;, onPop);
    return () =&gt; window.removeEventListener(&quot;popstate&quot;, onPop);
  }, [connected]);

  /* ── Home button / app switcher / screen lock → minimize + PiP.
     visibilitychange fires hidden on: home button, app switcher,
     screen lock, browser tab switch. ── */
  useEffect(() =&gt; {
    if (!connected) return;
    let pipTimer: ReturnType&lt;typeof setTimeout&gt; | null = null;

    const onVis = () =&gt; {
      if (document.visibilityState === &quot;hidden&quot;) {
        setMinimized(true);
        if (!document.pictureInPictureElement) {
          pipTimer = setTimeout(() =&gt; pipHandle.current?.pip().catch(() =&gt; {}), 150);
        }
      }
    };

    // Also catch pagehide for browsers that don&#x27;t fire visibilitychange reliably
    const onPageHide = () =&gt; {
      setMinimized(true);
      if (!document.pictureInPictureElement) {
        pipTimer = setTimeout(() =&gt; pipHandle.current?.pip().catch(() =&gt; {}), 150);
      }
    };

    document.addEventListener(&quot;visibilitychange&quot;, onVis);
    window.addEventListener(&quot;pagehide&quot;, onPageHide);
    return () =&gt; {
      document.removeEventListener(&quot;visibilitychange&quot;, onVis);
      window.removeEventListener(&quot;pagehide&quot;, onPageHide);
      if (pipTimer) clearTimeout(pipTimer);
    };
  }, [connected]);

  /* ── Return from minimized → re-push sentinel + exit PiP ── */
  useEffect(() =&gt; {
    if (!minimized) {
      // Re-push so back button is caught again after returning
      if (connected) window.history.pushState({ gc: true }, &quot;&quot;);
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() =&gt; {});
      }
    }
  }, [minimized, connected]);



  const fmtT = (s:number) =&gt; {
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
    return h&gt;0 ? `${h}:${String(m).padStart(2,&quot;0&quot;)}:${String(sec).padStart(2,&quot;0&quot;)}` : `${String(m).padStart(2,&quot;0&quot;)}:${String(sec).padStart(2,&quot;0&quot;)}`;
  };

  if (!token||!url) return null;

  /* ── Ended screen ── */
  if (ended) {
    return (
      &lt;div style={{ minHeight:&quot;100dvh&quot;, overflowY:&quot;auto&quot;, background:&quot;#0b1f13&quot;, color:&quot;#fff&quot;, fontFamily:&quot;&#x27;Google Sans&#x27;,&#x27;Roboto&#x27;,sans-serif&quot;, padding:&quot;0 0 48px&quot; }}&gt;
        &lt;style&gt;{`
          ${CSS}
          @keyframes gc-ended-fade{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
          .gc-ended-card{animation:gc-ended-fade .35s ease both;}
          .gc-cta-btn{transition:opacity .15s,transform .1s;cursor:pointer;}
          .gc-cta-btn:active{opacity:.8;transform:scale(.97);}
        `}&lt;/style&gt;

        {/* ── Header ── */}
        &lt;div style={{ background:&quot;linear-gradient(160deg,#0f2e1a 0%,#0b1f13 100%)&quot;, padding:&quot;48px 24px 36px&quot;, textAlign:&quot;center&quot;, borderBottom:&quot;1px solid rgba(201,151,58,.15)&quot; }}&gt;
          {/* Gold divider */}
          &lt;div style={{ width:48, height:2, background:&quot;#c9973a&quot;, borderRadius:2, margin:&quot;0 auto 20px&quot;, opacity:.7 }} /&gt;
          &lt;p style={{ fontSize:28, fontFamily:&quot;&#x27;Amiri&#x27;,serif&quot;, color:&quot;#c9973a&quot;, margin:&quot;0 0 8px&quot;, lineHeight:1.4 }}&gt;جزاكم الله خيراً&lt;/p&gt;
          &lt;h2 style={{ fontSize:22, fontWeight:700, color:&quot;#fff&quot;, margin:&quot;0 0 8px&quot; }}&gt;Class Has Ended&lt;/h2&gt;
          &lt;p style={{ color:&quot;rgba(255,255,255,.45)&quot;, fontSize:13, margin:0 }}&gt;JazakAllahu Khayran for attending &lt;strong style={{color:&quot;rgba(255,255,255,.75)&quot;}}&gt;{title}&lt;/strong&gt;&lt;/p&gt;
        &lt;/div&gt;

        &lt;div style={{ maxWidth:460, margin:&quot;0 auto&quot;, padding:&quot;0 16px&quot; }}&gt;

          {/* ── Post-class Quiz CTA ── */}
          &lt;div className=&quot;gc-ended-card&quot; style={{ marginTop:28, background:&quot;rgba(34,197,94,.06)&quot;, border:&quot;1.5px solid rgba(34,197,94,.3)&quot;, borderRadius:20, padding:&quot;24px 20px&quot;, animationDelay:&quot;0s&quot; }}&gt;
            &lt;p style={{ fontSize:11, fontWeight:700, letterSpacing:1.4, color:&quot;#22c55e&quot;, margin:&quot;0 0 8px&quot;, textTransform:&quot;uppercase&quot; }}&gt;📝 Test Your Knowledge&lt;/p&gt;
            &lt;h3 style={{ fontSize:18, fontWeight:700, color:&quot;#fff&quot;, margin:&quot;0 0 8px&quot;, lineHeight:1.3 }}&gt;Take the Post-Class Quiz&lt;/h3&gt;
            &lt;p style={{ fontSize:13, color:&quot;rgba(255,255,255,.5)&quot;, margin:&quot;0 0 20px&quot;, lineHeight:1.6 }}&gt;
              Reinforce what you just learned — answer questions from today&#x27;s class and track your progress.
            &lt;/p&gt;
            &lt;a
              href={`/quiz${quizCode ? `?code=${quizCode}&amp;` : &quot;?&quot;}name=${encodeURIComponent(title)}`}
              className=&quot;gc-cta-btn&quot;
              style={{ display:&quot;block&quot;, textAlign:&quot;center&quot;, padding:&quot;13px 0&quot;, borderRadius:999, background:&quot;#22c55e&quot;, color:&quot;#0b1f13&quot;, fontSize:14, fontWeight:800, textDecoration:&quot;none&quot; }}
            &gt;
              {quizCode ? &quot;Join Quiz →&quot; : &quot;Go to Quiz →&quot;}
            &lt;/a&gt;
            {quizCode &amp;&amp; (
              &lt;p style={{ textAlign:&quot;center&quot;, fontSize:12, color:&quot;rgba(255,255,255,0.4)&quot;, margin:&quot;8px 0 0&quot; }}&gt;
                Room code &lt;strong style={{color:&quot;#22c55e&quot;,fontFamily:&quot;monospace&quot;,letterSpacing:2}}&gt;{quizCode}&lt;/strong&gt; will be pre-filled
              &lt;/p&gt;
            )}
          &lt;/div&gt;

          {/* ── Enroll CTA ── */}
          &lt;div className=&quot;gc-ended-card&quot; style={{ marginTop:28, background:&quot;rgba(201,151,58,.08)&quot;, border:&quot;1.5px solid rgba(201,151,58,.3)&quot;, borderRadius:20, padding:&quot;24px 20px&quot;, animationDelay:&quot;.05s&quot; }}&gt;
            &lt;p style={{ fontSize:11, fontWeight:700, letterSpacing:1.4, color:&quot;#c9973a&quot;, margin:&quot;0 0 8px&quot;, textTransform:&quot;uppercase&quot; }}&gt;🎓 Want to learn more?&lt;/p&gt;
            &lt;h3 style={{ fontSize:18, fontWeight:700, color:&quot;#fff&quot;, margin:&quot;0 0 8px&quot;, lineHeight:1.3 }}&gt;Enrol in Full Courses at Tahleem Academy&lt;/h3&gt;
            &lt;p style={{ fontSize:13, color:&quot;rgba(255,255,255,.5)&quot;, margin:&quot;0 0 20px&quot;, lineHeight:1.6 }}&gt;
              Access structured Islamic studies — Qur&#x27;an, Fiqh, Aqeedah, Arabic &amp;amp; more — taught by qualified scholars. Live classes, recordings, and personal feedback.
            &lt;/p&gt;
            &lt;a
              href=&quot;/courses&quot;
              className=&quot;gc-cta-btn&quot;
              style={{ display:&quot;block&quot;, textAlign:&quot;center&quot;, padding:&quot;13px 0&quot;, borderRadius:999, background:&quot;#c9973a&quot;, color:&quot;#0b1f13&quot;, fontSize:14, fontWeight:800, textDecoration:&quot;none&quot; }}
            &gt;
              Browse Courses →
            &lt;/a&gt;
            &lt;a
              href=&quot;/register&quot;
              className=&quot;gc-cta-btn&quot;
              style={{ display:&quot;block&quot;, textAlign:&quot;center&quot;, marginTop:10, padding:&quot;12px 0&quot;, borderRadius:999, border:&quot;1px solid rgba(201,151,58,.4)&quot;, background:&quot;transparent&quot;, color:&quot;#c9973a&quot;, fontSize:13, fontWeight:600, textDecoration:&quot;none&quot; }}
            &gt;
              Create Free Account
            &lt;/a&gt;
          &lt;/div&gt;

          {/* ── More live classes ── */}
          &lt;div className=&quot;gc-ended-card&quot; style={{ marginTop:16, background:&quot;rgba(255,255,255,.04)&quot;, border:&quot;1px solid rgba(255,255,255,.08)&quot;, borderRadius:20, padding:&quot;20px&quot;, animationDelay:&quot;.12s&quot; }}&gt;
            &lt;p style={{ fontSize:11, fontWeight:700, letterSpacing:1.4, color:&quot;rgba(255,255,255,.4)&quot;, margin:&quot;0 0 8px&quot;, textTransform:&quot;uppercase&quot; }}&gt;📡 Free Live Classes&lt;/p&gt;
            &lt;p style={{ fontSize:14, color:&quot;rgba(255,255,255,.7)&quot;, margin:&quot;0 0 16px&quot;, lineHeight:1.5 }}&gt;
              We host regular free public classes open to everyone — no account needed.
            &lt;/p&gt;
            &lt;a
              href=&quot;/live&quot;
              className=&quot;gc-cta-btn&quot;
              style={{ display:&quot;block&quot;, textAlign:&quot;center&quot;, padding:&quot;12px 0&quot;, borderRadius:999, background:&quot;rgba(255,255,255,.08)&quot;, border:&quot;1px solid rgba(255,255,255,.12)&quot;, color:&quot;rgba(255,255,255,.85)&quot;, fontSize:13, fontWeight:600, textDecoration:&quot;none&quot; }}
            &gt;
              See Upcoming Classes
            &lt;/a&gt;
          &lt;/div&gt;

          {/* ── WhatsApp ── */}
          &lt;div className=&quot;gc-ended-card&quot; style={{ marginTop:16, background:&quot;rgba(37,211,102,.05)&quot;, border:&quot;1px solid rgba(37,211,102,.2)&quot;, borderRadius:20, padding:&quot;20px&quot;, animationDelay:&quot;.18s&quot; }}&gt;
            &lt;p style={{ fontSize:11, fontWeight:700, letterSpacing:1.4, color:&quot;#25d366&quot;, margin:&quot;0 0 8px&quot;, textTransform:&quot;uppercase&quot; }}&gt;💬 Stay Connected&lt;/p&gt;
            &lt;p style={{ fontSize:14, color:&quot;rgba(255,255,255,.6)&quot;, margin:&quot;0 0 16px&quot;, lineHeight:1.5 }}&gt;
              Get notified about upcoming classes, new courses, and announcements directly on WhatsApp.
            &lt;/p&gt;
            &lt;a
              href=&quot;https://wa.me/2348163310471&quot;
              target=&quot;_blank&quot;
              rel=&quot;noopener noreferrer&quot;
              className=&quot;gc-cta-btn&quot;
              style={{ display:&quot;block&quot;, textAlign:&quot;center&quot;, padding:&quot;12px 0&quot;, borderRadius:999, background:&quot;rgba(37,211,102,.12)&quot;, border:&quot;1px solid rgba(37,211,102,.3)&quot;, color:&quot;#25d366&quot;, fontSize:13, fontWeight:700, textDecoration:&quot;none&quot; }}
            &gt;
              WhatsApp Us
            &lt;/a&gt;
          &lt;/div&gt;

          {/* ── Host nav / Guest browse ── */}
          &lt;div style={{ textAlign:&quot;center&quot;, marginTop:28 }}&gt;
            {isHost
              ? &lt;button onClick={()=&gt;navigateAway(&quot;/admin/public-classes&quot;)} style={{ fontSize:13, color:&quot;rgba(255,255,255,.3)&quot;, background:&quot;none&quot;, border:&quot;none&quot;, cursor:&quot;pointer&quot;, textDecoration:&quot;underline&quot;, fontFamily:&quot;inherit&quot; }}&gt;Back to Dashboard&lt;/button&gt;
              : &lt;button onClick={()=&gt;navigateAway(&quot;/live&quot;)} style={{ fontSize:13, color:&quot;rgba(255,255,255,.3)&quot;, background:&quot;none&quot;, border:&quot;none&quot;, cursor:&quot;pointer&quot;, textDecoration:&quot;underline&quot;, fontFamily:&quot;inherit&quot; }}&gt;Browse Other Classes&lt;/button&gt;
            }
          &lt;/div&gt;

        &lt;/div&gt;
      &lt;/div&gt;
    );
  }

  return (
    &lt;&gt;
    {/* ── Minimized screen: self-contained, no routing, just show class info + return button ── */}
    {minimized &amp;&amp; (
      &lt;div style={{
        position:&quot;fixed&quot;, inset:0, zIndex:7999,
        background:&quot;#0b1f13&quot;,
        display:&quot;flex&quot;, flexDirection:&quot;column&quot;,
        alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;,
        gap:16, padding:32,
        fontFamily:&quot;&#x27;Google Sans&#x27;,&#x27;Roboto&#x27;,sans-serif&quot;,
      }}&gt;
        &lt;style&gt;{`
          @keyframes gc-min-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.85)}}
          @keyframes gc-min-ring{to{transform:rotate(360deg)}}
        `}&lt;/style&gt;

        {/* Avatar with live ring */}
        &lt;div style={{ position:&quot;relative&quot;, width:88, height:88 }}&gt;
          &lt;div style={{ position:&quot;absolute&quot;, inset:-8, borderRadius:&quot;50%&quot;, border:&quot;2px solid rgba(239,68,68,.4)&quot;, animation:&quot;gc-min-ring 3s linear infinite&quot; }} /&gt;
          &lt;div style={{ width:88, height:88, borderRadius:&quot;50%&quot;, background:&quot;#c9973a&quot;, color:&quot;#0b1f13&quot;, display:&quot;flex&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;, fontSize:36, fontWeight:800 }}&gt;
            {initial}
          &lt;/div&gt;
        &lt;/div&gt;

        {/* LIVE badge */}
        &lt;div style={{ display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:6, background:&quot;rgba(239,68,68,.12)&quot;, border:&quot;1px solid rgba(239,68,68,.3)&quot;, borderRadius:999, padding:&quot;5px 14px&quot; }}&gt;
          &lt;span style={{ width:7, height:7, borderRadius:&quot;50%&quot;, background:&quot;#ef4444&quot;, boxShadow:&quot;0 0 6px #ef4444&quot;, animation:&quot;gc-min-pulse 1.6s ease-in-out infinite&quot; }} /&gt;
          &lt;span style={{ color:&quot;#ef4444&quot;, fontSize:12, fontWeight:700, letterSpacing:1.2 }}&gt;LIVE&lt;/span&gt;
        &lt;/div&gt;

        {/* Class name */}
        &lt;p style={{ color:&quot;#fff&quot;, fontSize:20, fontWeight:700, margin:0, textAlign:&quot;center&quot;, lineHeight:1.3 }}&gt;{title}&lt;/p&gt;
        {classTitleAr &amp;&amp; (
          &lt;p style={{ color:&quot;rgba(255,255,255,.45)&quot;, fontFamily:&quot;&#x27;Amiri&#x27;,serif&quot;, fontSize:15, margin:&quot;-8px 0 0&quot;, direction:&quot;rtl&quot; }}&gt;{classTitleAr}&lt;/p&gt;
        )}

        {/* Duration */}
        &lt;p style={{ color:&quot;rgba(255,255,255,.4)&quot;, fontSize:13, margin:0, fontVariantNumeric:&quot;tabular-nums&quot; }}&gt;
          ⏱ {fmtT(classDuration)} elapsed
        &lt;/p&gt;

        {/* Return button */}
        &lt;button
          onClick={handleReturn}
          style={{
            marginTop:8, padding:&quot;14px 36px&quot;, borderRadius:999,
            border:&quot;none&quot;, background:&quot;#c9973a&quot;,
            color:&quot;#0b1f13&quot;, fontSize:15, fontWeight:800, cursor:&quot;pointer&quot;,
            boxShadow:&quot;0 4px 20px rgba(201,151,58,.4)&quot;,
            fontFamily:&quot;&#x27;Google Sans&#x27;,&#x27;Roboto&#x27;,sans-serif&quot;,
          }}
        &gt;
          ↩ Return to Class
        &lt;/button&gt;

        {/* Leave quietly */}
        &lt;button
          onClick={handleLeave}
          style={{ background:&quot;none&quot;, border:&quot;none&quot;, color:&quot;rgba(255,255,255,.3)&quot;, fontSize:13, cursor:&quot;pointer&quot;, fontFamily:&quot;&#x27;Google Sans&#x27;,&#x27;Roboto&#x27;,sans-serif&quot; }}
        &gt;
          Leave class
        &lt;/button&gt;
      &lt;/div&gt;
    )}

    {/* ── Classroom: always mounted so LiveKit never disconnects.
         Slides off-screen when minimized — connection stays alive. ── */}
    &lt;div
      data-gc-root
      style={{
        position:&quot;fixed&quot;, inset:0, zIndex:8000,
        display:&quot;flex&quot;, flexDirection:&quot;column&quot;,
        background:&quot;#202124&quot;,
        transform: minimized ? &quot;translateX(-200%)&quot; : &quot;translateX(0)&quot;,
        pointerEvents: minimized ? &quot;none&quot; : &quot;all&quot;,
        transition: minimized ? &quot;none&quot; : &quot;transform .12s ease&quot;,
      }}
    &gt;
      &lt;style&gt;{CSS}&lt;/style&gt;

      {/* ── Join/Leave toasts ── */}
      &lt;div style={{ position:&quot;absolute&quot;, top:56, left:&quot;50%&quot;, transform:&quot;translateX(-50%)&quot;, zIndex:9000, display:&quot;flex&quot;, flexDirection:&quot;column&quot;, gap:6, alignItems:&quot;center&quot;, pointerEvents:&quot;none&quot; }}&gt;
        {joinToasts.map(t =&gt; (
          &lt;div key={t.id} style={{
            display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:8,
            background:&quot;rgba(32,33,36,.95)&quot;, backdropFilter:&quot;blur(16px)&quot;,
            border:&quot;1px solid rgba(255,255,255,.1)&quot;, borderRadius:24,
            padding:&quot;7px 14px&quot;, fontSize:12, fontWeight:600,
            color:&quot;rgba(255,255,255,.9)&quot;, whiteSpace:&quot;nowrap&quot;,
            boxShadow:&quot;0 4px 20px rgba(0,0,0,.4)&quot;,
            animation:&quot;gc-toast-in .22s ease forwards&quot;,
          }}&gt;
            &lt;span style={{ width:8, height:8, borderRadius:&quot;50%&quot;, background: t.type===&quot;join&quot;?&quot;#22c55e&quot;:&quot;#ef4444&quot;, flexShrink:0 }} /&gt;
            &lt;span style={{ fontWeight:700, color: t.type===&quot;join&quot;?&quot;#86efac&quot;:&quot;#fca5a5&quot; }}&gt;{t.name}&lt;/span&gt;
            &lt;span style={{ color:&quot;rgba(255,255,255,.55)&quot; }}&gt;{t.type===&quot;join&quot;?&quot;joined&quot;:&quot;left&quot;}&lt;/span&gt;
          &lt;/div&gt;
        ))}
      &lt;/div&gt;

      &lt;LiveKitRoom
        key={roomKey}
        serverUrl={url}
        token={token}
        connect={true}
        onConnected={()=&gt;{ setConnected(true); setReconnecting(false); setReconnectCount(0); }}
        // FIX: onDisconnected removed — handled exclusively by ReconnectMonitor below.
        // Keeping it here AND in ReconnectMonitor caused autoReconnect() to fire
        // TWICE per disconnect, scheduling two setRoomKey() increments ~2 s apart
        // and creating a permanent &quot;Reconnecting...&quot; loop that never resolved.
        options={{
          adaptiveStream:{ pixelDensity:&quot;screen&quot; },
          dynacast:true,
          disconnectOnPageLeave:false,
          audioCaptureDefaults:{
            echoCancellation:true, noiseSuppression:true,
            autoGainControl:true, sampleRate:48000, channelCount:1,
          },
          publishDefaults:{
            audioPreset:{ maxBitrate:64000 },
            dtx:false, red:true, stopMicTrackOnMute:false,
            videoEncoding:{ maxBitrate:700_000, maxFramerate:20 },
            backupCodec:true,
          },
          videoCaptureDefaults:{ resolution:{ width:1280, height:720 } },
        }}
        style={{ flex:1, display:&quot;flex&quot;, flexDirection:&quot;column&quot;, minHeight:0, position:&quot;relative&quot; }}
        data-lk-theme=&quot;default&quot;
      &gt;
        &lt;ReconnectMonitor
          onReconnecting={()=&gt;setReconnecting(true)}
          onReconnected={()=&gt;{ setReconnecting(false); setReconnectCount(0); }}
          onDisconnected={()=&gt;{ if (!intentionalRef.current) autoReconnect(); }}
        /&gt;

        {/* Participant event handler (sounds + toasts) */}
        &lt;ParticipantEventHandler onToast={addToast} soundEnabled={soundEnabled} /&gt;

        {/* Reconnecting overlay */}
        {reconnecting &amp;&amp; (
          &lt;div className=&quot;gc-reconnect-overlay&quot;&gt;
            &lt;div style={{ width:52, height:52, border:&quot;3px solid rgba(138,180,248,.2)&quot;, borderTopColor:&quot;#8ab4f8&quot;, borderRadius:&quot;50%&quot;, animation:&quot;gc-spin .8s linear infinite&quot; }} /&gt;
            &lt;p style={{ color:&quot;#e8eaed&quot;, fontSize:16, fontWeight:500, fontFamily:&quot;&#x27;Google Sans&#x27;,sans-serif&quot; }}&gt;Reconnecting…&lt;/p&gt;
            &lt;p style={{ color:&quot;rgba(255,255,255,.4)&quot;, fontSize:13, fontFamily:&quot;&#x27;Google Sans&#x27;,sans-serif&quot; }}&gt;
              {reconnectCount&gt;0 ? `Attempt ${reconnectCount} of 5` : &quot;Please stay on the page&quot;}
            &lt;/p&gt;
          &lt;/div&gt;
        )}

        {/* ════ TOP BAR ════ */}
        &lt;div style={{
          height:48, flexShrink:0,
          background:&quot;rgba(32,33,36,.97)&quot;, backdropFilter:&quot;blur(20px)&quot;, WebkitBackdropFilter:&quot;blur(20px)&quot;,
          display:&quot;flex&quot;, alignItems:&quot;center&quot;,
          padding:&quot;0 10px&quot;, gap:6,
          borderBottom:&quot;1px solid rgba(255,255,255,.06)&quot;,
          overflow:&quot;hidden&quot;,
        }}&gt;
          {/* LEFT GROUP */}
          &lt;div style={{ display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:5, flex:1, minWidth:0, overflow:&quot;hidden&quot; }}&gt;
            {isHost
              ? &lt;div className=&quot;gc-pill&quot; style={{ background:&quot;rgba(239,68,68,.13)&quot;, border:&quot;1px solid rgba(239,68,68,.3)&quot;, color:&quot;#fca5a5&quot; }}&gt;
                  &lt;span style={{ width:6, height:6, borderRadius:&quot;50%&quot;, background:&quot;#ef4444&quot;, display:&quot;inline-block&quot;, animation:&quot;gc-pulse 1.8s ease-in-out infinite&quot; }} /&gt;
                  LIVE
                &lt;/div&gt;
              : &lt;div className=&quot;gc-pill&quot; style={{ background:&quot;rgba(201,151,58,.12)&quot;, border:&quot;1px solid rgba(201,151,58,.3)&quot;, color:&quot;#c9973a&quot; }}&gt;
                  Guest
                &lt;/div&gt;
            }

            {/* Class title */}
            &lt;span style={{ fontSize:12, fontWeight:600, color:&quot;rgba(255,255,255,.85)&quot;, overflow:&quot;hidden&quot;, textOverflow:&quot;ellipsis&quot;, whiteSpace:&quot;nowrap&quot;, flex:1, minWidth:0 }}&gt;
              {title}
            &lt;/span&gt;

            {/* Timer */}
            &lt;div className=&quot;gc-pill&quot; style={{ background:&quot;rgba(255,255,255,.06)&quot;, border:&quot;1px solid rgba(255,255,255,.1)&quot;, color:&quot;rgba(255,255,255,.65)&quot;, fontVariantNumeric:&quot;tabular-nums&quot; }}&gt;
              &lt;Circle style={{ width:5, height:5, fill:&quot;#ef4444&quot;, color:&quot;#ef4444&quot;, animation:&quot;gc-rec-pulse 1.4s ease-in-out infinite&quot;, flexShrink:0 }} /&gt;
              {fmtT(classDuration)}
            &lt;/div&gt;

            {/* Participant count badge — IN HEADER */}
            &lt;ParticipantCountBadge onClick={()=&gt;setPartOpen(v=&gt;!v)} /&gt;
          &lt;/div&gt;

          {/* RIGHT GROUP */}
          &lt;div style={{ display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:6, flexShrink:0 }}&gt;
            {/* Connection quality */}
            &lt;ConnectionIndicator /&gt;

            {/* Record (host only) */}
            &lt;RecordingController classId={classId||&quot;&quot;} isHost={!!isHost} onSavingChange={setSavingRec} /&gt;

            {/* Sound toggle */}
            &lt;button
              onClick={()=&gt;setSoundEnabled(v=&gt;!v)}
              title={soundEnabled?&quot;Mute join sounds&quot;:&quot;Unmute join sounds&quot;}
              style={{
                width:28, height:28, borderRadius:&quot;50%&quot;, border:&quot;none&quot;,
                background: soundEnabled ? &quot;rgba(255,255,255,.1)&quot; : &quot;rgba(239,68,68,.15)&quot;,
                color: soundEnabled ? &quot;rgba(255,255,255,.6)&quot; : &quot;#fca5a5&quot;,
                cursor:&quot;pointer&quot;, fontSize:12, display:&quot;flex&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;,
              }}
            &gt;
              {soundEnabled ? &quot;🔔&quot; : &quot;🔕&quot;}
            &lt;/button&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        {/* ════ MAIN CONTENT ════ */}
        &lt;div style={{ flex:1, display:&quot;flex&quot;, minHeight:0, overflow:&quot;hidden&quot; }}&gt;
          {/* Participants (desktop) */}
          {partOpen &amp;&amp; !isMobile &amp;&amp; sessionId &amp;&amp; (
            &lt;div style={{ width:216, background:&quot;rgba(32,33,36,.97)&quot;, borderRight:&quot;1px solid rgba(255,255,255,.07)&quot;, display:&quot;flex&quot;, flexDirection:&quot;column&quot;, flexShrink:0 }}&gt;
              &lt;ClassParticipants
                sessionId={sessionId}
                onMuteStudent={isHost?(id)=&gt;{ supabase.from(&quot;class_participants&quot;).update({is_muted:true}).eq(&quot;session_id&quot;,sessionId).eq(&quot;student_id&quot;,id); }:undefined}
                onRemoveStudent={isHost?(id)=&gt;{ supabase.from(&quot;class_participants&quot;).update({left_at:new Date().toISOString()}).eq(&quot;session_id&quot;,sessionId).eq(&quot;student_id&quot;,id); }:undefined}
              /&gt;
            &lt;/div&gt;
          )}

          {/* Video + LK control bar — wrapped so we can overlay Leave icon */}
          &lt;div style={{ flex:1, position:&quot;relative&quot;, minWidth:0, display:&quot;flex&quot;, flexDirection:&quot;column&quot; }}&gt;
            &lt;VideoConference /&gt;
            &lt;RoomAudioRenderer /&gt;

          {/* ── Custom buttons overlaid at the right of the LK control bar ──
                Order: [Minimize] [Leave]  (chat is the last LK button to their left)
                The control bar has padding-right:118px to reserve this space.    */}

            {/* Minimize button */}
            &lt;button
              onClick={doMinimize}
              title=&quot;Minimize — audio stays on&quot;
              style={{
                position:&quot;absolute&quot;,
                bottom: &quot;calc(env(safe-area-inset-bottom,0px) + 11px)&quot;,
                right: 68,           /* 12(leave) + 48(leave-width) + 8(gap) */
                width: 48, height: 46,
                borderRadius: 24,
                border: &quot;none&quot;,
                background: &quot;rgba(255,255,255,.1)&quot;,
                color: &quot;rgba(255,255,255,.85)&quot;,
                cursor: &quot;pointer&quot;,
                display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;,
                zIndex: 20,
              }}
            &gt;
              &lt;Minimize2 style={{ width:18, height:18 }} /&gt;
            &lt;/button&gt;

            {/* Leave / End button — pill shape matching image 2 */}
            &lt;button
              onClick={handleLeaveClick}
              title={isHost ? &quot;End class for everyone&quot; : &quot;Leave class&quot;}
              style={{
                position:&quot;absolute&quot;,
                bottom: &quot;calc(env(safe-area-inset-bottom,0px) + 11px)&quot;,
                right: 12,
                width: 48, height: 46,
                borderRadius: 24,
                border: &quot;none&quot;,
                background: &quot;#ea4335&quot;,
                color: &quot;#fff&quot;,
                cursor: &quot;pointer&quot;,
                display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;,
                boxShadow: &quot;0 2px 12px rgba(234,67,53,.45)&quot;,
                zIndex: 20,
              }}
            &gt;
              &lt;LogOut style={{ width:19, height:19 }} /&gt;
            &lt;/button&gt;
          &lt;/div&gt;

          {/* Chat / Polls (desktop) */}
          {chatOpen &amp;&amp; !isMobile &amp;&amp; sessionId &amp;&amp; (
            &lt;div className=&quot;gc-sidebar&quot;&gt;
              &lt;div style={{ display:&quot;flex&quot;, borderBottom:&quot;1px solid rgba(255,255,255,.07)&quot;, flexShrink:0, background:&quot;rgba(32,33,36,.97)&quot; }}&gt;
                {([&quot;chat&quot;,&quot;polls&quot;] as const).map(tab=&gt;(
                  &lt;button key={tab} onClick={()=&gt;{ setSideTab(tab); if(tab===&quot;chat&quot;) setChatUnread(0); }} style={{
                    flex:1, padding:&quot;13px 4px&quot;, background:&quot;none&quot;, border:&quot;none&quot;,
                    color:sideTab===tab?&quot;#8ab4f8&quot;:&quot;rgba(255,255,255,.4)&quot;,
                    fontSize:13, fontWeight:sideTab===tab?600:400,
                    borderBottom:sideTab===tab?&quot;2px solid #8ab4f8&quot;:&quot;2px solid transparent&quot;,
                    cursor:&quot;pointer&quot;, fontFamily:&quot;&#x27;Google Sans&#x27;,sans-serif&quot;, transition:&quot;color .15s&quot;,
                  }}&gt;
                    {tab===&quot;chat&quot;?&quot;💬 Chat&quot;:&quot;📊 Polls&quot;}
                    {tab===&quot;chat&quot; &amp;&amp; chatUnread&gt;0 &amp;&amp; (
                      &lt;span style={{ marginLeft:4, background:&quot;#ef4444&quot;, color:&quot;#fff&quot;, borderRadius:10, fontSize:10, padding:&quot;1px 5px&quot; }}&gt;{chatUnread}&lt;/span&gt;
                    )}
                  &lt;/button&gt;
                ))}
                &lt;button onClick={()=&gt;setChatOpen(false)} style={{ background:&quot;none&quot;, border:&quot;none&quot;, color:&quot;rgba(255,255,255,.3)&quot;, cursor:&quot;pointer&quot;, padding:&quot;0 12px&quot;, flexShrink:0 }}&gt;
                  &lt;X style={{ width:14, height:14 }} /&gt;
                &lt;/button&gt;
              &lt;/div&gt;
              &lt;div style={{ flex:1, overflow:&quot;hidden&quot; }}&gt;
                {sideTab===&quot;chat&quot; ? &lt;ClassChatPanel sessionId={sessionId} /&gt; : &lt;ClassPolls sessionId={sessionId} /&gt;}
              &lt;/div&gt;
            &lt;/div&gt;
          )}
        &lt;/div&gt;

        {/* ════ CONTROLS ════ */}
        {sessionId ? (
          &lt;ClassControls
            sessionId={sessionId}
            isHostOverride={!!isHost}
            onToggleChat={()=&gt;{ setChatOpen(v=&gt;!v); if(!chatOpen) setChatUnread(0); }}
            onToggleParticipants={()=&gt;setPartOpen(v=&gt;!v)}
            onEndClass={isHost?()=&gt;setShowEndConfirm(true):undefined}
            onLeaveClass={handleLeave}
            chatUnread={chatUnread}
            onLaunchPoll={isHost?()=&gt;{ setChatOpen(true); setSideTab(&quot;polls&quot;); }:undefined}
            onLaunchQuiz={isHost?()=&gt;setShowQuiz(true):undefined}
          /&gt;
        ) : null}

        {sessionId &amp;&amp; &lt;LiveQuizOverlay sessionId={sessionId} isOpen={showQuiz} onClose={()=&gt;setShowQuiz(false)} /&gt;}
      &lt;/LiveKitRoom&gt;

      {/* ════ MOBILE BOTTOM SHEETS ════ */}
      {isMobile &amp;&amp; partOpen &amp;&amp; sessionId &amp;&amp; (
        &lt;div style={{ position:&quot;fixed&quot;, inset:0, background:&quot;rgba(0,0,0,.65)&quot;, zIndex:50 }} onClick={()=&gt;setPartOpen(false)}&gt;
          &lt;div style={{ position:&quot;absolute&quot;, bottom:64, left:0, right:0, background:&quot;#13181f&quot;, borderRadius:&quot;22px 22px 0 0&quot;, maxHeight:&quot;65vh&quot;, overflow:&quot;auto&quot;, animation:&quot;gc-slide-up .22s ease&quot; }} onClick={e=&gt;e.stopPropagation()}&gt;
            &lt;div style={{ width:40, height:4, borderRadius:2, background:&quot;rgba(255,255,255,.2)&quot;, margin:&quot;12px auto 6px&quot; }} /&gt;
            &lt;ClassParticipants sessionId={sessionId} /&gt;
          &lt;/div&gt;
        &lt;/div&gt;
      )}

      {isMobile &amp;&amp; chatOpen &amp;&amp; sessionId &amp;&amp; (
        &lt;div style={{ position:&quot;fixed&quot;, inset:0, background:&quot;rgba(0,0,0,.65)&quot;, zIndex:50 }} onClick={()=&gt;setChatOpen(false)}&gt;
          &lt;div style={{ position:&quot;absolute&quot;, bottom:0, left:0, right:0, background:&quot;#13181f&quot;, borderRadius:&quot;22px 22px 0 0&quot;, maxHeight:&quot;82vh&quot;, display:&quot;flex&quot;, flexDirection:&quot;column&quot;, animation:&quot;gc-slide-up .22s ease&quot;, paddingBottom:&quot;env(safe-area-inset-bottom,0px)&quot; }} onClick={e=&gt;e.stopPropagation()}&gt;
            &lt;div style={{ display:&quot;flex&quot;, alignItems:&quot;center&quot;, padding:&quot;12px 16px 0&quot;, flexShrink:0 }}&gt;
              &lt;div style={{ flex:1, display:&quot;flex&quot; }}&gt;
                {([&quot;chat&quot;,&quot;polls&quot;] as const).map(tab=&gt;(
                  &lt;button key={tab} onClick={()=&gt;setSideTab(tab)} style={{ flex:1, padding:&quot;10px 6px&quot;, background:&quot;none&quot;, border:&quot;none&quot;, color:sideTab===tab?&quot;#fff&quot;:&quot;rgba(255,255,255,.35)&quot;, fontSize:13, fontWeight:sideTab===tab?700:400, borderBottom:sideTab===tab?&quot;2px solid #0a7c68&quot;:&quot;2px solid transparent&quot;, cursor:&quot;pointer&quot; }}&gt;
                    {tab===&quot;chat&quot;?&quot;💬 Chat&quot;:&quot;📊 Polls&quot;}
                  &lt;/button&gt;
                ))}
              &lt;/div&gt;
              &lt;button onClick={()=&gt;setChatOpen(false)} style={{ width:32, height:32, borderRadius:&quot;50%&quot;, background:&quot;rgba(255,255,255,.1)&quot;, border:&quot;none&quot;, color:&quot;#fff&quot;, cursor:&quot;pointer&quot;, display:&quot;flex&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;, flexShrink:0 }}&gt;
                &lt;X style={{ width:14, height:14 }} /&gt;
              &lt;/button&gt;
            &lt;/div&gt;
            &lt;div style={{ flex:1, overflow:&quot;hidden&quot;, minHeight:320 }}&gt;
              {sideTab===&quot;chat&quot; ? &lt;ClassChatPanel sessionId={sessionId} /&gt; : &lt;ClassPolls sessionId={sessionId} /&gt;}
            &lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;
      )}

      {/* ════ END CLASS CONFIRM ════ */}
      {showEndConfirm &amp;&amp; (
        &lt;div style={{ position:&quot;fixed&quot;, inset:0, zIndex:9500, background:&quot;rgba(0,0,0,.65)&quot;, backdropFilter:&quot;blur(8px)&quot;, display:&quot;flex&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot; }} onClick={()=&gt;setShowEndConfirm(false)}&gt;
          &lt;div style={{ background:&quot;#2D2E30&quot;, borderRadius:20, padding:&quot;32px 28px 24px&quot;, width:&quot;100%&quot;, maxWidth:380, margin:&quot;0 16px&quot;, boxShadow:&quot;0 24px 64px rgba(0,0,0,.7)&quot;, border:&quot;1px solid rgba(255,255,255,.08)&quot;, animation:&quot;gc-fade-up .18s ease&quot; }} onClick={e=&gt;e.stopPropagation()}&gt;
            &lt;div style={{ width:56, height:56, borderRadius:&quot;50%&quot;, background:&quot;rgba(239,68,68,.12)&quot;, border:&quot;1px solid rgba(239,68,68,.2)&quot;, display:&quot;flex&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;, margin:&quot;0 auto 18px&quot; }}&gt;
              &lt;Phone style={{ width:22, height:22, color:&quot;#ef4444&quot;, transform:&quot;rotate(135deg)&quot; }} /&gt;
            &lt;/div&gt;
            &lt;h2 style={{ textAlign:&quot;center&quot;, fontSize:18, fontWeight:500, color:&quot;#e8eaed&quot;, marginBottom:8, fontFamily:&quot;&#x27;Google Sans&#x27;,sans-serif&quot; }}&gt;End class for everyone?&lt;/h2&gt;
            &lt;p style={{ textAlign:&quot;center&quot;, fontSize:13, color:&quot;rgba(255,255,255,.45)&quot;, marginBottom:24, lineHeight:1.6, fontFamily:&quot;&#x27;Google Sans&#x27;,sans-serif&quot; }}&gt;This will disconnect all participants.&lt;/p&gt;
            &lt;div style={{ display:&quot;flex&quot;, flexDirection:&quot;column&quot;, gap:10 }}&gt;
              &lt;button onClick={handleEndClass} style={{ width:&quot;100%&quot;, padding:13, borderRadius:24, border:&quot;none&quot;, background:&quot;#ea4335&quot;, color:&quot;#fff&quot;, fontSize:14, fontWeight:600, cursor:&quot;pointer&quot;, fontFamily:&quot;&#x27;Google Sans&#x27;,sans-serif&quot; }}&gt;End for All&lt;/button&gt;
              &lt;button onClick={()=&gt;{ setShowEndConfirm(false); handleLeave(); }} style={{ width:&quot;100%&quot;, padding:12, borderRadius:24, border:&quot;1px solid rgba(255,255,255,.15)&quot;, background:&quot;rgba(255,255,255,.06)&quot;, color:&quot;rgba(255,255,255,.8)&quot;, fontSize:14, cursor:&quot;pointer&quot;, fontFamily:&quot;&#x27;Google Sans&#x27;,sans-serif&quot; }}&gt;Leave but Keep Open&lt;/button&gt;
              &lt;button onClick={()=&gt;setShowEndConfirm(false)} style={{ width:&quot;100%&quot;, padding:12, borderRadius:24, border:&quot;none&quot;, background:&quot;transparent&quot;, color:&quot;rgba(255,255,255,.4)&quot;, fontSize:14, cursor:&quot;pointer&quot;, fontFamily:&quot;&#x27;Google Sans&#x27;,sans-serif&quot; }}&gt;Cancel&lt;/button&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;
      )}
    &lt;/div&gt;
    &lt;/&gt;
  );
};

export default GuestClassroom;
</div>
<script>
function copy(){
  const text=document.getElementById('code').innerText;
  if(navigator.clipboard){navigator.clipboard.writeText(text).then(()=>alert('Copied!'));}
  else{const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();alert('Copied!');}
}
</script>
</body>
</html>