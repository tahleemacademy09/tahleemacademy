import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Clock, Radio, Users, Lock, Share2, Copy, Calendar } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface PublicClass {
  id: string;
  title: string;
  title_ar: string | null;
  description: string | null;
  description_ar: string | null;
  room_code: string;
  status: string;
  scheduled_at: string | null;
  password_enabled: boolean;
  require_name: boolean;
  max_guests: number;
  guest_count: number;
  host_id: string;
  chat_enabled: boolean;
  raise_hand_enabled: boolean;
  allow_guest_camera: boolean;
  allow_guest_mic: boolean;
  livekit_room_name: string | null;
}

const JoinClass = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const [publicClass, setPublicClass] = useState<PublicClass | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // For pre-registration
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&family=Cormorant+Garamond:wght@400;600;700&display=swap";
    document.head.appendChild(link);
    fetchClass();
  }, [roomCode]);

  const fetchClass = async () => {
    if (!roomCode) return;
    const { data } = await supabase
      .from("public_classes")
      .select("*")
      .eq("room_code", roomCode)
      .single();
    setPublicClass(data as PublicClass | null);
    setLoading(false);
  };

  // Realtime status updates
  useEffect(() => {
    if (!publicClass?.id) return;
    const channel = supabase
      .channel(`public-class-${publicClass.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "public_classes", filter: `id=eq.${publicClass.id}` },
        (payload) => setPublicClass(prev => prev ? { ...prev, ...payload.new } as PublicClass : null))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [publicClass?.id]);

  const handleJoin = useCallback(async () => {
    if (!guestName.trim()) {
      setError("Please enter your name");
      return;
    }
    setJoining(true);
    setError("");

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wvqeubhupkddtkcdwqcm.supabase.co";
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "";
      const res = await fetch(`${supabaseUrl}/functions/v1/public-class-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": supabaseKey },
        body: JSON.stringify({
          room_code: roomCode,
          guest_name: guestName.trim(),
          guest_email: guestEmail.trim() || null,
          password: password || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to join");
        setJoining(false);
        return;
      }

      // Navigate to guest classroom
      navigate(`/live/${roomCode}/classroom`, {
        state: {
          token: data.token,
          url: data.url,
          room: data.room,
          guestName: guestName.trim(),
          classId: data.class_id,
          classTitle: data.class_title,
          classTitleAr: data.class_title_ar,
        },
      });
    } catch {
      setError("Connection error. Please try again.");
      setJoining(false);
    }
  }, [guestName, guestEmail, password, roomCode, navigate]);

  const handlePreRegister = async () => {
    if (!regName.trim()) return;
    await supabase.from("public_class_registrations").insert({
      class_id: publicClass!.id,
      name: regName.trim(),
      email: regEmail.trim() || null,
    });
    setRegistered(true);
    toast.success("Registered! We'll notify you when the class starts.");
  };

  const shareWhatsApp = () => {
    const msg = encodeURIComponent(
      `Assalamu Alaikum! 🌙\n\nYou are invited to a FREE live Islamic class with Tahleem Academy!\n\n📚 ${publicClass?.title}\n${publicClass?.scheduled_at ? `📅 ${format(new Date(publicClass.scheduled_at), "MMM d, yyyy 'at' h:mm a")}` : ""}\n\nJoin here (no account needed):\n${window.location.origin}/live/${roomCode}\n\nRoom Code: ${roomCode}\n\nShare with others who may benefit! 🤲\nوَمَنْ دَلَّ عَلَى خَيْرٍ فَلَهُ مِثْلُ أَجْرِ فَاعِلِهِ`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f3122" }}>
        <div className="w-8 h-8 border-2 border-[#c9973a] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!publicClass) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f3122", color: "white" }}>
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Class Not Found</h2>
          <p className="text-white/60 mb-6">This class link may be invalid or the class has been removed.</p>
          <Link to="/live">
            <Button style={{ background: "#c9973a" }} className="text-white">Browse Live Classes</Button>
          </Link>
        </div>
      </div>
    );
  }

  // ENDED state
  if (publicClass.status === "ended" || publicClass.status === "cancelled") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0f3122", color: "white", fontFamily: "'Cairo', sans-serif" }}>
        <Card className="max-w-md w-full bg-white/5 border-white/10 text-white">
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-2">{publicClass.title}</h2>
            <p className="text-lg mb-6 text-white/60">This class has ended</p>
            <p className="mb-2" style={{ fontFamily: "'Amiri', serif", color: "#c9973a" }}>
              جزاكم الله خيراً
            </p>
            <p className="text-sm text-white/50 mb-6">JazakAllahu Khayran for your interest!</p>
            <div className="space-y-3">
              <Link to="/register" className="block">
                <Button className="w-full" style={{ background: "#c9973a" }}>
                  Register Free — Join Future Classes
                </Button>
              </Link>
              <Link to="/live" className="block">
                <Button variant="outline" className="w-full border-white/20 text-white hover:bg-white/10">
                  Browse Other Classes
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // SCHEDULED (waiting) state
  if (publicClass.status === "scheduled") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0f3122", color: "white", fontFamily: "'Cairo', sans-serif" }}>
        <Card className="max-w-md w-full bg-white/5 border-white/10 text-white">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <p className="text-sm mb-3" style={{ fontFamily: "'Amiri', serif", color: "#c9973a" }}>
                بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
              </p>
              <h2 className="text-2xl font-bold mb-1">{publicClass.title}</h2>
              {publicClass.title_ar && (
                <p style={{ fontFamily: "'Amiri', serif", color: "#c9973a" }}>{publicClass.title_ar}</p>
              )}
              {publicClass.description && (
                <p className="text-sm text-white/60 mt-3">{publicClass.description}</p>
              )}
            </div>

            {publicClass.scheduled_at && (
              <div className="rounded-lg p-4 mb-6 text-center" style={{ background: "rgba(201,151,58,0.1)", border: "1px solid rgba(201,151,58,0.3)" }}>
                <Clock className="h-5 w-5 mx-auto mb-2" style={{ color: "#c9973a" }} />
                <p className="text-sm text-white/70">Class starts</p>
                <p className="text-lg font-bold" style={{ color: "#c9973a" }}>
                  {format(new Date(publicClass.scheduled_at), "EEEE, MMM d 'at' h:mm a")}
                </p>
                <p className="text-sm text-white/50 mt-1">
                  {formatDistanceToNow(new Date(publicClass.scheduled_at), { addSuffix: true })}
                </p>
              </div>
            )}

            {/* Pre-register */}
            {!registered ? (
              <div className="space-y-3">
                {/* Header with incentive */}
                <div className="rounded-lg p-3" style={{ background: "rgba(201,151,58,0.08)", border: "1px solid rgba(201,151,58,0.2)" }}>
                  <p className="text-sm font-semibold" style={{ color: "#c9973a" }}>📩 Get notified when class starts</p>
                  <p className="text-xs text-white/55 mt-0.5">
                    Drop your email and we'll send you a direct reminder + the join link — so you don't miss it.
                  </p>
                </div>

                <Input
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  placeholder="Your Name *"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                />

                {/* Email field with nudge */}
                <div className="space-y-1">
                  <Input
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    placeholder="Email address (for reminder)"
                    type="email"
                    className="bg-white/10 text-white placeholder:text-white/40"
                    style={{
                      border: regName.trim() && !regEmail.trim()
                        ? "1px solid rgba(201,151,58,0.7)"
                        : "1px solid rgba(255,255,255,0.2)",
                    }}
                  />
                  {regName.trim() && !regEmail.trim() && (
                    <p className="text-xs flex items-center gap-1" style={{ color: "#c9973a" }}>
                      ↑ Add your email so we can remind you — class links aren't always reshared
                    </p>
                  )}
                </div>

                <Button
                  onClick={handlePreRegister}
                  disabled={!regName.trim()}
                  className="w-full font-semibold"
                  style={{ background: "#c9973a" }}
                >
                  {regEmail.trim() ? "✅ Remind Me When It Starts" : "Pre-Register (No Reminder)"}
                </Button>

                {!regEmail.trim() && regName.trim() && (
                  <p className="text-xs text-center text-white/40">
                    Without an email, you'll need to check back manually for the class link.
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center p-4 rounded-lg" style={{ background: "rgba(201,151,58,0.15)" }}>
                <p className="text-[#c9973a] font-semibold">✅ You're registered!</p>
                <p className="text-sm text-white/60 mt-1">
                  {regEmail.trim()
                    ? `We'll send a reminder to ${regEmail} when the class goes live.`
                    : "Check back at the scheduled time to join the class."}
                </p>
              </div>
            )}

            {/* Share */}
            <div className="flex gap-2 mt-6">
              <Button
                onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copied!"); }}
                className="flex-1 font-medium"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", color: "white" }}
              >
                <Copy className="h-4 w-4 mr-2" /> Copy Link
              </Button>
              <Button
                onClick={shareWhatsApp}
                className="flex-1 font-medium"
                style={{ background: "rgba(37,211,102,0.15)", border: "1px solid rgba(37,211,102,0.35)", color: "#25d366" }}
              >
                <Share2 className="h-4 w-4 mr-2" /> WhatsApp
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // LIVE — join form
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0f3122", color: "white", fontFamily: "'Cairo', sans-serif" }}>
      <Card className="max-w-md w-full bg-white/5 border-white/10 text-white">
        <CardContent className="p-8">
          <div className="text-center mb-6">
            <Badge className="bg-red-500 text-white mb-3 animate-pulse">🔴 Class is LIVE</Badge>
            <h2 className="text-2xl font-bold">{publicClass.title}</h2>
            {publicClass.title_ar && (
              <p className="mt-1" style={{ fontFamily: "'Amiri', serif", color: "#c9973a" }}>{publicClass.title_ar}</p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-white/70">Your Name *</Label>
              <Input
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                placeholder="Enter your name"
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40 mt-1"
                onKeyDown={e => e.key === "Enter" && handleJoin()}
              />
            </div>

            <div>
              <Label className="text-white/70">Email (optional)</Label>
              <Input
                value={guestEmail}
                onChange={e => setGuestEmail(e.target.value)}
                placeholder="your@email.com"
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40 mt-1"
              />
            </div>

            {publicClass.password_enabled && (
              <div>
                <Label className="text-white/70 flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5" /> Class Password
                </Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40 mt-1"
                />
              </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <Button
              onClick={handleJoin}
              disabled={joining || !guestName.trim()}
              className="w-full py-6 text-lg font-bold"
              style={{ background: "#c9973a" }}
            >
              {joining ? (
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Joining...
                </span>
              ) : (
                <span className="flex flex-col items-center">
                  <span>▶ JOIN CLASS NOW</span>
                  <span className="text-sm font-normal opacity-80" style={{ fontFamily: "'Amiri', serif" }}>
                    انضم إلى الدرس
                  </span>
                </span>
              )}
            </Button>

            <div className="flex items-center gap-2 text-sm text-white/40">
              <Users className="h-3.5 w-3.5" />
              <span>{publicClass.guest_count} / {publicClass.max_guests} guests</span>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-white/10 text-center text-sm text-white/50">
            Already have an account?{" "}
            <Link to="/login" className="underline" style={{ color: "#c9973a" }}>Sign in →</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinClass;
