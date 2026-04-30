// src/contexts/AuthContext.tsx
// Fixed: removed getSession() duplicate fetch that raced with onAuthStateChange.
// In Supabase JS v2, onAuthStateChange fires INITIAL_SESSION immediately on subscribe
// with the persisted session — so getSession() is redundant and causes a loading flicker
// where roles[] is briefly empty, causing ProtectedRoute to redirect incorrectly.
// Also added: mounted guard, 8s safety timeout so loading never hangs forever,
// and exponential-backoff retry for transient network errors on fetchUserData.

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
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
  level?: string;
  [key: string]: unknown;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: string[];
  profile: UserProfile | null;
  mustChangePassword: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
  hasRole: (role: string) => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user,               setUser]               = useState<User | null>(null);
  const [session,            setSession]            = useState<Session | null>(null);
  const [loading,            setLoading]            = useState(true);
  const [roles,              setRoles]              = useState<string[]>([]);
  const [profile,            setProfile]            = useState<UserProfile | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Guards against stale state from unmounted component or concurrent fetches
  const mountedRef  = useRef(true);
  const fetchingRef = useRef<string | null>(null); // userId currently being fetched

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Fetch roles + profile with simple retry on network error ──────────────
  const fetchUserData = async (userId: string): Promise<void> => {
    // Skip if a fetch for this user is already in flight
    if (fetchingRef.current === userId) return;
    fetchingRef.current = userId;

    const attempt = async (tries = 0): Promise<void> => {
      try {
        // ── iOS timeout: race each attempt against 5 seconds ─────────────
        // Without this, hanging Supabase connections on iOS keep authLoading=true
        // for the full 8-second safety timeout, which cascades into every hook
        // that waits on authLoading (useTasjeel, usePaymentAccess) and causes
        // the dashboard to appear blank/stuck for 8+ seconds.
        const withTimeout = <T,>(p: Promise<T>) =>
          Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("auth_timeout")), 5000))]);

        const [rolesRes, profileRes] = await withTimeout(Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", userId),
          supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        ]));
        if (!mountedRef.current || fetchingRef.current !== userId) return;
        if (rolesRes.data)    setRoles(rolesRes.data.map((r) => r.role));
        if (profileRes.data)  setProfile(profileRes.data as UserProfile);
      } catch (err) {
        console.warn("[AuthContext] fetchUserData error (attempt", tries + 1, "):", err);
        if (tries < 2 && mountedRef.current) {
          // Shorter backoff on iOS: 400ms, 800ms
          await new Promise(r => setTimeout(r, 400 * Math.pow(2, tries)));
          return attempt(tries + 1);
        }
      } finally {
        if (mountedRef.current && fetchingRef.current === userId) {
          fetchingRef.current = null;
          setLoading(false);
        }
      }
    };

    await attempt();
  };

  const refreshProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data && mountedRef.current) setProfile(data as UserProfile);
  };

  useEffect(() => {
    // ── Safety timeout — loading must resolve within 8 seconds no matter what ──
    // Prevents users getting permanently stuck on the spinner
    const safetyTimeout = setTimeout(() => {
      if (mountedRef.current) {
        console.warn("[AuthContext] Safety timeout — forcing loading=false");
        setLoading(false);
      }
    }, 8000);

    // ── Single source of truth: onAuthStateChange ─────────────────────────────
    // In Supabase JS v2 this fires immediately (synchronously) with INITIAL_SESSION
    // so we do NOT need getSession() — calling both causes a double-fetch race.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!mountedRef.current) return;

      setSession(sess);
      setUser(sess?.user ?? null);

      const mustChange = sess?.user?.user_metadata?.must_change_password === true;
      setMustChangePassword(mustChange);

      if (sess?.user) {
        setLoading(true);
        fetchUserData(sess.user.id);
      } else {
        // Signed out — clear everything immediately
        fetchingRef.current = null;
        setRoles([]);
        setProfile(null);
        setMustChangePassword(false);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signUp = async (email: string, password: string, fullName: string) =>
    supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/register-continue`,
        data: { full_name: fullName },
      },
    });

  const signIn = async (email: string, password: string) =>
    supabase.auth.signInWithPassword({ email, password });

  const signOut = async () => {
    fetchingRef.current = null;
    await supabase.auth.signOut();
    if (mountedRef.current) {
      setUser(null);
      setSession(null);
      setRoles([]);
      setProfile(null);
      setMustChangePassword(false);
    }
  };

  const hasRole = (role: string) => roles.includes(role);

  return (
    <AuthContext.Provider
      value={{
        user, session, loading, roles, profile, mustChangePassword,
        signUp, signIn, signOut, hasRole, refreshProfile,
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
