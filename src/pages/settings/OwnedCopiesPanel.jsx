import { useState } from 'react';
import { useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useSettingField } from './useSettingField.js';
import { ownedCut, ownedFrom } from '../../lib/ownedRates.js';

const VALID_COUNT = /^\d{1,2}$/;
const VALID_PCT = /^\d{1,3}(\.\d{1,2})?$/;

/**
 * One number of the setting, saved when its box loses focus; the whole setting is saved at once, with the box
 * changed, from the value saved now (decision 394).
 */
function OwnedBox({ field, label, count = false, max = 100, sign = '%', prefix = '' }) {
  const { values, save } = useSettings();
  const { current } = useStaff();
  const cfg = ownedFrom(values.owned_copies);
  const box = useSettingField({
    stored: cfg[field],
    problem: (raw, next) => {
      if (count) return VALID_COUNT.test(raw) ? null : 'Enter a whole number from 0 to 99.';
      return VALID_PCT.test(raw) && next <= max ? null : `Enter a number from 0 to ${max}, with up to 2 decimals.`;
    },
    save: (next) => save('owned_copies', (now) => ({ ...ownedFrom(now), [field]: next }), current?.id),
    saved: (next) => `${label} saved: ${prefix}${next}${count ? '' : sign}.`,
  });
  return (
    <label className="owned-set-row">
      <span className="owned-set-label">{label}</span>
      <span className="pct-input fb-box owned-set-box">
        {prefix && <span className="pct-sign">{prefix}</span>}
        <input type="number" min="0" max={count ? 99 : max} step={count ? 1 : 0.01} aria-label={label} {...box} />
        {!count && <span className="pct-sign">{sign}</span>}
        {count && <span className="pct-sign">copies</span>}
      </span>
    </label>
  );
}

/** One switch of the setting, saved as it's clicked. */
function OwnedSwitch({ field, label, hint }) {
  const { values, save } = useSettings();
  const { current } = useStaff();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const on = ownedFrom(values.owned_copies)[field];
  return (
    <label className="owned-set-switch">
      <input
        type="checkbox"
        checked={on}
        disabled={busy}
        onChange={async (e) => {
          const next = e.target.checked;
          setBusy(true);
          const err = await save('owned_copies', (now) => ({ ...ownedFrom(now), [field]: next }), current?.id);
          setBusy(false);
          toast(err ? `Couldn't save: ${err}` : `${label}: ${next ? 'on' : 'off'}.`, err ? 'err' : 'ok');
        }}
      />
      <span>
        <span className="owned-set-label">{label}</span>
        {hint && <span className="hint owned-set-hint">{hint}</span>}
      </span>
    </label>
  );
}

// Settings → Copies we own (owner, 2026-10-23; decision 474): the Price screen's counter of the copies we own
// (decision 448) and the rate it suggests, with the numbers the owner chose as the defaults: the cut for copies
// over the free ones, the first-copy bonuses, low-end cards, and Auto apply rates? on new walk-in buys. Saved
// like every setting, live on every computer, in the Changelog.
export default function OwnedCopiesPanel() {
  const { values } = useSettings();
  const cfg = ownedFrom(values.owned_copies);
  // The numbers at work, as the counter would use them.
  const capAt = cfg.step > 0 ? cfg.free + Math.ceil(cfg.cap / cfg.step) : null;
  const firstBoth = cfg.first_printing + cfg.first_card;
  return (
    <section className="cardpanel settings-panel settings-wide">
      <div className="cardpanel-head"><strong>Copies we own</strong></div>
      <div className="cardpanel-body owned-set">
        <p className="hint">
          On the Price screen, Magic cards show how many copies we own (Crystal Commerce&apos;s inventory and ours
          not in it yet) and suggest a rate: lower when we have plenty, higher for a first copy. Each percent is of
          the card&apos;s rate (Credit 60% at 10% lower is 54%). Nothing changes a rate until a worker applies it,
          or checks Auto apply rates? for the buy.
        </p>
        <OwnedSwitch
          field="on"
          label="Show copies we own on the Price screen"
          hint="Off: no counter, no suggested rate, and no Auto apply rates?."
        />
        <div className="owned-set-cols">
          <fieldset className="owned-set-group" disabled={!cfg.on}>
            <legend>The cut</legend>
            <OwnedBox field="free" label="Copies before a cut starts" count />
            <OwnedBox field="step" label="Lower for each copy over that" />
            <OwnedBox field="cap" label="At most" />
          </fieldset>
          <fieldset className="owned-set-group" disabled={!cfg.on}>
            <legend>First-copy bonuses</legend>
            <OwnedBox field="first_printing" label="First of this printing" prefix="+" />
            <OwnedBox field="first_card" label="First of this card, on top" prefix="+" />
            <OwnedSwitch field="low_end_bonus" label="Bonuses on low-end cards too" />
          </fieldset>
        </div>
        <OwnedSwitch
          field="auto_default"
          label="New walk-in buys start with Auto apply rates? checked"
          hint="Overnight buys keep their own box, off till checked."
        />
        <p className="hint owned-set-example">
          With these: {cfg.free + 2} copies of a card, {ownedCut(cfg.free + 2, cfg)}% lower
          {capAt != null ? `; ${capAt} or more, ${cfg.cap}% lower` : ''}; a card we&apos;ve never had, {firstBoth}% higher
          {cfg.first_printing > 0 ? `; a new printing of one we have, ${cfg.first_printing}% higher` : ''}.
        </p>
      </div>
    </section>
  );
}
