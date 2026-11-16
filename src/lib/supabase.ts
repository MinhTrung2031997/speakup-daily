import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

/** True when the Supabase env vars are present (see README → Environment variables). */
export const supabaseConfigured = !!(url && key);

export const SUPABASE_URL = url || 'http://localhost';

export const supabase = createClient<Database>(SUPABASE_URL, key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

export type DB = Database['public']['Tables'];
