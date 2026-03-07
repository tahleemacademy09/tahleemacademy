import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = 'https://your_supabase_url'; // replace with your Supabase URL
const supabaseKey = 'your_supabase_key'; // replace with your Supabase Key
const supabase = createClient(supabaseUrl, supabaseKey);

// Function to save a recording
export const saveRecording = async (recording) => {
    const { data, error } = await supabase
        .from('recordings')
        .insert([recording]);
    return { data, error };
};

// Function to retrieve recordings
export const retrieveRecordings = async () => {
    const { data, error } = await supabase
        .from('recordings')
        .select('*');
    return { data, error };
};

// Function to list all recordings
export const listRecordings = async () => {
    const { data, error } = await supabase
        .from('recordings')
        .select('*');
    return { data, error };
};
