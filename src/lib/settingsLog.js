// A Settings change made outside settings_save, written to the Changelog by the database
// (decision 412; the Changelog is the database's own, decision 378): a JustTCG key saved or
// removed (never the key itself), a remembered Crystal Commerce match forgotten.
import { supabase } from './supabase.js';

/**
 * @param {'justtcg_key_saved'|'justtcg_key_removed'|'cc_match_forgotten'} action
 * @param {string} summary  what happened, in a sentence
 * @param {string} userId  the picked staff user
 * @param {string|null} deviceId
 * @returns {Promise<void>}  a failure is only logged: the change itself is done
 */
export async function logSetting(action, summary, userId, deviceId) {
  const { error } = await supabase.rpc('settings_log', {
    p_user: userId, p_device: deviceId ?? null, p_action: action, p_summary: summary,
  });
  if (error) console.error(`Writing the Changelog entry for ${action} failed`, error);
}
