import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  Maximize, Minimize, PictureInPicture2, Bookmark, StickyNote,
  RotateCcw, Repeat, Loader2, AlertCircle, RefreshCw, Keyboard,
  ChevronLeft, ChevronRight
} from "lucide-react";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface Bookmark {
  id: string;
  timestamp_seconds: number;
  label?: string | null;
}

interface VideoPlayerProps {
  src: string;
  duration?: number;
  bookmarks?: Bookmark[];
  initialProgress?: number;
  onTimeUpdate?: (time: number) => void;
  onPause?: (time: number) => void;
  onEnded?: () => void;
  onAddBookmark?: (time: number) => void;
  onAddNote?: (time: number) => void;
  onPrevRecording?: () => void;
  onNextRecording?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  isAdmin?: boolean;
}

const formatTime = (s: number) => {
  if (!s || isNaN(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const VideoPlayer = ({
  src, duration: initDuration, bookmarks = [], initialProgress = 0,
  onTimeUpdate, onPause, onEnded, onAddBookmark, onAddNote,
  onPrevRecording, onNextRecording, hasPrev, hasNext, isAdmin
}: VideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const saveTimer = useRef<ReturnType<typeof setInterval>>();
  const lastTap = useRef<{ time: number; x: number }>({ time: 0, x: 0 });

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurTime] = useState(0);
  const [duration, setDuration] = useState(initDuration || 0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem("ta-player-volume");
    return saved ? parseFloat(saved) : 1;
  });
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loop, setLoop] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [skipAnimation, setSkipAnimation] = useState<{ dir: string; key: number } | null>(null);
  const [showResume, setShowResume] = useState(initialProgress > 5);
  const [ended, setEnded] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);

  // Volume sync
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = muted;
    }
    localStorage.setItem("ta-player-volume", String(volume));
  }, [volume, muted]);

  // Speed sync
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  // Auto-save progress every 10s
  useEffect(() => {
    saveTimer.current = setInterval(() => {
      if (videoRef.current && playing && onTimeUpdate) {
        onTimeUpdate(videoRef.current.currentTime);
      }
    }, 10000);
    return () => clearInterval(saveTimer.current);
  }, [playing, onTimeUpdate]);

  // Idle timer for hiding controls
  const resetIdle = useCallback(() => {
    setShowControls(true);
    clearTimeout(idleTimer.current);
    if (playing) {
      const delay = "ontouchstart" in window ? 5000 : 3000;
      idleTimer.current = setTimeout(() => setShowControls(false), delay);
    }
  }, [playing]);

  useEffect(() => {
    if (!playing) { setShowControls(true); clearTimeout(idleTimer.current); }
    else resetIdle();
  }, [playing, resetIdle]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const v = videoRef.current;
      if (!v) return;

      switch (e.key) {
        case " ": e.preventDefault(); v.paused ? v.play() : v.pause(); break;
        case "ArrowLeft":
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - (e.shiftKey ? 30 : 5));
          showSkip(e.shiftKey ? "-30" : "-5");
          break;
        case "ArrowRight":
          e.preventDefault();
          v.currentTime = Math.min(v.duration, v.currentTime + (e.shiftKey ? 30 : 5));
          showSkip(e.shiftKey ? "+30" : "+5");
          break;
        case "ArrowUp": e.preventDefault(); setVolume(v => Math.min(1, v + 0.1)); break;
        case "ArrowDown": e.preventDefault(); setVolume(v => Math.max(0, v - 0.1)); break;
        case "f": case "F": e.preventDefault(); toggleFullscreen(); break;
        case "m": case "M": e.preventDefault(); setMuted(m => !m); break;
        case "[":
          e.preventDefault();
          setSpeed(s => { const i = SPEEDS.indexOf(s); return SPEEDS[Math.max(0, i - 1)]; });
          break;
        case "]":
          e.preventDefault();
          setSpeed(s => { const i = SPEEDS.indexOf(s); return SPEEDS[Math.min(SPEEDS.length - 1, i + 1)]; });
          break;
        case "b": case "B": e.preventDefault(); onAddBookmark?.(v.currentTime); break;
        case "n": case "N": e.preventDefault(); onAddNote?.(v.currentTime); break;
        default:
          if (e.key >= "0" && e.key <= "9") {
            e.preventDefault();
            v.currentTime = v.duration * (parseInt(e.key) / 10);
          }
      }
      resetIdle();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onAddBookmark, onAddNote, resetIdle]);

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current.requestFullscreen?.();
  };

  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (videoRef.current) await videoRef.current.requestPictureInPicture();
    } catch {}
  };

  const showSkip = (label: string) => {
    setSkipAnimation({ dir: label, key: Date.now() });
    setTimeout(() => setSkipAnimation(null), 600);
  };

  const skip = (sec: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration, videoRef.current.currentTime + sec));
    showSkip(sec > 0 ? `+${sec}` : `${sec}`);
  };

  const seekTo = (frac: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = frac * videoRef.current.duration;
  };

  const handleProgressClick = (e: React.MouseEvent) => {
    if (!progressRef.current || !videoRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(frac);
  };

  const handleProgressHover = (e: React.MouseEvent) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(frac * duration);
    setHoverX(e.clientX - rect.left);
  };

  // Double-tap to skip on mobile
  const handleVideoTap = (e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    const clientX = "touches" in e ? e.changedTouches?.[0]?.clientX || 0 : e.clientX;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (now - lastTap.current.time < 300) {
      const relX = clientX - rect.left;
      if (relX < rect.width / 3) skip(-10);
      else if (relX > (rect.width * 2) / 3) skip(10);
      lastTap.current = { time: 0, x: 0 };
    } else {
      lastTap.current = { time: now, x: clientX };
      setTimeout(() => {
        if (lastTap.current.time === now) {
          videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause();
        }
      }, 300);
    }
    resetIdle();
  };

  const handleResume = (resume: boolean) => {
    setShowResume(false);
    if (resume && videoRef.current) {
      videoRef.current.currentTime = initialProgress;
    }
    videoRef.current?.play();
  };

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.33 ? Volume1 : volume < 0.66 ? Volume1 : Volume2;

  if (error) {
    return (
      <div className="aspect-video bg-black rounded-xl flex flex-col items-center justify-center gap-4 text-white">
        <AlertCircle className="h-12 w-12" style={{ color: "#c9973a" }} />
        <p className="text-sm text-center px-4 max-w-md">{error}</p>
        <Button size="sm" onClick={() => { setError(null); setLoading(true); }} className="gap-2" style={{ background: "#c9973a" }}>
          <RefreshCw className="h-4 w-4" /> Try Again
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl overflow-hidden bg-black select-none group"
      onMouseMove={resetIdle}
      onTouchStart={resetIdle}
      style={{ aspectRatio: isFullscreen ? undefined : "16/9" }}
    >
      {/* Video */}
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        playsInline
        crossOrigin="anonymous"
        controlsList={isAdmin ? undefined : "nodownload"}
        loop={loop}
        className="w-full h-full object-contain"
        onClick={handleVideoTap}
        onLoadedMetadata={() => { setDuration(videoRef.current?.duration || 0); setLoading(false); }}
        onTimeUpdate={() => {
          const v = videoRef.current;
          if (!v) return;
          setCurTime(v.currentTime);
          if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
        }}
        onPlay={() => { setPlaying(true); setEnded(false); }}
        onPause={() => { setPlaying(false); onPause?.(videoRef.current?.currentTime || 0); }}
        onEnded={() => { setEnded(true); setPlaying(false); onEnded?.(); }}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onError={() => setError("⚠️ Could not load the recording. Please check your internet connection and try again.")}
      />

      {/* Loading spinner */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
          <Loader2 className="h-12 w-12 animate-spin" style={{ color: "#c9973a" }} />
        </div>
      )}

      {/* Skip animation */}
      {skipAnimation && (
        <div key={skipAnimation.key} className={`absolute top-1/2 -translate-y-1/2 ${skipAnimation.dir.startsWith("-") ? "left-8" : "right-8"} animate-ping`}>
          <span className="text-white text-2xl font-bold bg-black/50 px-4 py-2 rounded-full">{skipAnimation.dir}s</span>
        </div>
      )}

      {/* Resume banner */}
      {showResume && !playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20">
          <div className="text-center space-y-4 p-6 rounded-2xl" style={{ background: "rgba(15,49,34,0.95)", border: "1px solid rgba(201,151,58,0.3)" }}>
            <p className="text-white text-lg font-semibold" style={{ fontFamily: "'Cairo', sans-serif" }}>
              ▶ Resume from where you left off?
            </p>
            <Badge className="text-lg px-4 py-1" style={{ background: "#c9973a", color: "#fff" }}>
              {formatTime(initialProgress)}
            </Badge>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => handleResume(true)} style={{ background: "#c9973a", color: "#fff" }}>Resume</Button>
              <Button variant="outline" onClick={() => handleResume(false)} className="text-white border-white/30 hover:bg-white/10">
                Start from Beginning
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Ended overlay */}
      {ended && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-center space-y-4 p-8 max-w-md">
            <p className="text-4xl">🌟</p>
            <p className="text-white text-xl font-bold" style={{ fontFamily: "'Cairo', sans-serif" }}>
              Alhamdulillah! You completed this lesson.
            </p>
            <p className="text-sm" style={{ color: "#c9973a", fontFamily: "'Amiri', serif" }} dir="rtl">الحمد لله</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button onClick={() => { if (videoRef.current) { videoRef.current.currentTime = 0; videoRef.current.play(); } setEnded(false); }}
                style={{ background: "#c9973a", color: "#fff" }}>
                <RotateCcw className="h-4 w-4 mr-2" /> Watch Again
              </Button>
              {hasNext && (
                <Button variant="outline" onClick={onNextRecording} className="text-white border-white/30 hover:bg-white/10">
                  Next Recording <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 ${showControls || !playing ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.85))" }}>

        {/* Progress bar */}
        <div
          ref={progressRef}
          className="relative h-3 mx-3 mt-2 cursor-pointer group/bar"
          onClick={handleProgressClick}
          onMouseMove={handleProgressHover}
          onMouseLeave={() => setHoverTime(null)}
        >
          {/* Buffer */}
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/20" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
          {/* Progress */}
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%`, background: "#c9973a" }} />
          {/* Bookmark markers */}
          {bookmarks.map(b => (
            <div key={b.id} className="absolute top-0 w-1 h-full rounded-full" style={{
              left: `${duration ? (b.timestamp_seconds / duration) * 100 : 0}%`,
              background: "#c9973a",
              opacity: 0.8,
            }} title={b.label || "Bookmark"} />
          ))}
          {/* Playhead */}
          <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full -ml-2 scale-75 group-hover/bar:scale-100 transition-transform"
            style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%`, background: "#c9973a" }} />
          {/* Hover time tooltip */}
          {hoverTime !== null && (
            <div className="absolute -top-8 px-2 py-0.5 rounded text-xs text-white bg-black/80 -translate-x-1/2 pointer-events-none"
              style={{ left: `${hoverX}px` }}>
              {formatTime(hoverTime)}
            </div>
          )}
        </div>

        {/* Main controls row */}
        <div className="flex items-center gap-1 px-3 py-2">
          {/* Left */}
          <div className="flex items-center gap-1">
            {hasPrev && (
              <Button size="icon" variant="ghost" onClick={onPrevRecording} className="h-8 w-8 text-white hover:bg-white/10">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={() => skip(-10)} className="h-9 w-9 text-white hover:bg-white/10">
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}
              className="h-10 w-10 text-white hover:bg-white/10">
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
            <Button size="icon" variant="ghost" onClick={() => skip(10)} className="h-9 w-9 text-white hover:bg-white/10">
              <SkipForward className="h-4 w-4" />
            </Button>
            {hasNext && (
              <Button size="icon" variant="ghost" onClick={onNextRecording} className="h-8 w-8 text-white hover:bg-white/10">
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
            <span className="text-white text-xs ml-2 tabular-nums whitespace-nowrap">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex-1" />

          {/* Center - Speed */}
          <div className="relative">
            <Button size="sm" variant="ghost" onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className="h-8 text-white hover:bg-white/10 text-xs font-bold px-2">
              {speed}x
            </Button>
            {showSpeedMenu && (
              <div className="absolute bottom-full mb-1 right-0 bg-black/90 rounded-lg p-1 flex flex-col gap-0.5 z-30" onMouseLeave={() => setShowSpeedMenu(false)}>
                {SPEEDS.map(s => (
                  <button key={s} onClick={() => { setSpeed(s); setShowSpeedMenu(false); }}
                    className={`px-3 py-1 text-xs rounded transition-colors ${speed === s ? "text-white font-bold" : "text-white/60 hover:text-white"}`}
                    style={speed === s ? { background: "#c9973a" } : {}}>
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right */}
          <div className="flex items-center gap-0.5">
            <Button size="icon" variant="ghost" onClick={() => skip(-30)} className="h-8 w-8 text-white hover:bg-white/10" title="Replay 30s">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>

            {/* Volume */}
            <div className="relative" onMouseEnter={() => setShowVolumeSlider(true)} onMouseLeave={() => setShowVolumeSlider(false)}>
              <Button size="icon" variant="ghost" onClick={() => setMuted(!muted)} className="h-8 w-8 text-white hover:bg-white/10">
                <VolumeIcon className="h-4 w-4" />
              </Button>
              {showVolumeSlider && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-black/90 rounded-lg p-2 z-30" style={{ height: 100 }}>
                  <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
                    onChange={e => { setVolume(parseFloat(e.target.value)); setMuted(false); }}
                    className="h-20 appearance-none bg-transparent cursor-pointer"
                    style={{ writingMode: "vertical-lr", direction: "rtl", accentColor: "#c9973a" }} />
                </div>
              )}
            </div>

            <Button size="icon" variant="ghost" onClick={() => onAddBookmark?.(videoRef.current?.currentTime || 0)}
              className="h-8 w-8 text-white hover:bg-white/10" title="Add Bookmark (B)">
              <Bookmark className="h-3.5 w-3.5" style={bookmarks.length ? { color: "#c9973a" } : {}} />
            </Button>

            <Button size="icon" variant="ghost" onClick={() => { videoRef.current?.pause(); onAddNote?.(videoRef.current?.currentTime || 0); }}
              className="h-8 w-8 text-white hover:bg-white/10" title="Add Note (N)">
              <StickyNote className="h-3.5 w-3.5" />
            </Button>

            <Button size="icon" variant="ghost" onClick={() => setLoop(!loop)}
              className="h-8 w-8 text-white hover:bg-white/10" title="Loop">
              <Repeat className="h-3.5 w-3.5" style={loop ? { color: "#c9973a" } : {}} />
            </Button>

            {document.pictureInPictureEnabled && (
              <Button size="icon" variant="ghost" onClick={togglePiP} className="h-8 w-8 text-white hover:bg-white/10" title="Picture in Picture">
                <PictureInPicture2 className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Keyboard shortcuts */}
            <div className="relative">
              <Button size="icon" variant="ghost" onClick={() => setShowShortcuts(!showShortcuts)}
                className="h-8 w-8 text-white hover:bg-white/10" title="Keyboard Shortcuts">
                <Keyboard className="h-3.5 w-3.5" />
              </Button>
              {showShortcuts && (
                <div className="absolute bottom-full right-0 mb-2 bg-black/95 rounded-xl p-4 z-30 text-xs text-white/80 space-y-1 min-w-[220px]"
                  onMouseLeave={() => setShowShortcuts(false)}>
                  <p className="font-bold text-white mb-2">Keyboard Shortcuts</p>
                  {[
                    ["Space", "Play / Pause"], ["← →", "Skip 5s"], ["Shift+← →", "Skip 30s"],
                    ["↑ ↓", "Volume"], ["F", "Fullscreen"], ["M", "Mute"],
                    ["[ ]", "Speed -/+"], ["B", "Bookmark"], ["N", "Note"],
                    ["0-9", "Jump to 0%-90%"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[10px] font-mono">{k}</kbd>
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button size="icon" variant="ghost" onClick={toggleFullscreen} className="h-8 w-8 text-white hover:bg-white/10">
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Speed badge overlay */}
        {speed !== 1 && (
          <div className="absolute top-3 right-3 pointer-events-none">
            <Badge className="text-xs" style={{ background: "rgba(201,151,58,0.9)", color: "#fff" }}>{speed}x</Badge>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPlayer;
