import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://wvqeubhupkddtkcdwqcm.supabase.co"
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_cft5dMcRs_6dy0Gzse1HIw_5LrgvnhA"

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
