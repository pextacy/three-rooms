/**
 * `npm run gen:pages` — writes the three "How it works" pages.
 *
 * These are the separate pages the List links to, one per entry, and they are
 * the reason the door stopped carrying three essays: a player who wants to play
 * should not have to scroll past a derivation, and a judge who wants the
 * derivation should not have to find it inside a modal.
 *
 * They are GENERATED, static, and carry no JavaScript at all. Three reasons,
 * in order of how much they matter:
 *
 *  1. **No number on them is typed.** Every figure comes out of that game's own
 *     dynamic program at build time, in exact rationals, exactly as `gen:readme`
 *     does it. Retune a manifest and these pages move with it or CI fails.
 *  2. A document does not need a framework. Zero JS keeps them off the bundle
 *     budget and makes them open instantly.
 *  3. They are not entries. No jam widget, no manifest, no metrics — the widget
 *     marks a submission and these are not submitted.
 *
 * They are written into `public/<slug>/how/`, which Vite copies verbatim, so
 * they are served at `/<slug>/how/` in dev and in production alike.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GAMES, type GameEntry } from '../src/lobby/catalogue';
import { accentFor, SHEET } from '../src/lobby/accents';
import { CANDLELIGHT, DAYLIGHT, LAMPLIGHT, LEVEL_FULL, css, paletteAtWax, type Room } from '../src/shared/render/light';
import * as R from '../src/shared/math/rational';

// --- CANDLE ----------------------------------------------------------------
import { LOTS, WEIGHT_DENOM as CANDLE_WEIGHT, FACE_DENOM } from '../src/games/candle/core/paytable';
import { WAX_BP, INCHES } from '../src/games/candle/core/wax';
import {
  solve as solveCandle,
  strategyBand as candleBand,
  optimalPolicy as candleOptimal,
  evaluate as evaluateCandle,
  probabilityOfNothing,
  meanRoundLength,
} from '../src/games/candle/core/solve';

// --- THE SURVEY ------------------------------------------------------------
import {
  CARGOES,
  WEIGHT_DENOM as SURVEY_WEIGHT,
  VALUE_DENOM,
  MAX_SURVEYS,
  PREMIUM_BP,
  PREMIUM_DENOM,
  DECLINE_BP,
  PRIOR_SOUND_NUM,
  PRIOR_SOUND_DEN,
  ACCURACY_NUM,
  ACCURACY_DEN,
} from '../src/games/survey/core/vessel';
import {
  solve as solveSurvey,
  strategyBand as surveyBand,
  optimalPolicy as surveyOptimal,
  evaluate as evaluateSurvey,
  meanSurveys,
} from '../src/games/survey/core/solve';

// --- THE BROKERS -----------------------------------------------------------
import {
  HOUSE,
  BROKER_LIST,
  WEIGHT_DENOM as BROKER_WEIGHT,
  PRICE_DENOM,
  TOTAL_FEES_BP,
  MAX_PAYOUT_BP,
} from '../src/games/brokers/core/market';
import { reservationPrice, meanPrice, askingOrder } from '../src/games/brokers/core/weitzman';
import {
  solve as solveBrokers,
  strategyBand as brokersBand,
  optimalPolicy as brokersOptimal,
  evaluate as evaluateBrokers,
  roundShape,
  takeValue,
} from '../src/games/brokers/core/solve';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');

const ROOMS: Record<GameEntry['room'], Room> = { candle: CANDLELIGHT, roads: DAYLIGHT, floor: LAMPLIGHT };

/** HTML-escape. Every string on these pages goes through it. */
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Row = readonly string[];

type Section = {
  readonly head: string;
  /** One or more paragraphs, already plain text. */
  readonly body?: readonly string[];
  readonly table?: { readonly columns: Row; readonly rows: readonly Row[]; readonly numeric?: readonly number[] };
  /** Label / value pairs, set as a run of small figures. */
  readonly facts?: ReadonlyArray<readonly [string, string]>;
  /** A command and what it prints. Set as a list, never a table — a command
   *  broken across two lines is a command nobody can copy. */
  readonly commands?: ReadonlyArray<readonly [string, string]>;
};

