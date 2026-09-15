/**
 * Every word on the List.
 *
 * No string literals in components (`claude.md` §6), and the same rule applies
 * to the door. The voice here is the List's own: it reports, it does not sell.
 * Nothing on this page congratulates anybody or promises anything, because the
 * one thing it has to establish in ten seconds is that the numbers can be
 * checked — and a page that oversells is a page a judge stops reading.
 */
export const COPY = {
  dateline: 'Chain Jam Vol. 1 · Lloyd’s Coffee House, London · 1728',

  /**
   * The thesis, and it is literally true of all three: CANDLE asks when to stop
   * waiting, THE SURVEY when to stop buying evidence, THE BROKERS when to stop
   * shopping. One question, three costs of asking it.
   */
  titleLead: 'Three games. ',
  titleEm: 'When do you stop?',

  lede:
    'All three ask it, and each charges differently for waiting. A casino game is normally a probability with a price on it: pick p, collect 1/p, and nothing you do changes the answer. These are decision problems — optimal stopping, sequential testing, search with recall — so what you take home depends on how you play, and the rule that plays each one best is published inside it.',

  windowsLabel: 'The three rooms',

  figureRtp: 'Returns, played best',
  figureMax: 'Most it pays',
  figureFrom: 'From',

  play: 'Play',
  how: 'How it works',

  checkHead: 'Nothing here is asserted',
  checkBody:
    'Every figure on this site is recomputed from the game’s own model in exact fractions — the declared return, the whole strategy band, the maximum payout the contract reserves. Not one of them is typed into the code. The contracts are view-only and hold no storage, so the arithmetic is the same on chain and in the page.',

  commands: [
    ['npm run verify:rtp', 'CANDLE’s return, over all 30 reachable states'],
    ['npm run verify:survey', 'THE SURVEY’s, over 126'],
    ['npm run verify:brokers', 'THE BROKERS’, and that the index rule is the dynamic program at all 120'],
    ['npm run verify:light', 'that the rooms dim by exactly the ladder they claim'],
  ] as ReadonlyArray<readonly [string, string]>,

  colophon:
    'Three rooms, one light model. Four ink roles each, no fifth. No image over 8 KB, no audio file at all — every sound is synthesised and every scene is drawn. Free play needs no wallet, no account and no connection.',
} as const;
