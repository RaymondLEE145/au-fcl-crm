/* ============================================================================
 * 浏览器内 OCR（静态网页也能用，无需服务端）
 *   · 抓屏：getDisplayMedia 选窗口/屏幕 → 取帧（不接触被截取的软件本身）
 *   · 识别：Tesseract.js（CDN 懒加载，首次约 10-20MB，之后浏览器缓存）
 *   · 有本地服务端时优先用服务端 OCR（Windows 自带引擎，更快更准）
 * ==========================================================================*/
(function () {
  'use strict';
  var CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  var _worker = null, _langs = '', _loading = null;
  function loadScript(url) {
    return new Promise(function (res, rej) {
      if (window.Tesseract) return res();
      var s = document.createElement('script');
      s.src = url; s.onload = function () { res(); }; s.onerror = function () { rej(new Error('OCR 组件加载失败（需要联网）')); };
      document.head.appendChild(s);
    });
  }
  function ensure(langs, onProgress) {
    langs = langs || 'eng';
    if (_worker && _langs === langs) return Promise.resolve(_worker);
    if (_loading) return _loading;
    _loading = loadScript(CDN).then(function () {
      return window.Tesseract.createWorker(langs, 1, {
        logger: function (m) { if (onProgress && m && m.status) onProgress(m.status, m.progress || 0); }
      });
    }).then(function (w) {
      if (_worker) { try { _worker.terminate(); } catch (e) {} }
      _worker = w; _langs = langs; _loading = null; return w;
    }).catch(function (e) { _loading = null; throw e; });
    return _loading;
  }
  function blobToDataURL(b) { return new Promise(function (res) { var f = new FileReader(); f.onload = function () { res(f.result); }; f.readAsDataURL(b); }); }
  function imageToText(img, opt) {
    opt = opt || {};
    var langs = opt.langs || (_langs || 'eng');
    return ensure(langs, opt.onProgress).then(function (w) {
      var src = (img instanceof Blob) ? blobToDataURL(img) : Promise.resolve(img);
      return src.then(function (data) { return w.recognize(data); });
    }).then(function (r) { return (r && r.data && r.data.text) || ''; });
  }
  function captureScreen() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return Promise.reject(new Error('当前浏览器不支持抓屏（需 Chrome/Edge，且必须 https 或 localhost）'));
    return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: false }).then(function (stream) {
      return new Promise(function (res, rej) {
        var v = document.createElement('video');
        v.srcObject = stream; v.muted = true;
        v.onloadedmetadata = function () {
          v.play().then(function () {
            setTimeout(function () {
              try {
                var c = document.createElement('canvas');
                c.width = v.videoWidth; c.height = v.videoHeight;
                c.getContext('2d').drawImage(v, 0, 0);
                stream.getTracks().forEach(function (t) { t.stop(); });
                c.toBlob(function (b) { b ? res(b) : rej(new Error('截图失败')); }, 'image/png');
              } catch (e) { rej(e); }
            }, 350);
          }).catch(rej);
        };
      });
    });
  }
  /* ---- 会话式抓屏：授权一次，之后可反复抓取（不重复弹窗） ---- */
  var _sess = null;
  function startCapture() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return Promise.reject(new Error('浏览器不支持抓屏（需 Chrome/Edge，且 https 或 localhost）'));
    return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false }).then(function (stream) {
      return new Promise(function (res, rej) {
        var v = document.createElement('video');
        v.srcObject = stream; v.muted = true; v.playsInline = true;
        var waited = 0;
        function ready() {
          if (v.videoWidth > 0 && v.readyState >= 2) return true;
          return false;
        }
        v.onloadedmetadata = function () {
          v.play().then(function () {
            (function waitReady(){
              if (ready()) {
                setTimeout(function () {
                  _sess = { stream: stream, video: v, w: v.videoWidth, h: v.videoHeight, ended: false };
                  var tr0 = stream.getVideoTracks()[0];
                  if (tr0) tr0.onended = function () { if (_sess) _sess.ended = true; };
                  res({
                    width: v.videoWidth, height: v.videoHeight,
                    grab: function (rect) { return grabFrame(rect); },
                    stop: function () { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} _sess = null; },
                    alive: function () { return !!_sess && !_sess.ended && stream.getVideoTracks().some(function (t) { return t.readyState === 'live'; }); },
                    ended: function () { return !!_sess && _sess.ended; }
                  });
                }, 250);
                return;
              }
              waited += 100;
              if (waited > 4000) { rej(new Error('视频流启动超时（可能被浏览器暂停）：请切到 WhatsApp 窗口让它保持可见，再重新选择一次')); return; }
              setTimeout(waitReady, 100);
            })();
          }).catch(function (e) { rej(new Error('画面播放失败：' + (e && e.message || '请重试'))); });
        };
              _sess = { stream: stream, video: v, w: v.videoWidth, h: v.videoHeight };
              res({
                width: v.videoWidth, height: v.videoHeight,
                grab: function (rect) { return grabFrame(rect); },
                stop: function () { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} _sess = null; },
                alive: function () { return !!_sess && stream.getVideoTracks().some(function (t) { return t.readyState === 'live'; }); }
              });
        v.onerror = function () { rej(new Error('画面读取失败')); };
      });
    });
  }
  /* rect: {x,y,w,h} 均为 0~1 比例；不传则整幅 */
  /* 检测画面是否空白/黑屏（采样 24×24 网格，颜色几乎一致即判定无效） */
  function frameBlank(ctx, w, h) {
    try {
      var data = ctx.getImageData(0, 0, w, h).data;
      var first = [data[0], data[1], data[2]];
      var same = 0, total = 0;
      var stepX = Math.max(1, Math.floor(w / 24)), stepY = Math.max(1, Math.floor(h / 24));
      for (var y = 0; y < h; y += stepY) {
        for (var x = 0; x < w; x += stepX) {
          var i = (y * w + x) * 4;
          total++;
          if (Math.abs(data[i] - first[0]) < 6 && Math.abs(data[i + 1] - first[1]) < 6 && Math.abs(data[i + 2] - first[2]) < 6) same++;
        }
      }
      return total > 0 && same / total > 0.985;
    } catch (e) { return false; }
  }
  function grabFrame(rect, opt) {
    return new Promise(function (res, rej) {
      if (!_sess) { rej(new Error('请先点「选择窗口」授权抓屏')); return; }
      try {
        var v = _sess.video, W = v.videoWidth, H = v.videoHeight;
        var r = rect || { x: 0, y: 0, w: 1, h: 1 };
        var sx = Math.max(0, Math.round(r.x * W)), sy = Math.max(0, Math.round(r.y * H));
        var sw = Math.min(W - sx, Math.round(r.w * W)), sh = Math.min(H - sy, Math.round(r.h * H));
        if (sw < 20 || sh < 20) { rej(new Error('识别区域太小')); return; }
        /* 提速：OCR 前把画面宽度限制到 1400px（太小影响识别，太大拖慢 Tesseract） */
        var maxW = (opt && opt.maxWidth) || 1400;
        var scale = sw > maxW ? maxW / sw : 1;
        var ow = Math.round(sw * scale), oh = Math.round(sh * scale);
        var c = document.createElement('canvas');
        c.width = ow; c.height = oh;
        var ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(v, sx, sy, sw, sh, 0, 0, ow, oh);
        if (frameBlank(ctx, ow, oh)) {
          rej(new Error('抓到的画面是空白/黑屏：请把 WhatsApp 窗口切到前台并保持可见（不要最小化或切到别的标签页），再点一次')); return;
        }
        c.toBlob(function (b) { b ? res(b) : rej(new Error('截帧失败')); }, 'image/png');   /* 返回 PNG Blob（已按 maxWidth 缩放） */
      } catch (e) { rej(e); }
    });
  }
  function sessActive() { return !!_sess; }
  /* ---- 富文本识别：返回每行文字 + 归一化坐标（用于按左右气泡区分说话人） ---- */
  function imageToRich(img, opt) {
    opt = opt || {};
    var langs = opt.langs || (_langs || 'eng');
    return ensure(langs, opt.onProgress).then(function (w) {
      var src = (img instanceof Blob) ? blobToDataURL(img) : Promise.resolve(img);
      return src.then(function (data) { return w.recognize(data); });
    }).then(function (r) {
      var d = (r && r.data) || {};
      var lines = (d.lines || []).map(function (l) {
        var b = l.bbox || {};
        return { text: String(l.text || '').trim(), x0: b.x0 || 0, x1: b.x1 || 0, y0: b.y0 || 0, y1: b.y1 || 0 };
      }).filter(function (l) { return l.text; });
      var W = (d.imageWidth || 0) || (lines.length ? Math.max.apply(null, lines.map(function (l) { return l.x1; })) : 1);
      var H = (d.imageHeight || 0) || (lines.length ? Math.max.apply(null, lines.map(function (l) { return l.y1; })) : 1);
      lines.forEach(function (l) { l.cx = W ? ((l.x0 + l.x1) / 2) / W : 0.5; });
      return { text: lines.map(function (l) { return l.text; }).join(String.fromCharCode(10)), lines: lines, width: W, height: H };
    });
  }
  window.WAOCR = { ensure: ensure, imageToText: imageToText, captureScreen: captureScreen, startCapture: startCapture, grabFrame: grabFrame, sessActive: sessActive, imageToRich: imageToRich, blobToDataURL: blobToDataURL, isLoaded: function () { return !!_worker; } };
})();
