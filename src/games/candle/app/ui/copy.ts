/**
 * All UI strings (claude.md §6). No string literals in components.
 *
 * The auctioneer's voice: period-plausible, never twee. Short, flat, no
 * exclamation marks. Never "you lose" — say what happened. Never congratulate
 * the player for a bad decision.
 */
import { INCHES } from '../../core/wax';

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

export function ordinalInch(inch: number): string {
  return ORDINAL[inch - 1] ?? String(inch);
}

export const COPY = {
  title: 'CANDLE',
  tagline: 'A lot is on the table. The candle is burning. Every inch you wait is worth less.',

  // --- the table ----------------------------------------------------------
  lotOnTable: 'Lot on the table',
  faceValue: 'Face value',
  ifClaimedNow: 'Claim now and take',
  waxRemaining: 'Wax remaining',
  inchOf: (inch: number) => `Inch ${inch} of ${INCHES}`,
  waitingForLot: 'The auctioneer is fetching the next lot.',

  // --- the two switches ---------------------------------------------------
  claim: 'CLAIM',
  burn: 'LET IT BURN',
  claimKey: 'Space',
  burnKey: 'B',
  claimHint: 'take this lot and settle',
  burnHint: 'lose an inch of wax, see the next lot',
  guttering: 'The candle is guttering. This lot is yours whatever it is.',

  // --- settlement ---------------------------------------------------------
  claimedAt: (inch: number) => `Claimed at the ${ordinalInch(inch)} inch.`,
  gutteredAt: () => 'The candle guttered.',
  tookNothing: 'The crate was empty.',
  paid: 'Paid',
  dealAgain: 'DEAL AGAIN',
  dealAgainKey: 'Enter',

  // --- the stake ----------------------------------------------------------
  stake: 'Stake',
  lightTheCandle: 'LIGHT THE CANDLE',
  stakeTooLarge: 'Above the table limit.',
  stakeTooSmall: 'Below the minimum.',
  notEnoughChips: 'Not enough chips. Refill the purse.',

  // --- demo ---------------------------------------------------------------
  demoBadge: 'PLAY CHIPS',
  demoNote: 'Free play. The purse lasts one page load and nothing is saved.',
  purse: 'Purse',
  refill: 'REFILL',

  // --- host states --------------------------------------------------------
  walletDisconnected: 'The host has not connected a wallet.',
  walletSetupRequired: 'The host needs to finish setting up this wallet.',
  walletMismatch: 'The host session key does not match.',
  hostUnreachable: 'Could not reach the host.',

  // --- the ? panel --------------------------------------------------------
  helpKey: '?',
  helpTitle: 'How it works',
  helpClose: 'CLOSE',
  rules: [
    'Take the lot on the table, or let the candle burn an inch and see the next one.',
    `Each inch you burn, the prize is worth 15 points less — and when the candle gutters you must take whatever is in front of you.`,
  ],
  paytableTitle: 'The paytable',
  paytableLot: 'Lot',
  paytableFace: 'Face',
  paytableChance: 'Chance',
  waxTitle: 'The wax ladder',
  waxInch: 'Inch',
  waxRemainingShort: 'Wax',
  waxOnTwo: 'A 2.00× lot pays',
  thresholdTitle: 'When to claim',
  thresholdInch: 'Inch',
  thresholdClaimAbove: 'Claim if face ≥',
  thresholdInPractice: 'In practice',
  forced: 'forced',
  optimalRule:
    'Never claim an empty crate. Claim anything worth 1.00× or more. Claim the 0.50× only at the fourth inch.',
  rtpTitle: 'Return to player',
  rtpDeclared: 'Declared RTP, optimal play',
  rtpExact: 'Exact',
  rtpHouseEdge: 'House edge',
  rtpMax: 'Maximum payout',
  rtpMaxNote: 'first inch only',
  bandTitle: 'What other ways of playing return',
  bandPolicy: 'How you play',
  bandRtp: 'Returns',
  bandOutside: 'outside the window',
  bandNote:
    'This is a game with a decision, so the return depends on how you play it. The whole band is published, including the careless end.',
  verifyNote: 'Every number here is recomputed by npm run verify:rtp from the paytable.',
  /**
   * The full write-up lives on its own page, not in this panel and not on the
   * door. It opens in a NEW TAB on purpose: inside a host this game is an
   * iframe, and navigating it away mid-round would throw away a session the
   * player has already staked.
   */
  howHref: '/candle/how/',
  howLink: 'Read the whole model',

  // --- keyboard -----------------------------------------------------------
  keyboardTitle: 'Keyboard',
  keyboardRows: [
    ['Space / Enter', 'claim the lot'],
    ['B / ↓', 'let it burn'],
    ['Enter', 'deal again, once settled'],
    ['?', 'this panel'],
    ['M', 'sound'],
    ['T', 'turbo — the same decisions, less waiting'],
    ['L', 'the ledger'],
  ] as ReadonlyArray<readonly [string, string]>,

  soundOn: 'SOUND',
  soundOff: 'MUTED',
  soundKey: 'M',

  // --- the Ghost Lot ------------------------------------------------------
  // Stated flatly and once. Never "you were so close" — the round is over, the
  // player made their call, and the game does not editorialise about it
  // (claude.md §6, §7; prd.md §10).
  ghostLabel: 'The next lot would have been',
  ghostNone: 'The candle was out. There was no next lot.',
  ghostNote: 'Drawn after your claim was locked in. It changed nothing.',

  // The auctioneer's voice holds even here: say what happened, offer the one
  // thing that helps, and do not apologise at length.
  crashed: 'The candle went out. Nothing was staked that is not already settled on chain.',
  crashReload: 'LIGHT IT AGAIN',

  // --- the Ledger ---------------------------------------------------------
  // A log that tallies what you COULD have won is a loss-chasing nudge with a
  // spreadsheet on it (claude.md §7). This one states what happened and closes
  // on your realised return against the declared RTP — the useful number, and
  // the honest answer to "I'm due a win".
  ledgerTitle: 'The ledger',
  ledgerKey: 'L',
  ledgerEmpty: 'No rounds settled yet.',
  ledgerRound: 'Round',
  ledgerTook: 'Took',
  ledgerInch: 'Inch',
  ledgerPaid: 'Paid',
  ledgerNext: 'Next lot was',
  ledgerGuttered: 'guttered',
  ledgerSoFar: 'This session',
  ledgerRounds: 'Rounds',
  ledgerStaked: 'Staked',
  ledgerReturned: 'Returned',
  ledgerRealised: 'Your return so far',
  ledgerDeclared: 'Declared RTP, optimal play',
  ledgerNote:
    'A short session says little about the return; the spread is wide until the rounds run into the thousands. This log lasts one page load and is not saved.',

  turboOn: 'TURBO',
  turboOff: 'TURBO',
  turboKey: 'T',
} as const;
