/**
 * The `?` panel (claude.md §8).
 *
 * Every number here is computed at render time by the same functions
 * `npm run verify:brokers` runs — the market, the index, the DP, the band.
 * Nothing is typed by hand, so the panel cannot drift from the contract.
 *
 * And it publishes the OPTIMAL RULE in full, including the asking order, because
 * this game's whole interest is a theorem a player can use. We are not selling
 * an information edge over them; we are selling the ten seconds in which they
 * decide whether to believe it.
 */
import { useMemo } from 'react';
import { useFocusTrap } from '../../../../shared/ui/useFocusTrap';
import { COPY } from './copy';
import { formatFee, formatPrice } from './format';
import { BROKER_LIST, HOUSE, WEIGHT_DENOM, PRICE_DENOM, MAX_PAYOUT_BP } from '../../core/market';
import { reservationPrice, meanPrice, askingOrder } from '../../core/weitzman';
import { solve, strategyBand, evaluate, takeValue } from '../../core/solve';
import * as R from '../../../../shared/math/rational';

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const trapRef = useFocusTrap(onClose);

  const { solution, band, order, worst } = useMemo(() => {
    const s = solve();
    return {
      solution: s,
      /**
       * The band, with each row saying for itself whether it lands in the jam's
       * 93–98% window. The marker is not decoration: this table prints policies
       * that fall well below the floor, and a reader who cannot tell which is
       * which has been handed six numbers and no way to read them.
       */
      band: strategyBand(s).map(entry => {
        const value = evaluate(entry.policy);
        return {
          label: entry.label,
          rtp: R.toPercent(value, 3),
          note: entry.note,
          inBand: R.compare(value, R.rat(93n, 100n)) >= 0 && R.compare(value, R.rat(98n, 100n)) <= 0,
        };
      }),
      order: askingOrder(),
      // The worst this game can do: the house's lowest price, having asked
      // everybody. Computed, not asserted — there is no losing state here and
      // the number says so.
      worst: takeValue((1 << BROKER_LIST.length) - 1, Math.min(...HOUSE.map(q => q.priceBp))),
    };
  }, []);

  const byMean = [...BROKER_LIST].sort((a, b) => R.compare(meanPrice(b), meanPrice(a)));

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
          <h3 className="panel__heading">{COPY.marketTitle}</h3>
          <table className="grid">
            <thead>
              <tr>
                <th>{COPY.marketBroker}</th>
                <th className="num">{COPY.marketFee}</th>
                <th>{COPY.marketQuotes}</th>
                <th className="num">{COPY.marketMean}</th>
                <th className="num">{COPY.marketIndex}</th>
                <th className="num">{COPY.marketOrder}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{COPY.houseRow}</td>
                <td className="num">{COPY.houseFee}</td>
                <td>
                  {HOUSE.map(quote => (
                    <span key={quote.priceBp} className="quote">
                      {formatPrice(quote.priceBp)}{' '}
                      <span className="muted">{R.toPercent(R.rat(quote.weight, WEIGHT_DENOM), 2)}%</span>
                    </span>
                  ))}
                </td>
                <td className="num">
                  {R.toFixed(
                    HOUSE.reduce<R.Rational>(
                      (sum, q) => R.add(sum, R.mul(R.rat(q.weight, WEIGHT_DENOM), R.rat(q.priceBp, PRICE_DENOM))),
                      R.ZERO,
                    ),
                    4,
                  )}
                  ×
                </td>
                <td className="num muted">—</td>
                <td className="num muted">first</td>
              </tr>
              {BROKER_LIST.map(broker => (
                <tr key={broker.id}>
                  <td>{broker.name}</td>
                  <td className="num">{formatFee(broker.feeBp)}</td>
                  <td>
                    {broker.quotes.map(quote => (
                      <span key={quote.priceBp} className="quote">
                        {formatPrice(quote.priceBp)}{' '}
                        <span className="muted">{R.toPercent(R.rat(quote.weight, WEIGHT_DENOM), 2)}%</span>
                      </span>
                    ))}
                  </td>
                  <td className="num">{R.toFixed(meanPrice(broker), 4)}×</td>
                  <td className="num">{R.toFixed(reservationPrice(broker), 4)}×</td>
                  <td className="num">{order.findIndex(b => b.id === broker.id) + 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel__section">
          <h3 className="panel__heading">{COPY.indexTitle}</h3>
          <p className="panel__note">{COPY.indexNote}</p>
          <p className="panel__rule">
            {COPY.indexPunchline(byMean[0]?.name ?? '', byMean[byMean.length - 1]?.name ?? '')}
          </p>
          <p className="panel__note">
            {order.map((broker, i) => (
              <span key={broker.id}>
                {i > 0 ? ' → ' : ''}
                {broker.name} <span className="muted">{R.toFixed(reservationPrice(broker), 3)}×</span>
              </span>
            ))}
          </p>
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
              {R.toFixed(R.rat(MAX_PAYOUT_BP, PRICE_DENOM), 4)}× <span className="muted">{COPY.rtpMaxNote}</span>
            </dd>
            <dt>{COPY.rtpMin}</dt>
            <dd className="num">
              {R.toFixed(worst, 4)}× <span className="muted">{COPY.rtpMinNote}</span>
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
                    {entry.inBand ? null : <span className="muted"> · {COPY.bandOutside}</span>}
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
