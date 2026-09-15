/**
 * The dynamic program for THE SURVEY.
 *
 * The cargo is known from the start, so it is a PARAMETER of the problem, not a
 * dimension of the state. The state is `(surveys bought, margin)` — and the
 * margin alone, because two reports that disagree cancel exactly (see
 * `belief.ts`).
 *
 *   A_F(K, m) = best call at the cap        (no surveyors left to send)
 *   A_F(k, m) = max( best call now , E[ A_F(k+1, m±1) ] )
 *   RTP       = Σ_cargo  p(cargo) · A_F(0, 0)
 *
 * Exact BigInt rationals — never floats. `npm run verify:survey` runs this, and
 * every number printed anywhere is generated from it.
 */
import {
  MAX_SURVEYS,
  CARGOES,
  WEIGHT_DENOM,
  VALUE_DENOM,
  DECLINE_BP,
  PREMIUM_DENOM,
  premiumBpAt,
  type Cargo,
  type Call,
} from './vessel';
import { posteriorSound, predictiveSound, isReachable } from './belief';
import { rat, add, sub, mul, compare, ZERO, type Rational } from '../../../shared/math/rational';

const index = (margin: number) => margin + MAX_SURVEYS;
const WIDTH = MAX_SURVEYS * 2 + 1;

export function cargoProbability(cargo: Cargo): Rational {
  return rat(cargo.weight, WEIGHT_DENOM);
}

/** What underwriting this cargo is worth right now, as a multiple of the stake. */
export function underwriteValue(cargo: Cargo, surveys: number, margin: number): Rational {
  const premium = rat(premiumBpAt(surveys), PREMIUM_DENOM);
  return mul(mul(rat(cargo.valueBp, VALUE_DENOM), premium), posteriorSound(margin));
}

/** What declining is worth right now. It pays whatever the ship turns out to be. */
export function declineValue(surveys: number): Rational {
  return mul(rat(DECLINE_BP, VALUE_DENOM), rat(premiumBpAt(surveys), PREMIUM_DENOM));
}

export function bestCall(cargo: Cargo, surveys: number, margin: number): { readonly call: Call; readonly value: Rational } {
  const underwrite = underwriteValue(cargo, surveys, margin);
  const decline = declineValue(surveys);
  return compare(decline, underwrite) > 0
    ? { call: 'DECLINE', value: decline }
    : { call: 'UNDERWRITE', value: underwrite };
}

export type CargoSolution = {
  readonly cargo: Cargo;
  /** `value[k][margin + MAX_SURVEYS]` = A_F(k, m), or undefined if unreachable. */
  readonly value: readonly (readonly (Rational | undefined)[])[];
  /** True where sending one more surveyor beats calling. */
  readonly shouldSurvey: readonly (readonly (boolean | undefined)[])[];
  /** The value of the voyage before a single surveyor goes aboard. */
  readonly atStart: Rational;
};

export type Solution = {
  readonly byCargo: readonly CargoSolution[];
  readonly rtp: Rational;
};

export function solveCargo(cargo: Cargo): CargoSolution {
  const value: (Rational | undefined)[][] = [];
  const shouldSurvey: (boolean | undefined)[][] = [];
  for (let k = 0; k <= MAX_SURVEYS; k++) {
    value[k] = new Array<Rational | undefined>(WIDTH).fill(undefined);
    shouldSurvey[k] = new Array<boolean | undefined>(WIDTH).fill(undefined);
  }

  // The cap: no surveyors left, so the call is made on what is already known.
  for (let m = -MAX_SURVEYS; m <= MAX_SURVEYS; m++) {
    if (!isReachable(MAX_SURVEYS, m)) continue;
    value[MAX_SURVEYS]![index(m)] = bestCall(cargo, MAX_SURVEYS, m).value;
    shouldSurvey[MAX_SURVEYS]![index(m)] = false;
  }

  for (let k = MAX_SURVEYS - 1; k >= 0; k--) {
    for (let m = -k; m <= k; m += 2) {
      if (!isReachable(k, m)) continue;
      const callNow = bestCall(cargo, k, m).value;

      const pSound = predictiveSound(m);
      const up = value[k + 1]![index(m + 1)];
      const down = value[k + 1]![index(m - 1)];
      if (up === undefined || down === undefined) throw new Error(`missing A(${k + 1}, ${m}±1)`);
      const survey = add(mul(pSound, up), mul(sub(rat(1n), pSound), down));

      value[k]![index(m)] = compare(survey, callNow) > 0 ? survey : callNow;
      shouldSurvey[k]![index(m)] = compare(survey, callNow) > 0;
    }
  }

  const atStart = value[0]![index(0)];
  if (atStart === undefined) throw new Error('missing A(0, 0)');
  return { cargo, value, shouldSurvey, atStart };
}

/**
 * What sending one more surveyor is worth at `(k, m)`, exactly.
 *
 *     E[ A_F(k+1, m+1) ] * P(next says SOUND) + E[ A_F(k+1, m-1) ] * P(rot)
 *
 * Undefined at the cap, where there is nobody left to send. Exported because the
 * pacing and the `?` panel both need the CONTINUATION value beside the call
 * value — the gap between them is what makes a state a decision at all, and
 * neither should have to re-run the DP by hand to find it.
 */
