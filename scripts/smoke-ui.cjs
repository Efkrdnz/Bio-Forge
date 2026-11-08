/**
 * Second browser pass: editor drag & drop, dish tools, overlays, panels and
 * an in-browser performance measurement on a dense dish.
 * Usage: node scripts/smoke-ui.cjs [baseUrl] [screenshotDir]
 */
const { chromium } = require('playwright');

const base = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.argv[3];
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = async (name) => shots && (await page.screenshot({ path: `${shots}/${name}.png` }));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  try {
    await page.goto(base + '?nowelcome');
    await page.waitForTimeout(1500);

    console.log('1. Forge: drag a part from the palette onto the cell');
    await page.click('[data-testid=tab-forge]');
    await page.click('text=New');
    await page.waitForTimeout(200);
    const n0 = await ev(() => window.__bioforgeUI().forgeDesign.components.length);
    const box = await page.locator('[data-testid=layout-editor]').boundingBox();
    await page.dragAndDrop('[data-testid=pal-flagellum]', '[data-testid=layout-editor] canvas', {
      targetPosition: { x: box.width / 2 - box.height * 0.33, y: box.height / 2 + 6 },
    });
    await page.waitForTimeout(200);
    const comps = await ev(() => window.__bioforgeUI().forgeDesign.components.map((c) => ({ t: c.type, a: c.angle, d: c.dist })));
    assert(comps.length === n0 + 1, 'part dropped onto the blueprint');
    const fl = comps.find((c) => c.t === 'flagellum');
    assert(fl && Math.abs(Math.abs(fl.a) - Math.PI) < 0.1 && fl.d === 1, 'flagellum snapped to the membrane at the back (180°)');

    console.log('2. Forge: click-add, move by dragging, delete with the keyboard');
    await page.click('[data-testid=pal-combustor]');
    await page.waitForTimeout(150);
    const before = await ev(() => { const d = window.__bioforgeUI().forgeDesign; const c = d.components.find((x) => x.type === 'combustor'); return { uid: c.uid, a: c.angle, d: c.dist }; });
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2 + 6;
    const R = Math.min(box.width, box.height) * 0.33;
    const px = cx + Math.cos(before.a) * before.d * 0.92 * R;
    const py = cy + Math.sin(before.a) * before.d * 0.92 * R;
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.move(cx + R * 0.5, cy - R * 0.1, { steps: 10 });
    await page.mouse.up();
    const after = await ev((uid) => { const c = window.__bioforgeUI().forgeDesign.components.find((x) => x.uid === uid); return { a: c.angle, d: c.dist }; }, before.uid);
    assert(Math.abs(after.a - before.a) > 0.05 || Math.abs(after.d - before.d) > 0.05, 'combustor moved by dragging');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(150);
    const gone = await ev((uid) => !window.__bioforgeUI().forgeDesign.components.some((x) => x.uid === uid), before.uid);
    assert(gone, 'selected part removed with Delete');
    await shot('ui-01-forge-edit');

    console.log('3. Dish: inoculate tool, light tool');
    await page.click('[data-testid=tab-dish]');
    await page.click('button[aria-label^="Inoculate"]');
    await page.selectOption('select[aria-label="Design to inoculate"]', 'lysin-hunter');
    const h0 = await ev(() => window.bioforge.world.cells.filter((c) => c.strain.rootId === 'lysin-hunter').length);
    await page.mouse.click(760, 470);
    await page.waitForTimeout(200);
    const h1 = await ev(() => window.bioforge.world.cells.filter((c) => c.strain.rootId === 'lysin-hunter').length);
    assert(h1 > h0, `inoculated hunters by clicking (${h1 - h0})`);
    await page.click('button[aria-label^="Place lumen"]');
    await page.mouse.click(700, 400);
    await page.waitForTimeout(100);
    assert((await ev(() => window.bioforge.world.env.lightSources.length)) === 1, 'lumen source placed');
    await page.keyboard.down('Shift');
    await page.mouse.click(705, 402);
    await page.keyboard.up('Shift');
    assert((await ev(() => window.bioforge.world.env.lightSources.length)) === 0, 'lumen source removed with shift-click');

    console.log('4. Overlays render');
    for (const o of ['Sorb', 'Lith', 'Murk', 'Heat', 'Light', 'EchoA', 'EchoB', 'Natural']) {
      await page.click(`.overlay-bar >> text=${o}`);
      await page.waitForTimeout(120);
    }
    await page.click('.overlay-bar >> text=Heat');
    await page.waitForTimeout(300);
    await shot('ui-02-heat-overlay');
    await page.click('.overlay-bar >> text=Natural');
    for (const m of ['tissue', 'health', 'strain']) await page.click(`.overlay-bar >> text=${m}`);
    assert(true, 'all field overlays and colour modes switched without errors');

    console.log('5. Environment panel controls the world');
    await page.click('.side-tabs >> text=environment');
    const slider = page.locator('input[aria-label="Base heat"]');
    await slider.fill('0.8');
    assert((await ev(() => window.bioforge.world.params.baseHeat)) === 0.8, 'base heat slider updates the live world');
    await page.selectOption('select[aria-label="Heat pattern"]', 'radial');
    assert((await ev(() => window.bioforge.world.params.heatPattern)) === 'radial', 'heat pattern select updates the live world');
    await page.click('text=Heat wave');
    assert((await ev(() => window.bioforge.world.params.baseHeat)) > 0.9, 'quick event applied');
    await slider.fill('0.5');
    await page.click('.side-tabs >> text=population');
    await page.waitForTimeout(300);
    await shot('ui-03-population');
    assert(await page.isVisible('text=Population by lineage'), 'population panel shows charts');

    console.log('6. Performance in the browser on a dense dish at 16×');
    await ev(() => {
      const e = window.bioforge;
      e.world.params.maxPopulation = 800;
      for (const d of e.allDesigns().slice(0, 8)) e.world.inoculate(d, 120, e.world.env.cx, e.world.env.cy, 450);
      e.speed = 16;
      e.running = true;
    });
    await page.waitForTimeout(2500);
    const perf = await ev(
      () =>
        new Promise((resolve) => {
          const tick0 = window.bioforge.world.tick;
          const t0 = performance.now();
          setTimeout(() => {
            const s = window.__frameStats;
            resolve({ ...s, stepMs: window.bioforge.stepMs, tps: ((window.bioforge.world.tick - tick0) * 1000) / (performance.now() - t0), cells: window.bioforge.world.cells.length });
          }, 3000);
        }),
    );
    console.log(`     ${perf.cells} cells: ${perf.fps.toFixed(0)} fps, ${perf.tps.toFixed(0)} ticks/s, render ${perf.renderMs.toFixed(1)} ms/frame, sim ${perf.stepMs.toFixed(1)} ms/tick`);
    console.log('     (fps in headless Chromium is bounded by software compositing; the assertions below measure our own work)');
    assert(perf.renderMs < 30, 'dish renderer stays under 30 ms of script per frame with a dense dish');
    assert(perf.stepMs < 9, 'simulation costs under 9 ms per tick with a dense dish');
    assert(perf.tps > 30, 'fast-forward still simulates faster than real time');
    await shot('ui-04-dense');

    assert(errors.length === 0, `no console errors (${errors.length})`);
    console.log('\nUI SMOKE TEST PASSED');
  } catch (e) {
    console.error(e.message);
    console.error('console errors:', errors.slice(0, 10));
    await shot('zz-ui-failure');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
