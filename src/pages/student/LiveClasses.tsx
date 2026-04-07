import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Monitor, Users, Clock, CheckCircle2
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
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [inClass, setInClass] = useState(false);
  const [inWaitingRoom, setInWaitingRoom] = useState(false);
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
  // Camera preview setup
  useEffect(() => {
    if (inWaitingRoom && cameraOn) {
      startCamera();
    } else if (!cameraOn && stream) {
      stopCamera();
    }
    return () => {
      if (stream) {
        stopCamera();
      }
    };
  }, [inWaitingRoom, cameraOn]);

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
    setInWaitingRoom(true);
    setInClass(false);
  };

  const handleEnterClassroom = () => {
    setInWaitingRoom(false);
    setInClass(true);
  };

  const handleLeaveClass = () => {
    setInClass(false);
    setInWaitingRoom(false);
    stopCamera();
  };

  const handleBackToSubjects = () => {
    setSelectedSubject(null);
    setInWaitingRoom(false);
    stopCamera();
  };

  // Waiting Room View
  if (inWaitingRoom && selectedSubject) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-950 flex flex-col">
        {/* Header with Bismillah */}
        <div className="bg-emerald-950/50 border-b border-emerald-800/50 px-4 py-3">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleBackToSubjects}
              className="text-emerald-100 hover:bg-emerald-800/50 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 me-2" />
              {t("Back to subjects", "العودة للمواد")}
            </Button>
            <div className="text-center">
              <p className="text-emerald-400 font-arabic text-lg" dir="rtl">
                بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
              </p>
            </div>            <div className="w-20" />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8">
          <div className="w-full max-w-3xl space-y-6">
            {/* Subject Title */}
            <div className="text-center space-y-2">
              <h1 className="text-3xl md:text-4xl font-bold text-white">
                {selectedSubject.title}
              </h1>
              {selectedSubject.title_ar && (
                <p className="text-emerald-300 font-arabic text-xl" dir="rtl">
                  {selectedSubject.title_ar}
                </p>
              )}
              {isSubjectLive(selectedSubject.id) && (
                <Badge className="bg-red-500 text-white animate-pulse mt-2">
                  <span className="w-2 h-2 bg-white rounded-full me-1 animate-pulse" />
                  LIVE
                </Badge>
              )}
            </div>

            {/* Camera Preview Card */}
            <Card className="overflow-hidden border-emerald-700/50 bg-emerald-950/30 backdrop-blur-sm">
              <CardContent className="p-0">
                <div className="relative aspect-video bg-emerald-950">
                  {cameraOn ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-emerald-900/50">
                      <div className="text-center">
                        <VideoOff className="h-16 w-16 text-emerald-600 mx-auto mb-3" />
                        <p className="text-emerald-400">{t("Camera is off", "الكاميرا متوقفة")}</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Overlay gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/60 via-transparent to-transparent pointer-events-none" />
                  
                  {/* User name tag */}                  <div className="absolute bottom-4 start-4 bg-emerald-950/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-emerald-700/50">
                    <p className="text-white text-sm font-medium">
                      {user?.user_metadata?.full_name || user?.email?.split('@')[0] || t("You", "أنت")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              <Button
                size="lg"
                variant={micOn ? "default" : "destructive"}
                className={`h-14 w-14 rounded-full ${micOn ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
                onClick={toggleMic}
              >
                {micOn ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
              </Button>
              
              <Button
                size="lg"
                variant={cameraOn ? "default" : "destructive"}
                className={`h-14 w-14 rounded-full ${cameraOn ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
                onClick={toggleCamera}
              >
                {cameraOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
              </Button>
            </div>

            {/* Status */}
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">{t("Ready to join!", "جاهز للانضمام!")}</span>
              </div>
              <p className="text-emerald-600/80 text-sm">
                3 {t("camera(s)", "كاميرا")} | 4 {t("mic(s)", "ميكروفون")}
              </p>
            </div>

            {/* Waiting Message */}
            <Card className="border-emerald-700/30 bg-emerald-950/40 backdrop-blur-sm">
              <CardContent className="py-6 text-center space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>                </div>
                <p className="text-emerald-100 text-lg font-medium">
                  {t("Waiting for your teacher to start the class...", "في انتظار المعلم ليبدأ الدرس...")}
                </p>
                <p className="text-emerald-400/80 font-arabic" dir="rtl">
                  في انتظار المعلم ليبدأ الدرس
                </p>
              </CardContent>
            </Card>

            {/* Join Button */}
            {isSubjectLive(selectedSubject.id) && (
              <Button
                size="lg"
                onClick={handleEnterClassroom}
                className="w-full h-12 text-lg bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Monitor className="h-5 w-5 me-2" />
                {t("Enter Classroom", "دخول الفصل")}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Classroom View
  if (inClass && selectedSubject) {
    return <ClassroomView subject={selectedSubject} onLeave={handleLeaveClass} />;
  }

  // Subject Detail View
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