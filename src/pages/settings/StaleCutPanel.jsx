import { useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useSettingField } from './useSettingField.js';
import { STALE_EMOJI, adjustRate, staleFrom } from '../../lib/ownedRates.js';

const VALID_PCT = /^\d{1,3}(\.\d{1,2})?$/;

// Settings → Stale cards (owner, 2026-11-10; decision 580): the stale cut, one percentage, beside the stale cards
// file's panel. The owner: "another panel besides it, that allows us to set base multipliers like -10% or -20% to
// stale cards". It's off the card's rate, as Copies we own's cut is, and on top of it: the copies cut's "at most"
// limits that cut alone ("Have them be separate."). Saved like every setting, live on every computer, in the
// Changelog.
export default function StaleCutPanel() {
  const { values, save } = useSettings();
  const { current } = useStaff();
  const cfg = staleFrom(values.stale_cards);
  const box = useSettingField({
    stored: cfg.pct,
    problem: (raw, next) => (VALID_PCT.test(raw) && next <= 100 ? null : 'Enter a number from 0 to 100, with up to 2 decimals.'),
    save: (next) => save('stale_cards', (now) => ({ ...staleFrom(now), pct: next }), current?.id),
    saved: (next) => (next > 0 ? `Stale cut saved: −${next}%.` : 'Stale cut saved: none, stale cards keep their rate.'),
  });
  return (
    <section className="cardpanel settings-panel">
      <div className="cardpanel-head"><strong>Stale cut</strong></div>
      <div className="cardpanel-body">
        <p className="hint">
          A Magic card whose exact printing is in the stale cards file, in stock, shows {STALE_EMOJI} on the Price
          screen&apos;s Copies we own, and its suggested rate is this much lower, on walk-in buys and open overnight
          buys. It&apos;s a percent of the card&apos;s rate, on top of Copies we own&apos;s cut: that cut&apos;s
          &quot;At most&quot; doesn&apos;t limit this one. Applied as Copies we own&apos;s are: Apply, or Auto
          apply rates?. 0 turns it off.
        </p>
        <label className="owned-set-row">
          <span className="owned-set-label">Lower for a stale card</span>
          <span className="pct-input fb-box owned-set-box">
            <span className="pct-sign owned-set-pre">−</span>
            <input type="number" min="0" max="100" step="0.01" aria-label="Lower for a stale card" {...box} />
            <span className="pct-sign owned-set-unit">%</span>
          </span>
        </label>
        <p className="hint owned-set-example">
          {cfg.pct > 0
            ? `With this: Credit 60% on a stale card is ${adjustRate(60, -cfg.pct)}%.`
            : 'Off: stale cards show the emoji and keep their rate.'}
        </p>
      </div>
    </section>
  );
}
