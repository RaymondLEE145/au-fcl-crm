/* ============================================================================
 * core.js —— 应用内核
 * 状态机 / 后端 API 客户端（含离线兜底）/ 路由 / 提示 / 弹窗 / 引导 / 格式化
 * ==========================================================================*/
'use strict';

/* ------------------------------------------------------------------ 小工具 */
const $ = function (sel, root) { return (root || document).querySelector(sel); };
const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined && html !== null) e.innerHTML = html;
  return e;
}
function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function num(v) { const x = parseFloat(v); return isFinite(x) ? x : 0; }
function fmtNum(v, d) {
  const n = num(v);
  return n.toFixed(d === undefined ? 2 : d).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtMoney(v, cur) {
  const sym = cur === 'USD' ? 'US$' : cur === 'AUD' ? 'A$' : (cur === 'RMB' ? '¥' : '');
  return sym + fmtNum(v, 2);
}
function fmtInt(v) { return fmtNum(v, 0); }
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return fmtDate(iso) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function relTime(iso) {
  if (!iso) return '—';
  const t = Date.now() - new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const m = Math.floor(t / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小时前';
  const dd = Math.floor(h / 24);
  if (dd < 30) return dd + ' 天前';
  return fmtDate(iso);
}
function debounce(fn, ms) {
  let t = 0;
  return function () {
    const a = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, a); }, ms || 300);
  };
}
function uid(p) { return (p || 'ID') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ------------------------------------------------------------------- 状态 */
const App = {
  state: {
    view: 'dashboard',
    route: { name: 'dashboard', args: [] },
    customers: [],
    current: null,
    stats: null,
    settings: { company: 'GlobalVertical', quotePrefix: 'GV-AU', defaultTerm: 'EXW', defaultMode: 'd2d', currency: 'AUD' },
    offline: false,
    online: null,
    fileMode: (typeof location !== 'undefined' && location.protocol === 'file:'),
    busy: 0,
    flow: { customerId: null, step: 1, cargo: null, recommendation: null, quote: null, dirty: false },
    backups: [],
    ui: { guideOpen: false, sidebar: true, filter: { q: '', status: '', level: '', state: '' } }
  },
  views: {},
  booted: false
};

const STATUS_MAP = {
  lead: { zh: '线索', cls: 'st-lead' },
  quoting: { zh: '跟进中', cls: 'st-quoting' },
  quoted: { zh: '已报价', cls: 'st-quoted' },
  won: { zh: '已成交', cls: 'st-won' },
  lost: { zh: '已流失', cls: 'st-lost' }
};
function statusZh(s) { return (STATUS_MAP[s] || STATUS_MAP.lead).zh; }
function statusCls(s) { return (STATUS_MAP[s] || STATUS_MAP.lead).cls; }

/* --------------------------------------------------------------- 离线数据 */
/* 后端未启动时，把数据暂存在浏览器本地，界面功能不中断（离线模式）。 */
const LocalDB = {
  key: 'aufcl_crm_offline_v1',
  read: function () {
    try { const o = JSON.parse(localStorage.getItem(this.key) || 'null'); if (o && Array.isArray(o.customers)) return o; } catch (e) {}
    return { version: 1, seq: { customer: 0, spec: 0, quote: 0, rec: 0 }, settings: {}, customers: [], updatedAt: new Date().toISOString() };
  },
  write: function (db) {
    db.updatedAt = new Date().toISOString();
    localStorage.setItem(this.key, JSON.stringify(db));
    return db;
  },
  nextId: function (db, kind, prefix) {
    db.seq[kind] = (db.seq[kind] || 0) + 1;
    const d = new Date();
    return prefix + '-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(db.seq[kind]).padStart(3, '0');
  }
};

/* ------------------------------------------------------------------ API */
const API = {
  base: '',
  async req(method, path, body, opt) {
    const o = opt || {};
    if (App.state.fileMode) { App.setOnline(false); return Offline.handle(method, path, body); }
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, o.timeout || 120000);
    try {
      const res = await fetch(this.base + path, {
        method: method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal
      });
      clearTimeout(timer);
      const ct = res.headers.get('Content-Type') || '';
      if (ct.indexOf('application/json') < 0) {
        if (!res.ok) {
          /* 纯静态托管（GitHub Pages 等）没有后端：/api 会返回 404/405 的 HTML 或纯文本
             → 自动切换为「本机模式」，用浏览器本地库继续工作 */
          if (String(path).indexOf('/api/') === 0 && (res.status === 404 || res.status === 405 || res.status === 501)) {
            App.setOnline(false);
            return Offline.handle(method, path, body);
          }
          throw new Error('HTTP ' + res.status);
        }
        return res;
      }
      const data = await res.json();
      if (res.status === 401 && data && data.needLogin) {
        /* 服务端会话过期：清掉本地会话并回到登录页 */
        try { if (window.Auth) Auth.clear(); } catch (e) {}
        Toast.warn('登录已过期，请重新登录', 5000);
        setTimeout(function () { location.reload(); }, 1200);
        throw new Error(data.error || '登录已过期');
      }
      if (!res.ok || data.ok === false) throw new Error(data.error || ('HTTP ' + res.status));
      if (App.state.offline) App.setOnline(true);
      return data;
    } catch (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') throw new Error('请求超时');
      if (err instanceof TypeError || /Failed to fetch|NetworkError|Load failed|ERR_|HTTP 404|HTTP 405/i.test(String(err && err.message))) {
        App.setOnline(false);
        return Offline.handle(method, path, body);
      }
      throw err;
    }
  },
  get(p) { return this.req('GET', p); },
  post(p, b) { return this.req('POST', p, b || {}); },
  put(p, b) { return this.req('PUT', p, b || {}); },
  del(p) { return this.req('DELETE', p); }
};

