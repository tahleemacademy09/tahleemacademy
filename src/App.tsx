/* ═══════════════════════════════════════════════════════════════════════════════
   App.tsx — Tahleem Academy
   Routing configuration with lazy-loaded pages
═══════════════════════════════════════════════════════════════════════════════*/
import { lazy, Suspense, useEffect } from "react";
import { lazyRoute, preloadGroups } from "@/lib/routePreload";
import { useAuth } from "@/contexts/AuthContext";
import Maintenance from "@/pages/Maintenance";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import WithSignOut from "@/components/layout/WithSignOut";
import DashboardLayout from "@/components/layout/DashboardLayout";
import TeacherLayout from "@/components/layout/TeacherLayout";
import PublicLayout from "@/components/layout/PublicLayout";
import NotFound from "@/pages/NotFound";
import IdleWarningModal from "@/components/IdleWarningModal";
import UpdateAvailableBanner from "@/components/UpdateAvailableBanner";
import AppUpdateBanner from "@/components/AppUpdateBanner";
import ForceUpdateGate from "@/components/ForceUpdateGate";
import OtaUpdateBanner from "@/components/OtaUpdateBanner";
import ErrorBoundary from "@/components/ErrorBoundary";
import DiagnosticsPanel from "@/components/dev/DiagnosticsPanel";
import TasjeelGuard from "@/components/TasjeelGuard";
import { LiveClassProvider } from "@/contexts/LiveClassContext";
import RecordingPlayerProvider from "@/contexts/RecordingPlayerContext";
const GlobalClassroomOverlay = lazy(() => import("./components/classroom/GlobalClassroomOverlay"));
import AppNotifications from "@/components/AppNotifications";
import ClassRingListener from "@/components/ClassRingListener";
import { useAppStateRestore } from "@/hooks/useAppStateRestore";
import { usePageViewTracking } from "@/hooks/usePageViewTracking";
import { setNavigateRef } from "@/lib/nativeApp";

// ── Public pages ───────────────────────────────────────────────────────────
const Index                = lazy(() => import("./pages/Index"));
const Login                = lazy(() => import("./pages/Login"));
const AdminLogin           = lazy(() => import("./pages/AdminLogin"));
const Register             = lazy(() => import("./pages/Register"));
const RegisterContinue     = lazy(() => import("./pages/RegisterContinue"));
const RegistrationComplete = lazy(() => import("./pages/RegistrationComplete"));
const ResetPassword        = lazy(() => import("./pages/ResetPassword"));
const ForceChangePassword  = lazy(() => import("./pages/ForceChangePassword"));
const About                = lazy(() => import("./pages/About"));
const Courses              = lazy(() => import("./pages/Courses"));
const Contact              = lazy(() => import("./pages/Contact"));
const RecordingsPage       = lazy(() => import("./pages/RecordingsPage"));
const LiveQuiz             = lazy(() => import("./pages/LiveQuiz"));
const Pricing              = lazy(() => import("./pages/Pricing"));
const GuestClassroom       = lazy(() => import("./pages/public/GuestClassroom"));
const JoinClass            = lazy(() => import("./pages/public/JoinClass"));
const LiveClasses          = lazy(() => import("./pages/public/LiveClasses"));

