/* ============================================================================
 * app.js —— 交互装配：动作分发 / 导航 / 全局搜索 / 导入导出 / PDF 导出 / 启动收尾
 * ==========================================================================*/
'use strict';

/* ------------------------------- 动作分发 ------------------------------- */
App.actions = App.actions || {};
function bindActions() {
  document.addEventListener('click', function (e) {
  var mkb = e.target.closest && e.target.closest('[data-act="mark-new"]');
  if (mkb) { window.open('modules/mark.html', '_blank'); return; }
  var clb = e.target.closest && e.target.closest('[data-act="cl-open"]');
  if (clb) { window.open('modules/clearance.html', '_blank'); return; }
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const name = t.dataset.act;
    const fn = App.actions[name];
    if (!fn) return;
    if (t.tagName === 'TR' && e.target.closest('button,a,input,select')) return;
    e.preventDefault();
    try { fn(t, e); } catch (err) { console.error(err); Toast.err(err.message || String(err)); }
  });
  document.addEventListener('app:save', function () {
    if (App.state.view === 'flow' && window.FlowNext) FlowNext.onShortcut();
  });
}

/* ------------------------------- 基础动作 ------------------------------- */
App.actions['go'] = function (elm) { Router.go(elm.dataset.href || '#/dashboard'); };
App.actions['open'] = function (elm) { Router.go('#/customer/' + encodeURIComponent(elm.dataset.id)); };
App.actions['filter-reset'] = function () {
  App.state.ui.filter = { q: '', status: '', level: '', state: '' };
  App.views.customers();
};
App.actions['del'] = async function (elm) {
  const id = elm.dataset.id;
  const c = App.state.customers.find(function (x) { return x.id === id; });
  if (!(await Modal.confirm('确定删除客户「' + ((c && c.company) || id) + '」吗？\n删除的客户会先存进 data/trash/，可在服务端目录找回。', '删除客户'))) return;
  try {
    await Data.deleteCustomer(id);
    Toast.ok('已删除');
    if (App.state.view === 'customer' || App.state.view === 'flow') Router.go('#/customers');
    else { await Data.loadStats(); Router.dispatch(); }
  } catch (e) { Toast.err('删除失败：' + e.message); }
};
App.actions['edit'] = async function (elm) {
  const id = elm.dataset.id;
  let c;
  try { c = await Data.getCustomer(id); } catch (e) { Toast.err(e.message); return; }
  const f = function (label, k, val, type, opts) {
    if (type === 'select') {
      return '<div class="form-row"><label>' + label + '</label><select id="ed_' + k + '" class="input">' +
        opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>';
    }
    return '<div class="form-row"><label>' + label + '</label><input id="ed_' + k + '" class="input" value="' + esc(val || '') + '"></div>';
  };
  Modal.open({
    title: '编辑客户 · ' + (c.company || c.id),
    size: 'lg',
    html: '<div class="form-grid two">' +
      f('公司名称', 'company', c.company) + f('联系人', 'contact', c.contact) +
      f('电话', 'phone', c.phone) + f('邮箱', 'email', c.email) +
      f('微信', 'wechat', c.wechat) + f('邮编', 'postcode', c.postcode) +
      f('州', 'state', c.state, 'select', [['', '未填'], ['NSW', 'NSW'], ['VIC', 'VIC'], ['QLD', 'QLD'], ['SA', 'SA'], ['WA', 'WA'], ['TAS', 'TAS'], ['NT', 'NT'], ['ACT', 'ACT']]) +
      f('城区', 'suburb', c.suburb) +
      f('等级', 'level', c.level, 'select', [['A', 'A'], ['B', 'B'], ['C', 'C']]) +
      f('来源', 'source', c.source, 'select', ['展会', '转介绍', '网站', '阿里巴巴', '社媒', '其他'].map(function (x) { return [x, x]; })) +
      f('状态', 'status', c.status, 'select', Object.keys(STATUS_MAP).map(function (k) { return [k, STATUS_MAP[k].zh]; })) +
      f('标签（逗号分隔）', 'tags', (c.tags || []).join('，')) +
      '<div class="form-row" style="grid-column:span 2"><label>地址</label><input id="ed_address" class="input" value="' + esc(c.address) + '"></div>' +
      '<div class="form-row" style="grid-column:span 2"><label>备注</label><textarea id="ed_notes" class="input" rows="3">' + esc(c.notes) + '</textarea></div>' +
      '</div>',
    actions: [
      { label: '取消', kind: 'ghost' },
      {
        label: '保存', kind: 'primary', onClick: async function (box) {
          const v = function (k) { const e2 = $('#ed_' + k, box); return e2 ? e2.value.trim() : ''; };
          const body = { company: v('company'), contact: v('contact'), phone: v('phone'), email: v('email'), wechat: v('wechat'),
            postcode: v('postcode'), state: v('state'), suburb: v('suburb'), address: v('address'), level: v('level'),
            source: v('source'), status: v('status'), notes: v('notes'), tags: v('tags').split(/[，,]/).map(function (x) { return x.trim(); }).filter(Boolean) };
          try {
            await Data.updateCustomer(id, body);
            Toast.ok('已保存');
            Router.dispatch();
          } catch (e) { Toast.err('保存失败：' + e.message); }
        }
      }
    ]
  });
};
App.actions['demo-seed'] = function () { Demo.seed(); };
App.actions['demo-clear'] = function () { Demo.clear(); };
App.actions['recheck'] = async function () {
  try { await API.get('/api/health'); Toast.ok('后端连接正常'); } catch (e) { Toast.warn('仍未连接：' + e.message); }
  Router.dispatch();
};

