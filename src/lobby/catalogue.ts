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
};

export const GAMES: readonly GameEntry[] = [
  {
    slug: 'candle',
    name: 'CANDLE',
    line: 'A lot is on the table. The candle is burning. Every inch you wait is worth less.',
    primitive: 'Discounted optimal stopping',
    provenance: 'The Gilbert–Mosteller full-information problem, with a deterministic decay and a forced acceptance at the horizon.',
    rtp: '96.9961%',
    maxPayout: '25×',
    status: 'live',
  },
];
