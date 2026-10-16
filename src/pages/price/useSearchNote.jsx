import { useEffect, useState } from 'react';
import { otherLanguageSet } from '../../lib/cardSearch.js';
import { dexNumberQuery } from '../../lib/query.js';
import { lineText } from '../../lib/lineFormat.js';

/**
 * The line under the search bar (PricingScreen; FABLE_REPORT C1): the line
 * being edited, or a one-click switch when what's typed belongs to the other
 * Pokémon language, or the spelling the search used instead. `switchTo(lang)`
 * changes the language and goes back to the search.
 * @returns {import('react').ReactNode}
 */
export function useSearchNote({ search, lang, text, editing, switchTo }) {
  // A set code from the other Pokémon language ("2/184 S8b" with EN on):
  // say so, with a one-click switch (owner, 2026-09-29).
  const typedSet = search.parsed?.setCode ?? null;
  const [langHint, setLangHint] = useState(null);
  useEffect(() => {
    let alive = true;
    setLangHint(null);
    if (typedSet) otherLanguageSet(typedSet, lang).then((other) => alive && other && setLangHint({ code: typedSet, lang: other }));
    return () => {
      alive = false;
    };
  }, [typedSet, lang]);

  // "No. 121" with EN on: a Pokédex number search, which only JP does (owner, 2026-10-10).
  const dexTyped = lang !== 'ja' ? dexNumberQuery(text) : null;

  let note = null;
  if (editing) {
    note = (
      <>
        Editing <strong>{lineText(editing.line)}</strong>: SAVE EDIT saves the changes, Esc leaves it as it was.
      </>
    );
  } else if (dexTyped) {
    note = (
      <span className="note-hint">
        <strong>No. {dexTyped}</strong> finds old Japanese Pokémon cards by Pokédex number:{' '}
        <button
          type="button"
          className="link-btn"
          onClick={() => switchTo('ja')}
        >
          switch to JP
        </button>
      </span>
    );
  } else if (langHint) {
    const jp = langHint.lang === 'ja';
    note = (
      <span className="note-hint">
        <strong>{langHint.code}</strong> is {jp ? 'a Japanese' : 'an English'} Pokémon set:{' '}
        <button
          type="button"
          className="link-btn"
          onClick={() => switchTo(langHint.lang)}
        >
          switch to {jp ? 'JP' : 'EN'}
        </button>
      </span>
    );
  } else if (search.correction) {
    note = <>Showing results for <strong>{search.correction.name}</strong></>;
  }

  return note;
}