// ── Student pages ──────────────────────────────────────────────────────────
const StudentDashboard    = lazyRoute("student", () => import("./pages/student/StudentDashboard"));
const StudentDashboardV2  = lazyRoute("student", () => import("./pages/student/StudentDashboardV2"));
const StudentExams        = lazyRoute("student", () => import("./pages/student/StudentExams"));
const StudentOralExams    = lazyRoute("student", () => import("./pages/student/StudentOralExams"));
const ExamRegistration    = lazyRoute("student", () => import("./pages/student/ExamRegistration"));
const SubjectRegistration = lazyRoute("student", () => import("./pages/student/SubjectRegistration"));
const ExamTaking          = lazyRoute("student", () => import("./pages/student/ExamTaking"));
const ProfileSettings     = lazyRoute("student", () => import("./pages/student/ProfileSettings"));
const StudentApp          = lazyRoute("student", () => import("./pages/student/StudentApp"));
const ExamResults         = lazyRoute("student", () => import("./pages/student/ExamResults"));
const PreExamVerification = lazyRoute("student", () => import("./pages/student/PreExamVerification"));
const ReportCard          = lazyRoute("student", () => import("./pages/student/ReportCard"));
const Majlis              = lazyRoute("student", () => import("./pages/student/Majlis"));
const RecitationTest      = lazyRoute("student", () => import("./pages/student/RecitationTest"));
const LearningHub         = lazyRoute("student", () => import("./pages/student/LearningHub"));
const CourseView          = lazyRoute("student", () => import("./pages/student/CourseView"));
const SubjectView         = lazyRoute("student", () => import("./pages/student/SubjectView"));
const Onboarding          = lazyRoute("student", () => import("./pages/student/Onboarding"));
const EntranceExamTaking  = lazyRoute("student", () => import("./pages/student/EntranceExamTaking"));
const EntranceExamResume  = lazyRoute("student", () => import("./pages/student/EntranceExamResume"));
const EntranceResults     = lazyRoute("student", () => import("./pages/student/EntranceResults"));
const RevisionHub         = lazyRoute("student", () => import("./pages/student/RevisionHub"));
const QuranPage               = lazyRoute("student", () => import("./pages/student/QuranPage"));
const HifdhPage              = lazyRoute("student", () => import("./pages/student/HifdhPage"));
const HifdhProgramHome        = lazyRoute("student", () => import("./pages/student/HifdhProgramHome"));
const HifdhDailyRevisionPage = lazyRoute("student", () => import("./pages/student/HifdhDailyRevisionPage"));
const RevisionRoom           = lazyRoute("student", () => import("./pages/student/RevisionRoom"));
const RecordingPlayer     = lazyRoute("student", () => import("./pages/student/RecordingPlayer"));
const EnrollmentPayment   = lazyRoute("student", () => import("./pages/student/EnrollmentPayment"));
const TasjeelAwaitingLevel = lazyRoute("student", () => import("./pages/student/TasjeelAwaitingLevel"));
const RecitationSession    = lazyRoute("student", () => import("./pages/student/RecitationSession"));
const StudentTimetable     = lazyRoute("student", () => import("./pages/student/StudentTimetable"));
const LiveNow              = lazyRoute("student", () => import("./pages/student/LiveNow"));
const StudentAssignments   = lazyRoute("student", () => import("./pages/student/StudentAssignments"));
const ProgressHub          = lazyRoute("student", () => import("./pages/student/ProgressHub"));
const StudentSupport       = lazyRoute("student", () => import("./pages/student/StudentSupport"));
const AdhkaarPage          = lazyRoute("student", () => import("./pages/student/AdhkaarPage"));

// ── Musabaqah ──────────────────────────────────────────────────────────────
// Hub:  inside DashboardLayout → shows Quiz vs Recitation choice cards
// Page: standalone full-screen route → the actual Qur'an recitation competition
const MusabaqahHub   = lazyRoute("student", () => import("./pages/student/MusabaqahHub"));
const RamadanPrograms = lazy(() => import("./pages/RamadanPrograms"));
const MustabaqahPage = lazyRoute("student", () => import("./pages/student/MustabaqahPage"));
const GeneralMusabaqahAdmin       = lazyRoute("admin", () => import("./pages/admin/GeneralMusabaqahAdmin"));
const GeneralMusabaqahEventDetail = lazyRoute("admin", () => import("./pages/admin/GeneralMusabaqahEventDetail"));
const GeneralMusabaqahRegister    = lazyRoute("student", () => import("./pages/student/GeneralMusabaqahRegister"));
const GeneralMusabaqahWaitingRoom = lazyRoute("student", () => import("./pages/student/GeneralMusabaqahWaitingRoom"));
const GeneralMusabaqahResult      = lazyRoute("student", () => import("./pages/student/GeneralMusabaqahResult"));
const GeneralMusabaqahEventLeaderboard = lazyRoute("student", () => import("./pages/student/GeneralMusabaqahEventLeaderboard"));
const MusabaqahOverallLeaderboard      = lazyRoute("student", () => import("./pages/student/MusabaqahOverallLeaderboard"));
const GeneralMusabaqahExamRoom    = lazy(() => import("./pages/GeneralMusabaqahExamRoom"));

