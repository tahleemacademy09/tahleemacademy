import { useState, useEffect } from "react";
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
  BookOpen, Video, FileText,
  ClipboardList, Megaphone, Calendar, ArrowLeft,
  Users, Clock, X
} from "lucide-react";
import ClassroomView from "@/components/classroom/ClassroomView";
import SubjectRecordings from "@/components/classroom/SubjectRecordings";
import SubjectMaterials from "@/components/classroom/SubjectMaterials";
import SubjectSyllabus from "@/components/classroom/SubjectSyllabus";
import SubjectAssignments from "@/components/classroom/SubjectAssignments";
import SubjectAnnouncements from "@/components/classroom/SubjectAnnouncements";

const LiveClasses = () => {
  const { t } = useLanguage();
  const { hasRole } = useAuth();
  const [searchParams] = useSearchParams();
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [inClass, setInClass] = useState(false);
  const [minimized, setMinimized] = useState(false);
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
        setInClass(true);
      }
    }
  }, [searchParams, subjects]);

  // Restore from minimized when page becomes visible
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && minimized && inClass && selectedSubject) {
        setMinimized(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [minimized, inClass, selectedSubject]);

  const isSubjectLive = (subjectId: string) =>
    liveSessions?.some((s: any) => s.subject_id === subjectId);

  const handleJoinClass = () => setInClass(true);

  const handleLeaveClass = () => {
    setInClass(false);
    setMinimized(false);
  };

  const handleBackToSubjects = () => {
    setSelectedSubject(null);
    setInClass(false);
    setMinimized(false);
  };

  // ── CLASSROOM VIEW ──────────────────────────────────
  if (inClass && selectedSubject) {
    if (minimized) {
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

  // ── SUBJECT DETAIL VIEW ─────────────────────────────
  if (selectedSubject) {
    return (
      <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 min-h-screen">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToSubjects}
            className="text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
          >
            <ArrowLeft className="h-4 w-4 me-2" />
            {t("Back", "رجوع")}
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-emerald-950 dark:text-emerald-50 truncate">
              {selectedSubject.title}
            </h2>
            {selectedSubject.title_ar && (
              <p className="text-sm text-emerald-700 dark:text-emerald-300 font-arabic" dir="rtl">
                {selectedSubject.title_ar}
              </p>
            )}
          </div>
          {isSubjectLive(selectedSubject.id) && (
            <Badge className="bg-red-500 text-white animate-pulse">
              <span className="w-1.5 h-1.5 bg-white rounded-full me-1 animate-pulse" />
              LIVE
            </Badge>
          )}
        </div>

        {/* Join button */}
        <Button
          size="lg"
          onClick={handleJoinClass}
          className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800 text-white h-14 text-base font-bold"
        >
          <Video className="h-5 w-5" />
          {isSubjectLive(selectedSubject.id)
            ? t("Join Live Class", "انضم للحصة المباشرة")
            : isPrivileged
              ? t("Start Class", "بدء الفصل")
              : t("Enter Classroom", "ادخل الفصل")}
        </Button>

        {/* Tabs */}
        <Tabs defaultValue="recordings" className="w-full">
          <TabsList className="grid w-full grid-cols-5 bg-white/80 dark:bg-emerald-900/30">
            {[
              { val: "recordings",    Icon: Video,         en: "Recordings",    ar: "التسجيلات" },
              { val: "syllabus",      Icon: Calendar,      en: "Syllabus",      ar: "المنهج" },
              { val: "materials",     Icon: FileText,      en: "Materials",     ar: "المواد" },
              { val: "assignments",   Icon: ClipboardList, en: "Assignments",   ar: "الواجبات" },
              { val: "announcements", Icon: Megaphone,     en: "Announcements", ar: "الإعلانات" },
            ].map(({ val, Icon, en, ar }) => (
              <TabsTrigger key={val} value={val}
                className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-emerald-800">
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{t(en, ar)}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="recordings"    className="mt-4"><SubjectRecordings    subjectId={selectedSubject.id} /></TabsContent>
          <TabsContent value="syllabus"      className="mt-4"><SubjectSyllabus      subjectId={selectedSubject.id} /></TabsContent>
          <TabsContent value="materials"     className="mt-4"><SubjectMaterials     subjectId={selectedSubject.id} /></TabsContent>
          <TabsContent value="assignments"   className="mt-4"><SubjectAssignments   subjectId={selectedSubject.id} /></TabsContent>
          <TabsContent value="announcements" className="mt-4"><SubjectAnnouncements subjectId={selectedSubject.id} /></TabsContent>
        </Tabs>
      </div>
    );
  }

  // ── SUBJECTS LIST VIEW ──────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 min-h-screen">
      {/* Header */}
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
          </p>
        </div>
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
          {subjects.map((subject: any) => (
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
                  )}
                </div>

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
                  {isSubjectLive(subject.id) ? t("Join Live", "انضم الآن") : t("View Subject", "عرض المادة")}
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
