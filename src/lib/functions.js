import { supabase } from './supabase.js';
import { withLoading } from './loading.js';

/**
 * Call one of our Edge Functions (`prices`, `secrets`) as the signed-in store.
 * Throws an Error carrying the function's { error, code } on failure, plus
 * the full payload (the prices function returns partial results with some
 * errors). `loading` false keeps the top loading bar still (a long job that
 * shows its own progress, decision 589).
 */
export async function callFunction(name, body, { loading = true } = {}) {
  const invoke = () => supabase.functions.invoke(name, { body });
  const { data, error } = await (loading ? withLoading(invoke) : invoke());
  if (!error) return data;
  let payload = null;
  try {
    payload = await error.context?.json();
  } catch {
    payload = null;
  }
  const e = new Error(payload?.error ?? error.message ?? `${name} failed`);
  e.code = payload?.code ?? null;
  e.status = error.context?.status ?? null;
  e.payload = payload;
  throw e;
}
