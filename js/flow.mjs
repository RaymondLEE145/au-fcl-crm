/* ============================================================================
 * flow.js —— 引导式五步流程 + 微前端模块桥（3D 装柜 / FCL 报价）
 * ==========================================================================*/
'use strict';

App.actions = App.actions || {};

/* ============================ 微前端模块桥 ============================ */
const Bridge = {
  frames: {},
  mount: function (key, mountEl) {
    const url = key === 'packing' ? 'modules/packing.html' : 'modules/quote.html';
    const box = typeof mountEl === 'string' ? $(mountEl) : mountEl;
    if (!box) return null;
    const wrap = el('div', 'frame-wrap');
    const bar = el('div', 'frame-bar');
    bar.innerHTML = '<span class="dot"></span><span class="fb-t">' + (key === 'packing' ? '3D 智能装柜模块' : 'FCL 整柜自动报价模块') + '</span>' +
      '<span class="fb-status" id="fbStatus-' + key + '">正在连接模块…</span>' +
      '<span class="spacer"></span>' +
      '<button class="btn tiny" data-frame-reload="' + key + '">重载模块</button>' +
      '<a class="btn tiny" href="' + url + '" target="_blank">在新窗口打开 ↗</a>';
    const ifr = el('iframe', 'module-frame');
    ifr.src = url;
    wrap.appendChild(bar); wrap.appendChild(ifr);
    box.innerHTML = ''; box.appendChild(wrap);
    const rec = { ifr: ifr, ready: false, key: key, waiting: [], pingTimer: 0 };
    Bridge.frames[key] = rec;
    ifr.addEventListener('load', function () { Bridge.handshake(key); });
    bar.querySelector('[data-frame-reload]').addEventListener('click', function () {
      rec.ready = false; Bridge.setStatus(key, '正在重载…', 'wait');
      ifr.src = url + '?t=' + Date.now();
    });
    Bridge.handshake(key);
    return rec;
  },
  setStatus: function (key, text, tone) {
    const s = $('#fbStatus-' + key);
    if (s) { s.textContent = text; s.className = 'fb-status ' + (tone || ''); }
  },
  handshake: function (key) {
    const rec = Bridge.frames[key];
    if (!rec) return;
    let n = 0;
    clearInterval(rec.pingTimer);
    rec.pingTimer = setInterval(function () {
      n++;
      if (rec.ready || n > 24) {
        clearInterval(rec.pingTimer);
        if (!rec.ready) Bridge.setStatus(key, '模块未响应（可点「重载模块」或在新窗口打开）', 'err');
        return;
      }
      try { rec.ifr.contentWindow.postMessage({ ch: 'aufcl-crm', type: 'ping' }, '*'); } catch (e) {}
    }, 700);
  },
  send: function (key, type, payload) {
    const rec = Bridge.frames[key];
    if (!rec) throw new Error('模块未挂载：' + key);
    rec.ifr.contentWindow.postMessage({ ch: 'aufcl-crm', type: type, payload: payload || {} }, '*');
  },
  waitFor: function (key, type, timeout) {
    const rec = Bridge.frames[key];
    if (!rec) return Promise.reject(new Error('模块未挂载：' + key));
    return new Promise(function (resolve, reject) {
      const t = setTimeout(function () {
        rec.waiting = rec.waiting.filter(function (w) { return w.type !== type; });
        reject(new Error('等待模块响应超时（' + type + '），请点「重载模块」后重试'));
      }, timeout || 30000);
      rec.waiting.push({ type: type, resolve: function (p) { clearTimeout(t); resolve(p); }, reject: function (e) { clearTimeout(t); reject(e); } });
    });
  },
  request: function (key, type, payload, expect, timeout) {
    const p = Bridge.waitFor(key, expect, timeout);
    Bridge.send(key, type, payload);
    return p;
  }
};

window.addEventListener('message', function (e) {
  const d = e.data;
  if (!d || d.ch !== 'aufcl-module') return;
  let key = d.module;
  if (!key) {
    Object.keys(Bridge.frames).forEach(function (k) { if (Bridge.frames[k].ifr.contentWindow === e.source) key = k; });
  }
  const rec = Bridge.frames[key];
  if (!rec) return;
  if (d.type === 'ready') {
    rec.ready = true;
    clearInterval(rec.pingTimer);
    Bridge.setStatus(key, '模块已就绪', 'ok');
    rec.waiting.slice().forEach(function (w) {
      if (w.type === 'ready') { rec.waiting = rec.waiting.filter(function (x) { return x !== w; }); w.resolve(d.payload); }
    });
    return;
  }
  if (d.type === 'error') {
    Bridge.setStatus(key, '模块报错：' + ((d.payload || {}).message || ''), 'err');
    rec.waiting.slice().forEach(function (w) {
      rec.waiting = rec.waiting.filter(function (x) { return x !== w; });
      w.reject(new Error(((d.payload || {}).message) || '模块处理失败'));
    });
    return;
  }
  if (d.type === 'cargoChanged') { rec.lastCargo = d.payload; return; }
  if (d.type === 'quoteChanged') { rec.lastQuote = d.payload; return; }
  rec.waiting.slice().forEach(function (w) {
    if (w.type === d.type) {
      rec.waiting = rec.waiting.filter(function (x) { return x !== w; });
      w.resolve(d.payload);
    }
  });
});

async function ensureReady(key) {
  const rec = Bridge.frames[key];
  if (!rec) throw new Error('模块未挂载');
  if (rec.ready) return true;
  Bridge.handshake(key);
  await Bridge.waitFor(key, 'ready', 25000);
  return true;
}

/* ============================ 流程状态 ============================ */
function flowState() { return App.state.flow; }
async function ensureFlowCustomer() {
  const f = flowState();
  if (!f.customerId) return null;
  try { return await Data.getCustomer(f.customerId); } catch (e) { f.customerId = null; return null; }
}

