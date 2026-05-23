/*
  src/pages/public/LiveClasses.tsx — Tahleem Academy
  ────────────────────────────────────────────────────
  PUBLIC route: /live and /public/classes
  Shows public_classes (not internal subjects).
  Visitors can browse upcoming/live classes and click
  through to JoinClass (/live/:roomCode).
*/

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow, isPast } from "date-fns";
import {
  Radio, Calendar, Users, Clock, BookOpen,
  ChevronRight, Lock, Star, Video, ArrowRight, UserPlus,
} from "lucide-react";

const G    = "#064E3B";
const GOLD = "#c9973a";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Amiri:wght@400;700&display=swap');
  @keyframes lc-pulse { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.8)} }
  @keyframes lc-fade  { from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)} }
  @keyframes lc-spin  { to{transform:rotate(360deg)} }
  .lc-card {
    background:#fff; border-radius:16px;
    border:1px solid rgba(6,78,59,.1);
    box-shadow:0 2px 12px rgba(6,78,59,.06);
    transition:transform .2s ease, box-shadow .2s ease;
    overflow:hidden; animation:lc-fade .35s ease both;
    text-decoration:none; display:block; color:inherit;
  }
  .lc-card:hover {
    transform:translateY(-3px);
    box-shadow:0 8px 28px rgba(6,78,59,.13);
    border-color:rgba(6,78,59,.25);
  }
  .lc-badge {
    display:inline-flex; align-items:center; gap:4px;
    padding:3px 9px; border-radius:20px;
    font-size:11px; font-weight:700; white-space:nowrap;
  }
