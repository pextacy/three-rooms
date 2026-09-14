// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ICasinoGameV2, SessionContext, SessionPhase, StepResult } from './ICasinoGameV2.sol';
import { SurveyManifest } from './generated/Manifest.sol';

/**
 * @title THE SURVEY
 * @notice A ship lies in the roads. Every surveyor you send costs you. When have
 *         you seen enough?
 *
 * @dev The bet object is **sequential hypothesis testing** — Wald's problem with
 *      a priced stopping rule. The player is not guessing a probability and not
 *      refusing offers under a decay: they are buying evidence, and the only
 *      question is when they have bought enough.
 *
 *      THE GENERATIVE ORDER IS REVERSED, and that is the whole security model.
 *      Every hook here is `view`, so the only state is `ctx.gameState`, which the
 *      facet emits on every step and the player echoes back — it is public, and
 *      so is every VRF word, which the facet also emits. If the ship's condition
 *      were decided at the start it could simply be read.
 *
 *      So reports are drawn from the PREDICTIVE distribution, which depends only
 *      on the margin so far and is safe to compute in the open; the condition is
 *      drawn at SETTLEMENT from the POSTERIOR given the final margin, out of a
 *      word that does not exist until the player has already committed. The joint
 *      distribution over (reports, truth) is identical — it is the same model
 *      factored the other way.
 *
 *      DECLINE settles immediately and needs no word at all: it pays the same
 *      whatever she was. A player who walks away can never be left waiting on
 *      randomness.
 *
 *      No constructor arguments. No storage. No unbounded loops.
 */
