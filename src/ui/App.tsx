/**
 * The table (plan.md D2).
 *
 * Deliberately plain: the lot, its face value, the inch counter, the payout if
 * claimed right now, and two switches. Phase 3 replaces this with the
 * candlelight scene — if the loop is not good in ASCII, no amount of candlelight
 * fixes it, so it has to be judged like this first.
 *
 * The UI holds no game logic (claude.md §3). Every number it shows is either
 * read from the host or computed by `src/game/`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COPY } from './copy';
import { formatAmount, formatFace, formatWax, parseAmount } from './format';
import { HelpPanel } from './HelpPanel';
import { Scene, applySceneLight } from './Scene';
import { useCandleHost } from './useHost';
import { lotById } from '../game/paytable';
import { INCHES, payoutBase, waxBpAt } from '../game/wax';
import type { LotFace } from '../render/scene';
import type { CandleHost, HostView } from '../bridge';

export function App() {
  const { host, view } = useCandleHost();
  const [helpOpen, setHelpOpen] = useState(false);
  const [stakeText, setStakeText] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true); // phase 4 wires the graphs

  const decimals = view?.tokenDecimals ?? 18;
  const stakeBase = useMemo(() => {
    if (!view) return 0n;
    if (stakeText === null) return view.defaultStakeBase;
    return parseAmount(stakeText, decimals) ?? 0n;
  }, [stakeText, view, decimals]);

  const session = view?.session ?? null;
  const settled = session?.isSettled === true;
  const lot = session?.lotId !== null && session?.lotId !== undefined ? lotById(session.lotId) : null;
  const canAct = session?.phase === 'waiting-player' && lot !== null;
  const forced = canAct && session.inch >= INCHES;

  // The lot the player just refused, kept for one beat so the scene can show it
  // receding into oxblood (docs.md §6.1).
  const burnedRef = useRef<LotFace | null>(null);
  const lastLotRef = useRef<{ key: string; face: LotFace } | null>(null);

  const lotFace: LotFace | null = useMemo(
    () => (lot ? { name: lot.name, faceText: formatFace(lot.faceBp), isEmpty: lot.faceBp === 0 } : null),
    [lot],
  );

  const payoutText = useMemo(() => {
    if (!session || !lot) return null;
    const amount = settled ? session.payoutBase : payoutBase(session.stakeBase, lot.faceBp, session.inch);
    return formatAmount(amount, decimals);
  }, [session, lot, settled, decimals]);

  useEffect(() => {
    const key = session ? `${session.sessionKey}:${session.inch}` : '';
    const previous = lastLotRef.current;
    if (lotFace && key && previous?.key !== key) {
      // A new lot landed; whatever was here before was refused.
      burnedRef.current = previous && previous.key.startsWith(session?.sessionKey ?? '') ? previous.face : null;
      lastLotRef.current = { key, face: lotFace };
    }
    if (!session) {
      burnedRef.current = null;
      lastLotRef.current = null;
    }
  }, [lotFace, session]);

  const burnedLot = session && !settled && lot === null ? burnedRef.current : null;

  const sceneLabel = useMemo(() => {
    if (!session) return COPY.tagline;
    if (!lot) return COPY.waitingForLot;
    return `${COPY.inchOf(session.inch)}. ${lot.name}, ${formatFace(lot.faceBp)}. ${COPY.waxRemaining} ${formatWax(waxBpAt(session.inch))}.`;
  }, [session, lot]);

  // The room is lit from the wax even before the first lot lands.
  useEffect(() => {
    applySceneLight(waxBpAt(session?.inch ?? 1));
  }, [session?.inch]);

  const stakeError = useMemo(() => {
    if (!view || session) return null;
    if (stakeBase < view.minStakeBase) return COPY.stakeTooSmall;
    if (view.purseBase !== null && stakeBase > view.purseBase) return COPY.notEnoughChips;
    if (view.maxStakeBase !== null && stakeBase > view.maxStakeBase) return COPY.stakeTooLarge;
    return null;
  }, [view, session, stakeBase]);

  const deal = useCallback(() => {
    if (!host || !view || session || stakeError) return;
    void host.openSession(stakeBase);
  }, [host, view, session, stakeError, stakeBase]);

  const act = useCallback(
    (action: 'CLAIM' | 'BURN') => {
      if (!host || !canAct) return;
      if (action === 'BURN' && forced) return;
      void host.submitAction(action);
    },
    [host, canAct, forced],
  );

  const again = useCallback(() => {
    if (!host || !settled) return;
    void host.revealOutcome().then(() => host.dealAgain());
  }, [host, settled]);

  useKeyboard({ helpOpen, setHelpOpen, canAct, forced, settled, session: !!session, act, again, deal, setSoundOn });

  if (!view) return <main className="table table--loading" />;

  return (
    <main className="table" data-theme={view.theme}>
      <TopBar view={view} host={host} soundOn={soundOn} onSound={() => setSoundOn(v => !v)} onHelp={() => setHelpOpen(true)} />

      <section className="stage">
        <Scene
          inch={session?.inch ?? 1}
          lot={lotFace}
          burnedLot={burnedLot}
          payoutText={payoutText}
          settled={settled}
          label={sceneLabel}
        />

        {/*
          The accessible layer. The canvas above is the scene; this is what a
          screen reader reads and what the keyboard user is told. It carries the
          same facts, never a different set — nothing in this game is said in
          colour alone.
        */}
        <div className="readout" aria-live="polite">
          {session === null ? (
            <StakeControl
              view={view}
              stakeText={stakeText ?? formatAmount(view.defaultStakeBase, decimals)}
              onStakeText={setStakeText}
              error={stakeError}
              onDeal={deal}
            />
          ) : lot === null ? (
            <p className="readout__line">{COPY.waitingForLot}</p>
          ) : (
            <>
              <p className="readout__label">{COPY.lotOnTable}</p>
              <p className="readout__name">{lot.name}</p>
              <p className="readout__face">{formatFace(lot.faceBp)}</p>
              <dl className="readout__facts">
                <div>
                  <dt>{COPY.inchOf(session.inch)}</dt>
                  <dd>
                    {COPY.waxRemaining} {formatWax(waxBpAt(session.inch))}
                  </dd>
                </div>
                <div>
                  <dt>{settled ? COPY.paid : COPY.ifClaimedNow}</dt>
                  <dd className="readout__payout">
                    {payoutText} {view.tokenSymbol}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>
      </section>

      <section className="switches">
        {session === null ? null : settled ? (
          <Settled session={session} onAgain={again} />
        ) : canAct ? (
          <>
            {forced ? <p className="switches__note">{COPY.guttering}</p> : null}
            <button className="btn btn--claim" onClick={() => act('CLAIM')}>
              {COPY.claim} <kbd>{COPY.claimKey}</kbd>
              <span className="btn__hint">{COPY.claimHint}</span>
            </button>
            <button className="btn btn--burn" onClick={() => act('BURN')} disabled={forced}>
              {COPY.burn} <kbd>{COPY.burnKey}</kbd>
              <span className="btn__hint">{COPY.burnHint}</span>
            </button>
          </>
        ) : null}
        {session?.error ? <p className="switches__error">{session.error}</p> : null}
      </section>

      {helpOpen ? <HelpPanel onClose={() => setHelpOpen(false)} /> : null}
    </main>
  );
}

