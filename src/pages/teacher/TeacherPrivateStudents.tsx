import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Search, UserCheck } from "lucide-react";

const TeacherPrivateStudents = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase.from("profiles").select("*").eq("assigned_teacher_id", user.id).eq("student_type", "private");
      setStudents(data || []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const filtered = students.filter(s => {
    if (search && !s.full_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold">{t("Private Students", "الطلاب الخاصون")}</h1>
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder={t("Search...", "ابحث...")} value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(s => (
          <Card key={s.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-secondary/20 flex items-center justify-center">
                  <UserCheck className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{s.full_name || "---"}</p>
                  <p className="text-xs text-muted-foreground">{s.level || "---"}</p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                {s.phone && <p>📱 {s.phone}</p>}
                {s.whatsapp && <p>💬 {s.whatsapp}</p>}
                {s.private_session_rate && <p>💰 {s.private_session_rate}</p>}
              </div>
              <Badge variant="secondary">{t("Private", "خاص")}</Badge>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground col-span-full text-center py-8">{t("No private students", "لا يوجد طلاب خاصون")}</p>}
      </div>
    </div>
  );
};

export default TeacherPrivateStudents;
