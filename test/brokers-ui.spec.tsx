/**
 * I10 for THE BROKERS — the page is fully playable standalone: no host, no
 * wallet, no modal, no splash.
 *
 * The whole loop is driven through the real components and the real demo host:
 * the house names a price, brokers are asked, the claim is sold — plus the
 * keyboard path, which has no other coverage.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../src/games/brokers/app/ui/App';
import { ErrorBoundary } from '../src/games/brokers/app/ui/ErrorBoundary';
import { COPY } from '../src/games/brokers/app/ui/copy';
import { BROKER_LIST } from '../src/games/brokers/core/market';
import { DWELL_SLOW_MS } from '../src/games/brokers/app/audio/voice';

let container: HTMLDivElement;
let root: Root;

const text = () => container.textContent ?? '';
const buttonSaying = (needle: string) =>
  Array.from(container.querySelectorAll('button')).find(b => (b.textContent ?? '').includes(needle)) ?? null;

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

const onTheFloor = () => text().includes(COPY.claimOnOffer);
const sold = () => /Sold at/.test(text());

const press = async (key: string, init: KeyboardEventInit = {}) => {
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, ...init }));
    await Promise.resolve();
  });
};

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
  await settle(onTheFloor);
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
    // A price is already on the table, every man's fee is printed on his own
    // switch, and selling is one key away.
    const body = text();
    expect(body, 'a price in hand').toContain(COPY.claimOnOffer);
    expect(body, 'who named it').toContain(COPY.theHouse);
    expect(body, 'what selling pays').toContain(COPY.takeNow);
    expect(body, 'what the day has cost').toContain(COPY.feesPaid);
    expect(buttonSaying(COPY.take), 'SELL THE CLAIM').not.toBeNull();
    for (const broker of BROKER_LIST) {
      const button = buttonSaying(broker.name.toUpperCase());
      expect(button, broker.name).not.toBeNull();
      // His fee, printed on his own switch: the cost is never a surprise.
      expect(button?.textContent, broker.name).toMatch(/%/);
    }
  });

  it('shows no form standing between the player and the game', () => {
    expect(buttonSaying(COPY.openTheFloor)).toBeNull();
  });

  it('writes nothing to browser storage', () => {
    expect(window.localStorage?.length ?? 0).toBe(0);
    expect(window.sessionStorage?.length ?? 0).toBe(0);
  });
});

describe('the loop', () => {
  it('asking a broker costs his fee and puts a price on the floor', async () => {
    expect(text()).toContain('0%');
    const broker = BROKER_LIST[3];
    await act(async () => {
      buttonSaying(broker!.name.toUpperCase())?.click();
    });
    await settle(() => text().includes(broker!.name.toUpperCase()) && !text().includes('0%'));

    // His fee is now paid, and his price is on the floor.
    expect(text()).toMatch(/0\.95%/);
    expect(buttonSaying(broker!.name.toUpperCase())?.hasAttribute('disabled')).toBe(true);
    expect(text()).toContain(COPY.alreadyAsked);
  });

  it('a better price becomes the one in hand; a worse one does not', async () => {
    const before = /HOLDING\s*([\d.]+)×/.exec(text().replace(/\s+/g, ' '));
    await act(async () => {
      buttonSaying(BROKER_LIST[3]!.name.toUpperCase())?.click();
    });
    await settle(() => text().includes(COPY.alreadyAsked));
    const after = /HOLDING\s*([\d.]+)×/.exec(text().replace(/\s+/g, ' '));
    // Recall: it can rise, and it can never fall.
    expect(Number(after?.[1] ?? 0)).toBeGreaterThanOrEqual(Number(before?.[1] ?? 0));
  });

  it('selling settles the claim and says who named the price', async () => {
    await act(async () => {
      buttonSaying(COPY.take)?.click();
    });
    await settle(sold);
    expect(text()).toMatch(/Sold at/);
    expect(buttonSaying(COPY.dealAgain)).not.toBeNull();
  });

  it('asks everybody, after which only selling is left', async () => {
    for (const broker of BROKER_LIST) {
      await act(async () => {
        buttonSaying(broker.name.toUpperCase())?.click();
      });
      await settle(() => buttonSaying(broker.name.toUpperCase())?.hasAttribute('disabled') === true);
    }
    expect(text()).toContain(COPY.everybodyAsked);
    for (const broker of BROKER_LIST) {
      expect(buttonSaying(broker.name.toUpperCase())?.hasAttribute('disabled'), broker.name).toBe(true);
    }
    // And selling is still there — it always was.
    expect(buttonSaying(COPY.take)?.hasAttribute('disabled')).toBe(false);
  }, 20_000);

  it('offers the stake on the settled board, so changing it is still a decision', async () => {
    await act(async () => {
      buttonSaying(COPY.take)?.click();
    });
    await settle(sold);
    expect(text()).toContain(COPY.stake);
    expect(container.querySelector('#stake')).not.toBeNull();
  });

  it('opens the next claim without a form in between', async () => {
    await act(async () => {
      buttonSaying(COPY.take)?.click();
    });
    await settle(sold);
    await act(async () => {
      buttonSaying(COPY.dealAgain)?.click();
    });
    await settle(() => onTheFloor() && !sold());
    expect(text()).toContain(COPY.claimOnOffer);
    expect(text()).toContain('0%');
  });
});

describe('the keyboard path', () => {
  it('1 … 4 ask that broker', async () => {
    await press('1');
    await settle(() => buttonSaying(BROKER_LIST[0]!.name.toUpperCase())?.hasAttribute('disabled') === true);
    expect(buttonSaying(BROKER_LIST[0]!.name.toUpperCase())?.hasAttribute('disabled')).toBe(true);
  });

  it('Space sells, Enter opens the next claim', async () => {
    await press(' ');
    await settle(sold);
    expect(text()).toContain(COPY.dealAgain);

    await press('Enter');
    await settle(() => onTheFloor() && !sold());
    expect(text()).toContain(COPY.claimOnOffer);
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

describe('the ? panel publishes the whole strategy', () => {
  it('shows the market, every index, the asking order, the RTP and the band', async () => {
    await press('?');
    const body = text();
    for (const broker of BROKER_LIST) expect(body, broker.name).toContain(broker.name);
    expect(body).toContain(COPY.marketTitle);
    expect(body).toContain(COPY.indexTitle);
    expect(body, 'the declared RTP').toContain('96.9637%');
    expect(body, 'and it as an exact rational').toContain('1551418623 / 1600000000');
    expect(body).toContain(COPY.bandTitle);
    expect(body, 'the maximum payout, as it really is').toContain('4.9905');
    expect(body, 'and the minimum, because there is no losing state').toContain('0.7030');
    await press('Escape');
  });

  it('prints the counterintuitive fact the game exists for', async () => {
    await press('?');
    // Stubbs has the best average price and is asked last; Vanderdek has the
    // worst and is asked second.
    expect(text()).toContain(COPY.indexPunchline('Stubbs', 'Vanderdek'));
    await press('Escape');
  });
});

describe('the voice', () => {
  it('never exclaims, never taunts, never says you lost', () => {
    const strings = Object.values(COPY).flatMap(value =>
      typeof value === 'string' ? [value] : Array.isArray(value) ? value.flat().filter(v => typeof v === 'string') : [],
    );
    const forbidden = [/!/, /you lose/i, /so close/i, /unlucky/i, /bad luck/i, /jackpot/i, /congratulat/i];
    for (const value of strings) {
      for (const pattern of forbidden) expect(pattern.test(value), `"${value}" matches ${pattern}`).toBe(false);
    }
  });
});

describe('the last line of defence', () => {
  it('shows the room, not a blank page, when something throws', async () => {
    const Boom = () => {
      throw new Error('the ledger tore');
    };
    const holder = document.createElement('div');
    document.body.appendChild(holder);
    const crashRoot = createRoot(holder);

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
      expect(body).not.toBe('');
      expect(body).toContain(COPY.title);
      expect(body).toContain(COPY.crashed);
      expect(body, 'the error is shown, not swallowed').toContain('the ledger tore');
    } finally {
      console.error = consoleError;
      await act(async () => crashRoot.unmount());
      holder.remove();
    }
  });
});

describe('the book', () => {
  it('opens on L and closes on Escape', async () => {
    await press('L');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(text()).toContain(COPY.ledgerTitle);
    await press('Escape');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('records a sold claim, with the ghost in a column of its own', async () => {
    await press(' ');
    await settle(sold);
    await press('L');
    const body = text();
    expect(body).toContain(COPY.ledgerSoldAt);
    expect(body).toContain(COPY.ledgerNext);
    expect(body).toContain(COPY.ledgerRealised);
    expect(body, 'the declared RTP, so a short run can be read against it').toContain('96.96');
    await press('Escape');
  });

  it('never tallies what the player could have had', () => {
    const forbidden = [/missed/i, /could have/i, /would have won/i, /left on the table/i, /if only/i];
    const strings = [
      COPY.ledgerTitle, COPY.ledgerEmpty, COPY.ledgerRound, COPY.ledgerSoldAt, COPY.ledgerTo,
      COPY.ledgerAsked, COPY.ledgerFees, COPY.ledgerPaid, COPY.ledgerNext, COPY.ledgerSoFar,
      COPY.ledgerRounds, COPY.ledgerStaked, COPY.ledgerReturned, COPY.ledgerRealised,
      COPY.ledgerDeclared, COPY.ledgerNote,
    ];
    for (const value of strings) {
      for (const pattern of forbidden) expect(pattern.test(value), `"${value}" matches ${pattern}`).toBe(false);
    }
    expect(COPY.ledgerNote).toMatch(/says little|wide/i);
  });
});
