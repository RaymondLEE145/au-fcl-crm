/* ============================================================================
 * auth.mjs —— 登录门禁
 *   两种模式：
 *     · 服务端模式：POST /api/login 换取 httpOnly 会话 cookie，由服务端鉴权
 *     · 静态模式（GitHub Pages 等）：前端校验 + localStorage 会话
 * ==========================================================================*/
'use strict';

const Auth = {
  KEY: 'aufcl_session_v1',
  LOCK: 'aufcl_lock_v1',
  cfg: window.CRM_AUTH || { user: 'RAYMOND', pass: 'RAYMOND', captcha: 'RAYMOND', hours: 12, maxFails: 5, lockSeconds: 60 },
  serverMode: false,
  onDone: null,

  /* ---------------- 会话读写 ---------------- */
  session: function () {
    try {
      const s = JSON.parse(localStorage.getItem(this.KEY) || 'null');
      if (!s || !s.exp || Date.now() > s.exp) return null;
      return s;
    } catch (e) { return null; }
  },
  isLoggedIn: function () { return !!this.session(); },
  save: function (user) {
    const s = { token: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2), user: user, at: Date.now(), exp: Date.now() + this.cfg.hours * 3600 * 1000 };
    try { localStorage.setItem(this.KEY, JSON.stringify(s)); } catch (e) {}
    return s;
  },
  clear: function () { try { localStorage.removeItem(this.KEY); } catch (e) {} },

  /* ---------------- 失败锁定 ---------------- */
  lockLeft: function () {
    try {
      const l = JSON.parse(localStorage.getItem(this.LOCK) || 'null');
      if (!l) return 0;
      const left = Math.ceil((l.until - Date.now()) / 1000);
      if (left <= 0) { localStorage.removeItem(this.LOCK); return 0; }
      return left;
    } catch (e) { return 0; }
  },
  addFail: function () {
    let l = { n: 0, until: 0 };
    try { l = JSON.parse(localStorage.getItem(this.LOCK) || 'null') || l; } catch (e) {}
    l.n = (l.n || 0) + 1;
    if (l.n >= this.cfg.maxFails) { l.until = Date.now() + this.cfg.lockSeconds * 1000; l.n = 0; }
    try { localStorage.setItem(this.LOCK, JSON.stringify(l)); } catch (e) {}
    return l;
  },

  /* ---------------- 验证码画布 ---------------- */
  drawCaptcha: function () {
    const cv = document.getElementById('lgCanvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#FFFDF7'); g.addColorStop(1, '#F7ECD6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    /* 干扰线与噪点 */
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = 'rgba(' + (150 + Math.random() * 80 | 0) + ',' + (120 + Math.random() * 80 | 0) + ',' + (90 + Math.random() * 60 | 0) + ',0.5)';
      ctx.beginPath();
      ctx.moveTo(Math.random() * w, Math.random() * h);
      ctx.bezierCurveTo(Math.random() * w, Math.random() * h, Math.random() * w, Math.random() * h, Math.random() * w, Math.random() * h);
      ctx.stroke();
    }
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = 'rgba(166,123,91,' + (Math.random() * 0.4).toFixed(2) + ')';
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
    }
    /* 文字：与配置一致的验证码，逐字随机旋转/上色 */
    const txt = String(this.cfg.captcha || 'RAYMOND');
    const step = w / (txt.length + 0.6);
    for (let i = 0; i < txt.length; i++) {
      ctx.save();
      const x = step * (i + 0.8), y = h * 0.52 + (Math.random() - 0.5) * 8;
      ctx.translate(x, y);
      ctx.rotate((Math.random() - 0.5) * 0.5);
      ctx.font = 'bold ' + (18 + Math.random() * 5 | 0) + 'px "Segoe UI",Arial,sans-serif';
      ctx.fillStyle = 'rgb(' + (90 + Math.random() * 70 | 0) + ',' + (60 + Math.random() * 60 | 0) + ',' + (30 + Math.random() * 50 | 0) + ')';
      ctx.fillText(txt[i], -8, 6);
      ctx.restore();
    }
  },

  /* ---------------- 登录 ---------------- */
  login: async function (user, pass, captcha) {
    const U = String(user || '').trim().toUpperCase();
    const P = String(pass || '').trim().toUpperCase();
    const C = String(captcha || '').trim().toUpperCase();
    const c = this.cfg;
    if (!U || !P || !C) return { ok: false, error: '账号、密码、验证码必须全部填写' };
    /* 预校验（静态模式即以这里为准；服务端模式服务端还会再验一次） */
    if (U !== String(c.user).toUpperCase() || P !== String(c.pass).toUpperCase()) return { ok: false, error: '账号或密码不正确' };
    if (C !== String(c.captcha).toUpperCase()) return { ok: false, error: '验证码不正确' };
    /* 服务端模式：换取会话 cookie */
    if (this.serverMode) {
      try {
        const r = await fetch('api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: U, pass: P, captcha: C }) });
        const j = await r.json();
        if (!r.ok || j.ok === false) return { ok: false, error: j.error || '登录失败' };
      } catch (e) {
        return { ok: false, error: '无法连接服务端：' + e.message };
      }
    }
    this.save(U);
    return { ok: true };
  },

  logout: async function () {
    if (this.serverMode) { try { await fetch('api/logout', { method: 'POST' }); } catch (e) {} }
    this.clear();
    location.reload();
  },

  /* ---------------- 界面门禁 ---------------- */
  show: function () {
    const o = document.getElementById('loginOverlay');
    if (o) { o.classList.remove('gone'); o.classList.add('show'); }
    const app = document.getElementById('app');
    if (app) app.classList.add('locked');
    this.drawCaptcha();
    setTimeout(function () { const u = document.getElementById('lgUser'); if (u) u.focus(); }, 80);
  },
  hide: function () {
    const o = document.getElementById('loginOverlay');
    const appNow = document.getElementById('app');
    if (appNow) appNow.classList.remove('locked');   /* 先解锁，避免动画期间不可点击 */
    if (!o) return;
    o.classList.add('fade');
    setTimeout(function () {
      o.classList.add('gone'); o.classList.remove('show');
      const app = document.getElementById('app');
      if (app) app.classList.remove('locked');
    }, 380);
  },
  msg: function (text, kind) {
    const m = document.getElementById('lgMsg');
    if (!m) return;
    m.textContent = text || '';
    m.className = 'lg-msg' + (kind ? ' ' + kind : '');
  },

  /* ---------------- 启动流程 ---------------- */
  init: async function (onDone) {
    this.onDone = onDone;
    const self = this;
    /* 探测是否服务端模式 */
    try {
      const r = await fetch('api/health', { signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined });
      this.serverMode = r.ok || r.status === 401;
      if (r.status === 401) {
        /* 服务端在，但会话过期 */
        this.clear();
      }
    } catch (e) { this.serverMode = false; }

    const bind = function () {
      const btn = document.getElementById('lgBtn');
      const cv = document.getElementById('lgCanvas');
      const submit = async function () {
        const left = self.lockLeft();
        if (left > 0) { self.msg('尝试次数过多，请 ' + left + ' 秒后再试', 'err'); return; }
        const u = document.getElementById('lgUser').value;
        const p = document.getElementById('lgPass').value;
        const c = document.getElementById('lgCaptcha').value;
        self.msg('正在登录…', '');
        const r = await self.login(u, p, c);
        if (r.ok) {
          self.msg('登录成功，正在进入系统…', 'ok');
          const box = document.querySelector('#loginOverlay .lg-card');
          if (box) box.classList.add('ok-flash');
          setTimeout(function () { self.hide(); if (self.onDone) self.onDone(); }, 420);
        } else {
          const l = self.addFail();
          self.drawCaptcha();
          document.getElementById('lgCaptcha').value = '';
          const card = document.querySelector('#loginOverlay .lg-card');
          if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
          const lf = self.lockLeft();
          self.msg(lf > 0 ? ('连续错误 ' + self.cfg.maxFails + ' 次，已锁定 ' + lf + ' 秒') : r.error, 'err');
        }
      };
      if (btn) btn.addEventListener('click', submit);
      if (cv) cv.addEventListener('click', function () { self.drawCaptcha(); });
      ['lgUser', 'lgPass', 'lgCaptcha'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      });
      const lo = document.getElementById('logoutBtn');
      if (lo) lo.addEventListener('click', function () { self.logout(); });
      self.drawCaptcha();
    };

    if (this.isLoggedIn()) {
      /* 已有有效会话：直接进系统，并务必解除界面锁定（否则整页不可点击） */
      const o = document.getElementById('loginOverlay');
      if (o) { o.classList.add('gone'); o.classList.remove('show'); }
      const app = document.getElementById('app');
      if (app) app.classList.remove('locked');
      bind();
      if (onDone) onDone();
      return true;
    }
    this.show();
    bind();
    return false;
  }
};
window.Auth = Auth;
