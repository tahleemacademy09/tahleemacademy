import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BookOpen, Video, VideoOff, Mic, MicOff, FileText, 
  ClipboardList, Megaphone, Calendar, ArrowLeft, 
  Monitor, Users, Clock, X
} from "lucide-react";
import ClassroomView from "@/components/classroom/ClassroomView";
import SubjectRecordings from "@/components/classroom/SubjectRecordings";
import SubjectMaterials from "@/components/classroom/SubjectMaterials";
import SubjectSyllabus from "@/components/classroom/SubjectSyllabus";
import SubjectAssignments from "@/components/classroom/SubjectAssignments";
import SubjectAnnouncements from "@/components/classroom/SubjectAnnouncements";

const LiveClasses = () => {
  const { t, isRTL } = useLanguage();
  const { user, hasRole } = useAuth();
  const [searchParams] = useSearchParams();
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [inClass, setInClass] = useState(false);
  const [minimized, setMinimized] = useState(false); // PiP minimize state
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  const { data: subjects, isLoading } = useQuery({
    queryKey: ["active-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").order("title");
      if (error) throw error;
      return data;
    },
  });

  const { data: liveSessions } = useQuery({
    queryKey: ["live-sessions"],
    queryFn: async () => {
      const { data } = await supabase.from("live_sessions").select("*").eq("status", "live");
      return data || [];
    },
    refetchInterval: 5000,
  });
  // Auto-select subject from timetable URL param (?subject=id)
  useEffect(() => {
    const subjectId = searchParams.get("subject");
    if (subjectId && subjects?.length) {
      const found = subjects.find((s: any) => s.id === subjectId);
      if (found) {
        setSelectedSubject(found);
        setInClass(true); // go straight to classroom
      }
    }
  }, [searchParams, subjects]);

  // Resume class if user returns from minimized/background state
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && minimized && inClass && selectedSubject) {
        setMinimized(false); // restore full view
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [minimized, inClass, selectedSubject]);

  // Camera preview setup
  useEffect(() => {
    if (selectedSubject && !inClass && cameraOn) {
      startCamera();
    } else if (!cameraOn && stream) {
      stopCamera();
    }
    return () => {
      if (stream) stopCamera();
    };
  }, [selectedSubject, inClass, cameraOn]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        }, 
        audio: micOn 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const toggleCamera = () => {
    setCameraOn(!cameraOn);
  };

  const toggleMic = () => {
    setMicOn(!micOn);
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {        audioTrack.enabled = !micOn;
      }
    }
  };

  const isSubjectLive = (subjectId: string) => liveSessions?.some((s) => s.subject_id === subjectId);

  const handleJoinClass = () => {
    // Go directly to classroom — no waiting room
    setInClass(true);
  };

  const handleLeaveClass = () => {
    setInClass(false);
    setMinimized(false);
    stopCamera();
  };

  const handleBackToSubjects = () => {
    setSelectedSubject(null);
    setInClass(false);
    setMinimized(false);
    stopCamera();
  };

  // Classroom View — full screen with minimize option
  if (inClass && selectedSubject) {
    if (minimized) {
      // Google Meet-style PiP strip at bottom
      return (
        <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999, display: "flex", alignItems: "center", gap: 10, background: "rgba(6,78,59,.96)", backdropFilter: "blur(12px)", borderRadius: 50, padding: "8px 16px 8px 10px", boxShadow: "0 8px 32px rgba(0,0,0,.5)", border: "1.5px solid rgba(255,255,255,.15)" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(34,197,94,.2)", border: "2px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", animation: "pulse 1.5s ease infinite" }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{selectedSubject.title}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.6)" }}>● Live class in progress</div>
          </div>
          <button onClick={() => setMinimized(false)} style={{ padding: "6px 14px", borderRadius: 20, border: "none", background: "#22c55e", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            Return
          </button>
          <button onClick={handleLeaveClass} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "rgba(239,68,68,.8)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
        </div>
      );
    }
    return (
      <ClassroomView
        subject={selectedSubject}
        onLeave={handleLeaveClass}
        onMinimize={() => setMinimized(true)}
      />
    );
  }

  // Subject Detail View — go directly to class when Join is clicked
  if (selectedSubject) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            onClick={handleBackToSubjects}
            className="gap-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("Back", "رجوع")}
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-emerald-950 dark:text-emerald-50">
              {selectedSubject.title}
            </h1>
            {selectedSubject.title_ar && (              <p className="text-sm text-emerald-700 dark:text-emerald-300 font-arabic" dir="rtl">
                {selectedSubject.title_ar}
              </p>
            )}
          </div>
          {isSubjectLive(selectedSubject.id) && (
            <Badge className="bg-red-500 text-white animate-pulse">
              <span className="w-2 h-2 bg-white rounded-full me-1 animate-pulse" />
              LIVE
            </Badge>
          )}
        </div>

        {/* Quick Actions */}
        <div className="flex gap-3 flex-wrap">
          <Button 
            onClick={handleJoinClass} 
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            size="lg"
          >
            <Video className="h-5 w-5" />
            {isPrivileged ? t("Start Class", "بدء الفصل") : t("Join Class", "انضمام للفصل")}
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="recordings" className="w-full">
          <TabsList className="grid grid-cols-3 md:grid-cols-5 gap-2 bg-emerald-100 dark:bg-emerald-900/30 p-1">
            <TabsTrigger 
              value="recordings" 
              className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-emerald-800"
            >
              <Video className="h-4 w-4" />
              <span className="hidden sm:inline">{t("Recordings", "التسجيلات")}</span>
            </TabsTrigger>
            <TabsTrigger 
              value="syllabus"
              className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-emerald-800"
            >
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">{t("Syllabus", "المنهج")}</span>
            </TabsTrigger>
            <TabsTrigger 
              value="materials"
              className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-emerald-800"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">{t("Materials", "المواد")}</span>
            </TabsTrigger>
            <TabsTrigger               value="assignments"
              className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-emerald-800"
            >
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">{t("Assignments", "الواجبات")}</span>
            </TabsTrigger>
            <TabsTrigger 
              value="announcements"
              className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-emerald-800"
            >
              <Megaphone className="h-4 w-4" />
              <span className="hidden sm:inline">{t("Announcements", "الإعلانات")}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="recordings" className="mt-4">
            <SubjectRecordings subjectId={selectedSubject.id} />
          </TabsContent>
          <TabsContent value="syllabus" className="mt-4">
            <SubjectSyllabus subjectId={selectedSubject.id} />
          </TabsContent>
          <TabsContent value="materials" className="mt-4">
            <SubjectMaterials subjectId={selectedSubject.id} />
          </TabsContent>
          <TabsContent value="assignments" className="mt-4">
            <SubjectAssignments subjectId={selectedSubject.id} />
          </TabsContent>
          <TabsContent value="announcements" className="mt-4">
            <SubjectAnnouncements subjectId={selectedSubject.id} />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // Subjects List View
  return (
    <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 min-h-screen">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-emerald-600 flex items-center justify-center">
            <BookOpen className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-emerald-950 dark:text-emerald-50">
              {t("Live Classes", "الفصول الحية")}
            </h1>
            <p className="text-emerald-700 dark:text-emerald-300">
              {t("Join live sessions and access course materials", "انضم للجلسات الحية واستعرض مواد الدورة")}
            </p>          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white/80 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-800 flex items-center justify-center">
              <Video className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-950 dark:text-emerald-50">
                {liveSessions?.length || 0}
              </p>
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                {t("Live Now", "مباشر الآن")}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/80 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-950 dark:text-emerald-50">
                {subjects?.length || 0}
              </p>
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                {t("Total Subjects", "إجمالي المواد")}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/80 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-950 dark:text-emerald-50">
                {user?.user_metadata?.student_count || 0}
              </p>
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                {t("Students", "الطلاب")}
              </p>
            </div>
          </CardContent>        </Card>
      </div>

      {/* Subjects Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-48 animate-pulse bg-emerald-100 dark:bg-emerald-900/30" />
          ))}
        </div>
      ) : !subjects?.length ? (
        <Card className="bg-white/80 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800">
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-emerald-700 dark:text-emerald-300">
              {t("No subjects available yet", "لا توجد مواد متاحة بعد")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((subject) => (
            <Card 
              key={subject.id} 
              className="group cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-white dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 dark:hover:border-emerald-600"
              onClick={() => setSelectedSubject(subject)}
            >
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <BookOpen className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-emerald-950 dark:text-emerald-50">
                        {subject.title}
                      </h3>
                      {subject.title_ar && (
                        <p className="text-sm text-emerald-700 dark:text-emerald-300 font-arabic" dir="rtl">
                          {subject.title_ar}
                        </p>
                      )}
                    </div>
                  </div>
                  {isSubjectLive(subject.id) && (
                    <Badge className="bg-red-500 text-white animate-pulse">
                      <span className="w-1.5 h-1.5 bg-white rounded-full me-1 animate-pulse" />
                      LIVE
                    </Badge>
                  )}                </div>
                
                <p className="text-sm text-emerald-700 dark:text-emerald-300 line-clamp-2">
                  {subject.description || t("No description", "لا يوجد وصف")}
                </p>

                <div className="flex items-center gap-4 text-xs text-emerald-600 dark:text-emerald-400">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{subject.duration || t("TBD", "يحدد لاحقاً")}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span>{subject.students_count || 0} {t("students", "طلاب")}</span>
                  </div>
                </div>

                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full gap-2 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-800"
                >
                  <Video className="h-4 w-4" />
                  {t("View Subject", "عرض المادة")}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default LiveClasses;