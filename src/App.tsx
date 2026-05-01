/* ═══════════════════════════════════════════════════════════════════════════════
   App.tsx — Tahleem Academy
   Routing configuration with lazy-loaded pages
═══════════════════════════════════════════════════════════════════════════════*/
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import DashboardLayout from "@/components/layout/DashboardLayout";
import TeacherLayout from "@/components/layout/TeacherLayout";
import PublicLayout from "@/components/layout/PublicLayout";
import NotFound from "@/pages/NotFound";
import IdleWarningModal from "@/components/IdleWarningModal";
import ErrorBoundary from "@/components/ErrorBoundary";
import { LiveClassProvider } from "@/contexts/LiveClassContext";
import RecordingPlayerProvider from "@/contexts/RecordingPlayerContext";
const GlobalClassroomOverlay = lazy(() => import("./components/classroom/GlobalClassroomOverlay"));
import AppNotifications from "@/components/AppNotifications";

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
const StudentDashboard    = lazy(() => import("./pages/student/StudentDashboard"));
const StudentExams        = lazy(() => import("./pages/student/StudentExams"));
const ExamTaking          = lazy(() => import("./pages/student/ExamTaking"));
const ProfileSettings     = lazy(() => import("./pages/student/ProfileSettings"));
const ExamResults         = lazy(() => import("./pages/student/ExamResults"));
const PreExamVerification = lazy(() => import("./pages/student/PreExamVerification"));
const Transcripts         = lazy(() => import("./pages/student/Transcripts"));
const Majlis              = lazy(() => import("./pages/student/Majlis"));
const RecitationTest      = lazy(() => import("./pages/student/RecitationTest"));
const LearningHub         = lazy(() => import("./pages/student/LearningHub"));
const CourseView          = lazy(() => import("./pages/student/CourseView"));
const SubjectView         = lazy(() => import("./pages/student/SubjectView"));
const Onboarding          = lazy(() => import("./pages/student/Onboarding"));
const EntranceExamTaking  = lazy(() => import("./pages/student/EntranceExamTaking"));
const EntranceExamResume  = lazy(() => import("./pages/student/EntranceExamResume"));
const EntranceResults     = lazy(() => import("./pages/student/EntranceResults"));
const RevisionHub         = lazy(() => import("./pages/student/RevisionHub"));
const HifdhRevision       = lazy(() => import("./pages/student/HifdhRevision"));
const RevisionRoom        = lazy(() => import("./pages/student/RevisionRoom"));
const PaymentScreen       = lazy(() => import("./pages/student/PaymentScreen"));
const RecordingPlayer     = lazy(() => import("./pages/student/RecordingPlayer"));
const EnrollmentPayment   = lazy(() => import("./pages/student/EnrollmentPayment"));
const TasjeelAwaitingLevel = lazy(() => import("./pages/student/TasjeelAwaitingLevel"));
const StudentTimetable     = lazy(() => import("./pages/student/StudentTimetable"));
const TasjeelAdmin         = lazy(() => import("./pages/admin/TasjeelAdmin"));

// ── Musabaqah ──────────────────────────────────────────────────────────────
// Hub:  inside DashboardLayout → shows Quiz vs Recitation choice cards
// Page: standalone full-screen route → the actual Qur'an recitation competition
const MusabaqahHub   = lazy(() => import("./pages/student/MusabaqahHub"));
const MustabaqahPage = lazy(() => import("./pages/student/MustabaqahPage"));