/* ============================ 流程主视图 ============================ */
App.views.flow = async function (r) {
  const f = flowState();
  if (r.args && r.args[0]) f.customerId = r.args[0];
  if (r.args && r.args[1]) f.step = Math.max(1, Math.min(5, parseInt(r.args[1], 10) || 1));
  const c = f.customerId ? await ensureFlowCustomer() : null;
  if (f.customerId && !c) { f.customerId = null; f.step = 1; }

  const step = f.step;
  const titles = [
    { t: '客户建档', d: '录入客户公司与澳洲收货信息（邮编可自动识别州 / 城区 / 卸货港）' },
    { t: '货物信息', d: '把客户给到的货物明细交给 3D 装柜模块，算体积、柜型与装载率' },
    { t: '方案推荐', d: '自动生成柜型 / 装柜 / 派送 / 风险建议，形成对客方案' },
    { t: '整柜报价', d: '进入 FCL 报价模块（已预填），出一份可对客的整柜报价' },
    { t: '归档导出', d: '检查档案完整度、备份数据、导出客户档案 PDF' }
  ][step - 1];

  const head =
    '<div class="flow-head">' +
      '<div class="fh-left"><h1>引导式建档' + (c ? ' · ' + esc(c.company || c.contact || '') : '') + '</h1>' +
      '<p>第 ' + step + ' / 5 步 · ' + titles.t + ' —— ' + titles.d + '</p></div>' +
      '<div class="fh-right"><button class="btn ghost tiny" data-act="go" data-href="#/customers">退出引导</button>' +
      (c ? '<button class="btn ghost tiny" data-act="open" data-id="' + c.id + '">查看档案</button>' : '') + '</div>' +
    '</div>';

  const rail = '<div class="flow-rail">' + Guide.steps.map(function (s) {
    const st = s.n < step ? 'done' : s.n === step ? 'current' : 'todo';
    const locked = s.n > 1 && !c;
    return '<button class="fr-item ' + st + (locked ? ' locked' : '') + '" data-flow-step="' + s.n + '"' + (locked ? ' disabled' : '') + '>' +
      '<span class="fr-n">' + (s.n < step ? '✓' : s.n) + '</span>' +
      '<span class="fr-t">' + s.t + '</span></button>' + (s.n < 5 ? '<span class="fr-line"></span>' : '');
  }).join('') + '</div>';

  const body = step === 1 ? step1Html(c) : step === 2 ? await step2Html(c) : step === 3 ? step3Html(c) : step === 4 ? await step4Html(c) : step5Html(c);
  const nav = '<div class="flow-nav">' +
    '<button class="btn ghost" id="flowPrev" data-flow-prev="1"' + (step <= 1 ? ' disabled' : '') + '>← 上一步</button>' +
    '<span class="fn-hint">' + (step === 1 ? 'Ctrl + S 保存草稿' : 'Alt + ← / → 切换步骤') + '</span>' +
    '<span class="spacer"></span>' +
    (step < 5 ? '<button class="btn primary lg" id="flowNext" data-flow-next="1">' + (step === 1 ? '保存并进入下一步' : '下一步') + ' →</button>' :
      '<button class="btn primary lg" data-act="go" data-href="#/export">去导出中心 →</button>') +
  '</div>';

  setMain(head + rail + '<div class="flow-body">' + body + '</div>' + nav);
  if (step === 1) bindStep1(c);
  if (step === 2) bindStep2(c);
  if (step === 3) bindStep3(c);
  if (step === 4) bindStep4(c);
  bindFlowNav(c);
};

function bindFlowNav(c) {
  $$('[data-flow-step]').forEach(function (b) {
    b.addEventListener('click', function () {
      const n = num(b.dataset.flowStep);
      if (n > 1 && !flowState().customerId) { Toast.warn('请先完成第 1 步「客户建档」'); return; }
      flowState().step = n;
      Router.go('#/flow/' + encodeURIComponent(flowState().customerId || '') + '/' + n);
      if (App.state.view === 'flow') Router.dispatch();
    });
  });
  const prev = $('[data-flow-prev]');
  if (prev) prev.addEventListener('click', function () {
    flowState().step = Math.max(1, flowState().step - 1);
    Router.go('#/flow/' + encodeURIComponent(flowState().customerId || '') + '/' + flowState().step);
  });
  const next = $('[data-flow-next]');
  if (next) next.addEventListener('click', function () { FlowNext.run(c); });
}

