/**
 * The lobby.
 *
 * A door, not a casino. It lists the games and links to them, and that is all
 * it is allowed to do: **no balance, no deposit, no wallet**. Inside chain.wtf
 * the host owns every one of those (`docs.md` §4.1, `claude.md` §7), and a game
 * origin that asks for money is the exact shape of a phishing page. Standalone,
 * each game plays free with its own play-chip purse.
 *
 * It carries no jam widget either: the widget marks an ENTRY, and this is not
 * one.
 */
import { GAMES } from './catalogue';
import { paletteAtWax } from '../shared/render/light';
import { waxBpAt } from '../games/candle/core/wax';

export function Lobby() {
  const palette = paletteAtWax(waxBpAt(1));

  return (
    <main className="lobby">
      <header className="lobby__head">
        <p className="lobby__eyebrow">Chain Jam Vol. 1</p>
        <h1 className="lobby__title">Games with a decision in them</h1>
        <p className="lobby__lede">
          Every casino “original” reduces to one of three shapes: pick a probability and get 1/p, accumulate and
          bank before a bust, or match symbols. These are none of them. Each one is built on a decision problem
          that is well studied somewhere else and has never been turned into a wager.
        </p>
      </header>

      <ul className="lobby__list">
        {GAMES.map(game => (
          <li key={game.slug} className="entry">
            <a className="entry__link" href={game.status === 'live' ? `/${game.slug}/` : undefined} aria-disabled={game.status !== 'live'}>
              <span className="entry__name">{game.name}</span>
              <span className="entry__line">{game.line}</span>
            </a>

            <dl className="entry__facts">
              <div>
                <dt>The primitive</dt>
                <dd>{game.primitive}</dd>
              </div>
              <div>
                <dt>Declared RTP</dt>
                <dd className="num">{game.rtp}</dd>
              </div>
              <div>
                <dt>Maximum payout</dt>
                <dd className="num">{game.maxPayout}</dd>
              </div>
            </dl>

            <p className="entry__provenance">{game.provenance}</p>

            {game.status === 'live' ? (
              <a className="entry__cta" href={`/${game.slug}/`}>
                PLAY <span aria-hidden="true">→</span>
              </a>
            ) : (
              <span className="entry__cta entry__cta--soon">IN THE WORKSHOP</span>
            )}
          </li>
        ))}
      </ul>

      <footer className="lobby__foot">
        <p>
          Free play. No wallet, no sign-up, no deposit — the purse is play chips and lasts one page load. Inside
          chain.wtf the host owns the wallet and the balance; these pages never ask for either.
        </p>
        <p className="lobby__swatches" aria-hidden="true">
          {(['tallow', 'brass', 'oxblood', 'ink'] as const).map(ink => (
            <span key={ink} style={{ background: `rgb(${palette[ink].r} ${palette[ink].g} ${palette[ink].b})` }} />
          ))}
        </p>
      </footer>
    </main>
  );
}