// ── Admin pages ────────────────────────────────────────────────────────────
const AdminDashboard        = lazy(() => import("./pages/admin/AdminDashboard"));
const SubjectManagement     = lazy(() => import("./pages/admin/SubjectManagement"));
const CourseManagement      = lazy(() => import("./pages/admin/CourseManagement"));
const SyllabusManager       = lazy(() => import("./pages/admin/SyllabusManager"));
const TimetableManagement   = lazy(() => import("./pages/admin/TimetableManagement"));
const ExamManager           = lazy(() => import("./pages/admin/ExamManager"));
const ExamEditor            = lazy(() => import("./pages/admin/ExamEditor"));
const GradingPage           = lazy(() => import("./pages/admin/GradingPage"));
const QuestionBank          = lazy(() => import("./pages/admin/QuestionBank"));
const ProctoringDashboard   = lazy(() => import("./pages/admin/ProctoringDashboard"));
const StudentManagement     = lazy(() => import("./pages/admin/StudentManagement"));
const EntranceExamAdmin     = lazy(() => import("./pages/admin/EntranceExamAdmin"));
const ViewAsStudent         = lazy(() => import("./pages/admin/ViewAsStudent"));
const RecordingManagement   = lazy(() => import("./pages/admin/RecordingManagement"));
const LiveClassManagement   = lazy(() => import("./pages/admin/LiveClassManagement"));
const MajlisModeration      = lazy(() => import("./pages/admin/MajlisModeration"));const NotificationManagement = lazy(() => import("./pages/admin/NotificationManagement"));
const TranscriptManagement  = lazy(() => import("./pages/admin/TranscriptManagement"));
const AttendanceManagement  = lazy(() => import("./pages/admin/AttendanceManagement"));
const PaymentManagement     = lazy(() => import("./pages/admin/PaymentManagement"));
const AcademicCalendar      = lazy(() => import("./pages/admin/AcademicCalendar"));
const PaymentSettings       = lazy(() => import("./pages/admin/PaymentSettings"));
const PublicClassManagement = lazy(() => import("./pages/admin/PublicClassManagement"));
const HifdhAdminReview      = lazy(() => import("./pages/admin/HifdhAdminReview"));
const HifdhRevisionTracker  = lazy(() => import("./pages/admin/HifdhRevisionTracker"));
const RecitationTestAdmin   = lazy(() => import("./pages/admin/RecitationTestAdmin"));
const LevelAssignment       = lazy(() => import("./pages/admin/LevelAssignment"));
const LevelSubjectMapping   = lazy(() => import("./pages/admin/LevelSubjectMapping"));
const LevelManagement       = lazy(() => import("./pages/admin/LevelManagement"));
const PrivateSessions       = lazy(() => import("./pages/admin/PrivateSessions"));
const RegistrationSettings  = lazy(() => import("./pages/admin/RegistrationSettings"));

