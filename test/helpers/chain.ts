/**
 * Shared plumbing for the tests that talk to the local chain.
 *
 * These tests SKIP rather than fail when `npm run sdk:stack` is not running — a
 * missing local chain is an environment gap, not a defect, and a red suite that
 * means "you forgot to start something" trains people to ignore red suites. CI
 * starts the stack, so CI runs them for real.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createPublicClient, http, type PublicClient } from 'viem';

const DEPLOYED = new URL('../../sdk/casino-sdk/simulator/local-node/deployed.json', import.meta.url);

export type Deployment = {
  chainId: number;
  rpcUrl: string;
  host: `0x${string}`;
  vault: `0x${string}`;
  token: `0x${string}`;
  games: Array<{ name: string; address: `0x${string}` }>;
};

export function loadDeployment(): Deployment | null {
  if (!existsSync(DEPLOYED)) return null;
  try {
    return JSON.parse(readFileSync(DEPLOYED, 'utf8')) as Deployment;
  } catch {
    return null;
  }
}

export function candleAddress(): `0x${string}` | null {
  return loadDeployment()?.games.find(g => g.name === 'CandleGame')?.address ?? null;
}

/**
 * Is the chain actually reachable?
 *
 * `deployed.json` survives the stack being stopped, so its presence proves only
 * that the stack ran ONCE. Checking the file alone turned "you stopped the
 * simulator" into 24 red tests, which is exactly the failure mode the skip was
 * meant to prevent.
 */
export async function chainIsUp(deployment: Deployment | null): Promise<boolean> {
  if (!deployment) return false;
  try {
    const response = await fetch(deployment.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { result?: string };
    return typeof body.result === 'string';
  } catch {
    return false;
  }
}

export function publicClient(deployment: Deployment): PublicClient {
  const chain = {
    id: deployment.chainId,
    name: 'local',
    nativeCurrency: { name: 'E', symbol: 'E', decimals: 18 },
    rpcUrls: { default: { http: [deployment.rpcUrl] } },
  } as const;
  return createPublicClient({ chain, transport: http(deployment.rpcUrl) }) as PublicClient;
}

/** The `SessionContext` tuple, as `ICasinoGameV2` declares it. */
export const CTX = {
  type: 'tuple',
  components: [
    { name: 'sessionId', type: 'uint256' },
    { name: 'player', type: 'address' },
    { name: 'vault', type: 'address' },
    { name: 'wagerBase', type: 'uint256' },
    { name: 'escrowedStake', type: 'uint256' },
    { name: 'reservedProfit', type: 'uint256' },
    { name: 'step', type: 'uint32' },
    { name: 'gameData', type: 'bytes' },
    { name: 'gameState', type: 'bytes' },
  ],
} as const;

export const STEP_RESULT = {
  type: 'tuple',
  components: [
    { name: 'newGameState', type: 'bytes' },
    { name: 'escrowDelta', type: 'int256' },
    { name: 'reservedProfitDelta', type: 'int256' },
    { name: 'nextPhase', type: 'uint8' },
    { name: 'requestRandomnessNow', type: 'bool' },
    { name: 'payout', type: 'uint256' },
  ],
} as const;

export const candleAbi = [
  { type: 'function', name: 'quoteCaps', stateMutability: 'view', inputs: [{ name: 'wager', type: 'uint256' }, { name: 'gameData', type: 'bytes' }], outputs: [{ name: 'maxEscrowStake', type: 'uint256' }, { name: 'maxReservedProfit', type: 'uint256' }] },
  { type: 'function', name: 'quoteRiskParams', stateMutability: 'view', inputs: [{ name: 'wager', type: 'uint256' }, { name: 'gameData', type: 'bytes' }], outputs: [{ name: 'maxPayout', type: 'uint256' }, { name: 'probabilityWad', type: 'uint256' }, { name: 'expectedPayout', type: 'uint256' }, { name: 'subJackpotVarianceScaled', type: 'uint256' }] },
  { type: 'function', name: 'onSessionStart', stateMutability: 'view', inputs: [{ ...CTX, name: 'ctx' }], outputs: [{ ...STEP_RESULT, name: 'r' }] },
  { type: 'function', name: 'onPlayerAction', stateMutability: 'view', inputs: [{ ...CTX, name: 'ctx' }, { name: 'actionData', type: 'bytes' }], outputs: [{ ...STEP_RESULT, name: 'r' }] },
  { type: 'function', name: 'onRandomness', stateMutability: 'view', inputs: [{ ...CTX, name: 'ctx' }, { name: 'randomness', type: 'bytes32' }], outputs: [{ ...STEP_RESULT, name: 'r' }] },
  { type: 'function', name: 'quoteForfeitPayout', stateMutability: 'view', inputs: [{ ...CTX, name: 'ctx' }], outputs: [{ type: 'uint256' }] },
] as const;

/** `abi.encodePacked(uint8 inch, uint16 faceBp, uint8 hasLot)` — the 4-byte gameState. */
export function encodeGameState(inch: number, faceBp: number, hasLot: boolean): `0x${string}` {
  return `0x${inch.toString(16).padStart(2, '0')}${faceBp.toString(16).padStart(4, '0')}${hasLot ? '01' : '00'}`;
}

export function decodeGameState(hex: string): { inch: number; faceBp: number; hasLot: boolean } {
  const body = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (body.length !== 8) throw new Error(`gameState must be 4 bytes, got ${body.length / 2}`);
  return {
    inch: parseInt(body.slice(0, 2), 16),
    faceBp: parseInt(body.slice(2, 6), 16),
    hasLot: parseInt(body.slice(6, 8), 16) === 1,
  };
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export function makeCtx(o: {
  wagerBase: bigint;
  escrowedStake?: bigint;
  reservedProfit?: bigint;
  gameState?: `0x${string}`;
  sessionId?: bigint;
}) {
  return {
    sessionId: o.sessionId ?? 1n,
    player: ZERO_ADDRESS,
    vault: ZERO_ADDRESS,
    wagerBase: o.wagerBase,
    escrowedStake: o.escrowedStake ?? o.wagerBase,
    reservedProfit: o.reservedProfit ?? o.wagerBase * 24n,
    step: 2,
    gameData: '0x' as const,
    gameState: o.gameState ?? encodeGameState(1, 0, false),
  };
}
