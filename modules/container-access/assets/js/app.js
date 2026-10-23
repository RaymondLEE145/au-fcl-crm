/* app.js — core application */
(function(){
  var ST = {
    lang: "en",
    address: null,
    auto: null,
    autoError: false,
    size: "40GP",
    method: "auto",
    mass: 24,
    answers: {},
    notes: "",
    result: null,
    methods: [],
    extras: [],
    map: null,
    mapStyle: "street",
    autoFilled: {},
    api: null,
    search: { items: [], active: -1, timer: null, seq: 0, loading: false },
    saved: [],
    draftTimer: null
  };
  var LS_LANG = "ozcac.lang", LS_SAVED = "ozcac.saved", LS_DRAFT = "ozcac.draft";
  var MAX_SAVED = 50;

  function $(id){ return document.getElementById(id); }
  function qs(sel, root){ return (root || document).querySelector(sel); }
  function qsa(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function bi(en, zh){ return window.currentLang === "zh" ? zh : en; }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function escapeHtml(s){
    return String(s === undefined || s === null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function toast(msg, type){
    var wrap = $("toastWrap");
    var el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function(){ el.style.opacity = "0"; el.style.transition = "opacity .3s"; }, 3200);
    setTimeout(function(){ if (el.parentNode) el.parentNode.removeChild(el); }, 3700);
  }
  function debounce(fn, ms){
    var timer = null;
    return function(){
      var args = arguments, ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function(){ fn.apply(ctx, args); }, ms);
    };
  }
  function downloadFile(filename, text, mime){
    var blob = new Blob([text], { type: mime || "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  function roadClassLabel(klass){
    var en = { motorway: "Motorway", trunk: "Trunk road", primary: "Primary road", secondary: "Secondary road", tertiary: "Tertiary road", unclassified: "Local road", residential: "Residential street", living_street: "Living street", service: "Service road", track: "Track", pedestrian: "Pedestrian area", footway: "Footway", path: "Path", cycleway: "Cycleway" };
    var zh = { motorway: "高速公路", trunk: "主干道", primary: "主要道路", secondary: "次干道", tertiary: "三级道路", unclassified: "地方道路", residential: "住宅街道", living_street: "生活街道", service: "内部道路", track: "土路", pedestrian: "步行区", footway: "人行道", path: "小径", cycleway: "自行车道" };
    return (window.currentLang === "zh" ? zh : en)[klass] || klass || "—";
  }
  function sourceLabel(src){
    if (src === "tagged") return bi("tagged width", "地图标注宽度");
    if (src === "lanes") return bi("from lane count", "按车道数估算");
    if (src === "demo") return bi("demo snapshot", "演示快照");
    return bi("estimated", "估算");
  }
  function confLabel(c){
    if (c >= 0.85) return t("verdict.confHigh");
    if (c >= 0.6) return t("verdict.confMed");
    return t("verdict.confLow");
  }
  function fmtTime(ts){
    if (!ts) return "";
    var d = new Date(ts);
    function p(n){ return n < 10 ? "0" + n : "" + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function verdictClass(v){ return { green: "v-green", amber: "v-amber", orange: "v-orange", red: "v-red" }[v] || "v-none"; }
  function savedColor(v){
    return { green: "#22c55e", amber: "#f5b942", orange: "#ff8a3d", red: "#ef4444" }[v] || "#64789a";
  }

  // ---------------- i18n static ----------------
  function applyStaticI18n(){
    qsa("[data-i18n]").forEach(function(el){
      var key = el.getAttribute("data-i18n");
      var val = t(key);
      if (typeof val === "string") el.textContent = val;
    });
    qsa("[data-i18n-placeholder]").forEach(function(el){
      var key = el.getAttribute("data-i18n-placeholder");
      var val = t(key);
      if (typeof val === "string") el.placeholder = val;
    });
    var input = $("addressInput");
    if (input) input.placeholder = t("search.placeholder");
    var note = $("notesInput");
    if (note) note.placeholder = t("notes.placeholder");
    var langLabel = $("langLabel");
    if (langLabel) langLabel.textContent = t("lang");
    document.title = "Container Access AU — " + t("hero.title1") + " " + t("hero.title2").replace("?", "");
    var step1 = qs('[data-step="address"]');
    if (step1){
      var h2 = step1.querySelector("h2"); if (h2) h2.textContent = t("step1.title");
      var p = step1.querySelector(".step-head p"); if (p) p.textContent = t("step1.sub");
    }
    var mapLabel = $("mapStyleLabel");
    if (mapLabel) mapLabel.textContent = ST.mapStyle === "street" ? t("map.satellite") : t("map.street");
  }

  // ---------------- render questions ----------------
  var numMeta = {
    clearRun: { min: 0, max: 200 },
    dropLength: { min: 0, max: 80 },
    dropWidth: { min: 0, max: 30 }
  };
  function questionStepBody(stepId){
    return $("body" + stepId.charAt(0).toUpperCase() + stepId.slice(1));
  }
  function buildQuestion(qid){
    var q = RULES.QUESTIONS[qid];
    var tpl = $("tpl-question");
    var node = tpl.content.firstElementChild.cloneNode(true);
    node.setAttribute("data-qid", qid);
    var labelEl = node.querySelector(".q-label");
    labelEl.textContent = t("q." + qid + ".label");
    if (ST.autoFilled && ST.autoFilled[qid]){
      var autoTag = document.createElement("span");
      autoTag.className = "q-auto";
      autoTag.textContent = bi("AUTO", "自动");
      labelEl.appendChild(autoTag);
    }
    var head = node.querySelector(".q-head");
    var why = document.createElement("button");
    why.type = "button"; why.className = "q-why link-btn"; why.setAttribute("data-why", qid);
    why.textContent = bi("Why?", "为什么问？");
    why.style.fontSize = "10px"; why.style.marginLeft = "auto";
    var wspan = node.querySelector(".q-weight");
    head.insertBefore(why, wspan);
    var help = node.querySelector(".q-help");
    help.textContent = t("q." + qid + ".help");
    var optionsWrap = node.querySelector(".q-options");
    var extra = node.querySelector(".q-extra");
    if (q.type === "number"){
      optionsWrap.style.display = "none";
      extra.classList.add("show");
      var meta = numMeta[qid] || { min: 0, max: 1000 };
      var wrap = document.createElement("div");
      wrap.className = "num-wrap";
      var field = document.createElement("div");
      field.className = "num-field";
      var inp = document.createElement("input");
      inp.type = "number"; inp.step = "0.1"; inp.min = meta.min; inp.max = meta.max;
      inp.setAttribute("aria-label", t("q." + qid + ".label"));
      var suff = document.createElement("span");
      suff.textContent = t("units.m");
      field.appendChild(inp); field.appendChild(suff);
      var unk = document.createElement("label");
      unk.className = "unknown-toggle";
      var cb = document.createElement("input"); cb.type = "checkbox";
      var cbText = document.createElement("span");
      cbText.textContent = t("misc.notSure");
      unk.appendChild(cb); unk.appendChild(cbText);
      wrap.appendChild(field); wrap.appendChild(unk);
      extra.appendChild(wrap);
      inp.addEventListener("input", function(){
        if (cb.checked) return;
        var v = inp.value === "" ? "" : Number(inp.value);
        setAnswer(qid, v === "" ? "" : (isFinite(v) ? v : ""));
      });
      cb.addEventListener("change", function(){
        if (cb.checked){ inp.value = ""; inp.disabled = true; setAnswer(qid, "__unknown"); }
        else { inp.disabled = false; setAnswer(qid, ""); }
      });
    } else {
      Object.keys(q.options).forEach(function(key){
        var opt = q.options[key];
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "opt" + (key === "unknown" ? " unknown" : "");
        btn.setAttribute("data-qid", qid);
        btn.setAttribute("data-val", key);
        var tick = document.createElement("span");
        tick.className = "tick";
        tick.innerHTML = '<svg><use href="#i-check"/></svg>';
        var txt = document.createElement("span");
        txt.textContent = t("q." + qid + ".opt." + key);
        btn.appendChild(tick); btn.appendChild(txt);
        optionsWrap.appendChild(btn);
      });
    }
    var flag = document.createElement("div");
    flag.className = "q-flag";
    flag.innerHTML = '<svg><use href="#i-warning"/></svg><span></span>';
    node.appendChild(flag);
    return node;
  }

  function renderQuestions(){
    RULES.STEPS.forEach(function(step){
      if (!step.questions) return;
      var body = questionStepBody(step.id);
      if (!body) return;
      body.innerHTML = "";
      if (step.id === "core" || step.id === "advanced"){
        var intro = document.createElement("div");
        intro.className = "core-intro";
        intro.innerHTML = '<span>' + escapeHtml(step.id === "core" ? t("coreIntro") : t("advIntro")) + '</span>';
        body.appendChild(intro);
      }
      step.questions.forEach(function(qid){ body.appendChild(buildQuestion(qid)); });
    });
    syncAllSelections();
    updateStepMeta();
  }

  function syncQuestion(qid){
    var node = qs('[data-qid="' + qid + '"]');
    if (!node) return;
    var raw = ST.answers[qid];
    qsa(".opt", node).forEach(function(btn){
      btn.classList.toggle("sel", raw !== undefined && raw === btn.getAttribute("data-val"));
    });
    var inp = node.querySelector(".num-field input");
    var cb = node.querySelector(".unknown-toggle input");
    if (inp){
      if (raw === "__unknown"){ inp.value = ""; inp.disabled = true; if (cb) cb.checked = true; }
      else { if (cb) cb.checked = false; inp.disabled = false; inp.value = (raw === undefined || raw === "") ? "" : raw; }
    }
    var autoTag = node.querySelector(".q-auto");
    if (autoTag && !(ST.autoFilled && ST.autoFilled[qid])) autoTag.remove();
    var flag = node.querySelector(".q-flag");
    if (flag){
      flag.classList.remove("show");
      var span = flag.querySelector("span");
      if (raw !== undefined && raw !== ""){
        var sc = RULES.answerScore(qid, raw, { size: ST.size });
        if (sc && sc.hard){ span.textContent = bi("Hard constraint: a standard delivery will be blocked unless this is fixed.", "硬性限制：不解决此问题，标准派送无法进行。"); flag.classList.add("show"); }
        else if (sc && sc.flag){ span.textContent = bi("Risk flagged: manage or verify this before dispatch.", "已标记风险：派车前请整改或核实。"); flag.classList.add("show"); }
      }
    }
  }
  function syncAllSelections(){
    Object.keys(ST.answers).forEach(function(qid){ syncQuestion(qid); });
  }

  function setAnswer(qid, val){
    if (val === "" || val === null || val === undefined) delete ST.answers[qid];
    else ST.answers[qid] = val;
    if (ST.autoFilled) delete ST.autoFilled[qid];
    syncQuestion(qid);
    updateStepMeta();
    recompute();
    saveDraft();
  }

  function updateStepMeta(){
    RULES.STEPS.forEach(function(step){
      if (!step.questions) return;
      var el = qs('[data-meta="' + step.id + '"]');
      if (!el) return;
      var total = step.questions.length;
      var done = step.questions.filter(function(qid){ return ST.answers[qid] !== undefined && ST.answers[qid] !== ""; }).length;
      el.textContent = done + "/" + total;
      el.className = "step-meta" + (done === total && total > 0 ? " done" : (done > 0 ? " warn" : ""));
    });
    var cargoMeta = qs('[data-meta="cargo"]');
    if (cargoMeta){
      cargoMeta.textContent = ST.size + " · " + (ST.method === "auto" ? t("methods.auto") : t("method." + ST.method));
      cargoMeta.className = "step-meta done";
    }
  }

  // ---------------- cargo ----------------
  function renderCargo(){
    var body = $("bodyCargo");
    if (!body) return;
    body.innerHTML = "";
    var label = document.createElement("div");
    label.className = "field";
    label.innerHTML = '<label>' + escapeHtml(t("cargo.sizeLabel")) + '</label>';
    body.appendChild(label);
    var grid = document.createElement("div");
    grid.className = "size-grid";
    Object.keys(RULES.SIZES).forEach(function(id){
      var s = RULES.SIZES[id];
      var card = document.createElement("button");
      card.type = "button";
      card.className = "size-card" + (ST.size === id ? " sel" : "");
      card.setAttribute("data-size", id);
      card.innerHTML = "<strong>" + escapeHtml(id) + "</strong><div class=\"dims\">" + escapeHtml(t("size.dims", { l: s.l, w: s.w, h: s.h })) + "</div><div class=\"pay\">" + escapeHtml(t("size.payload", { p: s.maxPayload })) + "</div>";
      card.addEventListener("click", function(){
        ST.size = id;
        renderCargo();
        recompute();
        saveDraft();
      });
      grid.appendChild(card);
    });
    body.appendChild(grid);
    var row = document.createElement("div");
    row.className = "cargo-row";
    var massField = document.createElement("div");
    massField.className = "field";
    massField.innerHTML = '<label for="massInput">' + escapeHtml(t("cargo.massLabel")) + '</label><input id="massInput" type="number" min="0" max="60" step="0.1" value="' + (ST.mass || 24) + '"><div class="hint">' + escapeHtml(t("cargo.massHint")) + '</div>';
    row.appendChild(massField);
    var methodField = document.createElement("div");
    methodField.className = "field";
    var opts = ['<option value="auto">' + escapeHtml(t("methods.auto")) + '</option>'];
    ["semi", "tilt", "side", "crane", "shuttle"].forEach(function(id){
      opts.push('<option value="' + id + '"' + (ST.method === id ? " selected" : "") + '>' + escapeHtml(t("method." + id)) + '</option>');
    });
    methodField.innerHTML = '<label for="methodSelect">' + escapeHtml(t("cargo.methodLabel")) + '</label><select id="methodSelect">' + opts.join("") + '</select><div class="hint">' + escapeHtml(t("cargo.methodHint")) + '</div>';
    row.appendChild(methodField);
    body.appendChild(row);
    var warn = document.createElement("div");
    warn.className = "mass-warn";
    warn.id = "massWarn";
    warn.innerHTML = '<svg><use href="#i-warning"/></svg><span></span>';
    body.appendChild(warn);
    var mi = $("massInput");
    mi.addEventListener("input", function(){
      var v = mi.value === "" ? "" : Number(mi.value);
      ST.mass = (v === "" || !isFinite(v)) ? 0 : v;
      renderMassWarn();
      recompute();
      saveDraft();
    });
    $("methodSelect").addEventListener("change", function(e){
      ST.method = e.target.value;
      updateStepMeta();
      renderMethods();
      saveDraft();
    });
    renderMassWarn();
    updateStepMeta();
  }
  function renderMassWarn(){
    var el = $("massWarn");
    if (!el) return;
    var size = RULES.SIZES[ST.size];
    var msg = "";
    if (ST.mass > size.maxPayload) msg = t("cargo.massWarnSize");
    else if (ST.mass > 28) msg = bi("Above 28 t gross may need a higher-mass permit or a lighter load. Check the route mass limits.", "毛重超过 28 吨可能需要高吨位许可或减载，请核对路线限重。");
    if (msg){ el.classList.add("show"); el.querySelector("span").textContent = msg; }
    else el.classList.remove("show");
  }

  // ---------------- address / map / auto ----------------
  function initMap(){
    var mapEl = $("map");
    if (!mapEl || !window.TileMap) return;
    ST.map = new TileMap(mapEl, $("mapTiles"), $("mapMarker"), $("mapAttribution"), {
      lat: -33.8688, lon: 151.2093, zoom: 13,
      onOffsetChange: function(off){ var r = $("mapRecenter"); if (r) r.hidden = !off; }
    });
    ST.map.setMarker(false);
    ST.map.setRadius(0);
    ST.mapStyle = ST.map.getStyle();
    $("zoomIn").addEventListener("click", function(){ ST.map.setZoom(ST.map.zoom + 1); });
    $("zoomOut").addEventListener("click", function(){ ST.map.setZoom(ST.map.zoom - 1); });
    $("mapStyleBtn").addEventListener("click", function(){
      ST.mapStyle = ST.map.toggleStyle();
      var lbl = $("mapStyleLabel");
      if (lbl) lbl.textContent = ST.mapStyle === "street" ? t("map.satellite") : t("map.street");
    });
    $("recenterBtn").addEventListener("click", function(){
      if (!ST.address) return;
      ST.map.recentre(ST.address.lat, ST.address.lon);
      $("mapRecenter").hidden = true;
    });
  }

  function updateAddressBar(){
    var a = ST.address;
    if (!a) return;
    $("addrTitle").textContent = a.title || a.display || bi("Pinned location", "手动定位");
    var parts = [];
    if (a.suburb) parts.push(a.suburb);
    if (a.state) parts.push(a.state);
    if (a.postcode) parts.push(a.postcode);
    var sub = parts.join(" ");
    if (a.lat !== undefined) sub += (sub ? " · " : "") + Number(a.lat).toFixed(5) + ", " + Number(a.lon).toFixed(5);
    $("addrSub").textContent = sub;
    $("coordText").textContent = Number(a.lat).toFixed(5) + ", " + Number(a.lon).toFixed(5);
    $("gmapLink").href = "https://www.google.com/maps?q=" + a.lat + "," + a.lon;
    $("osmLink").href = "https://www.openstreetmap.org/?mlat=" + a.lat + "&mlon=" + a.lon + "#map=18/" + a.lat + "/" + a.lon;
    $("nhvrLink").href = "https://maps.nhvr.gov.au/";
  }

  function showWorkspace(){
    $("hero").hidden = true;
    $("workspace").hidden = false;
    document.body.classList.add("has-address");
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(function(){ if (ST.map) ST.map.resize(); }, 120);
  }
  function resetToHome(){
    $("hero").hidden = false;
    $("workspace").hidden = true;
    document.body.classList.remove("has-address");
    window.scrollTo({ top: 0, behavior: "smooth" });
    var inp = $("addressInput");
    if (inp) inp.focus();
  }

  function selectPlace(place, preloadedAuto){
    if (!place) return;
    var changed = !ST.address || Math.abs(ST.address.lat - place.lat) > 1e-6 || Math.abs(ST.address.lon - place.lon) > 1e-6;
    if (changed && Object.keys(ST.answers).length > 0){
      if (!window.confirm(bi("Changing the address will clear the site answers. Continue?", "更换地址会清空已填写的现场数据，是否继续？"))) return;
      ST.answers = {};
      ST.notes = "";
      var notes = $("notesInput"); if (notes) notes.value = "";
    }
    ST.address = place;
    ST.auto = preloadedAuto || null;
    ST.autoError = false;
    ST.autoFilled = {};
    hideSearchDrop();
    updateAddressBar();
    showWorkspace();
    if (ST.map){
      ST.map.setView(place.lat, place.lon, 16, false);
      ST.map.setMarker(true);
      ST.map.setRadius(100);
    }
    renderQuestions();
    syncAllSelections();
    updateStepMeta();
    recompute();
    if (preloadedAuto) renderAuto();
    else loadAuto();
    saveDraft();
    $("mapRecenter").hidden = true;
  }

  function loadAuto(){
    if (!ST.address) return;
    var place = ST.address;
    var lat = place.lat, lon = place.lon;
    var status = $("autoStatus");
    status.className = "auto-status";
    status.innerHTML = '<span class="spinner"></span><span>' + escapeHtml(t("auto.loading")) + '</span>';
    ST.auto = null;
    ST.autoError = false;
    function isCurrent(){ return ST.address && Math.abs(ST.address.lat - lat) < 1e-7 && Math.abs(ST.address.lon - lon) < 1e-7; }
    API.roadInfo(place).then(function(info){
      if (!isCurrent() || !info) return;
      var quickWarnings = [];
      if (info.pedestrian) quickWarnings.push({ code: "warnNoVehicle", severity: "bad", vars: { road: info.road.name } });
      ST.auto = {
        lat: lat, lon: lon, road: info.road, roadSource: "nominatim", quick: true,
        restrictions: [], lowStructures: [], massLimits: [],
        powerlines: { count: 0, min: null, voltage: null }, slope: null,
        warnings: quickWarnings, fetchedAt: null, demo: false, roadReady: true
      };
      renderAuto();
    }).catch(function(){});
    API.analyze(lat, lon, { size: ST.size }).then(function(auto){
      if (!isCurrent()) return;
      ST.auto = auto;
      ST.autoError = false;
      renderAuto();
      saveDraft();
    }).catch(function(){
      if (!isCurrent()) return;
      if (ST.auto && ST.auto.roadReady){
        ST.auto.hazardError = true;
        renderAuto();
      } else {
        ST.autoError = true;
        ST.auto = null;
        renderAuto();
      }
    });
  }

  function renderAuto(){
    var status = $("autoStatus");
    var tiles = $("autoTiles");
    var warns = $("autoWarnings");
    if (!tiles || !warns) return;
    if (!ST.auto){
      status.className = "auto-status err";
      status.innerHTML = '<svg style="width:15px;height:15px"><use href="#i-warning"/></svg><span>' + escapeHtml(t("auto.error")) + '</span>';
      tiles.innerHTML = "";
      warns.innerHTML = "";
      return;
    }
    var a = ST.auto;
    var partial = !!(a.quick && !a.fetchedAt && !a.hazardError);
    var demoNote = a.demo ? " · " + bi("demo snapshot", "演示快照") : (a.osmTimestamp ? " · OSM " + a.osmTimestamp.slice(0, 10) : "");
    if (partial){
      status.className = "auto-status";
      status.innerHTML = '<span class="spinner"></span><span>' + escapeHtml(bi("Road attributes loaded. Scanning hazards (bridges, powerlines, restrictions) — this can take 10–60 s.", "道路属性已加载，正在扫描桥梁、电线与道路限制 — 约需 10–60 秒。")) + '</span>';
    } else if (a.hazardError){
      status.className = "auto-status err";
      status.innerHTML = '<svg style="width:15px;height:15px"><use href="#i-warning"/></svg><span>' + escapeHtml(bi("Road attributes loaded, but the hazard scan is unavailable. Verify bridges, powerlines and narrow sections on site.", "道路属性已加载，但风险扫描暂不可用。请现场核实桥梁、电线与狭窄路段。")) + '</span>';
    } else {
      status.className = "auto-status ok";
      status.innerHTML = '<svg style="width:15px;height:15px"><use href="#i-check"/></svg><span>' + escapeHtml(t("auto.ready") + demoNote) + '</span>';
    }
    var tileData = [];
    tileData.push({ lbl: t("auto.road"), val: a.road.name, sub: roadClassLabel(a.road.klass), cls: "info" });
    var wCls = a.road.pedestrian ? "bad" : (a.road.width < 5.6 ? "warn" : "good");
    tileData.push({ lbl: t("auto.width"), val: a.road.pedestrian ? "—" : a.road.width + " m", sub: a.road.pedestrian ? bi("pedestrian / non-vehicle way", "步行/非机动车道") : sourceLabel(a.road.widthSource), cls: wCls });
    tileData.push({ lbl: t("auto.tileLanes"), val: a.road.laneText || "—", sub: a.road.speed ? a.road.speed + " km/h" : t("auto.notMapped"), cls: "" });
    tileData.push({ lbl: t("auto.tileSurface"), val: a.road.surface || "—", sub: a.road.oneway ? bi("one-way", "单行道") : "", cls: "" });
    var slopeCls = a.slope && a.slope.pct > 8 ? "warn" : (a.slope ? "good" : "");
    tileData.push({ lbl: t("auto.slope"), val: a.slope ? a.slope.pct + "%" : "—", sub: a.slope ? bi("estimated", "估算") : t("auto.notMapped"), cls: slopeCls });
    var pw = a.powerlines || { count: 0, min: null };
    var pwCls = pw.min !== null && pw.min < 10 ? "bad" : (pw.min !== null && pw.min < 30 ? "warn" : "good");
    if (partial || a.hazardError){
      tileData.push({ lbl: t("auto.powerlines"), val: partial ? "…" : "—", sub: partial ? bi("scanning", "扫描中") : bi("scan unavailable", "扫描不可用"), cls: "info" });
      tileData.push({ lbl: t("auto.restrictions"), val: partial ? "…" : "—", sub: partial ? bi("scanning", "扫描中") : bi("scan unavailable", "扫描不可用"), cls: "info" });
    } else {
      tileData.push({ lbl: t("auto.powerlines"), val: pw.min !== null ? pw.min + " m" : t("auto.none"), sub: pw.count ? pw.count + " " + bi("objects", "处") + (pw.voltage ? " · " + pw.voltage + " V" : "") : "", cls: pwCls });
      var restrictCount = (a.lowStructures ? a.lowStructures.length : 0) + (a.massLimits ? a.massLimits.length : 0);
      tileData.push({ lbl: t("auto.restrictions"), val: String(restrictCount), sub: bi("low / mass limits", "限高/限重"), cls: restrictCount ? "warn" : "good" });
    }
    tileData.push({ lbl: t("auto.deadend"), val: a.road.noexit ? t("misc.yes") : t("misc.no"), sub: "", cls: a.road.noexit ? "warn" : "good" });
    tiles.innerHTML = "";
    tileData.forEach(function(d){
      var tile = document.createElement("div");
      tile.className = "auto-tile " + (d.cls || "");
      var l = document.createElement("div"); l.className = "lbl"; l.textContent = d.lbl;
      var v = document.createElement("div"); v.className = "val"; v.textContent = d.val;
      var s = document.createElement("div"); s.className = "sub"; s.textContent = d.sub || "";
      tile.appendChild(l); tile.appendChild(v); tile.appendChild(s);
      tiles.appendChild(tile);
    });
    warns.innerHTML = "";
    var wl = a.warnings || [];
    if (partial){
      var scan = document.createElement("div");
      scan.className = "auto-warn";
      scan.style.background = "var(--blue-bg)"; scan.style.borderColor = "rgba(56,189,248,.25)"; scan.style.color = "#a6dcf5";
      scan.innerHTML = '<span class="spinner" style="width:12px;height:12px"></span><span>' + escapeHtml(bi("Hazard scan running in the background. Road width and class are already shown.", "后台正在扫描风险，路宽与道路等级已先行显示。")) + '</span>';
      warns.appendChild(scan);
    } else if (a.hazardError){
      var scanErr = document.createElement("div");
      scanErr.className = "auto-warn";
      scanErr.style.background = "var(--panel-2)";
      scanErr.style.borderColor = "var(--line-2)";
      scanErr.style.color = "var(--muted)";
      scanErr.innerHTML = '<svg><use href="#i-info"/></svg><span>' + escapeHtml(bi("Only road attributes are shown. Hazard scanning (bridges, powerlines, restrictions) is unavailable right now — verify them in the questions or on site.", "当前仅显示道路属性。桥梁、电线与限制扫描暂不可用 — 请在答题中核实或现场确认。")) + '</span>';
      warns.appendChild(scanErr);
    } else if (!wl.length){
      var ok = document.createElement("div");
      ok.className = "auto-warn";
      ok.style.background = "var(--green-bg)"; ok.style.borderColor = "rgba(34,197,94,.25)"; ok.style.color = "#b9f3cd";
      ok.innerHTML = '<svg><use href="#i-check"/></svg><span>' + escapeHtml(bi("No obvious OSM restrictions found. Open data may be incomplete — still verify on site.", "地图未发现明显限制。开放数据可能不完整，仍需现场核实。")) + '</span>';
      warns.appendChild(ok);
    }
    wl.forEach(function(w){
      var div = document.createElement("div");
      div.className = "auto-warn" + (w.severity === "bad" ? " bad" : "");
      div.innerHTML = '<svg><use href="#i-warning"/></svg><span>' + escapeHtml(t("auto." + w.code, w.vars || {})) + '</span>';
      warns.appendChild(div);
    });
    var foot = document.querySelector(".auto-foot");
    if (foot){
      var extra = a.demo ? " · " + bi("Demo snapshot — refresh data when online for live results.", "演示数据 — 联网后请点击刷新获取实时数据。") : "";
      foot.textContent = t("auto.foot") + extra;
    }
    applyAutoDefaults(a);
  }

  function applyAutoDefaults(auto){
    if (!auto || (!auto.road && !auto.slope)) return;
    var filled = 0;
    function setIf(qid, val){
      if (ST.answers[qid] === undefined || ST.answers[qid] === ""){
        ST.answers[qid] = val;
        ST.autoFilled[qid] = true;
        filled++;
      }
    }
    if (auto.road && !auto.road.pedestrian && typeof auto.road.width === "number"){
      setIf("roadWidth", auto.road.width >= 7 ? "wide" : (auto.road.width >= 5.5 ? "medium" : "narrow"));
    }
    if (auto.road && auto.road.noexit) setIf("deadEnd", "reverse");
    if (auto.slope && typeof auto.slope.pct === "number"){
      setIf("streetGrade", auto.slope.pct > 10 ? "steep" : (auto.slope.pct >= 5 ? "moderate" : "flat"));
    }
    if (auto.powerlines && auto.powerlines.min !== null && auto.powerlines.min !== undefined){
      setIf("powerlineDistance", auto.powerlines.min < 3 ? "close" : (auto.powerlines.min < 10 ? "near" : "far"));
    }
    if (filled){
      renderQuestions();
      updateStepMeta();
      recompute();
      var now = Date.now();
      if (!ST.lastAutoToast || now - ST.lastAutoToast > 6000){
        ST.lastAutoToast = now;
        toast(t("auto.autoFilled", { n: filled }), "ok");
      }
    }
  }

  // ---------------- search ----------------
  function hideSearchDrop(){
    var drop = $("searchDrop");
    if (drop){ drop.hidden = true; drop.innerHTML = ""; }
    ST.search.items = [];
    ST.search.active = -1;
  }
  function renderSearchResults(items, loading){
    var drop = $("searchDrop");
    if (!drop) return;
    drop.hidden = false;
    drop.innerHTML = "";
    if (loading){
      var ld = document.createElement("div");
      ld.className = "drop-loading";
      ld.innerHTML = '<span class="spinner"></span><span>' + escapeHtml(t("search.searching")) + '</span>';
      drop.appendChild(ld);
      return;
    }
    if (!items.length){
      var empty = document.createElement("div");
      empty.className = "drop-loading";
      empty.textContent = t("search.noResults");
      drop.appendChild(empty);
      return;
    }
    items.forEach(function(p, i){
      var d = document.createElement("div");
      d.className = "drop-item" + (i === ST.search.active ? " active" : "");
      var pin = document.createElement("span");
      pin.className = "pin";
      pin.innerHTML = '<svg><use href="#i-pin"/></svg>';
      var body = document.createElement("div");
      var strong = document.createElement("strong");
      strong.textContent = p.title || p.display;
      var sub = document.createElement("span");
      sub.textContent = p.display;
      body.appendChild(strong); body.appendChild(sub);
      d.appendChild(pin); d.appendChild(body);
      d.addEventListener("click", function(){ hideSearchDrop(); selectPlace(p); });
      drop.appendChild(d);
    });
  }
  function doSearch(query){
    var seq = ++ST.search.seq;
    ST.search.loading = true;
    renderSearchResults([], true);
    API.searchAddress(query, 6).then(function(items){
      if (seq !== ST.search.seq) return;
      ST.search.loading = false;
      ST.search.items = items;
      ST.search.active = items.length ? 0 : -1;
      renderSearchResults(items, false);
      if (items.length) ST.search.active = 0;
    }).catch(function(){
      if (seq !== ST.search.seq) return;
      ST.search.loading = false;
      ST.search.items = [];
      hideSearchDrop();
      toast(t("search.error"), "err");
    });
  }
  var onSearchInput = debounce(function(){
    var val = $("addressInput").value.trim();
    $("searchWrap").classList.toggle("has-value", val.length > 0);
    if (val.length < 4){ hideSearchDrop(); return; }
    doSearch(val);
  }, 550);

  function bindSearch(){
    var inp = $("addressInput");
    inp.addEventListener("input", onSearchInput);
    inp.addEventListener("focus", function(){ if (ST.search.items.length) renderSearchResults(ST.search.items, false); });
    $("searchClear").addEventListener("click", function(){
      inp.value = "";
      $("searchWrap").classList.remove("has-value");
      hideSearchDrop();
      inp.focus();
    });
    inp.addEventListener("keydown", function(e){
      if (e.key === "Escape"){ hideSearchDrop(); return; }
      if (!ST.search.items.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp"){
        e.preventDefault();
        var n = ST.search.items.length;
        ST.search.active = (ST.search.active + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
        renderSearchResults(ST.search.items, false);
      } else if (e.key === "Enter"){
        e.preventDefault();
        var p = ST.search.items[ST.search.active >= 0 ? ST.search.active : 0];
        if (p) { hideSearchDrop(); selectPlace(p); }
      }
    });
    $("searchBtn").addEventListener("click", function(){
      var val = inp.value.trim();
      if (ST.search.items.length){
        var p = ST.search.items[ST.search.active >= 0 ? ST.search.active : 0];
        hideSearchDrop(); selectPlace(p); return;
      }
      if (val.length < 4){ toast(t("search.needInput"), "err"); return; }
      var seq = ++ST.search.seq;
      ST.search.loading = true;
      renderSearchResults([], true);
      API.searchAddress(val, 1).then(function(items){
        if (seq !== ST.search.seq) return;
        if (!items.length){ toast(t("search.noResults"), "err"); hideSearchDrop(); return; }
        hideSearchDrop(); selectPlace(items[0]);
      }).catch(function(){
        if (seq !== ST.search.seq) return;
        hideSearchDrop();
        toast(t("search.error"), "err");
      });
    });
    $("manualCoordsBtn").addEventListener("click", function(){
      var el = $("manualCoords");
      el.hidden = !el.hidden;
    });
    $("manualGo").addEventListener("click", function(){
      var lat = parseFloat($("latInput").value), lon = parseFloat($("lonInput").value);
      if (!isFinite(lat) || !isFinite(lon) || lat < -45 || lat > -9 || lon < 110 || lon > 155){
        toast(bi("Enter a valid Australian latitude (-45 to -9) and longitude (110 to 155).", "请输入有效的澳洲纬度（-45 至 -9）和经度（110 至 155）。"), "err");
        return;
      }
      var place = {
        display: bi("Pinned location", "手动定位") + " (" + lat.toFixed(5) + ", " + lon.toFixed(5) + ")",
        title: bi("Pinned location", "手动定位"), lat: lat, lon: lon,
        suburb: "", state: "", postcode: "", road: ""
      };
      selectPlace(place);
      API.reverse(lat, lon).then(function(rev){
        if (!ST.address || Math.abs(ST.address.lat - lat) > 1e-7) return;
        ST.address = Object.assign({}, rev, { lat: lat, lon: lon });
        updateAddressBar();
        saveDraft();
      }).catch(function(){});
    });
  }

  // ---------------- verdict / methods / next ----------------
  function recompute(){
    if (!ST.address){
      ST.result = null; ST.methods = []; ST.extras = [];
      renderVerdict(); renderMethods();
      return;
    }
    var ctx = { size: ST.size, mass: ST.mass };
    ST.result = RULES.evaluate(ST.answers, ctx);
    var coreKnown = 0, coreTotal = 0;
    RULES.CORE_QUESTIONS.forEach(function(qid){
      var w = RULES.QUESTIONS[qid] ? RULES.QUESTIONS[qid].weight : 0;
      coreTotal += w;
      var raw = ST.answers[qid];
      if (raw !== undefined && raw !== "") coreKnown += w * (raw === "__unknown" ? 0.35 : 1);
    });
    ST.result.confidence = coreTotal > 0 ? Math.max(0, Math.min(1, coreKnown / coreTotal)) : 0;
    ST.methods = RULES.recommend(ST.answers, ctx);
    ST.extras = RULES.extraChecks(ST.answers, ctx, ST.result);
    renderVerdict();
    renderMethods();
  }

  function answerLabel(qid){
    var raw = ST.answers[qid];
    var q = RULES.QUESTIONS[qid];
    if (!q || raw === undefined || raw === null || raw === "") return bi("Not filled", "未填");
    if (q.type === "number") return raw === "__unknown" ? bi("Not sure", "不确定") : raw + " " + t("units.m");
    if (raw === "unknown") return bi("Not sure", "不确定");
    return t("q." + qid + ".opt." + raw);
  }

  function renderKeyChecks(){
    var box = $("keyChecks");
    if (!box) return;
    box.innerHTML = "";
    if (!ST.address){ box.style.display = "none"; return; }
    box.style.display = "flex";
    var rows = [
      { label: bi("Road width", "街道净宽"), qids: ["roadWidth"] },
      { label: bi("Entry / gate", "大门 / 入口"), qids: ["gateWidth", "entryMode"] },
      { label: bi("Drop zone", "落柜区空间"), qids: ["dropLength", "dropWidth"] },
      { label: bi("Overhead", "上方净空"), qids: ["dropOverhead"] },
      { label: bi("Ground", "地面条件"), qids: ["dropSurface"] },
      { label: bi("Powerlines", "电线距离"), qids: ["powerlineDistance"] },
      { label: bi("Legal / mass", "路权 / 限重"), qids: ["networkStatus", "massLimit"] }
    ];
    rows.forEach(function(row){
      var scores = [], anyHard = false, anyUnknown = false, answered = 0;
      row.qids.forEach(function(qid){
        var raw = ST.answers[qid];
        if (raw === undefined || raw === "") return;
        answered++;
        var sc = RULES.answerScore(qid, raw, { size: ST.size });
        if (!sc) return;
        scores.push(sc.s);
        if (sc.hard) anyHard = true;
        if (sc.unknown) anyUnknown = true;
      });
      var cls = "muted", ico = "–";
      if (answered){
        if (anyHard){ cls = "bad"; ico = "✕"; }
        else if (anyUnknown || Math.min.apply(null, scores) < 0.5){ cls = "warn"; ico = "!"; }
        else if (Math.min.apply(null, scores) >= 0.8){ cls = "ok"; ico = "✓"; }
        else { cls = "warn"; ico = "!"; }
      }
      var vals = row.qids.map(function(qid){
        if (qid === "dropLength" || qid === "dropWidth"){
          return ST.answers[qid] !== undefined ? ST.answers[qid] + " m" : "—";
        }
        return answerLabel(qid);
      });
      if (row.qids.length === 2 && row.qids[0] === "dropLength" && row.qids[1] === "dropWidth"){
        vals = [ (ST.answers.dropLength !== undefined ? ST.answers.dropLength : "—") + " × " + (ST.answers.dropWidth !== undefined ? ST.answers.dropWidth : "—") + " m" ];
      }
      var div = document.createElement("div");
      div.className = "key-row " + cls;
      div.innerHTML = '<span class="k-ico">' + ico + '</span><span class="k-label">' + escapeHtml(row.label) + '</span><span class="k-val">' + escapeHtml(vals.join(" · ")) + '</span>';
      box.appendChild(div);
    });
  }

  function methodName(id){ return t("method." + id); }

  function renderQuickAdvice(){
    var box = $("quickAdvice");
    if (!box) return;
    if (!ST.address){ box.style.display = "none"; return; }
    box.style.display = "block";
    var r = ST.result;
    var rec = (ST.methods || []).filter(function(m){ return m.status === "rec"; }).map(function(m){ return methodName(m.id); });
    var possible = (ST.methods || []).filter(function(m){ return m.status === "possible"; }).map(function(m){ return methodName(m.id); });
    if (!r || r.total === null || r.verdict === "none"){
      box.innerHTML = '<strong>' + escapeHtml(t("verdict.advice")) + ': </strong>' + escapeHtml(bi("Fill the key conditions (road width, gate, drop space, clearance, ground) to get a yes / conditional / no answer.", "填完关键条件（路宽、大门、落柜空间、净空、地面）后即可给出“能进 / 有条件 / 不能进”的结论。"));
      return;
    }
    if (r.hardFails && r.hardFails.length){
      var names = r.hardFails.map(function(h){ return t("q." + h.id + ".label"); }).slice(0, 3).join("、");
      box.innerHTML = '<strong>' + escapeHtml(bi("Standard truck: not recommended", "标准卡车：不建议")) + '</strong><br>' +
        escapeHtml(bi("Hard constraints fail: ", "硬性条件不满足：")) + escapeHtml(names) + '.<br>' +
        escapeHtml(bi("Use a side loader / crane truck, transload, or inspect the site before booking.", "建议改用侧装机 / 随车吊 / 中转接驳，或先现场勘查再派车。"));
      return;
    }
    if (r.verdict === "green"){
      box.innerHTML = '<strong>' + escapeHtml(bi("Standard delivery looks workable", "标准派送可行")) + '</strong><br>' +
        escapeHtml(bi("Recommended: ", "推荐：")) + escapeHtml(rec.length ? rec.join(" · ") : t("method.semi")) + '. ' +
        escapeHtml(bi("Confirm route permit and send the driver the measurements.", "确认路权许可；把测量结果发给司机。"));
      return;
    }
    if (r.verdict === "amber" || r.verdict === "orange"){
      var watch = (r.watchouts || []).slice(0, 2).map(function(w){ return t("q." + w.id + ".label"); }).join("；");
      var opts = rec.concat(possible.slice(0, 2));
      box.innerHTML = '<strong>' + escapeHtml(rec.length ? (rec.join(" · ") + ' ' + bi("recommended", "优先")) : bi("Conditional — use specialist equipment", "有条件可行 — 建议专用设备")) + '</strong><br>' +
        (watch ? escapeHtml(bi("Check / fix: ", "需核实或整改：")) + escapeHtml(watch) + '. ' : '') +
        escapeHtml(bi("Recommended options: ", "可选方式：")) + escapeHtml(opts.length ? opts.join(" · ") : bi("site inspection first", "先安排现场勘查")) + '.';
      return;
    }
    box.innerHTML = '<strong>' + escapeHtml(bi("Not suitable for a standard delivery", "不适合标准派送")) + '</strong><br>' +
      escapeHtml(bi("Consider offsite unpacking, transload, side loader or a smaller shuttle truck.", "建议仓库拆箱、中转、侧装机或小型接驳车。"));
  }

  function renderVerdict(){
    var card = $("verdictCard");
    var r = ST.result;
    card.className = "card verdict-card " + (!r ? "v-none" : verdictClass(r.verdict));
    var score = r && r.total !== null && r.answeredWeight / r.totalWeight >= 0.3 ? r.total : null;
    $("scoreValue").textContent = score === null ? "—" : String(score);
    var circ = 2 * Math.PI * 50;
    $("gaugeFill").style.strokeDasharray = String(circ);
    $("gaugeFill").style.strokeDashoffset = String(circ * (1 - (score === null ? 0 : score) / 100));
    $("gaugeFill").style.opacity = score === null ? "0" : "1";
    var labelEl = $("verdictLabel"), textEl = $("verdictText");
    var confEl = $("confidenceBadge");
    var metaEl = $("verdictMeta"), barsEl = $("catBars"), blockersEl = $("blockers");
    metaEl.innerHTML = ""; barsEl.innerHTML = ""; blockersEl.innerHTML = "";
    if (!ST.address){
      labelEl.textContent = t("verdict.noAddress");
      textEl.textContent = t("verdict.noAddressText");
      confEl.textContent = "—";
    } else if (!r || r.total === null || r.answeredWeight / r.totalWeight < 0.3){
      labelEl.textContent = t("verdict.unknown");
      var answered = Math.round(r ? (r.answeredWeight / r.totalWeight) * 100 : 0);
      textEl.textContent = bi("About " + answered + "% answered. Answer more questions on the left to unlock a reliable verdict.", "已答约 " + answered + "%，继续回答左侧问题即可得到可靠结论。");
      confEl.textContent = "—";
    } else {
      labelEl.textContent = t(r.labelKey);
      textEl.textContent = t(r.textKey);
      var pct = Math.round(r.confidence * 100);
      confEl.textContent = t("verdict.confidence") + " " + pct + "%";
    }
    if (ST.address){
      var chips = [];
      chips.push(ST.size);
      if (ST.mass) chips.push(ST.mass + " t");
      if (ST.address.state) chips.push(ST.address.state);
      if (ST.method && ST.method !== "auto") chips.push(t("method." + ST.method));
      chips.forEach(function(c){ var s = document.createElement("span"); s.className = "meta-chip"; s.textContent = c; metaEl.appendChild(s); });
    }
    renderKeyChecks();
    renderQuickAdvice();
    RULES.CATEGORIES.forEach(function(cat){
      var c = r && r.categories ? r.categories[cat.id] : null;
      var row = document.createElement("div");
      row.className = "cat-bar";
      var name = document.createElement("span");
      name.textContent = t("catLabels." + cat.id);
      var track = document.createElement("div");
      track.className = "track";
      var fill = document.createElement("div");
      fill.className = "fill";
      fill.style.width = (c ? c.score : 0) + "%";
      track.appendChild(fill);
      var pctEl = document.createElement("span");
      pctEl.className = "pct";
      pctEl.textContent = c ? c.score + "%" : "—";
      row.appendChild(name); row.appendChild(track); row.appendChild(pctEl);
      barsEl.appendChild(row);
    });
    if (r && r.hardFails && r.hardFails.length){
      r.hardFails.forEach(function(b){
        var div = document.createElement("div");
        div.className = "blocker";
        div.innerHTML = '<svg><use href="#i-warning"/></svg><span><strong>' + escapeHtml(t("q." + b.id + ".label")) + '</strong> — ' + escapeHtml(bi("hard constraint", "硬性限制")) + '</span>';
        blockersEl.appendChild(div);
      });
    } else if (r && r.watchouts && r.watchouts.length && r.total !== null){
      r.watchouts.slice(0, 3).forEach(function(w){
        var div = document.createElement("div");
        div.className = "blocker amber";
        div.innerHTML = '<svg><use href="#i-info"/></svg><span>' + escapeHtml(t("q." + w.id + ".label")) + '</span>';
        blockersEl.appendChild(div);
      });
    }
    var hasAddress = !!ST.address;
    var ready = hasAddress && r && r.totalWeight > 0 && r.answeredWeight / r.totalWeight >= 0.2;
    $("reportBtn").disabled = !ready;
    $("saveBtn").disabled = !ready;
    $("csvBtn").disabled = !ready;
  }

  function renderMethods(){
    var list = $("methodsList");
    if (!list) return;
    list.innerHTML = "";
    if (!ST.address || !ST.result || ST.result.total === null || ST.result.answeredWeight / ST.result.totalWeight < 0.2){
      var p = document.createElement("div");
      p.className = "saved-empty";
      p.textContent = bi("Answer the street and drop-zone questions to rank delivery methods.", "回答街道与落柜区问题后，这里会给出派送方式排序。");
      list.appendChild(p);
      return;
    }
    var order = { rec: 0, possible: 1, no: 2 };
    var methods = ST.methods.slice().sort(function(a, b){ return order[a.status] - order[b.status]; });
    methods.forEach(function(m){
      var row = document.createElement("div");
      row.className = "method" + (m.status === "rec" ? " rec" : (m.status === "no" ? " no" : ""));
      var ico = document.createElement("div");
      ico.className = "m-ico";
      ico.innerHTML = '<svg><use href="#i-truck"/></svg>';
      var body = document.createElement("div");
      body.className = "m-body";
      var name = document.createElement("div");
      name.className = "m-name";
      name.textContent = t("method." + m.id);
      if (ST.method === m.id){
        var pref = document.createElement("span");
        pref.className = "m-tag alt";
        pref.textContent = bi("Preferred", "意向");
        name.appendChild(pref);
      }
      if (m.status === "rec"){
        var tag = document.createElement("span");
        tag.className = "m-tag";
        tag.textContent = t("methods.rec");
        name.appendChild(tag);
      }
      var note = document.createElement("div");
      note.className = "m-note";
      if (m.status === "no" && m.reasons && m.reasons.length){
        note.textContent = m.reasons.map(function(r){ return RULES.reasonText(r, window.currentLang); }).join(" · ");
      } else if (m.status === "rec"){
        note.textContent = t("method." + m.id + "Desc");
      } else {
        note.textContent = t("method." + m.id + "Desc");
      }
      body.appendChild(name); body.appendChild(note);
      row.appendChild(ico); row.appendChild(body);
      list.appendChild(row);
    });
    var note = document.createElement("div");
    note.className = "saved-empty";
    note.style.marginTop = "8px";
    note.textContent = bi("Ranking uses your answers. Confirm the chosen method with the carrier.", "排序基于你的回答，最终车型请与承运人确认。");
    list.appendChild(note);
  }

  function renderNext(){
    var box = $("nextLinks");
    if (!box) return;
    box.innerHTML = "";
    var links = [];
    links.push({ title: t("next.nhvr"), sub: t("next.nhvrSub"), href: "https://www.nhvr.gov.au/road-access/route-planner", external: true });
    var st = ST.address && ST.address.state ? RULES.stateInfo(ST.address.state) : null;
    if (st){
      links.push({ title: t("next.state") + " (" + ST.address.state + ")", sub: st.name + " · " + t("next.stateSub"), href: st.map, external: true });
      links.push({ title: t("next.council"), sub: t("next.councilSub"), href: st.council, external: true });
    } else {
      links.push({ title: t("next.council"), sub: t("next.councilSub"), href: "https://www.australia.gov.au", external: true });
    }
    links.push({ title: t("next.guide"), sub: t("next.guideSub"), modal: "guide" });
    links.forEach(function(l){
      var el = document.createElement(l.modal ? "button" : "a");
      el.className = "next-link";
      if (l.modal){ el.type = "button"; el.setAttribute("data-modal", l.modal); }
      else { el.href = l.href; el.target = "_blank"; el.rel = "noopener"; }
      var ico = document.createElement("span");
      ico.innerHTML = '<svg><use href="#i-shield"/></svg>';
      var txt = document.createElement("span");
      var strong = document.createElement("strong");
      strong.textContent = l.title + " ";
      var sub = document.createElement("span");
      sub.textContent = l.sub;
      sub.style.display = "block";
      sub.style.fontSize = "10px";
      sub.style.color = "var(--dim)";
      txt.appendChild(strong); txt.appendChild(sub);
      var arrow = document.createElement("span");
      arrow.className = "arrow"; arrow.textContent = "↗";
      el.appendChild(ico); el.appendChild(txt); el.appendChild(arrow);
      box.appendChild(el);
    });
  }

  // ---------------- saved / export ----------------
  function loadSaved(){
    try { return JSON.parse(localStorage.getItem(LS_SAVED) || "[]"); } catch (e) { return []; }
  }
  function persistSaved(arr){
    try { localStorage.setItem(LS_SAVED, JSON.stringify(arr)); } catch (e) {}
    ST.saved = arr;
    renderSavedMini();
    var count = $("savedCount"); if (count) count.textContent = String(arr.length);
  }
  function saveCheck(){
    if (!ST.address) return;
    var ctx = { size: ST.size, mass: ST.mass };
    var result = RULES.evaluate(ST.answers, ctx);
    var rec = {
      id: "c" + Date.now() + Math.floor(Math.random() * 999),
      createdAt: Date.now(),
      address: clone(ST.address),
      auto: ST.auto ? clone(ST.auto) : null,
      size: ST.size, method: ST.method, mass: ST.mass,
      answers: clone(ST.answers), notes: ST.notes,
      summary: { total: result.total, verdict: result.verdict, confidence: result.confidence }
    };
    var arr = loadSaved();
    arr.unshift(rec);
    if (arr.length > MAX_SAVED) arr = arr.slice(0, MAX_SAVED);
    persistSaved(arr);
    toast(t("saved.saved"), "ok");
  }
  function openSaved(id){
    var rec = loadSaved().filter(function(r){ return r.id === id; })[0];
    if (!rec) return;
    ST.address = clone(rec.address);
    ST.auto = rec.auto ? clone(rec.auto) : null;
    ST.autoError = false;
    ST.autoFilled = {};
    ST.size = rec.size || "40GP";
    ST.method = rec.method || "auto";
    ST.mass = rec.mass || 0;
    ST.answers = clone(rec.answers || {});
    ST.notes = rec.notes || "";
    var notes = $("notesInput"); if (notes) notes.value = ST.notes;
    updateAddressBar();
    showWorkspace();
    if (ST.map){ ST.map.setView(ST.address.lat, ST.address.lon, 16, false); ST.map.setMarker(true); ST.map.setRadius(100); }
    renderCargo(); renderQuestions(); renderVerdict(); renderMethods(); renderNext();
    if (ST.auto) renderAuto(); else loadAuto();
    recompute();
    updateStepMeta();
    saveDraft();
    toast(t("saved.loaded"), "ok");
  }
  function deleteSaved(id){
    var arr = loadSaved().filter(function(r){ return r.id !== id; });
    persistSaved(arr);
    toast(t("saved.deleted"));
  }
  function renderSavedMini(){
    var arr = ST.saved && ST.saved.length ? ST.saved : loadSaved();
    ST.saved = arr;
    var card = $("savedMini");
    var list = $("savedMiniList");
    var count = $("savedCount");
    if (count) count.textContent = String(arr.length);
    if (!card || !list) return;
    if (!arr.length){ card.hidden = true; list.innerHTML = ""; return; }
    card.hidden = false;
    list.innerHTML = "";
    arr.slice(0, 3).forEach(function(rec){
      var item = document.createElement("div");
      item.className = "saved-item";
      var dot = document.createElement("span");
      dot.className = "s-dot";
      dot.style.background = savedColor(rec.summary && rec.summary.verdict);
      var body = document.createElement("div");
      body.className = "s-body";
      var addr = document.createElement("div");
      addr.className = "s-addr";
      addr.textContent = rec.address ? (rec.address.title || rec.address.display) : "—";
      var meta = document.createElement("div");
      meta.className = "s-meta";
      meta.textContent = (rec.summary && rec.summary.total !== null ? rec.summary.total + "/100" : "—") + " · " + (rec.address && rec.address.state ? rec.address.state : "");
      body.appendChild(addr); body.appendChild(meta);
      item.appendChild(dot); item.appendChild(body);
      item.addEventListener("click", function(){ openSaved(rec.id); });
      list.appendChild(item);
    });
  }
  function exportJSON(){
    if (!ST.address) return;
    var ctx = { size: ST.size, mass: ST.mass };
    var payload = {
      tool: "Container Access AU", version: "1.0", exportedAt: new Date().toISOString(),
      address: ST.address, auto: ST.auto, size: ST.size, method: ST.method, mass: ST.mass,
      answers: ST.answers, notes: ST.notes,
      result: RULES.evaluate(ST.answers, ctx),
      methods: RULES.recommend(ST.answers, ctx)
    };
    var name = "container-access-" + (ST.address.postcode || "au") + "-" + Date.now() + ".json";
    downloadFile(name, JSON.stringify(payload, null, 2), "application/json");
    toast(t("toast.exported"), "ok");
  }
  function generateReport(){
    if (!ST.address){ toast(bi("Search an address first.", "请先搜索地址。"), "err"); return; }
    var ctx = { size: ST.size, mass: ST.mass };
    var result = ST.result || RULES.evaluate(ST.answers, ctx);
    var methods = ST.methods && ST.methods.length ? ST.methods : RULES.recommend(ST.answers, ctx);
    var extras = ST.extras && ST.extras.length ? ST.extras : RULES.extraChecks(ST.answers, ctx, result);
    var ok = REPORT.generate({
      lang: window.currentLang, id: "CA" + Date.now(), address: ST.address, auto: ST.auto,
      size: ST.size, method: ST.method, mass: ST.mass, answers: clone(ST.answers), notes: ST.notes,
      result: result, methods: methods, extras: extras
    });
    if (!ok){
      if (window.__lastReportHtml){
        var w = window.open("", "_blank");
        if (w){ w.document.write(window.__lastReportHtml); w.document.close(); }
        else toast(t("toast.reportBlocked"), "err");
      }
    }
  }
  function copySummary(){
    if (!ST.address) return;
    var ctx = { size: ST.size, mass: ST.mass };
    var text = REPORT.summaryText({
      address: ST.address, size: ST.size, method: ST.method, mass: ST.mass, answers: ST.answers,
      result: ST.result || RULES.evaluate(ST.answers, ctx),
      methods: ST.methods || RULES.recommend(ST.answers, ctx)
    });
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){ toast(t("toast.copied"), "ok"); }).catch(function(){ toast(text); });
    } else {
      toast(text);
    }
  }

  // ---------------- draft ----------------
  function saveDraft(){
    clearTimeout(ST.draftTimer);
    ST.draftTimer = setTimeout(function(){
      try {
        localStorage.setItem(LS_DRAFT, JSON.stringify({
          savedAt: Date.now(), address: ST.address, auto: ST.auto, size: ST.size,
          method: ST.method, mass: ST.mass, answers: ST.answers, notes: ST.notes
        }));
      } catch (e) {}
    }, 500);
  }
  function restoreDraft(){
    try {
      var raw = localStorage.getItem(LS_DRAFT);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (!d || !d.address || !d.savedAt || Date.now() - d.savedAt > 3 * 86400000) return;
      if (!d.answers || !Object.keys(d.answers).length) return;
      ST.address = d.address; ST.auto = d.auto || null; ST.autoFilled = {}; ST.size = d.size || "40GP";
      ST.method = d.method || "auto"; ST.mass = d.mass || 0; ST.answers = d.answers || {}; ST.notes = d.notes || "";
      var notes = $("notesInput"); if (notes) notes.value = ST.notes;
      updateAddressBar();
      showWorkspace();
      if (ST.map){ ST.map.setView(ST.address.lat, ST.address.lon, 16, false); ST.map.setMarker(true); ST.map.setRadius(100); }
      renderCargo(); renderQuestions(); renderVerdict(); renderMethods(); renderNext();
      if (ST.auto) renderAuto(); else loadAuto();
      recompute(); updateStepMeta();
      toast(bi("Draft restored from your last visit.", "已恢复上次未完成的核验。"));
    } catch (e) {}
  }

  // ---------------- demos ----------------
  function loadDemo(key){
    var d = RULES.DEMOS[key];
    if (!d) return;
    ST.address = clone(d.address);
    ST.auto = clone(d.auto);
    ST.autoError = false;
    ST.autoFilled = {};
    ST.size = d.size; ST.method = d.method; ST.mass = d.mass;
    ST.answers = clone(d.answers);
    ST.notes = d.notes || "";
    var notes = $("notesInput"); if (notes) notes.value = ST.notes;
    updateAddressBar();
    showWorkspace();
    if (ST.map){ ST.map.setView(ST.address.lat, ST.address.lon, 16, false); ST.map.setMarker(true); ST.map.setRadius(100); }
    renderCargo(); renderQuestions(); renderVerdict(); renderMethods(); renderNext();
    renderAuto();
    recompute(); updateStepMeta();
    saveDraft();
    toast(t("misc.demoLoaded"), "ok");
  }

  // ---------------- api health ----------------
  function checkApi(){
    var el = $("apiStatus");
    if (!el) return;
    el.className = "api-status";
    el.innerHTML = '<span class="dot"></span><span class="api-status-text">' + escapeHtml(t("api.checking")) + '</span>';
    API.health().then(function(h){
      ST.api = h;
      el.className = "api-status " + (h.online ? "online" : "offline");
      el.innerHTML = '<span class="dot"></span><span class="api-status-text">' + escapeHtml(h.online ? t("api.online") : t("api.offline")) + '</span>';
    }).catch(function(){
      el.className = "api-status offline";
      el.innerHTML = '<span class="dot"></span><span class="api-status-text">' + escapeHtml(t("api.offline")) + '</span>';
    });
  }

  // ---------------- language ----------------
  function switchLang(){
    var next = window.currentLang === "zh" ? "en" : "zh";
    window.setLang(next);
    try { localStorage.setItem(LS_LANG, next); } catch (e) {}
    applyStaticI18n();
    renderCargo();
    renderQuestions();
    if (ST.auto) renderAuto();
    renderVerdict(); renderMethods(); renderNext(); renderSavedMini();
    var modal = $("modalBackdrop");
    if (modal && !modal.hidden){
      var kind = modal.getAttribute("data-kind");
      if (kind && window.MODALS) MODALS.open(kind);
    }
  }

  // ---------------- bind / init ----------------
  function bindStatic(){
    $("langToggle").addEventListener("click", switchLang);
    var menuToggle = $("menuToggle"), mobileMenu = $("mobileMenu");
    if (menuToggle && mobileMenu){
      menuToggle.addEventListener("click", function(){
        var open = mobileMenu.classList.toggle("open");
        mobileMenu.hidden = !open;
        menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    var mobileLang = $("mobileLangToggle");
    if (mobileLang){
      mobileLang.addEventListener("click", function(){
        switchLang();
        if (mobileMenu){ mobileMenu.classList.remove("open"); mobileMenu.hidden = true; }
      });
    }
    $("brandHome").addEventListener("click", function(e){ e.preventDefault(); resetToHome(); });
    $("newAddressBtn").addEventListener("click", function(){
      if (Object.keys(ST.answers).length > 0){
        if (!window.confirm(bi("Change address? Your current answers will be cleared when you select a new address.", "更换地址？选择新地址后会清空当前答题。"))) return;
      }
      resetToHome();
    });
    $("refreshAutoBtn").addEventListener("click", function(){ loadAuto(); });
    $("reportBtn").addEventListener("click", generateReport);
    $("saveBtn").addEventListener("click", saveCheck);
    $("csvBtn").addEventListener("click", exportJSON);
    var notes = $("notesInput");
    notes.addEventListener("input", function(){ ST.notes = notes.value; saveDraft(); });
    document.addEventListener("click", function(e){
      var opt = e.target.closest(".opt");
      if (opt && opt.getAttribute("data-qid")){
        var qid = opt.getAttribute("data-qid");
        var val = opt.getAttribute("data-val");
        if (ST.answers[qid] === val) setAnswer(qid, "");
        else setAnswer(qid, val);
        return;
      }
      var why = e.target.closest("[data-why]");
      if (why){
        var node = why.closest(".question");
        var help = node.querySelector(".q-help");
        if (help) help.classList.toggle("show");
        return;
      }
      var tog = e.target.closest(".step-toggle");
      if (tog){
        var card = tog.closest(".step-card");
        if (card) card.classList.toggle("open");
        return;
      }
      var trigger = e.target.closest("[data-modal]");
      if (trigger){
        var kind = trigger.getAttribute("data-modal");
        var mm = $("mobileMenu");
        if (mm){ mm.classList.remove("open"); mm.hidden = true; }
        if (kind && window.MODALS) MODALS.open(kind);
      }
    });
    qsa("[data-demo]").forEach(function(btn){
      btn.addEventListener("click", function(){ loadDemo(btn.getAttribute("data-demo")); });
    });
    document.addEventListener("keydown", function(e){
      if (e.key === "Escape"){
        var modal = $("modalBackdrop");
        if (modal && !modal.hidden && window.MODALS) MODALS.close();
      }
    });
  }

  function init(){
    var savedLang = null;
    try { savedLang = localStorage.getItem(LS_LANG); } catch (e) {}
    var lang = savedLang || ((navigator.language || "").toLowerCase().indexOf("zh") === 0 ? "zh" : "en");
    window.setLang(lang);
    ST.saved = loadSaved();
    applyStaticI18n();
    renderCargo();
    renderQuestions();
    initMap();
    bindStatic();
    bindSearch();
    renderVerdict();
    renderMethods();
    renderNext();
    renderSavedMini();
    checkApi();
    restoreDraft();
    var count = $("savedCount"); if (count) count.textContent = String(ST.saved.length);
    qsa(".step-card").forEach(function(card){
      var id = card.getAttribute("data-step");
      if (id === "address" || id === "cargo" || id === "core") card.classList.add("open");
    });
  }

  window.APP = {
    state: ST,
    t: function(){ return t.apply(null, arguments); },
    bi: bi,
    toast: toast,
    escapeHtml: escapeHtml,
    selectPlace: selectPlace,
    openSaved: openSaved,
    deleteSaved: deleteSaved,
    loadSaved: loadSaved,
    renderSavedMini: renderSavedMini,
    updateAddressBar: updateAddressBar,
    loadDemo: loadDemo,
    closeModal: function(){ var m = $("modalBackdrop"); if (m) m.hidden = true; },
    openModal: function(kind){ if (window.MODALS) MODALS.open(kind); },
    copySummary: copySummary
  };

  document.addEventListener("DOMContentLoaded", init);
})();
