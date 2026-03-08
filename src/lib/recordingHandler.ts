import { supabase } from "@/integrations/supabase/client";

// Function to save a recording
export const saveRecording = async (recording: Record<string, unknown>) => {
    const { data, error } = await supabase
        .from('session_recordings')
        .insert([recording]);
    return { data, error };
};

// Function to retrieve recordings
export const retrieveRecordings = async () => {
    const { data, error } = await supabase
        .from('session_recordings')
        .select('*');
    return { data, error };
};

// Function to list all recordings
export const listRecordings = async () => {
    const { data, error } = await supabase
        .from('session_recordings')
        .select('*');
    return { data, error };
};
