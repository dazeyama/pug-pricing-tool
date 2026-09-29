// `secrets` Edge Function (spec 4.5, 11.2): set, delete, show masked and test
// API keys. Keys live in the `secrets` table, which RLS closes to every
// client; only this function and `prices` (service role) read it. The full
// key never goes back to the browser.
//
// POST { action: 'status' }                          → { keys: [{ provider, masked, updatedAt }] }
// POST { action: 'set', provider, value }            → { ok: true }
// POST { action: 'delete', provider }                → { ok: true }
// POST { action: 'test', provider }                  → { ok, plan, daily…, monthly… } | { ok: false, error }
import { adminClient, corsHeaders, json, readSecret, requireStoreSession } from '../_shared/supabase.ts';
import { call, QuotaError } from '../_shared/justtcg.ts';

const PROVIDERS = ['justtcg'];

/** "tcg_4f…a325" → "tcg_••••••••a325": enough to recognise, not enough to use. */
function mask(value: string): string {
  const prefix = value.includes('_') ? value.slice(0, value.indexOf('_') + 1) : '';
  return `${prefix}••••••••${value.slice(-4)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const denied = await requireStoreSession(req);
  if (denied) return denied;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body', code: 'BAD_REQUEST' }, 400);
  }
  const { action, provider, value } = body ?? {};
  const db = adminClient();

  try {
    if (action === 'status') {
      const { data, error } = await db.from('secrets').select('provider, value, updated_at');
      if (error) throw error;
      return json({
        keys: (data ?? []).map((r) => ({ provider: r.provider, masked: mask(r.value), updatedAt: r.updated_at })),
      });
    }

    if (!PROVIDERS.includes(provider)) {
      return json({ error: `Unknown provider: ${provider}`, code: 'BAD_REQUEST' }, 400);
    }

    if (action === 'set') {
      const clean = String(value ?? '').trim();
      if (clean.length < 8) return json({ error: 'That doesn’t look like an API key.', code: 'BAD_REQUEST' }, 400);
      const { error } = await db.from('secrets')
        .upsert({ provider, value: clean, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'delete') {
      const { error } = await db.from('secrets').delete().eq('provider', provider);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'test') {
      const key = await readSecret(provider);
      if (!key) return json({ ok: false, error: 'No key saved.' });
      try {
        // /games is the cheapest call: one request, and _metadata comes with it.
        const res = await call(key, '/games');
        const m = res?._metadata ?? {};
        return json({
          ok: true,
          plan: m.apiPlan ?? null,
          dailyUsed: m.apiDailyRequestsUsed ?? null,
          dailyLimit: m.apiDailyLimit ?? null,
          dailyRemaining: m.apiDailyRequestsRemaining ?? null,
          monthlyUsed: m.apiRequestsUsed ?? null,
          monthlyLimit: m.apiRequestLimit ?? null,
          monthlyRemaining: m.apiRequestsRemaining ?? null,
          games: (res?.data ?? []).map((g: any) => g.id),
        });
      } catch (e) {
        if (e instanceof QuotaError) return json({ ok: false, error: e.message, code: e.code });
        return json({ ok: false, error: (e as Error).message, code: (e as any).code ?? null });
      }
    }

    return json({ error: `Unknown action: ${action}`, code: 'BAD_REQUEST' }, 400);
  } catch (e) {
    console.error('secrets failed', e);
    return json({ error: 'Something went wrong on the server.', code: 'SERVER_ERROR' }, 500);
  }
});
