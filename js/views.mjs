/* ============================================================================
 * views.js —— 各视图（工作台 / 客户管理 / 客户详情 / 备份中心 / 导出中心 / 设置 / 帮助）
 * ==========================================================================*/
'use strict';

/* 目录结构文本（供帮助页展示） */
const TREE_TEXT = [
  '澳洲FCL客户管理系统/',
  '├─ 启动系统.cmd        ← 双击启动',
  '├─ server.js           后端（零依赖）',
  '├─ data/db.json        客户数据',
  '├─ data/backups/       自动快照',
  '├─ public/index.html   CRM 主界面',
  '├─ public/print.html   满版打印页',
  '├─ public/modules/     3D 装柜 / FCL 报价 模块',
  '└─ public/vendor/      本地依赖库（离线可用）'
].join('\\n');


function setMain(html) { $('#mainView').innerHTML = html; }
function crumbs(list) {
  return '<div class="crumbs">' + list.map(function (x, i) {
    return (i ? '<span class="sep">/</span>' : '') + (x.href ? '<a href="' + x.href + '">' + esc(x.t) + '</a>' : '<span class="cur">' + esc(x.t) + '</span>');
  }).join('') + '</div>';
}
function pageHead(title, sub, tools) {
  return '<div class="page-head"><div><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' +
    (tools ? '<div class="page-tools">' + tools + '</div>' : '') + '</div>';
}
function statusPill(s) { return '<span class="pill ' + statusCls(s) + '">' + statusZh(s) + '</span>'; }
function levelTag(l) { return '<span class="lv lv-' + esc(String(l || 'B')).toLowerCase() + '">' + esc(l || 'B') + ' 级</span>'; }

/* ============================== 工作台 ============================== */
App.views.dashboard = async function () {
  const st = App.state.stats || (await Data.loadStats()) || {};
  const cs = App.state.customers || [];
  const recent = cs.slice(0, 6);
  const todo = cs.filter(function (c) { return c.completeness < 100; }).slice(0, 5);
  const quotes = cs.filter(function (c) { return c.quoteCount > 0; }).length;
  const inFlow = cs.filter(function (c) { return c.status === 'quoting' || c.status === 'lead'; }).length;

  const hero =
    '<section class="hero">' +
      '<div class="hero-bg"></div>' +
      '<div class="hero-main">' +
        '<div class="hero-tag">澳洲整柜 FCL · 一站式客户管理</div>' +
        '<h1>从客户录入，到整柜报价，到一个 PDF 归档</h1>' +
        '<p>录入客户 → 3D 装柜保存货物信息 → 自动生成方案推荐 → 一键带入整柜报价 → 全量数据备份与导出。</p>' +
        '<div class="hero-cta">' +
          '<button class="btn primary lg" data-act="flow-new">＋ 新建客户并开始引导</button>' +
          '<button class="btn ghost lg" data-act="go" data-href="#/customers">客户管理</button>' +
          '<button class="btn ghost lg" data-act="go" data-href="#/export">导出中心</button>' +
        '</div>' +
      '</div>' +
      '<div class="hero-side">' + Guide.rail(0, { clickable: false }) + '</div>' +
    '</section>';

  const kpis = '<div class="kpi-row">' +
    kpi('客户总数', fmtInt(st.customers || cs.length), '在跟 ' + inFlow + ' · 已报价 ' + quotes, '', '👥') +
    kpi('累计货物体积', fmtNum(st.totalCbm || 0, 1) + ' <small>CBM</small>', '共 ' + fmtInt(st.totalQty || 0) + ' 件 / ' + fmtNum((st.totalWeight || 0) / 1000, 2) + ' t', 'tone-blue', '📦') +
    kpi('报价累计金额', fmtMoney(st.quoteAmount || 0, App.state.settings.currency || 'AUD'), '报价单 ' + fmtInt(st.quoteCount || 0) + ' 份', 'tone-gold', '💰') +
    kpi('数据备份', fmtInt(st.backups || 0) + ' <small>份</small>', App.state.offline ? '离线模式（本地暂存）' : '自动快照已开启', 'tone-green', '🛡') +
  '</div>';

  const recentHtml = recent.length ? '<div class="mini-list">' + recent.map(function (c) {
    return '<div class="mini-row" data-act="open" data-id="' + c.id + '">' +
      '<div class="mr-ava">' + esc((c.company || c.contact || '?').slice(0, 1).toUpperCase()) + '</div>' +
      '<div class="mr-main"><div class="mr-t">' + esc(c.company || '（未填公司）') + ' ' + levelTag(c.level) + '</div>' +
      '<div class="mr-d">' + esc(c.contact || '—') + ' · ' + esc(c.state || '') + ' ' + esc(c.postcode || '') + ' · ' + (c.containerType || '未选柜型') + '</div></div>' +
      '<div class="mr-right"><div class="mr-v">' + (c.lastQuoteAmount ? fmtMoney(c.lastQuoteAmount, c.lastQuoteCur) : '未报价') + '</div>' +
      '<div class="mr-d">' + relTime(c.updatedAt) + '</div></div>' +
      statusPill(c.status) + '</div>';
  }).join('') + '</div>' : emptyState('📇', '还没有客户', '点击「新建客户」开始第一次引导式建档，30 秒完成录入。',
    '<button class="btn primary" data-act="flow-new">＋ 新建客户</button>');

  const todoHtml = todo.length ? '<div class="todo-list">' + todo.map(function (c) {
    return '<div class="todo-row" data-act="open" data-id="' + c.id + '">' +
      progressRing(c.completeness, 46) +
      '<div class="tr-main"><div class="tr-t">' + esc(c.company || '（未填公司）') + '</div>' +
      '<div class="tr-d">' + (c.cargoCount ? '' : '待录入货物 · ') + (c.recCount ? '' : '待生成方案 · ') + (c.quoteCount ? '' : '待报价') + '</div></div>' +
      '<button class="btn tiny" data-act="flow-continue" data-id="' + c.id + '">继续引导 →</button></div>';
  }).join('') + '</div>' : '<div class="all-done">🎉 所有客户档案已完整（资料 / 货物 / 方案 / 报价 全部就绪）</div>';

  const quick = '<div class="quick-row">' +
    '<button class="quick" data-act="demo-seed"><span>🎬</span>生成示例数据</button>' +
    '<button class="quick" data-act="backup-now"><span>💾</span>立即备份</button>' +
    '<button class="quick" data-act="go" data-href="#/export"><span>📄</span>导出全部客户 PDF</button>' +
    '<button class="quick" data-act="go" data-href="#/backup"><span>🗂</span>备份与恢复</button>' +
    '<button class="quick" data-act="go" data-href="#/help"><span>❓</span>使用指南</button>' +
  '</div>';

  setMain(pageHead('工作台', '今天的客户与整柜业务一览') +
    hero + kpis +
    '<div class="grid-2">' +
      card('最近客户', '按最近更新时间排序', recentHtml, '<button class="btn tiny" data-act="go" data-href="#/customers">查看全部</button>') +
      card('待补全档案', '按引导流程补齐资料，才能一键出完整 PDF', todoHtml) +
    '</div>' +
    card('快捷操作', '', quick));
};

