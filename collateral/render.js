/* Renders out/pricing.html to the finished plates.
   Chromium is the one already on this machine — never download another. */
const { chromium } = require('playwright');
const path = require('path');

const OUT = path.join(__dirname, 'out');
const SRC = 'file://' + path.join(OUT, 'pricing.html');
const CHROME = '/opt/pw-browsers/chromium';

/* 2x everywhere: the slide lands at 4K, the A4 at roughly 200 dpi. */
const SCALE = 2;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  const shoot = async (sel, w, h, file) => {
    const page = await browser.newPage({
      viewport: { width: w, height: h },
      deviceScaleFactor: SCALE
    });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(SRC, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);

    /* Anything spilling its plate is a layout bug, not a crop to accept.
       A flex column with margin-top:auto does not report scrollHeight
       honestly, so measure the last element's bottom against the plate's. */
    const over = await page.evaluate(s => {
      const inner = document.querySelector(s).querySelector('.board__in');
      const last = inner.lastElementChild;
      return Math.ceil(
        last.getBoundingClientRect().bottom - inner.getBoundingClientRect().bottom
      );
    }, sel);

    await page.locator(sel).screenshot({ path: path.join(OUT, file) });
    await page.close();

    console.log(
      `  → ${file}  ${w * SCALE}×${h * SCALE}` +
      (over > 0 ? `   ⚠ overflows by ${over}px` : '   fits') +
      (errors.length ? `   ⚠ ${errors.join('; ')}` : '')
    );
  };

  await shoot('#slide', 1920, 1080, 'naught-to-ten-pricing-slide.png');
  await shoot('#a4', 794, 1123, 'naught-to-ten-pricing-a4.png');

  /* A4 as vector text, for emailing and printing. */
  const page = await browser.newPage();
  await page.goto(SRC, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: path.join(OUT, 'naught-to-ten-pricing.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' }
  });
  console.log('  → naught-to-ten-pricing.pdf  A4 portrait, vector text');

  await browser.close();
})();
