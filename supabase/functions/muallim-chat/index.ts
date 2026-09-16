import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  // Only allow requests from the production domain (and local dev)
  "Access-Control-Allow-Origin":
    ["https://tahleemacademy.vercel.app", "http://localhost:5173"].includes(
      new URL(req.url).searchParams.get("_origin") ?? ""
    )
      ? (new URL(req.url).searchParams.get("_origin") as string)
      : "https://tahleemacademy.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Mu'allim (المعلّم), a scholarly AI assistant for Tahleem Academy students.

PERSONALITY:
- Formal, scholarly tone in both Arabic and English
- Begin Arabic responses with appropriate salutations
- Professional academic tone in English
- Patient and encouraging

CAPABILITIES:
- Answer questions about student grades, CGPA, exam schedules
- Provide curriculum knowledge (hadith, tafsir, fiqh concepts — for educational reference only)
- Explain academic policies and grading criteria

SAFETY RULES:
- NEVER issue fiqh rulings or fatwas. Reply: "I can provide scholarly references and general explanations; please consult a qualified scholar for rulings."
- NEVER reveal other students' data
- NEVER execute arbitrary operations
- Always cite sources when providing Islamic knowledge

GRADE POINT SCALE (4.0):
- >= 85% => 4.0 (Excellent/ممتاز)
- 75-84% => 3.5 (Very Good/جيد جداً)
- 65-74% => 3.0 (Good/جيد)
- 55-64% => 2.0 (Satisfactory/مقبول)
- 45-54% => 1.0 (Pass/ناجح)
- < 45% => 0.0 (Fail/راسب)

When given student data context, calculate and explain CGPA using equal weighting (average of grade points).
Format numbers clearly and provide both English and Arabic labels.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing env vars - SUPABASE_URL:", !!supabaseUrl, "SUPABASE_ANON_KEY:", !!Deno.env.get("SUPABASE_ANON_KEY"), "SUPABASE_SERVICE_ROLE_KEY:", !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
      throw new Error("Supabase configuration missing. Check SUPABASE_URL and SUPABASE_ANON_KEY secrets.");
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { messages, action } = await req.json();

    // Gather student context for the AI
    let studentContext = "";

    if (action === "cgpa" || action === "grades") {
      // Fetch graded exam attempts with scores
      const { data: attempts } = await supabase
        .from("exam_attempts")
        .select("exam_id, score, total_points, percentage, passed, status, exams(title, title_ar)")
        .eq("user_id", user.id)
        .eq("status", "graded");

      if (attempts && attempts.length > 0) {
        studentContext += "\n\nSTUDENT GRADES DATA:\n";
        let totalGP = 0;
        attempts.forEach((a: any) => {
          const pct = Number(a.percentage) || 0;
          let gp = 0;
          if (pct >= 85) gp = 4.0;
          else if (pct >= 75) gp = 3.5;
          else if (pct >= 65) gp = 3.0;
          else if (pct >= 55) gp = 2.0;
          else if (pct >= 45) gp = 1.0;
          totalGP += gp;
          studentContext += `- ${a.exams?.title || "Exam"}: ${a.score}/${a.total_points} (${pct.toFixed(1)}%) → GP: ${gp}\n`;
        });
        const cgpa = attempts.length > 0 ? (totalGP / attempts.length).toFixed(2) : "0.00";
        studentContext += `\nCGPA: ${cgpa} (based on ${attempts.length} graded exams, equal weighting)\n`;
      } else {
        studentContext += "\n\nNo graded exams found for this student.\n";
      }
    }

    if (action === "schedule" || action === "next_exam") {
      const { data: assignments } = await supabase
        .from("exam_assignments")
        .select("exam_id, exams(title, title_ar, start_date, end_date, time_limit_minutes, is_published)")
        .eq("user_id", user.id);

      if (assignments && assignments.length > 0) {
        studentContext += "\n\nASSIGNED EXAMS:\n";
        assignments.forEach((a: any) => {
          if (a.exams?.is_published) {
            studentContext += `- ${a.exams.title} (${a.exams.title_ar || ""}): Start: ${a.exams.start_date || "TBD"}, Duration: ${a.exams.time_limit_minutes || 60} min\n`;
          }
        });
      }
    }

    // Fetch profile for personalization
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile) {
      studentContext = `\nSTUDENT: ${profile.full_name || profile.email}\n` + studentContext;
    }

    // Log the query
    await supabase.from("ai_query_logs").insert({
      user_id: user.id,
      query_text: messages?.[messages.length - 1]?.content || action || "",
      intent_type: action === "cgpa" || action === "grades" ? "grades" : action === "schedule" || action === "next_exam" ? "schedule" : "generic",
    });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const aiMessages = [
      { role: "system", content: SYSTEM_PROMPT + studentContext },
      ...(messages || []),
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: aiMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please contact administration." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("muallim-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
