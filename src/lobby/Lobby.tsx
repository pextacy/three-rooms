/**
 * The List.
 *
 * Lloyd's List is the artifact this door is modelled on: a printed sheet you
 * read before you go in. So the page is PAPER and the three games are the only
 * lit things on it — three windows cut into the sheet, each under its own light.
 * That inversion is the whole design: everything a player will see afterwards is
 * a dark room, and the one place that is not is the page that sends them there.
 *
 * A door, not a casino. It lists the games and links to them, and that is all it
 * is allowed to do: **no balance, no deposit, no wallet**. Inside chain.wtf the
 * host owns every one of those (`docs.md` §4.1, `claude.md` §7), and a game
 * origin that asks for money is the exact shape of a phishing page.
 *
 * It carries no jam widget either: the widget marks an ENTRY, and this is not
 * one. Neither are the `how` pages it links to.
 */
import { useEffect, useRef, useState } from 'react';
import { GAMES } from './catalogue';
import { drawWindow, type WindowId } from './windows';
import { COPY } from './copy';

/** The window fades up over this long. One animation, and it is the lighting. */
const LIGHTING_MS = 900;
/** Each room is lit after the one before it, as though someone walked the row. */
const STAGGER_MS = 170;

function Window({ id, delayMs }: { id: WindowId; delayMs: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let frame = 0;
    let started: number | null = null;

    const paint = (lit: number) => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawWindow(ctx, width, height, id, lit);
    };

    if (reduced) {
      paint(1);
      const onResize = () => paint(1);
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }

    const step = (now: number) => {
      started ??= now;
      const elapsed = now - started - delayMs;
      // Ease out: a wick takes hold quickly and then settles.
      const t = Math.max(0, Math.min(1, elapsed / LIGHTING_MS));
      paint(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    const onResize = () => paint(1);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, [id, delayMs]);

  return <canvas className="window__pane" ref={ref} aria-hidden="true" />;
}

export function Lobby() {
  // The masthead rule draws itself across on load. Held in state rather than CSS
  // so it cannot run before the fonts settle and jump.
  const [ruled, setRuled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRuled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="sheet">
      <header className="masthead">
        <p className="masthead__dateline">{COPY.dateline}</p>
        <hr className={`masthead__rule${ruled ? ' is-drawn' : ''}`} />
        <h1 className="masthead__title">
          {COPY.titleLead}
          <em className="masthead__em">{COPY.titleEm}</em>
        </h1>
        <p className="masthead__lede">{COPY.lede}</p>
      </header>

      <section className="windows" aria-label={COPY.windowsLabel}>
        {GAMES.map((game, i) => (
          <a className="window" key={game.slug} href={`/${game.slug}/`} data-room={game.room}>
            <Window id={game.room} delayMs={i * STAGGER_MS} />
            <span className="window__name">{game.name}</span>
            <span className="window__lit">{game.lit}</span>
          </a>
        ))}
      </section>

      <ol className="entries">
        {GAMES.map(game => (
          <li className="entry" key={game.slug} data-room={game.room}>
            <p className="entry__primitive">{game.primitive}</p>
            <h2 className="entry__name">
              <a className="entry__title" href={`/${game.slug}/`}>
                {game.name}
              </a>
            </h2>
            <p className="entry__line">{game.line}</p>

            <dl className="entry__figures">
              <div className="figure">
                <dt className="figure__label">{COPY.figureRtp}</dt>
                <dd className="figure__big">{game.rtp}</dd>
              </div>
              <div className="figure">
                <dt className="figure__label">{COPY.figureMax}</dt>
                <dd className="figure__big">{game.maxPayout}</dd>
              </div>
              <div className="figure figure--wide">
                <dt className="figure__label">{COPY.figureFrom}</dt>
                <dd className="figure__value">{game.source}</dd>
              </div>
            </dl>

            <p className="entry__actions">
              <a className="btn-play" href={`/${game.slug}/`}>
                {COPY.play}
              </a>
              <a className="btn-read" href={`/${game.slug}/how/`}>
                {COPY.how}
              </a>
            </p>
          </li>
        ))}
      </ol>

      <footer className="colophon">
        <h2 className="colophon__head">{COPY.checkHead}</h2>
        <p className="colophon__body">{COPY.checkBody}</p>
        <ul className="colophon__commands">
          {COPY.commands.map(([command, what]) => (
            <li key={command}>
              <code>{command}</code>
              <span>{what}</span>
            </li>
          ))}
        </ul>
        <p className="colophon__note">{COPY.colophon}</p>
      </footer>
    </div>
  );
}