/* ============================== 第 1 步 ============================== */
function step1Html(c) {
  const g = function (label, id, val, opt) {
    const o = opt || {};
    const cls = o.col ? ' style="grid-column:span ' + o.col + '"' : '';
    if (o.type === 'select') {
      return '<div class="field"' + cls + '><label>' + esc(label) + (o.req ? ' <i class="req">*</i>' : '') + '</label>' +
        '<select id="' + id + '" class="input">' + (o.opts || []).map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(val) === String(x[0]) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>' +
        (o.hint ? '<div class="hint">' + o.hint + '</div>' : '') + '</div>';
    }
    return '<div class="field"' + cls + '><label>' + esc(label) + (o.req ? ' <i class="req">*</i>' : '') + '</label>' +
      '<input id="' + id + '" class="input" type="' + (o.type || 'text') + '" value="' + esc(val || '') + '" placeholder="' + esc(o.ph || '') + '">' +
      (o.hint ? '<div class="hint">' + o.hint + '</div>' : '') + '</div>';
  };
  const v = c || {};
  const states = [['', '请选择'], ['NSW', 'NSW 新南威尔士'], ['VIC', 'VIC 维多利亚'], ['QLD', 'QLD 昆士兰'], ['SA', 'SA 南澳'], ['WA', 'WA 西澳'], ['TAS', 'TAS 塔斯马尼亚'], ['NT', 'NT 北领地'], ['ACT', 'ACT 首都领地']];
  return Guide.tip('为什么先建档', '客户的公司、联系人与澳洲收货地址是整条链路的基础：<b>邮编</b>决定卸货港与派送区，<b>州 / 城区</b>会写进报价单抬头与 PDF 档案。填得越全，后面越省事。') +
    card('客户基本信息', '带 <i class="req">*</i> 为必填',
      '<div class="form-grid">' +
        g('公司名称', 'fCompany', v.company, { req: true, col: 2, ph: '例：SYDNEY HOME FURNITURE PTY LTD' }) +
        g('联系人', 'fContact', v.contact, { req: true, ph: '例：Michael Chen' }) +
        g('联系电话', 'fPhone', v.phone, { ph: '+61 4xx xxx xxx' }) +
        g('邮箱', 'fEmail', v.email, { ph: 'name@company.com.au' }) +
        g('微信 / WhatsApp', 'fWechat', v.wechat) +
      '</div>') +
    card('澳洲收货信息', '邮编自动识别州 / 城区 / 卸货港 / 派送费区间',
      '<div class="form-grid">' +
        g('邮编', 'fPostcode', v.postcode, { req: true, ph: '4 位数字，例 2164', hint: '<span id="pcHint">输入 4 位邮编后自动识别</span>' }) +
        g('州 / 领地', 'fState', v.state, { type: 'select', opts: states }) +
        g('城区 / suburb', 'fSuburb', v.suburb) +
        g('详细地址', 'fAddress', v.address, { col: 3, ph: '例：12 Victoria St, Smithfield NSW 2164' }) +
      '</div>' +
      '<div id="pcCard" class="pc-card" style="display:none"></div>') +
    card('客户画像', '用于销售分级与后续筛选',
      '<div class="form-grid">' +
        g('客户等级', 'fLevel', v.level || 'B', { type: 'select', opts: [['A', 'A 级 · 大客户 / 长期'], ['B', 'B 级 · 常规客户'], ['C', 'C 级 · 小批量 / 新客']] }) +
        g('客户来源', 'fSource', v.source || '其他', { type: 'select', opts: ['展会', '转介绍', '网站', '阿里巴巴', '社媒', '其他'].map(function (x) { return [x, x]; }) }) +
        g('当前状态', 'fStatus', v.status || 'lead', { type: 'select', opts: Object.keys(STATUS_MAP).map(function (k) { return [k, STATUS_MAP[k].zh]; }) }) +
        g('标签（逗号分隔）', 'fTags', (v.tags || []).join('，'), { ph: '家具，长期客户' }) +
        g('备注 / 需求要点', 'fNotes', v.notes, { col: 3, ph: '例：每季度一个 40HQ，主走悉尼，需 DDP 含税报价，关注清关时效' }) +
      '</div>');
}

function readStep1() {
  return {
    company: $('#fCompany').value.trim(), contact: $('#fContact').value.trim(), phone: $('#fPhone').value.trim(),
    email: $('#fEmail').value.trim(), wechat: $('#fWechat').value.trim(),
    country: 'Australia', state: $('#fState').value, postcode: $('#fPostcode').value.trim(),
    suburb: $('#fSuburb').value.trim(), address: $('#fAddress').value.trim(),
    level: $('#fLevel').value, source: $('#fSource').value, status: $('#fStatus').value,
    tags: $('#fTags').value.split(/[，,]/).map(function (x) { return x.trim(); }).filter(Boolean),
    notes: $('#fNotes').value.trim()
  };
}

function bindStep1(c) {
  const pc = $('#fPostcode');
  if (!pc) return;
  const runLookup = debounce(function () {
    const v = pc.value.trim();
    const hint = $('#pcHint'), box = $('#pcCard');
    if (!/^\d{4}$/.test(v)) { if (hint) hint.textContent = '输入 4 位邮编后自动识别'; if (box) box.style.display = 'none'; return; }
    AU.init();
    const rec = AU.lookup(v);
    if (!rec) {
      if (hint) hint.innerHTML = '<span class="bad">邮编 ' + esc(v) + ' 不在路网覆盖范围（NSW 2xxx / VIC 3xxx / QLD 4xxx / SA 5xxx / WA 6xxx）</span>';
      if (box) box.style.display = 'none';
      return;
    }
    if (hint) hint.innerHTML = '<span class="good">✓ 已识别：' + esc(rec.st) + ' · ' + esc(rec.suburb) + '</span>';
    if ($('#fState') && !$('#fState').value) $('#fState').value = rec.st;
    if ($('#fSuburb') && !$('#fSuburb').value.trim()) $('#fSuburb').value = rec.suburb;
    const q = AU.quoteDelivery({ postcode: v, state: rec.st, ctn: '40HQ' });
    if (box) {
      box.style.display = 'block';
      box.innerHTML = '<div class="pc-t">📍 收货地画像（来自澳洲真实公路路网）</div>' +
        '<div class="pc-grid">' +
          '<div><span>州 / 城区</span><b>' + esc(rec.st) + ' · ' + esc(rec.suburb) + '</b></div>' +
          '<div><span>推荐卸货港</span><b>' + esc(q.portLabel || q.port) + '</b></div>' +
          '<div><span>派送里程</span><b>' + (q.km ? q.km + ' km' : '待确认') + '</b></div>' +
          '<div><span>派送区</span><b>' + esc(q.zone || '待确认') + '</b></div>' +
          '<div><span>派送费预估</span><b>A$ ' + fmtInt(q.low) + ' ~ ' + fmtInt(q.high) + '</b></div>' +
          '<div><span>装卸方式</span><b>标准车（侧卸车需另计）</b></div>' +
        '</div>' +
        '<div class="pc-why">' + esc(q.why || '') + '</div>';
    }
  }, 320);
  pc.addEventListener('input', runLookup);
  if (pc.value.trim().length === 4) runLookup();
}

