/* ============================================================================
 * 地址通行快速核验（AccessCheck v2）
 *   数据链路（全部免费、无需 API Key，已实测可用）：
 *     ① 地理编码：Photon (photon.komoot.io) → 备用 Nominatim
 *     ② 路网/用地：Overpass 镜像 overpass.openstreetmap.fr → osm.ch → kumi → private.coffee
 *   判定：街宽 / 限高 / 限宽 / 单行 / 桥隧 / 主干道 / 用地性质(住宅·商业·工业) / 电线杆
 *   输出：能进 / 有条件 / 不能进 / 数据不足 + 理由 + 街景链接 + 现场确认清单
 * ==========================================================================*/
(function () {
  'use strict';
  var PHOTON = 'https://photon.komoot.io/api/';
  var NOM = 'https://nominatim.openstreetmap.org/search';
  var OV = [
    'https://overpass.openstreetmap.fr/api/interpreter',
    'https://overpass.osm.ch/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass-api.de/api/interpreter'
  ];
  var CTN = {
    '20GP': { label: '20GP', truckW: 2.5, truckH: 4.0, needW: 5.0, turn: '转弯半径要求较低' },
    '40GP': { label: '40GP', truckW: 2.5, truckH: 4.15, needW: 5.5, turn: '12.19m 长柜，需转弯与倒车空间' },
    '40HC': { label: '40HC', truckW: 2.5, truckH: 4.4, needW: 5.5, turn: '12.19m 高柜，净空与转弯要求最高' }
  };
  function toNum(v) { var n = parseFloat(String(v)); return isFinite(n) ? n : null; }
  function toMeters(v) {
    if (v == null) return null;
    var s = String(v).trim().toLowerCase();
    var m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*(m|ft|')?/);
    if (!m) return null;
    var n = parseFloat(m[1]);
    if (/ft|'/.test(m[2] || '')) n *= 0.3048;
    return n;
  }
  function fetchJson(url, opt, ms) {
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var tm = setTimeout(function () { if (ctl) try { ctl.abort(); } catch (e) {} }, ms || 18000);
    var o = Object.assign({}, opt || {});
    o.signal = ctl ? ctl.signal : undefined;
    return fetch(url, o).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (t) { clearTimeout(tm); try { return JSON.parse(t); } catch (e) { throw new Error('返回数据格式异常'); } },
      function (e) { clearTimeout(tm); throw e; });
  }
  /* ---------- ① 地理编码：Photon（主）→ Nominatim（备） ---------- */
  /* 同源服务端代理优先（本地版：绕开 CORS 与 UA 限制，最稳） */
  function serverGeocode(address) {
    return fetchJson('api/geo/geocode?q=' + encodeURIComponent(address), {}, 20000).then(function (r) {
      if (!r || !r.ok) throw new Error(r && r.error ? r.error : 'SERVER_GEO_FAIL');
      return { lat: r.lat, lon: r.lon, display: r.display, street: r.street, city: r.city, state: r.state, postcode: r.postcode, osmKey: r.osmKey, osmValue: r.osmValue, provider: '本地服务端/' + (r.provider || '') };
    });
  }
  function serverRoads(lat, lon) {
    return fetchJson('api/geo/roads?lat=' + lat + '&lon=' + lon, {}, 26000).then(function (r) {
      if (!r || !r.ok) throw new Error(r && r.error ? r.error : 'SERVER_ROADS_FAIL');
      return { elements: r.elements || [], provider: r.provider || 'server' };
    });
  }
  function geocode(address) {
    return serverGeocode(address).catch(function () { return browserGeocode(address); });
  }
  function browserGeocode(address) {
    return fetchJson(PHOTON + '?limit=1&lang=en&q=' + encodeURIComponent(address), {}, 14000).then(function (j) {
      var f = j && j.features && j.features[0];
      if (!f) throw new Error('PHOTON_EMPTY');
      var p = f.properties || {}, g = f.geometry || {};
      var c = g.coordinates || [];
      if (!c.length) throw new Error('PHOTON_EMPTY');
      return {
        lat: c[1], lon: c[0],
        display: [p.name, p.street, p.housenumber, p.district, p.city, p.state, p.postcode, p.country].filter(Boolean).join(', '),
        street: p.street || p.name || '',
        city: p.city || p.locality || p.district || '',
        state: p.state || '', postcode: p.postcode || '',
        osmKey: p.osm_key || '', osmValue: p.osm_value || '',
        provider: 'Photon/OSM'
      };
    }).catch(function () {
      return fetchJson(NOM + '?format=jsonv2&addressdetails=1&limit=1&countrycodes=au&q=' + encodeURIComponent(address), { headers: { 'Accept': 'application/json' } }, 16000).then(function (list) {
        if (!list || !list.length) throw new Error('没找到这个地址，请检查拼写，或加上 suburb / 州 / 邮编');
        var r = list[0], a = r.address || {};
        return {
          lat: parseFloat(r.lat), lon: parseFloat(r.lon), display: r.display_name,
          street: a.road || r.name || '', city: a.city || a.town || a.suburb || '',
          state: a.state || '', postcode: a.postcode || '',
          osmKey: r.class || '', osmValue: r.type || '', provider: 'Nominatim/OSM'
        };
      });
    });
  }
  /* ---------- ② 路网与用地：Overpass 多镜像 ---------- */
  function roads(lat, lon) {
    return serverRoads(lat, lon).catch(function () { return browserRoads(lat, lon); });
  }
  function browserRoads(lat, lon) {
    var q = '[out:json][timeout:25];(' +
      'way(around:45,' + lat + ',' + lon + ')[highway];' +
      'way(around:200,' + lat + ',' + lon + ')[landuse];' +
      'way(around:200,' + lat + ',' + lon + ')[building];' +
      'node(around:200,' + lat + ',' + lon + ')[power=pole];' +
      'way(around:80,' + lat + ',' + lon + ')[barrier=gate];' +
      ');out tags center 60;';
    function tryOne(i) {
      if (i >= OV.length) return Promise.reject(new Error('所有路网数据源都不可用（网络或代理受限）'));
      return fetchJson(OV[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q)
      }, 22000).then(function (j) {
        var els = (j && j.elements) || [];
        if (!els.length && i < OV.length - 1) return tryOne(i + 1);
        return { elements: els, provider: OV[i].replace('https://', '').split('/')[0] };
      }).catch(function () { return tryOne(i + 1); });
    }
    return tryOne(0);
  }
  /* ---------- ③ 判定 ---------- */
  function analyze(geo, ov, ctnId) {
    var T = CTN[ctnId] || CTN['40GP'];
    var els = (ov && ov.elements) || [];
    var hw = null, hws = [], landuse = '', building = '', poles = 0, gates = 0;
    els.forEach(function (el) {
      var t = el.tags || {};
      if (t.highway) { hws.push(t); if (!hw && t.name) hw = t; }
      if (!landuse && t.landuse) landuse = t.landuse;
      if (!building && t.building) building = t.building;
      if (t.power === 'pole') poles++;
      if (t.barrier === 'gate') gates++;
    });
    if (!hw && hws.length) hw = hws[0];
    var tags = hw || {};
    var reasons = [], warn = [], unknown = [];
    var width = toMeters(tags.width);
    var lanes = toNum(tags.lanes);
    var widthFrom = '', widthEst = false, confidence = 'high';
    /* 无 width / lanes 时，按澳洲道路等级的典型车道宽推断（标注为估算） */
    var CLASS_W = { motorway: 12, trunk: 10.5, primary: 9.5, secondary: 8, tertiary: 7, residential: 5.5, living_street: 5, service: 4.5, unclassified: 5.5, pedestrian: 6, footway: 3, track: 4.5 };
    if (width != null) { widthFrom = 'OSM width 标签'; confidence = 'high'; }
    else if (lanes) { width = lanes * 3.2; widthFrom = lanes + ' 车道 × 3.2m 估算'; confidence = 'medium'; }
    else if (tags.highway && CLASS_W[tags.highway]) { width = CLASS_W[tags.highway]; widthFrom = '按道路等级「' + (tags.highway) + '」典型宽度估算'; widthEst = true; confidence = 'low'; }
    else { unknown.push('街宽（无任何道路宽度线索，需现场实测）'); confidence = 'low'; }
    var maxH = toMeters(tags.maxheight), maxW = toMeters(tags.maxwidth);
    if (maxH != null) {
      if (maxH < T.truckH + 0.3) reasons.push('限高 ' + maxH + 'm，低于 ' + T.label + ' 柜车高约 ' + T.truckH + 'm');
      else warn.push('路段有限高 ' + maxH + 'm（高于柜车 ' + T.truckH + 'm，仍建议复核）');
    }
    if (maxW != null && maxW < T.truckW + 0.3) reasons.push('限宽 ' + maxW + 'm，低于柜车宽 ' + T.truckW + 'm');
    var narrow = false;
    if (width != null) {
      if (width < T.needW) { reasons.push('街宽约 ' + width.toFixed(1) + 'm（' + widthFrom + '），低于 ' + T.label + ' 建议最小 ' + T.needW + 'm'); narrow = true; }
      else if (width < T.needW + 1.5) warn.push('街宽约 ' + width.toFixed(1) + 'm（' + widthFrom + '），偏窄，需慢行会车或占道作业');
      else reasons.push('街宽约 ' + width.toFixed(1) + 'm（' + widthFrom + '），通行余量充足');
    }
    var HW_ZH = { motorway: '高速公路', trunk: '快速路', primary: '主干道', secondary: '次干道', tertiary: '支路', residential: '住宅区道路', service: '服务通道', living_street: '生活街道', unclassified: '未分级道路', pedestrian: '步行街', footway: '人行道', track: '土路' };
    var hwZh = HW_ZH[tags.highway] || tags.highway || '';
    if (tags.highway === 'pedestrian' || tags.highway === 'footway') warn.push('该处为步行街/人行道（' + hwZh + '），货车可能禁行，需向市政确认');
    if (tags.motorcar === 'service' || tags.motorcar === 'private') warn.push('机动车通行标识为 ' + tags.motorcar + '，可能仅限服务车辆');
    if (tags.oneway === 'yes') warn.push('单行道：需确认倒车/掉头空间');
    if (tags.bridge === 'yes') warn.push('该路段有桥：注意限重与限高');
    if (tags.tunnel === 'yes') warn.push('该路段有隧道：净空需复核');
    if (tags.maxweight != null) warn.push('限重标识 ' + tags.maxweight + '（柜车总重常见 30~40t 级）');
    if (tags.surface) warn.push('路面结构：' + tags.surface);
    if (tags.incline && Math.abs(toNum(tags.incline) || 0) >= 8) warn.push('坡度标识 ' + tags.incline + '°，重载上下坡风险');
    /* 用地性质 */
    var useZh = '', useKey = '';
    var blob = (landuse + ' ' + building + ' ' + geo.osmKey + ' ' + geo.osmValue).toLowerCase();
    if (/industrial|warehouse|depot/.test(blob)) { useZh = '工业用地'; useKey = 'industrial'; }
    else if (/commercial|retail|office|shop/.test(blob)) { useZh = '商业用地'; useKey = 'commercial'; }
    else if (/residential|house|apartment|detached|dwelling/.test(blob)) { useZh = '住宅用地'; useKey = 'residential'; }
    else if (landuse) { useZh = '用地标签 ' + landuse; useKey = 'other'; }
    else { useZh = '未标注'; unknown.push('用地性质（住宅/商业/工业）'); }
    if (useKey === 'residential') warn.push('住宅区：多为窄街 + 路边停车，落柜常需临时占道许可，建议先问客户车道/停车情况');
    else if (useKey === 'commercial') warn.push('商业区：注意卸货时段、限停与商家门前空间');
    else if (useKey === 'industrial') reasons.push('工业用地：通常通道与装卸条件较好');
    if (poles > 0) warn.push('周边约 ' + poles + ' 根电线杆：确认架空线净空与吊装安全距离');
    if (gates > 0) warn.push('附近有 ' + gates + ' 处大门/闸门：确认门宽与开启方式');
    /* 结论 */
    var verdict;
    var hardFail = reasons.some(function (r) { return /限高|限宽|低于 .*建议最小/.test(r); });
    if (hardFail) verdict = 'no';
    else if (!tags.highway) verdict = 'unknown';         /* 完全没找到道路数据才说数据不足 */
    else if (warn.length >= 1) verdict = 'conditional';  /* 有任一风险 → 有条件能进 */
    else verdict = 'yes';
    /* 澳洲车队匹配 + 推荐派送方式（必须与结论一致） */
    var canSemi = (width != null && width >= T.needW);
    var canSide = (width != null && width >= (T.truckW + 4.0));
    var canRigid = (width != null && width >= 3.2);
    var recommend;
    if (canSemi) recommend = T.label + " + 40' 半挂 Trailer（标准派送）";
    else if (canSide) recommend = "Sideloader 侧装（无需倒车/占道）";
    else if (canRigid) recommend = "改 20GP 短柜 + 刚性卡车，或小车驳运（shuttle）到门口";
    else recommend = "不建议整柜直达：需小车驳运/吊装驳运，或改小柜型并现场实测";
    if (tags.oneway === 'yes' && canSemi) recommend += "（单行道，需引导）";
    return {
      recommend: recommend, canSemi: canSemi, canSide: canSide, canRigid: canRigid,
      verdict: verdict, ctn: T.label, ctnNote: T.turn, needW: T.needW, truckH: T.truckH,
      roadName: tags.name || geo.street || '-', roadType: hwZh,
      width: width, widthFrom: widthFrom, lanes: lanes, surface: tags.surface || '',
      maxH: maxH, maxW: maxW, use: useZh, poles: poles,
      reasons: reasons, warn: warn, unknown: unknown,
      provider: 'Photon/Nominatim + ' + (ov && ov.provider ? ov.provider : 'Overpass'),
      confidence: confidence, widthEst: widthEst,
      classWidth: (tags.highway && CLASS_W[tags.highway]) ? CLASS_W[tags.highway] : null
    };
  }
  function run(address, ctn) {
    address = String(address || '').trim();
    if (!address) return Promise.reject(new Error('请输入澳洲地址'));
    return geocode(address).then(function (geo) {
      return roads(geo.lat, geo.lon).then(function (ov) {
        var res = analyze(geo, ov, ctn);
        res.address = geo.display; res.lat = geo.lat; res.lon = geo.lon;
        res.outOfAU = !(geo.lat >= -44 && geo.lat <= -9 && geo.lon >= 112 && geo.lon <= 154);
        res.provider = (geo.provider || '') + ' + ' + (ov.provider || '');
        res.links = {
          street: 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + geo.lat + ',' + geo.lon,
          map: 'https://www.google.com/maps/search/?api=1&query=' + geo.lat + ',' + geo.lon,
          embed: 'https://maps.google.com/maps?q=' + geo.lat + ',' + geo.lon + '&z=18&output=embed',
          embedPano: 'https://maps.google.com/maps?q=' + geo.lat + ',' + geo.lon + '&layer=c&cbll=' + geo.lat + ',' + geo.lon + '&cbp=11,0,0,0,0&region=AU&output=embed',
          embedSat: 'https://maps.google.com/maps?q=' + geo.lat + ',' + geo.lon + '&z=19&t=k&output=embed'
        };
        res.disclaimer = '结论基于 OpenStreetMap 开放数据（' + res.provider + '）自动估算，属于初筛参考，不是实测结论。落柜前必须由客户提供现场照片与实测数据：最窄车行道净宽、大门净宽净高、落柜区长×宽、上方净空、地面承载、是否需占道许可。';
        return res;
      });
    });
  }
  window.AccessCheck = { run: run, CTN: CTN, _analyze: analyze, _geocode: geocode, _roads: roads };
})();
