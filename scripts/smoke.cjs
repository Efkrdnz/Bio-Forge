/**
 * End-to-end smoke test in a real browser (Playwright + Chromium).
 * Usage: node scripts/smoke.cjs [baseUrl] [screenshotDir]
 * Plays tutorial 1 like a user, then exercises save/load, rewind, brushes,
 * the circuit editor and the lineage view. Exits non-zero on any failure or
 * console error.
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
  const world = (fn) => page.evaluate(fn);

  try {
    console.log('1. Welcome screen');
    await page.goto(base);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('[data-testid=welcome]');
    await shot('01-welcome');
    assert(true, 'welcome overlay shown on first visit');

    console.log('2. Start tutorial 1 from the welcome screen');
    await page.click('text=01 · First Spark');
    await page.waitForSelector('[data-testid=objectives]');
    assert((await world(() => window.bioforge.world.experiment.id)) === 'tut-1', 'tutorial 1 loaded');
    assert((await world(() => window.bioforge.world.cells.length)) > 0, 'broken founders inoculated');

    console.log('3. Open the blueprint in the Forge and add a Combustor');
    await page.click('text=Open blueprint in Forge →');
    await page.waitForSelector('[data-testid=layout-editor]');
    assert((await page.inputValue('input[aria-label="Design name"]')) === 'Spark Cell', 'Spark Cell blueprint opened');
    await page.click('[data-testid=pal-combustor]');
    await page.waitForTimeout(300);
    await shot('02-forge-added');
    assert(await page.isVisible('[data-testid=component-props]'), 'new component selected with properties panel');

    console.log('4. Lay a conduit with the conduit tool');
    const geo = await world(() => {
      const r = document.querySelector('[data-testid=layout-editor]').getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 + 6, R: Math.min(r.width, r.height) * 0.33 };
    });
    const pos = async (type) =>
      page.evaluate(([t, g]) => {
        // read the design from the input-driven store via the Forge's design name hook
        return null;
      }, [type, geo]);
    void pos;
    await page.click('[data-testid=conduit-tool]');
    // Pore at 60°, combustor placed in a free interior spot: find them via the rendered design in the store
    const pts = await world(() => {
      const d = window.__bioforgeUI().forgeDesign;
      const r = document.querySelector('[data-testid=layout-editor]').getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2 + 6, R = Math.min(r.width, r.height) * 0.33;
      const at = (c) => [cx + Math.cos(c.angle) * c.dist * (c.type === 'pore' ? 1 : 0.92) * R, cy + Math.sin(c.angle) * c.dist * (c.type === 'pore' ? 1 : 0.92) * R];
      const pore = d.components.find((c) => c.type === 'pore');
      const comb = d.components.find((c) => c.type === 'combustor');
      return { a: at(pore), b: at(comb), n: d.conduits.length };
    });
    await page.mouse.move(pts.a[0], pts.a[1]);
    await page.mouse.down();
    await page.mouse.move(pts.b[0], pts.b[1], { steps: 10 });
    await page.mouse.up();
    const nAfter = await world(() => window.__bioforgeUI().forgeDesign.conduits.length);
    assert(nAfter === pts.n + 1, 'conduit laid by dragging pore → combustor');
    await page.click('[data-testid=conduit-tool]');

    console.log('5. Deploy to the dish');
    await page.click('[data-testid=deploy]');
    await page.waitForSelector('[data-testid=dish-canvas]');
    const hasComb = await world(() => [...window.bioforge.world.strains.values()].some((s) => s.rootId === 'tut-spark' && s.population > 0 && s.design.components.some((c) => c.type === 'combustor')));
    assert(hasComb, 'a living tut-spark strain now has a combustor');
    await world(() => { for (let i = 0; i < 30; i++) window.bioforge.world.step(); window.bioforge.notify(); });
    await page.waitForTimeout(400);
    assert(await world(() => window.bioforge.world.goalStatus.g1?.done === true), 'goal 1 (add combustor) completed');
    await world(() => { for (let i = 0; i < 2500; i++) window.bioforge.world.step(); window.bioforge.notify(); });
    await page.waitForTimeout(500);
    await shot('03-tutorial-progress');
    assert(await world(() => window.bioforge.world.goalStatus.g2?.done === true), 'goal 2 (colony of 20) completed');

    console.log('6. Inspect a cell');
    await world(() => {
      const w = window.bioforge.world;
      const c = w.cells.find((x) => x.strain.rootId === 'tut-spark');
      window.bioforgeCam.flyTo(c.x, c.y, 3);
      window.__target = c.id;
    });
    await page.waitForTimeout(1200);
    await world(() => {
      const w = window.bioforge.world;
      const c = w.cellById(window.__target) ?? w.cells[0];
      window.__target = c.id;
      const [sx, sy] = window.bioforgeCam.toScreen(c.x, c.y);
      const r = document.querySelector('[data-testid=dish-canvas]').getBoundingClientRect();
      window.__pt = [r.left + sx, r.top + sy];
    });
    const pt = await world(() => window.__pt);
    await page.keyboard.press('Space'); // pause so the cell stays put
    await page.mouse.click(pt[0], pt[1]);
    await page.waitForSelector('[data-testid=inspector]', { timeout: 3000 });
    await shot('04-inspector');
    assert(true, 'inspector opened for clicked cell');
    await page.keyboard.press('Space');

    console.log('7. Brush nutrients and check the ledger');
    const inBefore = await world(() => window.bioforge.world.ledger.matterIn);
    await page.click('button[aria-label^="Nutrient brush"]');
    await page.mouse.move(800, 480);
    await page.mouse.down();
    await page.mouse.move(840, 500, { steps: 8 });
    await page.waitForTimeout(400);
    await page.mouse.up();
    const inAfter = await world(() => window.bioforge.world.ledger.matterIn);
    assert(inAfter > inBefore, 'sorb brush adds matter and is recorded in the ledger');
    const drift = await world(() => Math.abs(window.bioforge.world.matterError()) / window.bioforge.world.totalMatter());
    assert(drift < 1e-4, `matter ledger balanced (relative drift ${drift.toExponential(1)})`);
    await page.click('button[aria-label^="Inspect"]');

    console.log('8. Timeline: bookmark and rewind');
    await page.click('button[title="Bookmark this moment"]');
    const t1 = await world(() => window.bioforge.timeline.filter((e) => e.bookmark).pop().tick);
    await world(() => { for (let i = 0; i < 400; i++) window.bioforge.stepOnce(); window.bioforge.notify(); });
    await page.waitForTimeout(300);
    await page.click('.scrub .mark.bm');
    await page.waitForTimeout(300);
    const t2 = await world(() => window.bioforge.world.tick);
    assert(t2 === t1, `rewound to bookmark (tick ${t2})`);

    console.log('9. Save & load a world slot');
    await page.click('[data-testid=tab-lab]');
    await page.fill('input[placeholder^="Dish @"]', 'smoke save');
    await page.click('[data-testid=save-slot]');
    await page.waitForSelector('text=smoke save');
    const savedSlot = await world(() => window.bioforge.slots()[0]);
    await world(() => { for (let i = 0; i < 300; i++) window.bioforge.world.step(); });
    await page.click('text=Load');
    await page.waitForTimeout(400);
    const tick3 = await world(() => window.bioforge.world.tick);
    const cells3 = await world(() => window.bioforge.world.cells.length);
    assert(tick3 === savedSlot.tick && cells3 === savedSlot.cells, `save slot restores tick ${tick3} and population ${cells3}`);

    console.log('10. Circuit editor wiring');
    await page.click('[data-testid=tab-forge]');
    await world(() => 0);
    await page.selectOption('select[aria-label="Load design"]', 'chemo-glider');
    await page.click('[data-testid=forge-tab-circuit]');
    await page.waitForSelector('[data-testid=circuit-editor]');
    const wires0 = await world(() => 0);
    void wires0;
    await page.click('.node-palette >> text=Clock');
    await page.waitForTimeout(200);
    await shot('05-circuit');
    assert(await page.isVisible('.node-props'), 'new circuit node created and selected');

    console.log('11. Development tab & lineage view');
    await page.click('[data-testid=forge-tab-development]');
    await page.click('text=Multicellular (bonded)');
    await page.waitForTimeout(200);
    await shot('06-development');
    await page.click('[data-testid=tab-lineage]');
    await page.waitForSelector('[data-testid=lineage-tree]');
    await shot('07-lineage');
    assert(true, 'lineage view rendered');

    console.log('12. Run another preset from the experiments browser');
    await page.click('[data-testid=tab-lab]');
    await page.click('[data-testid=run-exp-colonial]');
    await world(() => { for (let i = 0; i < 1500; i++) window.bioforge.world.step(); window.bioforge.notify(); });
    await page.waitForTimeout(800);
    await shot('08-colonial');
    assert((await world(() => window.bioforge.world.organisms.size)) > 0, 'multicellular organisms formed in Colonial Life');

    assert(errors.length === 0, `no console errors (${errors.length})`);
    console.log('\nSMOKE TEST PASSED');
  } catch (e) {
    console.error(e.message);
    console.error('console errors:', errors.slice(0, 10));
    await shot('zz-failure');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
