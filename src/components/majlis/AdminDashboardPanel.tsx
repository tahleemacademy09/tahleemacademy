import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3, MessageCircle, Users, Flag, Ban, Megaphone,
  X, Check, Pencil, Trash2, RefreshCw, FileText, Download
} from "lucide-react";

interface AdminDashboardPanelProps {
  open: boolean;
  onClose: () => void;
}

const AdminDashboardPanel = ({ open, onClose }: AdminDashboardPanelProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState({ messagesTotal: 0, channelsTotal: 0, flaggedCount: 0, bannedCount: 0, broadcastCount: 0 });
  const [flaggedMessages, setFlaggedMessages] = useState<any[]>([]);
  const [bannedUsers, setBannedUsers] = useState<any[]>([]);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [auditFilter, setAuditFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const [msgRes, chRes, flagRes, banRes, bcRes, auditRes] = await Promise.all([
      supabase.from("chat_messages").select("id", { count: "exact", head: true }),
      supabase.from("chat_channels").select("id", { count: "exact", head: true }),
      supabase.from("chat_messages").select("*").eq("is_flagged" as any, true).order("created_at", { ascending: false }).limit(50) as any,
      supabase.from("majlis_banned_users" as any).select("*, profiles!majlis_banned_users_user_id_fkey(full_name, level)").eq("is_active", true),
      supabase.from("majlis_broadcast" as any).select("*").order("sent_at", { ascending: false }).limit(20),
      supabase.from("majlis_audit_log" as any).select("*, profiles!majlis_audit_log_admin_id_fkey(full_name)").order("created_at", { ascending: false }).limit(50),
    ]);

    setStats({
      messagesTotal: msgRes.count || 0,
      channelsTotal: chRes.count || 0,
      flaggedCount: (flagRes.data || []).length,
      bannedCount: (banRes.data || []).length,
      broadcastCount: (bcRes.data || []).length,
    });
    setFlaggedMessages(flagRes.data || []);
    setBannedUsers(banRes.data || []);
    setBroadcasts(bcRes.data || []);
    setAuditLog(auditRes.data || []);
    setLoading(false);
  };

  useEffect(() => { if (open) loadData(); }, [open]);

  const clearFlag = async (msgId: string) => {
    await supabase.from("chat_messages").update({ is_flagged: false } as any).eq("id", msgId);
    setFlaggedMessages(prev => prev.filter(m => m.id !== msgId));
    setStats(prev => ({ ...prev, flaggedCount: prev.flaggedCount - 1 }));
    toast({ title: t("Flag cleared", "تم مسح العلم") });
  };

  const deleteFlagged = async (msgId: string) => {
    await supabase.from("chat_messages").delete().eq("id", msgId);
    setFlaggedMessages(prev => prev.filter(m => m.id !== msgId));
    toast({ title: t("Message deleted", "تم حذف الرسالة") });
  };

  const unbanUser = async (banId: string) => {
    await supabase.from("majlis_banned_users" as any).update({ is_active: false }).eq("id", banId);
    setBannedUsers(prev => prev.filter(b => b.id !== banId));
    toast({ title: t("User unbanned", "تم رفع الحظر") });
  };

  const exportAuditLog = () => {
    const rows = [["Time", "Admin", "Action", "Details"].join(",")];
    auditLog.forEach(log => {
      rows.push([
        new Date(log.created_at).toLocaleString(),
        log.profiles?.full_name || log.admin_id,
        log.action,
        `"${JSON.stringify(log.details || {}).replace(/"/g, '""')}"`,
      ].join(","));
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "majlis-audit-log.csv"; a.click();
  };

  const filteredAudit = auditFilter
    ? auditLog.filter(l => l.action.includes(auditFilter) || JSON.stringify(l.details || "").includes(auditFilter))
    : auditLog;

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 end-0 w-96 max-w-[90vw] z-[70] bg-card border-s shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: "#064E3B" }}>
        <div className="flex items-center gap-2 text-white">
          <BarChart3 className="h-5 w-5" />
          <span className="font-bold">{t("Majlis Admin", "إدارة المجلس")}</span>
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white p-1"><X className="h-5 w-5" /></button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-5 mx-2 mt-2 h-auto">
            <TabsTrigger value="overview" className="text-[10px] px-1 py-1.5">📊</TabsTrigger>
            <TabsTrigger value="flagged" className="text-[10px] px-1 py-1.5 relative">
              🚨
              {stats.flaggedCount > 0 && <span className="absolute -top-1 -end-1 h-4 min-w-[16px] rounded-full bg-destructive text-[9px] text-white flex items-center justify-center">{stats.flaggedCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="banned" className="text-[10px] px-1 py-1.5">🚫</TabsTrigger>
            <TabsTrigger value="broadcasts" className="text-[10px] px-1 py-1.5">📢</TabsTrigger>
            <TabsTrigger value="audit" className="text-[10px] px-1 py-1.5">📋</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon="💬" label={t("Total Messages", "إجمالي الرسائل")} value={stats.messagesTotal} />
              <StatCard icon="📺" label={t("Channels", "القنوات")} value={stats.channelsTotal} />
              <StatCard icon="🚨" label={t("Flagged", "مُبلَّغ عنها")} value={stats.flaggedCount} color="text-destructive" />
              <StatCard icon="🚫" label={t("Banned", "محظورون")} value={stats.bannedCount} color="text-amber-600" />
              <StatCard icon="📢" label={t("Broadcasts", "البثوث")} value={stats.broadcastCount} />
            </div>
            <Button variant="outline" size="sm" onClick={loadData} className="w-full">
              <RefreshCw className="h-3 w-3 me-2" />{t("Refresh", "تحديث")}
            </Button>
          </TabsContent>

          {/* Flagged Messages */}
          <TabsContent value="flagged" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full px-3 py-2">
              {flaggedMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t("No flagged messages", "لا رسائل مُبلغ عنها")}</p>
              ) : (
                <div className="space-y-2">
                  {flaggedMessages.map(m => (
                    <div key={m.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{(m as any).profiles?.full_name || "Unknown"}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-sm" dir="auto">{m.text || `[${m.content_type}]`}</p>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => clearFlag(m.id)} className="h-7 text-xs">
                          <Check className="h-3 w-3 me-1" />{t("Clear", "مسح")}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteFlagged(m.id)} className="h-7 text-xs">
                          <Trash2 className="h-3 w-3 me-1" />{t("Delete", "حذف")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Banned Users */}
          <TabsContent value="banned" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full px-3 py-2">
              {bannedUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t("No banned users", "لا مستخدمين محظورين")}</p>
              ) : (
                <div className="space-y-2">
                  {bannedUsers.map((b: any) => (
                    <div key={b.id} className="border rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{b.profiles?.full_name || "Unknown"}</p>
                        <p className="text-[10px] text-muted-foreground">{b.reason}</p>
                        {b.expires_at && <p className="text-[10px] text-amber-600">{t("Expires", "ينتهي")}: {new Date(b.expires_at).toLocaleString()}</p>}
                        {b.is_permanent && <Badge variant="destructive" className="text-[9px] mt-1">{t("Permanent", "دائم")}</Badge>}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => unbanUser(b.id)} className="h-7 text-xs">
                        {t("Unban", "رفع الحظر")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Broadcasts */}
          <TabsContent value="broadcasts" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full px-3 py-2">
              {broadcasts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t("No broadcasts yet", "لا بثوث بعد")}</p>
              ) : (
                <div className="space-y-2">
                  {broadcasts.map((b: any) => (
                    <div key={b.id} className="border rounded-lg p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">📢 {b.title || t("Broadcast", "بث")}</span>
                        <Badge variant="outline" className="text-[9px]">{b.target}</Badge>
                      </div>
                      <p className="text-xs line-clamp-2" dir="auto">{b.message}</p>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{new Date(b.sent_at).toLocaleString()}</span>
                        <span>{b.read_count || 0} {t("read", "قراءة")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Audit Log */}
          <TabsContent value="audit" className="flex-1 overflow-hidden flex flex-col">
            <div className="px-3 py-2 flex gap-2">
              <Input
                value={auditFilter}
                onChange={e => setAuditFilter(e.target.value)}
                placeholder={t("Filter actions...", "تصفية الإجراءات...")}
                className="h-8 text-xs"
              />
              <Button size="sm" variant="outline" onClick={exportAuditLog} className="h-8 shrink-0">
                <Download className="h-3 w-3" />
              </Button>
            </div>
            <ScrollArea className="flex-1 px-3">
              {filteredAudit.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t("No audit entries", "لا سجلات")}</p>
              ) : (
                <div className="space-y-1 pb-4">
                  {filteredAudit.map((log: any) => (
                    <div key={log.id} className="border rounded-lg p-2 text-xs space-y-0.5">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-[9px]">{log.action}</Badge>
                        <span className="text-[9px] text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                      {log.details && (
                        <p className="text-muted-foreground truncate">{JSON.stringify(log.details).slice(0, 80)}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

const StatCard = ({ icon, label, value, color }: { icon: string; label: string; value: number; color?: string }) => (
  <div className="border rounded-xl p-3 text-center">
    <span className="text-xl">{icon}</span>
    <p className={`text-2xl font-bold ${color || "text-foreground"}`}>{value}</p>
    <p className="text-[10px] text-muted-foreground">{label}</p>
  </div>
);

export default AdminDashboardPanel;
