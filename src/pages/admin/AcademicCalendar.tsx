/* src/pages/admin/AcademicCalendar.tsx — Full calendar with events, class scheduling, Hijri dates, notifications */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, Plus, Calendar, Clock, Users,
  Bell, Trash2, Edit, BookOpen, Video, Star, X, Loader2, Send
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, parseISO } from "date-fns";

const G = "#064E3B";

const EVENT_TYPES = [
  { value:"class",    label:"Class Session",  color:"#3B82F6", bg:"#EFF6FF", icon:"📚" },
  { value:"exam",     label:"Exam",           color:"#DC2626", bg:"#FEF2F2", icon:"📝" },
  { value:"holiday",  label:"Holiday",        color:"#16A34A", bg:"#F0FDF4", icon:"🌙" },
  { value:"event",    label:"General Event",  color:"#7C3AED", bg:"#F5F3FF", icon:"📅" },
  { value:"deadline", label:"Deadline",       color:"#D97706", bg:"#FFF7ED", icon:"⚠️" },
  { value:"meeting",  label:"Meeting",        color:"#0891B2", bg:"#ECFEFF", icon:"💬" },
];

const NOTIFY_TO = [
  { value:"all",      label:"All Users" },
  { value:"students", label:"Students Only" },
  { value:"teachers", label:"Teachers Only" },
];

// Approximate Hijri date (simplified — good enough for display)
function toHijri(date: Date) {
  // Using a known epoch: 1 Muharram 1 AH = 16 July 622 CE (Julian)
  const JD = Math.floor((date.getTime() / 86400000) + 2440587.5);
  const l = JD - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const ll = l - 10631 * n + 354;
  const j = Math.floor((10985 - ll) / 5316) * Math.floor((50 * ll) / 17719) +
    Math.floor(ll / 5670) * Math.floor((43 * ll) / 15238);
  const lll = ll - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * lll) / 709);
  const day = lll - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  const months = ["Muharram","Safar","Rabi I","Rabi II","Jumada I","Jumada II","Rajab","Sha'ban","Ramadan","Shawwal","Dhu al-Qi'dah","Dhu al-Hijjah"];
  const monthsAr = ["محرم","صفر","ربيع الأول","ربيع الثاني","جمادى الأولى","جمادى الثانية","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];
  return { day, month, year, monthName: months[month-1] || "", monthNameAr: monthsAr[month-1] || "" };
}

