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

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const trapRef = useFocusTrap(onClose);

  const { solution, band, advice } = useMemo(() => {
    const s = solve();
    const optimal = optimalPolicy(s);
    return {
      solution: s,
      band: strategyBand(s).map(entry => ({
        label: entry.label,
        rtp: R.toPercent(evaluate(entry.policy), 3),
        note: entry.note,
      })),
      /**
       * What the DP actually does at each cargo, at the margin the reports have
       * reached. Derived from the policy, never asserted in prose — if the
       * manifest changes, this table changes with it.
       */
      advice: CARGOES.map(cargo => ({
        cargo,
        rows: [0, 1, 2, 3, 4, 5]
          .filter(k => k <= MAX_SURVEYS)
          .map(k => {
            const margins = [] as string[];
            for (let m = -k; m <= k; m += 2) {
              if (optimal(cargo, k, m)) margins.push(String(m));
            }
            return { surveys: k, margins };
          }),
        blind: bestCall(cargo, 0, 0).call,
      })),
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
          <table className="grid">
            <thead>
              <tr>
                <th>{COPY.callCargo}</th>
                <th>{COPY.callWhat}</th>
              </tr>
            </thead>
            <tbody>
              {advice.map(entry => {
                const sendAt = entry.rows.filter(row => row.margins.length > 0);
                return (
                  <tr key={entry.cargo.id}>
                    <td>
                      {entry.cargo.name} <span className="muted">{formatValue(entry.cargo.valueBp)}</span>
                    </td>
                    <td>
                      {sendAt.length === 0
                        ? `${entry.blind.toLowerCase()} unseen`
                        : sendAt
                            .map(row => `send at ${row.surveys} (margin ${row.margins.join(', ')})`)
                            .join('; ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

        <p className="panel__verify">{COPY.verifyNote}</p>
      </div>
    </div>
  );
}

/** Re-exported so the panel and the readout cannot disagree about a premium. */
export { premiumBpAt };
