// src/integrations/lovable/index.ts
//
// FIX: @lovable.dev/cloud-auth-js@0.0.3 contains Deno runtime code (Deno.serve,
// Deno.env, etc.) that crashes in the browser with "Deno is not defined".
// That package is no longer used — Google OAuth now goes through
// supabase.auth.signInWithOAuth() directly inside AuthContext.tsx.
//
// This file is kept as an empty stub so any stale import paths don't break
// the build, but it no longer pulls in any Deno-contaminated dependency.

export const lovable = {
  auth: {
    // No-op stub — this function should never be called.
    // Google sign-in is handled by signInWithGoogle() in AuthContext.tsx.
    signInWithOAuth: async (_provider: string, _opts?: unknown) => {
      console.warn("[lovable] signInWithOAuth is deprecated. Use signInWithGoogle() from AuthContext instead.");
      return { error: new Error("Use signInWithGoogle() from AuthContext instead.") };
    },
  },
};
