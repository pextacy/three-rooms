/**
 * `npm run gen:constants` — emits `contracts/generated/Paytable.sol`.
 *
 * The paytable lives in ONE place (`src/game/paytable.ts`). This mirrors it into
 * Solidity so the contract and the client cannot drift (claude.md §2).
 * **Never hand-edit the output.**
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOTS, CUMULATIVE_WEIGHTS, WEIGHT_DENOM, FACE_DENOM, MAX_FACE_BP, TOP_TIER_WEIGHT } from '../src/games/candle/core/paytable';
import { INCHES, WAX_BP, PAYOUT_DENOM } from '../src/games/candle/core/wax';
import { solve } from '../src/games/candle/core/solve';
import * as R from '../src/shared/math/rational';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../contracts/generated/Paytable.sol');

const solution = solve();

// probabilityWad for quoteRiskParams is the TOP TIER's marginal probability —
// P(payout = 25x) = P(the 25x lot at the first inch) — not "any win".
const topTierWad = (BigInt(TOP_TIER_WEIGHT) * 10n ** 18n) / BigInt(WEIGHT_DENOM);

// expectedPayout is quoted at the OPTIMAL-play RTP. Optimal is the supremum over
// policies by definition, so this is the honest worst case for the vault.
const rtp = solution.rtp;

const lotRows = LOTS.map((lot, i) => {
  const cumulative = CUMULATIVE_WEIGHTS[i];
  if (cumulative === undefined) throw new Error(`missing cumulative weight ${i}`);
  return { ...lot, cumulative };
});

const branches = lotRows
  .slice(0, -1)
  .map(
    lot =>
      `    if (r < ${lot.cumulative.toLocaleString('en-US').replace(/,/g, '_')}) return ${String(lot.faceBp).padStart(4)}; // ${(lot.faceBp / FACE_DENOM).toFixed(2)}x  ${lot.name}`,
  )
  .join('\n');

const last = lotRows[lotRows.length - 1];
if (last === undefined) throw new Error('empty paytable');

const faceChecks = LOTS.map(lot => `    if (faceBp == ${String(lot.faceBp).padStart(4)}) return true; // ${(lot.faceBp / FACE_DENOM).toFixed(2)}x  ${lot.name}`).join('\n');

const waxBranches = WAX_BP.map(
  (bp, i) => `    if (inch == ${i + 1}) return ${bp.toLocaleString('en-US').replace(/,/g, '_')};`,
).join('\n');

const source = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// ===========================================================================
//  GENERATED FILE — DO NOT EDIT.
//
//  Produced by \`npm run gen:constants\` from src/game/paytable.ts,
//  src/game/wax.ts and src/game/solve.ts. Edit those, re-run, and let the
//  parity tests tell you what broke (claude.md §2).
//
//  Declared RTP under optimal play: ${R.toPercent(rtp, 4)}%
//    exact: ${R.toExactString(rtp)}
// ===========================================================================

library CandlePaytable {
  /// @dev Weights are out of this. The paytable asserts they sum to it exactly.
  uint256 internal constant WEIGHT_DENOM = ${WEIGHT_DENOM.toLocaleString('en-US').replace(/,/g, '_')};

  /// @dev faceBp is the multiplier x100 — "100 bp = 1.00x" — so 25x is 2500.
  uint256 internal constant FACE_DENOM = ${FACE_DENOM};

  /// @dev Five pins, five inches, five lots.
  uint256 internal constant INCHES = ${INCHES};

  /// @dev faceBp carries a denominator of ${FACE_DENOM} and waxBp one of
  ///      ${WEIGHT_DENOM.toLocaleString('en-US').replace(/,/g, '_')}, so a payout divides by their product.
  uint256 internal constant PAYOUT_DENOM = ${PAYOUT_DENOM.toLocaleString('en-US').replace(/,/g, '_')};

  /// @dev The largest face value the paytable can produce. Drives quoteCaps.
  uint256 internal constant MAX_FACE_BP = ${MAX_FACE_BP.toLocaleString('en-US').replace(/,/g, '_')};

  /// @dev Rejection sampling: the largest multiple of WEIGHT_DENOM below 2^16.
  ///      \`limit = floor(65536 / ${WEIGHT_DENOM}) * ${WEIGHT_DENOM}\`. NEVER use \`word % n\`.
  uint256 internal constant RNG_LIMIT = ${(Math.floor(65536 / WEIGHT_DENOM) * WEIGHT_DENOM).toLocaleString('en-US').replace(/,/g, '_')};

  /// @dev Sixteen 16-bit windows in a 256-bit word.
  uint256 internal constant RNG_WINDOWS = 16;

  /// @dev P(payout = max) in WAD, for quoteRiskParams. TOP TIER ONLY.
  uint256 internal constant TOP_TIER_PROBABILITY_WAD = ${topTierWad.toLocaleString('en-US').replace(/,/g, '_')};

  /// @dev Declared RTP as an exact rational, for quoteRiskParams.expectedPayout.
  uint256 internal constant RTP_NUMERATOR = ${rtp.n.toLocaleString('en-US').replace(/,/g, '_')};
  uint256 internal constant RTP_DENOMINATOR = ${rtp.d.toLocaleString('en-US').replace(/,/g, '_')};

  /// @notice Maps a uniform draw in [0, WEIGHT_DENOM) to a lot's face value.
  /// @dev Mirrors \`lotForDraw\` in src/game/paytable.ts, branch for branch.
  function faceBpFor(uint256 r) internal pure returns (uint256) {
${branches}
    return ${String(last.faceBp)}; // ${(last.faceBp / FACE_DENOM).toFixed(2)}x  ${last.name}
  }

  /// @notice Wax remaining at \`inch\`, in basis points. 100% = ${WEIGHT_DENOM.toLocaleString('en-US').replace(/,/g, '_')}.
  function waxBpAt(uint256 inch) internal pure returns (uint256) {
${waxBranches}
    revert('candle: inch out of range');
  }

  /// @notice Is \`faceBp\` one of this paytable's face values?
  /// @dev Defence in depth. \`gameState\` reaches the contract as calldata the
  ///      player echoes back; the facet's keccak commitment is what actually
  ///      stops it being forged, but the game should not multiply a stake by a
  ///      number it never issued even if that commitment were ever weakened.
  function isFaceBp(uint256 faceBp) internal pure returns (bool) {
${faceChecks}
    return false;
  }
}
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, source);
console.log(`wrote ${OUT}`);
console.log(`  ${LOTS.length} lots, ${INCHES} inches, max ${MAX_FACE_BP / FACE_DENOM}x`);
console.log(`  declared RTP ${R.toPercent(rtp, 4)}% = ${R.toExactString(rtp)}`);