export function continuationValue(solution: CargoSolution, surveys: number, margin: number): Rational | undefined {
  if (surveys >= MAX_SURVEYS || !isReachable(surveys, margin)) return undefined;
  const up = solution.value[surveys + 1]?.[index(margin + 1)];
  const down = solution.value[surveys + 1]?.[index(margin - 1)];
  if (up === undefined || down === undefined) return undefined;
  const pSound = predictiveSound(margin);
  return add(mul(pSound, up), mul(sub(rat(1n), pSound), down));
}

export function solve(): Solution {
  const byCargo = CARGOES.map(solveCargo);
  const rtp = byCargo.reduce<Rational>(
    (sum, s) => add(sum, mul(cargoProbability(s.cargo), s.atStart)),
    ZERO,
  );
  return { byCargo, rtp };
}

// ---------------------------------------------------------------------------
//  Policies — the strategy band
// ---------------------------------------------------------------------------

/** Send another surveyor, or call? */
export type Policy = (cargo: Cargo, surveys: number, margin: number) => boolean;

export function optimalPolicy(solution: Solution = solve()): Policy {
  const lookup = new Map(solution.byCargo.map(s => [s.cargo.id, s.shouldSurvey]));
  return (cargo, surveys, margin) => lookup.get(cargo.id)?.[surveys]?.[index(margin)] === true;
}

/** "Send exactly `n`, then call." The rule a player invents on round three. */
export function fixedSurveys(n: number): Policy {
  return (_cargo, surveys) => surveys < Math.min(n, MAX_SURVEYS);
}

/** "Keep going until the reports are `n` clear." Wald's own shape. */
export function untilMargin(n: number): Policy {
  return (_cargo, surveys, margin) => surveys < MAX_SURVEYS && Math.abs(margin) < n;
}

/** Expected return of a policy, over the whole manifest. Exact. */
export function evaluate(policy: Policy): Rational {
  return CARGOES.reduce<Rational>((sum, cargo) => add(sum, mul(cargoProbability(cargo), evaluateCargo(policy, cargo))), ZERO);
}

export function evaluateCargo(policy: Policy, cargo: Cargo): Rational {
  const value: (Rational | undefined)[][] = [];
  for (let k = 0; k <= MAX_SURVEYS; k++) value[k] = new Array<Rational | undefined>(WIDTH).fill(undefined);

  for (let m = -MAX_SURVEYS; m <= MAX_SURVEYS; m++) {
    if (!isReachable(MAX_SURVEYS, m)) continue;
    value[MAX_SURVEYS]![index(m)] = bestCall(cargo, MAX_SURVEYS, m).value;
  }
  for (let k = MAX_SURVEYS - 1; k >= 0; k--) {
    for (let m = -k; m <= k; m += 2) {
      if (!isReachable(k, m)) continue;
      if (!policy(cargo, k, m)) {
        value[k]![index(m)] = bestCall(cargo, k, m).value;
        continue;
      }
      const pSound = predictiveSound(m);
      const up = value[k + 1]![index(m + 1)];
      const down = value[k + 1]![index(m - 1)];
      if (up === undefined || down === undefined) throw new Error('unreachable continuation');
      value[k]![index(m)] = add(mul(pSound, up), mul(sub(rat(1n), pSound), down));
    }
  }
  const out = value[0]![index(0)];
  if (out === undefined) throw new Error('missing value at the start');
  return out;
}

export type NamedPolicy = { readonly label: string; readonly policy: Policy; readonly note?: string };

export function strategyBand(solution: Solution = solve()): readonly NamedPolicy[] {
  return [
    { label: 'Optimal', policy: optimalPolicy(solution), note: 'the declared RTP' },
    { label: 'Send one surveyor, then call', policy: fixedSurveys(1), note: 'the printed rule' },
    { label: 'Survey until the reports are 2 clear', policy: untilMargin(2), note: "Wald's shape" },
    { label: 'Send two, then call', policy: fixedSurveys(2) },
    { label: 'Call it blind — send no one', policy: fixedSurveys(0), note: 'the impatient player' },
    { label: 'Send all five, always', policy: fixedSurveys(MAX_SURVEYS), note: 'the anxious player' },
  ];
}

/** How many surveys a round buys under `policy`, and how often it stops there. */
export function surveyDistribution(policy: Policy): readonly Rational[] {
  const stop: Rational[] = new Array<Rational>(MAX_SURVEYS + 1).fill(ZERO);

  for (const cargo of CARGOES) {
    const weight = cargoProbability(cargo);
    let reach = new Map<number, Rational>([[0, rat(1n)]]);
    for (let k = 0; k <= MAX_SURVEYS; k++) {
      const next = new Map<number, Rational>();
      for (const [m, w] of reach) {
        if (k === MAX_SURVEYS || !policy(cargo, k, m)) {
          stop[k] = add(stop[k] ?? ZERO, mul(weight, w));
          continue;
        }
        const p = predictiveSound(m);
        next.set(m + 1, add(next.get(m + 1) ?? ZERO, mul(w, p)));
        next.set(m - 1, add(next.get(m - 1) ?? ZERO, mul(w, sub(rat(1n), p))));
      }
      reach = next;
    }
  }
  return stop;
}

export function meanSurveys(policy: Policy): Rational {
  return surveyDistribution(policy).reduce<Rational>((sum, p, k) => add(sum, mul(p, rat(k))), ZERO);
}

export { index as marginIndex };
