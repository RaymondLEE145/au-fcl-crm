/* ============================================================================
 * 跟进记录与提醒：记录每次跟进时间；超过 2 天未跟进 → 顶部提醒
 * ==========================================================================*/
(function () {
  'use strict';
  var DAY = 86400000, LIMIT = 2;
  function lastAt(rec) {
    var list = (rec && (rec.followUps || rec.followups)) || [];
    var max = 0;
    for (var i = 0; i < list.length; i++) { var t = Number(list[i] && (list[i].at || list[i].time || list[i].ts)) || 0; if (t > max) max = t; }
    if (rec && rec.lastFollowUpAt) max = Math.max(max, Number(rec.lastFollowUpAt) || 0);
    if (!max && rec) { max = Date.parse(rec.updatedAt || rec.createdAt || '') || 0; }
    return max;
  }
  function daysSince(ts) { if (!ts) return 999; return Math.floor((Date.now() - ts) / DAY); }
  function need(rec) { return daysSince(lastAt(rec)) >= LIMIT; }
  /* ===== 艾宾浩斯记忆曲线：遗忘先快后慢 → 跟进间隔按几何级数递增 ===== */
  var EBB = [1, 2, 4, 7, 15, 30, 60, 90];   /* 天：第1次→1天，第2次→2天，第3次→4天，第4次→7天…… */
  function stageOf(rec) { var n2 = ((rec && (rec.followUps || [])) || []).length; return Math.min(n2, EBB.length - 1); }
  function schedule(rec) {
    var ts = lastAt(rec), st = stageOf(rec), iv = EBB[st];
    var dueAt = ts ? ts + iv * DAY : 0;
    var now = Date.now();
    var diffDays = dueAt ? Math.floor((dueAt - now) / DAY) : -999;
    var status;
    if (!ts) status = 'never';
    else if (diffDays < 0) status = 'overdue';
    else if (diffDays === 0) status = 'today';
    else if (diffDays <= 2) status = 'soon';
    else status = 'ok';
    return { count: ((rec && (rec.followUps || [])) || []).length, stage: st, interval: iv, dueAt: dueAt, diffDays: diffDays, status: status };
  }
  function statusZh(st) { return { never: '从未跟进', overdue: '已逾期', today: '今天该跟进', soon: '即将到期', ok: '正常' }[st] || st; }
  function fmt(ts) { if (!ts) return '从未跟进'; var d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function sortList(list) { return (list || []).slice().sort(function (a, b) { return lastAt(a) - lastAt(b); }); }
  async function addFollowUp(rec, note) {
    var r = rec || {};
    var arr = (r.followUps || []).slice();
    arr.push({ at: Date.now(), atText: fmt(Date.now()), note: String(note || ''), source: 'manual' });
    arr.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    r.followUps = arr;
    r.lastFollowUpAt = Date.now();
    await API.put('/api/customers/' + encodeURIComponent(r.id), r);
    return r;
  }
  /* ---- 客户详情：插入跟进面板 ---- */
  function panelHtml(rec) {
    var list = (rec.followUps || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    var ts = lastAt(rec), d = daysSince(ts), warn = d >= LIMIT;
    var sc2 = schedule(rec);
    return '<div class="panel" id="fuPanel" style="padding:16px 18px;margin-top:14px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
      '<div style="font-size:15px;font-weight:700;color:#191713">📝 跟进记录（' + list.length + ' 条）</div>' +
      '<div style="font-size:12.5px;text-align:right;' + (sc2.status === 'overdue' || sc2.status === 'never' ? 'color:#B3261E;font-weight:700' : (sc2.status === 'today' ? 'color:#A87428;font-weight:700' : 'color:#1B7F4B')) + '">' + (ts ? ('最后跟进：' + fmt(ts) + ' · ' + d + ' 天前') : '尚未录入跟进记录') + '<br>📉 艾宾浩斯：第 ' + (sc2.count + 1) + ' 次跟进 · 建议间隔 ' + sc2.interval + ' 天 · ' + statusZh(sc2.status) + (sc2.dueAt ? ('（' + fmt(sc2.dueAt).slice(0, 10) + '）') : '') + '</div></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
        '<input id="fuInput" class="input" placeholder="输入本次跟进内容（电话/微信/报价/寄样…）" style="flex:1;min-width:260px">' +
        '<button class="btn primary" id="fuAdd">＋ 添加跟进记录</button></div>' +
      (list.length ? '<div style="margin-top:10px">' + list.map(function (x) { return '<div style="border-left:3px solid ' + (warn ? '#E8C4BC' : '#C8A27A') + ';padding:6px 0 6px 10px;margin-bottom:6px;font-size:13px"><b style="color:#6E675B">' + fmt(Number(x.at) || 0) + '</b> <span style="color:#191713">' + (String(x.note || '').replace(/[<>]/g, '') || '（无备注）') + '</span>' + (x.source && x.source !== 'manual' ? ' <span style="color:#9C9486">· ' + String(x.source) + '</span>' : '') + '</div>'; }).join('') + '</div>' : '<div style="margin-top:8px;font-size:12.5px;color:#9C9486">还没有跟进记录，录入第一条开始计时。</div>') +
      '</div>';
  }
  async function injectDetail() {
    try {
      var id = (App.state.route.args || [])[0];
      if (!id) return;
      var res = await API.get('/api/customers/' + encodeURIComponent(id));
      var rec = (res && (res.customer || res.data || res.item)) || res || {};
      if (!rec || !rec.id) return;
      var host = document.querySelector('#mainView') || document.getElementById('mainView');
      if (!host || document.getElementById('fuPanel')) return;
      var div = document.createElement('div');
      div.innerHTML = panelHtml(rec);
      host.appendChild(div.firstChild);
      var btn = document.getElementById('fuAdd');
      if (btn) btn.onclick = async function () {
        var inp = document.getElementById('fuInput');
        var note = String((inp && inp.value) || '').trim();
        if (!note) { alert('请先输入跟进内容'); return; }
        btn.disabled = true; btn.textContent = '保存中…';
        try { await addFollowUp(rec, note); location.reload(); } catch (e) { alert('保存失败：' + e.message); btn.disabled = false; btn.textContent = '＋ 添加跟进记录'; }
      };
    } catch (e) {}
  }
  /* ---- 客户列表 / 工作台：顶部提醒条 ---- */
  async function injectBanner() {
    try {
      var res = await API.get('/api/customers');
      var list = (res && (res.list || res.customers || res.items)) || [];
      var host = document.getElementById('mainView');
      if (!host || document.getElementById('fuBanner')) return;
      var groups = { never: [], overdue: [], today: [], soon: [] };
      list.forEach(function (c) { var sc = schedule(c); if (groups[sc.status]) groups[sc.status].push({ c: c, sc: sc }); });
      var total = groups.never.length + groups.overdue.length + groups.today.length + groups.soon.length;
      var box = document.createElement('div');
      box.id = 'fuBanner';
      if (!total) {
        box.style.cssText = 'margin:0 0 14px;padding:12px 16px;border-radius:12px;background:#F2F8F4;border:1px solid #CFE3D6;color:#1B7F4B;font-size:13.5px;font-weight:600';
        box.textContent = '✅ 按艾宾浩斯节奏，所有客户都在跟进周期内。';
        host.insertBefore(box, host.firstChild);
        return;
      }
      box.style.cssText = 'margin:0 0 14px;padding:14px 16px;border-radius:12px;background:#FBF1EE;border:1px solid #EFD3C8;color:#8A1C14;font-size:13px';
      var chips = function (arr, color, label, max) {
        if (!arr.length) return '';
        return '<div style="margin-top:8px"><b style="color:' + color + '">' + label + '（' + arr.length + '）</b><div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">' +
          arr.slice(0, max || 8).map(function (x) {
            var s2 = x.sc;
            var extra = s2.status === 'never' ? '未跟进' : (s2.status === 'overdue' ? ('逾期 ' + Math.abs(s2.diffDays) + ' 天') : (s2.status === 'today' ? '今天' : (s2.diffDays + ' 天后')));
            return '<button class="btn ghost tiny" data-fu-go="' + x.c.id + '" title="第 ' + (s2.count + 1) + ' 次跟进 · 建议间隔 ' + s2.interval + ' 天">' + (x.c.company || x.c.name || x.c.id) + ' · ' + extra + ' · 间隔' + s2.interval + '天</button>';
          }).join('') + (arr.length > (max || 8) ? '<span style="font-size:12px;opacity:.75;align-self:center">…共 ' + arr.length + ' 个</span>' : '') + '</div></div>';
      };
      box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
        '<div><b style="font-size:14.5px">⏰ 跟进提醒（艾宾浩斯记忆曲线）</b><div style="font-size:11.5px;opacity:.8;margin-top:3px">间隔节奏：1 → 2 → 4 → 7 → 15 → 30 → 60 → 90 天（遗忘先快后慢，先密后疏）</div></div>' +
        '<button class="btn ghost tiny" id="fuNotifyBtn">🔔 开启桌面提醒</button></div>' +
        chips(groups.never, '#B3261E', '从未跟进', 6) +
        chips(groups.overdue, '#B3261E', '已逾期（必须今天处理）', 8) +
        chips(groups.today, '#A87428', '今天该跟进', 8) +
        chips(groups.soon, '#2C5A8C', '即将到期（2 天内）', 6);
      host.insertBefore(box, host.firstChild);
      box.querySelectorAll('[data-fu-go]').forEach(function (b) { b.onclick = function () { location.hash = '#/customer/' + encodeURIComponent(b.getAttribute('data-fu-go')); }; });
      var nb = document.getElementById('fuNotifyBtn');
      if (nb) nb.onclick = function () {
        if (!('Notification' in window)) { alert('当前浏览器不支持桌面通知'); return; }
        Notification.requestPermission().then(function (p) {
          if (p === 'granted') {
            var msg = '⚠ 待跟进：逾期 ' + groups.overdue.length + ' · 今天 ' + groups.today.length + ' · 即将 ' + groups.soon.length;
            try { new Notification('澳洲FCL · 跟进提醒', { body: msg }); } catch (e) { alert(msg); }
          } else alert('未授权桌面通知，可在浏览器地址栏左侧的站点设置里开启');
        });
      };
      /* 当天首次打开自动弹一次桌面通知（已授权时） */
      try {
        var key = 'aufcl_fu_notified_' + new Date().toISOString().slice(0, 10);
        if (!localStorage.getItem(key) && 'Notification' in window && Notification.permission === 'granted' && (groups.overdue.length + groups.today.length) > 0) {
          new Notification('澳洲FCL · 今日跟进提醒', { body: '逾期 ' + groups.overdue.length + ' 个，今天该跟进 ' + groups.today.length + ' 个' });
          localStorage.setItem(key, '1');
        }
      } catch (e) {}
    } catch (e) {}
  }

  /* ---- 路由钩子：渲染后注入 ---- */
  function hook() {
    if (typeof Router === 'undefined' || !Router.dispatch || Router.__fuHooked) return false;
    var orig = Router.dispatch;
    Router.dispatch = function () {
      var r = orig.apply(this, arguments);
      setTimeout(function () {
        var name = (App.state.route || {}).name;
        if (name === 'customer') injectDetail();
        else if (name === 'customers' || name === 'dashboard') injectBanner();
      }, 400);
      return r;
    };
    Router.__fuHooked = true;
    return true;
  }
  var tries = 0;
  (function wait() { if (hook() || ++tries > 40) return; setTimeout(wait, 250); })();
  window.FU = { lastAt: lastAt, daysSince: daysSince, need: need, fmt: fmt, add: addFollowUp, LIMIT: LIMIT };
})();
