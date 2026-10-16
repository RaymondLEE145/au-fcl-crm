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
