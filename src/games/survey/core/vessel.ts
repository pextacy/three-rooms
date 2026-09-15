/**
 * THE SURVEY — the single source of truth (game 2).
 *
 * A voyage is offered at Lloyd's. Her cargo is worth a named multiple of your
 * stake if she comes home, and she is either **sound** or **rotten** — four
 * ships in ten are sound, and these are dangerous waters. You may send
 * surveyors aboard; each one reports, each report is only as good as a surveyor
 * in 1728, and each costs you a slice of the premium. Then you call it:
 * **UNDERWRITE** her, or **DECLINE** and walk away with three fifths.
 *
 * The primitive is **sequential hypothesis testing** — Wald's problem. You are
 * not guessing a number, not refusing offers under a decay, and not climbing a
 * ladder: you are **buying evidence**, and the only question is when you have
 * bought enough. No casino game has ever done that.
 *
 * The call couples BELIEF and VALUE, which is what an underwriter actually does:
 * a rich cargo is worth taking on thin evidence, a poor one is not worth taking
 * on good evidence.
 *
 * Pure. No React, no DOM, no `window`, no `Date.now()`, no ambient randomness.
 */

/** Weights are out of this. Asserted at module load and in CI. */
export const WEIGHT_DENOM = 10_000;

/** Cargo value is the multiplier x100 — "100 bp = 1.00x" — like CANDLE's faces. */
export const VALUE_DENOM = 100;

/** How many surveyors may be sent, at most. */
export const MAX_SURVEYS = 5;

export type CargoId = 0 | 1 | 2 | 3 | 4 | 5;

export type Cargo = {
  readonly id: CargoId;
  /** What the voyage pays if she comes home, x100. */
  readonly valueBp: number;
  readonly weight: number;
  readonly name: string;
};

/**
 * THE MANIFEST. Change a number here, run `npm run gen:constants`, and let the
 * tests say what broke. Never hand-edit the Solidity mirror.
 */
export const CARGOES: readonly Cargo[] = [
  { id: 0, valueBp: 110, weight: 3000, name: 'Salt' },
  { id: 1, valueBp: 140, weight: 2500, name: 'Coal' },
  { id: 2, valueBp: 180, weight: 2000, name: 'Timber' },
  { id: 3, valueBp: 250, weight: 1500, name: 'Wine' },
  { id: 4, valueBp: 500, weight: 800, name: 'Silk' },
  { id: 5, valueBp: 2000, weight: 200, name: 'Indigo' },
] as const;

export const CUMULATIVE_WEIGHTS: readonly number[] = CARGOES.reduce<number[]>((acc, cargo) => {
  acc.push((acc[acc.length - 1] ?? 0) + cargo.weight);
  return acc;
}, []);

/** Four ships in ten are sound. These are dangerous waters. */
export const PRIOR_SOUND_NUM = 2;
export const PRIOR_SOUND_DEN = 5;

/**
 * A surveyor is right three times in five — better than a coin, and not by
 * much. A man rowed out to a hull in 1728 with a mallet and an hour of daylight
 * was not an instrument.
 *
 * This number is the whole shape of the game and it is not a flavour choice.
 * With `q = 3/5` one report multiplies the odds by exactly **3/2**, so no single
 * surveyor settles anything and the player is genuinely running a SEQUENCE of
 * tests rather than asking an oracle once. It is also what holds invariant I2:
 * the more decisive the evidence, the more the informed player pulls away from
 * the careless one, and at `q = 3/4` the careless end of the band fell to
 * 89.7% — outside the jam's 93–98% window, which is not a band we are willing
 * to publish (see `docs/phases.md`, and the table under `?`).
 */
export const ACCURACY_NUM = 3;
export const ACCURACY_DEN = 5;

/**
 * The premium ladder: what remains of your stake's reach after `k` surveys.
 *
 * A surveyor takes **a point and a half of the premium**, so evidence is never
 * free — but it is cheap, which it has to be. Evidence this weak (`q = 3/5`)
 * priced at six points a head made the player who surveys carefully and the
 * player who cannot be bothered differ by seven points of RTP, and the careless
 * one fell out of the jam's 93–98% band.
 */
export const PREMIUM_BP: readonly number[] = [10_000, 9_850, 9_700, 9_550, 9_400, 9_250] as const;
export const PREMIUM_DENOM = 10_000;

/**
 * Declining hands back three fifths of the stake. Walking away costs you; it is
 * not free, and it is not a refund.
 *
 * Three fifths, like the prior and the surveyor: every number a player has to
 * hold in their head in this game is a fifth.
 */
export const DECLINE_BP = 60;

export type Call = 'UNDERWRITE' | 'DECLINE';
/** What a surveyor came back saying. */
export type Report = 'SOUND' | 'ROTTEN';

/** `stake * valueBp * premiumBp / (100 * 10000)`. One floor, at the very end. */
export const PAYOUT_DENOM = 1_000_000n;

/** The most this game can pay: the richest cargo, underwritten with no surveys. */
export const MAX_VALUE_BP = CARGOES.reduce((max, c) => (c.valueBp > max ? c.valueBp : max), 0);

export function premiumBpAt(surveys: number): number {
  const premium = PREMIUM_BP[surveys];
  if (premium === undefined) throw new RangeError(`surveys ${surveys} is outside 0..${MAX_SURVEYS}`);
  return premium;
}

/**
 * Payout in the token's base units.
 *
 * THE one payout rule. Every quote the contract makes routes through its twin,
 * so a maximum win cannot disagree with the reserve by a single base unit.
 */
export function payoutBase(stakeBase: bigint, valueBp: number, surveys: number): bigint {
  if (stakeBase < 0n) throw new RangeError('stake must not be negative');
  return (stakeBase * BigInt(valueBp) * BigInt(premiumBpAt(surveys))) / PAYOUT_DENOM;
}

/** What a call is worth, in value-basis-points, given how the voyage turns out. */
export function settledValueBp(call: Call, cargo: Cargo, isSound: boolean): number {
  if (call === 'DECLINE') return DECLINE_BP;
  return isSound ? cargo.valueBp : 0;
}

/** Maps a uniform draw in [0, WEIGHT_DENOM) to a cargo. Mirrors the contract. */
export function cargoForDraw(r: number): Cargo {
  if (!Number.isInteger(r) || r < 0 || r >= WEIGHT_DENOM) {
    throw new RangeError(`draw out of range: ${r} (expected an integer in [0, ${WEIGHT_DENOM}))`);
  }
  for (let i = 0; i < CARGOES.length; i++) {
    const cumulative = CUMULATIVE_WEIGHTS[i];
    const cargo = CARGOES[i];
    if (cumulative === undefined || cargo === undefined) break;
    if (r < cumulative) return cargo;
  }
  throw new Error(`no cargo for draw ${r} — the weights do not sum to ${WEIGHT_DENOM}`);
}

export function cargoById(id: CargoId): Cargo {
  const cargo = CARGOES[id];
  if (cargo === undefined) throw new RangeError(`no cargo with id ${id}`);
  return cargo;
}

const weightSum = CARGOES.reduce((sum, c) => sum + c.weight, 0);
if (weightSum !== WEIGHT_DENOM) {
  throw new Error(`manifest weights sum to ${weightSum}, expected ${WEIGHT_DENOM}`);
}
if (PREMIUM_BP.length !== MAX_SURVEYS + 1) {
  throw new Error(`the premium ladder has ${PREMIUM_BP.length} rungs, expected ${MAX_SURVEYS + 1}`);
}