contract SurveyGame is ICasinoGameV2 {
  uint8 private constant ACTION_SURVEY = 0;
  uint8 private constant ACTION_UNDERWRITE = 1;
  uint8 private constant ACTION_DECLINE = 2;

  /// @dev gameState: abi.encodePacked(uint16 valueBp, uint8 surveys, int8 margin, uint8 phase)
  uint256 private constant STATE_LENGTH = 5;
  uint8 private constant PHASE_AWAITING_CARGO = 0;
  uint8 private constant PHASE_WEIGHING = 1;
  uint8 private constant PHASE_COMMITTED = 2;

  /// @dev How many times a word may be rehashed before a draw gives up.
  uint256 private constant MAX_REHASHES = 3;

  error Survey__InvalidWager();
  error Survey__BadAction(uint8 action);
  error Survey__NoSurveyorsLeft();
  error Survey__NothingToWeigh();
  error Survey__CorruptState();
  error Survey__RandomnessExhausted();

  // ==========================================================================
  //  The one payout rule
  // ==========================================================================

  /// @dev Every quote routes through this, so a maximum win cannot disagree with
  ///      the reserve by a single base unit.
  function _payout(uint256 stake, uint256 valueBp, uint256 surveys) private pure returns (uint256) {
    return (stake * valueBp * SurveyManifest.premiumBpAt(surveys)) / SurveyManifest.PAYOUT_DENOM;
  }

  function _maxPayout(uint256 wager) private pure returns (uint256) {
    return _payout(wager, SurveyManifest.MAX_VALUE_BP, 0);
  }

  // ==========================================================================
  //  Randomness — rejection sampling, never `word % n`
  // ==========================================================================

  struct Cursor {
    bytes32 seed;
    uint256 index;
  }

  /// @dev One 16-bit window, rehashing when the word runs out.
  function _window(Cursor memory c) private pure returns (uint256 value) {
    for (uint256 pass = 0; pass <= MAX_REHASHES; pass++) {
      if (c.index < SurveyManifest.RNG_WINDOWS) {
        value = (uint256(c.seed) >> (240 - c.index * 16)) & 0xFFFF;
        c.index++;
        return value;
      }
      c.seed = keccak256(abi.encodePacked(c.seed));
      c.index = 0;
    }
    revert Survey__RandomnessExhausted();
  }

  /// @dev Uniform on [0, WEIGHT_DENOM). The manifest draw.
  function _drawManifest(Cursor memory c) private pure returns (uint256) {
    for (uint256 tries = 0; tries < 64; tries++) {
      uint256 v = _window(c);
      if (v < SurveyManifest.RNG_LIMIT) return v % SurveyManifest.WEIGHT_DENOM;
    }
    revert Survey__RandomnessExhausted();
  }

  /// @dev Uniform on [0, DRAW_SPACE). Two windows, because a report's odds run
  ///      as fine as 2/731 and 10,000 is too coarse to carry them.
  function _drawFine(Cursor memory c) private pure returns (uint256) {
    for (uint256 tries = 0; tries < 64; tries++) {
      uint256 v = (_window(c) << 16) | _window(c);
      if (v < SurveyManifest.FINE_LIMIT) return v % SurveyManifest.DRAW_SPACE;
    }
    revert Survey__RandomnessExhausted();
  }

  /// @dev `draw / DRAW_SPACE < n / d`, by cross-multiplication. No rounding.
  function _below(uint256 drawn, uint256 n, uint256 d) private pure returns (bool) {
    return drawn * d < n * SurveyManifest.DRAW_SPACE;
  }

  // ==========================================================================
  //  gameState codec
  // ==========================================================================

  function _encode(uint16 valueBp, uint8 surveys, int8 margin, uint8 phase) private pure returns (bytes memory) {
    // The margin is signed and the state is bytes, so it travels biased by 128.
    return abi.encodePacked(valueBp, surveys, uint8(uint16(int16(margin) + 128)), phase);
  }

  function _decode(
    bytes memory s
  ) private pure returns (uint16 valueBp, uint8 surveys, int8 margin, uint8 phase) {
    if (s.length != STATE_LENGTH) revert Survey__CorruptState();
    valueBp = (uint16(uint8(s[0])) << 8) | uint16(uint8(s[1]));
    surveys = uint8(s[2]);
    margin = int8(int16(uint16(uint8(s[3]))) - 128);
    phase = uint8(s[4]);

    if (surveys > SurveyManifest.MAX_SURVEYS) revert Survey__CorruptState();
    if (phase > PHASE_COMMITTED) revert Survey__CorruptState();
    // The margin can only be as far from zero as there are reports, and it must
    // share their parity: every report moves it by exactly one.
    int256 m = int256(margin);
    if (m > int256(uint256(surveys)) || m < -int256(uint256(surveys))) revert Survey__CorruptState();
    if ((int256(uint256(surveys)) - m) % 2 != 0) revert Survey__CorruptState();
    if (phase != PHASE_AWAITING_CARGO && !SurveyManifest.isValueBp(valueBp)) revert Survey__CorruptState();
    if (phase == PHASE_AWAITING_CARGO && valueBp != 0) revert Survey__CorruptState();
  }

  // ==========================================================================
  //  ICasinoGameV2
  // ==========================================================================

  function quoteCaps(
    uint256 wager,
    bytes calldata
  ) external pure returns (uint256 maxEscrowStake, uint256 maxReservedProfit) {
    maxEscrowStake = wager;
    uint256 top = _maxPayout(wager);
    maxReservedProfit = top > wager ? top - wager : 0;
  }

  /// @dev `probabilityWad` is the TOP TIER only: the richest cargo, underwritten
  ///      with no surveys, coming home. P(Indigo) x P(sound at the prior).
  function quoteRiskParams(
    uint256 wager,
    bytes calldata
  )
    external
    pure
    returns (uint256 maxPayout, uint256 probabilityWad, uint256 expectedPayout, uint256 subJackpotVarianceScaled)
  {
    maxPayout = _maxPayout(wager);
    // P(Indigo) = 200/10000 = 2%, P(sound) = 2/5 → 0.8%
    probabilityWad = 8e15;
    // The optimal-play RTP: the supremum over policies, so it is the honest
    // worst case for the vault. Exact rational, generated from the DP.
    expectedPayout = (wager * 49_679_521) / 51_200_000;
    subJackpotVarianceScaled = 0;
  }

  /// @dev Pure in `(wagerBase, gameData)` and writes nothing, so production's
  ///      double call is idempotent for free.
  function onSessionStart(SessionContext calldata ctx) external pure returns (StepResult memory r) {
    if (ctx.wagerBase == 0) revert Survey__InvalidWager();

    r.newGameState = _encode(0, 0, 0, PHASE_AWAITING_CARGO);
    r.escrowDelta = 0;
    // Reserve the whole profit now. `reservedProfit` starts at zero and
    // `quoteCaps` only sets a ceiling, so without this every win reverts.
    r.reservedProfitDelta = int256(_maxPayout(ctx.wagerBase) - ctx.wagerBase);
    r.nextPhase = SessionPhase.WAITING_RANDOMNESS;
    r.requestRandomnessNow = true;
    r.payout = 0;
  }

  function onPlayerAction(
    SessionContext calldata ctx,
    bytes calldata actionData
  ) external pure returns (StepResult memory r) {
    (uint16 valueBp, uint8 surveys, int8 margin, uint8 phase) = _decode(ctx.gameState);
    if (phase != PHASE_WEIGHING) revert Survey__NothingToWeigh();
    if (actionData.length == 0) revert Survey__BadAction(type(uint8).max);

    uint8 action = uint8(actionData[0]);
    r.escrowDelta = 0;
    r.reservedProfitDelta = 0;

    if (action == ACTION_SURVEY) {
      if (surveys >= SurveyManifest.MAX_SURVEYS) revert Survey__NoSurveyorsLeft();
      r.newGameState = _encode(valueBp, surveys, margin, PHASE_WEIGHING);
      r.nextPhase = SessionPhase.WAITING_RANDOMNESS;
      r.requestRandomnessNow = true; // the report is requested, never derived
      r.payout = 0;
      return r;
    }

    if (action == ACTION_DECLINE) {
      // Settles at once: declining pays the same whatever she turns out to be,
      // so it never waits on a word and can never be left hanging.
      r.newGameState = _encode(valueBp, surveys, margin, PHASE_WEIGHING);
      r.nextPhase = SessionPhase.SETTLED;
      r.requestRandomnessNow = false;
      r.payout = _payout(ctx.escrowedStake, SurveyManifest.DECLINE_BP, surveys);
      return r;
    }

    if (action == ACTION_UNDERWRITE) {
      // Commit first; only then is her condition drawn.
      r.newGameState = _encode(valueBp, surveys, margin, PHASE_COMMITTED);
      r.nextPhase = SessionPhase.WAITING_RANDOMNESS;
      r.requestRandomnessNow = true;
      r.payout = 0;
      return r;
    }

    revert Survey__BadAction(action);
  }

  function onRandomness(
    SessionContext calldata ctx,
    bytes32 randomness
  ) external pure returns (StepResult memory r) {
    (uint16 valueBp, uint8 surveys, int8 margin, uint8 phase) = _decode(ctx.gameState);
    Cursor memory cursor = Cursor({ seed: randomness, index: 0 });

    r.escrowDelta = 0;
    r.reservedProfitDelta = 0;

    if (phase == PHASE_AWAITING_CARGO) {
      uint16 drawn = uint16(SurveyManifest.valueBpFor(_drawManifest(cursor)));
      r.newGameState = _encode(drawn, 0, 0, PHASE_WEIGHING);
      r.nextPhase = SessionPhase.WAITING_PLAYER_ACTION;
      r.requestRandomnessNow = false;
      r.payout = 0;
      return r;
    }

    if (phase == PHASE_WEIGHING) {
      if (surveys >= SurveyManifest.MAX_SURVEYS) revert Survey__NoSurveyorsLeft();
      (uint256 n, uint256 d) = SurveyManifest.predictiveSound(int256(margin));
      bool saysSound = _below(_drawFine(cursor), n, d);
      r.newGameState = _encode(valueBp, surveys + 1, saysSound ? margin + 1 : margin - 1, PHASE_WEIGHING);
      r.nextPhase = SessionPhase.WAITING_PLAYER_ACTION;
      r.requestRandomnessNow = false;
      r.payout = 0;
      return r;
    }

    // PHASE_COMMITTED: the voyage resolves.
    (uint256 pn, uint256 pd) = SurveyManifest.posteriorSound(int256(margin));
    bool wasSound = _below(_drawFine(cursor), pn, pd);
    r.newGameState = _encode(valueBp, surveys, margin, PHASE_COMMITTED);
    r.nextPhase = SessionPhase.SETTLED;
    r.requestRandomnessNow = false;
    r.payout = wasSound ? _payout(ctx.escrowedStake, valueBp, surveys) : 0;
  }

  /// @dev An abandoned session is worth what DECLINING is worth: that value is
  ///      fully determined by revealed state and depends on no unresolved
  ///      randomness, which is exactly the case the SDK permits quoting. It is
  ///      never the underwrite value — that one turns on a word not yet drawn,
  ///      and quoting it would be an adverse-selection hole against the vault.
  function quoteForfeitPayout(SessionContext calldata ctx) external pure returns (uint256) {
    (, uint8 surveys, , uint8 phase) = _decode(ctx.gameState);
    if (phase != PHASE_WEIGHING) return 0;
    return _payout(ctx.escrowedStake, SurveyManifest.DECLINE_BP, surveys);
  }
}
