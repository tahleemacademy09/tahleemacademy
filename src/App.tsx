import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import PublicLayout from "@/components/layout/PublicLayout";
import DashboardLayout from "@/components/layout/DashboardLayout";
import TeacherLayout from "@/components/layout/TeacherLayout";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import MuallimOverlay from "@/components/majlis/MuallimOverlay";

// ─── Page Loading Fallback ────────────────────────────────────────────────────
const PageLoader = () => (
  <div className="container mx-auto px-4 py-8 space-y-4">
    <Skeleton className="h-12 w-2/3 rounded-xl" />
    <Skeleton className="h-48 w-full rounded-2xl" />
    <div className="grid grid-cols-2 gap-4">
      {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
    </div>
  </div>
);

// ─── Public Pages (eager — needed on first paint) ─────────────────────────────
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// ─── Public Pages (lazy) ──────────────────────────────────────────────────────
const Courses = lazy(() => import("./pages/Courses"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const PublicLiveClasses = lazy(() => import("./pages/public/LiveClasses"));
const JoinClass = lazy(() => import("./pages/public/JoinClass"));
const GuestClassroom = lazy(() => import("./pages/public/GuestClassroom"));

// ─── Admin Login ──────────────────────────────────────────────────────────────
const AdminLogin = lazy(() => import("./pages/AdminLogin"));

// ─── Student Pages (lazy) ─────────────────────────────────────────────────────
const StudentDashboard = lazy(() => import("./pages/student/StudentDashboard"));
const StudentExams = lazy(() => import("./pages/student/StudentExams"));
const ExamTaking = lazy(() => import("./pages/student/ExamTaking"));
const ProfileSettings = lazy(() => import("./pages/student/ProfileSettings"));
const ExamResults = lazy(() => import("./pages/student/ExamResults"));
const PreExamVerification = lazy(() => import("./pages/student/PreExamVerification"));
const Transcripts = lazy(() => import("./pages/student/Transcripts"));
const Majlis = lazy(() => import("./pages/student/Majlis"));
const LiveClasses = lazy(() => import("./pages/student/LiveClasses"));
const LearningHub = lazy(() => import("./pages/student/LearningHub"));
const CourseView = lazy(() => import("./pages/student/CourseView"));
const SubjectView = lazy(() => import("./pages/student/SubjectView"));
const Onboarding = lazy(() => import("./pages/student/Onboarding"));
const EntranceExamTaking = lazy(() => import("./pages/student/EntranceExamTaking"));
const EntranceResults = lazy(() => import("./pages/student/EntranceResults"));
const RevisionHub = lazy(() => import("./pages/student/RevisionHub"));
const HifdhRevision = lazy(() => import("./pages/student/HifdhRevision"));
const RevisionRoom = lazy(() => import("./pages/student/RevisionRoom"));
const PaymentScreen = lazy(() => import("./pages/student/PaymentScreen"));
const RecordingPlayer = lazy(() => import("./pages/student/RecordingPlayer"));
const EnrollmentPayment = lazy(() => import("./pages/student/EnrollmentPayment"));

// ─── Admin Pages (lazy) ───────────────────────────────────────────────────────
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const ExamManager = lazy(() => import("./pages/admin/ExamManager"));
const ExamEditor = lazy(() => import("./pages/admin/ExamEditor"));
const GradingPage = lazy(() => import("./pages/admin/GradingPage"));
const QuestionBank = lazy(() => import("./pages/admin/QuestionBank"));
const StudentManagement = lazy(() => import("./pages/admin/StudentManagement"));
const ProctoringDashboard = lazy(() => import("./pages/admin/ProctoringDashboard"));
const SubjectManagement = lazy(() => import("./pages/admin/SubjectManagement"));
const CourseManagement = lazy(() => import("./pages/admin/CourseManagement"));
const SyllabusManager = lazy(() => import("./pages/admin/SyllabusManager"));
const PrivateSessions = lazy(() => import("./pages/admin/PrivateSessions"));
const EntranceExamAdmin = lazy(() => import("./pages/admin/EntranceExamAdmin"));
const ViewAsStudent = lazy(() => import("./pages/admin/ViewAsStudent"));
const RecordingManagement = lazy(() => import("./pages/admin/RecordingManagement"));
const LiveClassManagement = lazy(() => import("./pages/admin/LiveClassManagement"));
const MajlisModeration = lazy(() => import("./pages/admin/MajlisModeration"));
const NotificationManagement = lazy(() => import("./pages/admin/NotificationManagement"));
const TranscriptManagement = lazy(() => import("./pages/admin/TranscriptManagement"));
const AttendanceManagement = lazy(() => import("./pages/admin/AttendanceManagement"));
const PaymentManagement = lazy(() => import("./pages/admin/PaymentManagement"));
const AcademicCalendar = lazy(() => import("./pages/admin/AcademicCalendar"));
const PublicClassManagement = lazy(() => import("./pages/admin/PublicClassManagement"));

// ─── Teacher Pages (lazy) ─────────────────────────────────────────────────────
const TeacherDashboard = lazy(() => import("./pages/teacher/TeacherDashboard"));
const TeacherStudents = lazy(() => import("./pages/teacher/TeacherStudents"));
const TeacherPrivateStudents = lazy(() => import("./pages/teacher/TeacherPrivateStudents"));
const TeacherSubjects = lazy(() => import("./pages/teacher/TeacherSubjects"));
const TeacherClasses = lazy(() => import("./pages/teacher/TeacherClasses"));
const TeacherRecordings = lazy(() => import("./pages/teacher/TeacherRecordings"));
const TeacherPrivateSessions = lazy(() => import("./pages/teacher/TeacherPrivateSessions"));
const TeacherExamsPage = lazy(() => import("./pages/teacher/TeacherExamsPage"));
const TeacherResults = lazy(() => import("./pages/teacher/TeacherResults"));
const TeacherTranscript = lazy(() => import("./pages/teacher/TeacherTranscript"));
const TeacherAttendance = lazy(() => import("./pages/teacher/TeacherAttendance"));
const TeacherAnnouncements = lazy(() => import("./pages/teacher/TeacherAnnouncements"));
const TeacherSettings = lazy(() => import("./pages/teacher/TeacherSettings"));

// ─────────────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <MuallimOverlay />
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public pages — Index is eager (first paint) */}
                <Route path="/" element={<Index />} />
                <Route element={<PublicLayout />}>
                  <Route path="/courses" element={<Courses />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                </Route>

                {/* Public live classes (no auth required) */}
                <Route path="/live" element={<PublicLiveClasses />} />
                <Route path="/live/:roomCode" element={<JoinClass />} />
                <Route path="/live/:roomCode/classroom" element={<GuestClassroom />} />

                {/* Admin login (hidden URL) */}
                <Route path="/admin-secure" element={<AdminLogin />} />
                {/* Password reset */}
                <Route path="/reset-password" element={<ResetPassword />} />

                {/* Student dashboard */}
                <Route element={<ProtectedRoute><DashboardLayout role="student" /></ProtectedRoute>}>
                  <Route path="/student" element={<StudentDashboard />} />
                  <Route path="/student/courses" element={<LearningHub />} />
                  <Route path="/student/courses/:courseId" element={<LearningHub />} />
                  <Route path="/student/subjects/:subjectId" element={<SubjectView />} />
                  <Route path="/student/exams" element={<StudentExams />} />
                  <Route path="/student/transcripts" element={<Transcripts />} />
                  <Route path="/student/majlis" element={<Majlis />} />
                  <Route path="/student/live-classes" element={<LearningHub defaultTab="live" />} />
                  <Route path="/student/revision" element={<RevisionHub />} />
                  <Route path="/student/hifdh" element={<HifdhRevision />} />
                  <Route path="/student/revision/:subjectId" element={<RevisionRoom />} />
                  <Route path="/student/profile" element={<ProfileSettings />} />
                  <Route path="/student/enrollment-payment" element={<EnrollmentPayment />} />
                </Route>

                {/* Exam taking (no sidebar) */}
                <Route path="/student/exam-verify/:examId" element={<ProtectedRoute skipOnboardingCheck><PreExamVerification /></ProtectedRoute>} />
                <Route path="/student/exam/:attemptId" element={<ProtectedRoute skipOnboardingCheck><ExamTaking /></ProtectedRoute>} />
                <Route path="/student/results/:attemptId" element={<ProtectedRoute skipOnboardingCheck><ExamResults /></ProtectedRoute>} />

                {/* Onboarding, Entrance Exam & Payment (no sidebar) */}
                <Route path="/onboarding" element={<ProtectedRoute skipOnboardingCheck><Onboarding /></ProtectedRoute>} />
                <Route path="/student/entrance-exam/:attemptId" element={<ProtectedRoute skipOnboardingCheck><EntranceExamTaking /></ProtectedRoute>} />
                <Route path="/student/entrance-results/:attemptId" element={<ProtectedRoute skipOnboardingCheck><EntranceResults /></ProtectedRoute>} />
                <Route path="/student/payment" element={<ProtectedRoute skipOnboardingCheck><PaymentScreen /></ProtectedRoute>} />
                <Route path="/recordings/:recordingId" element={<ProtectedRoute><RecordingPlayer /></ProtectedRoute>} />

                {/* Teacher dashboard */}
                <Route element={<ProtectedRoute requiredRole="teacher"><TeacherLayout /></ProtectedRoute>}>
                  <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
                  <Route path="/teacher/students" element={<TeacherStudents />} />
                  <Route path="/teacher/private-students" element={<TeacherPrivateStudents />} />
                  <Route path="/teacher/subjects" element={<TeacherSubjects />} />
                  <Route path="/teacher/classes" element={<TeacherClasses />} />
                  <Route path="/teacher/recordings" element={<TeacherRecordings />} />
                  <Route path="/teacher/private-sessions" element={<TeacherPrivateSessions />} />
                  <Route path="/teacher/exams" element={<TeacherExamsPage type="exam" />} />
                  <Route path="/teacher/tests" element={<TeacherExamsPage type="test" />} />
                  <Route path="/teacher/results" element={<TeacherResults />} />
                  <Route path="/teacher/transcript" element={<TeacherTranscript />} />
                  <Route path="/teacher/attendance" element={<TeacherAttendance />} />
                  <Route path="/teacher/announcements" element={<TeacherAnnouncements />} />
                  <Route path="/teacher/settings" element={<TeacherSettings />} />
                  <Route path="/teacher/public-classes" element={<PublicClassManagement />} />
                </Route>

                {/* Admin dashboard */}
                <Route element={<ProtectedRoute requiredRole="admin"><DashboardLayout role="admin" /></ProtectedRoute>}>
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/admin/subjects" element={<SubjectManagement />} />
                  <Route path="/admin/courses" element={<CourseManagement />} />
                  <Route path="/admin/syllabus" element={<SyllabusManager />} />
                  <Route path="/admin/live-classes" element={<LiveClasses />} />
                  <Route path="/admin/exams" element={<ExamManager />} />
                  <Route path="/admin/exams/create" element={<ExamEditor />} />
                  <Route path="/admin/exams/:examId/edit" element={<ExamEditor />} />
                  <Route path="/admin/grading" element={<GradingPage />} />
                  <Route path="/admin/question-bank" element={<QuestionBank />} />
                  <Route path="/admin/proctoring" element={<ProctoringDashboard />} />
                  <Route path="/admin/private-sessions" element={<PrivateSessions />} />
                  <Route path="/admin/students" element={<StudentManagement />} />
                  <Route path="/admin/students/:userId/view" element={<ViewAsStudent />} />
                  <Route path="/admin/recordings" element={<RecordingManagement />} />
                  <Route path="/admin/live-class-management" element={<LiveClassManagement />} />
                  <Route path="/admin/majlis-moderation" element={<MajlisModeration />} />
                  <Route path="/admin/notifications" element={<NotificationManagement />} />
                  <Route path="/admin/entrance-exam" element={<EntranceExamAdmin />} />
                  <Route path="/admin/transcripts" element={<TranscriptManagement />} />
                  <Route path="/admin/attendance" element={<AttendanceManagement />} />
                  <Route path="/admin/payments" element={<PaymentManagement />} />
                  <Route path="/admin/calendar" element={<AcademicCalendar />} />
                  <Route path="/admin/public-classes" element={<PublicClassManagement />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
