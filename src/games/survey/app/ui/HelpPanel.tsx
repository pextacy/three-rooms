/**
 * The `?` panel (claude.md §8).
 *
 * Every number here is computed at render time by the DP in
 * `src/games/survey/core/solve.ts` — the same function `npm run verify:survey`
 * runs. Nothing is typed by hand, so the panel cannot drift from the contract.
 *
 * We publish the belief table, what the DP does at every state, and the whole
 * strategy band including the careless end. A player who reads this panel can
 * play this game exactly as well as we can: we are not selling an information
 * edge over them.
 */
import { useEffect, useMemo, useRef } from 'react';
import { COPY } from './copy';
import { formatValue, formatPremium, formatWeight } from './format';
import {
  CARGOES,
  WEIGHT_DENOM,
  MAX_SURVEYS,
  MAX_VALUE_BP,
  VALUE_DENOM,
  PREMIUM_BP,
  premiumBpAt,
} from '../../core/vessel';
import { posteriorSound, predictiveSound } from '../../core/belief';
import { solve, strategyBand, evaluate, declineValue, optimalPolicy, bestCall } from '../../core/solve';
import * as R from '../../../../shared/math/rational';

/**
 * Keeps keyboard focus inside the dialog while it is open, and gives it back to
 * whatever opened it on close.
 *
 * Without this, `aria-modal="true"` is a claim the panel does not honour: Tab
 * walks straight out into a game the player cannot see, and on close focus is
 * lost to the document body — which strands anyone not using a mouse.
 */
function useFocusTrap(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = ref.current;

    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>('a[href], button, input, [tabindex]:not([tabindex="-1"])') ?? [],
      ).filter(element => !element.hasAttribute('disabled'));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;

      // Wrap at both ends, so Tab can never leave the dialog.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel?.addEventListener('keydown', onKeyDown);
    return () => {
      panel?.removeEventListener('keydown', onKeyDown);
      opener?.focus?.();
    };
  }, [onClose]);

  return ref;
}

/** A margin, signed, so `0` and `+1` read as positions rather than counts. */
function signedMargin(margin: number): string {
  return margin > 0 ? `+${margin}` : String(margin);
}

/**
 * One cell of "when to send another": the margins at which the rule sends one,
 * as a band where they are contiguous and as a list where they are not.
 */
