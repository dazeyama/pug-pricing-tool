import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, STORE_LOGIN_EMAIL } from '../lib/supabase.js';
import { withLoading } from '../lib/loading.js';

// The shared store password (spec 4.4). There is one Auth account; the
// password field signs it in, and supabase-js keeps the session in this
// browser so the computer stays signed in.

const SessionContext = createContext(null);

/** Turn a supabase-js auth error into something to show under the field. */
function describeAuthError(error) {
  if (error.code === 'invalid_credentials' || error.message === 'Invalid login credentials') {
    return 'Wrong password.';
  }
  if (error.code === 'email_not_confirmed') {
    return 'The store account is not confirmed yet. Confirm it in the Supabase dashboard.';
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
    return "Couldn't reach the server. Check the connection and try again.";
  }
  return error.message || 'Sign-in failed.';
}

export function SessionProvider({ children }) {
  // undefined while the stored session is being read; then a session or null.
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  /** @returns {Promise<string|null>} an error message, or null on success */
  async function signIn(password) {
    const { error } = await withLoading(() =>
      supabase.auth.signInWithPassword({ email: STORE_LOGIN_EMAIL, password }));
    return error ? describeAuthError(error) : null;
  }

  async function signOut() {
    await withLoading(() => supabase.auth.signOut());
  }

  return (
    <SessionContext.Provider value={{ session, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
