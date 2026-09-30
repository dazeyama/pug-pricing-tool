import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../state/session.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useToast } from '../../components/Toast.jsx';

// One computer edits a collection at a time (spec 9.6). Opening it tries to
// take the lock; the holder sends a heartbeat every 20s and lets go when it
// leaves (a closed browser's lock goes stale after 60s). Everyone else views
// it and can Take over. A viewer takes the lock by itself once it's free or
// stale, so a crashed computer doesn't need a take-over (checked every 20s
// and at once when the lock is released).

const BEAT_MS = 20_000;

/**
 * @returns {{ status: 'checking'|'held'|'other'|'gone',
 *   holder: { deviceId: string, label: string|null, userId: string|null, since: string }|null,
 *   takeOver: () => Promise<boolean>, recheck: () => Promise<void> }}
 */
export function useCollectionLock(id, { deviceId, userId }) {
  const { session } = useSession();
  const staff = useStaff();
  const toast = useToast();
  const [lock, setLock] = useState({ status: 'checking', holder: null });
  const status = useRef('checking');
  const holderDevice = useRef(null);
  const user = useRef(userId);
  user.current = userId;
  const token = useRef(null);
  token.current = session?.access_token ?? null;
  const names = useRef(staff.byId);
  names.current = staff.byId;

  /** Take the lock if it's free, stale or already ours (or, forced, anyway). */
  const acquire = useCallback(async (force = false) => {
    if (!deviceId) return;
    const { data, error } = await supabase.rpc('lock_acquire', {
      p_buy_id: id, p_device: deviceId, p_user: user.current ?? null, p_force: force,
    });
    if (error) {
      if (error.message?.includes('collection_gone')) {
        status.current = 'gone';
        setLock({ status: 'gone', holder: null });
      } else {
        console.error('lock_acquire failed', error);
      }
      return;
    }
    const was = status.current;
    const next = data.held ? 'held' : 'other';
    const holder = {
      deviceId: data.device_id, label: data.device_label, userId: data.staff_user_id, since: data.acquired_at,
    };
    status.current = next;
    holderDevice.current = holder.deviceId;
    setLock({ status: next, holder });
    if (was === 'held' && next === 'other') {
      const who = names.current(holder.userId)?.name ?? 'Someone';
      toast(`${who} took over editing on ${holder.label ?? 'another computer'}.`, 'err');
    } else if (was === 'other' && next === 'held') {
      toast('You can edit this collection now: the other computer stopped editing.', 'ok');
    }
  }, [id, deviceId, toast]);

  // Open: try to take it.
  useEffect(() => {
    acquire(false);
  }, [acquire]);

  // Every 20s: the holder's heartbeat (false = it isn't ours any more), or a
  // viewer's look for a lock gone free or stale.
  useEffect(() => {
    const beat = async () => {
      if (status.current === 'held') {
        const { data, error } = await supabase.rpc('lock_heartbeat', {
          p_buy_id: id, p_device: deviceId, p_user: user.current ?? null,
        });
        if (!error && data === false) await acquire(false);
      } else if (status.current === 'other') {
        await acquire(false);
      }
    };
    const timer = setInterval(beat, BEAT_MS);
    // A tab coming back to the front checks at once (hidden tabs' timers slow down).
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id, deviceId, acquire]);

  // The picked user changing moves the lock to them (the banner elsewhere names them).
  useEffect(() => {
    if (status.current === 'held') {
      supabase.rpc('lock_heartbeat', { p_buy_id: id, p_device: deviceId, p_user: userId ?? null });
    }
  }, [userId]);

  // Another computer taking over, or the holder letting go: look again.
  useEffect(() => {
    const channel = supabase
      .channel(`lock:${id}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'collection_locks' }, (payload) => {
        if ((payload.new?.buy_id ?? payload.old?.buy_id) !== id) return;
        // Our own heartbeat, or the holder's while we view: nothing to do.
        if (payload.eventType === 'UPDATE' && payload.new?.device_id === holderDevice.current
            && (status.current === 'held' || status.current === 'other')) return;
        acquire(false);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, deviceId, acquire]);

  // Leaving the screen lets go (spec 9.6): in-app navigation through the
  // unmount; a closed tab or browser through a request that outlives the page.
  useEffect(() => {
    const onHide = () => {
      if (status.current !== 'held' || !token.current) return;
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/lock_release`, {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token.current}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_buy_id: id, p_device: deviceId }),
      }).catch(() => {});
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      if (status.current === 'held') {
        status.current = 'released';
        supabase.rpc('lock_release', { p_buy_id: id, p_device: deviceId }).then(({ error }) => {
          if (error) console.error('lock_release failed', error);
        });
      }
    };
  }, [id, deviceId]);

  /** Take over (spec 9.6): the other computer switches to view-only. */
  const takeOver = useCallback(async () => {
    status.current = 'taking';   // no "the other computer stopped editing" toast for this
    await acquire(true);
    return status.current === 'held';
  }, [acquire]);

  return { ...lock, takeOver, recheck: () => acquire(false) };
}
