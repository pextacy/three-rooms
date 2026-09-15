// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// ===========================================================================
//  GENERATED FILE — DO NOT EDIT.
//
//  Produced by `npm run gen:brokers` from src/games/brokers/core/. Edit those,
//  re-run, and let the parity tests tell you what broke (claude.md §2).
//
//  Declared RTP under optimal play: 96.9637%
//    exact: 1551418623 / 1600000000
//
//  The brokers, and why the order is not the obvious one:
//    Stubbs     fee  6.00%   mean 0.7490x   index 0.8975x
//    Marchmont  fee  4.50%   mean 0.6225x   index 0.9500x
//    Delane     fee  3.25%   mean 0.4995x   index 1.3714x
//    Vanderdek  fee  0.95%   mean 0.3763x   index 1.2000x
// ===========================================================================

library BrokerMarket {
  uint256 internal constant WEIGHT_DENOM = 10_000;
  uint256 internal constant PRICE_DENOM = 10_000;

  /// @dev How many brokers will look, beyond the house's own man.
  uint256 internal constant BROKERS = 4;

  /// @dev The largest price anybody on this floor will name.
  uint256 internal constant MAX_PRICE_BP = 50_000;

  /// @dev Every fee, if the player asks everybody.
  uint256 internal constant TOTAL_FEES_BP = 1_470;

  /**
   * @dev The most this game can pay, exactly: the best price on the floor less
   *      the fee of the only broker who names it. Not MAX_PRICE_BP — the
   *      unreachable corner — so `quoteCaps` reserves what can actually be won
   *      and not a basis point more (claude.md I5).
   */
  uint256 internal constant MAX_PAYOUT_BP = 49_905;

  /// @dev The declared RTP under optimal play, as an exact rational. Generated
  ///      from the dynamic program; never a number typed into a contract.
  uint256 internal constant RTP_NUM = 1_551_418_623;
  uint256 internal constant RTP_DEN = 1_600_000_000;

  /// @dev Rejection sampling: floor(65536/10000)*10000.
  uint256 internal constant RNG_LIMIT = 60_000;
  uint256 internal constant RNG_WINDOWS = 16;

  /// @notice What the house's own man names. He looks for nothing, and first.
  function housePrice(uint256 r) internal pure returns (uint256) {
    if (r < 5_000) return 8_500; // 0.8500x @ 50.00%
    return 10_200; // 1.0200x
  }

  /// @notice What broker `id` names, from the word his fee bought.
  function brokerPrice(uint256 id, uint256 r) internal pure returns (uint256) {
    if (id == 0) {
      if (r < 6_000) return 5_500; // 0.5500x @ 60.00%
      if (r < 8_700) return 9_500; // 0.9500x @ 27.00%
      return 12_500; // 1.2500x
    }
    if (id == 1) {
      if (r < 6_000) return 3_500; // 0.3500x @ 60.00%
      if (r < 8_500) return 9_000; // 0.9000x @ 25.00%
      return 12_500; // 1.2500x
    }
    if (id == 2) {
      if (r < 8_000) return 4_000; // 0.4000x @ 80.00%
      if (r < 9_650) return 6_000; // 0.6000x @ 16.50%
      return 23_000; // 2.3000x
    }
    if (id == 3) {
      if (r < 9_000) return 3_500; // 0.3500x @ 90.00%
      if (r < 9_975) return 5_000; // 0.5000x @ 9.75%
      return 50_000; // 5.0000x
    }
    revert('brokers: no such broker');
  }

  /// @notice What broker `id` charges to look, whatever he ends up saying.
  function feeBp(uint256 id) internal pure returns (uint256) {
    if (id == 0) return 600; // Stubbs
    if (id == 1) return 450; // Marchmont
    if (id == 2) return 325; // Delane
    if (id == 3) return 95; // Vanderdek
    revert('brokers: no such broker');
  }

  /// @dev Every mask of brokers who could have been asked, exclusive bound.
  uint256 internal constant MASK_LIMIT = 16;

  /// @notice The mask bit for a broker.
  /// @dev An if-ladder rather than a shift: the mask arithmetic is the one place
  ///      an off-by-one would silently charge the wrong fee, so it is written
  ///      out and generated rather than computed in the contract.
  function bitFor(uint256 id) internal pure returns (uint256) {
    if (id == 0) return 1; // Stubbs
    if (id == 1) return 2; // Marchmont
    if (id == 2) return 4; // Delane
    if (id == 3) return 8; // Vanderdek
    revert('brokers: no such broker');
  }

  /// @notice The fees owed by a set of brokers already asked.
  function feesForMask(uint256 mask) internal pure returns (uint256 total) {
    for (uint256 id = 0; id < BROKERS; id++) {
      if (mask & bitFor(id) != 0) total += feeBp(id);
    }
  }

  /// @notice Is `price` one somebody on this floor could actually have named?
  /// @dev Defence in depth: never settle a claim at a price we never wrote.
  function isPrice(uint256 price) internal pure returns (bool) {
    if (price ==  3_500) return true;
    if (price ==  4_000) return true;
    if (price ==  5_000) return true;
    if (price ==  5_500) return true;
    if (price ==  6_000) return true;
    if (price ==  8_500) return true;
    if (price ==  9_000) return true;
    if (price ==  9_500) return true;
    if (price == 10_200) return true;
    if (price == 12_500) return true;
    if (price == 23_000) return true;
    if (price == 50_000) return true;
    return false;
  }
}
