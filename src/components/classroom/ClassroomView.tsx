/*
  ClassroomView.tsx — Tahleem Academy Live Classroom
  Google Meet-style UI · iOS-safe · Persistent call context
  (split 2026-07: the large pile of standalone helper hooks/components that
  used to live in this same file now lives in ./classroomComponents.tsx —
  this file only holds the main ClassroomView component + its three tiny
  room-context bridge wrappers at the bottom.)
*/

import {
  LiveKitRoom, useRoomContext, RoomAudioRenderer, StartAudio,
  useParticipants, useLocalParticipant, useTracks,
} from "@livekit/components-react";
// @ts-ignore
import "@livekit/components-styles";
import { Track, RoomEvent, ConnectionState, ConnectionQuality, RemoteTrackPublication, RemoteParticipant } from "livekit-client";
// BUG FIX — this import was missing entirely. Every hook below (useState,
// useEffect, useRef, useCallback) was relying on a global that doesn't
// exist, throwing "useState is not defined" the instant this component
// tried to render — which is every single time "Join Class" was pressed,
// on every role, since they all go through this one component.
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { getSignedUrl } from "../../integrations/supabase/storageClient";
import { playJoinSound, playLeaveSound } from "@/lib/soundUtils";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Mic, MicOff, Video, VideoOff, Phone, Hand,
  PenTool, MessageCircle, MoreVertical, BookOpen,
  Circle, Loader2, X, Smile, Play, Pause,
  Volume2, ChevronDown, ChevronLeft, ChevronRight, Users, Eye,
  LayoutGrid, AlignJustify, Columns, Rows, Maximize2, Minimize2,
  SwitchCamera, Settings, Check, Wifi,
  Monitor, MonitorOff, Pin, Timer, UserCheck, Crosshair,
  Zap, ClipboardList, Bell, Radio, Layers,
} from "lucide-react";
import ClassLobby        from "./ClassLobby";
import ClassChatPanel    from "./ClassChatPanel";
import ClassParticipants from "./ClassParticipants";
import ClassPolls        from "./ClassPolls";
import ClassEndScreen    from "./ClassEndScreen";
import AttendanceQuickReview from "./AttendanceQuickReview";
import ClassControls     from "./ClassControls";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import LiveQuizOverlay   from "./LiveQuizOverlay";
import PDFViewer, { prewarmPDF } from "./PDFViewer";
import LiveClassFilePanel from "./LiveClassFilePanel";
import {
  ClassroomViewProps,
  LayoutMode,
  FloatingEmoji,
  RaisedHand,
  TEAL,
  TEAL2,
  DARK,
  GLASS,
  GLASSB,
  GREEN,
  RED,
  BAR_H,
  CSS,
  WS_DROP_DEBOUNCE_MS,
  ReconnectingOverlay,
  useAudioOnlyMode,
  useConnectionHeartbeat,
  pendingDataQueue,
  flushDataQueue,
  DataQueueFlusher,
  useScreenWakeLock,
  ReconnectMonitor,
  ConnectionStateBanner,
  AudioOnlyBridge,
  HeartbeatBridge,
  WbSyncBridge,
  AdminMuteListener,
  BASE_GAIN,
  VolumeBooster,
  MediaAutoPublish,
  RoomDataListener,
  FloatingEmojiLayer,
  RaisedHandsOverlay,
  GroupRecitePermDialog,
  LAYOUT_OPTIONS,
  LayoutSwitcher,
  MicKeepAlive,
  MicKeepAliveFromContext,
  GroupReciteAutoMic,
  WBTool,
  WBStroke,
  WBShape,
  WBText,
  WBImage,
  WBElement,
  drawElement,
  canvasCache,
  Whiteboard,
  WhiteboardBridge,
  MaterialPicker,
  MAT_TYPE_ICON,
  toMaterialEmbedUrl,
  RESUME_KEY,
  saveResume,
  loadResume,
  InClassMaterialViewer,
  SURAH_PAGE,
  PAGE_SURAH,
  QuranMode,
  SURAHS_LIST,
  QURAN_PAGE_KEY,
  InClassQuranReader,
  MAT_UPLOAD_BUCKET,
  detectMaterialType,
  SubjectMaterialsPanel,
  MaterialViewer,
  RecController,
  RoomSettingsModal,
  QUALITY_LABELS,
  SignalBars,
  useNetworkQuality,
  NetworkQualityBadge,
  NetworkAdaptiveEngine,
  ParticipantSignalIcon,
  ParticipantTile,
  VideoGrid,
  DuoPipLayout,
  GRID_PAGE_SIZE,
  PagedGrid,
  BottomBar,
  BottomBarBridge,
  RoomToContextBridge,
  syncManualAttendanceFromSession,
  queuePublish,
} from "./classroomComponents";

export * from "./classroomComponents";

