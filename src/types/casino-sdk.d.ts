/**
 * The SDK surface this game depends on.
 *
 * The SDK ships raw `.ts`, not `.d.ts`, so importing it directly would pull its
 * source into our program and make our stricter flags fail on code that is not
 * ours to fix. Declaring the boundary instead does three things: keeps our own
 * strictness intact, makes the exact surface we rely on explicit — useful when
 * the SDK version moves, since `npm run spike` exercises every symbol below —
 * and leaves Vite free to alias the real source at build time.
 *
 * Shapes copied from `sdk/casino-sdk/src/types.ts`. If they drift, `npm run
 * spike` is what catches it.
 */
declare module '@chain/casino-sdk' {
  export type HexString = `0x${string}`;

  export type CasinoGameManifestV1 = {
    schemaVersion: 1;
    apiVersion: 1;
    gameId: string;
    defaultLocale: string;
    locales: Record<string, { name: string; description?: string }>;
    presentation: {
      mode: 'full-iframe' | 'embedded';
      hostPanels: { openSession: boolean; history: boolean; status: boolean };
    };
    capabilities: {
      openSession: true;
      submitAction: boolean;
      forfeitExpiredSession: boolean;
      cancelStuckRandomness: boolean;
      resize: boolean;
    };
    assets?: { iconUrl?: string; coverUrl?: string };
  };

  export type HostSnapshotV1 = {
    apiVersion: number;
    integration: { chainId: number; slug: string; gameAddress: HexString; manifest: CasinoGameManifestV1 };
    wallet: {
      address?: HexString;
      smartVaultAddress?: HexString;
      status: 'ready' | 'disconnected' | 'setup-required' | 'session-key-mismatch';
    };
    token: { symbol?: string; decimals?: number; iconUrl?: string };
    balances: { smartVaultBalance?: string };
    casino?: {
      availableLiquidity?: string;
      maxBetRiskBps?: number;
      /** `openSession` reverts with BetRiskExceedsLimit above this. */
      maxAllowedReservedProfit?: string;
      /** Unset or '0' means the platform has configured no ceiling. */
      maxBetAmount?: string;
    };
    sessions: {
      items: Array<{
        sessionId: string;
        sessionKey: string;
        gameAddress: HexString;
        phase?: number;
        phaseName?: string;
        wager?: string;
        /** Wager plus mid-session increases. Absent on older hosts. */
        stake?: string;
        payout?: string;
        isSettled: boolean;
        openedAt?: number;
        settledAt?: number;
        lastEventTimestamp: number;
        raw: {
          gameData?: HexString;
          gameState?: HexString;
          randomness?: HexString;
          requestId?: HexString;
          randomnessRequests?: unknown[];
          openTransactionHash?: HexString;
          settleTransactionHash?: HexString;
        };
      }>;
    };
    ui: { locale: string; theme: 'light' | 'dark' | 'system'; viewport?: { availableHeight: number } };
  };

  export type HostApiV1 = {
    reportContentSize?(input: { minHeight: number }): Promise<void>;
    openSession(input: { wager: string; gameData: HexString }): Promise<{ sessionKey: string; transactionHash: HexString }>;
    submitAction(input: { sessionId: string; actionData: HexString; approvalAmount?: string }): Promise<{ transactionHash: HexString }>;
    cancelStuckRandomness(input: { sessionId: string }): Promise<{ transactionHash: HexString }>;
    revealOutcome(input: { sessionId: string }): Promise<void>;
    getRandomnessVerification?(input: { sessionId: string }): Promise<unknown>;
  };

  export type GuestApiV1 = { setState(snapshot: HostSnapshotV1 | null): Promise<void> };

  export type CasinoGameManifestValidationResult =
    | { ok: true; manifest: CasinoGameManifestV1 }
    | { ok: false; reason: string };

  export type GameManifestMetadata = {
    locale: string;
    name: string;
    description?: string;
    iconUrl?: string;
    coverUrl?: string;
  };
}

declare module '@chain/casino-sdk/guest' {
  import type { GuestApiV1, HostApiV1, HostSnapshotV1 } from '@chain/casino-sdk';
  export type { GuestApiV1, HostApiV1, HostSnapshotV1 };

  export type GuestBridgeConnection = {
    promise: Promise<HostApiV1>;
    destroy(): void;
  };

  export function connectGameToHost(methods: GuestApiV1): GuestBridgeConnection;

  /**
   * The highest wager `openSession` accepts right now, in base units, for a game
   * whose worst case is `wager * maxMultiplierX`. `undefined` means the host did
   * not report limits — treat as unknown, never as unlimited.
   */
  export function computeMaxWager(
    snapshot: Pick<HostSnapshotV1, 'casino'> | null | undefined,
    input: { maxMultiplierX: number },
  ): bigint | undefined;

  export function reportGameContentSize(hostApi: Pick<HostApiV1, 'reportContentSize'> | null | undefined): Promise<void>;
  export function observeGameContentSize(hostApi: Pick<HostApiV1, 'reportContentSize'> | null | undefined): {
    disconnect(): void;
    report(): void;
  };
}

declare module '@chain/casino-sdk/manifest' {
  import type { CasinoGameManifestV1, CasinoGameManifestValidationResult, GameManifestMetadata } from '@chain/casino-sdk';

  export function validateCasinoGameManifest(value: unknown): CasinoGameManifestValidationResult;
  /** Strips a trailing "Game", lowercases, keeps alphanumerics. */
  export function canonicalCasinoGameId(value: string | undefined | null): string;
  export function resolveManifestMetadata(manifest: CasinoGameManifestV1, requestedLocale: string): GameManifestMetadata;
  export function assertSameOriginUrls(manifestUrl: string, iframeUrl: string): boolean;
}
