/* ============================================================================
 * 付费登录门禁：扫码付费 → 授权码 / 人工放行 → 6 小时一次性通行证
 * ==========================================================================*/
(function () {
  'use strict';
  var P = window.PayPass;
  if (!P) return;
  var poll = null;
  function $(id) { return document.getElementById(id); }
  function msg(t, k) { var m = $('payMsg'); if (m) { m.textContent = t || ''; m.className = 'lg-msg' + (k ? ' ' + k : ''); } }
  function enter(via) {
    try { P.clearPending(); } catch (e) {}
    var card = document.querySelector('#loginOverlay .lg-card');
    if (card) card.classList.add('ok-flash');
    msg('付费通行证已生效（' + P.HOURS + ' 小时），正在进入系统…', 'ok');
    setTimeout(function () {
      if (window.Auth && Auth.hide) Auth.hide();
      if (window.Auth && Auth.onDone) Auth.onDone();
      if (!window.Auth) location.reload();
    }, 420);
  }
  /* ---- 页签切换 ---- */
  function bindTabs() {
    var tabs = document.querySelectorAll('#loginOverlay .lg-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        var k = this.getAttribute('data-lgtab');
        var all = document.querySelectorAll('#loginOverlay .lg-tab');
        for (var j = 0; j < all.length; j++) all[j].className = 'lg-tab' + (all[j] === this ? ' on' : '');
        var acc = $('lgPaneAcc'), pay = $('lgPanePay');
        if (acc) acc.style.display = (k === 'acc') ? '' : 'none';
        if (pay) pay.style.display = (k === 'pay') ? '' : 'none';
      });
    }
  }
  /* ---- 授权码进入 ---- */
  function bindCode() {
    var b = $('payCodeBtn'), inp = $('payCode');
    if (!b || !inp) return;
    var go = function () {
      var v = String(inp.value || '').trim();
      if (!v) { msg('请先输入授权码', 'err'); return; }
      var r = P.verifyCode(v);
      if (!r.ok) { msg(r.err, 'err'); return; }
      P.issue(r.hours, 'code', v.toUpperCase());
      enter('code');
    };
    b.addEventListener('click', go);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    inp.value = (function () { try { var q = new URLSearchParams(location.search).get('code'); return q || ''; } catch (e) { return ''; } })();
  }
  /* ---- 请求放行（全栈/局域网模式） ---- */
  function bindRequest() {
    var b = $('payReqBtn');
    if (!b) return;
    b.addEventListener('click', function () {
      msg('正在提交放行请求…', '');
      var pend = P.getPending();
      var body = { note: (pend && pend.note) || '' };
      fetch('api/pay/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok || !res.j || res.j.ok === false) throw new Error((res.j && res.j.error) || '服务端未就绪');
          var id = res.j.id;
          P.setPending({ id: id, at: Date.now() });
          msg('请求已提交（单号 ' + id + '）· 请把付款截图发给我，确认到账后立即放行…', '');
          startPoll(id);
        })
        .catch(function (e) {
          msg('当前是「在线静态版」，无法实时接收你的请求 → 请把付款截图发我，我把授权码发你（填入上面输入框即可进入）。', 'err');
        });
    });
  }
  function startPoll(id) {
    if (poll) clearInterval(poll);
    var n = 0;
    poll = setInterval(function () {
      n++;
      fetch('api/pay/status?id=' + encodeURIComponent(id))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.status === 'approved') {
            clearInterval(poll); poll = null;
            if (j.code) { var v = P.verifyCode(j.code); if (v.ok) { P.issue(v.hours, 'approve', j.code); enter('approve'); return; } }
            P.issue(P.HOURS, 'approve', ''); enter('approve');
          } else if (j && j.status === 'rejected') {
            clearInterval(poll); poll = null; P.clearPending();
            msg('该请求未通过，请确认付款后重新提交或联系我方。', 'err');
          } else {
            msg('等待我方确认到账…（已等待 ' + (n * 3) + ' 秒）', '');
          }
        })
        .catch(function () { });
    }, 3000);
  }
  /* ---- 通行证：自动进入 / 到期强制退出 ---- */
  function installAuthHook() {
    if (!window.Auth || window.__payHook) return;
    window.__payHook = 1;
    var origIs = Auth.isLoggedIn.bind(Auth);
    Auth.isLoggedIn = function () { return !!P.current() || origIs(); };
    var origOut = Auth.logout.bind(Auth);
    Auth.logout = function () { try { P.clear(); P.clearPending(); } catch (e) {} return origOut(); };
  }
  function expire() {
    try { if (window.Auth && Auth.clear) Auth.clear(); } catch (e) {}
    try {
      var o = document.getElementById('loginOverlay');
      if (o) { o.classList.remove('gone', 'fade'); o.classList.add('show'); }
      var app = document.getElementById('app');
      if (app) app.classList.add('locked');
    } catch (e) {}
    try { alert('付费通行证已到期（' + P.HOURS + ' 小时一次性有效）。\n系统已退出，请重新扫码付费进入。\n\n提示：您的客户数据已完整保留在本机。'); } catch (e) {}
    location.reload();
  }
  function boot() {
    P.protect();
    bindTabs(); bindCode(); bindRequest();
    var had = !!P.current();
    P.startWatch(expire);
    if (had) {
      installAuthHook();
      /* 有通行证：无需账号密码，直接进入 */
      setTimeout(function () {
        if (P.current() && window.Auth && Auth.hide) { Auth.hide(); if (Auth.onDone) Auth.onDone(); }
      }, 260);
    }
    /* 每 20 秒兜底检查（防止标签页休眠导致定时器漂移） */
    setInterval(function () {
      installAuthHook();
      if (!P.current() && window.__aufclHadPass) expire();
    }, 20000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
  window.PayGate = { enter: enter, expire: expire, startPoll: startPoll };
})();
