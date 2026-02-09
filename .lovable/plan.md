

# Tahleem Academy — Full Website & Exam Portal

## Overview
A complete Arabic learning academy platform with a marketing website, student/admin dashboards, and a fully-featured exam portal. Built with React, Tailwind CSS, and Supabase (backend, auth, storage, edge functions).

---

## 1. Marketing Website

### Homepage
- Hero section with Arabic calligraphy imagery and academy tagline
- Featured courses carousel
- Testimonials section
- Call-to-action for registration

### Courses Page
- List of courses (Arabic language, Tajweed, Quran memorization, etc.)
- Filter by level: beginner, intermediate, advanced
- Course detail pages with syllabus and instructor info

### About Us Page
- Academy story, mission, and vision
- Instructor profiles with credentials

### Contact Page
- Contact form with validation
- Email, phone, social media links
- Embedded map (optional)

---

## 2. Authentication & User Roles

- Secure sign-up and sign-in (email/password) via Supabase Auth
- Three roles stored in a dedicated `user_roles` table: **Admin**, **Teacher**, **Student**
- Role-based route protection — students, teachers, and admins each see different dashboards
- Profile management (name, avatar, contact info)

---

## 3. Student Dashboard

- Overview: enrolled courses, upcoming exams, recent scores
- Course progress tracking
- Exam schedule calendar
- Notifications panel (exam reminders, results published)
- Exam history with scores and detailed feedback

---

## 4. Admin / Teacher Dashboard

- Overview: total students, active exams, recent activity stats
- Student management: view, search, assign to classes/groups
- Course management: create, edit, delete courses
- Exam management hub (see below)
- Reports & analytics with charts (using Recharts)
- Notification management: send announcements to students

---

## 5. Exam Portal — Student Side

### Exam Registration & Listing
- Browse available exams with date, duration, and subject
- Register for upcoming exams

### Exam Interface
- Distraction-free, full-screen exam view
- Configurable display: one question at a time or all at once
- Countdown timer with warnings at milestones
- Auto-save answers periodically
- Save draft and final submit buttons
- Flag questions for review
- Progress bar showing answered/unanswered/flagged questions
- Navigation panel to jump between questions

### Supported Question Types
- Multiple Choice (single and multiple correct answers)
- True/False
- Short Answer / Essay
- Fill-in-the-blank
- Matching questions
- Audio/Video playback questions (for listening and pronunciation exams)

### Exam Tools
- Audio playback controls for listening questions
- Clear indication of answered vs. unanswered questions
- Exam guidelines/rules displayed before starting

### Results & History
- Immediate or delayed result display (configurable by admin)
- Detailed per-question feedback when enabled
- Full exam history with scores and progress over time

### Proctoring Features
- Question randomization and answer shuffling
- Tab-switch detection with warnings
- Prevent multiple simultaneous logins during exam
- Exam activity logging

---

## 6. Exam Portal — Admin / Teacher Side

### Exam Creation & Management
- Create, edit, duplicate, and delete exams
- Rich question editor with full Arabic diacritics support
- Bulk import questions via CSV/Excel upload
- Question bank with tagging by topic, difficulty, and type
- Set exam parameters: time limit, passing score, max attempts, auto-grade toggle

### Scheduling
- Set exam date/time windows
- Auto-open and auto-close exams on schedule

### Student Assignment
- Assign exams to specific classes, groups, or individual students

### Grading & Feedback
- Auto-grading for objective questions (MCQ, True/False, matching)
- Manual grading interface for short answer and essay questions
- Add per-question and overall feedback/comments per student

### Reports & Analytics
- Performance reports by student, class, or exam
- Question-level analysis (difficulty index, average score, discrimination)
- Export reports to PDF and Excel

### Proctoring Monitoring
- View exam activity logs per student
- Flag suspicious behavior (excessive tab switches)

---

## 7. Multi-Language Support
- Full interface available in Arabic (RTL) and English (LTR)
- Language toggle accessible from any page
- Arabic-first design with proper RTL layout

---

## 8. Notifications System
- In-app notification center
- Email notifications via Supabase Edge Functions for:
  - Exam schedule reminders
  - Results published
  - Admin announcements

---

## 9. Mobile-Responsive Design
- Fully responsive across all pages including the exam interface
- Touch-friendly controls for exam-taking on mobile
- Mobile-optimized navigation with hamburger menu

---

## 10. Security & Data Integrity
- Role-based access control with server-side validation (Supabase RLS)
- Encrypted data storage for student info and exam content
- Input validation on all forms (Zod schemas)
- Rate limiting on auth endpoints
- Exam anti-cheat measures (randomization, tab detection, activity logging)

---

## Database Structure (Supabase)
- **profiles** — user profile data linked to auth.users
- **user_roles** — separate role table (admin, teacher, student)
- **courses** — course catalog
- **enrollments** — student-course relationships
- **exams** — exam definitions and settings
- **exam_questions** — question bank with type, content, options, tags
- **exam_assignments** — which students/groups are assigned to which exams
- **exam_attempts** — student exam sessions with timing and status
- **exam_answers** — individual question responses per attempt
- **exam_results** — computed scores and feedback
- **notifications** — in-app notification records
- **activity_logs** — proctoring and audit trail

---

## Pages Summary
| Page | Access |
|------|--------|
| Home, Courses, About, Contact | Public |
| Login / Register | Public |
| Student Dashboard | Student |
| Student Exam List & Registration | Student |
| Exam Taking Interface | Student |
| Exam Results & History | Student |
| Admin Dashboard | Admin/Teacher |
| Exam Creator/Editor | Admin/Teacher |
| Question Bank | Admin/Teacher |
| Student Management | Admin/Teacher |
| Grading Interface | Admin/Teacher |
| Reports & Analytics | Admin/Teacher |
| Settings & Notifications | All authenticated |

