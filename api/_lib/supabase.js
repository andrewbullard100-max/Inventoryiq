import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client using the SERVICE ROLE key.
// This key bypasses Row Level Security -- it must only ever be read from
// process.env on the server (Vercel serverless function), and must NEVER
// be sent to or bundled into the frontend.
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase env vars are not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export { getSupabaseAdmin };
