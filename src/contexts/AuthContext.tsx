// src/contexts/AuthContext.tsx
// ═══════════════════════════════════════════════════════════════════════════
// MODIFIED: Added signInWithGoogle (native Supabase OAuth)
//           Added onUserAuthenticated hook (creates dashboard + inits Tasjeel)
//           Removed lovable dependency for Google auth
// ═══════════════════════════════════════════════════════════════════════════

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { initializeTasjeel, createDashboardIfNotExists } from "@/hooks/useTasjeel";

// ── Types ──────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url?: string;
  phone?: string;
  email?: string;
  auth_provider?: "email" | "google";
  onboarding_complete?: boolean;
  onboarding_completed?: boolean;
  has_taken_entrance_exam?: boolean;
  payment_status?: string;
  course_level?: string;
  level?: string;
  [key: string]: unknown;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: string[];
  profile: UserProfile | null;
  signUp: (email: string, password: string, fullName: string) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: string) => boolean;
  refreshProfile: () => Promise<void>;
}

// ── Context ────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Provider ───────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser]       = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles]     = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Track which user IDs we've already run onUserAuthenticated for
  // This prevents re-running on every token refresh / SIGNED_IN event
  const initializedUsersRef = useRef<Set<string>>(new Set());

  // ── Fetch roles + profile ─────────────────────────────────────────────

  const fetchUserData = async (userId: string, setLoadingFalse = false) => {
    try {
      const [rolesRes, profileRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      ]);
      if (rolesRes.data) setRoles(rolesRes.data.map((r) => r.role));
      if (profileRes.data) setProfile(profileRes.data as UserProfile);
    } catch (err) {
      console.error("fetchUserData error:", err);
    } finally {
      if (setLoadingFalse) setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) setProfile(data as UserProfile);
  };

  // ── onUserAuthenticated — runs ONCE per unique user login session ──────
  //
  // This is the central hook described in the TASJEEL spec:
  //   1. createDashboardIfNotExists
  //   2. Read registration_enabled from academy_settings
  //   3. If disabled → mark tasjeel completed immediately
  //   4. Else → initializeTasjeel (idempotent — safe for returning users)
  //
  const onUserAuthenticated = async (authenticatedUser: User) => {
    const uid = authenticatedUser.id;

    // Guard: only run once per user per session
    if (initializedUsersRef.current.has(uid)) return;
    initializedUsersRef.current.add(uid);

    try {
      // 1. Ensure dashboard exists
      await createDashboardIfNotExists(uid);

      // 2. Read registration_enabled (maps to registration_open in academy_settings)
      const { data: settings } = await supabase
        .from("academy_settings" as any)
        .select("key, value")
        .in("key", ["registration_open"]);

      const settingsMap: Record<string, string> = {};
      (settings as any[] ?? []).forEach((r: any) => {
        settingsMap[r.key] = r.value;
      });

      const registrationEnabled = settingsMap["registration_open"] !== "false";

      // 3. Initialize Tasjeel pipeline (idempotent)
      await initializeTasjeel(uid, registrationEnabled);
    } catch (err) {
      console.error("[AuthContext] onUserAuthenticated error:", err);
      // Non-fatal — don't block the user from using the app
    }
  };

  // ── Auth state listener ───────────────────────────────────────────────

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          await fetchUserData(newSession.user.id, true);

          // Trigger onUserAuthenticated on real sign-in events
          // SIGNED_IN fires for: new logins, OAuth callbacks, token refreshes
          // We guard with initializedUsersRef to run only once per user
          if (event === "SIGNED_IN") {
            // Run non-blocking — don't await, don't block the loading spinner
            onUserAuthenticated(newSession.user).catch(console.error);
          }
        } else {
          setRoles([]);
          setProfile(null);
          setLoading(false);
        }
      }
    );

    // Restore existing session on mount
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      if (existingSession?.user) {
        fetchUserData(existingSession.user.id, true);
        // For existing sessions, SIGNED_IN won't fire — trigger hook manually
        onUserAuthenticated(existingSession.user).catch(console.error);
      } else {
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      initializedUsersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auth methods ──────────────────────────────────────────────────────

  const signUp = async (email: string, password: string, fullName: string) => {
    return supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
  };

  const signIn = async (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password });
  };

  // ── Google OAuth (replaces lovable.auth.signInWithOAuth) ─────────────
  //
  // Uses native Supabase signInWithOAuth.
  // Supabase redirects to /auth/callback → AuthCallback.tsx handles it.
  // The onAuthStateChange SIGNED_IN event fires when the user returns
  // and AuthContext runs onUserAuthenticated automatically.
  //
  const signInWithGoogle = async (): Promise<{ error: Error | null }> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    initializedUsersRef.current.clear();
    setUser(null);
    setSession(null);
    setRoles([]);
    setProfile(null);
  };

  const hasRole = (role: string) => roles.includes(role);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        roles,
        profile,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
        hasRole,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
