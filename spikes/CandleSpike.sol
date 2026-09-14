// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// ============================================================================
//  SPIKE — NOT THE SHIPPING CONTRACT. Throwaway, per plan.md D0 / phases.md 0.5.
//
//  Question it exists to answer: can one ICasinoGameV2 session consume MORE
//  THAN ONE VRF word, with a player action between each draw?
//
//  The whole CANDLE design (docs.md §3.2, invariant I4) rests on that. If the
//  answer is no, the design takes the §7.4 "pre-committed policy" fallback.
//
//  Secondary questions:
//    - does reserving 24x profit at session start make a 25x payout land,
//      rather than reverting against the facet's payout cap? (I5)
//    - what does an abandoned session actually settle to? (Spike B, docs §3.4)
//
//  Constants are hand-written HERE ONLY because this file is deleted at the end
//  of phase 0. The shipping contract takes them from `npm run gen:constants`
//  (claude.md §2).
// ============================================================================

import { ICasinoGameV2, SessionContext, SessionPhase, StepResult } from '../../solidity/ICasinoGameV2.sol';

contract CandleSpikeGame is ICasinoGameV2 {
  // --- the wax ladder (docs.md §2.2) ---------------------------------------
  uint256 private constant INCHES = 5;
  uint256 private constant BP = 10_000; // wax ladder denominator (100% = 10000)
  // faceBp is the multiplier x100 (docs.md §2.1: "100 bp = 1.00x"), so the
  // payout denominator is 100 * 10000 = 1e6, NOT the 1e8 printed in docs.md
  // §3.3. With 1e8 the 25x lot pays 0.25x and quoteCaps underflows. Phase 0
  // finding — see docs.md §7.3.
  uint256 private constant PAYOUT_DENOM = 1_000_000;

  // --- the paytable (docs.md §9.1), cumulative weights out of 10_000 -------
  //   r <  6690 -> 0.00x   r < 7690 -> 0.50x   r < 9290 -> 1.00x
  //   r <  9840 -> 2.00x   r < 9980 -> 5.00x   else     -> 25.00x
  uint256 private constant MAX_FACE_BP = 2_500; // 25.00x

  // --- rejection sampling (docs.md §2.4) -----------------------------------
  //   domain 2^16 = 65536, outcomes 10000, limit = floor(65536/10000)*10000
  uint256 private constant RNG_LIMIT = 60_000;
  uint256 private constant RNG_OUTCOMES = 10_000;

  // --- actions -------------------------------------------------------------
  uint8 private constant ACTION_CLAIM = 0;
  uint8 private constant ACTION_BURN = 1;

  error CandleSpike__BadAction(uint8 action);
  error CandleSpike__BurnAtLastInch();
  error CandleSpike__BadState();

  // =========================================================================
  //  Wax ladder + paytable
  // =========================================================================

  /// @dev 100 / 85 / 70 / 55 / 40 percent, as basis points, for inch 1..5.
  function _waxBp(uint256 inch) private pure returns (uint256) {
    if (inch == 1) return 10_000;
    if (inch == 2) return 8_500;
    if (inch == 3) return 7_000;
    if (inch == 4) return 5_500;
    if (inch == 5) return 4_000;
    revert CandleSpike__BadState();
  }

  /// @dev uniform r in [0,10000) -> face value of the lot, in basis points.
  function _faceBpFor(uint256 r) private pure returns (uint256) {
    if (r < 6_690) return 0; // empty crate
    if (r < 7_690) return 50; // ship's stores    0.50x
    if (r < 9_290) return 100; // cordage         1.00x
    if (r < 9_840) return 200; // sailcloth       2.00x
    if (r < 9_980) return 500; // ordnance        5.00x
    return 2_500; //             the Sarah Christiana 25.00x
  }

  /// @dev THE one payout helper. quoteCaps, quoteRiskParams, onRandomness,
  ///      onPlayerAction and quoteForfeitPayout all route through this, so a
  ///      25x win cannot disagree with the reserve by a single base unit (I5).
  function _payout(uint256 stake, uint256 faceBp, uint256 waxBp) private pure returns (uint256) {
    return (stake * faceBp * waxBp) / PAYOUT_DENOM;
  }

  // =========================================================================
  //  Randomness — rejection sampling over 16-bit windows, never `word % n`
  // =========================================================================

  /// @dev Reads 16-bit windows from `word` starting at `cursor`, rejecting any
  ///      window >= 60000 so the surviving range is an exact multiple of 10000.
  ///      Exhausting all 16 windows (p ~ 1.4e-18) rehashes rather than reverts,
  ///      so the path is total.
  function _draw(bytes32 word, uint256 cursor) private pure returns (uint256 r) {
    bytes32 seed = word;
    uint256 idx = cursor;
    while (true) {
      if (idx < 16) {
        uint256 v = (uint256(seed) >> (240 - idx * 16)) & 0xFFFF;
        idx++;
        if (v < RNG_LIMIT) return v % RNG_OUTCOMES;
        continue;
      }
      seed = keccak256(abi.encodePacked(seed));
      idx = 0;
    }
  }

  // =========================================================================
  //  gameState codec — `abi.encodePacked(uint8 inch, uint16 faceBp, uint8 hasLot)`
  // =========================================================================

  function _encodeState(uint8 inch, uint16 faceBp, bool hasLot) private pure returns (bytes memory) {
    return abi.encodePacked(inch, faceBp, hasLot ? uint8(1) : uint8(0));
  }

  function _decodeState(bytes memory s) private pure returns (uint8 inch, uint16 faceBp, bool hasLot) {
    if (s.length != 4) revert CandleSpike__BadState();
    inch = uint8(s[0]);
    faceBp = uint16(uint8(s[1])) << 8 | uint16(uint8(s[2]));
    hasLot = uint8(s[3]) == 1;
  }

  // =========================================================================
  //  ICasinoGameV2
  // =========================================================================

  /// @dev maxReservedProfit is the peak the vault might owe ABOVE the escrowed
  ///      stake: 25x - 1x = 24x. No slack (I5).
  function quoteCaps(
    uint256 wager,
    bytes calldata
  ) external pure returns (uint256 maxEscrowStake, uint256 maxReservedProfit) {
    maxEscrowStake = wager;
    uint256 maxPayout = _payout(wager, MAX_FACE_BP, _waxBp(1)); // 25x, first inch only
    maxReservedProfit = maxPayout > wager ? maxPayout - wager : 0;
  }

  /// @dev probabilityWad is the TOP TIER only: P(payout = 25x) = P(25x lot at
  ///      inch 1) = 0.002. Not "any win". maxPayout/wager = 25 < the default
  ///      heavy-tail multiplier threshold of 100, so the tiered jackpot path
  ///      does not engage and subJackpotVarianceScaled stays 0.
  function quoteRiskParams(
    uint256 wager,
    bytes calldata
  )
    external
    pure
    returns (uint256 maxPayout, uint256 probabilityWad, uint256 expectedPayout, uint256 subJackpotVarianceScaled)
  {
    maxPayout = _payout(wager, MAX_FACE_BP, _waxBp(1));
    probabilityWad = 2e15; // 0.20%
    // Optimal play is the supremum over policies, so quoting it is the honest
    // worst case for the vault. Exact rational from docs.md §9.4.
    expectedPayout = (wager * 7_577_820_426_157) / 7_812_500_000_000;
    subJackpotVarianceScaled = 0;
  }

  /// @dev Pure in (wagerBase, gameData) and writes nothing, so the production
  ///      double-call (once with sessionId == 0) is idempotent for free (I6).
  function onSessionStart(SessionContext calldata ctx) external pure returns (StepResult memory r) {
    uint256 maxPayout = _payout(ctx.wagerBase, MAX_FACE_BP, _waxBp(1));
    r.newGameState = _encodeState(1, 0, false); // inch 1, no lot on the table yet
    r.escrowDelta = 0;
    // Reserve the full 24x now. The facet caps payout at
    // escrowedStake + reservedProfit, and reservedProfit starts at ZERO — so
    // without this every win above 1x reverts.
    r.reservedProfitDelta = int256(maxPayout - ctx.wagerBase);
    r.nextPhase = SessionPhase.WAITING_RANDOMNESS;
    r.requestRandomnessNow = true;
    r.payout = 0;
  }

  /// @dev THE SPIKE A QUESTION. `BURN` asks the facet for another word, from a
  ///      non-terminal phase, for the 2nd..5th time in one session.
  function onPlayerAction(
    SessionContext calldata ctx,
    bytes calldata actionData
  ) external pure returns (StepResult memory r) {
    (uint8 inch, uint16 faceBp, bool hasLot) = _decodeState(ctx.gameState);
    if (!hasLot) revert CandleSpike__BadState();
    uint8 action = uint8(actionData[0]);

    if (action == ACTION_CLAIM) {
      r.newGameState = _encodeState(inch, faceBp, true);
      r.reservedProfitDelta = 0; // I7 — releasing here would collapse the cap
      r.nextPhase = SessionPhase.SETTLED;
      r.requestRandomnessNow = false;
      r.payout = _payout(ctx.escrowedStake, faceBp, _waxBp(inch));
      return r;
    }

    if (action == ACTION_BURN) {
      // The fifth inch has no exit but a claim (docs.md §2.5).
      if (inch >= INCHES) revert CandleSpike__BurnAtLastInch();
      r.newGameState = _encodeState(inch + 1, 0, false);
      r.reservedProfitDelta = 0;
      r.nextPhase = SessionPhase.WAITING_RANDOMNESS;
      r.requestRandomnessNow = true; // <-- draw number 2, 3, 4, 5
      r.payout = 0;
      return r;
    }

    revert CandleSpike__BadAction(action);
  }

  function onRandomness(SessionContext calldata ctx, bytes32 randomness) external pure returns (StepResult memory r) {
    (uint8 inch, , bool hasLot) = _decodeState(ctx.gameState);
    if (hasLot) revert CandleSpike__BadState();

    uint16 faceBp = uint16(_faceBpFor(_draw(randomness, 0)));
    r.newGameState = _encodeState(inch, faceBp, true);
    r.reservedProfitDelta = 0; // I7
    r.escrowDelta = 0;

    if (inch >= INCHES) {
      // The candle gutters: the lot on the table is claimed automatically.
      r.nextPhase = SessionPhase.SETTLED;
      r.requestRandomnessNow = false;
      r.payout = _payout(ctx.escrowedStake, faceBp, _waxBp(inch));
      return r;
    }

    r.nextPhase = SessionPhase.WAITING_PLAYER_ACTION;
    r.requestRandomnessNow = false;
    r.payout = 0;
  }

  /// @dev SPIKE B. The lot on the table is already revealed, so mid-round value
  ///      is fully determined by revealed state (the mines-style case the SDK
  ///      says may quote a real number). The facet pays 90% of this.
  function quoteForfeitPayout(SessionContext calldata ctx) external pure returns (uint256) {
    (uint8 inch, uint16 faceBp, bool hasLot) = _decodeState(ctx.gameState);
    if (!hasLot) return 0;
    return _payout(ctx.escrowedStake, faceBp, _waxBp(inch));
  }
}