/* 离线模式：与后端同名接口的本地实现 */
const Offline = {
  summarize: function (c, full) {
    const db = LocalDB.read();
    return CRM.summarize(c, full);
  },
  handle: function (method, path, body) {
    const db = LocalDB.read();
    const m = /^\/api\/customers(?:\/([^/]+))?(?:\/([^/]+))?$/.exec(path);
    if (path === '/api/health') return Promise.resolve({ ok: true, offline: true, version: 'local' });
    if (path.indexOf('/api/customers') === 0 && m) {
      const id = m[1] ? decodeURIComponent(m[1]) : '';
      const sub = m[2] || '';
      if (!id) {
        if (method === 'GET') {
          const q = (CRM.parseQuery(path).q || '').toLowerCase();
          let list = db.customers.map(function (c) { return CRM.summarize(c, false); });
          if (q) list = list.filter(function (c) { return (c.company + ' ' + c.contact + ' ' + c.phone + ' ' + c.postcode).toLowerCase().indexOf(q) >= 0; });
          return Promise.resolve({ ok: true, total: list.length, items: list });
        }
        if (method === 'POST') {
          const c = CRM.newCustomer(body, db);
          db.customers.unshift(c); LocalDB.write(db);
          return Promise.resolve({ ok: true, customer: CRM.summarize(c, true) });
        }
      }
      const c = db.customers.find(function (x) { return x.id === id; });
      if (!c) return Promise.reject(new Error('客户不存在（离线数据）'));
      if (!sub && method === 'GET') return Promise.resolve({ ok: true, customer: CRM.summarize(c, true) });
      if (!sub && method === 'PUT') {
        Object.keys(body || {}).forEach(function (k) { if (['company', 'contact', 'phone', 'email', 'wechat', 'country', 'state', 'postcode', 'suburb', 'address', 'level', 'source', 'status', 'notes', 'tags'].indexOf(k) >= 0) c[k] = body[k]; });
        c.updatedAt = new Date().toISOString();
        LocalDB.write(db);
        return Promise.resolve({ ok: true, customer: CRM.summarize(c, true) });
      }
      if (!sub && method === 'DELETE') {
        db.customers = db.customers.filter(function (x) { return x.id !== id; });
        LocalDB.write(db);
        return Promise.resolve({ ok: true });
      }
      if (sub === 'cargos' && method === 'POST') {
        const g = { id: LocalDB.nextId(db, 'spec', 'CG'), name: body.name || '货物规格', createdAt: new Date().toISOString(), items: body.items || [], summary: body.summary || CRM.cargoSummary(body.items || [], body.plan) };
        c.cargos = (c.cargos || []).concat([g]); LocalDB.write(db);
        return Promise.resolve({ ok: true, cargo: g });
      }
      if (sub === 'recommendations' && method === 'POST') {
        const r = { id: LocalDB.nextId(db, 'rec', 'RC'), createdAt: new Date().toISOString(), inputs: body.inputs || {}, result: body.result || {} };
        c.recommendations = (c.recommendations || []).concat([r]); LocalDB.write(db);
        return Promise.resolve({ ok: true, recommendation: r });
      }
      if (sub === 'quotes' && method === 'POST') {
        const q = Object.assign({ id: LocalDB.nextId(db, 'quote', 'Q'), createdAt: new Date().toISOString(), cur: 'AUD', totals: {} }, body);
        c.quotes = (c.quotes || []).concat([q]); LocalDB.write(db);
        return Promise.resolve({ ok: true, quote: q });
      }
    }
    if (path === '/api/stats') return Promise.resolve(CRM.statsFrom(db));
    if (path === '/api/backups' && method === 'GET') return Promise.resolve({ ok: true, items: Offline.backups().map(function (b) { return b; }) });
    if (path === '/api/backups' && method === 'POST') {
      const list = Offline.backups();
      const rec = { file: 'local-' + Date.now() + '.json', size: JSON.stringify(db).length, at: new Date().toISOString(), reason: 'manual', local: true };
      list.unshift(rec);
      localStorage.setItem('aufcl_crm_backups_v1', JSON.stringify(list.slice(0, 30)));
      localStorage.setItem('aufcl_crm_backup_' + rec.file, JSON.stringify(db));
      return Promise.resolve({ ok: true, file: rec.file, size: rec.size, at: rec.at, total: list.length });
    }
    if (path === '/api/settings' && method === 'GET') return Promise.resolve({ ok: true, settings: db.settings || {} });
    if (path === '/api/settings' && method === 'PUT') {
      db.settings = Object.assign({}, db.settings, body); LocalDB.write(db);
      return Promise.resolve({ ok: true, settings: db.settings });
    }
    if (path === '/api/pdf') return Promise.reject(new Error('离线模式不支持服务端 PDF，请使用「浏览器打印」'));
    return Promise.reject(new Error('离线模式暂不支持该操作：' + method + ' ' + path));
  },
  backups: function () {
    try { return JSON.parse(localStorage.getItem('aufcl_crm_backups_v1') || '[]'); } catch (e) { return []; }
  }
};

