/**
 * I10 — the page is fully playable standalone: no host, no wallet, no modal,
 * no splash.
 *
 * A render that throws is exactly the kind of break that ships silently, so the
 * whole loop is driven here through the real components and the real demo host:
 * deal, read the lot, burn, claim, deal again — plus the keyboard path, which
 * has no other coverage.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../src/games/candle/app/ui/App';
import { ErrorBoundary } from '../src/games/candle/app/ui/ErrorBoundary';
import { COPY } from '../src/games/candle/app/ui/copy';
import { LOTS } from '../src/games/candle/core/paytable';
import { INCHES } from '../src/games/candle/core/wax';
import { DWELL_SLOW_MS } from '../src/games/candle/app/audio/voice';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let container: HTMLDivElement;
let root: Root;

const text = () => container.textContent ?? '';
const buttonSaying = (needle: string) =>
  Array.from(container.querySelectorAll('button')).find(b => (b.textContent ?? '').includes(needle)) ?? null;

/**
 * Waits for the demo host's scheduled reveal.
 *
 * The pacing is DERIVED from how close a lot sits to its claim threshold, so a
 * reveal takes anywhere from 260 ms to DWELL_SLOW_MS. Polling rather than
 * sleeping keeps the common case fast and the knife-edge case correct — a fixed
 * sleep either raced the slow lots or paid for them on every single reveal.
 */
const CEILING_MS = DWELL_SLOW_MS + 400;

const settle = async (until?: () => boolean) => {
  const deadline = Date.now() + CEILING_MS;
  for (;;) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 40));
    });
    if (until ? until() : Date.now() >= deadline) return;
    if (Date.now() >= deadline) return;
  }
};

const settledBoard = () => /Claimed at the|The candle guttered/.test(text());

const press = async (key: string, init: KeyboardEventInit = {}) => {
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, ...init }));
    await Promise.resolve();
  });
};