function Settled({ session, onAgain }: { session: NonNullable<HostView['session']>; onAgain: () => void }) {
  const guttered = session.inch >= INCHES;
  const nothing = session.payoutBase === 0n;
  return (
    <div className="settled">
      <p className="settled__line">
        {guttered ? COPY.gutteredAt() : COPY.claimedAt(session.inch)}
        {nothing ? ` ${COPY.tookNothing}` : ''}
      </p>
      <button className="btn btn--claim" onClick={onAgain} autoFocus>
        {COPY.dealAgain} <kbd>{COPY.dealAgainKey}</kbd>
      </button>
    </div>
  );
}

function StakeControl({
  view,
  stakeText,
  onStakeText,
  error,
  onDeal,
}: {
  view: HostView;
  stakeText: string;
  onStakeText: (value: string) => void;
  error: string | null;
  onDeal: () => void;
}) {
  const blocked = walletMessage(view);
  return (
    <form
      className="stake"
      onSubmit={event => {
        event.preventDefault();
        onDeal();
      }}
    >
      <label className="stake__label" htmlFor="stake">
        {COPY.stake}
      </label>
      <input
        id="stake"
        className="stake__input"
        inputMode="decimal"
        autoComplete="off"
        value={stakeText}
        onChange={event => onStakeText(event.target.value)}
      />
      <span className="stake__symbol">{view.tokenSymbol}</span>
      <button className="btn btn--claim" type="submit" disabled={!!error || !view.canBet || !!blocked}>
        {COPY.lightTheCandle}
      </button>
      {blocked ? <p className="stake__error">{blocked}</p> : error ? <p className="stake__error">{error}</p> : null}
    </form>
  );
}

