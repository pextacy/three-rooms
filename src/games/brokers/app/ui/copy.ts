/**
 * All UI strings for THE BROKERS (claude.md §6). No string literals in components.
 *
 * The voice is the floor of Lloyd's: short, transactional, a little dry. Nobody
 * here is excited. Never "you lose" — there is nothing to lose in this game;
 * say what the claim sold for.
 */
import { BROKER_LIST } from '../../core/market';

export const COPY = {
  title: 'THE BROKERS',
  tagline: 'You hold a claim on a wreck. Every man who looks at it charges you. When have you shopped it enough?',

  // --- the floor ----------------------------------------------------------
  claimOnOffer: 'The claim in your hand',
  houseNamed: 'The house names',
  holding: 'Holding',
  heldFrom: (who: string) => `from ${who}`,
  theHouse: "the house's man",
  feesPaid: 'Fees paid',
  takeNow: 'Sell it now for',
  paid: 'Paid',
  waitingForHouse: "The house's man is looking the claim over.",
  waitingFor: (who: string) => `${who} has it in his hands.`,
  everybodyAsked: 'Every man on the floor has named his price.',
  brokersLeft: (n: number) => `${n} of ${BROKER_LIST.length} still to ask`,

  // --- the switches -------------------------------------------------------
  take: 'SELL THE CLAIM',
  takeKey: 'Space',
  takeHint: 'take the best price you hold',
  askPrefix: 'ASK',
  askHint: (fee: string) => `${fee} of the stake, whatever he says`,
  alreadyAsked: 'named his price',

  // --- settlement ---------------------------------------------------------
  soldFor: (price: string, who: string) => `Sold at ${price}, ${who}'s price.`,
  soldForHouse: (price: string) => `Sold at ${price}, the house's own price.`,
  afterFees: (fees: string) => `${fees} in fees.`,
  dealAgain: 'THE NEXT CLAIM',
  dealAgainKey: 'Enter',

  // --- the stake ----------------------------------------------------------
  stake: 'Stake',
  openTheFloor: 'TAKE IT TO THE FLOOR',
  stakeTooLarge: 'Above the table limit.',
  stakeTooSmall: 'Below the minimum.',
  notEnoughChips: 'Not enough chips. Refill the purse.',

  // --- demo ---------------------------------------------------------------
  demoBadge: 'DEMO — PLAY CHIPS',
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
    "You hold a claim on a wrecked ship's cargo. The house's own man puts a price on it for nothing, and he is not generous.",
    'Four brokers will each name a price of their own. Each charges a fee the moment you ask him, whatever he ends up saying.',
    'Every price you have been named stays on the table. Sell whenever you like, to whoever named the best one — what you are paid is that price, less the fees you have run up.',
  ],
  marketTitle: 'The floor',
  marketBroker: 'Broker',
  marketFee: 'Fee',
  marketQuotes: 'What he names',
  marketMean: 'Average',
  marketIndex: 'Index',
  marketOrder: 'Ask',
  houseRow: "The house's man",
  houseFee: 'nothing',
  indexTitle: "Weitzman's index, and why the order is not the obvious one",
  indexNote:
    'A broker is worth asking while the price you already hold is below his INDEX — the price at which his fee would exactly pay for itself. The index is not the average: it counts how far above you he might reach, not how he does on a normal day. Ask in descending index, and stop the moment what you hold is at least the best index left. That rule is provably optimal, and it is the whole game.',
  indexPunchline: (best: string, worst: string) =>
    `${best} has the best average price on this floor and is the LAST man worth asking. ${worst} has the worst average of the four and is asked second.`,
  rtpTitle: 'Return to player',
  rtpDeclared: 'Declared RTP, optimal play',
  rtpExact: 'Exact',
  rtpHouseEdge: 'House edge',
  rtpMax: 'Maximum payout',
  rtpMaxNote: "the best price on the floor, less the one fee you must pay to hear it",
  rtpMin: 'Minimum payout',
  rtpMinNote: 'there is no losing state in this game',
  bandTitle: 'What other ways of playing return',
  bandPolicy: 'How you play',
  bandRtp: 'Returns',
  bandNote:
    'This is a game with a decision, so the return depends on how you play it. The whole band is published, careless end included — and every way of playing it that a person would actually adopt sits inside the jam’s 93–98% window.',
  verifyNote: 'Every number here is recomputed by npm run verify:brokers from the market.',

  // --- keyboard -----------------------------------------------------------
  keyboardTitle: 'Keyboard',
  keyboardRows: [
    ['1 … 4', 'ask that broker'],
    ['Space / Enter', 'sell the claim'],
    ['Enter', 'the next claim, once sold'],
    ['?', 'this panel'],
    ['M', 'sound'],
    ['T', 'turbo — the same decisions, less waiting'],
    ['L', 'the book'],
  ] as ReadonlyArray<readonly [string, string]>,

  soundOn: 'SOUND ON',
  soundOff: 'SOUND OFF',
  soundKey: 'M',
  turboOn: 'TURBO',
  turboOff: 'TURBO',
  turboKey: 'T',

  // --- the Ghost Price ----------------------------------------------------
  // Stated flatly and once. Never "you were so close" — the claim is sold and
  // the player made their call (claude.md §6, §7; prd.md §10).
  ghostLabel: 'The next man you did not ask would have said',
  ghostNone: 'You asked everybody. There was nobody left to ask.',
  ghostNote: 'Drawn after the claim was sold. It changed nothing.',

  crashed: 'The floor has closed. Nothing was staked that is not already settled on chain.',
  crashReload: 'OPEN IT AGAIN',

  // --- the book -----------------------------------------------------------
  ledgerTitle: 'The book',
  ledgerKey: 'L',
  ledgerEmpty: 'Nothing written yet.',
  ledgerRound: 'Claim',
  ledgerSoldAt: 'Sold at',
  ledgerTo: 'Named by',
  ledgerAsked: 'Asked',
  ledgerFees: 'Fees',
  ledgerPaid: 'Paid',
  ledgerNext: 'Next man would have said',
  ledgerSoFar: 'This session',
  ledgerRounds: 'Claims',
  ledgerStaked: 'Staked',
  ledgerReturned: 'Returned',
  ledgerRealised: 'Your return so far',
  ledgerDeclared: 'Declared RTP, optimal play',
  ledgerNote:
    'A short session says little about the return; the spread is wide until the claims run into the thousands. This book lasts one page load and is not saved.',
} as const;
