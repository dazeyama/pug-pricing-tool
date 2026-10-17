// The printouts' tab (docs/TEAM_FEEDBACK.md 3.7): opened at the click (one
// opened after the work would be blocked as a pop-up), showing the app's
// dark "Building…" page while the PDF is built, then the PDF itself, which
// is downloaded too. Shared by the audit printouts (useAuditPrint.js) and
// the Pokémon stickers (useStickerPrint.js, decision 281).

const escapeHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * What the tab shows while the PDF is being built (owner, 2026-10-14): the
 * app's dark look, big bold white words and a spinner, all inline (no file
 * to fetch), so it's there the moment the tab opens. `what` is the line
 * under the title; setStep replaces it as the work goes on.
 */
export function loadingPage(title, what) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Building the printout…</title>
<style>
html, body { height: 100%; margin: 0; }
body {
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at 50% 38%, #1b2036 0%, #0f1220 62%);
  color: #fff; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.box { display: flex; flex-direction: column; align-items: center; gap: 22px; padding: 40px 48px; text-align: center;
  background: #181c2e; border: 1px solid #2c3350; border-radius: 16px; box-shadow: 0 24px 70px rgba(0, 0, 0, .5); }
.spin { width: 58px; height: 58px; border-radius: 50%; border: 6px solid rgba(108, 140, 255, .22);
  border-top-color: #6c8cff; animation: spin .8s linear infinite; }
h1 { margin: 0; font-size: 34px; font-weight: 800; letter-spacing: .01em; }
p { margin: 0; font-size: 17px; font-weight: 600; color: #9aa1bd; }
.what { font-size: 19px; font-weight: 700; color: #e6e8f0; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation-duration: 2.4s; } }
</style></head><body><div class="box"><div class="spin" aria-hidden="true"></div>
<h1>Building the printout…</h1><p class="what">${escapeHtml(title)}</p>
<p id="step">${escapeHtml(what)}</p></div></body></html>`;
}

/**
 * The tab, opened now (while this is still the click) with the loading page;
 * null when the browser refused it (the PDF then opens in a new tab at the end).
 * @returns {Window|null}
 */
export function openPrintTab(title, what) {
  const tab = window.open('', '_blank');
  if (tab) {
    tab.document.open();
    tab.document.write(loadingPage(title, what));
    tab.document.close();
  }
  return tab;
}

/** The loading page's line under the title, replaced: "Fetching today's prices (2 JustTCG requests)…". */
export function setStep(tab, text) {
  try {
    const el = tab && !tab.closed ? tab.document.getElementById('step') : null;
    if (el) el.textContent = text;
  } catch {
    // The tab moved on (a user typed an address): nothing to say there.
  }
}

/** Hand the PDF over: downloaded, and shown in `tab` (opened at the click), else a new one. */
export function deliver(doc, fileName, tab) {
  const url = URL.createObjectURL(doc.output('blob'));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  if (tab && !tab.closed) tab.location.href = url;
  else window.open(url, '_blank');
  // Long enough for the tab to load it.
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
