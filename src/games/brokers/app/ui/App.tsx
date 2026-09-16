/**
 * The floor.
 *
 * Every price named, what each remaining man charges, what the day has cost, and
 * what selling right now would pay. Five switches: four men and the sale.
 *
 * What is NOT here is the index. The `?` panel publishes it in full, with the
 * rule and the whole band — we are not selling an information edge (claude.md
 * §8) — but the floor does not rank the men for the player, any more than
 * CANDLE prints "claim this one" over a lot.
 *
 * The UI holds no game logic (claude.md §3). Every number it shows is either
 * read from the host or computed by `src/games/brokers/core/`.
 */
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COPY } from './copy';
import { formatAmount, formatFee, formatPrice, parseAmount } from './format';
import { HelpPanel } from './HelpPanel';
import { Book, bookRowFrom, type BookRow } from './Book';
import { Floor, applyFloorLight } from './Floor';
import { useBrokersHost } from './useHost';
import { useBrokersAudio } from './useAudio';
import { BROKER_LIST, brokerById, feesForMask, payoutBase, type BrokerId } from '../../core/market';
import type { Desk, Slip } from '../render/floor';
import type { BrokersAction, BrokersHost, BrokersView } from '../bridge';

export function App() {
  const { host, view } = useBrokersHost();
  const [helpOpen, setHelpOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  /** One page load, like the purse. Nothing is written to storage. */
  const [book, setBook] = useState<readonly BookRow[]>([]);
  const [stakeText, setStakeText] = useState<string | null>(null);
  // Unmuted by default, with a visible one-key toggle (claude.md §5).
  const [soundOn, setSoundOn] = useState(true);
  const [turbo, setTurbo] = useState(false);

  const decimals = view?.tokenDecimals ?? 18;
  const stakeBase = useMemo(() => {
    if (!view) return 0n;
    if (stakeText === null) return view.defaultStakeBase;
    return parseAmount(stakeText, decimals) ?? 0n;
  }, [stakeText, view, decimals]);

  const session = view?.session ?? null;
  const settled = session?.isSettled === true;
  const onTheFloor = session !== null && session.bestBp > 0;
  const canAct = session?.phase === 'waiting-player' && onTheFloor && !settled;
  const feesBp = session ? feesForMask(session.askedMask) : 0;

  /** Who named the best price in hand. */
  const holding = useMemo(() => {
    if (!session) return null;
    return session.named.reduce<(typeof session.named)[number] | null>(
      (best, named) => (best === null || named.priceBp > best.priceBp ? named : best),
      null,
    );
  }, [session]);

  const nameOf = useCallback(
    (brokerId: BrokerId | null) => (brokerId === null ? COPY.theHouse : brokerById(brokerId).name),
    [],
  );

  const slips: readonly Slip[] = useMemo(() => {
    if (!session) return [];
    return session.named.map(named => ({
      brokerId: named.brokerId,
      name: nameOf(named.brokerId),
      priceBp: named.priceBp,
      priceText: formatPrice(named.priceBp),
      isBest: named.priceBp === session.bestBp,
    }));
  }, [session, nameOf]);

  const desks: readonly Desk[] = useMemo(() => {
    if (!session) return [];
    return BROKER_LIST.filter(broker => (session.askedMask & (1 << broker.id)) === 0).map(broker => ({
      brokerId: broker.id,
      name: broker.name,
      feeText: formatFee(broker.feeBp),
      looking: false,
    })).concat(
      session.waitingOn !== null
        ? [
            {
              brokerId: session.waitingOn,
              name: brokerById(session.waitingOn).name,
              feeText: formatFee(brokerById(session.waitingOn).feeBp),
              looking: true,
            },
          ]
        : [],
    );
  }, [session]);

  const takeText = useMemo(() => {
    if (!session || session.bestBp === 0) return null;
    const amount = settled ? session.payoutBase : payoutBase(session.stakeBase, session.bestBp, feesBp);
    return formatAmount(amount, decimals);
  }, [session, settled, feesBp, decimals]);

  const sceneLabel = useMemo(() => {
    if (!session) return COPY.tagline;
    if (!onTheFloor) return COPY.waitingForHouse;
    const held = holding ? `${COPY.holding} ${formatPrice(session.bestBp)} ${COPY.heldFrom(nameOf(holding.brokerId))}` : '';
    return `${held}. ${COPY.feesPaid} ${formatFee(feesBp)}. ${COPY.brokersLeft(BROKER_LIST.length - popcount(session.askedMask))}.`;
  }, [session, onTheFloor, holding, feesBp, nameOf]);

  // The room is lit from what the day has cost, even before the house speaks.
  useEffect(() => {
    applyFloorLight(feesBp);
  }, [feesBp]);

  const stakeError = useMemo(() => {
    if (!view || session) return null;
    if (stakeBase < view.minStakeBase) return COPY.stakeTooSmall;
    if (view.purseBase !== null && stakeBase > view.purseBase) return COPY.notEnoughChips;
    if (view.maxStakeBase !== null && stakeBase > view.maxStakeBase) return COPY.stakeTooLarge;
    return null;
  }, [view, session, stakeBase]);

  const deal = useCallback(() => {
    if (!host || !view || session || stakeError) return;
    void host.openSession(stakeBase).catch(() => {});
  }, [host, view, session, stakeError, stakeBase]);

  const act = useCallback(
    (action: BrokersAction) => {
      if (!host || !canAct) return;
      void host.submitAction(action).catch(() => {});
    },
    [host, canAct],
  );

  const again = useCallback(() => {
    if (!host || !settled || !view) return;
    void host
      .revealOutcome()
      .catch(() => {})
      .then(() => {
        host.dealAgain();
        const affordable = view.purseBase === null || view.purseBase >= stakeBase;
        if (view.kind === 'demo' && !stakeError && affordable) {
          void host.openSession(stakeBase).catch(() => {});
        }
      });
  }, [host, settled, view, stakeError, stakeBase]);

  useBrokersAudio(soundOn, session);

  // A sold claim joins the book exactly once.
  useEffect(() => {
    if (!session?.isSettled) return;
    setBook(rows => (rows.some(row => row.key === session.sessionKey) ? rows : [...rows, bookRowFrom(session)]));
  }, [session]);

  /**
   * **Zero clicks to comprehension** (claude.md §5, prd.md §2). Someone landing
   * on the bare URL must see a price already on the table, what each man charges
   * and what selling pays — not a form. So free play takes the first claim to
   * the floor itself.
   */
  const dealtOnLoad = useRef(false);
  useEffect(() => {
    if (!host || !view || view.kind !== 'demo' || view.session !== null) return;
    if (dealtOnLoad.current) return;
    dealtOnLoad.current = true;
    void host.openSession(view.defaultStakeBase).catch(() => {
      dealtOnLoad.current = false;
    });
  }, [host, view]);

  useEffect(() => {
    host?.setTurbo?.(turbo);
  }, [host, turbo]);

  useKeyboard({
    helpOpen,
    setHelpOpen,
    bookOpen,
    setBookOpen,
    canAct,
    settled,
    session: !!session,
    askedMask: session?.askedMask ?? 0,
    act,
    again,
    deal,
    setSoundOn,
    setTurbo,
  });

  if (!view) return <main className="table table--loading" />;

  return (
    <main className="table" data-theme={view.theme}>
      <TopBar
        view={view}
        host={host}
        soundOn={soundOn}
        onSound={() => setSoundOn(v => !v)}
        turbo={turbo}
        onTurbo={() => setTurbo(v => !v)}
        onBook={() => setBookOpen(true)}
        bookCount={book.length}
        onHelp={() => setHelpOpen(true)}
      />

      <section className="stage">
        <Floor
          slips={slips}
          desks={desks}
          feesBp={feesBp}
          payoutText={takeText}
          settled={settled}
          label={sceneLabel}
        />

        {/*
          The accessible layer. The canvas draws the floor as heights; this says
          the same things in words. Nothing in this game is carried by height
          alone any more than by colour alone.
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
          ) : !onTheFloor ? (
            <p className="readout__line">{COPY.waitingForHouse}</p>
          ) : (
            <>
              <p className="readout__label">{COPY.claimOnOffer}</p>
              <p className="prices">
                {session.named.map((named, i) => (
                  <span
                    key={`${named.brokerId ?? 'house'}-${i}`}
                    className={`prices__one${named.priceBp === session.bestBp ? ' prices__one--best' : ''}`}
                  >
                    <span className="prices__who">{nameOf(named.brokerId)}</span>{' '}
                    <span className="prices__price">{formatPrice(named.priceBp)}</span>
                  </span>
                ))}
                {session.waitingOn !== null ? (
                  <span className="prices__one prices__one--waiting">
                    {COPY.waitingFor(brokerById(session.waitingOn).name)}
                  </span>
                ) : null}
              </p>

              <dl className="readout__facts">
                <div>
                  <dt>{COPY.holding}</dt>
                  <dd>
                    {formatPrice(session.bestBp)}{' '}
                    <span className="muted">{holding ? COPY.heldFrom(nameOf(holding.brokerId)) : ''}</span>
                  </dd>
                </div>
                <div>
                  <dt>{COPY.feesPaid}</dt>
                  <dd>{formatFee(feesBp)}</dd>
                </div>
                <div>
                  <dt>{settled ? COPY.paid : COPY.takeNow}</dt>
                  <dd className="readout__payout">
                    {takeText} {view.tokenSymbol}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>
      </section>

      <section className="switches">
        {session === null ? null : settled ? (
          <Settled
            session={session}
            nameOf={nameOf}
            feesBp={feesBp}
            onAgain={again}
            stake={
              <StakeField
                view={view}
                stakeText={stakeText ?? formatAmount(view.defaultStakeBase, decimals)}
                onStakeText={setStakeText}
                error={stakeError}
              />
            }
          />
        ) : canAct ? (
          <>
            <button className="btn btn--claim" onClick={() => act({ kind: 'TAKE' })}>
              {COPY.take} <kbd>{COPY.takeKey}</kbd>
              <span className="btn__hint">{COPY.takeHint}</span>
            </button>

            <div className="brokers">
              {BROKER_LIST.map(broker => {
                const asked = (session.askedMask & (1 << broker.id)) !== 0;
                return (
                  <button
                    key={broker.id}
                    className="btn btn--burn brokers__one"
                    onClick={() => act({ kind: 'ASK', brokerId: broker.id })}
                    disabled={asked}
                    aria-label={COPY.askAria(broker.name, formatFee(broker.feeBp))}
                  >
                    <span className="brokers__name">{broker.name.toUpperCase()}</span>
                    <kbd>{broker.id + 1}</kbd>
                    {asked ? <span className="btn__hint">{COPY.alreadyAsked}</span> : null}
                  </button>
                );
              })}
            </div>
            {popcount(session.askedMask) === BROKER_LIST.length ? (
              <p className="switches__note">{COPY.everybodyAsked}</p>
            ) : null}
          </>
        ) : session.waitingOn !== null ? (
          <p className="switches__note">{COPY.waitingFor(brokerById(session.waitingOn).name)}</p>
        ) : null}
        {session?.error ? <p className="switches__error">{session.error}</p> : null}
      </section>

      {helpOpen ? <HelpPanel onClose={() => setHelpOpen(false)} /> : null}
      {bookOpen ? (
        <Book rows={book} decimals={decimals} symbol={view.tokenSymbol} onClose={() => setBookOpen(false)} />
      ) : null}
    </main>
  );
}

function Settled({
  session,
  nameOf,
  feesBp,
  onAgain,
  stake,
}: {
  session: NonNullable<BrokersView['session']>;
  nameOf: (id: BrokerId | null) => string;
  feesBp: number;
  onAgain: () => void;
  stake: React.ReactNode;
}) {
  const winner = session.named.reduce<(typeof session.named)[number] | null>(
    (best, named) => (best === null || named.priceBp > best.priceBp ? named : best),
    null,
  );
  const price = formatPrice(session.bestBp);

  return (
    <div className="settled">
      <p className="settled__line">
        {winner === null || winner.brokerId === null ? COPY.soldForHouse(price) : COPY.soldFor(price, nameOf(winner.brokerId))}{' '}
        {feesBp > 0 ? COPY.afterFees(formatFee(feesBp)) : ''}
      </p>

      {/*
        The Ghost Price. One beat, stated flatly, never dramatised: no "you were
        so close", no comparison, no exclamation mark (claude.md §6, §7).
      */}
      <p className="ghost">
        {session.ghost && session.ghost.brokerId !== null ? (
          <>
            <span className="ghost__label">{COPY.ghostLabel}</span>{' '}
            <span className="ghost__lot">
              {nameOf(session.ghost.brokerId)} {formatPrice(session.ghost.priceBp)}
            </span>
          </>
        ) : (
          <span className="ghost__label">{COPY.ghostNone}</span>
        )}
      </p>
      <p className="ghost__note">{COPY.ghostNote}</p>

      {stake}

      <button className="btn btn--claim" onClick={onAgain} autoFocus>
        {COPY.dealAgain} <kbd>{COPY.dealAgainKey}</kbd>
      </button>
    </div>
  );
}

function StakeField({
  view,
  stakeText,
  onStakeText,
  error,
}: {
  view: BrokersView;
  stakeText: string;
  onStakeText: (value: string) => void;
  error: string | null;
}) {
  return (
    <div className="stakeline">
      <label className="stake__label" htmlFor="stake">
        {COPY.stake}
      </label>
      <input
        id="stake"
        className="stake__input stake__input--inline"
        inputMode="decimal"
        autoComplete="off"
        value={stakeText}
        onChange={event => onStakeText(event.target.value)}
      />
      <span className="stake__symbol">{view.tokenSymbol}</span>
      {error ? <p className="stake__error">{error}</p> : null}
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
  view: BrokersView;
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
        {COPY.openTheFloor}
      </button>
      {blocked ? <p className="stake__error">{blocked}</p> : error ? <p className="stake__error">{error}</p> : null}
    </form>
  );
}

function walletMessage(view: BrokersView): string | null {
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
  turbo,
  onTurbo,
  onBook,
  bookCount,
  onHelp,
}: {
  view: BrokersView;
  host: BrokersHost | null;
  soundOn: boolean;
  onSound: () => void;
  turbo: boolean;
  onTurbo: () => void;
  onBook: () => void;
  bookCount: number;
  onHelp: () => void;
}) {
  return (
    <header className="top">
      <span className="top__mark">{COPY.title}</span>
      {view.kind === 'demo' ? (
        <>
          <span className="top__badge">{COPY.demoBadge}</span>
          <span className="top__reading">
            <span className="top__reading-label">{COPY.purse}</span>
            <span className="top__reading-value">{formatAmount(view.purseBase ?? 0n, view.tokenDecimals)}</span>
          </span>
          {host?.refill ? (
            <button className="btn btn--ghost" onClick={() => host.refill?.()}>
              {COPY.refill}
            </button>
          ) : null}
        </>
      ) : null}
      <div className="cluster">
        <button className="btn btn--ghost" onClick={onBook}>
        {COPY.ledgerTitle} <kbd>{COPY.ledgerKey}</kbd>
        {bookCount > 0 ? <span className="top__count">{bookCount}</span> : null}
      </button>
        <button className="btn btn--ghost" onClick={onTurbo} aria-pressed={turbo}>
        {turbo ? COPY.turboOn : COPY.turboOff} <kbd>{COPY.turboKey}</kbd>
      </button>
        <button className="btn btn--ghost" onClick={onSound} aria-pressed={soundOn}>
        {soundOn ? COPY.soundOn : COPY.soundOff} <kbd>{COPY.soundKey}</kbd>
      </button>
        <button className="btn btn--ghost" onClick={onHelp}>
          <kbd>{COPY.helpKey}</kbd>
        </button>
      </div>
    </header>
  );
}

