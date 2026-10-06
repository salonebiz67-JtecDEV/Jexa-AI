import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_ANON_KEY
)?.trim();

export const isSupabaseConfigured: boolean = Boolean(supabaseUrl && supabaseKey);
export const hasServiceRoleKey: boolean = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

let supabaseInstance: SupabaseClient | null = null;

if (isSupabaseConfigured && supabaseUrl && supabaseKey) {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    console.log(`[Database] Supabase client initialized (Key mode: ${hasServiceRoleKey ? 'service_role' : 'anon/standard'})`);
  } catch (err) {
    console.error('[Database] Failed to initialize Supabase client:', err);
    supabaseInstance = null;
  }
} else {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[Database] CONFIGURATION NOTICE: Supabase credentials (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) not found in environment. Database persistence will operate in in-memory fallback mode.'
    );
  } else {
    console.log('[Database] Operating in memory-buffered development mode (SUPABASE_URL not configured).');
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  return supabaseInstance;
}

export function setSupabaseClientForTesting(client: SupabaseClient | null): void {
  supabaseInstance = client;
}

export async function testSupabasePing(): Promise<{ connected: boolean; latencyMs?: number; error?: string }> {
  if (!supabaseInstance) {
    return {
      connected: false,
      error: 'Supabase client is not initialized (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).',
    };
  }

  const start = Date.now();
  try {
    const { error } = await supabaseInstance.from('conversations').select('id').limit(1);
    const latencyMs = Date.now() - start;

    if (error) {
      // Check if it's table-not-found vs connection/auth error
      if (error.code === '42P01') {
        // Table doesn't exist yet, but connection to database is live
        return { connected: true, latencyMs, error: 'Database reached, but conversations table is missing. Run schema.sql.' };
      }
      return { connected: false, latencyMs, error: error.message };
    }

    return { connected: true, latencyMs };
  } catch (err: any) {
    return { connected: false, error: err.message || 'Network error reaching Supabase endpoint' };
  }
}