/* 与服务端的连接状态 */
App.setOnline = function (online) {
  const changed = App.state.online !== online;
  App.state.online = online;
  App.state.offline = !online;
  const chip = $('#connChip');
  if (chip) {
    chip.className = 'conn-chip ' + (online ? 'on' : 'off');
    chip.innerHTML = '<i></i>' + (online ? '全栈模式（Node 服务已连接）' : (App.state.fileMode ? '单机模式（免安装 · 数据存本机浏览器）' : '离线模式（数据存本机浏览器）'));
    chip.title = online ? '数据实时保存到 data/db.json，并自动快照到 data/backups/' : '未连接 Node 服务：数据保存在浏览器本地，功能不受影响；如需自动快照与一键 PDF，可双击「启动系统.cmd」';
  }
  if (changed && !online) {
    Toast.show('后端未连接，已切换离线模式：数据暂存浏览器本地', 'warn', 6000);
  }
};

/* ------------------------------------------------------------------ Toast */
const Toast = {
  show: function (msg, type, ms) {
    let box = $('#toastBox');
    if (!box) { box = el('div', 'toast-box'); box.id = 'toastBox'; document.body.appendChild(box); }
    const t = el('div', 'toast ' + (type || 'ok'), '<span class="tico"></span><span class="tmsg">' + esc(msg) + '</span>');
    box.appendChild(t);
    setTimeout(function () { t.classList.add('in'); }, 10);
    setTimeout(function () {
      t.classList.remove('in');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
    }, ms || 3200);
    return t;
  },
  ok: function (m, ms) { return Toast.show(m, 'ok', ms); },
  warn: function (m, ms) { return Toast.show(m, 'warn', ms); },
  err: function (m, ms) { return Toast.show(m, 'err', ms); },
  info: function (m, ms) { return Toast.show(m, 'info', ms); }
};