const ClassroomView=({subject,onLeave,onMinimize,autoJoin=false}:ClassroomViewProps)=>{
  const{user,hasRole}=useAuth();const{t}=useLanguage();const isMobile=useIsMobile();const isPrivileged=hasRole("admin")||hasRole("teacher");
  const{setHasConnected}=useLiveClass();
  const[phase,setPhase]=useState<"lobby"|"live"|"ended">("lobby");
  const[token,setToken]=useState<string|null>(null);const[wsUrl,setWsUrl]=useState<string|null>(null);
  const[error,setError]=useState<string|null>(null);const[loading,setLoading]=useState(false);
  const[reconnecting,setReconnecting]=useState(false);
  /* ── reconnect state ── */
  const[roomKey,setRoomKey]=useState(0);          // bump to remount <LiveKitRoom> with fresh token
  // Use refs instead of state so autoReconnect useCallback never needs them as deps.
  // State-based count was causing useCallback to recreate on every attempt, which
  // destabilised ReconnectMonitor's event listeners and caused the infinite reconnect loop.
  const autoReconnectCountRef=useRef(0);
  const isReconnectingRef=useRef(false);           // guard against concurrent autoReconnect calls
  const intentionalLeaveRef=useRef(false);         // true on manual leave → skip auto-reconnect
  const participantCountRef=useRef(0);              // tracks peak live participant count for ClassEndScreen

  // ── Eager materials prewarm ───────────────────────────────────────────
  // CHANGED: previously, materials only started loading/rendering the moment
  // the user opened the Materials panel AND then tapped a specific document —
  // a fully cold pdf.js load happening right when they wanted to see it.
  // Now we fetch the material list and start caching/rendering PDFs in the
  // background from the moment the classroom mounts (lobby included — that's
  // free head-start time while the user is choosing mic/camera), staggered
  // so it doesn't compete with the actual class connection. By the time the
  // user opens Materials and taps a document, PDFViewer's own cache (see
  // PDFViewer.tsx) usually already has it — instant, and works offline.
  useEffect(()=>{
    if(!subject?.id)return;
    let cancelled=false;
    const timers:ReturnType<typeof setTimeout>[]=[];
    supabase.from("subject_materials" as any).select("file_url,material_type").eq("subject_id",subject.id)
      .then(({data}:{data:any[]|null})=>{
        if(cancelled||!data)return;
        const pdfs=data.filter(m=>m.file_url&&(m.material_type==="PDF"||m.material_type==="document"||(m.file_url||"").toLowerCase().split("?")[0].endsWith(".pdf")));
        // FIX ("slow to load once the class connects"): this used to start
        // downloading PDFs almost immediately (i*600ms, so the first one
        // began well under a second after mount) — right when the LiveKit
        // token fetch and ICE/DTLS handshake are also competing for the
        // connection. Pushing the first prewarm out and spacing the rest
        // further apart gives the actual class connection priority; PDFs
        // still finish caching well before a student realistically opens
        // the Materials panel.
        pdfs.forEach((m,i)=>{
          timers.push(setTimeout(()=>{ if(!cancelled) prewarmPDF(m.file_url); },4000+i*1200));
        });
      })
      .catch(()=>{}); // best-effort — Materials panel will still load normally if this fails
    return ()=>{ cancelled=true; timers.forEach(clearTimeout); };
  },[subject?.id]);

  /* ── lobby media choices ── */
  const[lobbyMic,setLobbyMic]=useState(false); // OFF by default — user must explicitly enable
  const[lobbyCam,setLobbyCam]=useState(false); // OFF by default — user must explicitly enable
  // FIX ("lobby mic/cam choice doesn't reflect in class"): MediaAutoPublish used to decide
  // whether this was a first-join (apply lobby choice) vs a reconnect (apply last-known toggle
  // state) by reading `hasConnected` from LiveClassContext. But connect() below calls
  // setHasConnected(true) in the exact same synchronous tick as setPhase("live") — the state
  // update that mounts <LiveKitRoom> (and therefore MediaAutoPublish) in the first place. React
  // batches both updates into one commit, so by MediaAutoPublish's FIRST-EVER render,
  // hasConnected already reads true — making every first join look like a reconnect, so it
  // silently ignored the mic/cam the user picked in the lobby (students, teachers, admins
  // alike) and fell back to the default OFF/OFF state instead.
  // Fix: track "was this the first connect() call" in a plain ref, frozen the moment connect()
  // runs (before any state changes), and pass it down as an explicit prop instead of relying on
  // the reactive (and, in this exact spot, already-stale) context value.
  const everConnectedRef=useRef(false);
  const isFirstJoinPropRef=useRef(true);
  // Background keep-alive (silent <audio>, WakeLock, MediaSession) is started/stopped
  // from GlobalClassroomOverlay via useBackgroundAudio.ts based on `hasConnected` —
  // no per-component keep-alive needed here anymore.
  // Feature 7: Screen wake lock — keep screen on during class so Android doesn't kill audio
  // (Separate from GlobalClassroomOverlay's wake lock — that one only activates after minimize)
  useScreenWakeLock(phase === "live");

  const[sessionId,setSessionId]=useState<string|null>(null);const[sessionInfo,setSessionInfo]=useState<any>(null);
  const[showAttendanceReview,setShowAttendanceReview]=useState(false);
  const[attendanceId,setAttendanceId]=useState<string|null>(null);const[joinedAt]=useState(Date.now());
  // FIX: when a student disconnects (logs out, force-closes the app, hard network
  // drop) and later rejoins, we now reuse their EXISTING attendance_logs row for
  // this session instead of inserting a second one — previously every rejoin
  // created a brand-new row, so the same student could show up multiple times in
  // the admin's "Auto-Logged" list with their time split across separate entries.
  // attPriorDurationRef holds whatever duration was already banked on that row
  // from earlier stints in this same session, so the next time they leave we
  // write back prior + this-stint duration instead of overwriting it.
  const attPriorDurationRef=useRef(0);
  const[savingRec,setSavingRec]=useState(false);const[isSessionLive,setIsSessionLive]=useState(false);const[duration,setDuration]=useState(0);
  const recStopRef=useRef<()=>Promise<void>>(async()=>{});
  // BUG FIX — see onBeforeUnload below: recStopRef.current is ALWAYS a
  // function (a no-op placeholder until RecController mounts, then the real
  // stopRec) — so checking "is it a function" is always true and can never
  // distinguish "recording active" from "never recorded at all". This ref
  // is the real source of truth, kept in sync by RecController itself.
  const isRecordingRef=useRef(false);
  // Auto-save on pagehide (tab close / refresh / navigate away).
  // pagehide fires synchronously; stopRec is async but the browser allows
  // async work initiated from pagehide as long as we don't await across
  // microtask boundaries that the browser kills. We kick it off and let it run.
  useEffect(()=>{
    const onPageHide=()=>{ recStopRef.current?.(); };
    const onBeforeUnload=(e:BeforeUnloadEvent)=>{
      // BUG FIX — "recording in progress" warning was showing on EVERY
      // leave/refresh/close, for every teacher AND every student, even when
      // no recording had ever been started. The old check tested whether
      // recStopRef.current was a function — which it always is (either the
      // no-op placeholder or the real stopRec) — so this fired unconditionally.
      // Now gated on the actual recording state.
      if(isRecordingRef.current){
        e.preventDefault();
        e.returnValue="A recording is in progress. Are you sure you want to leave?";
      }
    };
    window.addEventListener("pagehide",onPageHide);
    window.addEventListener("beforeunload",onBeforeUnload);
    return()=>{
      window.removeEventListener("pagehide",onPageHide);
      window.removeEventListener("beforeunload",onBeforeUnload);
    };
  },[]);
  const[chatOpen,setChatOpen]=useState(false);const[partOpen,setPartOpen]=useState(false);const[chatUnread,setChatUnread]=useState(0);
  useEffect(()=>{
    if(!sessionId||phase!=="live")return;
    const ch=supabase.channel(`chat-unread-${sessionId}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"class_chat_messages",filter:`session_id=eq.${sessionId}`},
        (payload:any)=>{
          if(payload.new?.sender_id===user?.id)return;
          if(payload.new?.type==="system")return;
          setChatUnread(n=>{const panelClosed=!chatOpen;return panelClosed?n+1:0;});
        })
      .subscribe();
    return()=>{supabase.removeChannel(ch);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sessionId,phase,user?.id]);
  const[sideTab,setSideTab]=useState<"chat"|"polls">("chat");const[showEnd,setShowEnd]=useState(false);
  // FIX ("student can exit with a single accidental tap"): the Leave button
  // (both the phone-icon button and its dropdown twin) called leaveSession()
  // directly with zero confirmation — one mis-tap dropped a student straight
  // out of class. Teachers already get a confirm step via the End-class
  // dialog; students now get an equivalent lightweight confirm before
  // leaveSession() actually runs.
  const[showLeaveConfirm,setShowLeaveConfirm]=useState(false);
  // FIX BUG 2: quizOpen state — LiveQuizOverlay was permanently disabled with hardcoded isOpen={false}
  const[quizOpen,setQuizOpen]=useState(false);
  const[wbOpen,setWbOpen]=useState(false);const[matOpen,setMatOpen]=useState<any>(null);const[matPicker,setMatPicker]=useState(false);const[matPanelOpen,setMatPanelOpen]=useState(false);
  // Track whether SubjectMaterialsPanel has any open/minimized materials — keep it mounted if so
  const[matPanelHasPip,setMatPanelHasPip]=useState(false);
  // Imperative ref to panel — lets us call showList() without toggling mount state
  const matPanelRef=useRef<{showList:()=>void}|null>(null);
  // Smart toggle: if panel is mounted (has pip or is open), just call showList(); else open it
  const toggleMatPanel=()=>{
    if(matPanelHasPip||matPanelOpen){
      // Panel is alive — tell it to show the list, and make sure it's "open"
      setMatPanelOpen(true);
      matPanelRef.current?.showList();
    } else {
      setMatPanelOpen(true);
    }
  };
  const[matMinimized,setMatMinimized]=useState(false);
  const[matPipPos,setMatPipPos]=useState({x:20,y:120});
  const matPipDragging=useRef(false);
  const matPipDragStart=useRef({px:0,py:0,ox:0,oy:0});
  const onMatPipPointerDown=(e:React.PointerEvent)=>{matPipDragging.current=true;matPipDragStart.current={px:e.clientX,py:e.clientY,ox:matPipPos.x,oy:matPipPos.y};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);};
  const onMatPipPointerMove=(e:React.PointerEvent)=>{if(!matPipDragging.current)return;setMatPipPos({x:matPipDragStart.current.ox+(e.clientX-matPipDragStart.current.px),y:matPipDragStart.current.oy+(e.clientY-matPipDragStart.current.py)});};
  const onMatPipPointerUp=()=>{matPipDragging.current=false;};
  const[groupRecite,setGroupRecite]=useState(false);const[canStudentWrite,setCanStudentWrite]=useState(false);const[canStudentRec,setCanStudentRec]=useState(false);
  // Student recording — lifted here so SubjectMaterialsPanel can also trigger it
  const[stuRec,setStuRec]=useState(false);
  const stuMrRefTop=useRef<MediaRecorder|null>(null);
  // Feature 2: Audio-only mode (manual + auto on poor network)
  const[audioOnlyActive,setAudioOnlyActive]=useState(false);
  const stuChunksTop=useRef<Blob[]>([]);
  const toggleStuRecordTop=async()=>{
    if(stuRec){
      stuMrRefTop.current?.stop();
      stuMrRefTop.current!.onstop=()=>{
        const mt=stuMrRefTop.current?.mimeType||"audio/webm";
        const blob=new Blob(stuChunksTop.current,{type:mt});
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");a.href=url;a.download=`class-${Date.now()}.webm`;a.click();URL.revokeObjectURL(url);stuChunksTop.current=[];
      };setStuRec(false);
    }else{
      try{
        const s=await navigator.mediaDevices.getUserMedia({audio:true});
        const mime=["audio/webm","audio/mp4","audio/ogg"].find(t2=>{try{return MediaRecorder.isTypeSupported(t2);}catch{return false;}})||"";
        const mr=new MediaRecorder(s,mime?{mimeType:mime}:undefined);
        stuChunksTop.current=[];mr.ondataavailable=e=>{if(e.data.size>0)stuChunksTop.current.push(e.data);};
        mr.start(1000);stuMrRefTop.current=mr;setStuRec(true);
      }catch{toast({title:"Microphone access denied"});}
    }
  };
  const[floatingEmojis,setFloatingEmojis]=useState<FloatingEmoji[]>([]);
  const[raisedHands,setRaisedHands]=useState<RaisedHand[]>([]);
  const[layout,setLayout]=useState<LayoutMode>("grid");
  const[groupReciteDialog,setGroupReciteDialog]=useState(false);
  const emojiIdRef=useRef(0);
  const wbBuffer=useRef<any[]|null>(null);
  // FIX BUG 10: roomRef stores the LiveKit Room object via RoomDataListener — replaces __lkRoom__ global
  const roomRef=useRef<any>(null);
  // FIX BUG 8: ref to hold the session-end channel so we can subscribe immediately on join
  const sessionEndChannelRef=useRef<any>(null);

  // ══ NEW FEATURES ══
  // Feature 1: Screen share
  const[screenSharing,setScreenSharing]=useState(false);
  // Feature 3: Desktop participants panel
  const[partPanelOpen,setPartPanelOpen]=useState(false);
  // Feature 5: Live attendance view
  const[attendanceOpen,setAttendanceOpen]=useState(false);
  const[liveAttendees,setLiveAttendees]=useState<any[]>([]);
  // Feature 9: Spotlight a participant
  const[spotlightId,setSpotlightId]=useState<string|null>(null);
  // Feature 10: Countdown timer
  const[timerOpen,setTimerOpen]=useState(false);
  const[timerSeconds,setTimerSeconds]=useState(0);
  const[timerRunning,setTimerRunning]=useState(false);
  const[timerInput,setTimerInput]=useState("5");
  const timerRef=useRef<any>(null);
  // Feature 11: LiveClassFilePanel (in-class materials)
  const[liveFilesOpen,setLiveFilesOpen]=useState(false);
  // Feature 13: Hand queue management
  const[handQueueOpen,setHandQueueOpen]=useState(false);
  // Feature 15: Recording indicator for students
  const[teacherIsRecording,setTeacherIsRecording]=useState(false);
  // Feature 8: Whiteboard laser pointer
  const[laserActive,setLaserActive]=useState(false);
  // Feature 17: Session summary
  const[summaryOpen,setSummaryOpen]=useState(false);
  const[sessionSummary,setSessionSummary]=useState<any>(null);
  // FIX BUG 6: prefetch includes a fetchedAt timestamp so stale tokens can be detected
  const prefetch=useRef<{token:string;url:string;fetchedAt:number}|null>(null);
  useEffect(()=>{
    // Initial prefetch
    const doFetch=()=>{supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action:isPrivileged?"start_session":"join"}}).then(({data})=>{if(data?.token&&data?.url)prefetch.current={token:data.token,url:data.url,fetchedAt:Date.now()};}).catch(()=>{});};
    doFetch();
    // Feature 8: Re-fetch every 2.5 min so lobby users never have a stale token
    const iv=setInterval(()=>{if(phase==="lobby")doFetch();},2.5*60_000);
    return()=>clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[subject.id,isPrivileged]);
  useEffect(()=>{
    if(!autoJoin)return;
    const t=setTimeout(()=>{
      if(phase==="lobby"&&!loading&&!error){
        connect(isPrivileged?"start_session":"join");
      }
    },120);
    return()=>clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[autoJoin]);
  useEffect(()=>{const check=async()=>{const{data}=await supabase.from("live_sessions").select("*").eq("subject_id",subject.id).eq("status","live").maybeSingle();if(data){setSessionInfo(data);setSessionId(data.id);setIsSessionLive(true);}else setIsSessionLive(false);};check();const iv=setInterval(check,4000);return()=>clearInterval(iv);},[subject.id]);

  /* ── Student auto-kick: watch DB for session.status → "ended" ────────────
     Two-pronged approach: LiveKit data channel (fast) + Supabase realtime (backup).
     Both converge on setPhase("ended") which shows ClassEndScreen.
     FIX BUG 8: The channel is also stored in sessionEndChannelRef so connect() can
     subscribe immediately when the fresh sessionId is known — before this effect runs. */
  useEffect(()=>{
    if(!sessionId||isPrivileged||phase!=="live")return;
    // BUG FIX — real Supabase Realtime channel leak: this channel is usually
    // created by connect() itself (to close a race-condition window — see
    // BUG FIX 8 comment there), which runs synchronously before this effect
    // even gets a chance to fire. That meant this effect's own subscribe
    // branch was always skipped (`if(sessionEndChannelRef.current)return`),
    // so its cleanup — which only existed inside that same skipped branch —
    // never got registered either. Net effect: the channel connect() opened
    // was NEVER removed by anything, not when the class ended, not even on
    // component unmount. Every class join permanently leaked one open
    // realtime subscription for the lifetime of the tab.
    // Fix: register the cleanup unconditionally, based on whatever is
    // currently in the ref — regardless of which code path put it there —
    // so it's reliably torn down exactly once whenever sessionId/phase
    // changes away from this state, or on unmount.
    if(!sessionEndChannelRef.current){
      const ch=supabase.channel(`session-end-${sessionId}`)
        .on("postgres_changes",{event:"UPDATE",schema:"public",table:"live_sessions",filter:`id=eq.${sessionId}`},
          (payload:any)=>{
            if(payload.new?.status==="ended"&&!intentionalLeaveRef.current){
              // Teacher ended the class
              setPhase("ended");
            }
          })
        .subscribe();
      sessionEndChannelRef.current=ch;
    }
    return()=>{
      if(sessionEndChannelRef.current){supabase.removeChannel(sessionEndChannelRef.current);sessionEndChannelRef.current=null;}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sessionId,isPrivileged,phase]);
  useEffect(()=>{if(phase!=="live")return;const ti=setInterval(()=>setDuration(d=>d+1),1000);return()=>clearInterval(ti);},[phase]);
  useEffect(()=>{
    if(phase!=="live"||!("mediaSession"in navigator))return;
    try{
      (navigator as any).mediaSession.metadata=new(window as any).MediaMetadata({title:subject.title,artist:"Tahleem Academy — Live Class",album:"In Progress"});
      (navigator as any).mediaSession.playbackState="playing";
      // FIX: "stop" ends the call; "pause" is a no-op — the OS fires pause on
      // screen-lock/app-switch and we must NOT leave the session in response.
      // "play" is also a no-op; LiveKit manages audio independently of MediaSession.
      (navigator as any).mediaSession.setActionHandler("stop",  ()=>leaveSession());
      try{(navigator as any).mediaSession.setActionHandler("pause", null);}catch{}
      try{(navigator as any).mediaSession.setActionHandler("play",  null);}catch{}
    }catch{}
    return()=>{try{(navigator as any).mediaSession.playbackState="none";}catch{}};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[phase,subject.title]);

  const connect=async(action:string,settings?:any,mediaSettings?:{micOn:boolean;cameraOn:boolean})=>{
    // FIX: capture first-join status in a ref BEFORE setHasConnected(true)/setPhase("live")
    // fire below — see the comment on isFirstJoinPropRef above for why this must happen here.
    isFirstJoinPropRef.current=!everConnectedRef.current;
    everConnectedRef.current=true;
    if(mediaSettings){setLobbyMic(mediaSettings.micOn);setLobbyCam(mediaSettings.cameraOn);}
    // Guard: user must be loaded before inserting attendance rows
    if(!user){setError("Session expired. Please refresh the page.");return;}
    setLoading(true);setError(null);
    try{
      // FIX BUG 6: Consume and clear the prefetch so it is never reused stale.
      // Also check freshness — tokens older than 5 min are discarded (room state may have changed).
      // Token expires — use prefetch only if <3min old (lobby waits can exceed this)
      const isFresh=prefetch.current&&(Date.now()-prefetch.current.fetchedAt)<3*60_000;
      let tk=isFresh?prefetch.current!.token:null;
      let url=isFresh?prefetch.current!.url:null;
      prefetch.current=null; // always clear after reading so Try Again fetches a new token
      if(!tk||!url){const{data,error:e}=await supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action}});if(e)throw e;if(data?.error)throw new Error(data.error);tk=data.token;url=data.url;}
      setToken(tk!);setWsUrl(url!);

      // FIX ("takes a while before showing my full details"): flip to the live
      // phase — which is what actually tells <LiveKitRoom> to connect — the
      // moment we have a token, instead of waiting on the session lookup +
      // attendance_logs + class_participants writes below. Those are DB
      // bookkeeping, not prerequisites for joining the room (the LiveKit room
      // itself is keyed off subject.id, not session_id), so they used to add
      // 3-4 extra sequential network round trips before anyone saw video/name.
      // They now run in the background (see bookkeeping IIFE below) and just
      // fill in sessionId/attendanceId/etc. a moment later.
      setPhase("live");
      setHasConnected(true);   // unlock overlay PiP/minimize — user is now in the class
      try { playJoinSound(); } catch {}

      // ── Background session bookkeeping — does NOT block the room connecting ──
      (async()=>{
        try{
          // FIX: pick the session that is ACTUALLY live/active first, only falling back to a
          // merely-scheduled row if none is live. Sorting by scheduled_at alone was wrong: a
          // future pre-scheduled occurrence of a recurring class always has a later scheduled_at
          // than today's already-live session, so it was being picked instead — causing students'
          // attendance_logs/class_participants rows to be written against the wrong session_id.
          // The LiveKit call itself still worked (room name is keyed off subject_id, not session
          // id), but the admin dashboard's participant count — looked up by the real live
          // session's id — found nothing, showing 0 while people were actually in the class.
          const{data:liveRows}=await supabase.from("live_sessions").select("*").eq("subject_id",subject.id).in("status",["live","active"]).order("actual_start_time",{ascending:false,nullsFirst:false}).limit(1);
          let sessions=liveRows;
          if(!sessions?.length){
            const{data:scheduledRows}=await supabase.from("live_sessions").select("*").eq("subject_id",subject.id).eq("status","scheduled").order("scheduled_at",{ascending:false,nullsFirst:false}).limit(1);
            sessions=scheduledRows;
          }
          if(sessions?.length){
            const freshSessionId=sessions[0].id;
            // FIX BUG 1: Apply class settings using the freshly-retrieved session ID, not the
            // stale sessionId state (which is null when a teacher starts a new class for the first time).
            // FIX: a session must flip to "live" whenever ANYONE connects to the room — student,
            // teacher, or admin — not only when settings are present (which used to mean only the
            // start_session action, i.e. teacher/admin, could ever move status out of "scheduled").
            // A student joining an unstarted-but-scheduled class now marks it live too.
            const alreadyLive=sessions[0].status==="live"||sessions[0].status==="active";
            const liveUpdate:any={...(settings||{})};
            if(!alreadyLive){liveUpdate.status="live";liveUpdate.actual_start_time=sessions[0].actual_start_time||new Date().toISOString();}
            if(Object.keys(liveUpdate).length){await supabase.from("live_sessions").update(liveUpdate).eq("id",freshSessionId);}
            setSessionId(freshSessionId);setSessionInfo(alreadyLive?sessions[0]:{...sessions[0],...liveUpdate});
            // FIX: check for an attendance_logs row this student already has for
            // this exact session (from an earlier stint that disconnected/logged
            // out) before inserting a new one. Reusing it means a rejoin shows up
            // as ONE continuous attendance record instead of a duplicate entry.
            const{data:existingAtt}=await supabase.from("attendance_logs").select("id,duration_seconds").eq("session_id",freshSessionId).eq("user_id",user.id).maybeSingle();
            if(existingAtt){
              attPriorDurationRef.current=existingAtt.duration_seconds||0;
              setAttendanceId(existingAtt.id);
              await supabase.from("attendance_logs").update({left_at:null,device_info:navigator.userAgent}).eq("id",existingAtt.id);
            }else{
              attPriorDurationRef.current=0;
              const{data:att}=await supabase.from("attendance_logs").insert({session_id:freshSessionId,user_id:user.id,device_info:navigator.userAgent}).select("id").single();
              if(att)setAttendanceId(att.id);
            }
            await supabase.from("class_participants").upsert({session_id:freshSessionId,student_id:user.id,joined_at:new Date().toISOString(),is_muted:!isPrivileged,camera_on:true,left_at:null,left_minutes:null},{onConflict:"session_id,student_id"});
            // FIX BUG 8: Subscribe to session-end immediately here — before the useEffect cycle —
            // so there is no window where the teacher can end the class and students miss the event.
            if(!isPrivileged&&!sessionEndChannelRef.current){
              const endCh=supabase.channel(`session-end-${freshSessionId}`)
                .on("postgres_changes",{event:"UPDATE",schema:"public",table:"live_sessions",filter:`id=eq.${freshSessionId}`},
                  (payload:any)=>{if(payload.new?.status==="ended"&&!intentionalLeaveRef.current)setPhase("ended");})
                .subscribe();
              sessionEndChannelRef.current=endCh;
            }
          }
        }catch(bookkeepErr){
          // Non-fatal: the call itself is already connected. Attendance/participant
          // rows just won't be recorded for this join — log for diagnosis instead
          // of surfacing an error screen over an otherwise-working class.
          console.warn("[ClassroomView] session bookkeeping failed:",bookkeepErr);
        }
      })();
    }catch(e:any){setError(e?.message||"Failed to connect");}finally{setLoading(false);}
  };

  /* ══ AUTO-RECONNECT ══
     Fires when LiveKit emits Disconnected unexpectedly (e.g. Android tab suspension).
     Uses refs for count + in-progress flag so the useCallback is stable (no deps that
     change mid-session). A stable callback means ReconnectMonitor never re-registers
     its event listeners mid-reconnect — which was the root cause of the infinite loop. */
  const autoReconnect=useCallback(async()=>{
    // Guard 1: user manually left — never auto-reconnect
    if(intentionalLeaveRef.current)return;
    // Guard 2: already mid-reconnect — don't stack concurrent calls
    if(isReconnectingRef.current)return;

    // Guard 3: exhausted retries — give up and drop back to lobby.
    // CHANGED: the retry budget now depends on whether the tab is visible.
    // Foreground: fail fast (8 attempts, ~90s total) so a watching user gets
    // an honest "connection lost" message instead of an endless spinner.
    // Background: be far more patient (40 attempts, longer backoff cap) —
    // a minimized/locked-screen user can't see a spinner or an error either
    // way, so silently giving up after ~90s just means the call is dead by
    // the time they come back for no good reason. Give the network more
    // chances to recover first.
    const backgrounded   = document.visibilityState !== "visible";
    const maxAttempts     = backgrounded ? 40 : 8;
    const backoffCapMs    = backgrounded ? 30_000 : 15_000;
    if(autoReconnectCountRef.current>=maxAttempts){
      setReconnecting(false);
      setError("Connection lost after several attempts. Please try again.");
      setPhase("lobby");
      setHasConnected(false);
      return;
    }
    isReconnectingRef.current=true;
    setReconnecting(true);
    // Exponential backoff, capped higher while backgrounded so we don't
    // hammer the token endpoint for minutes on end. Base lowered from 1000ms
    // to 400ms so the FIRST retry (by far the most common case — a brief
    // network blip) fires almost immediately: combined with the 1s drop
    // debounce above, a normal reconnect now completes in ~2-3s instead of
    // several seconds, while later attempts still back off further apart.
    const backoffMs=Math.min(400*Math.pow(2,autoReconnectCountRef.current),backoffCapMs);
    await new Promise(r=>setTimeout(r,backoffMs));
    try{
      const{data}=await supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action:isPrivileged?"start_session":"join"}});
      if(data?.token&&data?.url){
        prefetch.current={token:data.token,url:data.url,fetchedAt:Date.now()};
        autoReconnectCountRef.current+=1;  // ref — won't trigger useCallback recreation
        setToken(data.token);
        setWsUrl(data.url);
        setRoomKey(k=>k+1); // remount LiveKitRoom with fresh token
        // Do NOT setReconnecting(false) here — overlay stays up until the new room
        // fires Connected, which triggers onReconnected → setReconnecting(false).
      }else{
        // Token fetch returned no usable data — retry rather than giving up
        // on the very first failure (this used to bail immediately, which
        // meant a single network blip — common while backgrounded — killed
        // the whole retry budget instead of using it).
        autoReconnectCountRef.current+=1;
        isReconnectingRef.current=false;
        autoReconnect();
      }
    }catch{
      // Network/edge-function error — same reasoning: retry through the
      // normal backoff loop instead of surrendering on attempt 1.
      autoReconnectCountRef.current+=1;
      isReconnectingRef.current=false;
      autoReconnect();
    }
    // No finally{setReconnecting(false)} — success path is cleared by onReconnected
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[subject.id,isPrivileged]); // stable — refs handle mutable values

  useEffect(()=>()=>{
    if(attendanceId){const d=attPriorDurationRef.current+Math.floor((Date.now()-joinedAt)/1000);supabase.from("attendance_logs").update({left_at:new Date().toISOString(),duration_seconds:d}).eq("id",attendanceId);}
    if(sessionId&&user)supabase.from("class_participants").update({left_at:new Date().toISOString(),duration_minutes:Math.floor((Date.now()-joinedAt)/60000)}).eq("session_id",sessionId).eq("student_id",user.id);
  },[attendanceId,joinedAt,sessionId,user]);

  const endSession=async()=>{
    intentionalLeaveRef.current=true; // prevent auto-reconnect on disconnect
    setShowEnd(false);
    // Auto-save any active recording before tearing down the session
    await recStopRef.current?.();
    try{
      if(sessionId){
        // 1. Update DB so students' Supabase subscription detects the end
        await supabase.from("live_sessions").update({status:"ended",ended_at:new Date().toISOString(),actual_end_time:new Date().toISOString()}).eq("id",sessionId);
        // FIX: pre-fill manual_attendance from who actually joined, instead of
        // leaving it for the teacher to mark every student by hand afterwards.
        if(user)syncManualAttendanceFromSession(sessionId,subject,user.id).catch(()=>{});
        if(isPrivileged)setShowAttendanceReview(true); // pop up immediately instead of waiting on the notification
        if(user)await supabase.from("class_chat_messages").insert({session_id:sessionId,sender_id:user.id,message:t("Class has ended","انتهت الحصة"),type:"system"});
        // 2. Broadcast class_ended via LiveKit data channel so students disconnect immediately
        // (faster than waiting for DB subscription)
        try{
          // FIX BUG 10: Use roomRef instead of window.__lkRoom__ global
          const room=roomRef.current;
          if(room?.localParticipant){
            room.localParticipant.publishData(
              new TextEncoder().encode(JSON.stringify({type:"class_ended"})),
              {reliable:true}
            );
            // Give data message a moment to propagate before disconnecting
            await new Promise(r=>setTimeout(r,400));
            room.disconnect();
          }
        }catch(err){console.warn("[endSession] LiveKit broadcast failed:",err);}
        // Clear chat after short delay
        setTimeout(async()=>{
          try{ await supabase.from("class_chat_messages").delete().eq("session_id",sessionId); }
          catch(e){console.warn("[endSession] chat clear failed:",e);}
        }, 4000);
      }
    }catch(e:any){
      console.error("[endSession] DB error (continuing anyway):",e?.message);
    }finally{
      setPhase("ended");
    }
  };

  const leaveSession=async()=>{
    intentionalLeaveRef.current=true; // prevent auto-reconnect on disconnect
    // Auto-save any active recording before leaving
    await recStopRef.current?.();
    try{playLeaveSound();}catch{}
    if(attendanceId){const d=attPriorDurationRef.current+Math.floor((Date.now()-joinedAt)/1000);supabase.from("attendance_logs").update({left_at:new Date().toISOString(),duration_seconds:d}).eq("id",attendanceId);}
    if(sessionId&&user)supabase.from("class_participants").update({left_at:new Date().toISOString(),duration_minutes:Math.floor((Date.now()-joinedAt)/60000)}).eq("session_id",sessionId).eq("student_id",user.id);
    onLeave();
  };

  const handlePermChange=(type:"write"|"rec",allow:boolean,room?:any)=>{
    if(type==="write"){setCanStudentWrite(allow);try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"wb_allow_write",allow})),{reliable:true});}catch{}toast({title:allow?"✅ Students can now write on the board":"🔒 Write access revoked"});}
    else{setCanStudentRec(allow);try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"rec_allowed",allow})),{reliable:true});}catch{}toast({title:allow?"✅ Students can now record":"🔒 Record permission revoked"});}
  };
  const addFloatingEmoji=(emoji:string,sender:string="")=>{
    const id=++emojiIdRef.current;
    const x=5+Math.random()*70;
    setFloatingEmojis(prev=>[...prev,{id,emoji,x,sender}]);
    setTimeout(()=>setFloatingEmojis(prev=>prev.filter(fe=>fe.id!==id)),2800);
  };
  const handleHandRaise=(identity:string,name:string,raised:boolean)=>{
    setRaisedHands(prev=>{
      if(raised)return prev.some(h=>h.identity===identity)?prev:[...prev,{identity,name,raisedAt:Date.now()}];
      return prev.filter(h=>h.identity!==identity);
    });
  };
  const handleGroupRecite=async(room?:any)=>{
    const n=!groupRecite;
    setGroupRecite(n);
    toast({title:n?"🎙️ Group Recitation ON — all mics enabled":"🔇 Group Recitation ended"});
    try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"group_recite",active:n})),{reliable:true});}catch{}
    if(sessionId&&user)await supabase.from("class_chat_messages").insert({session_id:sessionId,sender_id:user.id,message:n?"🎙️ Group Recitation Mode — all mics ON":"🔇 Recitation ended",type:"system"});
  };
  const handleGroupReciteFromTeacher=(active:boolean)=>{
    setGroupRecite(active);
    if(active&&!isPrivileged){setGroupReciteDialog(true);}
    else if(!active&&!isPrivileged){setGroupReciteDialog(false);}
  };

  // ══ Feature 1: Screen Share ══
  const toggleScreenShare=async()=>{
    const room=roomRef.current;
    if(!room?.localParticipant)return;
    try{
      if(screenSharing){
        await room.localParticipant.setScreenShareEnabled(false);
        setScreenSharing(false);
        toast({title:"Screen share stopped"});
      }else{
        await room.localParticipant.setScreenShareEnabled(true,{audio:true});
        setScreenSharing(true);
        toast({title:"📺 Screen sharing started"});
      }
    }catch(e:any){
      setScreenSharing(false);
      if(e?.name==="NotAllowedError"||e?.name==="PermissionDeniedError"){
        toast({title:"Screen share permission denied",description:"Allow screen capture in your browser settings",variant:"destructive"});
      }else if(e?.name==="NotSupportedError"||e?.message?.includes("not supported")||e?.message?.includes("getDisplayMedia")){
        toast({title:"Screen share not supported",description:"Screen sharing requires Chrome on desktop. On mobile, use the desktop site or a laptop.",variant:"destructive"});
      }else{
        toast({title:"Screen share failed",description:e?.message||"Could not start screen share",variant:"destructive"});
      }
    }
  };

  // ══ Feature 5: Live Attendance ══
  useEffect(()=>{
    if(!sessionId||!isPrivileged||!attendanceOpen)return;
    const load=async()=>{
      const{data}=await supabase.from("class_participants").select("student_id, joined_at, profiles!inner(full_name)").eq("session_id",sessionId);
      setLiveAttendees(data||[]);
    };
    load();
    const ch=supabase.channel(`attendance-live-${sessionId}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"class_participants",filter:`session_id=eq.${sessionId}`},load)
      .subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[sessionId,isPrivileged,attendanceOpen]);

  // ══ Feature 10: Countdown Timer ══
  useEffect(()=>{
    if(!timerRunning||timerSeconds<=0)return;
    timerRef.current=setInterval(()=>{
      setTimerSeconds(s=>{
        if(s<=1){
          clearInterval(timerRef.current);
          setTimerRunning(false);
          toast({title:"⏰ Time's up!"});
          // Broadcast bell sound via data channel
          try{roomRef.current?.localParticipant?.publishData(
            new TextEncoder().encode(JSON.stringify({type:"class_bell",message:"Time's up!"})),{reliable:true}
          );}catch{}
          return 0;
        }
        return s-1;
      });
    },1000);
    return()=>clearInterval(timerRef.current);
  },[timerRunning]);

  const startTimer=()=>{
    const secs=parseInt(timerInput)*60;
    if(!secs||secs<1)return;
    setTimerSeconds(secs);
    setTimerRunning(true);
    setTimerOpen(false);
    // Broadcast to students
    try{roomRef.current?.localParticipant?.publishData(
      new TextEncoder().encode(JSON.stringify({type:"timer_start",seconds:secs})),{reliable:true}
    );}catch{}
    toast({title:`⏱️ ${timerInput}-minute timer started`});
  };
  const stopTimer=()=>{clearInterval(timerRef.current);setTimerRunning(false);setTimerSeconds(0);};
  const fmtTimer=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  // ══ Feature 15: Teacher recording → broadcast to students ══
  // Listen for is_recording DB changes (student side)
  useEffect(()=>{
    if(!sessionId||isPrivileged)return;
    const ch=supabase.channel(`rec-indicator-${sessionId}`)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"live_sessions",filter:`id=eq.${sessionId}`},
        (payload:any)=>{if(typeof payload.new?.is_recording==="boolean")setTeacherIsRecording(payload.new.is_recording);}
      ).subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[sessionId,isPrivileged]);

  // ══ Feature 17: Session Summary ══
  const generateSessionSummary=async()=>{
    if(!sessionId)return;
    const[{data:msgs},{data:pollData},{data:attendData}]=await Promise.all([
      supabase.from("class_chat_messages").select("*").eq("session_id",sessionId).order("created_at"),
      supabase.from("class_polls").select("*,class_poll_answers(*)").eq("session_id",sessionId),
      supabase.from("class_participants").select("student_id,joined_at,profiles!inner(full_name)").eq("session_id",sessionId),
    ]);
    setSessionSummary({
      duration:fmtT(duration),
      messageCount:msgs?.length||0,
      pollCount:pollData?.length||0,
      attendeeCount:attendData?.length||0,
      attendees:attendData||[],
      polls:pollData||[],
      highlights:(msgs||[]).filter((m:any)=>m.is_pinned),
    });
    setSummaryOpen(true);
  };
  const ParticipantCountBadge=()=>{
    const all=useParticipants();
    useEffect(()=>{if(all.length>participantCountRef.current)participantCountRef.current=all.length;},[all.length]);
    if(all.length===0)return null;
    return(
      <div className="gm-badge" style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.8)",flexShrink:0,cursor:"pointer"}} onClick={()=>setPartOpen(v=>!v)}>
        <Users style={{width:12,height:12,opacity:.7}}/>
        <span style={{fontSize:12,fontWeight:500,fontFamily:"'Google Sans',sans-serif"}}>{all.length}</span>
      </div>
    );
  };
  const fmtT=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  if(phase==="ended")return<>
    <ClassEndScreen subject={subject} session={sessionInfo} duration={duration} participantCount={participantCountRef.current} onGoToDashboard={onLeave} onGoToRevision={()=>{window.location.href=`/student/revision/${subject.id}`;}} />
    {isPrivileged&&showAttendanceReview&&sessionId&&(
      <AttendanceQuickReview sessionId={sessionId} subject={subject} onDone={()=>setShowAttendanceReview(false)} />
    )}
  </>;
  if(phase==="lobby"&&!loading&&!error&&!autoJoin)return<ClassLobby subject={subject} session={sessionInfo} onStartClass={(s:any,media?:any)=>connect("start_session",s,media)} onJoinClass={(media?:any)=>connect("join",undefined,media)} onBack={onLeave} isLive={isSessionLive}/>;
  if(loading)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",background:"#202124"}}>
      <style>{CSS}</style>
      <div style={{textAlign:"center"}}>
        <div style={{width:56,height:56,border:"3px solid rgba(138,180,248,.2)",borderTopColor:"#8ab4f8",borderRadius:"50%",animation:"cv-spin .8s linear infinite",margin:"0 auto 20px"}}/>
        <p style={{color:"rgba(255,255,255,.55)",fontSize:15,fontFamily:"'Google Sans',sans-serif",fontWeight:500}}>{t("Connecting…","جاري الاتصال…")}</p>
      </div>
    </div>
  );
  if(error)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",background:"#202124"}}>
      <style>{CSS}</style>
      <div style={{textAlign:"center",maxWidth:340,padding:32}}>
        <div style={{width:68,height:68,borderRadius:"50%",background:"rgba(234,67,53,.1)",border:"1px solid rgba(234,67,53,.2)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px"}}>
          <X style={{width:28,height:28,color:"#ea4335"}}/>
        </div>
        <h2 style={{fontSize:22,fontWeight:500,color:"#e8eaed",marginBottom:10,fontFamily:"'Google Sans Display',sans-serif"}}>Connection failed</h2>
        <p style={{color:"rgba(255,255,255,.45)",fontSize:14,marginBottom:28,lineHeight:1.6,fontFamily:"'Google Sans',sans-serif"}}>{error}</p>
        <div style={{display:"flex",gap:12,justifyContent:"center"}}>
          <button onClick={()=>{
            intentionalLeaveRef.current=false;
            isReconnectingRef.current=false;
            autoReconnectCountRef.current=0;
            setError(null);setToken(null);setWsUrl(null);
            connect(isPrivileged?"start_session":"join");
          }} style={{
            padding:"10px 24px",borderRadius:24,background:"#8ab4f8",border:"none",
            color:"#202124",fontSize:14,cursor:"pointer",fontWeight:600,
            fontFamily:"'Google Sans',sans-serif",
          }}>Try again</button>
          <button onClick={onLeave} style={{
            padding:"10px 24px",borderRadius:24,background:"rgba(255,255,255,.08)",
            border:"1px solid rgba(255,255,255,.15)",color:"#e8eaed",fontSize:14,
            cursor:"pointer",fontFamily:"'Google Sans',sans-serif",
          }}>Go back</button>
        </div>
      </div>
    </div>
  );
  return(
    <div data-classroom-root style={{height:"100dvh",display:"flex",flexDirection:"column",background:"#202124",overflow:"hidden"}}>
      <style>{CSS}</style>
      {token&&wsUrl&&(
        // key={roomKey} forces a full remount whenever autoReconnect bumps the key,
        // ensuring LiveKit starts with a fresh connection and token.
        <LiveKitRoom key={roomKey} serverUrl={wsUrl} token={token} connect={phase==="live"} audio={false} video={false} options={{
            adaptiveStream:{pixelDensity:"screen"},
            dynacast:true,
            disconnectOnPageLeave:false,
            // BUG FIX — "reconnects too much on low network":
            // No reconnectPolicy was set, so LiveKit fell back to its default
            // (~10 attempts, short backoff cap). That internal reconnect is
            // CHEAP — it resumes the existing peer connection / ICE without
            // touching local tracks or remote subscriptions. Once it's
            // exhausted, LiveKit fires Disconnected, and our own autoReconnect
            // below takes over with a FULL rebuild: new token, brand new Room,
            // re-subscribe every participant from scratch. That's expensive
            // and visible to the user — and on a flaky/low-bandwidth
            // connection the default budget ran out constantly, so this heavy
            // path was firing far more often than it should.
            // Giving LiveKit's own lightweight reconnect much more patience
            // means most low-network hiccups now resolve quietly without ever
            // reaching the app-level rebuild.
            reconnectPolicy:{
              nextRetryDelayInMs:(context:{retryCount:number;elapsedMs:number})=>{
                // Stop after ~2 minutes of trying internally — beyond that,
                // handing off to autoReconnect (which fetches a fresh token,
                // useful if the room/session itself changed server-side) is
                // more likely to help than continuing to retry the same one.
                if(context.elapsedMs>120_000)return -1; // negative = give up, let Disconnected fire
                // Gentle backoff: .5s, .75s, 1.1s, 1.7s ... capped at 8s —
                // frequent-but-cheap retries suit a low-network connection
                // better than a few expensive, widely-spaced ones.
                return Math.min(500*Math.pow(1.5,context.retryCount),8_000);
              },
            },
            // Feature 6: Force TCP TURN relay so the call survives restrictive
            // school/office WiFi that blocks UDP. LiveKit will still prefer UDP/STUN
            // when available — this just ensures a fallback is always ready.
            rtcConfig:{
              iceTransportPolicy:"all",  // "relay" would force TURN-only; "all" = best effort
              bundlePolicy:"max-bundle", // fewer ICE candidates = faster connect on slow nets
              iceCandidatePoolSize:2,    // pre-gather 2 candidates to speed up ICE
            },
            audioCaptureDefaults:{
              echoCancellation:true,noiseSuppression:true,autoGainControl:true,
              sampleRate:48000,channelCount:1,
            },
            publishDefaults:{
              // BUG FIX — "students can't hear well" / dropped word-beginnings:
              // DTX (discontinuous transmission) skips sending audio packets
              // during silence to save bandwidth — but on resuming after a
              // pause, most Opus/WebRTC implementations take a moment to
              // switch back from comfort-noise to real encoding, clipping the
              // first syllable. That's a minor annoyance in casual chat; in a
              // Qur'an class where teachers deliberately pause between words
              // for tajweed correction, it can eat exactly the sound a
              // student needs to hear. Bandwidth savings aren't worth it here.
              audioPreset:{maxBitrate:64000}, // mono voice at 64kbps has real headroom for the pronunciation detail (madd, ghunnah, makharij) that matters in recitation, still light on data
              dtx:false,  // was true — see note above
              red:true,   // redundant audio encoding — recovers from packet loss
              stopMicTrackOnMute:false,
              // Base (top) encoding layer — this is what a strong-network
              // viewer receives. Bumped for a visibly crisper default picture.
              videoEncoding:{maxBitrate:1_500_000,maxFramerate:30},
              backupCodec:true,
              // SIMULCAST — this is the correct, LiveKit-native way to adapt
              // video quality to each viewer's network, replacing the old
              // approach of the sender repeatedly disabling/re-enabling their
              // own camera at a lower resolution whenever ANYONE's network
              // dipped. With simulcast, three layers are encoded and sent to
              // the server at once; the SFU hands each *viewer* whichever
              // layer suits their own connection, entirely server-side, with
              // no renegotiation and no visible freeze on the sender's end.
              // This is what actually fixes "hanging/delayed video" — the
              // old logic's setCameraEnabled(false)+setCameraEnabled(true)
              // cycles were themselves a source of stalls, since each one
              // renegotiates the peer connection.
              simulcast:true,
              videoSimulcastLayers:[
                {width:320, height:180, encoding:{maxBitrate:150_000, maxFramerate:15}},
                {width:640, height:360, encoding:{maxBitrate:500_000, maxFramerate:24}},
                {width:1280,height:720, encoding:{maxBitrate:1_500_000,maxFramerate:30}},
              ],
            },
            videoCaptureDefaults:{
              // Bumped to a genuine 720p default — the prior 960×540 was
              // itself fairly soft, and every network-quality dip used to cut
              // it further to 320×240. That auto-cut is gone (see above), so
              // the camera now simply stays at a sharp, stable resolution for
              // the whole class.
              resolution:{width:1280,height:720,frameRate:30},
              facingMode:"user",
              // Explicit ideal aspect ratio — without this, a phone's front
              // camera (which is very often natively 3:4 / 4:3, not 16:9)
              // gets forced into the requested 16:9 box by cropping the
              // image tighter than the sensor's real field of view. That
              // crop is what makes a phone's picture look "zoomed in" next
              // to a laptop webcam (which is natively 16:9 already) — the
              // person has to physically back away just to appear the same
              // size as they would on a desktop. Asking for 16:9 as an
              // "ideal" (not exact) lets the browser choose the closest
              // native mode instead of aggressively cropping every device
              // the same way.
              aspectRatio:16/9,
            } as any,
          }} style={{flex:1,display:"flex",flexDirection:"column",minHeight:0,position:"relative"}} data-lk-theme="default">
          {/* FIX ("waveform shows but no voice is heard", and vice versa): this used to be
              VolumeBooster — a hand-built Web Audio pipeline (GainNode + DynamicsCompressor +
              a manually-created <audio> element) routing every remote mic track. That pipeline
              could silently stop passing real audio (suspended AudioContext, a stale
              MediaStreamTrack reference after a reconnect, autoplay policy) while the in-tile
              waveform kept animating regardless — it's driven independently by LiveKit's own
              speaking-detection, not by this pipeline. RoomAudioRenderer is LiveKit's own
              battle-tested audio renderer — the exact same one GuestClassroom already uses
              with no reports of this bug — and re-attaches automatically on reconnects/track
              changes, so waveform and actual audio can no longer drift apart. */}
          <RoomAudioRenderer/>
          {/* SAFETY NET: browsers can silently block RoomAudioRenderer's <audio>
              elements from actually playing (autoplay policy) even though everything
              connected fine — the room shows "canPlaybackAudio: false" instead of
              throwing anywhere visible. When that happens NOBODY hears ANYBODY
              (exactly this symptom), while speaking waveforms keep animating since
              those come from LiveKit's audio-level detection, not from playback.
              StartAudio renders nothing when playback is already fine, and shows a
              single tap-to-enable banner the moment the room detects it's blocked —
              tapping it calls room.startAudio() and immediately unblocks every
              participant's audio, no reconnect needed. */}
          <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9500,display:"flex",justifyContent:"center"}}>
            <StartAudio label="🔊 Tap to enable classroom audio"/>
          </div>
          <RoomToContextBridge />
          <MediaAutoPublish lobbyMic={lobbyMic} lobbyCam={lobbyCam} isFirstJoin={isFirstJoinPropRef.current}/>
          <MicKeepAliveFromContext />
          <WbSyncBridge wbOpen={wbOpen} isTeacher={isPrivileged}/>
          <AdminMuteListener isPrivileged={isPrivileged}/>
          <GroupReciteAutoMic active={groupRecite} isPrivileged={isPrivileged}/>
          {/* onDisconnected wired to autoReconnect — handles Android tab suspension */}
          <ReconnectMonitor
            onReconnecting={()=>setReconnecting(true)}
            onReconnected={()=>{
              // New room is fully connected — clear overlay and reset all reconnect state
              isReconnectingRef.current=false;
              autoReconnectCountRef.current=0;
              setReconnecting(false);
            }}
            onDisconnected={autoReconnect}
          />
          {/* Feature 2: audio-only bridge — applies camera/bitrate changes from outside LiveKitRoom */}
          <AudioOnlyBridge active={audioOnlyActive}/>
          {/* Feature 5: heartbeat — proactively degrades video before LiveKit detects drop */}
          <HeartbeatBridge sessionId={sessionId} active={phase==="live"}/>
          {/* Feature 9: data channel queue flusher — replays queued messages on reconnect */}
          <DataQueueFlusher roomRef={roomRef}/>
          <RoomDataListener onWbOpen={()=>setWbOpen(true)} onWbClose={()=>setWbOpen(false)} strokesBuffer={wbBuffer} onMatOpen={mat=>{setMatOpen(mat);setMatMinimized(false);}} onMatClose={()=>{setMatOpen(null);setMatMinimized(false);}} onWbAllowWrite={allow=>setCanStudentWrite(allow)} onRecAllowed={allow=>setCanStudentRec(allow)} onEmojiReact={(emoji:string,sender:string)=>addFloatingEmoji(emoji,sender)} onGroupRecite={handleGroupReciteFromTeacher} onHandRaise={handleHandRaise} onAdminMuteAll={()=>{}}
            onClassEnded={!isPrivileged?()=>setPhase("ended"):undefined} roomRef={roomRef}/>{/* FIX BUG 10: pass roomRef */}
          {reconnecting&&<ReconnectingOverlay attempt={autoReconnectCountRef.current}/>}
          {/* ══ FEATURE 4: CONNECTION STATE BANNER — shown during LiveKit's own reconnect ══ */}
          <ConnectionStateBanner/>
          {/* ══ GOOGLE MEET STYLE TOP BAR ══ */}
          <div style={{
            height:56,
            background:"rgba(32,33,36,.97)",
            backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
            display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"0 14px 0 16px",flexShrink:0,
            borderBottom:"1px solid rgba(255,255,255,.05)",gap:8,
          }}>
            {/* LEFT — LIVE badge + subject title only (keeps mobile header uncluttered) */}
            <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:0,overflow:"hidden"}}>
              <div className="gm-badge" style={{background:"rgba(234,67,53,.12)",border:"1px solid rgba(234,67,53,.25)",color:"#fff",flexShrink:0,maxWidth:isMobile?"52vw":"none"}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:"#ea4335",display:"inline-block",flexShrink:0,animation:"pip-pulse 1.8s ease-in-out infinite"}}/>
                <span style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"'Google Sans',sans-serif"}}>{subject.title}</span>
              </div>
              {/* Raised-hand count — admin only, compact dot badge */}
              {isPrivileged&&raisedHands.length>0&&(
                <div className="gm-badge" style={{background:"rgba(251,191,36,.12)",border:"1px solid rgba(251,191,36,.3)",color:"#fbbf24",flexShrink:0,padding:"3px 8px"}}>
                  <span style={{fontSize:12,animation:"hand-bounce 1.2s ease-in-out infinite"}}>✋</span>
                  <span style={{fontSize:11,fontWeight:600,fontFamily:"'Google Sans',sans-serif"}}>{raisedHands.length}</span>
                </div>
              )}
            </div>

            {/* RIGHT — timer · network(degraded only) · participants · [layout] · [rec admin] */}
            <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
              {/* Duration — compact, no label */}
              <div style={{display:"flex",alignItems:"center",gap:4,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:20,padding:"3px 7px",flexShrink:0}}>
                <Circle style={{width:5,height:5,fill:"#ea4335",color:"#ea4335",animation:"rec-pulse 1.4s ease-in-out infinite",flexShrink:0}}/>
                <span style={{fontSize:11,fontWeight:500,fontVariantNumeric:"tabular-nums",fontFamily:"'Google Sans',sans-serif",color:"rgba(255,255,255,.8)"}}>{fmtT(duration)}</span>
              </div>
              {/* Network indicator moved to per-participant name pills (ParticipantSignalIcon)
                  so you can see everyone's connection at a glance instead of just your own
                  in the header — removed from here per request. Adaptive video/bitrate
                  engine is kept alive headlessly since it doesn't just feed this badge. */}
              <NetworkAdaptiveEngine/>
              {/* Participant count */}
              <ParticipantCountBadge/>
              {/* Student "Record" control — moved here (beside the participant
                  badge) from a separate floating pill below the header, and
                  out of the ⋮ More menu before that. Only shown once
                  admin/teacher has granted "Allow Students to Record"; reuses
                  the same toggleStuRecordTop() state SubjectMaterialsPanel
                  already drives, so both stay in sync instead of tracking
                  two independent recordings. */}
              {!isPrivileged&&canStudentRec&&(
                <div className="gm-badge" onClick={toggleStuRecordTop} style={{
                  cursor:"pointer",flexShrink:0,
                  background: stuRec?"rgba(239,68,68,.9)":"rgba(239,68,68,.14)",
                  border:"1px solid rgba(239,68,68,.4)",
                  color: stuRec?"#fff":"#fca5a5",
                }}>
                  <Circle style={{width:8,height:8,fill: stuRec?"#fff":"#ef4444",color: stuRec?"#fff":"#ef4444",animation: stuRec?"rec-pulse 1s ease-in-out infinite":undefined}}/>
                  <span style={{fontSize:11,fontWeight:700,fontFamily:"'Google Sans',sans-serif"}}>{stuRec?"REC":"Record"}</span>
                </div>
              )}
              {/* Layout switcher — desktop only */}
              {!isMobile&&<LayoutSwitcher layout={layout} onChange={setLayout}/>}
              {/* RecController — admin only, icon-only on mobile */}
              {isPrivileged&&<RecController sessionId={sessionId} subjectId={subject.id} userEmail={user?.email||""} onSavingChange={setSavingRec} stopRecRef={recStopRef} isRecordingRef={isRecordingRef}/>}
            </div>
          </div>
          {/* Content — material panels render here so footer always stays visible */}
          <div style={{flex:1,display:"flex",minHeight:0,overflow:"hidden"}}>
            <div style={{flex:1,position:"relative",minWidth:0}}>
              <VideoGrid layout={layout} isMobile={isMobile} spotlightId={spotlightId}/>
              <FloatingEmojiLayer emojis={floatingEmojis}/>
              <RaisedHandsOverlay hands={raisedHands}/>
              {/* Materials panel — keep mounted when it has minimized PiP materials */}
              {(matPanelOpen||matPanelHasPip)&&<SubjectMaterialsPanel subjectId={subject.id} subject={subject} sessionId={sessionId} onClose={()=>setMatPanelOpen(false)} canStudentRec={canStudentRec} isPrivileged={isPrivileged} stuRec={stuRec} onToggleStuRecord={toggleStuRecordTop} onOpenMatsChange={(has:boolean)=>setMatPanelHasPip(has)} panelRef={matPanelRef}/>}
              {/* Teacher-shared material viewer — absolute inside content */}
              {matOpen&&(
                <div style={{position:"absolute",inset:0,zIndex:55,display:matMinimized?"none":"block"}}>
                  <MatViewerInlineBridge material={matOpen} isPrivileged={isPrivileged} onMinimize={()=>setMatMinimized(true)} onClose={()=>{setMatOpen(null);setMatMinimized(false);}}/>
                </div>
              )}
              {/* Floating PiP for the teacher-shared material when minimized */}
              {matOpen&&matMinimized&&(
                <div
                  onPointerDown={onMatPipPointerDown}
                  onPointerMove={onMatPipPointerMove}
                  onPointerUp={onMatPipPointerUp}
                  onClick={()=>setMatMinimized(false)}
                  style={{
                    position:"absolute", left:matPipPos.x, top:matPipPos.y, zIndex:60,
                    width:54, height:54, borderRadius:"50%",
                    background:"linear-gradient(135deg,#0a7a5e,#1a73e8)",
                    boxShadow:"0 4px 20px rgba(0,0,0,.5)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    cursor:"grab", userSelect:"none", touchAction:"none",
                    border:"2px solid rgba(255,255,255,.2)",
                  }}
                  title={matOpen.title||"Open material"}
                >
                  <span style={{fontSize:20}}>{MAT_TYPE_ICON[matOpen.material_type||"document"]||"📄"}</span>
                </div>
              )}
              {/* Feature 11: Live class file panel (in-class materials) */}
              {liveFilesOpen&&createPortal(
                <div style={{position:"fixed",inset:0,zIndex:9000,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"flex-end",justifyContent:"flex-end"}} onClick={()=>setLiveFilesOpen(false)}>
                  <div onClick={e=>e.stopPropagation()} style={{width:"min(420px,100vw)",height:"min(85vh,700px)",background:"#fff",borderRadius:"20px 0 0 0",overflow:"auto",display:"flex",flexDirection:"column",boxShadow:"-8px 0 40px rgba(0,0,0,.4)"}}>
                    <div style={{display:"flex",alignItems:"center",padding:"14px 16px",borderBottom:"1px solid #e5e7eb",flexShrink:0,background:"#1B4332"}}>
                      <span style={{flex:1,fontSize:14,fontWeight:700,color:"#fff"}}>📂 Class Materials</span>
                      <button onClick={()=>setLiveFilesOpen(false)} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:8,width:28,height:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><X style={{width:14,height:14}}/></button>
                    </div>
                    <div style={{flex:1,overflow:"auto",padding:12}}><LiveClassFilePanel subjectId={subject.id}/></div>
                  </div>
                </div>,document.body
              )}
              {/* Feature 3: Desktop participants panel */}
              {partPanelOpen&&!isMobile&&createPortal(
                <div style={{position:"fixed",top:56,right:0,bottom:80,width:300,background:"#2D2E30",borderLeft:"1px solid rgba(255,255,255,.08)",zIndex:800,display:"flex",flexDirection:"column",animation:"slide-right .2s ease",overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0}}>
                    <span style={{flex:1,fontSize:13,fontWeight:700,color:"#e8eaed",display:"flex",alignItems:"center",gap:6}}><Users style={{width:14,height:14}}/> Participants</span>
                    <button onClick={()=>setPartPanelOpen(false)} style={{background:"rgba(255,255,255,.08)",border:"none",color:"rgba(255,255,255,.6)",borderRadius:8,width:26,height:26,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><X style={{width:12,height:12}}/></button>
                  </div>
                  <div style={{flex:1,overflow:"auto"}}>
                    <ClassParticipants sessionId={sessionId||""} isPrivileged={isPrivileged} room={roomRef.current} onSpotlight={(id:string)=>setSpotlightId(prev=>prev===id?null:id)} spotlightId={spotlightId}/>
                  </div>
                </div>,document.body
              )}
              {/* Feature 13: Hand queue panel */}
              {handQueueOpen&&isPrivileged&&createPortal(
                <div style={{position:"fixed",top:56,left:0,width:280,background:"#2D2E30",borderRight:"1px solid rgba(255,255,255,.08)",zIndex:800,maxHeight:"70vh",display:"flex",flexDirection:"column",animation:"slide-right .2s ease",borderRadius:"0 0 16px 0",overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0}}>
                    <span style={{flex:1,fontSize:13,fontWeight:700,color:"#fbbf24",display:"flex",alignItems:"center",gap:6}}>✋ Hand Queue <span style={{fontSize:11,color:"rgba(255,255,255,.4)",fontWeight:400}}>({raisedHands.length})</span></span>
                    <button onClick={()=>setHandQueueOpen(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",cursor:"pointer"}}><X style={{width:12,height:12}}/></button>
                  </div>
                  <div style={{flex:1,overflowY:"auto",padding:8}}>
                    {raisedHands.length===0&&<p style={{fontSize:12,color:"rgba(255,255,255,.3)",textAlign:"center",padding:"24px 16px"}}>No hands raised</p>}
                    {[...raisedHands].sort((a,b)=>a.raisedAt-b.raisedAt).map((h,i)=>(
                      <div key={h.identity} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:"rgba(251,191,36,.06)",border:"1px solid rgba(251,191,36,.12)",marginBottom:6}}>
                        <span style={{fontSize:13,fontWeight:700,color:"#fbbf24",width:18,flexShrink:0}}>{i+1}</span>
                        <span style={{animation:"hand-bounce 1.2s ease-in-out infinite",fontSize:16}}>✋</span>
                        <span style={{flex:1,fontSize:13,color:"#e8eaed",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.name}</span>
                        <div style={{display:"flex",gap:4}}>
                          <button onClick={()=>{setSpotlightId(h.identity);setLayout("spotlight");setHandQueueOpen(false);toast({title:`📌 Spotlighting ${h.name}`,duration:2000});}}
                            style={{background:"rgba(26,115,232,.2)",border:"1px solid rgba(26,115,232,.3)",color:"#8ab4f8",borderRadius:6,padding:"3px 8px",fontSize:10,cursor:"pointer",fontWeight:700}}>
                            Call On
                          </button>
                          <button onClick={()=>{
                            try{roomRef.current?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"force_mute",target:h.identity})),{reliable:true});}catch{}
                            handleHandRaise(h.identity,h.name,false);
                          }}
                            style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.4)",borderRadius:6,padding:"3px 6px",fontSize:10,cursor:"pointer"}}>
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>,document.body
              )}
              {/* Feature 5: Live attendance panel */}
              {attendanceOpen&&isPrivileged&&createPortal(
                <div style={{position:"fixed",top:56,left:0,width:280,background:"#2D2E30",borderRight:"1px solid rgba(255,255,255,.08)",zIndex:800,maxHeight:"70vh",display:"flex",flexDirection:"column",animation:"slide-right .2s ease",borderRadius:"0 0 16px 0",overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0}}>
                    <span style={{flex:1,fontSize:13,fontWeight:700,color:"#34d399",display:"flex",alignItems:"center",gap:6}}><UserCheck style={{width:14,height:14}}/> Live Attendance <span style={{fontSize:11,color:"rgba(255,255,255,.4)",fontWeight:400}}>({liveAttendees.length})</span></span>
                    <button onClick={()=>setAttendanceOpen(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",cursor:"pointer"}}><X style={{width:12,height:12}}/></button>
                  </div>
                  <div style={{flex:1,overflowY:"auto",padding:8}}>
                    {liveAttendees.length===0&&<p style={{fontSize:12,color:"rgba(255,255,255,.3)",textAlign:"center",padding:"24px 16px"}}>Waiting for students…</p>}
                    {liveAttendees.map((a:any,i:number)=>(
                      <div key={a.student_id||i} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",borderRadius:8,marginBottom:4,background:"rgba(255,255,255,.04)"}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:"#22c55e",flexShrink:0,animation:"rec-pulse 2s ease-in-out infinite"}}/>
                        <span style={{flex:1,fontSize:13,color:"#e8eaed",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.profiles?.full_name||"Student"}</span>
                        <span style={{fontSize:10,color:"rgba(255,255,255,.3)"}}>{a.joined_at?new Date(a.joined_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):""}</span>
                      </div>
                    ))}
                  </div>
                </div>,document.body
              )}
              {/* Feature 10: Timer overlay */}
              {timerOpen&&isPrivileged&&createPortal(
                <div style={{position:"fixed",inset:0,zIndex:9500,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setTimerOpen(false)}>
                  <div onClick={e=>e.stopPropagation()} style={{background:"#2D2E30",borderRadius:20,padding:"28px 24px",width:300,boxShadow:"0 24px 60px rgba(0,0,0,.7)",border:"1px solid rgba(255,255,255,.1)",animation:"fade-in .18s ease",textAlign:"center"}}>
                    <div style={{fontSize:36,marginBottom:8}}>⏱️</div>
                    <p style={{fontSize:16,fontWeight:700,color:"#e8eaed",marginBottom:16}}>Countdown Timer</p>
                    {timerRunning?(
                      <>
                        <div style={{fontSize:48,fontWeight:900,color:"#fbbf24",fontVariantNumeric:"tabular-nums",letterSpacing:-2,marginBottom:20}}>{fmtTimer(timerSeconds)}</div>
                        <button onClick={stopTimer} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",background:"#ef4444",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>Stop Timer</button>
                      </>
                    ):(
                      <>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,justifyContent:"center"}}>
                          <input value={timerInput} onChange={e=>setTimerInput(e.target.value)} type="number" min="1" max="60"
                            style={{width:80,padding:"10px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.08)",color:"#fff",fontSize:20,fontWeight:700,textAlign:"center",outline:"none"}}/>
                          <span style={{fontSize:14,color:"rgba(255,255,255,.6)"}}>minutes</span>
                        </div>
                        <button onClick={startTimer} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#0a7c68,#064E3B)",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>▶ Start Timer</button>
                      </>
                    )}
                  </div>
                </div>,document.body
              )}
              {/* Feature 15: Student recording indicator */}
              {!isPrivileged&&teacherIsRecording&&createPortal(
                <div style={{position:"fixed",top:64,left:"50%",transform:"translateX(-50%)",zIndex:9000,background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.3)",borderRadius:20,padding:"6px 14px",display:"flex",alignItems:"center",gap:8,backdropFilter:"blur(8px)"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:"#ef4444",animation:"rec-pulse 1s ease-in-out infinite"}}/>
                  <span style={{fontSize:12,fontWeight:600,color:"#fca5a5"}}>This class is being recorded</span>
                </div>,document.body
              )}
              {/* Feature 17: Session summary modal */}
              {summaryOpen&&sessionSummary&&createPortal(
                <div style={{position:"fixed",inset:0,zIndex:9600,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setSummaryOpen(false)}>
                  <div onClick={e=>e.stopPropagation()} style={{background:"#1e2535",borderRadius:20,padding:"28px 24px",maxWidth:440,width:"100%",maxHeight:"85vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,.7)",border:"1px solid rgba(255,255,255,.1)",animation:"fade-in .18s ease"}}>
                    <div style={{textAlign:"center",marginBottom:20}}>
                      <div style={{fontSize:36,marginBottom:8}}>📋</div>
                      <p style={{fontSize:17,fontWeight:800,color:"#e8eaed",margin:0}}>Session Summary</p>
                      <p style={{fontSize:12,color:"rgba(255,255,255,.4)",margin:"4px 0 0"}}>{subject?.title}</p>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
                      {[["⏱️","Duration",sessionSummary.duration],["👥","Attendees",sessionSummary.attendeeCount],["💬","Messages",sessionSummary.messageCount],["📊","Polls",sessionSummary.pollCount]].map(([ic,lb,val])=>(
                        <div key={lb as string} style={{background:"rgba(255,255,255,.05)",borderRadius:12,padding:"12px 16px",textAlign:"center"}}>
                          <div style={{fontSize:22,marginBottom:4}}>{ic}</div>
                          <div style={{fontSize:20,fontWeight:800,color:"#e8eaed"}}>{val}</div>
                          <div style={{fontSize:11,color:"rgba(255,255,255,.4)"}}>{lb}</div>
                        </div>
                      ))}
                    </div>
                    {sessionSummary.highlights?.length>0&&(
                      <div style={{marginBottom:14}}>
                        <p style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.5)",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>📌 Pinned Messages</p>
                        {sessionSummary.highlights.map((m:any)=>(
                          <div key={m.id} style={{background:"rgba(201,168,76,.08)",border:"1px solid rgba(201,168,76,.15)",borderRadius:10,padding:"8px 12px",marginBottom:6,fontSize:13,color:"#e8eaed"}}>{m.message}</div>
                        ))}
                      </div>
                    )}
                    {sessionSummary.attendees?.length>0&&(
                      <div>
                        <p style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.5)",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>✅ Who Attended</p>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                          {sessionSummary.attendees.map((a:any)=>(
                            <span key={a.student_id} style={{fontSize:11,background:"rgba(34,197,94,.1)",color:"#4ade80",border:"1px solid rgba(34,197,94,.2)",borderRadius:20,padding:"3px 10px"}}>{a.profiles?.full_name||"Student"}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <button onClick={()=>setSummaryOpen(false)} style={{width:"100%",marginTop:20,padding:"12px",borderRadius:12,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.06)",color:"rgba(255,255,255,.7)",fontSize:14,fontWeight:600,cursor:"pointer"}}>Close</button>
                  </div>
                </div>,document.body
              )}
            </div>
            {chatOpen&&!isMobile&&(
              <div className="gm-sidebar">
                <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0,background:"rgba(32,33,36,.97)"}}>
                  {[["chat","💬","Chat"],["polls","📊","Polls"]].map(([k,ic,lb])=>(
                    <button key={k} onClick={()=>{setSideTab(k as any);if(k==="chat")setChatUnread(0);}} style={{
                      flex:1,padding:"14px 4px",background:"none",border:"none",
                      color:sideTab===k?"#8ab4f8":"rgba(255,255,255,.45)",
                      fontSize:13,fontWeight:sideTab===k?600:400,
                      borderBottom:sideTab===k?"2px solid #8ab4f8":"2px solid transparent",
                      cursor:"pointer",fontFamily:"'Google Sans',sans-serif",transition:"color .15s",
                    }}>{ic} {lb}</button>
                  ))}
                  <button onClick={()=>setChatOpen(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,.3)",cursor:"pointer",padding:"0 14px",flexShrink:0}}>
                    <X style={{width:16,height:16}}/>
                  </button>
                </div>
                <div style={{flex:1,overflow:"hidden"}}>{sideTab==="chat"?<ClassChatPanel sessionId={sessionId||""} sessionStartedAt={sessionInfo?.started_at??sessionInfo?.actual_start_time}/>:<ClassPolls sessionId={sessionId||""}/>}</div>
              </div>
            )}
          </div>
          {wbOpen&&<WhiteboardBridge onClose={()=>setWbOpen(false)} isTeacher={isPrivileged} initialStrokes={wbBuffer.current} subjectId={subject.id} canStudentWrite={canStudentWrite}/>}
          {groupReciteDialog&&!isPrivileged&&(
            <GroupRecitePermDialog
              onAccept={()=>{setGroupReciteDialog(false);}}
              onDecline={()=>{setGroupReciteDialog(false);setGroupRecite(false);}}
            />
          )}
          {/* RESET TO GUESTROOM DEFAULT — same control bar, same props shape GuestClassroom
              already uses. There is only ONE three-dot button now — ClassControls' own —
              the classroom-only extras (whiteboard, materials, group recite, hand queue,
              attendance, audio-only) are passed in as extraMenuItems and render inside that
              same dropdown, right below its built-in options. */}
          <ClassControls
            sessionId={sessionId||""}
            isHostOverride={isPrivileged}
            onToggleChat={()=>{setChatOpen(v=>!v);if(!chatOpen)setChatUnread(0);}}
            onToggleParticipants={()=>{setPartOpen(v=>!v);setPartPanelOpen(v=>!v);}}
            onEndClass={()=>setShowEnd(true)}
            onLeaveClass={()=>setShowLeaveConfirm(true)}
            chatUnread={chatUnread}
            onLaunchPoll={()=>{setChatOpen(true);setSideTab("polls");}}
            onLaunchQuiz={()=>setQuizOpen(true)}
            extraMenuItems={
              <>
                <DropdownMenuItem onClick={()=>setWbOpen(v=>!v)} style={{margin:"0 4px",borderRadius:8}}>
                  <PenTool style={{width:16,height:16,marginRight:8}}/> {wbOpen?"Close Whiteboard":"Whiteboard"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleMatPanel} style={{margin:"0 4px",borderRadius:8}}>
                  <BookOpen style={{width:16,height:16,marginRight:8}}/> {matPanelOpen?"Close Materials":"Subject Materials"}
                </DropdownMenuItem>
                {isPrivileged&&(
                  <DropdownMenuItem onClick={()=>handleGroupRecite(roomRef.current)} style={{margin:"0 4px",borderRadius:8}}>
                    <Radio style={{width:16,height:16,marginRight:8}}/> {groupRecite?"Stop Group Recite":"Start Group Recite"}
                  </DropdownMenuItem>
                )}
                {isPrivileged&&(
                  <DropdownMenuItem onClick={()=>setHandQueueOpen(v=>!v)} style={{margin:"0 4px",borderRadius:8}}>
                    <Bell style={{width:16,height:16,marginRight:8}}/> Hand Queue
                  </DropdownMenuItem>
                )}
                {isPrivileged&&(
                  <DropdownMenuItem onClick={()=>setAttendanceOpen(v=>!v)} style={{margin:"0 4px",borderRadius:8}}>
                    <UserCheck style={{width:16,height:16,marginRight:8}}/> Live Attendance
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={()=>setAudioOnlyActive(v=>!v)} style={{margin:"0 4px",borderRadius:8}}>
                  <Zap style={{width:16,height:16,marginRight:8}}/> {audioOnlyActive?"Exit Audio-Only Mode":"Audio-Only Mode"}
                </DropdownMenuItem>
                {onMinimize&&(
                  <DropdownMenuItem onClick={onMinimize} style={{margin:"0 4px",borderRadius:8}}>
                    <Minimize2 style={{width:16,height:16,marginRight:8}}/> Minimize
                  </DropdownMenuItem>
                )}
              </>
            }
          />
          {isMobile&&chatOpen&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:50}} onClick={()=>setChatOpen(false)}><div style={{position:"absolute",bottom:0,left:0,right:0,background:"#13181f",borderRadius:"22px 22px 0 0",maxHeight:"82vh",display:"flex",flexDirection:"column",animation:"slide-up .22s ease",paddingBottom:"env(safe-area-inset-bottom,0px)"}} onClick={e=>e.stopPropagation()}><div style={{display:"flex",alignItems:"center",padding:"12px 16px 0",flexShrink:0}}><div style={{flex:1,display:"flex"}}>{[["chat","💬","Chat"],["polls","📊","Polls"]].map(([k,ic,lb])=>(<button key={k} onClick={()=>setSideTab(k as any)} style={{flex:1,padding:"10px 6px",background:"none",border:"none",color:sideTab===k?"#fff":"rgba(255,255,255,.35)",fontSize:13,fontWeight:sideTab===k?700:400,borderBottom:sideTab===k?`2px solid ${TEAL}`:"2px solid transparent",cursor:"pointer"}}>{ic} {lb}</button>))}</div><button onClick={()=>setChatOpen(false)} style={{width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,.1)",border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><X style={{width:14,height:14}}/></button></div><div style={{flex:1,overflow:"hidden",minHeight:340}}>{sideTab==="chat"?<ClassChatPanel sessionId={sessionId||""} sessionStartedAt={sessionInfo?.started_at??sessionInfo?.actual_start_time}/>:<ClassPolls sessionId={sessionId||""}/>}</div></div></div>)}
          {isMobile&&partOpen&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:50}} onClick={()=>setPartOpen(false)}><div style={{position:"absolute",bottom:BAR_H,left:0,right:0,background:"#13181f",borderRadius:"22px 22px 0 0",maxHeight:"65vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}><div style={{width:40,height:4,borderRadius:2,background:"rgba(255,255,255,.18)",margin:"12px auto 6px"}}/><ClassParticipants sessionId={sessionId||""}/></div></div>)}
          {/* FIX BUG 2: LiveQuizOverlay now controlled by quizOpen state — was permanently disabled with hardcoded isOpen={false} */}
          <LiveQuizOverlay sessionId={sessionId||""} isOpen={quizOpen} onClose={()=>setQuizOpen(false)}/>
        </LiveKitRoom>
      )}
      {matPicker&&<MatPickerBridge subjectId={subject.id} onShare={async(mat:any,room:any)=>{
        // Show for the teacher immediately — they have direct storage access
        setMatOpen(mat);
        setMatMinimized(false);
        setMatPicker(false);
        // Pre-resolve the URL before broadcasting so every student receives a
        // ready https:// URL. InClassMaterialViewer skips getSignedUrl entirely
        // and mounts the PDFViewer (or other media) with zero network delay.
        let broadcastMat=mat;
        try{
          const rawUrl=mat.file_url||mat.url||"";
          if(rawUrl&&!rawUrl.startsWith("http")){
            const isSupabaseStorage=rawUrl.includes(".supabase.co/storage");
            if(isSupabaseStorage){
              const match=rawUrl.match(/\/storage\/v1\/object\/(?:public\/)?([^/?]+)\/(.+?)(\?.*)?$/);
              if(match){
                const [,bucketName,storagePath]=match;
                const {data:pub}=supabase.storage.from(bucketName).getPublicUrl(storagePath);
                if(pub?.publicUrl){
                  try{
                    const r=await fetch(pub.publicUrl,{method:"HEAD",signal:AbortSignal.timeout(4000)});
                    if(r.ok||r.status===304){broadcastMat={...mat,file_url:pub.publicUrl};}
                    else{throw new Error("not public");}
                  }catch{
                    const {data:signed}=await supabase.storage.from(bucketName).createSignedUrl(storagePath,604800);
                    if(signed?.signedUrl)broadcastMat={...mat,file_url:signed.signedUrl};
                  }
                }
              }
            }else{
              const signed=await getSignedUrl(rawUrl);
              if(signed)broadcastMat={...mat,file_url:signed};
            }
          }
        }catch{}
        try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"mat_open",material:broadcastMat})),{reliable:true});}catch{}
      }} onClose={()=>setMatPicker(false)}/>}
      {showEnd&&createPortal(
        <div style={{position:"fixed",inset:0,zIndex:9500,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.6)",backdropFilter:"blur(8px)"}} onClick={()=>setShowEnd(false)}>
          <div style={{background:"#2D2E30",borderRadius:20,padding:"32px 28px 24px",width:"100%",maxWidth:380,margin:"0 16px",boxShadow:"0 24px 64px rgba(0,0,0,.7)",border:"1px solid rgba(255,255,255,.08)",animation:"fade-in .18s ease"}} onClick={e=>e.stopPropagation()}>
            <div style={{width:56,height:56,borderRadius:"50%",background:"rgba(234,67,53,.12)",border:"1px solid rgba(234,67,53,.2)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px"}}>
              <Phone style={{width:22,height:22,color:"#ea4335",transform:"rotate(135deg)"}}/>
            </div>
            <h2 style={{textAlign:"center",fontSize:18,fontWeight:500,color:"#e8eaed",marginBottom:8,fontFamily:"'Google Sans Display',sans-serif"}}>{t("End class for everyone?","إنهاء الحصة للجميع؟")}</h2>
            <p style={{textAlign:"center",fontSize:14,color:"rgba(255,255,255,.45)",marginBottom:28,lineHeight:1.6,fontFamily:"'Google Sans',sans-serif"}}>{t("This will disconnect all participants.","سيتم قطع الاتصال عن جميع المشاركين.")}</p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={endSession} style={{width:"100%",padding:"13px",borderRadius:24,border:"none",background:"#ea4335",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'Google Sans',sans-serif",boxShadow:"0 2px 12px rgba(234,67,53,.4)"}}>{t("End for all","إنهاء للجميع")}</button>
              <button onClick={()=>{setShowEnd(false);leaveSession();}} style={{width:"100%",padding:"12px",borderRadius:24,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.06)",color:"rgba(255,255,255,.8)",fontSize:14,fontWeight:400,cursor:"pointer",fontFamily:"'Google Sans',sans-serif"}}>{t("Leave but keep open","غادر لكن أبقِ الحصة")}</button>
              <button onClick={()=>setShowEnd(false)} style={{width:"100%",padding:"12px",borderRadius:24,border:"none",background:"transparent",color:"rgba(255,255,255,.4)",fontSize:14,cursor:"pointer",fontFamily:"'Google Sans',sans-serif"}}>{t("Cancel","إلغاء")}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {showLeaveConfirm&&createPortal(
        <div style={{position:"fixed",inset:0,zIndex:9500,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.6)",backdropFilter:"blur(8px)"}} onClick={()=>setShowLeaveConfirm(false)}>
          <div style={{background:"#2D2E30",borderRadius:20,padding:"32px 28px 24px",width:"100%",maxWidth:380,margin:"0 16px",boxShadow:"0 24px 64px rgba(0,0,0,.7)",border:"1px solid rgba(255,255,255,.08)",animation:"fade-in .18s ease"}} onClick={e=>e.stopPropagation()}>
            <div style={{width:56,height:56,borderRadius:"50%",background:"rgba(234,67,53,.12)",border:"1px solid rgba(234,67,53,.2)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px"}}>
              <Phone style={{width:22,height:22,color:"#ea4335",transform:"rotate(135deg)"}}/>
            </div>
            <h2 style={{textAlign:"center",fontSize:18,fontWeight:500,color:"#e8eaed",marginBottom:8,fontFamily:"'Google Sans Display',sans-serif"}}>{t("Leave the class?","مغادرة الحصة؟")}</h2>
            <p style={{textAlign:"center",fontSize:14,color:"rgba(255,255,255,.45)",marginBottom:28,lineHeight:1.6,fontFamily:"'Google Sans',sans-serif"}}>{t("You can rejoin later while the class is still live.","يمكنك الانضمام مرة أخرى لاحقًا ما دامت الحصة مباشرة.")}</p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={()=>{setShowLeaveConfirm(false);leaveSession();}} style={{width:"100%",padding:"13px",borderRadius:24,border:"none",background:"#ea4335",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'Google Sans',sans-serif",boxShadow:"0 2px 12px rgba(234,67,53,.4)"}}>{t("Leave class","مغادرة الحصة")}</button>
              <button onClick={()=>setShowLeaveConfirm(false)} style={{width:"100%",padding:"12px",borderRadius:24,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.06)",color:"rgba(255,255,255,.8)",fontSize:14,fontWeight:400,cursor:"pointer",fontFamily:"'Google Sans',sans-serif"}}>{t("Cancel","إلغاء")}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const MatPickerBridge=({subjectId,onShare,onClose}:any)=>{const room=useRoomContext();return<MaterialPicker subjectId={subjectId} onShare={(mat:any)=>onShare(mat,room)} onClose={onClose}/>;};
// MatViewerBridge (legacy — kept for backwards compat, now delegates to InClassMaterialViewer)
const MatViewerBridge=({material,isTeacher,onClose}:any)=>{const room=useRoomContext();return<InClassMaterialViewer material={material} isTeacher={isTeacher} onClose={()=>onClose(room)}/>;};
// MatViewerInlineBridge — renders INSIDE LiveKitRoom (has room context) so mat_close can be broadcast
const MatViewerInlineBridge=({material,isPrivileged,onClose,onMinimize}:any)=>{
  const room=useRoomContext();
  return<InClassMaterialViewer material={material} isTeacher={isPrivileged} onMinimize={onMinimize} onClose={()=>{
    onClose();
    if(isPrivileged){try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"mat_close"})),{reliable:true});}catch{}}
  }}/>;
};

export default ClassroomView;