/* ============================ 客户列表 ============================ */
App.views.customers = async function () {
  if (!App.state.customers.length) { try { await Data.loadCustomers(); } catch (e) {} }
  const f = App.state.ui.filter;
  const all = App.state.customers || [];
  const states = Array.from(new Set(all.map(function (c) { return c.state; }).filter(Boolean))).sort();
  const list = all.filter(function (c) {
    if (f.q) {
      const hay = [c.company, c.contact, c.phone, c.email, c.wechat, c.postcode, c.suburb, c.state, (c.tags || []).join(' ')].join(' ').toLowerCase();
      if (hay.indexOf(f.q.toLowerCase()) < 0) return false;
    }
    if (f.status && c.status !== f.status) return false;
    if (f.level && c.level !== f.level) return false;
    if (f.state && c.state !== f.state) return false;
    return true;
  });

  const filterBar =
    '<div class="filter-bar">' +
      '<input id="fltQ" class="input" placeholder="搜索公司 / 联系人 / 电话 / 邮编…  （快捷键 /）" value="' + esc(f.q) + '">' +
      '<select id="fltStatus" class="input sm"><option value="">全部状态</option>' +
        Object.keys(STATUS_MAP).map(function (k) { return '<option value="' + k + '"' + (f.status === k ? ' selected' : '') + '>' + STATUS_MAP[k].zh + '</option>'; }).join('') + '</select>' +
      '<select id="fltLevel" class="input sm"><option value="">全部等级</option>' +
        ['A', 'B', 'C'].map(function (k) { return '<option value="' + k + '"' + (f.level === k ? ' selected' : '') + '>' + k + ' 级</option>'; }).join('') + '</select>' +
      '<select id="fltState" class="input sm"><option value="">全部州</option>' +
        states.map(function (k) { return '<option value="' + esc(k) + '"' + (f.state === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select>' +
      '<button class="btn ghost tiny" data-act="filter-reset">重置</button>' +
      '<div class="spacer"></div>' +
      '<button class="btn primary" data-act="flow-new">＋ 新建客户</button>' +
    '</div>';

  const rows = list.map(function (c, i) {
    return '<tr data-act="open" data-id="' + c.id + '">' +
      '<td class="c-idx">' + (i + 1) + '</td>' +
      '<td class="c-name"><div class="cn-t">' + esc(c.company || '（未填公司）') + '</div><div class="cn-d">' + esc(c.contact || '—') + (c.phone ? ' · ' + esc(c.phone) : '') + '</div></td>' +
      '<td>' + esc(c.state || '—') + '<div class="cn-d">' + esc(c.postcode || '') + ' ' + esc(c.suburb || '') + '</div></td>' +
      '<td>' + statusPill(c.status) + ' ' + levelTag(c.level) + '</td>' +
      '<td class="num">' + (c.totalCbm ? fmtNum(c.totalCbm, 1) : '—') + '<div class="cn-d">' + fmtInt(c.totalQty) + ' 件</div></td>' +
      '<td>' + (c.containerType || '—') + (c.cargoCount ? '<div class="cn-d">' + c.cargoCount + ' 份规格</div>' : '') + '</td>' +
      '<td class="num">' + (c.lastQuoteAmount ? fmtMoney(c.lastQuoteAmount, c.lastQuoteCur) : '—') + (c.lastQuoteNo ? '<div class="cn-d">' + esc(c.lastQuoteNo) + '</div>' : '') + '</td>' +
      '<td class="c-prog">' + progressRing(c.completeness, 40) + '</td>' +
      '<td class="c-ops"><button class="btn tiny" data-act="flow-continue" data-id="' + c.id + '">引导</button>' +
        '<button class="btn tiny" data-act="edit" data-id="' + c.id + '">编辑</button>' +
        '<button class="btn tiny danger" data-act="del" data-id="' + c.id + '">删除</button></td>' +
      '</tr>';
  }).join('');

  const table = list.length ?
    '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      '<th style="width:44px">#</th><th>客户 / 联系人</th><th>目的地</th><th>状态</th><th class="num">体积 / 件数</th><th>柜型</th><th class="num">最近报价</th><th style="width:64px">完整度</th><th style="width:200px">操作</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>' :
    emptyState('🔍', '没有匹配的客户', all.length ? '试着调整筛选条件或重置筛选。' : '还没有客户数据，可以先新建客户或生成示例数据。',
      '<button class="btn primary" data-act="flow-new">＋ 新建客户</button> <button class="btn ghost" data-act="demo-seed">生成示例数据</button>');

  setMain(pageHead('客户管理', '共 ' + all.length + ' 个客户，当前筛选出 ' + list.length + ' 个',
      '<button class="btn ghost" data-act="go" data-href="#/export">导出中心 →</button>') +
    filterBar + card('客户列表', '点击任意一行查看客户档案详情', table));

  const onFilter = debounce(function () { App.views.customers(); }, 260);
  const q = $('#fltQ');
  if (q) q.addEventListener('input', function () { App.state.ui.filter.q = q.value; onFilter(); });
  ['fltStatus', 'fltLevel', 'fltState'].forEach(function (id) {
    const s = $('#' + id);
    if (s) s.addEventListener('change', function () {
      App.state.ui.filter[id === 'fltStatus' ? 'status' : id === 'fltLevel' ? 'level' : 'state'] = s.value;
      App.views.customers();
    });
  });
};

/* ============================ 客户详情 ============================ */
App.views.customer = async function (r) {
  const id = r.args[0];
  let c;
  try { c = await Data.getCustomer(id); } catch (e) { setMain(emptyState('⚠️', '客户不存在', e.message, '<button class="btn" data-act="go" data-href="#/customers">返回列表</button>')); return; }
  const tab = r.args[1] || 'overview';
  const tabs = [
    { k: 'overview', t: '概览' }, { k: 'cargo', t: '货物规格 (' + (c.cargos || []).length + ')' },
    { k: 'recommend', t: '方案推荐 (' + (c.recommendations || []).length + ')' },
    { k: 'quotes', t: '报价记录 (' + (c.quotes || []).length + ')' },
    { k: 'timeline', t: '跟进时间线' }
  ];
  const tabBar = '<div class="tabs-row">' + tabs.map(function (t) {
    return '<a class="tab' + (t.k === tab ? ' active' : '') + '" href="#/customer/' + encodeURIComponent(id) + '/' + t.k + '">' + esc(t.t) + '</a>';
  }).join('') + '</div>';

  const head = '<div class="cust-head">' +
      '<div class="ch-ava">' + esc((c.company || c.contact || '?').slice(0, 1).toUpperCase()) + '</div>' +
      '<div class="ch-main"><h1>' + esc(c.company || '（未填公司）') + '</h1>' +
        '<div class="ch-meta">' + statusPill(c.status) + levelTag(c.level) + tag(c.source || '其他') +
        (c.tags || []).map(function (t) { return tag(t, 'soft'); }).join('') + '</div>' +
        '<div class="ch-info">' + esc(c.contact || '—') + (c.phone ? ' · ' + esc(c.phone) : '') + (c.email ? ' · ' + esc(c.email) : '') + (c.wechat ? ' · 微信 ' + esc(c.wechat) : '') + '</div>' +
        '<div class="ch-info">' + esc(c.address || '（未填地址）') + '　' + esc(c.state || '') + ' ' + esc(c.postcode || '') + ' ' + esc(c.suburb || '') + '</div>' +
      '</div>' +
      '<div class="ch-right">' + progressRing(c.completeness, 72) + '<div class="ch-ring-l">档案完整度</div></div>' +
    '</div>';

  const tools = '<div class="cust-tools">' +
    '<button class="btn primary" data-act="flow-continue" data-id="' + c.id + '">▶ 继续引导流程</button>' +
    '<button class="btn ghost" data-act="edit" data-id="' + c.id + '">✎ 编辑资料</button>' +
    '<button class="btn ghost" data-act="pdf-one" data-id="' + c.id + '">📄 导出本客户 PDF</button>' +
    '<button class="btn ghost" data-act="cargo-new" data-id="' + c.id + '">📦 录入货物</button>' +
    '<button class="btn ghost" data-act="quote-new" data-id="' + c.id + '">💰 生成报价</button>' +
    '<button class="btn ghost danger" data-act="del" data-id="' + c.id + '">删除</button></div>';

  let body = '';
  if (tab === 'overview') body = overviewTab(c);
  else if (tab === 'cargo') body = cargoTab(c);
  else if (tab === 'recommend') body = recommendTab(c);
  else if (tab === 'quotes') body = quotesTab(c);
  else body = timelineTab(c);

  setMain(crumbs([{ t: '客户管理', href: '#/customers' }, { t: c.company || c.id }]) + head + tools + tabBar + body);
};

function overviewTab(c) {
  const s = CRM.customerStats(c);
  const info = [
    ['客户编号', c.id], ['公司名称', c.company], ['联系人', c.contact], ['电话', c.phone], ['邮箱', c.email], ['微信', c.wechat],
    ['国家', c.country || 'Australia'], ['州 / 领地', c.state], ['邮编', c.postcode], ['城区', c.suburb], ['详细地址', c.address],
    ['客户等级', c.level], ['来源', c.source], ['状态', statusZh(c.status)], ['建档时间', fmtDateTime(c.createdAt)], ['最近更新', fmtDateTime(c.updatedAt)]
  ];
  const infoHtml = '<div class="info-grid">' + info.map(function (x) {
    return '<div class="info-cell"><span class="ic-k">' + esc(x[0]) + '</span><span class="ic-v">' + esc(x[1] || '—') + '</span></div>';
  }).join('') + '</div>';
  const stats = '<div class="kpi-row tight">' +
    kpi('货物规格', fmtInt(s.cargoCount) + ' <small>份</small>', '共 ' + fmtInt(s.totalQty) + ' 件', '', '📦') +
    kpi('总体积', fmtNum(s.totalCbm, 2) + ' <small>CBM</small>', '柜型 ' + (s.containerType || '待定'), 'tone-blue', '📐') +
    kpi('总毛重', fmtNum(s.totalWeight / 1000, 2) + ' <small>t</small>', fmtInt(s.totalWeight) + ' KG', '', '⚖️') +
    kpi('最近报价', s.lastQuoteAmount ? fmtMoney(s.lastQuoteAmount, s.lastQuoteCur) : '未报价', s.lastQuoteNo || ('报价 ' + s.quoteCount + ' 份'), 'tone-gold', '💰') +
  '</div>';
  const notes = c.notes ? '<div class="note-box">' + esc(c.notes) + '</div>' : '<div class="muted-note">暂无备注</div>';
  return stats + '<div class="grid-2">' + card('客户资料', '录入于 ' + fmtDate(c.createdAt), infoHtml) +
    card('备注与需求', '记录客户关注的条款 / 时效 / 特殊要求', notes) + '</div>';
}

function cargoTab(c) {
  const list = (c.cargos || []).slice().reverse();
  if (!list.length) {
    return emptyState('📦', '还没有货物信息', '进入引导流程第 ② 步，用 3D 装柜模块录入客户给到的货物明细（支持 Excel 导入），保存后即可自动计算体积与柜型。',
      '<button class="btn primary" data-act="cargo-new" data-id="' + c.id + '">＋ 录入货物信息</button>');
  }
  return list.map(function (g) {
    const sm = g.summary || CRM.cargoSummary(g.items);
    const rows = (g.items || []).map(function (it, i) {
      const vol = num(it.qty) * num(it.L_cm) * num(it.W_cm) * num(it.H_cm) / 1e6;
      return '<tr><td class="c-idx">' + (i + 1) + '</td><td>' + esc(it.name || '—') + '</td><td class="num">' + fmtInt(it.qty) + '</td>' +
        '<td class="num">' + fmtInt(it.L_cm) + ' × ' + fmtInt(it.W_cm) + ' × ' + fmtInt(it.H_cm) + '</td>' +
        '<td class="num">' + fmtNum(it.weight_kg, 1) + '</td><td>' + esc(it.type || 'carton') + '</td>' +
        '<td class="num">' + fmtNum(vol, 3) + '</td><td class="num">' + fmtNum(vol * 0 + num(it.weight_kg) * num(it.qty), 1) + '</td>' +
        '<td>' + (num(it.unloadStop) > 1 ? '第 ' + num(it.unloadStop) + ' 站' : '—') + '</td></tr>';
    }).join('');
    return card(g.name || '货物规格', '录入时间 ' + fmtDateTime(g.createdAt) + ' · ' + (g.items || []).length + ' 个品项',
      '<div class="sum-strip">' +
        '<div class="ss"><b>' + fmtInt(sm.totalQty) + '</b><span>件数</span></div>' +
        '<div class="ss"><b>' + fmtNum(sm.totalCbm, 2) + '</b><span>CBM</span></div>' +
        '<div class="ss"><b>' + fmtNum(sm.totalWeight / 1000, 2) + '</b><span>吨</span></div>' +
        '<div class="ss"><b>' + esc(sm.containerType || '待定') + '</b><span>柜型</span></div>' +
        '<div class="ss"><b>' + (sm.utilization ? fmtNum(sm.utilization * 100, 1) + '%' : '—') + '</b><span>装载率</span></div>' +
      '</div>' +
      '<div class="table-wrap"><table class="tbl compact"><thead><tr><th>#</th><th>品名</th><th class="num">件数</th><th class="num">尺寸 L×W×H (cm)</th><th class="num">单重 kg</th><th>包装</th><th class="num">体积 CBM</th><th class="num">总重 kg</th><th>卸货站</th></tr></thead><tbody>' + rows + '</tbody></table></div>',
      '<button class="btn tiny" data-act="cargo-3d" data-id="' + c.id + '" data-cargo="' + g.id + '">在 3D 模块打开</button>');
  }).join('');
}

function recommendTab(c) {
  const list = (c.recommendations || []).slice().reverse();
  if (!list.length) {
    return emptyState('🧭', '还没有方案推荐', '完成货物录入后，系统会依据体积、重量、包装形态与澳洲收货地，自动推荐柜型、装柜策略与派送方案。',
      '<button class="btn primary" data-act="rec-new" data-id="' + c.id + '">⚡ 生成方案推荐</button>');
  }
  return list.map(function (r) {
    const res = r.result || {};
    const alt = (res.alternatives || []).map(function (a) {
      return '<div class="alt-cell' + (a.type === res.containerType ? ' best' : '') + (a.fit ? '' : ' bad') + '">' +
        '<div class="ac-t">' + a.type + (a.type === res.containerType ? ' ✅' : '') + '</div>' +
        '<div class="ac-v">' + a.count + ' 柜 · 装载率 ' + a.utilization + '%</div>' +
        '<div class="ac-d">' + esc(a.note || '') + (a.fit ? '' : '（超限）') + '</div>' +
        bar(a.utilization, a.utilization > 100 ? 'red' : a.utilization > 72 ? 'green' : 'amber') + '</div>';
    }).join('');
    const points = (res.loading || []).map(function (p) {
      return '<li class="pt ' + (p.level || 'info') + '"><b>' + esc(p.t) + '</b>' + esc(p.d) + '</li>';
    }).join('');
    const risks = (res.risks || []).map(function (p) {
      return '<li class="pt ' + (p.level || 'info') + '"><b>' + esc(p.t) + '</b>' + esc(p.d) + '</li>';
    }).join('');
    const route = (res.route || []).map(function (p) { return '<div class="route-row"><span class="rr-k">' + esc(p.t) + '</span><span class="rr-v">' + esc(p.d) + '</span></div>'; }).join('');
    return card('方案推荐 · ' + esc(res.headline || res.containerType || ''), '生成时间 ' + fmtDateTime(r.createdAt),
      '<div class="alt-strip">' + alt + '</div>' +
      '<div class="basis-strip">体积 ' + fmtNum((res.basis || {}).totalCbm, 2) + ' CBM · 毛重 ' + fmtNum(((res.basis || {}).totalWeight || 0) / 1000, 2) + ' t · 件数 ' + fmtInt((res.basis || {}).totalQty) + ' · 有效装载率 ' + ((res.basis || {}).utilization || 0) + '% · 载重利用率 ' + ((res.basis || {}).weightUtilization || 0) + '%<br><span class="muted">' + esc((res.basis || {}).efficiency || '') + '</span></div>' +
      '<div class="grid-2"><div><h4 class="blk-t">🚢 运输路线建议</h4>' + route + '</div>' +
      '<div><h4 class="blk-t">📦 装柜作业要点</h4><ul class="pt-list">' + points + '</ul></div></div>' +
      (risks ? '<h4 class="blk-t">⚠️ 风险提示</h4><ul class="pt-list">' + risks + '</ul>' : '') +
      '<div class="rec-foot">建议条款/方式：<b>' + esc((res.terms || {}).text || '') + '</b>' + (((res.terms || {}).flags || []).length ? ' · 标签：' + (res.terms.flags || []).map(function (x) { return tag(x, 'soft'); }).join('') : '') + '</div>',
      '<button class="btn tiny" data-act="quote-from-rec" data-id="' + c.id + '">按此方案报价 →</button>');
  }).join('');
}

function quotesTab(c) {
  const list = (c.quotes || []).slice().reverse();
  if (!list.length) {
    return emptyState('💰', '还没有报价记录', '在引导流程第 ④ 步进入整柜报价模块，系统会自动预填客户与货物信息，报价完成后一键回存快照。',
      '<button class="btn primary" data-act="quote-new" data-id="' + c.id + '">💰 生成整柜报价</button>');
  }
  return list.map(function (q) {
    const rows = (q.rows || []).map(function (x, i) {
      return '<tr><td class="c-idx">' + (i + 1) + '</td><td>' + esc(x.name || '') + '</td><td>' + esc(x.unit || '') + '</td>' +
        '<td class="num">' + fmtInt(x.qty || 1) + '</td><td class="num">' + fmtNum(x.unitPrice, 2) + '</td><td class="num">' + fmtNum(x.amount, 2) + '</td></tr>';
    }).join('');
    const t = q.totals || {};
    return card('报价单 ' + esc(q.no || '') + ' · ' + esc(q.ctn || '') + ' · ' + esc(q.cur || 'AUD'),
      fmtDateTime(q.createdAt) + ' · 条款 ' + esc(q.term || '') + ' / ' + esc(q.mode || '') + ' · 利润率档位 ' + fmtNum(num(q.tier) * 100, 1) + '%',
      '<div class="sum-strip">' +
        '<div class="ss"><b>' + fmtMoney(t.cost, q.cur) + '</b><span>成本</span></div>' +
        '<div class="ss"><b>' + fmtMoney(t.sell, q.cur) + '</b><span>报价</span></div>' +
        '<div class="ss"><b>' + fmtMoney(t.profit, q.cur) + '</b><span>毛利</span></div>' +
        '<div class="ss"><b>' + (num(t.cost) > 0 ? fmtNum(num(t.profit) / num(t.cost) * 100, 1) + '%' : '—') + '</b><span>毛利率</span></div>' +
      '</div>' +
      (rows ? '<div class="table-wrap"><table class="tbl compact"><thead><tr><th>#</th><th>费用项</th><th>单位</th><th class="num">数量</th><th class="num">单价</th><th class="num">金额</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="muted-note">未回存明细行</div>'),
      '<button class="btn tiny" data-act="quote-open" data-id="' + c.id + '" data-quote="' + q.id + '">在报价模块打开</button>');
  }).join('');
}

function timelineTab(c) {
  const list = (c.timeline || []).slice().reverse();
  const ico = { create: '🆕', update: '✎', cargo: '📦', recommend: '🧭', quote: '💰', export: '📄', backup: '🛡', note: '📝' };
  if (!list.length) return emptyState('🕒', '暂无跟进记录', '系统会自动记录建档、货物、方案、报价等关键动作。');
  return card('跟进时间线', '共 ' + list.length + ' 条记录',
    '<ul class="timeline">' + list.map(function (t) {
      return '<li class="tl-it"><span class="tl-ico">' + (ico[t.type] || '•') + '</span>' +
        '<div class="tl-main"><div class="tl-t">' + esc(t.text || '') + '</div><div class="tl-d">' + fmtDateTime(t.at) + ' · ' + relTime(t.at) + '</div></div></li>';
    }).join('') + '</ul>');
}

/* ============================== 备份中心 ============================== */
App.views.backup = async function () {
  await Data.loadBackups();
  const list = App.state.backups || [];
  const st = App.state.stats || {};
  const rows = list.map(function (b) {
    return '<tr><td>' + esc(b.file) + '</td><td>' + fmtDateTime(b.at) + '</td><td class="num">' + fmtNum(b.size / 1024, 1) + ' KB</td>' +
      '<td>' + esc(b.reason || 'auto') + '</td>' +
      '<td><button class="btn tiny" data-act="backup-restore" data-file="' + esc(b.file) + '">恢复</button>' +
      '<button class="btn tiny danger" data-act="backup-del" data-file="' + esc(b.file) + '">删除</button></td></tr>';
  }).join('');
  const off = App.state.offline;
  setMain(pageHead('备份中心', '数据安全三道防线：实时落盘 → 自动快照 → 一键导出',
      '<button class="btn primary" data-act="backup-now">💾 立即备份</button>') +
    (off ? Guide.tip('当前处于离线模式', '后端未连接，客户数据暂存在浏览器 localStorage，快照也在本地。启动服务（双击 <code>启动系统.cmd</code>）后数据会自动走服务端落盘。', 'warn') : '') +
    '<div class="kpi-row">' +
      kpi('数据文件', off ? '浏览器本地' : 'data/db.json', off ? '离线暂存' : fmtNum((st.dbSize || 0) / 1024, 1) + ' KB', '', '🗄') +
      kpi('备份快照', fmtInt(list.length) + ' <small>份</small>', '最多保留 80 份，自动滚动清理', 'tone-green', '🛡') +
      kpi('备份目录', off ? 'localStorage' : 'data/backups/', '每次写库 5 分钟内自动快照', '', '📁') +
      kpi('客户数据', fmtInt(st.customers || 0) + ' <small>个</small>', '货物 ' + fmtInt(st.cargoCount || 0) + ' 份 / 报价 ' + fmtInt(st.quoteCount || 0) + ' 份', 'tone-blue', '👥') +
    '</div>' +
    '<div class="grid-2">' +
      card('快照记录', '可随时回滚到任意历史版本（恢复前会自动再存一份当前数据）',
        list.length ? '<div class="table-wrap"><table class="tbl compact"><thead><tr><th>文件</th><th>时间</th><th class="num">大小</th><th>触发</th><th style="width:140px">操作</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : emptyState('🗂', '还没有备份', '点击「立即备份」创建第一份快照。')) +
      card('整库导入 / 导出', '换电脑、交接、留档都用这一个文件',
        '<div class="io-box">' +
          '<div class="io-row"><div><b>导出整库 JSON</b><div class="muted-note">包含全部客户、货物、方案、报价与设置</div></div><button class="btn primary" data-act="export-json">导出</button></div>' +
          '<div class="io-row"><div><b>导入整库 JSON</b><div class="muted-note">导入前会自动备份当前数据，可随时回滚</div></div><button class="btn ghost" data-act="import-json">选择文件</button></div>' +
          '<div class="io-row"><div><b>导出全部客户 PDF</b><div class="muted-note">一站式的客户档案合集，满版无留白</div></div><button class="btn ghost" data-act="go" data-href="#/export">去导出</button></div>' +
        '</div>' +
        '<h4 class="blk-t">🛡 备份策略说明</h4><ul class="pt-list">' +
        '<li class="pt info"><b>实时落盘：</b>每次新增/修改客户都会原子写入 data/db.json（先写临时文件再改名，避免断电损坏）。</li>' +
        '<li class="pt info"><b>自动快照：</b>距上次快照超过 5 分钟，或累计 25 次写库，自动生成一份带时间戳的快照。</li>' +
        '<li class="pt info"><b>删除留痕：</b>删除的客户会先存进 data/trash/，误删可人工找回。</li>' +
        '<li class="pt info"><b>离线兜底：</b>后端不可用时自动切换浏览器本地存储，功能不中断。</li>' +
        '</ul>'));
};

/* ============================== 导出中心 ============================== */
App.views.export = async function () {
  const cs = App.state.customers || [];
  const states = Array.from(new Set(cs.map(function (c) { return c.state; }).filter(Boolean))).sort();
  const preset = App.state.ui.exportPreset || { scope: 'all', status: '', state: '', withCargo: true, withRec: true, withQuote: true, withTimeline: false, cover: true, overview: true, detail: true, summary: true };
  App.state.ui.exportPreset = preset;
  const target = cs.filter(function (c) {
    if (preset.scope === 'status' && preset.status && c.status !== preset.status) return false;
    if (preset.scope === 'state' && preset.state && c.state !== preset.state) return false;
    return true;
  });
  const chk = function (k, label, desc) {
    return '<label class="switch-row"><input type="checkbox" data-exp="' + k + '"' + (preset[k] ? ' checked' : '') + '><span class="sw-t">' + label + '</span>' + (desc ? '<span class="sw-d">' + desc + '</span>' : '') + '</label>';
  };
  const est = target.length * (preset.detail ? 1 : 0) + (preset.cover ? 1 : 0) + (preset.summary ? 1 : 0) + Math.ceil((preset.overview ? target.length : 0) / 22) + 1;
  setMain(pageHead('导出中心', '把全部客户信息一次性导成满版 PDF（左右与底部零留白）',
      '<button class="btn ghost" data-act="go" data-href="#/backup">备份中心</button>') +
    Guide.tip('关于「不留白」', '打印文档使用 <code>@page{size:A4;margin:0}</code> 满版排版：每页宽 210mm、高 297mm，页眉色带与表格边框直达纸张左右边缘，页脚色带贴住纸张底边，左右与底部均无白边。', '') +
    '<div class="grid-2">' +
      card('导出范围', '共 ' + cs.length + ' 个客户，可导出 ' + target.length + ' 个',
        '<div class="seg-row">' +
          '<button class="seg' + (preset.scope === 'all' ? ' active' : '') + '" data-exp-scope="all">全部客户</button>' +
          '<button class="seg' + (preset.scope === 'status' ? ' active' : '') + '" data-exp-scope="status">按状态</button>' +
          '<button class="seg' + (preset.scope === 'state' ? ' active' : '') + '" data-exp-scope="state">按州</button>' +
        '</div>' +
        (preset.scope === 'status' ? '<select class="input" data-exp-sel="status"><option value="">全部状态</option>' + Object.keys(STATUS_MAP).map(function (k) { return '<option value="' + k + '"' + (preset.status === k ? ' selected' : '') + '>' + STATUS_MAP[k].zh + '</option>'; }).join('') + '</select>' : '') +
        (preset.scope === 'state' ? '<select class="input" data-exp-sel="state"><option value="">全部州</option>' + states.map(function (k) { return '<option value="' + esc(k) + '"' + (preset.state === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select>' : '') +
        '<h4 class="blk-t">📄 文档结构</h4>' +
        chk('cover', '封面页', '品牌、统计概览、生成时间') +
        chk('overview', '客户总览表', '一页表格列出全部客户关键信息') +
        chk('detail', '客户档案详页', '每个客户一页（含货物/方案/报价）') +
        chk('summary', '汇总统计页', '状态分布、目的州分布、体量合计') +
        '<h4 class="blk-t">📎 详页内容</h4>' +
        chk('withCargo', '货物明细', '品名 / 件数 / 尺寸 / 重量 / 体积') +
        chk('withRec', '方案推荐', '柜型建议 / 装柜要点 / 风险提示') +
        chk('withQuote', '报价明细', '费用行 + 成本/报价/毛利') +
        chk('withTimeline', '跟进时间线', '最近 8 条动作记录') +
        '<div class="est-box">预计 <b>' + target.length + '</b> 个客户 · 约 <b>' + est + '</b> 页 A4</div>') +
      card('一键导出', '两种方式，任选其一',
        '<div class="io-box">' +
          '<div class="io-row"><div><b>① 服务端一键导出 PDF</b><div class="muted-note">调用本机 Edge 无头渲染，直接下载 .pdf 文件（推荐，无需任何操作）</div></div><button class="btn primary" data-act="pdf-all-server">生成 PDF</button></div>' +
          '<div class="io-row"><div><b>② 浏览器打印 / 另存为 PDF</b><div class="muted-note">打开满版打印页，在打印对话框里选择「另存为 PDF」，边距选「无」</div></div><button class="btn ghost" data-act="pdf-all-print">打开打印页</button></div>' +
          '<div class="io-row"><div><b>③ 导出客户汇总表 CSV</b><div class="muted-note">Excel 可直接打开，便于二次统计</div></div><button class="btn ghost" data-act="export-csv">导出 CSV</button></div>' +
          '<div class="io-row"><div><b>④ 导出整库 JSON</b><div class="muted-note">完整数据备份（含全部明细）</div></div><button class="btn ghost" data-act="export-json">导出 JSON</button></div>' +
        '</div>' +
        '<div class="preview-box"><div class="pv-t">📐 满版排版预览</div>' +
        '<div class="pv-page"><div class="pv-head">澳洲 FCL 客户档案 · 满版页眉色带</div><div class="pv-body">客户信息 / 货物 / 方案 / 报价 表格（边框直达纸张边缘）</div><div class="pv-foot">页脚色带贴住纸张底边 · 无底部留白</div></div>' +
        '<div class="pv-note">左右边距 0mm · 底部边距 0mm · A4 210×297mm</div></div>'));
  $$('[data-exp]').forEach(function (i) {
    i.addEventListener('change', function () { preset[i.dataset.exp] = i.checked; App.views.export(); });
  });
  $$('[data-exp-scope]').forEach(function (b) {
    b.addEventListener('click', function () { preset.scope = b.dataset.expScope; App.views.export(); });
  });
  $$('[data-exp-sel]').forEach(function (s) {
    s.addEventListener('change', function () { preset[s.dataset.expSel] = s.value; App.views.export(); });
  });
};

/* ============================== 系统设置 ============================== */
App.views.settings = async function () {
  const s = App.state.settings || {};
  const f = function (label, id, val, hint) {
    return '<div class="form-row"><label>' + esc(label) + '</label><input id="' + id + '" class="input" value="' + esc(val || '') + '">' + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
  };
  const sel = function (label, id, val, opts) {
    return '<div class="form-row"><label>' + esc(label) + '</label><select id="' + id + '" class="input">' + opts.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select></div>';
  };
  const health = await (async function () { try { return await API.get('/api/health'); } catch (e) { return { offline: true }; } })();
  setMain(pageHead('系统设置', '全局默认值与运行环境',
      '<button class="btn primary" data-act="settings-save">保存设置</button>') +
    '<div class="grid-2">' +
      card('公司 / 报价默认值', '影响报价单抬头与默认条款',
        f('公司名称', 'setCompany', s.company) +
        f('报价单号前缀', 'setPrefix', s.quotePrefix, '例：GV-AU-20261015-001') +
        sel('默认贸易条款', 'setTerm', s.defaultTerm || 'EXW', [['EXW', 'EXW 工厂交货'], ['FOB', 'FOB 起运港交货'], ['CIF', 'CIF 到港交货']]) +
        sel('默认运输方式', 'setMode', s.defaultMode || 'd2d', [['d2d', '门到门 D2D'], ['d2p', '门到港 D2P'], ['p2d', '港到门 P2D'], ['p2p', '港到港 P2P']]) +
        sel('默认币种', 'setCur', s.currency || 'AUD', [['AUD', 'AUD 澳元'], ['USD', 'USD 美元'], ['RMB', 'RMB 人民币']]) +
        f('负责人', 'setOwner', s.owner)) +
      card('运行环境', '服务与数据',
        '<div class="info-grid one">' +
          '<div class="info-cell"><span class="ic-k">后端服务</span><span class="ic-v">' + (health.offline ? '未连接（离线模式）' : '已连接 · 端口 ' + (location.port || '8788')) + '</span></div>' +
          '<div class="info-cell"><span class="ic-k">数据文件</span><span class="ic-v">' + (health.offline ? 'localStorage（浏览器本地）' : esc(health.dataFile || 'data/db.json')) + '</span></div>' +
          '<div class="info-cell"><span class="ic-k">PDF 引擎</span><span class="ic-v">' + (health.pdfReady ? esc(health.pdfEngine) : '未检测到 Edge / Chrome（改用浏览器打印）') + '</span></div>' +
          '<div class="info-cell"><span class="ic-k">服务版本</span><span class="ic-v">' + esc(health.version || 'local') + '</span></div>' +
        '</div>' +
        '<div class="btn-row"><button class="btn ghost" data-act="recheck">重新检测连接</button>' +
        '<button class="btn ghost danger" data-act="demo-clear">清空全部客户数据</button></div>' +
        '<h4 class="blk-t">⚠️ 危险操作说明</h4><ul class="pt-list">' +
        '<li class="pt warn"><b>清空全部客户数据：</b>会先自动备份，再删除所有客户；可用备份中心回滚。</li>' +
        '<li class="pt info"><b>离线模式下</b>清空只影响浏览器本地数据。</li></ul>'));
};

/* ============================== 澳洲进口清关要求 ============================== */
App.views.clearance = async function (r) {
  const q0 = (r && r.args && r.args[0]) ? decodeURIComponent(r.args[0]) : '';
  const A = window.AUCL;
  const ups = (A && A.meta && A.meta.updates) || [];
  const upHtml = ups.length ? '<div class="cl-box" style="margin-bottom:14px"><div class="cl-hd">2025–2026 澳洲清关最新动态 <span class="cl-sub">来源：ABF / DAFF / AICIS 官方公告</span></div>' +
      ups.map(function (u) { return '<div class="cl-card"><div class="cl-h"><span class="cl-code">' + esc(u.d) + '</span><span class="cl-t" style="font-size:13px;font-weight:500">' + esc(u.zh) + '</span>' +
        '<a class="cl-more" href="' + esc(u.src) + '" target="_blank" rel="noopener">官方来源</a></div></div>'; }).join('') + '</div>' : '';
  setMain(pageHead('澳洲进口清关要求', (A ? A.meta.count + ' 个条目 / ' + (A.entries || []).reduce(function (s, e) { return s + (e.tagsZh || []).length; }, 0) + ' 个品名标签' : '') + ' · 完整嵌入原文 + 品名自动识别',
      '<button class="btn primary" data-act="cl-open">在新窗口打开完整指南</button>') +
    upHtml +
    card('品名自动识别', '输入中文或英文品名（箱单/唛头上的叫法即可），自动定位对应的澳洲进口清关要求',
      '<div class="form-row"><label>产品品名</label><input id="clQ" class="input" placeholder="例：实木餐桌 / 石英石台面 / Lithium battery / Bamboo furniture" value="' + esc(q0) + '"></div>' +
      '<div id="clHits"></div>') +
    card('完整清关指南（原文嵌入）', '与客户提供的源文件逐字一致，支持全文检索与中英切换',
      '<iframe id="clFrame" src="modules/clearance.html" style="width:100%;height:80vh;border:1px solid var(--line,#E5DDCB);border-radius:10px;background:#fff"></iframe>'));
  const inp = document.getElementById('clQ');
  const box = document.getElementById('clHits');
  const run = function () {
    if (!box) return;
    if (!A) { box.innerHTML = '<div class="cl-none">清关识别引擎未加载</div>'; return; }
    const val = inp ? String(inp.value || '').trim() : '';
    if (!val) { box.innerHTML = '<div class="cl-none">输入品名后自动显示对应清关要求；留空可浏览下方完整指南。</div>'; return; }
    const m = A.match(val, { limit: 5 });
    box.innerHTML = '<div class="cl-box"><div class="cl-hd">识别结果 <span class="cl-sub">命中 ' + m.length + ' 条</span></div>' + A.render(m, { lang: 'zh' }) + '</div>';
  };
  if (inp) inp.addEventListener('input', debounce(run, 240));
  run();
};

/* ============================== 箱唛工具（Pro 版嵌入） ============================== */
/* ============================== 派送计费 2-7（五港 + 塔州 自动路由） ============================== */
App.views.delivery = async function (r) {
  const initPc = (r && r.args && r.args[0]) ? String(decodeURIComponent(r.args[0])) : '';
  setMain(pageHead('FCL 整柜派送计费（2–7 邮编 · 全自动路由）', '输入澳洲邮编 → 系统自动判断走「五港（2-6 开头）」还是「塔州（7 开头）」计费器，并自动填入计算',
      '<button class="btn ghost" id="dvFull">⛶ 全屏打开当前</button>') +
    '<div class="panel" style="padding:14px 16px;margin-bottom:12px">' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
        '<span style="font-size:13px;font-weight:700;color:#0B2545">邮编</span>' +
        '<input id="dvPc" class="input" placeholder="如 7000 / 3175 / 2000" style="max-width:170px;height:42px">' +
        '<button class="btn primary" id="dvGo" style="height:42px;padding:0 20px">⚡ 自动计费</button>' +
        '<span id="dvHint" style="font-size:12.5px;color:#9C9486"></span></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
        '<button class="btn dv-tab" data-tab="main" style="font-weight:700">🚢 五港计费（2–6 邮编）</button>' +
        '<button class="btn dv-tab" data-tab="tas">🇹🇿 塔州计费（7 邮编）</button></div>' +
      '<div id="dvTip" style="margin-top:10px;font-size:12px;color:#6E675B"></div></div>' +
    '<div id="dvMain" style="display:none"><iframe id="dvFrameMain" data-src="modules/mainland-delivery.html" style="width:100%;height:calc(100vh - 300px);min-height:740px;border:1px solid #DCE3ED;border-radius:12px;background:#fff"></iframe></div>' +
    '<div id="dvTas" style="display:none"><iframe id="dvFrameTas" data-src="modules/tas-delivery.html" style="width:100%;height:calc(100vh - 300px);min-height:740px;border:1px solid #DCE3ED;border-radius:12px;background:#fff"></iframe></div>');
  const $ = (id) => document.getElementById(id);
  let cur = 'main';
  function say(t, k) { const h = $('dvHint'); if (h) { h.textContent = t || ''; h.style.color = k === 'ok' ? '#1B7F4B' : (k === 'err' ? '#B3261E' : '#9C9486'); } }
  function show(tab) {
    cur = tab;
    $('dvMain').style.display = tab === 'main' ? '' : 'none';
    $('dvTas').style.display = tab === 'tas' ? '' : 'none';
    document.querySelectorAll('.dv-tab').forEach(function (b) {
      const on = b.getAttribute('data-tab') === tab;
      b.style.background = on ? '#0B2545' : '';
      b.style.color = on ? '#fff' : '';
    });
    const f = tab === 'main' ? $('dvFrameMain') : $('dvFrameTas');
    if (f && !f.src) f.src = f.getAttribute('data-src');
    $('dvTip').textContent = tab === 'main'
      ? '五港计费器：2–6 开头的澳洲大陆邮编，按港口 / 距离 / 分区费率计算整柜派送。'
      : '塔州计费器：7 开头邮编（7000–7999），按 Hobart / Bell Bay / Devonport / Burnie 四港距离 + 分区费率 + 岛上附加计算。';
  }
  function fillAndCalc(pc) {
    const f = cur === 'main' ? $('dvFrameMain') : $('dvFrameTas');
    if (!f) return false;
    try {
      const d = f.contentDocument;
      if (!d) return false;
      /* 五港：输入框 #f-pc + 按钮 #btn-calc；塔州：尝试常见选择器 */
      const cands = ['#f-pc', '#pc', '#postcode', '#f_postcode', 'input[name=pc]', 'input[type=text]'];
      let inp = null;
      for (const sel of cands) { const el = d.querySelector(sel); if (el && el.tagName === 'INPUT') { inp = el; break; } }
      if (!inp) return false;
      inp.value = pc;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      const btns = ['#btn-calc', 'button[type=submit]', '#btnCalc'];
      for (const sel of btns) { const b = d.querySelector(sel); if (b) { b.click(); return true; } }
      return true;
    } catch (e) { return false; }
  }
  function route(pc) {
    pc = String(pc || '').replace(/\D/g, '');
    if (pc.length < 3) { say('请输入 3-4 位澳洲邮编', 'err'); return; }
    const tab = pc.charAt(0) === '7' ? 'tas' : 'main';
    show(tab);
    const label = tab === 'tas' ? '塔州（7 开头）' : '澳洲大陆（2–6 开头）';
    say('已按邮编 ' + pc + ' 路由到「' + label + '」计费器', 'ok');
    /* 等 iframe 就绪后自动填算 */
    let tries = 0;
    const t = setInterval(function () {
      tries++;
      if (fillAndCalc(pc)) { clearInterval(t); say('已自动填入邮编 ' + pc + ' 并触发计算', 'ok'); }
      else if (tries > 20) { clearInterval(t); say('已切换到对应计费器，请在页面内输入邮编 ' + pc, ''); }
    }, 400);
  }
  $('dvGo').onclick = function () { route($('dvPc').value); };
  $('dvPc').addEventListener('keydown', function (e) { if (e.key === 'Enter') route($('dvPc').value); });
  document.querySelectorAll('.dv-tab').forEach(function (b) { b.onclick = function () { show(b.getAttribute('data-tab')); }; });
  $('dvFull').onclick = function () { window.open(cur === 'main' ? 'modules/mainland-delivery.html' : 'modules/tas-delivery.html', '_blank'); };
  show('main');
  if (initPc) { $('dvPc').value = initPc; setTimeout(function () { route(initPc); }, 600); }
};
/* ============================== 塔州（7xxx）FCL 派送计费 ============================== */
App.views.tas = async function (r) {
  const pc = (r && r.args && r.args[0]) ? decodeURIComponent(r.args[0]) : '';
  setMain(pageHead('塔州 FCL 整柜派送计费（7xxx）', '邮编 7000-7999 塔斯马尼亚全境：港口 → 距离 → 分区费率 → 派送成本（可导出/打印报价单）',
      '<button class="btn ghost" id="tasFull">⛶ 全屏打开</button>') +
    '<div class="panel" style="padding:12px 16px;margin-bottom:12px;font-size:12.5px;color:#6E675B;line-height:1.8">' +
      '<b>说明：</b>本页是塔州（邮编 7 开头）的整柜派送独立计费器，含 120 个塔州邮编、4 个港口（Hobart / Bell Bay / Devonport / Burnie）距离与分区费率、超区与岛上附加、可改费率后保存/导出。</div>' +
    '<iframe id="tasFrame" src="modules/tas-delivery.html' + (pc ? ('?pc=' + encodeURIComponent(pc)) : '') + '" style="width:100%;height:calc(100vh - 232px);min-height:760px;border:1px solid #DCE3ED;border-radius:12px;background:#fff"></iframe>');
  const $ = (id) => document.getElementById(id);
  $('tasFull').onclick = function () { window.open('modules/tas-delivery.html' + (pc ? ('?pc=' + encodeURIComponent(pc)) : ''), '_blank'); };
};
/* ============================== 澳洲整柜 FCL 发票 ============================== */
App.views.invoice = async function (r) {
  const custId = (r && r.args && r.args[0]) ? r.args[0] : '';
  setMain(pageHead('澳洲整柜 FCL 商业发票', '选客户 → 自动把公司/联系人/地址/ABN/邮箱/电话/柜型/港口 填进发票系统（填完仍可改），再打印或导出 PDF',
      '<button class="btn ghost" id="ivFull">⛶ 全屏打开</button>') +
    '<div class="panel" style="padding:12px 16px;margin-bottom:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<span style="font-size:13px;color:#6E675B">客户：</span><select id="ivCust" class="input" style="max-width:340px"><option value="">加载中…</option></select>' +
      '<button class="btn primary" id="ivFill">同步客户信息 → 发票</button>' +
      '<span id="ivHint" style="font-size:12.5px;color:#9C9486"></span></div>' +
    '<iframe id="ivFrame" src="modules/invoice.html" style="width:100%;height:calc(100vh - 232px);min-height:760px;border:1px solid #DCE3ED;border-radius:12px;background:#fff"></iframe>');
  const $ = (id) => document.getElementById(id);
  const frame = $('ivFrame');
  let ready = false, list = [];
  function say(t, k) { const h = $('ivHint'); if (h) { h.textContent = t || ''; h.style.color = k === 'ok' ? '#1B7F4B' : (k === 'err' ? '#B3261E' : '#9C9486'); } }
  function post(type, payload) { try { frame.contentWindow.postMessage({ ch: 'aufcl-crm', type: type, payload: payload || {} }, '*'); return true; } catch (e) { return false; } }
  $('ivFull').onclick = function () { window.open('modules/invoice.html', '_blank'); };
  (async function () {
    try {
      const res = await API.get('/api/customers');
      list = (res && (res.list || res.customers || res.items)) || [];
      $('ivCust').innerHTML = '<option value="">请选择客户…</option>' + list.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (c.id === custId ? ' selected' : '') + '>' + esc(c.company || c.name || c.id) + '</option>';
      }).join('');
      if (custId) setTimeout(function () { $('ivFill').click(); }, 600);
    } catch (e) { $('ivCust').innerHTML = '<option value="">读取客户失败</option>'; }
  })();
  $('ivFill').onclick = async function () {
    const id = $('ivCust').value;
    if (!id) { say('请先选择客户', 'err'); return; }
    if (!ready) { say('发票系统还在加载，请稍等 1 秒再点', 'err'); return; }
    say('读取客户档案…');
    try {
      const res = await API.get('/api/customers/' + encodeURIComponent(id));
      const c = (res && (res.customer || res.data || res.item)) || res || {};
      const addrParts = [c.address, [c.suburb, c.state, c.postcode].filter(Boolean).join(' '), c.country].filter(Boolean);
      const cargos = c.cargos || [];
      let ctn = c.containerType || '';
      if (!ctn && cargos.length) { for (const cg of cargos) { if (cg.summary && cg.summary.containerType) { ctn = cg.summary.containerType; break; } } }
      const recs = c.recommendations || [];
      if (!ctn && recs.length) { const last = recs[recs.length - 1]; if (last.result && last.result.containerType) ctn = last.result.containerType; }
      const quotes = c.quotes || [];
      const lastQuote = quotes.length ? quotes[quotes.length - 1] : null;
      const info = (lastQuote && lastQuote.info) || {};
      const payload = {
        company: c.company || c.name || '',
        attn: c.contact || '',
        address: addrParts.join(', '),
        abn: c.abn || c.taxId || '',
        ref: c.poNo || c.ref || '',
        email: c.email || '',
        phone: c.phone || '',
        ctn: ctn || '',
        pol: info.pol || 'Shenzhen / Guangzhou, China',
        pod: info.pod || (c.suburb ? c.suburb + ', ' + (c.state || '') : 'Melbourne, Australia'),
        incoterms: info.term || 'CIF',
        booking: info.booking || ''
      };
      const ok = post('fillCustomer', { customer: payload });
      say(ok ? ('✅ 已同步：' + payload.company + ' · ' + (payload.ctn || '柜型未定') + '（可在发票里直接修改）') : '同步失败', ok ? 'ok' : 'err');
    } catch (e) { say('同步失败：' + e.message, 'err'); }
  };
  window.addEventListener('message', function (e) {
    const d = e.data;
    if (!d || d.ch !== 'aufcl-module') return;
    if (d.type === 'ready') { ready = true; say('发票系统已就绪，选客户后点「同步客户信息」', 'ok'); }
    else if (d.type === 'filled') { say('✅ 已填入 ' + ((d.payload && d.payload.count) || 0) + ' 个字段，可直接修改后打印', 'ok'); }
  });
};
/* ============================== 🔐 动态密码 ============================== */
App.views.dynpass = async function () {
  const esc2 = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  setMain(pageHead('🔐 动态密码', '登录密码每天 00:00 自动更换；这里可以查看今日密码、未来 7 天密码、复制、下载离线生成器',
      '<button class="btn ghost" id="dpRefresh">↻ 刷新</button>') +
    '<div class="panel" style="padding:18px 20px;margin-bottom:14px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">' +
        '<div style="font-size:15px;font-weight:700;color:#191713">今日动态密码 <span id="dpMode" style="font-size:11.5px;font-weight:400;color:#9C9486"></span></div>' +
        '<div style="display:flex;gap:8px"><button class="btn primary" id="dpReveal">👁 显示密码（需主密码）</button></div>' +
      '</div>' +
      '<div id="dpBox" style="display:none;margin-top:14px">' +
        '<div id="dpCode" style="font-size:46px;font-weight:800;letter-spacing:10px;color:#0B2545;text-align:center;padding:16px 0 6px;font-family:Consolas,monospace">------</div>' +
        '<div id="dpDate" style="text-align:center;font-size:12.5px;color:#9C9486;margin-bottom:12px"></div>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
          '<button class="btn ghost" id="dpCopy">📋 复制今日密码</button>' +
          '<button class="btn ghost" id="dpDl">⬇ 下载离线生成器（HTML）</button></div>' +
        '<div id="dpTable" style="margin-top:16px"></div>' +
      '</div>' +
      '<div id="dpHint" style="margin-top:10px;font-size:12.5px;color:#9C9486;line-height:1.8">' +
        '登录页：账号 <b>RAYMOND</b> · 密码填上面今日密码 · 验证码 <b>RAYMOND</b>。' +
        '<br>应急主密码：固定不变，可在设置里查看/修改。' +
      '</div>' +
    '</div>' +
    '<div class="panel" style="padding:16px 20px">' +
      '<div style="font-size:14.5px;font-weight:700;margin-bottom:8px">要不要换私钥？</div>' +
      '<div style="font-size:12.5px;color:#6E675B;line-height:1.85">私钥决定每天的密码序列。换了私钥，从当天起所有旧密码全部作废，只有用新私钥生成的生成器才能算出新密码。' +
      '<br>换法：改 <code>public/js/auth-config.mjs</code> 里的 dynSecret（明文）或 dynSecretEnc（密文）+ 生成器里的私钥，保持两边一致。</div>' +
    '</div>');
  const $ = (id) => document.getElementById(id);
  let shown = false;
  function say(t, k) { const h = $('dpHint'); if (h) { h.style.color = k === 'err' ? '#B3261E' : '#9C9486'; } }
  async function getPass() {
    /* 服务端模式：优先用服务端计算（本地版） */
    try {
      const r = await fetch('api/auth/dynpass', { credentials: 'same-origin' });
      if (r.ok) { const j = await r.json(); if (j && j.ok && j.code) { $('dpMode').textContent = '（服务端计算 · 私钥不出服务器）'; return j; } }
    } catch (e) {}
    /* 静态模式：浏览器端计算 */
    try {
      if (window.Auth && Auth.codesOf) {
        $('dpMode').textContent = '（浏览器端计算）';
        const list = [];
        for (let off = -1; off <= 7; off++) list.push({ date: '', code: Auth.codesOf(off), off: off });
        return { ok: true, code: Auth.codesOf(0), list: list, mode: 'client' };
      }
    } catch (e) {}
    return null;
  }
  function reveal(data) {
    $('dpBox').style.display = '';
    $('dpCode').textContent = data.code;
    const d = new Date();
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    $('dpDate').textContent = '今天 ' + ds + ' · 明天 00:00 自动更换';
    const labels = ['昨天（容错）', '今天', '明天（容错）'];
    const rows = (data.list || []).map((x) => {
      const off = Number(x.off);
      let label = '';
      if (off >= -1 && off <= 1) label = labels[off + 1];
      else label = off + ' 天后';
      const dateTxt = x.date ? (x.date.slice(0, 4) + '-' + x.date.slice(4, 6) + '-' + x.date.slice(6)) : (off === 0 ? '今天' : '');
      const hl = off === 0 ? 'background:#FFF6E9;font-weight:800' : '';
      return '<tr style="' + hl + '"><td style="padding:8px 10px;border-bottom:1px solid #EDE6D8">' + esc2(dateTxt || label) + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #EDE6D8;font-family:Consolas,monospace;font-weight:700;letter-spacing:3px;color:#0B2545">' + esc2(x.code) + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #EDE6D8;color:#6E675B;font-size:12.5px">' + esc2(label) + '</td></tr>';
    }).join('');
    $('dpTable').innerHTML = '<div style="font-size:13px;font-weight:700;margin-bottom:6px">未来 7 天密码</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#F7F3E9">' +
      '<th style="text-align:left;padding:8px 10px">日期</th><th style="text-align:left;padding:8px 10px">动态密码</th><th style="text-align:left;padding:8px 10px">说明</th></tr></thead><tbody>' + rows + '</tbody></table>';
    shown = true;
  }
  $('dpReveal').onclick = async function () {
    const master = String(prompt('请输入主密码（应急主密码 / masterPass）后显示今日动态密码：') || '').trim();
    if (!master) return;
    const cfg = window.CRM_AUTH || {};
    const expect = String(cfg.masterPass || cfg.pass || 'RAYMOND').toUpperCase();
    if (master.toUpperCase() !== expect) { alert('主密码不正确'); return; }
    const data = await getPass();
    if (!data) { alert('无法获取动态密码（服务端与前端算法都不可用）'); return; }
    reveal(data);
  };
  $('dpRefresh').onclick = async function () { if (shown) { const d = await getPass(); if (d) reveal(d); } };
  const copyBtn = () => $('dpCopy');
  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'dpCopy') {
      const t = $('dpCode').textContent;
      try { navigator.clipboard.writeText(t); } catch (err) { const i = document.createElement('input'); i.value = t; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); }
      e.target.textContent = '已复制 ✓'; setTimeout(() => { e.target.textContent = '📋 复制今日密码'; }, 1500);
    }
    if (e.target && e.target.id === 'dpDl') {
      const secret = (window.Auth && Auth._dynSecret) ? Auth._dynSecret() : '';
      const html = buildGenerator(secret);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '动态密码生成器.html';
      document.body.appendChild(a); a.click(); a.remove();
    }
  });
  function buildGenerator(secret) {
    const S = JSON.stringify(secret || '');
    return '<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>动态密码生成器</title>' +
      '<style>body{margin:0;font-family:"Microsoft YaHei",system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:26px}' +
      'h1{font-size:19px;margin:0 0 14px}.card{background:#1e293b;border-radius:14px;padding:18px 20px;margin-bottom:14px;border:1px solid #334155}' +
      '.today{font-size:42px;font-weight:800;letter-spacing:8px;color:#fbbf24;text-align:center;padding:14px 0;font-family:Consolas,monospace}' +
      'table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:8px 10px;border-bottom:1px solid #334155;text-align:left}' +
      'th{color:#94a3b8;font-size:12px}td.c{font-family:Consolas,monospace;font-weight:700;letter-spacing:3px;color:#7dd3fc}' +
      'tr.now td{background:rgba(251,191,36,.12);color:#fbbf24}button{background:#2563eb;color:#fff;border:0;padding:9px 16px;border-radius:9px;cursor:pointer;font-weight:700}' +
      '.sub{color:#94a3b8;font-size:12.5px}</style></head><body>' +
      '<h1>澳洲FCL · 每日动态密码生成器</h1><p class="sub">离线可用 · 不上传任何数据</p>' +
      '<div class="card"><div class="today" id="t">------</div><div id="i" class="sub" style="text-align:center"></div></div>' +
      '<div class="card"><table><thead><tr><th>日期</th><th>动态密码</th><th>说明</th></tr></thead><tbody id="rows"></tbody></table></div>' +
      '<div class="card"><button id="cp">复制今日密码</button></div>' +
      '<script>var SEC=' + S + ';var AB="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";' +
      'function h(s){var x=2166136261>>>0;for(var i=0;i<s.length;i++){x^=s.charCodeAt(i);x=Math.imul(x,16777619)>>>0}return x>>>0}' +
      'function c(d,s,l){l=l||8;var z=(h(s+"|GV-DAY|"+d)^(h(d+"|SALT|"+s)>>>0))>>>0,o="";for(var i=0;i<l;i++){z^=(z<<13)>>>0;z>>>=0;z^=(z>>>17);z>>>=0;z^=(z<<5)>>>0;z>>>=0;o+=AB.charAt(z%AB.length)}return o}' +
      'function day(n){var d=new Date(Date.now()+n*86400000);return ""+d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0")}' +
      'function r(){var t=c(day(0),SEC,8);document.getElementById("t").textContent=t;var d=new Date();document.getElementById("i").textContent="今天 "+d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")+" · 明天 00:00 更换";var H="";for(var o=-1;o<=7;o++){var ds=day(o);H+="<tr"+(o===0?" class=now":"")+"><td>"+ds.slice(0,4)+"-"+ds.slice(4,6)+"-"+ds.slice(6)+"</td><td class=c>"+c(ds,SEC,8)+"</td><td>"+(o===0?"今天":(o===-1?"昨天":(o===1?"明天":o+" 天后")))+"</td></tr>"}document.getElementById("rows").innerHTML=H}' +
      'document.getElementById("cp").onclick=function(){var t=document.getElementById("t").textContent;try{navigator.clipboard.writeText(t)}catch(e){var i=document.createElement("input");i.value=t;document.body.appendChild(i);i.select();document.execCommand("copy");i.remove()}this.textContent="已复制 ✓";var b=this;setTimeout(function(){b.textContent="复制今日密码"},1500)};r();<\/script></body></html>';
  }
};
/* ============================== 供应商与文件备份 ============================== */
App.views.files = async function (r) {
  const custId = (r && r.args && r.args[0]) ? r.args[0] : '';
  setMain(pageHead('供应商与文件备份', '每个客户可挂多个供应商信息 + 任意文件（合同/发票/箱单/证书）上传备份，随客户档案一起保存',
      '<button class="btn ghost" id="fbRefresh">↻ 刷新</button>') +
    '<div class="panel" style="padding:12px 16px;margin-bottom:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<span style="font-size:12.5px;color:#6E675B">客户：</span><select id="fbCust" class="input" style="max-width:360px"><option value="">加载中…</option></select>' +
      '<span id="fbHint" style="font-size:12px;color:#9C9486"></span></div>' +
    '<div id="fbBody"></div>');
  const $ = (id) => document.getElementById(id);
  function say(t, k) { const h = $('fbHint'); if (h) { h.textContent = t || ''; h.style.color = k === 'ok' ? '#1B7F4B' : (k === 'err' ? '#B3261E' : '#9C9486'); } }
  let cur = null;
  async function loadCust() {
    const res = await API.get('/api/customers');
    const list = (res && (res.list || res.customers || res.items)) || [];
    $('fbCust').innerHTML = '<option value="">请选择客户…</option>' + list.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === custId ? ' selected' : '') + '>' + esc(c.company || c.name || c.id) + '</option>';
    }).join('');
    if (custId) $('fbCust').value = custId;
    if ($('fbCust').value) loadOne($('fbCust').value);
  }
  async function loadOne(id) {
    try {
      const res = await API.get('/api/customers/' + encodeURIComponent(id));
      cur = (res && (res.customer || res.data || res.item)) || res || {};
      render();
    } catch (e) { say('读取失败：' + e.message, 'err'); }
  }
  function render() {
    if (!cur) { $('fbBody').innerHTML = ''; return; }
    const sup = cur.suppliers || [];
    const files = cur.files || [];
    $('fbBody').innerHTML =
      '<div class="panel" style="padding:16px 18px;margin-bottom:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div style="font-size:14px;font-weight:700;color:#191713">供应商备份（' + sup.length + ' 个）</div>' +
        '<button class="btn primary" id="fbAddSup">＋ 添加供应商</button></div>' +
        (sup.length ? sup.map(function (x, i) { return '<div style="border:1px solid #E5DDCB;border-radius:8px;padding:10px 12px;margin-top:8px">' +
          '<div style="font-size:13.5px;font-weight:700">' + esc(x.name || '未命名供应商') + (x.type ? ' · ' + esc(x.type) : '') + '</div>' +
          '<div style="font-size:12.5px;color:#6E675B;margin-top:3px">' + [x.contact ? '联系人 ' + x.contact : '', x.phone ? '电话 ' + x.phone : '', x.email ? '邮箱 ' + x.email : '', x.address ? '地址 ' + x.address : ''].filter(Boolean).map(esc).join(' · ') + '</div>' +
          (x.note ? '<div style="font-size:12.5px;color:#A87428;margin-top:3px">备注：' + esc(x.note) + '</div>' : '') +
          '<div style="margin-top:6px"><button class="btn ghost tiny" data-del-sup="' + i + '">删除</button></div></div>'; }).join('') : '<div style="font-size:12.5px;color:#9C9486;margin-top:8px">暂无供应商，点右上「＋ 添加供应商」</div>') +
      '</div>' +
      '<div class="panel" style="padding:16px 18px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div style="font-size:14px;font-weight:700;color:#191713">文件备份（' + files.length + ' 个）</div>' +
        '<label class="btn primary" style="cursor:pointer">＋ 上传文件<input id="fbUpload" type="file" multiple style="display:none"></label></div>' +
        '<div style="font-size:11.5px;color:#9C9486;margin-top:6px">支持任意格式（PDF / Word / Excel / 图片 / 压缩包），单个 ≤ 8MB；存到本机 data/uploads/ 下，随客户档案保存。</div>' +
        (files.length ? '<div style="margin-top:8px">' + files.map(function (f2) { return '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid #E5DDCB;border-radius:8px;padding:8px 11px;margin-bottom:6px;font-size:12.5px">' +
          '<span style="flex:1;min-width:0"><b>' + esc(f2.name) + '</b> <span style="color:#9C9486">' + ((f2.size || 0) / 1024).toFixed(0) + 'KB · ' + esc((f2.at || '').slice(0, 16)) + '</span></span>' +
          '<a class="btn ghost tiny" href="api/customers/' + encodeURIComponent(cur.id) + '/files/' + encodeURIComponent(f2.id) + '" target="_blank">下载</a>' +
          '<button class="btn ghost tiny" data-del-file="' + esc(f2.id) + '">删除</button></div>'; }).join('') + '</div>' : '<div style="font-size:12.5px;color:#9C9486;margin-top:8px">暂无文件</div>') +
      '</div>';
    const b1 = $('fbAddSup');
    if (b1) b1.onclick = async function () {
      const name = prompt('供应商名称：'); if (!name) return;
      const contact = prompt('联系人（可空）：') || '';
      const phone = prompt('电话（可空）：') || '';
      const type = prompt('类型（如 工厂/贸易商/仓库，可空）：') || '';
      const note = prompt('备注（可空）：') || '';
      cur.suppliers = (cur.suppliers || []).concat([{ name: name, contact: contact, phone: phone, type: type, note: note, at: Date.now() }]);
      try { await API.put('/api/customers/' + encodeURIComponent(cur.id), cur); say('✅ 供应商已保存', 'ok'); loadOne(cur.id); } catch (e) { say('保存失败：' + e.message, 'err'); }
    };
    $('fbBody').querySelectorAll('[data-del-sup]').forEach(function (b) {
      b.onclick = async function () {
        const i = Number(b.getAttribute('data-del-sup'));
        if (!confirm('删除这个供应商？')) return;
        cur.suppliers.splice(i, 1);
        try { await API.put('/api/customers/' + encodeURIComponent(cur.id), cur); say('已删除', 'ok'); loadOne(cur.id); } catch (e) { say('删除失败：' + e.message, 'err'); }
      };
    });
    const up = $('fbUpload');
    if (up) up.onchange = async function () {
      const fs2 = [].slice.call(up.files || []);
      for (const f3 of fs2) {
        if (f3.size > 8 * 1024 * 1024) { say('文件过大：' + f3.name, 'err'); continue; }
        say('上传中：' + f3.name);
        const b64 = await new Promise(function (res) { const fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1] || ''); }; fr.readAsDataURL(f3); });
        try {
          await API.post('/api/customers/' + encodeURIComponent(cur.id) + '/files', { name: f3.name, type: f3.type, data: b64 });
          say('✅ 已上传 ' + f3.name, 'ok');
        } catch (e) { say('上传失败：' + e.message, 'err'); }
      }
      loadOne(cur.id);
    };
    $('fbBody').querySelectorAll('[data-del-file]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('删除这个文件？')) return;
        try { await fetch('api/customers/' + encodeURIComponent(cur.id) + '/files/' + encodeURIComponent(b.getAttribute('data-del-file')), { method: 'DELETE', credentials: 'same-origin' }); say('已删除', 'ok'); loadOne(cur.id); } catch (e) { say('删除失败：' + e.message, 'err'); }
      };
    });
  }
  $('fbCust').onchange = function () { if (this.value) loadOne(this.value); };
  $('fbRefresh').onclick = function () { if ($('fbCust').value) loadOne($('fbCust').value); };
  loadCust();
};
/* ============================== 澳洲文件模板 ============================== */
App.views.templates = async function () {
  const MAN = [
    { f: 'GlobalVertical-Booking.xls', t: '订舱单 Booking Form', tag: 'Excel', d: '船公司订舱：发货人 / 收货人 / 柜型 / 品名 / 重量 / 船期，填好回传即可订舱。' },
    { f: 'VGM-Template.xls', t: 'VGM 重量申报模板', tag: 'Excel', d: '船代 VGM 申报：柜号 / 铅封 / 货物净重 + 柜重 = 总重，截关前提交。' },
    { f: 'Customs-Declaration-Template.xlsx', t: '报关资料 & 出口正报模板', tag: 'Excel', d: '出口报关全套：发票 / 装箱单 / 报关要素，含正报格式。' },
    { f: 'FCL-Packing-Declaration.docx', t: 'FCL 装箱声明 Packing Declaration', tag: 'Word', d: '澳洲进口用：声明无违禁品 / 无土壤 / 木质包装已处理，随提单与清关文件提交。' },
    { f: 'Wooden-Storage-Declaration.docx', t: '木质包装声明 Wooden Packing Declaration', tag: 'Word', d: '含木托 / 木箱货物用：声明已熏蒸或热处理（ISPM 15 标准）。' }
  ];
  const base = 'docs/templates/';
  const card = (m) => '<div class="panel" style="padding:16px 18px;display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">' +
    '<div style="width:44px;height:44px;border-radius:10px;background:' + (m.tag === 'Excel' ? '#EAF3EC' : '#EEF2FA') + ';color:' + (m.tag === 'Excel' ? '#1B7F4B' : '#2C5A8C') + ';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex:0 0 auto">' + m.tag + '</div>' +
    '<div style="flex:1;min-width:260px"><div style="font-size:15px;font-weight:700;color:#191713">' + esc(m.t) + '</div>' +
    '<div style="font-size:12.5px;color:#6E675B;line-height:1.7;margin-top:4px">' + esc(m.d) + '</div>' +
    '<div style="font-size:11.5px;color:#9C9486;margin-top:6px">' + esc(m.f) + '</div></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn primary" href="' + base + m.f + '" download>⬇ 下载模板</a>' +
    '<a class="btn ghost" href="' + base + m.f + '" target="_blank" rel="noopener">打开</a></div></div>';
  setMain(pageHead('澳洲文件模板', '订舱 / VGM / 报关 / 装箱声明 / 木质包装声明 —— 一键下载，填好回传即可使用',
      '<a class="btn ghost" href="docs/templates/manifest.json" target="_blank">查看清单</a>') +
    '<div class="panel" style="padding:14px 18px;margin-bottom:14px;font-size:12.5px;color:#6E675B;line-height:1.85">' +
      '<b>使用顺序：</b>① 订舱单（Booking）→ ② VGM 重量申报 → ③ 报关资料 / 出口正报 → ④ FCL 装箱声明 + 木质包装声明（含木托/木箱时必须提供）。<br>' +
      '<b>提示：</b>Excel 模板请用 Excel / WPS 打开填写；Word 声明打印后签字盖章，随清关文件一并提交。所有文件均为可编辑模板，不影响原版格式。</div>' +
    MAN.map(card).join(''));
};
/* ============================== 地址通行核验（快速核验 + 原版完整核验） ============================== */
App.views.access = async function (r) {
  const custId = (r && r.args && r.args[0]) ? r.args[0] : '';
  setMain(pageHead('地址通行核验 · 澳洲落柜可行性',
      '输入客户地址 → 一键快速核验（自动取路网/用地数据）→ 给出「能进 / 有条件 / 不能进」参考结论 + 需要客户确认的现场项',
      '') +
    '<div class="panel" style="padding:16px 18px;margin-bottom:12px">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
        '<input id="caAddr" class="input" placeholder="输入澳洲地址，例如 1 Martin Place, Sydney NSW 2000" style="flex:1;min-width:320px;height:42px">' +
        '<select id="caCtnSel" class="input" style="max-width:150px;height:42px"><option value="20GP">20GP</option><option value="40GP" selected>40GP</option><option value="40HC">40HC</option></select>' +
        '<button class="btn primary" id="caRun" style="height:42px;padding:0 22px">⚡ 快速核验</button>' +
        '<button class="btn ghost" id="caOpen" style="height:42px">🔍 打开完整核验</button>' +
      '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px">' +
        '<span style="font-size:12.5px;color:#6E675B">从客户档案带入：</span>' +
        '<select id="caCust" class="input" style="max-width:340px"><option value="">加载中…</option></select>' +
        '<button class="btn ghost" id="caLoad">带入地址</button>' +
        '<span id="caHint" style="font-size:12px;color:#9C9486"></span>' +
      '</div>' +
      '<div style="font-size:11.5px;color:#9C9486;margin-top:10px">说明：快速核验基于 OpenStreetMap/Overpass 网络公开数据估算（路宽、道路等级、限高限宽、单行道、用地性质、电线杆），<b>不代替现场实测</b>；结论为参考，落柜前请让客户提供现场照片与实测数据。</div>' +
    '</div>' +
    '<div id="caResult"></div>' +
    '<div id="caFullWrap" style="display:none"></div>');
  const $ = (id) => document.getElementById(id);
  function say(t, k) { const h = $('caHint'); if (h) { h.textContent = t || ''; h.style.color = k === 'ok' ? '#1B7F4B' : (k === 'err' ? '#B3261E' : '#9C9486'); } }
  /* 客户列表 */
  (async function () {
    try {
      const res = await API.get('/api/customers');
      const list = (res && (res.list || res.customers || res.items)) || [];
      const sel = $('caCust');
      sel.innerHTML = '<option value="">请选择客户…</option>' + list.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (c.id === custId ? ' selected' : '') + '>' + esc(c.company || c.name || c.id) + (c.suburb ? ' · ' + esc(c.suburb) : '') + '</option>';
      }).join('');
      if (custId) setTimeout(function () { $('caLoad').click(); }, 400);
    } catch (e) { const sel = $('caCust'); if (sel) sel.innerHTML = '<option value="">读取客户失败</option>'; }
  })();
  async function fillFromCustomer() {
    const id = $('caCust').value;
    if (!id) { say('请先选择客户', 'err'); return ''; }
    try {
      const res = await API.get('/api/customers/' + encodeURIComponent(id));
      const rec = (res && (res.customer || res.data || res.item)) || res || {};
      const parts = [rec.address, rec.suburb, rec.state, rec.postcode].map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean);
      const addr = parts.join(', ');
      if (!addr) { say('该客户没有填写地址', 'err'); return ''; }
      $('caAddr').value = addr;
      /* accessChecks 回填桥：把档案里已有的核验结果同步到 localStorage，供报价 Excel 备注读取 */
      try {
        const checks = rec.accessChecks || [];
        if (checks.length) {
          const KEY = 'aufcl_access_v1';
          let all = JSON.parse(localStorage.getItem(KEY) || '[]') || [];
          all = all.filter(function (x) { return x.custId !== id; });
          checks.slice(-5).reverse().forEach(function (c2) {
            all.unshift(Object.assign({ custId: id, custName: rec.company || rec.name || '' }, c2));
          });
          localStorage.setItem(KEY, JSON.stringify(all.slice(0, 50)));
        }
      } catch (e2) {}
      say('已带入：' + addr + (rec.accessVerdict ? '（档案已有核验结果：' + (rec.accessVerdictZh || rec.accessVerdict) + '）' : ''), 'ok');
      return addr;
    } catch (e) { say('读取失败：' + e.message, 'err'); return ''; }
  }
  $('caLoad').onclick = fillFromCustomer;
  function card(res) {
    const V = res.verdict;
    const map = {
      yes: { t: '✅ 可以直接进', c: '#1B7F4B', bg: '#F2F8F4', b: '公路数据看，该地址有足够通行条件。仍建议司机提前电话确认落柜点。' },
      conditional: { t: '⚠️ 有条件能进', c: '#A87428', bg: '#FDF7E9', b: '存在窄街/单行/住宅区/限停等限制，需要现场配合（占道、慢行、吊装或改小柜型）。' },
      no: { t: '⛔ 数据显示不能进', c: '#B3261E', bg: '#FBF1EE', b: '数据中的限值已低于柜车要求，需改地址、换设备或申请路权。' },
      unknown: { t: '❓ 数据不足，需人工确认', c: '#0B2545', bg: '#F2F5FA', b: '关键数据（路宽/用地）缺失，请按下方清单让客户实测或提供照片。' }
    }[V] || {};
    const li = (a, cls) => a.length ? '<ul style="margin:6px 0 0 18px;padding:0;font-size:13px;line-height:1.9" class="' + (cls || '') + '">' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '';
    return '<div class="panel" style="padding:18px 20px">' +
      '<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">' +
        '<div style="flex:1;min-width:280px">' +
          '<div style="display:inline-block;padding:8px 16px;border-radius:10px;background:' + bg + ';color:' + c + ';font-size:18px;font-weight:800">' + map.t + '</div>' +
          '<div style="font-size:13px;color:#3D3932;margin-top:10px;line-height:1.75">' + map.b + '</div>' +
          '<div style="font-size:12.5px;color:#6E675B;margin-top:12px">' + esc(res.address || '') + '</div>' +
          '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;font-size:12.5px;color:#3D3932">' +
            '<span>道路：<b>' + esc(res.roadName || '-') + '</b>' + (res.roadType ? '（' + esc(res.roadType) + '）' : '') + '</span>' +
            '<span>路宽：<b>' + (res.width ? res.width.toFixed(1) + ' m' : '未知') + '</b>' + (res.widthFrom ? '（' + esc(res.widthFrom) + '）' : '') + '</span>' +
            '<span>用地：<b>' + esc(res.use || '未知') + '</b></span>' +
            '<span>柜型：<b>' + esc(res.ctn) + '</b>（车宽 ' + (res.truckH ? '2.5' : '-') + 'm / 车高约 ' + res.truckH + 'm）</span>' +
          '</div>' +
          (res.reasons.length ? '<div style="margin-top:12px;font-size:12.5px;color:#1B7F4B"><b>有利条件</b>' + li(res.reasons) + '</div>' : '') +
          (res.warn.length ? '<div style="margin-top:12px;font-size:12.5px;color:#A87428"><b>需注意</b>' + li(res.warn) + '</div>' : '') +
          (res.unknown.length ? '<div style="margin-top:12px;font-size:12.5px;color:#B3261E"><b>数据缺失（需现场确认）</b>' + li(res.unknown) + '</div>' : '') +
          (res.outOfAU ? '<div style="margin-top:10px;padding:8px 11px;background:#FBF1EE;border:1px solid #EFD3C8;border-radius:8px;font-size:12.5px;color:#B3261E">⚠ 该坐标不在澳洲范围内，本系统仅核验澳洲地址（FCL 澳洲线）</div>' : '') +
          '<div style="margin-top:10px;font-size:12px;color:#6E675B">判定置信度：<b style="color:' + (res.confidence === 'high' ? '#1B7F4B' : (res.confidence === 'medium' ? '#A87428' : '#B26A00')) + '">' + ({ high: '高（有实测路宽标签）', medium: '中（按车道数估算）', low: '低（按道路等级估算，建议现场复核）' }[res.confidence] || '中') + '</b>' + (res.widthEst ? ' · 路宽为等级估算值' : '') + '</div>' +
          '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:14px">' +
            '<div style="flex:1;min-width:320px"><div style="font-size:12px;color:#6E675B;margin-bottom:6px">📷 谷歌街景（实况路面）</div><iframe src="' + res.links.embedPano + '" style="width:100%;height:260px;border:1px solid #DCE3ED;border-radius:8px;background:#000" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>' +
            '<div style="flex:1;min-width:320px"><div style="font-size:12px;color:#6E675B;margin-bottom:6px">🛰 卫星图（落柜区/通道）</div><iframe src="' + res.links.embedSat + '" style="width:100%;height:260px;border:1px solid #DCE3ED;border-radius:8px;background:#000" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>' +
          '</div>' +
          '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">' +
            '<a class="btn ghost" href="' + res.links.street + '" target="_blank" rel="noopener">📍 打开谷歌街景看实际路面</a>' +
            '<a class="btn ghost" href="' + res.links.map + '" target="_blank" rel="noopener">🗺 谷歌地图</a>' +
            '<button class="btn ghost" id="caCopyList">📋 复制现场确认清单</button>' +
            '<button class="btn primary" id="caSaveToCust">💾 写入客户档案（并写入报价 Excel 备注）</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:14px;padding:10px 12px;background:#F8F4EC;border:1px dashed #E5DDCB;border-radius:8px;font-size:11.5px;color:#6E675B;line-height:1.75">' + esc(res.disclaimer) + '</div>' +
    '</div>';
  }
  $('caRun').onclick = async function () {
    const addr = ($('caAddr').value || '').trim();
    if (!addr) { say('请先输入地址，或从客户档案带入', 'err'); $('caAddr').focus(); return; }
    if (!window.AccessCheck) { say('核验组件未加载，请刷新页面', 'err'); return; }
    const box = $('caResult');
    box.innerHTML = '<div class="panel" style="padding:20px"><div style="font-size:14px;color:#6E675B">正在查询路网与用地数据（约 5~15 秒）…</div></div>';
    say('查询中…');
    const t0 = Date.now();
    try {
      const res = await AccessCheck.run(addr, $('caCtnSel').value);
      box.innerHTML = card(res);
      const btn = $('caCopyList');
      if (btn) btn.onclick = function () {
        const list = ['现场确认清单（客户提供）', '地址：' + (res.address || addr), '', '1. 最窄处车行道净宽（米）：___', '2. 大门/入口净宽与净高（米）：___', '3. 落柜点可用净长 × 净宽（米）：___ × ___', '4. 落柜点上方净空（电线/树/雨棚，米）：___', '5. 地面类型与承载（混凝土/沥青/碎石/草地）：___', '6. 是否能倒车进入、是否需要占道许可：___', '7. 周边有无低垂电线、窄桥、限高牌：___', '', '参考结论（' + res.ctn + '）：' + (res.verdict || '') + ' · 路宽 ' + (res.width ? res.width.toFixed(1) + 'm' : '未知') + ' · ' + (res.use || '')].join(String.fromCharCode(10));
        try { navigator.clipboard.writeText(list); say('现场确认清单已复制，可发给客户', 'ok'); } catch (e) { say('复制失败，请手动选择', 'err'); }
      };
      say('完成 · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒', 'ok');
      const btnSave = $('caSaveToCust');
      if (btnSave) btnSave.onclick = async function () {
        const cid = $('caCust').value;
        if (!cid) { say('请先在上面「从客户档案带入」里选择客户，再写入', 'err'); return; }
        const VZ = { yes: '可直接进', conditional: '有条件能进', no: '不能进', unknown: '数据不足' };
        const entry = { at: Date.now(), atText: new Date().toLocaleString(), address: res.address, ctn: res.ctn,
          verdict: res.verdict, verdictZh: VZ[res.verdict] || res.verdict,
          roadName: res.roadName, roadType: res.roadType, width: res.width, widthFrom: res.widthFrom,
          use: res.use, provider: res.provider, lat: res.lat, lon: res.lon,
          reasons: res.reasons, warn: res.warn, unknown: res.unknown };
        try {
          const cur = await API.get('/api/customers/' + encodeURIComponent(cid));
          const rec = (cur && (cur.customer || cur.data || cur.item)) || cur || {};
          rec.accessChecks = (rec.accessChecks || []).concat([entry]).slice(-10);
          rec.accessVerdict = entry.verdict; rec.accessVerdictZh = entry.verdictZh;
          rec.accessAddress = entry.address; rec.accessCheckedAt = entry.atText;
          rec.accessWidth = entry.width; rec.accessUse = entry.use;
          await API.put('/api/customers/' + encodeURIComponent(cid), rec);
          /* localStorage 桥：报价模块导出 Excel 时读取 */
          const KEY = 'aufcl_access_v1';
          let all = [];
          try { all = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e2) { all = []; }
          all.unshift(Object.assign({ custId: cid, custName: rec.company || rec.name || '' }, entry));
          try { localStorage.setItem(KEY, JSON.stringify(all.slice(0, 50))); } catch (e2) {}
          say('✅ 已写入客户档案，并已写入报价 Excel 备注（下次导出客户报价时自动带出）', 'ok');
        } catch (e) { say('写入失败：' + e.message, 'err'); }
      };
    } catch (e) {
      /* 网络不可用时的 3 项手动兜底：不需要填 11 项，只要 3 个关键值即可给结论 */
      box.innerHTML = '<div class="panel" style="padding:18px 20px">' +
        '<div style="font-size:13.5px;color:#B3261E;margin-bottom:4px">联网查询失败：' + esc(e.message) + '</div>' +
        '<div style="font-size:12.5px;color:#6E675B;margin-bottom:12px">可以先用下面 3 项快速判断（不知道就选“不确定”），后续再请客户提供现场照片与实测。</div>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">' +
          '<span style="font-size:12.5px;color:#6E675B">最窄车行道净宽</span><select id="caFw" class="input" style="max-width:170px"><option value="">不确定</option><option value="4">不足 5.5 m</option><option value="6">5.5 ~ 7 m</option><option value="8">7 m 以上</option></select>' +
          '<span style="font-size:12.5px;color:#6E675B">限高/净空</span><select id="caFh" class="input" style="max-width:170px"><option value="">不确定</option><option value="4">不足 4.5 m</option><option value="5">4.5 m 以上</option></select>' +
          '<span style="font-size:12.5px;color:#6E675B">用地性质</span><select id="caFu" class="input" style="max-width:150px"><option value="">不确定</option><option value="住宅">住宅</option><option value="商业">商业</option><option value="工业">工业</option></select>' +
          '<button class="btn primary" id="caFgo">给出结论</button>' +
        '</div><div id="caFout" style="margin-top:14px"></div></div>';
      say('已切换为手动快判', 'err');
      $('caFgo').onclick = function () {
        const w = parseFloat($('caFw').value || '0');
        const h = parseFloat($('caFh').value || '0');
        const u = $('caFu').value;
        const ctn = $('caCtnSel').value;
        const needW = ctn === '20GP' ? 5.0 : 5.5;
        const truckH = ctn === '20GP' ? 4.0 : (ctn === '40HC' ? 4.4 : 4.15);
        const bad = [], warn = [], ok = [];
        if (w && w < needW) bad.push('街宽不足 ' + needW + ' m（' + ctn + ' 柜车要求）');
        else if (w && w < needW + 1.5) warn.push('街宽偏窄，需慢速会车/占道作业');
        else if (w) ok.push('街宽满足 ' + ctn + ' 柜车通行');
        if (h && h < truckH + 0.3) bad.push('净空不足 ' + (truckH + 0.3).toFixed(1) + ' m（' + ctn + ' 柜车高约 ' + truckH + ' m）');
        else if (h) ok.push('净空满足柜车高度');
        if (u === '住宅') warn.push('住宅区：多为窄街+路边停车，落柜常需占道许可');
        else if (u === '商业') warn.push('商业区：注意卸货时段与限停');
        else if (u === '工业') ok.push('工业用地：通常通道与装卸条件较好');
        const verdict = bad.length ? 'no' : (warn.length >= 2 ? 'conditional' : (warn.length === 1 ? 'conditional' : (ok.length ? 'yes' : 'unknown')));
        const map = { yes: ['✅ 可以直接进', '#1B7F4B', '#F2F8F4'], conditional: ['⚠️ 有条件能进', '#A87428', '#FDF7E9'], no: ['⛔ 不能进', '#B3261E', '#FBF1EE'], unknown: ['❓ 信息不足', '#0B2545', '#F2F5FA'] };
        const m = map[verdict];
        $('caFout').innerHTML = '<div style="display:inline-block;padding:8px 16px;border-radius:10px;background:' + m[2] + ';color:' + m[1] + ';font-size:17px;font-weight:800">' + m[0] + '</div>' +
          (bad.length ? '<ul style="margin:8px 0 0 18px;font-size:12.5px;color:#B3261E"><li>' + bad.map(esc).join('</li><li>') + '</li></ul>' : '') +
          (warn.length ? '<ul style="margin:8px 0 0 18px;font-size:12.5px;color:#A87428"><li>' + warn.map(esc).join('</li><li>') + '</li></ul>' : '') +
          (ok.length ? '<ul style="margin:8px 0 0 18px;font-size:12.5px;color:#1B7F4B"><li>' + ok.map(esc).join('</li><li>') + '</li></ul>' : '') +
          '<div style="margin-top:10px;font-size:11.5px;color:#6E675B">该结论来自你输入的 3 项，仍需客户提供现场照片与实测数据确认。</div>';
      };
    }
  };
  $('caAddr').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('caRun').click(); });
  $('caOpen').onclick = function () {
    const addr = ($('caAddr').value || '').trim();
    window.open('modules/container-access/index.html' + (addr ? ('?address=' + encodeURIComponent(addr)) : ''), '_blank');
    say('已在新窗口打开原版完整核验系统（可逐项修正并生成 A4 报告）', 'ok');
  };
};
/* ============================== 3D 装柜（独立操作） ============================== */
App.views.packing = async function (r) {
  const custId = (r && r.args && r.args[0]) ? r.args[0] : '';
  setMain(pageHead('3D 装柜 · 数字孪生', '独立操作，不必走引导建档：手动录入 / Excel 导入 / 从客户档案一键载入 → 智能配载 → 3D 演示 → 报告导出',
      '<button class="btn ghost" id="pkFull">⛶ 全屏打开</button><button class="btn ghost" id="pkReload">↻ 重新载入</button>') +
    '<div class="panel" style="padding:10px 14px;margin-bottom:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<span style="font-size:12.5px;color:#6E675B">从客户档案载入货物：</span>' +
      '<select id="pkCust" class="input" style="max-width:340px"><option value="">加载中…</option></select>' +
      '<button class="btn primary" id="pkLoad">载入并计算</button>' +
      '<button class="btn ghost" id="pkClear">清空货物</button>' +
      '<span id="pkHint" style="font-size:12px;color:#9C9486"></span>' +
    '</div>' +
    '<iframe id="pkFrame" src="modules/packing.html" style="width:100%;height:calc(100vh - 232px);min-height:740px;border:1px solid #DCE3ED;border-radius:10px;background:#fff"></iframe>');
  const $ = (id) => document.getElementById(id);
  const frame = $('pkFrame');
  let ready = false;
  function say(t, k) { const h = $('pkHint'); if (h) { h.textContent = t || ''; h.style.color = k === 'ok' ? '#1B7F4B' : (k === 'err' ? '#B3261E' : '#9C9486'); } }
  function send(type, payload) {
    if (!frame || !frame.contentWindow) return false;
    try { frame.contentWindow.postMessage({ ch: 'aufcl-crm', type: type, payload: payload || {} }, '*'); return true; } catch (e) { return false; }
  }
  $('pkFull').onclick = function () { window.open('modules/packing.html', '_blank'); };
  $('pkReload').onclick = function () { ready = false; frame.src = 'modules/packing.html?t=' + Date.now(); say('已重新载入'); };
  $('pkClear').onclick = function () { if (send('clearCargo')) say('已清空货物', 'ok'); };
  /* 客户列表 */
  let custList = [];
  (async function () {
    try {
      const res = await API.get('/api/customers');
      custList = (res && (res.list || res.customers || res.items)) || [];
      const sel = $('pkCust');
      sel.innerHTML = '<option value="">请选择客户…</option>' + custList.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (c.id === custId ? ' selected' : '') + '>' + esc(c.company || c.name || c.id) + '</option>';
      }).join('');
      if (custId && ready) setTimeout(function () { $('pkLoad').click(); }, 300);
    } catch (e) { const sel = $('pkCust'); if (sel) sel.innerHTML = '<option value="">读取客户失败</option>'; }
  })();
  /* 载入客户货物 */
  $('pkLoad').onclick = async function () {
    const id = $('pkCust').value;
    if (!id) { say('请先选择客户', 'err'); return; }
    if (!ready) { say('装柜模块还在加载，请稍后再点', 'err'); return; }
    say('读取客户货物…');
    try {
      const res = await API.get('/api/customers/' + encodeURIComponent(id));
      const rec = (res && (res.customer || res.data || res.item)) || res || {};
      const cargos = rec.cargos || rec.cargoes || rec.goods || [];
      if (!cargos.length) { say('这个客户还没有货物数据，可在客户档案里添加货物，或直接用上面的 Excel 导入', 'err'); return; }
      /* 客户货物结构：cargos[].items[]（每个 cargo 是一票/一个柜的方案），也可能直接是货物数组 */
      const flat = [];
      cargos.forEach(function (cg) {
        if (cg && Array.isArray(cg.items)) { cg.items.forEach(function (it) { flat.push(it); }); }
        else if (cg && (cg.L_cm || cg.length_cm)) { flat.push(cg); }
      });
      if (!flat.length) { say('客户的货物没有明细（仅方案汇总），请用 Excel 导入或手动录入', 'err'); return; }
      const items = flat.map(function (c, i) {
        const L = Number(c.L_cm || c.length_cm || c.length || 0);
        const W = Number(c.W_cm || c.width || c.width_cm || 0);
        const H = Number(c.H_cm || c.height || c.height_cm || 0);
        return { name: c.name || c.title || ('Cargo ' + (i + 1)), qty: Number(c.qty || c.quantity || 1) || 1,
          L_cm: L, W_cm: W, H_cm: H, weight_kg: Number(c.weight_kg || c.weight || 0) || 0,
          type: c.type || c.packType || 'pallet', unloadStop: Number(c.unloadStop || c.stop || 1) || 1,
          canFlip: c.canFlip !== false, canSide: c.canSide !== false, loadCap: Number(c.loadCap || 0) || 0,
          fragile: Number(c.fragile || 0) || 0, hazmat: Number(c.hazmat || 0) || 0, inspect: Number(c.inspect || 0) || 0 };
      }).filter(function (x) { return x.L_cm > 0 && x.W_cm > 0 && x.H_cm > 0; });
      if (!items.length) { say('客户的货物缺少有效尺寸，无法装柜', 'err'); return; }
      send('loadCargo', { items: items });
      say('已载入 ' + items.length + ' 种货物，正在自动配载…', 'ok');
    } catch (e) { say('载入失败：' + e.message, 'err'); }
  };
  /* 监听模块消息 */
  window.addEventListener('message', function (e) {
    const d = e.data;
    if (!d || d.ch !== 'aufcl-module') return;
    if (d.type === 'ready') { ready = true; say('装柜模块已就绪（可手动录入、Excel 导入，或从上面选客户载入）', 'ok'); if (custId) setTimeout(function () { $('pkLoad').click(); }, 300); }
    else if (d.type === 'cargoData') {
      const s = (d.payload && d.payload.summary) || {};
      if (s.containerType) say('配载完成：' + s.containerType + ' × ' + (s.containerCount || 1) + ' · 利用率 ' + (s.utilization ? (s.utilization * 100).toFixed(1) + '%' : '-'), 'ok');
    }
  });
};
App.views.mark = async function () {
  setMain(pageHead('箱唛工具 · GlobalVertical Pro', 'ISO 780 包装标识 · GS1-128 SSCC-18 · Code128 · 追溯二维码 · A4 拼版 · 600DPI PDF/PNG 导出',
      '<button class="btn ghost" data-act="mark-new">在新窗口打开</button>') +
    card('使用方式', '与客户档案联动',
      '<ul class="pt-list">' +
      '<li class="pt info"><b>新增箱唛：</b>点右上角「＋ 新增箱唛」录入收货人、箱号、件数、目的港，系统自动生成标准唛头、条码与追溯二维码。</li>' +
      '<li class="pt info"><b>批量：</b>可先「载入示例数据」看格式，或「导出 CSV / 备份数据」拿到模板，填完再「恢复数据」批量导入。</li>' +
      '<li class="pt info"><b>出图：</b>支持 A4 拼版预览、600DPI PDF、PNG、复制图片与直接打印，唛头可贴箱也可交工厂。</li>' +
      '<li class="pt warn"><b>数据位置：</b>箱唛数据保存在本浏览器本地（与客户档案分开）；重要批次请定期「备份数据」导出 JSON。</li>' +
      '</ul>') +
    card('箱唛工作台', '完整 Pro 版（原文嵌入，功能与单机版一致）',
      '<iframe id="mkFrame" src="modules/mark.html" style="width:100%;height:82vh;min-height:680px;border:1px solid var(--line,#DCE3ED);border-radius:10px;background:#fff"></iframe>'));
};

