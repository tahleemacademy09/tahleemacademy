import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, ArrowLeft, Loader2, Eye } from "lucide-react";

// Normalization function for Arabic comparison
const norm = (t: string) =>
  t.replace(/[\u064B-\u065F\u0670]/g, "") // Remove Harakat
   .replace(/[أإآا]/g, "ا").replace(/[ىي]/g, "ي")
   .replace(/ة/g, "ه").trim();

const HifdhRevision = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const [liveAyahs, setLiveAyahs] = useState<any[]>([]); // Populated from your DB/API
  
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const transcribeWithDeepgram = async (audioBlob: Blob) => {
    try {
      setTranscribing(true);
      
      // Convert to Raw Binary (Uint8Array) to avoid 400 Bad Request
      const arrayBuffer = await audioBlob.arrayBuffer();
      const body = new Uint8Array(arrayBuffer);

      const { data, error } = await supabase.functions.invoke('transcribe-hifdh', {
        body: body,
        headers: { "Content-Type": "audio/webm" }
      });

      if (error) throw error;

      if (data?.transcript) {
        console.log("Transcript:", data.transcript);
        processResults(data.transcript);
      }
    } catch (err: any) {
      console.error("Transcription Error:", err);
      toast({ title: "Transcription failed", description: err.message, variant: "destructive" });
    } finally {
      setTranscribing(false);
    }
  };

  const processResults = (transcript: string) => {
    const spokenWords = transcript.split(/\s+/).map(norm);
    
    setLiveAyahs(prev => prev.map(ayah => ({
      ...ayah,
      words: ayah.words.map((word: any) => {
        const isCorrect = spokenWords.includes(norm(word.original));
        return { ...word, state: isCorrect ? "correct" : "wrong", revealed: true };
      })
    })));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => transcribeWithDeepgram(new Blob(chunksRef.current, { type: 'audio/webm' }));
      
      recorder.start();
      mediaRecRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      toast({ title: "Mic Error", description: "Could not access microphone", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    mediaRecRef.current?.stop();
    setIsRecording(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f5f0e8]">
      {/* Header */}
      <div className="px-4 py-6 flex items-center gap-3 bg-[#1a3a2a] text-white rounded-b-[40px] shadow-lg">
        <ArrowLeft className="h-6 w-6"/>
        <h2 className="font-bold text-lg">Hifdh Session</h2>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* Recitation Area */}
        <div className="bg-[#1a3a2a] rounded-[40px] p-8 min-h-[350px] shadow-2xl relative overflow-hidden">
          <div className="flex justify-between items-center mb-8">
            <Badge className="bg-white/10 text-white border-none py-1 px-4">
              {transcribing ? "Analysing..." : isRecording ? "Recording..." : "Ready"}
            </Badge>
            <button 
              onMouseDown={() => setShowReveal(true)} 
              onMouseUp={() => setShowReveal(false)}
              onTouchStart={() => setShowReveal(true)}
              onTouchEnd={() => setShowReveal(false)}
              className="text-white/40 hover:text-white transition-colors"
            >
              <Eye size={24}/>
            </button>
          </div>
          
          <div className="space-y-8" dir="rtl">
            {liveAyahs.map((ayah, aIdx) => (
              <div key={aIdx} className="flex flex-wrap gap-3">
                {ayah.words.map((w: any, wIdx: number) => (
                  <span 
                    key={wIdx} 
                    className="text-3xl font-arabic transition-all duration-500 rounded-md px-1"
                    style={{
                      color: (w.revealed || showReveal) ? (w.state === 'correct' ? '#4ade80' : '#f87171') : '#1a3a2a',
                      backgroundColor: (w.revealed || showReveal) ? 'transparent' : '#142d20',
                    }}
                  >
                    {w.original}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-[40px] p-10 shadow-sm text-center flex flex-col items-center justify-center">
          {transcribing ? (
            <div className="h-24 w-24 flex items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-[#1a3a2a]"/>
            </div>
          ) : (
            <button 
              onClick={isRecording ? stopRecording : startRecording}
              className={`h-24 w-24 rounded-full flex items-center justify-center text-white transition-all transform active:scale-95 shadow-xl ${
                isRecording ? "bg-red-500 animate-pulse" : "bg-[#1a3a2a]"
              }`}
            >
              {isRecording ? <MicOff size={40}/> : <Mic size={40}/>}
            </button>
          )}
          <p className="mt-6 text-gray-500 font-semibold tracking-wide">
            {isRecording ? "TAP TO FINISH" : "START RECITATION"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default HifdhRevision;