/* ------------------------------------------------------------------ Modal */
const Modal = {
  open: function (opt) {
    Modal.close();
    const mask = el('div', 'modal-mask');
    mask.id = 'modalMask';
    const acts = (opt.actions || []).map(function (a, i) {
      return '<button class="btn ' + (a.kind || 'ghost') + '" data-act="' + i + '">' + esc(a.label) + '</button>';
    }).join('');
    const box = el('div', 'modal ' + (opt.size || ''));
    box.innerHTML =
      '<div class="modal-head"><h3>' + esc(opt.title || '') + '</h3>' +
      (opt.closable === false ? '' : '<button class="modal-x" data-close="1">✕</button>') + '</div>' +
      '<div class="modal-body">' + (opt.html || '') + '</div>' +
      (acts ? '<div class="modal-foot">' + acts + '</div>' : '');
    mask.appendChild(box);
    document.body.appendChild(mask);
    requestAnimationFrame(function () { mask.classList.add('in'); });
    mask.addEventListener('click', function (e) {
      if (e.target === mask && opt.closable !== false) { Modal.close(); if (opt.onCancel) opt.onCancel(); return; }
      const x = e.target.closest('[data-close]');
      if (x) { Modal.close(); if (opt.onCancel) opt.onCancel(); return; }
      const b = e.target.closest('[data-act]');
      if (b) {
        const a = (opt.actions || [])[num(b.dataset.act)];
        if (a && a.onClick) { const r = a.onClick(box, mask); if (r === false) return; }
        if (!a || a.keepOpen !== true) Modal.close();
      }
    });
    if (opt.onMount) opt.onMount(box, mask);
    const first = box.querySelector('input,textarea,select');
    if (first) setTimeout(function () { first.focus(); }, 60);
    return box;
  },
  close: function () {
    const m = $('#modalMask');
    if (m) { m.classList.remove('in'); setTimeout(function () { if (m.parentNode) m.parentNode.removeChild(m); }, 200); }
  },
  confirm: function (msg, title) {
    return new Promise(function (resolve) {
      Modal.open({
        title: title || '请确认',
        html: '<div class="confirm-msg">' + esc(msg) + '</div>',
        actions: [
          { label: '取消', kind: 'ghost', onClick: function () { resolve(false); } },
          { label: '确定', kind: 'primary', onClick: function () { resolve(true); } }
        ],
        onCancel: function () { resolve(false); }
      });
    });
  },
  prompt: function (msg, def, title) {
    return new Promise(function (resolve) {
      Modal.open({
        title: title || '请输入',
        html: '<div class="form-row"><label>' + esc(msg) + '</label><input id="mPrompt" type="text" value="' + esc(def || '') + '"></div>',
        actions: [
          { label: '取消', kind: 'ghost', onClick: function () { resolve(null); } },
          { label: '确定', kind: 'primary', onClick: function (box) { resolve($('#mPrompt', box).value.trim()); } }
        ],
        onCancel: function () { resolve(null); },
        onMount: function (box) {
          const i = $('#mPrompt', box);
          i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { resolve(i.value.trim()); Modal.close(); } });
        }
      });
    });
  },
  alert: function (msg, title) {
    return new Promise(function (resolve) {
      Modal.open({
        title: title || '提示',
        html: '<div class="confirm-msg">' + msg + '</div>',
        actions: [{ label: '知道了', kind: 'primary', onClick: function () { resolve(true); } }],
        onCancel: function () { resolve(true); }
      });
    });
  }
};