// ── Admin pages ────────────────────────────────────────────────────────────
const AdminDashboard        = lazyRoute("admin", () => import("./pages/admin/AdminDashboard"));
const SubjectManagement     = lazyRoute("admin", () => import("./pages/admin/SubjectManagement"));
const CourseManagement      = lazyRoute("admin", () => import("./pages/admin/CourseManagement"));
const SyllabusManager       = lazyRoute("admin", () => import("./pages/admin/SyllabusManager"));
const TimetableManagement   = lazyRoute("admin", () => import("./pages/admin/TimetableManagement"));
const ExamTimetableManagement = lazyRoute("admin", () => import("./pages/admin/ExamTimetableManagement"));
const ExamManager           = lazyRoute("admin", () => import("./pages/admin/ExamManager"));
const ExamLiveMonitor       = lazyRoute("admin", () => import("./pages/admin/ExamLiveMonitor"));
const ExamEditor            = lazyRoute("admin", () => import("./pages/admin/ExamEditor"));
const GradingPage           = lazyRoute("admin", () => import("./pages/admin/GradingPage"));
const QuestionBank          = lazyRoute("admin", () => import("./pages/admin/QuestionBank"));
const ProctoringDashboard   = lazyRoute("admin", () => import("./pages/admin/ProctoringDashboard"));
const EntranceExamAdmin     = lazyRoute("admin", () => import("./pages/admin/EntranceExamAdmin"));
const ViewAsStudent         = lazyRoute("admin", () => import("./pages/admin/ViewAsStudent"));
const RecordingManagement   = lazyRoute("admin", () => import("./pages/admin/RecordingManagement"));
const LiveClassManagement   = lazyRoute("admin", () => import("./pages/admin/LiveClassManagement"));
const MajlisModeration      = lazyRoute("admin", () => import("./pages/admin/MajlisModeration"));const NotificationManagement = lazyRoute("admin", () => import("./pages/admin/NotificationManagement"));
const SupportTickets        = lazyRoute("admin", () => import("./pages/admin/SupportTickets"));
const PaymentManagement     = lazyRoute("admin", () => import("./pages/admin/PaymentManagement"));
const TeacherPayments       = lazyRoute("admin", () => import("./pages/admin/TeacherPayments"));
const AcademicCalendar      = lazyRoute("admin", () => import("./pages/admin/AcademicCalendar"));
const PaymentSettings       = lazyRoute("admin", () => import("./pages/admin/PaymentSettings.tsx"));
const PublicClassManagement = lazyRoute("admin", () => import("./pages/admin/PublicClassManagement"));
const HifdhAdminReview      = lazyRoute("admin", () => import("./pages/admin/HifdhAdminReview"));
const HifdhRevisionTracker  = lazyRoute("admin", () => import("./pages/admin/HifdhRevisionTracker"));
const HifdhProgramAdmin      = lazyRoute("admin", () => import("./pages/admin/HifdhProgramAdmin"));
const HifdhHub               = lazyRoute("admin", () => import("./pages/admin/HifdhHub"));
const QuranRecitationAdmin  = lazyRoute("admin", () => import("./pages/admin/QuranRecitationAdmin"));
const LetterAudioRecorder   = lazyRoute("admin", () => import("./pages/admin/LetterAudioRecorder"));
const AdminRecitationSession = lazyRoute("admin", () => import("./pages/admin/RecitationSession"));
const LevelSubjectMapping   = lazyRoute("admin", () => import("./pages/admin/LevelSubjectMapping"));
const LevelManagement       = lazyRoute("admin", () => import("./pages/admin/LevelManagement"));
// Merged hub pages — group several of the above into one tabbed page so
// related admin functions are accessed together instead of being split
// across separate settings screens. The individual routes below still
// exist and render these hubs (with the matching tab pre-selected) so no
// existing links break.
const RegistrationHub       = lazyRoute("admin", () => import("./pages/admin/RegistrationHub"));
const StudentsHub           = lazyRoute("admin", () => import("./pages/admin/StudentsHub"));
const AdminSettings         = lazyRoute("admin", () => import("./pages/admin/AdminSettings"));
const AppReleases           = lazyRoute("admin", () => import("./pages/admin/AppReleases"));
const SiteAnalytics         = lazyRoute("admin", () => import("./pages/admin/SiteAnalytics"));

