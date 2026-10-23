// The Help tab's pages (owner, 2026-10-09), in README order. Each starts at a
// README heading (`start`: a # or ## heading's title, or "Chapter > ###
// heading", emoji left off) and runs to the next page's start, so the README
// decides what's said and this file only where pages break, their names and
// their pictures. Pictures are public/help/<src>.webp, from the training
// deck's screenshots (images.json has their sizes). A new README section
// joins the page before it; tests/help.test.js checks every start exists, in
// order, and every picture is there.

export const PAGES = [
  // About the app (owner, 2026-10-09). The preamble's own picture is in the README.
  { id: 'preamble', chapter: 'About the app', start: 'About the app', title: 'Preamble' },
  {
    id: 'justtcg', chapter: 'About the app', start: 'About the app > JustTCG',
    images: [{ src: 'settings-keys', caption: 'Settings: the JustTCG key and its usage' }],
  },
  { id: 'other-sources', chapter: 'About the app', start: 'About the app > Other Sources' },

  // Getting started
  {
    id: 'welcome', chapter: 'Getting started', start: 'Getting started', title: 'Welcome',
    images: [{ src: 'login', caption: 'Signing in' }, { src: 'first-run', caption: 'Naming a computer, the first time' }],
  },
  { id: 'core-ideas', chapter: 'Getting started', start: 'Core ideas' },
  { id: 'statuses', chapter: 'Getting started', start: 'Core ideas > Statuses', title: 'Statuses and rounding' },

  // The header
  {
    id: 'header', chapter: 'The header', start: 'The header', title: 'The header and users',
    images: [{ src: 'header', caption: 'The header' }, { src: 'user-menu', caption: 'The user list' }],
  },
  {
    id: 'header-search', chapter: 'The header', start: 'The header > Header search', title: 'Header search and banners',
    images: [{ src: 'search', caption: 'Searching for "bolt"' }],
  },

  // Home
  { id: 'home', chapter: 'Home', start: 'Home tab', title: 'Home', images: [{ src: 'home', caption: 'The Home tab' }] },
  {
    id: 'home-collections', chapter: 'Home', start: 'Home tab > Overnight buys and projects',
    images: [{ src: 'home-tiles', caption: 'Overnight buys and projects' }],
  },
  {
    id: 'home-days', chapter: 'Home', start: 'Home tab > Days to export', title: 'Days to export and recent activity',
    images: [{ src: 'home-days', caption: 'Days to export' }],
  },

  // Buy tab
  { id: 'buy', chapter: 'Buy tab', start: 'Buy tab', title: 'The Buy tab', images: [{ src: 'buy', caption: 'The Buy tab' }] },
  {
    id: 'search-bar', chapter: 'Buy tab', start: 'Buy tab > The search bar', title: 'Searching for a card',
    images: [{ src: 'buy', caption: 'The search bar, across the top' }],
  },
  {
    id: 'japanese-search', chapter: 'Buy tab', start: 'Buy tab > Japanese searches',
    images: [{ src: 'buy-jp', caption: 'JP: a Japanese search' }],
  },
  {
    id: 'suggestions', chapter: 'Buy tab', start: 'Buy tab > Suggestions',
    images: [{ src: 'buy-search', caption: 'Suggestions for a search' }],
  },
  {
    id: 'selected-card', chapter: 'Buy tab', start: 'Buy tab > The selected card', title: 'The selected card and its details',
    images: [{ src: 'buy-magic', caption: 'A Magic card, selected' }],
  },
  {
    id: 'finish-magic', chapter: 'Buy tab', start: 'Buy tab > Finish and Details: Magic',
    images: [{ src: 'buy-foil', caption: 'A foil, with its details' }],
  },
  {
    id: 'finish-pokemon', chapter: 'Buy tab', start: 'Buy tab > Finish and Details: Pokémon',
    images: [{ src: 'buy-pokemon', caption: 'A Pokémon card, selected' }],
  },
  {
    id: 'conditions', chapter: 'Buy tab', start: 'Buy tab > Condition prices',
    images: [{ src: 'buy-conditions', caption: 'Condition prices' }, { src: 'buy-manual', caption: 'A manual price' }],
  },
  {
    id: 'price-panel', chapter: 'Buy tab', start: 'Buy tab > The price panel', title: 'The price panel and ADD CARD',
    images: [{ src: 'buy-magic', caption: 'A card ready to add' }],
  },
  // Decision 448 and after: the counter, its rate and Auto apply rates?.
  { id: 'owned-copies', chapter: 'Buy tab', start: 'Buy tab > Copies we own' },
  {
    id: 'buy-list', chapter: 'Buy tab', start: 'Buy tab > The buy list', title: 'The buy list and rates',
    images: [{ src: 'buy-list', caption: 'The buy list' }],
  },
  {
    id: 'confirm-buy', chapter: 'Buy tab', start: 'Buy tab > CANCEL and CONFIRM BUY',
    images: [{ src: 'confirm-buy', caption: 'Confirm buy' }],
  },
  { id: 'shortcuts', chapter: 'Buy tab', start: 'Buy tab > Keyboard shortcuts' },
  {
    id: 'prices', chapter: 'Buy tab', start: 'Buy tab > How prices are worked out',
    images: [{ src: 'fallback', caption: 'Settings → Master Fallback Percentages' }],
  },

  // Collections
  {
    id: 'collections', chapter: 'Collections', start: 'Collections tab', title: 'The Collections tab',
    images: [{ src: 'collections', caption: 'The Collections tab' }],
  },
  {
    id: 'collection-tables', chapter: 'Collections', start: 'Collections tab > The tables',
    images: [{ src: 'collections', caption: 'The three tables' }],
  },
  {
    id: 'new-collection', chapter: 'Collections', start: 'Collections tab > + Overnight buy',
    title: 'New overnight buys and projects',
    images: [{ src: 'new-collection', caption: '+ Overnight buy' }, { src: 'new-project', caption: '+ Start project' }],
  },

  // A collection
  {
    id: 'collection', chapter: 'A collection', start: 'A collection',
    images: [{ src: 'collection', caption: 'A collection, open' }],
  },
  {
    id: 'details', chapter: 'A collection', start: 'A collection > Details', title: 'A collection’s details',
    images: [{ src: 'details', caption: 'A Priced collection’s details' }],
  },
  {
    id: 'statuses-forward', chapter: 'A collection', start: 'A collection > Moving through the statuses',
    images: [
      { src: 'offer', caption: 'Mark as Priced' },
      { src: 'paid', caption: 'Mark as Paid/Ours' },
      { src: 'reject', caption: 'Reject' },
    ],
  },
  {
    id: 'statuses-back', chapter: 'A collection', start: 'A collection > Going backwards',
    images: [{ src: 'paid-banner', caption: 'Paid/Ours, with Unlock' }, { src: 'rejected', caption: 'Rejected, with Reopen' }],
  },
  {
    id: 'calls-reprice', chapter: 'A collection', start: 'A collection > Calls', title: 'Calls and REPRICE?',
    images: [{ src: 'reprice', caption: 'Reprice this collection?' }],
  },
  {
    id: 'collection-export', chapter: 'A collection', start: 'A collection > EXPORT',
    images: [{ src: 'completed', caption: 'A Completed collection' }],
  },
  {
    id: 'convert-delete', chapter: 'A collection', start: 'A collection > Convert to buy…', title: 'Convert to buy and Delete',
    images: [{ src: 'delete', caption: 'Delete overnight buy' }],
  },
  {
    id: 'cant-upload', chapter: 'A collection', start: 'A collection > Can\'t upload cards',
    images: [{ src: 'cant-upload', caption: 'Can\'t upload cards' }],
  },

  // Calendar
  {
    id: 'calendar', chapter: 'Calendar', start: 'Calendar tab', title: 'The Calendar',
    images: [{ src: 'calendar', caption: 'The Calendar' }],
  },
  { id: 'day', chapter: 'Calendar', start: 'A day page', images: [{ src: 'day', caption: 'A Magic day page' }] },
  {
    id: 'day-buy', chapter: 'Calendar', start: 'A day page > A buy', title: 'A buy on a day page',
    images: [{ src: 'day-menu', caption: 'A buy’s ⋯ menu' }],
  },
  // The printouts and the stickers (decisions 280-283): Print MTG?, Print PKM?, Print PKM Stickers?.
  { id: 'printouts', chapter: 'Calendar', start: 'A day page > Print MTG? (the audit printout)', title: 'Printouts and stickers' },
  {
    id: 'complete', chapter: 'Calendar', start: 'A day page > Complete day… (Pokémon days)', title: 'Complete day… on Pokémon days',
    images: [{ src: 'pokemon-complete', caption: 'A Pokémon day, before' }, { src: 'pokemon-done', caption: 'After Complete day…' }],
  },

  // Exporting
  {
    id: 'exporting', chapter: 'Exporting', start: 'Exporting to Crystal Commerce',
    images: [{ src: 'day', caption: 'EXPORT on a day page' }],
  },
  // How matching works (owner, 2026-10-09), two pages.
  {
    id: 'cc-category', chapter: 'Exporting', start: 'Exporting to Crystal Commerce > Finding the category',
    images: [{ src: 'settings-bottom', caption: 'Settings: remembered set choices and products' }],
  },
  { id: 'cc-product', chapter: 'Exporting', start: 'Exporting to Crystal Commerce > Picking the product' },
  {
    id: 'export-review', chapter: 'Exporting', start: 'Exporting to Crystal Commerce > 2. Review', title: 'Reviewing the matches',
    images: [{ src: 'export-review', caption: 'Review' }],
  },
  {
    id: 'export-confirm', chapter: 'Exporting', start: 'Exporting to Crystal Commerce > 3. Confirm', title: 'Confirm and download',
    images: [{ src: 'export-confirm', caption: 'Confirm' }],
  },
  {
    id: 'sell-price', chapter: 'Exporting', start: 'Exporting to Crystal Commerce > The Sell Price',
    title: 'Sell Prices and the file',
  },

  // Import Collection
  {
    id: 'import', chapter: 'Import Collection', start: 'Import Collection',
    images: [{ src: 'import-drop', caption: 'A CSV held over an empty collection' }, { src: 'import-name', caption: 'Naming the new project' }],
  },
  {
    id: 'import-review', chapter: 'Import Collection', start: 'Import Collection > Review', title: 'Reviewing an import',
    images: [{ src: 'import-cc', caption: 'A Mass Create file' }, { src: 'import-tcg', caption: 'A TCGplayer file' }],
  },

  // Scanning from a phone (docs/SCAN_FUNCTION.md)
  // Its first page says how the phone reads a card (owner, 2026-10-17).
  { id: 'scanning', chapter: 'Scanning from a phone', start: 'Scanning from a phone', title: 'How does scanning work?' },
  {
    id: 'scanning-pairing', chapter: 'Scanning from a phone', start: 'Scanning from a phone > Pairing',
    title: 'Pairing and scanning',
  },
  {
    id: 'scanning-prices', chapter: 'Scanning from a phone', start: 'Scanning from a phone > Prices',
    title: 'Prices and older cards',
  },

  // Settings
  {
    id: 'settings', chapter: 'Settings', start: 'Settings tab', title: 'Settings',
    images: [{ src: 'settings-top', caption: 'Master Crystal Inventory and This computer' }],
  },
  {
    id: 'api-keys', chapter: 'Settings', start: 'Settings tab > API keys', title: 'API keys and JustTCG usage',
    images: [{ src: 'settings-keys', caption: 'API keys and JustTCG usage' }],
  },
  {
    id: 'percentages', chapter: 'Settings', start: 'Settings tab > Master Buy Percentages', title: 'Percentages',
    images: [{ src: 'settings-pct', caption: 'Master Buy and Fallback Percentages' }],
  },
  {
    id: 'export-rates', chapter: 'Settings', start: 'Settings tab > Export rates for bulk',
    title: 'Export rates for bulk and Export sell floor',
  },
  // Decision 474.
  { id: 'owned-settings', chapter: 'Settings', start: 'Settings tab > Copies we own' },
  {
    id: 'cc-matching', chapter: 'Settings', start: 'Settings tab > Crystal Commerce matching',
    images: [{ src: 'settings-bottom', caption: 'Crystal Commerce matching and Backups' }],
  },
  {
    id: 'backups', chapter: 'Settings', start: 'Settings tab > Backups',
    images: [{ src: 'settings-bottom', caption: 'Crystal Commerce matching and Backups' }],
  },

  // Changelog
  {
    id: 'changelog', chapter: 'Changelog', start: 'Changelog tab', title: 'The Changelog',
    images: [{ src: 'changelog', caption: 'The Changelog' }],
  },
  {
    id: 'changelog-panel', chapter: 'Changelog', start: 'Changelog tab > A panel', title: 'A Changelog panel',
    images: [{ src: 'changelog', caption: 'Changelog panels' }],
  },
];
