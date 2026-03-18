import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

// ✅ Typed UserProfile — no more `any`
export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url?: string;
  phone?: string;
  onboarding_complete: boolean;
  payment_status?: string;
  course_level?: string;
  [key: string]: unknown; // allow extra Supabase columns without breaking TS
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
  // ✅ Single loading state — only false AFTER both auth session AND user data are loaded
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const fetchUserData = async (userId: string) => {
    const [rolesRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    if (rolesRes.data) setRoles(rolesRes.data.map((r) => r.role));
    if (profileRes.data) setProfile(profileRes.data as UserProfile);
  };

  const refreshProfile = async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (data) setProfile(data as UserProfile);
  };

  useEffect(() => {
    let mounted = true;

    // ✅ Fix race condition: setLoading(false) only after data is fully loaded
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserData(session.user.id);
      }
      if (mounted) setLoading(false);
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserData(session.user.id);
      } else {
        setRoles([]);
        setProfile(null);
      }
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

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

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRoles([]);
    setProfile(null);
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
