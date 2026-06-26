/*
  supabase/functions/notify-content-upload/index.ts
  ══════════════════════════════════════════════════════════════════════
  Called by Postgres triggers on INSERT into:
    • subject_assignments
    • subject_announcements
    • subject_materials
    • session_recordings

  For each event it:
    1. Resolves the subject title (EN + AR)
    2. Finds every student enrolled in that subject (regular + private)
    3. Inserts one bell notification per student into `notifications`
       → dispatch-notification trigger fires automatically for push/Telegram

  Notification types used (must NOT be class_reminder/class_ring — those
  are excluded from dispatch-notification push. These are distinct types
  so dispatch-notification sends push normally):
    assignment   → "📝 New Assignment"
    announcement → "📣 New Announcement"
    material     → "📂 New Material"
    recording    → "🎬 Class Recording"
══════════════════════════════════════════════════════════════════════
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_BASE_URL = "https://tahleemacademy.vercel.app";

// ── Student deep-link paths per content type ──────────────────────────────────
// All go to the student learning hub with the subject open on the right tab.
function buildLink(contentType: string, subjectId: string, contentId: string): string {
  switch (contentType) {
    case "assignment":   return `${APP_BASE_URL}/student/courses?subject=${subjectId}&tab=assignments&highlight=${contentId}`;
    case "announcement": return `${APP_BASE_URL}/student/courses?subject=${subjectId}&tab=announcements&highlight=${contentId}`;
    case "material":     return `${APP_BASE_URL}/student/courses?subject=${subjectId}&tab=materials&highlight=${contentId}`;
    case "recording":    return `${APP_BASE_URL}/student/courses?subject=${subjectId}&tab=recordings&highlight=${contentId}`;
    default:             return `${APP_BASE_URL}/student/courses?subject=${subjectId}`;
  }
}

// ── Bilingual notification copy ────────────────────────────────────────────────
function buildCopy(
  contentType: string,
  subjectTitle: string,
  subjectTitleAr: string,
  contentTitle: string
): { title: string; message: string; title_ar: string; message_ar: string } {
  switch (contentType) {
    case "assignment":
      return {
        title:      `📝 New Assignment — ${subjectTitle}`,
        message:    `Assalamu Alaikum 🌙 A new assignment "${contentTitle}" has been posted. Complete it before the deadline — barakallahu feekum.`,
        title_ar:   `📝 واجب جديد — ${subjectTitleAr || subjectTitle}`,
        message_ar: `السلام عليكم ورحمة الله 🌙 تم نشر واجب جديد "${contentTitle}". أتمّوه قبل الموعد النهائي — بارك الله فيكم.`,
      };
    case "announcement":
      return {
        title:      `📣 Announcement — ${subjectTitle}`,
        message:    `Assalamu Alaikum 🌙 Your teacher posted a new announcement: "${contentTitle}". Open the academy to read it.`,
        title_ar:   `📣 إعلان جديد — ${subjectTitleAr || subjectTitle}`,
        message_ar: `السلام عليكم ورحمة الله 🌙 نشر المعلم إعلاناً جديداً: "${contentTitle}". افتح التطبيق للاطلاع.`,
      };
    case "material":
      return {
        title:      `📂 New Material — ${subjectTitle}`,
        message:    `Assalamu Alaikum 🌙 New learning material "${contentTitle}" is now available. May Allah bless your studies.`,
        title_ar:   `📂 مادة تعليمية جديدة — ${subjectTitleAr || subjectTitle}`,
        message_ar: `السلام عليكم ورحمة الله 🌙 تمت إضافة مادة تعليمية جديدة "${contentTitle}". بارك الله في علمكم.`,
      };
    case "recording":
      return {
        title:      `🎬 Class Recording — ${subjectTitle}`,
        message:    `Assalamu Alaikum 🌙 The recording for "${contentTitle}" is now available. Review it to strengthen your understanding — in sha Allah.`,
        title_ar:   `🎬 تسجيل الدرس — ${subjectTitleAr || subjectTitle}`,
        message_ar: `السلام عليكم ورحمة الله 🌙 تسجيل درس "${contentTitle}" متاح الآن. راجعه لتثبيت الفهم — بإذن الله.`,
      };
    default:
      return {
        title:      `📚 ${subjectTitle}`,
        message:    `Assalamu Alaikum 🌙 New content "${contentTitle}" has been posted for your subject.`,
        title_ar:   `📚 ${subjectTitleAr || subjectTitle}`,
        message_ar: `السلام عليكم ورحمة الله 🌙 تمت إضافة محتوى جديد "${contentTitle}" للمادة.`,
      };
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    /*
      Expected payload from Postgres trigger:
      {
        content_type: "assignment" | "announcement" | "material" | "recording",
        content_id:   string,   -- NEW.id
        subject_id:   string,   -- NEW.subject_id
        title:        string,   -- NEW.title
        created_by:   string,   -- NEW.created_by  (uploader's user_id — skip their own notif)
      }
    */
    const { content_type, content_id, subject_id, title: contentTitle, created_by } = body;

    if (!content_type || !content_id || !subject_id || !contentTitle) {
      return new Response(
        JSON.stringify({ error: "content_type, content_id, subject_id, title required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Resolve subject title
    const { data: subject } = await sb
      .from("subjects")
      .select("title, title_ar")
      .eq("id", subject_id)
      .maybeSingle();

    const subjectTitle   = (subject as any)?.title    ?? "Your Subject";
    const subjectTitleAr = (subject as any)?.title_ar ?? subjectTitle;

    // 2. Build notification copy
    const copy = buildCopy(content_type, subjectTitle, subjectTitleAr, contentTitle);
    const link = buildLink(content_type, subject_id, content_id);

    // 3. Collect all students enrolled in this subject
    //    a) Regular enrollments via `profiles` role=student who have this subject
    //       in their timetable / subject access.
    //       We use private_student_subjects (explicit per-student subject grants)
    //       UNION all students whose level matches the subject's levels array.
    //
    //    Strategy that works with existing schema:
    //      - private_student_subjects: student_id where subject_id matches
    //      - profiles where role = 'student' and NOT in private_student_subjects
    //        (i.e. general students who see all subjects in their level)
    //        — but we don't have a clean level filter here, so we just
    //          notify ALL students for general subjects. For private subjects,
    //          only those explicitly assigned.

    // Check if this subject has any private student assignments
    const { data: privateRows } = await sb
      .from("private_student_subjects")
      .select("student_id")
      .eq("subject_id", subject_id);

    let studentIds: string[] = [];

    if (privateRows && privateRows.length > 0) {
      // Private subject — only notify explicitly assigned students
      studentIds = (privateRows as any[]).map((r) => r.student_id);
    } else {
      // General subject — notify all active students
      const { data: allStudents } = await sb
        .from("profiles")
        .select("user_id")
        .eq("role", "student");
      studentIds = (allStudents ?? []).map((s: any) => s.user_id);
    }

    // Remove the uploader themselves (teacher/admin) from the list
    studentIds = studentIds.filter((id) => id !== created_by);

    if (studentIds.length === 0) {
      console.log(`[notify-content-upload] no students to notify for subject ${subject_id}`);
      return new Response(JSON.stringify({ ok: true, notified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Insert one bell notification per student
    //    dispatch-notification trigger fires automatically for each insert
    //    and sends push + Telegram (since type is NOT class_reminder/class_ring)
    const rows = studentIds.map((userId) => ({
      user_id:    userId,
      title:      copy.title,
      message:    copy.message,
      title_ar:   copy.title_ar,
      message_ar: copy.message_ar,
      type:       content_type,   // "assignment" | "announcement" | "material" | "recording"
      link,
      is_read:    false,
    }));

    // Insert in batches of 50 to avoid payload limits
    const BATCH = 50;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await sb.from("notifications").insert(rows.slice(i, i + BATCH));
      if (error) {
        console.error(`[notify-content-upload] insert batch error:`, error.message);
      } else {
        inserted += Math.min(BATCH, rows.length - i);
      }
    }

    console.log(`[notify-content-upload] ✅ notified ${inserted}/${studentIds.length} students for ${content_type} in subject ${subject_id}`);

    return new Response(JSON.stringify({ ok: true, notified: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[notify-content-upload] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