function walletMessage(view: HostView): string | null {
  if (view.fatal) return COPY.hostUnreachable;
  if (view.kind === 'demo') return null;
  switch (view.walletStatus) {
    case 'ready':
      return null;
    case 'setup-required':
      return COPY.walletSetupRequired;
    case 'session-key-mismatch':
      return COPY.walletMismatch;
    default:
      return COPY.walletDisconnected;
  }
}

function TopBar({
  view,
  host,
  soundOn,
  onSound,
  onHelp,
}: {
  view: HostView;
  host: CandleHost | null;
  soundOn: boolean;
  onSound: () => void;
  onHelp: () => void;
}) {
  return (
    <header className="top">
      <span className="top__mark">{COPY.title}</span>
      {view.kind === 'demo' ? (
        <>
          <span className="top__badge">{COPY.demoBadge}</span>
          <span className="top__purse">
            {COPY.purse} {formatAmount(view.purseBase ?? 0n, view.tokenDecimals)}
          </span>
          {host?.refill ? (
            <button className="btn btn--ghost" onClick={() => host.refill?.()}>
              {COPY.refill}
            </button>
          ) : null}
        </>
      ) : null}
      <span className="top__spacer" />
      <button className="btn btn--ghost" onClick={onSound}>
        {soundOn ? COPY.soundOn : COPY.soundOff} <kbd>{COPY.soundKey}</kbd>
      </button>
      <button className="btn btn--ghost" onClick={onHelp}>
        <kbd>{COPY.helpKey}</kbd>
      </button>
    </header>
  );
}

/** The full keyboard path (docs.md §6.3). Every control is printed on its switch. */
function useKeyboard(args: {
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  canAct: boolean;
  forced: boolean;
  settled: boolean;
  session: boolean;
  act: (action: 'CLAIM' | 'BURN') => void;
  again: () => void;
  deal: () => void;
  setSoundOn: (update: (value: boolean) => boolean) => void;
}) {
  const { helpOpen, setHelpOpen, canAct, forced, settled, session, act, again, deal, setSoundOn } = args;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

      if (event.key === 'Escape' && helpOpen) {
        setHelpOpen(false);
        return;
      }
      if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault();
        setHelpOpen(!helpOpen);
        return;
      }
      if (helpOpen) return;
      if (event.key === 'm' || event.key === 'M') {
        setSoundOn(value => !value);
        return;
      }
      if (typing) return; // the stake field owns its own keys

      if (settled && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        again();
        return;
      }
      if (!session && event.key === 'Enter') {
        event.preventDefault();
        deal();
        return;
      }
      if (!canAct) return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        act('CLAIM');
        return;
      }
      if (!forced && (event.key === 'b' || event.key === 'B' || event.key === 'ArrowDown')) {
        event.preventDefault();
        act('BURN');
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen, setHelpOpen, canAct, forced, settled, session, act, again, deal, setSoundOn]);
}
