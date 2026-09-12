import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://myinlzdgkpyhcvjaabon.supabase.co'
const supabaseKey = 'sb_publishable_U1vfOSiTme2AJfG4MO6ndQ_hD1Ujm03'

let currentCompanyId = null

export function setSupabaseCompanyId(companyId) {
  currentCompanyId = companyId ? String(companyId) : null
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (url, options = {}) => {
      const headers = new Headers(options.headers || {})
      if (currentCompanyId) {
        headers.set('x-company-id', currentCompanyId)
      }
      return fetch(url, { ...options, headers })
    },
  },
})
