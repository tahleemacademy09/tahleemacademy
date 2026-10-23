// src/pages/teacher/TeacherSupport.tsx — Tahleem Academy
// Teacher's inbox for messages sent directly to them by students. This is
// literally the admin SupportTickets.tsx component — RLS already scopes a
// teacher's SELECT to rows where support_tickets.teacher_id = auth.uid(),
// so re-rendering it here (instead of forking the code) means fixes only
// ever need to happen in one place.
import SupportTickets from "@/pages/admin/SupportTickets";

const TeacherSupport = () => <SupportTickets />;

export default TeacherSupport;
