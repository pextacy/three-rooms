/**
 * Every word on the List, and every word on the pages generated beside it.
 *
 * No string literals in components (`claude.md` §6), and the same rule applies
 * to the door and to `scripts/gen-pages.ts`. The voice here is the List's own:
 * it reports, it does not sell. Nothing on these pages congratulates anybody or
 * promises anything, because the one thing the site has to establish in ten
 * seconds is that the numbers can be checked — and a page that oversells is a
 * page a judge stops reading.
 */

/**
 * The door.
 *
 * It carries three rooms and a question, and that is the whole of it. Everything
 * it used to carry — three paragraphs of provenance, a table of figures each,
 * and a colophon about how to verify them — now has a page, because a door that
 * answers every question is a door nobody walks through.
 */
export const COPY = {
  dateline: 'Chain Jam Vol. 1 · Lloyd’s Coffee House, London · 1728',

  /**
   * The thesis, and it is literally true of all three: CANDLE asks when to stop
   * waiting, THE SURVEY when to stop buying evidence, THE BROKERS when to stop
   * shopping. One question, three costs of asking it.
   */
  titleLead: 'Three rooms. ',
  titleEm: 'When do you stop?',

  lede:
    'A casino game is normally a probability with a price on it: pick p, collect 1/p, and nothing you do changes the answer. These are decision problems, so what you take home depends on how you play — and the rule that plays each one best is published inside it.',

  windowsLabel: 'The three rooms',

  /** Under each cut: the light, then the one number, then the way in. */
  litPrefix: 'Lit by',
  figureRtp: 'Returns, played best',
  figureMax: 'Most it pays',
  figureFrom: 'From',

  enter: 'Enter',
  play: 'Play',
  about: 'What this is',
  how: 'How it works',

  /** The foot of the door: one line out to the page that proves the numbers. */
  footLead: 'Nothing on this site is asserted.',
  footLink: 'How every figure is checked',
} as const;

/**
 * The verification page, at `/verify/`.
 *
 * This used to be the colophon at the bottom of the door, which meant the one
 * argument the site actually needs to win was four screens below the fold.
 */
export const VERIFY = {
  title: 'Nothing here is asserted',
  eyebrow: 'How the numbers are made',
  crumb: '← The rooms',

  lede:
    'Every figure on this site is recomputed from the game’s own model in exact fractions — the declared return, the whole strategy band, the maximum payout the contract reserves. Not one of them is typed into the code. The contracts are view-only and hold no storage, so the arithmetic is the same on chain and in the page.',

  fractionsHead: 'The three declared returns, exactly',
  fractionsBody:
    'Each is a ratio of two integers, computed in BigInt and never rounded until it is printed. The percentage beside it is that ratio, not a stored constant that happens to agree with it.',

  commandsHead: 'Four commands, under a minute',
  commandsBody:
    'Clone the repository, install, and run any of these. Each one re-derives what the pages claim from the model they claim it about, and fails loudly rather than quietly if the two have drifted.',

  commands: [
    ['npm run verify:rtp', 'CANDLE’s return, over all 30 reachable states'],
    ['npm run verify:survey', 'THE SURVEY’s, over 126'],
    ['npm run verify:brokers', 'THE BROKERS’, and that the index rule is the dynamic program at all 120'],
    ['npm run verify:light', 'that the rooms dim by exactly the ladder they claim'],
  ] as ReadonlyArray<readonly [string, string]>,

  madeHead: 'And what it is made of',
  madeBody:
    'Three rooms, one light model. Four ink roles each, no fifth. No image over 8 KB, no audio file at all — every sound is synthesised and every scene is drawn. Free play needs no wallet, no account and no connection.',
} as const;

/**
 * The four leaves of a `how` sequence, and the words the chrome around them is
 * set in.
 *
 * They are a SEQUENCE, which is the only reason they are numbered: you cannot
 * read the band before you know what is on the table, and you cannot check a
 * figure you have not been shown. The numerals are Roman because a folio in 1728
 * is, and because `01 / 02 / 03` is what every generated page marks a list with
 * whether or not the list has an order.
 */
export const LEAF = {
  running: 'How it works',
  of: 'of',
  numerals: ['i', 'ii', 'iii', 'iv'] as readonly string[],
  prev: 'Back',
  next: 'Next',
  toAbout: 'What this is',
  backToList: '← The rooms',
} as const;