type Page = {
  readonly game: GameEntry;
  /** The one number, and the fraction under it. */
  readonly headline: { readonly value: string; readonly label: string; readonly exact: string };
  readonly sections: readonly Section[];
};

// ---------------------------------------------------------------------------
//  The document
// ---------------------------------------------------------------------------

/**
 * One stylesheet for all three, written to `public/how.css` and linked rather
 * than inlined.
 *
 * Inlining it three times cost 6 KB of the 150 KB bundle budget to say the same
 * thing twice over. These are documents, not the game pages — the 400 ms
 * cold-open budget is theirs, not these — so one cached request is the right
 * trade, and it means the type system has one home instead of three copies that
 * can drift.
 *
 * What stays per-page is only what differs: the four room colours, written into
 * a short inline block so the band paints on the first frame with no second
 * round trip.
 */
const STYLE = String.raw`
/*
  Generated by scripts/gen-pages.ts — do not edit.

  The List's own paper, set as a page of the ledger rather than as its front.
  Class selectors only: a type selector inside a class selector outranks a plain
  class, and that is how the one number this page exists to show once got
  quietly shrunk.
*/
*, *::before, *::after { box-sizing: border-box; }

:root {
  --sheet: SHEET_HEX;
  --sheet-deep: #c8c2b3;
  --sheet-edge: #b6af9e;
  --iron: #17140f;
  --iron-soft: #4d463a;
  --font: ui-serif, 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
  --font-num: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  --column: min(56rem, 100% - clamp(2.5rem, 10vw, 6rem));
}

html, body { margin: 0; background: var(--sheet); }

body {
  color: var(--iron);
  font-family: var(--font);
  font-size: 1rem;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  background-image:
    repeating-linear-gradient(90deg, rgb(23 20 15 / 0.012) 0 1px, transparent 1px 7px),
    repeating-linear-gradient(0deg, rgb(23 20 15 / 0.01) 0 1px, transparent 1px 34px);
}

.wrap { display: grid; grid-template-columns: 1fr var(--column) 1fr; row-gap: clamp(2.25rem, 6vh, 3.5rem); padding-bottom: clamp(3rem, 10vh, 6rem); }
.wrap > * { grid-column: 2; }

/*
  The page begins IN the room and comes out onto paper. The band is that game's
  own ink with its own light over it — the same two colours the canvas is drawn
  from, so the header cannot drift from the game it introduces.
*/
.band {
  grid-column: 1 / -1;
  background: var(--room-ink);
  background-image: radial-gradient(120% 140% at 50% 0%, var(--room-light) 0%, transparent 62%);
  display: grid;
  grid-template-columns: 1fr var(--column) 1fr;
  padding-block: clamp(1.25rem, 4vh, 2rem) clamp(2rem, 7vh, 3.25rem);
}
.band__inner { grid-column: 2; display: grid; row-gap: 0.9rem; }

.crumbs { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; justify-content: space-between; font-family: var(--font-num); font-size: 0.6875rem; letter-spacing: 0.2em; text-transform: uppercase; }
.crumbs__back { color: var(--room-money); text-decoration: none; border-bottom: 1px solid transparent; }
.crumbs__back:hover, .crumbs__back:focus-visible { border-bottom-color: currentColor; }
.crumbs__date { color: rgb(255 255 255 / 0.42); }

.eyebrow { margin: 0; font-family: var(--font-num); font-size: 0.6875rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--room-money); }
.title { margin: 0; font-size: clamp(2.1rem, 6.5vw, 3.5rem); font-weight: 400; line-height: 1; letter-spacing: -0.02em; color: var(--room-text); }
.pitch { margin: 0; max-width: 40rem; font-size: 1.0625rem; line-height: 1.6; color: rgb(255 255 255 / 0.66); }

/* The one number, set as an object. */
.headline { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem 1.5rem; padding-top: clamp(1rem, 3vh, 1.5rem); border-top: 2px solid var(--iron); }
.headline__value { font-family: var(--font-num); font-size: clamp(2.4rem, 8vw, 3.75rem); font-variant-numeric: tabular-nums; letter-spacing: -0.03em; line-height: 1; color: var(--accent); }
.headline__label { font-family: var(--font-num); font-size: 0.6875rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--iron-soft); }
.headline__exact { width: 100%; margin: 0; font-family: var(--font-num); font-size: 0.8125rem; color: var(--iron-soft); }

.section { display: grid; row-gap: 0.9rem; }
.section__head { margin: 0; font-family: var(--font-num); font-size: 0.6875rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); }
.section__body { margin: 0; max-width: 42rem; line-height: 1.68; }

.facts { margin: 0; display: flex; flex-wrap: wrap; gap: 0.9rem 2.5rem; }
.facts__pair { display: grid; row-gap: 0.1rem; }
.facts__label { font-family: var(--font-num); font-size: 0.625rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--iron-soft); }
.facts__value { margin: 0; font-family: var(--font-num); font-size: 1.0625rem; font-variant-numeric: tabular-nums; }

.scroller { overflow-x: auto; }
.grid { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.grid__head { font-family: var(--font-num); font-size: 0.625rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--iron-soft); text-align: left; font-weight: 400; padding: 0 1.25rem 0.5rem 0; border-bottom: 1px solid var(--iron); white-space: nowrap; }
.grid__cell { padding: 0.5rem 1.25rem 0.5rem 0; border-bottom: 1px solid var(--sheet-edge); vertical-align: baseline; }
.grid__cell--num { font-family: var(--font-num); font-variant-numeric: tabular-nums; white-space: nowrap; }
.grid__head--num { text-align: left; }

.commands { list-style: none; margin: 0; padding: 0; display: grid; row-gap: 0.4rem; }
.commands__row { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; align-items: baseline; font-size: 0.8125rem; }
.commands__code { font-family: var(--font-num); padding: 0.15rem 0.45rem; background: var(--sheet-deep); white-space: nowrap; }
.commands__what { color: var(--iron-soft); }

.play { display: inline-block; justify-self: start; padding: 0.85rem 1.75rem; font-size: 0.75rem; letter-spacing: 0.18em; text-transform: uppercase; text-decoration: none; color: var(--sheet); background: var(--accent); }
.play:hover, .play:focus-visible { filter: brightness(0.86); }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

@media (max-width: 40rem) {
  .grid { font-size: 0.8125rem; }
}
`;