/* ============================== 付费放行（业主端） ============================== */
var __payTimer = null;
App.views.pay = async function () {
  if (__payTimer) { clearInterval(__payTimer); __payTimer = null; }
  if (window.__paySSE) { try { window.__paySSE.close(); } catch (e) {} window.__paySSE = null; }
  const R = window.PayRelay, PP = window.PayPass;
  const items = {};
  const chNow = R ? R.ch() : '';
  setMain(pageHead('付费放行 · 业主端', '客户扫码付款 → 你的手机实时收到申请 → 一键放行（6 小时一次性通行证）',
      '<button class="btn ghost" data-act="pay-refresh">刷新</button>') +
    card('① 在线频道（你的“在线密钥”）', '客户与你的手机靠这个频道通信；客户页面已内置同一个频道，无需客户填写',
      '<div class="form-row"><label>频道 / 在线密钥</label><input id="payCh" class="input" value="' + esc(chNow) + '" style="max-width:340px"></div>' +
      '<div class="btn-row"><button class="btn primary" data-act="pay-savech">保存并订阅</button>' +
      '<button class="btn ghost" data-act="pay-gench">🎲 生成随机长频道（更安全）</button>' +
      '<button class="btn ghost" data-act="pay-copych">复制频道</button>' +
      '<button class="btn ghost" data-act="pay-custlink">复制客户链接（含频道）</button>' +
      '<span class="pay-badge" id="payChState">订阅中…</span></div>' +
      '<div class="pay-note" style="text-align:left">客户页链接：<code id="payCustUrl">' + esc((R ? R.pageUrl() : '').replace('#/pay', '')) + '</code></div>' +
      '<div class="pay-note" style="text-align:left;color:#B26A00">⚠ 改频道只影响你这台设备的接收；要让客户也发到新频道，点「复制客户链接（含频道）」把带 ?ch= 的链接发给客户。</div>') +
    card('② 手机接收申请（推荐 · 有推送）', '装一个免费 App，客户一付款申请就弹通知到你手机',
      '<ul class="pt-list">' +
      '<li class="pt info"><b>第 1 步：</b>手机应用商店搜 <b>ntfy</b>（iOS / Android 都有，免费）安装</li>' +
      '<li class="pt info"><b>第 2 步：</b>App 里点「+ Subscribe to topic」，把下面这个频道名粘进去：<br><b id="payTopic2" style="font-size:15px;color:#9C7C3D">' + esc(chNow) + '</b> <button class="btn ghost tiny" data-act="pay-copytopic">复制</button></li>' +
      '<li class="pt info"><b>第 3 步：</b>完成。以后客户点「我已支付，请求放行」，你手机立刻收到通知，<b>点通知直接打开本页</b>，一键放行。</li>' +
      '<li class="pt warn"><b>不想装 App？</b>用手机浏览器打开本页（保持前台）也能收到：列表实时刷新 + 响铃。</li>' +
      '<li class="pt info">网页订阅入口：<a href="https://ntfy.sh/' + esc(chNow) + '" target="_blank" rel="noopener">https://ntfy.sh/' + esc(chNow) + '</a></li>' +
      '</ul>') +
    card('③ 实时申请列表', '客户点「我已支付，请求放行」后立刻出现（实时通道，无需刷新）',
      '<div id="payList"><div class="k">等待申请…</div></div>' +
      '<div class="pay-note">放行后客户浏览器会自动进入，通行证 6 小时；到期自动退出，需再次付款。</div>') +
    card('④ 授权码生成器（离线备用）', '客户手机收不到通知时，生成一个码发给他即可',
      '<div class="form-row"><label>有效时长（小时）</label><input id="payHours2" class="input" type="number" value="6" step="0.5" min="0.5" style="max-width:140px"></div>' +
      '<div class="btn-row"><button class="btn primary" data-act="pay-gen">生成授权码</button>' +
      '<button class="btn ghost" data-act="pay-copy">复制</button>' +
      '<button class="btn ghost" data-act="pay-gen3">连出 3 个</button></div>' +
      '<div id="payCodeOut" style="margin-top:10px;font-size:15px;font-weight:700;color:#9C7C3D;letter-spacing:.5px"></div>') +
    card('⑤ 本机服务端（全栈模式 · 可选）', '跑着 server.cjs 时，申请也会同时落到本机，可用业主密钥在局域网内放行',
      '<div class="form-row"><label>业主密钥</label><input id="payKey" class="input" value="' + esc((function () { try { return localStorage.getItem('aufcl_owner_key_v1') || ''; } catch (e) { return ''; } })()) + '" placeholder="GVPAY-XXXXXX（启动服务时窗口会打印）"></div>' +
      '<div class="btn-row"><button class="btn ghost" data-act="pay-savekey">保存密钥</button><span class="pay-badge" id="payConn">未连接</span></div>'));
  const listEl = document.getElementById('payList');
  const chEl = document.getElementById('payCh');
  function render() {
    const arr = Object.keys(items).map(function (k) { return items[k]; }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    if (!arr.length) { listEl.innerHTML = '<div class="k">等待申请…（客户在登录页点「我已支付，请求放行」后会立刻出现在这里）</div>'; return; }
    listEl.innerHTML = '<table class="tbl"><thead><tr><th>单号</th><th>时间</th><th>状态</th><th>授权码</th><th style="width:200px">操作</th></tr></thead><tbody>' +
      arr.slice(0, 40).map(function (x) {
        const st = x.status === 'approved' ? '<span style="color:#1B7F4B;font-weight:700">已放行</span>' : (x.status === 'rejected' ? '<span style="color:#B3261E">已拒绝</span>' : '<span style="color:#B26A00;font-weight:700">待确认到账</span>');
        return '<tr><td><b>' + esc(x.id) + '</b></td><td>' + esc(new Date(x.at || Date.now()).toLocaleTimeString()) + '</td><td>' + st + '</td><td style="font-family:monospace">' + esc(x.code || '') + '</td>' +
          '<td>' + (x.status === 'pending' ? '<button class="btn primary tiny" data-payok="' + esc(x.id) + '">确认到账 · 放行 6h</button> <button class="btn ghost tiny" data-payno="' + esc(x.id) + '">拒绝</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function beep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ac = new AC(); const o = ac.createOscillator(); const gp = ac.createGain();
      o.connect(gp); gp.connect(ac.destination); o.frequency.value = 880; gp.gain.value = 0.06; o.start();
      setTimeout(function () { o.stop(); ac.close(); }, 260);
    } catch (e) {}
  }
  function onMsg(m, isNew) {
    if (!m || m.t !== 'req' || !m.id) return;
    if (items[m.id]) return;
    items[m.id] = { id: m.id, at: (m.at || Date.now()), status: 'pending', code: '', amt: m.amt || 6.66 };
    render();
    if (isNew) { beep(); if (App.toast) App.toast('新付款放行申请 ' + m.id + '（¥' + (m.amt || 6.66) + '）', 'ok'); }
  }
  function subscribe() {
    if (!R) return;
    if (window.__paySSE) { try { window.__paySSE.close(); } catch (e) {} }
    const st = document.getElementById('payChState');
    window.__paySSE = R.watch(function (m) { onMsg(m, true); }, function (s) { if (st) st.textContent = s === 'open' ? '✅ 已订阅 · 实时接收中' : ('连接异常（' + s + '）'); });
    R.poll(3600).then(function (list) { list.forEach(function (m) { onMsg(m, false); }); });
  }
  document.addEventListener('click', async function (e) {
    const t = e.target.closest ? e.target.closest('[data-act],[data-payok],[data-payno]') : null;
    if (!t) return;
    const act = t.getAttribute('data-act'), ok = t.getAttribute('data-payok'), no = t.getAttribute('data-payno');
    const hrs = Number((document.getElementById('payHours2') || {}).value) || 6;
    if (act === 'pay-savech') { R.setCh(chEl.value); if (App.toast) App.toast('频道已保存，正在重新订阅…', 'ok'); App.views.pay(); }
    else if (act === 'pay-gench') {
      var arr = new Uint8Array(16);
      try { (window.crypto || {}).getRandomValues(arr); } catch (er) { for (var qi = 0; qi < 16; qi++) arr[qi] = Math.floor(Math.random() * 256); }
      var rnd = '';
      for (var wi = 0; wi < arr.length; wi++) rnd += ('0' + arr[wi].toString(36)).slice(-2);
      var nch = 'aufcl-' + rnd.slice(0, 30);
      R.setCh(nch);
      if (App.toast) App.toast('已生成新频道，请用「复制客户链接（含频道）」重新发给客户', 'ok');
      App.views.pay();
    }
    else if (act === 'pay-copych' || act === 'pay-copytopic') { try { await navigator.clipboard.writeText(R.ch()); if (App.toast) App.toast('频道已复制：' + R.ch(), 'ok'); } catch (er) { if (App.toast) App.toast('请手动复制：' + R.ch(), 'err'); } }
    else if (act === 'pay-custlink') { const u = (R.pageUrl() || '').replace('#/pay', '') + '?ch=' + R.ch(); try { await navigator.clipboard.writeText(u); if (App.toast) App.toast('客户链接已复制（含频道）', 'ok'); } catch (er) { if (App.toast) App.toast(u, 'err'); } }
    else if (act === 'pay-refresh') { R.poll(3600).then(function (l) { l.forEach(function (m) { onMsg(m, false); }); }); }
    else if (act === 'pay-gen' || act === 'pay-gen3') {
      const n = act === 'pay-gen3' ? 3 : 1;
      const out = [];
      for (let i = 0; i < n; i++) out.push(PP.makeCode(hrs));
      const el = document.getElementById('payCodeOut');
      if (el) el.innerHTML = out.map(function (c) { return '<div>' + esc(c) + ' <span style="font-weight:400;font-size:12px;color:#9C9486">（' + hrs + ' 小时有效）</span></div>'; }).join('');
      window.__lastCodes = out.join('\n');
    }
    else if (act === 'pay-copy') { try { await navigator.clipboard.writeText(window.__lastCodes || ''); if (App.toast) App.toast('授权码已复制', 'ok'); } catch (er) { if (App.toast) App.toast('请手动选中复制', 'err'); } }
    else if (act === 'pay-savekey') { try { localStorage.setItem('aufcl_owner_key_v1', document.getElementById('payKey').value.trim()); if (App.toast) App.toast('业主密钥已保存', 'ok'); } catch (er) {} }
    else if (ok) {
      const code = PP.makeCode(hrs);
      items[ok].status = 'approved'; items[ok].code = code; render();
      R.publish({ t: 'ok', id: ok, code: code, exp: Date.now() + hrs * 3600 * 1000 }, { title: '✅ 已放行 ' + ok + '（' + hrs + ' 小时）', tags: 'white_check_mark' })
        .then(function () { if (App.toast) App.toast('已放行 ' + ok + '，客户会自动进入', 'ok'); })
        .catch(function (e) { if (App.toast) App.toast('通道发送失败：' + (e.message || e), 'err'); });
      const k = String((document.getElementById('payKey') || {}).value || '').trim();
      if (k) fetch('api/pay/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ok, key: k, hours: hrs }) }).catch(function () { });
    } else if (no) {
      items[no].status = 'rejected'; render();
      R.publish({ t: 'no', id: no }, { title: '❌ 未通过 ' + no, tags: 'x' }).catch(function () { });
    }
  });
  render();
  subscribe();
  __payTimer = setInterval(function () { if (R) R.poll(300).then(function (l) { l.forEach(function (m) { onMsg(m, false); }); }); }, 15000);
};
/* ============================== 客户沟通分析 · 回复建议 ============================== */
var __waMsgs = [], __waAn = null, __waTone = 'steady', __waLang = 'en', __waBusy = false;
var __waSess = null, __waAuto = null, __waSig = '', __waRectKey = 'wa_rect_v1';
var __waScore = null, __waFunnel = null, __waGender = 'any';
var __waAccum = '';   /* 多帧累积文本：把每次抓到的内容合并，拼出从头到尾的完整对话 */
function waMergeText(oldT, newT) {
  var seen = {};
  var out = [];
  String(oldT || '').split(String.fromCharCode(10)).concat(String(newT || '').split(String.fromCharCode(10))).forEach(function (line) {
    var k = String(line).replace(/\s+/g, '').trim();
    if (!k) return;
    if (seen[k]) return;
    seen[k] = 1;
    out.push(line);
  });
  return out.join(String.fromCharCode(10));
}
function waCfg() { try { return JSON.parse(localStorage.getItem('aufcl_wa_ai') || '{}') || {}; } catch (e) { return {}; } }
function waSaveCfg(o) { try { localStorage.setItem('aufcl_wa_ai', JSON.stringify(o)); } catch (e) {} }
function waRect() { try { var r = JSON.parse(localStorage.getItem(__waRectKey) || 'null'); if (r && r.w) return r; } catch (e) {} return { x: 0.38, y: 0.0, w: 0.62, h: 1.0 }; }
function waSetRect(r) { try { localStorage.setItem(__waRectKey, JSON.stringify(r)); } catch (e) {} }
App.views.wa = async function () {
  const E = window.WAEngine, AI = window.WAAI, LIB = window.WALib, OCR = window.WAOCR;
  const cfg = waCfg();
  const myName = (function () { try { return localStorage.getItem('aufcl_wa_myname') || 'RAYMOND'; } catch (e) { return 'RAYMOND'; } })();
  setMain(pageHead('客户沟通分析', '一键抓取聊天画面 → 自动识别 → 判断客户意图 → 给出可直接发的回复', '') +
    '<div class="panel" style="padding:18px 20px;margin-bottom:14px">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
        '<button class="btn ghost" id="waPick" style="height:38px">🖥 ① 选择 WhatsApp 窗口（只点一次）</button>' +
        '<span id="waPickState" style="font-size:12.5px;color:#9C9486">未选择窗口</span>' +
      '</div>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:14px">' +
        '<button class="btn primary" id="waGo" style="height:46px;font-size:15px;padding:0 26px">🔍 ② 立即抓取并分析</button>' +
        '<label style="font-size:13px;display:flex;align-items:center;gap:6px" title="勾选后，每次抓取都会把新内容合并进累积文本，你滚动 WhatsApp 后连续点几次，就能拼出从聊天开始到现在的完整记录"><input type="checkbox" id="waAccumChk" checked> 累积多帧（滚动后连续抓取，拼出完整对话）</label>' +
        '<label style="font-size:13px;display:flex;align-items:center;gap:6px;font-weight:700;color:#0B2545" title="共享一次后全自动：按间隔连续抓帧→累积→识别→分析→（可选）AI深读→（可选）写回客户档案。全程只截屏，不点击、不发送、不操作 WhatsApp。"><input type="checkbox" id="waSuperChk"> 🚀 超级自动模式</label>' +
'<span id="waSuperOpts" style="display:flex;gap:10px;align-items:center;font-size:12px;color:#6E675B">' +
  '<label><input type="checkbox" id="waSupAi"> 自动AI深读</label>' +
  '<label><input type="checkbox" id="waSupSave" checked> 自动写回客户</label>' +
  '<label>间隔 <input id="waSupSec" class="input" type="number" value="8" min="3" step="1" style="width:58px"> 秒</label></span>' +
'<span id="waSuperStat" style="font-size:12px;color:#9C9486"></span>' +
'<label style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="waAutoChk"> 自动监控</label>' +
        '<button class="btn ghost tiny" id="waAccumClr">清空累积</button><span id="waAccumInfo" style="font-size:12px;color:#9C9486"></span>' +
        '<span style="font-size:12.5px;color:#9C9486">客户性别</span><select id="waGenderSel" class="input" style="max-width:120px"><option value="any">不指定</option><option value="male">男客户</option><option value="female">女客户</option></select>' +
        '<span style="font-size:12.5px;color:#9C9486;margin-left:8px">客户名</span><input id="waCustName" class="input" list="waCustList" placeholder="输入客户名（自动定位会话）" style="max-width:220px"><datalist id="waCustList"></datalist>' +
        '<span style="font-size:12.5px;color:#9C9486;margin-left:8px">话术分类</span><select id="waCat" class="input" style="max-width:130px"><option value="">不分类</option><option>价格谈判</option><option>交期承诺</option><option>质量保证</option><option>清关政策</option><option>关系维护</option><option>成交推进</option><option>异常处理</option></select>' +
        '<button class="btn ghost" id="waToneQuick">换一种说法</button>' +
        '<span id="waHint" style="font-size:12.5px;color:#9C9486"></span>' +
      '</div>' +
      '<div style="font-size:12px;color:#6E675B;margin-top:10px;background:#F8F4EC;border:1px dashed #E5DDCB;border-radius:8px;padding:8px 11px;line-height:1.7">' +
        '<b>零风险：</b>只截取你屏幕的画面来识别文字，<b>不登录、不点击、不发送、不操作 WhatsApp</b>，没有任何自动化行为，不触发封号规则。' +
        '<br><b>怎么用：</b>点 ① 选 WhatsApp 窗口（只授权一次）→ 之后每次点 ② 就自动识别并分析；勾选「自动监控」可让它自己盯着聊天。' +
      '</div>' +
    '</div>' +
    '<div id="waPreview"></div>' +
    '<div id="waOut"></div>' +
    '<details class="panel" style="padding:14px 18px;margin-top:14px"><summary style="cursor:pointer;font-size:13.5px;font-weight:600;color:#6E675B">高级设置（识别区域 · AI 引擎 · 语言 · 话术库 · 写回客户 · 手动粘贴）</summary>' +
      '<div style="margin-top:14px">' +
        '<div class="wa-row"><span style="font-size:12.5px;color:#9C9486">识别区域</span>' +
        '<select id="waRectSel" class="input" style="max-width:280px">' +
        '<option value="chat">WhatsApp 聊天区（右侧 62%，推荐）</option><option value="all">整个窗口</option><option value="custom">自定义比例</option></select>' +
        '<span id="waRectCustom" style="display:none"><input id="waRX" class="input" style="width:70px" value="0.38"> <input id="waRY" class="input" style="width:70px" value="0"> <input id="waRW" class="input" style="width:70px" value="0.62"> <input id="waRH" class="input" style="width:70px" value="1"></span>' +
        '</div>' +
        '<div class="wa-row"><span style="font-size:12.5px;color:#9C9486">识别语言</span><select id="waOcrLang" class="input" style="max-width:190px"><option value="eng">英文（快，约 11MB）</option><option value="eng+chi_sim">英文+简体中文（约 32MB）</option></select>' +
        '<span style="font-size:12.5px;color:#9C9486;margin-left:8px">我的名字</span><input id="waMyName" class="input" value="' + esc(myName) + '" style="max-width:180px"></div>' +
        '<div class="wa-row"><span style="font-size:12.5px;color:#9C9486">AI 引擎</span><select id="waProv" class="input" style="max-width:280px">' +
        '<option value="local">本地规则（免费·离线·不外发）</option>' +
        Object.keys(AI ? AI.PROVIDERS : {}).map(function (k) { return '<option value="' + k + '"' + ((cfg.provider || 'free') === k ? ' selected' : '') + '>' + esc(AI.PROVIDERS[k].zh) + (AI.PROVIDERS[k].needKey ? '（需 Key）' : '（免密钥）') + '</option>'; }).join('') +
        '</select>' +
        '<span style="font-size:12.5px;color:#9C9486;margin-left:8px">回复语言</span><select id="waLang" class="input" style="max-width:160px">' +
        [['en', '英文 English'], ['yue', '粤语 廣東話'], ['es', '西班牙语'], ['ar', '阿拉伯语'], ['pt', '葡萄牙语']].map(function (x) { return '<option value="' + x[0] + '"' + (__waLang === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></div>' +
        '<div class="wa-row"><span style="font-size:12.5px;color:#9C9486">API Key</span><input id="waKey" class="input" style="max-width:320px" placeholder="免费通道可留空" value="' + esc(cfg.key || '') + '">' +
        '<span style="font-size:12.5px;color:#9C9486;margin-left:8px">模型</span><input id="waModel" class="input" style="max-width:200px" placeholder="留空默认" value="' + esc(cfg.model || '') + '">' +
        '<span style="font-size:12.5px;color:#9C9486;margin-left:8px">国家</span><input id="waCountry" class="input" style="max-width:130px" placeholder="Australia">' +
        '<button class="btn ghost" id="waTest" style="margin-left:8px">测试通道</button><span id="waTestMsg" style="font-size:12px;color:#9C9486"></span></div>' +
        '<div style="margin-top:12px;font-size:12.5px;color:#9C9486">手动粘贴聊天内容（不想抓屏就用这个，识别率 100%）</div>' +
        '<textarea id="waText" style="width:100%;min-height:110px;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;border:1px solid #E5DDCB;border-radius:8px;padding:10px;background:#FDFBF6"></textarea>' +
        '<div class="wa-row"><button class="btn ghost" id="waPaste">用这段文本分析</button><button class="btn ghost" id="waExample">载入示例</button><button class="btn ghost" id="waClear">清空</button></div>' +
        '<div style="margin-top:14px"><div style="font-size:12.5px;color:#9C9486;margin-bottom:6px">话术库</div>' +
        '<div class="wa-row"><input id="waLibQ" class="input" placeholder="搜索…" style="max-width:220px"><button class="btn ghost" id="waLibSearch">搜索</button><button class="btn ghost" id="waLibExp">导出</button><button class="btn ghost" id="waLibImp">导入</button><span id="waLibHint" style="font-size:12px;color:#9C9486"></span></div>' +
        '<div id="waLibList" style="margin-top:10px"></div></div>' +
        '<div style="margin-top:14px"><div style="font-size:12.5px;color:#9C9486;margin-bottom:6px">客户库 · 多客户批量导出</div>' +
        '<div class="wa-row"><button class="btn ghost" id="waRecExport">📄 导出选中客户（合并 PDF）</button><button class="btn ghost" id="waRecAll">全选</button><button class="btn ghost" id="waRecClear">清空数据</button><span id="waRecHint" style="font-size:12px;color:#9C9486"></span></div>' +
        '<div id="waRecList" style="margin-top:10px"></div></div>' +
        '<div style="margin-top:14px"><div style="font-size:12.5px;color:#9C9486;margin-bottom:6px">写入客户档案</div>' +
        '<div class="wa-row"><select id="waCust" class="input" style="max-width:320px"><option value="">加载中…</option></select><button class="btn ghost" id="waSave">写入跟进记录</button><span id="waSaveHint" style="font-size:12px;color:#9C9486"></span></div></div>' +
      '</div>' +
    '</details>');
  const $ = function (id) { return document.getElementById(id); };
  const out = $('waOut');
  function say(t, k) { const h = $('waHint'); if (h) { h.textContent = t || ''; h.style.color = k === 'err' ? '#B3261E' : (k === 'ok' ? '#1B7F4B' : '#9C9486'); } }
  function status(t, k) { const el = $('waPickState'); if (el) { el.textContent = t; el.style.color = k === 'ok' ? '#1B7F4B' : (k === 'err' ? '#B3261E' : '#9C9486'); } }
  function curRect() {
    const sel = ($('waRectSel') || {}).value || 'chat';
    if (sel === 'all') return { x: 0, y: 0, w: 1, h: 1 };
    if (sel === 'custom') return { x: Number(($('waRX') || {}).value) || 0, y: Number(($('waRY') || {}).value) || 0, w: Number(($('waRW') || {}).value) || 1, h: Number(($('waRH') || {}).value) || 1 };
    return { x: 0.38, y: 0, w: 0.62, h: 1 };
  }
  function curCfg() {
    return { provider: (($('waProv') || {}).value || 'local'), key: (($('waKey') || {}).value || '').trim(), model: (($('waModel') || {}).value || '').trim(),
      lang: ($('waLang') || {}).value || 'en', tone: __waTone, country: (($('waCountry') || {}).value || '').trim(), gender: __waGender, month: (new Date().getMonth() + 1) };
  }
  function transcript() { return __waMsgs.map(function (m) { return (m.who === 'them' ? 'Customer' : 'Us') + (m.t ? (' [' + m.t + ']') : '') + ': ' + m.text; }).join(String.fromCharCode(10)); }
  function sigOf(t) { return String(t).replace(/\s+/g, '').slice(0, 4000); }
  function analyzeMsgs(list, fromOcr) {
    __waMsgs = list;
    if (!__waMsgs.length) { say('没识别出对话，换个区域或改用粘贴', 'err'); return false; }
    __waAn = E.analyze(__waMsgs);
    __waScore = E.score(__waMsgs, __waAn);
    __waFunnel = E.funnel(__waMsgs, __waAn);
    render();
    say((fromOcr ? '已抓取识别 ' : '已分析 ') + __waMsgs.length + ' 条消息 · ' + __waScore.total + ' 分 ' + __waScore.grade + ' 级 · ' + __waFunnel.name, 'ok');
    return true;
  }
  function analyzeText(txt, fromOcr) {
    const mn = (($('waMyName') || {}).value || 'RAYMOND');
    try { localStorage.setItem('aufcl_wa_myname', mn); } catch (e) {}
    __waMsgs = E.parse(txt, [mn]);
    if (!__waMsgs.length) { say('没识别出对话，换个区域或改用粘贴', 'err'); return false; }
    __waAn = E.analyze(__waMsgs);
    __waScore = E.score(__waMsgs, __waAn);
    __waFunnel = E.funnel(__waMsgs, __waAn);
    __waSig = sigOf(txt);
    render();
    say((fromOcr ? '已抓取识别 ' : '已分析 ') + __waMsgs.length + ' 条消息 · ' + __waScore.total + ' 分 ' + __waScore.grade + ' 级 · ' + __waFunnel.name, 'ok');
    return true;
  }
  async function ensureSess() {
    if (__waSess && __waSess.alive()) return __waSess;
    status('正在等待你选择窗口…');
    __waSess = await OCR.startCapture();
    status('✅ 已连接（' + __waSess.width + '×' + __waSess.height + '）· 之后不用再选', 'ok');
    return __waSess;
  }
  async function grabAndAnalyze(auto) {
    if (__waBusy) return;
    __waBusy = true;
    try {
      if (__waSess && __waSess.ended && __waSess.ended()) { __waSess = null; status('⚠ 共享已断开，请重新点 ① 选择窗口', 'err'); }
      const sess = await ensureSess();
      const opt = { langs: ($('waOcrLang') || {}).value || 'eng', maxWidth: 1400 };
      const tAll = Date.now();
      say('正在识别屏幕…（首次需下载识别模型）');
      /* ① 先整屏识别，确认是不是 WhatsApp 会话界面（否则拒绝分析） */
      const fullBlob = await sess.grab({ x: 0, y: 0, w: 1, h: 1 });
      let fullText = '';
      try { const fr = await OCR.imageToRich(fullBlob, opt); fullText = fr.text || ''; } catch (e) { fullText = await OCR.imageToText(fullBlob, opt); }
      const det = E.detectApp(fullText);
      if (!det.ok) {
        if (auto) { say('自动监控：当前画面不是 WhatsApp 会话，已跳过本次'); return; }
        const other = det.other ? ('当前识别到：' + det.other.appZh) : ('未识别出会话特征（命中 ' + det.score + ' 项）');
        say('❌ 这不是 WhatsApp 会话界面，已停止分析。' + other + ' —— 请把 WhatsApp 窗口切到前台（私聊或群聊都可以）再点一次。', 'err');
        renderOops(det);
        return;
      }
      /* ② 如填了客户名，先在整屏里找这个客户，找不到就提示滚动 */
      const wantName = String(($('waCustName') || {}).value || '').trim();
      if (wantName) {
        const found = E.findCustomer(fullText, wantName);
        if (!found.found) {
          if (auto) { say('自动监控：当前屏幕未显示客户「' + wantName + '」，继续等待…'); return; }
          say('⚠ 已识别为 WhatsApp，但当前屏幕里没找到「' + wantName + '」。请在 WhatsApp 左侧会话列表里滚动/搜索到该客户（或打开他的聊天）后，再点一次抓取。', 'err');
          renderFindFail(wantName, fullText);
          return;
        }
        if (found.found === 'partial') say('已在屏幕上找到「' + wantName + '」的部分词（' + found.hit + '/' + found.total + '），继续分析…');
      }
      /* ③ 再抓聊天区做对话分析 */
      say('已确认 WhatsApp 界面，正在识别聊天内容…');
      const blob = await sess.grab(curRect(), { maxWidth: 1400 });
      /* 实时预览：让用户看到「锁定的就是这个画面」 */
      (function(){ var pv = $('waPreview'); if (!pv) return; var url = URL.createObjectURL(blob);
        pv.innerHTML = '<div style="margin-top:12px;padding:10px;border:1px solid #E5DDCB;border-radius:10px;background:#FDFBF6">' +
          '<div style="font-size:12px;color:#6E675B;margin-bottom:6px">🔒 已锁定共享窗口（' + sess.width + '×' + sess.height + '）· 正在分析的画面：</div>' +
          '<img src="' + url + '" style="max-width:100%;max-height:190px;border-radius:8px;border:1px solid #E5DDCB;display:block">' +
          '<div style="font-size:11.5px;color:#9C9486;margin-top:5px">如果这张图是黑的/不是聊天内容 → 把 WhatsApp 窗口切到前台可见位置，再点 ②</div></div>'; })();
      let txt = '', bubbles = null;
      try {
        const rich = await OCR.imageToRich(blob, opt);
        txt = rich.text || '';
        bubbles = E.fromBubbles(rich);   /* 按左右气泡自动区分「客户/我方」 */
      } catch (e) { txt = await OCR.imageToText(blob, opt); }
      if (!txt || txt.trim().length < 8) { if (!auto) say('画面里没识别到文字，确认聊天窗口在前面、区域选对', 'err'); return; }
      if (auto && sigOf(txt) === __waSig) return;   /* 自动模式：内容没变就不打扰 */
      var accumOn = $('waAccumChk') ? $('waAccumChk').checked : true;
      var useTxt = txt;
      if (accumOn) { __waAccum = waMergeText(__waAccum, txt); useTxt = __waAccum; } else { __waAccum = txt; }
      var info = $('waAccumInfo');
      if (info) info.textContent = '累积 ' + String(useTxt).split(String.fromCharCode(10)).filter(Boolean).length + ' 行';
      if (bubbles && bubbles.length >= 2 && !accumOn) analyzeMsgs(bubbles, true);
      else analyzeText(useTxt, true);
      say('识别完成 · 共 ' + ((Date.now() - tAll) / 1000).toFixed(1) + ' 秒', 'ok');
    } catch (e) { if (!auto) say('失败：' + e.message, 'err'); }
    finally { __waBusy = false; }
  }
  function renderOops(det) {
    out.innerHTML = '<div class="panel" style="padding:20px 18px"><div style="font-size:16px;font-weight:700;color:#B3261E;margin-bottom:8px">❌ 当前不是 WhatsApp 会话界面</div>' +
      '<div style="font-size:13px;color:#3D3932;line-height:1.8">系统只分析 WhatsApp 的私聊或群聊界面，避免把别的软件误当聊天内容分析。<br>' +
      (det && det.other ? ('检测到的界面：<b>' + esc(det.other.appZh) + '</b>（特征命中 ' + det.other.n + ' 项）<br>') : ('界面特征命中 ' + (det ? det.score : 0) + ' 项，不足以确认为 WhatsApp<br>')) +
      '请这样操作：① 切到 WhatsApp 网页版/客户端 ② 打开要分析的客户私聊或群聊 ③ 再点「② 立即抓取并分析」。</div></div>';
  }
  function renderFindFail(name, fullText) {
    var names = (fullText || '').split(String.fromCharCode(10)).map(function (x) { return x.trim(); }).filter(function (x) { return x.length >= 3 && x.length <= 40; }).slice(0, 14);
    out.innerHTML = '<div class="panel" style="padding:20px 18px"><div style="font-size:16px;font-weight:700;color:#B26A00;margin-bottom:8px">⚠ 已确认是 WhatsApp，但没找到「' + esc(name) + '」</div>' +
      '<div style="font-size:13px;color:#3D3932;line-height:1.8">请在 WhatsApp 左侧会话列表里滚动或搜索到该客户，打开他的聊天，再点一次抓取。<br>' +
      (names.length ? ('当前屏幕上识别到的文字（前 14 行，可对照确认）：<div style="margin-top:8px;font-size:12px;color:#6E675B;background:#F8F4EC;border-radius:8px;padding:8px 10px;line-height:1.7">' + names.map(function (x) { return esc(x); }).join('<br>') + '</div>') : '') +
      '</div></div>';
  }
  function render() {
    if (!__waAn) { out.innerHTML = ''; return; }
    const a = __waAn, E2 = window.WAEngine;
    let rep = a.ai ? { parts: a.parts || [], fullEn: a.fullEn || '' } : E2.reply(a, { tone: __waTone, gender: __waGender, month: (new Date().getMonth() + 1) });
    try { if (E2.personalize && !a.ai) rep = E2.personalize(rep, __waMsgs, a) || rep; } catch (e2) {}
    window.__waRep = rep;
    const top = rep.parts.slice(0, a.ai ? 3 : 3);
    const evs = E.evidence(__waMsgs);
    const perMsg = E.replyPerMessage(__waMsgs, { gender: __waGender });
    window.__waPer = perMsg;
    out.innerHTML = '<div class="panel" style="padding:16px 18px;margin-bottom:14px">' +
      (__waScore ? ('<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;padding-bottom:10px;border-bottom:1px dashed #E5DDCB">' +
        '<div style="display:flex;align-items:baseline;gap:6px"><span style="font-size:34px;font-weight:800;color:' + (__waScore.grade === 'A' ? '#1B7F4B' : (__waScore.grade === 'B' ? '#0B2545' : (__waScore.grade === 'C' ? '#A87428' : '#B3261E'))) + '">' + __waScore.total + '</span><span style="font-size:12px;color:#9C9486">/100 · ' + __waScore.grade + ' 级</span></div>' +
        '<span class="wa-tag" style="background:#F2F5FA">' + esc(__waScore.zh) + '</span>' +
        (__waFunnel ? '<span class="wa-tag" style="background:#E7D6A8;color:#0B2545">进度：' + esc(__waFunnel.name) + '（' + (__waFunnel.step + 1) + '/' + (__waFunnel.max + 1) + '）</span>' : '') +
        '<span style="font-size:12px;color:#6E675B">' + esc(__waScore.action) + '</span>' +
        '<button class="btn ghost" id="waPdf" style="margin-left:auto">📄 导出中文 PDF</button>' +
        '<button class="btn ghost" id="waSaveRec">💾 存入客户库</button></div>') : '') +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">' +
        '<span style="font-size:17px;font-weight:700;color:#191713">' + esc(a.stageZh || a.stage || '') + '</span>' +
        '<span class="wa-tag" style="background:' + (a.sentiment === 'negative' ? '#FBF1EE' : (a.sentiment === 'positive' ? '#F2F8F4' : '#FDF7E9')) + '">' + esc(a.sentimentZh || a.sentiment || '') + '</span>' +
        (a.concerns || []).map(function (c) { return '<span class="wa-tag">' + esc(c) + '</span>'; }).join('') +
        '<button class="btn ghost" id="waAI2" style="margin-left:auto">✨ 用 AI 深读一遍</button>' +
      '</div>' +
      (a.reading ? '<div style="font-size:13.5px;line-height:1.75;color:#3D3932;background:#FBF7F0;border-left:3px solid #C8A27A;border-radius:0 8px 8px 0;padding:10px 13px"><b>客户真实想法：</b>' + esc(a.reading) + '</div>' : '') +
      (evs.length ? '<div style="margin-top:10px"><div style="font-size:12.5px;font-weight:700;color:#0B2545;margin-bottom:6px">🔍 判断依据（客户原话 → 专业解读）</div>' + evs.map(function (e) { return '<div style="font-size:12.5px;line-height:1.65;margin-bottom:6px;padding-left:10px;border-left:2px solid #C8A24A"><div style="color:#3D3932">“' + esc(e.quote) + '”</div><div style="color:#A87428">→ ' + esc(e.why) + '</div></div>'; }).join('') + '</div>' : '') +
      (a.risk ? '<div style="font-size:12.5px;color:#B26A00;margin-top:8px"><b>风险：</b>' + esc(a.risk) + '</div>' : '') +
      '</div>' +
      '<div class="panel" style="padding:16px 18px"><div style="font-size:13.5px;font-weight:700;color:#6E675B;margin-bottom:10px">建议回复（点文字直接复制）</div>' +
      top.map(function (p, i) {
        return '<div style="border:1px solid #E5DDCB;border-radius:10px;padding:12px 14px;margin-bottom:9px;background:#fff">' +
          '<div class="wa-en" data-wacopy="' + i + '" title="点击复制" style="cursor:pointer">' + esc(p.en) + '</div>' +
          (p.zh ? '<div class="wa-zh">' + esc(p.zh) + '</div>' : '') +
          '<div class="wa-row"><button class="btn ghost tiny" data-wacopy="' + i + '">复制</button><button class="btn ghost tiny" data-act="wa-adopt" data-wai2="' + i + '">采纳入库</button></div></div>';
      }).join('') +
      '<div class="wa-row"><button class="btn ghost" data-act="wa-copyall">复制全文</button>' +
      '<button class="btn ghost" data-act="wa-savequick">写入客户跟进</button>' +
      (rep.parts.length > 3 ? '<button class="btn ghost" data-act="wa-more">显示全部 ' + rep.parts.length + ' 段</button>' : '') + '</div>' +
      (a.ai ? '' : '<div style="font-size:11.5px;color:#9C9486;margin-top:8px">以上由本地规则引擎生成（免费、离线）。点右上「✨ 用 AI 深读一遍」可获得更贴上下文的版本。</div>') +
      '</div>' +
      (perMsg.length ? '<div class="panel" style="padding:16px 18px;margin-top:14px"><div style="font-size:13.5px;font-weight:700;color:#6E675B;margin-bottom:10px">🗣 逐句一对一回复（客户每句话 → 对应怎么答）</div>' +
        perMsg.map(function (p, i) { return '<div style="border:1px solid #E5DDCB;border-radius:10px;padding:11px 13px;margin-bottom:9px;background:#fff">' +
          '<div style="font-size:11.5px;color:#9C9486;margin-bottom:5px">客户说（' + esc(p.intentZh) + '）：' + esc(p.text.slice(0, 110)) + '</div>' +
          '<div class="wa-en" data-wacopy3="' + i + '" style="cursor:pointer">' + esc(p.reply) + '</div>' +
          '<div class="wa-zh">' + esc(p.zh) + '</div>' +
          '<div class="wa-row"><button class="btn ghost tiny" data-wacopy3="' + i + '">复制这句</button></div></div>'; }).join('') + '</div>' : '') +
      '' +
    '</div>' +
    (window.__waShowMsgs ? ('<div class="panel" style="padding:14px 18px;margin-top:12px"><div style="font-size:12.5px;color:#9C9486;margin-bottom:8px">识别到的对话（点一条可切换「客户/我」）</div>' +
      __waMsgs.map(function (m, i) { return '<div class="wa-msg ' + (m.who === 'them' ? 'them' : 'me') + '" data-wai="' + i + '"><span class="who">' + (m.who === 'them' ? '客户' : '我') + '</span><span class="tx">' + esc(m.text) + '</span><span class="tm">' + esc(m.t || '') + '</span></div>'; }).join('') + '</div>') : '');
  }
  async function runAI() {
    if (__waBusy) return;
    const c = curCfg();
    if (c.provider === 'local') { alert('请先在「高级设置」把 AI 引擎切到某个 AI 通道（默认「免费在线 AI（免密钥）」）'); return; }
    if (!__waMsgs.length) { say('请先抓取或粘贴聊天内容', 'err'); return; }
    waSaveCfg(c); __waLang = c.lang; __waBusy = true;
    say('AI 正在阅读并生成…（约 20~60 秒，免费通道较慢）');
    try {
      const an = await AI.analyze(transcript(), c);
      an.country = c.country; an.tone = c.tone; an.lang = c.lang;
      __waAn = an; render(); say('AI 分析完成 · ' + (an.provider === 'free' ? '免费通道' : an.provider), 'ok');
    } catch (e) { say('AI 失败：' + e.message + '（可重试或继续用本地规则）', 'err'); }
    __waBusy = false;
  }
  $('waPick').onclick = async function () {
    try { if (__waSess) { __waSess.stop(); __waSess = null; } await ensureSess(); } catch (e) { status('未能连接：' + e.message, 'err'); }
  };
  $('waGo').onclick = function () { grabAndAnalyze(false); };
  $('waToneQuick').onclick = function () {
    if (!__waAn) { say('请先抓取分析', 'err'); return; }
    __waTone = __waTone === 'steady' ? 'push' : (__waTone === 'push' ? 'warm' : 'steady');
    if (__waAn.ai) runAI(); else render();
    say('已切换语气：' + (window.WAEngine.TONES[__waTone] || {}).zh, 'ok');
  };
  /* ===== 🚀 超级自动模式：连续抓帧 → 累积 → 分析 → 可选 AI → 可选写回 ===== */
  let __supTimer = null, __supCount = 0, __supLast = 0;
  function supStat(t) { var el = $('waSuperStat'); if (el) el.textContent = t || ''; }
  function supStart() {
    supStop();
    const sec = Math.max(3, Number(($('waSupSec') || {}).value) || 8);
    __supCount = 0;
    supStat('运行中：每 ' + sec + ' 秒自动抓帧（' + new Date().toLocaleTimeString() + ' 启动）');
    __supTimer = setInterval(async function () {
      if (__waBusy) return;
      __supCount++;
      try { await grabAndAnalyze(true); } catch (e) {}
      __supLast = Date.now();
      const lines = String(__waAccum || '').split(String.fromCharCode(10)).filter(Boolean).length;
      supStat('已抓 ' + __supCount + ' 次 · 累积 ' + lines + ' 行 · ' + new Date().toLocaleTimeString());
      /* 自动 AI 深读：仅当开启且上一轮分析完成 */
      if ($('waSupAi') && $('waSupAi').checked && __waAn && !__waBusy) {
        const key = (__waAn.stage || '') + '|' + ((__waAn.parts || []).length);
        if (key !== window.__supAiKey) { window.__supAiKey = key; runAI(); }
      }
      /* 自动写回客户档案 */
      if ($('waSupSave') && $('waSupSave').checked && __waAn && ($('waCust') || {}).value) {
        try { await saveToCustomer(); } catch (e) {}
      }
    }, sec * 1000);
  }
  function supStop() { if (__supTimer) { clearInterval(__supTimer); __supTimer = null; supStat('已停止'); } }
  const _sup = $('waSuperChk');
  if (_sup) _sup.onchange = function () { this.checked ? supStart() : supStop(); };
  $('waAutoChk').onchange = function () {
    if (__waAuto) { clearInterval(__waAuto); __waAuto = null; }
    if (this.checked) {
      const sec = Math.max(5, Number(($('waAutoSec') || {}).value) || 15);
      __waAuto = setInterval(function () { grabAndAnalyze(true); }, sec * 1000);
      say('自动监控已开启：每 ' + sec + ' 秒检测一次，聊天有变化才重新分析', 'ok');
      grabAndAnalyze(true);
    } else say('自动监控已关闭');
  };
  $('waRectSel').onchange = function () { $('waRectCustom').style.display = this.value === 'custom' ? '' : 'none'; };
  $('waPaste').onclick = function () { const t = ($('waText') || {}).value || ''; if (!t.trim()) { say('请先粘贴内容', 'err'); return; } analyzeText(t, false); };
  $('waExample').onclick = function () { $('waText').value = ['12/10/2026, 09:12 - Sarah (Melbourne): Hi Raymond, got the quote for the 40HQ to Melbourne, thanks.', '12/10/2026, 09:13 - Sarah (Melbourne): But honestly it is a bit too expensive compared to another forwarder who quoted me 2,150 all in.', '12/10/2026, 09:20 - RAYMOND: Thanks Sarah, let me break it down for you.', '12/10/2026, 10:02 - Sarah (Melbourne): Also, last shipment was delayed 6 days and my customer was not happy.', '13/10/2026, 08:30 - Sarah (Melbourne): Can you do better on the price? If the price works we can place the order this week.'].join(String.fromCharCode(10)); analyzeText($('waText').value, false); };
  const _accClr = $('waAccumClr');
  if (_accClr) _accClr.onclick = function () { __waAccum = ''; const i = $('waAccumInfo'); if (i) i.textContent = '已清空累积'; say('累积记录已清空，下次抓取重新开始', 'ok'); };
  $('waClear').onclick = function () { $('waText').value = ''; __waAn = null; out.innerHTML = ''; say(''); };
  $('waTest').onclick = async function () { const c = curCfg(); waSaveCfg(c); const el = $('waTestMsg'); el.textContent = '测试中…'; try { const r = await AI.test(c); el.textContent = '✅ ' + String(r).slice(0, 30); } catch (e) { el.textContent = '❌ ' + e.message.slice(0, 60); } };
  document.addEventListener('click', async function (ev) {
    const t = ev.target.closest ? ev.target.closest('[data-act],[data-wacopy],[data-wai],[data-wacopy2]') : null;
    if (!t) return;
    const act = t.getAttribute('data-act'), cp = t.getAttribute('data-wacopy'), mi = t.getAttribute('data-wai'), cp2 = t.getAttribute('data-wacopy2');
    if (act === 'wa-adopt') { const i = Number(t.getAttribute('data-wai2')); const p = (window.__waRep || {}).parts[i]; if (!p) return; const c = curCfg(); LIB.add({ stage: __waAn.stage, stageZh: __waAn.stageZh, country: c.country, product: '', tone: c.tone, lang: c.lang, cat: (($('waCat') || {}).value || ''), note: '', en: p.en, zh: p.zh }); say('已采纳入库' + ((($('waCat') || {}).value) ? (' · 分类：' + $('waCat').value) : ''), 'ok'); renderLib(); }
    else if (act === 'wa-copyall') { try { await navigator.clipboard.writeText((window.__waRep || {}).fullEn || ''); say('已复制全文', 'ok'); } catch (e) { say('复制失败', 'err'); } }
    else if (act === 'wa-more') { window.__waShowMsgs = !window.__waShowMsgs; const rep = window.__waRep; out.querySelectorAll('.panel').forEach(function (p, i) { }); render(); }
    else if (act === 'wa-savequick') { if (!__waAn) return; await saveToCustomer(); }
    else if (cp != null && window.__waRep) { try { await navigator.clipboard.writeText(window.__waRep.parts[Number(cp)].en); say('已复制该段', 'ok'); } catch (e) { say('复制失败', 'err'); } }
    else if (t.getAttribute('data-wacopy3') != null) { var ci = Number(t.getAttribute('data-wacopy3')); var pm = (window.__waPer || [])[ci]; if (pm) { try { await navigator.clipboard.writeText(pm.reply); say('已复制这句回复', 'ok'); } catch (e) { say('复制失败', 'err'); } } }
    else if (mi != null) { const i = Number(mi); if (__waMsgs[i]) { __waMsgs[i].who = __waMsgs[i].who === 'them' ? 'me' : 'them'; if (__waAn && !__waAn.ai) __waAn = window.WAEngine.analyze(__waMsgs); render(); } }
  });
  document.addEventListener('change', function (ev) {
    if (ev.target && ev.target.id === 'waGenderSel') { __waGender = ev.target.value; if (__waAn) { if (__waAn.ai) runAI(); else render(); } }
  });
  function renderRecs() {
    var el = $('waRecList'); if (!el) return;
    var list = window.WARecs ? WARecs.all() : [];
    if (!list.length) { el.innerHTML = '<div style="font-size:12px;color:#9C9486">客户库为空：分析后点结果区的「💾 存入客户库」。</div>'; return; }
    el.innerHTML = list.map(function (x) { var sc = x.score || {}, fn = x.funnel || {}; return '<label style="display:flex;gap:8px;align-items:center;border:1px solid #E5DDCB;border-radius:8px;padding:8px 11px;margin-bottom:6px;font-size:12.5px;cursor:pointer">' +
      '<input type="checkbox" class="wa-rec-chk" value="' + esc(x.id) + '" style="flex:0 0 auto">' +
      '<span style="flex:1"><b>' + esc(x.cust || '未命名') + '</b>' + (x.country ? ' · ' + esc(x.country) : '') + ' · <span style="color:#0B2545;font-weight:700">' + (sc.total || '-') + ' 分 ' + (sc.grade || '') + '</span> · ' + esc(fn.name || '') + ' · ' + (x.msgs || []).length + ' 条 · ' + new Date(x.at || Date.now()).toLocaleString() + '</span>' +
      '<button class="btn ghost tiny" data-recdel="' + esc(x.id) + '">删除</button></label>'; }).join('');
    el.querySelectorAll('[data-recdel]').forEach(function (b) { b.onclick = function (ev2) { ev2.preventDefault(); ev2.stopPropagation(); WARecs.remove(b.getAttribute('data-recdel')); renderRecs(); }; });
  }
  document.addEventListener('click', function (ev) {
    var id = ev.target && ev.target.id;
    if (id === 'waSaveRec') {
      if (!__waAn) return;
      var sel = $('waCust'); var custName = (sel && sel.value) ? sel.options[sel.selectedIndex].text : '';
      if (!custName) { var c = prompt('客户名称（用于客户库标识）：', ''); if (!c) return; custName = c; }
      WARecs.add({ cust: custName, country: (($('waCountry') || {}).value || ''), gender: __waGender, msgs: __waMsgs, an: __waAn, score: __waScore, funnel: __waFunnel, rep: window.__waRep });
      say('已存入客户库：' + custName + '（可在高级设置里批量导出）', 'ok'); renderRecs();
    }
    if (id === 'waRecExport') {
      var ids = [].slice.call(document.querySelectorAll('.wa-rec-chk:checked')).map(function (c) { return c.value; });
      if (!ids.length) { alert('请先勾选要导出的客户'); return; }
      var recs = ids.map(function (i) { return WARecs.get(i); }).filter(Boolean);
      window.WAReport.openBatch(recs);
    }
    if (id === 'waRecAll') { document.querySelectorAll('.wa-rec-chk').forEach(function (c) { c.checked = true; }); }
    if (id === 'waRecClear') { if (confirm('清空客户库（不影响客户档案）？')) { WARecs.clearAll(); renderRecs(); } }
  });
  document.addEventListener('click', function (ev) {
    if (ev.target && ev.target.id === 'waPdf') {
      if (!__waAn) return;
      const rep0 = window.__waRep || { parts: [] };
      const custName = (function () { const s = document.getElementById('waCust'); if (!s || !s.value) return ''; const o = s.options[s.selectedIndex]; return o ? o.text : ''; })();
      window.WAReport.open({ customer: custName, country: (($('waCountry') || {}).value || ''), msgs: __waMsgs, an: __waAn, score: __waScore, funnel: __waFunnel, rep: rep0 });
    }
  });
  /* 换语气 / AI 按钮（动态生成的元素用委托） */
  document.addEventListener('click', function (ev) {
    if (ev.target && ev.target.id === 'waAI2') runAI();
  });
  async function saveToCustomer() {
    const id = ($('waCust') || {}).value;
    if (!id) { document.querySelector('details').open = true; say('请先在「高级设置 → 写入客户档案」里选择客户', 'err'); return; }
    const c = curCfg(), a = __waAn || {}, rep = window.__waRep || { parts: [], fullEn: '' };
    const note = { at: Date.now(), atText: new Date().toLocaleString(), source: '沟通分析', stage: a.stageZh || a.stage, sentiment: a.sentimentZh || a.sentiment, concerns: a.concerns || [], risk: a.risk || '', advice: a.stageAdvice || '', reading: a.reading || '', messages: __waMsgs.slice(-12).map(function (m) { return (m.who === 'them' ? '客户' : '我') + ': ' + m.text; }), suggestion: rep.fullEn || '' };
    try { const cur = await API.get('/api/customers/' + encodeURIComponent(id)); const rec = (cur && (cur.customer || cur.data || cur.item)) || cur || {}; rec.followUps = (rec.followUps || []).concat([note]); await API.put('/api/customers/' + encodeURIComponent(id), rec); say('✅ 已写入客户跟进记录（第 ' + rec.followUps.length + ' 条）', 'ok'); } catch (e) { say('写入失败：' + e.message.slice(0, 80), 'err'); }
  }
  function renderLib() {
    const q = (($('waLibQ') || {}).value || '').trim();
    const list = LIB.query(q ? { text: q } : {});
    const el = $('waLibList'); if (!el) return;
    if (!list.length) { el.innerHTML = '<div style="font-size:12px;color:#9C9486">话术库为空：分析后点「采纳入库」即可沉淀。</div>'; return; }
    el.innerHTML = list.slice(0, 30).map(function (x) { return '<div style="border:1px solid #E5DDCB;border-radius:8px;padding:9px 11px;margin-bottom:7px">' +
      '<div style="font-size:11.5px;color:#9C9486">' + (x.cat ? '<b style="color:#0B2545">[' + esc(x.cat) + ']</b> ' : '') + esc(x.stageZh || x.stage) + (x.country ? ' · ' + esc(x.country) : '') + ' · 用过 ' + (x.uses || 0) + ' 次 ' +
      '<button class="btn ghost tiny" data-libnote="' + x.id + '" style="margin-left:6px">编辑说明</button></div>' +
      '<div class="wa-en" data-wacopy2="' + x.id + '" style="cursor:pointer">' + esc(x.en || x.zh) + '</div>' +
      (x.note ? '<div style="font-size:11.5px;color:#A87428;margin-top:3px">说明：' + esc(x.note) + '</div>' : '') + '</div>'; }).join('');
    el.querySelectorAll('[data-libnote]').forEach(function (b) { b.onclick = function () { var id = b.getAttribute('data-libnote'); var cur = LIB.all().filter(function (y) { return y.id === id; })[0] || {}; var t = prompt('这条话术的说明（用途/适用客户/注意事项）：', cur.note || ''); if (t === null) return; LIB.update ? LIB.update(id, { note: t }) : (function(){ var all = LIB.all(); all.forEach(function (y) { if (y.id === id) y.note = t; }); try { localStorage.setItem('aufcl_wa_lib_v1', JSON.stringify(all)); } catch (e) {} })(); renderLib(); say('说明已保存', 'ok'); }; });
    el.querySelectorAll('[data-wacopy2]').forEach(function (d) { d.onclick = async function () { const id = d.getAttribute('data-wacopy2'); const it = LIB.all().filter(function (y) { return y.id === id; })[0]; if (it) { try { await navigator.clipboard.writeText(it.en || it.zh); LIB.use(id); say('已复制并计数', 'ok'); renderLib(); } catch (e) {} } }; });
  }
  $('waLibSearch').onclick = renderLib;
  $('waLibExp').onclick = function () { const b = new Blob([LIB.exportJson()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'wa-话术库.json'; a.click(); };
  $('waLibImp').onclick = function () { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json'; inp.onchange = function () { const f = inp.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = function () { try { const n = LIB.importJson(fr.result); say('导入 ' + n + ' 条', 'ok'); renderLib(); } catch (e) { say('导入失败', 'err'); } }; fr.readAsText(f); }; inp.click(); };
  $('waSave').onclick = saveToCustomer;
  (async function loadCust() { try { const r = await API.get('/api/customers'); const list = (r && (r.list || r.customers || r.items)) || []; const sel = $('waCust'); if (sel) sel.innerHTML = '<option value="">请选择客户…</option>' + list.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.company || c.name || c.id) + '</option>'; }).join(''); const dl = $('waCustList'); if (dl) dl.innerHTML = list.map(function (c) { return '<option value="' + esc(c.company || c.name || c.id) + '">'; }).join(''); } catch (e) {} })();
  renderLib(); renderRecs();
};
/* ============================== 帮助 ============================== */
App.views.help = async function () {
  const flow = Guide.steps.map(function (s) {
    return '<div class="help-step"><div class="hs-n">' + s.n + '</div><div class="hs-b"><div class="hs-t">' + s.t + '</div><div class="hs-d">' + s.d + '</div>' +
      '<div class="hs-x">' + ([
        '填写公司与澳洲收货信息；输入 4 位邮编会自动带出州 / 城区 / 卸货港与派送区。',
        '进入 3D 智能装柜模块录入客户给到的货物明细（可 Excel 导入），自动算体积、柜型、装柜率，一键保存回客户档案。',
        '系统按体积 / 重量 / 包装形态 / 收货地，推荐柜型与柜数、装柜作业要点、卸货港与派送方案、风险提示。',
        '进入 FCL 报价模块（客户与货物已自动预填），选定条款与利润率档位出价，一键把报价快照回存客户档案。',
        '检查档案完整度 → 立即备份 → 一键导出全部客户 PDF（满版无留白）或整库 JSON。'
      ][s.n - 1]) + '</div></div></div>';
  }).join('');
  setMain(pageHead('使用指南', '五分钟上手整套流程') +
    card('五步引导流程', '从客户到报价到归档', '<div class="help-flow">' + flow + '</div>') +
    '<div class="grid-2">' +
      card('常见问题', '',
        '<div class="faq"><b>Q：数据存在哪里？</b><div>本机 <code>data/db.json</code>，每次修改实时落盘，并自动快照到 <code>data/backups/</code>。不上云、不外传。</div></div>' +
        '<div class="faq"><b>Q：没有启动后端能用吗？</b><div>可以。系统会自动切换离线模式，数据暂存浏览器 localStorage；启动服务后新数据即写入 db.json。建议始终用 <code>启动系统.cmd</code> 启动以便备份与 PDF 导出。</div></div>' +
        '<div class="faq"><b>Q：PDF 导出留白怎么处理？</b><div>打印文档采用满版 A4 排版（@page margin 0），左右与底部均无白边；服务端导出用 Edge 无头模式直接生成 PDF 文件。</div></div>' +
        '<div class="faq"><b>Q：报价数字准吗？</b><div>报价模块内置中国拖车费模型 + 澳洲真实公路路网（2696 邮编 × 20 港 OSRM 里程）+ 目的港税费口径，与《澳洲 FCL 自动报价系统》完全一致。</div></div>' +
        '<div class="faq"><b>Q：装柜算得准吗？</b><div>3D 模块是按真实 6 姿态枚举 + 支撑 / 重心 / 作业空间约束的装箱引擎，装载结果可在 3D 视图逐件查看。</div></div>') +
      card('快捷键与技巧', '',
        '<ul class="pt-list">' +
        '<li class="pt info"><b>Ctrl + S：</b>在当前步骤保存（客户资料 / 货物 / 方案 / 报价）。</li>' +
        '<li class="pt info"><b>Alt + → / Alt + ←：</b>引导流程下一步 / 上一步。</li>' +
        '<li class="pt info"><b>/：</b>快速聚焦搜索框。</li>' +
        '<li class="pt info"><b>Esc：</b>关闭弹窗。</li>' +
        '<li class="pt info"><b>批量技巧：</b>先「生成示例数据」体验完整流程，再「清空全部客户数据」开始真实录入。</li>' +
        '</ul>' +
        '<h4 class="blk-t">📁 目录结构</h4>' +
        '<pre class="tree">' + TREE_TEXT + '</pre>'));
};
