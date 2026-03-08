import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { CheckCircle, CreditCard, Shield, BookOpen, Video, ClipboardList, MessageCircle, BookMarked } from "lucide-react";

declare global {
  interface Window {
    PaystackPop: any;
  }
}

const PaymentScreen = () => {
  const navigate = useNavigate();
  const { user, profile, hasRole } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paystackLoaded, setPaystackLoaded] = useState(false);
  const [publicKey, setPublicKey] = useState("");

  useEffect(() => {
    if (!user) { navigate("/login"); return; }
    if (hasRole("admin") || hasRole("teacher")) { navigate("/admin"); return; }
    if (profile?.payment_status === "paid" || profile?.payment_status === "exempt" || profile?.is_payment_exempt) {
      navigate("/student"); return;
    }
    loadPlans();
    loadPaystackKey();
    loadPaystackScript();
  }, [user, profile]);

  const loadPaystackKey = async () => {
    // Fetch from edge function that returns the public key
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paystack-webhook`,
        { method: "GET", headers: { "Content-Type": "application/json" } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.publicKey) setPublicKey(data.publicKey);
      }
    } catch {
      // Fallback - will be set from env
    }
  };

  const loadPaystackScript = () => {
    if (document.getElementById("paystack-script")) {
      setPaystackLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "paystack-script";
    script.src = "https://js.paystack.co/v2/inline.js";
    script.async = true;
    script.onload = () => setPaystackLoaded(true);
    document.head.appendChild(script);
  };

  const loadPlans = async () => {
    const { data } = await supabase
      .from("payment_plans" as any)
      .select("*")
      .eq("is_active", true)
      .order("amount");

    if (data) {
      setPlans(data);
      // Auto-select plan based on student level
      const level = profile?.level || "beginner";
      const termPlan = data.find((p: any) => p.type === "term" && p.level === level);
      if (termPlan) setSelectedPlan(termPlan);
      else if (data.length > 0) setSelectedPlan(data[0]);
    }
    setLoading(false);
  };

  const handlePayment = async () => {
    if (!selectedPlan || !user || !profile) return;
    if (!paystackLoaded || !window.PaystackPop) {
      toast({ title: "Payment system loading, please wait...", variant: "destructive" });
      return;
    }

    setPaying(true);
    const reference = `TAH-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // Create pending payment record
    await supabase.from("payments" as any).insert({
      student_id: user.id,
      plan_id: selectedPlan.id,
      amount: selectedPlan.amount,
      currency: selectedPlan.currency || "NGN",
      status: "pending",
      type: "enrollment",
      paystack_reference: reference,
    });

    try {
      const popup = new window.PaystackPop();
      popup.newTransaction({
        key: publicKey,
        email: profile.email || user.email,
        amount: selectedPlan.amount * 100,
        currency: selectedPlan.currency || "NGN",
        ref: reference,
        metadata: {
          student_id: user.id,
          plan_id: selectedPlan.id,
          student_name: profile.full_name,
          level: profile.level,
          custom_fields: [
            { display_name: "Student Name", variable_name: "student_name", value: profile.full_name || "" },
            { display_name: "Level", variable_name: "level", value: profile.level || "" },
          ],
        },
        onSuccess: async (response: any) => {
          await verifyPayment(reference, response);
        },
        onCancel: () => {
          toast({ title: "Payment cancelled. You can pay later." });
          setPaying(false);
        },
      });
    } catch (err) {
      toast({ title: "Failed to initialize payment", variant: "destructive" });
      setPaying(false);
    }
  };

  const verifyPayment = async (reference: string, response: any) => {
    // Update payment record
    await supabase.from("payments" as any)
      .update({
        status: "success",
        paystack_transaction_id: response?.trxref || response?.transaction,
        payment_method: "paystack",
        paid_at: new Date().toISOString(),
      })
      .eq("paystack_reference", reference);

    // Update profile
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + (selectedPlan.duration_months || 3));

    await supabase.from("profiles")
      .update({
        payment_status: "paid",
        subscription_end_date: endDate.toISOString().split("T")[0],
      } as any)
      .eq("user_id", user!.id);

    // Create subscription
    const { data: paymentRecord } = await supabase
      .from("payments" as any)
      .select("id")
      .eq("paystack_reference", reference)
      .single();

    await supabase.from("student_subscriptions" as any).insert({
      student_id: user!.id,
      plan_id: selectedPlan.id,
      payment_id: paymentRecord?.id,
      status: "active",
      start_date: new Date().toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
    });

    toast({ title: "✅ Payment Successful! الحمد لله" });
    setPaying(false);
    navigate("/student");
  };

  const handlePayLater = async () => {
    const graceEnd = new Date();
    graceEnd.setDate(graceEnd.getDate() + 7);

    await supabase.from("profiles")
      .update({
        payment_status: "grace",
        subscription_end_date: graceEnd.toISOString().split("T")[0],
      } as any)
      .eq("user_id", user!.id);

    toast({ title: "You have 7 days to complete payment." });
    navigate("/student");
  };

  const levelConfig: Record<string, { emoji: string; color: string; label: string; labelAr: string }> = {
    beginner: { emoji: "🟢", color: "#22c55e", label: "Beginner", labelAr: "مبتدئ" },
    intermediate: { emoji: "🟡", color: "#eab308", label: "Intermediate", labelAr: "متوسط" },
    advanced: { emoji: "🔴", color: "#ef4444", label: "Advanced", labelAr: "متقدم" },
  };

  const lc = levelConfig[profile?.level || "beginner"] || levelConfig.beginner;

  const features = [
    { icon: BookOpen, label: "All level courses" },
    { icon: Video, label: "Live classes" },
    { icon: Video, label: "Recorded sessions" },
    { icon: ClipboardList, label: "Exams and tests" },
    { icon: BookMarked, label: "Revision centre" },
    { icon: MessageCircle, label: "Majlis chat" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f3122" }}>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: "#c9973a", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #0f3122 0%, #1a4a35 50%, #0f3122 100%)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap');
        .payment-card { font-family: 'Cairo', sans-serif; }
        .amiri { font-family: 'Amiri', serif; }
      `}</style>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <Card className="payment-card border-0 shadow-2xl" style={{ background: "#fdf8f0" }}>
          <CardContent className="p-8 space-y-6">
            {/* Bismillah */}
            <div className="text-center">
              <p className="amiri text-xl" style={{ color: "#c9973a" }} dir="rtl">
                بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
              </p>
            </div>

            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold" style={{ color: "#0f3122" }}>
                Complete Your Enrollment
              </h1>
              <p className="amiri text-lg" style={{ color: "#c9973a" }} dir="rtl">
                أكمل التسجيل
              </p>
            </div>

            {/* Level badge */}
            <div className="flex justify-center">
              <Badge className="px-4 py-2 text-base" style={{ background: `${lc.color}20`, color: lc.color, border: `1px solid ${lc.color}` }}>
                {lc.emoji} {lc.label} / {lc.labelAr}
              </Badge>
            </div>

            {/* Plan selector */}
            <div className="space-y-3">
              {plans.filter(p => p.type !== "private").map((plan: any) => (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan)}
                  className="p-4 rounded-xl border-2 cursor-pointer transition-all"
                  style={{
                    borderColor: selectedPlan?.id === plan.id ? "#c9973a" : "#e5e5e5",
                    background: selectedPlan?.id === plan.id ? "rgba(201,151,58,0.08)" : "#fff",
                  }}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-bold text-sm" style={{ color: "#0f3122" }}>{plan.name}</p>
                      <p className="amiri text-xs" style={{ color: "#c9973a" }}>{plan.name_ar}</p>
                      <p className="text-xs mt-1" style={{ color: "#888" }}>
                        {plan.duration_months ? `${plan.duration_months} month${plan.duration_months > 1 ? "s" : ""}` : "Per session"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold" style={{ color: "#0f3122" }}>
                        ₦{plan.amount.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Features */}
            {selectedPlan && (
              <div className="p-4 rounded-xl" style={{ background: "rgba(15,49,34,0.04)" }}>
                <p className="text-xs font-bold mb-3" style={{ color: "#0f3122" }}>What's included:</p>
                <div className="grid grid-cols-2 gap-2">
                  {features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckCircle className="h-3.5 w-3.5" style={{ color: "#22c55e" }} />
                      <span className="text-xs" style={{ color: "#4a4a4a" }}>{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pay button */}
            <Button
              onClick={handlePayment}
              disabled={paying || !selectedPlan}
              className="w-full py-6 text-base rounded-xl font-bold"
              style={{ background: "#c9973a", color: "#fff", fontFamily: "'Cairo', sans-serif" }}
            >
              <CreditCard className="mr-2 h-5 w-5" />
              {paying ? "Processing..." : `Proceed to Payment — ₦${selectedPlan?.amount?.toLocaleString() || 0}`}
            </Button>

            {/* Security note */}
            <div className="flex items-center justify-center gap-2 text-xs" style={{ color: "#999" }}>
              <Shield className="h-3.5 w-3.5" />
              Secured by Paystack
            </div>

            {/* Pay later */}
            <button
              onClick={handlePayLater}
              className="w-full text-center text-sm py-2"
              style={{ color: "#999", background: "none", border: "none", cursor: "pointer" }}
            >
              Pay Later (7-day grace period)
            </button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default PaymentScreen;
