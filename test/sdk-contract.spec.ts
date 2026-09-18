/**
 * The SDK is downloaded, not pinned — so check it says what we declared it says.
 *
 * `src/types/casino-sdk.d.ts` is hand-written: the SDK ships raw `.ts` and
 * importing it into our program would put our stricter flags on code that is
 * not ours to fix. The cost is that `tsc` type-checks against OUR description
 * of the SDK rather than the SDK. When the two disagree, `tsc` believes us, and
 * the build quietly ships whatever the real one does.
 *
 * That is not hypothetical. `computeMaxWager` returned `bigint | undefined`
 * when this game was written, and `chain.ts` read it as `... ?? null`. On
 * 2026-09-17 the SDK changed it to a tagged union that is NEVER undefined, so
 * `?? null` began handing the whole object through as `maxStakeBase`. Nothing
 * threw — `stakeBase > {kind:'limit',…}` is just `false` in JavaScript — so the
 * wager ceiling silently stopped binding for every player inside a host, and
 * the only symptom was `openSession` reverting on chain for no stated reason.
 *
 * It reached production because nothing local ever saw the new SDK:
 * `fetch-sdk.mjs` skips the download when `sdk/` is already there, so a
 * developer's checkout and a warm CI cache both keep whatever they first got,
 * while a Vercel build container starts empty and fetches the current one every
 * time. `npm run spike` would have caught it — it asserts these exact values —
 * but it needs a running chain, which means it is the one check nobody runs
 * casually.
 *
 * So the SDK's own behaviour is asserted here, in the plain test suite, with no
 * chain and no simulator: `npm test` is what a stranger runs first.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeMaxWager, connectGameToHost, SessionPhase } from '@chain/casino-sdk/guest';
import { phaseOf, type SessionRow } from '../src/shared/bridge/chain';
import {
  validateCasinoGameManifest,
  canonicalCasinoGameId,
  resolveManifestMetadata,
  assertSameOriginUrls,
} from '@chain/casino-sdk/manifest';
import type { HostSnapshotV1 } from '@chain/casino-sdk';

/** CANDLE's worst case, and the multiplier the risk leg is inverted against. */
const MAX_MULTIPLIER_X = 25;
const ONE = 10n ** 18n;

const snap = (casino: NonNullable<HostSnapshotV1['casino']>) =>
  ({ casino }) as Pick<HostSnapshotV1, 'casino'>;

describe('computeMaxWager returns a tagged union, not a bare value', () => {
  it('never returns undefined, whatever it is handed', () => {
    for (const input of [null, undefined, snap({}), snap({ maxBetAmount: '0' })]) {
      const result = computeMaxWager(input, { maxMultiplierX: MAX_MULTIPLIER_X });
      expect(result, String(input)).toBeDefined();
      expect(typeof result, 'a tagged union, so an object').toBe('object');
      expect(['limit', 'no-limit', 'unknown']).toContain(result.kind);
    }
  });

  it('a host that publishes nothing reads as unknown — never as unlimited', () => {
    expect(computeMaxWager(null, { maxMultiplierX: MAX_MULTIPLIER_X }).kind).toBe('unknown');
  });

  it('the risk leg binds at maxAllowedReservedProfit / (multiplier - 1)', () => {
    // A 25x game reserves wager * 24, so a 2,400-token cap allows a 100-token wager.
    const result = computeMaxWager(snap({ maxAllowedReservedProfit: (2_400n * ONE).toString() }), {
      maxMultiplierX: MAX_MULTIPLIER_X,
    });
    expect(result.kind).toBe('limit');
    if (result.kind !== 'limit') return;
    expect(result.maxWager).toBe(100n * ONE);
    expect(typeof result.maxWager, 'base units, as a bigint').toBe('bigint');
  });

  it('an absolute maxBetAmount wins when it is the lower of the two', () => {
    const result = computeMaxWager(
      snap({ maxAllowedReservedProfit: (2_400n * ONE).toString(), maxBetAmount: (10n * ONE).toString() }),
      { maxMultiplierX: MAX_MULTIPLIER_X },
    );
    expect(result.kind).toBe('limit');
    if (result.kind !== 'limit') return;
    expect(result.maxWager).toBe(10n * ONE);
  });
});

describe('the ceiling this game actually shows a player', () => {
  /**
   * The mapping `chain.ts` performs. Read as a bare value — which is what
   * `?? null` did — every one of these would be an object, and every
   * `stake > ceiling` check against it is silently `false`.
   */
  const maxStakeFrom = (r: ReturnType<typeof computeMaxWager>): bigint | null =>
    r.kind === 'limit' ? r.maxWager : null;

  it('is a bigint when the host publishes a limit, and a number the UI can compare', () => {
    const ceiling = maxStakeFrom(
      computeMaxWager(snap({ maxAllowedReservedProfit: (2_400n * ONE).toString() }), {
        maxMultiplierX: MAX_MULTIPLIER_X,
      }),
    );
    expect(typeof ceiling).toBe('bigint');
    // The comparison the stake field makes. This is the one that stopped working.
    expect(101n * ONE > (ceiling as bigint), 'a stake over the ceiling is over it').toBe(true);
    expect(99n * ONE > (ceiling as bigint), 'and one under it is not').toBe(false);
  });

  it('is null — not an object — when no limit binds', () => {
    expect(maxStakeFrom(computeMaxWager(null, { maxMultiplierX: MAX_MULTIPLIER_X }))).toBeNull();
  });
});

