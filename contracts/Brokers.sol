// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ICasinoGameV2, SessionContext, SessionPhase, StepResult } from './ICasinoGameV2.sol';
import { BrokerMarket } from './generated/Market.sol';

/**
 * @title THE BROKERS
 * @notice You hold a claim on a wreck. The house's man values it for nothing.
 *         Four brokers will each name a price, and each charges a fee. Every
 *         price you have been named stays on the table. When have you shopped
 *         it enough?
 *
 * @dev The bet object is **Pandora's Box** — Weitzman's (1979) optimal search
 *      with recall and per-source costs, solved by an index rule. The player is
 *      not refusing offers under a decay (that is CANDLE) and not buying
 *      evidence about a hidden state (that is THE SURVEY): they are buying
 *      OPTIONS, and the only question is when they have bought enough.
 *
 *      RECALL IS THE MECHANIC AND IT IS FREE HERE. Every price named stays
 *      available for the rest of the round, which is why the state can be four
 *      bytes: once you know the BEST price in hand, what the others said cannot
 *      matter — you would never take them. `bestBp` and the mask of who has been
 *      asked are a sufficient statistic for the whole history.
 *
 *      THE FEES LIVE IN THE MASK. `feesForMask` is a pure function of who has
 *      been asked, so nothing has to carry a running total and no step can
 *      disagree with another about what the day has cost.
 *
 *      A word is requested by the action that needs it and never before: the
 *      house's opening price by `onSessionStart`, a broker's price by the ASK
 *      that pays his fee. What a broker will say does not exist while the player
 *      is deciding whether to ask him (claude.md I4).
 *
 *      THERE IS NO LOSING STATE. `TAKE` is legal at every point of the round and
 *      always pays what is in hand less what has been spent; the worst case in
 *      the whole game is the house's lowest price less every fee, which is
 *      0.703x of the stake. A player can never lose their stake here, let alone
 *      more than it.
 *
 *      No constructor arguments. No storage. No unbounded loops.
 */
