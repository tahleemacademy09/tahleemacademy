// src/pages/teacher/TeacherMajlis.tsx
// Teachers use the same Majlis (Al-Majlis chat) as students — just re-export it

// The teacher has full moderator access in the Majlis since they have the 'teacher' role.
// SubjectMajlis uses hasRole("admin") || hasRole("teacher") to grant mod rights.

import Majlis from "@/pages/student/Majlis";
export default Majlis;