function formatBand(band: { readonly margins: readonly number[]; readonly contiguous: boolean }): string {
  const first = band.margins[0];
  const last = band.margins[band.margins.length - 1];
  if (first === undefined || last === undefined) return '—';
  if (first === last) return signedMargin(first);
  if (band.contiguous) return `${signedMargin(first)} … ${signedMargin(last)}`;
  return band.margins.map(signedMargin).join(', ');
}

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const trapRef = useFocusTrap(onClose);

  const { solution, band, advice } = useMemo(() => {
    const s = solve();
    const optimal = optimalPolicy(s);
    return {
      solution: s,
      band: strategyBand(s).map(entry => ({
        label: entry.label,
        rtp: R.toPercent(evaluate(entry.policy, entry.call), 3),
        note: entry.note,
        // The two rows that ignore the evidence sit below the jam window on
        // purpose. They are marked rather than dropped: a band that only holds
        // what flatters it is not a band, and the note under this table says so.
        sensible: entry.sensible !== false,
      })),
      /**
       * What the DP actually does with each cargo — derived from the policy,
       * never asserted in prose, so the table moves if the manifest does.
       *
       * It is indexed by BOTH the cargo and how many surveyors have already
       * reported, and that is not padding. A single margin band per cargo is not
       * a true statement about this DP: the same margin can be worth another
       * surveyor at one report and not at three, because the premium has gone
       * and there are fewer men left to send. Collapsing the two into one band
       * — which this panel used to do — widened every band it printed, and for
       * the Silk it printed a band at all where the rule is to underwrite her
       * unseen.
       *
       * Only states the optimal player can actually stand in are shown. The DP
       * has an opinion about the Silk at four reports against; it is arithmetic
       * about a position nobody following the rule ever reaches, and printing it
       * as advice was the whole of the error.
       *
       * Within one count the margins that keep asking are contiguous, so a low
       * … high band is exact. If a manifest ever broke that, the raw margins are
       * listed instead: a pretty summary that is not true is worse than an ugly
       * one that is.
       */
      advice: CARGOES.map(cargo => {
        const reached = new Set<string>();
        const walk = (k: number, m: number) => {
          const key = `${k}:${m}`;
          if (reached.has(key)) return;
          reached.add(key);
          if (k >= MAX_SURVEYS || !optimal(cargo, k, m)) return;
          walk(k + 1, m + 1);
          walk(k + 1, m - 1);
        };
        walk(0, 0);

        const bands = Array.from({ length: MAX_SURVEYS }, (_, k) => {
          const margins: number[] = [];
          for (let m = -k; m <= k; m += 2) {
            if (reached.has(`${k}:${m}`) && optimal(cargo, k, m)) margins.push(m);
          }
          return {
            margins,
            contiguous: margins.every((m, i) => i === 0 || m === (margins[i - 1] ?? m) + 2),
          };
        });

        return {
          cargo,
          bands,
          sends: bands.some(band => band.margins.length > 0),
          blind: bestCall(cargo, 0, 0).call,
        };
      }),
    };
  }, []);

  return (
    <div className="panel" role="dialog" aria-modal="true" aria-label={COPY.helpTitle} ref={trapRef}>
      <div className="panel__inner">
        <header className="panel__head">
          <h2 className="panel__title">{COPY.helpTitle}</h2>
          <button className="btn btn--ghost" onClick={onClose} autoFocus>
            {COPY.helpClose} <kbd>Esc</kbd>
          </button>
        </header>

        {COPY.rules.map(rule => (
          <p className="panel__rule" key={rule}>
            {rule}
          </p>
        ))}

        <section className="panel__section">
          <h3 className="panel__heading">{COPY.manifestTitle}</h3>
          <table className="grid">
            <thead>
              <tr>
                <th>{COPY.manifestCargo}</th>
                <th className="num">{COPY.manifestPays}</th>
                <th className="num">{COPY.manifestChance}</th>
              </tr>
            </thead>
            <tbody>
              {CARGOES.map(cargo => (
                <tr key={cargo.id}>
                  <td>{cargo.name}</td>
                  <td className="num">{formatValue(cargo.valueBp)}</td>
                  <td className="num">{formatWeight(cargo.weight, WEIGHT_DENOM)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel__section">
          <h3 className="panel__heading">{COPY.premiumTitle}</h3>
          <table className="grid">
            <thead>
              <tr>
                <th>{COPY.premiumSurveys}</th>
                <th className="num">{COPY.premiumLeft}</th>
                <th className="num">{COPY.premiumDecline}</th>
              </tr>
            </thead>
            <tbody>
              {PREMIUM_BP.map((bp, k) => (
                <tr key={bp}>
                  <td>{k}</td>
                  <td className="num">{formatPremium(bp)}</td>
                  <td className="num">{R.toFixed(declineValue(k), 4)}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel__section">
          <h3 className="panel__heading">{COPY.beliefTitle}</h3>
          <table className="grid">
            <thead>
              <tr>
                <th>{COPY.beliefMargin}</th>
                <th className="num">{COPY.beliefPosterior}</th>
                <th className="num">{COPY.beliefNext}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: MAX_SURVEYS * 2 + 1 }, (_, i) => i - MAX_SURVEYS).map(m => (
                <tr key={m}>
                  <td>{m > 0 ? `+${m}` : m}</td>
                  <td className="num">{R.toPercent(posteriorSound(m), 2)}%</td>
                  <td className="num">{R.toPercent(predictiveSound(m), 2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="panel__note">{COPY.beliefNote}</p>
        </section>

        <section className="panel__section">
          <h3 className="panel__heading">{COPY.callTitle}</h3>
          <p className="panel__note">{COPY.callSentHead}</p>
          <div className="panel__scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th>{COPY.callCargo}</th>
                  <th>{COPY.callBlind}</th>
                  {Array.from({ length: MAX_SURVEYS }, (_, k) => (
                    <th className="num" key={k}>
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {advice.map(entry => (
                  <tr key={entry.cargo.id}>
                    <td>
                      {entry.cargo.name} <span className="muted">{formatValue(entry.cargo.valueBp)}</span>
                    </td>
                    <td>{entry.blind === 'UNDERWRITE' ? COPY.underwrite.toLowerCase() : COPY.decline.toLowerCase()}</td>
                    {entry.sends ? (
                      entry.bands.map((band, k) => (
                        <td className="num" key={k}>
                          {formatBand(band)}
                        </td>
                      ))
                    ) : (
                      <td className="num" colSpan={MAX_SURVEYS}>
                        {COPY.callNever}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="panel__note">{COPY.callNote}</p>
        </section>

        <section className="panel__section">
          <h3 className="panel__heading">{COPY.rtpTitle}</h3>
          <dl className="facts">
            <dt>{COPY.rtpDeclared}</dt>
            <dd className="num">{R.toPercent(solution.rtp, 4)}%</dd>
            <dt>{COPY.rtpExact}</dt>
            <dd className="num small">{R.toExactString(solution.rtp)}</dd>
            <dt>{COPY.rtpHouseEdge}</dt>
            <dd className="num">{R.toPercent(R.sub(R.rat(1n), solution.rtp), 4)}%</dd>
            <dt>{COPY.rtpMax}</dt>
            <dd className="num">
              {R.toFixed(R.rat(MAX_VALUE_BP, VALUE_DENOM), 0)}× <span className="muted">{COPY.rtpMaxNote}</span>
            </dd>
          </dl>
        </section>

        <section className="panel__section">
          <h3 className="panel__heading">{COPY.bandTitle}</h3>
          <table className="grid">
            <thead>
              <tr>
                <th>{COPY.bandPolicy}</th>
                <th className="num">{COPY.bandRtp}</th>
              </tr>
            </thead>
            <tbody>
              {band.map(entry => (
                <tr key={entry.label}>
                  <td>
                    {entry.label}
                    {entry.note ? <span className="muted"> — {entry.note}</span> : null}
                    {entry.sensible ? null : <span className="muted"> · {COPY.bandOutside}</span>}
                  </td>
                  <td className="num">{entry.rtp}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="panel__note">{COPY.bandNote}</p>
        </section>

        <section className="panel__section">
          <h3 className="panel__heading">{COPY.keyboardTitle}</h3>
          <dl className="facts">
            {COPY.keyboardRows.map(([key, what]) => (
              <div className="facts__row" key={key}>
                <dt>
                  <kbd>{key}</kbd>
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="panel__verify">
          {COPY.verifyNote}{' '}
          <a className="panel__away" href={COPY.howHref} target="_blank" rel="noreferrer">
            {COPY.howLink} ↗
          </a>
        </p>
      </div>
    </div>
  );
}

/** Re-exported so the panel and the readout cannot disagree about a premium. */
export { premiumBpAt };
