/**
 * MaterialUploaderNew.tsx
 * Fixed: imports from correct Supabase client path.
 * This component is kept minimal — the full upload UI is in MaterialManagerPro.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";  // ← fixed path

export default function MaterialUploaderNew({ courseId }: { courseId: string }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    try {
      setUploading(true);
      const filePath = `${courseId}/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from("subject-files")
        .upload(filePath, file);
      if (error) throw error;
      console.log("Upload success:", data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      console.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
      />
      {uploading && <p>Uploading…</p>}
    </div>
  );
}
