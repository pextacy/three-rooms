// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ICasinoGameV2, SessionContext, SessionPhase, StepResult } from '../../solidity/ICasinoGameV2.sol';
import { CandlePaytable } from './generated/Paytable.sol';

/**
 * @title CANDLE
 * @notice A lot is on the table. The candle is burning. Every inch you wait is
 *         worth less.
 *
 * @dev The bet object is a discounted optimal-stopping problem — the
 *      Gilbert–Mosteller full-information problem with a deterministic decay
 *      and a forced acceptance at the horizon. There is no bust state and
 *      nothing accumulates: the only thing the player risks by waiting is the
 *      value of the prize itself.
 *
 *      One VRF word per inch. `BURN` is an on-chain action that requests the
 *      next word, so the word for inch k+1 is causally AFTER the burn that
 *      asked for it and cannot be read, predicted or front-run by the player
 *      (claude.md I4, proven in docs.md §7.3.1).
 *
 *      Every hook is `view` and reached by `staticcall`: this contract holds no
 *      storage at all. Session state travels in `ctx.gameState`, which the facet
 *      emits on every step and takes back as calldata. That makes the
 *      production double-call of `onSessionStart` (once as a simulation with
 *      `sessionId == 0`) idempotent for free — there is nothing a second call
 *      could corrupt, and `ctx.sessionId` is never read (I6).
 *
 *      All paytable and ladder constants come from `generated/Paytable.sol`,
 *      which `npm run gen:constants` mirrors from `src/game/paytable.ts`.
 *      Never hand-edit either.
 *
 *      No constructor arguments. No unbounded loops — the heaviest operation in
 *      a session is sixteen window reads.
 */
