// Usage: node scripts/shot.mjs <outdir> [actions json]
const { chromium } = require('playwright');
(async () => {
const out = process.argv[2] ?? 'shots';
const url = process.argv[3] ?? 'http://localhost:5173/?nowelcome';
const steps = JSON.parse(process.argv[4] ?? '[]');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForTimeout(2500);
let i = 0;
for (const s of steps) {
  if (s.click) await page.click(s.click);
  if (s.eval) await page.evaluate(s.eval);
  if (s.key) await page.keyboard.press(s.key);
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.mouse) { await page.mouse.move(s.mouse[0], s.mouse[1]); if (s.down) { await page.mouse.down(); await page.mouse.move(s.mouse[0]+5, s.mouse[1]+5); await page.mouse.up(); } }
  if (s.wheel) { await page.mouse.move(s.wheel[0], s.wheel[1]); await page.mouse.wheel(0, s.wheel[2]); }
  if (s.shot) await page.screenshot({ path: `${out}/${s.shot}.png` });
  i++;
}
if (!steps.some((s) => s.shot)) await page.screenshot({ path: `${out}/main.png` });
console.log('errors:', JSON.stringify(errors.slice(0, 10)));
await browser.close();
})();
