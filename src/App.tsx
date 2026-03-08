import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import PublicLayout from "@/components/layout/PublicLayout";
import DashboardLayout from "@/components/layout/DashboardLayout";
import TeacherLayout from "@/components/layout/TeacherLayout";
import ProtectedRoute from "@/components/layout/ProtectedRoute";

import Index from "./pages/Index";
import Courses from "./pages/Courses";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AdminLogin from "./pages/AdminLogin";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

import StudentDashboard from "./pages/student/StudentDashboard";
import StudentExams from "./pages/student/StudentExams";
import ExamTaking from "./pages/student/ExamTaking";
import ProfileSettings from "./pages/student/ProfileSettings";
import ExamResults from "./pages/student/ExamResults";
import PreExamVerification from "./pages/student/PreExamVerification";
import Transcripts from "./pages/student/Transcripts";
import Majlis from "./pages/student/Majlis";
import LiveClasses from "./pages/student/LiveClasses";
import StudentCourses from "./pages/student/StudentCourses";
import CourseView from "./pages/student/CourseView";
import SubjectView from "./pages/student/SubjectView";
import MuallimOverlay from "./components/majlis/MuallimOverlay";
import Onboarding from "./pages/student/Onboarding";
import EntranceExamTaking from "./pages/student/EntranceExamTaking";
import EntranceResults from "./pages/student/EntranceResults";
import RevisionHub from "./pages/student/RevisionHub";
import RevisionRoom from "./pages/student/RevisionRoom";
import PaymentScreen from "./pages/student/PaymentScreen";
import RecordingPlayer from "./pages/student/RecordingPlayer";

import AdminDashboard from "./pages/admin/AdminDashboard";
import ExamManager from "./pages/admin/ExamManager";
import ExamEditor from "./pages/admin/ExamEditor";
import GradingPage from "./pages/admin/GradingPage";
import QuestionBank from "./pages/admin/QuestionBank";
import StudentManagement from "./pages/admin/StudentManagement";
import ProctoringDashboard from "./pages/admin/ProctoringDashboard";
import SubjectManagement from "./pages/admin/SubjectManagement";
import CourseManagement from "./pages/admin/CourseManagement";
import SyllabusManager from "./pages/admin/SyllabusManager";
import PrivateSessions from "./pages/admin/PrivateSessions";
import EntranceExamAdmin from "./pages/admin/EntranceExamAdmin";
import ViewAsStudent from "./pages/admin/ViewAsStudent";
import RecordingManagement from "./pages/admin/RecordingManagement";
import LiveClassManagement from "./pages/admin/LiveClassManagement";
import MajlisModeration from "./pages/admin/MajlisModeration";
import NotificationManagement from "./pages/admin/NotificationManagement";
import TranscriptManagement from "./pages/admin/TranscriptManagement";
import AttendanceManagement from "./pages/admin/AttendanceManagement";
import PaymentManagement from "./pages/admin/PaymentManagement";
import AcademicCalendar from "./pages/admin/AcademicCalendar";

import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import TeacherStudents from "./pages/teacher/TeacherStudents";
import TeacherPrivateStudents from "./pages/teacher/TeacherPrivateStudents";
import TeacherSubjects from "./pages/teacher/TeacherSubjects";
import TeacherClasses from "./pages/teacher/TeacherClasses";
import TeacherRecordings from "./pages/teacher/TeacherRecordings";
import TeacherPrivateSessions from "./pages/teacher/TeacherPrivateSessions";
import TeacherExamsPage from "./pages/teacher/TeacherExamsPage";
import TeacherResults from "./pages/teacher/TeacherResults";
import TeacherTranscript from "./pages/teacher/TeacherTranscript";
import TeacherAttendance from "./pages/teacher/TeacherAttendance";
import TeacherAnnouncements from "./pages/teacher/TeacherAnnouncements";
import TeacherSettings from "./pages/teacher/TeacherSettings";

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
            <Routes>
              {/* Public pages */}
              {/* Index has its own navbar/footer */}
              <Route path="/" element={<Index />} />
              <Route element={<PublicLayout />}>
                <Route path="/courses" element={<Courses />} />
                <Route path="/about" element={<About />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
              </Route>

              {/* Admin login (hidden URL) */}
              <Route path="/admin-secure" element={<AdminLogin />} />
              {/* Password reset */}
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Student dashboard */}
              <Route element={<ProtectedRoute><DashboardLayout role="student" /></ProtectedRoute>}>
                <Route path="/student" element={<StudentDashboard />} />
                <Route path="/student/courses" element={<StudentCourses />} />
                <Route path="/student/courses/:courseId" element={<CourseView />} />
                <Route path="/student/subjects/:subjectId" element={<SubjectView />} />
                <Route path="/student/exams" element={<StudentExams />} />
                <Route path="/student/transcripts" element={<Transcripts />} />
                <Route path="/student/majlis" element={<Majlis />} />
                <Route path="/student/live-classes" element={<LiveClasses />} />
                <Route path="/student/revision" element={<RevisionHub />} />
                <Route path="/student/revision/:subjectId" element={<RevisionRoom />} />
                <Route path="/student/profile" element={<ProfileSettings />} />
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

              {/* Teacher dashboard - requires teacher role */}
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
              </Route>

              {/* Admin dashboard - requires admin role */}
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
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