describe('the phase mapping is pinned to the SDK, not to a memory of it', () => {
  /**
   * `chain.ts` maps the facet's phases onto our own names twice — by
   * `phaseName` and, for hosts that only send a number, by index into a plain
   * array. Both were written out by hand against an SDK that has since changed
   * other things under us, and a renumbered or inserted phase would land
   * silently: a round would simply read as the wrong phase, and the closest
   * wrong answer is 'opening', which looks like a game that never started.
   */
  const EXPECTED: Record<keyof typeof SessionPhase, string> = {
    NONE: 'opening',
    WAITING_RANDOMNESS: 'waiting-randomness',
    WAITING_PLAYER_ACTION: 'waiting-player',
    SETTLED: 'settled',
    FORFEITED: 'forfeited',
    CANCELLED: 'cancelled',
  };

  const row = (over: Partial<SessionRow>): SessionRow =>
    ({ sessionId: '1', sessionKey: '0x', gameAddress: '0x', isSettled: false, lastEventTimestamp: 0, raw: {}, ...over }) as SessionRow;

  it('covers exactly the phases the SDK declares, with nothing left over', () => {
    expect(Object.keys(SessionPhase).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('reads every phase the same way by name and by number', () => {
    for (const [name, index] of Object.entries(SessionPhase) as [keyof typeof SessionPhase, number][]) {
      const expected = EXPECTED[name];
      expect(phaseOf(row({ phaseName: name })), `${name} by name`).toBe(expected);
      expect(phaseOf(row({ phase: index })), `${name} by index ${index}`).toBe(expected);
    }
  });

  it('a phase the SDK does not declare never reads as a real one', () => {
    const beyond = Math.max(...Object.values(SessionPhase)) + 1;
    expect(phaseOf(row({ phase: beyond }))).toBe('opening');
    expect(phaseOf(row({ phaseName: 'SOMETHING_NEW' as keyof typeof SessionPhase }))).toBe('opening');
  });
});

describe("the host's own validator accepts all three manifests", () => {
  /**
   * The gates check the manifests by hand — schemaVersion, gameId, locales,
   * capabilities. The HOST does not use our checks; it uses this validator, and
   * a manifest it rejects is an entry that does not load in the gallery.
   *
   * Until now the SDK's validator only ever saw CANDLE's, inside
   * `npm run spike`, which needs a running chain. Two of the three submitted
   * entries had never been through it — exactly the "a rule that held for one
   * game and was quietly dropped for the next" that claude.md §2 forbids. It
   * needs no chain, so it belongs here.
   */
  const ENTRIES = [
    { slug: 'candle', gameId: 'CandleGame', name: 'Candle' },
    { slug: 'survey', gameId: 'SurveyGame', name: 'The Survey' },
    { slug: 'brokers', gameId: 'BrokersGame', name: 'The Brokers' },
  ] as const;

  const manifestOf = (slug: string) =>
    JSON.parse(readFileSync(new URL(`../public/${slug}/game.manifest.json`, import.meta.url), 'utf8')) as unknown;

  for (const entry of ENTRIES) {
    it(`${entry.slug}: validateCasinoGameManifest accepts it`, () => {
      const result = validateCasinoGameManifest(manifestOf(entry.slug));
      expect(result.ok, result.ok ? '' : result.reason).toBe(true);
      if (!result.ok) return;
      expect(resolveManifestMetadata(result.manifest, 'en').name).toBe(entry.name);
      // An unknown locale must fall back rather than blank the gallery card.
      expect(resolveManifestMetadata(result.manifest, 'xx').name).toBe(entry.name);
    });

    it(`${entry.slug}: the manifest's gameId canonicalises to the contract's`, () => {
      const manifest = manifestOf(entry.slug) as { gameId: string };
      expect(canonicalCasinoGameId(manifest.gameId)).toBe(canonicalCasinoGameId(entry.gameId));
    });
  }

  it('and no two entries collide once canonicalised — the host keys a game by it', () => {
    const canonical = ENTRIES.map(e => canonicalCasinoGameId(e.gameId));
    expect(new Set(canonical).size, canonical.join(', ')).toBe(ENTRIES.length);
  });
});

describe('every other SDK symbol this game imports still exists', () => {
  it('the guest bridge and the manifest helpers are all callable', () => {
    for (const [name, fn] of Object.entries({
      connectGameToHost,
      computeMaxWager,
      validateCasinoGameManifest,
      canonicalCasinoGameId,
      resolveManifestMetadata,
      assertSameOriginUrls,
    })) {
      expect(typeof fn, `${name} is a function`).toBe('function');
    }
  });

  it('canonicalCasinoGameId still normalises the way the manifests were written', () => {
    expect(canonicalCasinoGameId('CandleGame')).toBe(canonicalCasinoGameId('candlegame'));
  });
});
