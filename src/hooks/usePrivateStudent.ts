// src/hooks/usePrivateStudent.ts
// Centralises all "private student" logic so every page can share the same check.
//
// A student is considered "private" when their profile has:
//   student_type === "private"
//
// A private student can access general class data (timetable, live classes, subjects)
// only when admin has explicitly enabled:
//   allow_general_access === true

import { useAuth } from "@/contexts/AuthContext";

export function usePrivateStudent() {
  const { profile, hasRole } = useAuth();

  const isPrivateStudent =
    !hasRole("admin") &&
    !hasRole("teacher") &&
    (profile as any)?.student_type === "private";

  const allowGeneralAccess =
    !isPrivateStudent || // non-private students always have full access
    (profile as any)?.allow_general_access === true;

  return {
    /** True when the logged-in user is a private student */
    isPrivateStudent,
    /**
     * True when the student is allowed to see general class data.
     * Always true for non-private students.
     * For private students, only true when admin has toggled allow_general_access.
     */
    allowGeneralAccess,
  };
}
