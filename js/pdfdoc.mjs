/* ============================================================================
 * pdfdoc.js —— 满版 A4 打印文档生成器（左右 + 底部零留白）
 *   · 每页固定 210mm × 297mm，@page margin:0，页眉/页脚色带直达纸张边缘
 *   · 内容区与页脚之间为「填充带」，保证任何页面底部都不是空白
 *   · 输出为自包含 HTML（内联样式 + 内联 Logo），可直接交服务端无头渲染
 * ==========================================================================*/
'use strict';

const PrintDoc = {
  /* -------------------------- 版面常量（mm） -------------------------- */
  A4: { w: 210, h: 297, head: 24, foot: 13, pad: 6 },
  bodyH: function () { return PrintDoc.A4.h - PrintDoc.A4.head - PrintDoc.A4.foot; },
  ROW_H: 6.2,

  esc: function (s) { return esc(s); },
  logo: function () { return window.AU_LOGO || ''; },

  /* --------------------------- 页面外壳 --------------------------- */
  page: function (o) {
    const p = o || {};
    const head = p.headHtml !== undefined ? p.headHtml :
      '<div class="p-head">' +
        '<div class="ph-left">' + (PrintDoc.logo() ? '<img class="ph-logo" src="' + PrintDoc.logo() + '" alt="logo">' : '') +
          '<div><div class="ph-t">' + esc(p.title || '') + '</div>' + (p.sub ? '<div class="ph-s">' + esc(p.sub) + '</div>' : '') + '</div></div>' +
        '<div class="ph-right">' + (p.right || '') + '</div>' +
      '</div>';
    const foot = p.footHtml !== undefined ? p.footHtml :
      '<div class="p-foot"><span class="pf-l">' + esc(p.footLeft || (App.state.settings.company || 'GlobalVertical') + ' · 澳洲 FCL 客户管理系统') + '</span>' +
        '<span class="pf-c">' + esc(p.footMid || '') + '</span>' +
        '<span class="pf-r">第 ' + (p.no || 1) + ' / ' + (p.total || 1) + ' 页</span></div>';
    return '<section class="page' + (p.cls ? ' ' + p.cls : '') + '">' +
        head +
        '<div class="p-body">' + (p.body || '') + '</div>' +
        '<div class="p-fill"></div>' +
        foot +
      '</section>';
  },

  /* --------------------------- 块：客户信息 --------------------------- */
  infoBlock: function (c) {
    const cells = [
      ['客户编号', c.id], ['公司名称', c.company], ['联系人', c.contact], ['联系电话', c.phone],
      ['邮箱', c.email], ['微信 / WhatsApp', c.wechat], ['国家', c.country || 'Australia'], ['州 / 领地', c.state],
      ['邮编', c.postcode], ['城区', c.suburb], ['建档时间', fmtDate(c.createdAt)], ['最近更新', fmtDate(c.updatedAt)],
      ['客户等级', c.level], ['客户来源', c.source], ['状态', statusZh(c.status)], ['档案完整度', CRM.completeness(c) + '%']
    ];
    return '<div class="blk"><div class="blk-t">一、客户基本信息</div>' +
      '<table class="grid-tbl"><tbody>' +
      (function () {
        let out = '';
        for (let i = 0; i < cells.length; i += 4) {
          out += '<tr>';
          for (let j = 0; j < 4; j++) {
            const x = cells[i + j];
            out += x ? '<th>' + esc(x[0]) + '</th><td>' + esc(x[1] || '—') + '</td>' : '<th></th><td></td>';
          }
          out += '</tr>';
        }
        return out;
      })() +
      '</tbody></table>' +
      (c.address ? '<div class="addr-row"><b>收货地址：</b>' + esc(c.address) + '</div>' : '') +
      (c.notes ? '<div class="addr-row"><b>备注 / 需求：</b>' + esc(c.notes) + '</div>' : '') +
      '</div>';
  },

  /* --------------------------- 块：货物明细 --------------------------- */
  cargoHeader: function () { return '<thead><tr><th style="width:7%">序号</th><th style="width:23%">品名</th><th style="width:8%">件数</th><th style="width:16%">尺寸 L×W×H (cm)</th><th style="width:9%">单重 kg</th><th style="width:8%">包装</th><th style="width:10%">体积 CBM</th><th style="width:10%">总重 kg</th><th style="width:9%">卸货站</th></tr></thead>'; },
  cargoRows: function (items) {
    return items.map(function (it, i) {
      const vol = num(it.qty) * num(it.L_cm) * num(it.W_cm) * num(it.H_cm) / 1e6;
      return '<tr><td class="c">' + (i + 1) + '</td><td>' + esc(it.name || '—') + '</td><td class="c">' + fmtInt(it.qty) + '</td>' +
        '<td class="c">' + fmtInt(it.L_cm) + '×' + fmtInt(it.W_cm) + '×' + fmtInt(it.H_cm) + '</td>' +
        '<td class="c">' + fmtNum(it.weight_kg, 1) + '</td><td class="c">' + esc(it.type || 'carton') + '</td>' +
        '<td class="c">' + fmtNum(vol, 3) + '</td><td class="c">' + fmtNum(num(it.weight_kg) * num(it.qty), 1) + '</td>' +
        '<td class="c">' + (num(it.unloadStop) > 1 ? '第' + num(it.unloadStop) + '站' : '—') + '</td></tr>';
    }).join('');
  },
  cargoTable: function (items, title) {
    return '<div class="blk"><div class="blk-t">' + esc(title) + '</div>' +
      '<table class="data-tbl">' + PrintDoc.cargoHeader() + '<tbody>' + PrintDoc.cargoRows(items) + '</tbody></table></div>';
  },
  cargoSummaryStrip: function (g) {
    const s = g.summary || CRM.cargoSummary(g.items);
    const cells = [
      ['件数', fmtInt(s.totalQty) + ' 件'], ['总体积', fmtNum(s.totalCbm, 3) + ' CBM'],
      ['总毛重', fmtNum(s.totalWeight, 1) + ' KG'], ['柜型', s.containerType || '待定'],
      ['装载率', s.utilization ? fmtNum(s.utilization * 100, 1) + '%' : '—']
    ];
    return '<div class="strip">' + cells.map(function (x) {
      return '<div class="strip-c"><span>' + x[0] + '</span><b>' + x[1] + '</b></div>';
    }).join('') + '</div>';
  },

  /* --------------------------- 块：方案推荐 --------------------------- */
  recBlock: function (r) {
    const res = r.result || {};
    const points = (res.loading || []).slice(0, 9).map(function (p) {
      return '<li><b>' + esc(p.t) + '：</b>' + esc(p.d) + '</li>';
    }).join('');
    const risks = (res.risks || []).slice(0, 6).map(function (p) {
      return '<li class="risk"><b>' + esc(p.t) + '：</b>' + esc(p.d) + '</li>';
    }).join('');
    const route = (res.route || []).map(function (p) {
      return '<tr><th>' + esc(p.t) + '</th><td>' + esc(p.d) + '</td></tr>';
    }).join('');
    return '<div class="blk"><div class="blk-t">三、整柜方案推荐（' + fmtDate(r.createdAt) + '）</div>' +
      '<div class="rec-line">' + esc(res.headline || '') + '</div>' +
      '<div class="strip">' +
        '<div class="strip-c"><span>柜型</span><b>' + esc(res.containerType || '—') + '</b></div>' +
        '<div class="strip-c"><span>柜数</span><b>' + (res.containerCount || 1) + '</b></div>' +
        '<div class="strip-c"><span>装载率</span><b>' + ((res.basis || {}).utilization || 0) + '%</b></div>' +
        '<div class="strip-c"><span>载重利用率</span><b>' + ((res.basis || {}).weightUtilization || 0) + '%</b></div>' +
        '<div class="strip-c"><span>派送区</span><b>' + esc(((res.delivery || {}).zone) || '—') + '</b></div>' +
      '</div>' +
      (route ? '<table class="kv-tbl"><tbody>' + route + '</tbody></table>' : '') +
      (points ? '<div class="sub-t">装柜作业要点</div><ul class="dot-list">' + points + '</ul>' : '') +
      (risks ? '<div class="sub-t">风险提示</div><ul class="dot-list">' + risks + '</ul>' : '') +
      '</div>';
  },

  /* --------------------------- 块：报价明细 --------------------------- */
  quoteBlock: function (q) {
    const rows = (q.rows || []).map(function (x, i) {
      return '<tr><td class="c">' + (i + 1) + '</td><td>' + esc(x.name || '') + '</td><td class="c">' + esc(x.unit || '') + '</td>' +
        '<td class="c">' + fmtInt(x.qty || 1) + '</td><td class="r">' + fmtNum(x.unitPrice, 2) + '</td><td class="r">' + fmtNum(x.amount, 2) + '</td></tr>';
    }).join('');
    const t = q.totals || {};
    return '<div class="blk"><div class="blk-t">四、整柜报价（' + esc(q.no || '') + ' · ' + fmtDate(q.createdAt) + '）</div>' +
      '<div class="strip">' +
        '<div class="strip-c"><span>柜型</span><b>' + esc(q.ctn || '—') + '</b></div>' +
        '<div class="strip-c"><span>条款 / 方式</span><b>' + esc(q.term || '') + ' / ' + esc(q.mode || '') + '</b></div>' +
        '<div class="strip-c"><span>利润率档位</span><b>' + fmtNum(num(q.tier) * 100, 1) + '%</b></div>' +
        '<div class="strip-c"><span>币种</span><b>' + esc(q.cur || 'AUD') + '</b></div>' +
      '</div>' +
      '<table class="data-tbl"><thead><tr><th style="width:7%">序号</th><th style="width:47%">费用项</th><th style="width:10%">单位</th><th style="width:10%">数量</th><th style="width:13%">单价</th><th style="width:13%">金额</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6" class="c">未回存明细行</td></tr>') +
      '</tbody></table>' +
      '<table class="total-tbl"><tbody><tr>' +
        '<th>成本</th><td>' + fmtMoney(t.cost, q.cur) + '</td>' +
        '<th>报价</th><td class="hl">' + fmtMoney(t.sell, q.cur) + '</td>' +
        '<th>毛利</th><td>' + fmtMoney(t.profit, q.cur) + '</td>' +
        '<th>毛利率</th><td>' + (num(t.cost) > 0 ? fmtNum(num(t.profit) / num(t.cost) * 100, 1) + '%' : '—') + '</td>' +
      '</tr></tbody></table></div>';
  },

  /* --------------------------- 块：时间线 --------------------------- */
  timelineBlock: function (c) {
    const list = (c.timeline || []).slice(-8).reverse();
    if (!list.length) return '';
    return '<div class="blk"><div class="blk-t">五、跟进时间线（最近 ' + list.length + ' 条）</div>' +
      '<table class="kv-tbl"><tbody>' + list.map(function (t) {
        return '<tr><th style="width:34mm">' + fmtDateTime(t.at) + '</th><td>' + esc(t.text || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  },

  /* --------------------------- 封面 --------------------------- */
  coverPage: function (opt, stats, total) {
    return PrintDoc.page({
      cls: 'cover', no: 1, total: total, headHtml: '<div class="cover-head"></div>', footHtml:
        '<div class="p-foot dark"><span class="pf-l">' + esc(App.state.settings.company || 'GlobalVertical') + '</span>' +
        '<span class="pf-c">满版 A4 · 210 × 297 mm · 左右与底部零留白</span>' +
        '<span class="pf-r">第 1 / ' + total + ' 页</span></div>',
      body:
        '<div class="cover-body">' +
          (PrintDoc.logo() ? '<img class="cover-logo" src="' + PrintDoc.logo() + '" alt="logo">' : '') +
          '<div class="cover-kicker">AUSTRALIA FCL · CUSTOMER DOSSIER</div>' +
          '<h1 class="cover-title">澳洲整柜客户<br>档案合集</h1>' +
          '<div class="cover-sub">' + esc(opt.title || '全部客户 · 货物 · 方案 · 报价') + '</div>' +
          '<div class="cover-stats">' +
            [['客户总数', fmtInt(stats.customers) + ' 个'], ['货物规格', fmtInt(stats.cargoCount) + ' 份'],
             ['累计体积', fmtNum(stats.totalCbm, 1) + ' CBM'], ['累计毛重', fmtNum(stats.totalWeight / 1000, 2) + ' t'],
             ['报价单', fmtInt(stats.quoteCount) + ' 份'], ['报价金额', fmtMoney(stats.quoteAmount, App.state.settings.currency || 'AUD')]]
              .map(function (x) { return '<div class="cs"><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('') +
          '</div>' +
          '<div class="cover-meta">' +
            '<div>生成时间：' + fmtDateTime(new Date().toISOString()) + '</div>' +
            '<div>导出范围：' + esc(opt.scopeText || '全部客户') + '</div>' +
            '<div>数据来源：澳洲 FCL 客户管理系统 · data/db.json</div>' +
          '</div>' +
        '</div>'
    });
  },

  /* --------------------------- 总览表 --------------------------- */
  overviewPages: function (list, startNo, total) {
    const per = 19;
    const chunks = [];
    for (let i = 0; i < list.length; i += per) chunks.push(list.slice(i, i + per));
    return chunks.map(function (chunk, ci) {
      const rows = chunk.map(function (c, i) {
        return '<tr><td class="c">' + (ci * per + i + 1) + '</td><td class="nm">' + esc(c.company || '—') + '</td>' +
          '<td>' + esc(c.contact || '—') + '</td><td>' + esc(c.phone || '—') + '</td>' +
          '<td class="c">' + esc(c.state || '—') + '</td><td class="c">' + esc(c.postcode || '—') + '</td>' +
          '<td class="c">' + statusZh(c.status) + '</td><td class="c">' + esc(c.level || '—') + '</td>' +
          '<td class="r">' + fmtNum(c.totalCbm, 1) + '</td><td class="c">' + fmtInt(c.totalQty) + '</td>' +
          '<td class="c">' + esc(c.containerType || '—') + '</td>' +
          '<td class="r">' + (c.lastQuoteAmount ? fmtNum(c.lastQuoteAmount, 2) : '—') + '</td>' +
          '<td class="c">' + (c.completeness || 0) + '%</td></tr>';
      }).join('');
      return PrintDoc.page({
        no: startNo + ci, total: total, title: '客户总览表', sub: '共 ' + list.length + ' 个客户' + (chunks.length > 1 ? '（第 ' + (ci + 1) + ' / ' + chunks.length + ' 屏）' : ''),
        right: '<div class="ph-badge">' + fmtDate(new Date().toISOString()) + '</div>',
        body: '<div class="blk"><table class="data-tbl tight"><thead><tr>' +
          '<th style="width:4%">#</th><th style="width:21%">公司名称</th><th style="width:9%">联系人</th><th style="width:11%">电话</th>' +
          '<th style="width:5%">州</th><th style="width:6%">邮编</th><th style="width:7%">状态</th><th style="width:5%">等级</th>' +
          '<th style="width:7%">体积CBM</th><th style="width:5%">件数</th><th style="width:6%">柜型</th><th style="width:9%">最近报价</th><th style="width:5%">完整度</th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table></div>'
      });
    });
  },

  /* --------------------------- 客户详页（自动分页） --------------------------- */
  customerPages: function (c, opt, startNo, total) {
    const pages = [];
    const H = PrintDoc.bodyH() - 6;
    const blocks = [];
    blocks.push({ h: 54, html: PrintDoc.infoBlock(c) });
    const cargos = (c.cargos || []).slice().reverse();
    if (opt.withCargo && cargos.length) {
      const g = cargos[0];
      const items = g.items || [];
      blocks.push({ h: 6, html: '<div class="blk"><div class="blk-t">二、货物明细 · ' + esc(g.name || '') + '（录入 ' + fmtDate(g.createdAt) + '）</div>' + PrintDoc.cargoSummaryStrip(g) + '</div>' });
      const head = 12;
      const cap = Math.max(4, Math.floor((H - head) / PrintDoc.ROW_H));
      for (let i = 0; i < items.length; i += cap) {
        const part = items.slice(i, i + cap);
        blocks.push({ h: head + part.length * PrintDoc.ROW_H,
          html: PrintDoc.cargoTable(part, '货物明细' + (items.length > cap ? '（' + (Math.floor(i / cap) + 1) + '/' + Math.ceil(items.length / cap) + '）' : '') + ' · ' + esc(g.name || '')) });
      }
      if (cargos.length > 1) {
        blocks.push({ h: 8 + (cargos.length - 1) * 6, html: '<div class="blk"><div class="blk-t">历史货物规格</div><table class="kv-tbl"><tbody>' +
          cargos.slice(1).map(function (x) {
            const s = x.summary || CRM.cargoSummary(x.items);
            return '<tr><th style="width:38mm">' + esc(x.name) + ' · ' + fmtDate(x.createdAt) + '</th><td>' +
              fmtInt(s.totalQty) + ' 件 · ' + fmtNum(s.totalCbm, 2) + ' CBM · ' + fmtNum(s.totalWeight, 1) + ' KG · ' + esc(s.containerType || '待定') + '</td></tr>';
          }).join('') + '</tbody></table></div>' });
      }
    }
    if (opt.withRec) {
      const recs = (c.recommendations || []).slice().reverse();
      if (recs.length) blocks.push({ h: 96, html: PrintDoc.recBlock(recs[0]) });
    }
    if (opt.withQuote) {
      const qs = (c.quotes || []).slice().reverse();
      if (qs.length) {
        const q = qs[0];
        blocks.push({ h: 30 + Math.max(3, (q.rows || []).length) * PrintDoc.ROW_H, html: PrintDoc.quoteBlock(q) });
        if (qs.length > 1) {
          blocks.push({ h: 8 + (qs.length - 1) * 6, html: '<div class="blk"><div class="blk-t">历史报价</div><table class="kv-tbl"><tbody>' +
            qs.slice(1).map(function (x) {
              return '<tr><th style="width:52mm">' + esc(x.no || '') + ' · ' + fmtDate(x.createdAt) + '</th><td>' +
                esc(x.ctn || '') + ' · ' + fmtMoney((x.totals || {}).sell, x.cur) + ' · ' + esc(x.term || '') + '/' + esc(x.mode || '') + '</td></tr>';
            }).join('') + '</tbody></table></div>' });
        }
      }
    }
    if (opt.withTimeline) { const b = PrintDoc.timelineBlock(c); if (b) blocks.push({ h: 14 + 7 * 8, html: b }); }

    /* 装箱：按估算高度分页 */
    let cur = [], curH = 0;
    blocks.forEach(function (b) {
      if (curH + b.h > H && cur.length) { pages.push(cur); cur = []; curH = 0; }
      /* 单块超高：允许独占一页（超出部分被页面裁切，估算已留余量） */
      cur.push(b); curH += b.h;
    });
    if (cur.length) pages.push(cur);

    return pages.map(function (blks, pi) {
      const s = CRM.customerStats(c);
      return PrintDoc.page({
        no: startNo + pi, total: total,
        title: (c.company || '（未填公司）') + (pi > 0 ? '（续）' : ''),
        sub: '客户档案 · ' + esc(c.state || '') + ' ' + esc(c.postcode || '') + ' ' + esc(c.suburb || '') + ' · 共 ' + fmtInt(s.totalQty) + ' 件 / ' + fmtNum(s.totalCbm, 2) + ' CBM',
        right: '<div class="ph-badge">完整度 ' + CRM.completeness(c) + '%</div>',
        body: blks.map(function (b) { return b.html; }).join('')
      });
    });
  },

  /* --------------------------- 汇总统计页 --------------------------- */
  summaryPage: function (list, stats, startNo, total) {
    const byStatus = {}, byState = {};
    list.forEach(function (c) {
      byStatus[c.status || 'lead'] = (byStatus[c.status || 'lead'] || 0) + 1;
      if (c.state) byState[c.state] = (byState[c.state] || 0) + 1;
    });
    const barRow = function (label, n, max) {
      const pct = max ? Math.round(n / max * 100) : 0;
      return '<tr><th style="width:34mm">' + esc(label) + '</th><td class="barcell"><span class="inbar" style="width:' + pct + '%"></span><i>' + n + ' 个 · ' + pct + '%</i></td></tr>';
    };
    const maxS = Math.max.apply(null, Object.keys(byStatus).map(function (k) { return byStatus[k]; }).concat([1]));
    const maxR = Math.max.apply(null, Object.keys(byState).map(function (k) { return byState[k]; }).concat([1]));
    return PrintDoc.page({
      no: startNo, total: total, title: '汇总统计', sub: '共 ' + list.length + ' 个客户',
      right: '<div class="ph-badge">' + fmtDate(new Date().toISOString()) + '</div>',
      body:
        '<div class="blk"><div class="blk-t">一、状态分布</div><table class="bar-tbl"><tbody>' +
          Object.keys(byStatus).map(function (k) { return barRow(statusZh(k), byStatus[k], maxS); }).join('') +
        '</tbody></table></div>' +
        '<div class="blk"><div class="blk-t">二、目的州分布</div><table class="bar-tbl"><tbody>' +
          (Object.keys(byState).length ? Object.keys(byState).sort().map(function (k) { return barRow(k, byState[k], maxR); }).join('') : '<tr><td>暂无数据</td></tr>') +
        '</tbody></table></div>' +
        '<div class="blk"><div class="blk-t">三、体量与金额合计</div>' +
        '<div class="strip big">' +
          [['客户总数', fmtInt(stats.customers) + ' 个'], ['货物规格', fmtInt(stats.cargoCount) + ' 份'],
           ['总件数', fmtInt(stats.totalQty) + ' 件'], ['总体积', fmtNum(stats.totalCbm, 1) + ' CBM'],
           ['总毛重', fmtNum(stats.totalWeight / 1000, 2) + ' t'], ['报价单', fmtInt(stats.quoteCount) + ' 份'],
           ['报价金额', fmtMoney(stats.quoteAmount, App.state.settings.currency || 'AUD')], ['方案推荐', fmtInt(stats.recCount) + ' 份']]
            .map(function (x) { return '<div class="strip-c"><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('') +
        '</div></div>' +
        '<div class="blk"><div class="blk-t">四、说明</div>' +
        '<ul class="dot-list">' +
          '<li>本档案由「澳洲 FCL 客户管理系统」自动生成，数据来源 data/db.json，可随时重新导出。</li>' +
          '<li>货物体积按 qty × 长 × 宽 × 高 / 1,000,000 计算（单位 cm）；毛重按 qty × 单重累加。</li>' +
          '<li>柜型与装载率来自整柜方案推荐引擎；实际装柜以 3D 智能装柜模块的逐件排布结果为准。</li>' +
          '<li>报价金额取每个客户最近一次报价快照的报价合计，币种以报价单为准。</li>' +
          '<li>打印排版：A4 210×297mm，页边距 0，左右与底部均为满版设计，无白边。</li>' +
        '</ul></div>'
    });
  },

  /* --------------------------- 主构建入口 --------------------------- */
  build: function (list, opt) {
    const o = Object.assign({ cover: true, overview: true, detail: true, summary: true, withCargo: true, withRec: true, withQuote: true, withTimeline: false }, opt || {});
    const stats = App.state.stats || CRM.statsFrom({ customers: list });
    const title = '澳洲 FCL 客户档案合集 · 共 ' + list.length + ' 个客户';
    const scopeText = o.scopeText || '全部客户 · 货物 · 方案 · 报价';

    /* 第一遍：算清页数与分页结构（页码先留 0） */
    const detailPages = o.detail ? list.map(function (c) { return PrintDoc.customerPages(c, o, 0, 0); }) : [];
    const overviewCount = (o.overview && list.length) ? PrintDoc.overviewPages(list, 0, 0).length : 0;
    const detailCount = detailPages.reduce(function (a, ps) { return a + ps.length; }, 0);
    const total = 1 + overviewCount + detailCount + (o.summary ? 1 : 0);

    /* 第二遍：带正确页码输出 */
    const all = [PrintDoc.coverPage({ title: scopeText }, stats, total)];
    let no = 2;
    if (overviewCount) { PrintDoc.overviewPages(list, no, total).forEach(function (p) { all.push(p); }); no += overviewCount; }
    if (o.detail) {
      list.forEach(function (c) {
        const pages = PrintDoc.customerPages(c, o, no, total);
        pages.forEach(function (p) { all.push(p); });
        no += pages.length;
      });
    }
    if (o.summary) all.push(PrintDoc.summaryPage(list, stats, no, total));
    return {
      html: '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>' + esc(title) + '</title>' +
        '<style>' + PrintDoc.css() + '</style></head><body>' + all.join('') +
        '<script>window.__AU_PRINT_READY__=true;<\/script></body></html>',
      pages: all.length, count: list.length
    };
  },

  /* --------------------------- 内联样式（满版无留白） --------------------------- */
  css: function () {
    return [
      '@page{size:A4;margin:0;}',
      'html,body{margin:0;padding:0;background:#fff;color:#2E241B;font-family:"Microsoft YaHei","PingFang SC","KaiTi","楷体",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
      '*{box-sizing:border-box;}',
      '.page{width:210mm;height:297mm;overflow:hidden;display:flex;flex-direction:column;page-break-after:always;break-after:page;position:relative;background:#fff;}',
      '.page:last-child{page-break-after:auto;break-after:auto;}',
      /* 页眉：满版色带，直达左右边缘 */
      '.p-head{height:24mm;flex:0 0 24mm;background:linear-gradient(100deg,#3C2E22 0%,#5A4634 55%,#A67B5B 100%);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 5mm;gap:4mm;}',
      '.ph-left{display:flex;align-items:center;gap:4mm;min-width:0;}',
      '.ph-logo{height:12mm;display:block;filter:brightness(1.15);}',
      '.ph-t{font-size:5mm;font-weight:700;line-height:1.15;letter-spacing:.3px;}',
      '.ph-s{font-size:3mm;opacity:.85;margin-top:1mm;}',
      '.ph-right{text-align:right;font-size:3mm;opacity:.95;}',
      '.ph-badge{border:0.4mm solid rgba(255,255,255,.55);border-radius:1.2mm;padding:1mm 2.4mm;font-size:3mm;}',
      /* 内容区 */
      '.p-body{flex:1 1 auto;min-height:0;overflow:hidden;padding:3mm 0 0 0;}',
      /* 填充带：占满剩余空间，避免底部出现空白 */
      '.p-fill{flex:0 1 auto;min-height:9mm;background:repeating-linear-gradient(180deg,#FBF8F3 0mm,#FBF8F3 4.2mm,#F3EDE4 4.2mm,#F3EDE4 4.6mm);border-top:0.3mm solid #E8DDD0;}',
      /* 页脚：贴住纸张底边，满版 */
      '.p-foot{flex:0 0 13mm;height:13mm;background:#3C2E22;color:#F3E7D6;display:flex;align-items:center;justify-content:space-between;padding:0 5mm;font-size:3mm;letter-spacing:.2px;}',
      '.p-foot .pf-c{opacity:.8;}',
      '.p-foot.dark{background:#2A1F17;}',
      /* 封面 */
      '.cover .cover-head{height:0;}',
      '.cover{background:linear-gradient(160deg,#FFFDF8 0%,#FBF3E7 46%,#F1E3CE 100%);}',
      '.cover-body{height:284mm;display:flex;flex-direction:column;justify-content:center;padding:0 14mm;}',
      '.cover-logo{height:20mm;margin-bottom:10mm;}',
      '.cover-kicker{font-size:3.4mm;letter-spacing:2.6px;color:#A67B5B;font-weight:700;}',
      '.cover-title{font-size:19mm;line-height:1.12;margin:4mm 0 6mm;color:#3C2E22;font-weight:700;letter-spacing:1px;}',
      '.cover-sub{font-size:4.4mm;color:#7A6A5A;margin-bottom:12mm;}',
      '.cover-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-bottom:12mm;}',
      '.cs{background:#fff;border:0.3mm solid #E8DDD0;border-left:1.4mm solid #C8A27A;border-radius:1.6mm;padding:4mm;}',
      '.cs span{display:block;font-size:3mm;color:#7A6A5A;}',
      '.cs b{display:block;font-size:6mm;color:#A67B5B;margin-top:1.4mm;}',
      '.cover-meta{font-size:3.2mm;color:#7A6A5A;line-height:1.9;border-top:0.3mm solid #E8DDD0;padding-top:4mm;}',
      /* 块 */
      '.blk{margin:0 0 3mm 0;}',
      '.blk-t{background:#F5F0EA;border-left:1.2mm solid #C8A27A;color:#5A4634;font-weight:700;font-size:3.4mm;padding:1.6mm 3mm;margin-bottom:1.6mm;}',
      '.sub-t{font-size:3.1mm;font-weight:700;color:#A67B5B;margin:2mm 0 1mm;}',
      /* 表格：满版，边框直达纸张左右边缘 */
      'table{width:100%;border-collapse:collapse;table-layout:fixed;}',
      '.grid-tbl th,.grid-tbl td{border:0.25mm solid #E8DDD0;font-size:3mm;padding:1.5mm 2mm;text-align:left;overflow-wrap:anywhere;word-break:normal;}',
      '.grid-tbl th{background:#FAF7F2;color:#7A6A5A;font-weight:400;width:11%;}',
      '.data-tbl th,.data-tbl td{border:0.25mm solid #E0D5C6;font-size:2.9mm;padding:1.3mm 1.6mm;overflow-wrap:anywhere;word-break:normal;}',
      '.data-tbl thead th{background:#3C2E22;color:#F6EFE4;font-weight:700;text-align:center;}',
      '.data-tbl tbody tr:nth-child(even) td{background:#FBF8F3;}',
      '.data-tbl td.c{text-align:center;}',
      '.data-tbl td.r{text-align:right;}',
      '.data-tbl td.nm{font-weight:700;}',
      '.data-tbl.tight th,.data-tbl.tight td{font-size:2.6mm;padding:1.1mm 1.2mm;}',
      '.kv-tbl th,.kv-tbl td{border:0.25mm solid #E8DDD0;font-size:2.9mm;padding:1.3mm 2mm;text-align:left;}',
      '.kv-tbl th{background:#FAF7F2;color:#5A4634;font-weight:700;}',
      '.total-tbl{margin-top:1.4mm;}',
      '.total-tbl th,.total-tbl td{border:0.25mm solid #E8DDD0;font-size:3mm;padding:1.6mm;text-align:center;}',
      '.total-tbl th{background:#FAF7F2;color:#7A6A5A;font-weight:400;}',
      '.total-tbl td{font-weight:700;}',
      '.total-tbl td.hl{color:#A67B5B;background:#FFF7EA;}',
      '.bar-tbl th,.bar-tbl td{border:0.25mm solid #E8DDD0;font-size:3mm;padding:1.4mm 2mm;}',
      '.bar-tbl th{background:#FAF7F2;text-align:left;color:#5A4634;}',
      '.barcell{position:relative;height:7mm;}',
      '.inbar{display:block;height:100%;background:linear-gradient(90deg,#E8D6BC,#C8A27A);}',
      '.barcell i{position:absolute;left:2.5mm;top:1.6mm;font-size:3mm;font-style:normal;color:#3C2E22;font-weight:700;}',
      '.strip{display:flex;gap:2mm;margin:1.6mm 0;flex-wrap:nowrap;}',
      '.strip-c{flex:1;background:#FAF7F2;border:0.25mm solid #E8DDD0;border-top:0.9mm solid #C8A27A;padding:1.8mm 2mm;text-align:center;min-width:0;}',
      '.strip-c span{display:block;font-size:2.6mm;color:#7A6A5A;}',
      '.strip-c b{display:block;font-size:3.4mm;color:#5A4634;margin-top:.8mm;word-break:break-all;}',
      '.strip.big .strip-c b{font-size:4mm;}',
      '.dot-list{margin:0;padding-left:4.5mm;}',
      '.dot-list li{font-size:2.9mm;line-height:1.55;margin-bottom:1mm;color:#4A3A2C;}',
      '.dot-list li b{color:#3C2E22;}',
      '.dot-list li.risk b{color:#A6321F;}',
      '.rec-line{background:#FFF7EA;border:0.25mm dashed #C8A27A;color:#8A5A2B;font-size:3.6mm;font-weight:700;padding:2mm 3mm;margin-bottom:1.6mm;}',
      '.addr-row{font-size:2.9mm;color:#4A3A2C;padding:1.2mm 2mm;background:#FBF8F3;border:0.25mm solid #EFE7DA;margin-top:1.2mm;word-break:break-all;}',
      '.addr-row b{color:#7A6A5A;font-weight:400;}'
    ].join('\n');
  },

  /* --------------------------- 导出方式 --------------------------- */
  server: async function (list, opt) {
    const doc = PrintDoc.build(list, opt);
    const name = 'AU-FCL-Customers-' + fmtDate(new Date().toISOString()).replace(/-/g, '') + '.pdf';
    if (App.state.offline) throw new Error('离线模式无法使用服务端导出，请改用「浏览器打印」');
    Toast.info('正在服务端渲染 ' + doc.pages + ' 页 PDF，请稍候…', 8000);
    const res = await fetch('api/pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: doc.html, filename: name })
    });
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); msg = j.error || msg; } catch (e) {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
    return { pages: doc.pages, name: name, bytes: blob.size };
  },
  openPrint: function (list, opt) {
    const doc = PrintDoc.build(list, opt);
    const key = 'aufcl_print_' + Date.now();
    try { localStorage.setItem(key, JSON.stringify({ html: doc.html, at: new Date().toISOString() })); }
    catch (e) { Toast.err('打印数据过大，请减少导出客户数量'); return null; }
    const w = window.open('print.html?k=' + encodeURIComponent(key), '_blank');
    if (!w) Toast.warn('浏览器拦截了新窗口，请允许弹出窗口后重试');
    return doc;
  }
};
window.PrintDoc = PrintDoc;
