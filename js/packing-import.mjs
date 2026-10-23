/* ============================================================================
 * 通用箱单解析器 v5.0（Universal Packing List Parser）
 * ----------------------------------------------------------------------------
 * 目标：任意模板 / 中英文 / 尺寸分列或合并 / MM·CM·M·INCH / KG·T·G·LB 全部
 *       自动识别并统一换算为 —— 尺寸 CM、重量 KG、件数按行汇总。
 *
 * 识别链路：
 *   ① 多工作表逐张打分（跳过说明页 / 重复的「预报明细(2)(3)」页）
 *   ② 表头行深度扫描（前 45 行，支持双行表头 + 合并单元格回填）
 *   ③ 列映射同义词库（中英 + 简写 + G.W./N.W./CTNS/QTY/MEAS. 等）
 *   ④ 行数据抽取（合并尺寸 / 分列长宽高 / 品名内嵌尺寸 / 组合尺寸 (a+b)*c*d）
 *   ⑤ 单位求解（核心）：表头单位 + 单元格单位标记 + 数值量级 +
 *      单行 CBM 列校准 + 表内合计体积/重量校准 + 装箱可行性(柜内尺寸) + 统计先验
 *      联合打分，同时求解「尺寸单位 + 重量单位 + 重量口径(单件/整行)」
 *   ⑥ 件数求解：区分 箱数/件数(cartons) 与 数量/PCS(pieces)，与表内合计交叉验证
 *   ⑦ 自校验报告：件数 / 体积 / 重量 与表内 TOTAL 行逐项对比，异常列出警告
 *
 * 对外 API（浏览器）：
 *   window.PLImport.version
 *   window.PLImport.parseFile(file[, opts])      -> Promise<result>
 *   window.PLImport.parseWorkbook(wb[, opts])    -> result
 *   window.PLImport.parseSheets(sheets[, opts])  -> result   // [{name, grid, merges}]
 *   window.PLImport.parseGrid(grid[, opts])      -> sheetResult (debug/单测用)
 * opts: { forceDimUnit:'mm'|'cm'|'m'|'in'|null, forceWeightUnit:'kg'|'t'|'g'|'lb'|null,
 *         keepMissingDims:true|false, sheetName?:string }
 * ==========================================================================*/
