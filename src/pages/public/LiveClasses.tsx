import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Calendar, Clock, Users, Share2, Radio } from "lucide-react";
import { format } from "date-fns";
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
  max_guests: number;
  guest_count: number;
  is_featured: boolean;
  host_id: string;
  created_at: string;
}

const PublicLiveClasses = () => {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<PublicClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomCode, setRoomCode] = useState("");

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&family=Cormorant+Garamond:wght@400;600;700&display=swap";
    document.head.appendChild(link);
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    const { data } = await supabase
      .from("public_classes")
      .select("*")
      .in("status", ["scheduled", "live"])
      .order("scheduled_at", { ascending: true });
    setClasses((data as PublicClass[]) || []);
    setLoading(false);
  };

  const liveClasses = classes.filter(c => c.status === "live");
  const upcomingClasses = classes.filter(c => c.status === "scheduled");

  const copyLink = (code: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/live/${code}`);
    toast.success("Link copied!");
  };

  const handleJoinByCode = () => {
    if (roomCode.trim()) {
      navigate(`/live/${roomCode.trim()}`);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#fdf8f0", fontFamily: "'Cairo', sans-serif" }}>
      {/* Nav */}
      <nav style={{ background: "rgba(15,49,34,0.95)", borderBottom: "1px solid rgba(201,151,58,0.3)" }} className="sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#c9973a" }}>
            <BookOpen className="h-4 w-4 text-white" />
          </div>
          <span className="text-white font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Tahleem <span style={{ color: "#c9973a" }}>Academy</span>
          </span>
        </Link>
        <div className="flex gap-3">
          <Link to="/login">
            <Button variant="outline" size="sm" className="border-[#c9973a] text-[#c9973a] hover:bg-[#c9973a] hover:text-white">
              Sign In
            </Button>
          </Link>
          <Link to="/register">
            <Button size="sm" style={{ background: "#c9973a" }} className="text-white hover:opacity-90">
              Register Free
            </Button>
          </Link>
        </div>
      </nav>

      {/* Header */}
      <div className="text-center py-12 px-4" style={{ background: "#0f3122", color: "white" }}>
        <p className="text-lg mb-2" style={{ fontFamily: "'Amiri', serif", color: "#c9973a" }}>
          بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
        </p>
        <h1 className="text-3xl md:text-4xl font-bold mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Live Classes
        </h1>
        <p className="text-xl mb-1" style={{ fontFamily: "'Amiri', serif", color: "#c9973a" }}>
          الدروس المباشرة
        </p>
        <p className="text-white/70 mt-4 max-w-md mx-auto">
          Join our free live Islamic classes — no account required
        </p>

        {/* Room code entry */}
        <div className="flex items-center gap-2 max-w-sm mx-auto mt-6">
          <input
            value={roomCode}
            onChange={e => setRoomCode(e.target.value.toUpperCase())}
            placeholder="Enter Room Code"
            className="flex-1 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/40 text-center text-lg tracking-widest"
            maxLength={6}
            onKeyDown={e => e.key === "Enter" && handleJoinByCode()}
          />
          <Button onClick={handleJoinByCode} style={{ background: "#c9973a" }} className="text-white hover:opacity-90">
            Join
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Live Now */}
        {liveClasses.length > 0 && (
          <div className="mb-10">
            {liveClasses.map(cls => (
              <div key={cls.id} className="rounded-xl p-6 mb-4 flex flex-col md:flex-row items-center justify-between gap-4"
                style={{ background: "linear-gradient(135deg, #0f3122, #1a5c3a)", border: "2px solid #c9973a" }}>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Radio className="h-6 w-6 text-red-500" />
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
                  </div>
                  <div>
                    <Badge className="bg-red-500 text-white mb-1">🔴 LIVE NOW</Badge>
                    <h3 className="text-white text-xl font-bold">{cls.title}</h3>
                    {cls.title_ar && <p className="text-[#c9973a]" style={{ fontFamily: "'Amiri', serif" }}>{cls.title_ar}</p>}
                  </div>
                </div>
                <Link to={`/live/${cls.room_code}`}>
                  <Button size="lg" style={{ background: "#c9973a" }} className="text-white hover:opacity-90 text-lg px-8">
                    Join Now →
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming */}
        <h2 className="text-2xl font-bold mb-6" style={{ color: "#0f3122" }}>
          Upcoming Classes
        </h2>
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Loading...</p>
        ) : upcomingClasses.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg text-muted-foreground">No upcoming public classes scheduled</p>
              <p className="text-sm text-muted-foreground mt-2">Check back soon for new classes!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {upcomingClasses.map(cls => (
              <Card key={cls.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <div className="h-2" style={{ background: "#c9973a" }} />
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold" style={{ color: "#0f3122" }}>{cls.title}</h3>
                      {cls.title_ar && (
                        <p className="text-sm" style={{ fontFamily: "'Amiri', serif", color: "#c9973a" }}>{cls.title_ar}</p>
                      )}
                    </div>
                    {cls.is_featured && <Badge style={{ background: "#c9973a" }} className="text-white">Featured</Badge>}
                  </div>
                  {cls.description && <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{cls.description}</p>}
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-4">
                    {cls.scheduled_at && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(cls.scheduled_at), "MMM d, yyyy • h:mm a")}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      Max {cls.max_guests} guests
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/live/${cls.room_code}`} className="flex-1">
                      <Button className="w-full" style={{ background: "#0f3122" }}>
                        View Details
                      </Button>
                    </Link>
                    <Button variant="outline" size="icon" onClick={() => copyLink(cls.room_code)}>
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center py-8 px-4" style={{ background: "#0a1e14", color: "rgba(255,255,255,0.5)" }}>
        <p style={{ fontFamily: "'Amiri', serif", color: "#c9973a", fontSize: "14px" }}>
          وَمَنْ دَلَّ عَلَى خَيْرٍ فَلَهُ مِثْلُ أَجْرِ فَاعِلِهِ
        </p>
        <p className="text-xs mt-2">© {new Date().getFullYear()} Tahleem Academy. All rights reserved.</p>
      </div>
    </div>
  );
};

export default PublicLiveClasses;
