/* ============================================================================
 * 付费请求实时通道（PayRelay）
 *   · 在线静态版（GitHub Pages）也能用：走 ntfy.sh 公共推送通道，无需服务器
 *   · 客户点「我已支付，请求放行」→ 你的手机 ntfy App 立刻收到推送
 *   · 你在手机/电脑的「付费放行」页点放行 → 客户浏览器自动进入（6 小时通行证）
 *   · 本地全栈模式优先走本机服务端 /api/pay/*（更私密）
 * ==========================================================================*/
(function () {
  'use strict';
  /* 在线频道（= 你的“在线密钥”）；客户页与放行页必须一致。可用 ?ch=xxx 临时覆盖。 */
  var DEFAULT_CH = 'aufcl-ray-gv26k9';
  var BASE = 'https://ntfy.sh/';
  function ch() {
    try {
      var q = new URLSearchParams(location.search).get('ch');
      if (q) return String(q).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
      var ls = localStorage.getItem('aufcl_ch');
      if (ls) return ls;
    } catch (e) {}
    return DEFAULT_CH;
  }
  function setCh(v) { try { localStorage.setItem('aufcl_ch', String(v || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)); } catch (e) {} }
  function topicUrl(suffix) { return BASE + ch() + (suffix || ''); }
  function pageUrl() {
    try { return location.origin + location.pathname.replace(/index\.html.*$/, '') + 'index.html#/pay'; } catch (e) { return ''; }
  }
  /* 发消息（客户请求 / 业主放行都用它）—— 用 ntfy 的 JSON 发布接口，中文标题无编码问题 */
  function publish(obj, opts) {
    opts = opts || {};
    var payload = {
      topic: ch(),
      title: opts.title || ('AU-FCL ' + (obj.t || 'msg')),
      message: JSON.stringify(obj),
      priority: opts.priority === 'high' ? 4 : 3,
      tags: String(opts.tags || (obj.t === 'req' ? 'moneybag' : 'white_check_mark')).split(','),
      click: opts.click || pageUrl()
    };
    return fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { if (!r.ok) throw new Error('通道返回 ' + r.status); return r.json(); });
  }
  /* 一次性拉取最近消息（兜底/初次加载） */
  function poll(sinceSec) {
    return fetch(topicUrl('/json?poll=1&since=' + (sinceSec || 600) + 's'))
      .then(function (r) { return r.text(); })
      .then(function (t) {
        return t.split('\n').filter(Boolean).map(function (line) {
          try { var j = JSON.parse(line); var m = JSON.parse(j.message || '{}'); m._at = j.time; return m; } catch (e) { return null; }
        }).filter(Boolean);
      })
      .catch(function () { return []; });
  }
  /* 实时订阅（SSE）；断线自动重连由 EventSource 负责 */
  function watch(onMsg, onState) {
    var es = null;
    try {
      es = new EventSource(topicUrl('/sse'));
      es.onopen = function () { if (onState) onState('open'); };
      es.onerror = function () { if (onState) onState('error'); };
      es.onmessage = function (ev) {
        try {
          var j = JSON.parse(ev.data);
          if (j.event !== 'message') return;
          var m = JSON.parse(j.message || '{}');
          m._at = j.time;
          if (onMsg) onMsg(m);
        } catch (e) {}
      };
    } catch (e) { if (onState) onState('unsupported'); }
    return { close: function () { try { if (es) es.close(); } catch (e) {} } };
  }
  /* 本机服务端是否可用（全栈模式优先） */
  function serverOk() {
    return fetch('api/health', { signal: (window.AbortSignal && AbortSignal.timeout) ? AbortSignal.timeout(2500) : undefined })
      .then(function (r) { return r.ok || r.status === 401; })
      .catch(function () { return false; });
  }
  window.PayRelay = { DEFAULT_CH: DEFAULT_CH, ch: ch, setCh: setCh, url: topicUrl, publish: publish, poll: poll, watch: watch, serverOk: serverOk, pageUrl: pageUrl };
})();