const AcademicCalendar = () => {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { toast } = useToast();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents]           = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date|null>(null);
  const [dayEvents, setDayEvents]     = useState<any[]>([]);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [editEvent, setEditEvent]     = useState<any|null>(null);
  const [saving, setSaving]           = useState(false);
  const [subjects, setSubjects]       = useState<any[]>([]);

  const [form, setForm] = useState({
    title: "", title_ar: "", description: "",
    date: format(new Date(),"yyyy-MM-dd"), time_start: "09:00", time_end: "10:00",
    event_type: "class", subject_id: "", notify_to: "all",
    send_notification: true, color: "#3B82F6", is_recurring: false,
    recurrence_days: [] as string[],
  });

  const fetchEvents = async () => {
    setLoading(true);
    const start = format(startOfMonth(currentDate),"yyyy-MM-dd");
    const end   = format(endOfMonth(currentDate),"yyyy-MM-dd");
    const { data } = await supabase.from("academic_events" as any)
      .select("*").gte("date", start).lte("date", end).order("date");
    setEvents((data||[]) as any[]);
    setLoading(false);
  };

  useEffect(() => { fetchEvents(); }, [currentDate]);
  useEffect(() => {
    supabase.from("subjects").select("id,title,title_ar").eq("is_active",true).then(({data})=>setSubjects(data||[]));
  }, []);

  const calendarDays = eachDayOfInterval({ start: startOfMonth(currentDate), end: endOfMonth(currentDate) });
  const firstDayOffset = startOfMonth(currentDate).getDay();

  const getEventsForDay = (day: Date) => events.filter(e => e.date && isSameDay(parseISO(e.date), day));

  const handleDayClick = (day: Date) => {
    setSelectedDay(day);
    setDayEvents(getEventsForDay(day));
    setForm(f => ({ ...f, date: format(day,"yyyy-MM-dd") }));
  };

  const openAddEvent = (day?: Date) => {
    setEditEvent(null);
    const d = day || selectedDay || new Date();
    setForm({
      title:"", title_ar:"", description:"",
      date: format(d,"yyyy-MM-dd"), time_start:"09:00", time_end:"10:00",
      event_type:"class", subject_id:"", notify_to:"all",
      send_notification:true, color:"#3B82F6", is_recurring:false, recurrence_days:[],
    });
    setShowEventDialog(true);
  };

  const openEditEvent = (ev: any) => {
    setEditEvent(ev);
    setForm({
      title: ev.title||"", title_ar: ev.title_ar||"", description: ev.description||"",
      date: ev.date, time_start: ev.time_start||"09:00", time_end: ev.time_end||"10:00",
      event_type: ev.event_type||"event", subject_id: ev.subject_id||"", notify_to: ev.notify_to||"all",
      send_notification: false, color: ev.color||"#3B82F6", is_recurring: false, recurrence_days:[],
    });
    setShowEventDialog(true);
  };

  const saveEvent = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title, title_ar: form.title_ar||null, description: form.description||null,
        date: form.date, time_start: form.time_start, time_end: form.time_end,
        event_type: form.event_type, subject_id: form.subject_id||null,
        notify_to: form.notify_to, color: form.color, created_by: user?.id,
      };

      if (editEvent) {
        await supabase.from("academic_events" as any).update(payload as any).eq("id", editEvent.id);
      } else {
        await supabase.from("academic_events" as any).insert(payload as any);
      }

      // Send notifications
      if (form.send_notification && !editEvent) {
        let query = supabase.from("user_roles" as any).select("user_id, role");
        const { data: roles } = await query;
        const targets = (roles||[]).filter((r: any) => {
          if (form.notify_to === "all") return true;
          if (form.notify_to === "students") return r.role === "student";
          if (form.notify_to === "teachers") return ["teacher","admin"].includes(r.role);
          return false;
        });
        if (targets.length) {
          await supabase.from("notifications" as any).insert(
            targets.map((r: any) => ({
              user_id: r.user_id,
              title: `📅 ${form.title}`,
              message: `New event on ${form.date}${form.time_start ? ` at ${form.time_start}` : ""}${form.description ? `: ${form.description}` : ""}`,
              type: "calendar_event",
            }))
          );
        }
      }

      toast({ title: editEvent ? "Event updated" : `✅ Event saved${form.send_notification?" & notifications sent":""}` });
      setShowEventDialog(false);
      fetchEvents();
      if (selectedDay) setDayEvents(getEventsForDay(selectedDay));
    } catch(e: any) {
      toast({ title:"Error", description:e.message, variant:"destructive" });
    } finally { setSaving(false); }
  };

  const deleteEvent = async (id: string) => {
    await supabase.from("academic_events" as any).delete().eq("id", id);
    setEvents(p => p.filter(e => e.id !== id));
    if (selectedDay) setDayEvents(p => p.filter(e => e.id !== id));
    toast({ title:"Deleted" });
  };

  const todayHijri = toHijri(new Date());
  const currentHijri = toHijri(currentDate);

  const typeCfg = (type: string) => EVENT_TYPES.find(t=>t.value===type) || EVENT_TYPES[3];

  return (
    <div style={{ minHeight:"100vh", background:"#F8F9FA" }}>
      {/* Header */}
      <div style={{ background:G, padding:"18px 20px", color:"#fff" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div>
            <h1 style={{ fontWeight:900, fontSize:20, margin:0, fontFamily:"'Playfair Display',serif" }}>Academic Calendar</h1>
            <div style={{ marginTop:4 }}>
              <p style={{ fontSize:14, fontWeight:800, color:"rgba(255,255,255,.9)", margin:0, fontFamily:"'Amiri',serif" }}>
                {currentHijri.day} {currentHijri.monthNameAr} {currentHijri.year} هـ
              </p>
              <p style={{ fontSize:11, color:"rgba(255,255,255,.65)", margin:0 }}>
                {currentHijri.day} {currentHijri.monthName} {currentHijri.year} AH · {format(currentDate,"MMMM yyyy")}
              </p>
            </div>
          </div>
          <Button onClick={()=>openAddEvent()}
            style={{ background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.3)", color:"#fff", borderRadius:12, gap:8, fontWeight:700 }}>
            <Plus size={16}/> Add Event
          </Button>
        </div>
      </div>

      <div style={{ padding:"16px", maxWidth:1100, margin:"0 auto" }}>
        {/* Event type legend */}
        <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
          {EVENT_TYPES.map(et=>(
            <span key={et.value} style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:et.bg, color:et.color, fontWeight:600, display:"flex", alignItems:"center", gap:4 }}>
              {et.icon} {et.label}
            </span>
          ))}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:16, alignItems:"start" }}>
          {/* Calendar grid */}
          <div style={{ background:"#fff", borderRadius:20, border:"1px solid #E5E7EB", overflow:"hidden" }}>
            {/* Month navigation */}
            <div style={{ background:"#F9FAFB", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #E5E7EB" }}>
              <button onClick={()=>setCurrentDate(subMonths(currentDate,1))}
                style={{ width:36, height:36, borderRadius:10, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <ChevronLeft size={18} color="#374151"/>
              </button>
              <div style={{ textAlign:"center" }}>
                <p style={{ fontWeight:900, fontSize:16, color:"#111", margin:0 }}>{format(currentDate,"MMMM yyyy")}</p>
                <p style={{ fontSize:12, fontWeight:700, color:"#9CA3AF", margin:0, fontFamily:"'Amiri',serif" }}>
                  {currentHijri.monthNameAr} {currentHijri.year} هـ
                </p>
              </div>
              <button onClick={()=>setCurrentDate(addMonths(currentDate,1))}
                style={{ width:36, height:36, borderRadius:10, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <ChevronRight size={18} color="#374151"/>
              </button>
            </div>

            {/* Day headers */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", borderBottom:"1px solid #F3F4F6" }}>
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>(
                <div key={d} style={{ padding:"10px 0", textAlign:"center", fontSize:11, fontWeight:700, color:"#9CA3AF" }}>{d}</div>
              ))}
            </div>

            {/* Days grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)" }}>
              {Array.from({length: firstDayOffset}).map((_,i)=>(
                <div key={`empty-${i}`} style={{ minHeight:80, padding:4, borderBottom:"1px solid #F9FAFB", borderRight:"1px solid #F9FAFB" }}/>
              ))}
              {calendarDays.map(day => {
                const dayEvts = getEventsForDay(day);
                const isToday  = isSameDay(day, new Date());
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                const hijri = toHijri(day);
                return (
                  <div key={day.toISOString()} onClick={()=>handleDayClick(day)}
                    style={{
                      minHeight:80, padding:4, borderBottom:"1px solid #F9FAFB", borderRight:"1px solid #F9FAFB",
                      cursor:"pointer", background:isSelected?"#ECFDF5":isToday?"#F0FDF4":"#fff",
                      transition:"background .1s"
                    }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:3 }}>
                      <span style={{ fontSize:13, fontWeight:isToday?900:600,
                        width:24, height:24, borderRadius:"50%", background:isToday?G:"transparent",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        color:isToday?"#fff":"#374151" }}>
                        {format(day,"d")}
                      </span>
                      <span style={{ fontSize:9, color:"#9CA3AF", fontFamily:"'Amiri',serif", lineHeight:1 }}>
                        {hijri.day}
                      </span>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                      {dayEvts.slice(0,3).map(ev=>{
                        const tc = typeCfg(ev.event_type);
                        return (
                          <div key={ev.id} style={{ fontSize:10, fontWeight:600, padding:"1px 5px", borderRadius:4, background:tc.bg, color:tc.color, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                            {tc.icon} {ev.title}
                          </div>
                        );
                      })}
                      {dayEvts.length > 3 && <span style={{ fontSize:9, color:"#9CA3AF", paddingLeft:2 }}>+{dayEvts.length-3} more</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day detail panel */}
          <div style={{ position:"sticky", top:20 }}>
            {selectedDay ? (
              <div style={{ background:"#fff", borderRadius:20, border:"1px solid #E5E7EB", overflow:"hidden" }}>
                <div style={{ background:G, padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <p style={{ fontWeight:800, fontSize:15, color:"#fff", margin:0 }}>{format(selectedDay,"EEEE, MMMM d")}</p>
                    <p style={{ fontSize:12, fontWeight:700, color:"rgba(255,255,255,.75)", margin:0, fontFamily:"'Amiri',serif" }}>
                      {toHijri(selectedDay).day} {toHijri(selectedDay).monthNameAr} {toHijri(selectedDay).year} هـ
                    </p>
                  </div>
                  <button onClick={()=>openAddEvent(selectedDay)}
                    style={{ width:32, height:32, borderRadius:8, background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.3)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <Plus size={16} color="#fff"/>
                  </button>
                </div>
                <div style={{ padding:14 }}>
                  {dayEvents.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"24px 0" }}>
                      <Calendar size={28} color="#D1D5DB" style={{ margin:"0 auto 8px" }}/>
                      <p style={{ fontSize:13, color:"#9CA3AF", margin:0 }}>No events this day</p>
                      <button onClick={()=>openAddEvent(selectedDay)}
                        style={{ marginTop:12, fontSize:12, color:G, fontWeight:700, background:"none", border:"none", cursor:"pointer" }}>
                        + Add event
                      </button>
                    </div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {dayEvents.map(ev=>{
                        const tc = typeCfg(ev.event_type);
                        const subj = subjects.find(s=>s.id===ev.subject_id);
                        return (
                          <div key={ev.id} style={{ background:tc.bg, borderRadius:12, padding:"10px 12px", border:`1px solid ${tc.color}33` }}>
                            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:4 }}>
                              <p style={{ fontWeight:700, fontSize:13, color:tc.color, margin:0 }}>
                                {tc.icon} {language==="ar"?ev.title_ar||ev.title:ev.title}
                              </p>
                              <div style={{ display:"flex", gap:4 }}>
                                <button onClick={()=>openEditEvent(ev)} style={{ background:"none", border:"none", cursor:"pointer", padding:2 }}><Edit size={12} color={tc.color}/></button>
                                <button onClick={()=>deleteEvent(ev.id)} style={{ background:"none", border:"none", cursor:"pointer", padding:2 }}><Trash2 size={12} color="#DC2626"/></button>
                              </div>
                            </div>
                            {(ev.time_start||ev.time_end) && (
                              <p style={{ fontSize:11, color:tc.color, opacity:.8, margin:0, display:"flex", alignItems:"center", gap:4 }}>
                                <Clock size={10}/> {ev.time_start}{ev.time_end?` - ${ev.time_end}`:""}
                              </p>
                            )}
                            {subj && <p style={{ fontSize:11, color:tc.color, opacity:.7, margin:"2px 0 0", display:"flex", alignItems:"center", gap:4 }}><BookOpen size={10}/> {language==="ar"?subj.title_ar||subj.title:subj.title}</p>}
                            {ev.description && <p style={{ fontSize:11, color:"#6B7280", margin:"4px 0 0", lineHeight:1.5 }}>{ev.description}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ background:"#fff", borderRadius:20, border:"2px dashed #E5E7EB", padding:"40px 24px", textAlign:"center" }}>
                <Calendar size={40} color="#D1D5DB" style={{ margin:"0 auto 12px" }}/>
                <p style={{ fontWeight:700, color:"#374151", marginBottom:6 }}>Select a day</p>
                <p style={{ fontSize:13, color:"#9CA3AF" }}>Click any date to view or add events</p>
              </div>
            )}

            {/* Upcoming events */}
            <div style={{ background:"#fff", borderRadius:20, border:"1px solid #E5E7EB", padding:16, marginTop:12 }}>
              <h3 style={{ fontWeight:700, fontSize:14, color:"#111", marginBottom:12 }}>This Month</h3>
              {events.length === 0 ? (
                <p style={{ fontSize:12, color:"#9CA3AF" }}>No events this month</p>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {events.slice(0,8).map(ev=>{
                    const tc = typeCfg(ev.event_type);
                    return (
                      <div key={ev.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:16 }}>{tc.icon}</span>
                        <div style={{ flex:1 }}>
                          <p style={{ fontSize:12, fontWeight:600, color:"#374151", margin:0 }}>{ev.title}</p>
                          <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>{ev.date}{ev.time_start?` · ${ev.time_start}`:""}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Event Dialog */}
      <Dialog open={showEventDialog} onOpenChange={v=>{if(!v)setShowEventDialog(false);}}>
        <DialogContent style={{ maxWidth:520, borderRadius:20, padding:0, maxHeight:"92vh", overflowY:"auto" }}>
          <div style={{ background:G, padding:"18px 20px", borderRadius:"20px 20px 0 0", display:"flex", alignItems:"center", gap:10 }}>
            <Calendar size={20} color="#fff"/>
            <h2 style={{ fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>{editEvent?"Edit Event":"New Calendar Event"}</h2>
          </div>
          <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
            {/* Event type */}
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:8 }}>Event Type</label>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {EVENT_TYPES.map(et=>(
                  <button key={et.value} onClick={()=>setForm(f=>({...f,event_type:et.value,color:et.color}))}
                    style={{ padding:"6px 12px", borderRadius:20, border:`2px solid ${form.event_type===et.value?et.color:"#E5E7EB"}`, background:form.event_type===et.value?et.bg:"#fff", cursor:"pointer", fontSize:11, fontWeight:700, color:form.event_type===et.value?et.color:"#6B7280" }}>
                    {et.icon} {et.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Title (English) *</label><Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} style={{ borderRadius:10 }}/></div>
              <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>العنوان (عربي)</label><Input dir="rtl" value={form.title_ar} onChange={e=>setForm(f=>({...f,title_ar:e.target.value}))} style={{ borderRadius:10 }}/></div>
            </div>

            <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Description</label><Textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={2} style={{ borderRadius:10 }}/></div>

            {/* Date & Time */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
              <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Date</label><Input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{ borderRadius:10 }}/></div>
              <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Start</label><Input type="time" value={form.time_start} onChange={e=>setForm(f=>({...f,time_start:e.target.value}))} style={{ borderRadius:10 }}/></div>
              <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>End</label><Input type="time" value={form.time_end} onChange={e=>setForm(f=>({...f,time_end:e.target.value}))} style={{ borderRadius:10 }}/></div>
            </div>

            {/* Subject */}
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Link to Subject (optional)</label>
              <Select value={form.subject_id} onValueChange={v=>setForm(f=>({...f,subject_id:v}))}>
                <SelectTrigger style={{ borderRadius:10 }}><SelectValue placeholder="Select subject"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {subjects.map(s=><SelectItem key={s.id} value={s.id}>{language==="ar"?s.title_ar||s.title:s.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Notification */}
            {!editEvent && (
              <div style={{ background:"#F0FDF4", borderRadius:12, padding:"12px 14px", border:"1px solid #86EFAC" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <Bell size={14} color={G}/>
                    <span style={{ fontSize:13, fontWeight:700, color:G }}>Send Notification</span>
                  </div>
                  <Switch checked={form.send_notification} onCheckedChange={v=>setForm(f=>({...f,send_notification:v}))}/>
                </div>
                {form.send_notification && (
                  <Select value={form.notify_to} onValueChange={v=>setForm(f=>({...f,notify_to:v}))}>
                    <SelectTrigger style={{ borderRadius:9, fontSize:13 }}><SelectValue/></SelectTrigger>
                    <SelectContent>
                      {NOTIFY_TO.map(n=><SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <Button onClick={saveEvent} disabled={!form.title||saving}
              style={{ background:G, borderRadius:12, height:44, gap:8, fontWeight:700, fontSize:14 }}>
              {saving?<><Loader2 size={16} style={{ animation:"spin .8s linear infinite" }}/> Saving…</>:<><Send size={16}/> {editEvent?"Update Event":"Save & Notify"}</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default AcademicCalendar;
