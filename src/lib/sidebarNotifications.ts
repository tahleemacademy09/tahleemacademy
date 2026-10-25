/*
  sidebarNotifications.ts — Tahleem Academy
  ──────────────────────────────────────────
  One place that says WHICH sidebar entry a notification belongs to, for all three roles, so every
  entry (student, teacher, admin) can show the red unread badge — not just the few that happened to
  have a link that equalled their route.

  A notification is matched to a sidebar route by:
    1. its link (exact route, or anything under it, or an alias prefix below), then
    2. its `type` — used when the link is missing OR points somewhere that isn't a sidebar entry.

  Visiting a section marks that section's notifications read, which clears its badge (see the
  "opening a section clears it" effects in DashboardLayout and TeacherLayout).
*/

export type SidebarRole = "student" | "admin" | "teacher";
export interface RouteAlias { prefixes?: string[]; types?: string[] }

export const SIDEBAR_ALIASES: Record<SidebarRole, Record<string, RouteAlias>> = {
  student: {
    "/student":               { prefixes: ["/student/dashboard", "/dashboard"], types: ["announcement", "general", "info", "daily_content", "daily_ai_reminder", "admin_announcement", "level_assigned"] },
    "/student/quran":         { prefixes: ["/student/quran"] },
    "/student/adhkaar":       { prefixes: ["/student/adhkaar"] },
    "/student/courses":       { prefixes: ["/student/learning-hub", "/student/assignments", "/student/subjects", "/student/course"], types: ["assignment", "assignment_due", "course", "enrolled"] },
    "/student/timetable":     { prefixes: ["/student/schedule"], types: ["class_reminder", "timetable"] },
    "/student/live-now":      { prefixes: ["/student/live-classes", "/student/live", "/live-quiz"], types: ["class_live_now", "class_ring", "live_quiz"] },
    "/student/revision":      { prefixes: ["/student/revision"], types: ["revision_assigned"] },
    "/student/hifdh-program": { prefixes: ["/student/hifdh"], types: ["hifdh_reminder", "hifdh_review"] },
    "/student/musabaqah":     { prefixes: ["/musabaqah", "/student/musabaqah"], types: ["musabaqah_session_set", "joined_competition", "musabaqah"] },
    "/student/exams":         { prefixes: ["/student/results", "/exams"], types: ["exam", "exam_assigned", "result", "result_released", "oral_slot_booked", "oral_exam"] },
    "/student/exams/register":{ prefixes: ["/student/exams/register"] },
    "/student/transcripts":   { prefixes: ["/student/transcripts", "/student/report-card"], types: ["transcript"] },
    "/student/majlis":        { prefixes: ["/student/majlis", "/majlis"], types: ["majlis", "majlis_message"] },
    "/student/support":       { prefixes: ["/student/support"], types: ["support_ticket", "support_reply", "support"] },
    "/student/profile":       { prefixes: ["/student/profile", "/student/settings"], types: ["profile"] },
    "/student/app":           { prefixes: ["/student/app"], types: ["app_update"] },
    "/student/enrollment-payment": { prefixes: ["/student/enrollment-payment", "/student/payment"], types: ["payment", "payment_reminder", "payment_due", "subscription"] },
  },
  admin: {
    "/admin":                 { prefixes: ["/admin/dashboard"], types: ["announcement", "general", "info"] },
    "/admin/students":        { prefixes: ["/admin/student", "/admin/attendance"], types: ["registration", "signup", "new_registration", "new_student"] },
    "/admin/level-assignment":{ types: ["level_request", "level_assignment"] },
    "/admin/live-classes":    { prefixes: ["/admin/live"], types: ["class_join", "class_live_now", "class_reminder"] },
    "/admin/recordings":      { types: ["recording_ready"] },
    "/admin/exams":           { types: ["exam", "exam_assigned"] },
    "/admin/oral-exams":      { types: ["oral_slot_booked", "oral_exam"] },
    "/admin/grading":         { prefixes: ["/admin/grading"], types: ["essay_submitted", "submission", "result"] },
    "/admin/recitation-review":{ prefixes: ["/admin/recitation", "/admin/tasjeel"], types: ["recitation", "recitation_mistake", "recitation_submitted"] },
    "/admin/hifdh-program":   { prefixes: ["/admin/hifdh"], types: ["hifdh_reminder", "hifdh_review"] },
    "/admin/payments":        { prefixes: ["/admin/payment"], types: ["payment", "payment_received", "subscription"] },
    "/admin/notifications":   { types: ["admin_announcement"] },
    "/admin/support-tickets": { prefixes: ["/admin/support"], types: ["support_ticket", "support"] },
    "/admin/majlis-moderation":{ prefixes: ["/admin/majlis"], types: ["majlis_report"] },
    "/admin/musabaqah":       { prefixes: ["/admin/musabaqah"], types: ["musabaqah"] },
    "/admin/app-releases":    { types: ["app_update"] },
  },
  teacher: {
    "/teacher":               { prefixes: ["/teacher/dashboard"], types: ["announcement", "general", "info", "admin_announcement", "daily_ai_reminder"] },
    "/teacher/classes":       { prefixes: ["/teacher/live-classes", "/teacher/live"], types: ["class_join", "class_live_now", "class_reminder", "class_ring"] },
    "/teacher/timetable":     { types: ["timetable"] },
    "/teacher/subjects":      { prefixes: ["/teacher/subject"] },
    "/teacher/students":      { prefixes: ["/teacher/student", "/teacher/private"], types: ["new_student"] },
    "/teacher/attendance":    { types: ["attendance"] },
    "/teacher/announcements": { types: ["teacher_announcement"] },
    "/teacher/exams":         { prefixes: ["/teacher/oral-exams"], types: ["exam", "exam_assigned", "oral_slot_booked", "oral_exam"] },
    "/teacher/grading":       { types: ["essay_submitted", "submission"] },
    "/teacher/results":       { types: ["result", "result_released"] },
    "/teacher/hifdh":         { prefixes: ["/teacher/hifdh-program", "/teacher/recitation"], types: ["hifdh_reminder", "hifdh_review", "recitation_submitted"] },
    "/teacher/majlis":        { types: ["majlis", "majlis_message"] },
    "/teacher/support":       { prefixes: ["/teacher/support"], types: ["support_ticket", "support_reply", "support"] },
    "/teacher/app":           { prefixes: ["/teacher/app"], types: ["app_update"] },
  },
};

