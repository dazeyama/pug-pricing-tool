// The Help tab (owner, 2026-10-09): README.md, read at build time and split
// into pages that each about fit one screen. The README stays the one source:
// a page is a run of its headings, from the page's first heading to the next
// page's (src/pages/help/pages.js), so a section added to the README shows up
// in Help by itself, on the page before it. Pure, so the tests run under Node.
//
// The README is the store's own file, so its HTML (tables, <kbd>, <details>)
// passes straight through; only the Markdown it uses is converted: headings,
// paragraphs, - and 1. lists, pipe tables, **bold**, *italic*, `code` and
// [links](#anchor).

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
const startsBlock = (t) => !t || t.startsWith('|') || LIST.test(t) || HTML.test(t) || t === '---';

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
    if (!t || t === '---' || t === '<br>') {
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
 * @returns {{ pages: object[], anchors: Map<string, { page: string, slug: string }>, problems: string[] }}
 *   `problems`: config starts the README doesn't have, or out of order (the tests check it's empty)
 */
export function buildHelp(readme, config) {
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
      + renderMarkdown(b.lines)).join('\n');
    return {
      id: p.id,
      chapter: p.chapter,
      title: p.title ?? own[0]?.title ?? p.id,
      images: p.images ?? [],
      keys: own.map((b) => b.key),
      html,
    };
  });
  return { pages, anchors, problems };
}
