import { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, UserPlus } from "lucide-react";

const GuestClassroom = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);

  const { token, url, room, guestName, classTitle, classTitleAr } = (location.state || {}) as {
    token?: string;
    url?: string;
    room?: string;
    guestName?: string;
    classTitle?: string;
    classTitleAr?: string;
  };

  useEffect(() => {
    if (!token || !url) {
      navigate("/live");
    }
  }, [token, url, navigate]);

  if (!token || !url) return null;

  if (ended) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0f3122", color: "white", fontFamily: "'Cairo', sans-serif" }}>
        <div className="max-w-md w-full text-center">
          <p className="text-3xl mb-2" style={{ fontFamily: "'Amiri', serif", color: "#c9973a" }}>
            الدرس انتهى
          </p>
          <h2 className="text-2xl font-bold text-white mb-2">Class Has Ended</h2>
          <p className="mb-1" style={{ color: "#c9973a", fontFamily: "'Amiri', serif" }}>
            جزاكم الله خيراً
          </p>
          <p className="text-white/60 text-sm mb-8">JazakAllahu Khayran for joining!</p>

          <div className="rounded-xl p-6 mb-6" style={{ background: "rgba(201,151,58,0.1)", border: "1px solid rgba(201,151,58,0.3)" }}>
            <p className="text-white font-semibold mb-3">Enjoyed the class?</p>
            <p className="text-sm text-white/60 mb-4">
              Join Tahleem Academy for FREE and get:
            </p>
            <ul className="text-sm text-white/70 text-left space-y-1.5 mb-4">
              <li>✅ Access to all course recordings</li>
              <li>✅ Live classes every week</li>
              <li>✅ Personal progress tracking</li>
              <li>✅ Quran Hifdh programme</li>
              <li>✅ Revision centre</li>
              <li>✅ Chat with teachers and students</li>
            </ul>
            <Link to="/register">
              <Button className="w-full text-lg py-5" style={{ background: "#c9973a" }}>
                <UserPlus className="h-5 w-5 mr-2" />
                Register Free — It's Free!
              </Button>
            </Link>
          </div>

          <Link to="/live" className="text-sm text-white/40 hover:text-white/60 underline">
            Maybe Later — Browse Classes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: "#111" }}>
      {/* Guest banner */}
      <div className="flex items-center justify-between px-4 py-2" style={{ background: "#0f3122", borderBottom: "1px solid rgba(201,151,58,0.3)" }}>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-[#c9973a] border-[#c9973a]">Guest</Badge>
          <span className="text-white text-sm">
            {classTitle && <span className="font-semibold">{classTitle}</span>}
            {classTitleAr && <span className="mx-2 text-[#c9973a]" style={{ fontFamily: "'Amiri', serif" }}>— {classTitleAr}</span>}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/60 text-sm">Joining as: <span className="text-white font-medium">{guestName}</span></span>
          <Link to="/register">
            <Button size="sm" variant="outline" className="border-[#c9973a] text-[#c9973a] hover:bg-[#c9973a] hover:text-white text-xs">
              <UserPlus className="h-3 w-3 mr-1" /> Create Account
            </Button>
          </Link>
          <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={() => setEnded(true)}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* LiveKit Room */}
      <div className="flex-1">
        <LiveKitRoom
          serverUrl={url}
          token={token}
          connect={true}
          onConnected={() => setConnected(true)}
          onDisconnected={() => setEnded(true)}
          style={{ height: "100%" }}
        >
          <VideoConference />
        </LiveKitRoom>
      </div>
    </div>
  );
};

export default GuestClassroom;