/* ============================== 第 2 步 ============================== */
async function step2Html(c) {
  const cargos = (c && c.cargos) || [];
  const listHtml = cargos.length ? '<div class="cargo-chips">' + cargos.map(function (g) {
    const s = g.summary || CRM.cargoSummary(g.items);
    return '<div class="cargo-chip"><b>' + esc(g.name) + '</b><span>' + fmtInt(s.totalQty) + ' 件 · ' + fmtNum(s.totalCbm, 2) + ' CBM · ' + fmtNum(s.totalWeight / 1000, 2) + ' t' + (s.containerType ? ' · ' + esc(s.containerType) : '') + '</span>' +
      '<i>' + fmtDate(g.createdAt) + '</i></div>';
  }).join('') + '</div>' : '<div class="muted-note">还没有保存的货物规格。在下面模块里录好后点「取回货物并保存」即可。</div>';
  return Guide.tip('怎么用这一步', '客户给的货物清单（Excel 或口述）直接录入下面的 <b>3D 智能装柜模块</b>：它会自动算出 <b>总体积 / 总重量 / 推荐柜型 / 装载率</b>，还能用 3D 视图逐件核对码放方式。<br>录完点 <b>「取回货物并保存」</b>，数据就存进这位客户的档案，后面方案与报价都会自动引用。') +
    card('已保存的货物规格', '进入档案与 PDF 的货物信息', listHtml) +
    '<div class="frame-host" id="packingHost"></div>' +
    '<div class="step-actions">' +
      '<button class="btn primary" data-act="cargo-pull">⬇ 取回货物并保存</button>' +
      '<button class="btn ghost" data-act="cargo-sample">载入示例货物</button>' +
      '<button class="btn ghost" data-act="cargo-save-current">查看模块当前数据</button>' +
      '<span class="spacer"></span>' +
      '<span class="muted-note">模块内也可直接用 Excel 导入 / 导出</span>' +
    '</div>';
}
function bindStep2(c) {
  Bridge.mount('packing', '#packingHost');
  setTimeout(async function () {
    try {
      await ensureReady('packing');
      const last = (c.cargos || []).slice(-1)[0];
      if (last && (last.items || []).length) {
        Toast.info('正在把最近一份货物规格带入 3D 模块并重新计算…', 5000);
        await pushCargoToModule(last.items);
        Toast.ok('3D 模块已载入该客户货物（' + (last.items || []).length + ' 个品项）');
      } else {
        Bridge.send('packing', 'clearCargo');
      }
    } catch (e) { console.warn('模块预载失败', e); }
  }, 1200);
}
async function pushCargoToModule(items) {
  await ensureReady('packing');
  const p = Bridge.waitFor('packing', 'planReady', 120000).catch(function () { return null; });
  Bridge.send('packing', 'loadCargo', { items: items });
  return await p;
}
async function pullCargoFromModule() {
  await ensureReady('packing');
  return Bridge.request('packing', 'requestCargo', {}, 'cargoData', 30000);
}

/* ============================== 第 3 步 ============================== */
function step3Html(c) {
  const f = flowState();
  const rec = f.recommendation;
  const cargo = (c.cargos || []).slice(-1)[0];
  const items = (cargo && cargo.items) || [];
  const src = '<div class="src-strip">' +
    '<div class="ss"><b>' + esc(c.postcode || '未填') + '</b><span>收货邮编</span></div>' +
    '<div class="ss"><b>' + esc(c.state || '—') + '</b><span>州</span></div>' +
    '<div class="ss"><b>' + (cargo ? fmtInt((cargo.summary || {}).totalQty) : 0) + '</b><span>件数</span></div>' +
    '<div class="ss"><b>' + (cargo ? fmtNum((cargo.summary || {}).totalCbm, 2) : 0) + '</b><span>CBM</span></div>' +
    '<div class="ss"><b>' + (cargo ? fmtNum(((cargo.summary || {}).totalWeight || 0) / 1000, 2) : 0) + '</b><span>吨</span></div>' +
  '</div>';
  const ctrl = '<div class="step-actions">' +
    '<button class="btn primary" data-act="rec-generate">⚡ 生成方案推荐</button>' +
    '<select id="recCtn" class="input sm"><option value="">自动选柜型</option>' + Object.keys(CONTAINER_SPEC).map(function (k) { return '<option value="' + k + '">' + k + ' 固定</option>'; }).join('') + '</select>' +
    '<select id="recProv" class="input sm" title="中国起运省份（影响拖车与海运时效）">' + ['广东', '浙江', '江苏', '福建', '上海', '山东', '天津', '河北', '辽宁', '广西'].map(function (p) { return '<option value="' + p + '"' + (p === '广东' ? ' selected' : '') + '>' + p + ' 起运</option>'; }).join('') + '</select>' +
    '<select id="recMode" class="input sm"><option value="d2d">门到门 D2D</option><option value="d2p">门到港 D2P</option><option value="p2d">港到门 P2D</option><option value="p2p">港到港 P2P</option></select>' +
    '<select id="recTax" class="input sm"><option value="none">仅运费</option><option value="DDU">DDU 不含税</option><option value="DDP">DDP 含税</option></select>' +
    '<span class="spacer"></span><button class="btn ghost" data-act="rec-save"' + (rec ? '' : ' disabled') + '>💾 保存推荐到档案</button></div>';
  if (!items.length) {
    return Guide.tip('先有货物才能推荐', '方案推荐需要知道货物的体积、重量与包装形态。请先回到第 ② 步录入货物。', 'warn') +
      '<div class="empty-state"><div class="es-ico">📦</div><h3>还没有货物数据</h3><p>完成第 ② 步后，这里会自动生成整柜方案。</p>' +
      '<button class="btn primary" data-flow-step="2">← 回到货物信息</button></div>';
  }
  return Guide.tip('推荐逻辑', '系统按 <b>体积（有效装载率 85%~90%）+ 毛重（澳洲公路轴重限制）+ 包装形态 + 单件尺寸</b> 匹配柜型与柜数，再结合收货邮编的真实公路里程给出 <b>卸货港 / 派送区 / 派送费区间</b>，最后给出装柜作业要点与风险提示。') +
    card('方案输入', '来自客户档案与最近一份货物规格', src + ctrl) +
    (rec ? recResultHtml(rec) : '<div class="wait-box"><div class="wb-ico">🧭</div><div><b>点击「生成方案推荐」</b><div class="muted-note">约 1 秒完成柜型枚举、装载率测算与派送方案匹配</div></div></div>');
}
function recResultHtml(res) {
  const alt = (res.alternatives || []).map(function (a) {
    return '<div class="alt-cell' + (a.type === res.containerType ? ' best' : '') + (a.fit ? '' : ' bad') + '">' +
      '<div class="ac-t">' + a.type + (a.type === res.containerType ? ' ✅' : '') + '</div>' +
      '<div class="ac-v">' + a.count + ' 柜 · 装载率 ' + a.utilization + '%</div>' +
      '<div class="ac-d">' + esc(a.note || '') + (a.fit ? '' : '（超限）') + '</div>' +
      bar(a.utilization, a.utilization > 100 ? 'red' : a.utilization > 72 ? 'green' : 'amber') + '</div>';
  }).join('');
  const points = (res.loading || []).map(function (p) { return '<li class="pt ' + (p.level || 'info') + '"><b>' + esc(p.t) + '</b>' + esc(p.d) + '</li>'; }).join('');
  const risks = (res.risks || []).map(function (p) { return '<li class="pt ' + (p.level || 'info') + '"><b>' + esc(p.t) + '</b>' + esc(p.d) + '</li>'; }).join('');
  const route = (res.route || []).map(function (p) { return '<div class="route-row"><span class="rr-k">' + esc(p.t) + '</span><span class="rr-v">' + esc(p.d) + '</span></div>'; }).join('');
  return '<div class="rec-hero"><div class="rh-l"><div class="rh-tag">推荐方案</div><h2>' + esc(res.headline || '') + '</h2>' +
      '<div class="rh-meta">体积 ' + fmtNum(res.basis.totalCbm, 2) + ' CBM · 毛重 ' + fmtNum(res.basis.totalWeight / 1000, 2) + ' t · 件数 ' + fmtInt(res.basis.totalQty) +
      ' · 装载率 ' + res.basis.utilization + '% · 载重利用率 ' + res.basis.weightUtilization + '%' + (res.basis.measured ? ' · 3D 实测 ' + res.basis.measured.containerType + ' ' + res.basis.measured.utilization + '%' : '') + '</div></div>' +
      '<div class="rh-r">' + progressRing(Math.min(100, res.basis.utilization), 84, res.basis.utilization + '%') + '<div class="rh-rl">整柜装载率</div></div></div>' +
    '<div class="alt-strip">' + alt + '</div>' +
    card('运输路线与派送', '基于澳洲真实公路路网', route) +
    card('装柜作业要点', '现场可直接执行', '<ul class="pt-list">' + points + '</ul>') +
    (risks ? card('风险提示', '需要在报价前与客户确认', '<ul class="pt-list">' + risks + '</ul>') : '') +
    '<div class="rec-foot">建议条款 / 方式：<b>' + esc((res.terms || {}).text || '') + '</b></div>';
}
function bindStep3(c) {
  const m = $('#recMode'); if (m) m.value = (App.state.settings.defaultMode || 'd2d');
}

