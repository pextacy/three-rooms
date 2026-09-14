// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// ===========================================================================
//  VENDORED — a byte-for-byte copy of sdk/casino-sdk/solidity/ICasinoGameV2.sol.
//  DO NOT EDIT.
//
//  Why it is here rather than imported from the SDK: the SDK's local node
//  resolves `../../solidity/ICasinoGameV2.sol` relative to its own root, a path
//  that points OUTSIDE this repository. A contract that only its own simulator
//  can compile is no use to an auditor or to a deployment, so the interface
//  sits beside the game and `./ICasinoGameV2.sol` resolves in both places.
//
//  `npm run gates` diffs this against the SDK's copy, so it cannot drift.
// ===========================================================================

enum SessionPhase {
  NONE,
  WAITING_RANDOMNESS,
  WAITING_PLAYER_ACTION,
  SETTLED,
  FORFEITED,
  CANCELLED
}

struct SessionContext {
  uint256 sessionId;
  address player;
  address vault;
  uint256 wagerBase;
  uint256 escrowedStake;
  uint256 reservedProfit;
  uint32 step;
  bytes gameData;
  bytes gameState;
}

struct StepResult {
  bytes newGameState;
  int256 escrowDelta;
  int256 reservedProfitDelta;
  SessionPhase nextPhase;
  bool requestRandomnessNow;
  uint256 payout;
}

interface ICasinoGameV2 {
  function quoteCaps(
    uint256 wager,
    bytes calldata gameData
  ) external view returns (uint256 maxEscrowStake, uint256 maxReservedProfit);

  /// @notice Risk parameters for portfolio VaR. `probabilityWad` is win probability in WAD (1e18 = 100%) for the VaR binary / tail model.
  /// @notice `subJackpotVarianceScaled` is 0 unless the game supplies a precomputed sub-jackpot variance (heavy-tail slots).
  function quoteRiskParams(
    uint256 wager,
    bytes calldata gameData
  )
    external
    view
    returns (
      uint256 maxPayout,
      uint256 probabilityWad,
      uint256 expectedPayout,
      uint256 subJackpotVarianceScaled
    );

  function onSessionStart(
    SessionContext calldata ctx
  ) external view returns (StepResult memory);

  function onPlayerAction(
    SessionContext calldata ctx,
    bytes calldata actionData
  ) external view returns (StepResult memory);

  function onRandomness(
    SessionContext calldata ctx,
    bytes32 randomness
  ) external view returns (StepResult memory);

  /// @notice Current cash-out value (stake + accrued winnings) of an in-progress session,
  ///         derived from `ctx.gameState`. Called by the host when forfeiting an abandoned
  ///         session so the player keeps most of their current winnings instead of losing
  ///         the whole stake. Return 0 when nothing is cashable mid-round.
  function quoteForfeitPayout(SessionContext calldata ctx) external view returns (uint256 cashoutValue);
}
