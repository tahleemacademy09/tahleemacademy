// src/components/layout/ImpersonationBanner.tsx
import { useNavigate } from "react-router-dom";
import { useImpersonation } from "@/hooks/useImpersonation";
import { ShieldAlert, X } from "lucide-react";

export default function ImpersonationBanner() {
  const { isImpersonating, impersonatedName, stopImpersonating } = useImpersonation();
  const navigate = useNavigate();

  if (!isImpersonating) return null;

  return (
    <div className="sticky top-0 z-[100] flex items-center justify-between gap-2 px-4 py-2 text-xs font-bold text-white"
      style={{ background: "linear-gradient(90deg, #7c3aed, #6d28d9)" }}>
      <span className="flex items-center gap-2">
        <ShieldAlert size={14} />
        Admin Mode — Viewing as: <strong className="text-purple-200">{impersonatedName || "Student"}</strong>
      </span>
      <button
        onClick={() => { stopImpersonating(); navigate("/admin/students"); }}
        className="flex items-center gap-1 rounded-md border border-white/30 px-3 py-1 text-[11px] hover:bg-white/20 transition-colors"
      >
        <X size={12} /> Exit
      </button>
    </div>
  );
}
