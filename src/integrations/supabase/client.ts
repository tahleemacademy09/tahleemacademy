import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://wvqeubhupkddtkcdwqcm.supabase.co"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92Z3NsZWF5YW5uc3hpZmhpcmF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjY2NzAsImV4cCI6MjA4ODQ0MjY3MH0.LLmRl7Xk72IiAiOs7eA_aQqyt0Cp5w7q5UHmG8rwjLY"

export const supabase = createClient(supabaseUrl, supabaseKey)
