/**
 * The games, and where each one lives.
 *
 * Every entry is a SEPARATE jam submission: its own page, its own
 * `game.manifest.json` beside it, its own contract. The host resolves a
 * manifest with `new URL('game.manifest.json', gameUrl)` — relative to the
 * game's URL, not the origin root — so several games share one origin as long
 * as each sits in its own directory and its URL ends in a slash.
 *
 * This lobby is NOT an entry. It carries no jam widget and reports nothing.
 */
export type GameEntry = {
  readonly slug: string;
  readonly name: string;
  /** The one-line pitch, in the game's own voice. */
  readonly line: string;
  /** The decision primitive, named. This is the novelty claim. */
  readonly primitive: string;
  /** Where it comes from, so the claim can be checked. */
  readonly provenance: string;
  readonly rtp: string;
  readonly maxPayout: string;
  readonly status: 'live' | 'building';
  /**
   * The room this game is lit in, named the way `[data-room]` names it on the
   * entry's own page. The lobby is a door, so it shows each game in ITS colours
   * rather than repainting all three in the candle's — which is what it did, and
   * which made three different rooms look like one product.
   */
  readonly room: 'candle' | 'roads' | 'floor';
  /** What is doing the lighting, for the one line that says so. */
  readonly lit: string;
};

export const GAMES: readonly GameEntry[] = [
  {
    slug: 'brokers',
    name: 'THE BROKERS',
    line: 'You hold a claim on a wreck. Every man who looks at it charges you. When have you shopped it enough?',
    primitive: 'Search with recall',
    provenance:
      "Pandora's Box — Weitzman's 1979 index, one of the foundational results of search theory. Every price you are named stays on the table, so nothing is ever lost but the fees; the rule that solves it says the broker with the best average price is the LAST one worth asking.",
    rtp: '96.9637%',
    maxPayout: '4.99×',
    status: 'live',
    room: 'floor',
    lit: 'an Argand lamp over a slate board',
  },
  {
    slug: 'survey',
    name: 'THE SURVEY',
    line: 'A ship lies in the roads. Every surveyor you send costs you. When have you seen enough?',
    primitive: 'Sequential hypothesis testing',
    provenance:
      "Wald's problem, with a priced stopping rule. You are not guessing a number and not refusing offers — you are buying evidence, and the only question is when you have bought enough. Every published way of playing it returns between 93% and 98%, from sending nobody to sending everybody.",
    rtp: '97.4141%',
    maxPayout: '20×',
    status: 'live',
    room: 'roads',
    lit: 'the sky, through an open window',
  },
  {
    slug: 'candle',
    name: 'CANDLE',
    line: 'A lot is on the table. The candle is burning. Every inch you wait is worth less.',
    primitive: 'Discounted optimal stopping',
    provenance: 'The Gilbert–Mosteller full-information problem, with a deterministic decay and a forced acceptance at the horizon.',
    rtp: '96.9961%',
    maxPayout: '25×',
    status: 'live',
    room: 'candle',
    lit: 'a tallow candle on the table',
  },
];
