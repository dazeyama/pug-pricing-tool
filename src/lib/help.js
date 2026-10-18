// The Help tab (owner, 2026-10-09): README.md, read at build time and split
// into pages that each about fit one screen. The README stays the one source:
// a page is a run of its headings, from the page's first heading to the next
// page's (src/pages/help/pages.js), so a section added to the README shows up
// in Help by itself, on the page before it. Pure, so the tests run under Node.
//
// The README is the store's own file, so its HTML (tables, <kbd>, <details>,
// <figure>) passes straight through, its pictures' public/ paths pointed at the
// app's own; only the Markdown it uses is converted: headings,
// paragraphs, - and 1. lists, pipe tables, ``` code blocks, **bold**,
// *italic*, `code` and [links](#anchor).

/** "📤 Exporting to Crystal Commerce" → "Exporting to Crystal Commerce": the emoji in front go. */
export function cleanTitle(text) {
  return String(text).trim().replace(/^[^\p{L}\p{N}+]+/u, '');
}

/** GitHub's anchor for a heading: lower case, punctuation (emoji too) dropped, spaces to hyphens. */
export function slugify(text) {
  return String(text).trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/**
 * The README's headings, each with the lines under it. A ### heading's key
 * names its # chapter too ("Buy tab > The search bar"), since some repeat
 * ("Review"); a # or ## heading's key is its title. What comes before the
 * first heading (the centred title and badges) is left out.
 * @returns {{ key: string, level: number, title: string, slug: string, lines: string[] }[]}
 */
export function parseReadme(text) {
  const blocks = [];
  let chapter = null;
  let current = null;
  for (const line of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    const m = /^(#{1,3}) (.+)$/.exec(line);
    if (m) {
      const level = m[1].length;
      const title = cleanTitle(m[2]);
      if (level === 1) chapter = title;
      current = {
        key: level === 3 && chapter ? `${chapter} > ${title}` : title,
        level,
        title,
        slug: slugify(m[2]),
        lines: [],
      };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return blocks;
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One line of Markdown text as HTML. Tags already in it are kept; a lone "<" ("< BACK") is escaped. */
export function inline(text) {
  const codes = [];
  let s = String(text).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;')
    .replace(/<(?![a-zA-Z/!])/g, '&lt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  // eslint-disable-next-line no-control-regex -- \u0000 brackets the code placeholders set above
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${escapeHtml(codes[Number(n)])}</code>`);
}

/** A row's cells: split on "|", but not "\|" (a pipe in the text). */
function cells(row) {
  const inner = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split(/(?<!\\)\|/).map((c) => inline(c.trim().replace(/\\\|/g, '|')));
}

/** A pipe table. With an empty header row (`| | |`), a two-column key: name and what it does. */
function table(rows) {
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  const keyed = head.every((c) => !c);
  const tr = (cs, tag) => `<tr>${cs.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
  return `<table class="help-table${keyed ? ' keyed' : ''}">`
    + `${keyed ? '' : `<thead>${tr(head, 'th')}</thead>`}`
    + `<tbody>${body.map((cs) => tr(cs, 'td')).join('')}</tbody></table>`;
}

const LIST = /^(?:[-*]|\d+\.) /;
const HTML = /^<\/?[a-zA-Z]/;
/** A line that ends a paragraph: a new block starts on it. */
const startsBlock = (t) => !t || t.startsWith('|') || t.startsWith('```') || LIST.test(t) || HTML.test(t) || t === '---';

/**
 * A README section's lines as HTML. Rules (---) and lone <br>s are the
 * README's spacing between chapters, not content, and go; so do centred
 * <p align="center"> blocks (its title and footer). A <details> opens.
 */
export function renderMarkdown(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t.startsWith('```')) {
      // A code block, as written: escaped, never read as Markdown.
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
      i += 1;
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    } else if (!t || t === '---' || t === '<br>') {
      i += 1;
    } else if (t.startsWith('<p align="center">')) {
      while (i < lines.length && !lines[i].includes('</p>')) i += 1;
      i += 1;
    } else if (t.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
      out.push(table(rows));
    } else if (LIST.test(t)) {
      const ordered = /^\d+\. /.test(t);
      const items = [];
      while (i < lines.length) {
        const line = lines[i];
        const tt = line.trim();
        const item = /^(?:[-*]|\d+\.) (.*)$/.exec(tt);
        if (item && !/^\s/.test(line)) items.push(item[1]);
        else if (tt && /^\s/.test(line) && items.length) items[items.length - 1] += ` ${tt}`;
        else break;
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${tag}>`);
    } else if (HTML.test(t)) {
      out.push(t === '<details>' ? '<details open>' : t);
      i += 1;
    } else {
      const para = [];
      while (i < lines.length && !startsBlock(lines[i].trim())) para.push(lines[i++].trim());
      out.push(`<p>${inline(para.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}

/**
 * The Help tab's pages: each config page takes the README's sections from its
 * `start` up to the next page's, in README order. The page's own title
 * replaces its first section's heading; the others become <h3>s with the
 * README's anchors, so a README link ("#how-prices-are-worked-out") finds its
 * page and place.
 * @param {string} readme  README.md's text
 * @param {{ id: string, chapter: string, start: string, title?: string, images?: object[] }[]} config
 * @param {{ base?: string }} [options]  where public/ is served ("/pug-pricing-tool/"): a README
 *   picture's src="public/help/…" becomes src="<base>help/…"
 * @returns {{ pages: object[], anchors: Map<string, { page: string, slug: string }>, problems: string[] }}
 *   `problems`: config starts the README doesn't have, or out of order (the tests check it's empty)
 */
export function buildHelp(readme, config, { base = '' } = {}) {
  const blocks = parseReadme(readme);
  const problems = [];
  const index = new Map(blocks.map((b, i) => [b.key, i]));
  let last = -1;
  for (const p of config) {
    const at = index.get(p.start);
    if (at == null) problems.push(`No README heading "${p.start}" (page ${p.id})`);
    else if (at <= last) problems.push(`Page ${p.id} starts before the page above it`);
    else last = at;
  }
  const startOf = new Map(config.map((p, n) => [p.start, n]));
  const sections = config.map(() => []);
  let current = -1;
  for (const b of blocks) {
    if (startOf.has(b.key)) current = startOf.get(b.key);
    if (current >= 0) sections[current].push(b);
  }
  const anchors = new Map();
  const pages = config.map((p, n) => {
    const own = sections[n];
    for (const b of own) if (!anchors.has(b.slug)) anchors.set(b.slug, { page: p.id, slug: b.slug });
    const html = own.map((b, k) => (k === 0 ? '' : `<h3 id="help-${b.slug}">${inline(b.title)}</h3>\n`)
      + renderMarkdown(b.lines)).join('\n').replace(/src="public\//g, `src="${base}`);
    return {
      id: p.id,
      chapter: p.chapter,
      title: p.title ?? own[0]?.title ?? p.id,
      images: p.images ?? [],
      keys: own.map((b) => b.key),
      html,
      // For the search (decision 299): the page's words as read, and its headings.
      text: plainText(html),
      headings: own.slice(1).map((b) => b.title),
    };
  });
  return { pages, anchors, problems };
}

/** A page's HTML as the words on it: tags gone, entities read, spaces collapsed. */
export function plainText(html) {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lower case with the accents gone ("Pokémon" → "pokemon"), so either spelling
 * finds the other. Keeps the length of ordinary text, so a place found in the
 * folded text is the same place in the original.
 */
export function fold(text) {
  return String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** The words searched for: two characters or more, each once. */
export function searchTerms(query) {
  return [...new Set(fold(query).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2))];
}

const wordChar = (c) => Boolean(c) && /[\p{L}\p{N}]/u.test(c);

/** Where `term` starts a word in `folded` text ("port" finds "portrait", not "export"). */
export function wordHits(folded, term) {
  const at = [];
  for (let i = folded.indexOf(term); i >= 0; i = folded.indexOf(term, i + term.length)) {
    if (!wordChar(folded[i - 1])) at.push(i);
  }
  return at;
}

/**
 * The Help's search (owner, 2026-10-18; decision 299): the pages that have
 * every word typed, the most relevant first. A word in the page's title counts
 * 10, in one of its headings 4, in its text 1 for each time; ties keep the
 * Help's own order. Each result has a snippet around the first place in the
 * text, `{ before, match, after }`.
 * @param {{ id: string, title: string, chapter: string, text: string, headings: string[] }[]} pages
 * @returns {{ page: object, score: number, count: number, snippet: object|null }[]}
 */
export function searchHelp(pages, query) {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const out = [];
  pages.forEach((page, order) => {
    const title = fold(page.title);
    const heads = fold(page.headings.join(' · '));
    const text = fold(page.text);
    let score = 0;
    let count = 0;
    let first = null;
    for (const term of terms) {
      const inTitle = wordHits(title, term).length;
      const inHeads = wordHits(heads, term).length;
      const inText = wordHits(text, term);
      if (!inTitle && !inHeads && !inText.length) return;
      score += inTitle * 10 + inHeads * 4 + inText.length;
      count += inText.length;
      if (first == null && inText.length) first = { at: inText[0], length: term.length };
    }
    out.push({ page, score, count, order, snippet: first && snippetAt(page.text, first.at, first.length) });
  });
  return out
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((r) => ({ page: r.page, score: r.score, count: r.count, snippet: r.snippet }));
}

/** About 50 characters either side of a place in the text, cut at spaces. */
function snippetAt(text, at, length, room = 50) {
  let from = Math.max(0, at - room);
  let to = Math.min(text.length, at + length + room);
  if (from > 0) from = text.indexOf(' ', from) + 1 || from;
  if (to < text.length) {
    const space = text.lastIndexOf(' ', to);
    if (space > at + length) to = space;
  }
  return {
    before: (from > 0 ? '…' : '') + text.slice(from, at),
    match: text.slice(at, at + length),
    after: text.slice(at + length, to) + (to < text.length ? '…' : ''),
  };
}
