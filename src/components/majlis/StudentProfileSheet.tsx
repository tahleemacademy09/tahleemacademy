import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { User, Hash, GraduationCap, Clock } from "lucide-react";

interface StudentProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: {
    user_id: string;
    full_name: string | null;
    full_name_ar?: string | null;
    avatar_url: string | null;
    level?: string | null;
    student_id?: string | null;
    is_online?: boolean | null;
    last_seen?: string | null;
    role?: string;
  } | null;
}

const StudentProfileSheet = ({ open, onOpenChange, member }: StudentProfileSheetProps) => {
  const { t } = useLanguage();

  if (!member) return null;

  const formatLastSeen = (lastSeen: string | null | undefined) => {
    if (!lastSeen) return t("Unknown", "غير معروف");
    const diff = Date.now() - new Date(lastSeen).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("Just now", "الآن");
    if (mins < 60) return `${mins} ${t("min ago", "دقيقة مضت")}`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ${t("hours ago", "ساعة مضت")}`;
    return new Date(lastSeen).toLocaleDateString();
  };

  const levelColor = (level: string | null | undefined) => {
    if (level === "1") return "#22c55e";
    if (level === "2") return "#b8962e";
    if (level === "3") return "#ef4444";
    return "#1a3a2a";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl p-0 max-h-[70vh]">

        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Profile Header */}
        <div className="flex flex-col items-center py-6 px-6" style={{ backgroundColor: "#f5f0e8" }}>
          <div className="relative">
            <Avatar className="h-24 w-24 border-4 border-white shadow-lg">
              <AvatarImage src={member.avatar_url || ""} />
              <AvatarFallback style={{ backgroundColor: "#1a3a2a", color: "white", fontSize: "2rem" }}>
                {(member.full_name || "S")[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {member.is_online && (
              <div className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-green-500 border-2 border-white" />
            )}
          </div>

          <h2 className="text-xl font-bold mt-3" style={{ color: "#1a3a2a" }}>
            {member.full_name || t("Student", "طالب")}
          </h2>
          {member.full_name_ar && (
            <p className="text-sm text-gray-500 mt-0.5" dir="rtl">{member.full_name_ar}</p>
          )}

          {/* Online status */}
          <div className="flex items-center gap-1.5 mt-2">
            <div className={`h-2 w-2 rounded-full ${member.is_online ? "bg-green-500" : "bg-gray-400"}`} />
            <span className="text-xs text-gray-500">
              {member.is_online
                ? t("Online now", "متصل الآن")
                : `${t("Last seen", "آخر ظهور")}: ${formatLastSeen(member.last_seen)}`
              }
            </span>
          </div>
        </div>

        {/* Info Cards */}
        <div className="p-4 space-y-3">

          {/* Student ID */}
          {member.student_id && (
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "#f5f0e8" }}>
              <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#1a3a2a" }}>
                <Hash className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{t("Student ID", "رقم الطالب")}</p>
                <p className="text-sm font-semibold" style={{ color: "#1a3a2a" }}>{member.student_id}</p>
              </div>
            </div>
          )}

          {/* Level */}
          {member.level && (
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "#f5f0e8" }}>
              <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: levelColor(member.level) }}>
                <GraduationCap className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{t("Level", "المستوى")}</p>
                <p className="text-sm font-semibold" style={{ color: "#1a3a2a" }}>
                  {t("Level", "المستوى")} {member.level}
                </p>
              </div>
            </div>
          )}

          {/* Role in group */}
          {member.role && (
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "#f5f0e8" }}>
              <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#b8962e" }}>
                <User className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{t("Role", "الدور")}</p>
                <Badge
                  className="text-xs capitalize mt-0.5"
                  style={{
                    backgroundColor: member.role === "admin" ? "#b8962e" : "#1a3a2a",
                    color: "white"
                  }}
                >
                  {member.role}
                </Badge>
              </div>
            </div>
          )}

          {/* Last seen */}
          {!member.is_online && member.last_seen && (
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "#f5f0e8" }}>
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-gray-400">
                <Clock className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{t("Last seen", "آخر ظهور")}</p>
                <p className="text-sm font-semibold" style={{ color: "#1a3a2a" }}>
                  {new Date(member.last_seen).toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default StudentProfileSheet;
