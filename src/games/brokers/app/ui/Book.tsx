/**
 * The book: a session log of claims sold.
 *
 * The same discipline as the other two games' logs (claude.md §7). It states
 * what happened, gives the Ghost Price a column of the same weight as anything
 * else, and closes on the realised return against the declared RTP — the useful
 * number, and the honest answer to "I'm due a win". It never totals what a
 * player could have had.
 *
 * It lives for one page load, like the purse. Nothing is written to storage.
 */
import { COPY } from './copy';
import { formatAmount, formatFee, formatPrice } from './format';
import { brokerById, feesForMask, type BrokerId } from '../../core/market';
import { solve } from '../../core/solve';
import * as R from '../../../../shared/math/rational';

export type BookRow = {
  readonly key: string;
  readonly bestBp: number;
  /** Who named the best price. Null is the house's own man. */
  readonly from: BrokerId | null;
  readonly askedMask: number;
  readonly ghostBrokerId: BrokerId | null;
  readonly ghostPriceBp: number | null;
  readonly stakeBase: bigint;
  readonly payoutBase: bigint;
};

const nameOf = (id: BrokerId | null) => (id === null ? COPY.theHouse : brokerById(id).name);

function popcount(mask: number): number {
  let count = 0;
  for (let bit = mask; bit; bit >>= 1) count += bit & 1;
  return count;
}

export function Book({
  rows,
  decimals,
  symbol,
  onClose,
}: {
  rows: readonly BookRow[];
  decimals: number;
  symbol: string;
  onClose: () => void;
}) {
  const staked = rows.reduce((sum, row) => sum + row.stakeBase, 0n);
  const returned = rows.reduce((sum, row) => sum + row.payoutBase, 0n);
  const declared = solve().rtp;
  const realised = staked > 0n ? R.rat(returned, staked) : null;

  return (
    <div className="panel" role="dialog" aria-modal="true" aria-label={COPY.ledgerTitle}>
      <div className="panel__inner">
        <header className="panel__head">
          <h2 className="panel__title">{COPY.ledgerTitle}</h2>
          <button className="btn btn--ghost" onClick={onClose} autoFocus>
            {COPY.helpClose} <kbd>Esc</kbd>
          </button>
        </header>

        {rows.length === 0 ? (
          <p className="panel__rule">{COPY.ledgerEmpty}</p>
        ) : (
          <>
            <table className="grid">
              <thead>
                <tr>
                  <th>{COPY.ledgerRound}</th>
                  <th className="num">{COPY.ledgerSoldAt}</th>
                  <th>{COPY.ledgerTo}</th>
                  <th className="num">{COPY.ledgerAsked}</th>
                  <th className="num">{COPY.ledgerFees}</th>
                  <th className="num">{COPY.ledgerPaid}</th>
                  <th>{COPY.ledgerNext}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.key}>
                    <td>{index + 1}</td>
                    <td className="num">{formatPrice(row.bestBp)}</td>
                    <td>{nameOf(row.from)}</td>
                    <td className="num">{popcount(row.askedMask)}</td>
                    <td className="num">{formatFee(feesForMask(row.askedMask))}</td>
                    <td className="num">{formatAmount(row.payoutBase, decimals)}</td>
                    {/* Same weight as every other cell. No emphasis, ever. */}
                    <td className="muted">
                      {row.ghostPriceBp === null || row.ghostBrokerId === null
                        ? '—'
                        : `${nameOf(row.ghostBrokerId)} ${formatPrice(row.ghostPriceBp)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <section className="panel__section">
              <h3 className="panel__heading">{COPY.ledgerSoFar}</h3>
              <dl className="facts">
                <dt>{COPY.ledgerRounds}</dt>
                <dd className="num">{rows.length}</dd>
                <dt>{COPY.ledgerStaked}</dt>
                <dd className="num">
                  {formatAmount(staked, decimals)} {symbol}
                </dd>
                <dt>{COPY.ledgerReturned}</dt>
                <dd className="num">
                  {formatAmount(returned, decimals)} {symbol}
                </dd>
                <dt>{COPY.ledgerRealised}</dt>
                <dd className="num">{realised ? `${R.toPercent(realised, 2)}%` : '—'}</dd>
                <dt>{COPY.ledgerDeclared}</dt>
                <dd className="num">{R.toPercent(declared, 4)}%</dd>
              </dl>
              <p className="panel__note">{COPY.ledgerNote}</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export function bookRowFrom(session: {
  sessionKey: string;
  bestBp: number;
  named: readonly { brokerId: BrokerId | null; priceBp: number }[];
  askedMask: number;
  ghost: { brokerId: BrokerId | null; priceBp: number } | null;
  stakeBase: bigint;
  payoutBase: bigint;
}): BookRow {
  const winner = session.named.reduce<{ brokerId: BrokerId | null; priceBp: number } | null>(
    (best, named) => (best === null || named.priceBp > best.priceBp ? named : best),
    null,
  );
  return {
    key: session.sessionKey,
    bestBp: session.bestBp,
    from: winner?.brokerId ?? null,
    askedMask: session.askedMask,
    ghostBrokerId: session.ghost?.brokerId ?? null,
    ghostPriceBp: session.ghost?.priceBp ?? null,
    stakeBase: session.stakeBase,
    payoutBase: session.payoutBase,
  };
}
