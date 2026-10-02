import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_ANON_KEY
)?.trim();

export const isSupabaseConfigured: boolean = Boolean(supabaseUrl && supabaseKey);

let supabaseInstance: SupabaseClient | null = null;

if (isSupabaseConfigured && supabaseUrl && supabaseKey) {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    console.log('[Database] Supabase connected');
  } catch (err) {
    console.error('[Database] Failed to initialize Supabase client:', err);
    supabaseInstance = null;
  }
} else {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[Database] CONFIGURATION ERROR: Supabase credentials (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) not found in production environment. Persistent database storage is NOT active.'
    );
  } else {
    console.log('[Database] Supabase credentials not found in env. Operating in memory-buffered development mode.');
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  return supabaseInstance;
}
