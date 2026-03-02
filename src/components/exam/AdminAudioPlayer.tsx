import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, AlertTriangle } from "lucide-react";

interface AdminAudioPlayerProps {
  src: string;
  label?: string;
}

const AdminAudioPlayer = ({ src, label }: AdminAudioPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => setPlaying(false);
    const onErr = () => setError(true);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onErr);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onErr);
    };
  }, [src]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current || error) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play().catch(() => setError(true));
    setPlaying(!playing);
  }, [playing, error]);

  const seek = (val: number[]) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = val[0];
    setCurrentTime(val[0]);
  };

  const skip = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds));
  };

  const changeVolume = (val: number[]) => {
    if (!audioRef.current) return;
    audioRef.current.volume = val[0];
    setVolume(val[0]);
    setMuted(val[0] === 0);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const next = !muted;
    audioRef.current.muted = next;
    setMuted(next);
  };

  const changeSpeed = () => {
    if (!audioRef.current) return;
    const speeds = [1, 1.5, 2];
    const idx = speeds.indexOf(speed);
    const next = speeds[(idx + 1) % speeds.length];
    audioRef.current.playbackRate = next;
    setSpeed(next);
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 my-1">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <span className="text-xs text-destructive">Audio file unavailable or corrupted.</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-3 my-1 space-y-2">
      <audio ref={audioRef} src={src} preload="metadata" />
      {label && <p className="text-xs text-muted-foreground font-medium">{label}</p>}

      {/* Seek bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{fmt(currentTime)}</span>
        <Slider
          value={[currentTime]}
          max={duration || 1}
          step={0.1}
          onValueChange={seek}
          className="flex-1"
        />
        <span className="text-[10px] font-mono text-muted-foreground w-8">{fmt(duration)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => skip(-10)} title="Back 10s">
            <SkipBack className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={togglePlay}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => skip(10)} title="Forward 10s">
            <SkipForward className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] font-mono" onClick={changeSpeed}>
            {speed}x
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleMute}>
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </Button>
          <Slider
            value={[muted ? 0 : volume]}
            max={1}
            step={0.05}
            onValueChange={changeVolume}
            className="w-16"
          />
        </div>
      </div>
    </div>
  );
};

export default AdminAudioPlayer;