function table(spec: NonNullable<Section['table']>): string {
  const numeric = new Set(spec.numeric ?? []);
  const head = spec.columns
    .map((c, i) => `<th class="grid__head${numeric.has(i) ? ' grid__head--num' : ''}" scope="col">${esc(c)}</th>`)
    .join('');
  const body = spec.rows
    .map(
      row =>
        `<tr>${row
          .map((cell, i) => `<td class="grid__cell${numeric.has(i) ? ' grid__cell--num' : ''}">${esc(cell)}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `<div class="scroller"><table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function section(s: Section): string {
  const parts = [`<h2 class="section__head">${esc(s.head)}</h2>`];
  for (const p of s.body ?? []) parts.push(`<p class="section__body">${esc(p)}</p>`);
  if (s.facts) {
    parts.push(
      `<dl class="facts">${s.facts
        .map(
          ([label, value]) =>
            `<div class="facts__pair"><dt class="facts__label">${esc(label)}</dt><dd class="facts__value">${esc(value)}</dd></div>`,
        )
        .join('')}</dl>`,
    );
  }
  if (s.commands) {
    parts.push(
      `<ul class="commands">${s.commands
        .map(
          ([command, what]) =>
            `<li class="commands__row"><code class="commands__code">${esc(command)}</code><span class="commands__what">${esc(what)}</span></li>`,
        )
        .join('')}</ul>`,
    );
  }
  if (s.table) parts.push(table(s.table));
  return `<section class="section">${parts.join('')}</section>`;
}

function document_(page: Page): string {
  const room = ROOMS[page.game.room];
  const lit = paletteAtWax(LEVEL_FULL, room);
  /** Only what this room does not share with the other two. */
  const roomVars = [
    `--accent:${css(accentFor(room))}`,
    `--room-ink:${css(lit.ink)}`,
    `--room-light:rgb(${lit.tallow.r} ${lit.tallow.g} ${lit.tallow.b} / 0.16)`,
    `--room-money:${css(lit.brass)}`,
    `--room-text:${css(lit.tallow)}`,
  ].join(';');

  const title = `${page.game.name} — how it works`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(page.game.line)}" />
    <meta name="theme-color" content="${css(lit.ink)}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(page.game.line)}" />
    <!--
      GENERATED by npm run gen:pages — do not edit. Every figure below is
      recomputed from this game's own dynamic program in exact rationals.

      This is NOT an entry: no jam widget, no game.manifest.json, no metrics.
      The widget marks a submission and this page is not submitted.
    -->
    <link rel="stylesheet" href="/how.css" />
    <style>:root{${roomVars}}</style>
  </head>
  <body>
    <div class="wrap">
      <div class="band">
        <div class="band__inner">
          <nav class="crumbs">
            <a class="crumbs__back" href="/">← The list</a>
            <span class="crumbs__date">Chain Jam Vol. 1 · 1728</span>
          </nav>
          <p class="eyebrow">${esc(page.game.primitive)}</p>
          <h1 class="title">${esc(page.game.name)}</h1>
          <p class="pitch">${esc(page.game.line)}</p>
        </div>
      </div>

      <div class="headline">
        <span class="headline__value">${esc(page.headline.value)}</span>
        <span class="headline__label">${esc(page.headline.label)}</span>
        <p class="headline__exact">${esc(page.headline.exact)}</p>
      </div>

      ${page.sections.map(section).join('\n      ')}

      <a class="play" href="/${esc(page.game.slug)}/">Play ${esc(page.game.name)}</a>
    </div>
  </body>
</html>
`;
}

// ---------------------------------------------------------------------------
//  The three pages
// ---------------------------------------------------------------------------

const entry = (slug: string): GameEntry => {
  const found = GAMES.find(g => g.slug === slug);
  if (!found) throw new Error(`no catalogue entry for ${slug}`);
  return found;
};

const pct = (r: R.Rational, places = 4) => `${R.toPercent(r, places)}%`;

const HOW_TO_CHECK = (command: string, what: string): Section => ({
  head: 'How to check it',
  body: [
    'Every figure on this page was recomputed when it was built, from the model in this repository, in exact BigInt fractions. Nothing here is read from a constant, and the contract is generated from the same source, so the page and the chain cannot disagree.',
  ],
  commands: [[command, what]],
});

function candlePage(): Page {
  const solution = solveCandle();
  const optimal = candleOptimal(solution);
  return {
    game: entry('candle'),
    headline: { value: pct(solution.rtp), label: 'Returns, played best', exact: `Exactly ${R.toExactString(solution.rtp)}` },
    sections: [
      {
        head: 'The problem',
        body: [entry('candle').provenance],
      },
      {
        head: 'The lots on the table',
        table: {
          columns: ['Lot', 'Face', 'Chance'],
          numeric: [1, 2],
          rows: LOTS.map(lot => [
            lot.name,
            `${(lot.faceBp / FACE_DENOM).toFixed(2)}×`,
            `${R.toPercent(R.rat(lot.weight, CANDLE_WEIGHT), 2)}%`,
          ]),
        },
      },
      {
        head: 'And what an inch costs',
        body: [
          'The candle is the discount. Every inch that burns is worth less than the one before it, by a ladder fixed before the round begins — so waiting is never free and the decision is never about luck running out.',
        ],
        table: {
          columns: ['Inch', 'A lot claimed here is worth'],
          numeric: [0, 1],
          rows: WAX_BP.map((bp, i) => [`${i + 1} of ${INCHES}`, `${(bp / 100).toFixed(0)}% of its face`]),
        },
      },
      {
        head: 'The numbers',
        facts: [
          ['House edge', pct(R.sub(R.rat(1n), solution.rtp))],
          ['Most it pays', '25×'],
          ['Rounds that pay nothing', pct(probabilityOfNothing(optimal), 2)],
          ['Mean inches watched', R.toFixed(meanRoundLength(optimal), 3)],
        ],
      },
      {
        head: 'What other ways of playing return',
        body: [
          'This is a game with a decision in it, so the return depends on how you play. The whole band is published, careless end included, and every way of playing it that a person would actually adopt sits inside the jam’s 93–98% window.',
        ],
        table: {
          columns: ['How you play', 'Returns'],
          numeric: [1],
          rows: candleBand(solution).map(p => [
            p.note ? `${p.label} — ${p.note}` : p.label,
            pct(evaluateCandle(p.policy), 3),
          ]),
        },
      },
      HOW_TO_CHECK('npm run verify:rtp', 'the paytable, the dynamic program over all 30 reachable states, and the declared return'),
    ],
  };
}

function surveyPage(): Page {
  const solution = solveSurvey();
  const optimal = surveyOptimal(solution);
  return {
    game: entry('survey'),
    headline: { value: pct(solution.rtp), label: 'Returns, played best', exact: `Exactly ${R.toExactString(solution.rtp)}` },
    sections: [
      { head: 'The problem', body: [entry('survey').provenance] },
      {
        head: 'What is hidden, and how',
        body: [
          'Every hook on this contract is view-only and holds no storage, so the whole of a session is public and so is every random word it consumes. If the ship’s condition were drawn at the start it could simply be read.',
          'So the model is factored the other way. A report is drawn from the predictive distribution, which depends only on the evidence so far and is safe to compute in the open; her condition is drawn at settlement from the posterior, out of a word that does not exist until the call is already locked in. The joint distribution is identical either way — it is the same probability model, factored so that nothing which decides the voyage exists while the player can still act on it.',
        ],
      },
      {
        head: 'The manifest',
        table: {
          columns: ['Cargo', 'She pays', 'Chance'],
          numeric: [1, 2],
          rows: CARGOES.map(c => [
            c.name,
            `${(c.valueBp / VALUE_DENOM).toFixed(2)}×`,
            `${R.toPercent(R.rat(c.weight, SURVEY_WEIGHT), 2)}%`,
          ]),
        },
      },
      {
        head: 'The evidence, and its price',
        facts: [
          ['Ships that are sound', `${PRIOR_SOUND_NUM}/${PRIOR_SOUND_DEN}`],
          ['A surveyor is right', `${ACCURACY_NUM}/${ACCURACY_DEN}`],
          ['One report multiplies the odds by', `${ACCURACY_NUM}/${ACCURACY_DEN - ACCURACY_NUM}`],
          ['A surveyor costs', `${((PREMIUM_BP[0]! - PREMIUM_BP[1]!) / 100).toFixed(2)}% of the premium`],
          ['Surveyors available', String(MAX_SURVEYS)],
          ['Declining pays', `${(DECLINE_BP / 100).toFixed(2)}× of the premium`],
          ['Mean surveyors bought', R.toFixed(meanSurveys(optimal), 3)],
        ],
      },
      {
        head: 'The premium, as it is spent',
        table: {
          columns: ['Surveyors sent', 'Premium remaining'],
          numeric: [0, 1],
          rows: PREMIUM_BP.map((bp, i) => [String(i), `${((bp / PREMIUM_DENOM) * 100).toFixed(2)}%`]),
        },
      },
      {
        head: 'What other ways of playing return',
        body: [
          'Every policy this game publishes is inside the jam’s 93–98% window — from sending nobody to sending everybody. That is a stricter claim than the band alone, and it is the constraint the manifest was tuned around: sharper evidence pays the careful player out of the top of the band and drops the careless one below the bottom of it.',
        ],
        table: {
          columns: ['How you play', 'Returns'],
          numeric: [1],
          rows: surveyBand(solution).map(p => [
            p.note ? `${p.label} — ${p.note}` : p.label,
            pct(evaluateSurvey(p.policy), 3),
          ]),
        },
      },
      HOW_TO_CHECK('npm run verify:survey', 'the manifest, the belief table as exact fractions, and the dynamic program over all 126 reachable states'),
    ],
  };
}

function brokersPage(): Page {
  const solution = solveBrokers();
  const optimal = brokersOptimal(solution);
  const shape = roundShape(optimal);
  const worst = takeValue((1 << BROKER_LIST.length) - 1, Math.min(...HOUSE.map(q => q.priceBp)));
  const order = askingOrder();
  return {
    game: entry('brokers'),
    headline: { value: pct(solution.rtp), label: 'Returns, played best', exact: `Exactly ${R.toExactString(solution.rtp)}` },
    sections: [
      { head: 'The problem', body: [entry('brokers').provenance] },
      {
        head: 'The rule, in full',
        body: [
          'Give every broker a reservation price z, the price at which you would not care whether you asked him: the one solving E[(X − z)⁺] = c, where X is what he might name and c is his fee. Ask in descending z, and stop the moment what you already hold beats the best remaining z.',
          'That rule is not a heuristic and not an approximation of the dynamic program. It is the dynamic program — the same choice at every one of the 120 reachable states, which is checked rather than claimed. The whole of it is printed inside the game, asking order included: this game is not selling an information edge over you, it is selling the ten seconds in which you decide whether to believe a theorem.',
          'On this floor the index order is the exact reverse of the average-price order. The broker whose prices average highest is the last one worth asking, and the one who averages worst goes first, because what an index prices is the upside, not the middle.',
        ],
      },
      {
        head: 'The floor',
        table: {
          columns: ['Broker', 'Fee', 'What he names', 'Average', 'Index (z)', 'Ask'],
          numeric: [1, 3, 4, 5],
          rows: [
            [
              'The house’s man',
              'nothing',
              HOUSE.map(q => `${(q.priceBp / PRICE_DENOM).toFixed(2)}× at ${R.toPercent(R.rat(q.weight, BROKER_WEIGHT), 0)}%`).join(' · '),
              '—',
              '—',
              'first',
            ],
            ...BROKER_LIST.map(b => [
              b.name,
              `${(b.feeBp / 100).toFixed(2)}%`,
              b.quotes.map(q => `${(q.priceBp / PRICE_DENOM).toFixed(2)}× at ${R.toPercent(R.rat(q.weight, BROKER_WEIGHT), 2)}%`).join(' · '),
              `${R.toFixed(meanPrice(b), 4)}×`,
              `${R.toFixed(reservationPrice(b), 4)}×`,
              String(order.findIndex(o => o.id === b.id) + 1),
            ]),
          ],
        },
      },
      {
        head: 'The numbers',
        facts: [
          ['House edge', pct(R.sub(R.rat(1n), solution.rtp))],
          ['Most it pays', `${(MAX_PAYOUT_BP / PRICE_DENOM).toFixed(4)}×`],
          ['Least it pays', `${R.toFixed(worst, 4)}×`],
          ['All four fees together', `${(TOTAL_FEES_BP / 100).toFixed(2)}%`],
          ['Mean brokers asked', R.toFixed(shape.meanAsked, 3)],
          ['Kept the house’s own price', pct(shape.keptTheHouse, 1)],
        ],
      },
      {
        head: 'What other ways of playing return',
        body: [
          'Every policy this game publishes is inside the jam’s 93–98% window. The fees are what hold it there, and they work from both ends: large enough that asking everybody is a real mistake, small enough that taking the first price offered is not a disaster. There is no losing state in this game at all — the worst it can do is hand back less than you staked.',
        ],
        table: {
          columns: ['How you play', 'Returns'],
          numeric: [1],
          rows: brokersBand(solution).map(p => [
            p.note ? `${p.label} — ${p.note}` : p.label,
            pct(evaluateBrokers(p.policy), 3),
          ]),
        },
      },
      HOW_TO_CHECK(
        'npm run verify:brokers',
        'the market, the index checked against its own defining equation, and that Pandora’s rule is the dynamic program at all 120 reachable states',
      ),
    ],
  };
}

// ---------------------------------------------------------------------------

const pages = [candlePage(), surveyPage(), brokersPage()];

const sheet = resolve(ROOT, 'public', 'how.css');
writeFileSync(sheet, STYLE.replace('SHEET_HEX', css(SHEET)).trimStart());
console.log(`wrote ${sheet.replace(ROOT + '/', '')}`);

for (const page of pages) {
  const out = resolve(ROOT, 'public', page.game.slug, 'how', 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, document_(page));
  console.log(`wrote ${out.replace(ROOT + '/', '')}  ${page.game.name} — ${page.headline.value}`);
}
