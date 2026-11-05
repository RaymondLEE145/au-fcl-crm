/* ============================================================================
 * 话术库：把采纳过的回复沉淀成模板，按「阶段 + 国家 + 产品」复用
 * ==========================================================================*/
(function () {
  'use strict';
  var KEY = 'aufcl_wa_lib_v1';
  function all() { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; } }
  function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 500))); } catch (e) {} }
  function uid() { return 'W' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1000); }
  function add(o) {
    var list = all();
    var it = {
      id: uid(), at: Date.now(),
      stage: o.stage || '', stageZh: o.stageZh || '',
      country: o.country || '', product: o.product || '',
      tone: o.tone || 'steady', lang: o.lang || 'en',
      en: String(o.en || '').slice(0, 4000), zh: String(o.zh || '').slice(0, 2000),
      cat: String(o.cat || '').slice(0, 40), note: String(o.note || '').slice(0, 500),
      tags: o.tags || [], uses: 0
    };
    list.unshift(it); save(list); return it;
  }
  function remove(id) { save(all().filter(function (x) { return x.id !== id; })); }
  function update(id, patch) {
    var l = all();
    for (var i = 0; i < l.length; i++) {
      if (l[i].id === id) {
        if ('cat' in (patch || {})) l[i].cat = String(patch.cat || '').slice(0, 40);
        if ('note' in (patch || {})) l[i].note = String(patch.note || '').slice(0, 500);
        if (patch && patch.en) l[i].en = String(patch.en).slice(0, 4000);
        if (patch && patch.zh) l[i].zh = String(patch.zh).slice(0, 2000);
        break;
      }
    }
    save(l); return true;
  }
  function cats() {
    var out = {};
    all().forEach(function (x) { if (x.cat) out[x.cat] = (out[x.cat] || 0) + 1; });
    return out;
  }
  function use(id) { var l = all(); for (var i = 0; i < l.length; i++) { if (l[i].id === id) { l[i].uses = (l[i].uses || 0) + 1; l[i].lastUsed = Date.now(); } } save(l); }
  function query(q) {
    q = q || {};
    return all().filter(function (x) {
      if (q.stage && x.stage !== q.stage) return false;
      if (q.country && String(x.country).toLowerCase().indexOf(String(q.country).toLowerCase()) < 0) return false;
      if (q.lang && x.lang !== q.lang) return false;
      if (q.cat && x.cat !== q.cat) return false;
      if (q.text) { var s = (x.en + ' ' + x.zh + ' ' + (x.tags || []).join(' ') + ' ' + (x.cat || '') + ' ' + (x.note || '')).toLowerCase(); if (s.indexOf(String(q.text).toLowerCase()) < 0) return false; }
      return true;
    });
  }
  var CN = { en: '英文', yue: '粤语', es: '西班牙语', ar: '阿拉伯语', pt: '葡萄牙语' };
  function text(it) { return it.en || it.zh; }
  function exportJson() { return JSON.stringify({ v: 1, at: Date.now(), items: all() }, null, 2); }
  function importJson(txt) {
    var j = JSON.parse(txt);
    var items = (j && j.items) ? j.items : (Array.isArray(j) ? j : []);
    var list = all(); var n = 0;
    for (var i = 0; i < items.length; i++) {
      var x = items[i]; if (!x || (!x.en && !x.zh)) continue;
      list.unshift({ id: uid(), at: Date.now(), stage: x.stage || '', stageZh: x.stageZh || '', country: x.country || '', product: x.product || '', tone: x.tone || 'steady', lang: x.lang || 'en', en: String(x.en || ''), zh: String(x.zh || ''), tags: x.tags || [], uses: 0 });
      n++;
    }
    save(list); return n;
  }
  window.WALib = { all: all, add: add, update: update, remove: remove, use: use, query: query, cats: cats, exportJson: exportJson, importJson: importJson, LANG_ZH: CN, text: text };
})();
