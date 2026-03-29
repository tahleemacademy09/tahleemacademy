import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { Mic, Square, Play, Pause, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, url: string) => void;
  existingUrl?: string;
  className?: string;
}

const AudioRecorder = ({ onRecordingComplete, existingUrl, className }: AudioRecorderProps) => {
  const { t } = useLanguage();
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(existingUrl || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout>();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Detect the best supported MIME type — Android Chrome supports mp4/aac,
      // desktop browsers prefer webm/opus. Falling back ensures the file is valid.
      const mimeType = (() => {
        const candidates = [
          "audio/mp4",          // Android Chrome / Samsung Internet
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
          "",                   // browser default
        ];
        return candidates.find(m => !m || MediaRecorder.isTypeSupported(m)) || "";
      })();

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      setDuration(0);

      // Request data every 250ms so chunks arrive even if onstop fires late
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const finalMime = mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: finalMime });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        onRecordingComplete(blob, url);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(250);  // timeslice = 250ms
      setIsRecording(true);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (err) {
      console.error("AudioRecorder: microphone error", err);
    }
  }, [onRecordingComplete]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    clearInterval(timerRef.current);
  }, []);

  const togglePlayback = () => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const clearRecording = () => {
    setAudioUrl(null);
    setIsPlaying(false);
    setDuration(0);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className={cn("rounded-xl border-2 border-dashed border-primary/20 bg-accent/30 p-4", className)}>
      {audioUrl && <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} />}

      {!audioUrl ? (
        <div className="flex flex-col items-center gap-3">
          {isRecording ? (
            <>
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-destructive/20 animate-pulse flex items-center justify-center">
                  <Mic className="h-7 w-7 text-destructive animate-pulse" />
                </div>
                <div className="absolute -inset-2 rounded-full border-2 border-destructive/30 animate-ping" />
              </div>
              <span className="font-mono text-lg font-bold text-destructive">{formatTime(duration)}</span>
              <p className="text-xs text-muted-foreground">{t("Recording...", "جارٍ التسجيل...")}</p>
              <Button variant="destructive" size="sm" onClick={stopRecording}>
                <Square className="mr-1 h-3 w-3" />
                {t("Stop Recording", "إيقاف التسجيل")}
              </Button>
            </>
          ) : (
            <>
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Mic className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                {t("Click to record your answer", "انقر لتسجيل إجابتك")}
              </p>
              <Button variant="default" size="sm" onClick={startRecording}>
                <Mic className="mr-1 h-3 w-3" />
                {t("Start Recording", "بدء التسجيل")}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-12 w-12 rounded-full shrink-0" onClick={togglePlayback}>
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>
          <div className="flex-1">
            <div className="h-2 rounded-full bg-primary/20 overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: isPlaying ? "100%" : "0%", transition: "width 1s linear" }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("Audio recorded", "تم تسجيل الصوت")} • {formatTime(duration)}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={clearRecording} className="text-destructive shrink-0">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default AudioRecorder;
