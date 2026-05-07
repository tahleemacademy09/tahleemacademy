/*  src/pages/student/Onboarding.tsx
    3-step onboarding — only the fields that matter for level placement.
    Step 1: Personal basics  |  Step 2: Quran background  |  Step 3: Arabic / Goals / Review
    Session persists to localStorage so closing and reopening continues from where left off.
*/
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTasjeel, TASJEEL_ROUTES } from "@/hooks/useTasjeel";
import { BookOpen, ArrowRight, ArrowLeft, CheckCircle2, Loader2, ChevronDown, RotateCcw, Star } from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#D4A843";
const TOTAL = 3;

const LS_KEY = (uid: string) => `tahleem_onboarding_${uid}`;
const save   = (uid: string, data: any) => { try { localStorage.setItem(LS_KEY(uid), JSON.stringify(data)); } catch (_) {} };
const load   = (uid: string): any | null => { try { const r = localStorage.getItem(LS_KEY(uid)); return r ? JSON.parse(r) : null; } catch (_) { return null; } };
const clear  = (uid: string) => { try { localStorage.removeItem(LS_KEY(uid)); } catch (_) {} };

const inp = (focused: boolean): React.CSSProperties => ({
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: `2px solid ${focused ? GM : "#e5e7eb"}`,
  fontSize: 14, outline: "none", color: "#111", background: "#fafafa",
  transition: "border-color .2s, box-shadow .2s", boxSizing: "border-box" as const,
  boxShadow: focused ? "0 0 0 4px rgba(6,78,59,.08)" : "none", fontFamily: "inherit",
});
const selSt: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: "2px solid #e5e7eb", fontSize: 14, outline: "none",
  color: "#111", background: "#fafafa", fontFamily: "inherit",
  appearance: "none" as any, cursor: "pointer", boxSizing: "border-box" as const,
};
const lbl: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6, display: "block" };

const Radio = ({ name, val, checked, label, onChange }: any) => (
  <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, border: `2px solid ${checked ? GM : "#e5e7eb"}`, background: checked ? "#F0FDF4" : "#fafafa", cursor: "pointer", fontSize: 13, color: "#333", transition: "all .15s" }}>
    <input type="radio" name={name} value={val} checked={checked} onChange={onChange} style={{ display: "none" }} />
    <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${checked ? GM : "#d1d5db"}`, background: checked ? GM : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {checked && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
    </div>
    {label}
  </label>
);

const Chip = ({ label, sel, onClick }: { label: string; sel: boolean; onClick: () => void }) => (
  <button type="button" onClick={onClick}
    style={{ padding: "7px 14px", borderRadius: 20, border: `2px solid ${sel ? GM : "#e5e7eb"}`, background: sel ? "#F0FDF4" : "#fafafa", color: sel ? G : "#666", fontSize: 12, fontWeight: sel ? 700 : 500, cursor: "pointer", transition: "all .15s", display: "flex", alignItems: "center", gap: 6 }}>
    {sel && <CheckCircle2 size={11} color={GM} />}{label}
  </button>
);

const Sel = ({ val, onChange, opts, placeholder }: { val: string; onChange: (v: string) => void; opts: string[]; placeholder?: string }) => (
  <div style={{ position: "relative" }}>
    <select value={val} onChange={e => onChange(e.target.value)} style={selSt}>
      <option value="">{placeholder || "Select…"}</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
    <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#666", pointerEvents: "none" }} />
  </div>
);

// ── Star rating ────────────────────────────────────────────────────────────────
const StarRating = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "12px 0" }}>
    {[1, 2, 3, 4, 5].map(n => (
      <button key={n} type="button" onClick={() => onChange(n)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 4, transition: "transform .15s", transform: n <= value ? "scale(1.2)" : "scale(1)" }}>
        <Star size={32} fill={n <= value ? GOLD : "none"} color={n <= value ? GOLD : "#d1d5db"} strokeWidth={1.5} />
      </button>
    ))}
  </div>
);

const ProgBar = ({ step }: { step: number }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: GM }}>Step {step} of {TOTAL}</span>
      <span style={{ fontSize: 12, color: "#9ca3af" }}>{Math.round((step / TOTAL) * 100)}% complete</span>
    </div>
    <div style={{ height: 6, background: "#e5e7eb", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${(step / TOTAL) * 100}%`, background: `linear-gradient(90deg,${G},${GM})`, borderRadius: 6, transition: "width .4s ease" }} />
    </div>
  </div>
);

