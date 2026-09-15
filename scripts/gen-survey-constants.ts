/**
 * `npm run gen:survey` — emits `contracts/generated/Manifest.sol`.
 *
 * THE SURVEY's manifest and belief thresholds live in one place
 * (`src/games/survey/core/`). This mirrors them into Solidity so the contract
 * and the client cannot drift. **Never hand-edit the output.**
 *
 * The belief thresholds are emitted as exact fractions, not as rounded
 * probabilities: the contract compares by cross-multiplication, so no
 * probability is ever rounded into a constant.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARGOES, CUMULATIVE_WEIGHTS, WEIGHT_DENOM, VALUE_DENOM, MAX_SURVEYS, MAX_VALUE_BP, PREMIUM_BP, DECLINE_BP, PAYOUT_DENOM } from '../src/games/survey/core/vessel';
import { posteriorSound, predictiveSound } from '../src/games/survey/core/belief';
import { solve } from '../src/games/survey/core/solve';
import { DRAW_SPACE } from '../src/games/survey/core/draw';
import * as R from '../src/shared/math/rational';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../contracts/generated/Manifest.sol');
const u = (n: number | bigint) => n.toLocaleString('en-US').replace(/,/g, '_');

const solution = solve();
const margins: number[] = [];
for (let m = -MAX_SURVEYS; m <= MAX_SURVEYS; m++) margins.push(m);

/** The finest fraction the belief ever produces, so the comment cannot go stale. */
const finest = margins
  .flatMap(m => [posteriorSound(m), predictiveSound(m)])
  .reduce((worst, value) => (value.d > worst.d ? value : worst));

const cargoBranches = CARGOES.slice(0, -1)
  .map((c, i) => `    if (r < ${u(CUMULATIVE_WEIGHTS[i] ?? 0)}) return ${String(c.valueBp).padStart(4)}; // ${(c.valueBp / VALUE_DENOM).toFixed(2)}x  ${c.name}`)
  .join('\n');
const last = CARGOES[CARGOES.length - 1]!;

const premiumBranches = PREMIUM_BP.map((bp, i) => `    if (surveys == ${i}) return ${u(bp)};`).join('\n');

/** `margin -> (numerator, denominator)` for a probability, as exact integers. */
const fractionBranches = (label: string, f: (m: number) => R.Rational) =>
  margins
    .map(m => {
      const v = f(m);
      return `    if (margin == ${String(m).padStart(2)}) return (${String(v.n).padStart(6)}, ${String(v.d).padStart(6)}); // ${label} ${R.toFixed(v, 6)}`;
    })
    .join('\n');

const source = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// ===========================================================================
//  GENERATED FILE — DO NOT EDIT.
//
//  Produced by \`npm run gen:survey\` from src/games/survey/core/. Edit those,
//  re-run, and let the parity tests tell you what broke (claude.md §2).
//
//  Declared RTP under optimal play: ${R.toPercent(solution.rtp, 4)}%
//    exact: ${R.toExactString(solution.rtp)}
// ===========================================================================

library SurveyManifest {
  uint256 internal constant WEIGHT_DENOM = ${u(WEIGHT_DENOM)};
  uint256 internal constant VALUE_DENOM = ${VALUE_DENOM};
  uint256 internal constant PREMIUM_DENOM = ${u(10_000)};
  uint256 internal constant PAYOUT_DENOM = ${u(PAYOUT_DENOM)};

  /// @dev How many surveyors may be sent, at most.
  uint256 internal constant MAX_SURVEYS = ${MAX_SURVEYS};

  /// @dev The richest cargo. Drives quoteCaps.
  uint256 internal constant MAX_VALUE_BP = ${u(MAX_VALUE_BP)};

  /// @dev Declining hands back this much of the premium, whatever she was.
  uint256 internal constant DECLINE_BP = ${DECLINE_BP};

  /// @dev The declared RTP under optimal play, as an exact rational — the
  ///      supremum over policies, and therefore the honest worst case for the
  ///      vault. \`quoteRiskParams\` quotes it rather than carrying a number a
  ///      hand could edit.
  uint256 internal constant RTP_NUM = ${u(solution.rtp.n)};
  uint256 internal constant RTP_DEN = ${u(solution.rtp.d)};

  /// @dev Rejection sampling for the manifest: floor(65536/10000)*10000.
  uint256 internal constant RNG_LIMIT = ${u(60_000)};
  uint256 internal constant RNG_WINDOWS = 16;

  /// @dev Belief draws need a finer grid than the manifest: a report's odds run
  ///      as fine as ${finest.n}/${finest.d}. Uniform on [0, DRAW_SPACE).
  uint256 internal constant DRAW_SPACE = ${u(DRAW_SPACE)};
  /// @dev The largest multiple of DRAW_SPACE inside 2^32.
  uint256 internal constant FINE_LIMIT = ${u(Math.floor(2 ** 32 / DRAW_SPACE) * DRAW_SPACE)};

  /// @notice Maps a uniform draw in [0, WEIGHT_DENOM) to a cargo's value.
  function valueBpFor(uint256 r) internal pure returns (uint256) {
${cargoBranches}
    return ${last.valueBp}; // ${(last.valueBp / VALUE_DENOM).toFixed(2)}x  ${last.name}
  }

  /// @notice Is \`valueBp\` one this manifest actually issues?
  /// @dev Defence in depth: never price a stake against a cargo we never wrote.
  function isValueBp(uint256 valueBp) internal pure returns (bool) {
${CARGOES.map(c => `    if (valueBp == ${String(c.valueBp).padStart(4)}) return true; // ${c.name}`).join('\n')}
    return valueBp == ${DECLINE_BP}; // the decline payout
  }

  /// @notice What remains of the premium after \`surveys\` surveyors.
  function premiumBpAt(uint256 surveys) internal pure returns (uint256) {
${premiumBranches}
    revert('survey: too many surveyors');
  }

  /// @notice P(the next report says SOUND | margin), as an exact fraction.
  /// @dev Returned as (numerator, denominator) and compared by
  ///      cross-multiplication, so no probability is rounded into a constant.
  function predictiveSound(int256 margin) internal pure returns (uint256, uint256) {
${fractionBranches('predictive', predictiveSound)}
    revert('survey: margin out of range');
  }

  /// @notice P(she was sound | margin), drawn only once the call is committed.
  function posteriorSound(int256 margin) internal pure returns (uint256, uint256) {
${fractionBranches('posterior ', posteriorSound)}
    revert('survey: margin out of range');
  }
}
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, source);
console.log(`wrote ${OUT}`);
console.log(`  ${CARGOES.length} cargoes, ${MAX_SURVEYS} surveyors, max ${MAX_VALUE_BP / VALUE_DENOM}x`);
console.log(`  declared RTP ${R.toPercent(solution.rtp, 4)}% = ${R.toExactString(solution.rtp)}`);
