/**
 * The Ledger (prd.md §6, stretch): a session log of claims against ghosts.
 *
 * The design risk here is obvious and worth naming. A log that tallies what you
 * *could* have won is a loss-chasing nudge with a spreadsheet on it, and
 * `claude.md` §7 forbids exactly that. So this one:
 *
 *  - states what happened, round by round, in the same flat voice as the table;
 *  - gives the ghost a column of the same weight as everything else — never a
 *    highlight, never a "you missed" total, never a running regret;
 *  - closes on your **realised return against the declared RTP**, which is the
 *    genuinely useful number and the honest antidote to "I'm due a win".
 *
 * It lives for one page load, like the purse. Nothing is written to storage.
 */
import { COPY } from './copy';
import { formatAmount, formatFace } from './format';
import { lotById, type LotId } from '../../core/paytable';
import { INCHES } from '../../core/wax';
import { solve } from '../../core/solve';
import * as R from '../../../../shared/math/rational';

export type LedgerRow = {
  readonly key: string;
  readonly inch: number;
  readonly lotId: LotId | null;
  readonly ghostLotId: LotId | null;
  readonly stakeBase: bigint;
  readonly payoutBase: bigint;
  readonly guttered: boolean;
};

export function Ledger({
  rows,
  decimals,
  symbol,
  onClose,
}: {
  rows: readonly LedgerRow[];
  decimals: number;
  symbol: string;
  onClose: () => void;
}) {
  const staked = rows.reduce((sum, row) => sum + row.stakeBase, 0n);
  const returned = rows.reduce((sum, row) => sum + row.payoutBase, 0n);
  const declared = solve().rtp;

  // Realised return, in the same units as the declared RTP so the two can sit
  // side by side. Integer maths; no float touches a published number.
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
                  <th>{COPY.ledgerTook}</th>
                  <th className="num">{COPY.ledgerInch}</th>
                  <th className="num">{COPY.ledgerPaid}</th>
                  <th>{COPY.ledgerNext}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const lot = row.lotId !== null ? lotById(row.lotId) : null;
                  const ghost = row.ghostLotId !== null ? lotById(row.ghostLotId) : null;
                  return (
                    <tr key={row.key}>
                      <td>{index + 1}</td>
                      <td>
                        {lot ? `${lot.name} ${formatFace(lot.faceBp)}` : '—'}
                        {row.guttered ? <span className="muted"> · {COPY.ledgerGuttered}</span> : null}
                      </td>
                      <td className="num">{row.inch}</td>
                      <td className="num">{formatAmount(row.payoutBase, decimals)}</td>
                      {/* Same weight as every other cell. No emphasis, ever. */}
                      <td className="muted">{ghost ? `${ghost.name} ${formatFace(ghost.faceBp)}` : '—'}</td>
                    </tr>
                  );
                })}
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
                {/* Four places, like everywhere else: 97.00% would round away the
                    house edge the player is being asked to read against. */}
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

export function ledgerRowFrom(session: {
  sessionKey: string;
  inch: number;
  lotId: LotId | null;
  ghostLotId: LotId | null;
  stakeBase: bigint;
  payoutBase: bigint;
}): LedgerRow {
  return {
    key: session.sessionKey,
    inch: session.inch,
    lotId: session.lotId,
    ghostLotId: session.ghostLotId,
    stakeBase: session.stakeBase,
    payoutBase: session.payoutBase,
    guttered: session.inch >= INCHES,
  };
}
