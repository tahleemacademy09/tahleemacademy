import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mic, MicOff, CheckCircle, Clock, Flame,
  BookOpen, ArrowLeft, RotateCcw, Send, Star,
  Settings, Volume2, RefreshCw, Loader2, Eye
} from "lucide-react";
import HifdhPlanSettings from "@/components/hifdh/HifdhPlanSettings";

const SURAH_NAMES: Record<number, { ar: string; en: string }> = {
  1:{ar:"الفاتحة",en:"Al-Fatiha"},2:{ar:"البقرة",en:"Al-Baqarah"},
  36:{ar:"يس",en:"Ya-Sin"},55:{ar:"الرحمن",en:"Ar-Rahman"},
  67:{ar:"الملك",en:"Al-Mulk"},78:{ar:"النبأ",en:"An-Naba"},
  87:{ar:"الأعلى",en:"Al-Ala"},88:{ar:"الغاشية",en:"Al-Ghashiya"},
  89:{ar:"الفجر",en:"Al-Fajr"},93:{ar:"الضحى",en:"Ad-Duha"},
  94:{ar:"الشرح",en:"Ash-Sharh"},95:{ar:"التين",en:"At-Tin"},
  96:{ar:"العلق",en:"Al-Alaq"},97:{ar:"القدر",en:"Al-Qadr"},
  98:{ar:"البينة",en:"Al-Bayyina"},99:{ar:"الزلزلة",en:"Az-Zalzala"},
  100:{ar:"العاديات",en:"Al-Adiyat"},101:{ar:"القارعة",en:"Al-Qaria"},
  102:{ar:"التكاثر",en:"At-Takathur"},103:{ar:"العصر",en:"Al-Asr"},
  104:{ar:"الهمزة",en:"Al-Humaza"},105:{ar:"الفيل",en:"Al-Fil"},
  106:{ar:"قريش",en:"Quraysh"},107:{ar:"الماعون",en:"Al-Maun"},
  108:{ar:"الكوثر",en:"Al-Kawthar"},109:{ar:"الكافرون",en:"Al-Kafirun"},
  110:{ar:"النصر",en:"An-Nasr"},111:{ar:"المسد",en:"Al-Masad"},
  112:{ar:"الإخلاص",en:"Al-Ikhlas"},113:{ar:"الفلق",en:"Al-Falaq"},
  114:{ar:"الناس",en:"An-Nas"},
};

const norm = (t: string) =>
  t.replace(/[\u064B-\u065F\u0670]/g,"")
   .replace(/[أإآا]/g,"ا").replace(/[ىي]/g,"ي")
   .replace(/ة/g,"ه").trim();

type WordState = "hidden" | "correct" | "wrong" | "mispronounced";

interface LiveWord { original: string; state: WordState; revealed: boolean; }
interface LiveAyah { number: number; words: LiveWord[]; }
interface Ayah { number:number; text:string; }
type View = "home"|"session"|"dictation"|"result";

const stateStyle = (s: WordState, revealed: boolean) => {
  if (!revealed) return { bg: "#1a3a2a", color: "#1a3a2a", border: "2px solid rgba(255,255,255,0.1)" };
  if (s === "correct")      return { bg: "#dcfce7", color: "#16a34a", border: "none" };
  if (s === "wrong")        return { bg: "#fee2e2", color: "#dc2626", border: "none" };
  if (s === "mispronounced") return { bg: "#ffedd5", color: "#ea580c", border: "none" };
  return { bg: "transparent", color: "white", border: "none" };
};

const HifdhRevision = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [view, setView] = useState<View>("home");
  const [todaySession, setTodaySession] = useState<any>(null);
  const [liveAyahs, setLiveAyahs] = useState<LiveAyah[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [sessionScore, setSessionScore] = useState<number|null>(null);
  const [showReveal, setShowReveal] = useState(false);
  
  const mediaRecRef = useRef<MediaRecorder|null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Transcription Logic
  const transcribeWithDeepgram = async (audioBlob: Blob) => {
    try {
      setTranscribing(true);
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recitation.audio');

      const { data, error } = await supabase.functions.invoke('transcribe-hifdh', { body: formData });
      if (error) throw error;

      if (data?.transcript) {
        const spoken = data.transcript.replace(/[^\u0600-\u06FF\s]/g,"").split(/\s+/).filter(Boolean);
        setLiveAyahs(prev => prev.map(ayah => ({
          ...ayah,
          words: ayah.words.map(word => {
            const nw = norm(word.original);
            const exact = spoken.some(sw => norm(sw) === nw);
            if (exact) return { ...word, state: "correct", revealed: true };
            return { ...word, state: "wrong", revealed: true };
          })
        })));
        
        // Calculate score
        const all = liveAyahs.flatMap(a => a.words);
        setSessionScore(all.length ? Math.round((all.filter(w => w.state === "correct").length / all.length) * 100) : 0);
      }
    } catch (err: any) {
      toast({ title: "Transcription failed", description: err.message, variant: "destructive" });
    } finally {
      setTranscribing(false);
    }
  };

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = e => chunksRef.current.push(e.data);
    recorder.onstop = () => transcribeWithDeepgram(new Blob(chunksRef.current));
    recorder.start();
    mediaRecRef.current = recorder;
    setIsRecording(true);
  };

  const stopRecording = () => {
    mediaRecRef.current?.stop();
    setIsRecording(false);
  };

  // Minimal render for the Session View (Matches your screenshot style)
  if (view === "session") {
    return (
      <div className="flex flex-col min-h-screen bg-[#f5f0e8]">
        <div className="px-4 py-4 flex items-center gap-3 bg-[#1a3a2a] text-white">
          <ArrowLeft onClick={() => setView("home")} className="h-6 w-6"/>
          <div>
            <h2 className="font-bold">Hifdh Session</h2>
            <p className="text-xs opacity-60">Recite from memory</p>
          </div>
        </div>

        <div className="flex-1 p-4 space-y-4">
          <div className="bg-[#1a3a2a] rounded-3xl p-6 min-h-[300px] shadow-xl">
             <div className="flex justify-between items-center mb-6">
                <Badge className="bg-white/10 text-white border-none">
                  {transcribing ? "Analysing..." : isRecording ? "Recording..." : "Ready"}
                </Badge>
                <button onTouchStart={() => setShowReveal(true)} onTouchEnd={() => setShowReveal(false)} className="text-white/40"><Eye/></button>
             </div>
             
             <div className="space-y-6" dir="rtl">
                {liveAyahs.map(ayah => (
                  <div key={ayah.number} className="flex flex-wrap gap-2">
                    {ayah.words.map((w, i) => (
                      <span key={i} className="text-2xl rounded-lg px-2" style={stateStyle(w.state, w.revealed || showReveal)}>
                        {w.original}
                      </span>
                    ))}
                  </div>
                ))}
             </div>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-sm text-center">
            {transcribing ? (
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-[#1a3a2a]"/>
            ) : (
              <button 
                onClick={isRecording ? stopRecording : startRecording}
                className={`h-24 w-24 rounded-full flex items-center justify-center text-white transition-all ${isRecording ? "bg-red-500 animate-pulse" : "bg-[#1a3a2a]"}`}
              >
                {isRecording ? <MicOff size={40}/> : <Mic size={40}/>}
              </button>
            )}
            <p className="mt-4 text-gray-500 font-medium">{isRecording ? "Tap to finish" : "Start Recitation"}</p>
          </div>
        </div>
      </div>
    );
  }

  return <div className="p-10 text-center"><Button onClick={() => setView("session")}>Open Session</Button></div>;
};

export default HifdhRevision;