contract CandleGame is ICasinoGameV2 {
  // --- actions, as they arrive in `actionData` ------------------------------
  uint8 private constant ACTION_CLAIM = 0;
  uint8 private constant ACTION_BURN = 1;

  // --- gameState layout: abi.encodePacked(uint8 inch, uint16 faceBp, uint8 hasLot)
  //     Four bytes. It is emitted, hashed and echoed on every step at ~30 gas
  //     per byte, so it stays small (docs.md §7.3.5).
  uint256 private constant STATE_LENGTH = 4;

  error Candle__InvalidWager();
  error Candle__BadAction(uint8 action);
  error Candle__BurnAtLastInch();
  error Candle__NoLotOnTable();
  error Candle__LotAlreadyOnTable();
  error Candle__CorruptState();

  // ==========================================================================
  //  The one payout rule
  // ==========================================================================

  /**
   * @dev THE single payout helper. `quoteCaps`, `quoteRiskParams`,
   *      `onPlayerAction`, `onRandomness` and `quoteForfeitPayout` all route
   *      through it, so a 25x win cannot disagree with the reserve by a single
   *      base unit — the facet caps payout at `escrowedStake + reservedProfit`
   *      with zero slack, and an independent re-derivation that differs by one
   *      wei reverts every jackpot (claude.md I5).
   *
   *      Integer division floors exactly once, at the end. At most one base
   *      unit is given up per round; that is documented, not hidden.
   */
  function _payout(uint256 stake, uint256 faceBp, uint256 inch) private pure returns (uint256) {
    return (stake * faceBp * CandlePaytable.waxBpAt(inch)) / CandlePaytable.PAYOUT_DENOM;
  }

  /// @dev The most this game can ever pay on `wager`: the top lot at the first inch.
  function _maxPayout(uint256 wager) private pure returns (uint256) {
    return _payout(wager, CandlePaytable.MAX_FACE_BP, 1);
  }

  // ==========================================================================
  //  Randomness — rejection sampling, never `word % n`
  // ==========================================================================

  /**
   * @dev Reads 16-bit windows from `word` starting at `cursor`, rejecting any
   *      window at or above RNG_LIMIT so the surviving range is an exact
   *      multiple of WEIGHT_DENOM. 2^256 is not a multiple of 10,000, so the
   *      naive modulo is biased and is explicitly on the reviewer's checklist
   *      (claude.md I3).
   *
   *      Per-window rejection is 5536/65536 ~ 8.45%, so a draw consumes ~1.09
   *      windows. Exhausting all sixteen has probability ~1.4e-18 and rehashes
   *      rather than reverting, so the path is total.
   *
   *      Mirrors `draw` in src/game/rng.ts window for window (I11).
   */
  function _draw(bytes32 word, uint256 cursor) private pure returns (uint256) {
    bytes32 seed = word;
    uint256 idx = cursor;
    while (true) {
      if (idx < CandlePaytable.RNG_WINDOWS) {
        uint256 v = (uint256(seed) >> (240 - idx * 16)) & 0xFFFF;
        idx++;
        if (v < CandlePaytable.RNG_LIMIT) return v % CandlePaytable.WEIGHT_DENOM;
        continue;
      }
      seed = keccak256(abi.encodePacked(seed));
      idx = 0;
    }
    revert Candle__CorruptState(); // unreachable; the loop only exits by return
  }

  // ==========================================================================
  //  gameState codec
  // ==========================================================================

  function _encodeState(uint8 inch, uint16 faceBp, bool hasLot) private pure returns (bytes memory) {
    return abi.encodePacked(inch, faceBp, hasLot ? uint8(1) : uint8(0));
  }

  function _decodeState(
    bytes memory s
  ) private pure returns (uint8 inch, uint16 faceBp, bool hasLot) {
    if (s.length != STATE_LENGTH) revert Candle__CorruptState();
    inch = uint8(s[0]);
    faceBp = (uint16(uint8(s[1])) << 8) | uint16(uint8(s[2]));
    hasLot = uint8(s[3]) == 1;
    if (inch == 0 || inch > CandlePaytable.INCHES) revert Candle__CorruptState();
  }

  // ==========================================================================
  //  ICasinoGameV2
  // ==========================================================================

  /**
   * @notice Per-session ceilings.
   * @dev `maxReservedProfit` is the peak the vault might owe ABOVE the escrowed
   *      stake: 25x - 1x = 24x. No slack.
   */
  function quoteCaps(
    uint256 wager,
    bytes calldata
  ) external pure returns (uint256 maxEscrowStake, uint256 maxReservedProfit) {
    maxEscrowStake = wager; // the player posts the stake once; escrow never rises
    uint256 top = _maxPayout(wager);
    maxReservedProfit = top > wager ? top - wager : 0;
  }

  /**
   * @notice Inputs for the vault's portfolio risk model.
   * @dev `probabilityWad` is the TOP TIER's marginal probability — P(payout =
   *      25x) = P(the 25x lot at the first inch) = 0.20% — not "any win".
   *
   *      CANDLE is deliberately not heavy-tailed: `maxPayout / wager` is 25,
   *      below the governance multiplier threshold of 100, so the tiered
   *      jackpot-reserve path never engages and `subJackpotVarianceScaled`
   *      stays 0 (docs.md §7.3.4).
   *
   *      `expectedPayout` is quoted at the OPTIMAL-play RTP. Optimal is the
   *      supremum over policies by definition, so it is the honest worst case
   *      for the vault rather than a flattering average.
   */
  function quoteRiskParams(
    uint256 wager,
    bytes calldata
  )
    external
    pure
    returns (
      uint256 maxPayout,
      uint256 probabilityWad,
      uint256 expectedPayout,
      uint256 subJackpotVarianceScaled
    )
  {
    maxPayout = _maxPayout(wager);
    probabilityWad = CandlePaytable.TOP_TIER_PROBABILITY_WAD;
    expectedPayout = (wager * CandlePaytable.RTP_NUMERATOR) / CandlePaytable.RTP_DENOMINATOR;
    subJackpotVarianceScaled = 0;
  }

  /**
   * @notice Light the candle at the first inch and ask for the first word.
   * @dev Reserves the full 24x NOW. `reservedProfit` starts at ZERO and
   *      `quoteCaps` only sets a ceiling, so without this the facet's payout cap
   *      is exactly 1x the wager and every win above evens reverts with
   *      `InvalidPayout` (docs.md §7.3.3). Take it once, release it never.
   *
   *      Pure in `(wagerBase, gameData)`; `ctx.sessionId` is never read (I6).
   */
  function onSessionStart(SessionContext calldata ctx) external pure returns (StepResult memory r) {
    if (ctx.wagerBase == 0) revert Candle__InvalidWager();

    r.newGameState = _encodeState(1, 0, false); // inch 1, nothing on the table yet
    r.escrowDelta = 0;
    r.reservedProfitDelta = int256(_maxPayout(ctx.wagerBase) - ctx.wagerBase);
    r.nextPhase = SessionPhase.WAITING_RANDOMNESS;
    r.requestRandomnessNow = true;
    r.payout = 0;
  }

  /**
   * @notice CLAIM settles at the current inch; BURN spends an inch of wax and
   *         asks the facet for the next word.
   * @dev `reservedProfitDelta` stays 0 on every step after the first. The facet
   *      applies the delta BEFORE checking the payout, so a step that both
   *      released reserve and settled would be checked against the lowered cap —
   *      which would revert exactly the wins that matter most (claude.md I7).
   */
  function onPlayerAction(
    SessionContext calldata ctx,
    bytes calldata actionData
  ) external pure returns (StepResult memory r) {
    (uint8 inch, uint16 faceBp, bool hasLot) = _decodeState(ctx.gameState);
    if (!hasLot) revert Candle__NoLotOnTable();
    if (actionData.length == 0) revert Candle__BadAction(type(uint8).max);

    uint8 action = uint8(actionData[0]);
    r.escrowDelta = 0;
    r.reservedProfitDelta = 0;

    if (action == ACTION_CLAIM) {
      r.newGameState = _encodeState(inch, faceBp, true);
      r.nextPhase = SessionPhase.SETTLED;
      r.requestRandomnessNow = false;
      r.payout = _payout(ctx.escrowedStake, faceBp, inch);
      return r;
    }

    if (action == ACTION_BURN) {
      // The fifth inch has no exit but a claim (docs.md §2.5). Unreachable in
      // practice — `onRandomness` settles the fifth inch in the same call that
      // reveals it, so the session never re-enters WAITING_PLAYER_ACTION there —
      // but refused explicitly rather than left to the facet.
      if (inch >= CandlePaytable.INCHES) revert Candle__BurnAtLastInch();

      r.newGameState = _encodeState(inch + 1, 0, false);
      r.nextPhase = SessionPhase.WAITING_RANDOMNESS;
      r.requestRandomnessNow = true; // the next word is requested, not derived
      r.payout = 0;
      return r;
    }

    revert Candle__BadAction(action);
  }

  /**
   * @notice Put the lot for the current inch on the table — or, at the fifth
   *         inch, put it on the table and settle in the same breath.
   * @dev Each inch gets its own fresh word, so the draw cursor always starts at
   *      zero and never has to be carried in `gameState`.
   */
  function onRandomness(
    SessionContext calldata ctx,
    bytes32 randomness
  ) external pure returns (StepResult memory r) {
    (uint8 inch, , bool hasLot) = _decodeState(ctx.gameState);
    if (hasLot) revert Candle__LotAlreadyOnTable();

    uint16 faceBp = uint16(CandlePaytable.faceBpFor(_draw(randomness, 0)));

    r.newGameState = _encodeState(inch, faceBp, true);
    r.escrowDelta = 0;
    r.reservedProfitDelta = 0;

    if (inch >= CandlePaytable.INCHES) {
      // The candle gutters. Whatever is in front of the player is claimed.
      r.nextPhase = SessionPhase.SETTLED;
      r.requestRandomnessNow = false;
      r.payout = _payout(ctx.escrowedStake, faceBp, inch);
      return r;
    }

    r.nextPhase = SessionPhase.WAITING_PLAYER_ACTION;
    r.requestRandomnessNow = false;
    r.payout = 0;
  }

  /**
   * @notice What an abandoned session is worth: the lot currently on the table.
   * @dev The facet pays 90% of this (`FORFEIT_WINNINGS_CUT_BPS` = 1000) once the
   *      action deadline passes. Quoting a real number is legitimate here rather
   *      than an adverse-selection hole, because the lot is ALREADY REVEALED:
   *      mid-round value depends on no unresolved randomness and no hidden
   *      state, which is exactly the mines-style case the SDK permits.
   *      Abandoning can never beat claiming — 90% of the claim value is strictly
   *      worse — so there is nothing to farm (docs.md §3.4, §7.3.2).
   *
   *      Returns 0 while waiting for a word, when nothing is cashable.
   */
  function quoteForfeitPayout(SessionContext calldata ctx) external pure returns (uint256) {
    (uint8 inch, uint16 faceBp, bool hasLot) = _decodeState(ctx.gameState);
    if (!hasLot) return 0;
    return _payout(ctx.escrowedStake, faceBp, inch);
  }
}
