// src/pages/teacher/TeacherSubjects.tsx
// Teachers now get the same Courses → Subjects → Lessons interface students
// see (LearningHub), limited to the courses/subjects they teach.
import LearningHub from "@/pages/student/LearningHub";

export default function TeacherSubjects() {
  return <LearningHub scope="teacher" />;
}
