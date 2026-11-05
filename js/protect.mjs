/* ============================================================================
 * 源码保护层（前端威慑）：禁用右键菜单、封开发者工具快捷键、保护图片与拖拽
 *   说明：前端代码无法 100% 隐藏（浏览器必须下载才能运行），本层是强威慑/防小白，
 *   真正的商业级保护需服务端渲染或 WebAssembly 编译。
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.__aufclProtect) return;
  window.__aufclProtect = true;

  var toastShown = {};
  function warn(msg) {
    try {
      if (toastShown[msg]) return;
      toastShown[msg] = 1;
      setTimeout(function () { toastShown[msg] = 0; }, 8000);
      var el = document.createElement('div');
      el.textContent = msg;
      el.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483647;background:rgba(24,20,16,.92);color:#F6EFE4;font-size:13.5px;padding:11px 20px;border-radius:10px;box-shadow:0 8px 26px rgba(0,0,0,.35);letter-spacing:.3px;pointer-events:none';
      document.body.appendChild(el);
      setTimeout(function () { try { el.remove(); } catch (e) {} }, 3600);
    } catch (e) {}
  }

  /* ① 右键菜单：允许输入框/文本域内（方便复制粘贴），其它一律拦截 */
  document.addEventListener('contextmenu', function (e) {
    var t = e.target;
    var tag = (t && t.tagName || '').toLowerCase();
    var editable = tag === 'input' || tag === 'textarea' || (t && t.isContentEditable);
    if (editable) return;
    e.preventDefault();
    warn('⚠ 本站已启用源码保护：右键菜单已禁用');
    return false;
  }, true);

  /* ② 开发者工具与查看源码快捷键 */
  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    var ctrl = e.ctrlKey || e.metaKey;
    var shift = e.shiftKey;
    /* F12 */
    if (k === 'f12') { e.preventDefault(); warn('⚠ 开发者工具已禁用'); return false; }
    /* Ctrl+Shift+I / J / C / K  (devtools) */
    if (ctrl && shift && (k === 'i' || k === 'j' || k === 'c' || k === 'k')) { e.preventDefault(); warn('⚠ 开发者工具已禁用'); return false; }
    /* Ctrl+U 查看源码 */
    if (ctrl && !shift && k === 'u') { e.preventDefault(); warn('⚠ 查看源码已禁用'); return false; }
    /* Ctrl+S 另存页面 */
    if (ctrl && !shift && k === 's') { e.preventDefault(); warn('⚠ 保存页面已禁用'); return false; }
    /* Ctrl+A 全选（输入框外） */
    if (ctrl && !shift && k === 'a') {
      var t = e.target, tag = (t && t.tagName || '').toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && !(t && t.isContentEditable)) { e.preventDefault(); return false; }
    }
  }, true);

  /* ③ 图片与链接拖拽、文字选择（输入框与正文可复制区域除外） */
  document.addEventListener('dragstart', function (e) {
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'img') { e.preventDefault(); return false; }
  }, true);

  /* ④ 禁止把整个页面拖到别处（防另存/嵌入） */
  document.addEventListener('drop', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    e.preventDefault();
  }, true);

  /* ⑤ iframe 内（同源模块）也加一层防护 */
  function protectIframes() {
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      try {
        var d = frames[i].contentDocument;
        if (!d || d.__aufclProtect) continue;
        d.__aufclProtect = true;
        d.addEventListener('contextmenu', function (ev) {
          var t = ev.target, tag = (t && t.tagName || '').toLowerCase();
          if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;
          ev.preventDefault();
        }, true);
        d.addEventListener('keydown', function (ev) {
          var k = (ev.key || '').toLowerCase(), ctrl = ev.ctrlKey || ev.metaKey, shift = ev.shiftKey;
          if (k === 'f12' || (ctrl && shift && (k === 'i' || k === 'j' || k === 'c' || k === 'k')) || (ctrl && !shift && (k === 'u' || k === 's'))) { ev.preventDefault(); }
        }, true);
      } catch (e) { /* 跨域 iframe 忽略 */ }
    }
  }
  setInterval(protectIframes, 2500);
  window.addEventListener('load', protectIframes);

  /* ⑥ 阻止以文件方式另存/打印整页源码（保留正常打印报价单） */
  try {
    Object.defineProperty(document, 'designMode', { get: function () { return 'off'; }, set: function () {} });
  } catch (e) {}


  /* ⑧ 开发者工具检测：检测到打开 → 模糊画面 + 警告层（阻止截图/录屏偷看内容） */
  window.__devtoolsGuard = function () {
    var warned = false, ov = null;
    function showOverlay() {
      if (ov) return;
      ov = document.createElement('div');
      ov.id = '__dtOverlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(12,10,8,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center;color:#F6EFE4;font-size:17px;font-weight:700;letter-spacing:.5px;text-align:center;padding:0 24px;line-height:1.9';
      ov.innerHTML = '⚠ 检测到开发者工具已打开<br><span style="font-size:13px;font-weight:400;opacity:.85">本系统源码受保护，请关闭开发者工具后继续使用</span>';
      document.documentElement.appendChild(ov);
    }
    function hideOverlay() { if (ov) { try { ov.remove(); } catch (e) {} ov = null; } }
    function check() {
      var w = window.outerWidth - window.innerWidth;
      var h = window.outerHeight - window.innerHeight;
      var open = (w > 170 || h > 200);
      if (open) showOverlay(); else hideOverlay();
    }
    setInterval(check, 900);
    check();
  };
  try { window.__devtoolsGuard(); } catch (e) {}
  /* ⑦ 控制台提示（威慑） */
  try {
    console.log('%c⚠ 源码受保护', 'color:#B3261E;font-size:16px;font-weight:800');
    console.log('%c本系统源码为商业机密，禁止复制、提取、二次分发。', 'color:#8A6D3B;font-size:12px');
  } catch (e) {}
})();
