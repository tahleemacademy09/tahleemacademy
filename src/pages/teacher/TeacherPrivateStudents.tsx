import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-24">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-40 border-b border-white/10 shadow-lg backdrop-blur-md" style={{ background: "linear-gradient(135deg, #064E3B 0%, #083320 100%)" }}>
        <div className="mx-auto max-w-5xl px-3 py-3 sm:px-6 sm:py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 sm:h-11 sm:w-11">
              <UserCheck className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="m-0 truncate text-lg font-black tracking-tight text-white sm:text-xl">{t("Private Students", "الطلاب الخاصون")}</h1>
              <p className="m-0 truncate text-[11px] font-medium text-white/70">{t("Your one-on-one students", "طلابك الخاصون")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="mx-auto max-w-5xl space-y-5 px-3 pt-6 sm:px-6 sm:pt-8">
        <div className="relative max-w-md">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder={t("Search...", "ابحث...")} value={search} onChange={e => setSearch(e.target.value)} className="h-11 rounded-lg border-slate-200 bg-white ps-9 shadow-sm" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(s => (
            <Card key={s.id} className="overflow-hidden rounded-2xl border-slate-200 shadow-sm transition-shadow hover:shadow-md">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(201,168,76,0.15)" }}>
                    <UserCheck className="h-5 w-5" style={{ color: "#c9a84c" }} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">{s.full_name || "---"}</p>
                    <p className="text-xs text-slate-500">{s.level || "---"}</p>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-slate-500">
                  {s.phone && <p>📱 {s.phone}</p>}
                  {s.whatsapp && <p>💬 {s.whatsapp}</p>}
                  {s.private_session_rate && <p>💰 {s.private_session_rate}</p>}
                </div>
                <Badge variant="secondary" className="rounded-full">{t("Private", "خاص")}</Badge>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center shadow-sm">
              <UserCheck className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm text-slate-400">{t("No private students", "لا يوجد طلاب خاصون")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherPrivateStudents;
