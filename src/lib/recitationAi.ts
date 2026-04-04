import { supabase } from "@/integrations/supabase/client";

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.split(",")[1];

      if (!base64) {
        reject(new Error("Failed to encode audio"));
        return;
      }

      resolve(base64);
    };

    reader.onerror = () => reject(reader.error ?? new Error("Failed to read audio"));
    reader.readAsDataURL(blob);
  });

export const transcribeRecitationAudio = async (blob: Blob) => {
  const audio = await blobToBase64(blob);
  const mimeType = blob.type || "audio/webm";

  const { data, error } = await supabase.functions.invoke("transcribe-hifdh", {
    body: { audio, mimeType },
  });

  if (error) {
    throw new Error(error.message || "Recitation transcription failed");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return typeof data?.transcript === "string" ? data.transcript.trim() : "";
};