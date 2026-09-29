// Shared by the `prices` and `secrets` Edge Functions: CORS, the caller check,
// and a service-role client (the only thing that may touch `secrets`).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * The secret (service-role) key. Projects on the new API keys get
 * SUPABASE_SECRET_KEYS (JSON, by name); older ones SUPABASE_SERVICE_ROLE_KEY.
 */
function serviceKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys);
      const key = parsed.default ?? Object.values(parsed)[0];
      if (typeof key === 'string' && key) return key;
    } catch {
      // fall through to the legacy variable
    }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!legacy) throw new Error('No secret key in the function environment');
  return legacy;
}

let admin: SupabaseClient | null = null;
/** Service-role client: bypasses RLS. Never expose what it reads. */
export function adminClient(): SupabaseClient {
  admin ??= createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/**
 * The caller must be the signed-in store account (spec 5.3, "Edge Function
 * auth"). Functions are deployed with verify_jwt = false because the new
 * API keys aren't JWTs, so this check is the gate: without it anyone could
 * spend the JustTCG allowance or overwrite the key.
 * @returns null when allowed, or the 401 response to send.
 */
export async function requireStoreSession(req: Request): Promise<Response | null> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return json({ error: 'Not signed in', code: 'UNAUTHORIZED' }, 401);
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data?.user) return json({ error: 'Not signed in', code: 'UNAUTHORIZED' }, 401);
  return null;
}

/** The stored API key for a provider, or null. */
export async function readSecret(provider: string): Promise<string | null> {
  const { data, error } = await adminClient()
    .from('secrets').select('value').eq('provider', provider).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}
