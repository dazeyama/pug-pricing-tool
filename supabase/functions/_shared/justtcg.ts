// JustTCG (spec 5.3), called only from Edge Functions: the browser never sees
// the key. Facts from its docs, checked 2026-09-29 (justtcg.com/docs and
// swagger.json v1.1.0):
// - Base https://api.justtcg.com/v1, header x-api-key.
// - Games: magic-the-gathering, pokemon (Japanese is a *language* inside
//   pokemon now, not a separate "pokemon-japan" game).
// - POST /v1/cards takes up to 100 items on Starter/Pro (200 on Enterprise).
// - Every response carries _metadata: apiPlan, apiRequestLimit,
//   apiRequestsUsed, apiRequestsRemaining, apiDailyLimit,
//   apiDailyRequestsUsed, apiDailyRequestsRemaining, apiRateLimit.
// - Errors are { error, code }: RATE_LIMIT_EXCEEDED (per minute, 429),
//   DAILY_LIMIT_EXCEEDED (resets 00:00 UTC), REQUEST_LIMIT_EXCEEDED (monthly).
import { adminClient } from './supabase.ts';

export const API = 'https://api.justtcg.com/v1';
export const BATCH_MAX = 100;

export class QuotaError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One JustTCG call. Retries 429 (per-minute limit) and 5xx with exponential
 * backoff and jitter, 1s doubling to 30s, honouring Retry-After (their
 * recommended strategy). Daily/monthly exhaustion throws QuotaError.
 */
export async function call(key: string, path: string, init: RequestInit = {}): Promise<any> {
  let wait = 1000;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { 'x-api-key': key, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (body?._metadata) await recordUsage(body._metadata);

    const code = body?.code ?? '';
    if (code === 'DAILY_LIMIT_EXCEEDED' || code === 'REQUEST_LIMIT_EXCEEDED') {
      throw new QuotaError(code, body?.error ?? code);
    }
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : wait + Math.random() * wait * 0.3;
      await sleep(Math.min(delay, 30_000));
      wait = Math.min(wait * 2, 30_000);
      continue;
    }
    if (!res.ok) {
      const err = new Error(body?.error ?? `JustTCG answered ${res.status}`);
      (err as any).status = res.status;
      (err as any).code = code;
      throw err;
    }
    return body;
  }
  throw new Error('JustTCG is not responding');
}

/** Keep the one-row usage table current (spec 6.1 api_usage), for the Settings meter. */
async function recordUsage(m: any) {
  // Only fields JustTCG sent: a partial _metadata mustn't blank the others.
  const row: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };
  const put = (col: string, v: unknown) => {
    if (v !== undefined && v !== null) row[col] = v;
  };
  const used = (limit: any, u: any, remaining: any) =>
    u ?? (limit != null && remaining != null ? limit - remaining : undefined);
  put('plan', m.apiPlan);
  put('daily_limit', m.apiDailyLimit);
  put('daily_used', used(m.apiDailyLimit, m.apiDailyRequestsUsed, m.apiDailyRequestsRemaining));
  put('monthly_limit', m.apiRequestLimit);
  put('monthly_used', used(m.apiRequestLimit, m.apiRequestsUsed, m.apiRequestsRemaining));
  put('rate_limit', m.apiRateLimit);
  const { error } = await adminClient().from('api_usage').upsert(row);
  if (error) console.error('api_usage write failed', error);
}
