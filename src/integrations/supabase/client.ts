import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://wvqeubhupkddtkcdwqcm.supabase.co"
const supabaseKey = "sb_publishable_cft5dMcRs_6dy0Gzse1HIw_5LrgvnhA"

export const supabase = createClient(supabaseUrl, supabaseKey)