/* ------------------------------- 备份动作 ------------------------------- */
App.actions['backup-now'] = async function () {
  try {
    const r = await API.post('/api/backups', { reason: 'manual' });
    Toast.ok('备份完成：' + r.file + '（' + fmtNum(r.size / 1024, 1) + ' KB）');
    await Data.loadBackups(); await Data.loadStats();
    if (App.state.view === 'backup') Router.dispatch();
  } catch (e) { Toast.err('备份失败：' + e.message); }
};
App.actions['backup-restore'] = async function (elm) {
  const file = elm.dataset.file;
  if (!(await Modal.confirm('确定用备份「' + file + '」覆盖当前数据吗？\n恢复前会自动为当前数据再存一份快照。', '恢复备份'))) return;
  try {
    const r = await API.post('/api/backups/restore', { file: file });
    Toast.ok('已恢复 ' + r.customers + ' 个客户');
    await Data.loadCustomers(); await Data.loadStats(); await Data.loadBackups();
    Router.dispatch();
  } catch (e) { Toast.err('恢复失败：' + e.message); }
};
App.actions['backup-del'] = async function (elm) {
  const file = elm.dataset.file;
  if (!(await Modal.confirm('删除备份 ' + file + ' ？', '删除备份'))) return;
  try { await API.post('/api/backups/delete', { file: file }); Toast.ok('已删除'); await Data.loadBackups(); Router.dispatch(); }
  catch (e) { Toast.err(e.message); }
};

