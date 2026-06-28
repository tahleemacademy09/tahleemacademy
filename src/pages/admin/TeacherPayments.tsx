/*  src/pages/admin/TeacherPayments.tsx  */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Users, CheckCircle, XCircle, Clock,
  Plus, ChevronDown, ChevronUp, Search,
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

const PAYMENT_METHODS = ["Bank Transfer", "Cash", "Paystack", "Opay", "PalmPay", "Cheque", "Other"];
const PAYMENT_TYPES   = ["Monthly Salary", "Weekly Allowance", "Bonus", "Term Payment", "One-time", "Overtime", "Other"];

const fmtAmt = (amt: number, currency = "NGN") => {
  const sym: Record<string, string> = { NGN: "₦", USD: "$", GBP: "£", SAR: "﷼" };
  return `${sym[currency] || "₦"}${(amt || 0).toLocaleString()}`;
};

const StatCard = ({ icon: Icon, bg, color, label, value }: any) => (
  <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
    <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon size={16} color={color} />
    </div>
    <div>
      <div style={{ fontSize: 9, color: "#7a9e88", fontWeight: 600, textTransform: "uppercase", letterSpacing: .5 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: G }}>{value}</div>
    </div>
  </div>
);

const Fld = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 12 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>{label}</label>
    {children}
  </div>
);

const EMPTY_PAYMENT = {
  teacher_id: "", amount: "", currency: "NGN", payment_type: "Monthly Salary",
  payment_method: "Bank Transfer", reference: "", period: "", notes: "",
  payment_date: new Date().toISOString().split("T")[0], status: "paid",
};

