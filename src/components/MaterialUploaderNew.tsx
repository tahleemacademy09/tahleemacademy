import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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
      alert("Upload successful");

    } catch (err: any) {
      console.error(err);
      alert(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handleUpload(e.target.files[0]);
          }
        }}
      />
      {uploading && <p>Uploading...</p>}
    </div>
  );
}