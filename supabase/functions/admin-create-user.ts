// supabase/functions/admin-create-user/index.ts
// Creates a new auth user + profile + role using the service role key.
// Returns the generated temporary passcode to the admin.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generatePasscode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)
  let code = "TH-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Verify caller is an authenticated admin using the anon client
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

    // Parse body
    const { email, full_name, full_name_ar, role, level } = await req.json();
    if (!email || !full_name || !role) {
      return new Response(JSON.stringify({ error: "email, full_name and role are required" }), { status: 400, headers: corsHeaders });
    }

    const passcode = generatePasscode();

    // Use service role to create auth user
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password: passcode,
      email_confirm: true,           // skip email verification — admin is creating this
      user_metadata: {
        full_name,
        must_change_password: true,  // force password change on first login
      },
    });

    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: corsHeaders });
    }

    const newUserId = created.user.id;

    // Generate student ID
    const studentId = "TH-" + Date.now().toString().slice(-6);

    // Create profile
    await adminClient.from("profiles").insert({
      user_id:      newUserId,
      full_name,
      full_name_ar: full_name_ar || null,
      level:        level || null,
      course_level: level || null,
      student_id:   studentId,
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    });

    // Assign role
    await adminClient.from("user_roles").insert({ user_id: newUserId, role });

    return new Response(
      JSON.stringify({ success: true, user_id: newUserId, passcode, student_id: studentId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
