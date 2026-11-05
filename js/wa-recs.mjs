/* ============================================================================
 * 客户分析记录库（用于多客户分批导出）
 * ==========================================================================*/
(function () {
  'use strict';
  var KEY = 'aufcl_wa_recs_v1';
  function all() { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; } }
  function save(l) { try { localStorage.setItem(KEY, JSON.stringify(l.slice(0, 100))); } catch (e) {} }
  function uid() { return 'R' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 100); }
  function add(rec) {
    var l = all();
    var it = Object.assign({ id: uid(), at: Date.now(), cust: rec.cust || '未命名客户', country: rec.country || '', gender: rec.gender || 'any' }, rec);
    it.id = it.id || uid();
    l.unshift(it); save(l); return it;
  }
  function remove(id) { save(all().filter(function (x) { return x.id !== id; })); }
  function get(id) { return all().filter(function (x) { return x.id === id; })[0] || null; }
  function clearAll() { save([]); }
  window.WARecs = { all: all, add: add, remove: remove, get: get, clearAll: clearAll };
})();
