/**
 * The dynamic program (docs.md §2.3, §9.3).
 *
 *   A(INCHES) = wax(INCHES) * E[face]                          (forced)
 *   A(k)      = Σ_lots p(lot) * max( face(lot) * wax(k), A(k+1) )
 *   RTP       = A(1)
 *   threshold(k) = A(k+1) / wax(k)
 *
 * Everything is exact BigInt rational arithmetic — never floats. `npm run
 * verify:rtp` runs this and prints the result; the README, the `?` panel and the
 * Solidity constants are all GENERATED from it, never typed by hand
 * (claude.md §8).
 *
 * Pure: no DOM, no randomness, no clock.
 */
import { LOTS, FACE_DENOM, WEIGHT_DENOM, type Lot, type LotId } from './paytable';
import { INCHES, WAX_BP, WAX_DENOM, waxBpAt } from './wax';
import { type Rational, rat, ZERO, add, mul, div, max, compare, toNumber } from './rational';

/** Probability of drawing this lot, exact. */
export function lotProbability(lot: Lot): Rational {
  return rat(lot.weight, WEIGHT_DENOM);
}

/** Face value as a multiplier of the stake, exact. `faceBp 2500` -> `25`. */
export function faceValue(lot: Lot): Rational {
  return rat(lot.faceBp, FACE_DENOM);
}

/** Wax remaining at `inch`, as a fraction. `inch 2` -> `17/20`. */
export function waxFraction(inch: number): Rational {
  return rat(waxBpAt(inch), WAX_DENOM);
}

/** What a lot is worth if claimed at this inch: `face * wax`. */
export function claimValue(lot: Lot, inch: number): Rational {
  return mul(faceValue(lot), waxFraction(inch));
}

/** E[face] over the whole paytable. Hand-checkable: 0.44 (docs.md §9.6). */
export function expectedFace(): Rational {
  return LOTS.reduce<Rational>((sum, lot) => add(sum, mul(lotProbability(lot), faceValue(lot))), ZERO);
}

export type Solution = {
  /** `continuation[k]` = A(k), the value of ARRIVING at inch k and playing on. */
  readonly continuation: readonly Rational[]; // index 1..INCHES
  /** `threshold[k]` = claim at inch k iff face >= this. Undefined at the last inch. */
  readonly threshold: readonly (Rational | undefined)[]; // index 1..INCHES
  /** RTP under optimal play = A(1). */
  readonly rtp: Rational;
  readonly expectedFace: Rational;
};

/**
 * Solve the DP backwards. Nothing is read from a constant — this is the
 * recomputation the tests and `verify:rtp` compare the declared numbers against.
 */
export function solve(): Solution {
  const continuation: Rational[] = [];
  const threshold: (Rational | undefined)[] = [];

  // The fifth inch is forced: whatever is on the table is claimed.
  continuation[INCHES] = mul(waxFraction(INCHES), expectedFace());
  threshold[INCHES] = undefined;

  for (let inch = INCHES - 1; inch >= 1; inch--) {
    const next = continuation[inch + 1];
    if (next === undefined) throw new Error(`missing A(${inch + 1})`);

    // Claiming is worth `face * wax(inch)`; passing is worth A(inch+1). The
    // player takes the better of the two, so the indifference point in FACE
    // terms is A(inch+1) / wax(inch).
    threshold[inch] = div(next, waxFraction(inch));

    continuation[inch] = LOTS.reduce<Rational>(
      (sum, lot) => add(sum, mul(lotProbability(lot), max(claimValue(lot, inch), next))),
      ZERO,
    );
  }

  const rtp = continuation[1];
  if (rtp === undefined) throw new Error('missing A(1)');
  return { continuation, threshold, rtp, expectedFace: expectedFace() };
}

// ---------------------------------------------------------------------------
//  Policies — the strategy band (docs.md §9.5)
// ---------------------------------------------------------------------------

/**
 * A policy answers one question: at this inch, with this lot on the table, do
 * you claim? The last inch never asks — it is forced.
 */
export type Policy = (lot: Lot, inch: number) => boolean;

/** The optimal policy, derived from the DP rather than described in prose. */
export function optimalPolicy(solution: Solution = solve()): Policy {
  return (lot, inch) => {
    const t = solution.threshold[inch];
    if (t === undefined) return true; // forced
    return compare(faceValue(lot), t) >= 0;
  };
}

/** "Claim anything worth at least `minFaceBp`." The printable kind of rule. */
export function thresholdPolicy(minFaceBp: number): Policy {
  return lot => lot.faceBp >= minFaceBp;
}