(function (root) {
  'use strict';

  var VERSION = '5.1.1';

  /* ============================ 0. 基础工具 ============================ */

  function txt(v) { return v == null ? '' : String(v); }
  function trim(v) { return txt(v).replace(/\u00a0/g, ' ').replace(/\r/g, ' ').trim(); }
  function clamp(n, a, b) { return n < a ? a : (n > b ? b : n); }
  function r1(n) { return Math.round(n * 10) / 10; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function isFin(n) { return typeof n === 'number' && isFinite(n); }
  function median(arr) {
    if (!arr || !arr.length) return 0;
    var b = arr.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(b.length / 2);
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }
  function relErr(a, b) { if (!(b > 0) || !isFin(a)) return 1; return clamp(Math.abs(a - b) / b, 0, 2); }
  function hNorm(v) {
    return trim(v).toLowerCase()
      .replace(/[（]/g, '(').replace(/[）]/g, ')')
      .replace(/[：:]/g, ' ')
      .replace(/[。，,；;、|]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  /* 数字解析：支持 "1,047.5" / "1 047" / "203KGS" / "0.203T" / 全角 */
  function num(v) {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var s = txt(v).replace(/[，]/g, ',').replace(/\u00a0/g, ' ').trim();
    if (!s) return NaN;
    /* 千分位：1,234,567 / 1 234 */
    s = s.replace(/(\d)[,\s](?=\d{3}(?![\d]))/g, '$1');
    var m = s.match(/-?\d+(?:\.\d+)?/);
    if (!m) return NaN;
    var n = Number(m[0]);
    return isFinite(n) ? n : NaN;
  }
  function isNumericCell(v) {
    var s = trim(v);
    if (!s) return false;
    return /^[-+]?\d+(?:[.,]\d+)?\s*(?:mm|cm|m|inch|in|kgs?|kg|t|g|lbs?|pcs|ctns?|%|\u00b0)?$/i.test(s);
  }
  function rowEmpty(cells) {
    for (var i = 0; i < cells.length; i++) { if (trim(cells[i]) !== '') return false; }
    return true;
  }
  function toCells(row) {
    var out = [];
    if (!row) return out;
    for (var i = 0; i < row.length; i++) out.push(trim(row[i]));
    return out;
  }
  function countNumeric(cells) {
    var n = 0;
    for (var i = 0; i < cells.length; i++) if (isNumericCell(cells[i])) n++;
    return n;
  }

  /* ============================ 1. 单位词表 ============================ */

  var DIM_TOKENS = [
    { u: 'mm', re: /(?:^|[^a-z])mms?(?![a-z])|毫米|millimet(?:er|re)s?/i },
    { u: 'cm', re: /(?:^|[^a-z])cms?(?![a-z])|厘米|centimet(?:er|re)s?/i },
    { u: 'in', re: /(?:^|[^a-z])(?:inch(?:es)?|ins?)(?![a-z])|英寸|[\u201d"]/i },
    { u: 'm', re: /(?:^|[^a-z])(?:m|mtr|mtrs|meter|meters|metre|metres)(?![a-z])|(?:^|[^毫厘])米/i }
  ];
  var WT_TOKENS = [
    { u: 'kg', re: /(?:^|[^a-z])kgs?(?![a-z])|千克|公斤|kilogram/i },
    { u: 't', re: /(?:^|[^a-z])(?:t|ts|ton|tons|tonne|tonnes)(?![a-z])|吨/i },
    { u: 'g', re: /(?:^|[^a-z])g(?:ram|rams)?(?![a-z])|克/i },
    { u: 'lb', re: /(?:^|[^a-z])(?:lb|lbs|pound|pounds)(?![a-z])|磅/i }
  ];
  /* G.W. / N.W. 不是克，先替换掉再识别单位 */
  function maskWeightMarks(s) {
    return txt(s)
      .replace(/g\s*\.\s*w\s*\.?/gi, ' gw ')
      .replace(/n\s*\.\s*w\s*\.?/gi, ' nw ')
      .replace(/gross\s*weight/gi, ' gw ')
      .replace(/net\s*weight/gi, ' nw ');
  }
  function unitCounts(s, defs) {
    var out = {};
    var raw = txt(s);
    defs.forEach(function (d) {
      var m = raw.match(new RegExp(d.re.source, 'gi'));
      if (m && m.length) out[d.u] = (out[d.u] || 0) + m.length;
    });
    return out;
  }
  function unitFromCounts(c) {
    var best = null, bn = 0;
    for (var k in c) if (c[k] > bn) { bn = c[k]; best = k; }
    return best;
  }
  function dimUnitIn(s) { return unitFromCounts(unitCounts(s, DIM_TOKENS)); }
  function weightUnitIn(s) { return unitFromCounts(unitCounts(maskWeightMarks(s), WT_TOKENS)); }

  var DIM_TO_CM = { mm: 0.1, cm: 1, m: 100, in: 2.54 };
  var WT_TO_KG = { kg: 1, t: 1000, g: 0.001, lb: 0.45359237 };

  /* ============================ 2. 尺寸单元格解析 ============================ */

  function normalizeDimString(s) {
    s = txt(s).replace(/\u00a0/g, ' ');
    s = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2');             /* 1,047 → 1047 */
    s = s.replace(/[\u00d7\u2715\u2716*\uff0a]/g, 'x');        /* × ✕ ✖ * ＊ → x */
    s = s.replace(/(\d)\s*[\/\\]\s*(?=\d)/g, '$1x');           /* 31/23/24 → 31x23x24 */
    s = s.replace(/(\d)\s*[-~]\s*(?=\d)/g, '$1x');             /* 31-23-24 → 31x23x24 */
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }
  function isDateLike(s) {
    return /^\d{4}\s*[-\/.]\s*\d{1,2}\s*[-\/.]\s*\d{1,2}$/.test(trim(s));
  }
  function perNumberUnits(s, count, fallback) {
    var segs = s.split(/\s*x\s*/i);
    var us = segs.map(function (seg) { return dimUnitIn(seg); });
    var found = us.some(Boolean);
    if (!found) return [fallback, fallback, fallback].slice(0, count);
    for (var i = us.length - 2; i >= 0; i--) if (!us[i]) us[i] = us[i + 1];
    for (var j = 1; j < us.length; j++) if (!us[j]) us[j] = us[j - 1];
    return us.slice(0, count);
  }
  /* → {nums:[..], units:[..], unit, form, incomplete?} 或 null
     注意：这里返回的 units 是「单元格内明确写出的单位」（硬标记），不是表头单位 */
  function parseDimsCell(v) {
    var raw = txt(v);
    if (!raw.trim()) return null;
    if (isDateLike(raw)) return null;
    var s = normalizeDimString(raw);
    if (s.length > 180) s = s.slice(0, 180);
    var unit = dimUnitIn(s);

    /* (2350+1300) x 350 x 1200 → 总长 x 宽 x 高 */
    var mSum = s.match(/\(\s*(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)\s*\)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if (mSum) {
      var su = unit;
      return {
        nums: [Number(mSum[1]) + Number(mSum[2]), Number(mSum[3]), Number(mSum[4])],
        units: [su, su, su], unit: su, form: 'sum'
      };
    }
    /* 长:1047 宽:250 高:70 / L1047 W250 H70 / Length=… Width=… Height=… */
    var mL = s.match(/(?:长|length|l)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(?:mm|cm|m)?[^\d]{0,10}?(?:宽|width|w)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(?:mm|cm|m)?[^\d]{0,10}?(?:高|height|h|厚|深|thickness|depth)\s*[:：=]?\s*(\d+(?:\.\d+)?)/i);
    if (mL) {
      var lu = unit;
      return { nums: [Number(mL[1]), Number(mL[2]), Number(mL[3])], units: [lu, lu, lu], unit: lu, form: 'labeled' };
    }
    /* 三数字 1047x250x70 */
    var m3 = s.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if (m3) {
      var u3 = perNumberUnits(s, 3, unit);
      return { nums: [Number(m3[1]), Number(m3[2]), Number(m3[3])], units: u3, unit: u3[0] || unit, form: '3d' };
    }
    /* 两数字（缺厚度）：235x130 */
    var m2 = s.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if (m2) {
      var u2 = perNumberUnits(s, 2, unit);
      return { nums: [Number(m2[1]), Number(m2[2])], units: u2, unit: u2[0] || unit, form: '2d', incomplete: true };
    }
    /* 空格分隔：1047 250 70 */
    var spaced = s.replace(/[^\d.\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (spaced) {
      var arr = spaced.split(' ').map(Number).filter(function (n) { return n > 0; });
      if (arr.length >= 3 && /[^\d.]/.test(s)) {
        return { nums: arr.slice(0, 3), units: [unit, unit, unit], unit: unit, form: 'space' };
      }
      if (arr.length === 2) return { nums: arr, units: [unit, unit], unit: unit, form: 'space', incomplete: true };
    }
    return null;
  }
  function parseWeightCell(v) {
    var s = txt(v);
    if (!s.trim()) return null;
    var u = weightUnitIn(s);
    var n = num(s);
    if (!isFin(n)) return null;
    return { val: n, unit: u };
  }

  /* ============================ 3. 表头识别 ============================ */

  function axisRolePlain(t) {
    var s = t.replace(/[\(（][^\)）]*[\)）]/g, ' ').trim().toLowerCase();
    s = s.replace(/\s+(mm|cm|m|inch|ins?|kgs?|kg|t|lbs?|lb)$/i, '').trim();
    s = s.replace(/(mm|cm|inch|ins?)$/i, '').trim();
    s = s.replace(/[\s:：.。_\-]+/g, '');
    if (!s) return null;
    if (/^(长|长度|总长|外长|long|length|len|l)$/.test(s)) return 'L';
    if (/^(宽|宽度|总宽|外宽|wide|width|wid|w)$/.test(s)) return 'W';
    if (/^(高|高度|总高|外高|hei|height|h|深|深度|厚|厚度|depth|thickness|thick|d)$/.test(s)) return 'H';
    return null;
  }

  /* 单列表头 → 角色 */
  function classifyHeader(raw, subRaw) {
    var t = hNorm(raw), st = hNorm(subRaw || '');
    if (!t && !st) return null;
    var full = (t + ' ' + st).trim();
    var meta = { dimUnit: dimUnitIn(t) || dimUnitIn(st), wtUnit: weightUnitIn(t) || weightUnitIn(st), raw: full };

    /* 双行表头：副表头是「长/宽/高/L/W/H」→ 用副表头定角色，主表头提供单位 */
    var subAxis = axisRolePlain(st);
    if (subAxis) { meta.dimUnit = dimUnitIn(t) || dimUnitIn(st); return { role: subAxis, meta: meta }; }
    var ax = axisRolePlain(t);
    if (ax) { meta.dimUnit = dimUnitIn(st) || dimUnitIn(t); return { role: ax, meta: meta }; }

    if (/(chargeable|volumetric|体积重|计费重|计费重量|chargable)/i.test(full)
      || /(^|[\s.／/])v\s*\.?\s*w\s*\.?(\s|$)/i.test(full)) return { role: 'ignore', meta: meta };

    if (/(序号|序|^no\.?$|^no\b|s\/n|^sn$|index|项次|行号|箱号|carton\s*no|case\s*no|唛头|marks|订单号|po\s*(?:no|#)?|order\s*no|date|日期|hs\s*code|海关编码|柜号|container\s*no|提单号|b\/l|^#)/i.test(full)
      && !/(尺寸|dimension|size|重量|weight|数量|qty)/i.test(full)) {
      return { role: 'ignore', meta: meta };
    }

    /* 体积：CBM / 总体积 / 单位体积 */
    if (/(cbm|m\u00b3|m3\b|立方米|立方|体积|volume|容积)/i.test(full)
      && !/(尺寸|长宽高|dimension|measurement|size)/i.test(full)) {
      var mode = /(单位体积|单件体积|每件体积|unit\s*volume|per\s*piece)/i.test(full) ? 'unit'
        : /(总体积|合计体积|总容积|total\s*volume|total\s*cbm)/i.test(full) ? 'total' : 'auto';
      meta.cbmMode = mode;
      return { role: 'cbm', meta: meta };
    }

    /* 强品名（必须先于尺寸/重量，避免「产品名称及规格」被当成尺寸列） */
    if (/(品名|货物名称|产品名称|商品名称|名称|描述|description|desc\b|product\s*name|goods\s*name|cargo\s*name|item\s*desc|^name$)/i.test(full)) {
      meta.pri = 0;
      return { role: 'name', meta: meta };
    }

    /* 尺寸（合并表达）：长/宽/高、L/W/H、长×宽×高、尺寸、箱规、包装尺寸、Size、Dimension、规格 */
    var axisAligned = /(长|length|l)\s*[\/\\*×·、x]\s*(宽|width|w)\s*[\/\\*×·、x]\s*(高|height|h)/i.test(full);
    if (!/规格型号|型号规格/i.test(full)
      && (axisAligned || /(尺寸|箱规|长宽高|外箱|包装规格|外形|product\s*size|packing\s*size|carton\s*size|box\s*size|dimension|measurement|meas\b|^size\b|size\b|spec\b|规格)/i.test(full))) {
      var pri = /(包装尺寸|外箱尺寸|箱规|carton\s*size|packing\s*size|包装规格)/i.test(full) ? 0
        : /(产品尺寸|商品尺寸|product\s*size)/i.test(full) ? 2 : 1;
      meta.pri = pri;
      return { role: 'dimComb', meta: meta };
    }

    /* 重量（必须早于数量，避免「每箱毛重」被当成数量） */
    if (/(毛重|净重|重量|单重|weight|wt\b|g\s*\.\s*w|n\s*\.\s*w|gross|net\s*weight)/i.test(full)) {
      var gross = /(净重|net\s*weight|n\s*\.\s*w)/i.test(full) ? 0 : (/(毛重|gross|g\s*\.\s*w)/i.test(full) ? 1 : -1);
      var isUnit = /(单重|单件|每件|每箱|unit\s*(?:wt|weight)|weight\s*per|per\s*(?:piece|pcs|carton|ctn|box)|g\s*\.\s*w\s*(?:\/|per)|n\s*\.\s*w\s*(?:\/|per)|毛重\s*\/|净重\s*\/)/i.test(full);
      var isTotal = /(总重|总毛重|毛重合计|合计毛重|总重量|total\s*(?:weight|gross)|gross\s*weight\s*total)/i.test(full);
      meta.gross = gross;
      meta.mode = isUnit ? 'unit' : (isTotal ? 'total' : 'auto');
      return { role: isUnit ? 'wtUnit' : (isTotal ? 'wtTotal' : 'wtAny'), meta: meta };
    }

    /* 数量：每箱数量 / 总数量 / 箱数(件数) / 数量(PCS) */
    if (/(每箱|单箱|每件装|装箱数|装箱量|per\s*(?:carton|ctn|box|case)|pcs\s*\/\s*(?:ctn|carton|box)|qty\s*\/\s*ctn|inner\s*(?:qty|pcs|pack))/i.test(full)) {
      return { role: 'qtyPerCtn', meta: meta };
    }
    if (/(总数量|总件数|total\s*(?:qty|quantity|pcs|pieces|units))/i.test(full)) return { role: 'qtyTotalPcs', meta: meta };
    if (/(箱数|件数|包数|托盘数|栈板数|cartons?|ctns?|cases?|packages?|pkgs?|pallets?|skids?|箱|件)/i.test(full)) return { role: 'qtyPkg', meta: meta };
    if (/(数量|个数|数目|只数|pcs|pieces|qty|quantity|units?|count)/i.test(full)) return { role: 'qtyPcs', meta: meta };

    /* 一般品名（产品 / 型号 / SKU / 编号 / 货号 …） */
    if (/(产品|货名|product|goods|item|article|型号|model|sku|货号|编号|part\s*(?:no|#)|item\s*(?:no|code))/i.test(full)) {
      var pn = /(型号|model|sku|货号|编号|item\s*(?:no|code)|part)/i.test(full) ? 2 : 1;
      meta.pri = pn;
      return { role: 'name', meta: meta };
    }

    /* 包装类型 / 卸货站 / 各种标记 */
    if (/(包装类型|包装方式|包装材质|包装种类|package\s*type|packing\s*type|packing|package|包材|包装|^type\b|type$)/i.test(full)) return { role: 'type', meta: meta };
    if (/(卸货站|卸货顺序|卸货点|站点|stop|unload)/i.test(full)) return { role: 'stop', meta: meta };
    if (/(承重上限|承重|load\s*cap|max\s*load)/i.test(full)) return { role: 'loadCap', meta: meta };
    if (/(易碎|fragile)/i.test(full)) return { role: 'fragile', meta: meta };
    if (/(危险品|危品|hazmat|dangerous)/i.test(full)) return { role: 'hazmat', meta: meta };
    if (/(查验|商检|inspect|check)/i.test(full)) return { role: 'inspect', meta: meta };
    if (/(备注|remark|note|说明)/i.test(full)) return { role: 'remark', meta: meta };
    return { role: 'unknown', meta: meta };
  }

  function emptyCols() {
    return {
      name: [], dimComb: [], L: [], W: [], H: [],
      qtyPkg: [], qtyPcs: [], qtyPerCtn: [], qtyTotalPcs: [],
      wtUnit: [], wtTotal: [], wtAny: [],
      cbm: [], type: [], stop: [], loadCap: [], fragile: [], hazmat: [], inspect: [],
      remark: [], unknown: [], ignore: []
    };
  }
  function pushCol(cols, role, item) {
    var map = {
      name: 'name', dimComb: 'dimComb', L: 'L', W: 'W', H: 'H',
      qtyPkg: 'qtyPkg', qtyPcs: 'qtyPcs', qtyPerCtn: 'qtyPerCtn', qtyTotalPcs: 'qtyTotalPcs',
      wtUnit: 'wtUnit', wtTotal: 'wtTotal', wtAny: 'wtAny',
      cbm: 'cbm', type: 'type', stop: 'stop', loadCap: 'loadCap',
      fragile: 'fragile', hazmat: 'hazmat', inspect: 'inspect',
      remark: 'remark', unknown: 'unknown', ignore: 'ignore'
    };
    var k = map[role];
    if (k) cols[k].push(item);
  }
  function sortCols(cols) {
    Object.keys(cols).forEach(function (k) {
      if (!cols[k] || !cols[k].length) return;
      cols[k].sort(function (a, b) {
        var pa = (a.meta && a.meta.pri != null) ? a.meta.pri : 5;
        var pb = (b.meta && b.meta.pri != null) ? b.meta.pri : 5;
        if (pa !== pb) return pa - pb;
        return a.i - b.i;
      });
    });
  }
  function buildColumns(hdrCells, subCells) {
    var cols = emptyCols();
    var n = Math.max(hdrCells ? hdrCells.length : 0, subCells ? subCells.length : 0);
    for (var i = 0; i < n; i++) {
      var raw = hdrCells && hdrCells[i] != null ? hdrCells[i] : '';
      var sub = subCells && subCells[i] != null ? subCells[i] : '';
      var c = classifyHeader(raw, sub);
      if (!c) continue;
      pushCol(cols, c.role, { i: i, text: (trim(raw) + (trim(sub) ? ' ' + trim(sub) : '')).trim(), meta: c.meta || {} });
    }
    sortCols(cols);
    return cols;
  }
  function colUsedSet(cols) {
    var used = {};
    ['name', 'dimComb', 'L', 'W', 'H', 'qtyPkg', 'qtyPcs', 'qtyPerCtn', 'qtyTotalPcs',
      'wtUnit', 'wtTotal', 'wtAny', 'cbm', 'type', 'stop', 'loadCap', 'fragile', 'hazmat', 'inspect'].forEach(function (k) {
        (cols[k] || []).forEach(function (c) { used[c.i] = 1; });
      });
    return used;
  }

  /* ============================ 4. 合计行 / 汇总信息 ============================ */

  var TOTAL_RE = /^(合\s*计|总\s*计|小\s*计|总\s*额|汇\s*总|共\s*计|total\b|grand\s*total\b|sub\s*total\b|subtotal\b|sum\b)/i;
  function isTotalRow(cells) {
    var first = '';
    for (var i = 0; i < cells.length; i++) { if (cells[i]) { first = cells[i]; break; } }
    if (!first) return false;
    if (TOTAL_RE.test(first)) return true;
    var joined = cells.join(' ').replace(/\s+/g, ' ').trim();
    if (/^(合\s*计|总\s*计|小\s*计|total|grand\s*total|sub\s*total|subtotal)\s*[:：]?$/i.test(joined)) return true;
    return false;
  }

  function extractTotals(grid, hd, cols) {
    var totals = { qtyPkg: NaN, qtyPcs: NaN, cbm: NaN, kg: NaN, kgUnit: null, sources: [], rows: [] };
    var start = hd.row + hd.span;
    var allRows = [];
    for (var r = 0; r < grid.length; r++) {
      if (r >= hd.row && r < start) continue;
      var cells = toCells(grid[r] || []);
      if (rowEmpty(cells)) continue;
      if (isTotalRow(cells)) allRows.push({ r: r, cells: cells });
    }
    function colVal(cells, list) {
      if (!list || !list.length) return NaN;
      for (var k = 0; k < list.length; k++) {
        var v = num(cells[list[k].i]);
        if (isFin(v) && v > 0) return v;
      }
      return NaN;
    }
    function colValUnit(cells, list) {
      if (!list || !list.length) return { val: NaN, unit: null };
      for (var k = 0; k < list.length; k++) {
        var c = list[k];
        var w = parseWeightCell(cells[c.i]);
        if (w && w.val > 0) {
          var u = w.unit || (c.meta && c.meta.wtUnit) || null;
          return { val: w.val, unit: u };
        }
      }
      return { val: NaN, unit: null };
    }
    allRows.forEach(function (rowRec) {
      var cells = rowRec.cells;
      var rec = { row: rowRec.r + 1, cells: cells };
      var qp = colVal(cells, cols.qtyPkg); if (isFin(qp)) rec.qtyPkg = qp;
      var qc = colVal(cells, cols.qtyPcs); if (isFin(qc)) rec.qtyPcs = qc;
      var qt = colVal(cells, cols.qtyTotalPcs); if (isFin(qt)) rec.qtyPcs = Math.max(rec.qtyPcs || 0, qt);
      var pc = colVal(cells, cols.qtyPerCtn);
      if (isFin(pc)) {
        /* 「每箱数量」列在合计行的值通常就是货物总数量 */
        if (!isFin(rec.qtyPcs) || pc > rec.qtyPcs) rec.qtyPcs = pc;
      }
      var cb = colVal(cells, cols.cbm); if (isFin(cb)) rec.cbm = cb;
      var wv = colValUnit(cells, cols.wtTotal.concat(cols.wtAny, cols.wtUnit));
      if (isFin(wv.val)) { rec.kg = wv.val; rec.kgUnit = wv.unit; }
      totals.rows.push(rec);
      totals.sources.push('TOTAL 行(第' + (rowRec.r + 1) + '行)');
      if (isFin(rec.qtyPkg)) totals.qtyPkg = Math.max(totals.qtyPkg || 0, rec.qtyPkg);
      if (isFin(rec.qtyPcs)) totals.qtyPcs = Math.max(totals.qtyPcs || 0, rec.qtyPcs);
      if (isFin(rec.cbm)) totals.cbm = Math.max(totals.cbm || 0, rec.cbm);
      if (isFin(rec.kg)) totals.kg = Math.max(totals.kg || 0, rec.kg);
      if (rec.kgUnit && !totals.kgUnit) totals.kgUnit = rec.kgUnit;
    });
    if (totals.rows.length && !isFin(totals.kg)) {
      totals.rows.forEach(function (rec) {
        var joined = rec.cells.join(' ');
        var mKg = joined.match(/(?:毛重|重量|g\.?\s*w\.?|total\s*weight|weight)\s*[:：]?\s*([\d,.]+)\s*(kgs?|kg|t|吨|g|lbs?)?/i);
        if (mKg) {
          var v = num(mKg[1]);
          if (isFin(v) && v > 0) { totals.kg = Math.max(totals.kg || 0, v); if (mKg[2]) totals.kgUnit = weightUnitIn(mKg[2]) || totals.kgUnit; }
        }
      });
    }
    /* 全表文字兜底：单元格里写 TOTAL: 14 CTNS / 总箱数：14 / 总体积 144.64 CBM / TOTAL G.W. 2670 KGS */
    var flatTexts = [];
    for (var rr = 0; rr < grid.length; rr++) {
      var cells2 = toCells(grid[rr] || []);
      for (var cc = 0; cc < cells2.length; cc++) if (cells2[cc]) flatTexts.push(cells2[cc]);
    }
    flatTexts.forEach(function (rawTxt) {
      var s = txt(rawTxt).replace(/\s+/g, ' ');
      if (!/(total|合计|总计|共计|总\s*(?:箱数|件数|数量|体积|毛重|重量)|grand)/i.test(s)) return;
      var m;
      if (!isFin(totals.qtyPkg) && (m = s.match(/(?:total\s*(?:ctns?|cartons?|packages?|pkgs?|cases?)|总\s*(?:箱数|件数|包数)|合计\s*(?:箱数|件数|包数))\s*[:：]?\s*([\d,]+)/i))) {
        var v1 = num(m[1]); if (isFin(v1) && v1 > 0) totals.qtyPkg = v1;
      }
      if (!isFin(totals.qtyPcs) && (m = s.match(/(?:total\s*(?:qty|quantity|pcs|pieces)|总\s*(?:数量|只数)|合计\s*(?:数量|只数))\s*[:：]?\s*([\d,]+)/i))) {
        var v2 = num(m[1]); if (isFin(v2) && v2 > 0) totals.qtyPcs = v2;
      }
      if (!isFin(totals.cbm) && (m = s.match(/(?:total\s*(?:cbm|volume|m3|m\u00b3)|总\s*(?:体积|容积)|合计\s*(?:体积|容积))\s*[:：]?\s*([\d,.]+)/i))) {
        var v3 = num(m[1]); if (isFin(v3) && v3 > 0) totals.cbm = v3;
      }
      if (!isFin(totals.kg) && (m = s.match(/(?:total\s*(?:g\s*\.?\s*w\.?|n\s*\.?\s*w\.?|gross\s*weight|weight)|总\s*(?:毛重|重量)|合计\s*(?:毛重|重量))\s*[:：]?\s*([\d,.]+)\s*(kgs?|kg|t|吨|g|lbs?)?/i))) {
        var v4 = num(m[1]);
        if (isFin(v4) && v4 > 0) { totals.kg = v4; if (m[2]) totals.kgUnit = weightUnitIn(m[2]) || totals.kgUnit; }
      }
    });
    totals.sources = totals.sources.filter(function (v, i, a) { return a.indexOf(v) === i; });
    return totals;
  }

  /* ============================ 5. 表头定位 ============================ */

  function plausibleSubHeader(row) {
    var cells = toCells(row || []);
    var ne = cells.filter(function (s) { return s !== ''; });
    if (!ne.length) return false;
    var numeric = ne.filter(isNumericCell).length;
    if (numeric / ne.length > 0.5) return false;
    return ne.some(function (s) {
      return !!(axisRolePlain(s) || dimUnitIn(s) || weightUnitIn(s) ||
        /^(尺寸|长宽高|l\s*[x×*\/]\s*w|qty|pcs|ctns?|kgs?|mm|cm|m|规格)$/i.test(hNorm(s)));
    });
  }
  function pruneDimComb(grid, dataStart, cols) {
    if (!cols.dimComb.length) return;
    cols.dimComb = cols.dimComb.filter(function (c) {
      var hit = 0, tot = 0;
      for (var r = dataStart; r < Math.min(grid.length, dataStart + 60); r++) {
        var cells = toCells(grid[r] || []);
        var v = cells[c.i];
        if (!v) continue;
        tot++;
        var d = parseDimsCell(v);
        if (d && d.nums.length >= 2) hit++;
      }
      return tot > 0 && hit / tot >= 0.25;
    });
  }
  function scoreColumns(grid, dataStart, cols) {
    var sc = 0;
    if (cols.name.length) sc += 4;
    if (cols.dimComb.length) sc += 7;
    var axes = (cols.L.length ? 1 : 0) + (cols.W.length ? 1 : 0) + (cols.H.length ? 1 : 0);
    if (axes >= 3) sc += 8; else if (axes >= 2) sc += 2;
    if (cols.qtyPkg.length || cols.qtyPcs.length || cols.qtyTotalPcs.length || cols.qtyPerCtn.length) sc += 5;
    if (cols.wtUnit.length || cols.wtTotal.length || cols.wtAny.length) sc += 4;
    if (cols.cbm.length) sc += 3;
    if (cols.type.length) sc += 1;
    var dataRows = 0;
    for (var r = dataStart; r < Math.min(grid.length, dataStart + 80); r++) {
      var cells = toCells(grid[r] || []);
      if (rowEmpty(cells)) continue;
      if (isTotalRow(cells)) continue;
      if (countNumeric(cells) >= 2 || parseDimsCell(cells.join(' '))) dataRows++;
    }
    if (!cols.dimComb.length && axes < 2) return { score: -1, dataRows: dataRows };
    if (dataRows < 1) return { score: -1, dataRows: 0 };
    sc += Math.min(8, dataRows * 0.2);
    return { score: sc, dataRows: dataRows };
  }
  function findHeader(grid) {
    var best = { score: -1 };
    var maxScan = Math.min(grid.length, 45);
    for (var r = 0; r < maxScan; r++) {
      var cells = toCells(grid[r] || []);
      if (rowEmpty(cells)) continue;
      if (isTotalRow(cells)) continue;
      for (var span = 1; span <= 2; span++) {
        if (span === 2 && !plausibleSubHeader(grid[r + 1])) continue;
        var hdr = toCells(grid[r] || []);
        var sub = span === 2 ? toCells(grid[r + 1] || []) : null;
        var cols = buildColumns(hdr, sub);
        pruneDimComb(grid, r + span, cols);
        var sc = scoreColumns(grid, r + span, cols);
        /* 标题/地址行惩罚：整行都是长文本或同一段文字被合并填充到多列 → 不是表头 */
        var rawCells = toCells(grid[r] || []);
        var longCnt = 0, maxRep = 0, freq = {};
        rawCells.forEach(function (s) {
          if (!s) return;
          if (s.length > 22) longCnt++;
          freq[s] = (freq[s] || 0) + 1;
          if (freq[s] > maxRep) maxRep = freq[s];
        });
        var adj = sc.score - (longCnt * 5 + (maxRep >= 4 ? 12 : 0));
        if (adj > best.score) best = { score: adj, row: r, span: span, cols: cols, dataRows: sc.dataRows };
      }
    }
    if (best.score < 6) return null;
    return best;
  }

  /* ============================ 6. 数据特征兜底（无表头/表头异常） ============================ */

  function detectHeaderless(grid) {
    var start = -1;
    for (var r = 0; r < Math.min(grid.length, 40); r++) {
      var cells = toCells(grid[r] || []);
      if (rowEmpty(cells)) continue;
      var hit = countNumeric(cells);
      var dimHit = false;
      for (var c = 0; c < cells.length && !dimHit; c++) {
        var d = parseDimsCell(cells[c]);
        if (d && d.nums.length >= 3) dimHit = true;
      }
      if (hit >= 2 || dimHit) {
        var ok = 0;
        for (var k = 0; k < 4 && r + k < grid.length; k++) {
          var cs = toCells(grid[r + k] || []);
          if (rowEmpty(cs)) break;
          if (countNumeric(cs) >= 1) ok++;
        }
        if (ok >= 2) { start = r; break; }
      }
    }
    if (start < 0) return null;
    var cols = emptyCols();
    promoteByProfile(grid, start, cols, {});
    if (!cols.dimComb.length && cols.L.length < 1) return null;
    return { row: start - 1, span: 1, cols: cols, headerless: true, score: 8 };
  }

  function sampleDataRows(grid, dataStart, limit) {
    var rows = [];
    for (var r = dataStart; r < grid.length && rows.length < (limit || 80); r++) {
      var cells = toCells(grid[r] || []);
      if (rowEmpty(cells)) continue;
      if (isTotalRow(cells)) continue;
      if (countNumeric(cells) === 0 && !cells.some(function (s) { return !!parseDimsCell(s); })) continue;
      rows.push(cells);
    }
    return rows;
  }

  /* 判断一列数值是否只是 1,2,3… 的行序号（不是真实件数/重量） */
  function isIndexSeries(vals) {
    if (!vals || vals.length < 3) return false;
    for (var i = 0; i < vals.length; i++) {
      if (Math.abs(vals[i] - (i + 1)) > 1e-9) return false;
    }
    return true;
  }

  /* 表头缺列时按数据特征补齐（合并尺寸列 / 三列长宽高 / 数量 / 重量 / 品名） */
  function promoteByProfile(grid, dataStart, cols, totals) {
    var used = colUsedSet(cols);
    var sample = sampleDataRows(grid, dataStart, 80);
    if (!sample.length) return;
    var ncols = 0;
    sample.forEach(function (cells) { if (cells.length > ncols) ncols = cells.length; });
    var totalsQty = (totals && (isFin(totals.qtyPkg) ? totals.qtyPkg : totals.qtyPcs)) || NaN;
    var totalsKg = (totals && isFin(totals.kg)) ? totals.kg : NaN;
    var minHit = sample.length >= 3 ? 2 : 1;

    /* ① 合并尺寸列 */
    if (!cols.dimComb.length) {
      var bestC = -1, bestRate = 0;
      for (var c = 0; c < ncols; c++) {
        if (used[c]) continue;
        var hit = 0, tot = 0;
        sample.forEach(function (cells) {
          var v = cells[c];
          if (!v) return;
          tot++;
          var d = parseDimsCell(v);
          if (d && d.nums.length >= 2 && /[xX\u00d7*\/\\-]/.test(v)) hit++;
        });
        var rate = tot ? hit / tot : 0;
        if (hit >= minHit && rate > bestRate) { bestRate = rate; bestC = c; }
      }
      if (bestC >= 0 && bestRate >= 0.5) {
        cols.dimComb.push({ i: bestC, text: '(数据特征·合并尺寸列)', meta: { pri: 3, auto: true } });
        used[bestC] = 1;
      }
    }
    /* ② 三列长宽高 */
    if (!cols.dimComb.length && ((cols.L.length ? 1 : 0) + (cols.W.length ? 1 : 0) + (cols.H.length ? 1 : 0)) < 3) {
      var triples = [];
      for (var i = 0; i + 2 < ncols; i++) {
        if (used[i] || used[i + 1] || used[i + 2]) continue;
        var okRows = 0, totRows = 0;
        sample.forEach(function (cells) {
          var a = num(cells[i]), b = num(cells[i + 1]), cc = num(cells[i + 2]);
          if (isFin(a) || isFin(b) || isFin(cc)) totRows++;
          if (isFin(a) && isFin(b) && isFin(cc) && a > 0 && b > 0 && cc > 0 && a < 20000 && b < 20000 && cc < 20000) okRows++;
        });
        if (okRows >= Math.max(2, Math.min(3, sample.length)) && okRows / Math.max(totRows, 1) >= 0.5) triples.push({ i: i, ok: okRows });
      }
      if (triples.length) {
        triples.sort(function (a, b) { return b.ok - a.ok; });
        var ti = triples[0].i;
        cols.L = [{ i: ti, text: '(数据特征·长)', meta: {} }];
        cols.W = [{ i: ti + 1, text: '(数据特征·宽)', meta: {} }];
        cols.H = [{ i: ti + 2, text: '(数据特征·高)', meta: {} }];
        used[ti] = used[ti + 1] = used[ti + 2] = 1;
      }
    }
    /* ③ 数量列 */
    if (!cols.qtyPkg.length && !cols.qtyPcs.length && !cols.qtyTotalPcs.length && !cols.qtyPerCtn.length) {
      var qCand = [];
      for (var qc = 0; qc < ncols; qc++) {
        if (used[qc]) continue;
        var vals = [], intOk = 0, cov = 0;
        sample.forEach(function (cells) {
          var v = num(cells[qc]);
          if (isFin(v) && v > 0) { vals.push(v); cov++; if (Math.abs(v - Math.round(v)) < 1e-9 && v <= 200000) intOk++; }
        });
        if (vals.length >= Math.max(minHit, sample.length * 0.4) && intOk / vals.length >= 0.8 && !isIndexSeries(vals)) {
          var sum = vals.reduce(function (a, b) { return a + b; }, 0);
          var med = median(vals);
          if (!(med >= 1 && med <= 10000)) continue;              /* 无表头校验时，过大数值多半是编号（入库号/箱号） */
          var allEqual = true;
          for (var vi = 1; vi < vals.length; vi++) { if (vals[vi] !== vals[0]) { allEqual = false; break; } }
          if (vals.length >= 2 && allEqual && vals[0] > 10) continue; /* 整列同一个大数字 → 不是件数 */
          qCand.push({ c: qc, sum: sum, med: med, cov: cov });
        }
      }
      if (qCand.length) {
        qCand.sort(function (a, b) {
          if (isFin(totalsQty) && totalsQty > 0) {
            var ea = relErr(a.sum, totalsQty), eb = relErr(b.sum, totalsQty);
            if (Math.abs(ea - eb) > 0.01) return ea - eb;
          }
          if (Math.abs(a.med - b.med) > 0.5) return a.med - b.med;
          return b.cov - a.cov;
        });
        var qi = qCand[0].c;
        cols.qtyPkg.push({ i: qi, text: '(数据特征·数量列)', meta: { auto: true } });
        used[qi] = 1;
      }
    }
    /* ④ 重量列 */
    if (!cols.wtUnit.length && !cols.wtTotal.length && !cols.wtAny.length) {
      var wCand = [];
      for (var wc = 0; wc < ncols; wc++) {
        if (used[wc]) continue;
        var wvals = [], dec = 0;
        sample.forEach(function (cells) {
          var v = num(cells[wc]);
          if (isFin(v) && v > 0) { wvals.push(v); if (Math.abs(v - Math.round(v)) > 1e-9) dec++; }
        });
        if (wvals.length >= Math.max(minHit, sample.length * 0.4)) {
          var wmed = median(wvals);
          if (wmed > 0.01 && wmed < 50000) wCand.push({ c: wc, vals: wvals, dec: dec, med: wmed, cov: wvals.length });
        }
      }
      if (wCand.length) {
        wCand.sort(function (a, b) {
          if (isFin(totalsKg) && totalsKg > 0) {
            var sa = a.vals.reduce(function (x, y) { return x + y; }, 0);
            var sb = b.vals.reduce(function (x, y) { return x + y; }, 0);
            var ea = relErr(sa, totalsKg), eb = relErr(sb, totalsKg);
            if (Math.abs(ea - eb) > 0.01) return ea - eb;
          }
          if (Math.abs(a.dec - b.dec) > 0) return b.dec - a.dec;
          return b.cov - a.cov;
        });
        var wi = wCand[0].c;
        cols.wtAny.push({ i: wi, text: '(数据特征·重量列)', meta: { auto: true, mode: 'auto', gross: -1 } });
        used[wi] = 1;
      }
    }
    /* ⑤ 品名列 */
    if (!cols.name.length) {
      var nCand = [];
      for (var nc = 0; nc < ncols; nc++) {
        if (used[nc]) continue;
        var texts = 0, lenSum = 0;
        sample.forEach(function (cells) {
          var v = cells[nc];
          if (!v) return;
          if (!isNumericCell(v) && parseDimsCell(v) == null && v.length >= 2) { texts++; lenSum += v.length; }
        });
        if (texts >= Math.max(minHit, sample.length * 0.4)) nCand.push({ c: nc, texts: texts, avg: lenSum / texts });
      }
      if (nCand.length) {
        nCand.sort(function (a, b) { return (b.texts - a.texts) || (b.avg - a.avg); });
        cols.name.push({ i: nCand[0].c, text: '(数据特征·品名列)', meta: { pri: 1, auto: true } });
        used[nCand[0].c] = 1;
      }
    }
    /* ⑤-b 品名兜底：尺寸列本身含大量文字（如「岩板 1800X900X9mm 31片」）→ 同时作为品名 */
    if (!cols.name.length && cols.dimComb.length) {
      var dimCol = cols.dimComb[0].i;
      var textHit = 0, checked = 0;
      sample.forEach(function (cells) {
        var v = cells[dimCol];
        if (!v) return;
        checked++;
        if (/[\u4e00-\u9fa5a-zA-Z]{2,}/.test(v)) textHit++;
      });
      if (checked > 0 && textHit / checked >= 0.6) {
        cols.name.push({ i: dimCol, text: '(数据特征·品名(尺寸列))', meta: { pri: 3, auto: true } });
      }
    }
    /* ⑥ 包装类型列 */
    if (!cols.type.length) {
      for (var tc = 0; tc < ncols; tc++) {
        if (used[tc]) continue;
        var typeVals = 0;
        sample.forEach(function (cells) {
          var v = cells[tc];
          if (v && /(纸箱|木箱|托盘|铁架|散|carton|pallet|crate|box|bag|drum|loose)/i.test(v)) typeVals++;
        });
        if (typeVals >= Math.max(2, sample.length * 0.4)) {
          cols.type.push({ i: tc, text: '(数据特征·包装列)', meta: { auto: true } });
          used[tc] = 1;
          break;
        }
      }
    }
    sortCols(cols);
  }

  /* ============================ 7. 行数据抽取 ============================ */

  /* 从整行任意单元格里找尺寸（品名/备注中内嵌 1800X900X9 / 2430*850*1380 等） */
  function scanRowDims(cells) {
    for (var i = 0; i < cells.length; i++) {
      var s = cells[i];
      if (!s || s.length < 5 || s.length > 120) continue;
      if (!/[xX×*\/\\-]/.test(s)) continue;
      var d = parseDimsCell(s);
      if (d && d.nums.length >= 3) {
        return { nums: d.nums.slice(0, 3), cellUnits: d.units.slice(0, 3), cellUnit: d.unit, colUnit: null, form: 'text', col: i };
      }
    }
    return null;
  }
  function qtyFromText(cells) {
    for (var i = 0; i < cells.length; i++) {
      var s = txt(cells[i]);
      if (!s) continue;
      var m = s.match(/(\d{1,6})\s*(?:片|件|个|只|箱|包|pcs|pieces|units|ctns?|cartons?)/i);
      if (m) {
        var n = Number(m[1]);
        if (n > 0 && n <= 100000) return n;
      }
    }
    return NaN;
  }
  function isFooterNote(cells) {
    var ne = cells.filter(Boolean);
    if (!ne.length) return false;
    if (countNumeric(cells) > 0) return false;
    return ne.some(function (s) { return /(备注|注\s*[:：]|remark|note\b|声明|以上|签章|盖章|日期|电话|地址|银行|收货人|发货人|供应商|客户名称|联系人)/i.test(s); });
  }
  function isRepeatHeaderRow(cells, hd) {
    var hdrCells = toCells(hd.headerTexts || []);
    if (!hdrCells.length) return false;
    var hit = 0, tot = 0;
    hdrCells.forEach(function (h, i) {
      if (!h) return;
      tot++;
      var v = cells[i] || '';
      if (v && hNorm(v) === hNorm(h)) hit++;
    });
    if (tot >= 3 && hit / tot >= 0.5) return true;
    return false;
  }

  function extractRawRows(grid, hd, cols, skipRows) {
    var rows = [], notes = [], missing = [];
    var dataStart = hd.row + hd.span;
    var lastName = '';
    var hdTexts = [];
    if (hd.row >= 0) {
      hdTexts = toCells(grid[hd.row] || []);
      var sub = hd.span > 1 ? toCells(grid[hd.row + 1] || []) : null;
      for (var k = 0; k < Math.max(hdTexts.length, sub ? sub.length : 0); k++) {
        hdTexts[k] = [hdTexts[k] || '', sub && sub[k] ? sub[k] : ''].join(' ').trim();
      }
    }
    var hdWrap = { headerTexts: hdTexts, row: hd.row, span: hd.span };
    for (var r = dataStart; r < grid.length; r++) {
      var cells = toCells(grid[r] || []);
      if (rowEmpty(cells)) continue;
      if (skipRows && skipRows[r]) {
        notes.push({ row: r + 1, text: '(纵向合并单元格续行，已并入上一行)' });
        continue;
      }
      if (isRepeatHeaderRow(cells, hdWrap)) continue;
      if (isTotalRow(cells)) continue;

      var rec = {
        r: r, cells: cells, name: '', dimCands: [], sep: null, textDims: null,
        qty: { pkg: [], pcs: [], perCtn: [], totalPcs: [] },
        wts: [], cbms: [], typeText: '', stop: 1, loadCap: 0, fragile: 0, hazmat: 0, inspect: 0,
        qtyText: NaN
      };

      /* 品名 */
      for (var ni = 0; ni < cols.name.length; ni++) {
        var nv = trim(cells[cols.name[ni].i]);
        if (nv && !/^(total|合计|gross|volume|chargeable)/i.test(nv)) { rec.name = nv; break; }
      }
      var nameFromFile = !!rec.name;
      if (!rec.name) rec.name = lastName;
      rec._nameFromFile = nameFromFile;

      /* 合并尺寸列（单元格内单位是硬标记；表头单位只作软先验） */
      for (var di = 0; di < cols.dimComb.length; di++) {
        var cc = cols.dimComb[di];
        var d = parseDimsCell(cells[cc.i]);
        if (d && d.nums.length >= 2) {
          rec.dimCands.push({
            i: cc.i, text: cc.text, nums: d.nums, cellUnits: d.units, cellUnit: d.unit,
            colUnit: (cc.meta && cc.meta.dimUnit) || null,
            form: d.form, incomplete: !!d.incomplete, meta: cc.meta
          });
        }
      }
      /* 分列长宽高（表头单位只作软先验） */
      if (cols.L.length && cols.W.length && cols.H.length) {
        var L = num(cells[cols.L[0].i]), W = num(cells[cols.W[0].i]), H = num(cells[cols.H[0].i]);
        if (isFin(L) && isFin(W) && isFin(H) && L > 0 && W > 0 && H > 0) {
          rec.sep = {
            nums: [L, W, H],
            cellUnits: [null, null, null],
            cellUnit: null,
            colUnit: (cols.L[0].meta && cols.L[0].meta.dimUnit) ||
              (cols.W[0].meta && cols.W[0].meta.dimUnit) ||
              (cols.H[0].meta && cols.H[0].meta.dimUnit) || null,
            form: 'sep'
          };
        }
      }
      /* 整行文字兜底找尺寸 */
      if (!rec.dimCands.length && !rec.sep) rec.textDims = scanRowDims(cells);

      /* 数量 */
      cols.qtyPkg.forEach(function (c) { var v = num(cells[c.i]); if (isFin(v) && v > 0) rec.qty.pkg.push(v); });
      cols.qtyPcs.forEach(function (c) { var v = num(cells[c.i]); if (isFin(v) && v > 0) rec.qty.pcs.push(v); });
      cols.qtyPerCtn.forEach(function (c) { var v = num(cells[c.i]); if (isFin(v) && v > 0) rec.qty.perCtn.push(v); });
      cols.qtyTotalPcs.forEach(function (c) { var v = num(cells[c.i]); if (isFin(v) && v > 0) rec.qty.totalPcs.push(v); });
      if (!rec.qty.pkg.length && !rec.qty.pcs.length && !rec.qty.perCtn.length && !rec.qty.totalPcs.length) {
        rec.qtyText = qtyFromText(cells);
      }

      /* 重量 */
      ['wtUnit', 'wtTotal', 'wtAny'].forEach(function (role) {
        (cols[role] || []).forEach(function (c) {
          var w = parseWeightCell(cells[c.i]);
          if (w && isFin(w.val) && w.val > 0) {
            rec.wts.push({
              i: c.i, val: w.val, unit: w.unit, text: c.text,
              mode: (c.meta && c.meta.mode) || 'auto',
              gross: (c.meta && c.meta.gross != null) ? c.meta.gross : -1,
              role: role
            });
          }
        });
      });
      /* CBM */
      cols.cbm.forEach(function (c) {
        var v = num(cells[c.i]);
        if (isFin(v) && v > 0) rec.cbms.push({ i: c.i, val: v, mode: (c.meta && c.meta.cbmMode) || 'auto', text: c.text });
      });

      /* 是否有效货物行 */
      var hasDims = rec.dimCands.length > 0 || !!rec.sep || !!rec.textDims;
      var hasQty = rec.qty.pkg.length || rec.qty.pcs.length || rec.qty.perCtn.length || rec.qty.totalPcs.length || isFin(rec.qtyText);
      if (!hasDims) {
        if (hasQty || (rec.name && countNumeric(cells) >= 1)) {
          missing.push({ row: r + 1, text: cells.filter(Boolean).join(' | ').slice(0, 90), name: rec.name });
        } else if (rec.name || isFooterNote(cells)) {
          notes.push({ row: r + 1, text: cells.filter(Boolean).join(' | ').slice(0, 90) });
        }
        continue;
      }

      /* 类型等附加列 */
      cols.type.forEach(function (c) { var v = trim(cells[c.i]); if (v) rec.typeText = rec.typeText ? rec.typeText + ' ' + v : v; });
      if (cols.stop.length) { var sv = num(cells[cols.stop[0].i]); if (isFin(sv) && sv > 0) rec.stop = Math.max(1, Math.round(sv)); }
      if (cols.loadCap.length) { var lv = num(cells[cols.loadCap[0].i]); if (isFin(lv) && lv > 0) rec.loadCap = lv; }
      ['fragile', 'hazmat', 'inspect'].forEach(function (role) {
        if (!cols[role].length) return;
        var v = num(cells[cols[role][0].i]);
        if (isFin(v)) {
          if (role === 'inspect') rec[role] = v > 0 ? 1 : 0;
          else rec[role] = clamp(Math.round(v), 0, 3);
        }
      });
      if (rec.name) lastName = rec.name;
      rows.push(rec);
    }
    return { rows: rows, notes: notes, missing: missing, dataStart: dataStart };
  }

  /* 缺尺寸行补占位（保证件数不丢） */
  function buildPlaceholderRows(missing, cols, keep) {
    if (!keep || !missing.length) return [];
    return missing.map(function (m) {
      return {
        r: m.row - 1, cells: [], name: m.name || ('(缺尺寸) ' + m.text.slice(0, 40)),
        dimCands: [], sep: null,
        textDims: { nums: [30, 30, 30], cellUnits: [null, null, null], cellUnit: null, colUnit: null, form: 'placeholder' },
        qty: { pkg: [], pcs: [], perCtn: [], totalPcs: [] }, qtyText: NaN,
        wts: [], cbms: [], typeText: '', stop: 1, loadCap: 0, fragile: 0, hazmat: 0, inspect: 0,
        placeholder: true
      };
    });
  }

  /* ============================ 8. 单位联合求解（核心） ============================ */

  function toCm(v, u) { var f = DIM_TO_CM[u]; return f ? v * f : v; }
  function toKg(v, u) { var f = WT_TO_KG[u]; return f ? v * f : v; }

  function dimsForStrategy(rec, strategy) {
    if (strategy.kind === 'comb') {
      for (var i = 0; i < rec.dimCands.length; i++) {
        if (rec.dimCands[i].i === strategy.i) return rec.dimCands[i];
      }
      return null;
    }
    if (strategy.kind === 'sep') return rec.sep || null;
    if (strategy.kind === 'text') return rec.textDims || null;
    if (strategy.kind === 'auto') return rec.dimCands[0] || rec.sep || rec.textDims || null;
    return null;
  }
  function getAnyDims(rec) {
    return (rec.dimCands && rec.dimCands[0]) || rec.sep || rec.textDims || null;
  }
  function isProductSizeDim(d) {
    if (!d) return false;
    if (d.meta && d.meta.pri === 2) return true;
    return /(产品尺寸|商品尺寸|product\s*size)/i.test(d.text || '');
  }
  /* 包装尺寸兜底：主尺寸列缺失时，不得回退到「产品尺寸」（会严重放大体积） */
  function strategyDimsWithFallback(rec, strategy) {
    var d = dimsForStrategy(rec, strategy);
    if (d) return d;
    var cands = rec.dimCands || [];
    for (var i = 0; i < cands.length; i++) {
      if (!isProductSizeDim(cands[i])) return cands[i];
    }
    if (rec.sep) return rec.sep;
    if (rec.textDims) return rec.textDims;
    return null;
  }

  /* 统计先验：包装侧面尺寸（cm）的对数正态先验 */
  function sidePriorCost(dcm) {
    var mu = Math.log(45), sd = 0.85, c = 0;
    for (var i = 0; i < dcm.length; i++) {
      if (!(dcm[i] > 0)) continue;
      var dv = Math.log(dcm[i]) - mu;
      c += (dv * dv) / (2 * sd * sd);
    }
    return c * 0.9;
  }
  /* 单件体积先验（m³）：常见包装 0.001~3 m³ */
  function volPriorCost(vol) {
    if (!(vol > 0)) return 0;
    var mu = Math.log(0.06), sd = 1.25;
    var dv = Math.log(vol) - mu;
    return clamp((dv * dv) / (2 * sd * sd), 0, 4) * 1.5;
  }
  /* 单行装柜可行性 + 体积 + 密度合理性 */
  function plausibilityCost(dcm, kg, vol) {
    var c = 0;
    var s = [dcm[0], dcm[1], dcm[2]].sort(function (a, b) { return b - a; });
    /* 45HQ 内尺寸 1355 × 235 × 269 cm（旋转后仍须装得进最大柜型） */
    if (s[0] > 1355) c += 60; else if (s[0] > 700) c += 1.5; else if (s[0] > 400) c += 0.4;
    if (s[1] > 235) c += 25; else if (s[1] > 180) c += 0.3;
    if (s[2] > 269) c += 25;
    if (s[2] < 0.5) c += 15; else if (s[2] < 2) c += 0.3;
    if (vol > 76) c += 200;
    else if (vol > 20) c += 30;
    else if (vol > 8) c += 8;
    else if (vol > 4) c += 1.5;
    else if (vol > 0 && vol < 0.0005) c += 1;
    c += sidePriorCost(dcm);
    c += volPriorCost(vol);
    if (kg > 0 && vol > 0) {
      var dens = kg / vol;
      if (dens > 8000) c += 4;
      else if (dens > 4000) c += 1.5;
      if (dens < 2) c += 1;
    }
    return c;
  }

  /* ---- 重量列选择 ---- */
  function pickWeightColumn(cols, rows) {
    var candidates = [];
    function add(list, role) { (list || []).forEach(function (c) { candidates.push({ c: c, role: role }); }); }
    add(cols.wtUnit, 'wtUnit');
    add(cols.wtAny, 'wtAny');
    add(cols.wtTotal, 'wtTotal');
    if (!candidates.length) return null;
    var totalRows = rows.length;
    var scored = candidates.map(function (cand) {
      var cov = 0;
      rows.forEach(function (rec) {
        for (var i = 0; i < rec.wts.length; i++) if (rec.wts[i].i === cand.c.i) { cov++; break; }
      });
      var gross = (cand.c.meta && cand.c.meta.gross != null) ? cand.c.meta.gross : -1;
      var pri = 10;
      if (cand.role === 'wtUnit') pri = gross === 0 ? 5 : 0;
      else if (cand.role === 'wtAny') pri = gross === 0 ? 6 : 2;
      else pri = gross === 0 ? 7 : 3;
      return { cand: cand, cov: cov, covRate: totalRows ? cov / totalRows : 0, pri: pri };
    });
    scored.sort(function (a, b) {
      var ac = a.covRate >= 0.6 ? 1 : 0, bc = b.covRate >= 0.6 ? 1 : 0;
      if (ac !== bc) return bc - ac;
      if (a.pri !== b.pri) return a.pri - b.pri;
      return b.cov - a.cov;
    });
    var best = scored[0];
    var meta = best.cand.c.meta || {};
    return {
      i: best.cand.c.i,
      text: best.cand.c.text,
      mode: meta.mode || (best.cand.role === 'wtUnit' ? 'unit' : best.cand.role === 'wtTotal' ? 'total' : 'auto'),
      gross: meta.gross != null ? meta.gross : -1,
      unit: meta.wtUnit || null,
      coverage: best.covRate
    };
  }

  /* ---- 联合求解：尺寸单位 × 重量单位 × 重量口径 ---- */
  function evaluateCombo(rows, strategy, weightCol, dimU, wtU, wMode, totals, hints, opts) {
    var cost = 0, sumCbm = 0, sumKg = 0, sumQty = 0, used = 0, invalid = 0;
    var cbmDeclaredHits = 0, cbmDeclaredTot = 0;
    for (var ri = 0; ri < rows.length; ri++) {
      var rec = rows[ri];
      var d = dimsForStrategy(rec, strategy);
      if (!d || d.nums.length < 2) continue;
      var qty = rec._qty > 0 ? rec._qty : 1;
      var dcm = [], ok = true;
      for (var k = 0; k < 3; k++) {
        var raw = d.nums[k];
        if (!isFin(raw) || raw <= 0) { ok = false; break; }
        var u = (d.cellUnits && d.cellUnits[k]) || d.cellUnit || dimU;
        dcm.push(toCm(raw, u));
      }
      if (!ok) { invalid++; cost += 12; continue; }
      var vol = dcm[0] * dcm[1] * dcm[2] / 1e6;
      sumCbm += vol * qty;
      sumQty += qty;
      used++;
      /* 行内 CBM 校准 */
      if (rec.cbms && rec.cbms.length) {
        var cb = rec.cbms[0];
        var e1 = relErr(vol, cb.val);
        var e2 = relErr(vol * qty, cb.val);
        var e = Math.min(e1, e2);
        cost += 30 * e;
        if (e < 0.2) cbmDeclaredHits++;
        cbmDeclaredTot++;
      }
      /* 重量 */
      var perKg = 0;
      if (weightCol) {
        var rawW = NaN, wUnitExplicit = null;
        for (var wi = 0; wi < rec.wts.length; wi++) {
          if (rec.wts[wi].i === weightCol.i) { rawW = rec.wts[wi].val; wUnitExplicit = rec.wts[wi].unit; break; }
        }
        if (!(isFin(rawW) && rawW > 0)) {
          for (var wj = 0; wj < rec.wts.length; wj++) { rawW = rec.wts[wj].val; wUnitExplicit = rec.wts[wj].unit; break; }
        }
        if (isFin(rawW) && rawW > 0) {
          var mode = wMode;
          if (weightCol.mode === 'unit') mode = 'unit';
          else if (weightCol.mode === 'total') mode = 'total';
          var per = mode === 'total' ? rawW / Math.max(qty, 1) : rawW;
          perKg = toKg(per, wUnitExplicit || wtU);
          sumKg += perKg * qty;
        }
      }
      cost += plausibilityCost(dcm, perKg, vol);
    }
    if (used === 0) return { cost: 1e9, sumCbm: 0, sumKg: 0, sumQty: 0, used: 0, cbmHits: 0, cbmTot: 0 };
    if (totals) {
      if (isFin(totals.cbm) && totals.cbm > 0) cost += 80 * relErr(sumCbm, totals.cbm);
      if (isFin(totals.kg) && totals.kg > 0) {
        var declKg = totals.kgUnit ? toKg(totals.kg, totals.kgUnit) : totals.kg;
        if (sumKg > 0) cost += 80 * relErr(sumKg, declKg);
      }
    }
    /* 单位提示先验（表头单位可被数值证据推翻，所以只给小权重） */
    if (hints) {
      if (hints.dimUnit && dimU !== hints.dimUnit) cost += 14;
      if (hints.weightUnit && wtU && wtU !== hints.weightUnit) cost += 10;
    }
    /* 数值量级冲突强规则：cm 表头 + 出现 >600 的尺寸几乎必为 mm */
    var maxRaw = 0;
    rows.forEach(function (rec) {
      var d = dimsForStrategy(rec, strategy);
      if (d && d.nums) d.nums.forEach(function (v) { if (isFin(v) && v > maxRaw) maxRaw = v; });
    });
    if (dimU === 'cm') {
      if (maxRaw > 1200) cost += 60;
      else if (maxRaw > 600) cost += 18;
      else if (maxRaw > 350) cost += 2;
    }
    if (dimU === 'mm' && maxRaw > 0 && maxRaw < 12) cost += 25;    /* mm 却全是 1.2 这类小数 → 更像 m */
    if (dimU === 'm' && maxRaw > 60) cost += 15;
    /* 默认偏好 cm（无证据时） */
    if (dimU === 'cm') cost += 0.2; else if (dimU === 'mm') cost += 0.7; else if (dimU === 'm') cost += 1.2; else cost += 1.6;
    if (wtU === 'kg') cost += 0.1; else if (wtU === 't') cost += 0.4; else if (wtU === 'g') cost += 1.2; else if (wtU === 'lb') cost += 1.6;
    if (opts && opts.forceDimUnit === dimU) cost -= 5;
    if (opts && opts.forceWeightUnit === wtU) cost -= 3;

    return { cost: cost, sumCbm: sumCbm, sumKg: sumKg, sumQty: sumQty, used: used, invalid: invalid, cbmHits: cbmDeclaredHits, cbmTot: cbmDeclaredTot };
  }

  function sheetUnitHints(grid, hd) {
    var hints = { dimUnit: null, weightUnit: null, source: [] };
    var scanLimit = Math.min(grid.length, (hd && hd.row >= 0 ? hd.row : 10) + 3);
    if (hd && hd.row < 0) scanLimit = Math.min(grid.length, 12);
    for (var r = 0; r < scanLimit; r++) {
      var cells = toCells(grid[r] || []);
      for (var c = 0; c < cells.length; c++) {
        var s = cells[c];
        if (!s) continue;
        if (!hints.dimUnit && /(单位|unit)\s*[:：]?\s*(mm|cm|m|inch|毫米|厘米|米|英寸)/i.test(s)) {
          hints.dimUnit = dimUnitIn(s);
          hints.source.push('表头区单位说明');
        }
        if (!hints.dimUnit && /(尺寸|长宽高|size|dimension)[^,;]{0,12}(mm|cm|m|inch|毫米|厘米|米|英寸)/i.test(s)) {
          hints.dimUnit = dimUnitIn(s);
          hints.source.push('表头区尺寸单位');
        }
        if (!hints.weightUnit && /(重量|毛重|净重|weight|g\.?w\.?|n\.?w\.?)[^,;]{0,12}(kg|kgs|t|吨|g|lbs?)/i.test(s)) {
          hints.weightUnit = weightUnitIn(s);
          hints.source.push('表头区重量单位');
        }
      }
    }
    /* 列头单位投票 */
    if (!hints.dimUnit && hd && hd.cols) {
      var votes = {};
      hd.cols.dimComb.forEach(function (c) { var u = c.meta && c.meta.dimUnit; if (u) votes[u] = (votes[u] || 0) + 1; });
      [hd.cols.L, hd.cols.W, hd.cols.H].forEach(function (arr) {
        if (arr && arr.length && arr[0].meta && arr[0].meta.dimUnit) {
          var u = arr[0].meta.dimUnit; votes[u] = (votes[u] || 0) + 1;
        }
      });
      hints.dimUnit = unitFromCounts(votes);
    }
    if (!hints.weightUnit && hd && hd.cols) {
      var wvotes = {};
      [hd.cols.wtUnit, hd.cols.wtTotal, hd.cols.wtAny].forEach(function (arr) {
        (arr || []).forEach(function (c) { var u = c.meta && c.meta.wtUnit; if (u) wvotes[u] = (wvotes[u] || 0) + 1; });
      });
      hints.weightUnit = unitFromCounts(wvotes);
    }
    return hints;
  }

  function resolveUnits(rows, strategies, weightCol, totals, hints, opts) {
    var dimUnits = ['cm', 'mm', 'm', 'in'];
    var wtUnits = weightCol ? ['kg', 't', 'g', 'lb'] : [null];
    var wModes;
    if (weightCol) {
      if (weightCol.mode === 'unit') wModes = ['unit'];
      else if (weightCol.mode === 'total') wModes = ['total'];
      else wModes = ['unit', 'total'];
    } else wModes = ['unit'];
    if (opts && opts.forceDimUnit) dimUnits = [opts.forceDimUnit];
    if (opts && opts.forceWeightUnit && weightCol) wtUnits = [opts.forceWeightUnit];

    var best = null;
    strategies.forEach(function (strategy) {
      for (var a = 0; a < dimUnits.length; a++) {
        for (var b = 0; b < wtUnits.length; b++) {
          for (var m = 0; m < wModes.length; m++) {
            var dimU = dimUnits[a], wtU = wtUnits[b], wMode = wModes[m];
            var res = evaluateCombo(rows, strategy, weightCol, dimU, wtU, wMode, totals, hints, opts);
            var coveragePenalty = (rows.length - res.used) * 6;
            var total = res.cost + coveragePenalty;
            var cand = {
              strategy: strategy, dimUnit: dimU, weightUnit: wtU, weightMode: wMode,
              cost: total, baseCost: res.cost, used: res.used,
              sumCbm: res.sumCbm, sumKg: res.sumKg, sumQty: res.sumQty,
              cbmHits: res.cbmHits, cbmTot: res.cbmTot, invalid: res.invalid
            };
            if (!best || cand.cost < best.cost) best = cand;
          }
        }
      }
    });
    return best;
  }

  /* 行内有明确单位标记时的真实单位（用于报告展示） */
  function hardUnitMajority(rows, strategy) {
    var counts = {}, n = 0;
    rows.forEach(function (rec) {
      var d = dimsForStrategy(rec, strategy);
      if (!d) return;
      var u = (d.cellUnits && d.cellUnits[0]) || d.cellUnit || null;
      if (u) { counts[u] = (counts[u] || 0) + 1; n++; }
    });
    if (!n) return null;
    var best = null, bn = 0;
    for (var k in counts) if (counts[k] > bn) { bn = counts[k]; best = k; }
    return best;
  }

  function buildUnitBasis(best, hints, totals, dimStats) {
    var dimBasis = [], wtBasis = [];
    var du = best.dimUnit;
    if (hints && hints.dimUnit) {
      if (hints.dimUnit === du) dimBasis.push('表头/说明标注 ' + du.toUpperCase());
      else dimBasis.push('表头标注 ' + hints.dimUnit.toUpperCase() + '，但数值/合计校验判定应为 ' + du.toUpperCase());
    } else {
      dimBasis.push('按数值量级与装柜可行性判定 ' + du.toUpperCase());
    }
    if (best.cbmTot > 0 && best.cbmHits >= Math.max(1, best.cbmTot * 0.6)) {
      dimBasis.push('与表内 CBM 列 ' + best.cbmHits + '/' + best.cbmTot + ' 行吻合');
    }
    if (dimStats && dimStats.max > 0) {
      dimBasis.push('最大值 ' + dimStats.max + ' → ' + du.toUpperCase() + ' 换算后 ' + r1(toCm(dimStats.max, du)) + ' cm');
    }
    var wu = best.weightUnit;
    if (wu) {
      if (hints && hints.weightUnit === wu) wtBasis.push('表头标注 ' + wu.toUpperCase());
      else if (hints && hints.weightUnit) wtBasis.push('表头标注 ' + hints.weightUnit.toUpperCase() + '，但重量合计校验判定 ' + wu.toUpperCase());
      else wtBasis.push('按表内合计/量级判定 ' + wu.toUpperCase());
      if (best.weightMode === 'total') wtBasis.push('行重量为整行合计 → 已除以件数');
      if (totals && isFin(totals.kg)) wtBasis.push('与表内合计重量对比校验');
    }
    return { dim: dimBasis.join('；'), weight: wtBasis.join('；') };
  }

  /* ============================ 9. 数量口径求解 ============================ */

  function seriesFromRows(rows, kind) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var rec = rows[i];
      var v = NaN;
      if (kind === 'pkg') v = rec.qty.pkg.length ? rec.qty.pkg[0] : NaN;
      else if (kind === 'pcs') v = rec.qty.pcs.length ? rec.qty.pcs[0] : NaN;
      else if (kind === 'perCtn') v = rec.qty.perCtn.length ? rec.qty.perCtn[0] : NaN;
      else if (kind === 'totalPcs') v = rec.qty.totalPcs.length ? rec.qty.totalPcs[0] : NaN;
      else if (kind === 'text') v = rec.qtyText;
      out.push(v);
    }
    return out;
  }
  function seriesSum(arr, fallback) {
    var s = 0;
    arr.forEach(function (v) { if (isFin(v) && v > 0) s += v; else if (isFin(fallback) && fallback > 0) s += fallback; });
    return { sum: s };
  }
  function buildQtyCandidates(rows, cols, totals) {
    var pkg = seriesFromRows(rows, 'pkg');
    var pcs = seriesFromRows(rows, 'pcs');
    var perCtn = seriesFromRows(rows, 'perCtn');
    var totalPcs = seriesFromRows(rows, 'totalPcs');
    var textQ = seriesFromRows(rows, 'text');
    function coverage(arr) { var n = 0; arr.forEach(function (v) { if (isFin(v) && v > 0) n++; }); return arr.length ? n / arr.length : 0; }
    var declaredPkg = isFin(totals.qtyPkg) ? totals.qtyPkg : NaN;
    var declaredPcs = isFin(totals.qtyPcs) ? totals.qtyPcs : NaN;

    var pcsPerCtnDerived = [];
    for (var i = 0; i < rows.length; i++) {
      var p = pcs[i], c = perCtn[i];
      pcsPerCtnDerived.push(isFin(p) && isFin(c) && c > 0 ? p / c : NaN);
    }
    var piecesFromPkgCtn = [];
    for (var j = 0; j < rows.length; j++) {
      var pk = pkg[j], pc = perCtn[j];
      piecesFromPkgCtn.push(isFin(pk) && isFin(pc) && pc > 0 ? pk * pc : NaN);
    }

    var cands = [];
    function addCand(kind, series, label, sumOverride) {
      var cov = coverage(series);
      if (cov <= 0 && kind !== 'ones') return;
      cands.push({ kind: kind, series: series, label: label, sum: sumOverride != null ? sumOverride : seriesSum(series, 1).sum, coverage: cov });
    }
    addCand('pkg', pkg, '箱数/件数');
    addCand('pcs', pcs, '数量/PCS');
    addCand('pcsPerCtn', pcsPerCtnDerived, '数量÷每箱数');
    addCand('totalPcs', totalPcs, '总数量');
    addCand('text', textQ, '行内件数文字');
    addCand('ones', rows.map(function () { return NaN; }), '每行按 1 件计', rows.length);

    var piecesTotal = NaN;
    if (coverage(pcs) >= 0.5) piecesTotal = seriesSum(pcs, NaN).sum;
    else if (coverage(totalPcs) >= 0.5) piecesTotal = seriesSum(totalPcs, NaN).sum;
    else if (coverage(piecesFromPkgCtn) >= 0.5) piecesTotal = seriesSum(piecesFromPkgCtn, NaN).sum;

    return {
      candidates: cands,
      declaredPkg: declaredPkg,
      declaredPcs: declaredPcs,
      piecesTotal: piecesTotal
    };
  }

  /* 件数候选与表内合计 / 序号列的一致性成本 */
  function qtyCandidatePenalty(cand, qtyInfo) {
    var pen = 0;
    if (isFin(qtyInfo.declaredPkg) && qtyInfo.declaredPkg > 0) pen += 40 * relErr(cand.sum, qtyInfo.declaredPkg);
    if (isFin(qtyInfo.declaredPcs) && qtyInfo.declaredPcs > 0 && (cand.kind === 'pcs' || cand.kind === 'totalPcs' || cand.kind === 'pcsPerCtn')) {
      pen += 25 * relErr(cand.sum, qtyInfo.declaredPcs);
    }
    if (cand.kind !== 'ones' && cand.coverage < 0.5) pen += 15;
    if (cand.kind !== 'ones') {
      var seq = [];
      cand.series.forEach(function (v) { if (isFin(v) && v > 0) seq.push(v); });
      if (isIndexSeries(seq)) pen += 80;
    }
    return pen;
  }
  function qtySeriesApplied(cand, rows) {
    var out = [], blank = 0;
    for (var k = 0; k < rows.length; k++) {
      var v = cand.series[k];
      if (isFin(v) && v > 0) { var iv = Math.round(v); out.push(iv > 0 ? iv : 1); }
      else { blank++; out.push(1); }
    }
    return { series: out, sum: out.reduce(function (a, b) { return a + b; }, 0), blank: blank };
  }

  /* ============================ 10. 包装类型映射 ============================ */

  function mapPackType(raw, name) {
    var all = txt(raw) + ' ' + txt(name);
    if (/(散出|散货|散装|散件|loose|bulk)/i.test(all)) return 'carton';
    if (/(铁架|铁框|钢架|框架|焊接架|steel\s*frame|metal\s*frame|木箱|木架|木托|crate|case\s*pack)/i.test(all)) return 'crate';
    if (/(托盘|栈板|卡板|pallet|skid)/i.test(all)) return 'pallet';
    return 'carton';
  }
  function cleanName(v) {
    var t = txt(v).replace(/\r/g, '\n');
    t = t.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).join(' ');
    t = t.replace(/\s+/g, ' ').trim();
    return t.slice(0, 80);
  }

  /* ============================ 11. 单个工作表完整解析 ============================ */

  function cloneGrid(grid) {
    var out = [];
    for (var r = 0; r < grid.length; r++) {
      var row = grid[r] || [];
      var cells = [];
      for (var c = 0; c < row.length; c++) cells.push(row[c]);
      out.push(cells);
    }
    return out;
  }
  /* 合并单元格：仅回填到表头区（用于识别双行表头/跨列表头），
     数据区不回填，避免合并单元格的数值被重复计入多行 */
  function fillMergesUpTo(grid, merges, lastRow) {
    if (!merges || !merges.length) return;
    merges.forEach(function (m) {
      if (!m || !m.s || !m.e) return;
      var sr = m.s.r, sc = m.s.c, er = m.e.r, ec = m.e.c;
      var v = (grid[sr] || [])[sc];
      if (v == null || v === '') return;
      for (var r = sr; r <= er; r++) {
        if (r > lastRow) break;
        if (!grid[r]) grid[r] = [];
        for (var c = sc; c <= ec; c++) {
          if (r === sr && c === sc) continue;
          if (grid[r][c] == null || grid[r][c] === '') grid[r][c] = v;
        }
      }
    });
  }
  /* 数据区里「纵向合并的续行」：把这些行视为上一行的一部分，避免重复计件/计体积 */
  function mergeContinuationRows(merges, headerEnd, cols) {
    var mark = {};
    if (!merges || !merges.length) return mark;
    var packCols = {};
    (cols.dimComb || []).forEach(function (c) {
      /* 「产品尺寸」类尺寸不是包装尺寸，不能因为它在数据区纵向合并就跳过整行 */
      if (c.meta && c.meta.pri === 2) return;
      if (/(产品尺寸|商品尺寸|product\s*size)/i.test(c.text || '')) return;
      packCols[c.i] = 1;
    });
    [cols.L, cols.W, cols.H, cols.wtUnit, cols.wtTotal, cols.wtAny, cols.cbm].forEach(function (arr) {
      (arr || []).forEach(function (c) { packCols[c.i] = 1; });
    });
    merges.forEach(function (m) {
      if (!m || !m.s || !m.e) return;
      if (m.s.r <= headerEnd) return;                  /* 表头区的合并 */
      var isPack = false;
      for (var c = m.s.c; c <= m.e.c; c++) { if (packCols[c]) { isPack = true; break; } }
      if (!isPack) return;
      for (var r = m.s.r + 1; r <= m.e.r; r++) { if (r > headerEnd) mark[r] = 1; }
    });
    return mark;
  }

  function parseSheet(sheet, opts) {
    opts = opts || {};
    var t0 = (typeof Date !== 'undefined' ? Date.now() : 0);
    var rawGrid = cloneGrid(sheet.grid || []);
    if (!rawGrid.length) return null;
    var merges = sheet.merges || [];
    /* 第一遍：表头区全量回填合并单元格，用于定位表头（双行表头 / 跨列合并） */
    var probeGrid = cloneGrid(rawGrid);
    fillMergesUpTo(probeGrid, merges, Math.min(probeGrid.length - 1, 45));
    var hd = findHeader(probeGrid);
    if (!hd) hd = detectHeaderless(probeGrid);
    if (!hd) return null;
    var headerEnd = hd.row + hd.span - 1;
    /* 第二遍：真实网格只回填表头区；数据区合并单元格不复制，避免数值重复计入 */
    var grid = cloneGrid(rawGrid);
    if (merges.length && headerEnd >= 0) fillMergesUpTo(grid, merges, headerEnd);

    var cols = hd.cols;
    var totals = extractTotals(grid, hd, cols);
    promoteByProfile(grid, hd.row + hd.span, cols, totals);
    totals = extractTotals(grid, hd, cols);
    var hints = sheetUnitHints(grid, hd);
    var contRows = mergeContinuationRows(merges, headerEnd, cols);

    var extracted = extractRawRows(grid, hd, cols, contRows);
    var rows = extracted.rows;
    var warnings = [];
    var missing = extracted.missing;
    if (!rows.length && !missing.length) return null;

    /* 缺尺寸行补占位（保证件数不丢，默认开启） */
    var keepMissing = opts.keepMissingDims !== false;
    var placeholderRows = buildPlaceholderRows(missing, cols, keepMissing);
    rows = rows.concat(placeholderRows);
    rows.sort(function (a, b) { return a.r - b.r; });

    /* 尺寸来源策略 */
    var strategies = [];
    if (cols.dimComb.length) {
      cols.dimComb.slice(0, 4).forEach(function (c) {
        strategies.push({ kind: 'comb', i: c.i, text: c.text });
      });
    }
    if (cols.L.length && cols.W.length && cols.H.length) strategies.push({ kind: 'sep', text: 'L/W/H 分列' });
    strategies.push({ kind: 'auto', text: '自动' });
    var seenSig = {};
    strategies = strategies.filter(function (s) {
      var sig = s.kind + ':' + (s.i != null ? s.i : '');
      if (seenSig[sig]) return false;
      seenSig[sig] = 1;
      return true;
    });

    /* 件数口径 × 尺寸/重量单位 联合求解：
       候选件数（箱数/数量/每箱数/总数量/每行1件）逐一与单位组合求解，
       由「表内合计体积/重量/件数」共同打分，避免把序号列当件数、
       也避免合并单元格或重复工作表导致件数/体积被放大。 */
    var qtyInfo = buildQtyCandidates(rows, cols, totals);
    var weightCol = pickWeightColumn(cols, rows);
    var bestCombo = null;
    qtyInfo.candidates.forEach(function (cand) {
      var applied = qtySeriesApplied(cand, rows);
      rows.forEach(function (rec, i) { rec._qty = applied.series[i]; });
      var combo = resolveUnits(rows, strategies, weightCol, totals, hints, opts);
      if (!combo) return;
      var totalCost = combo.cost + qtyCandidatePenalty(cand, qtyInfo);
      if (!bestCombo || totalCost < bestCombo.totalCost) {
        bestCombo = { combo: combo, cand: cand, applied: applied, totalCost: totalCost };
      }
    });
    if (!bestCombo) return null;
    var best = bestCombo.combo;
    var qtyRes = {
      qtySeries: bestCombo.applied.series,
      qtySum: bestCombo.applied.sum,
      kind: bestCombo.cand.kind,
      label: bestCombo.cand.label,
      declaredPkg: qtyInfo.declaredPkg,
      declaredPcs: qtyInfo.declaredPcs,
      piecesTotal: qtyInfo.piecesTotal,
      candidates: qtyInfo.candidates.map(function (c) { return { label: c.label, sum: c.sum, coverage: Math.round(c.coverage * 100) }; })
    };
    rows.forEach(function (rec, i) { rec._qty = qtyRes.qtySeries[i] || 1; });
    if (qtyRes.kind === 'ones' && rows.length > 1) {
      warnings.push({ type: 'qty', msg: '未发现「箱数/件数」列，已按每行 1 件计（共 ' + qtyRes.qtySum + ' 件；如每行件数不同请核对）' });
    } else if (bestCombo.applied.blank > Math.max(1, rows.length * 0.3)) {
      warnings.push({ type: 'qty', msg: bestCombo.applied.blank + ' 行未识别到件数，已按每行 1 件计（请核对）' });
    }

    /* 行内硬单位占多数时，报告展示真实单位 */
    var hardU = hardUnitMajority(rows, best.strategy);
    if (hardU && (!hints || !hints.dimUnit || hardU !== best.dimUnit)) best.reportDimUnit = hardU;
    var reportDimUnit = best.reportDimUnit || best.dimUnit;

    /* 尺寸统计（用于报告与单位依据） */
    var dimStats = { min: Infinity, max: 0, n: 0 };
    rows.forEach(function (rec) {
      var d = strategyDimsWithFallback(rec, best.strategy);
      if (!d) return;
      d.nums.forEach(function (v) { if (isFin(v) && v > 0) { dimStats.n++; if (v < dimStats.min) dimStats.min = v; if (v > dimStats.max) dimStats.max = v; } });
    });
    if (!isFin(dimStats.min)) dimStats.min = 0;

    /* 生成货物行 */
    var cargo = [];
    var missingDimsCount = 0;
    rows.forEach(function (rec) {
      var d = strategyDimsWithFallback(rec, best.strategy);
      if (!d) return;
      var dcm = [];
      for (var k = 0; k < 3; k++) {
        var raw = d.nums[k];
        if (!isFin(raw) || raw <= 0) { dcm = null; break; }
        var u = (d.cellUnits && d.cellUnits[k]) || d.cellUnit || best.dimUnit;
        dcm.push(toCm(raw, u));
      }
      if (!dcm) { missingDimsCount++; return; }
      var qty = rec._qty > 0 ? Math.round(rec._qty) : 1;
      /* 重量 */
      var kg = 0;
      if (best.weightUnit) {
        var rawW = NaN, wUnitExplicit = null;
        if (weightCol) {
          for (var wi = 0; wi < rec.wts.length; wi++) {
            if (rec.wts[wi].i === weightCol.i) { rawW = rec.wts[wi].val; wUnitExplicit = rec.wts[wi].unit; break; }
          }
        }
        if (!(isFin(rawW) && rawW > 0)) {
          for (var wj = 0; wj < rec.wts.length; wj++) { rawW = rec.wts[wj].val; wUnitExplicit = rec.wts[wj].unit; break; }
        }
        if (isFin(rawW) && rawW > 0) {
          var mode = weightCol && weightCol.mode === 'unit' ? 'unit' : (weightCol && weightCol.mode === 'total' ? 'total' : best.weightMode);
          var per = mode === 'total' ? rawW / Math.max(qty, 1) : rawW;
          kg = toKg(per, wUnitExplicit || best.weightUnit);
        }
      }
      var name = cleanName(rec.name) || ('Cargo ' + (cargo.length + 1));
      var nameFallback = !cleanName(rec.name);
      cargo.push({
        name: name,
        qty: qty,
        L_cm: r1(clamp(dcm[0], 0.1, 99999)),
        W_cm: r1(clamp(dcm[1], 0.1, 99999)),
        H_cm: r1(clamp(dcm[2], 0.1, 99999)),
        weight_kg: r2(kg > 0 ? kg : 0),
        type: mapPackType(rec.typeText, rec.name),
        unloadStop: rec.stop || 1,
        canFlip: true, canSide: true,
        loadCap: rec.loadCap || 0,
        fragile: rec.fragile || 0,
        hazmat: rec.hazmat || 0,
        inspect: rec.inspect || 0,
        _row: rec.r + 1,
        _placeholder: !!rec.placeholder,
        _nameFallback: nameFallback,
        _dimsForm: d.form || ''
      });
    });

    /* 统计 */
    var sumCbm = 0, sumKg = 0, sumQty = 0;
    cargo.forEach(function (c) { sumCbm += c.qty * c.L_cm * c.W_cm * c.H_cm / 1e6; sumKg += c.qty * c.weight_kg; sumQty += c.qty; });

    /* 校验项 */
    var checks = [];
    function addCheck(key, label, parsed, declared, unit, tol) {
      if (!isFin(declared) || declared <= 0) {
        checks.push({ key: key, label: label, parsed: parsed, declared: null, ok: null, unit: unit });
        return;
      }
      var ok = unit === 'qty'
        ? (Math.abs(parsed - declared) <= Math.max(1, declared * 0.005))
        : (relErr(parsed, declared) <= (tol || 0.03));
      checks.push({ key: key, label: label, parsed: parsed, declared: declared, ok: ok, deltaPct: (parsed - declared) / declared * 100, unit: unit });
    }
    addCheck('qty', '装载件数(箱/件)', sumQty, qtyRes.declaredPkg, 'qty');
    if (isFin(qtyRes.piecesTotal) || isFin(qtyRes.declaredPcs)) {
      addCheck('pieces', '货物件数(PCS)', isFin(qtyRes.piecesTotal) ? qtyRes.piecesTotal : NaN, qtyRes.declaredPcs, 'qty');
    }
    addCheck('cbm', '总体积(m³)', sumCbm, totals.cbm, 'num', 0.03);
    var declaredKg = isFin(totals.kg)
      ? (totals.kgUnit ? toKg(totals.kg, totals.kgUnit) : toKg(totals.kg, best.weightUnit || 'kg'))
      : NaN;
    addCheck('kg', '总重量(kg)', sumKg, declaredKg, 'num', 0.03);

    /* 警告收集 */
    if (missingDimsCount > 0) warnings.push({ type: 'dims', msg: missingDimsCount + ' 行尺寸无法解析，已跳过' });
    if (placeholderRows.length) warnings.push({ type: 'dims', msg: placeholderRows.length + ' 行缺尺寸，已按 30×30×30cm 占位（请手工修正这 ' + placeholderRows.length + ' 行）' });
    if (hints.dimUnit && hints.dimUnit !== best.dimUnit) {
      warnings.push({ type: 'unit', msg: '表头标注尺寸单位 ' + hints.dimUnit.toUpperCase() + '，但数值校验判定应为 ' + best.dimUnit.toUpperCase() + '，已按 ' + best.dimUnit.toUpperCase() + ' 换算（如不对可点「手动指定单位」）' });
    }
    if (hints.weightUnit && best.weightUnit && hints.weightUnit !== best.weightUnit) {
      warnings.push({ type: 'unit', msg: '表头标注重量单位 ' + hints.weightUnit.toUpperCase() + '，但合计/量级校验判定为 ' + best.weightUnit.toUpperCase() + '，已按 ' + best.weightUnit.toUpperCase() + ' 换算（如不对可点「手动指定单位」）' });
    }
    var oddDensity = 0;
    cargo.forEach(function (c) {
      var vol = c.L_cm * c.W_cm * c.H_cm / 1e6;
      if (vol > 0 && c.weight_kg > 0) {
        var dens = c.weight_kg / vol;
        if (dens > 4000 || dens < 3) oddDensity++;
      }
    });
    if (oddDensity > 0 && cargo.length) {
      warnings.push({ type: 'density', msg: oddDensity + ' 行「重量÷体积」密度异常（>4t/m³ 或 <3kg/m³），可能重量单位/口径与尺寸单位不一致，请核对' });
    }
    var noW = cargo.filter(function (c) { return !(c.weight_kg > 0); }).length;
    if (noW > 0) warnings.push({ type: 'weight', msg: noW + ' 行未识别到重量，总重量会偏小' });
    var noName = cargo.filter(function (c) { return c._nameFallback; }).length;
    if (noName > 0) warnings.push({ type: 'name', msg: noName + ' 行未识别到品名，已用 Cargo N 代替' });

    var basis = buildUnitBasis(best, hints, totals, dimStats);
    var elapsed = (typeof Date !== 'undefined' ? Date.now() : 0) - t0;

    /* 工作表质量打分：用于多工作表自动选表（不只看行数） */
    var headerJoin = '';
    if (hd.row >= 0) {
      headerJoin = toCells(grid[hd.row] || []).join(' ');
      if (hd.span > 1) headerJoin += ' ' + toCells(grid[hd.row + 1] || []).join(' ');
    }
    var score = Math.min(cargo.length, 40) * 1.2;
    if (cols.name.length) score += 4;
    if (best.strategy.kind === 'sep') score += 8; else if (best.strategy.kind === 'comb') score += 7;
    if (cols.qtyPkg.length || cols.qtyPcs.length || cols.qtyTotalPcs.length || cols.qtyPerCtn.length) score += 5;
    if (best.weightUnit) score += 4;
    if (cols.cbm.length) score += 3;
    if (best.cbmTot > 0 && best.cbmHits >= best.cbmTot * 0.6) score += 25;      /* CBM 列与尺寸完全对得上 = 权威箱单 */
    if (isFin(totals.cbm) || isFin(totals.kg)) score += 10;                     /* 有 TOTAL 合计行 */
    checks.forEach(function (chk) { if (chk.ok === true) score += 3; });
    if (/(跟踪号|运单号|物流状态|签收|派送状态|物流单号|tracking\s*(?:no|number)|waybill)/i.test(headerJoin)) score -= 35;   /* 快递/物流流水表，不像整柜箱单 */
    if (hd.headerless) score -= 6;
    if (sheet.name && /(packing|箱单|装箱|预报|明细|picking)/i.test(sheet.name)) score += 4;

    var columns = {
      name: cols.name.length ? cols.name[0] : null,
      dims: best.strategy.kind === 'comb'
        ? (cols.dimComb.filter(function (c) { return c.i === best.strategy.i; })[0] || null)
        : (best.strategy.kind === 'sep' ? { i: cols.L[0] ? cols.L[0].i : -1, text: 'L/W/H 分列' } : null),
      qty: cols.qtyPkg[0] || cols.qtyPcs[0] || null,
      weight: weightCol ? { i: weightCol.i, text: weightCol.text } : null,
      cbm: cols.cbm[0] || null
    };

    return {
      ok: true,
      version: VERSION,
      sheet: sheet.name || '',
      headerRow: (hd.row >= 0 ? hd.row + 1 : 0),
      headerRows: hd.span,
      headerless: !!hd.headerless,
      headerTexts: hd.row >= 0 ? toCells(grid[hd.row] || []) : [],
      columns: columns,
      rows: cargo,
      stats: {
        rowCount: cargo.length,
        kinds: cargo.length,
        sumQty: sumQty,
        qtyKind: qtyRes.kind,
        qtyLabel: qtyRes.label,
        piecesTotal: isFin(qtyRes.piecesTotal) ? qtyRes.piecesTotal : null,
        sumCbm: sumCbm,
        sumKg: sumKg,
        avgDensity: sumCbm > 0 ? sumKg / sumCbm : 0,
        skippedRows: extracted.notes.length,
        missingDimsRows: missingDimsCount + placeholderRows.length
      },
      totals: totals,
      checks: checks,
      units: {
        dim: {
          unit: reportDimUnit,
          toCm: DIM_TO_CM[reportDimUnit] || 1,
          basis: basis.dim,
          confidence: (best.cbmTot > 0 && best.cbmHits >= best.cbmTot * 0.6) ? 'high' : (hints.dimUnit === best.dimUnit ? 'high' : 'medium')
        },
        weight: best.weightUnit ? {
          unit: best.weightUnit,
          toKg: WT_TO_KG[best.weightUnit],
          basis: basis.weight,
          mode: best.weightMode,
          confidence: (hints.weightUnit === best.weightUnit ? 'high' : 'medium')
        } : null
      },
      qtyDetail: {
        kind: qtyRes.kind, label: qtyRes.label,
        declaredPkg: isFin(qtyRes.declaredPkg) ? qtyRes.declaredPkg : null,
        declaredPcs: isFin(qtyRes.declaredPcs) ? qtyRes.declaredPcs : null,
        candidates: qtyRes.candidates
      },
      warnings: warnings.slice(0, 30),
      notes: extracted.notes.slice(0, 20),
      missingRows: missing.slice(0, 20),
      score: score,
      elapsedMs: elapsed,
      dimStats: dimStats,
      cost: best.cost
    };
  }

  /* ============================ 12. 多工作表 / 对外 API ============================ */

  function sheetSignature(r) {
    var first = r.rows[0] || {}, last = r.rows[r.rows.length - 1] || {};
    return [r.rows.length, Math.round(r.stats.sumQty), Math.round(r.stats.sumCbm * 1000), Math.round(r.stats.sumKg),
      (first.name || '') + ':' + (first.L_cm || '') + 'x' + (first.W_cm || '') + 'x' + (first.H_cm || '') + ':' + (first.weight_kg || ''),
      (last.name || '') + ':' + (last.qty || '')].join('#');
  }
  function summarizeResult(r, duplicateOf) {
    return {
      sheet: r.sheet, rows: r.rows.length, qty: r.stats.sumQty,
      cbm: Math.round(r.stats.sumCbm * 100) / 100, kg: Math.round(r.stats.sumKg * 10) / 10,
      pieces: r.stats.piecesTotal, score: Math.round(r.score * 10) / 10,
      duplicateOf: duplicateOf || null
    };
  }
  function mergeResults(results) {
    if (!results.length) return null;
    if (results.length === 1) { results[0].sheetOptions = [summarizeResult(results[0])]; return results[0]; }
    var base = results[0];
    var rows = [];
    var sumCbm = 0, sumKg = 0, sumQty = 0;
    var decCbm = 0, decKg = 0;
    var warnings = [];
    function findCheck(r, key) {
      var a = r.checks || [];
      for (var i = 0; i < a.length; i++) if (a[i].key === key) return a[i];
      return null;
    }
    results.forEach(function (r) {
      r.rows.forEach(function (c) { rows.push(Object.assign({}, c)); });
      sumCbm += r.stats.sumCbm; sumKg += r.stats.sumKg; sumQty += r.stats.sumQty;
      var cb = findCheck(r, 'cbm'); if (cb && cb.declared != null) decCbm += cb.declared;
      var kc = findCheck(r, 'kg'); if (kc && kc.declared != null) decKg += kc.declared;
      (r.warnings || []).forEach(function (w) { warnings.push(w); });
      warnings.push({ type: 'sheet', msg: '已并入工作表「' + r.sheet + '」：' + r.rows.length + ' 行 / ' + r.stats.sumQty + ' 件 / ' + (Math.round(r.stats.sumCbm * 100) / 100) + ' m³' });
    });
    var merged = Object.assign({}, base);
    merged.sheet = '合并 ' + results.length + ' 个工作表';
    merged.rows = rows;
    merged.stats = Object.assign({}, base.stats, {
      rowCount: rows.length, kinds: rows.length, sumQty: sumQty,
      sumCbm: sumCbm, sumKg: sumKg, avgDensity: sumCbm > 0 ? sumKg / sumCbm : 0
    });
    merged.checks = (base.checks || []).map(function (c) { return Object.assign({}, c); });
    merged.checks.forEach(function (c) {
      if (c.key === 'qty') { c.parsed = sumQty; }
      if (c.key === 'cbm' && decCbm > 0) { c.parsed = sumCbm; c.declared = decCbm; c.ok = relErr(sumCbm, decCbm) <= 0.03; }
      if (c.key === 'kg' && decKg > 0) { c.parsed = sumKg; c.declared = decKg; c.ok = relErr(sumKg, decKg) <= 0.03; }
    });
    merged.warnings = warnings.slice(0, 30);
    merged.sheetOptions = results.map(function (r) { return summarizeResult(r); });
    merged.mergedSheets = results.map(function (r) { return r.sheet; });
    return merged;
  }
  function parseSheets(sheets, opts) {
    opts = opts || {};
    var results = [];
    (sheets || []).forEach(function (sh) {
      if (!sh || !sh.grid || !sh.grid.length) return;
      try {
        var r = parseSheet({ name: sh.name || '', grid: sh.grid, merges: sh.merges }, opts);
        if (r && r.rows && r.rows.length) results.push(r);
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('parseSheet error', sh.name, e);
      }
    });
    if (!results.length) return null;
    results.sort(function (a, b) {
      if (Math.abs(a.score - b.score) > 2) return b.score - a.score;
      return b.rows.length - a.rows.length;
    });
    /* 重复工作表检测（如「预报明细」与「预报明细(2)」内容完全相同的重复页） */
    var unique = [], sigMap = {};
    results.forEach(function (r) {
      var sig = sheetSignature(r);
      if (sigMap[sig]) return;
      sigMap[sig] = r;
      unique.push(r);
    });
    var options = results.map(function (r) {
      var sig = sheetSignature(r);
      var keeper = sigMap[sig];
      return summarizeResult(r, keeper !== r ? keeper.sheet : null);
    });
    function decorate(r) {
      r.sheetOptions = options;
      r.sheetsParsed = results.length;
      r.otherSheets = unique.filter(function (x) { return x !== r; }).map(function (x) { return summarizeResult(x); });
      r.duplicateSheets = options.filter(function (o) { return o.duplicateOf; }).map(function (o) { return o.sheet; });
      return r;
    }
    /* 手动指定工作表 */
    if (opts.forceSheet) {
      for (var fi = 0; fi < unique.length; fi++) {
        if (unique[fi].sheet === opts.forceSheet) return decorate(unique[fi]);
      }
    }
    /* 合并本文件全部有效工作表 */
    if (opts.mergeAllSheets && unique.length > 1) {
      var merged = mergeResults(unique);
      merged.sheetOptions = options;
      merged.sheetsParsed = results.length;
      merged.duplicateSheets = options.filter(function (o) { return o.duplicateOf; }).map(function (o) { return o.sheet; });
      return merged;
    }
    return decorate(unique[0]);
  }

  function workbookToSheets(wb) {
    var sheets = [];
    wb.SheetNames.forEach(function (sn) {
      var ws = wb.Sheets[sn];
      if (!ws) return;
      var grid = [];
      try {
        grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
      } catch (e) { grid = []; }
      if (!grid || grid.length < 1) return;
      var merges = ws['!merges'] || [];
      sheets.push({ name: sn, grid: grid, merges: merges });
    });
    return sheets;
  }

  function parseWorkbook(wb, opts) {
    try {
      return parseSheets(workbookToSheets(wb), opts);
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error(e);
      return null;
    }
  }

  /* ---------- 文件读取（浏览器）：xlsx/xls/csv/tsv/txt，自动识别 GBK ---------- */
  function readArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function (e) { resolve(e.target.result); };
      fr.onerror = function () { reject(new Error('文件读取失败')); };
      fr.readAsArrayBuffer(file);
    });
  }
  function decodeText(u8) {
    var utf8 = '';
    try { utf8 = new TextDecoder('utf-8').decode(u8); } catch (e) { utf8 = ''; }
    if (utf8 && utf8.indexOf('\ufffd') < 0) return utf8.replace(/^\ufeff/, '');
    try {
      var gbk = new TextDecoder('gbk').decode(u8);
      if (gbk && gbk.indexOf('\ufffd') < 0) return gbk;
    } catch (e2) { }
    return utf8.replace(/^\ufeff/, '');
  }
  function looksLikeZip(u8) { return u8.length > 3 && u8[0] === 0x50 && u8[1] === 0x4b; }
  function looksLikeOle(u8) { return u8.length > 3 && u8[0] === 0xd0 && u8[1] === 0xcf; }

  function parseFile(file, opts) {
    opts = opts || {};
    var name = (file && file.name) || '';
    return readArrayBuffer(file).then(function (buf) {
      var u8 = new Uint8Array(buf);
      var isText = /\.(csv|tsv|txt)$/i.test(name) || (!looksLikeZip(u8) && !looksLikeOle(u8));
      var wb;
      if (isText) {
        var text = decodeText(u8);
        var firstLine = text.split(/\r?\n/)[0] || '';
        var tabs = (firstLine.match(/\t/g) || []).length;
        var commas = (firstLine.match(/,/g) || []).length;
        var semis = (firstLine.match(/;/g) || []).length;
        var readOpts = { type: 'string', raw: false };
        if (tabs > commas && tabs > semis) readOpts.FS = '\t';
        else if (semis > commas) readOpts.FS = ';';
        wb = XLSX.read(text, readOpts);
      } else {
        wb = XLSX.read(u8, { type: 'array', cellDates: false });
      }
      var res = parseWorkbook(wb, opts);
      if (res) {
        res.fileName = name;
        res.meta = { fileName: name, parsedAt: (typeof Date !== 'undefined' ? new Date().toISOString() : ''), version: VERSION };
      }
      return res;
    });
  }

  /* 调试/单测入口：直接吃二维数组 */
  function parseGrid(grid, opts) {
    opts = opts || {};
    return parseSheet({ name: opts.sheetName || 'Sheet1', grid: grid, merges: opts.merges }, opts);
  }
  function parseGrids(grids, opts) {
    var sheets = (grids || []).map(function (g, i) {
      if (g && g.grid) return g;
      return { name: (opts && opts.sheetName) || ('Sheet' + (i + 1)), grid: g };
    });
    return parseSheets(sheets, opts || {});
  }

  root.PLImport = {
    version: VERSION,
    parseFile: parseFile,
    parse: parseFile,
    parseWorkbook: parseWorkbook,
    parseSheets: parseSheets,
    parseGrid: parseGrid,
    parseGrids: parseGrids,
    _internals: {
      parseDimsCell: parseDimsCell,
      parseWeightCell: parseWeightCell,
      dimUnitIn: dimUnitIn,
      weightUnitIn: weightUnitIn,
      classifyHeader: classifyHeader,
      findHeader: findHeader,
      resolveUnits: resolveUnits,
      parseSheet: parseSheet
    }
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
