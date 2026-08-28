/*
  src/pages/student/GeneralMusabaqahRegister.tsx
  ─────────────────────────────────────────────────────────────
  Student-facing entry point for the General Subject Musabaqah
  module (Sections 2/3/4/17 of the spec).

  Lists events open for registration. For each event shows the
  student's own registration status:
    (not registered) → Register form
    pending           → "Awaiting admin approval"
    rejected/waitlisted → status message
    admitted          → access code + "Enter Waiting Room"
    completed         → "Completed"

  Admin/teacher who land here (e.g. via a shared link) are bounced
  to the admin management page instead.
*/
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, Calendar, Loader2, CheckCircle2, Clock3, XCircle,
  KeyRound, Copy, ArrowRight, ArrowLeft,
} from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#163d28";
const GOLD = "#c9a84c";
const BLUE = "#60A5FA";

// Live countdown to an event's kickoff. Prefers start_time (has the actual
// hour) and falls back to midnight on competition_date if that's all the
// event has set. Ticks once a minute — a live exam timer this is not, so a
// second-by-second refresh would just be wasted renders.
function useCountdown(target: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const diffMs = new Date(target).getTime() - now;
  return diffMs;
}

function EventCountdown({ competitionDate, startTime }: { competitionDate: string | null; startTime: string | null }) {
  const target = startTime ?? (competitionDate ? `${competitionDate}T00:00:00` : null);
  const diffMs = useCountdown(target);
  if (diffMs === null) return null;

  if (diffMs <= 0) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#4ADE80", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
        <Clock3 size={12} /> Today
      </span>
    );
  }

  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const label = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, color: GOLD, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
      <Clock3 size={12} /> in {label}
    </span>
  );
}

type GMEvent = {
  id: string; title: string; subject: string; topic: string | null;
  status: string; competition_date: string | null; start_time: string | null; target_level: string | null;
  instructions: string | null;
};
type GMRegistration = {
  id: string; event_id: string; status: string; full_name: string;
};

