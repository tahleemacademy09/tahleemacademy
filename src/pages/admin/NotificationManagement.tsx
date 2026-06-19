// src/pages/admin/NotificationManagement.tsx
// AI-powered Notification Center for Tahleem Academy
// Tabs: AI Compose | Auto Events | Moderation | History

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademicLevels, getLevelConfig, getLevelDisplay } from "@/hooks/useAcademicLevels";
import { useToast } from "@/hooks/use-toast";
import {
  Bell, Sparkles, ShieldCheck, History, Send, RefreshCw,
  Loader2, Trash2, CheckCircle, XCircle, AlertTriangle, Eye,
  Users, GraduationCap, User, ChevronDown, Check, X,
  Zap, MessageSquare, BookOpen, CreditCard, Trophy, Star,
} from "lucide-react";

const G  = "#064E3B";
const G2 = "#075E54";

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none",
  background: "#FAFAFA", boxSizing: "border-box" as const, fontFamily: "inherit",
};

const TABS = [
  { id: "compose",    label: "AI Compose",    icon: Sparkles  },
  { id: "auto",       label: "Auto Events",   icon: Zap       },
  { id: "moderation", label: "Moderation",    icon: ShieldCheck },
  { id: "history",    label: "History",       icon: History   },
] as const;
type Tab = typeof TABS[number]["id"];

const BASE_TARGETS = [
  { value: "all",      label: "Everyone",     icon: "🌍" },
  { value: "students", label: "All Students", icon: "🎓" },
  { value: "teachers", label: "All Teachers", icon: "👨‍🏫" },
];

const AUTO_EVENTS = [
  { type: "welcome",              label: "Welcome New Student",        icon: "👋", desc: "Sent when a new student joins" },
  { type: "exam_reminder",        label: "Exam Reminder",              icon: "📝", desc: "Remind students about upcoming exams" },
  { type: "exam_graded",          label: "Results Ready",              icon: "✅", desc: "Notify when exam results are published" },
  { type: "new_enrollment",       label: "Enrollment Confirmed",       icon: "📚", desc: "Confirm a new course enrollment" },
  { type: "payment_received",     label: "Payment Confirmed",          icon: "💳", desc: "Payment successfully received" },
  { type: "hifdh_milestone",      label: "Hifdh Milestone",           icon: "🕌", desc: "Student reached memorization milestone" },
  { type: "class_reminder",       label: "Live Class Starting",        icon: "🎥", desc: "Remind about upcoming live class" },
  { type: "level_changed",        label: "Level Upgrade",              icon: "⭐", desc: "Student promoted to next level" },
  { type: "assignment_submitted", label: "Assignment Received",        icon: "📋", desc: "Confirm assignment submission" },
  { type: "announcement",         label: "General Announcement",       icon: "📢", desc: "Custom platform announcement" },
];

