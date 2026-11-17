import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isInlineLessonRow, inlineLessonHtml } from "./lessonBuilder";

/* For a lesson stored in the database: gives the built page (srcDoc). Uses mat.content when it is there,
   otherwise (live-class broadcast) loads it by id. Does nothing for ordinary file materials. */
export function useInlineLesson(mat: any): { isInline: boolean; html: string | null; err: boolean } {
  const isInline = isInlineLessonRow(mat);
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const id: string | undefined = mat?.id;
  const content: string | null | undefined = mat?.content;

  useEffect(() => {
    if (!isInline) { setHtml(null); setErr(false); return; }
    let off = false;
    setErr(false);
    if (typeof content === "string" && content) {
      const h = inlineLessonHtml(content);
      setHtml(h); setErr(!h);
      return;
    }
    setHtml(null);
    if (!id) { setErr(true); return; }
    (supabase.from("subject_materials" as any) as any).select("content").eq("id", id).maybeSingle()
      .then(({ data }: any) => {
        if (off) return;
        const h = inlineLessonHtml(data?.content || "");
        setHtml(h); setErr(!h);
      });
    return () => { off = true; };
  }, [isInline, id, content]);

  return { isInline, html, err };
}