// ── Auth callback ──────────────────────────────────────────────────────────
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
// ── Teacher pages ──────────────────────────────────────────────────────────
const TeacherDashboard       = lazy(() => import("./pages/teacher/TeacherDashboard"));
const TeacherStudentsHub     = lazy(() => import("./pages/teacher/TeacherStudentsHub"));
const TeacherTeachingHub     = lazy(() => import("./pages/teacher/TeacherTeachingHub"));
const TeacherAssessmentsHub  = lazy(() => import("./pages/teacher/TeacherAssessmentsHub"));
const TeacherStudents        = lazy(() => import("./pages/teacher/TeacherStudents"));
const TeacherPrivateStudents = lazy(() => import("./pages/teacher/TeacherPrivateStudents"));
const TeacherSubjects        = lazy(() => import("./pages/teacher/TeacherSubjects"));
const TeacherClasses         = lazy(() => import("./pages/teacher/TeacherClasses"));
const TeacherAnnouncements   = lazy(() => import("./pages/teacher/TeacherAnnouncements"));
const TeacherAttendance      = lazy(() => import("./pages/teacher/TeacherAttendance"));
const TeacherExamsPage       = lazy(() => import("./pages/teacher/TeacherExamsPage"));
const TeacherResults         = lazy(() => import("./pages/teacher/TeacherResults"));
const TeacherSettings        = lazy(() => import("./pages/teacher/TeacherSettings"));
const TeacherRecordings      = lazy(() => import("./pages/teacher/TeacherRecordings"));
const TeacherRecitation      = lazy(() => import("./pages/teacher/TeacherRecitation"));
const TeacherTranscript      = lazy(() => import("./pages/teacher/TeacherTranscript"));
const TeacherPrivateSessions = lazy(() => import("./pages/teacher/TeacherPrivateSessions"));
const TeacherGrading         = lazy(() => import("./pages/teacher/TeacherGrading"));
const TeacherTimetable       = lazy(() => import("./pages/teacher/TeacherTimetable"));
const TeacherPublicClasses   = lazy(() => import("./pages/teacher/TeacherPublicClasses"));
const TeacherHifdhReview     = lazy(() => import("./pages/teacher/TeacherHifdhReview"));
const TeacherMajlis          = lazy(() => import("./pages/teacher/TeacherMajlis"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,          // 60s before background refetch
      retry: 1,                   // only 1 retry on network error
      refetchOnWindowFocus: false, // avoid re-fetching on every tab focus
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <RecordingPlayerProvider>
            <LiveClassProvider>
            <ErrorBoundary>
              <AppNotifications />
              <IdleWarningModal />
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

                  <Route path="/auth/register-continue" element={<RegisterContinue />} />
                  <Route path="/auth/callback"          element={<AuthCallback />} />
                  <Route path="/registration-complete"  element={<RegistrationComplete />} />

                  {/* ── Standalone full-screen routes (no sidebar) ──────── */}
                  {/* Keep existing quiz unchanged */}
                  <Route path="/live-quiz" element={<ProtectedRoute><LiveQuiz /></ProtectedRoute>} />
                  {/* New: Qur'an recitation competition — full-screen like /live-quiz */}
                  <Route path="/musabaqah/recitation" element={<ProtectedRoute><MustabaqahPage /></ProtectedRoute>} />

                  {/* Public Live Classes */}
                  <Route path="/live"                       element={<LiveClasses />} />
                  <Route path="/public/classes"             element={<LiveClasses />} />
                  <Route path="/live/:roomCode"             element={<JoinClass />} />
                  <Route path="/public/join/:roomCode"      element={<JoinClass />} />
                  <Route path="/live/:roomCode/classroom"   element={<GuestClassroom />} />
                  <Route path="/public/classroom/:roomCode" element={<GuestClassroom />} />

                  <Route path="/recordings/:recordingId" element={<ProtectedRoute><RecordingPlayer /></ProtectedRoute>} />

                  {/* ── Student routes (inside DashboardLayout) ─────────── */}
                  <Route element={<ProtectedRoute><DashboardLayout role="student" /></ProtectedRoute>}>
                    <Route path="/student"                     element={<StudentDashboard />} />
                    <Route path="/student/courses"             element={<LearningHub />} />
                    <Route path="/student/courses/:courseId"   element={<LearningHub />} />
                    <Route path="/student/subjects/:subjectId" element={<SubjectView />} />
                    <Route path="/student/exams"               element={<StudentExams />} />
                    <Route path="/student/transcripts"         element={<Transcripts />} />
                    <Route path="/student/majlis"              element={<Majlis />} />
                    <Route path="/student/live-classes"        element={<LearningHub defaultTab="live" />} />
                    <Route path="/student/revision"            element={<RevisionHub />} />
                    <Route path="/student/hifdh"               element={<HifdhRevision />} />
                    <Route path="/student/revision/:subjectId" element={<RevisionRoom />} />
                    <Route path="/student/timetable"           element={<StudentTimetable />} />
                    <Route path="/student/profile"             element={<ProfileSettings />} />
                    <Route path="/student/enrollment-payment"  element={<EnrollmentPayment />} />
                    {/* Hub: choose between Quiz Arena or Recitation Competition */}
                    <Route path="/student/musabaqah"           element={<MusabaqahHub />} />
                  </Route>

                  {/* Student standalone */}
                  <Route path="/student/exam-verify/:examId"         element={<ProtectedRoute><PreExamVerification /></ProtectedRoute>} />
                  <Route path="/student/exam/:attemptId"             element={<ProtectedRoute><ExamTaking /></ProtectedRoute>} />
                  <Route path="/student/results/:attemptId"          element={<ProtectedRoute><ExamResults /></ProtectedRoute>} />
                  <Route path="/onboarding"                          element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
                  <Route path="/student/recitation-test"             element={<ProtectedRoute><RecitationTest /></ProtectedRoute>} />
                  <Route path="/student/entrance-exam/:attemptId"    element={<ProtectedRoute><EntranceExamTaking /></ProtectedRoute>} />
                  <Route path="/student/entrance-exam"              element={<ProtectedRoute><EntranceExamResume /></ProtectedRoute>} />
                  <Route path="/student/entrance-results/:attemptId" element={<ProtectedRoute><EntranceResults /></ProtectedRoute>} />
                  <Route path="/student/payment"                     element={<ProtectedRoute><PaymentScreen /></ProtectedRoute>} />
                  <Route path="/student/awaiting-level"              element={<ProtectedRoute><TasjeelAwaitingLevel /></ProtectedRoute>} />

                  {/* ── Teacher routes ── */}
                  <Route element={<ProtectedRoute requiredRole="teacher"><TeacherLayout /></ProtectedRoute>}>
                    <Route path="/teacher"                  element={<TeacherDashboard />} />
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
                    <Route path="/teacher/grading"          element={<TeacherGrading />} />
                    <Route path="/teacher/results"          element={<TeacherResults />} />
                    <Route path="/teacher/transcripts"      element={<TeacherTranscript />} />
                    <Route path="/teacher/recitation"       element={<TeacherRecitation />} />
                    <Route path="/teacher/hifdh"            element={<TeacherHifdhReview />} />
                    <Route path="/teacher/hifdh-tracker"    element={<HifdhRevisionTracker />} />
                    <Route path="/teacher/majlis"           element={<TeacherMajlis />} />
                    <Route path="/teacher/settings"         element={<TeacherSettings />} />
                  </Route>

                  {/* ── Admin routes (inside DashboardLayout) ───────────── */}
                  <Route element={<ProtectedRoute requiredRole="admin"><DashboardLayout role="admin" /></ProtectedRoute>}>
                    <Route path="/admin"                             element={<AdminDashboard />} />
                    <Route path="/admin/subjects"                    element={<CourseManagement />} />
                    <Route path="/admin/subjects/:subjectId"         element={<CourseManagement />} />
                    <Route path="/admin/courses"                     element={<CourseManagement />} />
                    <Route path="/admin/syllabus"                    element={<SyllabusManager />} />
                    <Route path="/admin/level-subject-mapping"       element={<LevelSubjectMapping />} />
                    <Route path="/admin/timetable"                   element={<TimetableManagement />} />
                    <Route path="/admin/live-classes"                element={<LiveClassManagement />} />
                    <Route path="/admin/exams"                       element={<ExamManager />} />
                    <Route path="/admin/exams/create"                element={<ExamEditor />} />
                    <Route path="/admin/exams/:examId/edit"          element={<ExamEditor />} />
                    <Route path="/admin/grading"                     element={<GradingPage />} />
                    <Route path="/admin/question-bank"               element={<QuestionBank />} />
                    <Route path="/admin/proctoring"                  element={<ProctoringDashboard />} />
                    <Route path="/admin/private-sessions"            element={<PrivateSessions />} />
                    <Route path="/admin/students"                    element={<StudentManagement />} />
                    <Route path="/admin/students/:userId/view"       element={<ViewAsStudent />} />
                    <Route path="/admin/view-as-student/:userId"     element={<ViewAsStudent />} />
                    <Route path="/admin/recordings"                  element={<RecordingManagement />} />
                    <Route path="/admin/live-class-management"       element={<LiveClassManagement />} />
                    <Route path="/admin/majlis-moderation"           element={<MajlisModeration />} />
                    <Route path="/admin/notifications"               element={<NotificationManagement />} />
                    <Route path="/admin/entrance-exam"               element={<EntranceExamAdmin />} />
                    <Route path="/admin/recitation-review"           element={<HifdhAdminReview />} />
                    <Route path="/admin/hifdh-tracker"               element={<HifdhRevisionTracker />} />
                    <Route path="/admin/recitation-test-settings"    element={<RecitationTestAdmin />} />
                    <Route path="/admin/level-assignment"            element={<LevelAssignment />} />
                    <Route path="/admin/levels"                      element={<LevelManagement />} />
                    <Route path="/admin/transcripts"                 element={<TranscriptManagement />} />
                    <Route path="/admin/attendance"                  element={<AttendanceManagement />} />
                    <Route path="/admin/payments"                    element={<PaymentManagement />} />
                    <Route path="/admin/calendar"                    element={<AcademicCalendar />} />
                    <Route path="/admin/payment-settings"            element={<PaymentSettings />} />
                    <Route path="/admin/public-classes"              element={<PublicClassManagement />} />
                    <Route path="/admin/registration-settings"       element={<RegistrationSettings />} />
                    <Route path="/admin/tasjeel"                     element={<TasjeelAdmin />} />
                    {/* Hub: choose between Quiz Arena or Recitation Competition */}
                    <Route path="/admin/musabaqah"                   element={<MusabaqahHub />} />
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
            <Suspense fallback={null}>
              <GlobalClassroomOverlay />
            </Suspense>
            </LiveClassProvider>
            </RecordingPlayerProvider>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;