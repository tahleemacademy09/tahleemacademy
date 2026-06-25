/*  src/pages/admin/TeacherPayments.tsx
    Admin panel: View all teachers, their bank details, record salary payments,
    and track the full payment history per teacher.

    DB tables required (see SQL migration at bottom of this file):
      • teacher_bank_accounts  — teacher's bank details
      • teacher_payments       — salary / payment records per teacher
*/
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Users, Banknote, CheckCircle, XCircle, Clock,
  Plus, ChevronDown, ChevronUp, Download, Search,
  RefreshCw, Loader2, AlertTriangle, BadgeCheck,
  Building2, CreditCard, TrendingUp, Eye, EyeOff,
} from "lucide-react";

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c";

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 13px", borderRadius: 10,
  border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none",
  background: "#FAFAFA", boxSizing: "border-box" as const,
  fontFamily: "'Cairo', system-ui, sans-serif", color: "#111",
};

const STATUS_CFG: Record<string, { label: string; bg: string; color: string; icon: any }> = {
  paid:    { label: "Paid",    bg: "#F0FFF4", color: "#16A34A", icon: CheckCircle },
  pending: { label: "Pending", bg: "#FFFBEB", color: "#D97706", icon: Clock },
  failed:  { label: "Failed",  bg: "#FEF2F2", color: "#DC2626", icon: XCircle },
};

const PAYMENT_METHODS = [
  "Bank Transfer", "Cash", "Paystack", "Opay", "PalmPay", "Cheque", "Other",
];
const PAYMENT_TYPES = [
  "Monthly Salary", "Weekly Allowance", "Bonus", "Term Payment", "One-time", "Overtime", "Other",
];

const fmtAmt = (amt: number, currency = "NGN") => {
  const sym: Record<string, string> = { NGN: "₦", USD: "$", GBP: "£", SAR: "﷼" };
  return `${sym[currency] || "₦"}${(amt || 0).toLocaleString()}`;
};

const EMPTY_PAYMENT = {
  teacher_id: "", amount: "", currency: "NGN", payment_type: "Monthly Salary",
  payment_method: "Bank Transfer", reference: "", period: "", notes: "",
  payment_date: new Date().toISOString().split("T")[0], status: "paid",
};

