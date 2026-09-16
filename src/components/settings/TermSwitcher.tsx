/* src/components/settings/TermSwitcher.tsx
   ────────────────────────────────────────────────────────────────────
   Lets a student switch which academic term they're viewing.

   How it works with the rest of the schema:
   - `academic_terms` holds Term 1 / 2 / 3 with real start/end dates.
   - `subject_term_snapshots` holds a frozen copy of each subject's
     title/level/delivery_mode/track *as it looked* for a given term.
   - `profiles.active_term_id` is which term a student is currently
     viewing. Nothing about their enrollment or schedule changes when
     they switch — only which snapshot is used to LABEL their subjects
     (via the `v_student_subjects` view).
   - Switching is a one-way, explicit action: once a student moves to
     a new term, the previous term's snapshot is no longer shown to
     them anywhere `v_student_subjects` is used.

   Usage: drop <TermSwitcher /> into ProfileSettings.tsx (or wherever
   student settings live). It's self-contained — fetches its own data,
   no props required.
   ────────────────────────────────────────────────────────────────────
*/
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, CalendarClock, AlertTriangle } from "lucide-react";

interface TermRow {
  id: string;
  term_number: number;
  name: string;
  name_ar: string | null;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

const styles = {
  section: {
    background: "#fff",
    borderRadius: 16,
    border: "1px solid #e5e7eb",
    overflow: "hidden",
    marginBottom: 14,
  } as React.CSSProperties,
  header: {
    padding: "10px 16px",
    background: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
  } as React.CSSProperties,
  headerText: {
    fontWeight: 700,
    fontSize: 12,
    color: "#6b7280",
    margin: 0,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  body: { padding: "14px 16px" },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid #f3f4f6",
  } as React.CSSProperties,
  termName: { fontWeight: 600, fontSize: 13, color: "#111827", margin: 0 },
  termSub: { fontSize: 11, color: "#6b7280", margin: 0 },
  switchBtn: {
    padding: "6px 14px",
    borderRadius: 10,
    border: "1px solid #0f5132",
    background: "transparent",
    color: "#0f5132",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  } as React.CSSProperties,
  currentBadge: {
    padding: "4px 10px",
    borderRadius: 999,
    background: "#0f5132",
    color: "#fff",
    fontWeight: 700,
    fontSize: 11,
  },
};

export default function TermSwitcher() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [terms, setTerms] = useState<TermRow[]>([]);
  const [activeTermId, setActiveTermId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [pendingTerm, setPendingTerm] = useState<TermRow | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [{ data: termRows }, { data: profileRow }] = await Promise.all([
        supabase.from("academic_terms").select("*").order("term_number", { ascending: true }),
        supabase.from("profiles").select("active_term_id").eq("user_id", user.id).single(),
      ]);
      setTerms((termRows as TermRow[]) || []);
      setActiveTermId(profileRow?.active_term_id ?? null);
      setLoading(false);
    })();
  }, [user?.id]);

  const confirmSwitch = async () => {
    if (!pendingTerm || !user?.id) return;
    setSwitching(true);
    const { error } = await supabase
      .from("profiles")
      .update({ active_term_id: pendingTerm.id })
      .eq("user_id", user.id);
    setSwitching(false);
    if (error) {
      toast({ title: "Couldn't switch term", description: error.message, variant: "destructive" });
      return;
    }
    setActiveTermId(pendingTerm.id);
    setPendingTerm(null);
    toast({ title: `Switched to ${pendingTerm.name}`, description: "You'll now see this term's subjects and schedule." });
  };

  if (loading) {
    return (
      <div style={styles.section}>
        <div style={styles.body}>
          <Loader2 size={16} style={{ animation: "spin .8s linear infinite" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={styles.section}>
      <div style={styles.header}>
        <p style={styles.headerText}>Academic Term</p>
      </div>
      <div style={styles.body}>
        {terms.map((term) => {
          const isActive = term.id === activeTermId;
          return (
            <div key={term.id} style={styles.row}>
              <div>
                <p style={styles.termName}>
                  <CalendarClock size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                  {term.name}
                </p>
                <p style={styles.termSub}>
                  {new Date(term.start_date).toLocaleDateString()} – {new Date(term.end_date).toLocaleDateString()}
                  {term.is_current ? " · Current academy term" : ""}
                </p>
              </div>
              {isActive ? (
                <span style={styles.currentBadge}>Viewing</span>
              ) : (
                <button style={styles.switchBtn} onClick={() => setPendingTerm(term)}>
                  Switch here
                </button>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={!!pendingTerm} onOpenChange={(open) => !open && setPendingTerm(null)}>
        <DialogContent>
          <div style={{ padding: 4 }}>
            <p style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 15, marginBottom: 8 }}>
              <AlertTriangle size={18} color="#b45309" /> Switch to {pendingTerm?.name}?
            </p>
            <p style={{ fontSize: 13, color: "#4b5563", marginBottom: 16 }}>
              You'll see {pendingTerm?.name}'s subjects, names, and schedule from now on. You will
              no longer see your current term's version — this can be switched back, but it isn't
              automatic. Only do this once you're ready to move on.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setPendingTerm(null)}
                style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmSwitch}
                disabled={switching}
                style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "#0f5132", color: "#fff", fontWeight: 700, cursor: switching ? "not-allowed" : "pointer" }}
              >
                {switching ? "Switching…" : "Confirm switch"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