beforeEach(async () => {
  // Standalone: not embedded, so `selectHost` must pick the demo host with no
  // connect screen and no splash.
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
  // Free play deals on load, so the first thing to wait for is a lot.
  await settle(() => text().includes(COPY.lotOnTable));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('I10 — the standalone page', () => {
  it('renders without a host, and says so', () => {
    expect(text()).toContain(COPY.title);
    expect(text()).toContain(COPY.demoBadge);
  });

  it('shows no wallet prompt, no modal and no splash', () => {
    expect(text()).not.toContain(COPY.walletDisconnected);
    expect(text()).not.toContain(COPY.hostUnreachable);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('ZERO CLICKS TO COMPREHENSION — the design law, on load', () => {
    // claude.md §5 and prd.md §2: "On load the player sees the lot on the table,
    // its face value, the candle with five pins, the payout if claimed now, and
    // two buttons." Not a form. A judge with 90 seconds gets one look.
    const body = text();
    expect(body, 'the lot').toContain(COPY.lotOnTable);
    expect(LOTS.some(lot => body.includes(lot.name)), 'a named lot').toBe(true);
    expect(body, 'the inch, i.e. the candle').toContain(COPY.inchOf(1));
    expect(body, 'the wax remaining').toContain(COPY.waxRemaining);
    expect(body, 'the payout if claimed now').toContain(COPY.ifClaimedNow);
    expect(buttonSaying(COPY.claim), 'CLAIM').not.toBeNull();
    expect(buttonSaying(COPY.burn), 'LET IT BURN').not.toBeNull();
  });

  it('shows no form standing between the player and the game', () => {
    expect(buttonSaying(COPY.lightTheCandle), 'no LIGHT THE CANDLE gate in free play').toBeNull();
  });

  it('still shows the purse and the DEMO badge, so free play is never mistaken for real', () => {
    expect(text()).toContain(COPY.purse);
    expect(text()).toContain(COPY.demoBadge);
  });

  it('offers REFILL, because the purse lasts one page load', () => {
    expect(buttonSaying(COPY.refill)).not.toBeNull();
  });

  it('writes nothing to browser storage', () => {
    // Not every jsdom build exposes storage, so this only asserts when it can.
    // The durable enforcement of claude.md §7 is the `npm run gates` grep, which
    // no environment quirk can satisfy by accident.
    expect(window.localStorage?.length ?? 0).toBe(0);
    expect(window.sessionStorage?.length ?? 0).toBe(0);
  });
});

describe('the loop', () => {
  /** Free play deals on load, so a round is already on the table. */
  const deal = async () => {
    await settle(() => text().includes(COPY.lotOnTable));
  };

  it('deals a lot with a face value and a payout-if-claimed-now', async () => {
    await deal();
    expect(text()).toContain(COPY.lotOnTable);
    expect(text()).toContain(COPY.inchOf(1));
    expect(text()).toContain(COPY.waxRemaining);
    expect(LOTS.some(lot => text().includes(lot.name))).toBe(true);
  });

  it('offers both switches, with their keys printed on them', async () => {
    await deal();
    const claim = buttonSaying(COPY.claim);
    const burn = buttonSaying(COPY.burn);
    expect(claim?.textContent).toContain(COPY.claimKey);
    expect(burn?.textContent).toContain(COPY.burnKey);
    expect(burn?.hasAttribute('disabled')).toBe(false);
  });

  it('burning advances the inch', async () => {
    await deal();
    await act(async () => {
      buttonSaying(COPY.burn)?.click();
    });
    await settle(() => text().includes(COPY.inchOf(2)));
    expect(text()).toContain(COPY.inchOf(2));
  });

  it('claiming settles the round and offers DEAL AGAIN', async () => {
    await deal();
    await act(async () => {
      buttonSaying(COPY.claim)?.click();
    });
    await settle(settledBoard);
    expect(text()).toMatch(/Claimed at the|The candle guttered/);
    expect(buttonSaying(COPY.dealAgain)).not.toBeNull();
  });

  it('rides all the way to the gutter, where BURN is refused', async () => {
    await deal();
    for (let inch = 1; inch < INCHES; inch++) {
      expect(text(), `inch ${inch}`).toContain(COPY.inchOf(inch));
      await act(async () => {
        buttonSaying(COPY.burn)?.click();
      });
      await settle(() => text().includes(COPY.inchOf(inch + 1)) || settledBoard());
    }
    // The fifth inch settles as it is revealed, so the board is already done.
    expect(text()).toContain(COPY.dealAgain);
    expect(text()).toMatch(/The candle guttered/);
  });

  it('offers the stake on the settled board, so changing it is still a decision', async () => {
    await deal();
    await act(async () => {
      buttonSaying(COPY.claim)?.click();
    });
    await settle(settledBoard);
    expect(text()).toContain(COPY.stake);
    expect(container.querySelector('#stake')).not.toBeNull();
  });

  it('deals straight into the next round, without a form in between', async () => {
    await deal();
    await act(async () => {
      buttonSaying(COPY.claim)?.click();
    });
    await settle(settledBoard);
    await act(async () => {
      buttonSaying(COPY.dealAgain)?.click();
    });
    await settle(() => text().includes(COPY.lotOnTable) && !settledBoard());
    expect(text()).toContain(COPY.lotOnTable);
    expect(text()).toContain(COPY.inchOf(1));
  });
});

describe('the keyboard path (docs.md §6.3)', () => {
  it('Space claims, Enter deals the next round', async () => {
    await settle(() => text().includes(COPY.lotOnTable));

    await press(' ');
    await settle(settledBoard);
    expect(text()).toContain(COPY.dealAgain);

    await press('Enter');
    await settle(() => text().includes(COPY.lotOnTable) && !settledBoard());
    expect(text()).toContain(COPY.lotOnTable);
  });

  it('B lets it burn', async () => {
    await settle(() => text().includes(COPY.lotOnTable));
    await press('B');
    await settle(() => text().includes(COPY.inchOf(2)));
    expect(text()).toContain(COPY.inchOf(2));
  });

  it('ArrowDown lets it burn too', async () => {
    await settle(() => text().includes(COPY.lotOnTable));
    await press('ArrowDown');
    await settle(() => text().includes(COPY.inchOf(2)));
    expect(text()).toContain(COPY.inchOf(2));
  });

  it('? opens the panel and Escape closes it', async () => {
    await press('?');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(text()).toContain(COPY.helpTitle);
    await press('Escape');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('M toggles the sound label', async () => {
    expect(text()).toContain(COPY.soundOn);
    await press('M');
    expect(text()).toContain(COPY.soundOff);
  });
});

describe('the ? panel publishes the math', () => {
  it('shows the paytable, the ladder, the thresholds, the RTP and the band', async () => {
    await press('?');
    const body = text();
    for (const lot of LOTS) expect(body, lot.name).toContain(lot.name);
    expect(body).toContain(COPY.waxTitle);
    expect(body).toContain(COPY.thresholdTitle);
    expect(body).toContain('96.9961%');
    expect(body).toContain('7577820426157 / 7812500000000');
    expect(body).toContain(COPY.optimalRule);
    expect(body).toContain(COPY.bandTitle);
    // The careless end of the band is published too — we do not hide it.
    expect(body).toContain('93.577%');
  });
});

describe('the last line of defence', () => {
  it('shows the room, not a blank page, when something throws', async () => {
    const Boom = () => {
      throw new Error('the wick snapped');
    };
    const holder = document.createElement('div');
    document.body.appendChild(holder);
    const crashRoot = createRoot(holder);

    // React logs the caught error; that is the point of it, but it is noise here.
    const consoleError = console.error;
    console.error = () => {};
    try {
      await act(async () => {
        crashRoot.render(
          <ErrorBoundary>
            <Boom />
          </ErrorBoundary>,
        );
      });

      const body = holder.textContent ?? '';
      expect(body, 'the page is not blank').not.toBe('');
      expect(body).toContain(COPY.title);
      expect(body).toContain(COPY.crashed);
      expect(body, 'the error is shown, not swallowed').toContain('the wick snapped');

      const reload = Array.from(holder.querySelectorAll('button')).find(b => (b.textContent ?? '').includes(COPY.crashReload));
      expect(reload, 'offers the one action that helps').not.toBeNull();
    } finally {
      console.error = consoleError;
      await act(async () => crashRoot.unmount());
      holder.remove();
    }
  });

  it('says nothing that could be mistaken for a lost stake', () => {
    expect(COPY.crashed).toContain('already settled on chain');
    expect(/!/.test(COPY.crashed)).toBe(false);
  });
});

describe('the ledger', () => {
  const settledBoardNow = () => /Claimed at the|The candle guttered/.test(text());

  it('opens on L and closes on Escape', async () => {
    await press('L');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(text()).toContain(COPY.ledgerTitle);
    await press('Escape');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('says plainly that nothing has settled yet', async () => {
    await press('L');
    expect(text()).toContain(COPY.ledgerEmpty);
    await press('Escape');
  });

  it('records a settled round, with the ghost in a column of its own', async () => {
    await settle(() => text().includes(COPY.lotOnTable));
    await press(' ');
    await settle(settledBoardNow);

    await press('L');
    const body = text();
    expect(body).toContain(COPY.ledgerTook);
    expect(body).toContain(COPY.ledgerNext);
    expect(body).toContain(COPY.ledgerRealised);
    expect(body).toContain(COPY.ledgerDeclared);
    expect(body, 'the declared RTP, so a short run can be read against it').toContain('96.99');
    await press('Escape');
  });

  it('never tallies what the player could have won', async () => {
    // claude.md §7: no loss-chasing nudges. The ledger reports what HAPPENED and
    // the realised return; it must not compute a regret.
    const forbidden = [/missed/i, /could have/i, /would have won/i, /left on the table/i, /lost value/i, /if only/i];
    const strings = [
      COPY.ledgerTitle, COPY.ledgerEmpty, COPY.ledgerRound, COPY.ledgerTook, COPY.ledgerInch,
      COPY.ledgerPaid, COPY.ledgerNext, COPY.ledgerGuttered, COPY.ledgerSoFar, COPY.ledgerRounds,
      COPY.ledgerStaked, COPY.ledgerReturned, COPY.ledgerRealised, COPY.ledgerDeclared, COPY.ledgerNote,
    ];
    for (const value of strings) {
      for (const pattern of forbidden) expect(pattern.test(value), `"${value}" matches ${pattern}`).toBe(false);
    }
    // And it warns that a short session proves nothing, rather than implying it does.
    expect(COPY.ledgerNote).toMatch(/says little|wide/i);
  });

  it('only one panel is open at a time', async () => {
    await press('?');
    expect(text()).toContain(COPY.helpTitle);
    await press('L');
    expect(text()).toContain(COPY.ledgerTitle);
    expect(text()).not.toContain(COPY.paytableTitle);
    await press('Escape');
  });
});

describe('the host theme reaches the chrome and stops there', () => {
  it('declares the light palette for a light host', () => {
    const tokens = readFileSync(resolve(process.cwd(), 'src/shared/ui/tokens.css'), 'utf8');
    expect(tokens).toContain("[data-theme='light']");
    for (const token of ['--chrome-bg', '--chrome-ink', '--chrome-rule', '--chrome-field']) {
      expect(tokens, token).toContain(token);
    }
  });

  it('never lets a theme touch the four inks or the scene', () => {
    const tokens = readFileSync(resolve(process.cwd(), 'src/shared/ui/tokens.css'), 'utf8');
    const light = tokens.slice(tokens.indexOf("[data-theme='light']"));
    // The light model is the product; a host theme adapts the frame only
    // (docs.md §4.1). Redefining an ink here would repaint the game.
    for (const ink of ['--tallow:', '--brass:', '--oxblood:', '--ink:']) {
      expect(light.includes(ink), `${ink} must not be redefined by a theme`).toBe(false);
    }
    const table = readFileSync(resolve(process.cwd(), 'src/shared/ui/table.css'), 'utf8');
    expect(table, 'the canvas keeps the room whatever the host does').toMatch(/\.scene \{\s*background: var\(--ink\)/);
  });
});
