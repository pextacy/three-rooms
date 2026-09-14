/**
 * All UI strings (claude.md §6). No string literals in components.
 *
 * The auctioneer's voice: period-plausible, never twee. Short, flat, no
 * exclamation marks. Never "you lose" — say what happened. Never congratulate
 * the player for a bad decision.
 */
import { INCHES } from '../game/wax';

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
  demoBadge: 'DEMO — PLAY CHIPS',
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
  bandNote:
    'This is a game with a decision, so the return depends on how you play it. The whole band is published, including the careless end.',
  verifyNote: 'Every number here is recomputed by npm run verify:rtp from the paytable.',

  // --- keyboard -----------------------------------------------------------
  keyboardTitle: 'Keyboard',
  keyboardRows: [
    ['Space / Enter', 'claim the lot'],
    ['B / ↓', 'let it burn'],
    ['Enter', 'deal again, once settled'],
    ['?', 'this panel'],
    ['M', 'sound'],
    ['T', 'turbo — the same decisions, less waiting'],
  ] as ReadonlyArray<readonly [string, string]>,

  soundOn: 'SOUND ON',
  soundOff: 'SOUND OFF',
  soundKey: 'M',

  // --- the Ghost Lot ------------------------------------------------------
  // Stated flatly and once. Never "you were so close" — the round is over, the
  // player made their call, and the game does not editorialise about it
  // (claude.md §6, §7; prd.md §10).
  ghostLabel: 'The next lot would have been',
  ghostNone: 'The candle was out. There was no next lot.',
  ghostNote: 'Drawn after your claim was locked in. It changed nothing.',

  turboOn: 'TURBO',
  turboOff: 'TURBO',
  turboKey: 'T',
} as const;
