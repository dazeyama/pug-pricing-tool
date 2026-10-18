import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import readme from '../../README.md?raw';
import Modal from '../components/Modal.jsx';
import { buildHelp, fold, searchTerms, wordHits } from '../lib/help.js';
import { PAGES } from './help/pages.js';
import HelpSearch from './help/HelpSearch.jsx';
import SIZES from './help/images.json';

// Help (owner, 2026-10-09), opened with the header's "?": the README, a page
// at a time. A small contents panel on the left (each chapter's pages, the
// current chapter open), the page on the right: its text, and the training
// deck's screenshots beside it (click one to see it full size). Pages are
// sized to about fit the screen; the body scrolls when one doesn't. ← and →
// turn the pages (owner, 2026-10-09).

// The README's own pictures (public/help/…) are served from the app's base.
const HELP = buildHelp(readme, PAGES, { base: import.meta.env.BASE_URL });
const picture = (src) => `${import.meta.env.BASE_URL}help/${src}.webp`;
/** A page picture, ready to show full size. */
const shot = (img) => ({ url: picture(img.src), caption: img.caption, width: SIZES[img.src]?.[0], height: SIZES[img.src]?.[1] });

export default function HelpPage() {
  const { page: pageId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const index = Math.max(0, HELP.pages.findIndex((p) => p.id === pageId));
  const page = HELP.pages[index];
  const prev = HELP.pages[index - 1] ?? null;
  const next = HELP.pages[index + 1] ?? null;
  const [zoom, setZoom] = useState(null);
  // The search box's words (decision 299), kept from page to page so they stay highlighted.
  const [query, setQuery] = useState('');
  const jump = useRef(false);   // a search result was picked: show its first word
  const body = useRef(null);
  const nav = useRef(null);

  // Chapters in order, each with its pages.
  const chapters = useMemo(() => {
    const out = [];
    for (const p of HELP.pages) {
      if (out.at(-1)?.name !== p.chapter) out.push({ name: p.chapter, pages: [] });
      out.at(-1).pages.push(p);
    }
    return out;
  }, []);
  const go = useCallback(
    (id, anchor = null) => navigate(`/help/${id}`, anchor ? { state: { anchor } } : undefined),
    [navigate],
  );

  // A new page starts at its top, or at the heading a link pointed to; its
  // contents entry stays in view.
  const anchor = location.state?.anchor ?? null;
  useEffect(() => {
    const el = anchor ? body.current?.querySelector(`#help-${CSS.escape(anchor)}`) : null;
    if (el) el.scrollIntoView({ block: 'start' });
    else body.current?.scrollTo({ top: 0 });
    nav.current?.querySelector('.help-link.on')?.scrollIntoView({ block: 'nearest' });
  }, [page.id, anchor, location.key]);

  // The searched words highlighted on the page, through the browser's own
  // highlights (nothing in the page's HTML changes); opened from a result,
  // the first one is scrolled into view.
  useEffect(() => {
    const marks = window.CSS?.highlights;
    const terms = searchTerms(query);
    const root = body.current;
    if (!marks || !window.Highlight || !root) return undefined;
    if (!terms.length) {
      marks.delete('help-search');
      jump.current = false;
      return undefined;
    }
    const ranges = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = fold(node.data);
      if (text.length !== node.data.length) continue;
      for (const term of terms) {
        for (const at of wordHits(text, term)) {
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + term.length);
          ranges.push(range);
        }
      }
    }
    marks.set('help-search', new window.Highlight(...ranges));
    if (jump.current) {
      jump.current = false;
      ranges[0]?.startContainer.parentElement?.scrollIntoView({ block: 'center' });
    }
    return () => marks.delete('help-search');
  }, [query, page.id, location.key]);

  // ← / →: the page before or after. Not while typing (the header search),
  // with a modifier held (the browser's own Alt+← is Back), or over a picture
  // shown full size.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || zoom) return;
      const t = e.target;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const to = e.key === 'ArrowLeft' ? prev : next;
      if (!to) return;
      e.preventDefault();
      go(to.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, zoom, go]);

  /**
   * A README link ("#how-prices-are-worked-out") goes to the page and place
   * it names; a picture in the text opens full size, with its caption.
   */
  function onClick(e) {
    const img = e.target.closest?.('img');
    if (img) {
      const caption = img.closest('figure')?.querySelector('figcaption')?.textContent ?? img.alt;
      setZoom({ url: img.src, caption, width: img.naturalWidth, height: img.naturalHeight });
      return;
    }
    const link = e.target.closest?.('a[href^="#"]');
    if (!link) return;
    e.preventDefault();
    const to = HELP.anchors.get(link.getAttribute('href').slice(1));
    if (to) go(to.page, to.slug);
  }

  return (
    <div className="help">
      <nav className="help-nav cardpanel" ref={nav} aria-label="Help contents">
        <div className="help-nav-head">Help</div>
        {/* Every chapter, the current one open; another's name opens its first page. */}
        {chapters.map((ch) => {
          const open = ch.name === page.chapter;
          return (
            <section key={ch.name} className={`help-chapter${open ? ' open' : ''}`}>
              <button
                type="button"
                className={`help-chapter-btn${open ? ' on' : ''}`}
                aria-expanded={open}
                onClick={() => !open && go(ch.pages[0].id)}
              >
                <span className="help-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
                {ch.name}
              </button>
              {open && (
                <div className="help-pages">
                  {ch.pages.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`help-link${p.id === page.id ? ' on' : ''}`}
                      aria-current={p.id === page.id ? 'page' : undefined}
                      onClick={() => go(p.id)}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </nav>

      <article className="help-body cardpanel" aria-label={page.title}>
        <header className="help-head">
          <span className="help-kicker">{page.chapter}</span>
          <h2>{page.title}</h2>
          <span className="help-count">{index + 1} of {HELP.pages.length}</span>
          <HelpSearch
            pages={HELP.pages}
            query={query}
            onQuery={setQuery}
            onPick={(id) => {
              jump.current = true;
              go(id);
            }}
          />
        </header>
        <div className="help-scroll" ref={body}>
          <div className={`help-content${page.images.length ? ' has-figures' : ''}`}>
            {/* The README, the store's own file, rendered by lib/help.js. */}
            <div className="help-text" onClick={onClick} dangerouslySetInnerHTML={{ __html: page.html }} />
            {page.images.length > 0 && (
              // Each picture's height is a share of the screen, so a page's pictures fit together.
              <div className="help-figures" style={{ '--fig-h': `calc((100vh / var(--ui-zoom) - 330px) / ${page.images.length} - 34px)` }}>
                {page.images.map((img) => (
                  <figure key={img.src} className="help-figure">
                    <button type="button" className="help-shot" title="Show full size" onClick={() => setZoom(shot(img))}>
                      <img
                        src={picture(img.src)}
                        alt={img.caption}
                        width={SIZES[img.src]?.[0]}
                        height={SIZES[img.src]?.[1]}
                        loading="lazy"
                      />
                    </button>
                    <figcaption>{img.caption}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
        </div>
        <footer className="help-foot">
          {prev ? (
            <button type="button" className="btn help-step" title="Previous page (←)" onClick={() => go(prev.id)}>
              ‹ {prev.title}
            </button>
          ) : <span />}
          {next ? (
            <button type="button" className="btn help-step next" title="Next page (→)" onClick={() => go(next.id)}>
              {next.title} ›
            </button>
          ) : <span />}
        </footer>
      </article>

      {zoom && (
        <Modal title={zoom.caption} className="help-zoom" wide onClose={() => setZoom(null)}>
          <img src={zoom.url} alt={zoom.caption} width={zoom.width} height={zoom.height} onClick={() => setZoom(null)} />
        </Modal>
      )}
    </div>
  );
}
