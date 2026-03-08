import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { FileText, Users, Settings, Plus, Trash2, Download, Eye, BookOpen, RotateCcw, UserCog } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const ENTRANCE_EXAM_ID = "36ef6492-2515-44ea-b086-67c9cee02475";

const EntranceExamAdmin = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [levelCourses, setLevelCourses] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState("beginner");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [showLevelDialog, setShowLevelDialog] = useState(false);
  const [targetStudent, setTargetStudent] = useState<any>(null);
  const [newLevel, setNewLevel] = useState("beginner");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [qRes, subRes, lcRes, attRes] = await Promise.all([
      supabase.from("exam_questions").select("*").eq("exam_id", ENTRANCE_EXAM_ID).order("sort_order"),
      supabase.from("subjects").select("*").eq("is_active", true).order("title"),
      supabase.from("level_courses" as any).select("*, subjects(title, title_ar)"),
      supabase
        .from("exam_attempts")
        .select("*, profiles!inner(full_name, full_name_ar, avatar_url, level)")
        .eq("exam_id", ENTRANCE_EXAM_ID)
        .neq("status", "in_progress")
        .order("submitted_at", { ascending: false }),
    ]);

    setQuestions(qRes.data || []);
    setSubjects(subRes.data || []);
    setLevelCourses((lcRes.data as any[]) || []);
    setResults((attRes.data as any[]) || []);
    setLoading(false);
  };

  const addSubjectToLevel = async () => {
    if (!selectedSubject) return;
    const { error } = await supabase
      .from("level_courses" as any)
      .insert({ level: selectedLevel, subject_id: selectedSubject } as any);

    if (error) {
      if (error.code === "23505") {
        toast({ title: "Already mapped", variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
      return;
    }
    toast({ title: "Subject added to level" });
    loadData();
  };

  const removeLevelCourse = async (id: string) => {
    await supabase.from("level_courses" as any).delete().eq("id", id);
    toast({ title: "Removed" });
    loadData();
  };

  const exportCSV = () => {
    const header = "Name,Score,Total,Percentage,Level,Date\n";
    const rows = results.map((r: any) => {
      const profile = r.profiles;
      const pct = r.total_points ? Math.round((r.score / r.total_points) * 100) : 0;
      return `"${profile?.full_name || ""}",${r.score || 0},${r.total_points || 20},${pct}%,${profile?.level || ""},${r.submitted_at || ""}`;
    }).join("\n");

    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "entrance-exam-results.csv";
    a.click();
  };

  const getLevelBadge = (pct: number) => {
    if (pct >= 70) return <Badge className="bg-red-500/15 text-red-600 border-red-300">Advanced / متقدم</Badge>;
    if (pct >= 40) return <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-300">Intermediate / متوسط</Badge>;
    return <Badge className="bg-green-500/15 text-green-600 border-green-300">Beginner / مبتدئ</Badge>;
  };

  const levels = ["beginner", "intermediate", "advanced"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Entrance Exam Management</h1>
          <p className="text-sm text-muted-foreground">Manage questions, level mappings, and view results</p>
        </div>
      </div>

      <Tabs defaultValue="questions">
        <TabsList>
          <TabsTrigger value="questions" className="gap-2">
            <FileText className="h-4 w-4" /> Questions ({questions.length})
          </TabsTrigger>
          <TabsTrigger value="mapping" className="gap-2">
            <Settings className="h-4 w-4" /> Level Mapping
          </TabsTrigger>
          <TabsTrigger value="results" className="gap-2">
            <Users className="h-4 w-4" /> Results ({results.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1 — Questions */}
        <TabsContent value="questions" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              These questions are used for the entrance placement exam.
            </p>
            <Button onClick={() => navigate(`/admin/exams/${ENTRANCE_EXAM_ID}/edit`)} size="sm">
              <BookOpen className="h-4 w-4 mr-2" /> Edit in Question Builder
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Question</TableHead>
                    <TableHead className="w-24">Type</TableHead>
                    <TableHead className="w-24">Difficulty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {questions.map((q, idx) => (
                    <TableRow key={q.id}>
                      <TableCell className="font-mono text-xs">{idx + 1}</TableCell>
                      <TableCell>
                        <div className="text-sm">{q.question_text}</div>
                        {q.question_text_ar && (
                          <div className="text-xs text-muted-foreground" dir="rtl">{q.question_text_ar}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {q.question_type === "true_false" ? "T/F" : "MCQ"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{q.difficulty}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2 — Level Course Mapping */}
        <TabsContent value="mapping" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure which subjects students are auto-enrolled in based on their exam level.
          </p>

          {levels.map((level) => {
            const coursesForLevel = levelCourses.filter((lc: any) => lc.level === level);
            return (
              <Card key={level}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base capitalize flex items-center gap-2">
                    {level === "beginner" && "🟢"}
                    {level === "intermediate" && "🟡"}
                    {level === "advanced" && "🔴"}
                    {level.charAt(0).toUpperCase() + level.slice(1)} Level
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {coursesForLevel.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No subjects mapped yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {coursesForLevel.map((lc: any) => (
                        <div key={lc.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <span className="text-sm">
                            {lc.subjects?.title || "Unknown Subject"}
                            {lc.subjects?.title_ar && (
                              <span className="text-muted-foreground ml-2" dir="rtl">{lc.subjects.title_ar}</span>
                            )}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLevelCourse(lc.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Select
                      value={selectedLevel === level ? selectedSubject : ""}
                      onValueChange={(v) => {
                        setSelectedLevel(level);
                        setSelectedSubject(v);
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select subject..." />
                      </SelectTrigger>
                      <SelectContent>
                        {subjects
                          .filter((s) => !coursesForLevel.some((lc: any) => lc.subject_id === s.id))
                          .map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.title} {s.title_ar ? `/ ${s.title_ar}` : ""}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() => {
                        setSelectedLevel(level);
                        addSubjectToLevel();
                      }}
                      disabled={!selectedSubject || selectedLevel !== level}
                      size="sm"
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* TAB 3 — Student Results */}
        <TabsContent value="results" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              All students who have completed the entrance exam.
            </p>
            <Button onClick={exportCSV} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead className="w-20">Score</TableHead>
                    <TableHead className="w-20">%</TableHead>
                    <TableHead className="w-32">Level</TableHead>
                    <TableHead className="w-32">Date</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No students have taken the entrance exam yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    results.map((r: any) => {
                      const profile = r.profiles;
                      const pct = r.total_points ? Math.round((r.score / r.total_points) * 100) : 0;
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {profile?.avatar_url ? (
                                <img src={profile.avatar_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                                  {(profile?.full_name || "?")[0]}
                                </div>
                              )}
                              <div>
                                <div className="text-sm font-medium">{profile?.full_name || "Unknown"}</div>
                                {profile?.full_name_ar && (
                                  <div className="text-xs text-muted-foreground" dir="rtl">{profile.full_name_ar}</div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono">{r.score || 0}/{r.total_points || 20}</TableCell>
                          <TableCell className="font-mono">{pct}%</TableCell>
                          <TableCell>{getLevelBadge(pct)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "-"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/student/results/${r.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EntranceExamAdmin;