/* ============================== 第 4 步 ============================== */
async function step4Html(c) {
  const quotes = (c && c.quotes) || [];
  const last = quotes.slice(-1)[0];
  const cargo = (c.cargos || []).slice(-1)[0];
  const rec = (c.recommendations || []).slice(-1)[0];
  const ctn = (rec && rec.result && rec.result.containerType) || (cargo && (cargo.summary || {}).containerType) || '40HQ';
  const qRows = last ? (last.rows || []).map(function (x, i) {
    return '<tr><td class="c-idx">' + (i + 1) + '</td><td>' + esc(x.name || '') + '</td><td>' + esc(x.unit || '') + '</td><td class="num">' + fmtInt(x.qty || 1) + '</td><td class="num">' + fmtNum(x.unitPrice, 2) + '</td><td class="num">' + fmtNum(x.amount, 2) + '</td></tr>';
  }).join('') : '';
  const lastHtml = last ? card('最近一份报价 ' + esc(last.no || ''), fmtDateTime(last.createdAt) + ' · ' + esc(last.ctn) + ' · ' + esc(last.cur),
      '<div class="sum-strip"><div class="ss"><b>' + fmtMoney(last.totals.cost, last.cur) + '</b><span>成本</span></div>' +
      '<div class="ss"><b>' + fmtMoney(last.totals.sell, last.cur) + '</b><span>报价</span></div>' +
      '<div class="ss"><b>' + fmtMoney(last.totals.profit, last.cur) + '</b><span>毛利</span></div>' +
      '<div class="ss"><b>' + (num(last.totals.cost) > 0 ? fmtNum(num(last.totals.profit) / num(last.totals.cost) * 100, 1) + '%' : '—') + '</b><span>毛利率</span></div></div>' +
      (qRows ? '<div class="table-wrap"><table class="tbl compact"><thead><tr><th>#</th><th>费用项</th><th>单位</th><th class="num">数量</th><th class="num">单价</th><th class="num">金额</th></tr></thead><tbody>' + qRows + '</tbody></table></div>' : '')) : '';
  return Guide.tip('报价模块已经预填好了', '打开下面的报价模块时，系统会把 <b>客户抬头、中国装柜城市、澳洲收货邮编、柜型（' + esc(ctn) + '）、件数品名</b> 自动填进去；你只需确认海运费、利润率档位与条款，然后点 <b>「取回报价并保存」</b>。') +
    '<div class="prefill-strip">' +
      '<div class="pf"><span>客户</span><b>' + esc((c && (c.company || c.contact)) || '—') + '</b></div>' +
      '<div class="pf"><span>收货地</span><b>' + esc((c && c.postcode) || '—') + ' ' + esc((c && c.suburb) || '') + '</b></div>' +
      '<div class="pf"><span>柜型</span><b>' + esc(ctn) + '</b></div>' +
      '<div class="pf"><span>货量</span><b>' + (cargo ? fmtInt((cargo.summary || {}).totalQty) + ' 件 / ' + fmtNum((cargo.summary || {}).totalCbm, 2) + ' CBM' : '—') + '</b></div>' +
      '<div class="pf"><span>建议条款</span><b>' + esc((rec && rec.result && rec.result.terms && rec.result.terms.text) || ((App.state.settings.defaultTerm || 'EXW') + ' / 门到门')) + '</b></div>' +
    '</div>' +
    '<div class="step-actions">' +
      '<button class="btn primary" data-act="quote-pull">⬇ 取回报价并保存</button>' +
      '<button class="btn ghost" data-act="quote-push">↻ 重新预填客户信息</button>' +
      '<button class="btn ghost" data-act="quote-export">导出客户版 Excel（模块内）</button>' +
      '<span class="spacer"></span><span class="muted-note">报价明细会存进客户档案，并出现在 PDF 里</span>' +
    '</div>' +
    '<div class="frame-host" id="quoteHost"></div>' + lastHtml;
}
function bindStep4(c) {
  Bridge.mount('quote', '#quoteHost');
  setTimeout(function () { FlowQuote.push(c).catch(function (e) { console.warn('预填报价失败', e); }); }, 1600);
}

