/**
 * The `?` panel (plan.md D2, claude.md §8).
 *
 * Every number here is computed at render time by the DP in `src/game/solve.ts`
 * — the same function `npm run verify:rtp` runs. Nothing is typed by hand, so
 * the panel cannot drift from the contract. We publish the thresholds and the
 * whole strategy band, including the careless end: we are not selling an
 * information edge over the player.
 */
import { useMemo } from 'react';
import { COPY } from './copy';
import { formatFace, formatWax, formatWeight } from './format';
import { LOTS, WEIGHT_DENOM, MAX_FACE_BP, FACE_DENOM } from '../game/paytable';
import { INCHES, WAX_BP } from '../game/wax';
import { solve, strategyBand, evaluate, optimalPolicy } from '../game/solve';
import * as R from '../game/rational';

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const { solution, band, practice } = useMemo(() => {
    const s = solve();
    const optimal = optimalPolicy(s);
    return {
      solution: s,
      band: strategyBand(s).map(entry => ({
        label: entry.label,
        rtp: R.toPercent(evaluate(entry.policy), 3),
        note: entry.note,
      })),
      // "In practice" is derived from the policy, not asserted in prose.
      practice: Array.from({ length: INCHES }, (_, i) => {
        const inch = i + 1;
        if (inch === INCHES) return COPY.forced;
        const cheapest = LOTS.filter(l => optimal(l, inch)).sort((a, b) => a.faceBp - b.faceBp)[0];
        return cheapest ? `claim ≥ ${formatFace(cheapest.faceBp)}` : COPY.forced;
      }),
    };
  }, []);

  return (
    <div className="panel" role="dialog" aria-modal="true" aria-label={COPY.helpTitle}>
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
          <h3 className="panel__heading">{COPY.paytableTitle}</h3>
          <table className="grid">
            <thead>
              <tr>
                <th>{COPY.paytableLot}</th>
                <th className="num">{COPY.paytableFace}</th>
                <th className="num">{COPY.paytableChance}</th>
              </tr>
            </thead>
            <tbody>
              {LOTS.map(lot => (
                <tr key={lot.id}>
                  <td>{lot.name}</td>
                  <td className="num">{formatFace(lot.faceBp)}</td>
                  <td className="num">{formatWeight(lot.weight, WEIGHT_DENOM)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel__section">
          <h3 className="panel__heading">{COPY.waxTitle}</h3>
          <table className="grid">
            <thead>
              <tr>
                <th>{COPY.waxInch}</th>
                <th className="num">{COPY.waxRemainingShort}</th>
                <th className="num">{COPY.waxOnTwo}</th>
              </tr>
            </thead>
            <tbody>
              {WAX_BP.map((bp, i) => (
                <tr key={bp}>
                  <td>{i + 1}</td>
                  <td className="num">{formatWax(bp)}</td>
                  <td className="num">{R.toFixed(R.mul(R.rat(2n), R.rat(bp, 10_000)), 2)}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel__section">
          <h3 className="panel__heading">{COPY.thresholdTitle}</h3>
          <table className="grid">
            <thead>
              <tr>
                <th>{COPY.thresholdInch}</th>
                <th className="num">{COPY.thresholdClaimAbove}</th>
                <th>{COPY.thresholdInPractice}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: INCHES }, (_, i) => {
                const inch = i + 1;
                const threshold = solution.threshold[inch];
                return (
                  <tr key={inch}>
                    <td>{inch}</td>
                    <td className="num">{threshold ? R.toFixed(threshold, 5) : COPY.forced}</td>
                    <td>{practice[i]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="panel__note">{COPY.optimalRule}</p>
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
              {R.toFixed(R.rat(MAX_FACE_BP, FACE_DENOM), 0)}× <span className="muted">{COPY.rtpMaxNote}</span>
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