`;

const LiveClasses = () => {
  // Fetch public_classes — live and upcoming, newest first
  const { data: classes, isLoading } = useQuery({
    queryKey: ["public-live-classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_classes")
        .select("*")
        .in("status", ["live", "scheduled"])
        .order("scheduled_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 10_000,
  });

  // Also fetch recently ended classes (last 3) as "Past Classes"
  const { data: ended } = useQuery({
    queryKey: ["public-ended-classes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("public_classes")
        .select("*")
        .eq("status", "ended")
        .order("actual_end_time", { ascending: false })
        .limit(3);
      return data || [];
    },
  });

  const liveClasses      = (classes || []).filter((c: any) => c.status === "live");
  const upcomingClasses  = (classes || []).filter((c: any) => c.status === "scheduled");

  return (
    <div style={{ minHeight:"100vh", background:"#f0faf5", fontFamily:"'Cairo',sans-serif" }}>
      <style>{CSS}</style>

      {/* ── Hero ── */}
      <div style={{ background:`linear-gradient(135deg, ${G} 0%, #0a5c40 100%)`, padding:"48px 20px 56px", textAlign:"center", position:"relative", overflow:"hidden" }}>
        {/* decorative circles */}
        <div style={{ position:"absolute", top:-60, right:-60, width:200, height:200, borderRadius:"50%", background:"rgba(255,255,255,.04)" }} />
        <div style={{ position:"absolute", bottom:-40, left:-40, width:160, height:160, borderRadius:"50%", background:"rgba(201,151,58,.1)" }} />

        <p style={{ fontFamily:"'Amiri',serif", fontSize:18, color:"rgba(201,151,58,.9)", marginBottom:8, position:"relative" }}>
          بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
        </p>
        <h1 style={{ fontSize:32, fontWeight:800, color:"#fff", marginBottom:8, position:"relative" }}>
          Live Classes
        </h1>
        <p style={{ fontSize:15, color:"rgba(255,255,255,.65)", maxWidth:480, margin:"0 auto 24px", lineHeight:1.6, position:"relative" }}>
          Free public Islamic knowledge sessions — open to everyone.
          No account required to join.
        </p>

        {liveClasses.length > 0 && (
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(239,68,68,.18)", border:"1px solid rgba(239,68,68,.35)", borderRadius:24, padding:"8px 18px", position:"relative" }}>
            <span style={{ width:8, height:8, borderRadius:"50%", background:"#ef4444", display:"inline-block", animation:"lc-pulse 1.5s ease-in-out infinite" }} />
            <span style={{ color:"#fca5a5", fontWeight:700, fontSize:14 }}>
              {liveClasses.length} class{liveClasses.length > 1 ? "es" : ""} happening NOW
            </span>
          </div>
        )}
      </div>

      <div style={{ maxWidth:720, margin:"0 auto", padding:"28px 16px 48px" }}>

        {/* ── LIVE NOW ── */}
        {liveClasses.length > 0 && (
          <section style={{ marginBottom:36 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
              <span style={{ width:8, height:8, borderRadius:"50%", background:"#ef4444", animation:"lc-pulse 1.5s ease-in-out infinite" }} />
              <h2 style={{ fontSize:17, fontWeight:800, color:G, margin:0 }}>Live Right Now</h2>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {liveClasses.map((cls: any, i: number) => (
                <Link key={cls.id} to={`/live/${cls.room_code}`} className="lc-card" style={{ animationDelay:`${i*0.06}s` }}>
                  <div style={{ background:`linear-gradient(90deg, rgba(239,68,68,.08) 0%, transparent 100%)`, borderBottom:"1px solid rgba(239,68,68,.1)", padding:"12px 16px", display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:"#ef4444", animation:"lc-pulse 1.5s ease-in-out infinite", flexShrink:0 }} />
                    <span style={{ fontSize:12, fontWeight:700, color:"#dc2626" }}>LIVE NOW</span>
                    {cls.is_featured && <span style={{ marginLeft:"auto" }}><Star style={{ width:13, height:13, color:GOLD, fill:GOLD }} /></span>}
                  </div>
                  <ClassCardBody cls={cls} />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── UPCOMING ── */}
        {isLoading ? (
          <div style={{ display:"flex", justifyContent:"center", padding:"48px 0" }}>
            <div style={{ width:36, height:36, border:"3px solid rgba(6,78,59,.15)", borderTopColor:G, borderRadius:"50%", animation:"lc-spin .8s linear infinite" }} />
          </div>
        ) : upcomingClasses.length > 0 ? (
          <section style={{ marginBottom:36 }}>
            <h2 style={{ fontSize:17, fontWeight:800, color:G, marginBottom:14, display:"flex", alignItems:"center", gap:7 }}>
              <Calendar style={{ width:17, height:17 }} /> Upcoming Classes
            </h2>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {upcomingClasses.map((cls: any, i: number) => (
                <Link key={cls.id} to={`/live/${cls.room_code}`} className="lc-card" style={{ animationDelay:`${i*0.07}s` }}>
                  <div style={{ background:"rgba(6,78,59,.03)", borderBottom:"1px solid rgba(6,78,59,.08)", padding:"10px 16px", display:"flex", alignItems:"center", gap:8 }}>
                    <div className="lc-badge" style={{ background:"rgba(6,78,59,.1)", color:G }}>
                      <Calendar style={{ width:10, height:10 }} /> Upcoming
                    </div>
                    {cls.is_featured && <Star style={{ width:13, height:13, color:GOLD, fill:GOLD, marginLeft:"auto" }} />}
                  </div>
                  <ClassCardBody cls={cls} />
                </Link>
              ))}
            </div>
          </section>
        ) : !isLoading && liveClasses.length === 0 && (
          /* No classes at all */
          <div style={{ textAlign:"center", padding:"56px 20px", background:"#fff", borderRadius:20, border:"1px solid rgba(6,78,59,.1)" }}>
            <div style={{ width:72, height:72, borderRadius:"50%", background:"rgba(6,78,59,.07)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
              <BookOpen style={{ width:32, height:32, color:G }} />
            </div>
            <h3 style={{ fontSize:20, fontWeight:700, color:G, marginBottom:8 }}>No Classes Scheduled Yet</h3>
            <p style={{ fontSize:14, color:"rgba(6,78,59,.6)", maxWidth:340, margin:"0 auto 24px", lineHeight:1.6 }}>
              Check back soon — public classes are added regularly.
            </p>
          </div>
        )}

        {/* ── PAST CLASSES ── */}
        {(ended || []).length > 0 && (
          <section style={{ marginBottom:36 }}>
            <h2 style={{ fontSize:16, fontWeight:700, color:"rgba(6,78,59,.6)", marginBottom:12, display:"flex", alignItems:"center", gap:7 }}>
              <Clock style={{ width:15, height:15 }} /> Recently Ended
            </h2>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {(ended || []).map((cls: any) => (
                <Link key={cls.id} to={`/live/${cls.room_code}`} className="lc-card" style={{ opacity:.7 }}>
                  <div style={{ padding:"12px 16px", display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:38, height:38, borderRadius:10, background:"rgba(6,78,59,.07)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <Video style={{ width:17, height:17, color:G }} />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:14, fontWeight:700, color:G, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cls.title}</p>
                      {cls.title_ar && <p style={{ fontSize:12, color:GOLD, fontFamily:"'Amiri',serif", margin:0 }}>{cls.title_ar}</p>}
                    </div>
                    <div className="lc-badge" style={{ background:"rgba(6,78,59,.07)", color:"rgba(6,78,59,.5)" }}>Ended</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── CTA ── */}
        <div style={{ background:`linear-gradient(135deg, ${G} 0%, #0a5c40 100%)`, borderRadius:20, padding:"28px 24px", textAlign:"center" }}>
          <p style={{ fontFamily:"'Amiri',serif", fontSize:16, color:GOLD, marginBottom:6 }}>انضم إلى مجتمع المتعلمين</p>
          <h3 style={{ fontSize:20, fontWeight:800, color:"#fff", marginBottom:8 }}>Want Full Access?</h3>
          <p style={{ fontSize:13, color:"rgba(255,255,255,.6)", maxWidth:380, margin:"0 auto 20px", lineHeight:1.6 }}>
            Join Tahleem Academy — get recordings, live classes, Hifdh programme, and more.
          </p>
          <Link to="/register" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"13px 28px", borderRadius:24, background:GOLD, color:"#fff", fontWeight:800, fontSize:15, textDecoration:"none" }}>
            <UserPlus style={{ width:17, height:17 }} /> Register Now
            <ArrowRight style={{ width:15, height:15 }} />
          </Link>
        </div>
      </div>
    </div>
  );
};

/* ── Shared card body ── */
const ClassCardBody = ({ cls }: { cls: any }) => {
  const GOLD = "#c9973a";
  const G    = "#064E3B";

  return (
    <div style={{ padding:"14px 16px" }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:10 }}>
        <div style={{ width:44, height:44, borderRadius:12, background:`linear-gradient(135deg, ${G} 0%, #0a5c40 100%)`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <BookOpen style={{ width:20, height:20, color:"#fff" }} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <h3 style={{ fontSize:16, fontWeight:800, color:G, margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {cls.title}
          </h3>
          {cls.title_ar && (
            <p style={{ fontSize:13, color:GOLD, fontFamily:"'Amiri',serif", margin:0 }}>{cls.title_ar}</p>
          )}
        </div>
        {cls.password_enabled && (
          <Lock style={{ width:14, height:14, color:"rgba(6,78,59,.4)", flexShrink:0, marginTop:4 }} />
        )}
      </div>

      {cls.description && (
        <p style={{ fontSize:13, color:"rgba(6,78,59,.65)", marginBottom:10, lineHeight:1.55, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" } as any}>
          {cls.description}
        </p>
      )}

      <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
        {cls.scheduled_at && (
          <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:"rgba(6,78,59,.55)" }}>
            <Clock style={{ width:11, height:11 }} />
            {cls.status === "live"
              ? "Started " + formatDistanceToNow(new Date(cls.scheduled_at), { addSuffix: true })
              : format(new Date(cls.scheduled_at), "EEE, MMM d · h:mm a")
            }
          </span>
        )}
        {cls.guest_count > 0 && (
          <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:"rgba(6,78,59,.55)" }}>
            <Users style={{ width:11, height:11 }} />
            {cls.guest_count} joined
          </span>
        )}
        <span style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4, fontSize:12, fontWeight:700, color:cls.status==="live"?"#dc2626":G }}>
          {cls.status === "live" ? "Join Now" : "View Class"}
          <ChevronRight style={{ width:13, height:13 }} />
        </span>
      </div>
    </div>
  );
};

export default LiveClasses;
