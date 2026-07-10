/*
  supabase/functions/notify-content-upload/index.ts
  ══════════════════════════════════════════════════════════════════════
  Called by Postgres triggers on INSERT into:
    • subject_assignments
    • subject_announcements
    • subject_materials
    • session_recordings

  For each event it:
    1. Resolves the subject title (EN + AR) and teacher
    2. Finds the student audience: enrolled + private-assigned + level-matched
       (falls back to "every student" only if the subject has no level and
       no enrollment/private data at all — i.e. a genuinely open subject)
    3. Notifies the subject's assigned teacher (unless they're the uploader)
    4. Notifies every admin
    5. Inserts one bell notification per recipient into `notifications`
       → dispatch-notification trigger fires automatically for push/Telegram

  Notification types used (must NOT be class_reminder/class_ring — those
  are excluded from dispatch-notification push. These are distinct types
  so dispatch-notification sends push normally):
    assignment   → "📝 New Assignment"          (students)
    announcement → "📣 New Announcement"        (students)
    material     → "📂 New Material"            (students)
    recording    → "🎬 Class Recording"         (students)
    <type>_teacher → same event, teacher-facing copy
    <type>_admin    → same event, admin-facing copy
══════════════════════════════════════════════════════════════════════
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_BASE_URL = "https://tahleemacademy.vercel.app";

function buildLink(contentType: string, subjectId: string, contentId: string): string {
  switch (contentType) {
    case "assignment":   return `${APP_BASE_URL}/student/courses?subject=${subjectId}&tab=assignments&highlight=${contentId}`;
    case "announcement": return `${APP_BASE_URL}/student/courses?subject=${subjectId}&tab=announcements&highlight=${contentId}`;
    case "material":     return `${APP_BASE_URL}/student/courses?subject=${subjectId}&tab=materials&highlight=${contentId}`;
    case "recording":    return `${APP_BASE_URL}/student/courses?subject=${subjectId}&tab=recordings&highlight=${contentId}`;
    default:             return `${APP_BASE_URL}/student/courses?subject=${subjectId}`;
  }
}

function buildTeacherLink(contentType: string, subjectId: string): string {
  return `${APP_BASE_URL}/teacher/subjects?subject=${subjectId}&tab=${contentType}s`;
}

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

const CONTENT_LABEL: Record<string, string> = {
  assignment:   "assignment",
  announcement: "announcement",
  material:     "material",
  recording:    "recording",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
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

    const { data: subject } = await sb
      .from("subjects")
      .select("title, title_ar, teacher_id, level, levels")
      .eq("id", subject_id)
      .maybeSingle();

    const subjectTitle   = (subject as any)?.title    ?? "Your Subject";
    const subjectTitleAr = (subject as any)?.title_ar ?? subjectTitle;
    const teacherId      = (subject as any)?.teacher_id ?? null;
    const subjectLevels: string[] =
      (subject as any)?.levels?.length ? (subject as any).levels
      : (subject as any)?.level ? [(subject as any).level]
      : [];

    const copy = buildCopy(content_type, subjectTitle, subjectTitleAr, contentTitle);
    const link = buildLink(content_type, subject_id, content_id);

    const { data: courses } = await sb
      .from("courses").select("id").eq("subject_id", subject_id);
    const courseIds = (courses || []).map((c: any) => c.id);

    let enrolledIds: string[] = [];
    if (courseIds.length > 0) {
      const { data: enrollments } = await sb
        .from("enrollments").select("user_id").in("course_id", courseIds);
      enrolledIds = (enrollments || []).map((e: any) => e.user_id);
    }

    const { data: privateRows } = await sb
      .from("private_student_subjects")
      .select("student_id")
      .eq("subject_id", subject_id);
    const privateIds = (privateRows || []).map((r: any) => r.student_id);

    let levelIds: string[] = [];
    if (subjectLevels.length > 0) {
      const { data: lvlStudents } = await sb
        .from("profiles").select("user_id").in("level", subjectLevels).eq("role", "student");
      levelIds = (lvlStudents || []).map((p: any) => p.user_id);
    }

    let studentIds = [...new Set([...enrolledIds, ...privateIds, ...levelIds])];

    if (studentIds.length === 0 && subjectLevels.length === 0) {
      const { data: allStudents } = await sb
        .from("profiles")
        .select("user_id")
        .eq("role", "student");
      studentIds = (allStudents ?? []).map((s: any) => s.user_id);
    }

    studentIds = studentIds.filter((id) => id !== created_by);

    const rows = studentIds.map((userId) => ({
      user_id:    userId,
      title:      copy.title,
      message:    copy.message,
      title_ar:   copy.title_ar,
      message_ar: copy.message_ar,
      type:       content_type,
      link,
      is_read:    false,
    }));

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

    let teacherNotified = false;
    if (teacherId && teacherId !== created_by) {
      const label = CONTENT_LABEL[content_type] ?? "content";
      const { error: teacherErr } = await sb.from("notifications").insert({
        user_id:    teacherId,
        title:      `${copy.title} (your subject)`,
        message:    `Assalamu Alaikum 🌙 A new ${label} "${contentTitle}" was posted for ${subjectTitle}, a subject assigned to you.`,
        title_ar:   copy.title_ar,
        message_ar: copy.message_ar,
        type:       `${content_type}_teacher`,
        link:       buildTeacherLink(content_type, subject_id),
        is_read:    false,
      });
      if (teacherErr) console.error("[notify-content-upload] teacher insert error:", teacherErr.message);
      else teacherNotified = true;
    }

    const { data: admins } = await sb.from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = (admins ?? []).map((a: any) => a.user_id).filter((id: string) => id !== created_by);

    let adminsNotified = 0;
    if (adminIds.length > 0) {
      const label = CONTENT_LABEL[content_type] ?? "content";
      const adminRows = adminIds.map((userId: string) => ({
        user_id:    userId,
        title:      `${copy.title} (admin copy)`,
        message:    `A new ${label} "${contentTitle}" was posted for ${subjectTitle}.`,
        title_ar:   copy.title_ar,
        message_ar: copy.message_ar,
        type:       `${content_type}_admin`,
        link:       buildTeacherLink(content_type, subject_id),
        is_read:    false,
      }));
      const { error: adminErr } = await sb.from("notifications").insert(adminRows);
      if (adminErr) console.error("[notify-content-upload] admin insert error:", adminErr.message);
      else adminsNotified = adminRows.length;
    }

    console.log(
      `[notify-content-upload] ✅ ${content_type} in subject ${subject_id}: ` +
      `students ${inserted}/${studentIds.length}, teacher ${teacherNotified ? 1 : 0}, admins ${adminsNotified}`
    );

    return new Response(
      JSON.stringify({ ok: true, notified_students: inserted, teacher_notified: teacherNotified, admins_notified: adminsNotified }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[notify-content-upload] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