/* ============================== 第 5 步 ============================== */
function step5Html(c) {
  const s = CRM.customerStats(c);
  const checks = [
    { ok: !!(c.company && c.contact), t: '客户基本信息', d: '公司 / 联系人' },
    { ok: !!(c.postcode && c.state), t: '澳洲收货信息', d: '邮编 / 州 / 城区' },
    { ok: (c.cargos || []).length > 0, t: '货物规格', d: (c.cargos || []).length + ' 份' },
    { ok: (c.recommendations || []).length > 0, t: '方案推荐', d: (c.recommendations || []).length + ' 份' },
    { ok: (c.quotes || []).length > 0, t: '整柜报价', d: (c.quotes || []).length + ' 份' }
  ];
  const checkHtml = '<div class="check-list">' + checks.map(function (x, i) {
    return '<div class="check-row ' + (x.ok ? 'ok' : 'no') + '"><span class="ck">' + (x.ok ? '✓' : '○') + '</span><b>' + x.t + '</b><span class="ck-d">' + esc(x.d) + '</span>' +
      (x.ok ? '' : '<button class="btn tiny" data-flow-step="' + (i + 1) + '">去补齐</button>') + '</div>';
  }).join('') + '</div>';
  const st = App.state.stats || {};
  return Guide.tip('最后一步：归档', '到这里这位客户的完整档案已经形成。可以做三件事：<b>备份数据</b>（防止误删）、<b>导出本客户 PDF</b>（对客 / 留档）、<b>导出全部客户 PDF</b>（一次性汇总所有客户）。') +
    '<div class="grid-2">' +
      card('档案完整度 ' + CRM.completeness(c) + '%', '缺项可以直接点「去补齐」', checkHtml +
        '<div class="complete-sum">体积 ' + fmtNum(s.totalCbm, 2) + ' CBM · 毛重 ' + fmtNum(s.totalWeight / 1000, 2) + ' t · ' + fmtInt(s.totalQty) + ' 件 · 柜型 ' + esc(s.containerType || '待定') +
        ' · 最近报价 ' + (s.lastQuoteAmount ? fmtMoney(s.lastQuoteAmount, s.lastQuoteCur) : '未报价') + '</div>') +
      card('归档动作', '数据安全 + 交付物',
        '<div class="io-box">' +
          '<div class="io-row"><div><b>立即备份</b><div class="muted-note">生成一份 data/backups 快照</div></div><button class="btn primary" data-act="backup-now">备份</button></div>' +
          '<div class="io-row"><div><b>导出本客户 PDF</b><div class="muted-note">单客户完整档案，满版无留白</div></div><button class="btn ghost" data-act="pdf-one" data-id="' + c.id + '">导出</button></div>' +
          '<div class="io-row"><div><b>浏览器打印</b><div class="muted-note">打印对话框里选「另存为 PDF」</div></div><button class="btn ghost" data-act="pdf-one-print" data-id="' + c.id + '">打开打印页</button></div>' +
          '<div class="io-row"><div><b>导出全部客户 PDF</b><div class="muted-note">当前共 ' + fmtInt(st.customers || 1) + ' 个客户</div></div><button class="btn ghost" data-act="pdf-all-server">导出</button></div>' +
        '</div>' +
        '<div class="done-box"><div class="db-ico">🎉</div><div><b>本客户流程已完成</b><div class="muted-note">可以继续新建下一位客户，或回到客户管理查看全部档案。</div>' +
        '<div class="btn-row"><button class="btn primary" data-act="flow-new">＋ 新建下一位客户</button><button class="btn ghost" data-act="open" data-id="' + c.id + '">查看完整档案</button></div></div></div>');
}

/* ============================== 步骤推进 ============================== */
const FlowNext = {
  run: async function (c) {
    const f = flowState();
    if (f.step === 1) {
      const d = readStep1();
      if (!d.company && !d.contact) { Toast.err('请至少填写「公司名称」或「联系人」'); $('#fCompany').focus(); return; }
      if (d.postcode && !/^\d{4}$/.test(d.postcode)) { Toast.err('澳洲邮编应为 4 位数字'); $('#fPostcode').focus(); return; }
      try {
        if (!f.customerId) {
          const created = await Data.createCustomer(d);
          f.customerId = created.id;
          Toast.ok('客户已建档：' + (created.company || created.contact));
        } else {
          await Data.updateCustomer(f.customerId, d);
          Toast.ok('客户资料已更新');
        }
        f.step = 2;
        Router.go('#/flow/' + encodeURIComponent(f.customerId) + '/2');
      } catch (e) { Toast.err('保存失败：' + e.message); }
      return;
    }
    if (f.step === 2) {
      const cargo = (c.cargos || []).slice(-1)[0];
      if (!cargo && !(await Modal.confirm('还没有保存任何货物信息，确定进入下一步吗？（可先用「载入示例货物」体验完整流程）'))) return;
      f.step = 3; Router.go('#/flow/' + encodeURIComponent(f.customerId) + '/3');
      return;
    }
    if (f.step === 3) {
      if (!f.recommendation && !((c.recommendations || []).length) && !(await Modal.confirm('还没有生成方案推荐，确定跳过吗？'))) return;
      f.step = 4; Router.go('#/flow/' + encodeURIComponent(f.customerId) + '/4');
      return;
    }
    if (f.step === 4) {
      if (!((c.quotes || []).length) && !(await Modal.confirm('还没有保存报价快照，确定跳过吗？'))) return;
      f.step = 5; Router.go('#/flow/' + encodeURIComponent(f.customerId) + '/5');
      return;
    }
    Toast.info('已经是最后一步了');
  },
  onShortcut: function () {
    const f = flowState();
    if (App.state.view !== 'flow') return;
    if (f.step === 1) {
      if (!f.customerId) { Toast.warn('点击「保存并进入下一步」即可建档'); return; }
      Data.updateCustomer(f.customerId, readStep1()).then(function () { Toast.ok('草稿已保存'); }).catch(function (e) { Toast.err(e.message); });
    } else { Toast.info('当前步骤有独立保存按钮（取回货物 / 保存推荐 / 取回报价）'); }
  }
};