// ── MAIN ──────────────────────────────────────────────────────────────────────
const Onboarding = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentStep, loading: stepLoading } = useTasjeel();
  const restoredRef = useRef(false);

  // ── Step guard: redirect if user is not on the onboarding step ────────────
  useEffect(() => {
    if (stepLoading || !currentStep) return;
    if (currentStep !== "onboarding" && TASJEEL_ROUTES[currentStep]) {
      navigate(TASJEEL_ROUTES[currentStep], { replace: true });
    }
  }, [stepLoading, currentStep, navigate]);

  const [step, setStep]     = useState(1);
  const [saving, setSaving] = useState(false);
  const [foc, setFoc]       = useState<string | null>(null);
  const [showResume, setShowResume] = useState(false);
  const f = (n: string) => ({ onFocus: () => setFoc(n), onBlur: () => setFoc(null) });

  // ── Step 1: Personal ──────────────────────────────────────────────────────
  const [phone,   setPhone]   = useState("");
  const [gender,  setGender]  = useState("");
  const [country, setCountry] = useState("");

  // ── Step 2: Quran ─────────────────────────────────────────────────────────
  const [quranLevel,  setQuranLevel]  = useState("");
  const [memorized,   setMemorized]   = useState<string[]>([]);
  const [tajweed,     setTajweed]     = useState("");
  const [prevTeacher, setPrevTeacher] = useState("");

  // ── Step 3: Arabic / Goals / Review ──────────────────────────────────────
  const [arabic,      setArabic]      = useState("");
  const [goals,       setGoals]       = useState<string[]>([]);
  const [timePrefer,  setTimePrefer]  = useState("");
  const [heardFrom,   setHeardFrom]   = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText,  setReviewText]  = useState("");

  const tog = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  // ── Restore from localStorage ─────────────────────────────────────────────
  useEffect(() => {
    if (!user || restoredRef.current) return;
    restoredRef.current = true;
    const s = load(user.id);
    if (!s) return;
    if (s.step > 1) { setStep(s.step); setShowResume(true); }
    if (s.phone)        setPhone(s.phone);
    if (s.gender)       setGender(s.gender);
    if (s.country)      setCountry(s.country);
    if (s.quranLevel)   setQuranLevel(s.quranLevel);
    if (s.memorized)    setMemorized(s.memorized);
    if (s.tajweed)      setTajweed(s.tajweed);
    if (s.prevTeacher)  setPrevTeacher(s.prevTeacher);
    if (s.arabic)       setArabic(s.arabic);
    if (s.goals)        setGoals(s.goals);
    if (s.timePrefer)   setTimePrefer(s.timePrefer);
    if (s.heardFrom)    setHeardFrom(s.heardFrom);
    if (s.reviewRating) setReviewRating(s.reviewRating);
    if (s.reviewText)   setReviewText(s.reviewText);
  }, [user]);

  // ── Persist on every change ───────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    save(user.id, { step, phone, gender, country, quranLevel, memorized, tajweed, prevTeacher, arabic, goals, timePrefer, heardFrom, reviewRating, reviewText });
  }, [user, step, phone, gender, country, quranLevel, memorized, tajweed, prevTeacher, arabic, goals, timePrefer, heardFrom, reviewRating, reviewText]);

  const reset = () => {
    if (!user) return;
    clear(user.id);
    setStep(1); setPhone(""); setGender(""); setCountry(""); setQuranLevel(""); setMemorized([]); setTajweed(""); setPrevTeacher(""); setArabic(""); setGoals([]); setTimePrefer(""); setHeardFrom(""); setReviewRating(0); setReviewText(""); setShowResume(false);
  };

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from("onboarding_forms" as any).upsert({
        user_id:          user.id,
        phone,
        gender,
        country,
        quran_level:      quranLevel,
        memorized_surahs: memorized,
        tajweed_knowledge: tajweed,
        previous_teacher: prevTeacher,
        arabic_level:     arabic,
        learning_goals:   goals,
        preferred_time:   timePrefer,
        heard_from:       heardFrom,
        review_rating:    reviewRating || null,
        review_comment:   reviewText   || null,
        completed_at:     new Date().toISOString(),
      }, { onConflict: "user_id" });

      await supabase.from("profiles").update({ onboarding_completed: true } as any).eq("user_id", user.id);
      await supabase.from("tasjeel_progress" as any).update({ current_step: "exam", updated_at: new Date().toISOString() } as any).eq("user_id", user.id);

      clear(user.id);
      toast({ title: "✅ Onboarding complete!", description: "Preparing your entrance exam…" });

      const ENTRANCE_EXAM_ID = "36ef6492-2515-44ea-b086-67c9cee02475";
      try {
        const { data: existing } = await supabase.from("exam_attempts").select("id, status").eq("exam_id", ENTRANCE_EXAM_ID).eq("user_id", user.id).eq("status", "in_progress").maybeSingle();
        if (existing) { navigate(`/student/entrance-exam/${existing.id}`); return; }
        const { data: newAttempt, error: err } = await supabase.from("exam_attempts").insert({ exam_id: ENTRANCE_EXAM_ID, user_id: user.id, status: "in_progress", started_at: new Date().toISOString() }).select("id").single();
        if (err || !newAttempt) { navigate("/student/exams"); return; }
        await new Promise(r => setTimeout(r, 500));
        navigate(`/student/entrance-exam/${newAttempt.id}`);
      } catch { navigate("/student/exams"); }
    } catch (e: any) {
      toast({ title: "Error saving form", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const next = () => {
    if (step === 1 && (!phone || !gender || !country)) {
      toast({ title: "Please fill all required fields (*)", variant: "destructive" }); return;
    }
    if (step === 2 && !quranLevel) {
      toast({ title: "Please select your Quran reading level", variant: "destructive" }); return;
    }
    if (step < TOTAL) setStep(s => s + 1);
    else submit();
  };

  const STEP_TITLES = [
    ["Personal Information",      "Quick basics to get you started"],
    ["Your Quran Journey",        "Tell us about your Quran background"],
    ["Arabic, Goals & Feedback",  "Almost done — help us place you correctly"],
  ];
  const [title, subtitle] = STEP_TITLES[step - 1];

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,${G},${GM},#0a1f12)`, display: "flex", flexDirection: "column", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{"@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}} @keyframes spin{to{transform:rotate(360deg)}} @keyframes slideDown{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}"}</style>

      {/* Header */}
      <div style={{ padding: "20px 20px 0", display: "flex", alignItems: "center", gap: 12, maxWidth: 560, margin: "0 auto", width: "100%" }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <BookOpen style={{ width: 20, height: 20, color: GOLD }} />
        </div>
        <div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>Tahleem Academy</div>
          <div style={{ color: "rgba(255,255,255,.6)", fontSize: 12 }}>Student Profile</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 14, color: "rgba(255,255,255,.5)", fontFamily: "serif" }}>بِسْمِ اللَّهِ</div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px 16px 40px" }}>
        <div style={{ width: "100%", maxWidth: 560, background: "#fff", borderRadius: 24, boxShadow: "0 24px 80px rgba(0,0,0,.3)", overflow: "hidden", animation: "fadeUp .4s ease" }}>

          {/* Resume notice */}
          {showResume && (
            <div style={{ background: "#FFF8E1", padding: "12px 20px", borderBottom: "1px solid #F9D46A", display: "flex", alignItems: "center", gap: 10, animation: "slideDown .3s ease" }}>
              <span style={{ fontSize: 18 }}>🔖</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>Progress restored — welcome back!</div>
                <div style={{ fontSize: 12, color: "#78350F" }}>Continuing from Step {step}.</div>
              </div>
              <button onClick={reset} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#92400E", background: "rgba(245,158,11,.1)", border: "1px solid #F9D46A", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontWeight: 600 }}>
                <RotateCcw size={11} /> Start Over
              </button>
            </div>
          )}

          {/* Step header */}
          <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "20px 24px" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 4 }}>Step {step} of {TOTAL}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{title}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginTop: 4 }}>{subtitle}</div>
          </div>

          <div style={{ padding: "24px 24px 28px" }}>
            <ProgBar step={step} />

            {/* ── STEP 1: Personal ── */}
            {step === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={lbl}>Phone Number <span style={{ color: "#ef4444" }}>*</span></label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} {...f("phone")} style={inp(foc === "phone")} placeholder="+234 800 000 0000" type="tel" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={lbl}>Gender <span style={{ color: "#ef4444" }}>*</span></label>
                    <Sel val={gender} onChange={setGender} opts={["Male", "Female"]} />
                  </div>
                  <div>
                    <label style={lbl}>Country <span style={{ color: "#ef4444" }}>*</span></label>
                    <input value={country} onChange={e => setCountry(e.target.value)} {...f("country")} style={inp(foc === "country")} placeholder="e.g. Nigeria" />
                  </div>
                </div>
                <div style={{ background: "#F0FDF4", borderRadius: 12, padding: "12px 16px", border: "1px solid #86EFAC", fontSize: 12, color: "#166534", lineHeight: 1.7 }}>
                  🔒 <strong>Privacy:</strong> Your information is only visible to Tahleem Academy administrators and teachers.
                </div>
              </div>
            )}

            {/* ── STEP 2: Quran ── */}
            {step === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <label style={lbl}>Current Quran Reading Level <span style={{ color: "#ef4444" }}>*</span></label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["none",       "Cannot read Arabic letters yet"],
                      ["letters",    "Know the letters but cannot read words"],
                      ["qaida",      "On Noorani Qaida / basic reader"],
                      ["slow",       "Can read Quran slowly with some mistakes"],
                      ["fluent",     "Can read Quran fluently with Tajweed"],
                      ["memorising", "Currently memorising (Hifz)"],
                      ["hafiz",      "Already a Hafiz (memorised full Quran)"],
                    ].map(([v, l]) => (
                      <Radio key={v} name="quran" val={v} checked={quranLevel === v} onChange={() => setQuranLevel(v)} label={l} />
                    ))}
                  </div>
                </div>

                <div>
                  <label style={lbl}>Surahs you have memorised (select all that apply)</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {["Al-Fatiha","Al-Ikhlas","Al-Falaq","An-Nas","Al-Kawthar","Al-Asr","Al-Fil","Al-Quraish","Al-Maun","Al-Masad","An-Nasr","Al-Zalzalah","Al-Bayyinah","Al-Alaq","Al-Tin","Ad-Duha","Al-Layl","Al-Fajr","Juz Amma (30th Juz)","More than 30 Surahs","Full Quran (Hafiz)"].map(s => (
                      <Chip key={s} label={s} sel={memorized.includes(s)} onClick={() => tog(memorized, s, setMemorized)} />
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={lbl}>Tajweed Knowledge</label>
                    <Sel val={tajweed} onChange={setTajweed} opts={["None", "Basic rules only", "Intermediate", "Advanced / Formal study"]} />
                  </div>
                  <div>
                    <label style={lbl}>Previous teacher / institute</label>
                    <input value={prevTeacher} onChange={e => setPrevTeacher(e.target.value)} {...f("prev")} style={inp(foc === "prev")} placeholder="Optional" />
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 3: Arabic / Goals / Review ── */}
            {step === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <label style={lbl}>Arabic Language Level</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["none",         "No Arabic knowledge"],
                      ["letters",      "Know letters and basic sounds"],
                      ["beginner",     "Can read but don't understand meaning"],
                      ["intermediate", "Basic grammar (Nahw/Sarf) understanding"],
                      ["advanced",     "Advanced — can read and understand Arabic texts"],
                    ].map(([v, l]) => (
                      <Radio key={v} name="arabic" val={v} checked={arabic === v} onChange={() => setArabic(v)} label={l} />
                    ))}
                  </div>
                </div>

                <div>
                  <label style={lbl}>Main learning goals (select all that apply)</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {["Read Quran correctly","Memorise the full Quran","Learn Tajweed","Understand Arabic","Deepen Islamic knowledge","Learn Fiqh","Teach my children","Improve my Salah","Prepare to teach others","General Islamic education"].map(g => (
                      <Chip key={g} label={g} sel={goals.includes(g)} onClick={() => tog(goals, g, setGoals)} />
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={lbl}>Preferred study time</label>
                    <Sel val={timePrefer} onChange={setTimePrefer} opts={["Early morning (Fajr time)","Morning","Afternoon","Evening","Night (after Isha)","Flexible"]} />
                  </div>
                  <div>
                    <label style={lbl}>How did you hear about us?</label>
                    <Sel val={heardFrom} onChange={setHeardFrom} opts={["Social media","Friend / Family","WhatsApp","Google","Mosque / Islamic centre","Other"]} />
                  </div>
                </div>

                {/* Review section */}
                <div style={{ background: "linear-gradient(135deg,#FFFBEB,#FFF8E1)", borderRadius: 16, padding: "18px 20px", border: "2px solid #F9D46A" }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#7C5A0A", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                    <Star size={17} fill={GOLD} color={GOLD} /> Leave a Review for Tahleem Academy
                  </div>
                  <div style={{ fontSize: 12, color: "#92400E", marginBottom: 14, lineHeight: 1.6 }}>
                    We'd love your honest feedback as you begin your journey with us. This helps us improve for every student. بارك الله فيك
                  </div>
                  <div>
                    <label style={{ ...lbl, color: "#7C5A0A" }}>Overall Rating</label>
                    <StarRating value={reviewRating} onChange={setReviewRating} />
                    {reviewRating > 0 && (
                      <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 12 }}>
                        {["","⭐ Poor","⭐⭐ Fair","⭐⭐⭐ Good","⭐⭐⭐⭐ Great","⭐⭐⭐⭐⭐ Excellent!"][reviewRating]}
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ ...lbl, color: "#7C5A0A" }}>Your comment (optional)</label>
                    <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} rows={3} {...f("review")}
                      style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: `2px solid ${foc === "review" ? "#F9D46A" : "#FDE68A"}`, fontSize: 13, outline: "none", color: "#111", background: "#fffbf0", resize: "none" as const, boxSizing: "border-box" as const, fontFamily: "inherit", lineHeight: 1.6 }}
                      placeholder="What brought you to Tahleem Academy? What are you hoping to learn? Any first impressions…" />
                  </div>
                </div>

                <div style={{ background: "#F0FDF4", borderRadius: 14, padding: "14px 16px", border: "1px solid #86EFAC" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#166534", marginBottom: 10 }}>After submitting you will:</div>
                  {["Take a written entrance exam (~15 min)", "Submit a Quran recitation audio recording", "Attend a short live evaluation with an instructor (10–15 min)", "Receive your level assignment — your dashboard unlocks!"].map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#166534", marginBottom: i < 3 ? 7 : 0 }}>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", background: G, color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              {step > 1 && (
                <button type="button" onClick={() => setStep(s => s - 1)}
                  style={{ padding: "13px 20px", borderRadius: 14, border: "2px solid #e5e7eb", background: "#fff", color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                  <ArrowLeft size={16} /> Back
                </button>
              )}
              <button type="button" onClick={next} disabled={saving}
                style={{ flex: 1, padding: "13px 0", borderRadius: 14, border: "none", background: saving ? "#9ca3af" : `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontSize: 15, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 16px rgba(6,78,59,.25)", transition: "all .2s" }}>
                {saving
                  ? <><Loader2 style={{ width: 18, height: 18, animation: "spin .8s linear infinite" }} /> Saving…</>
                  : step === TOTAL
                    ? <><CheckCircle2 size={18} /> Submit & Start Exam</>
                    : <>Next Step <ArrowRight size={16} /></>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
