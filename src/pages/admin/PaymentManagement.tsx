import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  DollarSign, Users, AlertTriangle, TrendingUp, Download,
  CreditCard, Search, UserCheck, Bell, GraduationCap, Plus, Pencil, Trash2
} from "lucide-react";
import { format } from "date-fns";

const EMPTY_PLAN = {
  name: "", name_ar: "", description: "", description_ar: "",
  amount: 0, currency: "NGN", type: "term", level: "all",
  duration_months: 3, is_active: true, paystack_plan_code: "",
};

const PaymentManagement = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [payments, setPayments] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalMonth: 0, totalAll: 0, active: 0, unpaid: 0, expiring: 0, failed: 0 });
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ student_id: "", plan_id: "", amount: 0, method: "bank_transfer", reference: "", notes: "", date: new Date().toISOString().split("T")[0] });
  const [loading, setLoading] = useState(true);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [planForm, setPlanForm] = useState<any>({ ...EMPTY_PLAN });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [paymentsRes, plansRes, studentsRes, subsRes] = await Promise.all([
      supabase.from("payments" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("payment_plans" as any).select("*").order("amount"),
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("student_subscriptions" as any).select("*"),
    ]);

    const payData = (paymentsRes.data || []) as any[];
    const planData = (plansRes.data || []) as any[];
    const studentData = (studentsRes.data || []) as any[];
    const subData = (subsRes.data || []) as any[];

    setPayments(payData);
    setPlans(planData);
    setStudents(studentData);
    setSubscriptions(subData);

    // Calc stats
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekFromNow = new Date(now.getTime() + 7 * 86400000);

    const successPayments = payData.filter((p: any) => p.status === "success");
    const monthPayments = successPayments.filter((p: any) => new Date(p.paid_at || p.created_at) >= monthStart);

    setStats({
      totalMonth: monthPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0),
      totalAll: successPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0),
      active: subData.filter((s: any) => s.status === "active").length,
      unpaid: studentData.filter((s: any) => s.payment_status === "unpaid" || !s.payment_status).length,
      expiring: subData.filter((s: any) => s.end_date && new Date(s.end_date) <= weekFromNow && s.status === "active").length,
      failed: payData.filter((p: any) => p.status === "failed").length,
    });

    setLoading(false);
  };

  const recordManualPayment = async () => {
    if (!manualForm.student_id || !manualForm.plan_id || !manualForm.amount) {
      toast({ title: "Fill all required fields", variant: "destructive" });
      return;
    }

    const plan = plans.find((p: any) => p.id === manualForm.plan_id);
    const reference = `TAH-MANUAL-${Date.now()}`;

    // Create payment
    await supabase.from("payments" as any).insert({
      student_id: manualForm.student_id,
      plan_id: manualForm.plan_id,
      amount: manualForm.amount,
      status: "success",
      type: "manual",
      paystack_reference: reference,
      payment_method: manualForm.method,
      paid_at: manualForm.date,
      notes: manualForm.notes,
      recorded_by: user!.id,
    });

    // Update profile
    const endDate = new Date(manualForm.date);
    endDate.setMonth(endDate.getMonth() + (plan?.duration_months || 3));

    await supabase.from("profiles")
      .update({ payment_status: "paid", subscription_end_date: endDate.toISOString().split("T")[0] } as any)
      .eq("user_id", manualForm.student_id);

    // Create subscription
    await supabase.from("student_subscriptions" as any).insert({
      student_id: manualForm.student_id,
      plan_id: manualForm.plan_id,
      status: "active",
      start_date: manualForm.date,
      end_date: endDate.toISOString().split("T")[0],
    });

    toast({ title: "Manual payment recorded successfully ✅" });
    setManualDialogOpen(false);
    setManualForm({ student_id: "", plan_id: "", amount: 0, method: "bank_transfer", reference: "", notes: "", date: new Date().toISOString().split("T")[0] });
    loadData();
  };

  const toggleExempt = async (studentId: string, exempt: boolean) => {
    await supabase.from("profiles")
      .update({ is_payment_exempt: exempt, payment_status: exempt ? "exempt" : "unpaid" } as any)
      .eq("user_id", studentId);
    toast({ title: exempt ? "Student marked as exempt 🎓" : "Exemption removed" });
    loadData();
  };

  const openCreatePlan = () => {
    setEditingPlan(null);
    setPlanForm({ ...EMPTY_PLAN });
    setPlanDialogOpen(true);
  };

  const openEditPlan = (plan: any) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name || "", name_ar: plan.name_ar || "",
      description: plan.description || "", description_ar: plan.description_ar || "",
      amount: plan.amount || 0, currency: plan.currency || "NGN",
      type: plan.type || "term", level: plan.level || "all",
      duration_months: plan.duration_months || 3, is_active: plan.is_active ?? true,
      paystack_plan_code: plan.paystack_plan_code || "",
    });
    setPlanDialogOpen(true);
  };

  const savePlan = async () => {
    if (!planForm.name || !planForm.amount) {
      toast({ title: t("Plan name and amount are required", "اسم الخطة والمبلغ مطلوبان"), variant: "destructive" });
      return;
    }
    const payload = {
      name: planForm.name, name_ar: planForm.name_ar || null,
      description: planForm.description || null, description_ar: planForm.description_ar || null,
      amount: Number(planForm.amount), currency: planForm.currency,
      type: planForm.type, level: planForm.level === "all" ? null : planForm.level,
      duration_months: Number(planForm.duration_months) || null,
      is_active: planForm.is_active,
      paystack_plan_code: planForm.paystack_plan_code || null,
    };
    if (editingPlan) {
      await supabase.from("payment_plans" as any).update(payload as any).eq("id", editingPlan.id);
      toast({ title: t("Plan updated ✅", "تم تحديث الخطة ✅") });
    } else {
      await supabase.from("payment_plans" as any).insert(payload as any);
      toast({ title: t("Plan created ✅", "تم إنشاء الخطة ✅") });
    }
    setPlanDialogOpen(false);
    loadData();
  };

  const deletePlan = async (planId: string) => {
    if (!confirm(t("Delete this plan? This cannot be undone.", "حذف هذه الخطة؟ لا يمكن التراجع."))) return;
    await supabase.from("payment_plans" as any).delete().eq("id", planId);
    toast({ title: t("Plan deleted", "تم حذف الخطة") });
    loadData();
  };

  const exportCSV = () => {
    const headers = "Date,Student,Plan,Amount,Status,Method,Reference\n";
    const rows = payments.map((p: any) => {
      const student = students.find((s: any) => s.user_id === p.student_id);
      const plan = plans.find((pl: any) => pl.id === p.plan_id);
      return `${p.paid_at || p.created_at},${student?.full_name || ""},${plan?.name || ""},${p.amount},${p.status},${p.payment_method || ""},${p.paystack_reference || ""}`;
    }).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `payments-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const filteredStudents = students.filter((s: any) => {
    const matchSearch = !search || (s.full_name || "").toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" ||
      (filter === "paid" && s.payment_status === "paid") ||
      (filter === "unpaid" && (!s.payment_status || s.payment_status === "unpaid")) ||
      (filter === "grace" && s.payment_status === "grace") ||
      (filter === "exempt" && (s.is_payment_exempt || s.payment_status === "exempt"));
    return matchSearch && matchFilter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("Payment Management", "إدارة المدفوعات")}</h1>
          <p className="text-sm text-muted-foreground">{t("Manage student payments and subscriptions", "إدارة مدفوعات واشتراكات الطلاب")}</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> {t("Record Manual Payment", "تسجيل دفع يدوي")}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t("Record Manual Payment", "تسجيل دفع يدوي")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Student</Label>
                  <Select value={manualForm.student_id} onValueChange={v => setManualForm(f => ({ ...f, student_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                    <SelectContent>
                      {students.map((s: any) => (
                        <SelectItem key={s.user_id} value={s.user_id}>{s.full_name || s.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Plan</Label>
                  <Select value={manualForm.plan_id} onValueChange={v => {
                    const plan = plans.find((p: any) => p.id === v);
                    setManualForm(f => ({ ...f, plan_id: v, amount: plan?.amount || 0 }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                    <SelectContent>
                      {plans.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} — ₦{p.amount?.toLocaleString()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Amount (₦)</Label>
                  <Input type="number" value={manualForm.amount} onChange={e => setManualForm(f => ({ ...f, amount: +e.target.value }))} />
                </div>
                <div>
                  <Label>Method</Label>
                  <Select value={manualForm.method} onValueChange={v => setManualForm(f => ({ ...f, method: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={manualForm.date} onChange={e => setManualForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={manualForm.notes} onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <Button onClick={recordManualPayment} className="w-full">Record Payment</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { icon: TrendingUp, label: "This Month", value: `₦${stats.totalMonth.toLocaleString()}`, color: "text-green-600" },
          { icon: DollarSign, label: "All Time", value: `₦${stats.totalAll.toLocaleString()}`, color: "text-blue-600" },
          { icon: Users, label: "Active Subs", value: stats.active, color: "text-emerald-600" },
          { icon: AlertTriangle, label: "Unpaid", value: stats.unpaid, color: "text-red-600" },
          { icon: Bell, label: "Expiring Soon", value: stats.expiring, color: "text-orange-600" },
          { icon: CreditCard, label: "Failed", value: stats.failed, color: "text-red-500" },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="p-4 text-center">
              <s.icon className={`h-5 w-5 mx-auto mb-1 ${s.color}`} />
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">{t("Students", "الطلاب")}</TabsTrigger>
          <TabsTrigger value="transactions">{t("Transactions", "المعاملات")}</TabsTrigger>
          <TabsTrigger value="plans">{t("Plans", "الخطط")}</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="grace">Grace</SelectItem>
                <SelectItem value="exempt">Exempt</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((s: any) => (
                  <TableRow key={s.user_id}>
                    <TableCell>
                      <p className="font-medium">{s.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{s.level || "—"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        s.payment_status === "paid" || s.is_payment_exempt ? "default" :
                        s.payment_status === "grace" ? "secondary" : "destructive"
                      }>
                        {s.is_payment_exempt ? "Exempt" : s.payment_status || "unpaid"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.subscription_end_date ? format(new Date(s.subscription_end_date), "dd MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => {
                          setManualForm(f => ({ ...f, student_id: s.user_id }));
                          setManualDialogOpen(true);
                        }}>💰</Button>
                        <Button size="sm" variant="outline" onClick={() => toggleExempt(s.user_id, !s.is_payment_exempt)}>
                          {s.is_payment_exempt ? "Remove" : "🎓"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="transactions">
          <div className="rounded-lg border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p: any) => {
                  const student = students.find((s: any) => s.user_id === p.student_id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{p.paid_at ? format(new Date(p.paid_at), "dd MMM yyyy") : format(new Date(p.created_at), "dd MMM yyyy")}</TableCell>
                      <TableCell>{student?.full_name || "—"}</TableCell>
                      <TableCell className="font-medium">₦{p.amount?.toLocaleString()}</TableCell>
                      <TableCell className="text-sm">{p.payment_method || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === "success" ? "default" : p.status === "failed" ? "destructive" : "secondary"}>
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{p.paystack_reference || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="plans" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{t("Create, edit and manage payment plans", "إنشاء وتعديل وإدارة خطط الدفع")}</p>
            <Button onClick={openCreatePlan}><Plus className="h-4 w-4 mr-2" /> {t("New Plan", "خطة جديدة")}</Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan: any) => (
              <Card key={plan.id} className={!plan.is_active ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base">{plan.name}</CardTitle>
                      {plan.name_ar && <p className="text-xs text-muted-foreground font-arabic">{plan.name_ar}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={plan.is_active}
                        onCheckedChange={async (checked) => {
                          await supabase.from("payment_plans" as any).update({ is_active: checked }).eq("id", plan.id);
                          loadData();
                        }}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-2xl font-bold">{plan.currency === "USD" ? "$" : "₦"}{plan.amount?.toLocaleString()}</p>
                  {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline">{plan.type}</Badge>
                    <Badge variant="outline">{plan.level || "all levels"}</Badge>
                    {plan.duration_months && <Badge variant="outline">{plan.duration_months} {t("months", "شهور")}</Badge>}
                    <Badge variant="outline">{plan.currency}</Badge>
                  </div>
                  <div className="flex gap-2 pt-2 border-t">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => openEditPlan(plan)}>
                      <Pencil className="h-3 w-3 mr-1" /> {t("Edit", "تعديل")}
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => deletePlan(plan.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Plan Create/Edit Dialog */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan ? t("Edit Payment Plan", "تعديل خطة الدفع") : t("Create Payment Plan", "إنشاء خطة دفع")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("Plan Name (English)", "اسم الخطة (إنجليزي)")}</Label>
                <Input value={planForm.name} onChange={e => setPlanForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="e.g. Term Fee" />
              </div>
              <div>
                <Label>{t("Plan Name (Arabic)", "اسم الخطة (عربي)")}</Label>
                <Input value={planForm.name_ar} onChange={e => setPlanForm((f: any) => ({ ...f, name_ar: e.target.value }))} placeholder="مثال: رسوم الفصل" dir="rtl" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("Amount", "المبلغ")}</Label>
                <Input type="number" value={planForm.amount} onChange={e => setPlanForm((f: any) => ({ ...f, amount: +e.target.value }))} min={0} />
              </div>
              <div>
                <Label>{t("Currency", "العملة")}</Label>
                <Select value={planForm.currency} onValueChange={v => setPlanForm((f: any) => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN">NGN (₦)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="SAR">SAR (﷼)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("Plan Type", "نوع الخطة")}</Label>
                <Select value={planForm.type} onValueChange={v => setPlanForm((f: any) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="term">{t("Term", "فصل دراسي")}</SelectItem>
                    <SelectItem value="monthly">{t("Monthly", "شهري")}</SelectItem>
                    <SelectItem value="yearly">{t("Yearly", "سنوي")}</SelectItem>
                    <SelectItem value="one_time">{t("One-Time", "مرة واحدة")}</SelectItem>
                    <SelectItem value="private">{t("Private Session", "جلسة خاصة")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("Duration (months)", "المدة (بالأشهر)")}</Label>
                <Input type="number" value={planForm.duration_months} onChange={e => setPlanForm((f: any) => ({ ...f, duration_months: +e.target.value }))} min={1} max={36} />
              </div>
            </div>

            <div>
              <Label>{t("Level", "المستوى")}</Label>
              <Select value={planForm.level} onValueChange={v => setPlanForm((f: any) => ({ ...f, level: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("All Levels", "جميع المستويات")}</SelectItem>
                  <SelectItem value="beginner">{t("Beginner", "مبتدئ")}</SelectItem>
                  <SelectItem value="intermediate">{t("Intermediate", "متوسط")}</SelectItem>
                  <SelectItem value="advanced">{t("Advanced", "متقدم")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("Description (English)", "الوصف (إنجليزي)")}</Label>
                <Textarea value={planForm.description} onChange={e => setPlanForm((f: any) => ({ ...f, description: e.target.value }))} rows={2} />
              </div>
              <div>
                <Label>{t("Description (Arabic)", "الوصف (عربي)")}</Label>
                <Textarea value={planForm.description_ar} onChange={e => setPlanForm((f: any) => ({ ...f, description_ar: e.target.value }))} rows={2} dir="rtl" />
              </div>
            </div>

            <div>
              <Label>{t("Paystack Plan Code (optional)", "كود خطة Paystack (اختياري)")}</Label>
              <Input value={planForm.paystack_plan_code} onChange={e => setPlanForm((f: any) => ({ ...f, paystack_plan_code: e.target.value }))} placeholder="PLN_xxxxx" />
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={planForm.is_active} onCheckedChange={v => setPlanForm((f: any) => ({ ...f, is_active: v }))} />
              <Label>{t("Active", "نشط")}</Label>
            </div>

            <Button onClick={savePlan} className="w-full">
              {editingPlan ? t("Update Plan", "تحديث الخطة") : t("Create Plan", "إنشاء الخطة")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PaymentManagement;
