import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Unified AI Edge Function for Tahleem Academy
 * Actions: revision | transcribe | notify | chat | generate
 *
 * FIX: corsHeaders was previously defined at MODULE LEVEL using `req.url`,
 * but `req` only exists inside the serve() callback. This caused a
 * ReferenceError on every invocation → "Failed to send a request to the
 * Edge Function". corsHeaders is now computed inside serve() where req is
 * in scope, using the standard HTTP `Origin` request header.
 */

const ALLOWED_ORIGINS = [
  "https://tahleemacademy.vercel.app",
  "http://localhost:5173",
];

serve(async (req) => {
  // Compute CORS headers inside serve() — req is in scope here
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin)
      ? origin
      : "https://tahleemacademy.vercel.app",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, prompt, messages, context, imageData, imageMimeType } = body;

    if (!action) throw new Error("action is required");

    const LOVABLE_API_KEY  = Deno.env.get("LOVABLE_API_KEY");
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    if (!LOVABLE_API_KEY && !ANTHROPIC_API_KEY) {
      throw new Error("No AI provider configured. Set ANTHROPIC_API_KEY or LOVABLE_API_KEY in Supabase secrets.");
    }

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

    let systemPrompt = "";
    let userContent: any = prompt || "";
    let model = "google/gemini-2.5-flash-preview";

    switch (action) {
      case "revision": {
        systemPrompt = `You are an Islamic academic revision assistant for Tahleem Academy students.
You help with:
- Generating flashcards from subject content (text or images)
- Creating quiz questions from materials
- Summarizing lessons and topics
- Explaining difficult concepts in Arabic and English
- Providing study tips based on Islamic pedagogy

When given an image, carefully analyze ALL text, diagrams, tables, and visual information in it.
Always be scholarly, cite Quranic and Hadith references where relevant.
Respond in the same language the student uses. If Arabic, use formal فصحى.
Return ONLY valid JSON when asked for structured output — no markdown fences.`;

        if (imageData && imageMimeType) {
          userContent = [
            {
              type: "image_url",
              image_url: {
                url: `data:${imageMimeType};base64,${imageData}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: prompt || "Analyze this image and generate educational content as requested.",
            },
          ];
          model = "google/gemini-2.5-flash-preview";
        } else {
          userContent = prompt || context?.prompt || "";
        }
        break;
      }

      case "transcribe": {
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
        model = "google/gemini-2.5-flash-preview";
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

    // Build messages array
    let aiMessages: any[];
    if (messages) {
      aiMessages = [{ role: "system", content: systemPrompt }, ...messages];
    } else {
      aiMessages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ];
    }

    // ── Provider selection: Anthropic first, Lovable fallback ─────────
    let responseText = "";

    if (ANTHROPIC_API_KEY) {
      // Anthropic Messages API
      const anthropicBody: any = {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: aiMessages.filter((m: any) => m.role !== "system"),
      };
      if (systemPrompt) anthropicBody.system = systemPrompt;

      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(anthropicBody),
      });

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        console.error("Anthropic error:", anthropicRes.status, errText);
        throw new Error(`Anthropic API error ${anthropicRes.status}`);
      }

      const anthropicData = await anthropicRes.json();
      responseText = anthropicData.content?.[0]?.text || "";

    } else {
      // Lovable AI gateway (OpenAI-compatible)
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: aiMessages,
          stream: false,
          max_tokens: 4096,
          ...(action === "transcribe" || action === "notify"
            ? { response_format: { type: "json_object" } }
            : {}),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Lovable gateway error:", response.status, errText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`AI service error: ${response.status}`);
      }

      const data = await response.json();
      responseText = data.choices?.[0]?.message?.content || "";
    }

    const text = responseText;

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