export default function TeacherPayments() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [teachers,       setTeachers]       = useState<any[]>([]);
  const [bankAccounts,   setBankAccounts]   = useState<Record<string, any>>({});
  const [payments,       setPayments]       = useState<any[]>([]);
  const [stats,          setStats]          = useState({ totalPaid: 0, pendingAmt: 0, teachersWithBank: 0, totalTeachers: 0 });
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [search,         setSearch]         = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState<any | null>(null);
  const [expandedPay,    setExpandedPay]    = useState<string | null>(null);
  const [showMasked,     setShowMasked]     = useState<Record<string, boolean>>({});

  // Record payment dialog
  const [payOpen,        setPayOpen]        = useState(false);
  const [payForm,        setPayForm]        = useState({ ...EMPTY_PAYMENT });
  const [payLoading,     setPayLoading]     = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // Teachers list
      const { data: tList } = await (supabase as any)
        .from("profiles")
        .select("user_id, full_name, full_name_ar, email, avatar_url, phone")
        .eq("role", "teacher")
        .order("full_name");

      // Bank accounts (keyed by user_id)
      const { data: banks } = await (supabase as any)
        .from("teacher_bank_accounts")
        .select("*");

      // All payments
      const { data: pays } = await (supabase as any)
        .from("teacher_payments")
        .select("*, profiles!teacher_payments_paid_by_fkey(full_name)")
        .order("payment_date", { ascending: false });

      const bankMap: Record<string, any> = {};
      (banks || []).forEach((b: any) => { bankMap[b.user_id] = b; });

      setTeachers(tList || []);
      setBankAccounts(bankMap);
      setPayments(pays || []);

      const pRows = pays || [];
      const totalPaid    = pRows.filter((r: any) => r.status === "paid").reduce((s: number, r: any) => s + (r.amount || 0), 0);
      const pendingAmt   = pRows.filter((r: any) => r.status === "pending").reduce((s: number, r: any) => s + (r.amount || 0), 0);
      setStats({
        totalPaid,
        pendingAmt,
        teachersWithBank: Object.keys(bankMap).length,
        totalTeachers: (tList || []).length,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const refresh = () => { setRefreshing(true); loadAll(); };

  // ── Record payment ────────────────────────────────────────────────────────
  const openPayDialog = (teacher?: any) => {
    setPayForm({ ...EMPTY_PAYMENT, teacher_id: teacher?.user_id || "" });
    setPayOpen(true);
  };

  const recordPayment = async () => {
    if (!payForm.teacher_id || !payForm.amount) {
      toast({ title: "Fill in teacher and amount", variant: "destructive" }); return;
    }
    setPayLoading(true);
    const { error } = await (supabase as any).from("teacher_payments").insert({
      teacher_id:     payForm.teacher_id,
      paid_by:        user?.id,
      amount:         parseFloat(payForm.amount),
      currency:       payForm.currency,
      payment_type:   payForm.payment_type,
      payment_method: payForm.payment_method,
      reference:      payForm.reference || null,
      period:         payForm.period    || null,
      notes:          payForm.notes     || null,
      payment_date:   payForm.payment_date,
      status:         payForm.status,
      created_at:     new Date().toISOString(),
    });
    setPayLoading(false);
    if (error) {
      toast({ title: "Error recording payment", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Payment recorded successfully!" });
      setPayOpen(false);
      loadAll();
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const teacherPayments = (teacherId: string) =>
    payments.filter((p: any) => p.teacher_id === teacherId);

  const teacherTotal = (teacherId: string) =>
    teacherPayments(teacherId).filter((p: any) => p.status === "paid")
      .reduce((s: number, p: any) => s + (p.amount || 0), 0);

  const filteredTeachers = teachers.filter(t =>
    !search || (t.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (t.email || "").toLowerCase().includes(search.toLowerCase()),
  );

  // UI pieces
  const StatCard = ({ icon: Icon, bg, color, label, value, sub }: any) => (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 10, color: "#7a9e88", fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: G }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: "#9CA3AF" }}>{sub}</div>}
      </div>
    </div>
  );

  const Fld = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F3F4F6" }}>
      <Loader2 size={28} color={G} style={{ animation: "spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "'Cairo', system-ui, sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "20px 18px 18px", boxShadow: "0 4px 20px rgba(15,45,31,.3)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h1 style={{ fontWeight: 900, fontSize: 20, color: "#fff", margin: 0 }}>Teacher Payments</h1>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,.6)", margin: "3px 0 0" }}>Salary management &amp; payment history</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={refresh} disabled={refreshing} style={{ padding: "9px 14px", borderRadius: 10, border: "1.5px solid rgba(255,255,255,.3)", background: "transparent", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700 }}>
                <RefreshCw size={13} style={refreshing ? { animation: "spin .8s linear infinite" } : {}} /> Refresh
              </button>
              <button onClick={() => openPayDialog()} style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: GOLD, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800 }}>
                <Plus size={14} /> Record Payment
              </button>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            <StatCard icon={TrendingUp} bg="#ECFDF5" color="#16A34A" label="Total Paid (All)" value={fmtAmt(stats.totalPaid)} />
            <StatCard icon={Clock}      bg="#FFFBEB" color="#D97706" label="Pending"           value={fmtAmt(stats.pendingAmt)} />
            <StatCard icon={Building2}  bg="#EFF6FF" color="#3B82F6" label="Bank Details Saved" value={`${stats.teachersWithBank}/${stats.totalTeachers}`} />
            <StatCard icon={Users}      bg="#FDF4FF" color="#9333EA" label="Total Teachers"    value={stats.totalTeachers} />
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "18px 16px 40px", animation: "fadeUp .3s ease" }}>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 16 }}>
          <Search size={14} color="#9CA3AF" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input
            style={{ ...inp, paddingLeft: 36 }}
            placeholder="Search by teacher name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Teacher cards */}
        {filteredTeachers.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9CA3AF" }}>
            <Users size={36} style={{ margin: "0 auto 10px", display: "block", color: "#D1D5DB" }} />
            <p style={{ margin: 0 }}>No teachers found</p>
          </div>
        )}

        {filteredTeachers.map(teacher => {
          const bank   = bankAccounts[teacher.user_id];
          const pays   = teacherPayments(teacher.user_id);
          const total  = teacherTotal(teacher.user_id);
          const isOpen = selectedTeacher?.user_id === teacher.user_id;
          const initials = (teacher.full_name || teacher.email || "T")[0].toUpperCase();
          const masked = showMasked[teacher.user_id];

          return (
            <div key={teacher.user_id} style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", marginBottom: 12, overflow: "hidden" }}>

              {/* Teacher row */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" }}
                onClick={() => setSelectedTeacher(isOpen ? null : teacher)}>
                {/* Avatar */}
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(135deg,${G},${GM})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                  {teacher.avatar_url
                    ? <img src={teacher.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                    : <span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{initials}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{teacher.full_name || teacher.email}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{teacher.email}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    {bank ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, background: bank.is_verified ? "#ECFDF5" : "#FFFBEB", color: bank.is_verified ? "#16A34A" : "#D97706", fontSize: 10, fontWeight: 700 }}>
                        {bank.is_verified ? <BadgeCheck size={9} /> : <AlertTriangle size={9} />}
                        {bank.is_verified ? "Bank Verified" : "Bank Unverified"}
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, background: "#FEF2F2", color: "#DC2626", fontSize: 10, fontWeight: 700 }}>
                        <XCircle size={9} /> No Bank Details
                      </span>
                    )}
                    {pays.length > 0 && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, background: "#EFF6FF", color: "#3B82F6", fontSize: 10, fontWeight: 700 }}>
                        <CreditCard size={9} /> {pays.length} payment{pays.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 15, color: "#111" }}>{fmtAmt(total)}</div>
                  <div style={{ fontSize: 10, color: "#9CA3AF" }}>total paid</div>
                </div>
                {isOpen ? <ChevronUp size={14} color="#9CA3AF" /> : <ChevronDown size={14} color="#9CA3AF" />}
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ borderTop: "1px solid #F3F4F6", padding: "14px 16px", background: "#FAFAFA" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

                    {/* Bank details */}
                    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: 14 }}>
                      <div style={{ fontWeight: 800, fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: .8, marginBottom: 10 }}>Bank Details</div>
                      {bank ? <>
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 10, color: "#9CA3AF" }}>Bank</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{bank.bank_name}</div>
                        </div>
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 10, color: "#9CA3AF" }}>Account Number</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#111", letterSpacing: 1 }}>
                              {masked ? bank.account_number : `${bank.account_number.slice(0,3)}****${bank.account_number.slice(-3)}`}
                            </div>
                            <button onClick={() => setShowMasked(m => ({ ...m, [teacher.user_id]: !m[teacher.user_id] }))}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                              {masked ? <EyeOff size={12} color="#9CA3AF" /> : <Eye size={12} color="#9CA3AF" />}
                            </button>
                          </div>
                        </div>
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 10, color: "#9CA3AF" }}>Account Name</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{bank.account_name}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: bank.is_verified ? "#ECFDF5" : "#FFFBEB", color: bank.is_verified ? "#16A34A" : "#D97706" }}>
                            {bank.is_verified ? "✓ Verified" : "⚠ Unverified"}
                          </span>
                          <span style={{ fontSize: 10, color: "#9CA3AF" }}>{bank.currency}</span>
                        </div>
                      </> : (
                        <div style={{ color: "#9CA3AF", fontSize: 12, textAlign: "center", padding: "10px 0" }}>
                          <Building2 size={22} style={{ margin: "0 auto 6px", display: "block", color: "#D1D5DB" }} />
                          Teacher has not added bank details yet
                        </div>
                      )}
                    </div>

                    {/* Quick stats */}
                    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: 14 }}>
                      <div style={{ fontWeight: 800, fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: .8, marginBottom: 10 }}>Payment Summary</div>
                      {[
                        { label: "Total Paid", value: fmtAmt(total), color: "#16A34A" },
                        { label: "Pending", value: fmtAmt(pays.filter((p: any) => p.status === "pending").reduce((s: number, p: any) => s + p.amount, 0)), color: "#D97706" },
                        { label: "Records", value: pays.length.toString(), color: "#3B82F6" },
                        { label: "Last Payment", value: pays[0]?.payment_date ? new Date(pays[0].payment_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—", color: "#9CA3AF" },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F9FAFB" }}>
                          <span style={{ fontSize: 12, color: "#6B7280" }}>{label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Record payment CTA */}
                  <button
                    onClick={() => { openPayDialog(teacher); }}
                    style={{ width: "100%", padding: "11px 0", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14, boxShadow: "0 3px 10px rgba(6,78,59,.2)" }}>
                    <Plus size={14} /> Record Payment for {teacher.full_name?.split(" ")[0] || "Teacher"}
                  </button>

                  {/* Payment history list */}
                  {pays.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: .8, marginBottom: 8 }}>Payment History</div>
                      {pays.map((pay: any) => {
                        const cfg  = STATUS_CFG[pay.status] || STATUS_CFG.pending;
                        const Icon = cfg.icon;
                        const rowOpen = expandedPay === pay.id;
                        return (
                          <div key={pay.id} style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", marginBottom: 6, overflow: "hidden" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }}
                              onClick={() => setExpandedPay(rowOpen ? null : pay.id)}>
                              <div style={{ width: 32, height: 32, borderRadius: 9, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <Icon size={14} color={cfg.color} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 12, color: "#111" }}>{pay.payment_type || "Salary Payment"}</div>
                                <div style={{ fontSize: 10, color: "#9CA3AF" }}>
                                  {pay.payment_date ? new Date(pay.payment_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                                  {pay.period ? ` · ${pay.period}` : ""}
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontWeight: 900, fontSize: 13, color: "#111" }}>{fmtAmt(pay.amount, pay.currency)}</div>
                                <span style={{ padding: "2px 7px", borderRadius: 20, fontSize: 9, fontWeight: 700, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                              </div>
                              {rowOpen ? <ChevronUp size={12} color="#9CA3AF" /> : <ChevronDown size={12} color="#9CA3AF" />}
                            </div>
                            {rowOpen && (
                              <div style={{ padding: "0 12px 10px", borderTop: "1px solid #F9FAFB" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
                                  {[
                                    { l: "Method",    v: pay.payment_method || "—" },
                                    { l: "Reference", v: pay.reference      || "—" },
                                    { l: "Paid by",   v: pay.profiles?.full_name || "Admin" },
                                    { l: "Period",    v: pay.period         || "—" },
                                  ].map(({ l, v }) => (
                                    <div key={l}>
                                      <div style={{ fontSize: 9, color: "#9CA3AF" }}>{l}</div>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>{v}</div>
                                    </div>
                                  ))}
                                </div>
                                {pay.notes && <div style={{ marginTop: 8, padding: "6px 8px", background: "#F9FAFB", borderRadius: 7, fontSize: 11, color: "#374151" }}>{pay.notes}</div>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Record Payment Dialog ────────────────────────────────────────────── */}
      <Dialog open={payOpen} onOpenChange={v => !v && setPayOpen(false)}>
        <DialogContent style={{ maxWidth: 460, borderRadius: 20, padding: 0, overflow: "hidden", maxHeight: "90vh", overflowY: "auto" }}>
          <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "16px 20px", position: "sticky", top: 0, zIndex: 10 }}>
            <h2 style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0 }}>💰 Record Teacher Payment</h2>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,.6)", margin: "3px 0 0" }}>Fill in the payment details below</p>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 0 }}>
            <Fld label="Teacher *">
              <select style={inp} value={payForm.teacher_id} onChange={e => setPayForm(f => ({ ...f, teacher_id: e.target.value }))}>
                <option value="">Select teacher…</option>
                {teachers.map(t => <option key={t.user_id} value={t.user_id}>{t.full_name || t.email}</option>)}
              </select>
            </Fld>

            {payForm.teacher_id && bankAccounts[payForm.teacher_id] && (
              <div style={{ padding: "8px 10px", borderRadius: 9, background: "#ECFDF5", border: "1px solid #86EFAC", marginBottom: 12, fontSize: 11, color: "#15803D", fontWeight: 600 }}>
                <BadgeCheck size={12} style={{ display: "inline", marginRight: 4 }} />
                {bankAccounts[payForm.teacher_id].bank_name} · ****{bankAccounts[payForm.teacher_id].account_number.slice(-4)} · {bankAccounts[payForm.teacher_id].account_name}
              </div>
            )}
            {payForm.teacher_id && !bankAccounts[payForm.teacher_id] && (
              <div style={{ padding: "8px 10px", borderRadius: 9, background: "#FEF2F2", border: "1px solid #FECACA", marginBottom: 12, fontSize: 11, color: "#DC2626", fontWeight: 600 }}>
                <AlertTriangle size={12} style={{ display: "inline", marginRight: 4 }} />
                This teacher has no bank details saved — ask them to update their Settings → Payments tab.
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
              <Fld label="Amount *">
                <input style={inp} type="number" min="0" placeholder="e.g. 50000" value={payForm.amount}
                  onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
              </Fld>
              <Fld label="Currency">
                <select style={inp} value={payForm.currency} onChange={e => setPayForm(f => ({ ...f, currency: e.target.value }))}>
                  <option value="NGN">NGN ₦</option>
                  <option value="USD">USD $</option>
                  <option value="GBP">GBP £</option>
                  <option value="SAR">SAR ﷼</option>
                </select>
              </Fld>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Fld label="Payment Type">
                <select style={inp} value={payForm.payment_type} onChange={e => setPayForm(f => ({ ...f, payment_type: e.target.value }))}>
                  {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Fld>
              <Fld label="Payment Method">
                <select style={inp} value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Fld>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Fld label="Payment Date">
                <input style={inp} type="date" value={payForm.payment_date}
                  onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))} />
              </Fld>
              <Fld label="Status">
                <select style={inp} value={payForm.status} onChange={e => setPayForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </Fld>
            </div>

            <Fld label="Period (e.g. June 2026, Term 1)">
              <input style={inp} placeholder="e.g. June 2026" value={payForm.period}
                onChange={e => setPayForm(f => ({ ...f, period: e.target.value }))} />
            </Fld>

            <Fld label="Reference / Transaction ID">
              <input style={inp} placeholder="e.g. TRF-20240601-001" value={payForm.reference}
                onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} />
            </Fld>

            <Fld label="Notes">
              <textarea style={{ ...inp, minHeight: 70, resize: "vertical" as const }} placeholder="Any additional notes…"
                value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
            </Fld>

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button onClick={() => setPayOpen(false)} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={recordPayment} disabled={payLoading || !payForm.teacher_id || !payForm.amount} style={{
                flex: 2, padding: 12, borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 13,
                color: "#fff", background: payLoading || !payForm.teacher_id || !payForm.amount ? "#9CA3AF" : `linear-gradient(135deg,${G},${GM})`,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                {payLoading ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Recording…</> : <><CheckCircle size={14} /> Record Payment</>}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SUPABASE SQL MIGRATION — run once in the SQL editor
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. Teacher bank accounts
create table if not exists public.teacher_bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  bank_code      text not null,
  bank_name      text not null,
  account_number text not null,
  account_name   text,
  currency       text not null default 'NGN',
  is_verified    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique(user_id)
);

-- RLS: teacher can manage their own; admin can read all
alter table public.teacher_bank_accounts enable row level security;
create policy "teacher own bank" on public.teacher_bank_accounts
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "admin read banks" on public.teacher_bank_accounts
  for select using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

-- 2. Teacher payments
create table if not exists public.teacher_payments (
  id             uuid primary key default gen_random_uuid(),
  teacher_id     uuid not null references auth.users(id) on delete cascade,
  paid_by        uuid references auth.users(id),
  amount         numeric(12,2) not null,
  currency       text not null default 'NGN',
  payment_type   text not null default 'Monthly Salary',
  payment_method text not null default 'Bank Transfer',
  reference      text,
  period         text,
  notes          text,
  receipt_url    text,
  payment_date   date not null default current_date,
  status         text not null default 'paid' check (status in ('paid','pending','failed')),
  created_at     timestamptz not null default now()
);

-- RLS: teacher reads own; admin full access
alter table public.teacher_payments enable row level security;
create policy "teacher read own payments" on public.teacher_payments
  for select using (auth.uid() = teacher_id);
create policy "admin all payments" on public.teacher_payments
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

-- Indexes for fast lookups
create index if not exists idx_teacher_payments_teacher on public.teacher_payments(teacher_id);
create index if not exists idx_teacher_payments_date    on public.teacher_payments(payment_date desc);
*/
