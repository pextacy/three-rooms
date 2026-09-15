// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// ===========================================================================
//  GENERATED FILE — DO NOT EDIT.
//
//  Produced by `npm run gen:survey` from src/games/survey/core/. Edit those,
//  re-run, and let the parity tests tell you what broke (claude.md §2).
//
//  Declared RTP under optimal play: 97.4141%
//    exact: 60883787 / 62500000
// ===========================================================================

library SurveyManifest {
  uint256 internal constant WEIGHT_DENOM = 10_000;
  uint256 internal constant VALUE_DENOM = 100;
  uint256 internal constant PREMIUM_DENOM = 10_000;
  uint256 internal constant PAYOUT_DENOM = 1_000_000;

  /// @dev How many surveyors may be sent, at most.
  uint256 internal constant MAX_SURVEYS = 5;

  /// @dev The richest cargo. Drives quoteCaps.
  uint256 internal constant MAX_VALUE_BP = 2_000;

  /// @dev Declining hands back this much of the premium, whatever she was.
  uint256 internal constant DECLINE_BP = 60;

  /// @dev The declared RTP under optimal play, as an exact rational — the
  ///      supremum over policies, and therefore the honest worst case for the
  ///      vault. `quoteRiskParams` quotes it rather than carrying a number a
  ///      hand could edit.
  uint256 internal constant RTP_NUM = 60_883_787;
  uint256 internal constant RTP_DEN = 62_500_000;

  /// @dev Rejection sampling for the manifest: floor(65536/10000)*10000.
  uint256 internal constant RNG_LIMIT = 60_000;
  uint256 internal constant RNG_WINDOWS = 16;

  /// @dev Belief draws need a finer grid than the manifest: a report's odds run
  ///      as fine as 582/1375. Uniform on [0, DRAW_SPACE).
  uint256 internal constant DRAW_SPACE = 1_000_000;
  /// @dev The largest multiple of DRAW_SPACE inside 2^32.
  uint256 internal constant FINE_LIMIT = 4_294_000_000;

  /// @notice Maps a uniform draw in [0, WEIGHT_DENOM) to a cargo's value.
  function valueBpFor(uint256 r) internal pure returns (uint256) {
    if (r < 3_000) return  110; // 1.10x  Salt
    if (r < 5_500) return  140; // 1.40x  Coal
    if (r < 7_500) return  180; // 1.80x  Timber
    if (r < 9_000) return  250; // 2.50x  Wine
    if (r < 9_800) return  500; // 5.00x  Silk
    return 2000; // 20.00x  Indigo
  }

  /// @notice Is `valueBp` one this manifest actually issues?
  /// @dev Defence in depth: never price a stake against a cargo we never wrote.
  function isValueBp(uint256 valueBp) internal pure returns (bool) {
    if (valueBp ==  110) return true; // Salt
    if (valueBp ==  140) return true; // Coal
    if (valueBp ==  180) return true; // Timber
    if (valueBp ==  250) return true; // Wine
    if (valueBp ==  500) return true; // Silk
    if (valueBp == 2000) return true; // Indigo
    return valueBp == 60; // the decline payout
  }

  /// @notice What remains of the premium after `surveys` surveyors.
  function premiumBpAt(uint256 surveys) internal pure returns (uint256) {
    if (surveys == 0) return 10_000;
    if (surveys == 1) return 9_850;
    if (surveys == 2) return 9_700;
    if (surveys == 3) return 9_550;
    if (surveys == 4) return 9_400;
    if (surveys == 5) return 9_250;
    revert('survey: too many surveyors');
  }

  /// @notice P(the next report says SOUND | margin), as an exact fraction.
  /// @dev Returned as (numerator, denominator) and compared by
  ///      cross-multiplication, so no probability is rounded into a constant.
  function predictiveSound(int256 margin) internal pure returns (uint256, uint256) {
    if (margin == -5) return (   330,    793); // predictive 0.416141
    if (margin == -4) return (   582,   1375); // predictive 0.423273
    if (margin == -3) return (    42,     97); // predictive 0.432990
    if (margin == -2) return (    78,    175); // predictive 0.445714
    if (margin == -1) return (     6,     13); // predictive 0.461538
    if (margin ==  0) return (    12,     25); // predictive 0.480000
    if (margin ==  1) return (     1,      2); // predictive 0.500000
    if (margin ==  2) return (    13,     25); // predictive 0.520000
    if (margin ==  3) return (     7,     13); // predictive 0.538462
    if (margin ==  4) return (    97,    175); // predictive 0.554286
    if (margin ==  5) return (    55,     97); // predictive 0.567010
    revert('survey: margin out of range');
  }

  /// @notice P(she was sound | margin), drawn only once the call is committed.
  function posteriorSound(int256 margin) internal pure returns (uint256, uint256) {
    if (margin == -5) return (    64,    793); // posterior  0.080706
    if (margin == -4) return (    32,    275); // posterior  0.116364
    if (margin == -3) return (    16,     97); // posterior  0.164948
    if (margin == -2) return (     8,     35); // posterior  0.228571
    if (margin == -1) return (     4,     13); // posterior  0.307692
    if (margin ==  0) return (     2,      5); // posterior  0.400000
    if (margin ==  1) return (     1,      2); // posterior  0.500000
    if (margin ==  2) return (     3,      5); // posterior  0.600000
    if (margin ==  3) return (     9,     13); // posterior  0.692308
    if (margin ==  4) return (    27,     35); // posterior  0.771429
    if (margin ==  5) return (    81,     97); // posterior  0.835052
    revert('survey: margin out of range');
  }
}