/* ============================== 各步动作 ============================== */
const FlowCargo = {
  pull: async function (c) {
    const btn = $('[data-act="cargo-pull"]');
    if (btn) { btn.disabled = true; btn.textContent = '正在读取模块数据…'; }
    try {
      const res = await pullCargoFromModule();
      const items = (res && res.items) || [];
      if (!items.length) { Toast.warn('模块里还没有有效货物行（件数与三边尺寸需大于 0）'); return; }
      const summary = (res && res.summary) || CRM.cargoSummary(items);
      const name = await Modal.prompt('给这份货物规格起个名字（例如：首柜 / 第二批 / 补货）', '货物规格 ' + ((c.cargos || []).length + 1), '保存货物信息');
      if (name === null) return;
      const cargo = await Data.addCargo(c.id, { name: name || '货物规格', items: items, summary: summary });
      Toast.ok('已保存货物信息：' + fmtInt(summary.totalQty) + ' 件 / ' + fmtNum(summary.totalCbm, 2) + ' CBM');
      App.state.flow.cargo = cargo;
      App.views.flow({ args: [c.id, '2'] });
    } catch (e) {
      Toast.err('取回失败：' + e.message);
    } finally {
      const b = $('[data-act="cargo-pull"]');
      if (b) { b.disabled = false; b.textContent = '⬇ 取回货物并保存'; }
    }
  },
  saveCurrent: async function (c) {
    try {
      const res = await pullCargoFromModule();
      const items = (res && res.items) || [];
      Toast.info('模块当前有效货物行 ' + items.length + ' 条' + (items.length ? '：' + items.slice(0, 3).map(function (x) { return x.name + '×' + x.qty; }).join('、') + (items.length > 3 ? ' 等' : '') : ''));
    } catch (e) { Toast.err(e.message); }
  },
  sample: async function (c) {
    const sample = [
      { name: '餐椅（拆装纸箱）', qty: 300, L_cm: 60, W_cm: 40, H_cm: 40, weight_kg: 12, type: 'carton', unloadStop: 1, canFlip: true, canSide: true, loadCap: 80, fragile: 0, hazmat: 0, inspect: 0 },
      { name: '餐桌板件（拆装纸箱）', qty: 120, L_cm: 80, W_cm: 60, H_cm: 50, weight_kg: 18, type: 'carton', unloadStop: 2, canFlip: true, canSide: true, loadCap: 120, fragile: 1, hazmat: 0, inspect: 0 }
    ];
    try {
      Toast.info('正在载入示例货物并计算装柜…');
      await pushCargoToModule(sample);
      Toast.ok('示例货物已载入 3D 模块，可点「取回货物并保存」');
    } catch (e) { Toast.err('载入失败：' + e.message); }
  }
};

const FlowRecommend = {
  generate: async function (c) {
    const cargo = (c.cargos || []).slice(-1)[0];
    if (!cargo) { Toast.warn('请先在第 ② 步保存货物信息'); return; }
    AU.init();
    if (!AU.KMT) { Toast.info('正在加载澳洲真实路网里程数据…', 3000); await AU.loadKm(); }
    const ctn = $('#recCtn') ? $('#recCtn').value : '';
    const mode = $('#recMode') ? $('#recMode').value : 'd2d';
    const tax = $('#recTax') ? $('#recTax').value : 'none';
    const res = Recommend.run({
      items: cargo.items, postcode: c.postcode, state: c.state,
      prov: (document.getElementById('recProv') || {}).value || '广东',
      moduleSummary: cargo.summary || null,
      mode: mode, tax: tax, term: App.state.settings.defaultTerm
    });
    if (ctn) {
      const spec = CONTAINER_SPEC[ctn];
      const count = Math.max(1, Math.ceil(res.basis.totalCbm / spec.usable));
      res.containerType = ctn; res.containerCount = count;
      res.basis.usable = spec.usable; res.basis.payload = spec.payload;
      res.basis.utilization = Math.round(res.basis.totalCbm / (spec.usable * count) * 1000) / 10;
      res.basis.weightUtilization = Math.round(res.basis.totalWeight / (spec.payload * count) * 1000) / 10;
      res.headline = ctn + ' × ' + count + ' · ' + ((res.delivery || {}).portLabel || '待定卸货港') + ' · ' + res.terms.text;
    }
    App.state.flow.recommendation = res;
    Toast.ok('方案已生成：' + res.containerType + ' × ' + res.containerCount);
    App.views.flow({ args: [c.id, '3'] });
  },
  save: async function (c) {
    const res = App.state.flow.recommendation;
    if (!res) { Toast.warn('请先生成方案推荐'); return; }
    try {
      await Data.addRecommendation(c.id, { inputs: { postcode: c.postcode, state: c.state }, result: res });
      Toast.ok('方案推荐已保存到客户档案');
      App.views.flow({ args: [c.id, '3'] });
    } catch (e) { Toast.err('保存失败：' + e.message); }
  }
};

