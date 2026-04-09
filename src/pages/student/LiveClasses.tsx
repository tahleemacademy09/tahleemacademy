/*
  src/pages/student/LiveClasses.tsx — Tahleem Academy
  ─────────────────────────────────────────────────────
  • ?subject=<id>&autoJoin=true → skips subject list, goes straight to ClassroomView
  • Minimize/PiP overlay (Google Meet-style) — class stays live while browsing
  • Students no longer blocked waiting for teacher (ClassLobby handles early join)
*/

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
  BookOpen, Video, FileText, ClipboardList, Megaphone,
  Calendar, ArrowLeft, Users, Clock, Maximize2, X,
} from "lucide-react";
import ClassroomView from "@/components/classroom/ClassroomView";
import SubjectRecordings from "@/components/classroom/SubjectRecordings";
import SubjectMaterials from "@/components/classroom/SubjectMaterials";
import SubjectSyllabus from "@/components/classroom/SubjectSyllabus";
import SubjectAssignments from "@/components/classroom/SubjectAssignments";
import SubjectAnnouncements from "@/components/classroom/SubjectAnnouncements";

const G    = "#0f2d1f";
const GOLD = "#c9a84c";

const LiveClasses = () => {
  const { t } = useLanguage();
  const { user, hasRole } = useAuth();
  const [searchParams] = useSearchParams();

  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [inClass,   setInClass]   = useState(false);
  const [minimized, setMinimized] = useState(false);

  const isPrivileged = hasRole("admin") || hasRole("teacher");

  // ── Subjects ────────────────────────────────────────
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

  // ── Auto-select from ?subject= param ────────────────
  useEffect(() => {
    const subjectId = searchParams.get("subject");
    const autoJoin  = searchParams.get("autoJoin") === "true";
    if (!subjectId || !subjects?.length) return;
    const found = subjects.find((s: any) => s.id === subjectId);
    if (found && !inClass) {
      setSelectedSubject(found);
      if (autoJoin) setInClass(true);
    }
  }, [subjects, searchParams]);

  // ── Helpers ──────────────────────────────────────────
  const isSubjectLive = (subjectId: string) =>
    liveSessions?.some((s: any) => s.subject_id === subjectId);

  const handleJoinClass  = () => { setInClass(true); setMinimized(false); };
  const handleLeaveClass = () => { setInClass(false); setMinimized(false); setSelectedSubject(null); };
  const handleBack       = () => { setSelectedSubject(null); setInClass(false); setMinimized(false); };

  // ── CLASSROOM (full or minimized via PiP) ───────────
  if (inClass && selectedSubject) {
    return (
      <>
        {/* Full-screen classroom — hidden (not unmounted) when minimized */}
        <div style={{ display: minimized ? "none" : "block" }}>
          <ClassroomView
            subject={selectedSubject}
            onLeave={handleLeaveClass}
            onMinimize={() => setMinimized(true)}
          />
        </div>

        {/* Google Meet-style PiP strip */}
        {minimized && (
          <>
            <style>{`@keyframes livePulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
            <div style={{
              position: "fixed", bottom: 20, left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(8,25,15,.97)",
              border: "1px solid rgba(201,168,76,.4)",
              borderRadius: 50,
              padding: "11px 20px",
              display: "flex", alignItems: "center", gap: 12,
              zIndex: 9999,
              boxShadow: "0 6px 32px rgba(0,0,0,.7)",
              fontFamily: "'Cairo', sans-serif",
              minWidth: 260, maxWidth: "90vw",
            }}>
              {/* Live pulse */}
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: "#ef4444", flexShrink: 0,
                animation: "livePulse 1.4s ease-in-out infinite",
              }}/>
              {/* Subject name */}
              <span style={{
                color: "#fff", fontSize: 13, fontWeight: 700,
                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {selectedSubject.title}
              </span>
              {/* Expand back */}
              <button
                onClick={() => setMinimized(false)}
                title="Return to class"
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: GOLD, border: "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", flexShrink: 0,
                }}>
                <Maximize2 style={{ width: 15, height: 15, color: G }}/>
              </button>
              {/* Leave */}
              <button
                onClick={handleLeaveClass}
                title="Leave class"
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: "rgba(239,68,68,.22)", border: "1px solid rgba(239,68,68,.5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", flexShrink: 0,
                }}>
                <X style={{ width: 15, height: 15, color: "#ef4444" }}/>
              </button>
            </div>
          </>
        )}
      </>
    );
  }

  // ── SUBJECT VIEW (tabs) ──────────────────────────────
  if (selectedSubject && !inClass) {
    return (
      <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 min-h-screen">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={handleBack}
            className="text-emerald-700 dark:text-emerald-300">
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

        {/* Join button — always shown */}
        <Button size="lg" onClick={handleJoinClass}
          className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800 text-white h-14 text-base font-bold">
          <Video className="h-5 w-5" />
          {isSubjectLive(selectedSubject.id)
            ? t("Join Live Class", "انضم للحصة المباشرة")
            : t("Enter Classroom", "ادخل الفصل")}
        </Button>

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

  // ── SUBJECTS LIST ────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 min-h-screen">
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { val: liveSessions?.length || 0, label: t("Live Now", "مباشر الآن"), Icon: Video, color: "emerald" },
          { val: subjects?.length || 0, label: t("Total Subjects", "إجمالي المواد"), Icon: BookOpen, color: "amber" },
          { val: user?.user_metadata?.student_count || 0, label: t("Students", "الطلاب"), Icon: Users, color: "blue" },
        ].map(({ val, label, Icon, color }) => (
          <Card key={label} className="bg-white/80 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg bg-${color}-100 dark:bg-${color}-900/30 flex items-center justify-center`}>
                <Icon className={`h-5 w-5 text-${color}-600 dark:text-${color}-400`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-950 dark:text-emerald-50">{val}</p>
                <p className="text-sm text-emerald-700 dark:text-emerald-300">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Subjects Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Card key={i} className="h-48 animate-pulse bg-emerald-100 dark:bg-emerald-900/30" />)}
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
            <Card key={subject.id}
              className="group cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-white dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 dark:hover:border-emerald-600"
              onClick={() => setSelectedSubject(subject)}>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <BookOpen className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-emerald-950 dark:text-emerald-50">{subject.title}</h3>
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
                <Button variant="outline" size="sm"
                  className="w-full gap-2 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-800">
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
