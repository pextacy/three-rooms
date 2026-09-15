/**
 * `npm run gen:brokers` — emits `contracts/generated/Market.sol`.
 *
 * THE BROKERS' market lives in one place (`src/games/brokers/core/market.ts`).
 * This mirrors it into Solidity so the contract and the client cannot drift.
 * **Never hand-edit the output.**
 *
 * The reservation prices are emitted too, as exact fractions. The contract does
 * not use them — the optimal policy is the player's business, not the chain's —
 * but they are what the `?` panel prints, and having them in the generated file
 * means a reviewer can check the published index against the same source the
 * contract is built from.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROKER_LIST,
  HOUSE,
  WEIGHT_DENOM,
  PRICE_DENOM,
  MAX_PRICE_BP,
  MAX_PAYOUT_BP,
  TOTAL_FEES_BP,
  cumulative,
} from '../src/games/brokers/core/market';
import { reservationPrice, meanPrice } from '../src/games/brokers/core/weitzman';
import { solve, maximumPayout } from '../src/games/brokers/core/solve';
import * as R from '../src/shared/math/rational';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../contracts/generated/Market.sol');
const u = (n: number | bigint) => n.toLocaleString('en-US').replace(/,/g, '_');

const solution = solve();

/** A quote table as a Solidity if-ladder over the cumulative weights. */
const priceLadder = (quotes: readonly { priceBp: number; weight: number }[], indent = '    ') => {
  const bounds = cumulative(quotes);
  const lines: string[] = [];
  for (const [i, quote] of quotes.entries()) {
    const bound = bounds[i] ?? 0;
    if (i === quotes.length - 1) {
      lines.push(`${indent}return ${u(quote.priceBp)}; // ${(quote.priceBp / PRICE_DENOM).toFixed(4)}x`);
    } else {
      lines.push(
        `${indent}if (r < ${u(bound)}) return ${u(quote.priceBp)}; // ${(quote.priceBp / PRICE_DENOM).toFixed(4)}x @ ${(quote.weight / 100).toFixed(2)}%`,
      );
    }
  }
  return lines.join('\n');
};

const brokerBranches = BROKER_LIST.map(
  broker => `    if (id == ${broker.id}) {
${priceLadder(broker.quotes, '      ')}
    }`,
).join('\n');

const feeBranches = BROKER_LIST.map(broker => `    if (id == ${broker.id}) return ${u(broker.feeBp)}; // ${broker.name}`).join('\n');

const source = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// ===========================================================================
//  GENERATED FILE — DO NOT EDIT.
//
//  Produced by \`npm run gen:brokers\` from src/games/brokers/core/. Edit those,
//  re-run, and let the parity tests tell you what broke (claude.md §2).
//
//  Declared RTP under optimal play: ${R.toPercent(solution.rtp, 4)}%
//    exact: ${R.toExactString(solution.rtp)}
//
//  The brokers, and why the order is not the obvious one:
${BROKER_LIST.map(
  broker =>
    `//    ${broker.name.padEnd(10)} fee ${(broker.feeBp / 100).toFixed(2).padStart(5)}%   mean ${R.toFixed(meanPrice(broker), 4)}x   index ${R.toFixed(reservationPrice(broker), 4)}x`,
).join('\n')}
// ===========================================================================

library BrokerMarket {
  uint256 internal constant WEIGHT_DENOM = ${u(WEIGHT_DENOM)};
  uint256 internal constant PRICE_DENOM = ${u(PRICE_DENOM)};

  /// @dev How many brokers will look, beyond the house's own man.
  uint256 internal constant BROKERS = ${BROKER_LIST.length};

  /// @dev The largest price anybody on this floor will name.
  uint256 internal constant MAX_PRICE_BP = ${u(MAX_PRICE_BP)};

  /// @dev Every fee, if the player asks everybody.
  uint256 internal constant TOTAL_FEES_BP = ${u(TOTAL_FEES_BP)};

  /**
   * @dev The most this game can pay, exactly: the best price on the floor less
   *      the fee of the only broker who names it. Not MAX_PRICE_BP — the
   *      unreachable corner — so \`quoteCaps\` reserves what can actually be won
   *      and not a basis point more (claude.md I5).
   */
  uint256 internal constant MAX_PAYOUT_BP = ${u(MAX_PAYOUT_BP)};

  /// @dev The declared RTP under optimal play, as an exact rational. Generated
  ///      from the dynamic program; never a number typed into a contract.
  uint256 internal constant RTP_NUM = ${u(solution.rtp.n)};
  uint256 internal constant RTP_DEN = ${u(solution.rtp.d)};

  /// @dev Rejection sampling: floor(65536/10000)*10000.
  uint256 internal constant RNG_LIMIT = ${u(60_000)};
  uint256 internal constant RNG_WINDOWS = 16;

  /// @notice What the house's own man names. He looks for nothing, and first.
  function housePrice(uint256 r) internal pure returns (uint256) {
${priceLadder(HOUSE)}
  }

  /// @notice What broker \`id\` names, from the word his fee bought.
  function brokerPrice(uint256 id, uint256 r) internal pure returns (uint256) {
${brokerBranches}
    revert('brokers: no such broker');
  }

  /// @notice What broker \`id\` charges to look, whatever he ends up saying.
  function feeBp(uint256 id) internal pure returns (uint256) {
${feeBranches}
    revert('brokers: no such broker');
  }

  /// @dev Every mask of brokers who could have been asked, exclusive bound.
  uint256 internal constant MASK_LIMIT = ${1 << BROKER_LIST.length};

  /// @notice The mask bit for a broker.
  /// @dev An if-ladder rather than a shift: the mask arithmetic is the one place
  ///      an off-by-one would silently charge the wrong fee, so it is written
  ///      out and generated rather than computed in the contract.
  function bitFor(uint256 id) internal pure returns (uint256) {
${BROKER_LIST.map(broker => `    if (id == ${broker.id}) return ${1 << broker.id}; // ${broker.name}`).join('\n')}
    revert('brokers: no such broker');
  }

  /// @notice The fees owed by a set of brokers already asked.
  function feesForMask(uint256 mask) internal pure returns (uint256 total) {
    for (uint256 id = 0; id < BROKERS; id++) {
      if (mask & bitFor(id) != 0) total += feeBp(id);
    }
  }

  /// @notice Is \`price\` one somebody on this floor could actually have named?
  /// @dev Defence in depth: never settle a claim at a price we never wrote.
  function isPrice(uint256 price) internal pure returns (bool) {
${[...new Set([...HOUSE.map(q => q.priceBp), ...BROKER_LIST.flatMap(b => b.quotes.map(q => q.priceBp))])]
  .sort((a, b) => a - b)
  .map(price => `    if (price == ${String(u(price)).padStart(6)}) return true;`)
  .join('\n')}
    return false;
  }
}
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, source);
console.log(`wrote ${OUT}`);
console.log(`  ${BROKER_LIST.length} brokers + the house, max payout ${R.toFixed(maximumPayout(), 4)}x`);
console.log(`  declared RTP ${R.toPercent(solution.rtp, 4)}% = ${R.toExactString(solution.rtp)}`);
