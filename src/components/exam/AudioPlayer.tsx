import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useLanguage } from "@/contexts/LanguageContext";
import { Play, Pause, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  src: string;
  title?: string;
  maxPlays?: number;
  className?: string;
}

const AudioPlayer = ({ src, title, maxPlays, className }: AudioPlayerProps) => {
  const { t } = useLanguage();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playCount, setPlayCount] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => setDuration(audio.duration);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setIsPlaying(false);
      setPlayCount((c) => c + 1);
    };
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (maxPlays && playCount >= maxPlays) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const restart = () => {
    if (!audioRef.current) return;
    if (maxPlays && playCount >= maxPlays) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play();
    setIsPlaying(true);
  };

  const seek = (val: number[]) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = val[0];
    setCurrentTime(val[0]);
  };

  const formatTime = (s: number) => {
    if (!isFinite(s)) return "00:00";
    return `${Math.floor(s / 60).toString().padStart(2, "0")}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  };

  const disabled = !!maxPlays && playCount >= maxPlays;

  return (
    <div className={cn("rounded-xl bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/10 p-4", className)}>
      <audio ref={audioRef} src={src} muted={muted} preload="metadata" />
      
      {title && (
        <div className="mb-2 flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{title}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-full shrink-0"
          onClick={togglePlay}
          disabled={disabled}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>

        <div className="flex-1 space-y-1">
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={seek}
            className="cursor-pointer"
            disabled={disabled}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <Button variant="ghost" size="icon" className="shrink-0" onClick={restart} disabled={disabled}>
          <RotateCcw className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setMuted(!muted)}>
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      </div>

      {maxPlays && (
        <p className="mt-2 text-xs text-muted-foreground text-center">
          {t("Plays remaining", "المرات المتبقية")}: {Math.max(0, maxPlays - playCount)}/{maxPlays}
        </p>
      )}

      {disabled && (
        <p className="mt-1 text-xs text-destructive text-center font-medium">
          {t("Maximum plays reached", "تم الوصول للحد الأقصى من المرات")}
        </p>
      )}
    </div>
  );
};

export default AudioPlayer;
