import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Video, FileText, ClipboardList, Megaphone, Calendar, Users } from "lucide-react";
import ClassroomView from "@/components/classroom/ClassroomView";
import SubjectRecordings from "@/components/classroom/SubjectRecordings";
import SubjectMaterials from "@/components/classroom/SubjectMaterials";
import SubjectSyllabus from "@/components/classroom/SubjectSyllabus";
import SubjectAssignments from "@/components/classroom/SubjectAssignments";
import SubjectAnnouncements from "@/components/classroom/SubjectAnnouncements";

const LiveClasses = () => {
  const { t } = useLanguage();
  const { user, hasRole } = useAuth();
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [inClass, setInClass] = useState(false);
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

  const isSubjectLive = (subjectId: string) => liveSessions?.some((s) => s.subject_id === subjectId);

  if (inClass && selectedSubject) {
    return <ClassroomView subject={selectedSubject} onLeave={() => setInClass(false)} />;
  }

  if (selectedSubject) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => setSelectedSubject(null)}>← {t("Back", "رجوع")}</Button>
          <div>
            <h1 className="text-xl font-bold">{selectedSubject.title}</h1>
            {selectedSubject.title_ar && <p className="text-sm text-muted-foreground font-arabic" dir="rtl">{selectedSubject.title_ar}</p>}
          </div>
          {isSubjectLive(selectedSubject.id) && <Badge className="bg-red-500 text-white animate-pulse">● LIVE</Badge>}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setInClass(true)} className="gap-2">
            <Video className="h-4 w-4" />
            {isPrivileged ? t("Start Class", "بدء الفصل") : t("Join Class", "انضمام للفصل")}
          </Button>
        </div>

        <Tabs defaultValue="recordings" className="w-full">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="recordings" className="gap-1"><Video className="h-3 w-3" />{t("Recordings", "التسجيلات")}</TabsTrigger>
            <TabsTrigger value="syllabus" className="gap-1"><Calendar className="h-3 w-3" />{t("Syllabus", "المنهج")}</TabsTrigger>
            <TabsTrigger value="materials" className="gap-1"><FileText className="h-3 w-3" />{t("Materials", "المواد")}</TabsTrigger>
            <TabsTrigger value="assignments" className="gap-1"><ClipboardList className="h-3 w-3" />{t("Assignments", "الواجبات")}</TabsTrigger>
            <TabsTrigger value="announcements" className="gap-1"><Megaphone className="h-3 w-3" />{t("Announcements", "الإعلانات")}</TabsTrigger>
          </TabsList>
          <TabsContent value="recordings"><SubjectRecordings subjectId={selectedSubject.id} /></TabsContent>
          <TabsContent value="syllabus"><SubjectSyllabus subjectId={selectedSubject.id} /></TabsContent>
          <TabsContent value="materials"><SubjectMaterials subjectId={selectedSubject.id} /></TabsContent>
          <TabsContent value="assignments"><SubjectAssignments subjectId={selectedSubject.id} /></TabsContent>
          <TabsContent value="announcements"><SubjectAnnouncements subjectId={selectedSubject.id} /></TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("Live Classes", "الفصول الحية")}</h1>
        <p className="text-sm text-muted-foreground">{t("Join live sessions and access course materials", "انضم للجلسات الحية واستعرض مواد الدورة")}</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-44 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : !subjects?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">{t("No subjects available yet", "لا توجد مواد متاحة بعد")}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((s) => (
            <Card key={s.id} className="card-premium cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setSelectedSubject(s)}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{s.title}</CardTitle>
                  </div>
                  {isSubjectLive(s.id) && <Badge className="bg-red-500 text-white animate-pulse text-xs">● LIVE</Badge>}
                </div>
              </CardHeader>
              <CardContent>
                {s.title_ar && <p className="text-xs text-muted-foreground font-arabic mb-2" dir="rtl">{s.title_ar}</p>}
                <p className="text-sm text-muted-foreground line-clamp-2">{s.description || t("No description", "لا يوجد وصف")}</p>
                <Button variant="outline" size="sm" className="mt-3 w-full gap-2">
                  <Video className="h-3 w-3" />
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
