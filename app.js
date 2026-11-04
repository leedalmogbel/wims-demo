// WIMS clickable mockup. Plain JS, hash routing, in-memory state (resets on reload).
(() => {
  const D = window.WIMS_DATA;
  const app = document.getElementById('app');
  const seedRelease = () => {
    for (const o of D.orders) if (o.check) S.release[o.id] = { ticks: Object.fromEntries(lineKeys(o).map(k => [k, true])), cond: { ...(o.check.cond || {}) } };
  };

  // ---------- state ----------
  const S = {
    role: 'admin',
    guide: false,
    deliveryOn: false,
    rolesOn: false,
    story: null,
    setupDone: false,
    company: 'Sample Events Rental Co.',
    seen: {},
    navOpen: false,
    release: {},   // orderId -> { ticks:{key:true}, cond:{key:val} }
    ret: {},       // orderId -> { back:{}, dmg:{}, rep:{}, unit:{} }
    sigs: {},      // orderId -> dataURL
    q: '',
    lastTour: 0,
    nextOrder: 1043,
    nextDmg: 93,
    nextAdj: 311,
  };
  const ME = {
    admin: { name: 'Juan Dela Cruz', role: 'Admin', whs: null, scope: 'Admin · All warehouses' },
    supervisor: { name: 'Rico Bautista', role: 'Supervisor', whs: ['PSG', 'LPS'], scope: 'Supervisor · Pasig Main, Las Piñas' },
    staff: { name: 'Maria Santos', role: 'Staff', whs: ['PSG', 'LPS'], scope: 'Staff · Pasig Main, Las Piñas' },
  };
  const me = () => ME[S.role];

  function setDelivery(on) {
    S.deliveryOn = on;
    const all = [...D.orders, ...(D.hiddenOrders || [])];
    D.orders = on ? all : all.filter(o => o.type !== 'delivery');
    D.hiddenOrders = on ? [] : all.filter(o => o.type === 'delivery');
    S.newOrder = null; S.orderTab = 'all';
  }
  // Package A has one level of access. Roles and approvals only exist with the add-on,
  // so orders waiting on a supervisor skip straight to ready while it is off.
  function setRoles(on) {
    S.rolesOn = on; S.role = 'admin'; S.newOrder = null;
    for (const o of [...D.orders, ...(D.hiddenOrders || [])]) {
      const ready = o.type === 'pickup' ? 'Ready for Pickup' : 'Ready to Dispatch';
      if (!on && o.status === 'For Approval') { o.status = ready; o.heldForApproval = true; }
      else if (on && o.heldForApproval && o.status === ready) { o.status = 'For Approval'; o.heldForApproval = false; }
    }
  }
  const notifications = () => D.notifications.filter(x => (S.deliveryOn || !x.deliveryOnly) && (S.rolesOn || !x.rolesOnly));
  const MAX_USERS = 3;
  const accounts = () => (S.rolesOn ? D.users : D.users.filter(u => u.active && u.role !== 'Supervisor'));
  const adjustments = () => D.adjustments.filter(a => S.rolesOn || a.status !== 'Pending approval');

  // ---------- helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n = x => Number(x).toLocaleString('en-PH');
  const peso = x => '₱' + Number(x).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const item = sku => D.items.find(i => i.sku === sku);
  const wh = id => D.warehouses.find(w => w.id === id);
  const cust = id => D.customers[id];
  const order = id => D.orders.find(o => o.id === id);
  const cat = id => D.categories.find(c => c.id === id);
  const allUnits = () => D.items.flatMap(i => i.units || []);
  const unit = code => allUnits().find(u => u.code === code);
  const lineQty = l => (l.units ? l.units.length : l.qty);
  const OUT = ['In Transit', 'Delivered', 'Picked Up', 'Returning'];
  const RES = ['Preparing', 'For Approval', 'Ready for Pickup', 'Ready to Dispatch'];
  const FLOW = {
    delivery: ['Preparing', 'For Approval', 'Ready to Dispatch', 'In Transit', 'Delivered', 'Returning', 'Returned'],
    pickup: ['Preparing', 'For Approval', 'Ready for Pickup', 'Picked Up', 'Returned'],
  };
  const canApprove = o => S.role === 'admin' || (S.role === 'supervisor' && myWh(o.wh));
  const supervisorOf = whId => (D.users.find(u => u.role === 'Supervisor' && u.wh.includes(wh(whId).name)) || { name: 'the Admin' }).name;
  const lineKeys = o => o.lines.flatMap((l, i) => l.units || ['L' + i]);
  const myWh = w => !me().whs || me().whs.includes(w);
  const visibleOrders = () => D.orders.filter(o => myWh(o.wh));
  const unitOrder = code => D.orders.find(o => OUT.includes(o.status) && o.lines.some(l => (l.units || []).includes(code)));
  const unitReserved = code => D.orders.find(o => RES.includes(o.status) && o.lines.some(l => (l.units || []).includes(code)));
  const now = () => `Nov 4, 2026 · ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  const pathOf = h => h.split('?')[0];
  const routeId = () => pathOf(location.hash).split('/')[2];

  // ---------- dates and availability ----------
  const DAY = 86400000, BUFFER_DAYS = 1;
  const TODAY = new Date(2026, 10, 4);
  const toDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s); };
  const fmtDate = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtShort = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (d, k) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);
  // An order holds stock from its start date until the return date plus a turnaround day.
  // Anything overdue keeps holding stock until it actually comes back.
  const holdEnd = o => { const back = toDate(o.returnDate); return addDays(back < TODAY && OUT.includes(o.status) ? TODAY : back, BUFFER_DAYS); };
  const holdsFor = (sku, whId, from, to, skip) => D.orders.filter(o => o.id !== skip && o.status !== 'Returned' && o.wh === whId && toDate(o.date) <= to && holdEnd(o) >= from)
    .flatMap(o => o.lines.filter(l => l.sku === sku).map(l => ({ o, qty: lineQty(l) })));
  const owned = (sku, whId) => { const it = item(sku);
    if (it.track === 'unit') return it.units.filter(u => u.wh === whId && u.cond === 'good').length;
    return (it.stock[whId]?.[0] || 0) + D.orders.filter(o => o.wh === whId && OUT.includes(o.status)).flatMap(o => o.lines).filter(l => l.sku === sku).reduce((a, l) => a + l.qty, 0); };
  const freeFor = (sku, whId, from, to) => owned(sku, whId) - holdsFor(sku, whId, from, to).reduce((a, h) => a + h.qty, 0);
  const freeUnits = (sku, whId, from, to) => { const held = new Set(holdsFor(sku, whId, from, to).flatMap(h => h.o.lines.flatMap(l => l.units || [])));
    return item(sku).units.filter(u => u.wh === whId && u.cond === 'good' && !held.has(u.code)); };
  // First start date, within 60 days, when every line on the order fits.
  const nextFit = f => { const span = Math.round((toDate(f.ret) - toDate(f.date)) / DAY);
    for (let k = 1; k <= 60; k++) { const a = addDays(toDate(f.date), k), b = addDays(a, span); if (f.lines.every(l => l.qty <= freeFor(l.sku, f.wh, a, b))) return [a, b]; } return null; };

  function stats(it, whId) {
    const match = w => !whId || (Array.isArray(whId) ? whId.includes(w) : w === whId);
    const r = { good: 0, dmg: 0, rep: 0, out: 0, reserved: 0 };
    if (it.track === 'count') {
      for (const [w, [g, d, p]] of Object.entries(it.stock)) if (match(w)) { r.good += g; r.dmg += d; r.rep += p; }
      for (const o of D.orders) {
        if (!match(o.wh)) continue;
        for (const l of o.lines) if (l.sku === it.sku) {
          if (OUT.includes(o.status)) r.out += l.qty;
          if (RES.includes(o.status) && toDate(o.date) <= TODAY) r.reserved += l.qty;
        }
      }
    } else {
      for (const u of it.units) {
        if (!match(u.wh)) continue;
        if (unitOrder(u.code)) { r.out++; continue; }
        if (u.cond === 'good') r.good++; else if (u.cond === 'damaged') r.dmg++; else if (u.cond === 'repair') r.rep++;
        const res = unitReserved(u.code);
        if (u.cond === 'good' && res && toDate(res.date) <= TODAY) r.reserved++;
      }
    }
    r.avail = r.good - r.reserved;
    r.total = r.good + r.dmg + r.rep + r.out;
    return r;
  }
  function lowStock(whs) {
    const res = [];
    for (const it of D.items) for (const w of D.warehouses) {
      if (whs && !whs.includes(w.id)) continue;
      const s = stats(it, w.id);
      if (s.total > 0 && s.avail < it.low) res.push({ it, w, s });
    }
    return res;
  }

  // ---------- icons ----------
  const P = {
    dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    wh: '<path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-8h10v8M7 17h10"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    hand: '<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V11M16 11V8a1.5 1.5 0 0 1 3 0v5a8 8 0 0 1-8 8h-.5A7 7 0 0 1 5 18l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L7 15"/>',
    clip: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6"/>',
    ret: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    adj: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    chart: '<path d="M3 21h18M6 17V10M11 17V5M16 17v-5M21 17V8"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h3v3h-3z"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    print: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/>',
    cam: '<path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4Z"/><circle cx="12" cy="13" r="3.5"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4Z"/>',
    sign: '<path d="M3 17c3-1 4-8 6-8s0 8 3 8 3-4 5-4 2 3 4 3"/><path d="M3 21h18"/>',
    chair: '<path d="M7 3h10v8H7zM6 11h12M7 11v10M17 11v10M7 16h10"/>',
    table: '<path d="M3 8h18M5 8v12M19 8v12M3 8l2-3h14l2 3"/>',
    cloth: '<path d="M4 6h16l-2 14H6Z"/><path d="M4 6c2 3 4 3 8 3s6 0 8-3"/>',
    tent: '<path d="M12 3 2 20h20Z"/><path d="M12 3v17M9 20l3-6 3 6"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/>',
    spk: '<rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="15" r="3.5"/><circle cx="12" cy="7" r="1.5"/>',
    stage: '<path d="M2 14h20v6H2zM5 14V9h14v5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  };
  const ic = (k, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${extra}>${P[k] || ''}</svg>`;
  const catIcon = { chairs: 'chair', tables: 'table', linens: 'cloth', tents: 'tent', lighting: 'bulb', sound: 'spk', staging: 'stage' };
  const thumb = it => `<div class="thumb">${ic(catIcon[it.cat] || 'box')}</div>`;

  // ---------- small UI pieces ----------
  const statusTone = (o) => {
    if (o.status === 'Returned') return o.discrepancy ? 'bad' : 'mute';
    return { Preparing: 'mute', 'For Approval': 'warn', 'Ready for Pickup': 'info', 'Ready to Dispatch': 'info', 'In Transit': 'info', Delivered: 'ok', 'Picked Up': 'ok', Returning: 'info' }[o.status];
  };
  const statusPill = o => `<span class="pill ${statusTone(o)}">${o.status}${o.status === 'Returned' && o.discrepancy ? ' · discrepancy' : ''}</span>`;
  const typeTag = o => o.type === 'delivery' ? `<span class="tag delivery">${ic('truck')}Delivery</span>` : `<span class="tag pickup">${ic('hand')}Pickup</span>`;
  const condPill = c => ({ good: '<span class="pill ok">Good</span>', damaged: '<span class="pill bad">Damaged</span>', repair: '<span class="pill warn">For repair</span>', missing: '<span class="pill bad">Missing</span>', minor: '<span class="pill warn">Minor wear (noted)</span>' }[c] || c);
  const condName = c => ({ good: 'Good', damaged: 'Damaged', repair: 'For repair', missing: 'Missing', minor: 'Minor wear (noted)' }[c] || c);
  const stockBox = s => `<div class="stockbox"><span class="s-good">${n(s.good)} good</span>${s.dmg ? `<span class="s-dmg">${s.dmg} damaged</span>` : ''}${s.rep ? `<span class="s-rep">${s.rep} for repair</span>` : ''}${s.out ? `<span class="s-out">${n(s.out)} out</span>` : ''}</div>`;
  const note = (html, tone = '') => `<div class="note ${tone}">${ic(tone === 'ok' ? 'check' : tone ? 'alert' : 'info')}<div>${html}</div></div>`;
  const kpi = (label, value, sub, icon, tone = '') => `<div class="card kpi ${tone}"><div class="l"><span class="ic">${ic(icon)}</span>${label}</div><div class="v">${value}</div><div class="d">${sub}</div></div>`;
  const head = (title, sub, actions = '', crumbs = '') => `${crumbs ? `<div class="crumbs">${crumbs}</div>` : ''}<div class="head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="actions">${actions}</div></div>`;
  const lineLabel = l => { const it = item(l.sku); return `<div class="cell-item">${thumb(it)}<div><b>${esc(it.name)}</b><small class="mono">${it.sku}</small></div></div>`; };

  function toast(msg) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }
  function modal(title, body, foot, onMount) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal"><div class="card-h"><h3>${title}</h3><button class="btn sm" data-close>${ic('x')}</button></div><div class="card-b">${body}</div><div class="modal-f">${foot}</div></div>`;
    bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) bg.remove(); });
    document.body.appendChild(bg);
    bg.addEventListener('keydown', e => { if (e.key === 'Escape') bg.remove(); });
    onMount && onMount(bg.querySelector('.modal'), () => bg.remove());
    bg.querySelector('.card-b input, .card-b select')?.focus();
  }

  // Deterministic scribble used as the signature on seeded clearances.
  function scribble(name) {
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296);
    let d = 'M10 45', x = 10;
    for (let i = 0; i < 9; i++) { x += 16 + rnd() * 10; d += ` Q ${x - 8} ${10 + rnd() * 30}, ${x} ${30 + rnd() * 22}`; }
    d += ` M 20 ${52 + rnd() * 4} L ${x - 10} ${48 + rnd() * 6}`;
    return `<svg viewBox="0 0 ${x + 14} 64"><path d="${d}" fill="none" stroke="#1b2a55" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  }

  // QR codes: real, scannable ones via qrcode-generator; fallback pattern if offline.
  function qrSvg(text) {
    if (window.qrcode) {
      const q = window.qrcode(0, 'M'); q.addData(text); q.make();
      const m = q.getModuleCount(); let r = '';
      for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) if (q.isDark(y, x)) r += `M${x + 2} ${y + 2}h1v1h-1z`;
      return `<svg viewBox="0 0 ${m + 4} ${m + 4}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${r}" fill="#111"/></svg>`;
    }
    let h = 7; for (const c of text) h = (h * 33 + c.charCodeAt(0)) >>> 0;
    let r = ''; const m = 21;
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
      const f = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      if (f) { const a = x > 13 ? x - 14 : x, b = y > 13 ? y - 14 : y; if (a === 0 || a === 6 || b === 0 || b === 6 || (a > 1 && a < 5 && b > 1 && b < 5)) r += `M${x + 2} ${y + 2}h1v1h-1z`; continue; }
      h = (h * 1103515245 + 12345) >>> 0; if (h & 0x10000) r += `M${x + 2} ${y + 2}h1v1h-1z`;
    }
    return `<svg viewBox="0 0 25 25" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${r}" fill="#111"/></svg>`;
  }

  // ---------- real QR scanning ----------
  // Labels hold a link, so any phone camera opens the item, and the scanner reads the code from it.
  const qrUrl = code => `${location.origin}${location.pathname}#/s/${code}`;
  const parseCode = text => decodeURIComponent(String(text).trim().split('/s/').pop().replace(/^WIMS:/i, '')).toUpperCase();
  const lookupCode = code => {
    const parent = D.items.find(i => (i.units || []).some(u => u.code === code));
    if (parent) return { it: parent, unit: parent.units.find(u => u.code === code) };
    const it = item(code); return it ? { it } : null;
  };
  let scanner = null;
  let jsQRLoading = null;
  const loadJsQR = () => jsQRLoading || (jsQRLoading = new Promise((ok, no) => {
    const t = document.createElement('script'); t.src = 'vendor/jsQR.min.js'; t.onload = ok; t.onerror = () => { jsQRLoading = null; no(new Error('load')); }; document.head.appendChild(t);
  }));
  function stopScanner() { if (!scanner) return; scanner.stream?.getTracks().forEach(t => t.stop()); scanner = null; }
  const scanErrorText = e => (e.name === 'NotAllowedError' ? 'The camera is blocked. Allow camera access for this site in your browser settings, then try again.'
    : e.name === 'NotFoundError' ? 'No camera was found on this device. Open this page on a phone, or type a code below.'
    : !navigator.mediaDevices ? 'This browser can\'t open the camera here. Use the phone\'s normal camera on a label, or type a code below.'
    : 'The camera couldn\'t start. Close other apps using it and try again, or type a code below.');
  async function startScanner(video, onCode, onError) {
    stopScanner();
    try {
      await loadJsQR();
      if (!navigator.mediaDevices) throw new Error('unavailable');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      const me_ = scanner = { stream, last: '', lastAt: 0 };
      video.srcObject = stream; video.setAttribute('playsinline', ''); video.muted = true; await video.play();
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (scanner !== me_) return;
        if (!video.isConnected) { stopScanner(); return; }   // the page or dialog holding the camera has gone
        if (video.videoWidth) {
          const k = Math.min(1, 800 / video.videoWidth);
          canvas.width = video.videoWidth * k; canvas.height = video.videoHeight * k;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const hit = window.jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
          if (hit && hit.data) {
            const code = parseCode(hit.data), t = Date.now();
            if (code !== me_.last || t - me_.lastAt > 3000) { me_.last = code; me_.lastAt = t; navigator.vibrate?.(80); onCode(code); }
          }
        }
        setTimeout(tick, 180);
      };
      tick();
    } catch (e) { stopScanner(); onError(scanErrorText(e)); }
  }
  const scanResult = code => {
    const hit = lookupCode(code);
    if (!hit) return note(`<b>${esc(code)}</b> isn't an item in this demo. Items you added only exist in the browser where you added them.`, 'warn');
    const { it, unit: u } = hit, o = u && unitOrder(u.code), r = u && unitReserved(u.code), s = stats(it);
    return `<div class="scan-hit"><div class="cell-item">${thumb(it)}<div><b>${esc(it.name)}</b><small class="mono">${esc(code)}</small></div></div>
      ${u ? `<dl class="dl"><dt>Condition</dt><dd>${condPill(u.cond)}</dd><dt>Warehouse</dt><dd>${esc(wh(u.wh).name)}</dd><dt>Where now</dt><dd>${o ? `Out on <a href="#/order/${o.id}">${o.id}</a>` : r ? `Reserved for <a href="#/order/${r.id}">${r.id}</a>` : 'In the warehouse'}</dd></dl>`
        : `<dl class="dl"><dt>Available</dt><dd>${n(s.avail)} of ${n(s.total)} pieces</dd><dt>Out now</dt><dd>${n(s.out)}</dd><dt>Damaged or for repair</dt><dd>${n(s.dmg + s.rep)}</dd></dl>`}
      <a class="btn sm" href="#/item/${it.sku}${u ? '/' + u.code : ''}">Open the full item page</a></div>`;
  };
  const SAMPLE_LABELS = ['CHR-TIF-WHT', 'TBL-5FT-RND', 'LIN-TBL-WHT', 'TBL-6FT-RCT', 'TNT-1020-007', 'SND-SPK-15-001'];

  // ---------- guided setup wizard ----------
  const story = () => (S.story ? order(S.story) : null);
  const firstName = r => ME[r].name.split(' ')[0];
  const STEPS = [
    { key: 'setup', label: 'Set up', role: 'admin', route: () => '#/setup?as=admin', review: () => '#/setup?as=admin', done: () => S.setupDone,
      summary: 'Add the company, warehouses, stock and team.', task: () => 'Check the company details, warehouses, items and team, then click <b>Finish setup</b>.',
      doneText: 'Setup is finished.' },
    { key: 'book', label: 'Book', role: 'staff', route: () => '#/orders/new?as=staff', review: () => `#/order/${S.story}?as=staff`, done: () => !!story(),
      summary: 'Reserve items for a date, with a double-booking check.', task: () => 'The Nov 8 weekend is already busy, so 450 chairs won\'t fit. <b>Pick a date that fits</b>, then click <b>Save order</b>.',
      doneText: 'The order is booked and its stock is held for those dates.' },
    { key: 'check', label: 'Check', role: 'staff', route: () => `#/release/${S.story}?as=staff`, review: () => `#/order/${S.story}?as=staff`, done: () => !!story() && story().status !== 'Preparing',
      summary: 'Count every line and record its condition.', task: () => `${story()?.sentBack ? `${esc(story().sentBack.by)} sent this back. ` : ''}<b>Tick every line</b> or use <b>Scan with camera</b>, then click <b>${S.rolesOn ? 'Submit for supervisor approval' : 'Mark ready for pickup'}</b>.`,
      get doneText() { return S.rolesOn ? 'The checklist went to the supervisor.' : 'The order is ready for pickup.'; } },
    { key: 'approve', label: 'Approve', role: 'supervisor', route: () => `#/approve/${S.story}?as=supervisor`, review: () => `#/order/${S.story}?as=supervisor`, done: () => !!story()?.approval,
      summary: 'The supervisor approves it or sends it back.', task: () => 'Review what Maria counted, then click <b>Approve</b>, or try <b>Send back</b> with a reason.',
      doneText: 'The supervisor approved it.' },
    { key: 'handover', label: 'Hand over', role: 'staff', route: () => `#/sign/${S.story}?as=staff`, review: () => `#/clearance/${S.story}?as=staff`, done: () => !!story()?.clearance,
      summary: 'The customer signs for exactly what they received.', task: () => 'The customer is at the counter. <b>Draw a signature</b>, then click <b>Confirm and sign</b>.',
      doneText: 'The customer signed the clearance.' },
    { key: 'return', label: 'Return', role: 'staff', route: () => `#/return/${S.story}?as=staff`, review: () => `#/order/${S.story}?as=staff`, done: () => story()?.status === 'Returned',
      summary: 'Compare what came back and flag any damage.', task: () => 'Lower the <b>Returned</b> count or change a condition to see the flags, then click <b>Complete return</b>.',
      doneText: 'The return is complete.' },
  ];
  const steps = () => STEPS.filter(x => S.rolesOn || x.key !== 'approve');
  const curStep = () => steps().find(x => !x.done());
  const stepRole = x => (S.rolesOn ? x.role : 'admin');
  function guideBar(route) {
    if (!S.guide) return '';
    const list = steps(), cur = curStep(), ci = cur ? list.indexOf(cur) : list.length;
    const chips = list.map((x, i) => {
      const inner = `<span class="n">${i < ci ? ic('check') : i + 1}</span><span class="t">${x.label}</span>`;
      if (i > ci) return `<span class="chip" aria-disabled="true" title="Finish ${list[ci].label} first">${inner}</span>`;
      return `<a class="chip ${i < ci ? 'done' : 'now'}" href="${i < ci ? x.review() : x.route()}" ${i === ci ? 'aria-current="step"' : ''}>${inner}</a>`;
    }).join('');
    let row;
    if (!cur && pathOf(route) === '#/done') row = `<p><b>Guide complete.</b> Everything below is yours to explore.</p>`;
    else if (!cur) row = `<p><b>All ${list.length} steps are done.</b> See the full record of this order and what else to explore.</p><a class="go" href="#/done">See the summary →</a>`;
    else {
      const here = pathOf(route) === pathOf(cur.route()) && S.role === stepRole(cur);
      const who = S.rolesOn ? `<span class="who">${firstName(cur.role)} · ${ME[cur.role].role}</span>` : '';
      if (here) row = `${who}<p>${cur.task()}</p><button class="ghost" data-act="do-step">Do this step for me</button>`;
      else row = `<p>${ci > 0 ? `<b>${ic('check')}${list[ci - 1].doneText}</b> ` : ''}Next${S.rolesOn ? `, ${firstName(cur.role)} (${ME[cur.role].role})` : ''}: ${cur.summary}</p><a class="go" href="${cur.route()}">Continue to ${cur.label} →</a>`;
    }
    return `<div class="guide no-print"><div class="guide-top"><span class="count">Step ${Math.min(ci + 1, list.length)} of ${list.length}</span><nav class="chips" aria-label="Guide progress">${chips}</nav><button class="hide" data-act="hide-guide">Exit guide</button></div><div class="guide-row">${row}</div></div>`;
  }

  // ---------- shell ----------
  function shell(key, route, body) {
    const admin = S.role === 'admin';
    const pendingAdj = D.adjustments.filter(a => a.status === 'Pending approval').length;
    const approver = S.role !== 'staff';
    const pendingAll = D.orders.filter(o => o.status === 'For Approval' && canApprove(o)).length + (approver ? pendingAdj : 0);
    const navItem = (href, k, icon, label, extra = '') => `<a href="${href}" class="${key === k ? 'on' : ''}">${ic(icon)}${label}${extra}</a>`;
    const unread = notifications().length;
    return `<div class="shell ${S.navOpen ? 'nav-open' : ''}">
      <div class="nav-backdrop" data-act="toggle-nav"></div>
      <aside class="side no-print">
        <div class="brand"><div class="brand-mark">WI</div><div><b>WIMS</b><small>${esc(S.company)}</small></div></div>
        <nav class="nav">
          ${navItem('#/dashboard', 'dashboard', 'dash', 'Dashboard')}
          <div class="nav-group">Stock</div>
          ${navItem('#/inventory', 'inventory', 'box', 'Inventory')}
          ${admin ? navItem('#/warehouses', 'warehouses', 'wh', 'Warehouses') : ''}
          ${admin ? navItem('#/categories', 'categories', 'tag', 'Categories') : ''}
          ${navItem('#/calendar', 'calendar', 'cal', 'Availability')}
          ${navItem('#/adjustments', 'adjustments', 'adj', 'Adjustments')}
          ${navItem('#/labels', 'labels', 'qr', 'QR labels')}
          ${navItem('#/scan', 'scan', 'cam', 'Scan')}
          <div class="nav-group">Orders</div>
          ${navItem('#/orders', 'orders', 'clip', 'Orders')}
          ${S.rolesOn ? navItem('#/approvals', 'approvals', 'check', approver ? 'Approvals' : 'My submissions', approver && pendingAll ? `<span class="count">${pendingAll}</span>` : '') : ''}
          ${navItem('#/damage', 'damage', 'wrench', 'Damage & loss')}
          ${navItem('#/phone', 'phone', 'phone', 'On the phone')}
          ${admin ? `<div class="nav-group">Admin</div>${navItem('#/reports', 'reports', 'chart', 'Reports')}${navItem('#/settings', 'settings', 'gear', 'Settings')}` : ''}
        </nav>
        <div class="side-foot">${S.guide ? '' : '<a class="btn sm" href="#/welcome" style="margin-bottom:10px">Open the guide</a><br>'}Mockup · sample data only<br>Package A · web, pickup only${S.deliveryOn ? ' + delivery' : ''}<br><button class="link-btn" data-act="restart">Reset demo</button></div>
      </aside>
      <div class="main">
        <header class="topbar no-print">
          <button class="menu-btn" data-act="toggle-nav" aria-label="Menu">${ic('menu')}</button>
          <div class="search">${ic('search')}<input id="q" placeholder="Search items, SKUs, unit codes, orders…" value="${esc(S.q)}"></div>
          <div class="spacer"></div>
          ${S.rolesOn ? `<div class="role-switch" title="Switch role to compare views">${['admin', 'supervisor', 'staff'].map(r => `<button class="${S.role === r ? 'on' : ''}" data-role="${r}">${ME[r].role}</button>`).join('')}</div>` : ''}
          <a class="bell" href="#/notifications">${ic('bell')}<i>${unread}</i></a>
          <div class="me"><div class="avatar">${me().name.split(' ').map(x => x[0]).join('')}</div><div><b>${me().name}</b><small>${S.rolesOn ? me().scope : 'Full access'}</small></div></div>
        </header>
        ${guideBar(route)}
        <div class="page">${body}</div>
      </div>
    </div>`;
  }

  // ---------- pages ----------
  const pages = {};

  pages.dashboard = () => {
    const whs = me().whs;
    let total = 0, out = 0, repair = 0;
    for (const it of D.items) { const s = stats(it, whs); total += s.total; out += s.out; repair += s.dmg + s.rep; }
    const orders = visibleOrders();
    const active = orders.filter(o => o.status !== 'Returned');
    const deliveries = active.filter(o => o.type === 'delivery').length;
    const low = lowStock(whs);
    const pending = adjustments().filter(a => a.status === 'Pending approval');
    const disc = orders.filter(o => o.discrepancy);
    const greet = `Good morning, ${me().name.split(' ')[0]}`;
    const scope = S.role === 'admin' ? 'All 4 warehouses' : 'Pasig Main and Las Piñas (your assigned warehouses)';
    const waiting = orders.filter(o => o.status === 'For Approval' && canApprove(o));
    return head(greet, `${scope} · Wednesday, Nov 4, 2026`, `<a class="btn" href="#/scan">${ic('cam')}Scan</a><a class="btn primary" href="#/orders/new">${ic('plus')}New order</a>`) + `
      ${(!S.guide || !curStep()) && !S.exploreHidden ? `<div class="card explore no-print"><div class="card-h"><div><h3>Things to try</h3><span class="sub">${exploreSeen()} of ${exploreList().length} seen. Everything here is sample data, so go ahead and change it.</span></div><button class="btn sm" data-act="hide-explore">Dismiss</button></div><div class="explore-grid">${exploreList().map(e => `<a href="${e[0]}" class="${S.seen[seenKey(e[0])] ? 'seen' : ''}"><span class="tick-sm">${S.seen[seenKey(e[0])] ? ic('check') : ''}</span><span><b>${e[1]}</b><small>${e[2]}</small></span></a>`).join('')}</div></div>` : ''}
      <div class="grid g4">
        ${kpi('Total stock', n(total), 'pieces across all conditions', 'box')}
        ${kpi('Active orders', active.length, S.deliveryOn ? `${deliveries} deliveries · ${active.length - deliveries} pickups` : `${active.length} customer pickups`, 'clip')}
        ${kpi('Out at events', n(out), 'released and not yet returned', 'truck', 'ok')}
        ${kpi('Needs repair', repair, 'damaged or for repair', 'wrench', 'bad')}
      </div>
      <div class="grid g-main" style="margin-top:16px">
        <div class="card">
          <div class="card-h"><h3>Active orders</h3><a href="#/orders" class="sub">View all →</a></div>
          <table class="tbl"><tr><th>Order</th><th>Type</th><th>From</th><th>Date</th><th>Status</th></tr>
          ${active.map(o => `<tr class="click" data-go="#/order/${o.id}"><td><b>${esc(o.event)}</b><small>${o.id} · ${esc(o.venue)}</small></td><td>${typeTag(o)}</td><td>${wh(o.wh).name}</td><td>${o.date}</td><td>${statusPill(o)}</td></tr>`).join('')}
          </table>
        </div>
        <div class="stack">
          ${waiting.length ? `<div class="card" style="border-color:#f3c46b"><div class="card-h"><h3>Waiting for your approval</h3><span class="pill warn">${waiting.length}</span></div><ul class="feed">${waiting.map(o => `<li><span class="dot warn"></span><div style="flex:1"><a href="#/approve/${o.id}">${o.id} · ${esc(o.event)}</a><small>Checklist by ${o.check.by} · ${o.check.at}</small></div><a class="btn sm primary" href="#/approve/${o.id}">Review</a></li>`).join('')}</ul></div>` : ''}
          ${S.role === 'staff' ? `<div class="card"><div class="card-h"><h3>Your orders to prepare</h3></div><ul class="feed">${orders.filter(o => o.status === 'Preparing').map(o => `<li><span class="dot ${o.sentBack ? 'bad' : ''}"></span><div style="flex:1"><a href="#/order/${o.id}">${o.id} · ${esc(o.event)}</a><small>${o.sentBack ? `Sent back by ${o.sentBack.by}: ${esc(o.sentBack.reason)}` : 'Checklist not started'}</small></div><a class="btn sm" href="#/release/${o.id}">Checklist</a></li>`).join('') || '<li>Nothing to prepare.</li>'}</ul></div>` : ''}
          <div class="card"><div class="card-h"><h3>Needs attention</h3></div><ul class="feed">
            ${low.map(x => `<li><span class="dot warn"></span><div><a href="#/item/${x.it.sku}">Low stock: ${esc(x.it.name)}</a><small>${x.w.name}: ${x.s.avail} available, alert at ${x.it.low}</small></div></li>`).join('')}
            ${disc.map(o => `<li><span class="dot bad"></span><div><a href="#/order/${o.id}">Return discrepancy: ${esc(o.event)}</a><small>${o.id} · missing or damaged items</small></div></li>`).join('')}
            ${S.role !== 'staff' ? pending.map(a => `<li><span class="dot"></span><div><a href="#/adjustments">${a.type} waiting for approval</a><small>${a.qty} × ${esc(item(a.sku).name)} · by ${a.by}</small></div></li>`).join('') : ''}
          </ul></div>
          <div class="card"><div class="card-h"><h3>Recent activity</h3></div><ul class="feed">
            <li><span class="dot ok"></span><div>ORD-1038 picked up, clearance signed by Grace Lim<small>Nov 2, 10:05 AM · Taguig warehouse</small></div></li>
            <li><span class="dot"></span><div>100 Chair Sash (Gold) stocked in at Pasig Main<small>Nov 2 · Maria Santos</small></div></li>
            <li><span class="dot bad"></span><div>TNT-1020-007 returned torn, marked for repair<small>Oct 27 · ORD-1036 Aquino Wedding</small></div></li>
            <li><span class="dot"></span><div>3 tables repaired, moved back to good<small>Oct 30 · Juan Dela Cruz</small></div></li>
          </ul></div>
        </div>
      </div>`;
  };

  pages.inventory = () => {
    const whs = me().whs;
    const f = S.invFilter || (S.invFilter = { wh: '', cat: '', cond: '' });
    const q = S.q.toLowerCase();
    const rows = D.items.filter(it => {
      if (f.cat && it.cat !== f.cat) return false;
      if (q && !(it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q) || (it.units || []).some(u => u.code.toLowerCase().includes(q)))) return false;
      const s = stats(it, f.wh || whs);
      if (s.total === 0) return false;
      if (f.cond === 'good' && !s.good) return false;
      if (f.cond === 'damaged' && !s.dmg) return false;
      if (f.cond === 'repair' && !s.rep) return false;
      return true;
    });
    const whOpts = D.warehouses.filter(w => myWh(w.id)).map(w => `<option value="${w.id}" ${f.wh === w.id ? 'selected' : ''}>${w.name}</option>`).join('');
    return head('Inventory', `${rows.length} items${S.q ? ` matching “${esc(S.q)}”` : ''}`, `${S.role === 'admin' ? `<button class="btn primary" data-act="add-item">${ic('plus')}Add item</button>` : ''}`) + `
      <div class="filters">
        <select class="in" data-filter="wh"><option value="">${S.role === 'admin' ? 'All warehouses' : 'My warehouses'}</option>${whOpts}</select>
        <select class="in" data-filter="cat"><option value="">All categories</option>${D.categories.map(c => `<option value="${c.id}" ${f.cat === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
        <select class="in" data-filter="cond"><option value="">Any condition</option><option value="good" ${f.cond === 'good' ? 'selected' : ''}>Has good stock</option><option value="damaged" ${f.cond === 'damaged' ? 'selected' : ''}>Has damaged</option><option value="repair" ${f.cond === 'repair' ? 'selected' : ''}>Has for repair</option></select>
        ${S.q ? `<button class="btn" data-act="clear-q">${ic('x')}Clear search</button>` : ''}
      </div>
      <div class="card"><table class="tbl">
        <tr><th>Item</th><th>Category</th><th>Tracked</th><th>Stock</th><th class="num">Available</th><th class="num">Total</th></tr>
        ${rows.map(it => { const s = stats(it, f.wh || whs); const lowFlag = lowStock(f.wh ? [f.wh] : whs).some(x => x.it === it);
          return `<tr class="click" data-go="#/item/${it.sku}"><td><div class="cell-item">${thumb(it)}<div><b>${esc(it.name)}</b><small class="mono">${it.sku}</small></div></div></td><td>${cat(it.cat).name}</td><td>${it.track === 'unit' ? '<span class="pill info nodot">Per unit</span>' : '<span class="pill mute nodot">By count</span>'}</td><td>${stockBox(s)}</td><td class="num"><b>${n(s.avail)}</b>${lowFlag ? '<small style="color:var(--warn)">low stock</small>' : ''}</td><td class="num">${n(s.total)}</td></tr>`; }).join('') || `<tr><td colspan="6" class="empty">No items match.</td></tr>`}
      </table></div>`;
  };

  pages.item = (sku, unitCode) => {
    const it = item(sku); if (!it) return notFound();
    const whs = D.warehouses.filter(w => myWh(w.id));
    const tot = stats(it, me().whs);
    let unitsHtml = '';
    if (it.track === 'unit') {
      const sel = unitCode || it.units.find(u => D.unitHistory[u.code])?.code;
      const hist = D.unitHistory[sel] || [{ date: 'Sep 2, 2026', text: 'Added to stock. Label printed.' }];
      const us = it.units.filter(u => myWh(u.wh));
      unitsHtml = `<div class="grid g-main" style="margin-top:16px">
        <div class="card"><div class="card-h"><h3>Units</h3><span class="sub">${us.length} units, each with its own QR code</span></div>
          <table class="tbl"><tr><th>Unit code</th><th>Warehouse</th><th>Condition</th><th>Where now</th></tr>
          ${us.map(u => { const o = unitOrder(u.code), r = unitReserved(u.code);
            return `<tr class="click ${u.code === sel ? 'flag' : ''}" data-go="#/item/${sku}/${u.code}"><td class="mono"><b>${u.code}</b></td><td>${wh(u.wh).name}</td><td>${condPill(u.cond)}</td><td>${o ? `Out on <a href="#/order/${o.id}">${o.id}</a>` : r ? `Reserved for <a href="#/order/${r.id}">${r.id}</a>` : 'In warehouse'}</td></tr>`; }).join('')}
          </table></div>
        <div class="card"><div class="card-h"><h3>History of <span class="mono">${sel}</span></h3></div>
          <div class="card-b" style="display:flex;gap:16px;align-items:flex-start"><div style="width:84px;flex-shrink:0">${qrSvg(qrUrl(sel))}</div><div style="font-size:12.5px;color:var(--ink-2)">Scan this code with a phone camera to open this unit, or to tick it off on a checklist.</div></div>
          <ul class="feed">${hist.map(h => `<li><span class="dot ${h.tone || ''}"></span><div>${esc(h.text)}<small>${h.date}</small></div></li>`).join('')}</ul></div>
      </div>`;
    }
    return head(esc(it.name), `<span class="mono">${it.sku}</span> · ${cat(it.cat).name} · ${it.track === 'unit' ? 'Tracked per unit (optional add-on)' : 'Tracked by count'} · low-stock alert below ${it.low}`,
      `<a class="btn" href="#/labels?sku=${it.sku}">${ic('print')}Print labels</a>${S.role === 'admin' ? `<button class="btn" data-act="toast" data-msg="Editing items: available in the full system">Edit</button>` : ''}`,
      `<a href="#/inventory">Inventory</a> / ${it.sku}`) + `
      <div class="grid g4">
        ${kpi('Good', n(tot.good), `${n(tot.avail)} available, ${n(tot.reserved)} reserved`, 'check', 'ok')}
        ${kpi('Out at events', n(tot.out), 'released on orders', 'truck')}
        ${kpi('Damaged', n(tot.dmg), 'needs decision', 'alert', 'bad')}
        ${kpi('For repair', n(tot.rep), 'being fixed', 'wrench', 'warn')}
      </div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>Stock per warehouse</h3></div>
        <table class="tbl"><tr><th>Warehouse</th><th class="num">Good</th><th class="num">Reserved</th><th class="num">Available</th><th class="num">Out</th><th class="num">Damaged</th><th class="num">For repair</th></tr>
        ${whs.map(w => { const s = stats(it, w.id); if (!s.total) return ''; const low = s.avail < it.low;
          return `<tr class="${low ? 'flag' : ''}"><td><b>${w.name}</b>${low ? '<small style="color:var(--warn)">Low stock</small>' : ''}</td><td class="num">${n(s.good)}</td><td class="num">${n(s.reserved)}</td><td class="num"><b>${n(s.avail)}</b></td><td class="num">${n(s.out)}</td><td class="num">${s.dmg}</td><td class="num">${s.rep}</td></tr>`; }).join('')}
        </table></div>${unitsHtml}`;
  };

  pages.warehouses = () => head('Warehouses', `${D.warehouses.length} in use · 5 included in the base price`, `<button class="btn primary" data-act="add-warehouse">${ic('plus')}Add warehouse</button>`) + `
    <div class="grid g2">${D.warehouses.map(w => {
      let pcs = 0, out = 0, rep = 0; for (const it of D.items) { const s = stats(it, w.id); pcs += s.total; out += s.out; rep += s.dmg + s.rep; }
      const active = D.orders.filter(o => o.wh === w.id && o.status !== 'Returned').length;
      return `<div class="card"><div class="card-h"><div class="cell-item"><div class="thumb">${ic('wh')}</div><div><b>${w.name}</b><small style="color:var(--ink-3)">${esc(w.address)}</small></div></div><span class="pill ok">Active</span></div>
        <div class="card-b"><p style="margin:0 0 12px;color:var(--ink-2)">${esc(w.description)}</p>
        <div class="grid g4" style="gap:10px;text-align:center">
          <div><div style="font-size:20px;font-weight:800">${n(pcs)}</div><small style="color:var(--ink-3)">pieces</small></div>
          <div><div style="font-size:20px;font-weight:800">${n(out)}</div><small style="color:var(--ink-3)">out</small></div>
          <div><div style="font-size:20px;font-weight:800">${rep}</div><small style="color:var(--ink-3)">repair/damaged</small></div>
          <div><div style="font-size:20px;font-weight:800">${active}</div><small style="color:var(--ink-3)">active orders</small></div>
        </div></div></div>`; }).join('')}
      ${D.warehouses.length < 5 ? `<div class="card" style="display:grid;place-items:center;border-style:dashed;min-height:180px;color:var(--ink-3)"><div style="text-align:center">${ic('plus', 'style="width:26px"')}<div style="font-weight:700;margin-top:6px">${5 - D.warehouses.length} more location${D.warehouses.length === 4 ? '' : 's'} included</div><small>Extra warehouses beyond 5 are billed as a one-time setup fee</small></div></div>` : ''}
    </div>`;

  pages.categories = () => head('Categories', 'How items are grouped', `<button class="btn primary" data-act="add-category">${ic('plus')}Add category</button>`) + `
    <div class="card"><table class="tbl"><tr><th>Category</th><th class="num">Items</th><th class="num">Pieces</th><th>Tracked</th></tr>
    ${D.categories.map(c => { const its = D.items.filter(i => i.cat === c.id); const pcs = its.reduce((a, i) => a + stats(i).total, 0); const tr = [...new Set(its.map(i => i.track === 'unit' ? 'Per unit' : 'By count'))].join(', ');
      return `<tr><td><div class="cell-item"><div class="thumb">${ic(catIcon[c.id] || 'box')}</div><b>${c.name}</b></div></td><td class="num">${its.length}</td><td class="num">${n(pcs)}</td><td>${tr || '-'}</td></tr>`; }).join('')}</table></div>`;

  pages.orders = () => {
    const tab = S.orderTab || 'all';
    const os = visibleOrders().filter(o => tab === 'all' || (tab === 'delivery' && o.type === 'delivery') || (tab === 'pickup' && o.type === 'pickup') || (tab === 'out' && OUT.includes(o.status)) || (tab === 'returned' && o.status === 'Returned'));
    const t = (k, l) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`;
    return head('Orders', S.deliveryOn ? 'Deliveries to events and customer pickups' : 'Customer pickups and returns', `<a class="btn primary" href="#/orders/new">${ic('plus')}New order</a>`) + `
      <div class="tabs">${t('all', 'All')}${S.deliveryOn ? t('delivery', 'Delivery') + t('pickup', 'Pickup') : ''}${t('out', 'Out now')}${t('returned', 'Returned')}</div>
      <div class="card"><table class="tbl"><tr><th>Order</th><th>Type</th><th>Customer</th><th>Warehouse</th><th>Event date</th><th class="num">Pieces</th><th>Status</th></tr>
      ${os.map(o => `<tr class="click" data-go="#/order/${o.id}"><td><b>${esc(o.event)}</b><small>${o.id} · ${esc(o.venue)}</small></td><td>${typeTag(o)}</td><td>${esc(cust(o.cust).name)}</td><td>${wh(o.wh).name}</td><td>${o.date}<small>Return ${o.returnDate}</small></td><td class="num">${n(o.lines.reduce((a, l) => a + lineQty(l), 0))}</td><td>${statusPill(o)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No orders here.</td></tr>'}
      </table></div>`;
  };

  const newOrderDraft = () => {
    const guided = S.guide && curStep()?.key === 'book';
    return guided
      ? { type: 'pickup', wh: 'PSG', cust: 'Mendoza Family', contact: 'Rosa Mendoza', event: 'Mendoza 50th Anniversary', venue: '', date: '2026-11-08', ret: '2026-11-09', lines: [{ sku: 'CHR-TIF-WHT', qty: 450 }, { sku: 'TNT-1020', qty: 1 }] }
      : { type: S.deliveryOn ? 'delivery' : 'pickup', wh: me().whs ? me().whs[0] : 'PSG', cust: 'Mendoza Family', contact: 'Rosa Mendoza', event: 'Mendoza 50th Anniversary', venue: 'Fernwood Gardens, Quezon City', date: '2026-11-14', ret: '2026-11-15', lines: [{ sku: 'CHR-TIF-WHT', qty: 100 }, { sku: 'TNT-1020', qty: 1 }] };
  };
  pages['orders/new'] = () => {
    const f = S.newOrder || (S.newOrder = newOrderDraft());
    const from = toDate(f.date), to = toDate(f.ret), datesOk = to >= from;
    const whOpts = D.warehouses.filter(w => myWh(w.id)).map(w => `<option value="${w.id}" ${f.wh === w.id ? 'selected' : ''}>${w.name}</option>`).join('');
    const lines = f.lines.map((l, i) => {
      const it = item(l.sku), free = datesOk ? freeFor(l.sku, f.wh, from, to) : 0, ok = datesOk && l.qty <= free;
      const holds = datesOk ? holdsFor(l.sku, f.wh, from, to) : [];
      return `<div class="order-line"><select class="in" data-line="${i}" data-k="sku" aria-label="Item">${D.items.map(x => `<option value="${x.sku}" ${x.sku === l.sku ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <input class="in" type="number" min="1" value="${l.qty}" data-line="${i}" data-k="qty" aria-label="Quantity">
        <span class="avail ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✕'} ${n(Math.max(0, free))} free on these dates${holds.length ? `<br><small>Held: ${holds.map(h => `${h.o.id} (${n(h.qty)})`).join(', ')}</small>` : ''}</span>
        <button class="btn sm" data-act="rm-line" data-i="${i}" aria-label="Remove line">${ic('x')}</button></div>`; }).join('');
    const bad = !datesOk || !f.lines.length || f.lines.some(l => l.qty > freeFor(l.sku, f.wh, from, to));
    const fit = datesOk && bad && f.lines.length ? nextFit(f) : null;
    const field = (label, key, val) => `<div class="field"><label class="f">${label}</label><input class="in" data-field="${key}" value="${esc(val)}"></div>`;
    return head('New order', 'Stock is checked for the exact dates, so the same chairs can\'t be booked twice', '', '<a href="#/orders">Orders</a> / New') + `
      <div class="grid g-main">
        <div class="card"><div class="card-b">
          ${S.deliveryOn ? `          <div class="field"><label class="f">How does the customer get the items?</label>
            <div class="choice">
              <label class="${f.type === 'delivery' ? 'on' : ''}"><input type="radio" name="t" value="delivery" ${f.type === 'delivery' ? 'checked' : ''} data-k="type"><div><b>${ic('truck', 'style="width:15px;vertical-align:-2px"')} Delivery</b><small>We bring the items to the event venue. Receiver signs on site.</small></div></label>
              <label class="${f.type === 'pickup' ? 'on' : ''}"><input type="radio" name="t" value="pickup" ${f.type === 'pickup' ? 'checked' : ''} data-k="type"><div><b>${ic('hand', 'style="width:15px;vertical-align:-2px"')} Pickup</b><small>Customer collects at the warehouse. Signs at the counter.</small></div></label>
            </div></div>` : ''}
          <div class="grid g2" style="gap:12px">
            ${field('Customer', 'cust', f.cust)}${field('Event name', 'event', f.event)}
            ${f.type === 'delivery' ? field('Venue address', 'venue', f.venue) : ''}
            <div class="field"><label class="f">Warehouse</label><select class="in" data-k="wh">${whOpts}</select></div>
            <div class="field"><label class="f">${f.type === 'delivery' ? 'Delivery date' : 'Pickup date'}</label><input class="in" type="date" data-k="date" value="${f.date}"></div>
            <div class="field"><label class="f">Return date</label><input class="in" type="date" data-k="ret" value="${f.ret}"></div>
          </div>
          <label class="f" style="margin-top:6px">Items</label>
          ${lines}
          <button class="btn sm" data-act="add-line">${ic('plus')}Add item</button>
        </div></div>
        <div class="stack"><div class="card"><div class="card-h"><h3>Summary</h3></div><div class="card-b">
          <dl class="dl"><dt>Type</dt><dd>${f.type === 'delivery' ? 'Delivery' : 'Pickup'}</dd><dt>Warehouse</dt><dd>${wh(f.wh).name}</dd><dt>Dates</dt><dd>${datesOk ? `${fmtShort(from)} to ${fmtShort(to)}` : 'Check the dates'}</dd><dt>Pieces</dt><dd>${n(f.lines.reduce((a, l) => a + Number(l.qty || 0), 0))}</dd></dl>
          <div style="margin-top:14px">${!datesOk ? note('The return date is before the pickup date.', 'bad') : bad ? note('<b>Would be double-booked.</b> Some items are already held on these dates. Change the dates, lower the quantity, or pick another warehouse.', 'bad') : note('Stock is free on these dates. It will be <b>held</b> as soon as the order is saved, so no one else can book it.', 'ok')}</div>
          ${fit ? `<button class="btn" style="width:100%;justify-content:center;margin-top:10px" data-act="use-dates" data-a="${isoDate(fit[0])}" data-b="${isoDate(fit[1])}">Use the next dates that fit: ${fmtShort(fit[0])} to ${fmtShort(fit[1])}</button>` : ''}
          <button class="btn primary" style="width:100%;justify-content:center;margin-top:10px" data-act="save-order" ${bad ? 'disabled' : ''}>Save order</button>
          <p style="font-size:12px;color:var(--ink-3);margin:10px 0 0">Each order also holds stock for ${BUFFER_DAYS} turnaround day after its return date. <a href="#/calendar">See the availability calendar</a></p>
        </div></div></div>
      </div>`;
  };

  pages.calendar = () => {
    const opts = D.warehouses.filter(w => myWh(w.id));
    if (!opts.some(w => w.id === S.calWh)) S.calWh = opts[0].id;
    const days = Array.from({ length: 14 }, (_, i) => addDays(TODAY, i));
    const rows = D.items.filter(it => owned(it.sku, S.calWh) > 0);
    return head('Availability', 'How many pieces are free each day, after every order and turnaround day') + `
      <div class="filters"><select class="in" data-cal aria-label="Warehouse">${opts.map(w => `<option value="${w.id}" ${w.id === S.calWh ? 'selected' : ''}>${w.name}</option>`).join('')}</select></div>
      <div class="legend"><span><i class="cal-key"></i>Plenty free</span><span><i class="cal-key low"></i>Running low</span><span><i class="cal-key none"></i>None free</span></div>
      <div class="card scroll-x"><table class="tbl cal"><tr><th>Item</th>${days.map(d => `<th class="num ${[0, 6].includes(d.getDay()) ? 'wknd' : ''}">${d.toLocaleDateString('en-US', { weekday: 'short' })}<br>${fmtShort(d)}</th>`).join('')}</tr>
      ${rows.map(it => `<tr><td class="cal-item"><a href="#/item/${it.sku}">${esc(it.name)}</a><small>${n(owned(it.sku, S.calWh))} owned</small></td>${days.map(d => { const fr = freeFor(it.sku, S.calWh, d, d), hs = holdsFor(it.sku, S.calWh, d, d);
        return `<td class="num ${fr <= 0 ? 'none' : fr <= it.low ? 'low' : ''} ${[0, 6].includes(d.getDay()) ? 'wknd' : ''}" title="${hs.length ? 'Held by ' + hs.map(h => `${h.o.id} (${h.qty})`).join(', ') : 'Nothing held'}">${n(Math.max(0, fr))}</td>`; }).join('')}</tr>`).join('')}</table></div>`;
  };

  pages.setup = () => {
    const lower = S.setupDone ? note('Setup is finished. You can change any of this later in Settings.', 'ok') : '';
    return head('Set up your business', 'Only what WIMS needs to start. Everything can be changed later.', '', '') + `
      <div class="grid g-main">
        <div class="stack">
          <div class="card"><div class="card-h"><h3>1. Company</h3></div><div class="card-b"><div class="field" style="margin:0"><label class="f">Company name (printed on clearances and labels)</label><input class="in" data-company value="${esc(S.company)}"></div></div></div>
          <div class="card"><div class="card-h"><h3>2. Warehouses</h3><span class="sub">${D.warehouses.length} of 5 included</span></div><ul class="feed">${D.warehouses.map(w => `<li><span class="dot ok"></span><div><b>${w.name}</b><small>${esc(w.address)}</small></div></li>`).join('')}</ul></div>
          <div class="card"><div class="card-h"><h3>3. Items and stock</h3><span class="pill ok">Imported</span></div><div class="card-b" style="font-size:13.5px">${note(`<b>${D.items.length} items</b> imported from your Excel file, with stock for each warehouse. Tents, sound gear and LED lights are tracked per unit; the rest by count.`, 'ok')}</div></div>
          <div class="card"><div class="card-h"><h3>4. Team</h3>${S.rolesOn ? '' : `<span class="sub">${accounts().length} of ${MAX_USERS} accounts</span>`}</div><div class="scroll-x"><table class="tbl"><tr><th>Name</th><th>Role</th><th>Warehouses</th></tr>${accounts().filter(u => u.active).map(u => `<tr><td><b>${u.name}</b></td><td>${S.rolesOn ? u.role : 'Full access'}</td><td>${S.rolesOn ? u.wh : 'All warehouses'}</td></tr>`).join('')}</table></div></div>
        </div>
        <div class="stack"><div class="card"><div class="card-b">
          <h3 style="margin:0 0 6px;font-size:15px">Ready to start</h3><p style="margin:0 0 14px;color:var(--ink-2);font-size:13.5px">This sample business is already filled in. A real setup uses your own list.</p>
          ${lower}${S.setupDone ? '' : `<button class="btn primary" style="width:100%;justify-content:center" data-act="finish-setup">${ic('check')}Finish setup</button>`}
        </div></div></div>
      </div>`;
  };

  pages.welcome = () => `<main class="welcome"><div class="welcome-card">
      <div class="brand"><div class="brand-mark">WI</div><div><b>WIMS</b><small>Warehouse Inventory Management System</small></div></div>
      <h1>See one order go from booking to return</h1>
      <p class="lead">This is Package A: customers collect items at the warehouse and bring them back. You'll set up a sample rental business, then run one order through it. It takes a few minutes, and everything here is sample data.</p>
      <ol class="w-steps">${steps().map((x, i) => `<li><span class="n">${i + 1}</span><div><b>${x.label}</b>${S.rolesOn ? `<span class="who-sm">${ME[x.role].role}</span>` : ''}<small>${x.summary}</small></div></li>`).join('')}</ol>
      <div class="w-actions"><button class="btn primary" data-act="start-guide">${S.setupDone ? 'Continue the guide' : 'Start the guide'} ${ic('arrow')}</button><button class="btn" data-act="skip-guide">Explore on my own</button></div>
    </div></main>`;

  const EXPLORE = [['#/inventory?as=admin', 'Add your own item', 'Inventory → Add item, then book it on an order'], ['#/orders/new', 'Try to double-book', 'Book the same chairs on a busy date'], ['#/calendar', 'Availability calendar', 'What is free each day, per warehouse'], ['#/item/TNT-1020/TNT-1020-007', 'Per-unit history', 'Every event and damage report for one tent'], ['#/scan', 'Scan a real QR code', 'Use your phone camera on a sample label'], ['#/labels', 'QR labels', 'Print stickers for items and units'], ['#/phone', 'On the phone', 'Scanning, and signing for items'], ['#/approvals?as=supervisor', 'Approvals', 'What the supervisor sees'], ['#/reports?as=admin', 'Reports', 'Stock, discrepancies, damage per item'], ['#/settings?as=admin&tab=package', 'See the add-ons', 'Switch on delivery, or roles and approvals']];
  const seenKey = h => h.replace(/[?&]as=\w+/, '');
  const exploreList = () => EXPLORE.filter(e => S.rolesOn || !e[0].startsWith('#/approvals'));
  const exploreSeen = () => exploreList().filter(e => S.seen[seenKey(e[0])]).length;
  pages.done = () => {
    const o = story();
    if (!o || o.status !== 'Returned') return head('Guide summary', 'Finish the guide to see the full record of your order.') + `<a class="btn primary" href="#/welcome">Go to the guide</a>`;
    const reports = D.damage.filter(d => d.order === o.id);
    return head('That\'s the whole flow', `${o.id} · ${esc(o.event)}: every step is on record`) + `
      <div class="grid g-main">
        <div class="card"><div class="card-h"><h3>The record of this order</h3></div><ul class="feed">
          <li><span class="dot ok"></span><div><b>Booked</b> for ${o.date} to ${o.returnDate}, with stock held for those dates</div></li>
          <li><span class="dot ok"></span><div><b>Checked by ${o.check.by}</b><small>${o.check.at}</small></div></li>
          ${S.rolesOn && o.approval ? `<li><span class="dot ok"></span><div><b>Approved by ${o.approval.by}</b><small>${o.approval.at}</small></div></li>` : ''}
          <li><span class="dot ok"></span><div><b>Signed for by ${esc(o.clearance.by)}</b> · <a href="#/clearance/${o.id}">view the clearance</a><small>${o.clearance.at}</small></div></li>
          <li><span class="dot ${reports.length ? 'bad' : 'ok'}"></span><div><b>Returned</b> ${reports.length ? `with ${reports.length} report${reports.length > 1 ? 's' : ''} filed` : 'complete, in the same condition'}${reports.length ? `<small>${reports.map(d => `<a href="#/damage/${d.id}">${d.id}</a>`).join(' · ')}</small>` : ''}</div></li>
        </ul></div>
        <div class="stack"><div class="card"><div class="card-h"><h3>Explore the rest</h3><span class="sub">${exploreSeen()} of ${exploreList().length} seen</span></div><ul class="feed">${exploreList().map(e => `<li><span class="dot ${S.seen[seenKey(e[0])] ? 'ok' : ''}"></span><div><a href="${e[0]}">${e[1]}</a><small>${e[2]}</small></div></li>`).join('')}</ul></div>
        <button class="btn" style="width:100%;justify-content:center" data-act="restart">Start over</button></div>
      </div>`;
  };

  pages.order = id => {
    const o = order(id); if (!o) return notFound();
    const c = cust(o.cust), flow = FLOW[o.type].filter(x => S.rolesOn || x !== 'For Approval'), idx = flow.indexOf(o.status);
    const tl = flow.map((st, i) => `<div class="st ${i < idx || o.status === 'Returned' ? 'done' : i === idx ? 'now' : ''}"><div class="b">${i < idx || o.status === 'Returned' ? ic('check') : ''}</div>${st}</div>`).join('');
    const rel = S.release[id];
    let action = '';
    if (o.status === 'Preparing') action = `<a class="btn primary" href="#/release/${id}">${ic('clip')}${o.sentBack ? 'Fix and resubmit checklist' : 'Start checklist'}</a>`;
    else if (o.status === 'For Approval') action = canApprove(o) ? `<a class="btn primary" href="#/approve/${id}">${ic('check')}Review and approve</a>` : `<span class="pill warn" style="padding:8px 12px">Waiting for ${supervisorOf(o.wh)} (Supervisor)</span>`;
    else if (o.status === 'Ready for Pickup') action = `<a class="btn primary" href="#/sign/${id}">${ic('hand')}Customer is here: sign clearance</a>`;
    else if (o.status === 'Ready to Dispatch') action = `<button class="btn primary" data-act="dispatch" data-id="${id}">${ic('truck')}Dispatch: mark In Transit</button>`;
    else if (o.status === 'In Transit') action = `<a class="btn primary" href="#/sign/${id}">${ic('sign')}Hand over at venue (receiver signs)</a>`;
    else if (o.status === 'Delivered') action = `<button class="btn primary" data-act="status" data-to="Returning">${ic('truck')}Collect from venue</button>`;
    else if (o.status === 'Returning' || o.status === 'Picked Up') action = `<a class="btn primary" href="#/return/${id}">${ic('ret')}Process return</a>`;
    const dmgs = D.damage.filter(d => d.order === id);
    const lineRows = o.lines.map((l, i) => {
      const it = item(l.sku);
      const relC = rel ? (l.units ? l.units.map(u => rel.cond[u] || 'good') : [rel.cond['L' + i] || 'good']) : null;
      let back = '';
      if (o.status === 'Returned') {
        if (l.units) back = l.units.map(u => `<span class="mono">${u.slice(-3)}</span> ${condPill((l.unitBack || {})[u] || 'good')}`).join('<br>');
        else { const miss = l.qty - l.back; back = `${n(l.back)} back${l.dmg ? `, <b style="color:var(--bad)">${l.dmg} damaged</b>` : ''}${l.rep ? `, <b style="color:var(--warn)">${l.rep} for repair</b>` : ''}${miss ? `, <b style="color:var(--bad)">${miss} missing</b>` : ''}`; }
      }
      return `<tr class="${o.status === 'Returned' && ((l.back !== undefined && (l.back < l.qty || l.dmg || l.rep)) || Object.values(l.unitBack || {}).some(x => x !== 'good')) ? 'flag' : ''}"><td>${lineLabel(l)}</td><td>${l.units ? l.units.map(u => `<span class="mono">${u}</span>`).join('<br>') : '-'}</td><td class="num">${n(lineQty(l))}</td><td>${relC ? [...new Set(relC)].map(condPill).join(' ') : (o.clearance ? condPill('good') : '<span style="color:var(--ink-3)">Not released yet</span>')}</td>${o.status === 'Returned' ? `<td>${back}</td>` : ''}</tr>`; }).join('');
    return head(`${esc(o.event)}`, `${o.id} · ${typeTag(o)} · ${statusPill(o)}`, action, `<a href="#/orders">Orders</a> / ${o.id}`) + `
      <div class="card"><div class="card-b"><div class="timeline">${tl}</div></div></div>
      <div class="grid g-main" style="margin-top:16px">
        <div class="card"><div class="card-h"><h3>Items</h3><span class="sub">${n(o.lines.reduce((a, l) => a + lineQty(l), 0))} pieces</span></div>
          <table class="tbl"><tr><th>Item</th><th>Units</th><th class="num">Qty</th><th>Condition at release</th>${o.status === 'Returned' ? '<th>Returned</th>' : ''}</tr>${lineRows}</table></div>
        <div class="stack">
          <div class="card"><div class="card-h"><h3>Details</h3></div><div class="card-b"><dl class="dl">
            <dt>Customer</dt><dd>${esc(c.name)}</dd><dt>Contact</dt><dd>${esc(c.contact)} · ${c.phone}</dd>
            <dt>${o.type === 'delivery' ? 'Venue' : 'Pickup at'}</dt><dd>${esc(o.venue)}</dd><dt>Warehouse</dt><dd>${wh(o.wh).name}</dd>
            <dt>${o.type === 'delivery' ? 'Delivery' : 'Pickup'}</dt><dd>${o.date}</dd><dt>Return</dt><dd>${o.returnDate}</dd></dl></div></div>
          <div class="card"><div class="card-h"><h3>${S.rolesOn ? 'Checklist &amp; approval' : 'Checklist'}</h3>${S.rolesOn && o.approval ? '<span class="pill ok">Approved</span>' : o.status === 'For Approval' ? '<span class="pill warn">For approval</span>' : o.sentBack ? '<span class="pill bad">Sent back</span>' : o.check || o.clearance ? '<span class="pill ok">Done</span>' : '<span class="pill mute">Not started</span>'}</div><ul class="feed">
            ${o.sentBack ? `<li><span class="dot bad"></span><div><b>Sent back by ${o.sentBack.by}</b>: ${esc(o.sentBack.reason)}<small>${o.sentBack.at}</small></div></li>` : ''}
            ${o.check ? `<li><span class="dot ok"></span><div><b>Checklist by ${o.check.by}</b>${S.rolesOn ? ' (Staff)' : ''}${o.check.note ? `: “${esc(o.check.note)}”` : ''}<small>${o.check.at}</small></div></li>` : !o.clearance ? `<li><span class="dot"></span><div>${S.rolesOn ? `Staff count every line and submit the checklist<small>Then ${supervisorOf(o.wh)} (Supervisor) approves it</small>` : 'Count every line and record its condition'}</div></li>` : ''}
            ${S.rolesOn && o.approval ? `<li><span class="dot ok"></span><div><b>Approved by ${o.approval.by}</b> (${o.approval.role || 'Supervisor'})<small>${o.approval.at}</small></div></li>` : o.status === 'For Approval' ? `<li><span class="dot warn"></span><div>Waiting for <b>${supervisorOf(o.wh)}</b> (Supervisor)<small>Submitted ${o.check.at}</small></div></li>` : ''}
            ${o.clearance && !o.check ? `<li><span class="dot ok"></span><div>${S.rolesOn ? 'Checked and approved' : 'Checked'} before release<small>${o.clearance.at}</small></div></li>` : ''}
          </ul></div>
          <div class="card"><div class="card-h"><h3>Clearance</h3>${o.clearance ? '<span class="pill ok">Signed</span>' : '<span class="pill mute">Not signed yet</span>'}</div><div class="card-b">
            ${o.clearance ? `<div class="sig-img">${S.sigs[id] ? `<img src="${S.sigs[id]}">` : scribble(o.clearance.by)}</div><p style="margin:8px 0 12px;font-size:13px"><b>${esc(o.clearance.by)}</b>, ${esc(o.clearance.role)}<br><span style="color:var(--ink-3)">${o.clearance.at} · ${esc(o.clearance.where)}</span></p><a class="btn sm" href="#/clearance/${id}">${ic('eye')}View / print clearance</a>`
              : `<p style="margin:0;color:var(--ink-2);font-size:13px">${o.type === 'pickup' ? 'The customer signs at the counter after the release checklist is complete.' : 'The receiver signs at the venue on the staff member\'s phone when the items are handed over.'}</p>`}
          </div></div>
          ${dmgs.length ? `<div class="card"><div class="card-h"><h3>Damage &amp; loss</h3><span class="pill bad">${dmgs.length}</span></div><ul class="feed">${dmgs.map(d => `<li><span class="dot bad"></span><div><a href="#/damage/${d.id}">${d.id}: ${esc(item(d.sku).name)}${d.unit ? ` <span class="mono">${d.unit}</span>` : ` × ${d.qty}`}</a><small>${condName(d.before)} → ${condName(d.after)} · ${d.status}</small></div></li>`).join('')}</ul></div>` : ''}
        </div>
      </div>`;
  };

  pages.release = id => {
    const o = order(id); if (!o) return notFound();
    if (o.status === 'For Approval') return head('Checklist submitted', `${o.id} · ${esc(o.event)}`) + note(`Submitted by ${o.check.by} on ${o.check.at}. Waiting for <b>${supervisorOf(o.wh)}</b> (Supervisor) to approve.`, 'warn') + `<p><a class="btn" href="#/order/${id}">Back to order</a> ${canApprove(o) ? `<a class="btn primary" href="#/approve/${id}">Review and approve</a>` : ''}</p>`;
    if (o.status !== 'Preparing') return head('Checklist', `${o.id} checklist is done and approved.`) + `<a class="btn" href="#/order/${id}">Back to order</a>`;
    const r = S.release[id] || (S.release[id] = { ticks: {}, cond: {} });
    const keys = []; o.lines.forEach((l, i) => l.units ? l.units.forEach(u => keys.push(u)) : keys.push('L' + i));
    const done = keys.filter(k => r.ticks[k]).length, all = done === keys.length;
    const condSel = k => `<select class="in" data-cond="${k}">${['good', 'minor', 'damaged'].map(c => `<option value="${c}" ${(r.cond[k] || 'good') === c ? 'selected' : ''}>${condName(c)}</option>`).join('')}</select>`;
    const tick = k => `<button class="tick ${r.ticks[k] ? 'on' : ''}" data-tick="${k}">${ic('check')}</button>`;
    const rows = o.lines.map((l, i) => {
      const it = item(l.sku);
      if (!l.units) return `<div class="check-row ${r.ticks['L' + i] ? 'done' : ''}" id="row-L${i}">${tick('L' + i)}<div class="lab">${lineLabel(l)}</div><div><b>${n(l.qty)} pcs</b><small style="display:block;color:var(--ink-3)">counted</small></div>${condSel('L' + i)}</div>`;
      return `<div class="check-group"><div class="check-group-h">${thumb(it)}<div>${esc(it.name)} <small class="mono" style="color:var(--ink-3)">${it.sku}</small><small style="display:block;color:var(--ink-3);font-weight:500">Tracked per unit: check each one</small></div></div>
        ${l.units.map(u => `<div class="check-row unit ${r.ticks[u] ? 'done' : ''}" id="row-${u}">${tick(u)}<div class="lab"><b class="mono">${u}</b></div><div>1 unit</div>${condSel(u)}</div>`).join('')}</div>`;
    }).join('');
    const isPickup = o.type === 'pickup';
    return head('Checklist', `${o.id} · ${esc(o.event)} · ${typeTag(o)} · from ${wh(o.wh).name}`, `<button class="btn primary" data-act="scan-check" data-id="${id}">${ic('cam')}Scan with camera</button><button class="btn" data-act="scan" data-id="${id}">Simulate a scan</button>`, `<a href="#/orders">Orders</a> / <a href="#/order/${id}">${o.id}</a> / Release`) + `
      <div class="grid g-main">
        <div class="card"><div class="card-h"><h3>Count every line and record its condition</h3><span class="sub">${done} of ${keys.length} checked</span></div>${rows}</div>
        <div class="stack"><div class="card"><div class="card-b">
          <div style="display:flex;justify-content:space-between;font-weight:700;margin-bottom:8px"><span>Progress</span><span>${Math.round(done / keys.length * 100)}%</span></div>
          <div class="progress"><div style="width:${done / keys.length * 100}%"></div></div>
          ${o.sentBack ? `<div style="margin-top:16px">${note(`<b>Sent back by ${o.sentBack.by}:</b> ${esc(o.sentBack.reason)}`, 'bad')}</div>` : ''}
          <div style="margin:16px 0">${all ? note(S.rolesOn ? `All ${keys.length} lines checked. Submit it to <b>${supervisorOf(o.wh)}</b> (Supervisor) for approval.` : `All ${keys.length} lines checked. The order can go out.`, 'ok') : note(`<b>${S.rolesOn ? 'Submit' : 'Release'} is locked</b> until every line is checked. ${keys.length - done} left.`, 'warn')}</div>
          <div class="field"><label class="f">${S.rolesOn ? 'Note for the supervisor' : 'Note'} (optional)</label><textarea class="in" rows="2" id="chk-note" placeholder="e.g. 1 table has a scratched top"></textarea></div>
          <button class="btn primary" style="width:100%;justify-content:center" data-act="submit-check" data-id="${id}" ${all ? '' : 'disabled'}>${ic('arrow')}${S.rolesOn ? 'Submit for supervisor approval' : isPickup ? 'Mark ready for pickup' : 'Mark ready to dispatch'}</button>
          <p style="font-size:12px;color:var(--ink-3);margin:12px 0 0">Checked by ${me().name} · ${wh(o.wh).name}. ${S.rolesOn ? 'After approval, ' : 'Next, '}${isPickup ? 'the customer signs the clearance at the counter' : 'the order can be dispatched and the receiver signs at the venue'}.</p>
        </div></div></div>
      </div>`;
  };

  function signForm(o, compact) {
    const c = cust(o.cust), r = S.release[o.id];
    const items = o.lines.map((l, i) => { const it = item(l.sku);
      const conds = l.units ? l.units.map(u => `<span class="mono">${u}</span> ${condPill(r?.cond[u] || 'good')}`).join('<br>') : `${n(l.qty)} pcs ${condPill(r?.cond['L' + i] || 'good')}`;
      return compact ? `<div class="r"><div style="flex:1"><b>${esc(it.name)}</b><div style="font-size:11px;color:var(--ink-3)">${l.units ? l.units.length + ' units' : n(l.qty) + ' pcs'} · ${condName(l.units ? 'good' : (r?.cond['L' + i] || 'good'))}</div></div></div>`
        : `<tr><td>${lineLabel(l)}</td><td>${conds}</td></tr>`; }).join('');
    const statement = `I confirm that I received the items listed above, complete and in the condition stated, for <b>${esc(o.event)}</b>. I am responsible for returning them in the same condition by <b>${o.returnDate}</b>.`;
    return { items, statement, c };
  }

  pages.sign = id => {
    const o = order(id); if (!o) return notFound();
    if (o.clearance) return head('Clearance', 'Already signed.') + `<a class="btn" href="#/clearance/${id}">View clearance</a>`;
    if (o.type === 'pickup' && o.status !== 'Ready for Pickup') return head('Customer clearance', `${o.id} · ${esc(o.event)}`) + note(o.status === 'For Approval' ? `The checklist is waiting for ${supervisorOf(o.wh)} (Supervisor) to approve. The customer signs after approval.` : 'Staff must finish the checklist and the supervisor must approve it before the customer signs.', 'warn') + `<p><a class="btn primary" href="#/order/${id}">Back to order</a></p>`;
    if (o.type === 'delivery' && o.status !== 'In Transit') return head('Receiver clearance', `${o.id} is ${o.status}.`) + `<a class="btn" href="#/order/${id}">Back to order</a>`;
    const { items, statement, c } = signForm(o);
    const at = o.type === 'pickup' ? `the ${wh(o.wh).name} counter` : esc(o.venue);
    return head(o.type === 'pickup' ? 'Customer clearance' : 'Receiver clearance at venue', `${o.id} · ${esc(o.event)} · signed at ${at}`, '', `<a href="#/order/${id}">${o.id}</a> / Clearance`) + `
      <div class="grid g-main">
        <div class="card"><div class="card-h"><h3>Items being handed over</h3><span class="sub">Condition recorded at release</span></div><table class="tbl"><tr><th>Item</th><th>Qty / units and condition</th></tr>${items}</table></div>
        <div class="card"><div class="card-h"><h3>Sign to confirm</h3></div><div class="card-b">
          <p style="margin:0 0 14px;font-size:13.5px;line-height:1.55">${statement}</p>
          <div class="field"><label class="f">Full name</label><input class="in" id="sig-name" value="${esc(c.contact)}"></div>
          <div class="field"><label class="f">Relationship to customer</label><select class="in" id="sig-role"><option>${o.type === 'pickup' ? 'Customer' : 'Client representative'}</option><option>Authorized representative</option><option>Venue coordinator</option></select></div>
          <div class="field"><label class="f">Valid ID (optional)</label><input class="in" placeholder="e.g. Driver's license no."></div>
          <label class="f">Signature</label>
          <div class="sig-pad"><canvas id="sig"></canvas><div class="hint">Sign here with a finger or mouse</div></div>
          <div style="display:flex;justify-content:space-between;margin-top:8px"><button class="btn sm" data-act="sig-clear">Clear</button><small style="color:var(--ink-3)">${now()}</small></div>
          <button class="btn ok" style="width:100%;justify-content:center;margin-top:14px" id="sig-ok" data-act="sign" data-id="${id}" disabled>${ic('check')}Confirm and sign</button>
        </div></div>
      </div>`;
  };

  pages.clearance = id => {
    const o = order(id); if (!o || !o.clearance) return notFound();
    const c = cust(o.cust), r = S.release[id];
    const rows = o.lines.map((l, i) => { const it = item(l.sku);
      if (l.units) return l.units.map(u => `<tr><td>${esc(it.name)}</td><td class="mono">${u}</td><td class="num">1</td><td>${condName(r?.cond[u] || 'good')}</td></tr>`).join('');
      return `<tr><td>${esc(it.name)}</td><td class="mono">${it.sku}</td><td class="num">${n(l.qty)}</td><td>${condName(r?.cond['L' + i] || 'good')}</td></tr>`; }).join('');
    return `<div class="no-print">${head('Clearance', `${o.id} · ${esc(o.event)}`, `<button class="btn primary" data-act="print">${ic('print')}Print</button><a class="btn" href="#/order/${id}">Back to order</a>`, `<a href="#/order/${id}">${o.id}</a> / Clearance`)}</div>
      <div class="clearance-doc">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div><div style="font-weight:800;color:var(--blue);font-size:13px;letter-spacing:.04em">${esc(S.company).toUpperCase()}</div><h2>${o.type === 'pickup' ? 'Pickup' : 'Delivery'} Clearance</h2><div class="mono" style="color:var(--ink-3);margin-top:2px">CLR-${o.id.slice(4)} · ${o.id}</div></div>
          <span class="stamp">SIGNED</span>
        </div>
        <dl class="dl" style="margin:22px 0;grid-template-columns:150px 1fr 120px 1fr">
          <dt>Customer</dt><dd>${esc(c.name)}</dd><dt>Event</dt><dd>${esc(o.event)}</dd>
          <dt>${o.type === 'pickup' ? 'Released at' : 'Delivered to'}</dt><dd>${esc(o.type === 'pickup' ? wh(o.wh).name + ' warehouse' : o.venue)}</dd><dt>Return by</dt><dd>${o.returnDate}</dd>
        </dl>
        <table class="tbl" style="border:1px solid var(--line)"><tr><th>Item</th><th>SKU / Unit</th><th class="num">Qty</th><th>Condition</th></tr>${rows}</table>
        <p style="margin:22px 0;font-size:13.5px;line-height:1.6">I confirm that I received the items listed above, complete and in the condition stated, for <b>${esc(o.event)}</b>. I am responsible for returning them in the same condition by <b>${o.returnDate}</b>. Missing or damaged items may be charged.</p>
        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:30px;margin-top:30px">
          <div><div class="sig-img">${S.sigs[id] ? `<img src="${S.sigs[id]}">` : scribble(o.clearance.by)}</div><div style="margin-top:6px"><b>${esc(o.clearance.by)}</b><br><small style="color:var(--ink-3)">${esc(o.clearance.role)} · ${o.clearance.at}</small></div></div>
          <div style="text-align:right;font-size:13px;line-height:1.6"><div><b>Checked by:</b> ${o.check?.by || (o.wh === 'TGG' ? 'Jomar Ramos' : 'Maria Santos')}</div>${S.rolesOn ? `<div><b>Approved by:</b> ${o.approval?.by || (o.wh === 'TGG' || o.wh === 'QC' ? 'Juan Dela Cruz' : 'Rico Bautista')}</div>` : ''}<small style="color:var(--ink-3)">Signed at ${esc(o.clearance.where)}</small></div>
        </div>
      </div>`;
  };

  pages.return = id => {
    const o = order(id); if (!o) return notFound();
    if (!['Returning', 'Picked Up'].includes(o.status)) return head('Return', `${o.id} is ${o.status}.`) + `<a class="btn" href="#/order/${id}">Back to order</a>`;
    const r = S.ret[id] || (S.ret[id] = { back: {}, dmg: {}, rep: {}, unit: {}, scanned: {} });
    const flags = [];
    const countRows = o.lines.map((l, i) => {
      if (l.units) return '';
      const k = 'L' + i, back = r.back[k] ?? l.qty, dmg = r.dmg[k] ?? 0, rep = r.rep[k] ?? 0;
      const miss = Math.max(0, l.qty - back), good = Math.max(0, back - dmg - rep);
      const it = item(l.sku);
      if (miss) flags.push(`<b>${miss} × ${esc(it.name)}</b> missing`);
      if (dmg) flags.push(`<b>${dmg} × ${esc(it.name)}</b> damaged`);
      if (rep) flags.push(`<b>${rep} × ${esc(it.name)}</b> need repair`);
      return `<div class="ret-row ${miss || dmg || rep ? 'flag' : ''}"><div>${lineLabel(l)}</div><div class="num"><b>${n(l.qty)}</b><small style="display:block;color:var(--ink-3)">good</small></div>
        <label class="ret-f"><span>Returned</span><input class="in" type="number" min="0" max="${l.qty}" value="${back}" data-ret="back" data-k="${k}"></label><label class="ret-f"><span>Damaged</span><input class="in" type="number" min="0" value="${dmg}" data-ret="dmg" data-k="${k}"></label><label class="ret-f"><span>For repair</span><input class="in" type="number" min="0" value="${rep}" data-ret="rep" data-k="${k}"></label>
        <div>${miss ? `<span class="pill bad">${miss} missing</span> ` : ''}${dmg ? `<span class="pill bad">${dmg} damaged</span> ` : ''}${rep ? `<span class="pill warn">${rep} repair</span> ` : ''}${!miss && !dmg && !rep ? `<span class="pill ok">${n(good)} good, complete</span>` : ''}</div></div>`; }).join('');
    const unitRows = o.lines.filter(l => l.units).map(l => { const it = item(l.sku);
      return `<div class="check-group-h" style="padding-top:14px">${thumb(it)}<div>${esc(it.name)} <small style="color:var(--ink-3);font-weight:500">· per unit</small></div></div>` + l.units.map(u => {
        const c = r.unit[u] || 'good'; if (c !== 'good') flags.push(`<b class="mono">${u}</b> ${condName(c).toLowerCase()}`);
        return `<div class="ret-unit ${c !== 'good' ? 'flag' : ''}"><div><b class="mono">${u}</b> ${r.scanned[u] ? '<span class="pill ok nodot">scanned</span>' : ''}<small style="display:block;color:var(--ink-3)">Released: good</small></div>
          <select class="in" data-unit="${u}">${['good', 'damaged', 'repair', 'missing'].map(x => `<option value="${x}" ${c === x ? 'selected' : ''}>${condName(x)}</option>`).join('')}</select>
          <div>${c === 'good' ? '<span class="pill ok">Same as released</span>' : `<span class="pill bad">Good → ${condName(c)}</span>`}</div></div>`; }).join(''); }).join('');
    return head('Process return', `${o.id} · ${esc(o.event)} · ${esc(cust(o.cust).name)}`, `<button class="btn" data-act="scan-ret" data-id="${id}">${ic('cam')}Scan a unit</button>`, `<a href="#/orders">Orders</a> / <a href="#/order/${id}">${o.id}</a> / Return`) + `
      <div class="grid g-main">
        <div class="card"><div class="card-h"><h3>Released vs. returned</h3><span class="sub">Released condition comes from the signed clearance</span></div>
          ${countRows ? `<div class="ret-row h"><div>Item</div><div class="num">Released</div><div>Returned</div><div>Damaged</div><div>For repair</div><div>Result</div></div>${countRows}` : ''}
          ${unitRows}
        </div>
        <div class="stack"><div class="card"><div class="card-h"><h3>Result</h3></div><div class="card-b">
          ${flags.length ? note(`<b>${flags.length} issue${flags.length > 1 ? 's' : ''} found</b><ul style="margin:6px 0 0;padding-left:18px">${flags.map(f => `<li>${f}</li>`).join('')}</ul>`, 'bad') : note('Everything is back, in the same condition it left.', 'ok')}
          ${flags.length ? `<div class="field" style="margin-top:14px"><label class="f">Photos of damage</label><div class="photo" style="aspect-ratio:auto;height:90px;cursor:pointer" data-act="toast" data-msg="Taking photos: available in the full system">${ic('cam', 'style="width:28px"')}<span class="cap">Tap to add photos</span></div></div>
          <div class="field"><label class="f">Notes</label><textarea class="in" rows="2" placeholder="What happened?"></textarea></div>` : ''}
          <button class="btn primary" style="width:100%;justify-content:center;margin-top:14px" data-act="finish-return" data-id="${id}">${ic('check')}Complete return${flags.length ? ' and file reports' : ''}</button>
          <p style="font-size:12px;color:var(--ink-3);margin:10px 0 0">Good items go back to available stock. Damaged ones move to damaged / for repair. Missing ones are flagged for review.</p>
        </div></div>
        <div class="card"><div class="card-h"><h3>Clearance on file</h3></div><div class="card-b" style="font-size:13px">${o.clearance ? `Signed by <b>${esc(o.clearance.by)}</b><br><span style="color:var(--ink-3)">${o.clearance.at}</span><br><a href="#/clearance/${id}">View clearance →</a>` : 'None'}</div></div></div>
      </div>`;
  };

  pages.damage = (id) => {
    if (id) {
      const d = D.damage.find(x => x.id === id); if (!d) return notFound();
      const o = order(d.order) || { id: d.order, event: 'TechCon Product Launch', clearance: { at: 'Oct 17, 2026 · 8:10 AM', by: 'Mark Villanueva', role: 'Customer', where: 'Taguig warehouse' } }, it = item(d.sku), c = cust(d.cust);
      return head(`${d.id}: ${esc(it.name)}${d.unit ? ` <span class="mono" style="font-size:.8em">${d.unit}</span>` : ` × ${d.qty}`}`, `${condName(d.before)} → ${condName(d.after)} · reported ${d.date} by ${d.by}`,
        S.role === 'admin' ? `<button class="btn" data-act="damage-status" data-id="${d.id}" data-to="Under repair">${ic('wrench')}Send to repair</button><button class="btn" data-act="damage-status" data-id="${d.id}" data-to="Written off">Write off</button><button class="btn primary" data-act="damage-status" data-id="${d.id}" data-to="Charged to customer">Charge customer</button>` : '',
        `<a href="#/damage">Damage &amp; loss</a> / ${d.id}`) + `
        <div class="grid g-main">
          <div class="stack">
            <div class="card"><div class="card-h"><h3>Proof chain</h3><span class="sub">Every step is logged automatically</span></div><ul class="feed">
              <li><span class="dot ok"></span><div><b>Released in good condition</b>, counted on the release checklist<small>${o.clearance.at} · ${o.id}</small></div></li>
              <li><span class="dot ok"></span><div><b>Clearance signed by ${esc(o.clearance.by)}</b> (${esc(o.clearance.role)}) at ${esc(o.clearance.where)} · <a href="#/clearance/${o.id}">view</a><small>${o.clearance.at}</small></div></li>
              <li><span class="dot bad"></span><div><b>Returned: ${condName(d.after).toLowerCase()}</b>. ${esc(d.note)}<small>${d.date} · checked by ${d.by}</small></div></li>
            </ul></div>
            <div class="grid g2"><div class="photo">${ic(catIcon[it.cat] || 'box')}<span class="cap">Photo at return · ${d.date}</span></div><div class="photo">${ic(catIcon[it.cat] || 'box')}<span class="cap">Close-up</span></div></div>
          </div>
          <div class="stack"><div class="card"><div class="card-h"><h3>Details</h3><span class="pill ${d.status.startsWith('Charged') ? 'ok' : d.status.startsWith('Awaiting') ? 'warn' : 'info'}">${d.status}</span></div><div class="card-b"><dl class="dl">
            <dt>Item</dt><dd>${esc(it.name)}</dd><dt>SKU</dt><dd class="mono">${it.sku}</dd>${d.unit ? `<dt>Unit</dt><dd><a class="mono" href="#/item/${it.sku}/${d.unit}">${d.unit}</a></dd>` : `<dt>Quantity</dt><dd>${d.qty}</dd>`}
            <dt>Order</dt><dd><a href="#/order/${o.id}">${o.id}</a> · ${esc(o.event)}</dd><dt>Customer</dt><dd>${esc(c.name)}<br><small style="color:var(--ink-3)">${esc(c.contact)} · ${c.phone}</small></dd>
            <dt>Before</dt><dd>${condPill(d.before)}</dd><dt>After</dt><dd>${condPill(d.after)}</dd>${d.charge ? `<dt>Charge</dt><dd>${peso(d.charge)}</dd>` : ''}</dl></div></div></div>
        </div>`;
    }
    const rows = D.damage.filter(d => S.role === 'admin' || myWh(order(d.order)?.wh || 'TGG'));
    return head('Damage & loss', 'Every damaged or missing item, linked to the order, the customer and the signed clearance') + `
      <div class="card"><table class="tbl"><tr><th>Report</th><th>Item</th><th>Order / customer</th><th>Condition</th><th>Status</th><th class="num">Charge</th></tr>
      ${rows.map(d => { const it = item(d.sku), o = order(d.order);
        return `<tr class="click" data-go="#/damage/${d.id}"><td><b>${d.id}</b><small>${d.date}</small></td><td>${esc(it.name)}<small class="mono">${d.unit || it.sku + ' × ' + d.qty}</small></td><td>${o ? esc(o.event) : d.order}<small>${d.order} · ${esc(cust(d.cust).name)}</small></td><td>${condPill(d.before)} → ${condPill(d.after)}</td><td>${d.status}</td><td class="num">${d.charge ? peso(d.charge) : '-'}</td></tr>`; }).join('')}
      </table></div>`;
  };

  pages.approve = id => {
    if (!S.rolesOn) return pages.approvals();
    const o = order(id); if (!o) return notFound();
    if (o.status !== 'For Approval') return head('Review checklist', `${o.id} is ${o.status}.`) + `<a class="btn" href="#/order/${id}">Back to order</a>`;
    const r = S.release[id] || { ticks: {}, cond: {} };
    const rows = o.lines.map((l, i) => { const it = item(l.sku);
      if (l.units) return l.units.map(u => `<tr><td>${lineLabel(l)}</td><td class="mono">${u}</td><td class="num">1</td><td>${condPill(r.cond[u] || 'good')}</td><td><span class="pill ok nodot">✓ counted</span></td></tr>`).join('');
      const c = r.cond['L' + i] || 'good';
      return `<tr class="${c !== 'good' ? 'flag' : ''}"><td>${lineLabel(l)}</td><td>-</td><td class="num">${n(l.qty)}</td><td>${condPill(c)}</td><td><span class="pill ok nodot">✓ counted</span></td></tr>`; }).join('');
    const flagged = Object.values(r.cond).filter(c => c !== 'good').length;
    const may = canApprove(o);
    return head('Review checklist', `${o.id} · ${esc(o.event)} · ${typeTag(o)} · ${wh(o.wh).name}`, '', `<a href="#/approvals">Approvals</a> / ${o.id}`) + `
      <div class="grid g-main">
        <div class="card"><div class="card-h"><h3>What ${o.check.by} counted</h3><span class="sub">${lineKeys(o).length} of ${lineKeys(o).length} lines checked</span></div>
          <table class="tbl"><tr><th>Item</th><th>Unit</th><th class="num">Qty</th><th>Condition</th><th>Checked</th></tr>${rows}</table></div>
        <div class="stack"><div class="card"><div class="card-h"><h3>Submitted</h3><span class="pill warn">For approval</span></div><div class="card-b">
          <dl class="dl"><dt>Checked by</dt><dd>${o.check.by} (Staff)</dd><dt>Submitted</dt><dd>${o.check.at}</dd><dt>Customer</dt><dd>${esc(cust(o.cust).name)}</dd><dt>${o.type === 'pickup' ? 'Pickup' : 'Delivery'}</dt><dd>${o.date}</dd></dl>
          ${o.check.note ? `<div style="margin-top:14px">${note(`<b>Note from ${o.check.by.split(' ')[0]}:</b> ${esc(o.check.note)}`, 'warn')}</div>` : ''}
          ${flagged ? `<p style="font-size:12.5px;color:var(--warn);font-weight:700;margin:12px 0 0">${flagged} line${flagged > 1 ? 's' : ''} with a noted condition. It will be printed on the clearance.</p>` : ''}
        </div></div>
        <div class="card"><div class="card-b">
          ${may ? `<button class="btn ok" style="width:100%;justify-content:center" data-act="approve-order" data-id="${id}">${ic('check')}Approve${o.type === 'pickup' ? ': ready for pickup' : ': ready to dispatch'}</button>
          <div class="field" style="margin-top:16px"><label class="f">Or send it back to ${o.check.by.split(' ')[0]}</label><textarea class="in" rows="2" id="back-reason" placeholder="e.g. Recount the round tables; use the newer ones."></textarea></div>
          <button class="btn danger" style="width:100%;justify-content:center" data-act="send-back" data-id="${id}">Send back</button>`
          : note(`Only <b>${supervisorOf(o.wh)}</b> (Supervisor of ${wh(o.wh).name}) or the Admin can approve this. Switch role at the top to try it.`, 'warn')}
        </div></div></div>
      </div>`;
  };

  pages.approvals = () => {
    if (!S.rolesOn) return head('Approvals', 'Part of the Roles and permissions add-on') + note('Package A has one level of access, so nothing waits for approval. Turn on the add-on in Settings to see this page.') + `<p><a class="btn" href="#/settings?as=admin&tab=package">Open Settings</a></p>`;
    const approver = S.role !== 'staff';
    if (!approver) {
      const mine = visibleOrders().filter(o => o.check && o.check.by === me().name || o.sentBack);
      return head('My submissions', 'Checklists you submitted and what the supervisor decided') + `<div class="card"><table class="tbl"><tr><th>Order</th><th>Submitted</th><th>Supervisor</th><th>Result</th></tr>
        ${mine.map(o => `<tr class="click" data-go="#/order/${o.id}"><td><b>${esc(o.event)}</b><small>${o.id}</small></td><td>${o.check ? o.check.at : '-'}</td><td>${supervisorOf(o.wh)}</td><td>${o.status === 'For Approval' ? '<span class="pill warn">Waiting</span>' : o.sentBack && o.status === 'Preparing' ? `<span class="pill bad">Sent back</span><small>${esc(o.sentBack.reason)}</small>` : `<span class="pill ok">Approved</span><small>${o.approval ? o.approval.by + ' · ' + o.approval.at : ''}</small>`}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Nothing submitted yet.</td></tr>'}</table></div>`;
    }
    const waiting = D.orders.filter(o => o.status === 'For Approval' && canApprove(o));
    const adj = D.adjustments.filter(a => a.status === 'Pending approval');
    const done = D.orders.filter(o => o.approval && canApprove(o));
    return head('Approvals', S.role === 'supervisor' ? 'Checklists and stock changes from staff at Pasig Main and Las Piñas' : 'Everything waiting for a decision, all warehouses') + `
      <div class="card"><div class="card-h"><h3>Order checklists</h3><span class="pill warn">${waiting.length} waiting</span></div><table class="tbl"><tr><th>Order</th><th>Type</th><th>Checked by</th><th>Note</th><th></th></tr>
        ${waiting.map(o => `<tr><td><b>${esc(o.event)}</b><small>${o.id} · ${wh(o.wh).name} · ${o.date}</small></td><td>${typeTag(o)}</td><td>${o.check.by}<small>${o.check.at}</small></td><td style="max-width:280px">${o.check.note ? esc(o.check.note) : '<span style="color:var(--ink-3)">-</span>'}</td><td><a class="btn sm primary" href="#/approve/${o.id}">Review</a></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nothing waiting. Nice.</td></tr>'}</table></div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>Stock adjustments</h3><span class="pill warn">${adj.length} waiting</span></div><table class="tbl"><tr><th>Adjustment</th><th>Item</th><th class="num">Qty</th><th>By</th><th></th></tr>
        ${adj.map(a => `<tr><td>${a.type}<small>${esc(a.note)}</small></td><td>${esc(item(a.sku).name)}</td><td class="num">${a.qty}</td><td>${a.by}<small>${a.date}</small></td><td><div style="display:flex;gap:6px"><button class="btn sm ok" data-act="approve" data-id="${a.id}">Approve</button><button class="btn sm danger" data-act="reject" data-id="${a.id}">Reject</button></div></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nothing waiting.</td></tr>'}</table></div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>Recently approved</h3></div><ul class="feed">${done.map(o => `<li><span class="dot ok"></span><div><a href="#/order/${o.id}">${o.id} · ${esc(o.event)}</a><small>Approved by ${o.approval.by} · ${o.approval.at}</small></div></li>`).join('') || '<li>None yet.</li>'}</ul></div>`;
  };

  pages.adjustments = () => {
    const admin = S.role !== 'staff';
    return head('Stock adjustments', !S.rolesOn ? 'Stock-ins, write-offs, transfers and condition updates. Every change is logged.' : admin ? 'Stock-ins, write-offs, transfers and condition updates. Staff write-offs and transfers need your approval.' : 'Record stock-ins and condition changes. Write-offs and transfers go to your supervisor for approval.',
      `<button class="btn primary" data-act="new-adj">${ic('plus')}New adjustment</button>`) + `
      <div class="card"><table class="tbl"><tr><th>Adjustment</th><th>Type</th><th>Item</th><th class="num">Qty</th><th>Warehouse</th><th>By</th><th>Status</th>${admin && S.rolesOn ? '<th></th>' : ''}</tr>
      ${adjustments().map(a => `<tr><td><b>${a.id}</b><small>${a.date}</small></td><td>${a.type}<small>${esc(a.note)}</small></td><td>${esc(item(a.sku).name)}<small class="mono">${a.sku}</small></td><td class="num">${a.qty}</td><td>${a.wh.split(' → ').map(c => wh(c)?.name || c).join(' → ')}</td><td>${a.by}<small>${a.role}</small></td>
        <td>${a.status === 'Pending approval' ? '<span class="pill warn">Pending approval</span>' : a.status === 'Rejected' ? '<span class="pill bad">Rejected</span>' : '<span class="pill ok">Done</span>'}</td>
        ${admin && S.rolesOn ? `<td>${a.status === 'Pending approval' ? `<div style="display:flex;gap:6px"><button class="btn sm ok" data-act="approve" data-id="${a.id}">Approve</button><button class="btn sm danger" data-act="reject" data-id="${a.id}">Reject</button></div>` : ''}</td>` : ''}</tr>`).join('')}
      </table></div>`;
  };

  pages.reports = () => {
    const tab = S.repTab || 'inventory';
    const t = (k, l) => `<button class="${tab === k ? 'on' : ''}" data-rtab="${k}">${l}</button>`;
    const C = { good: '#2257e6', out: '#8fb0ff', rep: '#e59a1a', dmg: '#d9493b' };
    let body = '';
    if (tab === 'inventory') {
      const per = D.warehouses.map(w => { const s = { good: 0, out: 0, rep: 0, dmg: 0 }; for (const it of D.items) { const x = stats(it, w.id); s.good += x.good; s.out += x.out; s.rep += x.rep; s.dmg += x.dmg; } return { w, s, t: s.good + s.out + s.rep + s.dmg }; }).filter(p => p.t > 0);
      const max = Math.max(...per.map(p => p.t));
      const low = lowStock(null);
      body = `<div class="grid g2">
        <div class="card"><div class="card-h"><h3>Stock levels per warehouse</h3><button class="btn sm" data-act="toast" data-msg="Excel export: available in the full system">Export</button></div><div class="card-b">
          <div class="legend"><span><i style="background:${C.good}"></i>Good</span><span><i style="background:${C.out}"></i>Out</span><span><i style="background:${C.rep}"></i>For repair</span><span><i style="background:${C.dmg}"></i>Damaged</span></div>
          <div class="bars">${per.map(p => `<div class="bar"><span>${p.w.name}</span><div class="track" style="width:${p.t / max * 100}%">${['good', 'out', 'rep', 'dmg'].map(k => `<span style="width:${p.s[k] / p.t * 100}%;background:${C[k]}" title="${k}: ${p.s[k]}"></span>`).join('')}</div><span class="v">${n(p.t)}</span></div>`).join('')}</div>
        </div></div>
        <div class="card"><div class="card-h"><h3>Low stock alerts</h3><span class="pill warn">${low.length}</span></div><table class="tbl"><tr><th>Item</th><th>Warehouse</th><th class="num">Available</th><th class="num">Alert at</th></tr>
          ${low.map(x => `<tr class="click" data-go="#/item/${x.it.sku}"><td>${esc(x.it.name)}</td><td>${x.w.name}</td><td class="num"><b>${x.s.avail}</b></td><td class="num">${x.it.low}</td></tr>`).join('')}</table></div>
        <div class="card" style="grid-column:1/-1"><div class="card-h"><h3>Stock per item across all warehouses</h3></div><table class="tbl"><tr><th>Item</th>${D.warehouses.map(w => `<th class="num">${w.name}</th>`).join('')}<th class="num">Total</th></tr>
          ${D.items.map(it => `<tr><td>${esc(it.name)}<small class="mono">${it.sku}</small></td>${D.warehouses.map(w => `<td class="num">${n(stats(it, w.id).total) || '-'}</td>`).join('')}<td class="num"><b>${n(stats(it).total)}</b></td></tr>`).join('')}</table></div>
      </div>`;
    } else if (tab === 'deliveries') {
      const disc = D.orders.filter(o => o.discrepancy);
      body = `<div class="grid g2">
        <div class="card"><div class="card-h"><h3>Discrepancy report: sent vs. returned</h3></div><table class="tbl"><tr><th>Order</th><th>Item</th><th class="num">Sent</th><th class="num">Back</th><th>Issue</th></tr>
          ${disc.flatMap(o => o.lines.filter(l => (l.back !== undefined && (l.back < l.qty || l.dmg)) || Object.values(l.unitBack || {}).some(x => x !== 'good')).map(l => `<tr class="click" data-go="#/order/${o.id}"><td>${o.id}<small>${esc(o.event)}</small></td><td>${esc(item(l.sku).name)}</td><td class="num">${lineQty(l)}</td><td class="num">${l.units ? l.units.length : l.back}</td><td>${l.units ? Object.entries(l.unitBack).filter(([, v]) => v !== 'good').map(([u, v]) => `<span class="mono">${u}</span> ${condName(v)}`).join(', ') : `${l.qty - l.back ? `${l.qty - l.back} missing` : ''}${l.dmg ? `, ${l.dmg} damaged` : ''}`}</td></tr>`)).join('')}</table></div>
        ${S.deliveryOn ? `        <div class="card"><div class="card-h"><h3>Orders by type</h3></div><div class="card-b">
          <div class="bars">${[['Delivery', D.orders.filter(o => o.type === 'delivery').length, C.good], ['Pickup', D.orders.filter(o => o.type === 'pickup').length, '#8b5cf6']].map(([l, v, c]) => `<div class="bar"><span>${l}</span><div class="track"><span style="width:${v / D.orders.length * 100}%;background:${c}"></span></div><span class="v">${v}</span></div>`).join('')}</div>
          <p style="font-size:12.5px;color:var(--ink-3);margin:8px 0 0">This month, sample data</p></div></div>` : ''}
        <div class="card" style="grid-column:1/-1"><div class="card-h"><h3>Order history</h3><input class="in" style="width:220px" placeholder="Search by date, event, warehouse"></div><table class="tbl"><tr><th>Order</th><th>Type</th><th>Warehouse</th><th>Date</th><th>Status</th></tr>
          ${D.orders.map(o => `<tr class="click" data-go="#/order/${o.id}"><td>${o.id}<small>${esc(o.event)}</small></td><td>${typeTag(o)}</td><td>${wh(o.wh).name}</td><td>${o.date}</td><td>${statusPill(o)}</td></tr>`).join('')}</table></div>
      </div>`;
    } else {
      const util = [['Tiffany Chair (White)', 86], ['Tent 10×20 (White)', 74], ['Active Speaker 15"', 68], ['5ft Round Table', 61], ['Table Cloth (White, Round)', 55], ['Stage Platform 4×8', 22], ['Monoblock Chair (Black)', 18]];
      const dmg = [['Tiffany Chair (White)', 6, 2], ['Tent 10×20 (White)', 2, 0], ['Active Speaker 15"', 1, 0], ['6ft Rectangular Table', 3, 0], ['Chair Sash (Gold)', 0, 5]];
      body = `<div class="grid g2">
        <div class="card"><div class="card-h"><h3>Item utilization</h3><span class="sub">% of days out at events, last 90 days</span></div><div class="card-b"><div class="bars">${util.map(([l, v]) => `<div class="bar"><span>${l}</span><div class="track"><span style="width:${v}%;background:${C.good}"></span></div><span class="v">${v}%</span></div>`).join('')}</div></div></div>
        <div class="card"><div class="card-h"><h3>Damage and loss per item</h3><span class="sub">last 90 days</span></div><div class="card-b">
          <div class="legend"><span><i style="background:${C.dmg}"></i>Damaged</span><span><i style="background:#7d8aa0"></i>Missing</span></div>
          <div class="bars">${dmg.map(([l, d, m]) => `<div class="bar"><span>${l}</span><div class="track"><span style="width:${d * 10}%;background:${C.dmg}"></span><span style="width:${m * 10}%;background:#7d8aa0"></span></div><span class="v">${d + m}</span></div>`).join('')}</div></div></div>
        <div class="card" style="grid-column:1/-1"><div class="card-h"><h3>Stock movement log (audit trail)</h3></div><table class="tbl"><tr><th>When</th><th>What</th><th>Item</th><th class="num">Qty</th><th>By</th></tr>
          ${[['Nov 3, 4:32 PM', 'Checklist approved', 'ORD-1039 · 91 pcs', '', 'Rico Bautista'], ['Nov 3, 9:02 AM', 'Write-off requested', 'Tiffany Chair (White)', '2', 'Maria Santos'], ['Nov 2, 4:30 PM', 'Stock-in', 'Chair Sash (Gold)', '100', 'Maria Santos'], ['Nov 2, 10:05 AM', 'Released (pickup)', 'ORD-1038 · 14 pcs', '', 'Jomar Ramos'], ['Nov 1, 9:40 AM', 'Released (pickup)', 'ORD-1037 · 242 pcs', '', 'Maria Santos'], ['Oct 30, 3:15 PM', 'Condition: repair → good', '6ft Rectangular Table', '3', 'Juan Dela Cruz'], ['Oct 27, 5:10 PM', 'Returned with discrepancy', 'ORD-1036', '', 'Maria Santos']].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="num">${r[3]}</td><td>${r[4]}</td></tr>`).join('')}</table></div>
      </div>`;
    }
    return head('Reports', S.deliveryOn ? 'Inventory, deliveries and operations' : 'Inventory, orders and operations', `<button class="btn" data-act="toast" data-msg="PDF download: available in the full system">${ic('print')}Download PDF</button>`) + `<div class="tabs">${t('inventory', 'Inventory')}${t('deliveries', S.deliveryOn ? 'Deliveries & returns' : 'Orders & returns')}${t('ops', 'Operations')}</div>` + body;
  };

  pages.notifications = () => head('Notifications', 'In-app alerts for low stock, order status and return discrepancies') + `
    <div class="card"><ul class="feed">${notifications().map(x => `<li><span class="dot ${x.tone === 'info' ? '' : x.tone}"></span><div style="flex:1"><a href="${x.link}">${esc(x.text)}</a><small>${x.when}</small></div></li>`).join('')}</ul></div>`;

  pages.settings = () => {
    const tab = S.setTab || 'package';
    const t = (k, l) => `<button class="${tab === k ? 'on' : ''}" data-stab="${k}">${l}</button>`;
    let body;
    if (tab === 'package') {
      const row = (name, status, tone) => `<tr><td>${name}</td><td><span class="pill ${tone} nodot">${status}</span></td></tr>`;
      body = `<div class="grid g-main"><div class="card"><div class="card-h"><h3>What this demo shows</h3></div><table class="tbl"><tr><th>Feature</th><th>In the proposal</th></tr>
        ${['Inventory, warehouses, categories, adjustments', 'Reservations by date and availability calendar', 'Customer pickup, release checklist, signed clearance', 'Returns, damage records and reports', 'QR labels and phone scanning'].map(x => row(x, 'Package A', 'ok')).join('')}
        ${row('Delivery orders, status tracking, signing at the venue', 'Add-on: ₱25,000', 'info')}${row('More than 3 user accounts', 'Add-on: quoted on request', 'info')}${row('Roles, permissions and approvals', 'Add-on: quoted on request', 'info')}${row('Per-unit tracking', 'Add-on: quoted on request', 'info')}${row('Android driver app, GPS and live map', 'Package B, not in this demo', 'mute')}
        </table></div>
        <div class="stack"><div class="card"><div class="card-h"><h3>Delivery add-on</h3><span class="pill ${S.deliveryOn ? 'ok' : 'mute'}">${S.deliveryOn ? 'On' : 'Off'}</span></div><div class="card-b"><p style="margin:0 0 14px;font-size:13.5px;color:var(--ink-2)">Package A is pickup only: customers collect items at the warehouse and bring them back. Turn this on to see delivery orders, dispatch and signing at the venue.</p>
        <button class="btn ${S.deliveryOn ? '' : 'primary'}" style="width:100%;justify-content:center" data-act="toggle-delivery">${S.deliveryOn ? 'Turn off the delivery add-on' : 'Turn on the delivery add-on'}</button></div></div>
        <div class="card"><div class="card-h"><h3>Roles add-on</h3><span class="pill ${S.rolesOn ? 'ok' : 'mute'}">${S.rolesOn ? 'On' : 'Off'}</span></div><div class="card-b"><p style="margin:0 0 14px;font-size:13.5px;color:var(--ink-2)">Package A has up to ${MAX_USERS} accounts with the same full access. Turn this on to see separate Admin, Supervisor and Staff views, with approvals before release.</p>
        <button class="btn ${S.rolesOn ? '' : 'primary'}" style="width:100%;justify-content:center" data-act="toggle-roles">${S.rolesOn ? 'Turn off the roles add-on' : 'Turn on the roles add-on'}</button></div></div></div></div>`;
    }
    else if (tab === 'users') body = `<div class="card"><div class="card-h"><div><h3>Users</h3>${S.rolesOn ? '' : `<span class="sub">${accounts().length} of ${MAX_USERS} accounts included in Package A</span>`}</div><button class="btn sm primary" data-act="add-user">${ic('plus')}Add user</button></div><table class="tbl"><tr><th>Name</th><th>${S.rolesOn ? 'Role' : 'Access'}</th><th>Warehouses</th><th>Status</th></tr>
      ${accounts().map(u => `<tr><td><div class="cell-item"><div class="avatar">${esc(u.name).split(' ').map(x => x[0]).join('')}</div><div><b>${esc(u.name)}</b><small style="color:var(--ink-3)">${esc(u.email)}</small></div></div></td><td>${S.rolesOn ? u.role : 'Full access'}</td><td>${S.rolesOn ? esc(u.wh) : 'All warehouses'}</td><td>${u.active ? '<span class="pill ok">Active</span>' : '<span class="pill mute">Inactive</span>'}</td></tr>`).join('')}</table></div>`;
    else if (tab === 'roles' && !S.rolesOn) body = `<div style="max-width:640px">${note('Package A has one level of access: every account can do everything. Separate Admin, Supervisor and Staff access is an optional add-on, and you can turn it on in the Package tab.')}</div>`;
    else if (tab === 'roles') {
      const rows = [['View dashboard and inventory', 1, 1, 1], ['Create orders and do the checklist', 1, 1, 1], ['Approve checklists before release', 1, 'own', 0], ['Customer clearance', 1, 1, 1], ['Process returns and file damage reports', 1, 1, 1], ['Stock-ins and condition updates', 1, 1, 1], ['Write-offs and transfers', 1, 1, 'approval'], ['Approve stock adjustments', 1, 'own', 0], ['Charge customers for damage', 1, 0, 0], ['Warehouses, categories, reports', 1, 0, 0], ['Users and settings', 1, 0, 0]];
      const cell = v => v === 1 ? `<span style="color:var(--ok)">${ic('check', 'style="width:18px"')}</span>` : v === 'approval' ? '<span class="pill warn nodot">Needs approval</span>' : v === 'own' ? '<span class="pill info nodot">Own warehouses</span>' : '<span style="color:var(--ink-3)">-</span>';
      body = `<div class="card"><table class="tbl"><tr><th>Permission</th><th>Admin</th><th>Supervisor</th><th>Staff</th></tr>${rows.map(r => `<tr><td>${r[0]}</td><td>${cell(r[1])}</td><td>${cell(r[2])}</td><td>${cell(r[3])}</td></tr>`).join('')}</table></div>`;
    } else body = `<div class="card" style="max-width:640px"><div class="card-b">
      <div class="field"><label class="f">Company name</label><input class="in" data-company value="${esc(S.company)}"></div>
      <div class="field"><label class="f">Address</label><input class="in" value="Ortigas Ave. Ext., Pasig City"></div>
      <div class="grid g2" style="gap:12px"><div class="field"><label class="f">Phone</label><input class="in" value="(02) 8555 0100"></div><div class="field"><label class="f">Email</label><input class="in" value="hello@example.com"></div></div>
      <div class="field"><label class="f">Clearance text (fixed in this demo)</label><textarea class="in" rows="3" readonly>I confirm that I received the items listed above, complete and in the condition stated. Missing or damaged items may be charged.</textarea></div>
      <button class="btn primary" data-act="save-company">Save</button></div></div>`;
    return head('Settings', 'Package, users, roles and company profile') + `<div class="tabs">${t('package', 'Package')}${t('users', 'Users')}${t('roles', 'Roles & permissions')}${t('company', 'Company profile')}</div>` + body;
  };

  pages.labels = (params) => {
    const sku = params.get('sku') || S.labelSku || 'TNT-1020';
    S.labelSku = sku;
    const it = item(sku), fmt = S.labelFmt || 'a4';
    let codes = it.track === 'unit' ? it.units.map(u => u.code) : Array(21).fill(it.sku);
    codes = codes.slice(0, 21);
    const lab = code => `<div class="label"><div class="qr">${qrSvg(qrUrl(code))}</div><div><b>${esc(it.name)}</b><span class="mono">${code}</span><small>${esc(S.company)}</small></div></div>`;
    return `<div class="no-print">${head('QR labels', 'Print stickers for items and units. Phone cameras read QR codes quickly, even on small labels.', `<button class="btn primary" data-act="print">${ic('print')}Print</button>`)}
      <div class="filters"><select class="in" data-label="sku">${D.items.map(x => `<option value="${x.sku}" ${x.sku === sku ? 'selected' : ''}>${esc(x.name)}${x.track === 'unit' ? ` (${x.units.length} units)` : ''}</option>`).join('')}</select>
      <select class="in" data-label="fmt"><option value="a4" ${fmt === 'a4' ? 'selected' : ''}>A4 sticker paper, 21 per sheet (any printer)</option><option value="thermal" ${fmt === 'thermal' ? 'selected' : ''}>Thermal label printer, 50×30mm</option></select></div>
      <div style="margin-bottom:16px">${note(it.track === 'unit' ? `Each unit gets its own code, so a scan opens that exact unit. For outdoor items like tents, use <b>waterproof vinyl</b> sticker paper.` : 'Count-tracked items share one code per SKU. Stick it on the item or on the shelf bin.')}</div></div>
      ${fmt === 'a4' ? `<div class="sheet">${codes.map(lab).join('')}</div>` : `<div style="display:flex;flex-wrap:wrap;gap:14px;justify-content:center">${codes.slice(0, 8).map(c => `<div style="width:250px;height:150px;background:#fff;box-shadow:var(--shadow);border-radius:6px;padding:10px">${lab(c).replace('class="label"', 'class="label" style="border:0;height:100%"')}</div>`).join('')}</div>`}`;
  };

  pages.scan = () => head('Scan a QR code', 'This scanner is real. It uses your phone\'s camera in the browser, with no app to install.') + `
    <div class="grid g2">
      <div class="stack"><div class="card"><div class="card-h"><h3>Camera</h3></div><div class="card-b">
        <div class="scanner" id="scan-box"><video id="scan-video" playsinline muted hidden></video><div class="scan-frame" id="scan-frame" hidden></div>
          <div class="scan-idle" id="scan-idle">${ic('cam')}<button class="btn primary" data-act="scan-start">Start camera</button><small>Your browser will ask for permission. Nothing is recorded or sent anywhere.</small></div></div>
        <div id="scan-msg" style="margin-top:12px"></div>
        <div id="scan-result" style="margin-top:12px"></div>
        <label class="f" for="scan-typed" style="margin-top:14px">Or type a code</label>
        <div style="display:flex;gap:8px"><input class="in" id="scan-typed" placeholder="e.g. TNT-1020-007"><button class="btn" data-act="scan-typed">Look up</button></div>
      </div></div></div>
      <div class="stack"><div class="card"><div class="card-h"><h3>Sample labels to scan</h3></div><div class="card-b">
        <p style="margin:0 0 12px;font-size:13px;color:var(--ink-2)">Show these on one screen and scan with your phone, or print them from <a href="#/labels">QR labels</a>. You can also point your phone's normal camera at one: it opens that item directly.</p>
        <div class="qr-samples">${SAMPLE_LABELS.map(code => { const h = lookupCode(code); return `<div class="qr-sample"><div class="qr">${qrSvg(qrUrl(code))}</div><b>${esc(h.it.name)}</b><span class="mono">${code}</span></div>`; }).join('')}</div>
      </div></div>
      <div class="card scan-phone-link"><div class="card-b" style="display:flex;gap:14px;align-items:center"><div style="width:96px;flex-shrink:0">${qrSvg(`${location.origin}${location.pathname}#/scan`)}</div><div style="font-size:13px"><b>On a computer?</b><br>Scan this with your phone to open this page there, then scan the samples on this screen.</div></div></div></div>
    </div>`;

  pages.s = code => {
    const c = parseCode(code || '');
    return head('Scanned label', 'This opened from the QR code, using the phone\'s normal camera.', '', '') + `<div style="max-width:560px"><div class="card"><div class="card-b">${scanResult(c)}</div></div><p><a class="btn primary" href="#/scan">${ic('cam')}Scan another</a></p></div>`;
  };

  pages.phone = () => {
    const o = order('ORD-1038'), o2 = order(S.deliveryOn ? 'ORD-1041' : 'ORD-1039');
    const pr = S.phoneRet || (S.phoneRet = {});
    const pList = [...o.lines.flatMap(l => l.units ? l.units.map(u => ({ k: u, label: item(l.sku).name, code: u })) : [{ k: 'L' + l.sku, label: item(l.sku).name, code: `${l.sku} × ${l.qty}` }])];
    const doneCount = pList.filter(x => pr[x.k]).length;
    const signed = !!o2.clearance;
    return head('On the phone', 'Staff open WIMS in the phone\'s browser. No app to install, works on Android and iPhone. These two screens are a preview.', `<a class="btn primary" href="#/scan">${ic('cam')}Try a real scan</a>`) + `
      <div class="phones">
        <div class="phone-wrap"><div class="phone"><div class="screen">
          <div class="p-status"><span>9:41</span><span>●●● 5G</span></div>
          <div class="p-bar"><span class="url">🔒 wims.example.com/return/ORD-1038</span></div>
          <div class="p-body"><h4>Return · ORD-1038</h4><div style="color:var(--ink-3);margin:-4px 0 10px">Lim 7th Birthday · Pickup</div>
            <div class="cam" data-act="phone-scan"><div class="frame"></div><div class="laser"></div><div class="fake-qr" style="position:absolute">${qrSvg('WIMS:' + (pList.find(x => !pr[x.k])?.code || 'done'))}</div><div class="hit ${S.phoneHit ? 'show' : ''}">${S.phoneHit ? `✓ ${esc(S.phoneHit)}` : ''}</div></div>
            <button class="btn primary p-btn" data-act="phone-scan">${ic('cam')}${doneCount === pList.length ? 'All scanned' : 'Tap to scan'}</button>
            <div class="p-list">${pList.map(x => `<div class="r ${pr[x.k] ? 'done' : ''}"><span class="tick ${pr[x.k] ? 'on' : ''}">${ic('check')}</span><div style="flex:1"><b style="font-size:12px">${esc(x.label)}</b><div class="mono" style="font-size:10.5px;color:var(--ink-3)">${x.code}</div></div></div>`).join('')}</div>
            <div style="font-size:11.5px;color:var(--ink-3);margin-top:8px;text-align:center">${doneCount} of ${pList.length} checked</div>
          </div></div></div><p><b>Scan on return.</b> Point the camera at the QR label; the item is ticked off the list. Tap the camera to try it.</p></div>

        <div class="phone-wrap"><div class="phone"><div class="screen">
          <div class="p-status"><span>9:41</span><span>●●● 5G</span></div>
          <div class="p-bar"><span class="url">🔒 wims.example.com/sign/${o2.id}</span></div>
          <div class="p-body">${signed ? `<div style="text-align:center;padding-top:60px"><div style="width:70px;height:70px;border-radius:50%;background:var(--ok-bg);color:var(--ok);display:grid;place-items:center;margin:0 auto">${ic('check', 'style="width:36px"')}</div><h4 style="margin-top:14px">Signed</h4><p style="color:var(--ink-2)">Clearance saved on ${o2.id}.<br>The office sees it right away.</p><a class="btn p-btn" href="#/clearance/${o2.id}">View clearance</a></div>` : `
            <h4>Hand over · ${o2.id}</h4><div style="color:var(--ink-3);margin:-4px 0 6px">${esc(o2.event)} · ${esc(S.deliveryOn ? 'SMX Convention Center' : wh(o2.wh).name + ' counter')}</div>
            <div class="p-list">${signForm(o2, true).items}</div>
            <p style="font-size:11.5px;line-height:1.5;margin:10px 2px">I confirm I received the items above, complete and in the condition stated.</p>
            <input class="in" id="p-name" value="${esc(cust(o2.cust).contact)}" style="font-size:12px">
            <div class="sig-pad" style="height:110px;margin-top:8px"><canvas id="p-sig"></canvas><div class="hint" style="bottom:24px">Receiver signs here</div></div>
            <button class="btn ok p-btn" id="p-sig-ok" data-act="phone-sign" disabled>${ic('check')}Confirm receipt</button>`}
          </div></div></div><p>${S.deliveryOn ? "<b>Sign at the venue.</b> The receiver checks the items and signs on the staff member's phone. The order moves to Delivered." : "<b>Sign at the counter.</b> The customer checks the items and signs on the staff member's phone. The order moves to Picked Up."}</p></div>
      </div>`;
  };

  const notFound = () => head('Not found', 'This page does not exist in the mockup.') + '<a class="btn" href="#/dashboard">Go to dashboard</a>';
  const ADMIN_ONLY = ['warehouses', 'categories', 'reports', 'settings', 'setup'];

  // ---------- router ----------
  function render() {
    const raw = location.hash || '#/welcome';
    const [path, qs] = raw.slice(2).split('?');
    const params = new URLSearchParams(qs || '');
    if (S.rolesOn && ME[params.get('as')]) S.role = params.get('as');
    const parts = path.split('/');
    let key = parts[0] || 'welcome', html;
    S.seen[seenKey(raw)] = true;
    if (params.get('tab')) S.setTab = params.get('tab');
    if (key === 'orders' && parts[1] === 'new') key = 'orders/new';
    if (S.role !== 'admin' && ADMIN_ONLY.includes(key)) html = head('Admin only', `${me().role} accounts cannot open this page. Switch to Admin at the top to see it.`);
    else if (key === 'item') html = pages.item(parts[1], parts[2]);
    else if (['order', 'release', 'sign', 'clearance', 'return', 'approve', 's'].includes(key)) html = pages[key](parts[1]);
    else if (key === 'damage') html = pages.damage(parts[1]);
    else if (key === 'labels') html = pages.labels(params);
    else html = (pages[key] || notFound)();
    const navKey = { s: 'scan', approve: 'approvals', item: 'inventory', order: 'orders', 'orders/new': 'orders', release: 'orders', sign: 'orders', clearance: 'orders', return: 'orders', notifications: '' }[key] ?? key;
    app.innerHTML = key === 'welcome' ? html : shell(navKey, raw, html);
    mount(key);
  }

  function mount(key) {
    saveState();
    if (key === 'sign') setupSig(document.getElementById('sig'), document.getElementById('sig-ok'));
    if (key === 'phone') setupSig(document.getElementById('p-sig'), document.getElementById('p-sig-ok'));
  }
  // Deferred so a re-render never runs inside the blur/change of an input it is replacing.
  let pending = null;
  // Navigate, re-rendering even when the target is the page already open.
  const navTo = h => { if (location.hash === h) render(); else location.hash = h; };
  const keepScroll = fn => { fn(); if (pending) return; const y = window.scrollY; pending = setTimeout(() => { pending = null; render(); window.scrollTo(0, y); }, 0); };

  function setupSig(canvas, okBtn) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1, rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b2a55';
    let drawing = false, ink = 0;
    const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('pointerdown', e => { drawing = true; canvas.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); });
    canvas.addEventListener('pointermove', e => { if (!drawing) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); ink++; if (ink > 12 && okBtn) okBtn.disabled = false; });
    canvas.addEventListener('pointerup', () => { drawing = false; });
    canvas._clear = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ink = 0; if (okBtn) okBtn.disabled = true; };
  }

  // ---------- events ----------
  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go && !e.target.closest('a,button,select,input')) { location.hash = go.dataset.go; return; }
    const role = e.target.closest('[data-role]');
    if (role) { S.role = role.dataset.role; S.newOrder = null; S.invFilter = null; if (/[?&]as=/.test(location.hash)) location.hash = location.hash.replace(/[?&]as=\w+/, ''); else render(); toast(`Viewing as ${me().role} (${me().name})`); return; }
    const tab = e.target.closest('[data-tab]'); if (tab) { S.orderTab = tab.dataset.tab; render(); return; }
    const rt = e.target.closest('[data-rtab]'); if (rt) { S.repTab = rt.dataset.rtab; render(); return; }
    const st = e.target.closest('[data-stab]'); if (st) { S.setTab = st.dataset.stab; render(); return; }
    const tk = e.target.closest('[data-tick]');
    if (tk) { const id = routeId(); const r = S.release[id]; r.ticks[tk.dataset.tick] = !r.ticks[tk.dataset.tick]; keepScroll(() => {}); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act, id = a.dataset.id;
    if (act === 'hide-guide') { S.guide = false; render(); }
    else if (act === 'start-guide') { S.guide = true; S.newOrder = null; navTo(curStep() ? curStep().route() : '#/done'); }
    else if (act === 'skip-guide') { S.guide = false; navTo('#/dashboard?as=admin'); }
    else if (act === 'restart') resetDemo();
    else if (act === 'toggle-roles') { setRoles(!S.rolesOn); location.hash === '#/settings?as=admin&tab=package' ? render() : navTo('#/settings?as=admin&tab=package'); toast(S.rolesOn ? 'Roles add-on is on. Switch roles at the top.' : 'Back to Package A: one level of access'); }
    else if (act === 'toggle-delivery') { setDelivery(!S.deliveryOn); render(); toast(S.deliveryOn ? 'Delivery add-on is on' : 'Back to Package A: pickup only'); }
    else if (act === 'hide-explore') { S.exploreHidden = true; render(); }
    else if (act === 'add-warehouse') addWarehouse();
    else if (act === 'add-category') addCategory();
    else if (act === 'add-user') addUser();
    else if (act === 'save-company') { render(); toast('Company profile saved'); }
    else if (act === 'damage-status') { const d = D.damage.find(x => x.id === id); d.status = a.dataset.to; render(); toast(`${d.id}: ${d.status}`); }
    else if (act === 'toggle-nav') { S.navOpen = !S.navOpen; render(); }
    else if (act === 'finish-setup') { S.setupDone = true; keepScroll(() => {}); toast('Setup finished'); }
    else if (act === 'do-step') doStep();
    else if (act === 'use-dates') { S.newOrder.date = a.dataset.a; S.newOrder.ret = a.dataset.b; keepScroll(() => {}); }
    else if (act === 'toast') toast(a.dataset.msg);
    else if (act === 'print') window.print();
    else if (act === 'clear-q') { S.q = ''; render(); }
    else if (act === 'add-item') addItem();
    else if (act === 'status') { const o = order(routeId()); o.status = a.dataset.to; render(); toast(`${o.id} is now ${o.status}`); }
    else if (act === 'scan-start') startPageScan();
    else if (act === 'scan-typed') { const c = parseCode(document.getElementById('scan-typed').value); if (c) document.getElementById('scan-result').innerHTML = scanResult(c); }
    else if (act === 'scan-check') scanForChecklist(id);
    else if (act === 'scan') {
      const o = order(id), r = S.release[id]; const keys = []; o.lines.forEach((l, i) => l.units ? l.units.forEach(u => keys.push(u)) : keys.push('L' + i));
      const k = keys.find(x => !r.ticks[x]); if (!k) { toast('Everything is already checked'); return; }
      r.ticks[k] = true; keepScroll(() => {}); const row = document.getElementById('row-' + k); if (row) { row.classList.add('flash'); row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      toast(`Scanned ${k.startsWith('L') ? item(o.lines[+k.slice(1)].sku).sku : k}: matched on ${o.id}`);
    }
    else if (act === 'dispatch') { const o = order(id); o.status = 'In Transit'; o.releasedBy = me().name; o.lines.forEach(l => {}); navTo('#/order/' + id); toast(`${o.id} dispatched. The receiver signs at the venue.`); }
    else if (act === 'sig-clear') document.getElementById('sig')._clear();
    else if (act === 'sign') {
      const name = document.getElementById('sig-name').value.trim() || cust(order(id).cust).contact;
      signOrder(id, name, document.getElementById('sig-role').value, document.getElementById('sig').toDataURL());
    }
    else if (act === 'scan-ret') {
      const o = order(id), r = S.ret[id]; const u = o.lines.flatMap(l => l.units || []).find(x => !r.scanned[x]);
      if (!u) { toast('All units scanned'); return; } r.scanned[u] = true; keepScroll(() => {}); toast(`Scanned ${u}: belongs to ${o.id}`);
    }
    else if (act === 'finish-return') finishReturn(id);
    else if (act === 'submit-check') { submitCheck(id, document.getElementById('chk-note').value.trim()); }
    else if (act === 'approve-order') { approveOrder(id); }
    else if (act === 'send-back') {
      const o = order(id), reason = document.getElementById('back-reason').value.trim();
      if (!reason) { toast('Add a reason so staff know what to fix'); document.getElementById('back-reason').focus(); return; }
      o.sentBack = { by: me().name, at: now(), reason }; o.status = 'Preparing';
      S.release[id] = { ticks: {}, cond: { ...(o.check.cond || {}) } };
      D.notifications.unshift({ tone: 'bad', text: `${o.id} sent back by ${me().name}: ${reason}`, when: 'Just now', link: '#/order/' + id });
      navTo('#/order/' + id); toast(`Sent back to ${o.check.by}`);
    }
    else if (act === 'add-line') { S.newOrder.lines.push({ sku: 'TBL-5FT-RND', qty: 10 }); keepScroll(() => {}); }
    else if (act === 'rm-line') { S.newOrder.lines.splice(+a.dataset.i, 1); keepScroll(() => {}); }
    else if (act === 'save-order') saveOrder();
    else if (act === 'approve' || act === 'reject') { const x = D.adjustments.find(y => y.id === id);
      if (act === 'approve') { const err = applyAdj(x); if (err) { toast(err); return; } }
      x.status = act === 'approve' ? 'Done' : 'Rejected'; render(); toast(`${x.id} ${act === 'approve' ? 'approved, stock updated' : 'rejected'}`); }
    else if (act === 'new-adj') newAdj();
    else if (act === 'phone-scan') {
      const o = order('ORD-1038'), pr = S.phoneRet;
      const list = o.lines.flatMap(l => l.units ? l.units.map(u => [u, `${u} · ${item(l.sku).name}`]) : [['L' + l.sku, `${l.sku} × ${l.qty} · ${item(l.sku).name}`]]);
      const nx = list.find(([k]) => !pr[k]); if (!nx) { toast('All items checked'); return; }
      pr[nx[0]] = true; S.phoneHit = nx[1] + ' matched'; keepScroll(() => {});
      setTimeout(() => { S.phoneHit = null; const h = document.querySelector('.cam .hit'); if (h) h.classList.remove('show'); }, 1600);
    }
    else if (act === 'phone-sign') {
      const o = order(S.deliveryOn ? 'ORD-1041' : 'ORD-1039'), name = document.getElementById('p-name').value || cust(o.cust).contact, pick = o.type === 'pickup';
      S.sigs[o.id] = document.getElementById('p-sig').toDataURL();
      o.clearance = { by: name, role: pick ? 'Customer' : 'Client representative', at: now(), where: pick ? wh(o.wh).name + ' warehouse' : o.venue };
      o.status = pick ? 'Picked Up' : 'Delivered'; o.releasedBy = o.releasedBy || me().name;
      keepScroll(() => {}); toast(`${o.id} ${o.status.toLowerCase()} and signed`);
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    setTimeout(saveState, 0);
    if (t.dataset.filter) { S.invFilter[t.dataset.filter] = t.value; render(); }
    else if (t.dataset.cond) { const id = routeId(); S.release[id].cond[t.dataset.cond] = t.value; }
    else if (t.dataset.ret) { const id = routeId(); S.ret[id][t.dataset.ret][t.dataset.k] = Math.max(0, parseInt(t.value || '0', 10)); keepScroll(() => {}); }
    else if (t.dataset.unit) { const id = routeId(); S.ret[id].unit[t.dataset.unit] = t.value; keepScroll(() => {}); }
    else if (t.dataset.label) { if (t.dataset.label === 'sku') { S.labelSku = t.value; location.hash = '#/labels?sku=' + t.value; } else { S.labelFmt = t.value; render(); } }
    else if (t.dataset.cal !== undefined) { S.calWh = t.value; render(); }
    else if (S.newOrder && pathOf(location.hash) === '#/orders/new' && (t.dataset.k || t.dataset.line)) {
      if (t.dataset.line !== undefined) { const l = S.newOrder.lines[+t.dataset.line]; if (t.dataset.k === 'qty') l.qty = Math.max(1, parseInt(t.value || '1', 10)); else l.sku = t.value; }
      else if (t.dataset.k === 'type') S.newOrder.type = t.value;
      else if (t.dataset.k === 'wh') S.newOrder.wh = t.value;
      else if (t.dataset.k === 'date' || t.dataset.k === 'ret') { if (t.value) S.newOrder[t.dataset.k] = t.value; }
      keepScroll(() => {});
    }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.field && S.newOrder) S.newOrder[t.dataset.field] = t.value;
    if (t.dataset.company !== undefined) S.company = t.value;
  });
  document.addEventListener('keydown', e => {
    if (e.target.id === 'q' && e.key === 'Enter') { S.q = e.target.value.trim(); const u = allUnits().find(x => x.code.toLowerCase() === S.q.toLowerCase()); const o = order(S.q.toUpperCase());
      if (o) { S.q = ''; location.hash = '#/order/' + o.id; } else if (u) { const it = D.items.find(i => (i.units || []).includes(u)); S.q = ''; location.hash = `#/item/${it.sku}/${u.code}`; } else if (location.hash === '#/inventory') render(); else location.hash = '#/inventory'; }
  });

  function startPageScan() {
    const video = document.getElementById('scan-video'), msg = document.getElementById('scan-msg');
    msg.innerHTML = '';
    startScanner(video, code => { const box = document.getElementById('scan-result'); if (box) box.innerHTML = scanResult(code); }, text => { msg.innerHTML = note(text, 'warn'); document.getElementById('scan-idle').hidden = false; video.hidden = true; document.getElementById('scan-frame').hidden = true; });
    document.getElementById('scan-idle').hidden = true; video.hidden = false; document.getElementById('scan-frame').hidden = false;
  }
  function scanForChecklist(id) {
    const o = order(id);
    modal('Scan items on this order', `<div class="scanner"><video id="chk-video" playsinline muted></video><div class="scan-frame"></div></div><div id="chk-msg" style="margin-top:12px">${note('Point the camera at a label. Matching lines get ticked on the checklist.')}</div>`, `<button class="btn" data-close>Done</button>`, m => {
      const msg = m.querySelector('#chk-msg');
      startScanner(m.querySelector('#chk-video'), code => {
        const i = o.lines.findIndex(l => l.sku === code), unitLine = o.lines.some(l => (l.units || []).includes(code)), key = unitLine ? code : i >= 0 && !o.lines[i].units ? 'L' + i : null;
        if (!key) { msg.innerHTML = note(`<b>${esc(code)}</b> is not on ${o.id}.${lookupCode(code)?.it.track === 'unit' ? ' This item needs its own unit label.' : ''}`, 'bad'); return; }
        S.release[id].ticks[key] = true; keepScroll(() => {});
        const it = item(unitLine ? o.lines.find(l => (l.units || []).includes(code)).sku : code);
        msg.innerHTML = note(`<b>${esc(it.name)}</b> ticked. ${lineKeys(o).filter(k => !S.release[id].ticks[k]).length} left.`, 'ok');
      }, text => { msg.innerHTML = note(text, 'warn'); });
    });
  }

  function saveOrder() {
    const f = S.newOrder, id = 'ORD-' + S.nextOrder++, from = toDate(f.date), to = toDate(f.ret), custKey = 'c' + id;
    const lines = f.lines.map(l => item(l.sku).track === 'unit' ? { sku: l.sku, units: freeUnits(l.sku, f.wh, from, to).slice(0, l.qty).map(u => u.code) } : { sku: l.sku, qty: l.qty });
    D.customers[custKey] = { name: f.cust, contact: f.contact, phone: '0917 555 0166' };
    D.orders.unshift({ id, type: f.type, event: f.event, venue: f.type === 'delivery' ? f.venue : `Customer pickup at ${wh(f.wh).name}`, wh: f.wh, cust: custKey, date: fmtDate(from), returnDate: fmtDate(to), status: 'Preparing', lines });
    if (S.guide && curStep()?.key === 'book') S.story = id;
    S.newOrder = null; navTo('#/order/' + id); toast(`${id} saved. Stock is held for ${fmtShort(from)} to ${fmtShort(to)}.`);
  }

  function submitCheck(id, note_) {
    const o = order(id), r = S.release[id];
    o.check = { by: me().name, at: now(), note: note_, cond: { ...r.cond } };
    o.sentBack = null;
    if (!S.rolesOn) { o.status = o.type === 'pickup' ? 'Ready for Pickup' : 'Ready to Dispatch'; navTo('#/order/' + id); toast(`Checklist done. ${o.id} is ${o.status}.`); return; }
    o.status = 'For Approval';
    D.notifications.unshift({ tone: 'warn', text: `${o.id} ${o.event} checklist submitted by ${me().name}, waiting for approval`, when: 'Just now', link: '#/approve/' + id });
    navTo('#/order/' + id); toast(`Submitted. ${supervisorOf(o.wh)} (Supervisor) has been notified.`);
  }
  function approveOrder(id) {
    const o = order(id);
    o.approval = { by: me().name, role: me().role, at: now() };
    o.status = o.type === 'pickup' ? 'Ready for Pickup' : 'Ready to Dispatch';
    D.notifications.unshift({ tone: 'ok', text: `${o.id} approved by ${me().name}: ${o.status.toLowerCase()}`, when: 'Just now', link: '#/order/' + id });
    navTo('#/order/' + id); toast(`Approved. ${o.id} is ${o.status}. ${o.check.by} has been notified.`);
  }
  function signOrder(id, name, role, sig) {
    const o = order(id);
    if (sig) S.sigs[id] = sig;
    o.clearance = { by: name, role, at: now(), where: o.type === 'pickup' ? wh(o.wh).name + ' warehouse' : o.venue };
    o.releasedBy = o.releasedBy || me().name;
    o.status = o.type === 'pickup' ? 'Picked Up' : 'Delivered';
    D.notifications.unshift({ tone: 'ok', text: `${o.id} ${o.status.toLowerCase()}, clearance signed by ${name}`, when: 'Just now', link: '#/order/' + id });
    navTo('#/clearance/' + id); toast('Clearance signed and saved on the order');
  }
  // "Do this step for me": completes the current guide step with sensible sample input.
  function doStep() {
    const cur = curStep(); if (!cur) return;
    S.role = stepRole(cur);
    const id = S.story, o = story();
    if (cur.key === 'setup') { S.setupDone = true; render(); }
    else if (cur.key === 'book') { const f = S.newOrder || (S.newOrder = newOrderDraft()); f.date = '2026-11-14'; f.ret = '2026-11-15'; saveOrder(); }
    else if (cur.key === 'check') { S.release[id] = { ticks: Object.fromEntries(lineKeys(o).map(k => [k, true])), cond: S.release[id]?.cond || {} }; submitCheck(id, ''); }
    else if (cur.key === 'approve') approveOrder(id);
    else if (cur.key === 'handover') signOrder(id, cust(o.cust).contact, 'Customer', null);
    else if (cur.key === 'return') {
      const r = S.ret[id] || (S.ret[id] = { back: {}, dmg: {}, rep: {}, unit: {}, scanned: {} });
      const i = o.lines.findIndex(l => !l.units);
      if (i >= 0 && r.back['L' + i] === undefined) r.back['L' + i] = o.lines[i].qty - 2;
      finishReturn(id);
    }
  }

  function finishReturn(id) {
    const o = order(id), r = S.ret[id]; let issues = 0;
    o.lines.forEach((l, i) => {
      const it = item(l.sku);
      if (l.units) {
        l.unitBack = {};
        l.units.forEach(u => { const c = r.unit[u] || 'good'; l.unitBack[u] = c; if (c !== 'missing') unit(u).cond = c;
          if (c !== 'good') { issues++; D.damage.unshift({ id: 'DMG-00' + S.nextDmg++, sku: l.sku, unit: u, order: id, cust: o.cust, before: 'good', after: c, note: 'Filed from return.', date: 'Nov 4, 2026', by: me().name, status: c === 'missing' ? 'Awaiting review' : 'Open', charge: 0 }); } });
      } else {
        const k = 'L' + i, back = r.back[k] ?? l.qty, dmg = r.dmg[k] ?? 0, rep = r.rep[k] ?? 0, miss = Math.max(0, l.qty - back);
        Object.assign(l, { back, dmg, rep });
        const s = it.stock[o.wh]; s[0] += Math.max(0, back - dmg - rep); s[1] += dmg; s[2] += rep;
        const file = (q, after) => { issues++; D.damage.unshift({ id: 'DMG-00' + S.nextDmg++, sku: l.sku, unit: null, qty: q, order: id, cust: o.cust, before: 'good', after, note: 'Filed from return.', date: 'Nov 4, 2026', by: me().name, status: after === 'missing' ? 'Awaiting review' : 'Open', charge: 0 }); };
        if (dmg) file(dmg, 'damaged'); if (rep) file(rep, 'repair'); if (miss) file(miss, 'missing');
      }
    });
    o.status = 'Returned'; o.discrepancy = issues > 0;
    D.notifications.unshift({ tone: issues ? 'bad' : 'ok', text: `${o.id} returned${issues ? ` with ${issues} issue${issues > 1 ? 's' : ''}` : ', complete'}`, when: 'Just now', link: '#/order/' + id });
    navTo('#/order/' + id); toast(issues ? `Return complete. ${issues} report${issues > 1 ? 's' : ''} filed.` : 'Return complete. Everything is back in stock.');
  }

  // Applies a stock adjustment. Returns an error message if there isn't enough stock.
  function applyAdj(a) {
    const it = item(a.sku), [src, dst] = a.wh.split(' → ');
    if (a.type === 'Condition update') return null;
    if (a.type === 'Stock-in') {
      if (it.track === 'count') (it.stock[src] = it.stock[src] || [0, 0, 0])[0] += a.qty;
      else addUnits(it, src, a.qty);
      return null;
    }
    if (it.track === 'count') {
      const avail = stats(it, src).avail;
      if (a.qty > avail) return `Only ${n(avail)} available at ${wh(src).name}`;
      it.stock[src][0] -= a.qty;
      if (dst) (it.stock[dst] = it.stock[dst] || [0, 0, 0])[0] += a.qty;
      return null;
    }
    const free = it.units.filter(u => u.wh === src && u.cond === 'good' && !unitOrder(u.code) && !unitReserved(u.code));
    if (a.qty > free.length) return `Only ${free.length} free at ${wh(src).name}`;
    const chosen = free.slice(0, a.qty);
    if (dst) chosen.forEach(u => { u.wh = dst; }); else it.units = it.units.filter(u => !chosen.includes(u));
    return null;
  }
  function addUnits(it, whId, qty) {
    let next = it.units.reduce((m, u) => Math.max(m, +u.code.slice(-3)), 0);
    for (let i = 0; i < qty; i++) it.units.push({ code: `${it.sku}-${String(++next).padStart(3, '0')}`, wh: whId, cond: 'good', out: null });
  }
  const formError = (m, msg) => { const e = m.querySelector('.form-err'); e.textContent = msg; e.hidden = false; };
  const ERR = '<p class="form-err" role="alert" hidden></p>';

  function newAdj() {
    const staff = S.role === 'staff';
    modal('New stock adjustment', `
      <div class="field"><label class="f">Type</label><select class="in" id="adj-type"><option>Stock-in</option><option>Condition update</option><option>Write-off</option><option>Transfer</option></select></div>
      <div class="field"><label class="f">Item</label><select class="in" id="adj-sku">${D.items.map(i => `<option value="${i.sku}">${esc(i.name)} (${i.sku})</option>`).join('')}</select></div>
      <div class="grid g2" style="gap:12px"><div class="field"><label class="f">Quantity</label><input class="in" id="adj-qty" type="number" min="1" value="10"></div>
      <div class="field"><label class="f" id="adj-wh-label">Warehouse</label><select class="in" id="adj-wh">${D.warehouses.filter(w => myWh(w.id)).map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></div></div>
      <div class="field" id="adj-to-wrap" hidden><label class="f">Transfer to</label><select class="in" id="adj-to">${D.warehouses.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></div>
      <div class="field"><label class="f">Note</label><input class="in" id="adj-note" placeholder="Reason, PO number, etc."></div>
      <div id="adj-hint">${staff ? note('Write-offs and transfers you create go to your supervisor for approval.') : ''}</div>${ERR}`,
      `<button class="btn" data-close>Cancel</button><button class="btn primary" id="adj-save">Save</button>`, (m, close) => {
        m.querySelector('#adj-type').onchange = e => { const t = e.target.value === 'Transfer'; m.querySelector('#adj-to-wrap').hidden = !t; m.querySelector('#adj-wh-label').textContent = t ? 'Transfer from' : 'Warehouse'; };
        m.querySelector('#adj-save').onclick = () => {
          const type = m.querySelector('#adj-type').value, qty = parseInt(m.querySelector('#adj-qty').value, 10), src = m.querySelector('#adj-wh').value, dst = m.querySelector('#adj-to').value;
          if (!(qty > 0)) return formError(m, 'Enter a quantity of at least 1.');
          if (type === 'Transfer' && src === dst) return formError(m, 'Choose two different warehouses.');
          const needs = staff && (type === 'Write-off' || type === 'Transfer');
          const x = { id: 'ADJ-0' + S.nextAdj, type, sku: m.querySelector('#adj-sku').value, qty, wh: type === 'Transfer' ? `${src} → ${dst}` : src, by: me().name, role: me().role, note: m.querySelector('#adj-note').value || '-', status: needs ? 'Pending approval' : 'Done', date: 'Nov 4, 2026' };
          if (!needs) { const err = applyAdj(x); if (err) return formError(m, err); }
          S.nextAdj++; D.adjustments.unshift(x); close(); render(); toast(needs ? `Sent to ${supervisorOf(src)} for approval` : 'Adjustment saved, stock updated');
        };
      });
  }

  function addItem() {
    modal('Add item', `
      <div class="field"><label class="f">Item name</label><input class="in" id="i-name" placeholder="e.g. Ghost Chair (Clear)"></div>
      <div class="grid g2" style="gap:12px">
        <div class="field"><label class="f">SKU (optional)</label><input class="in" id="i-sku" placeholder="Created for you"></div>
        <div class="field"><label class="f">Category</label><select class="in" id="i-cat">${D.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label class="f">How is it tracked?</label><select class="in" id="i-track"><option value="count">By count (chairs, tables)</option><option value="unit">Per unit (optional add-on)</option></select></div>
        <div class="field"><label class="f">Low-stock alert below</label><input class="in" id="i-low" type="number" min="0" value="10"></div>
        <div class="field"><label class="f">Warehouse</label><select class="in" id="i-wh">${D.warehouses.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></div>
        <div class="field"><label class="f">Starting quantity</label><input class="in" id="i-qty" type="number" min="1" value="20"></div>
      </div>${ERR}`,
      `<button class="btn" data-close>Cancel</button><button class="btn primary" id="i-save">Add item</button>`, (m, close) => {
        m.querySelector('#i-save').onclick = () => {
          const name = m.querySelector('#i-name').value.trim(), qty = parseInt(m.querySelector('#i-qty').value, 10), track = m.querySelector('#i-track').value, whId = m.querySelector('#i-wh').value;
          if (!name) return formError(m, 'Enter the item name.');
          if (!(qty > 0)) return formError(m, 'Enter a starting quantity of at least 1.');
          const clean = v => v.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
          let sku = clean(m.querySelector('#i-sku').value) || clean(name).slice(0, 14).replace(/-$/, '');
          if (!sku) sku = 'ITEM';
          if (item(sku)) { if (m.querySelector('#i-sku').value.trim()) return formError(m, `SKU ${sku} is already used.`); let k = 2; while (item(`${sku}-${k}`)) k++; sku = `${sku}-${k}`; }
          const it = { sku, name, cat: m.querySelector('#i-cat').value, track, low: Math.max(0, parseInt(m.querySelector('#i-low').value, 10) || 0) };
          if (track === 'count') it.stock = { [whId]: [qty, 0, 0] }; else { it.units = []; addUnits(it, whId, qty); }
          D.items.unshift(it); S.q = ''; S.invFilter = null; close(); navTo('#/item/' + sku); toast(`${name} added`);
        };
      });
  }
  function addWarehouse() {
    const over = D.warehouses.length >= 5;
    modal('Add warehouse', `
      <div class="field"><label class="f">Name</label><input class="in" id="w-name" placeholder="e.g. Cavite"></div>
      <div class="field"><label class="f">Address</label><input class="in" id="w-addr" placeholder="Street, city"></div>
      <div class="field"><label class="f">Description (optional)</label><input class="in" id="w-desc"></div>
      ${over ? note('This goes beyond the 5 included locations, so it would be billed as a one-time setup fee.', 'warn') : ''}${ERR}`,
      `<button class="btn" data-close>Cancel</button><button class="btn primary" id="w-save">Add warehouse</button>`, (m, close) => {
        m.querySelector('#w-save').onclick = () => {
          const name = m.querySelector('#w-name').value.trim();
          if (!name) return formError(m, 'Enter the warehouse name.');
          if (D.warehouses.some(w => w.name.toLowerCase() === name.toLowerCase())) return formError(m, `${name} already exists.`);
          let k = D.warehouses.length + 1; while (wh('W' + k)) k++;
          D.warehouses.push({ id: 'W' + k, name, address: m.querySelector('#w-addr').value.trim() || 'No address yet', description: m.querySelector('#w-desc').value.trim() || 'New location. Add stock with a stock-in adjustment.', active: true });
          close(); render(); toast(`${name} added. Use Adjustments → Stock-in to add stock.`);
        };
      });
  }
  function addCategory() {
    modal('Add category', `<div class="field"><label class="f">Category name</label><input class="in" id="c-name" placeholder="e.g. Catering"></div>${ERR}`,
      `<button class="btn" data-close>Cancel</button><button class="btn primary" id="c-save">Add category</button>`, (m, close) => {
        m.querySelector('#c-save').onclick = () => {
          const name = m.querySelector('#c-name').value.trim();
          if (!name) return formError(m, 'Enter the category name.');
          if (D.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) return formError(m, `${name} already exists.`);
          D.categories.push({ id: 'cat-' + (D.categories.length + 1), name }); close(); render(); toast(`${name} added`);
        };
      });
  }
  function addUser() {
    if (!S.rolesOn && accounts().length >= MAX_USERS) {
      modal('Account limit reached', note(`Package A includes up to ${MAX_USERS} user accounts. More accounts are an optional add-on, quoted on request.`), `<button class="btn" data-close>Close</button>`);
      return;
    }
    modal('Add user', `
      <div class="grid g2" style="gap:12px"><div class="field"><label class="f">Full name</label><input class="in" id="u-name"></div><div class="field"><label class="f">Email</label><input class="in" id="u-email" type="email"></div></div>
      ${S.rolesOn ? `<div class="field"><label class="f">Role</label><select class="in" id="u-role"><option>Staff</option><option>Supervisor</option><option>Admin</option></select></div>
      <div class="field"><label class="f">Warehouses</label><div class="check-list">${D.warehouses.map(w => `<label><input type="checkbox" value="${esc(w.name)}"> ${esc(w.name)}</label>`).join('')}</div></div>` : ''}${ERR}`,
      `<button class="btn" data-close>Cancel</button><button class="btn primary" id="u-save">Add user</button>`, (m, close) => {
        m.querySelector('#u-save').onclick = () => {
          const name = m.querySelector('#u-name').value.trim(), role = m.querySelector('#u-role')?.value || 'Admin', whs = [...m.querySelectorAll('.check-list input:checked')].map(x => x.value);
          if (!name) return formError(m, 'Enter the full name.');
          if (role !== 'Admin' && !whs.length) return formError(m, 'Choose at least one warehouse.');
          D.users.push({ name, email: m.querySelector('#u-email').value.trim() || '-', role, wh: role === 'Admin' ? 'All warehouses' : whs.join(', '), active: true });
          close(); render(); toast(`${name} added`);
        };
      });
  }

  // ---------- saved in this browser ----------
  const SAVE_KEY = 'wims-demo-v3';
  let saving = true;
  const saveState = () => { if (!saving) return; try { const { navOpen, ...keep } = S; localStorage.setItem(SAVE_KEY, JSON.stringify({ D, S: keep })); } catch (e) { /* private mode or full: the demo still works, it just won't survive a reload */ } };
  const loadState = () => { try { const st = JSON.parse(localStorage.getItem(SAVE_KEY)); if (!st) return false; Object.assign(D, st.D); Object.assign(S, st.S); return true; } catch (e) { return false; } };
  function resetDemo() {
    if (!confirm('Start over? This clears everything you changed in this demo.')) return;
    saving = false; try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing saved */ }
    location.hash = '#/welcome'; location.reload();
  }
  window.addEventListener('pagehide', saveState);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveState(); });

  window.addEventListener('hashchange', () => { stopScanner(); S.navOpen = false; render(); window.scrollTo(0, 0); });
  if (!loadState()) { setDelivery(false); seedRelease(); setRoles(false); }
  render();
})();
