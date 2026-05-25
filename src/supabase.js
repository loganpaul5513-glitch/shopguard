import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://myinlzdgkpyhcvjaabon.supabase.co'
const supabaseKey = 'sb_publishable_U1vfOSiTme2AJfG4MO6ndQ_hD1Ujm03'

export const supabase = createClient(supabaseUrl, supabaseKey)