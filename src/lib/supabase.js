import { createClient } from '@supabase/supabase-js';

// URL and publishable key come from .env.development (npm run dev) or
// .env.production / GitHub Actions variables (the Pages build). The
// publishable key is public by design; Row Level Security protects the data.
// The secret key (sb_secret_…) never belongs in the front end.
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** The one Auth account the store signs in as (spec 4.4). Not secret. */
export const STORE_LOGIN_EMAIL = import.meta.env.VITE_STORE_LOGIN_EMAIL;

/** Names of any required settings missing from the build, for the setup screen. */
export const missingConfig = [
  ['VITE_SUPABASE_URL', url],
  ['VITE_SUPABASE_PUBLISHABLE_KEY', publishableKey],
  ['VITE_STORE_LOGIN_EMAIL', STORE_LOGIN_EMAIL],
].filter(([, value]) => !value).map(([name]) => name);

export const supabase = missingConfig.length
  ? null
  : createClient(url, publishableKey, {
      auth: {
        persistSession: true,       // a device stays signed in across restarts
        autoRefreshToken: true,
        // Routes live in the URL hash (#/price). Nothing here signs in by link,
        // so never try to read a session out of it.
        detectSessionInUrl: false,
      },
    });
