/**
 * The book: a session log of voyages written and voyages declined.
 *
 * The design risk is the same one CANDLE's Ledger names, and the answer is the
 * same. A log that tallies what you *could* have won is a loss-chasing nudge
 * with a spreadsheet on it, and `claude.md` §7 forbids exactly that. So this one:
 *
 *  - states what happened, voyage by voyage, in the same flat voice as the desk;
 *  - gives the Ghost Report a column of the same weight as everything else —
 *    never a highlight, never a "you missed", never a running regret;
 *  - closes on your **realised return against the declared RTP**, which is the
 *    genuinely useful number and the honest antidote to "I'm due a win".
 *
 * A declined voyage records no outcome, because none exists: nothing was
 * underwritten, no word was ever drawn, and inventing one after the fact would
 * be inventing a result the chain never produced.
 *
 * It lives for one page load, like the purse. Nothing is written to storage.
 */
import { COPY } from './copy';
import { useFocusTrap } from '../../../../shared/ui/useFocusTrap';
import { formatAmount, formatValue } from './format';
import { cargoById, type CargoId, type Call, type Report } from '../../core/vessel';
import { solve } from '../../core/solve';
import * as R from '../../../../shared/math/rational';

export type BookRow = {
  readonly key: string;
  readonly cargoId: CargoId | null;
  readonly surveys: number;
  readonly margin: number;
  readonly call: Call | null;
  readonly wasSound: boolean | null;
  readonly ghostReport: Report | null;
  readonly stakeBase: bigint;
  readonly payoutBase: bigint;
};

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

  // Realised return, in the same units as the declared RTP so the two can sit
  // side by side. Integer maths; no float touches a published number.
  const realised = staked > 0n ? R.rat(returned, staked) : null;

  const trapRef = useFocusTrap(onClose);

  return (
    <div className="panel" role="dialog" aria-modal="true" aria-label={COPY.ledgerTitle} ref={trapRef}>
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
                  <th>{COPY.ledgerCargo}</th>
                  <th className="num">{COPY.ledgerSurveys}</th>
                  <th>{COPY.ledgerCall}</th>
                  <th>{COPY.ledgerOutcome}</th>
                  <th className="num">{COPY.ledgerPaid}</th>
                  <th>{COPY.ledgerNext}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const cargo = row.cargoId !== null ? cargoById(row.cargoId) : null;
                  return (
                    <tr key={row.key}>
                      <td>{index + 1}</td>
                      <td>{cargo ? `${cargo.name} ${formatValue(cargo.valueBp)}` : '—'}</td>
                      <td className="num">{row.surveys}</td>
                      <td>{row.call === 'UNDERWRITE' ? COPY.underwrite : COPY.decline}</td>
                      <td>
                        {row.wasSound === null ? (
                          <span className="muted">{COPY.ledgerUnknown}</span>
                        ) : row.wasSound ? (
                          'sound'
                        ) : (
                          'rotten'
                        )}
                      </td>
                      <td className="num">{formatAmount(row.payoutBase, decimals)}</td>
                      {/* Same weight as every other cell. No emphasis, ever. */}
                      <td className="muted">
                        {row.ghostReport === null
                          ? '—'
                          : row.ghostReport === 'SOUND'
                            ? COPY.ghostSound.toLowerCase()
                            : COPY.ghostRotten.toLowerCase()}
                      </td>
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
                {/* Four places, like everywhere else: 97.03% would round away part
                    of the house edge the player is being asked to read against. */}
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
  cargoId: CargoId | null;
  surveys: number;
  margin: number;
  call: Call | null;
  wasSound: boolean | null;
  ghostReport: Report | null;
  stakeBase: bigint;
  payoutBase: bigint;
}): BookRow {
  return {
    key: session.sessionKey,
    cargoId: session.cargoId,
    surveys: session.surveys,
    margin: session.margin,
    call: session.call,
    wasSound: session.wasSound,
    ghostReport: session.ghostReport,
    stakeBase: session.stakeBase,
    payoutBase: session.payoutBase,
  };
}
