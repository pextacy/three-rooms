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
  /** Where it comes from, in one line — the List has room for one line. */
  readonly source: string;
  /**
   * The long form, for that game's own `how` page. It used to be printed on the
   * door, which is how the door ended up carrying three essays nobody had asked
   * for yet.
   */
  readonly provenance: string;
  /**
   * Why this is not a clone of anything, in one paragraph. It names the SHAPE —
   * the object in the literature — and then says which of the three casino
   * shapes it is not, because "original" is a claim and a shape is a fact.
   *
   * It lives on `/<slug>/about/` and nowhere else. The door does not argue.
   */
  readonly why: string;
  /**
   * Why the dressing is not a costume either: the 1728 mechanism this room is
   * built on actually existed, and the details of it are mechanics here.
   */
  readonly dressing: string;
  /**
   * The rules, in as many sentences as they take. Set as a rule block on the
   * about page — a player who reads only this should be able to play.
   */
  readonly rules: readonly string[];
  readonly rtp: string;
  readonly maxPayout: string;
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
    source: 'Weitzman’s Pandora’s Box, 1979',
    provenance:
      "Pandora's Box — Weitzman's 1979 index, one of the foundational results of search theory. Every price you are named stays on the table, so nothing is ever lost but the fees; the rule that solves it says the broker with the best average price is the LAST one worth asking.",
    why:
      "Its shape is a set of alternatives with known distributions and known inspection costs, opened one at a time in an order of your choosing, with free recall of everything already opened — Pandora's Box, Weitzman 1979. It is not CANDLE, and recall is the difference: there a refused lot is gone and the prize decays with time, so you hold out. Here nothing decays and nothing is ever lost but the fee you chose to pay. Nor is it THE SURVEY: nothing is hidden on this floor. You are not buying evidence about a state, you are buying options.",
    dressing:
      "Lloyd's was a room before it was an institution. A claim was walked from table to table and priced by whoever would price it, and what a broker's fee bought you was an opinion you kept whether or not you acted on it. Nothing on this floor comes off the table once it is named — that is the mechanic, and it is also how the room worked.",
    rules: [
      'You hold a claim on a wreck, and the house names a price for it, free.',
      'Every other broker on the floor charges a fee to name his — and every price you have been named stays yours to take.',
      'Stop when the best price in your hand is better than the next man is worth asking.',
    ],
    rtp: '96.9637%',
    maxPayout: '4.99×',
    room: 'floor',
    lit: 'an Argand lamp over a slate board',
  },
  {
    slug: 'survey',
    name: 'THE SURVEY',
    line: 'A ship lies in the roads. Every surveyor you send costs you. When have you seen enough?',
    primitive: 'Sequential hypothesis testing',
    source: 'Wald’s sequential analysis, 1945',
    provenance:
      "Wald's problem, with a priced stopping rule. You are not guessing a number and not refusing offers — you are buying evidence, and the only question is when you have bought enough. Every published way of playing it returns between 93% and 98%, from sending nobody to sending everybody.",
    why:
      "Its shape is a sequence of noisy, individually priced observations of a hidden binary state, stopped at your discretion, followed by a decision whose payoff depends on that state — Wald's sequential probability ratio test, with the sampling cost made an explicit price rather than an abstraction. You are not guessing a number and you are not refusing offers: you are buying evidence, and the only question is when you have bought enough.",
    dressing:
      "Lloyd's Coffee House was an insurance market before it was an insurance company: underwriters sat at their own tables and wrote their names under the terms of a voyage they were willing to carry. A ship lying in the roads could be surveyed before you signed — and a surveyor in 1728 was a man with a mallet, an hour of daylight and an opinion.",
    rules: [
      'A voyage is on the book, and she is either sound or rotten.',
      'Send a surveyor and he tells you which — rightly 60% of the time, and wrongly the rest, for a point and a half of the premium.',
      'Then underwrite her and take what she carries if she comes home, or decline and walk away with 0.60×.',
    ],
    rtp: '97.4141%',
    maxPayout: '20×',
    room: 'roads',
    lit: 'the sky, through an open window',
  },
  {
    slug: 'candle',
    name: 'CANDLE',
    line: 'A lot is on the table. The candle is burning. Every inch you wait is worth less.',
    primitive: 'Discounted optimal stopping',
    source: 'Gilbert and Mosteller, 1966',
    provenance: 'The Gilbert–Mosteller full-information problem, with a deterministic decay and a forced acceptance at the horizon.',
    why:
      'Its shape is a sequence of i.i.d. offers, each of which may be accepted once, under a deterministic decay, with a forced acceptance at the horizon — the Gilbert–Mosteller full-information optimal stopping problem, discounted. There is no bust state and nothing accumulates, so it cannot be a crash clone; there is no probability selector, so it cannot be a dice clone. The risk you carry is regret, not ruin.',
    dressing:
      "Auction by the inch of candle is a real mechanism: in the records of the House of Lords by 1641, endorsed by John Milton in 1652 as the surest way to reach the true value of goods, used by the Admiralty to sell surplus ships in 1660 and 1662 as Pepys records, and still run once a year at Tatworth in Somerset. Lloyd's auctioneers pushed a pin into the wax an inch below the wick so its fall marked the end, and Pepys notes a bidder's trick — the wick flares just before it dies, and he shouted his last bid on seeing it. Every one of those details is a mechanic here.",
    rules: [
      'Take the lot on the table, or let the candle burn an inch and see the next one.',
      'Each inch you burn, the prize is worth 15 points less — and when the candle gutters you must take whatever is in front of you.',
    ],
    rtp: '96.9961%',
    maxPayout: '25×',
    room: 'candle',
    lit: 'a tallow candle on the table',
  },
];
