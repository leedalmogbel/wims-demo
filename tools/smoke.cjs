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

  const routes = ['#/dashboard', '#/orders', '#/orders/new', '#/order/ORD-1045', '#/release/ORD-1045', '#/approvals', '#/approve/ORD-1042', '#/order/ORD-1039', '#/clearance/ORD-1040',
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

  const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(150); };
  const sub = async () => (await page.textContent('.head p')).replace(/\s+/g, ' ').trim();
  const sign = async sel => { const box = await page.locator(sel).boundingBox(); await page.mouse.move(box.x + 20, box.y + 50); await page.mouse.down();
    for (let i = 0; i < 30; i++) await page.mouse.move(box.x + 20 + i * 7, box.y + 50 + Math.sin(i) * 20); await page.mouse.up(); };

  // Flow: staff checklist -> supervisor approves -> customer signs
  await go('#/release/ORD-1045?as=staff');
  console.log('submit locked before checklist:', !(await page.isEnabled('[data-act="submit-check"]')));
  for (let i = 0; i < 3; i++) { await page.click('[data-act="scan"]'); await page.waitForTimeout(80); }
  await page.fill('#chk-note', 'All good');
  await page.click('[data-act="submit-check"]'); await page.waitForTimeout(200);
  console.log('after submit:', await sub());
  await go('#/sign/ORD-1045?as=staff'); console.log('sign before approval blocked:', (await page.textContent('.note')).trim().slice(0, 60));
  await go('#/approve/ORD-1045?as=staff'); console.log('staff cannot approve:', (await page.locator('[data-act="approve-order"]').count()) === 0);
  await go('#/approvals?as=supervisor'); console.log('supervisor queue:', (await page.locator('a[href^="#/approve/"]').allTextContents()).join(', '));
  await go('#/approve/ORD-1045?as=supervisor'); await page.click('[data-act="approve-order"]'); await page.waitForTimeout(200);
  console.log('after approve:', await sub());
  await go('#/sign/ORD-1045?as=staff'); await sign('#sig');
  await page.click('#sig-ok'); await page.waitForTimeout(200);
  console.log('after sign:', page.url(), (await page.textContent('h2')).trim());
  await page.screenshot({ path: OUT + 'flow_clearance_signed.png', fullPage: true });

  // Flow: supervisor sends back, staff resubmits, supervisor approves, dispatch
  await go('#/approve/ORD-1042?as=supervisor');
  await page.screenshot({ path: OUT + 'flow_approve_review.png', fullPage: true });
  await page.click('[data-act="send-back"]'); await page.waitForTimeout(100);
  console.log('send back needs reason, still on:', page.url().split('#')[1]);
  await page.fill('#back-reason', 'Swap the scratched round table for a good one.');
  await page.click('[data-act="send-back"]'); await page.waitForTimeout(200);
  console.log('after send back:', await sub());
  await go('#/dashboard?as=staff'); await page.screenshot({ path: OUT + 'flow_staff_dashboard.png', fullPage: true });
  await go('#/release/ORD-1042?as=staff');
  for (let i = 0; i < 6; i++) { await page.click('[data-act="scan"]'); await page.waitForTimeout(60); }
  await page.click('[data-act="submit-check"]'); await page.waitForTimeout(200);
  await go('#/approve/ORD-1042?as=supervisor'); await page.click('[data-act="approve-order"]'); await page.waitForTimeout(200);
  console.log('after re-approve:', await sub());
  await page.click('[data-act="dispatch"]'); await page.waitForTimeout(200);
  console.log('after dispatch:', await sub());
  await page.screenshot({ path: OUT + 'flow_order_after_dispatch.png', fullPage: true });

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
  await page.click('[data-role="staff"]'); await page.waitForTimeout(250);
  console.log('staff nav:', (await page.locator('.nav a').allTextContents()).map(s => s.trim()).join(', '));
  await page.evaluate(() => { location.hash = '#/reports'; }); await page.waitForTimeout(100);
  console.log('staff on reports:', (await page.textContent('h1')).trim());
  await go('#/dashboard?as=supervisor'); console.log('supervisor nav:', (await page.locator('.nav a').allTextContents()).map(s => s.trim()).join(', '));
  await go('#/settings?as=admin'); await page.click('[data-stab="roles"]'); await page.waitForTimeout(100);
  await page.screenshot({ path: OUT + 'roles.png', fullPage: true });

  console.log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  await browser.close();
})();
