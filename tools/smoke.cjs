// Smoke test: visit every page, run the main flows, collect JS errors, take screenshots.
const { chromium } = require('/home/leed/projects/walkabout/node_modules/@playwright/test');
const BASE = 'http://100.82.196.73:4805/';
const OUT = __dirname + '/shots/';

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror ' + page.url() + ' ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console ' + page.url() + ' ' + m.text()); });

  const routes = ['#/dashboard', '#/orders', '#/orders/new', '#/order/ORD-1039', '#/release/ORD-1039', '#/clearance/ORD-1040',
    '#/return/ORD-1037', '#/order/ORD-1036', '#/damage/DMG-0092', '#/damage/DMG-0089', '#/item/TNT-1020/TNT-1020-007', '#/item/CHR-TIF-WHT',
    '#/inventory', '#/labels', '#/phone', '#/adjustments', '#/reports', '#/settings', '#/warehouses', '#/categories', '#/notifications', '#/damage'];
  await page.goto(BASE + '#/dashboard');
  for (const r of routes) {
    await page.evaluate(h => { location.hash = h; }, r);
    await page.waitForTimeout(150);
    const h1 = await page.textContent('h1').catch(() => '(no h1)');
    console.log(r.padEnd(32), '|', h1.trim());
  }
  for (const r of ['#/dashboard', '#/release/ORD-1039', '#/return/ORD-1037', '#/damage/DMG-0092', '#/item/TNT-1020/TNT-1020-007', '#/labels', '#/phone', '#/clearance/ORD-1040', '#/reports', '#/orders/new']) {
    await page.evaluate(h => { location.hash = h; }, r); await page.waitForTimeout(250);
    await page.screenshot({ path: OUT + r.replace(/[#/]+/g, '_').replace(/^_/, '') + '.png', fullPage: true });
  }

  // Flow: pickup release -> sign -> clearance
  await page.evaluate(() => { location.hash = '#/release/ORD-1039'; });
  for (let i = 0; i < 5; i++) { await page.click('[data-act="scan"]'); await page.waitForTimeout(80); }
  console.log('release progress:', (await page.textContent('.card-h .sub')).trim());
  await page.click('a[href="#/sign/ORD-1039"]');
  await page.waitForSelector('#sig');
  const box = await page.locator('#sig').boundingBox();
  await page.mouse.move(box.x + 20, box.y + 60); await page.mouse.down();
  for (let i = 0; i < 30; i++) await page.mouse.move(box.x + 20 + i * 8, box.y + 60 + Math.sin(i) * 25);
  await page.mouse.up();
  console.log('sign enabled:', await page.isEnabled('#sig-ok'));
  await page.click('#sig-ok'); await page.waitForTimeout(200);
  console.log('after sign:', page.url(), (await page.textContent('h2')).trim());
  await page.screenshot({ path: OUT + 'flow_clearance_signed.png', fullPage: true });

  // Flow: return with a shortfall
  await page.evaluate(() => { location.hash = '#/return/ORD-1037'; }); await page.waitForTimeout(150);
  await page.fill('[data-ret="back"][data-k="L0"]', '197'); await page.dispatchEvent('[data-ret="back"][data-k="L0"]', 'change');
  await page.selectOption('[data-unit="TNT-1020-013"]', 'damaged');
  await page.waitForTimeout(100);
  console.log('return flags:', (await page.textContent('.note.bad')).replace(/\s+/g, ' ').trim());
  await page.screenshot({ path: OUT + 'flow_return_flags.png', fullPage: true });
  await page.click('[data-act="finish-return"]'); await page.waitForTimeout(200);
  console.log('after return:', page.url(), (await page.textContent('.head p')).replace(/\s+/g, ' ').trim());

  // Flow: new order with a shortfall, then save a valid one
  await page.evaluate(() => { location.hash = '#/orders/new'; }); await page.waitForTimeout(150);
  await page.fill('[data-line="0"][data-k="qty"]', '9999'); await page.dispatchEvent('[data-line="0"][data-k="qty"]', 'change'); await page.waitForTimeout(100);
  console.log('save disabled on shortfall:', !(await page.isEnabled('[data-act="save-order"]')));
  await page.fill('[data-line="0"][data-k="qty"]', '50'); await page.dispatchEvent('[data-line="0"][data-k="qty"]', 'change'); await page.waitForTimeout(100);
  await page.click('[data-act="save-order"]'); await page.waitForTimeout(200);
  console.log('new order:', page.url());

  // Delivery: dispatch then sign on site
  await page.evaluate(() => { location.hash = '#/release/ORD-1042'; });
  for (let i = 0; i < 8; i++) { await page.click('[data-act="scan"]'); await page.waitForTimeout(40); }
  await page.click('[data-act="dispatch"]'); await page.waitForTimeout(150);
  console.log('after dispatch:', page.url(), (await page.textContent('.head p')).replace(/\s+/g, ' ').trim());

  // Phone: scan + sign
  await page.evaluate(() => { location.hash = '#/phone'; }); await page.waitForTimeout(150);
  await page.click('button[data-act="phone-scan"]'); await page.waitForTimeout(100);
  const pb = await page.locator('#p-sig').boundingBox();
  await page.mouse.move(pb.x + 10, pb.y + 40); await page.mouse.down();
  for (let i = 0; i < 25; i++) await page.mouse.move(pb.x + 10 + i * 8, pb.y + 40 + Math.cos(i) * 18);
  await page.mouse.up(); await page.click('#p-sig-ok'); await page.waitForTimeout(150);
  await page.screenshot({ path: OUT + 'flow_phone_done.png', fullPage: true });

  // Staff view
  await page.evaluate(() => { location.hash = '#/dashboard'; }); await page.waitForTimeout(100);
  await page.click('[data-role="staff"]'); await page.waitForTimeout(150);
  console.log('staff nav:', (await page.locator('.nav a').allTextContents()).map(s => s.trim()).join(', '));
  await page.evaluate(() => { location.hash = '#/reports'; }); await page.waitForTimeout(100);
  console.log('staff on reports:', (await page.textContent('h1')).trim());

  console.log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  await browser.close();
})();
