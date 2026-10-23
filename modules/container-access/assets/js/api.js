/* api.js — free open-data clients (Nominatim, Overpass, Open-Meteo) */
(function(){
  var NOMINATIM = "https://nominatim.openstreetmap.org";
  var OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  var ELEVATION = "https://api.open-meteo.com/v1/elevation";
  var PHOTON = "https://photon.komoot.io";
  var PHOTON_BBOX = "112,-45,154,-9";
  var cache = new Map();
  var CACHE_TTL = 10 * 60 * 1000;
  var nomLast = 0, overLast = 0;

  function nowIso(){ return new Date().toISOString(); }

  function cached(key){
    var hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL) { cache.delete(key); return null; }
    return hit.value;
  }
  function put(key, value){ cache.set(key, { at: Date.now(), value: value }); return value; }

  function wait(ms){ return new Promise(function(res){ setTimeout(res, ms); }); }

  async function throttleNom(){
    var t = Date.now();
    var delta = t - nomLast;
    if (delta < 1200) await wait(1200 - delta);
    nomLast = Date.now();
  }
  async function throttleOver(){
    var t = Date.now();
    var delta = t - overLast;
    if (delta < 2500) await wait(2500 - delta);
    overLast = Date.now();
  }

  async function fetchJSON(url, opts, timeoutMs){
    var ctrl = new AbortController();
    var timer = setTimeout(function(){ ctrl.abort(); }, timeoutMs || 22000);
    try {
      var res = await fetch(url, Object.assign({ signal: ctrl.signal, mode: "cors", credentials: "omit" }, opts || {}));
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function stateCodeFromName(name){
    var map = { "New South Wales": "NSW", "Victoria": "VIC", "Queensland": "QLD", "South Australia": "SA", "Western Australia": "WA", "Tasmania": "TAS", "Northern Territory": "NT", "Australian Capital Territory": "ACT", "NSW": "NSW", "VIC": "VIC", "QLD": "QLD", "SA": "SA", "WA": "WA", "TAS": "TAS", "NT": "NT", "ACT": "ACT" };
    return map[name] || "";
  }

  function cleanAddrPart(s){ return s ? String(s).trim() : ""; }

  function normalizePlace(r){
    var a = r.address || {};
    var state = "";
    if (a["ISO3166-2-lvl4"]) state = String(a["ISO3166-2-lvl4"]).split("-")[1] || "";
    if (!state) state = stateCodeFromName(a.state || "");
    var road = a.road || a.pedestrian || a.footway || a.cycleway || a.path || "";
    var suburb = a.suburb || a.neighbourhood || a.city_district || a.town || a.village || a.hamlet || a.city || "";
    var title = (a.house_number ? a.house_number + " " : "") + (road || r.name || r.display_name.split(",")[0]);
    return {
      placeId: r.place_id,
      display: r.display_name,
      title: title,
      road: road,
      suburb: cleanAddrPart(suburb),
      state: state,
      stateName: cleanAddrPart(a.state || ""),
      postcode: cleanAddrPart(a.postcode || ""),
      houseNumber: cleanAddrPart(a.house_number || ""),
      tags: r.extratags || {},
      osmCategory: r.category || "",
      osmPlaceType: r.type || "",
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      raw: r
    };
  }

  function normalizePhoton(feature){
    if (!feature || !feature.geometry || !feature.geometry.coordinates) return null;
    var p = feature.properties || {};
    var coords = feature.geometry.coordinates;
    var road = p.street || p.name || "";
    var title = (p.housenumber ? p.housenumber + " " : "") + road;
    var state = stateCodeFromName(p.state || "");
    return {
      placeId: "photon:" + (p.osm_type || "") + (p.osm_id || ""),
      display: [title, p.city || p.district, p.state, p.postcode, p.country].filter(Boolean).join(", "),
      title: title || p.name || "Pinned location",
      road: road, suburb: p.city || p.district || p.locality || "",
      state: state, stateName: p.state || "", postcode: p.postcode || "",
      houseNumber: p.housenumber || "", tags: {},
      osmCategory: p.osm_key || "", osmPlaceType: p.osm_value || "",
      lat: coords[1], lon: coords[0], source: "photon"
    };
  }

  async function photonSearch(q, limit){
    var url = PHOTON + "/api/?q=" + encodeURIComponent(q) + "&limit=" + (limit || 6) + "&lang=en&bbox=" + PHOTON_BBOX;
    var data = await fetchJSON(url, null, 16000);
    return ((data && data.features) || []).map(normalizePhoton).filter(Boolean);
  }

  async function photonReverse(lat, lon){
    var url = PHOTON + "/reverse?lat=" + lat + "&lon=" + lon + "&lang=en&limit=1";
    var data = await fetchJSON(url, null, 16000);
    var list = ((data && data.features) || []).map(normalizePhoton).filter(Boolean);
    return list[0] || null;
  }

  async function searchAddress(query, limit){
    var q = cleanAddrPart(query);
    if (q.length < 4) return [];
    var key = "search:" + q.toLowerCase() + ":" + (limit || 6);
    var hit = cached(key);
    if (hit && hit.length) return hit;
    var list = [];
    try {
      await throttleNom();
      var url = NOMINATIM + "/search?format=jsonv2&addressdetails=1&countrycodes=au&limit=" + (limit || 6) +
        "&extratags=1&accept-language=en&q=" + encodeURIComponent(q);
      var data = await fetchJSON(url, { headers: { "Accept": "application/json" } }, 15000);
      list = (data || []).filter(function(r){ return r && r.lat && r.lon; }).map(normalizePlace);
    } catch (e) { list = []; }
    if (!list.length){
      try { list = await photonSearch(q, limit || 6); } catch (e) { list = []; }
    }
    return put(key, list);
  }

  async function reverse(lat, lon){
    var key = "rev:" + lat.toFixed(5) + "," + lon.toFixed(5);
    var hit = cached(key);
    if (hit) return hit;
    try {
      await throttleNom();
      var url = NOMINATIM + "/reverse?format=jsonv2&addressdetails=1&extratags=1&zoom=18&accept-language=en&lat=" + lat + "&lon=" + lon;
      var data = await fetchJSON(url, { headers: { "Accept": "application/json" } }, 15000);
      if (data && !data.error) return put(key, normalizePlace(data));
    } catch (e) {}
    var rev = await photonReverse(lat, lon);
    if (!rev) throw new Error("No address at this location");
    return put(key, rev);
  }

  function parseMeters(v){
    if (v === undefined || v === null) return null;
    var s = String(v).trim().toLowerCase().replace(",", ".");
    var m = s.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (!m) return null;
    var n = parseFloat(m[1]);
    if (isNaN(n)) return null;
    if (s.indexOf("ft") >= 0 || s.indexOf("'") >= 0) return n * 0.3048;
    return n;
  }
  function parseTonnes(v){
    if (v === undefined || v === null) return null;
    var m = String(v).match(/([0-9]+(?:\.[0-9]+)?)/);
    if (!m) return null;
    var n = parseFloat(m[1]);
    if (isNaN(n)) return null;
    return n;
  }

  function haversine(aLat, aLon, bLat, bLon){
    var R = 6371000;
    var p1 = aLat * Math.PI / 180, p2 = bLat * Math.PI / 180;
    var dp = (bLat - aLat) * Math.PI / 180, dl = (bLon - aLon) * Math.PI / 180;
    var s = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function nearestSegment(lat, lon, nodes){
    var best = { dist: Infinity, i: 0, t: 0 };
    var cosLat = Math.cos(lat * Math.PI / 180);
    function toXY(la, lo){ return { x: lon * 111320 * cosLat, y: la * 110540 }; }
    var p = toXY(lat, lon);
    for (var i = 0; i < nodes.length - 1; i++){
      var a = toXY(nodes[i].lat, nodes[i].lon);
      var b = toXY(nodes[i + 1].lat, nodes[i + 1].lon);
      var dx = b.x - a.x, dy = b.y - a.y;
      var len2 = dx * dx + dy * dy;
      var t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      var cx = a.x + t * dx, cy = a.y + t * dy;
      var d = Math.sqrt((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy));
      if (d < best.dist) best = { dist: d, i: i, t: t, cx: cx, cy: cy };
    }
    return best;
  }

  function pointToWayDistance(lat, lon, nodes){
    if (!nodes || nodes.length < 2) return null;
    var seg = nearestSegment(lat, lon, nodes);
    return seg.dist;
  }

  function cumulativeLengths(nodes){
    var cum = [0];
    for (var i = 1; i < nodes.length; i++){
      cum.push(cum[i - 1] + haversine(nodes[i - 1].lat, nodes[i - 1].lon, nodes[i].lat, nodes[i].lon));
    }
    return cum;
  }

  function interpolatePoint(nodes, cum, target){
    if (target <= 0) return nodes[0];
    if (target >= cum[cum.length - 1]) return nodes[nodes.length - 1];
    for (var i = 1; i < cum.length; i++){
      if (cum[i] >= target){
        var segLen = cum[i] - cum[i - 1];
        var t = segLen === 0 ? 0 : (target - cum[i - 1]) / segLen;
        return { lat: nodes[i - 1].lat + t * (nodes[i].lat - nodes[i - 1].lat), lon: nodes[i - 1].lon + t * (nodes[i].lon - nodes[i - 1].lon) };
      }
    }
    return nodes[nodes.length - 1];
  }

  function estimateWidth(tags, klass){
    var w = parseMeters(tags.width);
    if (w && w > 2 && w < 60) return { value: Math.round(w * 10) / 10, source: "tagged" };
    var lanes = parseInt(tags.lanes, 10);
    if (lanes && lanes > 0) return { value: Math.round(lanes * 3.2 * 10) / 10, source: "lanes" };
    var defaults = { motorway: 10.5, trunk: 10.5, primary: 9.0, secondary: 8.0, tertiary: 7.2, unclassified: 6.4, residential: 6.2, living_street: 5.5, service: 4.5, track: 3.2 };
    return { value: defaults[klass] || 6.0, source: "estimated" };
  }

  function overpassQuery(lat, lon){
    var p = lat.toFixed(6) + "," + lon.toFixed(6);
    return "[out:json][timeout:30];(" +
      "way(around:80," + p + ")[highway];" +
      "way(around:700," + p + ")[highway][maxheight];" +
      "way(around:700," + p + ")[maxweight];" +
      "way(around:150," + p + ")[power~\"^(line|minor_line|cable)$\"];" +
      "node(around:150," + p + ")[power~\"^(pole|tower)$\"];" +
      "way(around:150," + p + ")[noexit=yes];" +
      ");out geom tags 150;";
  }

  async function overpassRaw(query){
    var body = "data=" + encodeURIComponent(query);
    var lastErr = null;
    for (var i = 0; i < OVERPASS.length; i++){
      try {
        await throttleOver();
        var data = await fetchJSON(OVERPASS[i], { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body }, 32000);
        if (data && data.elements) return data;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("Overpass unavailable");
  }

  async function overpassFetch(lat, lon){
    return overpassRaw(overpassQuery(lat, lon));
  }

  function quickQuery(lat, lon){
    var p = lat.toFixed(6) + "," + lon.toFixed(6);
    return "[out:json][timeout:20];(" +
      "way(around:60," + p + ")[highway];" +
      "way(around:600," + p + ")[highway][maxheight];" +
      "way(around:600," + p + ")[maxweight];" +
      ");out geom tags 70;";
  }

  async function quickAnalyze(lat, lon){
    var data = await overpassRaw(quickQuery(lat, lon));
    var elements = data.elements || [];
    var roads = elements.filter(isRoadWay);
    var nearestRoad = null, nearestDist = Infinity;
    roads.forEach(function(w){
      var d = pointToWayDistance(lat, lon, w.geometry);
      if (d !== null && d < nearestDist){ nearestDist = d; nearestRoad = w; }
    });
    var tags = (nearestRoad && nearestRoad.tags) || {};
    var klass = tags.highway || "unknown";
    var width = estimateWidth(tags, klass);
    var roadName = tags.name || tags.ref || "Unnamed road";
    var surface = tags.surface || "unknown";
    var unpaved = /unpaved|gravel|dirt|ground|grass|compacted|fine_gravel|pebblestone|earth|mud|sand/i.test(surface);
    var lowStructures = [], massLimits = [];
    elements.forEach(function(el){
      if (el === nearestRoad || !el.tags) return;
      var h = parseMeters(el.tags.maxheight);
      var wgt = parseTonnes(el.tags.maxweight);
      var d = distanceToElement(lat, lon, el);
      var name = el.tags.name || el.tags.ref || (el.tags.bridge ? "Bridge" : "Structure");
      if (h !== null && h < 6) lowStructures.push({ name: name, height: h, distance: d !== null ? Math.round(d) : null });
      if (wgt !== null && wgt < 60) massLimits.push({ name: name, weight: wgt, distance: d !== null ? Math.round(d) : null });
    });
    lowStructures.sort(function(a, b){ return (a.distance || 9999) - (b.distance || 9999); });
    massLimits.sort(function(a, b){ return (a.distance || 9999) - (b.distance || 9999); });
    var noexit = /yes|true/i.test(tags.noexit || "");
    var privateAccess = /private|no/i.test(tags.access || "");
    var hgvRestricted = /no|destination|delivery|private/i.test(tags.hgv || "");
    var maxheight = parseMeters(tags.maxheight);
    var maxweight = parseTonnes(tags.maxweight);
    var warnings = [];
    if (lowStructures.length) warnings.push({ code: "warnBridge", severity: "warn", vars: { name: lowStructures[0].name, h: lowStructures[0].height + " m" } });
    if (massLimits.length) warnings.push({ code: "warnWeight", severity: "warn", vars: { name: massLimits[0].name, v: massLimits[0].weight + " t" } });
    if (width.value < 5.6) warnings.push({ code: "warnNarrow", severity: "warn", vars: {} });
    if (noexit) warnings.push({ code: "warnDeadEnd", severity: "warn", vars: {} });
    if (privateAccess) warnings.push({ code: "warnPrivate", severity: "warn", vars: {} });
    if (hgvRestricted) warnings.push({ code: "warnNoHvg", severity: "warn", vars: {} });
    if (unpaved) warnings.push({ code: "warnUnpaved", severity: "warn", vars: {} });
    if (maxheight !== null && maxheight < 5.0) warnings.push({ code: "warnBridge", severity: "bad", vars: { name: roadName, h: tags.maxheight } });
    if (maxweight !== null && maxweight < 33) warnings.push({ code: "warnWeight", severity: "warn", vars: { name: roadName, v: tags.maxweight } });
    return {
      lat: lat, lon: lon, quick: true,
      road: { name: roadName, klass: klass, laneText: tags.lanes || null, width: width.value, widthSource: width.source, speed: tags.maxspeed || null, surface: surface, oneway: /yes|true/.test(tags.oneway || ""), noexit: noexit, tags: tags, distance: nearestDist !== Infinity ? Math.round(nearestDist) : null },
      maxheight: maxheight, maxweight: maxweight, maxwidth: parseMeters(tags.maxwidth), maxlength: parseMeters(tags.maxlength),
      restrictions: [], lowStructures: lowStructures.slice(0, 3), massLimits: massLimits.slice(0, 3),
      powerlines: { count: 0, min: null, voltage: null }, slope: null, warnings: warnings,
      osmTimestamp: (data.osm3s && data.osm3s.timestamp_osm_base) || null, fetchedAt: Date.now(), demo: false
    };
  }

  async function elevation(points){
    if (!points.length) return null;
    var lats = points.map(function(p){ return p.lat.toFixed(6); }).join(",");
    var lons = points.map(function(p){ return p.lon.toFixed(6); }).join(",");
    var url = ELEVATION + "?latitude=" + lats + "&longitude=" + lons;
    var data = await fetchJSON(url, null, 16000);
    if (!data || !data.elevation) return null;
    return data.elevation;
  }

  var VEHICLE_CLASSES = { motorway: 1, trunk: 1, primary: 1, secondary: 1, tertiary: 1, unclassified: 1, residential: 1, living_street: 1, service: 1, road: 1, track: 1 };
  function isVehicleClass(klass){ return !!VEHICLE_CLASSES[klass]; }
  function isRoadWay(el){
    return el.type === "way" && el.tags && isVehicleClass(el.tags.highway) && el.geometry && el.geometry.length > 1;
  }

  function distanceToElement(lat, lon, el){
    if (el.type === "node" && el.lat && el.lon) return haversine(lat, lon, el.lat, el.lon);
    if (el.center) return haversine(lat, lon, el.center.lat, el.center.lon);
    if (el.geometry) return pointToWayDistance(lat, lon, el.geometry);
    return null;
  }

  async function analyze(lat, lon, opts){
    var data = await overpassFetch(lat, lon);
    var elements = data.elements || [];
    var roads = elements.filter(isRoadWay);
    var nearestRoad = null, nearestDist = Infinity;
    roads.forEach(function(w){
      var d = pointToWayDistance(lat, lon, w.geometry);
      if (d !== null && d < nearestDist){ nearestDist = d; nearestRoad = w; }
    });
    var tags = (nearestRoad && nearestRoad.tags) || {};
    var klass = tags.highway || "unknown";
    var width = estimateWidth(tags, klass);
    var roadName = tags.name || tags.ref || "Unnamed road";
    var surface = tags.surface || "unknown";
    var unpaved = /unpaved|gravel|dirt|ground|grass|compacted|fine_gravel|pebblestone|earth|mud|sand/i.test(surface);
    var restrictions = [];
    var lowStructures = [], massLimits = [];
    elements.forEach(function(el){
      if (el === nearestRoad || !el.tags) return;
      var h = parseMeters(el.tags.maxheight);
      var wgt = parseTonnes(el.tags.maxweight);
      var d = distanceToElement(lat, lon, el);
      var name = el.tags.name || el.tags.ref || (el.tags.bridge ? "Bridge" : "Structure");
      if (h !== null && h < 6){
        lowStructures.push({ name: name, height: h, distance: d !== null ? Math.round(d) : null, id: el.id });
      }
      if (wgt !== null && wgt < 60){
        massLimits.push({ name: name, weight: wgt, distance: d !== null ? Math.round(d) : null, id: el.id });
      }
    });
    lowStructures.sort(function(a, b){ return (a.distance || 9999) - (b.distance || 9999); });
    massLimits.sort(function(a, b){ return (a.distance || 9999) - (b.distance || 9999); });
    var nearLow = lowStructures.filter(function(x){ return x.distance !== null && x.distance < 900; }).slice(0, 3);
    var nearMass = massLimits.filter(function(x){ return x.distance !== null && x.distance < 900; }).slice(0, 3);

    var power = { count: 0, min: null, voltage: null };
    elements.forEach(function(el){
      if (!el.tags) return;
      if (/^(line|minor_line|cable)$/.test(el.tags.power || "") || /^(pole|tower)$/.test(el.tags.power || "")){
        var d = distanceToElement(lat, lon, el);
        if (d !== null){
          power.count++;
          if (power.min === null || d < power.min){
            power.min = d;
            power.voltage = el.tags.voltage || null;
          }
        }
      }
    });
    if (power.min !== null) power.min = Math.round(power.min * 10) / 10;

    var noexit = /yes|true/i.test(tags.noexit || "") || roads.some(function(w){ return w.tags && /yes/.test(w.tags.noexit || ""); });
    var privateAccess = /private|no/i.test(tags.access || "") || klass === "service";
    var hgvRestricted = /no|destination|delivery|private/i.test(tags.hgv || "") || /no|destination/i.test(tags.access || "");
    var maxheight = parseMeters(tags.maxheight);
    var maxweight = parseTonnes(tags.maxweight);
    var maxwidth = parseMeters(tags.maxwidth);
    var maxlength = parseMeters(tags.maxlength);

    var warnings = [];
    if (!nearestRoad) warnings.push({ code: "warnNoRoad", severity: "bad", vars: {} });
    if (power.min !== null && power.min < 30) warnings.push({ code: "warnClose", severity: power.min < 5 ? "bad" : "warn", vars: { d: power.min } });
    if (nearLow.length) warnings.push({ code: "warnBridge", severity: "warn", vars: { name: nearLow[0].name, h: nearLow[0].height + " m" } });
    if (nearMass.length) warnings.push({ code: "warnWeight", severity: "warn", vars: { name: nearMass[0].name, v: nearMass[0].weight + " t" } });
    if (width.value < 5.6) warnings.push({ code: "warnNarrow", severity: "warn", vars: {} });
    if (noexit) warnings.push({ code: "warnDeadEnd", severity: "warn", vars: {} });
    if (privateAccess) warnings.push({ code: "warnPrivate", severity: "warn", vars: {} });
    if (hgvRestricted) warnings.push({ code: "warnNoHvg", severity: "warn", vars: {} });
    if (unpaved) warnings.push({ code: "warnUnpaved", severity: "warn", vars: {} });
    if (maxheight !== null && maxheight < 5.0) warnings.push({ code: "warnBridge", severity: "bad", vars: { name: roadName, h: tags.maxheight } });
    if (maxweight !== null && maxweight < 33) warnings.push({ code: "warnWeight", severity: "warn", vars: { name: roadName, v: tags.maxweight } });

    var auto = {
      lat: lat, lon: lon,
      road: {
        name: roadName, klass: klass, laneText: tags.lanes || null,
        width: width.value, widthSource: width.source,
        speed: tags.maxspeed || null, surface: surface, oneway: /yes|true/.test(tags.oneway || ""),
        noexit: noexit, tags: tags, distance: nearestDist !== Infinity ? Math.round(nearestDist) : null
      },
      maxheight: maxheight, maxweight: maxweight, maxwidth: maxwidth, maxlength: maxlength,
      restrictions: restrictions,
      lowStructures: nearLow,
      massLimits: nearMass,
      powerlines: power,
      slope: null,
      warnings: warnings,
      osmTimestamp: (data.osm3s && data.osm3s.timestamp_osm_base) || null,
      fetchedAt: Date.now(),
      demo: false
    };

    // street grade from nearest road geometry
    try {
      if (nearestRoad && nearestRoad.geometry && nearestRoad.geometry.length > 1){
        var nodes = nearestRoad.geometry;
        var cum = cumulativeLengths(nodes);
        var seg = nearestSegment(lat, lon, nodes);
        var along = cum[seg.i] + seg.t * (cum[seg.i + 1] - cum[seg.i]);
        var pA = interpolatePoint(nodes, cum, along - 30);
        var pB = interpolatePoint(nodes, cum, along + 30);
        var p0 = interpolatePoint(nodes, cum, along);
        var dA = haversine(p0.lat, p0.lon, pA.lat, pA.lon);
        var dB = haversine(p0.lat, p0.lon, pB.lat, pB.lon);
        var elevs = await elevation([p0, pA, pB]);
        if (elevs && elevs.length === 3){
          var g1 = dA > 8 ? Math.abs(elevs[1] - elevs[0]) / dA * 100 : 0;
          var g2 = dB > 8 ? Math.abs(elevs[2] - elevs[0]) / dB * 100 : 0;
          auto.slope = { pct: Math.round(Math.max(g1, g2) * 10) / 10, sampleA: Math.round(dA), sampleB: Math.round(dB) };
        }
      }
    } catch (e) { /* elevation is optional */ }

    return auto;
  }

  async function roadInfo(place){
    if (!place) return null;
    var tags = place.tags || {};
    var klass = tags.highway || (place.osmCategory === "highway" ? place.osmPlaceType : "") || "";
    var name = place.road || tags.name || "";
    if (!klass && name){
      var q = [name, place.suburb, place.state, place.postcode].filter(Boolean).join(" ");
      try {
        var results = await searchAddress(q, 5);
        for (var i = 0; i < results.length; i++){
          var cand = results[i];
          var cTags = cand.tags || {};
          var cKlass = cTags.highway || (cand.osmCategory === "highway" ? cand.osmPlaceType : "") || "";
          if (cKlass){ tags = cTags; klass = cKlass; name = (cand.title || cTags.name || name).replace(/^[0-9]+\s+/, ""); break; }
        }
      } catch (e) {}
    }
    if (!klass) return null;
    var width = estimateWidth(tags, klass);
    return {
      source: "nominatim",
      pedestrian: !isVehicleClass(klass),
      road: {
        name: name || tags.name || "Road", klass: klass, laneText: tags.lanes || null,
        width: width.value, widthSource: width.source, speed: tags.maxspeed || null,
        surface: tags.surface || "unknown", oneway: /yes|true/.test(tags.oneway || ""),
        noexit: /yes|true/.test(tags.noexit || ""), tags: tags, distance: 0
      }
    };
  }

  async function health(){
    var out = { nominatim: false, photon: false, at: nowIso() };
    try {
      var r = await fetchJSON(NOMINATIM + "/search?format=jsonv2&countrycodes=au&limit=1&q=Sydney", { headers: { "Accept": "application/json" } }, 8000);
      out.nominatim = Array.isArray(r);
    } catch (e) {}
    if (!out.nominatim){
      try {
        var p = await fetchJSON(PHOTON + "/api/?q=Sydney&limit=1&lang=en&bbox=" + PHOTON_BBOX, null, 8000);
        out.photon = !!(p && p.features && p.features.length);
      } catch (e) {}
    }
    out.online = out.nominatim || out.photon;
    return out;
  }

  window.API = {
    searchAddress: searchAddress,
    reverse: reverse,
    analyze: analyze,
    quickAnalyze: quickAnalyze,
    roadInfo: roadInfo,
    isVehicleClass: isVehicleClass,
    health: health,
    parseMeters: parseMeters,
    parseTonnes: parseTonnes,
    haversine: haversine,
    clearCache: function(){ cache.clear(); }
  };
})();
