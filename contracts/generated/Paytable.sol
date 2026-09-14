// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// ===========================================================================
//  GENERATED FILE — DO NOT EDIT.
//
//  Produced by `npm run gen:constants` from src/game/paytable.ts,
//  src/game/wax.ts and src/game/solve.ts. Edit those, re-run, and let the
//  parity tests tell you what broke (claude.md §2).
//
//  Declared RTP under optimal play: 96.9961%
//    exact: 7577820426157 / 7812500000000
// ===========================================================================

library CandlePaytable {
  /// @dev Weights are out of this. The paytable asserts they sum to it exactly.
  uint256 internal constant WEIGHT_DENOM = 10_000;

  /// @dev faceBp is the multiplier x100 — "100 bp = 1.00x" — so 25x is 2500.
  uint256 internal constant FACE_DENOM = 100;

  /// @dev Five pins, five inches, five lots.
  uint256 internal constant INCHES = 5;

  /// @dev faceBp carries a denominator of 100 and waxBp one of
  ///      10_000, so a payout divides by their product.
  uint256 internal constant PAYOUT_DENOM = 1_000_000;

  /// @dev The largest face value the paytable can produce. Drives quoteCaps.
  uint256 internal constant MAX_FACE_BP = 2_500;

  /// @dev Rejection sampling: the largest multiple of WEIGHT_DENOM below 2^16.
  ///      `limit = floor(65536 / 10000) * 10000`. NEVER use `word % n`.
  uint256 internal constant RNG_LIMIT = 60_000;

  /// @dev Sixteen 16-bit windows in a 256-bit word.
  uint256 internal constant RNG_WINDOWS = 16;

  /// @dev P(payout = max) in WAD, for quoteRiskParams. TOP TIER ONLY.
  uint256 internal constant TOP_TIER_PROBABILITY_WAD = 2_000_000_000_000_000;

  /// @dev Declared RTP as an exact rational, for quoteRiskParams.expectedPayout.
  uint256 internal constant RTP_NUMERATOR = 7_577_820_426_157;
  uint256 internal constant RTP_DENOMINATOR = 7_812_500_000_000;

  /// @notice Maps a uniform draw in [0, WEIGHT_DENOM) to a lot's face value.
  /// @dev Mirrors `lotForDraw` in src/game/paytable.ts, branch for branch.
  function faceBpFor(uint256 r) internal pure returns (uint256) {
    if (r < 6_690) return    0; // 0.00x  Empty crate
    if (r < 7_690) return   50; // 0.50x  Ship's stores
    if (r < 9_290) return  100; // 1.00x  Cordage
    if (r < 9_840) return  200; // 2.00x  Sailcloth
    if (r < 9_980) return  500; // 5.00x  Ordnance
    return 2500; // 25.00x  The Sarah Christiana
  }

  /// @notice Wax remaining at `inch`, in basis points. 100% = 10_000.
  function waxBpAt(uint256 inch) internal pure returns (uint256) {
    if (inch == 1) return 10_000;
    if (inch == 2) return 8_500;
    if (inch == 3) return 7_000;
    if (inch == 4) return 5_500;
    if (inch == 5) return 4_000;
    revert('candle: inch out of range');
  }

  /// @notice Is `faceBp` one of this paytable's face values?
  /// @dev Defence in depth. `gameState` reaches the contract as calldata the
  ///      player echoes back; the facet's keccak commitment is what actually
  ///      stops it being forged, but the game should not multiply a stake by a
  ///      number it never issued even if that commitment were ever weakened.
  function isFaceBp(uint256 faceBp) internal pure returns (bool) {
    if (faceBp ==    0) return true; // 0.00x  Empty crate
    if (faceBp ==   50) return true; // 0.50x  Ship's stores
    if (faceBp ==  100) return true; // 1.00x  Cordage
    if (faceBp ==  200) return true; // 2.00x  Sailcloth
    if (faceBp ==  500) return true; // 5.00x  Ordnance
    if (faceBp == 2500) return true; // 25.00x  The Sarah Christiana
    return false;
  }
}