/** Expected return of playing `policy` from inch 1. Exact. */
export function evaluate(policy: Policy): Rational {
  let value = mul(waxFraction(INCHES), expectedFace()); // forced at the last inch
  for (let inch = INCHES - 1; inch >= 1; inch--) {
    const next = value;
    value = LOTS.reduce<Rational>(
      (sum, lot) => add(sum, mul(lotProbability(lot), policy(lot, inch) ? claimValue(lot, inch) : next)),
      ZERO,
    );
  }
  return value;
}

export type NamedPolicy = { readonly label: string; readonly policy: Policy; readonly note?: string };

/**
 * The band we publish. The jam requires a theoretical RTP inside 93–98%; for a
 * game with decisions "the RTP" is policy-dependent, so we report the whole
 * band and lead with it rather than hiding the worst case (claude.md §8).
 */
export function strategyBand(solution: Solution = solve()): readonly NamedPolicy[] {
  return [
    { label: 'Optimal', policy: optimalPolicy(solution), note: 'the declared RTP' },
    { label: 'Claim >= 1.00x', policy: thresholdPolicy(100), note: 'the printed rule' },
    { label: 'Claim >= 0.50x (anything non-empty)', policy: thresholdPolicy(50), note: 'the impatient player' },
    { label: 'Hold for >= 2.00x', policy: thresholdPolicy(200), note: 'the greedy player' },
    { label: 'Hold for >= 5.00x', policy: thresholdPolicy(500) },
    {
      label: 'Claim the first lot regardless',
      policy: () => true,
      note: 'unreachable — nobody claims an empty crate',
    },
  ];
}

// ---------------------------------------------------------------------------
//  Outcome distribution (docs.md §4.6, §9.4)
// ---------------------------------------------------------------------------

export type Outcome = {
  readonly inch: number;
  readonly lotId: LotId;
  /** Payout as a multiple of the stake, exact. */
  readonly payout: Rational;
  readonly probability: Rational;
};

/**
 * Every reachable `(inch, lot)` settlement under `policy`, with its exact
 * probability. There are `INCHES * LOTS.length` = 30 of them; the ones the
 * policy never settles on carry probability zero.
 */
export function outcomes(policy: Policy): readonly Outcome[] {
  const out: Outcome[] = [];
  let reach = rat(1n); // probability of arriving at the current inch

  for (let inch = 1; inch <= INCHES; inch++) {
    const forced = inch === INCHES;
    let passMass = ZERO;

    for (const lot of LOTS) {
      const p = lotProbability(lot);
      if (forced || policy(lot, inch)) {
        out.push({ inch, lotId: lot.id, payout: claimValue(lot, inch), probability: mul(reach, p) });
      } else {
        passMass = add(passMass, p);
      }
    }
    reach = mul(reach, passMass);
  }
  return out;
}

/** Probability that a round reaches each inch. Index 1..INCHES. */
export function reachByInch(policy: Policy): readonly Rational[] {
  const reach: Rational[] = [];
  let current = rat(1n);
  for (let inch = 1; inch <= INCHES; inch++) {
    reach[inch] = current;
    if (inch === INCHES) break;
    const passMass = LOTS.reduce<Rational>(
      (sum, lot) => (policy(lot, inch) ? sum : add(sum, lotProbability(lot))),
      ZERO,
    );
    current = mul(current, passMass);
  }
  return reach;
}

/** Total probability of a payout at least `threshold` times the stake. */
export function probabilityAtLeast(policy: Policy, threshold: Rational): Rational {
  return outcomes(policy).reduce<Rational>(
    (sum, o) => (compare(o.payout, threshold) >= 0 ? add(sum, o.probability) : sum),
    ZERO,
  );
}

/** Probability of a payout of exactly zero — the empty crate at the gutter. */
export function probabilityOfNothing(policy: Policy): Rational {
  return outcomes(policy).reduce<Rational>(
    (sum, o) => (o.payout.n === 0n ? add(sum, o.probability) : sum),
    ZERO,
  );
}

/** Mean round length in inches. */
export function meanRoundLength(policy: Policy): Rational {
  return outcomes(policy).reduce<Rational>((sum, o) => add(sum, mul(o.probability, rat(o.inch))), ZERO);
}

/**
 * Standard deviation of the payout multiple. Exact through the variance, then
 * one square root at the very end — a rational has no exact root, so this is
 * the single place a float is allowed, and it is a reported statistic rather
 * than a number anything settles against.
 */
export function standardDeviation(policy: Policy): number {
  const list = outcomes(policy);
  const mean = list.reduce<Rational>((sum, o) => add(sum, mul(o.probability, o.payout)), ZERO);
  const second = list.reduce<Rational>(
    (sum, o) => add(sum, mul(o.probability, mul(o.payout, o.payout))),
    ZERO,
  );
  const variance = toNumber(second) - toNumber(mean) ** 2;
  return Math.sqrt(Math.max(variance, 0));
}

/** Every wax rung, for printing. */
export const WAX_LADDER = WAX_BP;
