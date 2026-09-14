// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// ===========================================================================
//  GENERATED FILE — DO NOT EDIT.
//
//  Produced by `npm run gen:survey` from src/games/survey/core/. Edit those,
//  re-run, and let the parity tests tell you what broke (claude.md §2).
//
//  Declared RTP under optimal play: 97.0303%
//    exact: 49679521 / 51200000
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
  uint256 internal constant DECLINE_BP = 50;

  /// @dev Rejection sampling for the manifest: floor(65536/10000)*10000.
  uint256 internal constant RNG_LIMIT = 60_000;
  uint256 internal constant RNG_WINDOWS = 16;

  /// @dev Belief draws need a finer grid than the manifest: a report's odds run
  ///      as fine as 2/731. Uniform on [0, DRAW_SPACE).
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
    return valueBp == 50; // the decline payout
  }

  /// @notice What remains of the premium after `surveys` surveyors.
  function premiumBpAt(uint256 surveys) internal pure returns (uint256) {
    if (surveys == 0) return 10_000;
    if (surveys == 1) return 9_400;
    if (surveys == 2) return 8_800;
    if (surveys == 3) return 8_200;
    if (surveys == 4) return 7_600;
    if (surveys == 5) return 7_000;
    revert('survey: too many surveyors');
  }

  /// @notice P(the next report says SOUND | margin), as an exact fraction.
  /// @dev Returned as (numerator, denominator) and compared by
  ///      cross-multiplication, so no probability is rounded into a constant.
  function predictiveSound(int256 margin) internal pure returns (uint256, uint256) {
    if (margin == -5) return (   735,   2924); // predictive 0.251368
    if (margin == -4) return (   249,    980); // predictive 0.254082
    if (margin == -3) return (    87,    332); // predictive 0.262048
    if (margin == -2) return (    33,    116); // predictive 0.284483
    if (margin == -1) return (    15,     44); // predictive 0.340909
    if (margin ==  0) return (     9,     20); // predictive 0.450000
    if (margin ==  1) return (     7,     12); // predictive 0.583333
    if (margin ==  2) return (    19,     28); // predictive 0.678571
    if (margin ==  3) return (    55,     76); // predictive 0.723684
    if (margin ==  4) return (   163,    220); // predictive 0.740909
    if (margin ==  5) return (   487,    652); // predictive 0.746933
    revert('survey: margin out of range');
  }

  /// @notice P(she was sound | margin), drawn only once the call is committed.
  function posteriorSound(int256 margin) internal pure returns (uint256, uint256) {
    if (margin == -5) return (     2,    731); // posterior  0.002736
    if (margin == -4) return (     2,    245); // posterior  0.008163
    if (margin == -3) return (     2,     83); // posterior  0.024096
    if (margin == -2) return (     2,     29); // posterior  0.068966
    if (margin == -1) return (     2,     11); // posterior  0.181818
    if (margin ==  0) return (     2,      5); // posterior  0.400000
    if (margin ==  1) return (     2,      3); // posterior  0.666667
    if (margin ==  2) return (     6,      7); // posterior  0.857143
    if (margin ==  3) return (    18,     19); // posterior  0.947368
    if (margin ==  4) return (    54,     55); // posterior  0.981818
    if (margin ==  5) return (   162,    163); // posterior  0.993865
    revert('survey: margin out of range');
  }
}
