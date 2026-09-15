/**
 * The desk.
 *
 * The manifest, how many surveyors have been aboard, what they add up to, what
 * each call pays right now, and three switches. Everything a player needs to
 * decide is on the screen at once — and the one thing that would decide it FOR
 * them, the live posterior as a number, is in the `?` panel with the rest of the
 * maths rather than on the desk. The fog says it; the table prints it; we are not
 * selling an information edge (claude.md §8) and we are not playing the hand.
 *
 * The UI holds no game logic (claude.md §3). Every number it shows is either
 * read from the host or computed by `src/games/survey/core/`.
 */
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COPY, tallyPhrase } from './copy';
import { formatAmount, formatPremium, formatValue, parseAmount } from './format';
import { HelpPanel } from './HelpPanel';
import { Book, bookRowFrom, type BookRow } from './Book';
import { Roads, applyRoomLight } from './Roads';
import { useSurveyHost } from './useHost';
import { useSurveyAudio } from './useAudio';
import { cargoById, premiumBpAt, payoutBase, DECLINE_BP, MAX_SURVEYS } from '../../core/vessel';
import { daylightAt } from '../daylight';
import type { Manifest } from '../render/roads';
import type { SurveyAction, SurveyHost, SurveyView } from '../bridge';

export function App() {
  const { host, view } = useSurveyHost();
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
  const cargo = session?.cargoId !== null && session?.cargoId !== undefined ? cargoById(session.cargoId) : null;
  const canAct = session?.phase === 'waiting-player' && cargo !== null && !settled;
  const spent = canAct && session.surveys >= MAX_SURVEYS;

  const manifest: Manifest | null = useMemo(
    () => (cargo ? { name: cargo.name, valueText: formatValue(cargo.valueBp) } : null),
    [cargo],
  );

  /** What underwriting would pay if she comes home, at this many surveys. */
  const underwriteText = useMemo(() => {
    if (!session || !cargo) return null;
    return formatAmount(payoutBase(session.stakeBase, cargo.valueBp, session.surveys), decimals);
  }, [session, cargo, decimals]);

  /** What declining pays, whatever she turns out to be. */
  const declineText = useMemo(() => {
    if (!session) return null;
    return formatAmount(payoutBase(session.stakeBase, DECLINE_BP, session.surveys), decimals);
  }, [session, decimals]);

  const paidText = useMemo(
    () => (session && settled ? formatAmount(session.payoutBase, decimals) : null),
    [session, settled, decimals],
  );

  const tally = useMemo(() => {
    if (!session) return { sound: 0, rotten: 0 };
    const sound = (session.surveys + session.margin) / 2;
    return { sound, rotten: session.surveys - sound };
  }, [session]);

  const sceneLabel = useMemo(() => {
    if (!session) return COPY.tagline;
    if (!cargo) return COPY.waitingForManifest;
    return `${cargo.name}, ${formatValue(cargo.valueBp)}. ${COPY.surveysBought(session.surveys)}. ${tallyPhrase(
      tally.sound,
      tally.rotten,
    )}`;
  }, [session, cargo, tally]);

  // The room is lit from the daylight ladder even before the manifest lands.
  useEffect(() => {
    applyRoomLight(daylightAt(session?.surveys ?? 0));
  }, [session?.surveys]);

  const stakeError = useMemo(() => {
    if (!view || session) return null;
    if (stakeBase < view.minStakeBase) return COPY.stakeTooSmall;
    if (view.purseBase !== null && stakeBase > view.purseBase) return COPY.notEnoughChips;
    if (view.maxStakeBase !== null && stakeBase > view.maxStakeBase) return COPY.stakeTooLarge;
    return null;
  }, [view, session, stakeBase]);

  const deal = useCallback(() => {
    if (!host || !view || session || stakeError) return;
    // The bridge surfaces its own failures through `session.error`; this catch is
    // for the ones it cannot, so a rejected promise is never silent.
    void host.openSession(stakeBase).catch(() => {});
  }, [host, view, session, stakeError, stakeBase]);

  const act = useCallback(
    (action: SurveyAction) => {
      if (!host || !canAct) return;
      if (action === 'SURVEY' && spent) return;
      void host.submitAction(action).catch(() => {});
    },
    [host, canAct, spent],
  );

  const again = useCallback(() => {
    if (!host || !settled || !view) return;
    void host
      .revealOutcome()
      .catch(() => {})
      .then(() => {
        host.dealAgain();
        // Free play keeps dealing; the host path returns to the stake control,
        // because opening a real session is the player's to trigger.
        const affordable = view.purseBase === null || view.purseBase >= stakeBase;
        if (view.kind === 'demo' && !stakeError && affordable) {
          void host.openSession(stakeBase).catch(() => {});
        }
      });
  }, [host, settled, view, stakeError, stakeBase]);

  useSurveyAudio(soundOn, session);

  // A settled voyage joins the book exactly once.
  useEffect(() => {
    if (!session?.isSettled) return;
    setBook(rows => (rows.some(row => row.key === session.sessionKey) ? rows : [...rows, bookRowFrom(session)]));
  }, [session]);

  /**
   * **Zero clicks to comprehension** (claude.md §5, prd.md §2). Someone landing
   * on the bare URL must see the voyage, what it pays and three switches — not a
   * form. So free play opens the first book itself.
   *
   * Only free play. Inside a host a wager is real money and needs intent, so the
   * stake control stays the way in.
   */
  const dealtOnLoad = useRef(false);
  useEffect(() => {
    if (!host || !view || view.kind !== 'demo' || view.session !== null) return;
    if (dealtOnLoad.current) return;
    dealtOnLoad.current = true;
    void host.openSession(view.defaultStakeBase).catch(() => {
      // An empty purse is not an error worth shouting about; the stake control
      // and REFILL are both already on screen.
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
    spent,
    settled,
    session: !!session,
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
        <Roads
          surveys={session?.surveys ?? 0}
          margin={session?.margin ?? 0}
          manifest={manifest}
          surveyorOut={session?.surveyorOut === true}
          payoutText={settled ? paidText : underwriteText}
          settled={settled}
          wasSound={session?.wasSound ?? null}
          label={sceneLabel}
        />

        {/*
          The accessible layer. The canvas above is the scene; this is what a
          screen reader reads and what the keyboard user is told. It carries the
          same facts, never a different set — nothing in this game is said in
          colour alone, and the fog is never the only way to know where the
          reports stand.
        */}
        <div className="readout" aria-live="polite">
          {session === null ? (
            // Free play never lands here — it opens the book on load. This is the
            // host path, where a wager is real money and needs intent.
            <StakeControl
              view={view}
              stakeText={stakeText ?? formatAmount(view.defaultStakeBase, decimals)}
              onStakeText={setStakeText}
              error={stakeError}
              onDeal={deal}
            />
          ) : cargo === null ? (
            <p className="readout__line">{COPY.waitingForManifest}</p>
          ) : (
            <>
              <p className="readout__label">{COPY.manifestLabel}</p>
              <p className="readout__name">{cargo.name}</p>
              <p className="readout__face">{formatValue(cargo.valueBp)}</p>

              <p className="tally" data-margin={session.margin}>
                {tallyPhrase(tally.sound, tally.rotten)}
              </p>

              <dl className="readout__facts">
                <div>
                  <dt>{COPY.surveysBought(session.surveys)}</dt>
                  <dd>
                    {COPY.premiumRemaining} {formatPremium(premiumBpAt(session.surveys))}
                  </dd>
                </div>
                <div>
                  <dt>{settled ? COPY.paid : COPY.ifSheComesHome}</dt>
                  <dd className="readout__payout">
                    {settled ? paidText : underwriteText} {view.tokenSymbol}
                  </dd>
                </div>
                {settled ? null : (
                  <div>
                    <dt>{COPY.declineAndTake}</dt>
                    <dd>
                      {declineText} {view.tokenSymbol}
                    </dd>
                  </div>
                )}
              </dl>
            </>
          )}
        </div>
      </section>

      <section className="switches">
        {session === null ? null : settled ? (
          <Settled
            session={session}
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
            {spent ? <p className="switches__note">{COPY.nobodyLeft}</p> : null}
            {/*
              Wald's problem, as a layout. Sending a surveyor is the one act that
              does not end the voyage — you are paying to put the call off — so it
              sits above the calls and behind a rule, where a player can see that
              it belongs to a different kind. The two calls below it are what
              actually settles her, and they are weighed against each other.
            */}
            <div className="choice choice--buy">
              <button className="btn btn--burn" onClick={() => act('SURVEY')} disabled={spent}>
                {COPY.survey} <kbd>{COPY.surveyKey}</kbd>
                <span className="btn__hint">{COPY.surveyHint}</span>
              </button>
            </div>
            <div className="choice choice--pair">
              <button className="btn btn--claim" onClick={() => act('UNDERWRITE')}>
                {COPY.underwrite} <kbd>{COPY.underwriteKey}</kbd>
                <span className="btn__hint">{COPY.underwriteHint}</span>
              </button>
              <button className="btn btn--burn" onClick={() => act('DECLINE')}>
                {COPY.decline} <kbd>{COPY.declineKey}</kbd>
                <span className="btn__hint">{COPY.declineHint}</span>
              </button>
            </div>
          </>
        ) : session.surveyorOut ? (
          <p className="switches__note">{COPY.surveyorOut}</p>
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
  onAgain,
  stake,
}: {
  session: NonNullable<SurveyView['session']>;
  onAgain: () => void;
  stake: React.ReactNode;
}) {
  const declined = session.call === 'DECLINE';

  return (
    <div className="settled">
      <p className="settled__line">
        {declined ? COPY.declinedAt(session.surveys) : COPY.underwrittenAt(session.surveys)}{' '}
        {declined ? COPY.declineNote : session.wasSound ? COPY.cameHome : COPY.wasRotten}
      </p>

      {/*
        The Ghost Report. One beat, stated flatly, never dramatised: no "you were
        so close", no comparison, no exclamation mark. The call is made and the
        voyage is over (claude.md §6, §7; prd.md §10).
      */}
      <p className="ghost">
        {session.ghostReport ? (
          <>
            <span className="ghost__label">{COPY.ghostLabel}</span>{' '}
            <span className="ghost__lot">
              {session.ghostReport === 'SOUND' ? COPY.ghostSound : COPY.ghostRotten}
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

/** The stake, between voyages. Changing it is a decision, so it is never hidden. */
function StakeField({
  view,
  stakeText,
  onStakeText,
  error,
}: {
  view: SurveyView;
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
  view: SurveyView;
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
        {COPY.openTheBook}
      </button>
      {blocked ? <p className="stake__error">{blocked}</p> : error ? <p className="stake__error">{error}</p> : null}
    </form>
  );
}

function walletMessage(view: SurveyView): string | null {
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
  view: SurveyView;
  host: SurveyHost | null;
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
  spent: boolean;
  settled: boolean;
  session: boolean;
  act: (action: SurveyAction) => void;
  again: () => void;
  deal: () => void;
  setSoundOn: (update: (value: boolean) => boolean) => void;
  setTurbo: (update: (value: boolean) => boolean) => void;
}) {
  const { helpOpen, setHelpOpen, bookOpen, setBookOpen, canAct, spent, settled, session, act, again, deal, setSoundOn, setTurbo } =
    args;
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
        act('UNDERWRITE');
        return;
      }
      if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        act('DECLINE');
        return;
      }
      if (!spent && (event.key === 's' || event.key === 'S' || event.key === 'ArrowDown')) {
        event.preventDefault();
        act('SURVEY');
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen, setHelpOpen, bookOpen, setBookOpen, anyPanelOpen, canAct, spent, settled, session, act, again, deal, setSoundOn, setTurbo]);
}
