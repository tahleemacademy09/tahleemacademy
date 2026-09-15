import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Unified AI Edge Function for Tahleem Academy
 * Actions: revision | transcribe | notify | chat | generate |
 *          parse_questions | generate_questions | fix_questions
 */

const ALLOWED_ORIGINS = [
  "https://tahleemacademy.vercel.app",
  "http://localhost:5173",
];

// Shared question-type reference used by parse_questions, generate_questions,
// and fix_questions so all three AI actions understand every question type
// the exam editor supports and emit exactly the fields each type needs.
const QUESTION_TYPE_GUIDE = `
QUESTION TYPES the exam editor supports — pick the correct "question_type" for each question and populate ONLY the fields relevant to it:

- "mcq" — single correct option. Fill "options" (4 items, one is_correct: true).
- "multi_select" — more than one correct option. Fill "options" with 2+ marked is_correct: true.
- "true_false" — options must be exactly [{"id":"true","text":"True","text_ar":"صح","is_correct":bool},{"id":"false","text":"False","text_ar":"خطأ","is_correct":bool}]; correct_answer is "true" or "false".
- "image_mcq" — same shape as "mcq" (options with is_correct). Leave each option's image_url out — the teacher adds images after.
- "comprehension" — same shape as "mcq", and also fill "reading_passage" (EN) and "reading_passage_ar" (AR) with the passage the question refers to.
- "short_answer" — no options ([]). Put the best one-line answer in "correct_answer". Also fill "accepted_answers" (array of other acceptable phrasings/synonyms) when there's more than one reasonable wording.
- "fill_blank" — no options ([]). The question_text must contain a blank (___). "correct_answer" is the missing word/phrase; fill "accepted_answers" with acceptable variants if relevant.
- "essay" — no options ([]). Leave "correct_answer" empty (essays are manually graded); instead use "explanation" to describe what a strong answer should cover. Set "min_words"/"max_words" if a length is implied or requested, else 0.
- "audio" — a spoken-response or dictation question (e.g. "recite this ayah", "listen and repeat", "read this passage aloud"). No options ([]). Set "audio_response_type" to "audio" (student responds by recording) or "text" (student types what they hear) based on what's being asked. Put any reference text/answer in "correct_answer".
- "dictation" — same as "audio" but specifically listen-and-write: set "audio_response_type": "text", "correct_answer" is the exact text dictated.
- "matching" — no options. Fill "matching_pairs": [{"left": string, "right": string}, ...] (at least 3 pairs) with left/right items that correctly correspond in both English and, mirrored, in Arabic when the source/topic is Arabic — put one language's pairs in "matching_pairs" and note the other language only if explicitly asked.
- "ordering" — no options. Fill "ordering_items": array of strings IN THE CORRECT ORDER (the editor shuffles them for the student).
- "drawing" — no options, no correct_answer (manually graded). Use "explanation" to describe what should be drawn/labelled.

ALWAYS include every field in the JSON shape below for every question, using empty string / empty array / 0 / false for anything not applicable to that question's type — never omit a key.`;

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
    const { action, prompt, messages, context, imageData, imageMimeType, instructions } = body;

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
2. Detect each question's type using the guide below.
3. ALWAYS fill in BOTH question_text (English) AND question_text_ar (Arabic) for every question, and do the same for every option's text/text_ar. Whichever language the source is written in, translate it into the other language yourself using your own knowledge — do not leave either field empty just because the source only gave one language. Only leave a field empty if the content is untranslatable (e.g. a proper noun or Qur'anic ayah that should stay in Arabic script — in that case still provide a transliteration or gloss in the other field rather than leaving it blank).
4. Extract every answer option exactly as given, preserving Arabic script where present, into the options array (id: "a","b","c","d"... in order), translated per rule 3.
5. Determine the correct option(s):
   - If the source text marks the correct answer (e.g. an asterisk, "Answer: B", bold, underline, "✓"), use that.
   - If no answer is marked, use your own subject-matter knowledge (Qur'an, Hadith, Fiqh, Arabic grammar/morphology, Islamic history, general knowledge as applicable) to determine the single most likely correct answer yourself, and select it.
   - Never leave a question type that has options with none marked correct — always make your best determination.
6. Assign difficulty ("easy"|"medium"|"hard") based on how advanced the question content is.
7. Default points to 1 unless a mark value is given in the source text for that specific question, or the teacher's instructions below set a points rule.
${QUESTION_TYPE_GUIDE}

Return ONLY a raw JSON array (no markdown fences, no commentary), where each item has exactly this shape:
{
  "question_type": "mcq" | "multi_select" | "true_false" | "short_answer" | "fill_blank" | "essay" | "image_mcq" | "comprehension" | "audio" | "dictation" | "matching" | "ordering" | "drawing",
  "question_text": string,
  "question_text_ar": string,
  "instruction_text": string,
  "instruction_text_ar": string,
  "reading_passage": string,
  "reading_passage_ar": string,
  "options": [ { "id": "a", "text": string, "text_ar": string, "is_correct": boolean } ],
  "correct_answer": string,
  "accepted_answers": string[],
  "matching_pairs": [ { "left": string, "right": string } ],
  "ordering_items": string[],
  "audio_response_type": "text" | "audio",
  "min_words": number,
  "max_words": number,
  "points": number,
  "difficulty": "easy" | "medium" | "hard",
  "explanation": string
}
"explanation" should be a one-sentence reason for the correct answer (helpful for the teacher reviewing it) — never leave it blank.${
          instructions ? `\n\nTHE TEACHER ALSO GAVE THESE INSTRUCTIONS — follow them exactly, they override any default above where they conflict:\n"""${instructions}"""` : ""
        }`;
        userContent = prompt || context?.rawText || "";
        break;
      }

      case "generate_questions": {
        systemPrompt = `You are a question-writer for Tahleem Academy, an Islamic learning platform's exam builder.
The teacher will describe, in plain language, what brand-new exam questions they want (topic, count, question type, difficulty, level). You write original questions from your own subject-matter knowledge (Qur'an, Hadith, Fiqh, Arabic grammar/morphology, Islamic history, Tajweed, general Islamic-studies curriculum as applicable) — there is no source text to parse.

Your job:
1. Follow the teacher's description as closely as possible: exact question count, type(s), topic, difficulty, and level if given. If something isn't specified, use sensible defaults (mcq, medium difficulty).
2. ALWAYS write BOTH question_text (English) AND question_text_ar (Arabic) for every question, and the same for every option's text/text_ar — never leave either language blank.
3. Write plausible distractor options and mark the correct one(s) yourself for any type that has options — never leave a question with no correct option marked.
4. Assign difficulty ("easy"|"medium"|"hard") per question, matching what the teacher asked for if given.
5. Default points to 1 per question unless the teacher's description or instructions below specify otherwise.
${QUESTION_TYPE_GUIDE}

Return ONLY a raw JSON array (no markdown fences, no commentary), where each item has exactly this shape:
{
  "question_type": "mcq" | "multi_select" | "true_false" | "short_answer" | "fill_blank" | "essay" | "image_mcq" | "comprehension" | "audio" | "dictation" | "matching" | "ordering" | "drawing",
  "question_text": string,
  "question_text_ar": string,
  "instruction_text": string,
  "instruction_text_ar": string,
  "reading_passage": string,
  "reading_passage_ar": string,
  "options": [ { "id": "a", "text": string, "text_ar": string, "is_correct": boolean } ],
  "correct_answer": string,
  "accepted_answers": string[],
  "matching_pairs": [ { "left": string, "right": string } ],
  "ordering_items": string[],
  "audio_response_type": "text" | "audio",
  "min_words": number,
  "max_words": number,
  "points": number,
  "difficulty": "easy" | "medium" | "hard",
  "explanation": string
}
"explanation" should be a one-sentence reason for the correct answer — never leave it blank.${
          instructions ? `\n\nADDITIONAL INSTRUCTIONS — follow them exactly, they override any default above where they conflict:\n"""${instructions}"""` : ""
        }`;
        userContent = prompt || context?.rawText || "";
        break;
      }

      case "fix_questions": {
        systemPrompt = `You are editing a small batch of already-added exam questions for Tahleem Academy's exam builder, based on the teacher's plain-language instructions.

You will receive a JSON array of existing questions (context.questions) and the teacher's instructions (context.instructions) describing what to change — e.g. "question 3's correct answer should be B", "reword these to be clearer", "make these harder", "convert these to fill-in-the-blank".

Your job:
1. Return EXACTLY the same number of questions, in the SAME ORDER as they were given — one output item per input item, even if an instruction only applies to some of them (leave the untouched ones as-is, just re-emit them unchanged).
2. Apply the teacher's instructions precisely. Only change what they asked to change; preserve everything else about each question.
3. If an instruction changes a question's type (e.g. "make this fill-in-the-blank instead"), reshape ALL of its fields to match that type correctly per the guide below — don't leave stale fields (e.g. old options) from the previous type.
4. Keep both question_text and question_text_ar in sync — if you edit one language, update the other to match.
${QUESTION_TYPE_GUIDE}

Return ONLY a raw JSON array (no markdown fences, no commentary) of the edited questions, each with exactly this shape:
{
  "question_type": "mcq" | "multi_select" | "true_false" | "short_answer" | "fill_blank" | "essay" | "image_mcq" | "comprehension" | "audio" | "dictation" | "matching" | "ordering" | "drawing",
  "question_text": string,
  "question_text_ar": string,
  "instruction_text": string,
  "instruction_text_ar": string,
  "reading_passage": string,
  "reading_passage_ar": string,
  "options": [ { "id": "a", "text": string, "text_ar": string, "is_correct": boolean } ],
  "correct_answer": string,
  "accepted_answers": string[],
  "matching_pairs": [ { "left": string, "right": string } ],
  "ordering_items": string[],
  "audio_response_type": "text" | "audio",
  "min_words": number,
  "max_words": number,
  "points": number,
  "difficulty": "easy" | "medium" | "hard",
  "explanation": string
}
THE TEACHER'S INSTRUCTIONS — follow them exactly:
"""${instructions || prompt || ""}"""`;
        userContent = JSON.stringify(context?.questions || []);
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
        max_tokens: (action === "parse_questions" || action === "generate_questions" || action === "fix_questions") ? 8192 : 4096,
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
          max_tokens: (action === "parse_questions" || action === "generate_questions" || action === "fix_questions") ? 8192 : 4096,
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

    if (action === "parse_questions" || action === "generate_questions" || action === "fix_questions") {
      const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      try {
        const parsed = JSON.parse(arrayMatch ? arrayMatch[0] : cleaned);
        if (!Array.isArray(parsed)) throw new Error("not an array");
        return new Response(JSON.stringify({ questions: parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error(`${action}: could not parse model output as JSON array:`, text);
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
