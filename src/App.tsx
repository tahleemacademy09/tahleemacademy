import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import PublicLayout from "@/components/layout/PublicLayout";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ProtectedRoute from "@/components/layout/ProtectedRoute";

import Index from "./pages/Index";
import Courses from "./pages/Courses";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AdminLogin from "./pages/AdminLogin";
import NotFound from "./pages/NotFound";

import StudentDashboard from "./pages/student/StudentDashboard";
import StudentExams from "./pages/student/StudentExams";
import ExamTaking from "./pages/student/ExamTaking";
import ProfileSettings from "./pages/student/ProfileSettings";
import ExamResults from "./pages/student/ExamResults";
import PreExamVerification from "./pages/student/PreExamVerification";

import AdminDashboard from "./pages/admin/AdminDashboard";
import ExamManager from "./pages/admin/ExamManager";
import ExamEditor from "./pages/admin/ExamEditor";
import GradingPage from "./pages/admin/GradingPage";
import StudentManagement from "./pages/admin/StudentManagement";
import ProctoringDashboard from "./pages/admin/ProctoringDashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public pages */}
              <Route element={<PublicLayout />}>
                <Route path="/" element={<Index />} />
                <Route path="/courses" element={<Courses />} />
                <Route path="/about" element={<About />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
              </Route>

              {/* Admin login (standalone, no public layout) */}
              <Route path="/admin-login" element={<AdminLogin />} />

              {/* Student dashboard */}
              <Route element={<ProtectedRoute><DashboardLayout role="student" /></ProtectedRoute>}>
                <Route path="/student" element={<StudentDashboard />} />
                <Route path="/student/exams" element={<StudentExams />} />
                <Route path="/student/profile" element={<ProfileSettings />} />
              </Route>

              {/* Exam taking (no sidebar) */}
              <Route path="/student/exam-verify/:examId" element={<ProtectedRoute><PreExamVerification /></ProtectedRoute>} />
              <Route path="/student/exam/:attemptId" element={<ProtectedRoute><ExamTaking /></ProtectedRoute>} />
              <Route path="/student/results/:attemptId" element={<ProtectedRoute><ExamResults /></ProtectedRoute>} />

              {/* Admin dashboard - requires admin role */}
              <Route element={<ProtectedRoute requiredRole="admin"><DashboardLayout role="admin" /></ProtectedRoute>}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/exams" element={<ExamManager />} />
                <Route path="/admin/exams/create" element={<ExamEditor />} />
                <Route path="/admin/exams/:examId/edit" element={<ExamEditor />} />
                <Route path="/admin/grading" element={<GradingPage />} />
                <Route path="/admin/proctoring" element={<ProctoringDashboard />} />
                <Route path="/admin/students" element={<StudentManagement />} />
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
