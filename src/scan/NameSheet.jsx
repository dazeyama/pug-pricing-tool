import { useEffect, useRef, useState } from 'react';
import * as scry from '../lib/scryfall.js';
import { nameSuggestions } from './nameMatch.js';

/**
 * Which card? (owner, 2026-10-18: "as a final-final fallback after even the
 * special filter name read for old cards, if it fails, just open a text
 * input field directly with the best scryfall guess name filled in
 * automatically, x button to clear, click to type, submit to open the 'Pick a
 * Card' panel with best options after the user inputs the name … With this
 * feature then we can never truly get stuck."; decision 311). The box starts
 * with the reader's closest name; typing lists the names that fit (every
 * card name is on the phone already, so it needs no connection); Find
 * printings, Enter or a suggestion opens the printing list for that name.
 * Skip sets the card aside.
 * @param {{ guess: string, onSubmit: (name: string) => Promise<string|null>, onSkip: () => void }} props
 *   onSubmit: an error to show, or null (the printing list opens)
 */
export default function NameSheet({ guess, onSubmit, onSkip }) {
  const [text, setText] = useState(guess ?? '');
  const [typed, setTyped] = useState(false);   // suggestions once the person types, not for the guess
  const [names, setNames] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const input = useRef(null);

  useEffect(() => {
    let alive = true;
    scry.loadNames().then((n) => alive && setNames(n)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const suggestions = typed && names ? nameSuggestions(text, names, 5) : [];

  async function submit(name) {
    const value = String(name ?? '').trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    const e = await onSubmit(value);
    setBusy(false);
    if (e) setError(e);
  }

  return (
    <div className="scan-sheet pick" role="dialog" aria-label="Which card is it?">
      <strong className="scan-pick-title">Couldn't read the name. Which card is it?</strong>
      <form
        className="scan-name-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <div className="scan-name-box">
          <input
            ref={input}
            type="text"
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            placeholder="Type the card's name"
            aria-label="The card's name"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setTyped(true);
              setError(null);
            }}
          />
          {text && (
            <button
              type="button"
              className="scan-name-clear"
              aria-label="Clear the name"
              onClick={() => {
                setText('');
                setTyped(true);
                input.current?.focus();
              }}
            >
              ×
            </button>
          )}
        </div>
        <button type="submit" className="btn primary" disabled={!text.trim() || busy}>
          {busy ? 'Finding…' : 'Find printings'}
        </button>
      </form>
      {suggestions.length > 0 && (
        <div className="scan-name-suggestions" role="listbox" aria-label="Card names">
          {suggestions.map((n) => (
            <button
              key={n}
              type="button"
              role="option"
              aria-selected={false}
              className="scan-name-suggestion"
              disabled={busy}
              onClick={() => {
                setText(n);
                setTyped(false);
                submit(n);
              }}
            >
              {n}
            </button>
          ))}
        </div>
      )}
      {error && <p className="scan-sheet-error" role="alert">{error}</p>}
      <div className="scan-sheet-foot">
        <button type="button" className="btn ghost" disabled={busy} onClick={onSkip}>Skip this card</button>
      </div>
    </div>
  );
}
