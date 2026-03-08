import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAcademySettings } from "@/hooks/useAcademySettings";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard, Calendar, Moon, Sun, Power, PowerOff, Clock, Users,
  AlertTriangle, CheckCircle, Play, Pause, Settings,
} from "lucide-react";
import { format } from "date-fns";

const AcademicCalendar = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const { settings, loading, updateMultiple, fetchSettings, isPaymentEnabled, isHoliday, isActive } = useAcademySettings();

  const [switchLogs, setSwitchLogs] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [showPayOffDialog, setShowPayOffDialog] = useState(false);
  const [showPayOnDialog, setShowPayOnDialog] = useState(false);
  const [showHolidayDialog, setShowHolidayDialog] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [showTermDialog, setShowTermDialog] = useState(false);

  // Pay off form
  const [payOffForm, setPayOffForm] = useState({ reason: "", reason_ar: "", freeAccess: true, autoOnDate: "" });
  // Pay on form
  const [payOnForm, setPayOnForm] = useState({ graceDays: 7, notify: true });
  // Holiday form
  const [holidayForm, setHolidayForm] = useState({ resumeDate: "", reason: "", reason_ar: "", notify: true, autoPayOff: true, autoPayOn: true });
  // Resume form
  const [resumeForm, setResumeForm] = useState({ resumeDate: "", message: "", notify: true, autoPayOn: true, graceDays: 7 });
  // Term form
  const [termForm, setTermForm] = useState({ academic_year: "2025/2026", term: "first" as string, term_start_date: "", term_end_date: "", resume_date: "", payment_due_date: "", is_active: false, title: "", title_ar: "" });

  const [disabledByName, setDisabledByName] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [logsRes, termsRes] = await Promise.all([
      supabase.from("payment_switch_log" as any).select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("academic_calendar" as any).select("*").order("created_at", { ascending: false }),
    ]);
    setSwitchLogs((logsRes.data || []) as any[]);
    setTerms((termsRes.data || []) as any[]);

    // Load disabled-by name
    if (settings.payment_disabled_by) {
      const { data: pData } = await supabase.from("profiles").select("full_name").eq("user_id", settings.payment_disabled_by).single();
      if (pData) setDisabledByName(pData.full_name || "Admin");
    }
  };

  // ─── TURN PAYMENTS OFF ───
  const handlePayOff = async () => {
    const updates: Record<string, string | null> = {
      payment_enabled: "false",
      payment_disabled_reason: payOffForm.reason,
      payment_disabled_reason_ar: payOffForm.reason_ar || null,
      payment_disabled_by: user!.id,
      payment_disabled_at: new Date().toISOString(),
      payment_free_access_during_off: payOffForm.freeAccess ? "true" : "false",
    };
    if (payOffForm.autoOnDate) {
      updates.payment_auto_on_date = payOffForm.autoOnDate;
    }
    await updateMultiple(updates, user!.id);

    // Count affected students
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true });

    // Log
    await supabase.from("payment_switch_log" as any).insert({
      action: "disabled",
      reason: payOffForm.reason,
      reason_ar: payOffForm.reason_ar || null,
      done_by: user!.id,
      auto_on_date: payOffForm.autoOnDate || null,
      affected_students: count || 0,
    });

    if (payOffForm.freeAccess) {
      // Set all non-exempt students to exempt_temp
      await supabase.from("profiles")
        .update({ payment_status: "exempt_temp" } as any)
        .neq("payment_status", "exempt")
        .neq("payment_status", "paid");
    }

    toast({ title: "✅ Payments turned OFF. All students now have free access." });
    setShowPayOffDialog(false);
    setPayOffForm({ reason: "", reason_ar: "", freeAccess: true, autoOnDate: "" });
    fetchSettings();
    loadData();
  };

  // ─── TURN PAYMENTS ON ───
  const handlePayOn = async () => {
    const today = new Date().toISOString().split("T")[0];
    await updateMultiple({
      payment_enabled: "true",
      payment_enabled_at: new Date().toISOString(),
      payment_counting_started: "true",
      payment_count_start_date: today,
      payment_disabled_reason: null,
      payment_disabled_reason_ar: null,
      payment_auto_on_date: null,
    }, user!.id);

    // Restore statuses for exempt_temp students
    const graceEnd = new Date();
    graceEnd.setDate(graceEnd.getDate() + payOnForm.graceDays);
    const graceEndStr = graceEnd.toISOString().split("T")[0];

    await supabase.from("profiles")
      .update({ payment_status: "grace", payment_grace_end: graceEndStr } as any)
      .eq("payment_status", "exempt_temp");

    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true });

    await supabase.from("payment_switch_log" as any).insert({
      action: "enabled",
      reason: `Grace period: ${payOnForm.graceDays} days`,
      done_by: user!.id,
      affected_students: count || 0,
    });

    if (payOnForm.notify) {
      // Send notification to all students
      const { data: students } = await supabase.from("profiles").select("user_id");
      if (students) {
        const notifs = students.map((s: any) => ({
          user_id: s.user_id,
          title: "💳 Payment System Active",
          message: `Assalamu Alaikum! Payment system is now active. You have ${payOnForm.graceDays} days to complete payment.`,
          type: "payment",
        }));
        if (notifs.length > 0) {
          await supabase.from("notifications").insert(notifs);
        }
      }
    }

    toast({ title: "✅ Payments turned ON. Grace period started." });
    setShowPayOnDialog(false);
    setPayOnForm({ graceDays: 7, notify: true });
    fetchSettings();
    loadData();
  };

  // ─── SET HOLIDAY ───
  const handleSetHoliday = async () => {
    const updates: Record<string, string | null> = {
      academy_status: "holiday",
      resume_date: holidayForm.resumeDate,
      holiday_message: holidayForm.reason,
      holiday_message_ar: holidayForm.reason_ar || null,
      payment_counting_started: "false",
    };
    if (holidayForm.autoPayOff) {
      updates.payment_enabled = "false";
      updates.payment_disabled_reason = "Academy on holiday";
      updates.payment_disabled_by = user!.id;
      updates.payment_disabled_at = new Date().toISOString();
      if (holidayForm.autoPayOn) {
        updates.payment_auto_on_date = holidayForm.resumeDate;
      }
    }
    await updateMultiple(updates, user!.id);

    if (holidayForm.autoPayOff) {
      await supabase.from("payment_switch_log" as any).insert({
        action: "disabled",
        reason: "Academy on holiday",
        done_by: user!.id,
        auto_on_date: holidayForm.autoPayOn ? holidayForm.resumeDate : null,
      });
    }

    if (holidayForm.notify) {
      const { data: students } = await supabase.from("profiles").select("user_id");
      if (students) {
        const notifs = students.map((s: any) => ({
          user_id: s.user_id,
          title: "🌙 Academy Holiday",
          message: `Assalamu Alaikum! The academy is now on holiday. ${holidayForm.reason || ""} We resume on ${holidayForm.resumeDate} insha'Allah. Enjoy your break! 📖`,
          type: "info",
        }));
        if (notifs.length > 0) await supabase.from("notifications").insert(notifs);
      }
    }

    toast({ title: "🌙 Academy set to holiday mode." });
    setShowHolidayDialog(false);
    setHolidayForm({ resumeDate: "", reason: "", reason_ar: "", notify: true, autoPayOff: true, autoPayOn: true });
    fetchSettings();
    loadData();
  };

  // ─── RESUME NOW ───
  const handleResume = async () => {
    const today = new Date().toISOString().split("T")[0];
    const updates: Record<string, string | null> = {
      academy_status: "active",
      holiday_message: null,
      holiday_message_ar: null,
    };
    if (resumeForm.autoPayOn) {
      updates.payment_enabled = "true";
      updates.payment_enabled_at = new Date().toISOString();
      updates.payment_counting_started = "true";
      updates.payment_count_start_date = today;

      const graceEnd = new Date();
      graceEnd.setDate(graceEnd.getDate() + resumeForm.graceDays);

      // Restore students
      await supabase.from("profiles")
        .update({ payment_status: "grace", payment_grace_end: graceEnd.toISOString().split("T")[0] } as any)
        .in("payment_status", ["grace", "unpaid", "exempt_temp"]);

      await supabase.from("payment_switch_log" as any).insert({
        action: "enabled",
        reason: "Academy resumed",
        done_by: user!.id,
      });
    }
    await updateMultiple(updates, user!.id);

    if (resumeForm.notify) {
      const { data: students } = await supabase.from("profiles").select("user_id");
      if (students) {
        const notifs = students.map((s: any) => ({
          user_id: s.user_id,
          title: "🌟 Academy Resumed!",
          message: `Alhamdulillah! The academy has resumed. Your classes begin today. ${resumeForm.autoPayOn ? `Payment due in ${resumeForm.graceDays} days.` : ""}`,
          type: "info",
        }));
        if (notifs.length > 0) await supabase.from("notifications").insert(notifs);
      }
    }

    toast({ title: "🌟 Academy has resumed!" });
    setShowResumeDialog(false);
    fetchSettings();
    loadData();
  };

  // ─── CREATE TERM ───
  const handleCreateTerm = async () => {
    await supabase.from("academic_calendar" as any).insert({
      title: termForm.title || `${termForm.term} Term ${termForm.academic_year}`,
      title_ar: termForm.title_ar || null,
      academic_year: termForm.academic_year,
      term: termForm.term,
      term_start_date: termForm.term_start_date,
      term_end_date: termForm.term_end_date,
      resume_date: termForm.resume_date || termForm.term_start_date,
      payment_due_date: termForm.payment_due_date || null,
      is_active: termForm.is_active,
      created_by: user!.id,
    });

    if (termForm.is_active) {
      await updateMultiple({
        current_term: termForm.term,
        current_academic_year: termForm.academic_year,
      }, user!.id);
    }

    toast({ title: "✅ Term created successfully." });
    setShowTermDialog(false);
    setTermForm({ academic_year: "2025/2026", term: "first", term_start_date: "", term_end_date: "", resume_date: "", payment_due_date: "", is_active: false, title: "", title_ar: "" });
    loadData();
  };

  const resumeDateObj = settings.resume_date ? new Date(settings.resume_date) : null;
  const daysToResume = resumeDateObj ? Math.max(0, Math.ceil((resumeDateObj.getTime() - Date.now()) / 86400000)) : 0;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#0f3122" }}>
          {t("Academic Calendar", "التقويم الأكاديمي")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("Manage terms, holidays, and payment controls", "إدارة الفصول والعطلات وضوابط الدفع")}
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{t("Overview", "نظرة عامة")}</TabsTrigger>
          <TabsTrigger value="terms">{t("Term Management", "إدارة الفصول")}</TabsTrigger>
          <TabsTrigger value="history">{t("History", "السجل")}</TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: OVERVIEW ═══ */}
        <TabsContent value="overview" className="space-y-4">
          {/* MASTER PAYMENT SWITCH */}
          <Card className="border-2" style={{ borderColor: isPaymentEnabled ? "#22c55e" : "#ef4444" }}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-6 w-6" style={{ color: isPaymentEnabled ? "#22c55e" : "#ef4444" }} />
                  <div>
                    <h2 className="text-lg font-bold">{t("Payment System", "نظام الدفع")}</h2>
                    <Badge variant={isPaymentEnabled ? "default" : "destructive"} className="mt-1">
                      {isPaymentEnabled ? "● ACTIVE" : "○ INACTIVE"}
                    </Badge>
                  </div>
                </div>
                <Switch
                  checked={isPaymentEnabled}
                  onCheckedChange={(checked) => {
                    if (checked) setShowPayOnDialog(true);
                    else setShowPayOffDialog(true);
                  }}
                />
              </div>

              {isPaymentEnabled ? (
                <p className="text-sm text-muted-foreground mt-3">
                  {t("Students are required to pay to access the platform.", "يجب على الطلاب الدفع للوصول إلى المنصة.")}
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {t("All students have FREE access. No payments collected.", "جميع الطلاب لديهم وصول مجاني. لا يتم تحصيل مدفوعات.")}
                  </p>
                  {disabledByName && (
                    <p className="text-xs text-muted-foreground">
                      {t("Disabled by:", "أوقفه:")} {disabledByName}
                    </p>
                  )}
                  {settings.payment_disabled_at && (
                    <p className="text-xs text-muted-foreground">
                      {t("Disabled on:", "أُوقف في:")} {format(new Date(settings.payment_disabled_at), "PPp")}
                    </p>
                  )}
                  {settings.payment_disabled_reason && (
                    <p className="text-xs text-muted-foreground">
                      {t("Reason:", "السبب:")} {settings.payment_disabled_reason}
                    </p>
                  )}
                  <Button onClick={() => setShowPayOnDialog(true)} className="mt-2" style={{ background: "#c9973a", color: "#fff" }}>
                    <Power className="h-4 w-4 mr-2" />
                    {t("Turn Payments ON", "تشغيل المدفوعات")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ACADEMY STATUS */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isActive && <Sun className="h-6 w-6 text-green-600" />}
                  {isHoliday && <Moon className="h-6 w-6 text-amber-500" />}
                  {settings.academy_status === "closed" && <PowerOff className="h-6 w-6 text-gray-500" />}
                  <div>
                    <h2 className="text-lg font-bold">
                      {isActive && t("Academy is Active", "الأكاديمية نشطة")}
                      {isHoliday && t("Academy is on Holiday", "الأكاديمية في عطلة")}
                      {settings.academy_status === "closed" && t("Academy is Closed", "الأكاديمية مغلقة")}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {t("Term:", "الفصل:")} {settings.current_term} • {settings.current_academic_year}
                    </p>
                  </div>
                </div>
                <Badge variant={isActive ? "default" : isHoliday ? "secondary" : "outline"}>
                  {isActive ? "🟢 Active" : isHoliday ? "🌙 Holiday" : "⚫ Closed"}
                </Badge>
              </div>

              {isHoliday && (
                <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
                  {settings.holiday_message && (
                    <p className="text-sm text-amber-800">{settings.holiday_message}</p>
                  )}
                  {settings.holiday_message_ar && (
                    <p className="text-sm text-amber-800 font-arabic" dir="rtl">{settings.holiday_message_ar}</p>
                  )}
                  {resumeDateObj && (
                    <p className="text-sm font-medium text-amber-900">
                      {t("Resume date:", "تاريخ الاستئناف:")} {format(resumeDateObj, "PPP")} — {daysToResume} {t("days remaining", "أيام متبقية")}
                    </p>
                  )}
                  <p className="text-xs text-amber-700 flex items-center gap-1">
                    <Pause className="h-3 w-3" /> {t("Payment countdown: PAUSED", "العد التنازلي للدفع: متوقف")}
                  </p>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => setShowResumeDialog(true)} style={{ borderColor: "#c9973a", color: "#c9973a" }}>
                      {t("Edit Resume Date", "تعديل تاريخ الاستئناف")}
                    </Button>
                    <Button size="sm" onClick={async () => { setResumeForm(f => ({ ...f, resumeDate: new Date().toISOString().split("T")[0] })); setShowResumeDialog(true); }} style={{ background: "#22c55e", color: "#fff" }}>
                      {t("Resume Now", "استئنف الآن")}
                    </Button>
                  </div>
                </div>
              )}

              {isActive && (
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="destructive" onClick={() => setShowHolidayDialog(true)}>
                    <Moon className="h-4 w-4 mr-1" />
                    {t("Set Holiday", "تعيين عطلة")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <Calendar className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-lg font-bold">{settings.current_term}</p>
                <p className="text-xs text-muted-foreground">{t("Current Term", "الفصل الحالي")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Clock className="h-5 w-5 mx-auto mb-1 text-amber-500" />
                <p className="text-lg font-bold">{settings.payment_grace_days}d</p>
                <p className="text-xs text-muted-foreground">{t("Grace Period", "فترة السماح")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <CreditCard className="h-5 w-5 mx-auto mb-1" style={{ color: isPaymentEnabled ? "#22c55e" : "#ef4444" }} />
                <p className="text-lg font-bold">{isPaymentEnabled ? "ON" : "OFF"}</p>
                <p className="text-xs text-muted-foreground">{t("Payments", "المدفوعات")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Play className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-lg font-bold">{settings.payment_counting_started === "true" ? "Yes" : "No"}</p>
                <p className="text-xs text-muted-foreground">{t("Counting", "العد التنازلي")}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ TAB 2: TERM MANAGEMENT ═══ */}
        <TabsContent value="terms" className="space-y-4">
          {/* Payment Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("Payment Settings", "إعدادات الدفع")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{t("Payment Grace Period (days)", "فترة السماح (أيام)")}</Label>
                  <Input
                    type="number"
                    value={settings.payment_grace_days}
                    onChange={async (e) => {
                      await updateMultiple({ payment_grace_days: e.target.value }, user!.id);
                    }}
                  />
                </div>
              </div>
              {settings.payment_counting_started === "false" && isActive && (
                <Button onClick={async () => {
                  const today = new Date().toISOString().split("T")[0];
                  await updateMultiple({
                    payment_counting_started: "true",
                    payment_count_start_date: today,
                  }, user!.id);
                  toast({ title: "✅ Payment counting started." });
                }} style={{ background: "#c9973a", color: "#fff" }}>
                  {t("Start Payment Counting Now", "بدء العد التنازلي للدفع الآن")}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Create Term */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t("Terms", "الفصول الدراسية")}</CardTitle>
              <Button size="sm" onClick={() => setShowTermDialog(true)} style={{ background: "#c9973a", color: "#fff" }}>
                {t("Create Term", "إنشاء فصل")}
              </Button>
            </CardHeader>
            <CardContent>
              {terms.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t("No terms created yet.", "لم يتم إنشاء فصول بعد.")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Term", "الفصل")}</TableHead>
                      <TableHead>{t("Year", "السنة")}</TableHead>
                      <TableHead>{t("Start", "البداية")}</TableHead>
                      <TableHead>{t("End", "النهاية")}</TableHead>
                      <TableHead>{t("Status", "الحالة")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {terms.map((term: any) => (
                      <TableRow key={term.id}>
                        <TableCell className="capitalize">{term.term} Term</TableCell>
                        <TableCell>{term.academic_year}</TableCell>
                        <TableCell>{term.term_start_date}</TableCell>
                        <TableCell>{term.term_end_date}</TableCell>
                        <TableCell>
                          <Badge variant={term.is_active ? "default" : "outline"}>
                            {term.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB 3: HISTORY ═══ */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("Payment Switch History", "سجل تبديل المدفوعات")}</CardTitle>
            </CardHeader>
            <CardContent>
              {switchLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t("No switch events yet.", "لا توجد أحداث تبديل بعد.")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Date", "التاريخ")}</TableHead>
                      <TableHead>{t("Action", "الإجراء")}</TableHead>
                      <TableHead>{t("Reason", "السبب")}</TableHead>
                      <TableHead>{t("Students", "الطلاب")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {switchLogs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">{log.created_at ? format(new Date(log.created_at), "PPp") : "-"}</TableCell>
                        <TableCell>
                          <Badge variant={log.action === "enabled" ? "default" : "destructive"}>
                            {log.action === "enabled" ? "ON" : "OFF"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{log.reason || "-"}</TableCell>
                        <TableCell>{log.affected_students || 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ DIALOGS ═══ */}

      {/* Turn Payments OFF */}
      <Dialog open={showPayOffDialog} onOpenChange={setShowPayOffDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Turn Payments Off?", "إيقاف المدفوعات؟")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("Reason (English)", "السبب (إنجليزي)")}</Label>
              <Textarea value={payOffForm.reason} onChange={(e) => setPayOffForm(f => ({ ...f, reason: e.target.value }))} required />
            </div>
            <div>
              <Label>{t("Reason (Arabic)", "السبب (عربي)")}</Label>
              <Textarea value={payOffForm.reason_ar} onChange={(e) => setPayOffForm(f => ({ ...f, reason_ar: e.target.value }))} dir="rtl" />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("Give all students free access?", "منح جميع الطلاب وصولاً مجانياً؟")}</Label>
              <Switch checked={payOffForm.freeAccess} onCheckedChange={(v) => setPayOffForm(f => ({ ...f, freeAccess: v }))} />
            </div>
            <div>
              <Label>{t("Schedule auto turn-on date (optional)", "جدولة تاريخ التشغيل التلقائي (اختياري)")}</Label>
              <Input type="date" value={payOffForm.autoOnDate} onChange={(e) => setPayOffForm(f => ({ ...f, autoOnDate: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowPayOffDialog(false)}>{t("Cancel", "إلغاء")}</Button>
              <Button variant="destructive" onClick={handlePayOff} disabled={!payOffForm.reason}>
                {t("Yes, Turn Payments Off", "نعم، أوقف المدفوعات")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Turn Payments ON */}
      <Dialog open={showPayOnDialog} onOpenChange={setShowPayOnDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Turn Payments On?", "تشغيل المدفوعات؟")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("Payment grace period (days)", "فترة السماح (أيام)")}</Label>
              <Input type="number" value={payOnForm.graceDays} onChange={(e) => setPayOnForm(f => ({ ...f, graceDays: parseInt(e.target.value) || 7 }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("Notify all students?", "إشعار جميع الطلاب؟")}</Label>
              <Switch checked={payOnForm.notify} onCheckedChange={(v) => setPayOnForm(f => ({ ...f, notify: v }))} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowPayOnDialog(false)}>{t("Cancel", "إلغاء")}</Button>
              <Button onClick={handlePayOn} style={{ background: "#c9973a", color: "#fff" }}>
                {t("Yes, Turn Payments On", "نعم، شغّل المدفوعات")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Set Holiday */}
      <Dialog open={showHolidayDialog} onOpenChange={setShowHolidayDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Set Academy on Holiday", "تعيين عطلة الأكاديمية")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("Resume Date", "تاريخ الاستئناف")}</Label>
              <Input type="date" value={holidayForm.resumeDate} onChange={(e) => setHolidayForm(f => ({ ...f, resumeDate: e.target.value }))} required />
            </div>
            <div>
              <Label>{t("Holiday Reason (English)", "سبب العطلة (إنجليزي)")}</Label>
              <Textarea value={holidayForm.reason} onChange={(e) => setHolidayForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div>
              <Label>{t("Holiday Reason (Arabic)", "سبب العطلة (عربي)")}</Label>
              <Textarea value={holidayForm.reason_ar} onChange={(e) => setHolidayForm(f => ({ ...f, reason_ar: e.target.value }))} dir="rtl" />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("Notify all students?", "إشعار جميع الطلاب؟")}</Label>
              <Switch checked={holidayForm.notify} onCheckedChange={(v) => setHolidayForm(f => ({ ...f, notify: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("Auto turn payments OFF?", "إيقاف المدفوعات تلقائياً؟")}</Label>
              <Switch checked={holidayForm.autoPayOff} onCheckedChange={(v) => setHolidayForm(f => ({ ...f, autoPayOff: v }))} />
            </div>
            {holidayForm.autoPayOff && (
              <div className="flex items-center justify-between">
                <Label>{t("Auto turn ON on resume?", "تشغيل تلقائي عند الاستئناف؟")}</Label>
                <Switch checked={holidayForm.autoPayOn} onCheckedChange={(v) => setHolidayForm(f => ({ ...f, autoPayOn: v }))} />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowHolidayDialog(false)}>{t("Cancel", "إلغاء")}</Button>
              <Button onClick={handleSetHoliday} disabled={!holidayForm.resumeDate} style={{ background: "#c9973a", color: "#fff" }}>
                {t("Save Holiday", "حفظ العطلة")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Resume Academy */}
      <Dialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Resume Academy", "استئناف الأكاديمية")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("Resume Date", "تاريخ الاستئناف")}</Label>
              <Input type="date" value={resumeForm.resumeDate} onChange={(e) => setResumeForm(f => ({ ...f, resumeDate: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("Notify all students?", "إشعار جميع الطلاب؟")}</Label>
              <Switch checked={resumeForm.notify} onCheckedChange={(v) => setResumeForm(f => ({ ...f, notify: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("Auto turn payments ON?", "تشغيل المدفوعات تلقائياً؟")}</Label>
              <Switch checked={resumeForm.autoPayOn} onCheckedChange={(v) => setResumeForm(f => ({ ...f, autoPayOn: v }))} />
            </div>
            {resumeForm.autoPayOn && (
              <div>
                <Label>{t("Grace period (days)", "فترة السماح (أيام)")}</Label>
                <Input type="number" value={resumeForm.graceDays} onChange={(e) => setResumeForm(f => ({ ...f, graceDays: parseInt(e.target.value) || 7 }))} />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowResumeDialog(false)}>{t("Cancel", "إلغاء")}</Button>
              <Button onClick={handleResume} style={{ background: "#22c55e", color: "#fff" }}>
                {t("Resume Now", "استئنف الآن")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Term */}
      <Dialog open={showTermDialog} onOpenChange={setShowTermDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Create Term", "إنشاء فصل دراسي")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("Title", "العنوان")}</Label>
              <Input value={termForm.title} onChange={(e) => setTermForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. First Term 2025/2026" />
            </div>
            <div>
              <Label>{t("Title (Arabic)", "العنوان (عربي)")}</Label>
              <Input value={termForm.title_ar} onChange={(e) => setTermForm(f => ({ ...f, title_ar: e.target.value }))} dir="rtl" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("Academic Year", "السنة الأكاديمية")}</Label>
                <Input value={termForm.academic_year} onChange={(e) => setTermForm(f => ({ ...f, academic_year: e.target.value }))} />
              </div>
              <div>
                <Label>{t("Term", "الفصل")}</Label>
                <Select value={termForm.term} onValueChange={(v) => setTermForm(f => ({ ...f, term: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first">First</SelectItem>
                    <SelectItem value="second">Second</SelectItem>
                    <SelectItem value="third">Third</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("Start Date", "تاريخ البداية")}</Label>
                <Input type="date" value={termForm.term_start_date} onChange={(e) => setTermForm(f => ({ ...f, term_start_date: e.target.value }))} />
              </div>
              <div>
                <Label>{t("End Date", "تاريخ النهاية")}</Label>
                <Input type="date" value={termForm.term_end_date} onChange={(e) => setTermForm(f => ({ ...f, term_end_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>{t("Resume Date", "تاريخ الاستئناف")}</Label>
              <Input type="date" value={termForm.resume_date} onChange={(e) => setTermForm(f => ({ ...f, resume_date: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("Set as Active Term", "تعيين كفصل نشط")}</Label>
              <Switch checked={termForm.is_active} onCheckedChange={(v) => setTermForm(f => ({ ...f, is_active: v }))} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowTermDialog(false)}>{t("Cancel", "إلغاء")}</Button>
              <Button onClick={handleCreateTerm} disabled={!termForm.term_start_date || !termForm.term_end_date} style={{ background: "#c9973a", color: "#fff" }}>
                {t("Save Term", "حفظ الفصل")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AcademicCalendar;
