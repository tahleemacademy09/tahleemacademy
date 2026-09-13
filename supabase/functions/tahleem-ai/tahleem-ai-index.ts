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

      case "parse_questions": {
        systemPrompt = `You are a question-bank parser for Tahleem Academy, an Islamic learning platform's exam builder.
You will receive raw, messily-pasted exam questions (from Word, PDF, WhatsApp, textbooks, etc — English and/or Arabic, mixed).

Your job:
1. Split the pasted text into individual questions.
2. For each question, detect its type: "mcq" (single correct option), "multi_select" (more than one correct option), "true_false", "short_answer" (no options given, one-line factual answer), or "fill_blank" (contains a blank like ___ or a missing word).
3. Extract the question text. If the question is written in Arabic, put it in question_text_ar and leave question_text as a plain English translation if you can produce one confidently, otherwise leave question_text empty. If written in English, put it in question_text and leave question_text_ar empty unless Arabic text also appears alongside it.
4. Extract every answer option exactly as given, preserving Arabic script where present, into the options array (id: "a","b","c","d"... in order).
5. Determine the correct option(s):
   - If the source text marks the correct answer (e.g. an asterisk, "Answer: B", bold, underline, "✓"), use that.
   - If no answer is marked, use your own subject-matter knowledge (Qur'an, Hadith, Fiqh, Arabic grammar/morphology, Islamic history, general knowledge as applicable) to determine the single most likely correct answer yourself, and select it.
   - Never leave an mcq/multi_select/true_false question with no option marked correct — always make your best determination.
   - For short_answer/fill_blank with no options, put your best-answer text in correct_answer instead.
6. Assign difficulty ("easy"|"medium"|"hard") based on how advanced the question content is.
7. Default points to 1 unless a mark value is given in the source text.

Return ONLY a raw JSON array (no markdown fences, no commentary), where each item has exactly this shape:
{
  "question_type": "mcq" | "multi_select" | "true_false" | "short_answer" | "fill_blank",
  "question_text": string,
  "question_text_ar": string,
  "options": [ { "id": "a", "text": string, "text_ar": string, "is_correct": boolean } ],
  "correct_answer": string,
  "points": number,
  "difficulty": "easy" | "medium" | "hard",
  "explanation": string
}
For true_false questions, options must be exactly [{"id":"true","text":"True","text_ar":"صح","is_correct":bool},{"id":"false","text":"False","text_ar":"خطأ","is_correct":bool}] and correct_answer must be "true" or "false".
For short_answer/fill_blank, options must be an empty array [].
"explanation" should be a one-sentence reason for the correct answer (helpful for the teacher reviewing it) — never leave it blank.`;
        userContent = prompt || context?.rawText || "";
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
        max_tokens: action === "parse_questions" ? 8192 : 4096,
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
          max_tokens: action === "parse_questions" ? 8192 : 4096,
          ...(action === "transcribe" || action === "notify"
            ? { response_format: { type: "json_object" } }
            : {}),
          // Note: parse_questions returns a JSON *array*, not an object, so it
          // deliberately does not use response_format (which requires an object)
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

    if (action === "parse_questions") {
      // Strip accidental ```json fences and any leading/trailing prose, then parse the array.
      const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      try {
        const parsed = JSON.parse(arrayMatch ? arrayMatch[0] : cleaned);
        if (!Array.isArray(parsed)) throw new Error("not an array");
        return new Response(JSON.stringify({ questions: parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("parse_questions: could not parse model output as JSON array:", text);
        return new Response(JSON.stringify({ error: "AI did not return valid question JSON. Try again or simplify the pasted text.", raw: text }), {
          status: 500,
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
