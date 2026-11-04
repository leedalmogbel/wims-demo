// Smoke test. BASE env var picks the target. Fails with exit 1 on any failed check or JS error.
const { chromium } = require('/home/leed/projects/walkabout/node_modules/@playwright/test');
const BASE = process.env.BASE || 'http://100.82.196.73:4805/';
const OUT = __dirname + '/shots/';
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`); if (!ok) failed++; };

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await browser_();
  async function browser_() { return chromium.launch(); }
  const errors = [];
  const open = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror ' + page.url() + ' ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console ' + page.url() + ' ' + m.text()); });
    return page;
  };
  const helpers = page => ({
    go: async h => { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(120); },
    sub: async () => (await page.textContent('.head p')).replace(/\s+/g, ' ').trim(),
    sign: async sel => { const b = await page.locator(sel).boundingBox(); await page.mouse.move(b.x + 20, b.y + 50); await page.mouse.down();
      for (let i = 0; i < 30; i++) await page.mouse.move(b.x + 20 + i * 7, b.y + 50 + Math.sin(i) * 20); await page.mouse.up(); },
    cont: async () => { await page.click('.guide .go'); await page.waitForTimeout(150); },
    count: async () => (await page.textContent('.guide .count')).trim(),
  });

  // ---- Guide by hand, one order start to finish
  let page = await open(); let h = helpers(page);
  await page.goto(BASE); await page.waitForTimeout(200);
  check('first visit opens the welcome screen', (await page.textContent('h1')).includes('booking to return'));
  check('welcome lists 6 steps', (await page.locator('.w-steps li').count()) === 6);
  await page.screenshot({ path: OUT + 'welcome.png', fullPage: true });
  await page.click('[data-act="start-guide"]'); await page.waitForTimeout(150);
  check('guide starts on Set up', (await h.count()) === 'Step 1 of 6' && page.url().includes('/setup'));
  check('future steps cannot be clicked', (await page.locator('.chip[aria-disabled]').count()) === 5);
  await page.screenshot({ path: OUT + 'guide_setup.png', fullPage: true });
  await page.fill('[data-company]', 'Mabuhay Event Rentals');
  await page.click('[data-act="finish-setup"]'); await page.waitForTimeout(100);
  check('company name carries through', (await page.textContent('.brand small')).includes('Mabuhay'));
  await h.cont();
  check('Book step opens the order form as Staff', page.url().includes('/orders/new') && (await h.count()) === 'Step 2 of 6');
  check('double-booking blocks Save on Nov 8', !(await page.isEnabled('[data-act="save-order"]')));
  const clash = (await page.locator('.avail').first().textContent()).replace(/\s+/g, ' ').trim();
  check('form names the orders holding the stock', clash.includes('ORD-1042') && clash.includes('ORD-1045'), clash);
  await page.screenshot({ path: OUT + 'guide_book_clash.png', fullPage: true });
  await page.fill('[data-k="date"]', '2026-11-14'); await page.dispatchEvent('[data-k="date"]', 'change'); await page.waitForTimeout(80);
  await page.fill('[data-k="ret"]', '2026-11-15'); await page.dispatchEvent('[data-k="ret"]', 'change'); await page.waitForTimeout(80);
  check('a free date unlocks Save', await page.isEnabled('[data-act="save-order"]'));
  await page.click('[data-act="save-order"]'); await page.waitForTimeout(150);
  const orderId = page.url().match(/ORD-\d+/)[0];
  await h.cont();
  check('Check step opens that same order', page.url().includes('/release/' + orderId));
  check('submit is locked before ticking', !(await page.isEnabled('[data-act="submit-check"]')));
  const ticks = await page.locator('[data-tick]').count();
  for (let i = 0; i < ticks; i++) { await page.locator('[data-tick]').nth(i).click(); await page.waitForTimeout(40); }
  check('ticking by hand on a role-switched link works', await page.isEnabled('[data-act="submit-check"]'), ticks + ' lines');
  await page.click('[data-act="submit-check"]'); await page.waitForTimeout(150);
  await h.cont();
  check('Approve step opens the same order as Supervisor', page.url().includes('/approve/' + orderId) && (await page.textContent('.me b')).includes('Rico'));
  await page.screenshot({ path: OUT + 'guide_approve.png', fullPage: true });
  await page.fill('#back-reason', 'Recount the chairs.'); await page.click('[data-act="send-back"]'); await page.waitForTimeout(150);
  check('send back returns the guide to Check', (await h.count()) === 'Step 3 of 6');
  await h.cont();
  for (let i = 0; i < ticks; i++) { await page.locator('[data-tick]').nth(i).click(); await page.waitForTimeout(40); }
  await page.click('[data-act="submit-check"]'); await page.waitForTimeout(150); await h.cont();
  await page.click('[data-act="approve-order"]'); await page.waitForTimeout(150); await h.cont();
  check('Hand over step is the same order', page.url().includes('/sign/' + orderId) && (await h.count()) === 'Step 5 of 6');
  await h.sign('#sig'); await page.click('#sig-ok'); await page.waitForTimeout(150);
  check('clearance shows the new company name', (await page.textContent('.clearance-doc')).toUpperCase().includes('MABUHAY'));
  await h.cont();
  check('Return step is the same order', page.url().includes('/return/' + orderId));
  await page.fill('[data-ret="back"][data-k="L0"]', '447'); await page.dispatchEvent('[data-ret="back"][data-k="L0"]', 'change'); await page.waitForTimeout(100);
  check('shortfall is flagged', (await page.textContent('.note.bad')).includes('3 × Tiffany'));
  await page.click('[data-act="finish-return"]'); await page.waitForTimeout(150);
  await h.cont();
  check('guide ends on the summary', page.url().includes('/done'));
  const rec = await page.textContent('.feed');
  check('summary has the whole record', ['Checked by Maria', 'Approved by Rico', 'Signed for', 'report'].every(x => rec.includes(x)));
  await page.screenshot({ path: OUT + 'guide_done.png', fullPage: true });
  await page.context().close();

  // ---- Guide with "Do this step for me"
  page = await open(); h = helpers(page);
  await page.goto(BASE); await page.click('[data-act="start-guide"]'); await page.waitForTimeout(100);
  for (let i = 0; i < 6; i++) { await page.click('[data-act="do-step"]'); await page.waitForTimeout(150); await h.cont(); }
  check('"Do this step for me" finishes all 6 steps', page.url().includes('/done') && (await page.textContent('h1')).includes('whole flow'));
  await page.context().close();

  // ---- Leaving the guide's page, wrong role, exit
  page = await open(); h = helpers(page);
  await page.goto(BASE); await page.click('[data-act="start-guide"]'); await page.waitForTimeout(100);
  await h.go('#/inventory'); check('wandering off offers a way back', (await page.textContent('.guide .go')).includes('Continue to Set up'));
  await page.click('[data-act="hide-guide"]'); await page.waitForTimeout(80);
  check('exit removes the guide and leaves a way back', (await page.locator('.guide').count()) === 0 && (await page.locator('.side-foot a').count()) === 1);
  await page.context().close();

  // ---- Date-based stock
  page = await open(); h = helpers(page);
  await page.goto(BASE + '#/orders/new'); await page.waitForTimeout(150);
  const setDates = async (a, b) => { await page.fill('[data-k="ret"]', b); await page.dispatchEvent('[data-k="ret"]', 'change'); await page.waitForTimeout(60); await page.fill('[data-k="date"]', a); await page.dispatchEvent('[data-k="date"]', 'change'); await page.waitForTimeout(60); };
  const free = async () => parseInt((await page.locator('.avail').first().textContent()).replace(/[^\d]+/, '').replace(/,/g, ''), 10);
  await setDates('2026-11-14', '2026-11-15'); const fA = await free();
  await setDates('2026-11-08', '2026-11-09'); const fB = await free();
  check('same chairs show fewer free on a busy date', fB < fA, `Nov 14: ${fA}, Nov 8: ${fB}`);
  await setDates('2026-11-09', '2026-11-08');
  check('return before pickup blocks Save', !(await page.isEnabled('[data-act="save-order"]')));
  await setDates('2026-11-14', '2026-11-15');
  await page.fill('[data-line="0"][data-k="qty"]', '500'); await page.dispatchEvent('[data-line="0"][data-k="qty"]', 'change'); await page.waitForTimeout(80);
  await page.click('[data-act="save-order"]'); await page.waitForTimeout(150);
  await h.go('#/orders/new'); await setDates('2026-11-14', '2026-11-15');
  check('a saved order reduces what is free', (await free()) === fA - 500, `now ${await free()}`);
  await page.fill('[data-line="0"][data-k="qty"]', String(fA)); await page.dispatchEvent('[data-line="0"][data-k="qty"]', 'change'); await page.waitForTimeout(80);
  check('booking the same chairs twice is blocked', !(await page.isEnabled('[data-act="save-order"]')));
  check('it suggests the next dates that fit', (await page.locator('[data-act="use-dates"]').count()) === 1);
  await page.click('[data-act="use-dates"]'); await page.waitForTimeout(80);
  check('the suggested dates work', await page.isEnabled('[data-act="save-order"]'));
  await h.go('#/calendar'); await page.screenshot({ path: OUT + 'calendar.png', fullPage: true });
  check('calendar shows 14 days', (await page.locator('.cal tr').first().locator('th').count()) === 15);
  await page.context().close();

  // ---- Other flows
  page = await open(); h = helpers(page);
  await page.goto(BASE + '#/dashboard'); await page.waitForTimeout(150);
  await h.go('#/release/ORD-1045?as=staff');
  await page.locator('[data-cond]').first().selectOption('minor'); await page.waitForTimeout(40);
  for (let i = 0; i < 3; i++) { await page.click('[data-act="scan"]'); await page.waitForTimeout(70); }
  await page.click('[data-act="submit-check"]'); await page.waitForTimeout(150);
  await h.go('#/sign/ORD-1045?as=staff'); check('customer cannot sign before approval', (await page.locator('#sig').count()) === 0);
  await h.go('#/approve/ORD-1045?as=staff'); check('staff cannot approve', (await page.locator('[data-act="approve-order"]').count()) === 0);
  await h.go('#/approve/ORD-1042?as=supervisor'); await page.click('[data-act="approve-order"]'); await page.waitForTimeout(150);
  await page.click('[data-act="dispatch"]'); await page.waitForTimeout(150);
  check('delivery dispatches', (await h.sub()).includes('In Transit'));
  await h.go('#/sign/ORD-1042?as=supervisor'); await h.sign('#sig'); await page.click('#sig-ok'); await page.waitForTimeout(150);
  await h.go('#/order/ORD-1042'); check('receiver signing marks Delivered', (await h.sub()).includes('Delivered'));
  await h.go('#/return/ORD-1037?as=admin'); await page.selectOption('[data-unit="TNT-1020-013"]', 'damaged'); await page.waitForTimeout(80);
  await page.click('[data-act="finish-return"]'); await page.waitForTimeout(150);
  check('return files a report', (await h.sub()).includes('discrepancy'));
  await h.go('#/phone'); await page.click('button[data-act="phone-scan"]'); await page.waitForTimeout(80); await h.sign('#p-sig'); await page.click('#p-sig-ok'); await page.waitForTimeout(120);
  check('phone signing works', (await page.textContent('.phones')).includes('Signed and delivered'));
  await h.go('#/dashboard?as=staff'); check('staff menu hides admin pages', !(await page.locator('.nav').textContent()).includes('Settings'));
  await h.go('#/reports'); check('staff blocked from reports', (await page.textContent('h1')).includes('Admin only'));
  await page.context().close();

  // ---- Every page, on desktop and at phone width
  const routes = ['#/welcome', '#/setup?as=admin', '#/dashboard?as=admin', '#/orders', '#/orders/new', '#/calendar', '#/order/ORD-1045', '#/release/ORD-1045?as=staff', '#/approvals?as=supervisor', '#/approve/ORD-1042?as=supervisor', '#/order/ORD-1039', '#/sign/ORD-1039?as=staff', '#/clearance/ORD-1040?as=admin', '#/return/ORD-1037', '#/order/ORD-1036', '#/damage', '#/damage/DMG-0092', '#/damage/DMG-0089', '#/item/TNT-1020/TNT-1020-007', '#/item/CHR-TIF-WHT', '#/inventory', '#/labels', '#/phone', '#/adjustments', '#/reports', '#/settings', '#/warehouses', '#/categories', '#/notifications', '#/done'];
  page = await open(); h = helpers(page); await page.goto(BASE); let blank = [];
  for (const r of routes) { await h.go(r); if (!(await page.locator('h1').count())) blank.push(r); }
  check('all pages render on desktop', !blank.length, blank.join(' '));
  await page.context().close();

  page = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); h = helpers(page);
  await page.goto(BASE); await page.waitForTimeout(150);
  const wide = [];
  for (const r of routes) { await h.go(r); const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); if (w[0] > w[1] + 1) wide.push(`${r} ${w[0]}`); }
  check('no page is wider than a 390px phone', !wide.length, wide.join(', '));
  await page.evaluate(() => { location.hash = '#/welcome'; }); await page.waitForTimeout(100);
  await page.tap('[data-act="start-guide"]'); await page.waitForTimeout(120);
  for (const [n, act] of [['setup', 0], ['book', 0], ['check', 0], ['approve', 0], ['handover', 0], ['return', 0]]) { await page.screenshot({ path: OUT + `phone_guide_${n}.png` }); await page.tap('[data-act="do-step"]'); await page.waitForTimeout(150); await page.tap('.guide .go'); await page.waitForTimeout(150); }
  check('guide completes on a phone with taps', page.url().includes('/done'));
  await page.screenshot({ path: OUT + 'phone_done.png', fullPage: true });
  await h.go('#/dashboard?as=admin'); await page.tap('.menu-btn'); await page.waitForTimeout(280);
  check('phone menu opens', await page.evaluate(() => document.querySelector('.side').getBoundingClientRect().left >= 0));
  await page.screenshot({ path: OUT + 'phone_menu.png' });
  await page.tap('.nav a[href="#/inventory"]'); await page.waitForTimeout(280);
  check('menu closes after choosing a page', await page.evaluate(() => document.querySelector('.side').getBoundingClientRect().right <= 0));
  await page.screenshot({ path: OUT + 'phone_inventory.png' });
  await h.go('#/release/ORD-1045?as=staff'); await page.screenshot({ path: OUT + 'phone_checklist.png', fullPage: true });
  await h.go('#/return/ORD-1037?as=staff'); await page.screenshot({ path: OUT + 'phone_return.png', fullPage: true });
  check('return boxes are labelled on a phone', (await page.locator('.ret-f span:visible').allTextContents()).slice(0, 3).join() === 'Returned,Damaged,For repair');
  check('hidden menu casts no shadow on a phone', await page.evaluate(() => getComputedStyle(document.querySelector('.side')).boxShadow === 'none'));
  await page.context().close();

  check('no JavaScript errors', !errors.length, errors.slice(0, 5).join(' | '));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message.split('\n').slice(0, 4).join(' ')); process.exit(2); });