/* ------------------------------------------------------------------ 路由 */
const Router = {
  go: function (hash, replace) {
    if (location.hash === hash) { Router.dispatch(); return; }
    if (replace) location.replace(hash); else location.hash = hash;
  },
  parse: function () {
    const h = (location.hash || '#/dashboard').replace(/^#\/?/, '');
    const parts = h.split('/').filter(Boolean).map(decodeURIComponent);
    return { name: parts[0] || 'dashboard', args: parts.slice(1) };
  },
  dispatch: function () {
    const r = Router.parse();
    App.state.route = r;
    App.state.view = r.name;
    const view = App.views[r.name] || App.views.dashboard;
    $$('.nav-item').forEach(function (n) {
      const t = n.dataset.nav;
      const map = { customers: ['customers', 'customer', 'new'], flow: ['flow'], backup: ['backup'], export: ['export'], settings: ['settings'], help: ['help'] };
      n.classList.toggle('active', t === r.name || (map[t] || []).indexOf(r.name) >= 0);
    });
    const main = $('#mainView');
    if (!main) return;
    main.innerHTML = '<div class="loading-block"><div class="spinner"></div><div>正在加载…</div></div>';
    Promise.resolve(view(r)).catch(function (err) {
      console.error(err);
      main.innerHTML = '<div class="empty-state"><div class="es-ico">⚠️</div><h3>加载失败</h3><p>' + esc(err.message || err) + '</p><button class="btn primary" onclick="location.reload()">重新加载</button></div>';
    });
    window.scrollTo(0, 0);
    const sc = $('#mainScroll');
    if (sc) sc.scrollTop = 0;
  }
};

/* ------------------------------------------------------------------ 数据层 */
const Data = {
  loadCustomers: async function () {
    const r = await API.get('/api/customers');
    App.state.customers = r.items || [];
    return App.state.customers;
  },
  loadStats: async function () {
    try { App.state.stats = await API.get('/api/stats'); } catch (e) { App.state.stats = null; }
    return App.state.stats;
  },
  loadSettings: async function () {
    try { const r = await API.get('/api/settings'); App.state.settings = Object.assign(App.state.settings, r.settings || {}); } catch (e) {}
    return App.state.settings;
  },
  loadBackups: async function () {
    try { const r = await API.get('/api/backups'); App.state.backups = r.items || []; } catch (e) { App.state.backups = []; }
    return App.state.backups;
  },
  getCustomer: async function (id) {
    const r = await API.get('/api/customers/' + encodeURIComponent(id));
    App.state.current = r.customer;
    return r.customer;
  },
  createCustomer: async function (obj) {
    const r = await API.post('/api/customers', obj);
    await Data.loadCustomers();
    return r.customer;
  },
  updateCustomer: async function (id, obj) {
    const r = await API.put('/api/customers/' + encodeURIComponent(id), obj);
    App.state.current = r.customer;
    await Data.loadCustomers();
    return r.customer;
  },
  deleteCustomer: async function (id) {
    await API.del('/api/customers/' + encodeURIComponent(id));
    await Data.loadCustomers();
  },
  addCargo: async function (id, cargo) {
    const r = await API.post('/api/customers/' + encodeURIComponent(id) + '/cargos', cargo);
    return r.cargo;
  },
  addRecommendation: async function (id, rec) {
    const r = await API.post('/api/customers/' + encodeURIComponent(id) + '/recommendations', rec);
    return r.recommendation;
  },
  addQuote: async function (id, q) {
    const r = await API.post('/api/customers/' + encodeURIComponent(id) + '/quotes', q);
    return r.quote;
  }
};

/* ----------------------------------------------------------- 通用 DOM 组件 */
function btn(label, cls, onClick, attrs) {
  const b = el('button', 'btn ' + (cls || ''), label);
  if (attrs) Object.keys(attrs).forEach(function (k) { b.setAttribute(k, attrs[k]); });
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
function card(title, sub, bodyHtml, tools) {
  return '<section class="card"><div class="card-head"><div><h2>' + esc(title) + '</h2>' +
    (sub ? '<div class="card-sub">' + sub + '</div>' : '') + '</div>' +
    (tools ? '<div class="card-tools">' + tools + '</div>' : '') + '</div>' +
    '<div class="card-body">' + bodyHtml + '</div></section>';
}
function kpi(label, value, sub, tone, icon) {
  return '<div class="kpi ' + (tone || '') + '"><div class="kpi-top"><span class="kpi-ico">' + (icon || '•') + '</span><span class="kpi-label">' + esc(label) + '</span></div>' +
    '<div class="kpi-value">' + value + '</div><div class="kpi-sub">' + (sub || '') + '</div></div>';
}
function tag(text, cls) { return '<span class="tag ' + (cls || '') + '">' + esc(text) + '</span>'; }
function emptyState(icon, title, desc, actionHtml) {
  return '<div class="empty-state"><div class="es-ico">' + icon + '</div><h3>' + esc(title) + '</h3><p>' + esc(desc) + '</p>' + (actionHtml || '') + '</div>';
}
function progressRing(pct, size, label) {
  const s = size || 64, r = (s - 8) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return '<div class="ring" style="width:' + s + 'px;height:' + s + 'px">' +
    '<svg width="' + s + '" height="' + s + '"><circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r + '" stroke="#EFE7DA" stroke-width="6" fill="none"/>' +
    '<circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r + '" stroke="#C8A27A" stroke-width="6" fill="none" stroke-linecap="round" ' +
    'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 ' + s / 2 + ' ' + s / 2 + ')"/></svg>' +
    '<div class="ring-txt">' + (label !== undefined ? label : pct + '%') + '</div></div>';
}
function bar(pct, tone) {
  return '<div class="bar ' + (tone || '') + '"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>';
}

/* --------------------------------------------------------------- 引导系统 */
const Guide = {
  steps: [
    { n: 1, t: '客户建档', d: '录入客户公司与澳洲收货信息', ico: '①' },
    { n: 2, t: '货物信息', d: '进入 3D 装柜模块保存货物明细', ico: '②' },
    { n: 3, t: '方案推荐', d: '自动分析柜型 / 装载 / 派送方案', ico: '③' },
    { n: 4, t: '整柜报价', d: '预填报价模块并回存报价快照', ico: '④' },
    { n: 5, t: '归档导出', d: '备份数据 + 一站式导出 PDF', ico: '⑤' }
  ],
  rail: function (current, opts) {
    const o = opts || {};
    return '<div class="guide-rail">' + Guide.steps.map(function (s) {
      const state = s.n < current ? 'done' : (s.n === current ? 'current' : 'todo');
      return '<div class="gr-item ' + state + '" ' + (o.clickable ? 'data-goto="' + s.n + '"' : '') + '>' +
        '<div class="gr-dot">' + (s.n < current ? '✓' : s.ico) + '</div>' +
        '<div class="gr-txt"><div class="gr-t">' + s.t + '</div><div class="gr-d">' + s.d + '</div></div>' +
        '</div>' + (s.n < 5 ? '<div class="gr-line"></div>' : '');
    }).join('') + '</div>';
  },
  tip: function (title, html, tone) {
    return '<div class="guide-tip ' + (tone || '') + '"><div class="gt-h"><span class="gt-i">💡</span>' + esc(title) + '</div><div class="gt-b">' + html + '</div></div>';
  },
  firstRun: function () {
    if (localStorage.getItem('aufcl_crm_welcomed') === '1') return;
    Modal.open({
      title: '👋 欢迎使用 澳洲 FCL 客户管理系统',
      size: 'lg',
      html:
        '<div class="welcome">' +
        '<p class="w-lead">从「客户录入」到「整柜报价」再到「一站式 PDF 归档」，全部在一个界面完成。</p>' +
        '<div class="w-steps">' + Guide.steps.map(function (s) {
          return '<div class="w-step"><div class="w-n">' + s.n + '</div><div><div class="w-t">' + s.t + '</div><div class="w-d">' + s.d + '</div></div></div>';
        }).join('') + '</div>' +
        '<div class="guide-tip"><div class="gt-h"><span class="gt-i">🔒</span>数据在哪里</div><div class="gt-b">所有客户数据实时写入本机 <code>data/db.json</code>，并自动快照到 <code>data/backups/</code>；即使后端未启动，系统也会自动切换离线模式，把数据暂存在浏览器本地，不会丢。</div></div>' +
        '</div>',
      actions: [
        { label: '先看示例数据', kind: 'ghost', onClick: function () { Demo.seed(); } },
        { label: '开始建档 →', kind: 'primary', onClick: function () { Router.go('#/new'); } }
      ],
      onCancel: function () {},
      onMount: function () { localStorage.setItem('aufcl_crm_welcomed', '1'); }
    });
  }
};

const Demo = {
  seed: async function () {
    try {
      const r = await API.post('/api/demo/seed');
      Toast.ok('已生成 ' + (r.created || []).length + ' 个示例客户');
      await Data.loadCustomers(); await Data.loadStats();
      Router.go('#/customers'); Router.dispatch();
    } catch (e) { Toast.err('生成示例失败：' + e.message); }
  },
  clear: async function () {
    if (!(await Modal.confirm('确定清空全部客户数据吗？（清空前会自动备份）', '危险操作'))) return;
    try {
      await API.post('/api/demo/clear');
      Toast.ok('已清空');
      await Data.loadCustomers(); await Data.loadStats();
      Router.dispatch();
    } catch (e) { Toast.err('清空失败：' + e.message); }
  }
};

/* --------------------------------------------------------------- 键盘快捷键 */
function bindShortcuts() {
  document.addEventListener('keydown', function (e) {
    const inField = /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''));
    if (e.key === 'Escape') { Modal.close(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      const ev = new CustomEvent('app:save');
      document.dispatchEvent(ev);
      return;
    }
    if (e.altKey && e.key === 'ArrowRight') {
      const b = $('#flowNext');
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
    }
    if (e.altKey && e.key === 'ArrowLeft') {
      const b = $('#flowPrev');
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
    }
    if (!inField && e.key === '/') {
      const s = $('#globalSearch');
      if (s) { e.preventDefault(); s.focus(); }
    }
  });
}

/* ------------------------------------------------------------------- 启动 */
async function boot() {
  App.booted = true;
  bindShortcuts();
  window.addEventListener('hashchange', function () { Router.dispatch(); });
  if (App.state.fileMode) {
    App.setOnline(false);
  } else {
    try {
      const h = await API.get('/api/health');
      App.setOnline(!h.offline);
    } catch (e) { App.setOnline(false); }
  }
  try { AU.init(); AU.loadKm(); } catch (e) { console.warn('路网数据预热失败', e); }
  await Data.loadSettings();
  try { await Data.loadCustomers(); } catch (e) { Toast.err('读取客户数据失败：' + e.message); }
  await Data.loadStats();
  const sub = $('#brandSub');
  if (sub) sub.textContent = 'v1.0 · ' + (App.state.settings.company || 'GlobalVertical');
  Router.dispatch();
  try { document.dispatchEvent(new CustomEvent('app:ready')); } catch (e) {}
  setTimeout(function () { Guide.firstRun(); }, 500);
  setInterval(function () { App.setOnline(App.state.online !== false); }, 60000);
}
window.App = App; window.API = API; window.Data = Data; window.Toast = Toast; window.Modal = Modal;
window.Router = Router; window.Guide = Guide; window.Demo = Demo;
window.$ = $; window.$$ = $$; window.el = el; window.esc = esc;
window.fmtNum = fmtNum; window.fmtMoney = fmtMoney; window.fmtDate = fmtDate; window.fmtDateTime = fmtDateTime;
window.relTime = relTime; window.card = card; window.kpi = kpi; window.tag = tag; window.emptyState = emptyState;
window.progressRing = progressRing; window.bar = bar; window.num = num; window.fmtInt = fmtInt;
window.statusZh = statusZh; window.statusCls = statusCls; window.debounce = debounce;
/* 启动前先过登录门禁：登录成功后才加载业务界面 */
document.addEventListener('DOMContentLoaded', function () {
  if (window.Auth) {
    Auth.init(function () {
      /* 显示当前登录账号 */
      try {
        const s = Auth.session();
        const el = document.getElementById('whoUser');
        if (el && s && s.user) el.textContent = s.user;
      } catch (e) {}
      boot();
    });
  } else {
    boot();
  }
});
