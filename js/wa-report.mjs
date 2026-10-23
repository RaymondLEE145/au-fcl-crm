/* ============================================================================
 * 客户沟通分析报告 · 中文全幅 A4 PDF（左右与底部零留白）
 *   · @page margin:0 + .page 210×297mm flex 布局 + .p-fill 吸收余白 + 页脚贴底
 *   · 导出：新窗口打印 → 另存为 PDF（浏览器无头/预览均可）
 * ==========================================================================*/
(function () {
  'use strict';
  var CSS = "@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff;color:#16233A;font-family:\"Microsoft YaHei\",\"PingFang SC\",system-ui,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;-webkit-user-select:text}*{box-sizing:border-box}.page{width:210mm;height:297mm;overflow:hidden;display:flex;flex-direction:column;page-break-after:always;break-after:page;position:relative;background:#fff}.page:last-child{page-break-after:auto;break-after:auto}.p-head{flex:0 0 22mm;background:linear-gradient(100deg,#0B2545 0%,#14375F 55%,#3A5C86 100%);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 7mm}.ph-l{display:flex;align-items:center;gap:4mm}.ph-logo{height:11mm;width:11mm;border-radius:2mm;background:linear-gradient(135deg,#C8A24A,#E7D6A8);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:5mm;color:#0B2545}.ph-t{font-size:5.2mm;font-weight:700;line-height:1.1}.ph-s{font-size:2.9mm;opacity:.82;margin-top:1mm}.ph-r{text-align:right;font-size:3mm;opacity:.95;line-height:1.6}.p-body{flex:1 1 auto;min-height:0;overflow:hidden;padding:5mm 7mm 0 7mm}.p-fill{flex:0 1 auto;min-height:10mm;background:repeating-linear-gradient(180deg,#F7F9FC 0mm,#F7F9FC 4.2mm,#E9EEF6 4.2mm,#E9EEF6 4.6mm);border-top:.3mm solid #DCE3ED}.p-foot{flex:0 0 13mm;background:#0B2545;color:#E7D6A8;display:flex;align-items:center;justify-content:space-between;padding:0 7mm;font-size:2.9mm}.sec{margin-bottom:4.5mm}.sec-t{background:#F2F5FA;border-left:1.3mm solid #0B2545;color:#0B2545;font-weight:700;font-size:3.6mm;padding:1.8mm 3mm;margin-bottom:2.4mm}.hero{display:flex;gap:4mm;align-items:stretch;margin-bottom:4mm}.score-b{flex:0 0 46mm;background:linear-gradient(160deg,#0B2545,#14375F);color:#fff;border-radius:2mm;padding:4mm 3mm;text-align:center;display:flex;flex-direction:column;justify-content:center}.score-n{font-size:16mm;font-weight:800;line-height:1;color:#E7D6A8}.score-u{font-size:2.8mm;opacity:.8;margin-top:1mm}.score-g{font-size:4.6mm;font-weight:700;margin-top:2mm}.hero-r{flex:1;display:flex;flex-direction:column;gap:2mm}.dim{display:flex;align-items:center;gap:2.5mm;font-size:3mm}.dim-l{flex:0 0 22mm;color:#66748C}.dim-bar{flex:1;height:4mm;background:#EDF1F7;border-radius:1mm;overflow:hidden}.dim-bar i{display:block;height:100%;background:linear-gradient(90deg,#3A5C86,#0B2545)}.dim-v{flex:0 0 12mm;text-align:right;font-weight:700;color:#0B2545}.funnel{display:flex;gap:1.5mm}.fn{flex:1;text-align:center;font-size:2.7mm;padding:2mm .5mm;border-radius:1.2mm;background:#F2F5FA;color:#66748C;border:.3mm solid #DCE3ED}.fn.on{background:#0B2545;color:#fff;border-color:#0B2545;font-weight:700}.fn.done{background:#E7D6A8;color:#0B2545;border-color:#C8A24A;font-weight:700}.tags{display:flex;flex-wrap:wrap;gap:1.6mm}.tag{font-size:2.9mm;border:.3mm solid #DCE3ED;border-radius:99mm;padding:1mm 3mm;background:#F7F9FC;color:#14375F}.tag.warn{border-color:#EEDEB4;background:#FDF7E9;color:#A87428}.tag.bad{border-color:#EFD3C8;background:#FBF1EE;color:#B3261E}.kv{display:flex;gap:3mm;font-size:3.1mm;line-height:1.65;margin-bottom:1.6mm}.kv b{flex:0 0 24mm;color:#0B2545}.kv span{flex:1;color:#243247}.msg{display:flex;margin-bottom:1.8mm;gap:2mm}.msg .who{flex:0 0 16mm;font-size:2.7mm;font-weight:700;padding-top:.6mm}.msg.them .who{color:#2C5A8C}.msg.me .who{color:#1B7F4B}.msg .bub{max-width:150mm;font-size:3.05mm;line-height:1.6;padding:1.8mm 2.6mm;border-radius:1.6mm;border:.25mm solid #DCE3ED;background:#F6F9FD;overflow-wrap:anywhere}.msg.me .bub{background:#F2F8F4;border-color:#CFE3D6;margin-left:auto}.rep{border:.3mm solid #DCE3ED;border-left:1.3mm solid #C8A24A;border-radius:1.4mm;padding:2.4mm 3mm;margin-bottom:2.2mm;background:#fff}.rep-h{font-size:2.7mm;color:#9C7C3D;font-weight:700;margin-bottom:1.2mm}.rep-en{font-size:3.3mm;line-height:1.65;color:#16233A}.rep-zh{font-size:2.8mm;color:#66748C;margin-top:1.2mm;padding-top:1.2mm;border-top:.25mm dashed #DCE3ED;line-height:1.55}.note{font-size:2.8mm;color:#66748C;line-height:1.65}.twocol{display:flex;gap:4mm}.twocol>div{flex:1;min-width:0}";
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function fmtDate(t) { var d = new Date(t || Date.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function head(sub) {
    return '<div class="p-head"><div class="ph-l"><div class="ph-logo">GV</div><div><div class="ph-t">客户沟通分析报告</div><div class="ph-s">' + esc(sub || '') + '</div></div></div>' +
      '<div class="ph-r">GlobalVertical · 澳洲 FCL<br>' + fmtDate() + '</div></div>';
  }
  function foot(n, total) {
    return '<div class="p-foot"><span>GlobalVertical 澳洲整柜 FCL 客户管理系统</span><span>客户沟通分析 · 第 ' + n + ' / ' + total + ' 页</span></div>';
  }
  function page(body, n, total, sub) { return '<div class="page">' + head(sub) + '<div class="p-body">' + body + '</div><div class="p-fill"></div>' + foot(n, total) + '</div>'; }
  var DIM_ZH = { intent: '意向强度', specificity: '需求具体度', urgency: '紧迫程度', authority: '决策权', professional: '专业程度', risk: '关系健康度' };
  function scoreBlock(sc) {
    var dims = ['intent', 'specificity', 'urgency', 'authority', 'professional', 'risk'];
    return '<div class="sec"><div class="sec-t">① 客户质量评估</div><div class="hero">' +
      '<div class="score-b"><div class="score-n">' + sc.total + '</div><div class="score-u">质量分 / 100</div><div class="score-g">' + sc.grade + ' 级 · ' + esc(sc.zh) + '</div></div>' +
      '<div class="hero-r">' + dims.map(function (k) { var v = (sc.dims && sc.dims[k]) || 0; return '<div class="dim"><span class="dim-l">' + (DIM_ZH[k] || k) + '</span><span class="dim-bar"><i style="width:' + v + '%"></i></span><span class="dim-v">' + v + '</span></div>'; }).join('') + '</div></div>' +
      '<div class="kv"><b>建议动作</b><span>' + esc(sc.action) + '</span></div></div>';
  }
  function funnelBlock(fn) {
    return '<div class="sec"><div class="sec-t">② 跟进进度</div><div class="funnel">' +
      (fn.all || []).map(function (n, i) { return '<div class="fn ' + (i === fn.step ? 'on' : (i < fn.step ? 'done' : '')) + '">' + esc(n) + '</div>'; }).join('') +
      '</div><div class="note" style="margin-top:2mm">当前阶段：<b style="color:#0B2545">' + esc(fn.name) + '</b>（第 ' + (fn.step + 1) + ' / ' + (fn.max + 1) + ' 步）</div></div>';
  }
  function analysisBlock(an) {
    var tags = function (arr, cls) { return (arr || []).map(function (c) { return '<span class="tag ' + (cls || '') + '">' + esc(c) + '</span>'; }).join(''); };
    return '<div class="sec"><div class="sec-t">③ 沟通要点与风险</div>' +
      '<div class="kv"><b>阶段判断</b><span>' + esc(an.stageZh || an.stage) + '</span></div>' +
      '<div class="kv"><b>客户情绪</b><span>' + esc(an.sentimentZh || an.sentiment) + '</span></div>' +
      (an.reading ? '<div class="kv"><b>真实想法</b><span>' + esc(an.reading) + '</span></div>' : '') +
      '<div class="kv"><b>顾虑关注</b><span><div class="tags">' + (tags(an.concerns) || '<span class="tag">无明显顾虑</span>') + '</div></span></div>' +
      (an.risk ? '<div class="kv"><b>风险提示</b><span style="color:#B26A00">' + esc(an.risk) + '</span></div>' : '') +
      (an.stageAdvice ? '<div class="kv"><b>沟通策略</b><span>' + esc(an.stageAdvice) + '</span></div>' : '') + '</div>';
  }
  function msgsBlock(msgs) {
    return '<div class="sec"><div class="sec-t">④ 对话记录（客户 / 我方）</div>' +
      msgs.map(function (m) { return '<div class="msg ' + (m.who === 'them' ? 'them' : 'me') + '"><div class="who">' + (m.who === 'them' ? '客户' : '我方') + '</div><div class="bub">' + esc(m.text) + '</div></div>'; }).join('') + '</div>';
  }
  function repBlock(rep) {
    return '<div class="sec"><div class="sec-t">⑤ 建议回复（英文可直接发 / 中文为设计意图）</div>' +
      (rep.parts || []).map(function (p, i) { return '<div class="rep"><div class="rep-h">' + (i + 1) + ' · ' + esc(String(p.key || '').toUpperCase()) + '</div><div class="rep-en">' + esc(p.en) + '</div>' + (p.zh ? '<div class="rep-zh">' + esc(p.zh) + '</div>' : '') + '</div>'; }).join('') + '</div>';
  }
  function chunk(arr, n) { var out = []; for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out.length ? out : [[]]; }
  function build(d) {
    d = d || {};
    var msgs = d.msgs || [], an = d.an || {}, sc = d.score || { total: 0, grade: '-', dims: {} }, fn = d.funnel || { step: 0, max: 5, all: [] }, rep = d.rep || { parts: [] };
    var pages = [];
    var sub = (d.customer ? ('客户：' + d.customer + ' · ') : '') + (d.country ? d.country : '澳洲客户沟通');
    pages.push((sc.total ? scoreBlock(sc) : '') + funnelBlock(fn) + analysisBlock(an));
    var msgPages = chunk(msgs, 12);
    msgPages.forEach(function (g) { pages.push(msgsBlock(g)); });
    var repPages = chunk(rep.parts || [], 3);
    repPages.forEach(function (g) { pages.push(repBlock({ parts: g })); });
    var total = pages.length;
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>客户沟通分析报告</title><style>' + CSS + '</style></head><body>' +
      pages.map(function (b, i) { return page(b, i + 1, total, sub); }).join('') +
      '</body></html>';
  }
  function open(d) {
    var html = build(d);
    var w = window.open('', '_blank');
    if (!w) { alert('弹出窗口被拦截，请允许本页弹出窗口后再试'); return null; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 600);
    return w;
  }
  /* ---------------- 多客户批量导出 ---------------- */
  function indexPage(recs, n, total) {
    var body = '<div class="sec"><div class="sec-t">客户分析汇总（共 ' + recs.length + ' 个客户）</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:3mm">' +
      '<thead><tr>' + ['客户', '质量分', '等级', '阶段', '跟进进度', '性别', '分析时间'].map(function (h) { return '<th style="background:#F2F5FA;border:.25mm solid #DCE3ED;padding:1.6mm;text-align:left;color:#0B2545">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      recs.map(function (x) {
        var sc = x.score || {}, fn = x.funnel || {}, an = x.an || {};
        return '<tr>' +
          '<td style="border:.25mm solid #DCE3ED;padding:1.6mm;font-weight:700">' + esc(x.cust || '') + (x.country ? '<div style="font-weight:400;font-size:2.6mm;color:#66748C">' + esc(x.country) + '</div>' : '') + '</td>' +
          '<td style="border:.25mm solid #DCE3ED;padding:1.6mm;text-align:center;font-weight:700;color:#0B2545">' + (sc.total || '-') + '</td>' +
          '<td style="border:.25mm solid #DCE3ED;padding:1.6mm;text-align:center;font-weight:700">' + (sc.grade || '-') + '</td>' +
          '<td style="border:.25mm solid #DCE3ED;padding:1.6mm">' + esc(an.stageZh || an.stage || '-') + '</td>' +
          '<td style="border:.25mm solid #DCE3ED;padding:1.6mm">' + esc(fn.name || '-') + (fn.step != null ? '（' + (fn.step + 1) + '/' + (fn.max + 1) + '）' : '') + '</td>' +
          '<td style="border:.25mm solid #DCE3ED;padding:1.6mm;text-align:center">' + esc({ male: '男', female: '女', any: '不指定' }[x.gender] || '不指定') + '</td>' +
          '<td style="border:.25mm solid #DCE3ED;padding:1.6mm;font-size:2.6mm;color:#66748C">' + fmtDate(x.at) + '</td>' +
        '</tr>';
      }).join('') + '</tbody></table>' +
      '<div class="note" style="margin-top:3mm">评分口径：意向强度 30%、需求具体度 20%、紧迫度 15%、决策权 15%、专业程度 10%、关系健康度 10%。A≥75 优先跟进 / B≥55 可推进 / C≥35 需培养 / D&lt;35 低优先级。</div></div>';
    return page(body, n, total, '多客户批量导出 · 汇总目录');
  }
  function recPages(x, startNo, total) {
    var pages = [];
    var sub = (x.cust ? ('客户：' + x.cust + ' · ') : '') + (x.country || '澳洲客户沟通');
    pages.push((x.score && x.score.total ? scoreBlock(x.score) : '') + funnelBlock(x.funnel || { step: 0, max: 5, all: [] }) + analysisBlock(x.an || {}));
    chunk(x.msgs || [], 12).forEach(function (g) { pages.push(msgsBlock(g)); });
    chunk((x.rep && x.rep.parts) || [], 4).forEach(function (g) { pages.push(repBlock({ parts: g })); });
    return pages.map(function (b, i) { return page(b, startNo + i, total, sub); });
  }
  function buildBatch(recs) {
    recs = recs || [];
    var perPage = [];
    var totalGuess = 1 + recs.length * 3;
    var out = [];
    var no = 1;
    out.push(indexPage(recs, no, totalGuess)); no++;
    recs.forEach(function (x) {
      var ps = recPages(x, no, totalGuess);
      ps.forEach(function (p) { out.push(p); });
      no += ps.length;
    });
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>客户沟通分析报告（批量）</title><style>' + CSS + '</style></head><body>' + out.join('') + '</body></html>';
  }
  function openBatch(recs) {
    var html = buildBatch(recs);
    var w = window.open('', '_blank');
    if (!w) { alert('弹出窗口被拦截，请允许本页弹出窗口后再试'); return null; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 700);
    return w;
  }
  window.WAReport = { build: build, open: open, buildBatch: buildBatch, openBatch: openBatch };
})();
