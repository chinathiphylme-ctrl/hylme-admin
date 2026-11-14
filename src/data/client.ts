import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
    // the follow-up tabs need a signed-in staff member, so the session is kept across reloads;
    // every other tab reads public aggregates and works the same signed in or not
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'hylme-admin-auth' } })
  }
  return client
}
