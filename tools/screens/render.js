// Renders screens.html into the screenshot images used on the landing page.
// Usage: node tools/screens/render.js   (needs Playwright + Chromium, and Python with Pillow for WebP)
const { chromium } = require('playwright');
const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');

const out = path.join(__dirname, '..', '..', 'public', 'assets', 'screens');
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'somod-screens-'));
const src = 'file://' + path.join(__dirname, 'screens.html');
const shots = [
  { s: 'admin', sel: '.desk', scale: 1.5 },
  { s: 'vendor', sel: '.vdesk', scale: 1.5 },
  { s: 'owner', sel: '.device', scale: 2, transparent: true },
  { s: 'tech', sel: '.device', scale: 2, transparent: true },
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const lang of ['ar', 'en']) {
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: shot.scale });
      await page.goto(`${src}?s=${shot.s}&lang=${lang}`);
      await page.evaluate(() => document.fonts.ready);
      const png = path.join(tmp, `${shot.s}-${lang}.png`);
      await page.locator(`#${shot.s} ${shot.sel}`).screenshot({ path: png, omitBackground: !!shot.transparent });
      await page.close();
      const webp = path.join(out, `${shot.s}-${lang}.webp`);
      execFileSync('python3', ['-I', '-c', 'import sys;from PIL import Image;Image.open(sys.argv[1]).save(sys.argv[2],"WEBP",quality=86,method=6)', png, webp]);
      console.log(`${shot.s}-${lang}.webp`, Math.round(fs.statSync(webp).size / 1024) + ' KB');
    }
  }
  await browser.close();
})();