/** The full keyboard path. Every control is printed on its switch. */
function useKeyboard(args: {
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  bookOpen: boolean;
  setBookOpen: (open: boolean) => void;
  canAct: boolean;
  settled: boolean;
  session: boolean;
  askedMask: number;
  act: (action: BrokersAction) => void;
  again: () => void;
  deal: () => void;
  setSoundOn: (update: (value: boolean) => boolean) => void;
  setTurbo: (update: (value: boolean) => boolean) => void;
}) {
  const { helpOpen, setHelpOpen, bookOpen, setBookOpen, canAct, settled, session, askedMask, act, again, deal, setSoundOn, setTurbo } = args;
  const anyPanelOpen = helpOpen || bookOpen;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

      if (event.key === 'Escape' && anyPanelOpen) {
        setHelpOpen(false);
        setBookOpen(false);
        return;
      }
      if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault();
        setBookOpen(false);
        setHelpOpen(!helpOpen);
        return;
      }
      if (event.key === 'l' || event.key === 'L') {
        if (typing) return;
        setHelpOpen(false);
        setBookOpen(!bookOpen);
        return;
      }
      if (anyPanelOpen) return;
      if (event.key === 'm' || event.key === 'M') {
        setSoundOn(value => !value);
        return;
      }
      if (event.key === 't' || event.key === 'T') {
        setTurbo(value => !value);
        return;
      }
      if (typing) return;

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
        act({ kind: 'TAKE' });
        return;
      }
      // 1..4 ask that broker, in the order they stand on the floor.
      const digit = Number.parseInt(event.key, 10);
      if (Number.isInteger(digit) && digit >= 1 && digit <= BROKER_LIST.length) {
        const id = (digit - 1) as BrokerId;
        if ((askedMask & (1 << id)) !== 0) return;
        event.preventDefault();
        act({ kind: 'ASK', brokerId: id });
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen, setHelpOpen, bookOpen, setBookOpen, anyPanelOpen, canAct, settled, session, askedMask, act, again, deal, setSoundOn, setTurbo]);
}

function popcount(mask: number): number {
  let count = 0;
  for (let bit = mask; bit; bit >>= 1) count += bit & 1;
  return count;
}