const verdictStyle: Record<string, { bg: string; color: string; border: string }> = {
  approve: { bg: "#F0FDF4", color: "#166534", border: "#86EFAC" },
  warn:    { bg: "#FFFBEB", color: "#92400E", border: "#FDE68A" },
  remove:  { bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" },
  pending: { bg: "#F0F9FF", color: "#0369A1", border: "#BAE6FD" },
};

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spin({ size = 18 }: { size?: number }) {
  return <Loader2 size={size} style={{ animation: "spin .8s linear infinite", flexShrink: 0 }} />;
}

// ── Target Selector ───────────────────────────────────────────────────────────
type TargetOption = { value: string; label: string; icon: string };
type UserProfile  = { user_id: string; full_name: string | null; email: string | null; role: string };

function TargetSelector({ value, onChange, targets }: { value: string; onChange: (v: string) => void; targets: TargetOption[] }) {
  const [open,    setOpen]    = useState(false);
  const [search,  setSearch]  = useState("");
  const [users,   setUsers]   = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Load users once when dropdown opens
  useEffect(() => {
    if (!open || users.length > 0) return;
    setLoading(true);
    supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .order("full_name", { ascending: true })
      .limit(200)
      .then(async ({ data: profiles }) => {
        const { data: roles } = await supabase.from("user_roles").select("user_id, role");
        const roleMap = new Map((roles || []).map((r: any) => [r.user_id, r.role]));
        setUsers((profiles || []).map((p: any) => ({
          user_id:   p.user_id,
          full_name: p.full_name,
          email:     p.email,
          role:      roleMap.get(p.user_id) || "student",
        })));
        setLoading(false);
      });
  }, [open]);

  // Resolve display label for current value
  const groupSel = targets.find(t => t.value === value);
  const userSel  = value.startsWith("user:") ? users.find(u => `user:${u.user_id}` === value) : null;
  const displayLabel = groupSel
    ? `${groupSel.icon} ${groupSel.label}`
    : userSel
    ? `👤 ${userSel.full_name || userSel.email}`
    : value;

  const q = search.toLowerCase();
  const filteredUsers = users.filter(u =>
    !q ||
    u.full_name?.toLowerCase().includes(q) ||
    u.email?.toLowerCase().includes(q)
  );
  const filteredGroups = targets.filter(t =>
    !q || t.label.toLowerCase().includes(q)
  );

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        onClick={() => { setOpen(v => !v); setSearch(""); }}
        style={{ ...inp, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: "#fff" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayLabel}</span>
        <ChevronDown size={14} color="#9CA3AF" style={{ flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,.15)", marginTop: 4, overflow: "hidden" }}>

          {/* Search box */}
          <div style={{ padding: "10px 10px 8px", borderBottom: "1px solid #F3F4F6" }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search group or person…"
              style={{ ...inp, padding: "8px 10px", fontSize: 12, background: "#F9FAFB" }}
            />
          </div>

          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {/* Group targets */}
            {filteredGroups.length > 0 && (
              <>
                <p style={{ fontSize: 10, fontWeight: 800, color: "#9CA3AF", padding: "8px 14px 4px", textTransform: "uppercase", letterSpacing: ".06em", margin: 0 }}>Groups</p>
                {filteredGroups.map(t => (
                  <button key={t.value} onClick={() => { onChange(t.value); setOpen(false); setSearch(""); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 14px", border: "none", background: t.value === value ? "#F0FDF4" : "#fff", cursor: "pointer", fontSize: 13, color: t.value === value ? G : "#374151", fontWeight: t.value === value ? 700 : 400, textAlign: "left" }}>
                    <span>{t.icon}</span>
                    <span style={{ flex: 1 }}>{t.label}</span>
                    {t.value === value && <Check size={13} color={G} />}
                  </button>
                ))}
              </>
            )}

            {/* Individual users */}
            {loading ? (
              <div style={{ padding: "14px", textAlign: "center" }}><Spin size={16} /></div>
            ) : filteredUsers.length > 0 ? (
              <>
                <p style={{ fontSize: 10, fontWeight: 800, color: "#9CA3AF", padding: "8px 14px 4px", textTransform: "uppercase", letterSpacing: ".06em", margin: 0, borderTop: filteredGroups.length ? "1px solid #F3F4F6" : "none" }}>Individuals</p>
                {filteredUsers.map(u => {
                  const uid = `user:${u.user_id}`;
                  const selected = value === uid;
                  return (
                    <button key={u.user_id} onClick={() => { onChange(uid); setOpen(false); setSearch(""); }}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 14px", border: "none", background: selected ? "#F0FDF4" : "#fff", cursor: "pointer", fontSize: 13, color: selected ? G : "#374151", fontWeight: selected ? 700 : 400, textAlign: "left" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: u.role === "teacher" ? "#EFF6FF" : "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13 }}>
                        {u.role === "teacher" ? "👨‍🏫" : "🎓"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: selected ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {u.full_name || u.email || u.user_id.slice(0, 8)}
                        </p>
                        {u.full_name && u.email && (
                          <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</p>
                        )}
                      </div>
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: u.role === "teacher" ? "#EFF6FF" : "#F0FDF4", color: u.role === "teacher" ? "#1D4ED8" : G, fontWeight: 700, flexShrink: 0 }}>
                        {u.role}
                      </span>
                      {selected && <Check size={13} color={G} />}
                    </button>
                  );
                })}
              </>
            ) : search ? (
              <p style={{ padding: "14px", textAlign: "center", fontSize: 12, color: "#9CA3AF", margin: 0 }}>No results for "{search}"</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — AI COMPOSE
// ═══════════════════════════════════════════════════════════════════════════════
function AICompose({ session, targets }: { session: any; targets: TargetOption[] }) {
  const { toast } = useToast();
  const [idea,          setIdea]          = useState("");
  const [target,        setTarget]        = useState("all");
  const [composed,      setComposed]      = useState<any>(null);
  const [composing,     setComposing]     = useState(false);
  const [sending,       setSending]       = useState(false);
  const [bilingualReady, setBilingualReady] = useState<boolean | null>(null);
  const [autoRephrase,  setAutoRephrase]  = useState(true);  // run through Islamic rephraser before dispatch
  const [rephrasing,    setRephrasing]    = useState(false);

  // Probe whether bilingual DB columns exist yet
  useEffect(() => {
    supabase.from("notifications").select("title_ar").limit(1)
      .then(({ error }) => setBilingualReady(!error));
  }, []);

  const compose = async () => {
    if (!idea.trim()) { toast({ title: "Enter your idea first", variant: "destructive" }); return; }
    setComposing(true);
    setComposed(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-notification-center", {
        body: { action: "compose", idea: idea.trim(), target_hint: target },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setComposed(data);
    } catch (e: any) {
      toast({ title: "AI compose failed", description: e.message, variant: "destructive" });
    }
    setComposing(false);
  };

  // Standalone rephrase — runs current draft through Islamic AI rephraser
  const rephrase = async () => {
    if (!composed) return;
    setRephrasing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-notification-center", {
        body: {
          action:     "rephrase",
          title_en:   composed.title_en,
          title_ar:   composed.title_ar,
          message_en: composed.message_en,
          message_ar: composed.message_ar,
          type:       composed.suggested_type || "announcement",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setComposed((prev: any) => ({ ...prev, ...data }));
      toast({ title: "✨ Rephrased Islamically", description: "Review the updated wording before sending." });
    } catch (e: any) {
      // Graceful fallback: apply basic Islamic tone locally if edge function fails
      const isApiKeyMissing = e?.message?.includes("non-2xx") || e?.message?.includes("500") || e?.message?.includes("ANTHROPIC_API_KEY");
      if (isApiKeyMissing) {
        // Apply simple Islamic prefix locally
        const msgEn = composed.message_en || "";
        const msgAr = composed.message_ar || "";
        const hasGreeting = /assalamu|as-salamu|السلام/i.test(msgEn + msgAr);
        setComposed((prev: any) => ({
          ...prev,
          message_en: hasGreeting ? msgEn : `Assalamu Alaikum wa Rahmatullahi wa Barakatuh,\n\n${msgEn}\n\nJazakumullahu Khayran`,
          message_ar: msgAr && !hasGreeting ? `السلام عليكم ورحمة الله وبركاته،\n\n${msgAr}\n\nجزاكم الله خيراً` : msgAr,
        }));
        toast({ title: "🕌 Islamic tone applied (offline mode)", description: "Edge function unavailable — basic Islamic greeting added. Set ANTHROPIC_API_KEY in Supabase secrets for full AI rephrasing." });
      } else {
        toast({ title: "Rephrase failed", description: e.message, variant: "destructive" });
      }
    }
    setRephrasing(false);
  };

  const send = async () => {
    if (!composed) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-notification-center", {
        body: {
          action:     "send",
          title_en:   composed.title_en,
          title_ar:   composed.title_ar,
          message_en: composed.message_en,
          message_ar: composed.message_ar,
          target:     target,                          // always use the admin's explicit selection
          type:          composed.suggested_type || "announcement",
          auto_rephrase: autoRephrase,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.bilingual_ready === false) {
        toast({ title: `✅ Sent to ${data.sent} users (English only)`, description: "⚠️ Run the DB migration to enable bilingual storage.", variant: "destructive" });
      } else {
        toast({ title: `✅ Sent ${autoRephrase ? "(Islamically rephrased) " : ""}to ${data.sent} users — EN & AR` });
      }
      setIdea(""); setComposed(null);
    } catch (e: any) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    }
    setSending(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* ── Migration warning — shown until title_ar column exists ── */}
      {bilingualReady === false && (
        <div style={{ background: "#FEF3C7", border: "1.5px solid #F59E0B", borderRadius: 12, padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#92400E" }}>DB Migration Required</p>
            <p style={{ margin: "4px 0 8px", fontSize: 12, color: "#78350F", lineHeight: 1.5 }}>
              Arabic columns are missing from the notifications table. Notifications will send in English only until you run this SQL in Supabase:
            </p>
            <code style={{ display: "block", background: "#FDE68A", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#451A03", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
              {`ALTER TABLE public.notifications\n  ADD COLUMN IF NOT EXISTS title_ar   text,\n  ADD COLUMN IF NOT EXISTS message_ar text;`}
            </code>
          </div>
        </div>
      )}

      {/* Idea input */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #E5E7EB", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={18} color={G} />
          </div>
          <div>
            <p style={{ fontWeight: 800, fontSize: 14, color: "#111", margin: 0 }}>AI Notification Composer</p>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Describe your idea — AI writes it in English & Arabic</p>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>Your Idea</label>
          <textarea
            value={idea}
            onChange={e => setIdea(e.target.value)}
            placeholder="e.g. Remind students that exams start next week and wish them well, mention to review their notes..."
            rows={3}
            style={{ ...inp, resize: "vertical" as const, minHeight: 80 }}
          />
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>Send To</label>
          <TargetSelector value={target} onChange={setTarget} targets={targets} />
        </div>

        <button onClick={compose} disabled={composing || !idea.trim()} style={{ padding: "12px", borderRadius: 12, border: "none", background: composing || !idea.trim() ? "#E5E7EB" : `linear-gradient(135deg,${G},${G2})`, color: composing || !idea.trim() ? "#9CA3AF" : "#fff", fontWeight: 800, fontSize: 14, cursor: composing || !idea.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {composing ? <><Spin /> Composing…</> : <><Sparkles size={15} /> Generate with AI</>}
        </button>
      </div>

      {/* AI Result */}
      {composed && (
        <div style={{ background: "#fff", borderRadius: 16, border: `2px solid ${G}22`, padding: 20, display: "flex", flexDirection: "column", gap: 14, animation: "fadeIn .3s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ fontWeight: 800, fontSize: 14, color: G, margin: 0 }}>✨ AI Generated</p>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: "#F0FDF4", color: G }}>
            {targets.find(t => t.value === target)?.label || (target.startsWith("user:") ? "Individual" : target)}
            </span>
          </div>

          {/* English — editable */}
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: "#6B7280", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: ".06em" }}>🇬🇧 English</p>
            <input
              value={composed.title_en || ""}
              onChange={e => setComposed((c: any) => ({ ...c, title_en: e.target.value }))}
              placeholder="English title…"
              style={{ ...inp, fontWeight: 800, fontSize: 14, marginBottom: 8 }}
            />
            <textarea
              value={composed.message_en || ""}
              onChange={e => setComposed((c: any) => ({ ...c, message_en: e.target.value }))}
              placeholder="English message…"
              rows={3}
              style={{ ...inp, resize: "vertical" as const, fontSize: 13, lineHeight: 1.5 }}
            />
          </div>

          {/* Arabic — editable */}
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "#FFFBF0", border: "1px solid #FDE68A" }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: "#6B7280", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: ".06em" }}>🇸🇦 Arabic</p>
            <input
              value={composed.title_ar || ""}
              onChange={e => setComposed((c: any) => ({ ...c, title_ar: e.target.value }))}
              placeholder="العنوان بالعربي…"
              dir="rtl"
              style={{ ...inp, fontWeight: 800, fontSize: 15, fontFamily: "'Amiri', serif", marginBottom: 8, direction: "rtl" }}
            />
            <textarea
              value={composed.message_ar || ""}
              onChange={e => setComposed((c: any) => ({ ...c, message_ar: e.target.value }))}
              placeholder="نص الرسالة…"
              dir="rtl"
              rows={3}
              style={{ ...inp, resize: "vertical" as const, fontSize: 14, fontFamily: "'Amiri', serif", lineHeight: 1.8, direction: "rtl" }}
            />
          </div>

          {/* ── Islamic Rephrase toggle + button ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "#FEF3C7", border: "1px solid #FCD34D" }}>
            <input
              type="checkbox"
              id="autoRephrase"
              checked={autoRephrase}
              onChange={e => setAutoRephrase(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "#064E3B", cursor: "pointer" }}
            />
            <label htmlFor="autoRephrase" style={{ fontSize: 12, fontWeight: 700, color: "#92400E", cursor: "pointer", flex: 1 }}>
              🕌 Auto-apply Islamic tone before sending (adds Salam, In sha Allah, duas)
            </label>
            <button
              onClick={rephrase}
              disabled={rephrasing}
              style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: rephrasing ? "#E5E7EB" : "#D97706", color: rephrasing ? "#9CA3AF" : "#fff", fontWeight: 700, fontSize: 12, cursor: rephrasing ? "not-allowed" : "pointer" }}
            >
              {rephrasing ? "⏳ Rephrasing…" : "✨ Preview Rephrase"}
            </button>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setComposed(null)} style={{ flex: 1, padding: "11px", borderRadius: 11, border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              ✏️ Regenerate
            </button>
            <button onClick={send} disabled={sending} style={{ flex: 2, padding: "11px", borderRadius: 11, border: "none", background: sending ? "#E5E7EB" : `linear-gradient(135deg,${G},${G2})`, color: sending ? "#9CA3AF" : "#fff", fontWeight: 800, fontSize: 14, cursor: sending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {sending ? <><Spin /> Sending…</> : <><Send size={14} /> Send Now</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — AUTO EVENTS
// ═══════════════════════════════════════════════════════════════════════════════
function AutoEvents({ targets }: { targets: TargetOption[] }) {
  const { toast } = useToast();
  const [selected, setSelected]   = useState<string | null>(null);
  const [context,  setContext]     = useState("");
  const [target,   setTarget]      = useState("students");
  const [preview,  setPreview]     = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [sending,    setSending]    = useState(false);

  const generate = async (eventType: string) => {
    setSelected(eventType);
    setPreview(null);
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-notification-center", {
        body: { action: "auto", event_type: eventType, context: { extra: context } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPreview({ ...data, event_type: eventType });
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const send = async () => {
    if (!preview) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-notification-center", {
        body: {
          action:     "send",
          title_en:   preview.title_en,
          title_ar:   preview.title_ar,
          message_en: preview.message_en,
          message_ar: preview.message_ar,
          target,
          type:       preview.type || "announcement",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.bilingual_ready === false) {
        toast({ title: `✅ Sent to ${data.sent} users (English only)`, description: "⚠️ Run the DB migration to enable bilingual storage.", variant: "destructive" });
      } else {
        toast({ title: `✅ Sent to ${data.sent} users — English & Arabic` });
      }
      setPreview(null); setSelected(null); setContext("");
    } catch (e: any) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    }
    setSending(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ padding: "12px 14px", borderRadius: 12, background: "#EFF6FF", border: "1px solid #93C5FD", fontSize: 12, color: "#1D4ED8" }}>
        ⚡ Select a platform event — AI generates the perfect notification automatically.
      </div>

      {/* Optional context */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>Optional Context (student name, exam title, etc.)</label>
        <input value={context} onChange={e => setContext(e.target.value)} placeholder="e.g. Student: Aisha, Exam: Tajweed Level 1..." style={inp} />
      </div>

      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".06em" }}>Send To</label>
        <TargetSelector value={target} onChange={setTarget} targets={targets} />
      </div>

      {/* Event grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
        {AUTO_EVENTS.map(ev => (
          <button key={ev.type} onClick={() => generate(ev.type)} disabled={generating && selected === ev.type} style={{ padding: "14px 12px", borderRadius: 14, border: `2px solid ${selected === ev.type ? G : "#E5E7EB"}`, background: selected === ev.type ? "#F0FDF4" : "#fff", cursor: "pointer", textAlign: "left" as const, transition: "all .15s" }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{ev.icon}</div>
            <p style={{ fontWeight: 700, fontSize: 12, color: selected === ev.type ? G : "#111", margin: "0 0 3px" }}>{ev.label}</p>
            <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0, lineHeight: 1.4 }}>{ev.desc}</p>
            {generating && selected === ev.type && <div style={{ marginTop: 8 }}><Spin size={14} /></div>}
          </button>
        ))}
      </div>

      {/* Preview */}
      {preview && !generating && (
        <div style={{ background: "#fff", borderRadius: 16, border: `2px solid ${G}22`, padding: 20, display: "flex", flexDirection: "column", gap: 14, animation: "fadeIn .3s ease" }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: G, margin: 0 }}>
            {AUTO_EVENTS.find(e => e.type === preview.event_type)?.icon} AI Preview
          </p>
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: "#6B7280", margin: "0 0 4px", textTransform: "uppercase" }}>🇬🇧 English</p>
            <p style={{ fontWeight: 800, fontSize: 14, color: "#111", margin: "0 0 4px" }}>{preview.title_en}</p>
            <p style={{ fontSize: 13, color: "#374151", margin: 0, lineHeight: 1.5 }}>{preview.message_en}</p>
          </div>
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "#FFFBF0", border: "1px solid #FDE68A", direction: "rtl" }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: "#6B7280", margin: "0 0 4px", direction: "ltr" }}>🇸🇦 Arabic</p>
            <p style={{ fontWeight: 800, fontSize: 15, color: "#111", margin: "0 0 4px", fontFamily: "'Amiri', serif" }}>{preview.title_ar}</p>
            <p style={{ fontSize: 14, color: "#374151", margin: 0, lineHeight: 1.8, fontFamily: "'Amiri', serif" }}>{preview.message_ar}</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => generate(preview.event_type)} style={{ flex: 1, padding: "11px", borderRadius: 11, border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              🔄 Regenerate
            </button>
            <button onClick={send} disabled={sending} style={{ flex: 2, padding: "11px", borderRadius: 11, border: "none", background: sending ? "#E5E7EB" : `linear-gradient(135deg,${G},${G2})`, color: sending ? "#9CA3AF" : "#fff", fontWeight: 800, fontSize: 14, cursor: sending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {sending ? <><Spin /> Sending…</> : <><Send size={14} /> Send</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — MODERATION QUEUE
// ═══════════════════════════════════════════════════════════════════════════════
function ModerationQueue() {
  const { toast } = useToast();
  const [queue,    setQueue]    = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [scanning, setScanning] = useState<string | null>(null);
  const [compose,  setCompose]  = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<any>(null);

  const loadQueue = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from("moderation_queue").select("*").order("created_at", { ascending: false }).limit(50);
    setQueue(data || []);
    setLoading(false);
  };

  useEffect(() => { loadQueue(); }, []);

  const aiScan = async (item: any) => {
    setScanning(item.id);
    try {
      const { data, error } = await supabase.functions.invoke("ai-notification-center", {
        body: { action: "moderate", content: item.content, content_type: item.content_type },
      });
      if (error) throw error;
      // Update queue item with AI verdict
      await (supabase as any).from("moderation_queue").update({
        ai_verdict:  data.verdict,
        ai_reason:   data.reason_en,
        ai_severity: data.severity,
        status:      data.verdict === "approve" ? "approved" : "pending",
      }).eq("id", item.id);
      loadQueue();
      toast({ title: `AI verdict: ${data.verdict.toUpperCase()}`, description: data.reason_en });
    } catch (e: any) {
      toast({ title: "Scan failed", description: e.message, variant: "destructive" });
    }
    setScanning(null);
  };

  const updateStatus = async (id: string, status: string) => {
    await (supabase as any).from("moderation_queue").update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
    setQueue(q => q.map(i => i.id === id ? { ...i, status } : i));
    toast({ title: status === "approved" ? "✅ Approved" : status === "removed" ? "🗑 Removed" : "⚠️ Warning sent" });
  };

  // Check arbitrary text
  const checkText = async () => {
    if (!compose.trim()) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-notification-center", {
        body: { action: "moderate", content: compose.trim(), content_type: "manual_check" },
      });
      if (error) throw error;
      setCheckResult(data);
    } catch (e: any) {
      toast({ title: "Check failed", description: e.message, variant: "destructive" });
    }
    setChecking(false);
  };

  const vs = (verdict: string) => verdictStyle[verdict] || verdictStyle.pending;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Manual text checker */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #E5E7EB", padding: 18 }}>
        <p style={{ fontWeight: 800, fontSize: 13, color: "#111", margin: "0 0 12px" }}>🔍 Check Any Text with AI</p>
        <textarea value={compose} onChange={e => setCompose(e.target.value)} placeholder="Paste a message or content to check for appropriateness..." rows={3} style={{ ...inp, resize: "vertical" as const }} />
        <button onClick={checkText} disabled={checking || !compose.trim()} style={{ marginTop: 10, padding: "10px 20px", borderRadius: 10, border: "none", background: checking || !compose.trim() ? "#E5E7EB" : `linear-gradient(135deg,${G},${G2})`, color: checking || !compose.trim() ? "#9CA3AF" : "#fff", fontWeight: 700, fontSize: 13, cursor: checking || !compose.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
          {checking ? <><Spin size={14} /> Checking…</> : <><ShieldCheck size={14} /> Check with AI</>}
        </button>

        {checkResult && (
          <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 12, background: vs(checkResult.verdict).bg, border: `1.5px solid ${vs(checkResult.verdict).border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>{checkResult.verdict === "approve" ? "✅" : checkResult.verdict === "warn" ? "⚠️" : "🚫"}</span>
              <p style={{ fontWeight: 900, fontSize: 15, color: vs(checkResult.verdict).color, margin: 0, textTransform: "uppercase" }}>{checkResult.verdict}</p>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(0,0,0,.07)", color: vs(checkResult.verdict).color, marginLeft: "auto" }}>
                {Math.round(checkResult.confidence * 100)}% confidence · {checkResult.severity} severity
              </span>
            </div>
            <p style={{ fontSize: 13, color: vs(checkResult.verdict).color, margin: 0 }}>{checkResult.reason_en}</p>
            {checkResult.suggested_warning_en && (
              <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,.06)", fontSize: 12, color: vs(checkResult.verdict).color, fontStyle: "italic" }}>
                Suggested warning: "{checkResult.suggested_warning_en}"
              </div>
            )}
          </div>
        )}
      </div>

      {/* Queue */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontWeight: 800, fontSize: 14, color: "#111", margin: 0 }}>Moderation Queue ({queue.filter(i => i.status === "pending").length} pending)</p>
        <button onClick={loadQueue} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#374151" }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spin size={28} /></div>
      ) : queue.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, background: "#fff", borderRadius: 16, border: "2px dashed #E5E7EB" }}>
          <ShieldCheck size={40} color="#D1FAE5" style={{ margin: "0 auto 12px", display: "block" }} />
          <p style={{ fontWeight: 700, color: "#374151", margin: "0 0 4px" }}>Queue is clear</p>
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>No items pending moderation</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {queue.map(item => {
            const st = verdictStyle[item.status === "approved" ? "approve" : item.status === "removed" ? "remove" : item.ai_verdict || "pending"];
            return (
              <div key={item.id} style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${st.border}`, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "#F3F4F6", color: "#374151" }}>{item.content_type}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
                        {item.ai_verdict ? `AI: ${item.ai_verdict}` : "Unscanned"}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "#F0F9FF", color: "#0369A1" }}>{item.status}</span>
                    </div>
                    <p style={{ fontSize: 13, color: "#374151", margin: "0 0 4px", lineHeight: 1.5 }}>"{item.content}"</p>
                    {item.ai_reason && <p style={{ fontSize: 11, color: st.color, margin: 0, fontStyle: "italic" }}>AI: {item.ai_reason}</p>}
                    <p style={{ fontSize: 10, color: "#9CA3AF", margin: "4px 0 0" }}>{new Date(item.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {!item.ai_verdict && (
                    <button onClick={() => aiScan(item)} disabled={scanning === item.id} style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${G}`, background: "#F0FDF4", color: G, fontWeight: 700, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                      {scanning === item.id ? <Spin size={12} /> : <Sparkles size={12} />} AI Scan
                    </button>
                  )}
                  {item.status === "pending" && (
                    <>
                      <button onClick={() => updateStatus(item.id, "approved")} style={{ padding: "7px 12px", borderRadius: 8, border: "1.5px solid #86EFAC", background: "#F0FDF4", color: "#166534", fontWeight: 700, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                        <Check size={12} /> Approve
                      </button>
                      <button onClick={() => updateStatus(item.id, "warned")} style={{ padding: "7px 12px", borderRadius: 8, border: "1.5px solid #FDE68A", background: "#FFFBEB", color: "#92400E", fontWeight: 700, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                        <AlertTriangle size={12} /> Warn
                      </button>
                      <button onClick={() => updateStatus(item.id, "removed")} style={{ padding: "7px 12px", borderRadius: 8, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#991B1B", fontWeight: 700, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                        <X size={12} /> Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4 — HISTORY
// ═══════════════════════════════════════════════════════════════════════════════
function NotificationHistory() {
  const { toast } = useToast();
  const [notifs,   setNotifs]   = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Map<string, any>>(new Map());
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: ns }, { data: ps }] = await Promise.all([
      supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("user_id, full_name, email"),
    ]);
    setNotifs(ns || []);
    const m = new Map<string, any>();
    (ps || []).forEach((p: any) => m.set(p.user_id, p));
    setProfiles(m);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const del = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifs(n => n.filter(x => x.id !== id));
  };

  const filtered = useMemo(() =>
    notifs.filter(n => !search || n.title?.toLowerCase().includes(search.toLowerCase()) || n.message?.toLowerCase().includes(search.toLowerCase())),
    [notifs, search]
  );

  const stats = useMemo(() => ({
    total:  notifs.length,
    read:   notifs.filter(n => n.is_read).length,
    unread: notifs.filter(n => !n.is_read).length,
  }), [notifs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { label: "Total Sent", value: stats.total, color: G,         bg: "#F0FDF4" },
          { label: "Read",       value: stats.read,  color: "#2563EB", bg: "#EFF6FF" },
          { label: "Unread",     value: stats.unread, color: "#D97706", bg: "#FFFBEB" },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: "12px 14px", textAlign: "center" }}>
            <p style={{ fontSize: 22, fontWeight: 900, color: s.color, margin: "0 0 2px" }}>{s.value}</p>
            <p style={{ fontSize: 11, color: s.color, opacity: .7, fontWeight: 600, margin: 0 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search + refresh */}
      <div style={{ display: "flex", gap: 8 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notifications…" style={{ ...inp, flex: 1 }} />
        <button onClick={load} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer" }}>
          <RefreshCw size={14} color="#6B7280" />
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spin size={28} /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, background: "#fff", borderRadius: 16, border: "2px dashed #E5E7EB" }}>
          <Bell size={40} color="#E5E7EB" style={{ margin: "0 auto 12px", display: "block" }} />
          <p style={{ fontWeight: 700, color: "#374151", margin: 0 }}>No notifications found</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.slice(0, 100).map(n => {
            const p = profiles.get(n.user_id);
            return (
              <div key={n.id} style={{ background: "#fff", borderRadius: 12, border: `1px solid ${n.is_read ? "#E5E7EB" : "#BAE6FD"}`, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: n.is_read ? "#F3F4F6" : "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Bell size={16} color={n.is_read ? "#9CA3AF" : "#2563EB"} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</p>
                  <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.message}</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, color: "#9CA3AF" }}>→ {p?.full_name || p?.email || n.user_id.slice(0, 8)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 20, background: n.is_read ? "#F3F4F6" : "#EFF6FF", color: n.is_read ? "#6B7280" : "#2563EB" }}>
                      {n.is_read ? "Read" : "Unread"}
                    </span>
                    {n.type && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: "#F0FDF4", color: G, fontWeight: 700 }}>{n.type}</span>}
                    <span style={{ fontSize: 10, color: "#9CA3AF" }}>{new Date(n.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <button onClick={() => del(n.id)} style={{ padding: "5px 7px", borderRadius: 7, border: "1px solid #FECACA", background: "#FEF2F2", cursor: "pointer", flexShrink: 0 }}>
                  <Trash2 size={12} color="#DC2626" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function NotificationManagement() {
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>("compose");
  const { data: academicLevels = [] } = useAcademicLevels();
  const TARGETS = [
    ...BASE_TARGETS,
    ...academicLevels.map(l => {
      const cfg = getLevelConfig(l.slug, academicLevels);
      return { value: l.slug, label: l.name_en, icon: cfg.dot };
    }),
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "14px 16px 0" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bell size={20} color={G} />
            </div>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 900, color: "#111", margin: 0 }}>AI Notification Center</h1>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>AI-powered notifications & content moderation</p>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2 }}>
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 16px", border: "none", borderRadius: "8px 8px 0 0", background: active ? "#F3F4F6" : "transparent", color: active ? G : "#6B7280", fontWeight: active ? 800 : 500, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all .15s" }}>
                  <Icon size={13} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
        {tab === "compose"    && <AICompose session={session} targets={TARGETS} />}
        {tab === "auto"       && <AutoEvents targets={TARGETS} />}
        {tab === "moderation" && <ModerationQueue />}
        {tab === "history"    && <NotificationHistory />}
      </div>
    </div>
  );
}