// ── Auth callback ──────────────────────────────────────────────────────────
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
// ── Teacher pages ──────────────────────────────────────────────────────────
const TeacherDashboard       = lazyRoute("teacher", () => import("./pages/teacher/TeacherDashboard"));
const TeacherStudentsHub     = lazyRoute("teacher", () => import("./pages/teacher/TeacherStudentsHub"));
const TeacherTeachingHub     = lazyRoute("teacher", () => import("./pages/teacher/TeacherTeachingHub"));
const TeacherAssessmentsHub  = lazyRoute("teacher", () => import("./pages/teacher/TeacherAssessmentsHub"));
const TeacherStudents        = lazyRoute("teacher", () => import("./pages/teacher/TeacherStudents"));
const TeacherPrivateStudents = lazyRoute("teacher", () => import("./pages/teacher/TeacherPrivateStudents"));
const TeacherSubjects        = lazyRoute("teacher", () => import("./pages/teacher/TeacherSubjects"));
const TeacherClasses         = lazyRoute("teacher", () => import("./pages/teacher/TeacherClasses"));
const TeacherAnnouncements   = lazyRoute("teacher", () => import("./pages/teacher/TeacherAnnouncements"));
const TeacherAttendance      = lazyRoute("teacher", () => import("./pages/teacher/TeacherAttendance"));
const TeacherExamsPage       = lazyRoute("teacher", () => import("./pages/teacher/TeacherExamsPage"));
const TeacherOralExams       = lazyRoute("teacher", () => import("./pages/teacher/TeacherOralExams"));
const TeacherResults         = lazyRoute("teacher", () => import("./pages/teacher/TeacherResults"));
const TeacherSettings        = lazyRoute("teacher", () => import("./pages/teacher/TeacherSettings"));
const TeacherRecordings      = lazyRoute("teacher", () => import("./pages/teacher/TeacherRecordings"));
const TeacherRecitation      = lazyRoute("teacher", () => import("./pages/teacher/TeacherRecitation"));
const TeacherTranscript      = lazyRoute("teacher", () => import("./pages/teacher/TeacherTranscript"));
const TeacherPrivateSessions = lazyRoute("teacher", () => import("./pages/teacher/TeacherPrivateSessions"));
const TeacherGrading         = lazyRoute("teacher", () => import("./pages/teacher/TeacherGrading"));
const TeacherTimetable       = lazyRoute("teacher", () => import("./pages/teacher/TeacherTimetable"));
const TeacherPublicClasses   = lazyRoute("teacher", () => import("./pages/teacher/TeacherPublicClasses"));
const TeacherHifdhReview     = lazyRoute("teacher", () => import("./pages/teacher/TeacherHifdhReview"));
const TeacherHifdhProgram    = lazyRoute("teacher", () => import("./pages/teacher/TeacherHifdhProgram"));
const TeacherHifdhLive       = lazyRoute("teacher", () => import("./pages/teacher/TeacherHifdhLive"));
const TeacherHifdhPlanBuilder = lazyRoute("teacher", () => import("./pages/teacher/TeacherHifdhPlanBuilder"));
const TeacherMajlis          = lazyRoute("teacher", () => import("./pages/teacher/TeacherMajlis"));
const TeacherSupport         = lazyRoute("teacher", () => import("./pages/teacher/TeacherSupport"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,          // 60s before background refetch
      gcTime: 10 * 60_000,        // keep visited pages' data 10 min so going back is instant
      retry: 1,                   // only 1 retry on network error
      refetchOnWindowFocus: false, // avoid re-fetching on every tab focus
    },
  },
});

// Set VITE_MAINTENANCE=true in Vercel env to show the maintenance screen to everyone.
// Developer bypass: open the site once with ?bypass=1 (remembered in this browser).
const MAINTENANCE = import.meta.env.VITE_MAINTENANCE === "true";
if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("bypass") === "1") {
  try { localStorage.setItem("tahleem-maint-bypass", "1"); } catch {}
}
const maintenanceBypassed = () => {
  try { return localStorage.getItem("tahleem-maint-bypass") === "1"; } catch { return false; }
};

