/*  src/pages/student/Onboarding.tsx
    4-step onboarding form after registration payment.
    Step 1: Personal details
    Step 2: Quran background
    Step 3: Arabic & Islamic knowledge
    Step 4: Goals & schedule → then start entrance exam
*/
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, ArrowRight, ArrowLeft, CheckCircle2,
  Loader2, ChevronDown
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#D4A843";
const TOTAL = 4;

const inputSt = (focused: boolean): React.CSSProperties => ({
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: `2px solid ${focused ? GM : "#e5e7eb"}`,
  fontSize: 14, outline: "none", color: "#111", background: "#fafafa",
  transition: "border-color .2s, box-shadow .2s", boxSizing: "border-box" as const,
  boxShadow: focused ? "0 0 0 4px rgba(6,78,59,.08)" : "none",
  fontFamily: "inherit",
});

const selSt: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: "2px solid #e5e7eb", fontSize: 14, outline: "none",
  color: "#111", background: "#fafafa", fontFamily: "inherit",
  appearance: "none" as any, cursor: "pointer",
  boxSizing: "border-box" as const,
};

const lbl: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: "#374151",
  marginBottom: 6, display: "block",
};

const Radio = ({ name, val, checked, label, onChange }: any) => (
  <label style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:10, border:`2px solid ${checked ? GM : "#e5e7eb"}`, background: checked ? "#F0FDF4" : "#fafafa", cursor:"pointer", fontSize:13, color:"#333", transition:"all .15s" }}>
    <input type="radio" name={name} value={val} checked={checked} onChange={onChange} style={{ display:"none" }} />
    <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${checked ? GM : "#d1d5db"}`, background: checked ? GM : "#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
      {checked && <div style={{ width:6, height:6, borderRadius:"50%", background:"#fff" }} />}
    </div>
    {label}
  </label>
);

const Chip = ({ label, sel, onClick }: { label: string; sel: boolean; onClick: () => void }) => (
  <button type="button" onClick={onClick}
    style={{ padding:"7px 14px", borderRadius:20, border:`2px solid ${sel ? GM : "#e5e7eb"}`, background: sel ? "#F0FDF4" : "#fafafa", color: sel ? G : "#666", fontSize:12, fontWeight: sel ? 700 : 500, cursor:"pointer", transition:"all .15s", display:"flex", alignItems:"center", gap:6 }}>
    {sel && <CheckCircle2 size={11} color={GM} />}{label}
  </button>
);

const Sel = ({ val, onChange, opts, placeholder }: { val: string; onChange: (v: string) => void; opts: string[]; placeholder?: string }) => (
  <div style={{ position:"relative" }}>
    <select value={val} onChange={e => onChange(e.target.value)} style={selSt}>
      <option value="">{placeholder || "Select…"}</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
    <ChevronDown size={14} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", color:"#666", pointerEvents:"none" }} />
  </div>
);

const ProgBar = ({ step }: { step: number }) => (
  <div style={{ marginBottom:24 }}>
    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
      <span style={{ fontSize:12, fontWeight:700, color:GM }}>Step {step} of {TOTAL}</span>
      <span style={{ fontSize:12, color:"#9ca3af" }}>{Math.round((step/TOTAL)*100)}% complete</span>
    </div>
    <div style={{ height:6, background:"#e5e7eb", borderRadius:6, overflow:"hidden" }}>
      <div style={{ height:"100%", width:`${(step/TOTAL)*100}%`, background:`linear-gradient(90deg,${G},${GM})`, borderRadius:6, transition:"width .4s ease" }} />
    </div>
  </div>
);

const Onboarding = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [foc, setFoc] = useState<string|null>(null);
  const f = (n: string) => ({ onFocus: () => setFoc(n), onBlur: () => setFoc(null) });

  // Step 1
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [occupation, setOccupation] = useState("");

  // Step 2
  const [quranLevel, setQuranLevel] = useState("");
  const [memorized, setMemorized] = useState<string[]>([]);
  const [yearsStudy, setYearsStudy] = useState("");
  const [tajweed, setTajweed] = useState("");
  const [prevTeacher, setPrevTeacher] = useState("");

  // Step 3
  const [arabic, setArabic] = useState("");
  const [islamic, setIslamic] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);

  // Step 4
  const [goals, setGoals] = useState<string[]>([]);
  const [hours, setHours] = useState("");
  const [timePrefer, setTimePrefer] = useState("");
  const [device, setDevice] = useState("");
  const [heardFrom, setHeardFrom] = useState("");
  const [notes, setNotes] = useState("");

  const tog = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from("onboarding_forms" as any).upsert({
        user_id: user.id,
        phone, dob, gender, country, city, occupation,
        quran_level: quranLevel, memorized_surahs: memorized,
        years_studying: yearsStudy, tajweed_knowledge: tajweed,
        previous_teacher: prevTeacher, arabic_level: arabic,
        islamic_knowledge: islamic, preferred_subjects: subjects,
        learning_goals: goals, hours_per_day: hours,
        preferred_time: timePrefer, preferred_device: device,
        heard_from: heardFrom, extra_notes: notes,
        completed_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      await supabase.from("profiles").update({ onboarding_completed: true } as any).eq("user_id", user.id);
      toast({ title: "✅ Onboarding complete!", description: "Preparing your entrance exam…" });

      // FIX: create exam_attempt before navigating so the route has an attemptId
      const ENTRANCE_EXAM_ID = "36ef6492-2515-44ea-b086-67c9cee02475";
      try {
        // Check if attempt already exists
        const { data: existing } = await supabase
          .from("exam_attempts")
          .select("id, status")
          .eq("exam_id", ENTRANCE_EXAM_ID)
          .eq("user_id", user.id)
          .eq("status", "in_progress")
          .maybeSingle();

        if (existing) {
          navigate(`/student/entrance-exam/${existing.id}`);
          return;
        }

        // Create new attempt
        const { data: newAttempt, error: attemptErr } = await supabase
          .from("exam_attempts")
          .insert({
            exam_id: ENTRANCE_EXAM_ID,
            user_id: user.id,
            status: "in_progress",
            started_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (attemptErr || !newAttempt) {
          // Fall back to exams page if creation fails
          navigate("/student/exams");
          return;
        }
        navigate(`/student/entrance-exam/${newAttempt.id}`);
      } catch {
        navigate("/student/exams");
      }
    } catch (e: any) {
      toast({ title: "Error saving form", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const next = () => {
    if (step === 1 && (!phone || !dob || !gender || !country)) {
      toast({ title: "Fill all required fields (*)", variant: "destructive" }); return;
    }
    if (step === 2 && !quranLevel) {
      toast({ title: "Please select your Quran level", variant: "destructive" }); return;
    }
    if (step < TOTAL) setStep(s => s + 1);
    else submit();
  };

  const STEP_TITLES = [
    ["Personal Information",    "Tell us about yourself"],
    ["Quran Background",        "Your Quran journey so far"],
    ["Arabic & Islamic Studies","Your knowledge background"],
    ["Goals & Schedule",        "Help us find the best plan for you"],
  ];
  const [title, subtitle] = STEP_TITLES[step - 1];

  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(160deg,${G},${GM},#0a1f12)`, display:"flex", flexDirection:"column", fontFamily:"'Segoe UI', system-ui, sans-serif" }}>
      <style>{"@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}} @keyframes spin{to{transform:rotate(360deg)}}"}</style>

      {/* Header */}
      <div style={{ padding:"20px 20px 0", display:"flex", alignItems:"center", gap:12, maxWidth:560, margin:"0 auto", width:"100%" }}>
        <div style={{ width:40, height:40, borderRadius:12, background:"rgba(255,255,255,.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <BookOpen style={{ width:20, height:20, color:GOLD }} />
        </div>
        <div>
          <div style={{ color:"#fff", fontWeight:800, fontSize:16 }}>Tahleem Academy</div>
          <div style={{ color:"rgba(255,255,255,.6)", fontSize:12 }}>Student Onboarding</div>
        </div>
        <div style={{ marginLeft:"auto", fontSize:11, color:"rgba(255,255,255,.5)", fontFamily:"serif" }}>بِسْمِ اللَّهِ</div>
      </div>

      <div style={{ flex:1, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"20px 16px 40px" }}>
        <div style={{ width:"100%", maxWidth:560, background:"#fff", borderRadius:24, boxShadow:"0 24px 80px rgba(0,0,0,.3)", overflow:"hidden", animation:"fadeUp .4s ease" }}>

          {/* Banner */}
          <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"20px 24px" }}>
            <div style={{ fontSize:11, color:"rgba(255,255,255,.5)", textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>{title}</div>
            <div style={{ fontSize:20, fontWeight:800, color:"#fff" }}>{title}</div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,.6)", marginTop:4 }}>{subtitle}</div>
          </div>

          <div style={{ padding:"24px 24px 28px" }}>
            <ProgBar step={step} />

            {/* STEP 1 */}
            {step === 1 && (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div>
                    <label style={lbl}>Phone <span style={{color:"#ef4444"}}>*</span></label>
                    <input value={phone} onChange={e=>setPhone(e.target.value)} {...f("phone")} style={inputSt(foc==="phone")} placeholder="+234 800 000 0000" type="tel" />
                  </div>
                  <div>
                    <label style={lbl}>Date of Birth <span style={{color:"#ef4444"}}>*</span></label>
                    <input value={dob} onChange={e=>setDob(e.target.value)} {...f("dob")} style={inputSt(foc==="dob")} type="date" />
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div>
                    <label style={lbl}>Gender <span style={{color:"#ef4444"}}>*</span></label>
                    <Sel val={gender} onChange={setGender} opts={["Male","Female"]} />
                  </div>
                  <div>
                    <label style={lbl}>Occupation</label>
                    <Sel val={occupation} onChange={setOccupation} opts={["Student","Working professional","Business owner","Homemaker","Retired","Other"]} />
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div>
                    <label style={lbl}>Country <span style={{color:"#ef4444"}}>*</span></label>
                    <input value={country} onChange={e=>setCountry(e.target.value)} {...f("country")} style={inputSt(foc==="country")} placeholder="e.g. Nigeria" />
                  </div>
                  <div>
                    <label style={lbl}>City / State</label>
                    <input value={city} onChange={e=>setCity(e.target.value)} {...f("city")} style={inputSt(foc==="city")} placeholder="e.g. Lagos" />
                  </div>
                </div>
                <div style={{ background:"#F0FDF4", borderRadius:12, padding:"12px 16px", border:"1px solid #86EFAC", fontSize:12, color:"#166534", lineHeight:1.6 }}>
                  <strong>Privacy note:</strong> Your information is private and only visible to Tahleem Academy administrators.
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                <div>
                  <label style={lbl}>Current Quran Reading Level <span style={{color:"#ef4444"}}>*</span></label>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {[
                      ["none",       "Cannot read Arabic letters yet"],
                      ["letters",    "Know the letters but cannot read words"],
                      ["qaida",      "On Noorani Qaida / basic reader"],
                      ["slow",       "Can read Quran slowly with mistakes"],
                      ["fluent",     "Can read Quran fluently with Tajweed"],
                      ["memorising", "Currently memorising (Hifz)"],
                      ["hafiz",      "Already a Hafiz (memorised full Quran)"],
                    ].map(([v,l]) => <Radio key={v} name="quran" val={v} checked={quranLevel===v} onChange={() => setQuranLevel(v)} label={l} />)}
                  </div>
                </div>
                <div>
                  <label style={lbl}>Surahs memorised (select all)</label>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {["Al-Fatiha","Al-Ikhlas","Al-Falaq","An-Nas","Al-Kawthar","Al-Asr","Al-Fil","Al-Quraish","Al-Maun","Al-Masad","An-Nasr","Al-Zalzalah","Al-Bayyinah","Al-Alaq","Al-Tin","Ad-Duha","Al-Layl","Al-Ghashiyah","Al-Fajr","More than 30","Full Quran"].map(s => (
                      <Chip key={s} label={s} sel={memorized.includes(s)} onClick={() => tog(memorized, s, setMemorized)} />
                    ))}
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div>
                    <label style={lbl}>Years studying Quran</label>
                    <Sel val={yearsStudy} onChange={setYearsStudy} opts={["Less than 1 year","1–2 years","3–5 years","5–10 years","More than 10 years"]} />
                  </div>
                  <div>
                    <label style={lbl}>Tajweed knowledge</label>
                    <Sel val={tajweed} onChange={setTajweed} opts={["None","Basic rules only","Intermediate","Advanced / Formal study"]} />
                  </div>
                </div>
                <div>
                  <label style={lbl}>Previous teacher / institute (if any)</label>
                  <input value={prevTeacher} onChange={e=>setPrevTeacher(e.target.value)} {...f("prev")} style={inputSt(foc==="prev")} placeholder="e.g. Sheikh Abdullahi, Al-Noor Institute" />
                </div>
              </div>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                <div>
                  <label style={lbl}>Arabic Language Level</label>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {[
                      ["none","No Arabic knowledge"],
                      ["letters","Know letters and basic sounds"],
                      ["beginner","Can read but don't understand meaning"],
                      ["intermediate","Basic grammar (Nahw/Sarf) understanding"],
                      ["advanced","Advanced — can read and understand texts"],
                    ].map(([v,l]) => <Radio key={v} name="arabic" val={v} checked={arabic===v} onChange={() => setArabic(v)} label={l} />)}
                  </div>
                </div>
                <div>
                  <label style={lbl}>Islamic Studies Knowledge</label>
                  <Sel val={islamic} onChange={setIslamic} opts={["Very basic — pillars only","Intermediate — some Fiqh & Aqeedah","Advanced — studied with a scholar","Self-taught — read extensively"]} />
                </div>
                <div>
                  <label style={lbl}>Subjects you are most interested in (select all)</label>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {["Quran Recitation","Quran Memorisation (Hifz)","Tajweed Rules","Arabic Grammar","Arabic Vocabulary","Fiqh (Jurisprudence)","Aqeedah (Creed)","Quran Tafseer","Hadith","Seerah","Islamic History"].map(s => (
                      <Chip key={s} label={s} sel={subjects.includes(s)} onClick={() => tog(subjects, s, setSubjects)} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4 */}
            {step === 4 && (
              <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                <div>
                  <label style={lbl}>Your main learning goals (select all)</label>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {["Read Quran correctly","Memorise the full Quran","Learn Tajweed","Understand Arabic","Deepen Islamic knowledge","Learn Fiqh","Teach my children","Improve my Salah","Prepare to teach","General Islamic education"].map(g => (
                      <Chip key={g} label={g} sel={goals.includes(g)} onClick={() => tog(goals, g, setGoals)} />
                    ))}
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div>
                    <label style={lbl}>Study hours per day</label>
                    <Sel val={hours} onChange={setHours} opts={["Less than 30 min","30 min – 1 hour","1–2 hours","2–3 hours","More than 3 hours"]} />
                  </div>
                  <div>
                    <label style={lbl}>Preferred time to learn</label>
                    <Sel val={timePrefer} onChange={setTimePrefer} opts={["Early morning (Fajr)","Morning","Afternoon","Evening","Night (after Isha)","Flexible"]} />
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div>
                    <label style={lbl}>Primary device</label>
                    <Sel val={device} onChange={setDevice} opts={["Mobile phone","Tablet","Laptop / PC","Multiple devices"]} />
                  </div>
                  <div>
                    <label style={lbl}>How did you hear about us?</label>
                    <Sel val={heardFrom} onChange={setHeardFrom} opts={["Social media","Friend / Family","WhatsApp","Google","Mosque / Islamic centre","Other"]} />
                  </div>
                </div>
                <div>
                  <label style={lbl}>Anything else for your teacher to know?</label>
                  <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} {...f("notes")}
                    style={{ ...inputSt(foc==="notes"), resize:"none", lineHeight:1.5 }}
                    placeholder="Health conditions, learning difficulties, special requests…" />
                </div>
                <div style={{ background:"#FFF8E1", borderRadius:12, padding:"14px 16px", border:"1px solid #F9D46A" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#92400E", marginBottom:8 }}>After submitting, you will:</div>
                  {["Take a written entrance exam (~15 min)","Submit a recitation audio of Surah Al-Fatiha","Attend a live evaluation with a teacher (10–15 min)","Receive your level assignment from the admin"].map((s,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:i<3?6:0, fontSize:12, color:"#78350F" }}>
                      <div style={{ width:18, height:18, borderRadius:"50%", background:GOLD, color:"#fff", fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>{i+1}</div>
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Nav buttons */}
            <div style={{ display:"flex", gap:10, marginTop:24 }}>
              {step > 1 && (
                <button type="button" onClick={() => setStep(s => s-1)}
                  style={{ padding:"13px 20px", borderRadius:14, border:"2px solid #e5e7eb", background:"#fff", color:"#555", fontSize:14, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
                  <ArrowLeft size={16} /> Back
                </button>
              )}
              <button type="button" onClick={next} disabled={saving}
                style={{ flex:1, padding:"13px 0", borderRadius:14, border:"none", background:saving?"#9ca3af":`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:15, fontWeight:800, cursor:saving?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:"0 4px 16px rgba(6,78,59,.25)", transition:"all .2s" }}>
                {saving
                  ? <><Loader2 style={{ width:18, height:18, animation:"spin .8s linear infinite" }} /> Saving…</>
                  : step === TOTAL
                  ? <><CheckCircle2 size={18} /> Submit &amp; Start Exam</>
                  : <>Next Step <ArrowRight size={16} /></>
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
