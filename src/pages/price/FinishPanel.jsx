import {
  magicFinishes, magicTraitRows, closestSibling, carryFinish, defaultMagicFinish,
  POKEMON_FINISHES,
} from '../../lib/printings.js';

const FINISH_WORDS = { normal: 'non-holo', holo: 'holo', reverse: 'reverse holo' };

/**
 * The big FOIL switch (spec 8.5): green with the knob right when on, red with
 * the knob left when off. Locked when the printing only comes one way, or
 * while Etched is on (then it reads ETCHED).
 */
function FoilSwitch({ finish, options, onFinish }) {
  const etched = finish === 'etched';
  const on = etched || finish === 'foil';
  const locked = etched || !(options.nonfoil && options.foil);
  const tip = etched ? 'Etched foil. Turn off Etched in Details to change.'
    : !options.foil ? 'Only printed non-foil'
      : !options.nonfoil ? 'Only printed in foil'
        : `Switch to ${on ? 'non-foil' : 'foil'} (Alt+F)`;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Foil"
      className={`foil-switch ${on ? 'on' : 'off'}${locked ? ' locked' : ''}`}
      disabled={locked}
      title={tip}
      onClick={() => onFinish(on ? 'nonfoil' : 'foil')}
    >
      <span className="foil-text">
        {etched ? 'ETCHED' : `FOIL ${on ? 'ON' : 'OFF'}`}
        {locked && <span className="foil-lock" aria-hidden="true"> 🔒</span>}
      </span>
      <span className="foil-knob" aria-hidden="true" />
    </button>
  );
}

/** A trait every sibling shares: visible, not clickable. */
function Chip({ label, title }) {
  return <span className="trait-chip" title={title}>{label}</span>;
}

/** Magic: the FOIL switch, then traits that move between sibling printings (spec 8.6). */
function MagicFinish({ card, finish, siblings, onFinish, onMove }) {
  const options = magicFinishes(card);
  const code = card.set.toUpperCase();

  // Etched is a finish; it may be this printing's or only a sibling's.
  const anyEtched = options.etched || (siblings ?? []).some((s) => magicFinishes(s).etched);
  const etchedOn = finish === 'etched';
  let etchedRoute = null;
  if (etchedOn) {
    if (options.nonfoil || options.foil) {
      etchedRoute = () => onFinish(options.nonfoil ? 'nonfoil' : 'foil');
    } else {
      const s = siblings && closestSibling(card, siblings, null, (x) => magicFinishes(x).nonfoil || magicFinishes(x).foil);
      if (s) etchedRoute = () => onMove(s, defaultMagicFinish(s));   // non-foil or foil, by the filter
    }
  } else if (options.etched) {
    etchedRoute = () => onFinish('etched');
  } else {
    const s = siblings && closestSibling(card, siblings, null, (x) => magicFinishes(x).etched);
    if (s) etchedRoute = () => onMove(s, 'etched');
  }

  const rows = siblings ? magicTraitRows(card, siblings) : [];

  return (
    <>
      <div className="stage-label">Finish</div>
      <FoilSwitch finish={finish} options={options} onFinish={onFinish} />
      <div className="stage-label details-label">Details</div>
      <div className="details">
        {siblings === null && <p className="details-note">Loading printings in {code}…</p>}
        {anyEtched && (
          <label
            className={`trait-row${etchedRoute ? '' : ' disabled'}`}
            title={etchedRoute ? '' : `No ${etchedOn ? 'non-etched' : 'etched'} printing of this card in ${code}`}
          >
            <input type="checkbox" checked={etchedOn} disabled={!etchedRoute} onChange={() => etchedRoute?.()} />
            Etched
          </label>
        )}
        {rows.map((r) => (r.toggle ? (
          <label key={r.key} className="trait-row">
            <input
              type="checkbox"
              checked={r.on}
              onChange={() => {
                const s = closestSibling(card, siblings, r.key);
                if (s) onMove(s, carryFinish(finish, s));
              }}
            />
            {r.label}
          </label>
        ) : (
          <Chip key={r.key} label={r.label} title={`Every printing of this card in ${code} is ${r.label.toLowerCase()}`} />
        )))}
        {siblings && !rows.length && !anyEtched && (
          <p className="details-note">One printing of this card in {code}: nothing to switch.</p>
        )}
      </div>
    </>
  );
}

/** Pokémon: NORMAL | HOLO | REVERSE, then the versions of that finish (TCGdex variants). */
function PokemonFinish({ c, pokemon, versions, version, onVersion }) {
  if (!pokemon.resolved) {
    return (
      <>
        <div className="stage-label">Finish</div>
        <p className="details-note">Loading versions…</p>
      </>
    );
  }
  const has = (f) => versions.some((v) => v.finish === f);
  const ofFinish = version ? versions.filter((v) => v.finish === version.finish) : [];
  const pickFinish = (f) => {
    const of = versions.filter((v) => v.finish === f);
    onVersion((of.find((v) => !v.treatments.length && !v.firstEdition) ?? of[0]).id);
  };

  return (
    <>
      <div className="stage-label">Finish</div>
      <div className="finish-segments" role="radiogroup" aria-label="Finish">
        {POKEMON_FINISHES.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={version?.finish === f}
            className={version?.finish === f ? 'on' : ''}
            disabled={!has(f)}
            title={has(f) ? `${FINISH_WORDS[f]} (Alt+F cycles)` : `Not printed ${FINISH_WORDS[f]}`}
            onClick={() => pickFinish(f)}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="stage-label details-label">Details</div>
      <div className="details">
        {!versions.length && <p className="details-note">TCGdex lists no finishes for this card.</p>}
        {ofFinish.length > 1 && (
          <fieldset className="versions">
            <legend>Version</legend>
            {ofFinish.map((v) => (
              <label key={v.id} className="trait-row">
                <input type="radio" name="pokemon-version" checked={v.id === version.id} onChange={() => onVersion(v.id)} />
                {v.label}
              </label>
            ))}
          </fieldset>
        )}
        {ofFinish.length === 1 && ofFinish[0].label !== 'Standard' && <Chip label={ofFinish[0].label} />}
        {pokemon.card?.rarity && <Chip label={pokemon.card.rarity} title="Rarity" />}
        <Chip label={c.lang === 'ja' ? 'Japanese' : 'English'} title="Language: set by EN | JP" />
      </div>
    </>
  );
}

/** The right column's top (spec 8.5–8.6): finish control and details panel. */
export default function FinishPanel(props) {
  const { candidate: c } = props;
  return (
    <div className="finish-panel">
      {!c && (
        <>
          <div className="stage-label">Finish</div>
          <p className="details-note">Pick a card to see its finishes and details.</p>
        </>
      )}
      {c?.game === 'mtg' && (
        <MagicFinish
          card={c.scryfall}
          finish={props.finish}
          siblings={props.siblings}
          onFinish={props.onFinish}
          onMove={props.onMove}
        />
      )}
      {c?.game === 'pokemon' && (
        <PokemonFinish
          c={c}
          pokemon={props.pokemon}
          versions={props.versions}
          version={props.version}
          onVersion={props.onVersion}
        />
      )}
    </div>
  );
}