const FlowQuote = {
  build: function (c) {
    const cargo = (c.cargos || []).slice(-1)[0];
    const rec = (c.recommendations || []).slice(-1)[0];
    const ctn = (rec && rec.result && rec.result.containerType) || (cargo && (cargo.summary || {}).containerType) || '40HQ';
    const items = (cargo && cargo.items) || [];
    const pieces = items.reduce(function (a, x) { return a + (num(x.qty) || 0); }, 0);
    const desc = items.slice(0, 3).map(function (x) { return x.name; }).join(' / ') + (items.length > 3 ? ' 等' : '');
    return {
      customer: { company: c.company, contact: c.contact, phone: c.phone, email: c.email },
      origin: { prov: '广东', city: '东莞', address: '' },
      au: { postcode: c.postcode, suburb: c.suburb, address: c.address },
      cargo: { pieces: pieces, desc: desc, ctn: ctn },
      sea: { amount: '', cur: 'USD', transitDays: '', vessel: '' },
      term: (rec && rec.result && rec.result.terms && rec.result.terms.term) || App.state.settings.defaultTerm || 'EXW',
      mode: (rec && rec.result && rec.result.terms && rec.result.terms.mode) || App.state.settings.defaultMode || 'd2d',
      tax: (rec && rec.result && rec.result.terms && rec.result.terms.tax) || 'none',
      tier: 0.10
    };
  },
  push: async function (c) {
    await ensureReady('quote');
    const payload = FlowQuote.build(c);
    Bridge.send('quote', 'loadQuote', payload);
    await Bridge.waitFor('quote', 'ack', 15000).catch(function () { return null; });
    return payload;
  },
  pull: async function (c) {
    const btn = $('[data-act="quote-pull"]');
    if (btn) { btn.disabled = true; btn.textContent = '正在读取报价…'; }
    try {
      await ensureReady('quote');
      const res = await Bridge.request('quote', 'requestQuote', {}, 'quoteData', 30000);
      const totals = res.totals || { cost: 0, sell: 0, profit: 0 };
      if (!num(totals.sell) && !(await Modal.confirm('报价金额为 0，可能是海运费等关键费用未填写。仍要保存吗？'))) return;
      const q = await Data.addQuote(c.id, {
        no: res.no, term: res.term, mode: res.mode, tax: res.tax, ctn: res.ctn, tier: res.tier, cur: res.cur,
        totals: totals, rows: res.rows || [], info: res.info || {}
      });
      Toast.ok('报价已保存：' + q.no + ' · ' + fmtMoney(totals.sell, q.cur));
      App.views.flow({ args: [c.id, '4'] });
    } catch (e) {
      Toast.err('取回报价失败：' + e.message);
    } finally {
      const b = $('[data-act="quote-pull"]');
      if (b) { b.disabled = false; b.textContent = '⬇ 取回报价并保存'; }
    }
  }
};

/* ============================== 动作注册 ============================== */
App.actions['flow-new'] = function () {
  App.state.flow = { customerId: null, step: 1, cargo: null, recommendation: null, quote: null };
  Router.go('#/flow/1');
};
App.actions['flow-continue'] = async function (elm) {
  const id = elm.dataset.id;
  let step = 1;
  try {
    const c = await Data.getCustomer(id);
    if ((c.cargos || []).length) step = 2;
    if ((c.recommendations || []).length) step = 3;
    if ((c.quotes || []).length) step = 4;
    if (c.completeness === 100) step = 5;
  } catch (e) {}
  App.state.flow = { customerId: id, step: step, cargo: null, recommendation: null, quote: null };
  Router.go('#/flow/' + encodeURIComponent(id) + '/' + step);
};
App.actions['cargo-pull'] = async function () { const c = await ensureFlowCustomer(); if (c) await FlowCargo.pull(c); };
App.actions['cargo-save-current'] = async function () { const c = await ensureFlowCustomer(); if (c) await FlowCargo.saveCurrent(c); };
App.actions['cargo-sample'] = async function () { const c = await ensureFlowCustomer(); if (c) await FlowCargo.sample(c); };
App.actions['rec-generate'] = async function () { const c = await ensureFlowCustomer(); if (c) await FlowRecommend.generate(c); };
App.actions['rec-save'] = async function () { const c = await ensureFlowCustomer(); if (c) await FlowRecommend.save(c); };
App.actions['quote-pull'] = async function () { const c = await ensureFlowCustomer(); if (c) await FlowQuote.pull(c); };
App.actions['quote-push'] = async function () { const c = await ensureFlowCustomer(); if (c) try { await FlowQuote.push(c); Toast.ok('已重新预填'); } catch (e) { Toast.err(e.message); } };
App.actions['quote-export'] = async function () { try { await ensureReady('quote'); Bridge.send('quote', 'exportExcel'); Toast.info('已向报价模块发送导出指令'); } catch (e) { Toast.err(e.message); } };
App.actions['cargo-new'] = function (elm) { App.state.flow = { customerId: elm.dataset.id, step: 2 }; Router.go('#/flow/' + encodeURIComponent(elm.dataset.id) + '/2'); };
App.actions['quote-new'] = function (elm) { App.state.flow = { customerId: elm.dataset.id, step: 4 }; Router.go('#/flow/' + encodeURIComponent(elm.dataset.id) + '/4'); };
App.actions['rec-new'] = function (elm) { App.state.flow = { customerId: elm.dataset.id, step: 3 }; Router.go('#/flow/' + encodeURIComponent(elm.dataset.id) + '/3'); };
App.actions['quote-from-rec'] = function (elm) { App.state.flow = { customerId: elm.dataset.id, step: 4 }; Router.go('#/flow/' + encodeURIComponent(elm.dataset.id) + '/4'); };
App.actions['cargo-3d'] = function (elm) { App.state.flow = { customerId: elm.dataset.id, step: 2 }; Router.go('#/flow/' + encodeURIComponent(elm.dataset.id) + '/2'); };
App.actions['quote-open'] = function (elm) { App.state.flow = { customerId: elm.dataset.id, step: 4 }; Router.go('#/flow/' + encodeURIComponent(elm.dataset.id) + '/4'); };

window.Bridge = Bridge; window.FlowCargo = FlowCargo; window.FlowQuote = FlowQuote;
window.FlowRecommend = FlowRecommend; window.FlowNext = FlowNext;