export default function TeacherPayments() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [teachers,        setTeachers]        = useState<any[]>([]);
  const [bankAccounts,    setBankAccounts]     = useState<Record<string, any>>({});
  const [payments,        setPayments]         = useState<any[]>([]);
  const [stats,           setStats]            = useState({ totalPaid: 0, pendingAmt: 0, teachersWithBank: 0, totalTeachers: 0 });
  const [loading,         setLoading]          = useState(true);
  const [refreshing,      setRefreshing]       = useState(false);
  const [search,          setSearch]           = useState("");
  const [selectedTeacher, setSelectedTeacher]  = useState<any | null>(null);
  const [expandedPay,     setExpandedPay]      = useState<string | null>(null);
  const [showMasked,      setShowMasked]       = useState<Record<string, boolean>>({});
  const [payOpen,         setPayOpen]          = useState(false);
  const [payForm,         setPayForm]          = useState({ ...EMPTY_PAYMENT });
  const [payLoading,      setPayLoading]       = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Get teacher user_ids from profiles (role = teacher)
      //    We read from profiles directly — more reliable than user_roles table
      //    which may not exist in all environments.
      const { data: teacherProfiles } = await (supabase as any)
        .from("profiles")
        .select("user_id")
        .eq("role", "teacher");

      let teacherIds: string[] = (teacherProfiles || []).map((r: any) => r.user_id);

      // Fallback: try user_roles table too (union, ignore if table missing)
      try {
        const { data: roleRows } = await (supabase as any)
          .from("user_roles")
          .select("user_id")
          .eq("role", "teacher");
        if (roleRows) {
          const roleIds = (roleRows as any[]).map((r: any) => r.user_id);
          teacherIds = Array.from(new Set([...teacherIds, ...roleIds]));
        }
      } catch {
        // user_roles table doesn't exist — that's fine, we got teachers from profiles
      }

      // 2. Fetch bank accounts — gracefully handle missing table
      let banks: any[] = [];
      try {
        const { data: bankRows, error: bankErr } = await (supabase as any)
          .from("teacher_bank_accounts")
          .select("*");
        if (!bankErr) banks = bankRows || [];
      } catch {
        // teacher_bank_accounts table missing — show teachers with "No Bank Details"
      }

      const bankOwnerIds: string[] = banks.map((r: any) => r.user_id);
      const allTeacherIds = Array.from(new Set([...teacherIds, ...bankOwnerIds]));

      // 3. Get their profiles
      let tList: any[] = [];
      if (allTeacherIds.length > 0) {
        const { data } = await (supabase as any)
          .from("profiles")
          .select("user_id, full_name, full_name_ar, email, avatar_url, phone")
          .in("user_id", allTeacherIds)
          .order("full_name");
        tList = data || [];
      }

      // 4. All payments — gracefully handle missing table
      let pays: any[] = [];
      try {
        const { data: payRows, error: payErr } = await (supabase as any)
          .from("teacher_payments")
          .select("*")
          .order("payment_date", { ascending: false });
        if (!payErr) pays = payRows || [];
      } catch {
        // teacher_payments table missing — will show empty history
      }

      const bankMap: Record<string, any> = {};
      banks.forEach((b: any) => { bankMap[b.user_id] = b; });

      setTeachers(tList);
      setBankAccounts(bankMap);
      setPayments(pays);

      setStats({
        totalPaid:        pays.filter((r: any) => r.status === "paid").reduce((s: number, r: any) => s + (r.amount || 0), 0),
        pendingAmt:       pays.filter((r: any) => r.status === "pending").reduce((s: number, r: any) => s + (r.amount || 0), 0),
        teachersWithBank: Object.keys(bankMap).length,
        totalTeachers:    tList.length,
      });
    } catch (err: any) {
      console.error("[TeacherPayments] loadAll error:", err);
      toast({ title: "Failed to load teacher data", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const refresh = () => { setRefreshing(true); loadAll(); };

  // ── Record payment ─────────────────────────────────────────────────────────
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
      reference:      payForm.reference  || null,
      period:         payForm.period     || null,
      notes:          payForm.notes      || null,
      payment_date:   payForm.payment_date,
      status:         payForm.status,
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

  // ── Helpers ────────────────────────────────────────────────────────────────
  const teacherPayments = (tid: string) => payments.filter((p: any) => p.teacher_id === tid);
  const teacherTotal    = (tid: string) =>
    teacherPayments(tid).filter((p: any) => p.status === "paid")
      .reduce((s: number, p: any) => s + (p.amount || 0), 0);

  const filteredTeachers = teachers.filter(t =>
    !search ||
    (t.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (t.email     || "").toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F3F4F6" }}>
      <Loader2 size={28} color={G} style={{ animation: "spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "'Cairo', system-ui, sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }
        .tp-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        @media (min-width: 600px) { .tp-stats { grid-template-columns: repeat(4, 1fr); } }
        .tp-detail-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
        @media (min-width: 500px) { .tp-detail-grid { grid-template-columns: 1fr 1fr; } }
        .tp-pay-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
        @media (min-width: 400px) { .tp-pay-grid { grid-template-columns: 2fr 1fr; } }
        .tp-pay-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      `}</style>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "20px 16px 18px", boxShadow: "0 4px 20px rgba(15,45,31,.3)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h1 style={{ fontWeight: 900, fontSize: 20, color: "#fff", margin: 0 }}>Teacher Payments</h1>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,.6)", margin: "3px 0 0" }}>Salary management &amp; payment history</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={refresh} disabled={refreshing}
                style={{ padding: "9px 14px", borderRadius: 10, border: "1.5px solid rgba(255,255,255,.3)", background: "transparent", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700 }}>
                <RefreshCw size={13} style={refreshing ? { animation: "spin .8s linear infinite" } : {}} /> Refresh
              </button>
              <button onClick={() => openPayDialog()}
                style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: GOLD, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800 }}>
                <Plus size={14} /> Record Payment
              </button>
            </div>
          </div>

          {/* Stats — 2 cols mobile, 4 cols desktop */}
          <div className="tp-stats">
            <StatCard icon={TrendingUp} bg="#ECFDF5" color="#16A34A" label="Total Paid (All)"   value={fmtAmt(stats.totalPaid)} />
            <StatCard icon={Clock}      bg="#FFFBEB" color="#D97706" label="Pending"             value={fmtAmt(stats.pendingAmt)} />
            <StatCard icon={Building2}  bg="#EFF6FF" color="#3B82F6" label="Bank Details Saved" value={`${stats.teachersWithBank}/${stats.totalTeachers}`} />
            <StatCard icon={Users}      bg="#FDF4FF" color="#9333EA" label="Total Teachers"     value={stats.totalTeachers} />
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 12px 40px", animation: "fadeUp .3s ease" }}>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 14 }}>
          <Search size={14} color="#9CA3AF" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input style={{ ...inp, paddingLeft: 36 }} placeholder="Search by teacher name or email…"
            value={search} onChange={e => setSearch(e.target.value)} />
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
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 14px", cursor: "pointer" }}
                onClick={() => setSelectedTeacher(isOpen ? null : teacher)}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(135deg,${G},${GM})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                  {teacher.avatar_url
                    ? <img src={teacher.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                    : <span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{initials}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{teacher.full_name || teacher.email}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{teacher.email}</div>
                  <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                    {bank ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 20, background: bank.is_verified ? "#ECFDF5" : "#FFFBEB", color: bank.is_verified ? "#16A34A" : "#D97706", fontSize: 10, fontWeight: 700 }}>
                        {bank.is_verified ? <BadgeCheck size={9} /> : <AlertTriangle size={9} />}
                        {bank.is_verified ? "Bank Verified" : "Bank Unverified"}
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 20, background: "#FEF2F2", color: "#DC2626", fontSize: 10, fontWeight: 700 }}>
                        <XCircle size={9} /> No Bank Details
                      </span>
                    )}
                    {pays.length > 0 && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 20, background: "#EFF6FF", color: "#3B82F6", fontSize: 10, fontWeight: 700 }}>
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
                <div style={{ borderTop: "1px solid #F3F4F6", padding: "14px 14px", background: "#FAFAFA" }}>
                  <div className="tp-detail-grid" style={{ marginBottom: 14 }}>

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
                        {bank.account_name && (
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 10, color: "#9CA3AF" }}>Account Name</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{bank.account_name}</div>
                          </div>
                        )}
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
                        { label: "Total Paid",   value: fmtAmt(total),                                                                                      color: "#16A34A" },
                        { label: "Pending",       value: fmtAmt(pays.filter((p: any) => p.status === "pending").reduce((s: number, p: any) => s + p.amount, 0)), color: "#D97706" },
                        { label: "Records",       value: pays.length.toString(),                                                                             color: "#3B82F6" },
                        { label: "Last Payment",  value: pays[0]?.payment_date ? new Date(pays[0].payment_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—", color: "#9CA3AF" },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F9FAFB" }}>
                          <span style={{ fontSize: 12, color: "#6B7280" }}>{label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Record payment CTA */}
                  <button onClick={() => openPayDialog(teacher)}
                    style={{ width: "100%", padding: "11px 0", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14, boxShadow: "0 3px 10px rgba(6,78,59,.2)" }}>
                    <Plus size={14} /> Record Payment for {teacher.full_name?.split(" ")[0] || "Teacher"}
                  </button>

                  {/* Payment history */}
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
                                <div className="tp-pay-grid2" style={{ marginTop: 8 }}>
                                  {[
                                    { l: "Method",    v: pay.payment_method || "—" },
                                    { l: "Reference", v: pay.reference      || "—" },
                                    { l: "Paid by",   v: pay.paid_by        ? "Admin" : "—" },
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

      {/* ── Record Payment Dialog ─────────────────────────────────────────── */}
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
                {bankAccounts[payForm.teacher_id].bank_name} · ****{bankAccounts[payForm.teacher_id].account_number.slice(-4)}
                {bankAccounts[payForm.teacher_id].account_name ? ` · ${bankAccounts[payForm.teacher_id].account_name}` : ""}
              </div>
            )}
            {payForm.teacher_id && !bankAccounts[payForm.teacher_id] && (
              <div style={{ padding: "8px 10px", borderRadius: 9, background: "#FEF2F2", border: "1px solid #FECACA", marginBottom: 12, fontSize: 11, color: "#DC2626", fontWeight: 600 }}>
                <AlertTriangle size={12} style={{ display: "inline", marginRight: 4 }} />
                No bank details saved — ask teacher to update Settings → Payments.
              </div>
            )}

            <div className="tp-pay-grid">
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

            <div className="tp-pay-grid2">
              <Fld label="Payment Type">
                <select style={inp} value={payForm.payment_type} onChange={e => setPayForm(f => ({ ...f, payment_type: e.target.value }))}>
                  {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Fld>
              <Fld label="Method">
                <select style={inp} value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Fld>
            </div>

            <div className="tp-pay-grid2">
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
              <button onClick={() => setPayOpen(false)}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={recordPayment} disabled={payLoading || !payForm.teacher_id || !payForm.amount}
                style={{ flex: 2, padding: 12, borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 13, color: "#fff",
                  background: payLoading || !payForm.teacher_id || !payForm.amount ? "#9CA3AF" : `linear-gradient(135deg,${G},${GM})`,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {payLoading
                  ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Recording…</>
                  : <><CheckCircle size={14} /> Record Payment</>}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
