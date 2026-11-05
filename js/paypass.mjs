/* ============================================================================
 * 付费通行证（Pay Pass）—— 扫码付费后进入操作端
 *   · 通行证 = 一次性 6 小时窗口；到期强制退出，需再次付费
 *   · 两种放行方式：① 线上授权码（离线可校验）② 局域网/全栈模式：后台人工放行
 *   · 数据（客户档案）不受影响：退出只清通行证，不清业务数据
 * ==========================================================================*/
(function () {
  'use strict';
  var KEY = 'aufcl_pass_v1';
  var PEND = 'aufcl_pass_pending_v1';
  var SECRET = 'GV-AU-FCL-2026::RAYMOND::PASS::v1';
  var DEFAULT_HOURS = 6;
  /* FNV-1a 32bit → base36（用于授权码签名，避免明文可猜） */
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return h >>> 0;
  }
  function b36(n) { return (n >>> 0).toString(36).toUpperCase(); }
  /* 时长归一：未填/非法/为 0 → 默认 6 小时；负数保留（仅内部用于生成已过期样本做自检） */
  function normHours(h) { var n = Number(h); if (h === undefined || h === null || h === '' || isNaN(n) || n === 0) return DEFAULT_HOURS; return n; }
  function sig(exp, salt) { return b36(hash(SECRET + '|' + exp + '|' + salt)).slice(0, 5); }
  /* ---------- 通行证读写 ---------- */
  function current() {
    try {
      var p = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!p || !p.exp) return null;
      if (Date.now() > p.exp) { localStorage.removeItem(KEY); return null; }
      return p;
    } catch (e) { return null; }
  }
  function issue(hours, src, code, who) {
    var h = normHours(hours);
    var p = { exp: Date.now() + h * 3600 * 1000, hours: h, src: src || 'code', code: code || '', who: who || '', at: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
    return p;
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function remainMs() { var p = current(); return p ? Math.max(0, p.exp - Date.now()) : 0; }
  function fmtRemain() {
    var ms = remainMs(); if (!ms) return '00:00:00';
    var s = Math.floor(ms / 1000), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
  }
  /* ---------- 授权码（业主生成 → 客户输入） ---------- */
  function makeCode(hours, saltIn) {
    var h = normHours(hours);
    var salt = saltIn || b36(hash(String(Date.now()) + Math.random())).slice(0, 4);
    var exp = Date.now() + h * 3600 * 1000;
    var e = b36(Math.floor(exp / 1000));
    return 'GV-' + salt + '-' + e + '-' + sig(e, salt);
  }
  function verifyCode(code) {
    var c = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
    var m = c.match(/^GV-([0-9A-Z]{2,6})-([0-9A-Z]{4,10})-([0-9A-Z]{4,8})$/);
    if (!m) return { ok: false, err: '授权码格式不正确（应为 GV-XXXX-XXXX-XXXX）' };
    var salt = m[1], e = m[2], s = m[3];
    if (sig(e, salt) !== s) return { ok: false, err: '授权码无效或已被篡改' };
    var exp = parseInt(e, 36) * 1000;
    if (!exp || isNaN(exp)) return { ok: false, err: '授权码无效' };
    if (Date.now() > exp) return { ok: false, err: '授权码已过期（有效期 ' + Math.round((Date.now() - exp) / 60000) + ' 分钟前失效），请重新获取' };
    return { ok: true, exp: exp, hours: Math.round((exp - Date.now()) / 3600000 * 10) / 10 };
  }
  /* ---------- 待放行请求（全栈/局域网模式） ---------- */
  function setPending(o) { try { localStorage.setItem(PEND, JSON.stringify(o)); } catch (e) {} }
  function getPending() { try { return JSON.parse(localStorage.getItem(PEND) || 'null'); } catch (e) { return null; } }
  function clearPending() { try { localStorage.removeItem(PEND); } catch (e) {} }
  /* ---------- 倒计时 + 到期强制退出 ---------- */
  var _timer = null, _onExpire = null;
  function startWatch(onExpire) {
    _onExpire = onExpire;
    if (_timer) clearInterval(_timer);
    _timer = setInterval(function () {
      var chip = document.getElementById('passChip');
      var p = current();
      if (!p) {
        if (chip) chip.style.display = 'none';
        if (localStorage.getItem(KEY) === null && _onExpire && window.__aufclHadPass) { window.__aufclHadPass = false; _onExpire(); }
        return;
      }
      window.__aufclHadPass = true;
      if (chip) {
        chip.style.display = '';
        var t = fmtRemain();
        chip.textContent = '⏱ 付费通行 ' + t;
        chip.className = 'pass-chip' + (remainMs() < 15 * 60 * 1000 ? ' warn' : '');
      }
      if (Date.now() > p.exp) { clear(); if (_onExpire) _onExpire(); }
    }, 1000);
  }
  /* ---------- 源码保护（威慑级，非加密） ---------- */
  function protect() {
    try {
      document.addEventListener('contextmenu', function (e) { e.preventDefault(); }, { capture: true });
      document.addEventListener('keydown', function (e) {
        var k = (e.key || '').toLowerCase();
        if (k === 'f12') { e.preventDefault(); e.stopPropagation(); return false; }
        if (e.ctrlKey && e.shiftKey && (k === 'i' || k === 'j' || k === 'c' || k === 'e')) { e.preventDefault(); return false; }
        if (e.ctrlKey && (k === 'u' || k === 's')) { e.preventDefault(); return false; }
        if (e.metaKey && e.altKey && (k === 'i' || k === 'j' || k === 'c' || k === 'u')) { e.preventDefault(); return false; }
      }, { capture: true });
      document.addEventListener('dragstart', function (e) { var t = e.target; if (t && t.tagName === 'IMG') e.preventDefault(); }, true);
      var st = document.createElement('style');
      st.textContent = '.no-select{-webkit-user-select:none;-moz-user-select:none;user-select:none}';
      document.head.appendChild(st);
    } catch (e) {}
  }
  window.PayPass = {
    HOURS: DEFAULT_HOURS,
    current: current, issue: issue, clear: clear, remainMs: remainMs, fmtRemain: fmtRemain,
    makeCode: makeCode, verifyCode: verifyCode, sig: sig, b36: b36,
    setPending: setPending, getPending: getPending, clearPending: clearPending,
    startWatch: startWatch, protect: protect
  };
})();