const AppMain = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <ForceUpdateGate>
          <BrowserRouter>
      <AppStateRestorer />
      <PageViewTracker />
      <RoutePreloader />
            <RecordingPlayerProvider>
            <LiveClassProvider>
            <ErrorBoundary>
              <AppNotifications />
              <ClassRingListener />
              <IdleWarningModal />
              <UpdateAvailableBanner />
              <AppUpdateBanner />
              <OtaUpdateBanner />
              <DiagnosticsPanel />
              <Suspense fallback={
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #064E3B", borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              }>
                <Routes>
                  {/* Public layout */}
                  <Route element={<PublicLayout />}>
                    <Route path="/"               element={<Index />} />
                    <Route path="/courses"        element={<Courses />} />
                    <Route path="/about"          element={<About />} />
                    <Route path="/contact"        element={<Contact />} />
                    <Route path="/pricing"        element={<Pricing />} />
                    <Route path="/login"          element={<Login />} />
                    <Route path="/register"       element={<Register />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/change-password" element={<ForceChangePassword />} />
                  </Route>

                  <Route path="/admin-secure" element={<AdminLogin />} />

                  <Route path="/auth/register-continue" element={<WithSignOut><RegisterContinue /></WithSignOut>} />
                  <Route path="/auth/callback"          element={<AuthCallback />} />
                  <Route path="/registration-complete"  element={<RegistrationComplete />} />

                  {/* ── Standalone full-screen routes (no sidebar) ──────── */}
                  {/* Keep existing quiz unchanged */}
                  <Route path="/live-quiz" element={<ProtectedRoute><LiveQuiz /></ProtectedRoute>} />
                  {/* New: Qur'an recitation competition — full-screen like /live-quiz */}
                  <Route path="/musabaqah/recitation" element={<ProtectedRoute><MustabaqahPage /></ProtectedRoute>} />
                  <Route path="/musabaqah/general"     element={<ProtectedRoute><GeneralMusabaqahAdmin /></ProtectedRoute>} />
                  <Route path="/musabaqah/general/:id" element={<ProtectedRoute><GeneralMusabaqahEventDetail /></ProtectedRoute>} />
                  <Route path="/student/musabaqah/general/:id/waiting" element={<ProtectedRoute><GeneralMusabaqahWaitingRoom /></ProtectedRoute>} />
                  <Route path="/student/musabaqah/general/:id/result"  element={<ProtectedRoute><GeneralMusabaqahResult /></ProtectedRoute>} />
                  <Route path="/student/musabaqah/general/:id/leaderboard" element={<ProtectedRoute><GeneralMusabaqahEventLeaderboard /></ProtectedRoute>} />
                  <Route path="/musabaqah/general/leaderboard"         element={<ProtectedRoute><MusabaqahOverallLeaderboard /></ProtectedRoute>} />
                  <Route path="/musabaqah/general/:id/exam"           element={<ProtectedRoute><GeneralMusabaqahExamRoom /></ProtectedRoute>} />

                  {/* Public quiz — no login needed; guests join a room with a code */}
                  <Route path="/quiz" element={<LiveQuiz />} />

                  {/* Public Live Classes */}
                  <Route path="/live"                       element={<LiveClasses />} />
                  <Route path="/public/classes"             element={<LiveClasses />} />
                  <Route path="/live/:roomCode"             element={<JoinClass />} />
                  <Route path="/public/join/:roomCode"      element={<JoinClass />} />
                  <Route path="/live/:roomCode/classroom"   element={<GuestClassroom />} />
                  <Route path="/public/classroom/:roomCode" element={<GuestClassroom />} />

                  <Route path="/recordings/:recordingId" element={<ProtectedRoute><RecordingPlayer /></ProtectedRoute>} />

                  {/* TEST ROUTE — fully standalone, deliberately disconnected from
                      ProtectedRoute / TasjeelGuard / DashboardLayout so it cannot be
                      affected by any of their spinners, remounts, or resume logic.
                      It does its own minimal auth check internally. Not linked in
                      navigation; visit directly. Safe to remove — touches nothing
                      else in the app. */}
                  <Route path="/student/dashboard-v2" element={<StudentDashboardV2 />} />

                  {/* ── Student routes (inside DashboardLayout) ─────────── */}
                  {/* TasjeelGuard blocks dashboard access for mid-registration students */}
                  <Route element={<ProtectedRoute><TasjeelGuard><DashboardLayout role="student" /></TasjeelGuard></ProtectedRoute>}>
                    <Route path="/student"                     element={<StudentDashboard />} />
                    <Route path="/student/quran"                element={<QuranPage />} />
                    <Route path="/student/adhkaar"              element={<AdhkaarPage />} />
                    <Route path="/student/courses"             element={<LearningHub />} />
                    <Route path="/student/courses/:courseId"   element={<LearningHub />} />
                    <Route path="/student/subjects/:subjectId" element={<SubjectView />} />
                    <Route path="/student/exams"               element={<StudentExams />} />
                    <Route path="/student/oral-exams"          element={<StudentOralExams />} />
                    <Route path="/student/exams/register"      element={<ExamRegistration />} />
                    <Route path="/student/register-subjects"   element={<SubjectRegistration />} />
                    <Route path="/student/transcripts"         element={<ProgressHub />} />
                    <Route path="/student/report-card"         element={<ProgressHub />} />
                    <Route path="/student/report-card/:userId" element={<ReportCard />} />
                    <Route path="/student/majlis"              element={<Majlis />} />
                    <Route path="/student/live-classes"        element={<LearningHub defaultTab="live" />} />
                    <Route path="/student/revision"            element={<RevisionHub />} />
                    <Route path="/student/hifdh"               element={<HifdhDailyRevisionPage />} />
                    <Route path="/student/hifdh-daily"         element={<HifdhDailyRevisionPage />} />
                    <Route path="/student/hifdh-program"       element={<HifdhProgramHome />} />
                    <Route path="/student/revision/:subjectId" element={<RevisionRoom />} />
                    <Route path="/student/timetable"           element={<StudentTimetable />} />
                    <Route path="/student/live-now"            element={<LiveNow />} />
                    <Route path="/student/assignments"         element={<StudentAssignments />} />
                    <Route path="/student/attendance"          element={<ProgressHub />} />
                    <Route path="/student/support"             element={<StudentSupport />} />
                    <Route path="/student/profile"             element={<ProfileSettings />} />
                    <Route path="/student/app"                 element={<StudentApp />} />
                    <Route path="/student/enrollment-payment"  element={<EnrollmentPayment />} />
                    {/* Hub: choose between Quiz Arena or Recitation Competition */}
                    <Route path="/student/musabaqah"           element={<MusabaqahHub />} />
                    <Route path="/student/ramadan"             element={<RamadanPrograms />} />
                    <Route path="/student/musabaqah/general"   element={<GeneralMusabaqahRegister />} />
                  </Route>

                  {/* Student standalone */}
                  <Route path="/student/exam-verify/:examId"         element={<ProtectedRoute><PreExamVerification /></ProtectedRoute>} />
                  <Route path="/student/exam/:attemptId"             element={<ProtectedRoute><ExamTaking /></ProtectedRoute>} />
                  <Route path="/student/results/:attemptId"          element={<ProtectedRoute><ExamResults /></ProtectedRoute>} />
                  <Route path="/onboarding"                          element={<ProtectedRoute><WithSignOut><Onboarding /></WithSignOut></ProtectedRoute>} />
                  <Route path="/student/recitation-test"             element={<ProtectedRoute><WithSignOut><RecitationTest /></WithSignOut></ProtectedRoute>} />
                  <Route path="/student/entrance-exam/:attemptId"    element={<ProtectedRoute><EntranceExamTaking /></ProtectedRoute>} />
                  <Route path="/student/entrance-exam"              element={<ProtectedRoute><WithSignOut><EntranceExamResume /></WithSignOut></ProtectedRoute>} />
                  <Route path="/student/entrance-results/:attemptId" element={<ProtectedRoute><WithSignOut><EntranceResults /></WithSignOut></ProtectedRoute>} />
                  <Route path="/student/awaiting-level"              element={<ProtectedRoute><WithSignOut><TasjeelAwaitingLevel /></WithSignOut></ProtectedRoute>} />
                  <Route path="/student/recitation-session"          element={<ProtectedRoute><RecitationSession /></ProtectedRoute>} />

                  {/* ── Teacher routes ── */}
                  <Route element={<ProtectedRoute requiredRole="teacher"><TeacherLayout /></ProtectedRoute>}>
                    <Route path="/teacher"                  element={<TeacherDashboard />} />
                    <Route path="/teacher/app"            element={<StudentApp />} />
                    <Route path="/teacher/teaching-hub"    element={<TeacherTeachingHub />} />
                    <Route path="/teacher/students-hub"    element={<TeacherStudentsHub />} />
                    <Route path="/teacher/assessments-hub" element={<TeacherAssessmentsHub />} />
                    <Route path="/teacher/classes"          element={<TeacherClasses />} />
                    <Route path="/teacher/timetable"        element={<TeacherTimetable />} />
                    <Route path="/teacher/subjects"         element={<TeacherSubjects />} />
                    <Route path="/teacher/recordings"       element={<TeacherRecordings />} />
                    <Route path="/teacher/public-classes"   element={<TeacherPublicClasses />} />
                    <Route path="/teacher/students"         element={<TeacherStudents />} />
                    <Route path="/teacher/private-students" element={<TeacherPrivateStudents />} />
                    <Route path="/teacher/private-sessions" element={<TeacherPrivateSessions />} />
                    <Route path="/teacher/attendance"       element={<TeacherAttendance />} />
                    <Route path="/teacher/announcements"    element={<TeacherAnnouncements />} />
                    <Route path="/teacher/exams"            element={<TeacherExamsPage />} />
                    {/* Live monitor is admin-only now — teachers no longer get the button or the route. */}
                    <Route path="/teacher/oral-exams"       element={<TeacherOralExams />} />
                    <Route path="/teacher/exams/create"     element={<ExamEditor />} />
                    <Route path="/teacher/exams/:examId/edit" element={<ExamEditor />} />
                    <Route path="/teacher/grading"          element={<TeacherGrading />} />
                    <Route path="/teacher/results"          element={<TeacherResults />} />
                    <Route path="/teacher/transcripts"      element={<TeacherTranscript />} />
                    <Route path="/teacher/recitation"       element={<TeacherRecitation />} />
                    <Route path="/teacher/hifdh"            element={<TeacherHifdhReview />} />
                    <Route path="/teacher/hifdh-program"    element={<TeacherHifdhProgram />} />
                    <Route path="/teacher/hifdh-live"       element={<TeacherHifdhLive />} />
                    <Route path="/teacher/hifdh-plan"       element={<TeacherHifdhPlanBuilder />} />
                    <Route path="/teacher/hifdh-tracker"    element={<HifdhRevisionTracker />} />
                    <Route path="/teacher/majlis"           element={<TeacherMajlis />} />
                    <Route path="/teacher/support"          element={<TeacherSupport />} />
                    <Route path="/teacher/musabaqah"        element={<MusabaqahHub />} />
                    <Route path="/teacher/ramadan"          element={<RamadanPrograms />} />
                    <Route path="/teacher/settings"         element={<TeacherSettings />} />
                  </Route>

                  {/* ── Admin routes (inside DashboardLayout) ───────────── */}
                  <Route element={<ProtectedRoute requiredRole="admin"><DashboardLayout role="admin" /></ProtectedRoute>}>
                    <Route path="/admin"                             element={<AdminDashboard />} />
                    <Route path="/admin/subjects"                    element={<CourseManagement />} />
                    <Route path="/admin/subjects/:subjectId"         element={<CourseManagement />} />
                    <Route path="/admin/courses"                     element={<CourseManagement />} />
                    <Route path="/admin/learning"                    element={<Navigate to="/admin/courses" replace />} />
                    <Route path="/admin/syllabus"                    element={<SyllabusManager />} />
                    <Route path="/admin/level-subject-mapping"       element={<LevelSubjectMapping />} />
                    <Route path="/admin/timetable"                   element={<TimetableManagement />} />
                    <Route path="/admin/exam-timetable"              element={<ExamTimetableManagement />} />
                    <Route path="/admin/live-classes"                element={<LiveClassManagement />} />
                    <Route path="/admin/exams"                       element={<ExamManager />} />
                    <Route path="/admin/exams/:examId/live"          element={<ExamLiveMonitor />} />
                    <Route path="/admin/exams/create"                element={<ExamEditor />} />
                    <Route path="/admin/exams/:examId/edit"          element={<ExamEditor />} />
                    {/* Same component as /teacher/oral-exams — admin sees and
                        controls every teacher's oral exams from here too. */}
                    <Route path="/admin/oral-exams"                  element={<TeacherOralExams />} />
                    <Route path="/admin/grading"                     element={<GradingPage />} />
                    <Route path="/admin/question-bank"               element={<QuestionBank />} />
                    <Route path="/admin/proctoring"                  element={<ProctoringDashboard />} />
                    {/* Students hub — All Students / Attendance / Transcripts / Private
                        Sessions merged into one tabbed page (see StudentsHub.tsx) */}
                    <Route path="/admin/private-sessions"            element={<StudentsHub />} />
                    <Route path="/admin/students"                    element={<StudentsHub />} />
                    <Route path="/admin/students/:userId/view"       element={<ViewAsStudent />} />
                    <Route path="/admin/students/:userId/report-card" element={<ReportCard />} />
                    <Route path="/admin/view-as-student/:userId"     element={<ViewAsStudent />} />
                    <Route path="/admin/recordings"                  element={<RecordingManagement />} />
                    <Route path="/admin/live-class-management"       element={<LiveClassManagement />} />
                    <Route path="/admin/majlis-moderation"           element={<MajlisModeration />} />
                    <Route path="/admin/notifications"               element={<NotificationManagement />} />
                    <Route path="/admin/entrance-exam"               element={<EntranceExamAdmin />} />
                    <Route path="/admin/recitation-review"           element={<HifdhHub />} />
                    <Route path="/admin/hifdh-model-test"              element={<HifdhHub />} />
                    <Route path="/admin/hifdh-tracker"               element={<HifdhHub />} />
                    <Route path="/admin/hifdh-program"               element={<HifdhHub />} />
                    <Route path="/admin/hifdh"                       element={<Navigate to="/admin/hifdh-program" replace />} />
                    <Route path="/admin/hifdh-sessions"              element={<HifdhHub />} />
                    <Route path="/admin/recitation-test-settings"    element={<RegistrationHub />} />
                    <Route path="/admin/quran-recitations"           element={<QuranRecitationAdmin />} />
                    <Route path="/admin/letter-audio"                element={<LetterAudioRecorder />} />
                    {/* Registration hub — New Registrations / Pipeline Tracker /
                        Student Registration / Registration Settings / Subject
                        Registration merged into one tabbed page (see RegistrationHub.tsx) */}
                    <Route path="/admin/level-assignment"            element={<RegistrationHub />} />
                    <Route path="/admin/recitation-session"          element={<AdminRecitationSession />} />
                    <Route path="/admin/levels"                      element={<LevelManagement />} />
                    <Route path="/admin/transcripts"                 element={<StudentsHub />} />
                    <Route path="/admin/attendance"                  element={<StudentsHub />} />
                    <Route path="/admin/support-tickets"             element={<SupportTickets />} />
                    <Route path="/admin/analytics"                   element={<SiteAnalytics />} />
                    <Route path="/admin/payments"                    element={<PaymentManagement />} />
                    <Route path="/admin/teacher-payments"            element={<TeacherPayments />} />
                    <Route path="/admin/calendar"                    element={<AcademicCalendar />} />
                    <Route path="/admin/payment-settings"            element={<PaymentSettings />} />
                    <Route path="/admin/public-classes"              element={<PublicClassManagement />} />
                    <Route path="/admin/registration-settings"       element={<RegistrationHub />} />
                    <Route path="/admin/subject-registration"        element={<RegistrationHub />} />
                    <Route path="/admin/registration-diagnostics"   element={<RegistrationHub />} />
                    <Route path="/admin/student-registration"        element={<RegistrationHub />} />
                    <Route path="/admin/settings"                    element={<AdminSettings />} />
                    <Route path="/admin/app-releases"                element={<AppReleases />} />
                    <Route path="/admin/tasjeel"                     element={<RegistrationHub />} />
                    {/* Hub: choose between Quiz Arena or Recitation Competition */}
                    <Route path="/admin/musabaqah"                   element={<MusabaqahHub />} />
                    <Route path="/admin/ramadan"                     element={<RamadanPrograms />} />
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
            <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <GlobalClassroomOverlay />
            </Suspense>
            </ErrorBoundary>
            </LiveClassProvider>
            </RecordingPlayerProvider>
          </BrowserRouter>
          </ForceUpdateGate>
        </TooltipProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

// Restores route + scroll after Android WebView kills the backgrounded tab
function RoutePreloader() {
  const { user, roles } = useAuth();
  useEffect(() => {
    if (!user || roles.length === 0) return;
    const g = roles.includes("admin") ? ["admin", "teacher"] : roles.includes("teacher") ? ["teacher"] : ["student"];
    preloadGroups(g);
  }, [user?.id, roles.join(",")]);
  return null;
}

function AppStateRestorer() {
  useAppStateRestore();

  // Give nativeApp.ts a way to navigate through the SPA router instead of
  // doing a hard window.location.assign() for deep links / notification taps.
  const navigate = useNavigate();
  useEffect(() => {
    setNavigateRef((path: string) => navigate(path));
    return () => setNavigateRef(null);
  }, [navigate]);

  return null;
}

// Logs a page_views row on every route change — public site + student +
// teacher + admin alike. See src/hooks/usePageViewTracking.ts.
function PageViewTracker() {
  usePageViewTracking();
  return null;
}

const App = () => (MAINTENANCE && !maintenanceBypassed() ? <Maintenance /> : <AppMain />);

export default App