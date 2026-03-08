import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Play, BookOpen, Home } from "lucide-react";

interface ClassEndScreenProps {
  subject: any;
  session: any;
  duration: number;
  participantCount: number;
  onGoToDashboard: () => void;
  onGoToRevision?: () => void;
}

const ClassEndScreen = ({ subject, session, duration, participantCount, onGoToDashboard, onGoToRevision }: ClassEndScreenProps) => {
  const { t } = useLanguage();
  const { hasRole } = useAuth();
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  const formatDuration = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m} ${t("minutes", "دقيقة")}`;
  };

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-4">
      <Card className="max-w-md w-full bg-card">
        <CardContent className="p-8 text-center space-y-6">
          <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>

          <div>
            <h2 className="text-xl font-bold">
              {t("Class has ended", "الدرس انتهى")}
            </h2>
            <p className="text-secondary font-arabic text-lg mt-1" dir="rtl" style={{ fontFamily: "Amiri" }}>
              جزاكم الله خيراً
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-medium">{subject.title}</p>
            {subject.title_ar && <p className="text-sm text-muted-foreground font-arabic" dir="rtl">{subject.title_ar}</p>}
            {(session as any)?.topic && (
              <Badge variant="secondary">#{(session as any).session_number} — {(session as any).topic}</Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-muted rounded-lg p-3">
              <p className="text-muted-foreground">{t("Duration", "المدة")}</p>
              <p className="font-bold">{formatDuration(duration)}</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-muted-foreground">{t("Participants", "المشاركون")}</p>
              <p className="font-bold">{participantCount}</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("Recording will be available shortly", "التسجيل سيكون متاحاً قريباً")}
          </p>

          <div className="space-y-2">
            <Button onClick={onGoToDashboard} className="w-full gap-2">
              <Home className="h-4 w-4" />
              {t("Back to Dashboard", "العودة للوحة")}
            </Button>
            {!isPrivileged && onGoToRevision && (
              <Button onClick={onGoToRevision} variant="outline" className="w-full gap-2">
                <BookOpen className="h-4 w-4" />
                {t("Go to Revision", "اذهب للمراجعة")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClassEndScreen;
