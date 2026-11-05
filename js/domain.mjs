/* ============================================================================
 * domain.js —— 业务领域层
 *   AU   澳洲邮编 / 卸货港 / 派送区 / 派送费预估（真实路网模型）
 *   CRM  客户档案纯函数（前后端一致的口径）
 *   Recommend  整柜方案推荐引擎
 * ==========================================================================*/
'use strict';

/* ============================== AU 澳洲路网 ============================== */
const AU = {
  PK: [], TIER: {}, PCM: new Map(), PCS: [], KMT: null, kmLoading: null, ready: false,
  MODEL: null,
  init: function () {
    if (AU.ready) return true;
    const d = window.AU_DATA || {};
    AU.MODEL = window.AU_MODEL || null;
    AU.PK = d.PK || [];
    AU.TIER = d.TIER || {};
    String(d.PC_META || '').split(/\\n|\n/).forEach(function (line, i) {
      const f = line.split('|');
      if (f.length < 5) return;
      const o = { i: i, pc: f[0], st: f[1], lat: parseFloat(f[2]), lon: parseFloat(f[3]), suburb: f[4] };
      AU.PCS.push(o);
      if (!AU.PCM.has(o.pc)) AU.PCM.set(o.pc, o);
    });
    AU.ready = AU.PCS.length > 0;
    return AU.ready;
  },
  lookup: function (pc) {
    AU.init();
    return AU.PCM.get(String(pc || '').trim()) || null;
  },
  /* 真实 OSRM 里程矩阵（143KB base64，首次用到时才加载） */
  decodeKm: function (b64) {
    const bin = atob(String(b64).trim());
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    AU.KMT = new Uint16Array(u.buffer);
    return true;
  },
  /* 路网矩阵按需加载：优先用内联的 au-km.js（file:// 单机模式可用），失败再退回 fetch */
  loadKm: function () {
    if (AU.KMT) return Promise.resolve(true);
    if (AU.kmLoading) return AU.kmLoading;
    AU.kmLoading = new Promise(function (resolve) {
      if (window.AU_KM_B64) { try { AU.decodeKm(window.AU_KM_B64); resolve(true); return; } catch (e) {} }
      const s = document.createElement('script');
      s.src = 'js/au-km.mjs?v=1';
      s.onload = function () {
        try { AU.decodeKm(window.AU_KM_B64); resolve(true); }
        catch (e) { AU.kmLoading = null; resolve(false); }
      };
      s.onerror = function () {
        /* 兜底：某些环境允许 fetch 本地文件 */
        fetch('assets/km-b64.txt').then(function (r) { return r.text(); }).then(function (b64) {
          try { AU.decodeKm(b64); resolve(true); } catch (e) { AU.kmLoading = null; resolve(false); }
        }).catch(function () { AU.kmLoading = null; resolve(false); });
      };
      document.head.appendChild(s);
    });
    return AU.kmLoading;
  },
  kmAt: function (idx, portIdx) { return AU.KMT ? AU.KMT[idx * AU.PK.length + portIdx] : 0; },
  zoneOf: function (km) {
    const z = (AU.MODEL && AU.MODEL.zones) || [];
    for (let i = 0; i < z.length; i++) if (km <= z[i].to) return z[i].n;
    return z.length ? z[z.length - 1].n : '';
  },
  ctFactor: function (ctn, mode) {
    const f = (AU.MODEL && AU.MODEL.ctFactor) || {};
    const tbl = (mode === 'sl' ? f.sl : f.std) || {};
    if (tbl[ctn] !== undefined) return num(tbl[ctn]);
    return num(tbl['40HQ']) || 1;
  },
  /* 卸货港匹配：主港优先 + 区域港 60km / 支线港 300km 阈值 + 50km 腹地规则 */
  pickPort: function (rec, forcedIdx) {
    const ds = AU.PK.map(function (n, p) { return { p: p, km: AU.kmAt(rec.i, p), major: !!(((AU.MODEL || {}).ports || {})[n] || {}).major }; });
    ds.sort(function (a, b) { return a.km - b.km; });
    if (forcedIdx >= 0 && forcedIdx < AU.PK.length) {
      const f = ds.find(function (x) { return x.p === forcedIdx; });
      return { idx: forcedIdx, km: f ? f.km : 0, why: '手动指定 ' + AU.PK[forcedIdx] };
    }
    const nM = ds.find(function (x) { return x.major; }) || ds[0];
    const n = ds[0];
    if (n.major) return { idx: n.p, km: n.km, why: AU.PK[n.p] + ' 为主要集装箱港' };
    const tier = AU.TIER[AU.PK[n.p]] || 3;
    const need = tier === 2 ? 60 : 300;
    const adv = nM.km - n.km;
    const hinter = (tier === 2 && n.km <= 50);
    if (adv >= need || hinter) {
      return { idx: n.p, km: n.km, why: (tier === 2 ? '区域集装箱港 ' : '支线港 ') + AU.PK[n.p] + ' 为该地区卸货港（距 ' + n.km + ' km，较 ' + AU.PK[nM.p] + ' 近 ' + adv + ' km）' };
    }
    return { idx: nM.p, km: nM.km, why: '按主要港 ' + AU.PK[nM.p] + ' 卸港（就近 ' + AU.PK[n.p] + ' 仅近 ' + adv + ' km，未达 ' + need + ' km 阈值）' };
  },
  /* 回退：无里程矩阵时按州给主港 */
  portByState: function (st) {
    const m = { NSW: 'Sydney', VIC: 'Melbourne', QLD: 'Brisbane', SA: 'Adelaide', WA: 'Fremantle', TAS: 'Melbourne', NT: 'Adelaide', ACT: 'Sydney' };
    return m[st] || 'Sydney';
  },
  /* 派送费预估：基础拖车 + 幂律递减里程费（与报价系统同一口径） */
  cart: function (pName, ctn, mode, km) {
    const p = ((AU.MODEL || {}).ports || {})[pName] || {};
    const cf = AU.ctFactor(ctn, mode);
    const base = (mode === 'sl' ? num(p.cartSL) : num(p.cartStd)) * cf;
    const rate = num(p.kmRate) * (mode === 'sl' ? 1.10 : 1.00);
    const kmm = (AU.MODEL || {}).kmModel || {};
    const free = num(kmm.free) || 25, ref = num(kmm.ref) || 100, ex = num(kmm.exp);
    let kmCost = 0;
    if (km > free) { const k = 1 - ex; kmCost = rate * ref / k * (Math.pow(km / ref, k) - Math.pow(free / ref, k)); }
    return { base: base, kmCost: kmCost, total: base + kmCost, rate: rate, free: free };
  },
  quoteDelivery: function (opt) {
    AU.init();
    const pc = String(opt.postcode || '').trim();
    const rec = AU.lookup(pc);
    const out = { ok: false, postcode: pc, km: 0, zone: '', port: '', portLabel: '', why: '', low: 0, high: 0, mid: 0, items: [], source: 'state' };
    if (!rec) {
      const port = AU.portByState(opt.state);
      out.port = port; out.portLabel = (((AU.MODEL || {}).ports || {})[port] || {}).label || port;
      out.why = '邮编 ' + (pc || '未填') + ' 不在路网覆盖范围（NSW 2xxx / VIC 3xxx / QLD 4xxx / SA 5xxx / WA 6xxx），已按 ' + (opt.state || '州') + ' 主要港口估算';
      out.zone = '待确认';
      const c = AU.cart(port, opt.ctn || '40HQ', opt.mode === 'sl' ? 'sl' : 'std', 60);
      out.mid = Math.round(c.total * 1.15 + 450);
      out.low = Math.round(out.mid * 0.88); out.high = Math.round(out.mid * 1.18);
      return out;
    }
    if (!AU.KMT) {
      /* 路网里程矩阵尚未加载：按州给主港 + 保守估算，避免误判就近港 */
      const port0 = AU.portByState(rec.st);
      out.port = port0; out.portLabel = (((AU.MODEL || {}).ports || {})[port0] || {}).label || port0;
      out.why = '路网里程数据加载中，已按 ' + (rec.st || '收货州') + ' 主要港口 ' + port0 + ' 估算（重新生成方案可获得真实里程与派送区）';
      out.zone = '待测';
      const c0 = AU.cart(port0, opt.ctn || '40HQ', opt.mode === 'sl' ? 'sl' : 'std', 60);
      out.mid = Math.round(c0.total * 1.15 + 450);
      out.low = Math.round(out.mid * 0.9); out.high = Math.round(out.mid * 1.15);
      return out;
    }
    const forced = (opt.forcedIdx === undefined || opt.forcedIdx === null) ? -1 : num(opt.forcedIdx);
    const pk = AU.pickPort(rec, forced);
    const pName = AU.PK[pk.idx];
    const p = ((AU.MODEL || {}).ports || {})[pName] || {};
    const mode = opt.mode === 'sl' ? 'sl' : 'std';
    const c = AU.cart(pName, opt.ctn || '40HQ', mode, pk.km);
    const fuelPct = num(p.fuel) / 100;
    const fuel = c.total * fuelPct;
    const fixed = num(p.toll) + num(p.cong) + num(p.vbs) + num(p.energy) + ((AU.MODEL || {}).extras || {}).depotInfra || 0;
    const empty = num((p.empty || {})['Container Chain 预约还箱'] || 0);
    const side = mode === 'sl' ? num(p.side) : 0;
    const mid = c.total + fuel + fixed + empty + side;
    out.ok = true;
    out.km = pk.km; out.zone = AU.zoneOf(pk.km); out.port = pName;
    out.portLabel = p.label || pName; out.why = pk.why;
    out.mid = Math.round(mid);
    out.low = Math.round(mid * 0.92); out.high = Math.round(mid * 1.12);
    out.items = [
      { k: '基础拖车费（' + (p.label || pName) + ' · ' + (mode === 'sl' ? '侧卸车' : '标准车') + '）', v: Math.round(c.base) },
      { k: '里程费（' + pk.km + ' km，含首 ' + c.free + ' km）', v: Math.round(c.kmCost) },
      { k: '燃油附加费 ' + num(p.fuel) + '%', v: Math.round(fuel) },
      { k: '码头 / 预约 / 空箱还箱等固定项', v: Math.round(fixed + empty) },
      { k: '侧卸车附加', v: Math.round(side) }
    ].filter(function (x) { return x.v > 0; });
    return out;
  },
  stateOf: function (pc) { const r = AU.lookup(pc); return r ? r.st : ''; },
  suburbOf: function (pc) { const r = AU.lookup(pc); return r ? r.suburb : ''; },
  allPorts: function () { AU.init(); return AU.PK.slice(); },
  zoneOptions: function () { return ((AU.MODEL || {}).zones || []).map(function (z) { return z.n; }); }
};

