// Sample data for the WIMS mockup. Everything here is made up.
window.WIMS_DATA = (() => {
  const warehouses = [
    { id: 'PSG', name: 'Pasig Main', address: 'Ortigas Ave. Ext., Pasig City', description: 'Main hub. Chairs, tables, linens.', active: true },
    { id: 'TGG', name: 'Taguig', address: 'C5 Road, Taguig City', description: 'Sound and lighting.', active: true },
    { id: 'LPS', name: 'Las Piñas', address: 'Alabang–Zapote Rd., Las Piñas', description: 'South events, tents.', active: true },
    { id: 'QC', name: 'Quezon City', address: 'Mindanao Ave., Quezon City', description: 'North overflow storage.', active: true },
  ];

  const categories = [
    { id: 'chairs', name: 'Chairs' },
    { id: 'tables', name: 'Tables' },
    { id: 'linens', name: 'Linens' },
    { id: 'tents', name: 'Tents' },
    { id: 'lighting', name: 'Lighting' },
    { id: 'sound', name: 'Sound Equipment' },
    { id: 'staging', name: 'Staging' },
  ];

  // stock[warehouse] = [good, damaged, forRepair]  (count-tracked items)
  // units = [{ code, wh, cond }]                      (per-unit items)
  const items = [
    { sku: 'CHR-TIF-WHT', name: 'Tiffany Chair (White)', cat: 'chairs', track: 'count', low: 80,
      stock: { PSG: [412, 6, 4], TGG: [120, 0, 2], LPS: [260, 3, 0], QC: [90, 0, 0] } },
    { sku: 'CHR-MON-BLK', name: 'Monoblock Chair (Black)', cat: 'chairs', track: 'count', low: 100,
      stock: { PSG: [540, 12, 0], TGG: [0, 0, 0], LPS: [300, 4, 0], QC: [220, 0, 0] } },
    { sku: 'TBL-6FT-RCT', name: '6ft Rectangular Table', cat: 'tables', track: 'count', low: 12,
      stock: { PSG: [18, 2, 3], TGG: [10, 0, 0], LPS: [44, 0, 1], QC: [25, 0, 0] } },
    { sku: 'TBL-5FT-RND', name: '5ft Round Table', cat: 'tables', track: 'count', low: 10,
      stock: { PSG: [64, 1, 0], TGG: [0, 0, 0], LPS: [38, 0, 2], QC: [12, 0, 0] } },
    { sku: 'LIN-TBL-WHT', name: 'Table Cloth (White, Round)', cat: 'linens', track: 'count', low: 30,
      stock: { PSG: [180, 9, 0], TGG: [0, 0, 0], LPS: [96, 2, 0], QC: [40, 0, 0] } },
    { sku: 'LIN-SSH-GLD', name: 'Chair Sash (Gold)', cat: 'linens', track: 'count', low: 100,
      stock: { PSG: [350, 14, 0], TGG: [0, 0, 0], LPS: [150, 0, 0], QC: [0, 0, 0] } },
    { sku: 'LGT-FRY-10M', name: 'Fairy Lights 10m', cat: 'lighting', track: 'count', low: 20,
      stock: { PSG: [0, 0, 0], TGG: [62, 4, 3], LPS: [30, 0, 0], QC: [0, 0, 0] } },
    { sku: 'STG-PLT-48', name: 'Stage Platform 4×8', cat: 'staging', track: 'count', low: 4,
      stock: { PSG: [6, 0, 1], TGG: [12, 0, 0], LPS: [0, 0, 0], QC: [4, 0, 0] } },
    { sku: 'TNT-1020', name: 'Tent 10×20 (White)', cat: 'tents', track: 'unit', low: 3, units: [] },
    { sku: 'TNT-2040', name: 'Tent 20×40 (Frame)', cat: 'tents', track: 'unit', low: 1, units: [] },
    { sku: 'SND-SPK-15', name: 'Active Speaker 15"', cat: 'sound', track: 'unit', low: 2, units: [] },
    { sku: 'SND-MIX-12', name: '12-Channel Mixer', cat: 'sound', track: 'unit', low: 1, units: [] },
    { sku: 'LGT-PAR-LED', name: 'LED Par Light', cat: 'lighting', track: 'unit', low: 6, units: [] },
  ];

  const unitPlan = {
    'TNT-1020': [['LPS', 8], ['PSG', 6]],
    'TNT-2040': [['LPS', 3]],
    'SND-SPK-15': [['TGG', 10]],
    'SND-MIX-12': [['TGG', 4]],
    'LGT-PAR-LED': [['TGG', 24]],
  };
  for (const it of items.filter(i => i.track === 'unit')) {
    let n = 1;
    for (const [wh, count] of unitPlan[it.sku]) {
      for (let k = 0; k < count; k++) {
        it.units.push({ code: `${it.sku}-${String(n).padStart(3, '0')}`, wh, cond: 'good', out: null });
        n++;
      }
    }
  }
  const unit = code => items.flatMap(i => i.units || []).find(u => u.code === code);
  unit('TNT-1020-007').cond = 'repair';
  unit('SND-SPK-15-004').cond = 'damaged';
  unit('LGT-PAR-LED-019').cond = 'repair';

  const customers = {
    navarro: { name: 'Navarro Family', contact: 'Joy Navarro', phone: '0926 555 0151' },
    santos: { name: 'Santos Family', contact: 'Ana Santos', phone: '0917 555 0142' },
    techcon: { name: 'TechCon PH Inc.', contact: 'Mark Villanueva', phone: '0918 555 0199' },
    reyes: { name: 'Reyes Family', contact: 'Carla Reyes', phone: '0927 555 0110' },
    torres: { name: 'Torres Family', contact: 'Jun Torres', phone: '0915 555 0177' },
    lim: { name: 'Lim Family', contact: 'Grace Lim', phone: '0939 555 0134' },
    garcia: { name: 'Garcia Holdings', contact: 'Paolo Garcia', phone: '0905 555 0188' },
    aquino: { name: 'Aquino Family', contact: 'Bea Aquino', phone: '0916 555 0123' },
  };

  // line: { sku, qty } for count items, { sku, units:[codes] } for per-unit items
  const orders = [
    { id: 'ORD-1045', type: 'pickup', event: 'Navarro Christening', venue: 'Customer pickup at Pasig Main', wh: 'PSG', cust: 'navarro',
      date: 'Nov 7, 2026', returnDate: 'Nov 8, 2026', status: 'Preparing',
      lines: [{ sku: 'CHR-TIF-WHT', qty: 60 }, { sku: 'TBL-5FT-RND', qty: 6 }, { sku: 'LIN-TBL-WHT', qty: 6 }] },
    { id: 'ORD-1042', type: 'delivery', event: 'Santos Wedding', venue: 'Taal Vista, Tagaytay', wh: 'PSG', cust: 'santos',
      date: 'Nov 8, 2026', returnDate: 'Nov 9, 2026', status: 'For Approval',
      check: { by: 'Maria Santos', at: 'Nov 4, 2026 · 8:40 AM', note: 'One round table has a scratched top. Noted on the checklist; still usable.', cond: { L1: 'minor' } },
      lines: [{ sku: 'CHR-TIF-WHT', qty: 150 }, { sku: 'TBL-5FT-RND', qty: 15 }, { sku: 'LIN-TBL-WHT', qty: 15 }, { sku: 'LIN-SSH-GLD', qty: 150 }, { sku: 'TNT-1020', units: ['TNT-1020-009', 'TNT-1020-010'] }] },
    { id: 'ORD-1041', type: 'delivery', event: 'TechCon 2026', venue: 'SMX Convention Center, Pasay', wh: 'TGG', cust: 'techcon',
      date: 'Nov 4, 2026', returnDate: 'Nov 6, 2026', status: 'In Transit',
      lines: [{ sku: 'SND-SPK-15', units: ['SND-SPK-15-001', 'SND-SPK-15-002', 'SND-SPK-15-003', 'SND-SPK-15-005'] }, { sku: 'SND-MIX-12', units: ['SND-MIX-12-001'] }, { sku: 'LGT-PAR-LED', units: ['LGT-PAR-LED-001', 'LGT-PAR-LED-002', 'LGT-PAR-LED-003', 'LGT-PAR-LED-004', 'LGT-PAR-LED-005', 'LGT-PAR-LED-006'] }, { sku: 'STG-PLT-48', qty: 6 }] },
    { id: 'ORD-1040', type: 'delivery', event: 'Reyes Debut', venue: 'Alabang Country Club', wh: 'LPS', cust: 'reyes',
      date: 'Nov 3, 2026', returnDate: 'Nov 5, 2026', status: 'Delivered',
      lines: [{ sku: 'CHR-TIF-WHT', qty: 120 }, { sku: 'TBL-5FT-RND', qty: 12 }, { sku: 'TNT-2040', units: ['TNT-2040-001'] }],
      clearance: { by: 'Carla Reyes', role: 'Client representative', at: 'Nov 3, 2026 · 2:14 PM', where: 'Alabang Country Club' } },
    { id: 'ORD-1039', type: 'pickup', event: 'Torres Family Reunion', venue: 'Customer pickup at Pasig Main', wh: 'PSG', cust: 'torres',
      date: 'Nov 4, 2026', returnDate: 'Nov 6, 2026', status: 'Ready for Pickup',
      check: { by: 'Maria Santos', at: 'Nov 3, 2026 · 4:15 PM', note: '' }, approval: { by: 'Rico Bautista', at: 'Nov 3, 2026 · 4:32 PM' },
      lines: [{ sku: 'CHR-MON-BLK', qty: 80 }, { sku: 'TBL-6FT-RCT', qty: 10 }, { sku: 'TNT-1020', units: ['TNT-1020-011'] }] },
    { id: 'ORD-1038', type: 'pickup', event: 'Lim 7th Birthday', venue: 'Customer pickup at Taguig', wh: 'TGG', cust: 'lim',
      date: 'Nov 2, 2026', returnDate: 'Nov 4, 2026', status: 'Picked Up',
      lines: [{ sku: 'LGT-FRY-10M', qty: 12 }, { sku: 'SND-SPK-15', units: ['SND-SPK-15-006', 'SND-SPK-15-007'] }],
      clearance: { by: 'Grace Lim', role: 'Customer', at: 'Nov 2, 2026 · 10:05 AM', where: 'Taguig warehouse' } },
    { id: 'ORD-1037', type: 'delivery', event: 'Garcia Holdings Year-End Party', venue: 'Marriott Grand Ballroom, Pasay', wh: 'PSG', cust: 'garcia',
      date: 'Nov 1, 2026', returnDate: 'Nov 3, 2026', status: 'Returning',
      lines: [{ sku: 'CHR-TIF-WHT', qty: 200 }, { sku: 'TBL-6FT-RCT', qty: 20 }, { sku: 'LIN-TBL-WHT', qty: 20 }, { sku: 'TNT-1020', units: ['TNT-1020-012', 'TNT-1020-013'] }],
      clearance: { by: 'Paolo Garcia', role: 'Client representative', at: 'Nov 1, 2026 · 9:40 AM', where: 'Marriott Grand Ballroom' } },
    { id: 'ORD-1036', type: 'delivery', event: 'Aquino Wedding', venue: 'Casa Ibarra, Taguig', wh: 'LPS', cust: 'aquino',
      date: 'Oct 25, 2026', returnDate: 'Oct 27, 2026', status: 'Returned', discrepancy: true,
      lines: [{ sku: 'CHR-TIF-WHT', qty: 200, back: 198, dmg: 2 }, { sku: 'TBL-5FT-RND', qty: 20, back: 20, dmg: 0 }, { sku: 'TNT-1020', units: ['TNT-1020-006', 'TNT-1020-007'], unitBack: { 'TNT-1020-006': 'good', 'TNT-1020-007': 'repair' } }],
      clearance: { by: 'Bea Aquino', role: 'Client representative', at: 'Oct 25, 2026 · 8:30 AM', where: 'Casa Ibarra' } },
  ];
  // Units currently out on orders.
  for (const o of orders) {
    if (['In Transit', 'Delivered', 'Picked Up', 'Returning'].includes(o.status)) {
      for (const l of o.lines) (l.units || []).forEach(c => { unit(c).out = o.id; });
    }
  }

  const damage = [
    { id: 'DMG-0092', sku: 'TNT-1020', unit: 'TNT-1020-007', order: 'ORD-1036', cust: 'aquino', before: 'good', after: 'repair',
      note: 'Torn side panel, about 40cm, near the zipper. Released in good condition (signed clearance Oct 25).', date: 'Oct 27, 2026', by: 'Maria Santos', status: 'Charged to customer', charge: 3500 },
    { id: 'DMG-0091', sku: 'CHR-TIF-WHT', unit: null, qty: 2, order: 'ORD-1036', cust: 'aquino', before: 'good', after: 'damaged',
      note: '2 chairs with cracked legs.', date: 'Oct 27, 2026', by: 'Maria Santos', status: 'Charged to customer', charge: 1600 },
    { id: 'DMG-0090', sku: 'CHR-TIF-WHT', unit: null, qty: 2, order: 'ORD-1036', cust: 'aquino', before: 'good', after: 'missing',
      note: '2 chairs not returned (198 of 200).', date: 'Oct 27, 2026', by: 'Maria Santos', status: 'Awaiting Admin review', charge: 2400 },
    { id: 'DMG-0089', sku: 'SND-SPK-15', unit: 'SND-SPK-15-004', order: 'ORD-1031', cust: 'techcon', before: 'good', after: 'damaged',
      note: 'Woofer rattles at high volume.', date: 'Oct 19, 2026', by: 'Jomar Ramos', status: 'Under repair', charge: 0 },
  ];

  const unitHistory = {
    'TNT-1020-007': [
      { date: 'Oct 27, 2026', text: 'Returned from ORD-1036 Aquino Wedding: good → for repair (torn side panel). DMG-0092', tone: 'bad' },
      { date: 'Oct 25, 2026', text: 'Released on ORD-1036, signed by Bea Aquino. Condition: good', tone: '' },
      { date: 'Oct 12, 2026', text: 'Returned from ORD-1022 Villanueva Christening: good', tone: '' },
      { date: 'Oct 10, 2026', text: 'Released on ORD-1022, signed by Mark Villanueva. Condition: good', tone: '' },
      { date: 'Sep 2, 2026', text: 'Added to stock at Las Piñas. Label printed.', tone: '' },
    ],
  };

  const adjustments = [
    { id: 'ADJ-0310', type: 'Write-off', sku: 'CHR-TIF-WHT', qty: 2, wh: 'LPS', by: 'Maria Santos', role: 'Staff', note: '2 chairs lost at Aquino Wedding (DMG-0090).', status: 'Pending approval', date: 'Nov 3, 2026' },
    { id: 'ADJ-0309', type: 'Transfer', sku: 'TBL-6FT-RCT', qty: 15, wh: 'LPS → PSG', by: 'Maria Santos', role: 'Staff', note: 'Pasig is low on 6ft tables.', status: 'Pending approval', date: 'Nov 3, 2026' },
    { id: 'ADJ-0308', type: 'Stock-in', sku: 'LIN-SSH-GLD', qty: 100, wh: 'PSG', by: 'Maria Santos', role: 'Staff', note: 'New purchase, PO 2026-118.', status: 'Done', date: 'Nov 2, 2026' },
    { id: 'ADJ-0307', type: 'Condition update', sku: 'TBL-6FT-RCT', qty: 3, wh: 'PSG', by: 'Juan Dela Cruz', role: 'Admin', note: 'Repaired, moved from for repair to good.', status: 'Done', date: 'Oct 30, 2026' },
  ];

  const notifications = [
    { tone: 'warn', text: 'Low stock: 6ft Rectangular Table at Pasig Main (8 available, alert at 12)', when: '2h ago', link: '#/item/TBL-6FT-RCT' },
    { tone: 'info', text: 'ORD-1041 TechCon 2026 is In Transit to SMX Convention Center', when: '3h ago', link: '#/order/ORD-1041' },
    { tone: 'bad', text: 'Return discrepancy on ORD-1036: 2 chairs missing, 1 tent damaged', when: 'Oct 27', link: '#/order/ORD-1036' },
    { tone: 'warn', text: 'ORD-1042 Santos Wedding checklist submitted by Maria Santos, waiting for supervisor approval', when: '1h ago', link: '#/approve/ORD-1042' },
    { tone: 'info', text: '2 stock adjustments from Maria Santos are waiting for approval', when: 'Yesterday', link: '#/approvals' },
    { tone: 'ok', text: 'ORD-1040 Reyes Debut delivered, clearance signed by Carla Reyes', when: 'Yesterday', link: '#/order/ORD-1040' },
  ];

  const users = [
    { name: 'Juan Dela Cruz', email: 'juan@example.com', role: 'Admin', wh: 'All warehouses', active: true },
    { name: 'Rico Bautista', email: 'rico@example.com', role: 'Supervisor', wh: 'Pasig Main, Las Piñas', active: true },
    { name: 'Maria Santos', email: 'maria@example.com', role: 'Staff', wh: 'Pasig Main, Las Piñas', active: true },
    { name: 'Jomar Ramos', email: 'jomar@example.com', role: 'Staff', wh: 'Taguig', active: true },
    { name: 'Liza Mendoza', email: 'liza@example.com', role: 'Staff', wh: 'Quezon City', active: false },
  ];

  return { warehouses, categories, items, customers, orders, damage, unitHistory, adjustments, notifications, users };
})();
