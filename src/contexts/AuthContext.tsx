
import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url?: string;
  phone?: string;
  onboarding_complete?: boolean;
  onboarding_completed?: boolean;
  has_taken_entrance_exam?: boolean;
  payment_status?: string;
  course_level?: string;
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
  signOut: () => Promise<void>;
  hasRole: (role: string) => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);

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
      // Only set loading false here when called on initial session restore
      // so ProtectedRoute never renders with roles still empty
      if (setLoadingFalse) setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (data) setProfile(data as UserProfile);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // KEY FIX: reset loading=true so TasjeelGuard/ProtectedRoute waits for
        // fresh roles on every sign-in, not just on initial page load.
        // Without this, loading stays false from a previous null-session and
        // guards check hasRole() before the new roles arrive.
        setLoading(true);
        fetchUserData(session.user.id, true);
      } else {
        setRoles([]);
        setProfile(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // Pass true so fetchUserData sets loading=false AFTER roles are loaded
        // This prevents ProtectedRoute from redirecting before roles arrive
        fetchUserData(session.user.id, true);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    return supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: fullName } },
    });
  };

  const signIn = async (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null); setSession(null); setRoles([]); setProfile(null);
  };

  const hasRole = (role: string) => roles.includes(role);

  return (
    <AuthContext.Provider value={{ user, session, loading, roles, profile, signUp, signIn, signOut, hasRole, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};