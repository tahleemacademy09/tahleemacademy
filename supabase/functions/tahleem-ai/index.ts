import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Unified AI Edge Function for Tahleem Academy
 * Handles: revision AI, transcription comparison, notifications AI, general prompts
 *
 * Actions:
 *  - "revision"       → AI-powered revision assistance (flashcards, summaries, quiz generation)
 *  - "transcribe"     → Compare recitation audio transcription with Quran text
 *  - "notify"         → Generate notification text via AI
 *  - "chat"           → General AI chat (Mu'allim style)
 *  - "generate"       → Generic prompt completion
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, prompt, messages, context } = body;

    if (!action) throw new Error("action is required (revision|transcribe|notify|chat|generate)");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Optional auth for user-specific actions
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id || null;
    }

    // Build system prompt based on action
    let systemPrompt = "";
    let userContent = prompt || "";
    let model = "google/gemini-3-flash-preview";
    let stream = false;

    switch (action) {
      case "revision": {
        systemPrompt = `You are an Islamic academic revision assistant for Tahleem Academy students.
You help with:
- Generating flashcards from subject content
- Creating quiz questions from materials
- Summarizing lessons and topics
- Explaining difficult concepts in Arabic and English
- Providing study tips based on Islamic pedagogy

Always be scholarly, cite Quranic and Hadith references where relevant.
Respond in the same language the student uses. If Arabic, use formal فصحى.`;
        userContent = prompt || context?.prompt || "";
        break;
      }

      case "transcribe": {
        // Compare student recitation with expected Quran text
        systemPrompt = `You are a Quran recitation evaluator. You will receive:
1. The expected Arabic Quran text (ayahs)
2. A transcription of the student's recitation

Your task:
- Compare word by word
- Count correct words vs incorrect/missing words
- Identify tajweed errors if obvious from text
- Return a JSON object with: { "correct": number, "wrong": number, "total": number, "accuracy": number, "errors": [{"word": "...", "expected": "...", "position": number}], "passed": boolean, "feedback_ar": "...", "feedback_en": "..." }
- "passed" is true if accuracy >= 80%
- Always respond with valid JSON only, no markdown`;
        model = "google/gemini-2.5-flash";
        userContent = JSON.stringify({
          expected_text: context?.expected_text || "",
          student_transcription: context?.transcription || prompt || "",
          surah: context?.surah || "",
          ayah_range: context?.ayah_range || "",
        });
        break;
      }

      case "notify": {
        systemPrompt = `You are a notification text generator for Tahleem Academy, an Islamic learning platform.
Generate concise, clear notification messages in both English and Arabic.
Return JSON: { "title_en": "...", "title_ar": "...", "body_en": "...", "body_ar": "..." }
Keep titles under 50 chars, body under 150 chars. Use Islamic greetings where appropriate.
Only respond with valid JSON.`;
        userContent = prompt || "";
        break;
      }

      case "chat": {
        stream = true;
        systemPrompt = `You are Mu'allim (المعلّم), a scholarly AI assistant for Tahleem Academy.
Be formal, scholarly in both Arabic and English. Patient and encouraging.
Answer questions about Islamic studies, provide curriculum knowledge.
NEVER issue fatwas. Always cite sources for Islamic knowledge.
${context?.studentContext || ""}`;
        break;
      }

      case "generate":
      default: {
        systemPrompt = context?.systemPrompt || "You are a helpful assistant for Tahleem Academy, an Islamic learning platform.";
        userContent = prompt || "";
        break;
      }
    }

    const aiMessages = messages
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: aiMessages,
        stream,
        ...(action === "transcribe" || action === "notify"
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI service error: ${response.status}`);
    }

    if (stream) {
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    // For transcribe/notify actions, parse JSON
    if (action === "transcribe" || action === "notify") {
      try {
        const parsed = JSON.parse(text);
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ text, raw: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("tahleem-ai error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
