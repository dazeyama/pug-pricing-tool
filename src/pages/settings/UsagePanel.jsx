import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useLiveTable } from '../../lib/useLiveTable.js';
import { formatTime, nextUtcMidnight, timeAgo } from '../../lib/time.js';

/** Today / this month with a bar: amber from 80%, red from 95% (spec 11.3). */
function Meter({ label, used, limit }) {
  const pct = used != null && limit ? Math.min(100, (used / limit) * 100) : 0;
  const level = pct >= 95 ? 'red' : pct >= 80 ? 'amber' : '';
  const n = (x) => (x == null ? '?' : Number(x).toLocaleString());
  return (
    <div className="meter">
      <div className="meter-top">
        <span>{label}</span>
        <span className="meter-num">{n(used)} / {n(limit)}</span>
      </div>
      <div className="meter-bar"><i className={level} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

// Settings → JustTCG usage (spec 11.3), live from api_usage, which the
// `prices` and `secrets` functions update after every JustTCG call.
export default function UsagePanel() {
  const { data, loaded } = useLiveTable('api_usage', () =>
    supabase.from('api_usage').select('*').eq('id', 1).maybeSingle());
  // "Updated N minutes ago" and the reset time stay current.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="cardpanel settings-panel">
      <div className="cardpanel-head"><strong>JustTCG usage</strong></div>
      <div className="cardpanel-body">
        {!loaded && <p className="muted-text">Loading…</p>}
        {loaded && !data && (
          <p className="muted-text">No usage recorded yet. It appears after the first price lookup or key test.</p>
        )}
        {data && (
          <>
            <div className="meters">
              <Meter label="Today" used={data.daily_used} limit={data.daily_limit} />
              <Meter label="This month" used={data.monthly_used} limit={data.monthly_limit} />
            </div>
            <p className="hint usage-foot">
              Plan <strong>{data.plan ?? '?'}</strong>
              {data.rate_limit ? ` · ${data.rate_limit} requests a minute` : ''}
              {' · '}daily count resets {formatTime(nextUtcMidnight())} (midnight UTC)
              {' · '}monthly at the start of each billing cycle
              {' · '}updated {timeAgo(data.updated_at)}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