const ROOTS = new Set(["/student", "/admin", "/teacher"]);
const pathOf = (l: any) => String(l || "").split(/[?#]/)[0];
const under = (p: string, x: string) => p === x || p.startsWith(x + "/");

/** Every prefix that any sidebar entry of this role claims (own route + aliases; roots only by exact/alias). */
function claimedPrefixes(role: SidebarRole, routes: string[]): string[] {
  const out: string[] = [];
  const table = SIDEBAR_ALIASES[role];
  const all = new Set([...routes, ...Object.keys(table)]);
  all.forEach(r => {
    if (!ROOTS.has(r)) out.push(r);
    (table[r]?.prefixes ?? []).forEach(x => out.push(x));
  });
  return out;
}

/**
 * Does notification `n` belong to sidebar entry `route`?
 * `routes` = every `to` in the current sidebar (needed so the type fallback only kicks in when the
 * link doesn't already land on some other sidebar entry).
 */
export function notifBelongsToRoute(
  n: { type?: string | null; link?: string | null },
  route: string,
  role: SidebarRole,
  routes: string[],
): boolean {
  const al = SIDEBAR_ALIASES[role]?.[route];
  const p = pathOf(n.link);
  const isRoot = ROOTS.has(route);
  const prefixes = isRoot ? (al?.prefixes ?? []) : [route, ...(al?.prefixes ?? [])];

  if (p) {
    if (isRoot && p === route) return true;
    if (prefixes.some(x => under(p, x))) return true;
    // link goes to a page that is not a sidebar entry → fall back to the notification type
    const lands = claimedPrefixes(role, routes).some(x => under(p, x)) || (ROOTS.has(p));
    if (lands) return false;
  }
  return !!(n.type && al?.types?.includes(n.type));
}