/* ------------------------------- 导入导出 ------------------------------- */
App.actions['export-json'] = function () {
  if (App.state.offline) {
    const db = LocalDB.read();
    downloadBlob(JSON.stringify(db, null, 2), 'AU-FCL-CRM-offline-' + fmtDate(new Date().toISOString()) + '.json', 'application/json');
    Toast.ok('已导出离线数据 JSON');
    return;
  }
  window.location.href = 'api/export/all';
  Toast.info('正在下载整库 JSON…');
};
App.actions['import-json'] = function () {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.addEventListener('change', function () {
    const f = inp.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = async function () {
      try {
        const data = JSON.parse(rd.result);
        const db = data.db || data;
        if (!db || !Array.isArray(db.customers)) throw new Error('文件里没有 customers 数组');
        if (!(await Modal.confirm('将导入 ' + db.customers.length + ' 个客户并覆盖当前数据，导入前会自动备份。继续？', '导入整库'))) return;
        if (App.state.offline) { LocalDB.write(db); }
        else { await API.post('/api/import/all', { db: db }); }
        await Data.loadCustomers(); await Data.loadStats();
        Toast.ok('导入完成：' + db.customers.length + ' 个客户');
        Router.go('#/customers');
      } catch (e) { Toast.err('导入失败：' + e.message); }
    };
    rd.readAsText(f, 'utf-8');
  });
  inp.click();
};
App.actions['export-csv'] = function () {
  const list = App.state.customers || [];
  if (!list.length) { Toast.warn('没有可导出的客户'); return; }
  const head = ['客户编号', '公司名称', '联系人', '电话', '邮箱', '微信', '州', '邮编', '城区', '地址', '等级', '来源', '状态', '标签', '件数', '体积CBM', '毛重KG', '柜型', '最近报价单号', '最近报价金额', '币种', '完整度%', '建档时间', '最近更新'];
  const rows = list.map(function (c) {
    return [c.id, c.company, c.contact, c.phone, c.email, c.wechat, c.state, c.postcode, c.suburb, c.address, c.level, c.source, statusZh(c.status), (c.tags || []).join(' '),
      c.totalQty, c.totalCbm, c.totalWeight, c.containerType, c.lastQuoteNo, c.lastQuoteAmount, c.lastQuoteCur, c.completeness, fmtDate(c.createdAt), fmtDate(c.updatedAt)];
  });
  const csv = [head].concat(rows).map(function (r) {
    return r.map(function (x) { return '"' + String(x === undefined || x === null ? '' : x).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\r\n');
  downloadBlob('\ufeff' + csv, 'AU-FCL-customers-' + fmtDate(new Date().toISOString()) + '.csv', 'text/csv;charset=utf-8');
  Toast.ok('已导出 CSV（' + rows.length + ' 行）');
};
function downloadBlob(text, filename, mime) {
  const blob = new Blob([text], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 3000);
}

/* ------------------------------- PDF 导出 ------------------------------- */
async function loadFullCustomers(list) {
  const out = [];
  for (const c of list) {
    try { out.push(await Data.getCustomer(c.id)); } catch (e) { out.push(c); }
  }
  return out;
}
function presetOpt() {
  const p = App.state.ui.exportPreset || {};
  const scope = p.scope || 'all';
  let list = (App.state.customers || []).slice();
  let scopeText = '全部客户';
  if (scope === 'status' && p.status) { list = list.filter(function (c) { return c.status === p.status; }); scopeText = '状态：' + statusZh(p.status); }
  if (scope === 'state' && p.state) { list = list.filter(function (c) { return c.state === p.state; }); scopeText = '目的州：' + p.state; }
  return {
    list: list, scopeText: scopeText,
    opt: { cover: p.cover !== false, overview: p.overview !== false, detail: p.detail !== false, summary: p.summary !== false,
      withCargo: p.withCargo !== false, withRec: p.withRec !== false, withQuote: p.withQuote !== false, withTimeline: !!p.withTimeline, scopeText: scopeText }
  };
}
App.actions['pdf-all-server'] = async function () {
  const s = presetOpt();
  if (!s.list.length) { Toast.warn('没有可导出的客户'); return; }
  try {
    const full = await loadFullCustomers(s.list);
    const r = await PrintDoc.server(full, s.opt);
    Toast.ok('PDF 已生成：' + r.pages + ' 页 / ' + fmtNum(r.bytes / 1024, 0) + ' KB', 6000);
    if (App.state.current) Data.addTimelineLog && Data.addTimelineLog();
  } catch (e) {
    Toast.err('服务端导出失败：' + e.message + '（已为你切换浏览器打印方式）', 6000);
    try { PrintDoc.openPrint(await loadFullCustomers(s.list), s.opt); } catch (e2) {}
  }
};
App.actions['pdf-all-print'] = async function () {
  const s = presetOpt();
  if (!s.list.length) { Toast.warn('没有可导出的客户'); return; }
  try {
    const full = await loadFullCustomers(s.list);
    PrintDoc.openPrint(full, s.opt);
    Toast.info('已打开满版打印页：在打印对话框里选择「另存为 PDF」，边距选「无」');
  } catch (e) { Toast.err(e.message); }
};
App.actions['pdf-one'] = async function (elm) {
  try {
    const c = await Data.getCustomer(elm.dataset.id);
    const r = await PrintDoc.server([c], { cover: true, overview: false, detail: true, summary: false, withTimeline: true, scopeText: c.company || c.id });
    Toast.ok('已导出：' + r.pages + ' 页', 5000);
  } catch (e) {
    Toast.err('服务端导出失败：' + e.message, 5000);
    try { PrintDoc.openPrint([await Data.getCustomer(elm.dataset.id)], { cover: true, overview: false, detail: true, summary: false, withTimeline: true }); } catch (e2) {}
  }
};
App.actions['pdf-one-print'] = async function (elm) {
  try {
    const c = await Data.getCustomer(elm.dataset.id);
    PrintDoc.openPrint([c], { cover: true, overview: false, detail: true, summary: false, withTimeline: true, scopeText: c.company || c.id });
  } catch (e) { Toast.err(e.message); }
};

/* ------------------------------- 设置动作 ------------------------------- */
App.actions['settings-save'] = async function () {
  const body = {
    company: $('#setCompany').value.trim(), quotePrefix: $('#setPrefix').value.trim(),
    defaultTerm: $('#setTerm').value, defaultMode: $('#setMode').value,
    currency: $('#setCur').value, owner: $('#setOwner').value.trim()
  };
  try {
    await API.put('/api/settings', body);
    Object.assign(App.state.settings, body);
    const sub = $('#brandSub'); if (sub) sub.textContent = 'v1.0 · ' + (body.company || 'GlobalVertical');
    Toast.ok('设置已保存');
  } catch (e) { Toast.err('保存失败：' + e.message); }
};

/* ------------------------------- 导航装配 ------------------------------- */
function bindNav() {
  $$('.nav-item').forEach(function (n) {
    n.addEventListener('click', function () { Router.go('#/' + n.dataset.nav); });
  });
  const toggle = $('#navToggle');
  if (toggle) toggle.addEventListener('click', function () {
    document.body.classList.toggle('nav-collapsed');
  });
  const gs = $('#globalSearch');
  if (gs) {
    gs.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        App.state.ui.filter.q = gs.value.trim();
        App.state.ui.filter.status = ''; App.state.ui.filter.level = ''; App.state.ui.filter.state = '';
        Router.go('#/customers');
        if (App.state.view === 'customers') App.views.customers();
      }
    });
  }
  const help = $('#helpBtn');
  if (help) help.addEventListener('click', function () { Router.go('#/help'); });
  const guide = $('#guideBtn');
  if (guide) guide.addEventListener('click', function () { Guide.firstRun(true); });
  const seed = $('#seedBtn');
  if (seed) seed.addEventListener('click', function () { Demo.seed(); });
}
window.addEventListener('hashchange', function () { setTimeout(function () { const gs = $('#globalSearch'); if (gs) gs.value = App.state.ui.filter.q || ''; }, 50); });
document.addEventListener('DOMContentLoaded', function () {
  bindActions();
  bindNav();
});