contract BrokersGame is ICasinoGameV2 {
  /// @dev actionData[0]: 0..3 asks that broker, 4 takes the best price in hand.
  uint8 private constant ACTION_TAKE = 4;

  /// @dev gameState: abi.encodePacked(uint16 bestBp, uint8 askedMask, uint8 pending, uint8 phase)
  uint256 private constant STATE_LENGTH = 5;
  uint8 private constant PHASE_OPENING = 0;
  uint8 private constant PHASE_SHOPPING = 1;
  /// @dev `pending` when nobody is looking at the claim.
  uint8 private constant NOBODY = 0xFF;

  /// @dev How many times a word may be rehashed before a draw gives up.
  uint256 private constant MAX_REHASHES = 3;

  error Brokers__InvalidWager();
  error Brokers__BadAction(uint8 action);
  error Brokers__AlreadyAsked(uint8 broker);
  error Brokers__NothingToShop();
  error Brokers__CorruptState();
  error Brokers__RandomnessExhausted();

  // ==========================================================================
  //  The one payout rule
  // ==========================================================================

  /**
   * @dev What is in hand, less what the day has cost. Floors at nothing: fees
   *      can never reach into a player's stake beyond the price they are
   *      holding, and with this market they never come close.
   */
  function _payout(uint256 stake, uint256 bestBp, uint256 mask) private pure returns (uint256) {
    uint256 fees = BrokerMarket.feesForMask(mask);
    if (bestBp <= fees) return 0;
    return (stake * (bestBp - fees)) / BrokerMarket.PRICE_DENOM;
  }

  function _maxPayout(uint256 wager) private pure returns (uint256) {
    return (wager * BrokerMarket.MAX_PAYOUT_BP) / BrokerMarket.PRICE_DENOM;
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
      if (c.index < BrokerMarket.RNG_WINDOWS) {
        value = (uint256(c.seed) >> (240 - c.index * 16)) & 0xFFFF;
        c.index++;
        return value;
      }
      c.seed = keccak256(abi.encodePacked(c.seed));
      c.index = 0;
    }
    revert Brokers__RandomnessExhausted();
  }

  /// @dev Uniform on [0, WEIGHT_DENOM). `word % n` is biased and is not used.
  function _draw(Cursor memory c) private pure returns (uint256) {
    for (uint256 tries = 0; tries < 64; tries++) {
      uint256 v = _window(c);
      if (v < BrokerMarket.RNG_LIMIT) return v % BrokerMarket.WEIGHT_DENOM;
    }
    revert Brokers__RandomnessExhausted();
  }

  // ==========================================================================
  //  gameState codec
  // ==========================================================================

  function _encode(uint16 bestBp, uint8 askedMask, uint8 pending, uint8 phase) private pure returns (bytes memory) {
    return abi.encodePacked(bestBp, askedMask, pending, phase);
  }

  function _decode(
    bytes memory s
  ) private pure returns (uint16 bestBp, uint8 askedMask, uint8 pending, uint8 phase) {
    if (s.length != STATE_LENGTH) revert Brokers__CorruptState();
    bestBp = (uint16(uint8(s[0])) << 8) | uint16(uint8(s[1]));
    askedMask = uint8(s[2]);
    pending = uint8(s[3]);
    phase = uint8(s[4]);

    if (phase > PHASE_SHOPPING) revert Brokers__CorruptState();
    // Only the four brokers exist; no other bit may be set.
    if (askedMask >= BrokerMarket.MASK_LIMIT) revert Brokers__CorruptState();

    if (pending != NOBODY) {
      // The broker who is looking has to exist, and has to have been asked —
      // the ask and the fee are the same event.
      if (pending >= BrokerMarket.BROKERS) revert Brokers__CorruptState();
      if (askedMask & BrokerMarket.bitFor(pending) == 0) revert Brokers__CorruptState();
    }

    if (phase == PHASE_OPENING) {
      // Nobody has named anything yet, so nothing may be in hand or owed.
      if (bestBp != 0 || askedMask != 0 || pending != NOBODY) revert Brokers__CorruptState();
    } else {
      // A price in hand has to be one somebody on this floor actually names.
      if (!BrokerMarket.isPrice(bestBp)) revert Brokers__CorruptState();
    }
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

  /// @dev `probabilityWad` is the TOP TIER only: Vanderdek's 5.00x, which one
  ///      claim in four hundred is worth to him — and which is the only way this
  ///      game ever pays more than 2.30x.
  function quoteRiskParams(
    uint256 wager,
    bytes calldata
  )
    external
    pure
    returns (uint256 maxPayout, uint256 probabilityWad, uint256 expectedPayout, uint256 subJackpotVarianceScaled)
  {
    maxPayout = _maxPayout(wager);
    // 25 / 10,000 = 0.25%
    probabilityWad = 2.5e15;
    // The optimal-play RTP: the supremum over policies, and therefore the honest
    // worst case for the vault. Generated from the DP — never typed in here.
    expectedPayout = (wager * BrokerMarket.RTP_NUM) / BrokerMarket.RTP_DEN;
    subJackpotVarianceScaled = 0;
  }

  /// @dev Pure in `(wagerBase, gameData)` and writes nothing, so production's
  ///      double call is idempotent for free.
  function onSessionStart(SessionContext calldata ctx) external pure returns (StepResult memory r) {
    if (ctx.wagerBase == 0) revert Brokers__InvalidWager();

    r.newGameState = _encode(0, 0, NOBODY, PHASE_OPENING);
    r.escrowDelta = 0;
    // Reserve the whole profit now. `reservedProfit` starts at zero and
    // `quoteCaps` only sets a ceiling, so without this every win reverts.
    r.reservedProfitDelta = int256(_maxPayout(ctx.wagerBase) - ctx.wagerBase);
    r.nextPhase = SessionPhase.WAITING_RANDOMNESS;
    r.requestRandomnessNow = true; // the house looks first, for nothing
    r.payout = 0;
  }

  function onPlayerAction(
    SessionContext calldata ctx,
    bytes calldata actionData
  ) external pure returns (StepResult memory r) {
    (uint16 bestBp, uint8 askedMask, uint8 pending, uint8 phase) = _decode(ctx.gameState);
    if (phase != PHASE_SHOPPING) revert Brokers__NothingToShop();
    // A fee already in flight: the facet would not be taking an action here, and
    // acting on a half-finished ask would drop a word the player has paid for.
    if (pending != NOBODY) revert Brokers__NothingToShop();
    if (actionData.length == 0) revert Brokers__BadAction(type(uint8).max);

    uint8 action = uint8(actionData[0]);
    r.escrowDelta = 0;
    r.reservedProfitDelta = 0;

    if (action == ACTION_TAKE) {
      // Always legal, at every point of the round. There is no losing state and
      // no forced move: what is in hand is yours whenever you want it.
      r.newGameState = _encode(bestBp, askedMask, NOBODY, PHASE_SHOPPING);
      r.nextPhase = SessionPhase.SETTLED;
      r.requestRandomnessNow = false;
      r.payout = _payout(ctx.escrowedStake, bestBp, askedMask);
      return r;
    }

    if (action >= BrokerMarket.BROKERS) revert Brokers__BadAction(action);
    // Asking a broker twice would charge a second fee for a price already on the
    // table. His word is bought once.
    if (askedMask & BrokerMarket.bitFor(action) != 0) revert Brokers__AlreadyAsked(action);

    // The fee is owed the moment he is asked, whatever he ends up naming, so the
    // mask moves now and the word is requested now.
    r.newGameState = _encode(bestBp, uint8(askedMask | BrokerMarket.bitFor(action)), action, PHASE_SHOPPING);
    r.nextPhase = SessionPhase.WAITING_RANDOMNESS;
    r.requestRandomnessNow = true;
    r.payout = 0;
  }

  function onRandomness(
    SessionContext calldata ctx,
    bytes32 randomness
  ) external pure returns (StepResult memory r) {
    (uint16 bestBp, uint8 askedMask, uint8 pending, uint8 phase) = _decode(ctx.gameState);
    Cursor memory cursor = Cursor({ seed: randomness, index: 0 });

    r.escrowDelta = 0;
    r.reservedProfitDelta = 0;
    r.requestRandomnessNow = false;
    r.payout = 0;
    r.nextPhase = SessionPhase.WAITING_PLAYER_ACTION;

    if (phase == PHASE_OPENING) {
      uint256 opening = BrokerMarket.housePrice(_draw(cursor));
      // casting to `uint16` is safe: `housePrice` only ever returns an entry
      // from the generated table, and the generator refuses a manifest whose
      // largest price does not fit in a uint16.
      // forge-lint: disable-next-line(unsafe-typecast)
      r.newGameState = _encode(uint16(opening), 0, NOBODY, PHASE_SHOPPING);
      return r;
    }

    // A broker is looking, and the state says which — it cannot be derived from
    // the mask, because the player asks in whatever order they like.
    if (pending == NOBODY) revert Brokers__CorruptState();
    uint256 named = BrokerMarket.brokerPrice(pending, _draw(cursor));
    // Recall, in one line: the best price in hand can only go up. Casting to
    // `uint16` is safe for the same reason as above — it is a table entry.
    // forge-lint: disable-next-line(unsafe-typecast)
    uint16 nextBest = named > bestBp ? uint16(named) : bestBp;
    r.newGameState = _encode(nextBest, askedMask, NOBODY, PHASE_SHOPPING);
  }

  /// @dev An abandoned session is worth exactly what TAKE would have paid: the
  ///      price in hand less the fees already owed. Nothing here turns on an
  ///      undrawn word, so quoting it is honest — and it is the same number the
  ///      player could have taken at any moment.
  function quoteForfeitPayout(SessionContext calldata ctx) external pure returns (uint256) {
    (uint16 bestBp, uint8 askedMask, , uint8 phase) = _decode(ctx.gameState);
    if (phase != PHASE_SHOPPING) return 0;
    return _payout(ctx.escrowedStake, bestBp, askedMask);
  }
}
