// src/pages/teacher/TeacherHifdhLive.tsx
// Teacher-side entry point for the live Hifdh class (Sabaq/Sabqi/Manzil
// recitation queue). Separate from TeacherHifdhReview.tsx, which reviews
// already-submitted async recordings — this is the live, in-session view.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import HifdhLiveClass from "@/components/hifdh/HifdhLiveClass";

export default function TeacherHifdhLive() {
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      const { data: pf } = await (supabase as any)
        .from("profiles").select("full_name").eq("user_id", data.user.id).maybeSingle();
      if (pf?.full_name) setName(pf.full_name);
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      <HifdhLiveClass userId={userId} studentName={name} isTeacher={true} />
    </div>
  );
}