/* ================================ CRM 领域 =============================== */
const CRM = {
  parseQuery: function (path) {
    const o = {};
    const i = String(path).indexOf('?');
    if (i < 0) return o;
    String(path).slice(i + 1).split('&').forEach(function (kv) {
      const p = kv.split('=');
      if (p[0]) o[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    return o;
  },
  cargoSummary: function (items, plan) {
    const list = Array.isArray(items) ? items : [];
    let qty = 0, cbm = 0, wt = 0;
    list.forEach(function (it) {
      const q = num(it.qty) || 1;
      qty += q;
      cbm += q * num(it.L_cm) * num(it.W_cm) * num(it.H_cm) / 1e6;
      wt += q * num(it.weight_kg);
    });
    const out = { totalQty: Math.round(qty), totalCbm: Math.round(cbm * 1000) / 1000, totalWeight: Math.round(wt * 10) / 10, containerType: '', containerCount: 0, utilization: 0 };
    if (plan && typeof plan === 'object') {
      out.containerType = plan.containerType || '';
      out.containerCount = num(plan.containerCount);
      out.utilization = num(plan.utilization);
      if (plan.containers) out.containers = plan.containers;
      if (plan.warnings) out.warnings = plan.warnings;
      if (plan.recommended) out.recommended = plan.recommended;
    }
    return out;
  },
  customerStats: function (c) {
    let qty = 0, cbm = 0, wt = 0, lastCargo = null;
    (c.cargos || []).forEach(function (g) {
      qty += num(g.summary && g.summary.totalQty);
      cbm += num(g.summary && g.summary.totalCbm);
      wt += num(g.summary && g.summary.totalWeight);
      if (!lastCargo || (g.createdAt || '') > (lastCargo.createdAt || '')) lastCargo = g;
    });
    let lastQuote = null;
    (c.quotes || []).forEach(function (q) { if (!lastQuote || (q.createdAt || '') > (lastQuote.createdAt || '')) lastQuote = q; });
    return {
      cargoCount: (c.cargos || []).length, recCount: (c.recommendations || []).length, quoteCount: (c.quotes || []).length,
      totalQty: Math.round(qty), totalCbm: Math.round(cbm * 1000) / 1000, totalWeight: Math.round(wt * 10) / 10,
      containerType: (lastCargo && lastCargo.summary && lastCargo.summary.containerType) || (lastQuote && lastQuote.ctn) || '',
      lastQuoteAmount: lastQuote ? num(lastQuote.totals && lastQuote.totals.sell) : 0,
      lastQuoteCur: lastQuote ? (lastQuote.cur || 'AUD') : '',
      lastQuoteAt: lastQuote ? lastQuote.createdAt : '',
      lastQuoteNo: lastQuote ? lastQuote.no : ''
    };
  },
  completeness: function (c) {
    const checks = [!!c.company, !!c.contact, !!(c.phone || c.email), !!c.state, !!c.postcode, !!c.address,
      (c.cargos || []).length > 0, (c.recommendations || []).length > 0, (c.quotes || []).length > 0];
    return Math.round(checks.filter(Boolean).length / checks.length * 100);
  },
  summarize: function (c, full) {
    const s = CRM.customerStats(c);
    const base = {
      id: c.id, company: c.company, contact: c.contact, phone: c.phone, email: c.email, wechat: c.wechat,
      country: c.country, state: c.state, postcode: c.postcode, suburb: c.suburb, address: c.address,
      level: c.level, source: c.source, status: c.status, tags: c.tags || [], notes: c.notes,
      createdAt: c.createdAt, updatedAt: c.updatedAt, completeness: CRM.completeness(c)
    };
    Object.keys(s).forEach(function (k) { base[k] = s[k]; });
    if (full) { base.cargos = c.cargos || []; base.recommendations = c.recommendations || []; base.quotes = c.quotes || []; base.timeline = c.timeline || []; }
    return base;
  },
  newCustomer: function (body, db) {
    const b = body || {};
    const id = LocalDB.nextId(db, 'customer', 'CUS');
    return {
      id: id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      company: b.company || '', contact: b.contact || '', phone: b.phone || '', email: b.email || '',
      wechat: b.wechat || '', country: b.country || 'Australia', state: b.state || '', postcode: b.postcode || '',
      suburb: b.suburb || '', address: b.address || '', level: b.level || 'B', source: b.source || '其他',
      status: b.status || 'lead', tags: b.tags || [], notes: b.notes || '',
      cargos: [], recommendations: [], quotes: [],
      timeline: [{ at: new Date().toISOString(), type: 'create', text: '客户建档：' + (b.company || b.contact || '未命名') }]
    };
  },
  statsFrom: function (db) {
    const cs = db.customers || [];
    let cbm = 0, qty = 0, wt = 0, amount = 0, quotes = 0, cargos = 0, recs = 0;
    const byStatus = {}, byState = {};
    cs.forEach(function (c) {
      const s = CRM.customerStats(c);
      cbm += s.totalCbm; qty += s.totalQty; wt += s.totalWeight; amount += s.lastQuoteAmount;
      quotes += s.quoteCount; cargos += s.cargoCount; recs += s.recCount;
      byStatus[c.status || 'lead'] = (byStatus[c.status || 'lead'] || 0) + 1;
      if (c.state) byState[c.state] = (byState[c.state] || 0) + 1;
    });
    return {
      customers: cs.length, cargoCount: cargos, recCount: recs, quoteCount: quotes,
      totalCbm: Math.round(cbm * 10) / 10, totalQty: qty, totalWeight: Math.round(wt),
      quoteAmount: Math.round(amount * 100) / 100, byStatus: byStatus, byState: byState, offline: true
    };
  }
};

/* ========================= 整柜方案推荐引擎 ============================== */
const CONTAINER_SPEC = {
  '20GP': { name: '20GP', inner: [589, 235, 239], geo: 33.1, usable: 28, payload: 21500, tare: 2200, note: '小批量试单 / 重货首选' },
  '40GP': { name: '40GP', inner: [1203, 235, 239], geo: 67.6, usable: 58, payload: 26500, tare: 3800, note: '标准柜，单位成本低' },
  '40HQ': { name: '40HQ', inner: [1203, 235, 269], geo: 76.3, usable: 68, payload: 26000, tare: 3900, note: '轻抛货首选，容积最大性价比' },
  '45HQ': { name: '45HQ', inner: [1355, 235, 269], geo: 86.0, usable: 78, payload: 27500, tare: 4800, note: '抛货多、内陆运力允许时可选' }
};
const DOOR_SPEC = { '20GP': [234, 228], '40GP': [234, 228], '40HQ': [234, 258], '45HQ': [234, 258] };
const TRANSIT_BY_REGION = { south: [14, 18], east: [18, 22], north: [22, 27] };

const Recommend = {
  regionOf: function (prov) {
    const p = String(prov || '');
    const south = ['广东', '广西', '福建', '海南', '云南', '贵州', '湖南', '江西'];
    const east = ['上海', '江苏', '浙江', '安徽', '湖北', '四川', '重庆', '河南'];
    for (let i = 0; i < south.length; i++) if (p.indexOf(south[i]) >= 0) return 'south';
    for (let i = 0; i < east.length; i++) if (p.indexOf(east[i]) >= 0) return 'east';
    return 'north';
  },
  /* 主入口：根据货物 + 目的地生成整柜方案推荐 */
  run: function (input) {
    const items = (input && input.items) || [];
    const opt = input || {};
    AU.init();
    let qty = 0, cbm = 0, wt = 0, maxPieceWt = 0, maxPieceLen = 0, maxPieceAft = 0;
    const byType = {}, risks = [], points = [];
    let pallets = 0, crates = 0, cartons = 0, heavyPieces = 0, fragilePieces = 0, hazmatPieces = 0, inspectPieces = 0, oversize = 0;
    const stops = {};
    items.forEach(function (it) {
      const q = Math.max(1, Math.round(num(it.qty) || 1));
      const L = num(it.L_cm), W = num(it.W_cm), H = num(it.H_cm), wkg = num(it.weight_kg);
      qty += q;
      cbm += q * L * W * H / 1e6;
      wt += q * wkg;
      maxPieceWt = Math.max(maxPieceWt, wkg);
      maxPieceLen = Math.max(maxPieceLen, L, W);
      maxPieceAft = Math.max(maxPieceAft, H);
      const t = it.type || 'carton';
      byType[t] = (byType[t] || 0) + q;
      if (t === 'pallet') pallets += q;
      if (t === 'crate') crates += q;
      if (t === 'carton') cartons += q;
      if (wkg >= 500) heavyPieces += q;
      if (num(it.fragile) >= 2) fragilePieces += q;
      if (num(it.hazmat) > 0) hazmatPieces += q;
      if (num(it.inspect) > 0) inspectPieces += q;
      const d = DOOR_SPEC['40HQ'];
      if (W > d[0] - 4 || H > d[1] - 4) oversize += q;
      const s = num(it.unloadStop) || 1;
      stops[s] = (stops[s] || 0) + q;
    });
    cbm = Math.round(cbm * 1000) / 1000;
    wt = Math.round(wt * 10) / 10;

    /* --- 柜型阶梯 --- */
    const ladder = ['20GP', '40GP', '40HQ', '45HQ'].map(function (k) {
      const s = CONTAINER_SPEC[k];
      const count = Math.max(1, Math.ceil(cbm / s.usable));
      const util = cbm / (s.usable * count);
      const wtUtil = wt / (s.payload * count);
      const fit = util <= 1.0 && wtUtil <= 1.0;
      return {
        type: k, count: count, usable: s.usable, payload: s.payload, note: s.note,
        utilization: Math.round(util * 1000) / 10, weightUtil: Math.round(wtUtil * 1000) / 10,
        fit: fit, overCbm: Math.max(0, Math.round((cbm - s.usable * count) * 10) / 10),
        overWt: Math.max(0, Math.round((wt - s.payload * count) / 10) * 10),
        score: (fit ? 100 : 0) + (util > 0.72 && util <= 1 ? 15 : 0) - Math.max(0, util - 0.97) * 60 - Math.max(0, wtUtil - 0.95) * 40 + (k === '40HQ' ? 3 : 0)
      };
    });
    const feasible = ladder.filter(function (x) { return x.fit; });
    feasible.sort(function (a, b) { return b.score - a.score || a.count - b.count; });
    let best = feasible[0] || ladder.slice().sort(function (a, b) { return b.score - a.score; })[0];
    let bestCount = best.count;
    /* 重量优先：体积够但超重时按重量重算 */
    if (best.fit && wt > CONTAINER_SPEC[best.type].payload * bestCount) {
      bestCount = Math.ceil(wt / CONTAINER_SPEC[best.type].payload);
    }

    /* --- 目的地 / 路线 --- */
    const dc = AU.quoteDelivery({ postcode: opt.postcode, state: opt.state, ctn: best.type, mode: opt.mode });
    const region = Recommend.regionOf(opt.prov || opt.originProv);
    const transit = TRANSIT_BY_REGION[region] || [16, 22];

    /* --- 装载建议 --- */
    if (heavyPieces > 0) points.push({ level: 'info', t: '重货配载', d: '检测到 ' + heavyPieces + ' 件单品 ≥500kg：按「重货在下、轻货在上」装柜，重货靠近车头端与柜底，禁止轻货压重货。' });
    if (pallets > 0) points.push({ level: 'info', t: '托盘货', d: pallets + ' 件托盘货：建议整托装载不拆托，托盘前方预留 ≥30cm 叉车进叉空间，托盘之间贴紧并用绑带连成整体。' });
    if (crates > 0) points.push({ level: 'info', t: '木箱/大件', d: crates + ' 件木箱：确认木箱承压强度，必要时上下加木方垫平；箱体与柜壁空隙用充气袋或木方塞实。' });
    if (cartons > 0) points.push({ level: 'info', t: '纸箱货', d: cartons + ' 件纸箱：可拆托散装以提高装载率；顶层纸箱上方留 5cm 缓冲，柜门端加装安全网。' });
    if (maxPieceLen >= 240) points.push({ level: 'warn', t: '长条货', d: '最长件 ' + Math.round(maxPieceLen) + 'cm：沿柜长方向纵向码放，两侧用木方限位，柜门端预留 ≥20cm 装安全网/挡杆。' });
    if (Object.keys(stops).length > 1) {
      const order = Object.keys(stops).map(Number).sort(function (a, b) { return a - b; });
      points.push({ level: 'info', t: '多卸货站（' + order.length + ' 站）', d: '按「后卸先装」原则：第 ' + order[order.length - 1] + ' 站货物装车头端，第 ' + order[0] + ' 站货物靠柜门端，站间留 30~50cm 通道并挂标识牌。' });
    }
    if (inspectPieces > 0) points.push({ level: 'warn', t: '查验货', d: inspectPieces + ' 件需查验货物：安排在柜门端 1/3 区域，方便海关掏箱查验，避免整柜翻倒。' });
    if (fragilePieces > 0) points.push({ level: 'warn', t: '易碎品', d: fragilePieces + ' 件易碎品：置于上层或独立区域，加气泡膜/珍珠棉，与重货之间加隔板，建议投保。' });
    if (hazmatPieces > 0) points.push({ level: 'err', t: '危险品', d: hazmatPieces + ' 件危险品：必须做危申报与 MSDS，与易碎品保持 ≥30cm 隔离，与普通货 ≥10cm，柜内张贴危险品标牌。' });
    const freeLen = CONTAINER_SPEC[best.type].inner[0] - 20;
    points.push({ level: 'ok', t: '加固方案', d: '柜门端空隙 ≥25cm 时加装安全网 + 挡杆；顶部长条空隙用充气袋填实；底部第一层铺设防滑垫（' + best.type + ' 内长 ' + CONTAINER_SPEC[best.type].inner[0] + 'cm，有效装载长 ≤' + freeLen + 'cm）。' });
    if (opt.moduleSummary && opt.moduleSummary.containerType) {
      points.push({ level: 'ok', t: '3D 装柜实测', d: '已在 3D 智能装柜模块完成逐件排布：' + opt.moduleSummary.containerType + ' × ' + (opt.moduleSummary.containerCount || 1) + '，实测装载率 ' + (Math.round(num(opt.moduleSummary.utilization) * 1000) / 10) + '%（' + fmtNum(opt.moduleSummary.totalCbm, 2) + ' CBM）。柜型与装载率以 3D 结果为准，本页推荐值用于对外报价前估算。' });
    }
    points.push({ level: 'ok', t: '重心控制', d: '重心高度建议 ≤ 柜高 50%（' + Math.round(CONTAINER_SPEC[best.type].inner[2] / 2) + 'cm 以内），前后配重差 ≤ 60cm，左右偏载 ≤ 5cm；装柜完成用 3D 模块复核重心与偏载。' });

    /* --- 风险 --- */
    if (cbm > 0 && cbm < 15) risks.push({ level: 'warn', t: '货量偏少', d: '总体积仅 ' + cbm + ' CBM，整柜装载率不足 25%，建议评估 LCL 拼箱或与其它订单合并凑柜。' });
    if (!feasible.length) risks.push({ level: 'err', t: '超限', d: '当前货量在任一柜型单柜下均超限（体积 ' + cbm + ' CBM / 重量 ' + (wt / 1000).toFixed(2) + ' t），建议拆分为 ' + Math.ceil(cbm / CONTAINER_SPEC['40HQ'].usable) + ' 个 40HQ 或改用散货/特种柜。' });
    if (bestCount > 1) risks.push({ level: 'warn', t: '需多柜', d: '建议 ' + bestCount + ' × ' + best.type + '；可让 3D 装柜模块按实际尺寸复核每柜装载率，避免「算够但装不下」。' });
    if (wt / (CONTAINER_SPEC[best.type].payload * bestCount) > 0.95) risks.push({ level: 'err', t: '接近超重', d: '货物毛重 ' + (wt / 1000).toFixed(2) + ' t，已达 ' + best.type + ' 载重上限的 ' + Math.round(wt / (CONTAINER_SPEC[best.type].payload * bestCount) * 100) + '%，澳洲公路轴重限制严格，需评估减载或申请超重许可。' });
    if (oversize > 0) risks.push({ level: 'err', t: '超尺寸件', d: oversize + ' 件货物超过标准柜门尺寸（门宽 234cm / 门高 258cm），需改用开顶柜（OT）、框架柜（FR）或拆解包装。' });
    if (maxPieceWt >= 1500) risks.push({ level: 'warn', t: '单件超重', d: '最重单件 ' + Math.round(maxPieceWt) + 'kg，需叉车/吊装作业，目的港派送建议配尾板车或吊装（Tailgate / Crane）。' });
    if (!dc.ok) risks.push({ level: 'warn', t: '派送待确认', d: dc.why });
    if (dc.zone && dc.zone.indexOf('D') === 0 || (dc.zone && dc.zone.indexOf('E') === 0)) risks.push({ level: 'warn', t: '偏远派送', d: '派送区 ' + dc.zone + '（' + dc.km + ' km）：属偏远区域，派送费与时效均上浮，建议提前确认是否需二次转运。' });
    if (hazmatPieces > 0) risks.push({ level: 'warn', t: '危险品合规', d: '危险品需提供 MSDS、危包证，且并非所有船东接载；建议提前锁定舱位与目的港清关代理。' });

    /* --- 条款与运输方式 --- */
    const term = opt.term || (App.state.settings && App.state.settings.defaultTerm) || 'EXW';
    const mode = opt.mode || (App.state.settings && App.state.settings.defaultMode) || 'd2d';
    const modeZh = { d2d: '门到门', d2p: '门到港', p2d: '港到门', p2p: '港到港' }[mode] || '门到门';
    const termZh = term + (opt.tax === 'DDP' ? ' + DDP 含税' : opt.tax === 'DDU' ? ' + DDU 不含税' : ' + 仅运费');
    const routeAdvice = [];
    routeAdvice.push({ t: '起运港', d: (opt.prov || opt.originProv || '待填') + (opt.city ? ' · ' + opt.city : '') + ' → 按就近原则匹配中国起运港（拖车费在报价模块自动测价）' });
    routeAdvice.push({ t: '卸货港', d: (dc.portLabel || '待定') + (dc.km ? '（距收货地约 ' + dc.km + ' km，派送区 ' + dc.zone + '）' : '') + '。' + (dc.why || '') });
    routeAdvice.push({ t: '海运时效', d: '预计 ' + transit[0] + '~' + transit[1] + ' 天（含起运港作业，不含清关与派送；旺季 +3~5 天）' });
    routeAdvice.push({ t: '派送预估', d: dc.mid ? ('A$ ' + fmtInt(dc.low) + ' ~ ' + fmtInt(dc.high) + '（含基础拖车 + 里程费 + 燃油 + 还箱，' + best.type + ' 标准车；最终以报价模块为准）') : '待确认邮编后估算' });

    const flags = [];
    if (hazmatPieces) flags.push('危险品');
    if (fragilePieces) flags.push('易碎');
    if (Object.keys(stops).length > 1) flags.push('多站点');
    if (inspectPieces) flags.push('需查验');

    const headline = best.type + ' × ' + bestCount + ' · ' + (dc.portLabel || '待定卸货港') + ' · ' + modeZh + ' · ' + termZh;
    return {
      headline: headline,
      containerType: best.type, containerCount: bestCount,
      alternatives: ladder,
      basis: { totalQty: qty, totalCbm: cbm, totalWeight: wt, usable: CONTAINER_SPEC[best.type].usable, payload: CONTAINER_SPEC[best.type].payload,
        utilization: Math.round(cbm / (CONTAINER_SPEC[best.type].usable * bestCount) * 1000) / 10,
        weightUtilization: Math.round(wt / (CONTAINER_SPEC[best.type].payload * bestCount) * 1000) / 10,
        efficiency: '行业整柜有效装载率按 85%~90% 计（' + best.type + ' 有效 ' + CONTAINER_SPEC[best.type].usable + ' CBM）',
        measured: (opt.moduleSummary && opt.moduleSummary.containerType) ? { containerType: opt.moduleSummary.containerType, utilization: Math.round(num(opt.moduleSummary.utilization) * 1000) / 10, cbm: opt.moduleSummary.totalCbm } : null },
      byType: byType, loading: points, risks: risks, route: routeAdvice, delivery: dc,
      terms: { term: term, mode: mode, tax: opt.tax || 'none', text: termZh + ' / ' + modeZh, flags: flags },
      transit: transit, region: region,
      createdAt: new Date().toISOString()
    };
  }
};
window.AU = AU; window.CRM = CRM; window.Recommend = Recommend; window.CONTAINER_SPEC = CONTAINER_SPEC;