export default function GeneralMusabaqahRegister() {
  const { user, profile, hasRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isStaff = hasRole("admin") || hasRole("teacher");

  const [events, setEvents]   = useState<GMEvent[]>([]);
  const [regs, setRegs]       = useState<Record<string, GMRegistration>>({});
  const [codes, setCodes]     = useState<Record<string, string>>({}); // event_id -> code
  const [loading, setLoading] = useState(true);

  const [dialogEvent, setDialogEvent] = useState<GMEvent | null>(null);
  const [form, setForm] = useState({ full_name: "", level_class: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (isStaff) navigate("/musabaqah/general"); }, [isStaff]);

  const load = async () => {
    if (!user) return;
    setLoading(true);

    const { data: ev } = await supabase
      .from("general_musabaqah_events")
      .select("id,title,subject,topic,status,competition_date,start_time,target_level,instructions")
      .in("status", ["registration_open", "registration_closed", "in_progress", "paused"])
      .order("competition_date", { ascending: true });
    setEvents((ev as GMEvent[]) || []);

    const { data: rg } = await supabase
      .from("general_musabaqah_registrations")
      .select("id,event_id,status,full_name")
      .eq("user_id", user.id);
    const regMap: Record<string, GMRegistration> = {};
    (rg || []).forEach(r => { regMap[r.event_id] = r as GMRegistration; });
    setRegs(regMap);

    const admittedRegIds = (rg || []).filter(r => r.status === "admitted").map(r => r.id);
    if (admittedRegIds.length) {
      const { data: ac } = await supabase
        .from("general_musabaqah_access_codes")
        .select("registration_id,code,event_id")
        .in("registration_id", admittedRegIds);
      const codeMap: Record<string, string> = {};
      (ac || []).forEach(c => { codeMap[c.event_id] = c.code; });
      setCodes(codeMap);
    }

    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const openRegister = (ev: GMEvent) => {
    setForm({
      full_name: profile?.full_name || "",
      level_class: profile?.course_level || profile?.level || "",
      phone: profile?.phone || "",
    });
    setDialogEvent(ev);
  };

  const submitRegistration = async () => {
    if (!dialogEvent || !user) return;
    if (!form.full_name.trim()) {
      toast({ title: "Full name is required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("general_musabaqah_registrations").insert({
      event_id: dialogEvent.id,
      user_id: user.id,
      full_name: form.full_name.trim(),
      level_class: form.level_class.trim() || null,
      phone: form.phone.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Registered — awaiting admin approval" });
    setDialogEvent(null);
    load();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Access code copied" });
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100%", background: G, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Loader2 className="animate-spin" color={GOLD} size={28} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100%", background: `linear-gradient(160deg, ${G} 0%, #0a1f12 60%, #050f09 100%)`, padding: "20px 16px 56px", fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <button onClick={() => navigate("/student/musabaqah")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6, marginBottom: 12, cursor: "pointer", fontSize: 13 }}>
          <ArrowLeft size={14} /> Al-Musābaqah
        </button>

        <div style={{ marginBottom: 20 }}>
          <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: 0 }}>General Subject Musabaqah</h1>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, margin: "4px 0 0" }}>
            Hadith, Fiqh, Tawheed and more — live oral examinations.
          </p>
        </div>

        {events.length === 0 ? (
          <Card style={{ background: GM, border: `1px solid rgba(96,165,250,0.2)` }}>
            <CardContent className="pt-6 pb-6 text-center">
              <BookOpen size={28} color={BLUE} style={{ margin: "0 auto 10px" }} />
              <p style={{ color: "rgba(255,255,255,0.65)" }}>No Musabaqah events open right now. Check back soon.</p>
            </CardContent>
          </Card>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {events.map(ev => {
              const reg = regs[ev.id];
              const code = codes[ev.id];
              return (
                <Card key={ev.id} style={{ background: GM, border: `1px solid rgba(96,165,250,0.2)` }}>
                  <CardContent className="pt-5 pb-5">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                      <div>
                        <h3 style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: 0 }}>{ev.title}</h3>
                        <p style={{ color: BLUE, fontSize: 13, fontWeight: 600, margin: "2px 0 0" }}>
                          {ev.subject}{ev.topic ? ` — ${ev.topic}` : ""}
                        </p>
                      </div>
                      {ev.competition_date && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(255,255,255,0.5)", fontSize: 12, whiteSpace: "nowrap" }}>
                          <Calendar size={12} /> {ev.competition_date}
                        </span>
                      )}
                    </div>
                    {ev.target_level && (
                      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, margin: "0 0 10px" }}>Level: {ev.target_level}</p>
                    )}
                    {(ev.competition_date || ev.start_time) && (ev.status === "registration_open" || ev.status === "registration_closed") && (
                      <div style={{ margin: "0 0 10px" }}>
                        <EventCountdown competitionDate={ev.competition_date} startTime={ev.start_time} />
                      </div>
                    )}

                    {!reg && ev.status === "registration_open" && (
                      <Button onClick={() => openRegister(ev)} style={{ background: BLUE, color: "#06131f", fontWeight: 700 }}>
                        Register
                      </Button>
                    )}
                    {!reg && ev.status !== "registration_open" && (
                      <Badge style={{ background: "rgba(148,163,184,0.15)", color: "#94A3B8", border: "none" }}>Registration closed</Badge>
                    )}

                    {reg?.status === "pending" && (
                      <Badge style={{ background: "rgba(251,191,36,0.15)", color: "#FBBF24", border: "none" }}>
                        <Clock3 size={11} className="mr-1" /> Awaiting admin approval
                      </Badge>
                    )}
                    {reg?.status === "rejected" && (
                      <Badge style={{ background: "rgba(248,113,113,0.15)", color: "#F87171", border: "none" }}>
                        <XCircle size={11} className="mr-1" /> Registration not approved
                      </Badge>
                    )}
                    {reg?.status === "waitlisted" && (
                      <Badge style={{ background: "rgba(251,191,36,0.15)", color: "#FBBF24", border: "none" }}>Waitlisted</Badge>
                    )}
                    {reg?.status === "disqualified" && (
                      <Badge style={{ background: "rgba(248,113,113,0.15)", color: "#F87171", border: "none" }}>Disqualified</Badge>
                    )}
                    {reg?.status === "completed" && (
                      <Button onClick={() => navigate(`/student/musabaqah/general/${ev.id}/result`)} style={{ background: GOLD, color: G, fontWeight: 700 }}>
                        <CheckCircle2 size={14} className="mr-1" /> View Result
                      </Button>
                    )}
                    {reg?.status === "admitted" && (
                      <div style={{ display: "grid", gap: 10 }}>
                        <Badge style={{ background: "rgba(74,222,128,0.15)", color: "#4ADE80", border: "none", width: "fit-content" }}>
                          <CheckCircle2 size={11} className="mr-1" /> Admitted
                        </Badge>
                        {code && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 10, padding: "8px 12px" }}>
                            <KeyRound size={15} color={BLUE} />
                            <span style={{ color: "#fff", fontWeight: 700, letterSpacing: 1, fontFamily: "monospace", fontSize: 14 }}>{code}</span>
                            <Button variant="ghost" size="icon" onClick={() => copyCode(code)} style={{ color: "rgba(255,255,255,0.5)", marginLeft: "auto" }}>
                              <Copy size={14} />
                            </Button>
                          </div>
                        )}
                        <Button onClick={() => navigate(`/musabaqah/general/${ev.id}/exam`)} style={{ background: BLUE, color: "#06131f", fontWeight: 700 }}>
                          Enter Examination Room <ArrowRight size={15} className="ml-1" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Registration dialog ───────────────────────────────────────── */}
      <Dialog open={!!dialogEvent} onOpenChange={(o) => !o && setDialogEvent(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Register — {dialogEvent?.title}</DialogTitle>
          </DialogHeader>
          {dialogEvent?.instructions && (
            <p style={{ fontSize: 13, color: "#6b7280", background: "#f9fafb", padding: 10, borderRadius: 8 }}>
              {dialogEvent.instructions}
            </p>
          )}
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <Label style={{ fontSize: 12, marginBottom: 4, display: "block" }}>Full Name *</Label>
              <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <Label style={{ fontSize: 12, marginBottom: 4, display: "block" }}>Level / Class</Label>
              <Input value={form.level_class} onChange={e => setForm({ ...form, level_class: e.target.value })} />
            </div>
            <div>
              <Label style={{ fontSize: 12, marginBottom: 4, display: "block" }}>Phone (optional)</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogEvent(null)}>Cancel</Button>
            <Button onClick={submitRegistration} disabled={submitting} style={{ background: G, color: "#fff" }}>
              {submitting ? <Loader2 size={16} className="animate-spin mr-1" /> : null}
              Submit Registration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
