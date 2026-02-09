import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Search, User } from "lucide-react";

const StudentManagement = () => {
  const { t } = useLanguage();
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("profiles").select("*, user_roles(role)");
      setStudents(data || []);
    };
    fetch();
  }, []);

  const filtered = students.filter((s) =>
    s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.phone?.includes(search)
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">{t("Students", "الطلاب")}</h1>

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder={t("Search students...", "البحث عن الطلاب...")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {filtered.map((student) => (
          <Card key={student.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">{student.full_name || t("Unnamed", "بدون اسم")}</div>
                  <div className="text-xs text-muted-foreground">{student.phone || t("No phone", "بدون هاتف")}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {student.user_roles?.map((r: any) => (
                  <Badge key={r.role} variant={r.role === "admin" ? "destructive" : r.role === "teacher" ? "default" : "secondary"}>
                    {r.role}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8">{t("No students found", "لم يتم العثور على طلاب")}</p>
        )}
      </div>
    </div>
  );
};

export default StudentManagement;
