import { usePaymentAccess } from "@/hooks/usePaymentAccess";
/*  src/components/PaymentGuard.tsx
    Wrap any page/section that requires payment.
    Usage:
      <PaymentGuard feature="Al-Hifdh Tracker">
        <AlHifdh />
      </PaymentGuard>
*/
import React from "react";
import { useNavigate } from "react-router-dom";
import { Lock, CreditCard, Clock, AlertTriangle } from "lucide-react";

interface PaymentGuardProps {
  children: React.ReactNode;
  feature?: string;
  requireFull?: boolean;  // if true, grace period also blocked
}

export const PaymentGuard: React.FC<PaymentGuardProps> = ({ children, feature = "This feature", requireFull = false }) => {
  const { hasAccess, hasFullAccess, accessStatus, daysInGrace, isLoading } = usePaymentAccess();
  const navigate = useNavigate();

  if (isLoading) return (
    <div style={{ minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 32, height: 32, border: "3px solid #075E54", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
    </div>
  );

  const blocked = requireFull ? !hasFullAccess : !hasAccess;
  if (!blocked) return <>{children}</>;

  return (
    <div style={{ minHeight: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32, textAlign: "center", background: "#FAFAFA", borderRadius: 16, border: "2px dashed #e0e0e0", margin: 16 }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: accessStatus === "grace" ? "#FFF8E1" : "#FFEBEE", border: `2px solid ${accessStatus === "grace" ? "#F9A825" : "#EF9A9A"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {accessStatus === "grace" ? <Clock size={28} color="#F57C00" /> : <Lock size={28} color="#E74C3C" />}
      </div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#111", marginBottom: 6 }}>{feature} — {accessStatus === "grace" ? "Grace Period" : "Locked"}</div>
        {accessStatus === "grace"
          ? <div style={{ fontSize: 13, color: "#888", lineHeight: 1.5 }}>You have <strong style={{ color: "#F57C00" }}>{daysInGrace} day{daysInGrace !== 1 ? "s" : ""}</strong> left in your grace period.<br />Pay now to keep full access.</div>
          : <div style={{ fontSize: 13, color: "#888", lineHeight: 1.5 }}>Your subscription has ended.<br />Complete your payment to unlock {feature}.</div>
        }
      </div>
      <button onClick={() => navigate("/student/enrollment-payment")} style={{ background: "linear-gradient(135deg, #075E54, #128C7E)", color: "#fff", border: "none", borderRadius: 12, padding: "13px 28px", cursor: "pointer", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <CreditCard size={16} /> Go to Payment
      </button>
      {accessStatus === "grace" && daysInGrace <= 2 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#E74C3C", fontWeight: 700 }}>
          <AlertTriangle size={13} /> Only {daysInGrace} day{daysInGrace !== 1 ? "s" : ""} left — don't lose access!
        </div>
      )}
    </div>
  );
};
