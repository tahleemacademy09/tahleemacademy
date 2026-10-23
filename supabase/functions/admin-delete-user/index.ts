// supabase/functions/admin-delete-user/index.ts
// Permanently deletes an auth user using the service role key.
// auth.admin.deleteUser() triggers ON DELETE CASCADE on all FK-linked tables
// (profiles, user_roles, enrollments, exam_attempts, hifdh_progress, etc.)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Verify caller is an authenticated admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: { user: caller }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    // Check caller is admin
    const { data: callerRole } = await anonClient.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!callerRole) return new Response(JSON.stringify({ error: "Forbidden: admins only" }), { status: 403, headers: corsHeaders });

    const { target_user_id } = await req.json();
    if (!target_user_id) return new Response(JSON.stringify({ error: "target_user_id required" }), { status: 400, headers: corsHeaders });

    // Safety: cannot delete yourself
    if (target_user_id === caller.id) {
      return new Response(JSON.stringify({ error: "You cannot delete your own account" }), { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Delete auth user — CASCADE handles all related rows automatically
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(target_user_id);

    if (deleteErr) {
      return new Response(JSON.stringify({ error: deleteErr.message }), { status: 400, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
