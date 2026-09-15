/**
 * All UI strings for THE SURVEY (claude.md §6). No string literals in components.
 *
 * The underwriter's voice: a man writing in a book at Lloyd's in 1728.
 * Period-plausible, never twee. Short, flat, no exclamation marks. Never "you
 * lose" — say what happened: *she was rotten*. Never congratulate the player for
 * a call the numbers did not support.
 */
import { MAX_SURVEYS } from '../../core/vessel';

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

export function ordinalSurvey(n: number): string {
  return ORDINAL[n - 1] ?? String(n);
}

/** "two to one for rot" — the whole of what is known, in the fewest words. */
export function tallyPhrase(sound: number, rotten: number): string {
  const WORDS = ['no', 'one', 'two', 'three', 'four', 'five'] as const;
  const word = (n: number) => WORDS[n] ?? String(n);
  if (sound === 0 && rotten === 0) return 'Nobody has been aboard.';
  if (rotten === 0) return `${cap(word(sound))} ${sound === 1 ? 'report' : 'reports'} for sound, none against.`;
  if (sound === 0) return `${cap(word(rotten))} ${rotten === 1 ? 'report' : 'reports'} for rot, none against.`;
  if (sound === rotten) return `${cap(word(sound))} and ${word(rotten)} — the reports cancel.`;
  return sound > rotten
    ? `The surveys stand ${word(sound)} to ${word(rotten)} for sound.`
    : `The surveys stand ${word(rotten)} to ${word(sound)} for rot.`;
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const COPY = {
  title: 'THE SURVEY',
  tagline: 'A ship lies in the roads. Every surveyor you send costs you. When have you seen enough?',

  // --- the desk -----------------------------------------------------------
  manifestLabel: 'The voyage on offer',
  cargoValue: 'Pays if she comes home',
  surveysBought: (n: number) => `${n} of ${MAX_SURVEYS} surveyors sent`,
  premiumRemaining: 'Premium remaining',
  ifSheComesHome: 'Underwrite now and she pays',
  declineAndTake: 'Decline and take',
  paid: 'Paid',
  waitingForManifest: 'The broker is reading out the manifest.',
  surveyorOut: 'A surveyor is aboard. His report is not back.',
  nobodyLeft: 'Every surveyor has reported. The call is yours.',

  // --- the three switches -------------------------------------------------
  survey: 'SEND A SURVEYOR',
  underwrite: 'UNDERWRITE',
  decline: 'DECLINE',
  surveyKey: 'S',
  underwriteKey: 'Space',
  declineKey: 'D',
  surveyHint: 'a point and a half of the premium, and one more report',
  underwriteHint: 'take the risk on her',
  declineHint: 'walk away with three fifths',

  // --- settlement ---------------------------------------------------------
  underwrittenAt: (n: number) =>
    n === 0 ? 'Underwritten with no survey.' : `Underwritten after the ${ordinalSurvey(n)} survey.`,
  declinedAt: (n: number) => (n === 0 ? 'Declined unseen.' : `Declined after the ${ordinalSurvey(n)} survey.`),
  cameHome: 'She came home.',
  wasRotten: 'She was rotten.',
  declineNote: 'She sailed without you. What she was is not on the book.',
  dealAgain: 'NEXT VOYAGE',
  dealAgainKey: 'Enter',

  // --- the stake ----------------------------------------------------------
  stake: 'Stake',
  openTheBook: 'OPEN THE BOOK',
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
    'A voyage is offered. She is either sound or rotten, and four ships in ten are sound — these are dangerous waters.',
    'Send surveyors aboard if you like. Each one reports, each is right three times in five — better than a coin, and not by much — and each takes a point and a half of the premium.',
    'Then call it: underwrite her, and she pays her cargo if she comes home; or decline, and walk away with three fifths of a stake.',
  ],
  manifestTitle: 'The manifest',
  manifestCargo: 'Cargo',
  manifestPays: 'Pays',
  manifestChance: 'Chance',
  premiumTitle: 'The premium ladder',
  premiumSurveys: 'Surveyors',
  premiumLeft: 'Premium',
  premiumDecline: 'Declining pays',
  beliefTitle: 'What the reports add up to',
  beliefMargin: 'Margin',
  beliefPosterior: 'P(she is sound)',
  beliefNext: 'Next says SOUND',
  beliefNote:
    'The margin is reports for sound minus reports for rot. Two reports that disagree cancel exactly, so the margin is the whole of what you know — and it is all the contract stores.',
  callTitle: 'When to call',
  callCargo: 'Cargo',
  callBlind: 'Called unseen',
  callBand: 'Keep sending while the margin is',
  callNever: 'never — underwrite unseen',
  callNote:
    'The band slides down as the cargo gets richer, and that is the whole strategy: the more she pays, the further the evidence has to run against her before another report stops being worth its price. Outside the band a surveyor cannot change the call, so he is a point and a half of premium spent on confirming what you already knew.',
  rtpTitle: 'Return to player',
  rtpDeclared: 'Declared RTP, optimal play',
  rtpExact: 'Exact',
  rtpHouseEdge: 'House edge',
  rtpMax: 'Maximum payout',
  rtpMaxNote: 'no surveys, and she comes home',
  bandTitle: 'What other ways of playing return',
  bandPolicy: 'How you play',
  bandRtp: 'Returns',
  bandNote:
    'This is a game with a decision, so the return depends on how you play it. The whole band is published, including the careless end — and every way of playing it that a person would actually adopt sits inside the jam’s 93–98% window, which is what the surveyor’s accuracy and the price of a survey were chosen to hold.',
  verifyNote: 'Every number here is recomputed by npm run verify:survey from the manifest.',
  /**
   * The full write-up lives on its own page, not in this panel and not on the
   * door. It opens in a NEW TAB on purpose: inside a host this game is an
   * iframe, and navigating it away mid-round would throw away a session the
   * player has already staked.
   */
  howHref: '/survey/how/',
  howLink: 'Read the whole model',

  // --- keyboard -----------------------------------------------------------
  keyboardTitle: 'Keyboard',
  keyboardRows: [
    ['S / ↓', 'send a surveyor'],
    ['Space / Enter', 'underwrite her'],
    ['D', 'decline'],
    ['Enter', 'the next voyage, once settled'],
    ['?', 'this panel'],
    ['M', 'sound'],
    ['T', 'turbo — the same decisions, less waiting'],
    ['L', 'the ledger'],
  ] as ReadonlyArray<readonly [string, string]>,

  soundOn: 'SOUND ON',
  soundOff: 'SOUND OFF',
  soundKey: 'M',
  turboOn: 'TURBO',
  turboOff: 'TURBO',
  turboKey: 'T',

  // --- the Ghost Report ---------------------------------------------------
  // Stated flatly and once. Never "you were so close" — the call is made, the
  // voyage is over, and the game does not editorialise about it (claude.md §6,
  // §7; prd.md §10).
  ghostLabel: 'The next surveyor would have said',
  ghostSound: 'SOUND',
  ghostRotten: 'ROTTEN',
  ghostNone: 'Every surveyor had reported. There was nobody left to send.',
  ghostNote: 'Drawn after your call was locked in. It changed nothing.',

  // The underwriter's voice holds even here: say what happened, offer the one
  // thing that helps, and do not apologise at length.
  crashed: 'The book is closed. Nothing was staked that is not already settled on chain.',
  crashReload: 'OPEN IT AGAIN',

  // --- the Ledger ---------------------------------------------------------
  ledgerTitle: 'The book',
  ledgerKey: 'L',
  ledgerEmpty: 'Nothing written yet.',
  ledgerRound: 'Voyage',
  ledgerCargo: 'Cargo',
  ledgerSurveys: 'Surveys',
  ledgerCall: 'Call',
  ledgerOutcome: 'She was',
  ledgerPaid: 'Paid',
  ledgerNext: 'Next would have said',
  ledgerUnknown: 'not on the book',
  ledgerSoFar: 'This session',
  ledgerRounds: 'Voyages',
  ledgerStaked: 'Staked',
  ledgerReturned: 'Returned',
  ledgerRealised: 'Your return so far',
  ledgerDeclared: 'Declared RTP, optimal play',
  ledgerNote:
    'A short session says little about the return; the spread is wide until the voyages run into the thousands. This book lasts one page load and is not saved.',
} as const;
