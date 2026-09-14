/**
 * `npm run verify:light` — the phase-3 exit gate, in numbers.
 *
 * "Screenshot the same round at inches 1 and 5 side by side. If a stranger
 * cannot tell which one pays less WITHOUT READING A NUMBER, the light model has
 * failed." A stranger's eye is the real test, but the claim underneath it is
 * measurable, so it gets measured: relative luminance at each inch must be
 * exactly the wax ladder, and the tallow must actually walk down the blackbody
 * curve rather than just fading.
 */
import { INKS, paletteAtWax, relativeLuminance, contrastRatio, temperatureForWax, blackbody, sceneLuminance, css, type InkName } from '../src/render/light';
import { WAX_BP, INCHES, waxBpAt } from '../src/game/wax';

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;
const swatch = (rgb: { r: number; g: number; b: number }) => `\x1b[48;2;${rgb.r};${rgb.g};${rgb.b}m   \x1b[0m`;

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? D(`  ${detail}`) : ''}`);
  if (!ok) failed++;
};

console.log(`\n${B('CANDLE — the light model, measured')}`);
console.log(D('relative luminance is WCAG linear light: the number a colour picker reports\n'));

const names: InkName[] = ['tallow', 'brass', 'oxblood', 'ink'];
const full = waxBpAt(1);

// ---------------------------------------------------------------- the scene
console.log(B('The room, inch by inch'));
console.log(D('  inch   wax    flame        tallow            luminance   vs inch 1'));
for (let inch = 1; inch <= INCHES; inch++) {
  const waxBp = waxBpAt(inch);
  const palette = paletteAtWax(waxBp);
  const tallow = palette.tallow;
  const ratio = relativeLuminance(tallow) / relativeLuminance(paletteAtWax(full).tallow);
  console.log(
    `  ${String(inch).padStart(4)}${`${waxBp / 100}%`.padStart(7)}` +
      `${String(Math.round(temperatureForWax(waxBp))).padStart(7)}K ` +
      `${swatch(blackbody(temperatureForWax(waxBp)))} ` +
      `${swatch(tallow)} ${css(tallow).padEnd(20)}` +
      `${relativeLuminance(tallow).toFixed(4).padStart(9)}` +
      `${`${(ratio * 100).toFixed(2)}%`.padStart(11)}`,
  );
}

// ---------------------------------------------------------------- the claim
console.log(`\n${B('Brightness IS the multiplier')}`);
for (let inch = 1; inch <= INCHES; inch++) {
  const waxBp = waxBpAt(inch);
  for (const name of names) {
    if (name === 'ink') continue; // near-black; the ratio is dominated by rounding
    const here = relativeLuminance(paletteAtWax(waxBp)[name]);
    const atFull = relativeLuminance(paletteAtWax(full)[name]);
    const ratio = here / atFull;
    const want = sceneLuminance(waxBp);
    const off = Math.abs(ratio - want);
    if (name === 'tallow') {
      check(
        `inch ${inch}: ${name} sits at ${(want * 100).toFixed(0)}% of full-flame luminance`,
        off < 0.01,
        `measured ${(ratio * 100).toFixed(2)}%, wax ladder says ${(want * 100).toFixed(2)}%`,
      );
    } else if (off >= 0.01) {
      check(`inch ${inch}: ${name} tracks the wax ladder`, false, `measured ${(ratio * 100).toFixed(2)}%, want ${(want * 100).toFixed(2)}%`);
    }
  }
}
check('every non-room ink tracks the ladder at every inch', failed === 0);

// ---------------------------------------------------------------- monotone
console.log(`\n${B('The room only ever gets darker')}`);
{
  let monotone = true;
  for (let inch = 1; inch < INCHES; inch++) {
    const a = relativeLuminance(paletteAtWax(waxBpAt(inch)).tallow);
    const b = relativeLuminance(paletteAtWax(waxBpAt(inch + 1)).tallow);
    if (b >= a) monotone = false;
  }
  check('luminance falls at every single inch', monotone);
  const first = relativeLuminance(paletteAtWax(waxBpAt(1)).tallow);
  const last = relativeLuminance(paletteAtWax(waxBpAt(INCHES)).tallow);
  check(
    'the gutter is measurably, unmistakably darker than the first inch',
    last / first < 0.45,
    `${(last / first * 100).toFixed(1)}% of the light — a 2.5x drop`,
  );
}

// ---------------------------------------------------------------- blackbody
console.log(`\n${B('Warm light cools as it dims')}`);
{
  const hot = blackbody(temperatureForWax(waxBpAt(1)));
  const cold = blackbody(temperatureForWax(waxBpAt(INCHES)));
  check('the flame drops 500K from the first inch to the gutter', Math.round(temperatureForWax(waxBpAt(1)) - temperatureForWax(waxBpAt(INCHES))) === 500, '2000K -> 1500K');
  check('green falls as it cools, so the hue really walks the curve', cold.g < hot.g, `g ${hot.g} -> ${cold.g}`);
  check('blue falls to nothing', cold.b < hot.b, `b ${hot.b} -> ${cold.b}`);
  check('red stays pinned — this is the amber end of the locus', hot.r === 255 && cold.r === 255);

  const hotTallow = paletteAtWax(waxBpAt(1)).tallow;
  const coldTallow = paletteAtWax(waxBpAt(INCHES)).tallow;
  const hotSpread = hotTallow.r - hotTallow.b;
  const coldSpread = coldTallow.r - coldTallow.b;
  check(
    'tallow itself gets relatively more amber, not just darker',
    coldSpread / Math.max(coldTallow.r, 1) > hotSpread / Math.max(hotTallow.r, 1),
    `r-b spread ${(hotSpread / hotTallow.r * 100).toFixed(1)}% -> ${(coldSpread / coldTallow.r * 100).toFixed(1)}% of red`,
  );
}

// ---------------------------------------------------------------- legibility
console.log(`\n${B('Still readable at the gutter')}`);
console.log(D('  no information is carried by colour alone, but the text still has to be read'));
for (let inch = 1; inch <= INCHES; inch++) {
  const palette = paletteAtWax(waxBpAt(inch));
  const ratio = contrastRatio(palette.tallow, palette.ink);
  check(
    `inch ${inch}: tallow on ink clears WCAG AA (4.5:1)`,
    ratio >= 4.5,
    `${ratio.toFixed(2)}:1 ${swatch(palette.tallow)}${swatch(palette.ink)}`,
  );
}
{
  const palette = paletteAtWax(waxBpAt(INCHES));
  check('brass on ink clears AA at the gutter too', contrastRatio(palette.brass, palette.ink) >= 4.5, `${contrastRatio(palette.brass, palette.ink).toFixed(2)}:1`);
}

// ---------------------------------------------------------------- palette
console.log(`\n${B('Four inks, no fifth')}`);
check('the palette has exactly four inks', Object.keys(INKS).length === 4, Object.keys(INKS).join(', '));
check('the wax ladder has one rung per inch', WAX_BP.length === INCHES);

console.log(`\n${B('Side by side — the exit gate')}`);
{
  const a = paletteAtWax(waxBpAt(1));
  const b = paletteAtWax(waxBpAt(INCHES));
  console.log(`  inch 1  ${names.map(n => swatch(a[n])).join('')}   ${D(`luminance ${relativeLuminance(a.tallow).toFixed(4)}`)}`);
  console.log(`  inch 5  ${names.map(n => swatch(b[n])).join('')}   ${D(`luminance ${relativeLuminance(b.tallow).toFixed(4)}`)}`);
  console.log(D(`\n  ${(relativeLuminance(b.tallow) / relativeLuminance(a.tallow) * 100).toFixed(1)}% of the light, and 500K cooler. A stranger does not need the number.`));
}

console.log(`\n${failed === 0 ? '\x1b[32mLIGHT MODEL VERIFIED\x1b[0m' : '\x1b[31mFAILED\x1b[0m'}  ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
