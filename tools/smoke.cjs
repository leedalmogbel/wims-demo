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
    roles: async () => { await page.evaluate(() => { location.hash = '#/settings?as=admin&tab=package'; }); await page.waitForTimeout(120); await page.click('[data-act="toggle-roles"]'); await page.waitForTimeout(120); },
  });

  // ---- Guide by hand, one order start to finish
  let page = await open(); let h = helpers(page);
  await page.goto(BASE); await page.waitForTimeout(200);
  check('first visit opens the welcome screen', (await page.textContent('h1')).includes('booking to return'));
  check('Package A welcome lists 5 steps, no Approve', (await page.locator('.w-steps li').count()) === 5 && !(await page.textContent('.w-steps')).includes('Approve'));
  await h.roles(); await h.go('#/welcome');
  check('roles add-on brings back 6 steps', (await page.locator('.w-steps li').count()) === 6);
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
  check('Package A guide has 5 steps', (await h.count()) === 'Step 1 of 5' && (await page.locator('.chip').count()) === 5);
  check('Package A has no role switch', (await page.locator('.role-switch').count()) === 0);
  for (let i = 0; i < 5; i++) { await page.click('[data-act="do-step"]'); await page.waitForTimeout(150); await h.cont(); }
  check('"Do this step for me" finishes all 5 steps', page.url().includes('/done') && (await page.textContent('h1')).includes('whole flow'));
  await page.context().close();

  // ---- Package A by hand: checklist goes straight to ready, one level of access, 3 accounts
  page = await open(); h = helpers(page); page.on('dialog', d => d.accept());
  await page.goto(BASE + '#/release/ORD-1045'); await page.waitForTimeout(150);
  for (let i = 0; i < 3; i++) { await page.click('[data-act="scan"]'); await page.waitForTimeout(70); }
  check('Package A checklist has no approval step', (await page.textContent('[data-act="submit-check"]')).includes('Mark ready for pickup'));
  await page.click('[data-act="submit-check"]'); await page.waitForTimeout(150);
  check('checklist makes the order ready', (await h.sub()).includes('Ready for Pickup'));
  check('timeline has no approval step', !(await page.textContent('.timeline')).includes('For Approval'));
  await h.go('#/orders'); check('no order waits for approval', !(await page.textContent('.page')).includes('For Approval'));
  check('menu has no approvals', !(await page.locator('.nav').textContent()).includes('Approvals'));
  await h.go('#/dashboard'); check('dashboard has nothing waiting for approval', !/waiting for/i.test(await page.textContent('.page')));
  await h.go('#/adjustments'); check('no pending adjustments', !(await page.textContent('.page')).includes('Pending approval'));
  await h.go('#/approve/ORD-1042'); check('approve page explains the add-on', (await page.textContent('.page')).includes('add-on'));
  await h.go('#/clearance/ORD-1038'); check('clearance has no approver', !(await page.textContent('.clearance-doc')).includes('Approved by'));
  await h.go('#/settings?as=admin&tab=users'); check('users show 3 of 3 with full access', (await page.textContent('.page')).includes('3 of 3') && !(await page.textContent('.page')).includes('Rico'));
  await page.click('[data-act="add-user"]'); await page.waitForTimeout(80); check('a 4th account is blocked', (await page.textContent('.modal')).includes('up to 3'));
  await page.screenshot({ path: OUT + 'users_limit.png' }); await page.click('.modal [data-close]');
  await h.go('#/settings?as=admin&tab=roles'); check('roles tab explains the add-on', (await page.textContent('.page')).includes('one level of access'));
  await h.roles(); await h.go('#/orders'); check('roles add-on restores approval wait', (await page.textContent('.page')).includes('For Approval'));
  await h.roles(); await h.go('#/orders'); check('switching off clears it', !(await page.textContent('.page')).includes('For Approval'));
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
  await page.goto(BASE + '#/dashboard'); await page.waitForTimeout(150); await h.roles();
  await h.go('#/release/ORD-1045?as=staff');
  await page.locator('[data-cond]').first().selectOption('minor'); await page.waitForTimeout(40);
  for (let i = 0; i < 3; i++) { await page.click('[data-act="scan"]'); await page.waitForTimeout(70); }
  await page.click('[data-act="submit-check"]'); await page.waitForTimeout(150);
  await h.go('#/sign/ORD-1045?as=staff'); check('customer cannot sign before approval', (await page.locator('#sig').count()) === 0);
  await h.go('#/approve/ORD-1045?as=staff'); check('staff cannot approve', (await page.locator('[data-act="approve-order"]').count()) === 0);
  await h.go('#/approve/ORD-1042?as=supervisor'); await page.click('[data-act="approve-order"]'); await page.waitForTimeout(150);
  check('approved pickup is ready for pickup', (await h.sub()).includes('Ready for Pickup'));
  await h.go('#/return/ORD-1037?as=admin'); await page.selectOption('[data-unit="TNT-1020-013"]', 'damaged'); await page.waitForTimeout(80);
  await page.click('[data-act="finish-return"]'); await page.waitForTimeout(150);
  check('return files a report', (await h.sub()).includes('discrepancy'));
  await h.go('#/phone'); await page.click('button[data-act="phone-scan"]'); await page.waitForTimeout(80); await h.sign('#p-sig'); await page.click('#p-sig-ok'); await page.waitForTimeout(120);
  check('phone signing works at the counter', (await page.textContent('.phones')).includes('Clearance saved on ORD-1039'));
  await h.go('#/dashboard?as=staff'); check('staff menu hides admin pages', !(await page.locator('.nav').textContent()).includes('Settings'));
  await h.go('#/reports'); check('staff blocked from reports', (await page.textContent('h1')).includes('Admin only'));
  await page.context().close();

  // ---- Package A is pickup only; delivery is an add-on
  page = await open(); h = helpers(page);
  await page.goto(BASE + '#/orders/new?as=admin'); await page.waitForTimeout(150);
  check('Package A form has no delivery option', (await page.locator('input[value="delivery"]').count()) === 0);
  await h.go('#/orders'); const ordersA = await page.textContent('.page');
  check('Package A lists no delivery orders', !ordersA.includes('TechCon') && (await page.locator('.tag.delivery').count()) === 0 && (await page.locator('[data-tab="delivery"]').count()) === 0);
  await h.go('#/order/ORD-1041'); check('delivery orders are hidden in Package A', (await page.textContent('h1')).includes('Not found'));
  await h.go('#/reports'); await page.click('[data-rtab="deliveries"]'); await page.waitForTimeout(80);
  check('reports use order wording in Package A', (await page.locator('[data-rtab="deliveries"]').textContent()).includes('Orders'));
  await h.go('#/settings?as=admin&tab=package'); await page.screenshot({ path: OUT + 'settings_package.png', fullPage: true });
  await page.click('[data-act="toggle-delivery"]'); await page.waitForTimeout(100);
  await h.go('#/order/ORD-1041'); check('add-on brings delivery orders back', (await page.textContent('h1')).includes('TechCon'));
  await h.go('#/sign/ORD-1041?as=admin'); await h.sign('#sig'); await page.click('#sig-ok'); await page.waitForTimeout(150);
  await h.go('#/order/ORD-1041'); check('receiver signing marks Delivered', (await h.sub()).includes('Delivered'));
  await h.go('#/orders/new'); check('add-on adds the delivery option', (await page.locator('input[value="delivery"]').count()) === 1);
  await h.roles(); await h.go('#/settings?as=admin&tab=package'); await page.waitForTimeout(50); await h.go('#/orders/new');
  await page.click('[data-act="save-order"]'); await page.waitForTimeout(150); const dId = page.url().match(/ORD-\d+/)[0];
  await h.go(`#/release/${dId}`); const dt = await page.locator('[data-tick]').count(); for (let i = 0; i < dt; i++) { await page.locator('[data-tick]').nth(i).click(); await page.waitForTimeout(40); }
  await page.click('[data-act="submit-check"]'); await page.waitForTimeout(120); await h.go(`#/approve/${dId}?as=supervisor`); await page.click('[data-act="approve-order"]'); await page.waitForTimeout(120);
  await page.click('[data-act="dispatch"]'); await page.waitForTimeout(120);
  check('delivery dispatches with the add-on', (await h.sub()).includes('In Transit'));
  await h.go('#/settings?as=admin&tab=package'); await page.click('[data-act="toggle-delivery"]'); await page.waitForTimeout(80);
  await h.go('#/orders'); check('switching off hides them again', (await page.locator('.tag.delivery').count()) === 0);
  await page.context().close();

  // ---- Real QR scanning: labels decode to working links, and a live camera stream ticks items
  page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then(c => c.newPage());
  page.on('pageerror', e => errors.push('pageerror ' + page.url() + ' ' + e.message));
  await page.addInitScript(() => {
    // A fake camera that films whatever QR is in window.__film; it goes through the real scanner code.
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480; const ctx = canvas.getContext('2d');
    setInterval(() => { ctx.fillStyle = '#9aa'; ctx.fillRect(0, 0, 640, 480); if (window.__film) ctx.drawImage(window.__film, 170, 90, 300, 300); }, 60);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { if (window.__denyCam) throw Object.assign(new Error('no'), { name: 'NotAllowedError' }); return canvas.captureStream(15); } } });
  });
  h = helpers(page);
  const film = async sel => page.evaluate(async s => { const svg = document.querySelector(s); const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(Object.assign(svg.cloneNode(true), {}))); await img.decode(); const c = document.createElement('canvas'); c.width = c.height = 300; c.getContext('2d').drawImage(img, 0, 0, 300, 300); window.__film = c; }, sel);
  await page.goto(BASE + '#/scan'); await page.waitForTimeout(200);
  await page.evaluate(() => { window.__denyCam = true; }); await page.click('[data-act="scan-start"]'); await page.waitForTimeout(600);
  check('blocked camera explains what to do', (await page.textContent('#scan-msg')).includes('Allow camera access') && await page.isVisible('[data-act="scan-start"]'));
  await page.evaluate(() => { window.__denyCam = false; });
  await page.locator('.qr-sample svg').evaluateAll(els => els.forEach((e, i) => e.setAttribute('id', 'lab' + i)));
  const labels = await page.locator('.qr-sample .mono').allTextContents();
  await page.click('[data-act="scan-start"]'); await page.waitForTimeout(500);
  for (const i of [0, 4]) { await film('#lab' + i); await page.waitForTimeout(1500); check(`camera reads label ${labels[i]}`, (await page.textContent('#scan-result')).includes(labels[i]), (await page.textContent('#scan-result')).replace(/\s+/g, ' ').slice(0, 60)); }
  await page.screenshot({ path: OUT + 'scan_page.png', fullPage: true });
  const payload = await page.evaluate(() => { const c = window.__film; return window.jsQR(c.getContext('2d').getImageData(0, 0, 300, 300).data, 300, 300).data; });
  check('labels hold a link a normal camera can open', payload === new URL(BASE).origin + new URL(BASE).pathname + '#/s/' + labels[4], payload);
  await page.fill('#scan-typed', 'tnt-1020-007'); await page.click('[data-act="scan-typed"]'); await page.waitForTimeout(60);
  check('typing a code works', (await page.textContent('#scan-result')).includes('TNT-1020-007'));
  const tracksBefore = await page.evaluate(() => document.getElementById('scan-video').srcObject.getTracks()[0].readyState);
  await page.evaluate(() => { window.__v = document.getElementById('scan-video'); });
  await h.go('#/inventory'); await page.waitForTimeout(100);
  check('leaving the page stops the camera', tracksBefore === 'live' && await page.evaluate(() => window.__v.srcObject.getTracks()[0].readyState) === 'ended');
  await h.go('#/s/TNT-1020-007'); check('opening a label link shows that unit', (await page.textContent('.page')).includes('For repair'));
  await page.screenshot({ path: OUT + 'scan_result.png' });
  await h.go('#/scan'); await page.waitForTimeout(100);
  await page.locator('.qr-sample svg').evaluateAll(els => els.forEach((e, i) => e.setAttribute('id', 'lab' + i)));
  await film('#lab0'); const chairs = await page.evaluate(() => window.__film.toDataURL()); await film('#lab3'); const wrong = await page.evaluate(() => window.__film.toDataURL());
  await h.go('#/release/ORD-1045'); await page.waitForTimeout(100);
  const setFilm = u => page.evaluate(async u => { const i = new Image(); i.src = u; await i.decode(); window.__film = i; }, u);
  await setFilm(chairs); await page.click('[data-act="scan-check"]'); await page.waitForTimeout(1600);
  check('camera ticks a matching checklist line', (await page.locator('.check-row.done').count()) === 1 && (await page.textContent('#chk-msg')).includes('ticked'), (await page.textContent('#chk-msg')).trim().slice(0, 50));
  await setFilm(wrong); await page.waitForTimeout(1500);
  check('camera rejects an item not on the order', (await page.textContent('#chk-msg')).includes('is not on ORD-1045'));
  await page.screenshot({ path: OUT + 'scan_checklist.png' });
  await page.click('.modal [data-close]'); await page.waitForTimeout(300);
  await page.context().close();

  // ---- Free exploring
  page = await open(); h = helpers(page); page.on('dialog', d => d.accept());
  await page.goto(BASE); await page.click('[data-act="skip-guide"]'); await page.waitForTimeout(150);
  check('explore lands on the dashboard with no guide', (await page.locator('.guide').count()) === 0 && page.url().includes('dashboard'));
  check('dashboard shows things to try', (await page.locator('.explore-grid a').count()) === 9);
  await page.screenshot({ path: OUT + 'explore_dashboard.png', fullPage: true });
  await h.go('#/categories'); await page.click('[data-act="add-category"]'); await page.click('#c-save');
  check('category form requires a name', (await page.textContent('.form-err')).includes('Enter'));
  await page.fill('#c-name', 'Catering'); await page.click('#c-save'); await page.waitForTimeout(100);
  check('new category is listed', (await page.textContent('.page')).includes('Catering'));
  await h.go('#/inventory'); await page.click('[data-act="add-item"]'); await page.fill('#i-name', 'Ghost Chair (Clear)');
  await page.selectOption('#i-cat', { label: 'Catering' }); await page.fill('#i-qty', '75'); await page.screenshot({ path: OUT + 'explore_add_item.png' }); await page.click('#i-save'); await page.waitForTimeout(150);
  const newSku = decodeURIComponent(page.url().split('/item/')[1]);
  check('new item opens with its stock', (await page.textContent('h1')).includes('Ghost Chair') && (await page.textContent('.page')).includes('75'), newSku);
  await h.go('#/inventory'); await page.click('[data-act="add-item"]'); await page.fill('#i-name', 'Fog Machine'); await page.selectOption('#i-track', 'unit'); await page.fill('#i-qty', '3'); await page.click('#i-save'); await page.waitForTimeout(150);
  check('per-unit item gets unit codes', (await page.textContent('.page')).includes('-003'));
  await h.go('#/orders/new'); await page.selectOption('[data-line="0"][data-k="sku"]', newSku); await page.waitForTimeout(80); await page.fill('[data-line="0"][data-k="qty"]', '50'); await page.dispatchEvent('[data-line="0"][data-k="qty"]', 'change'); await page.waitForTimeout(80);
  check('new item can be booked', (await page.locator('.avail').first().textContent()).includes('75 free'));
  await h.go('#/warehouses'); await page.click('[data-act="add-warehouse"]'); await page.fill('#w-name', 'Cavite'); await page.click('#w-save'); await page.waitForTimeout(100);
  check('new warehouse is listed', (await page.textContent('.page')).includes('Cavite'));
  await h.go('#/reports'); check('reports survive an empty warehouse', !(await page.textContent('.page')).includes('NaN'));
  await h.go('#/adjustments'); await page.click('[data-act="new-adj"]'); await page.selectOption('#adj-sku', newSku); await page.selectOption('#adj-wh', { label: 'Cavite' }); await page.fill('#adj-qty', '30'); await page.click('#adj-save'); await page.waitForTimeout(100);
  await h.go('#/item/' + newSku); check('stock-in really adds stock', (await page.textContent('.page')).includes('Cavite') && (await page.locator('.kpi .v').first().textContent()).trim() === '105');
  await h.go('#/adjustments'); await page.click('[data-act="new-adj"]'); await page.selectOption('#adj-type', 'Write-off'); await page.selectOption('#adj-sku', newSku); await page.selectOption('#adj-wh', { label: 'Cavite' }); await page.fill('#adj-qty', '99'); await page.click('#adj-save'); await page.waitForTimeout(80);
  check('cannot write off more than is there', (await page.textContent('.form-err')).includes('Only 30'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(50);
  check('Escape closes a form', (await page.locator('.modal').count()) === 0);
  await h.roles(); await h.go('#/approvals?as=admin'); const before = await page.locator('[data-act="approve"]').count(); await page.locator('[data-act="approve"]').first().click(); await page.waitForTimeout(100);
  check('approving an adjustment clears it', (await page.locator('[data-act="approve"]').count()) === before - 1);
  await h.go('#/settings?as=admin&tab=users'); await page.click('[data-act="add-user"]'); await page.fill('#u-name', 'Ana Reyes'); await page.click('#u-save'); check('user needs a warehouse', (await page.textContent('.form-err')).includes('warehouse'));
  await page.locator('.check-list input').first().check(); await page.click('#u-save'); await page.waitForTimeout(100);
  check('new user is listed', (await page.textContent('.page')).includes('Ana Reyes'));
  await h.go('#/damage/DMG-0089'); await page.click('[data-to="Charged to customer"]'); await page.waitForTimeout(80);
  check('damage action updates the report', (await page.textContent('.page')).includes('Charged to customer'));
  await h.go('#/dashboard'); await page.click('[data-act="hide-explore"]'); await page.waitForTimeout(80);
  check('things to try can be dismissed', (await page.locator('.explore').count()) === 0);
  await page.reload(); await page.waitForTimeout(250);
  check('dismissal survives a reload', (await page.locator('.explore').count()) === 0);
  await h.go('#/inventory'); const inv = await page.textContent('.page');
  check('added items survive a reload', inv.includes('Ghost Chair') && inv.includes('Fog Machine'));
  await h.go('#/warehouses'); check('added warehouse survives a reload', (await page.textContent('.page')).includes('Cavite'));
  await page.click('[data-act="restart"]'); await page.waitForTimeout(400);
  check('reset returns to the welcome screen', page.url().includes('/welcome') && (await page.locator('.welcome').count()) === 1);
  await page.click('[data-act="skip-guide"]'); await page.waitForTimeout(120); await h.go('#/inventory');
  check('reset clears added items', !(await page.textContent('.page')).includes('Ghost Chair'));
  await page.context().close();

  // ---- Guide progress survives a reload
  page = await open(); h = helpers(page); await page.goto(BASE); await page.click('[data-act="start-guide"]'); await page.waitForTimeout(100);
  await page.click('[data-act="do-step"]'); await page.waitForTimeout(120); await h.cont(); await page.click('[data-act="do-step"]'); await page.waitForTimeout(150); await h.cont();
  await page.locator('[data-tick]').first().click(); await page.waitForTimeout(60);
  await page.reload(); await page.waitForTimeout(250);
  check('reload keeps the guide step and ticks', (await h.count()) === 'Step 3 of 5' && (await page.locator('.tick.on').count()) === 1);
  await page.context().close();

  // ---- Every page, on desktop and at phone width
  const routes = ['#/welcome', '#/setup?as=admin', '#/dashboard?as=admin', '#/orders', '#/orders/new', '#/calendar', '#/order/ORD-1045', '#/release/ORD-1045?as=staff', '#/approvals?as=supervisor', '#/approve/ORD-1042?as=supervisor', '#/order/ORD-1039', '#/sign/ORD-1039?as=staff', '#/clearance/ORD-1038?as=admin', '#/return/ORD-1037', '#/order/ORD-1036', '#/damage', '#/damage/DMG-0092', '#/damage/DMG-0089', '#/item/TNT-1020/TNT-1020-007', '#/item/CHR-TIF-WHT', '#/inventory', '#/labels', '#/scan', '#/s/TNT-1020-007', '#/s/CHR-TIF-WHT', '#/s/NOPE', '#/phone', '#/adjustments', '#/reports', '#/settings', '#/warehouses', '#/categories', '#/notifications', '#/done'];
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
  for (const [n, act] of [['setup', 0], ['book', 0], ['check', 0], ['handover', 0], ['return', 0]]) { await page.screenshot({ path: OUT + `phone_guide_${n}.png` }); await page.tap('[data-act="do-step"]'); await page.waitForTimeout(150); await page.tap('.guide .go'); await page.waitForTimeout(150); }
  check('guide completes on a phone with taps', page.url().includes('/done'));
  await page.screenshot({ path: OUT + 'phone_done.png', fullPage: true });
  await h.go('#/dashboard?as=admin'); await page.tap('.menu-btn'); await page.waitForTimeout(280);
  check('phone menu opens', await page.evaluate(() => document.querySelector('.side').getBoundingClientRect().left >= 0));
  await page.screenshot({ path: OUT + 'phone_menu.png' });
  await page.tap('.nav a[href="#/inventory"]'); await page.waitForTimeout(280);
  check('menu closes after choosing a page', await page.evaluate(() => document.querySelector('.side').getBoundingClientRect().right <= 0));
  await page.screenshot({ path: OUT + 'phone_inventory.png' });
  await h.go('#/release/ORD-1045'); await page.screenshot({ path: OUT + 'phone_checklist.png', fullPage: true });
  await h.go('#/return/ORD-1037?as=staff'); await page.screenshot({ path: OUT + 'phone_return.png', fullPage: true });
  check('return boxes are labelled on a phone', (await page.locator('.ret-f span:visible').allTextContents()).slice(0, 3).join() === 'Returned,Damaged,For repair');
  check('hidden menu casts no shadow on a phone', await page.evaluate(() => getComputedStyle(document.querySelector('.side')).boxShadow === 'none'));
  await page.context().close();

  check('no JavaScript errors', !errors.length, errors.slice(0, 5).join(' | '));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message.split('\n').slice(0, 4).join(' ')); process.exit(2); });
