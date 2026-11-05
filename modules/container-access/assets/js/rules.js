/* rules.js — container data, questions, scoring, recommendations, demos */
(function(){
  var SIZES = {
    "20GP": { id: "20GP", l: 6.06, w: 2.44, h: 2.59, tare: 2.25, maxPayload: 28.2, label: "20GP" },
    "40GP": { id: "40GP", l: 12.19, w: 2.44, h: 2.59, tare: 3.5, maxPayload: 27.0, label: "40GP" },
    "40HC": { id: "40HC", l: 12.19, w: 2.44, h: 2.90, tare: 4.67, maxPayload: 29.3, label: "40HC" }
  };

  var METHODS = {
    auto:    { id: "auto",    icon: "i-search" },
    semi:    { id: "semi",    icon: "i-truck" },
    tilt:    { id: "tilt",    icon: "i-truck" },
    side:    { id: "side",    icon: "i-truck" },
    crane:   { id: "crane",   icon: "i-truck" },
    shuttle: { id: "shuttle", icon: "i-layers" }
  };

  var CATEGORIES = [
    { id: "route",  weight: 20, labelKey: "catLabels.route" },
    { id: "street", weight: 20, labelKey: "catLabels.street" },
    { id: "entry",  weight: 20, labelKey: "catLabels.entry" },
    { id: "drop",   weight: 30, labelKey: "catLabels.drop" },
    { id: "admin",  weight: 10, labelKey: "catLabels.admin" }
  ];

  var STEPS = [
    { id: "address", titleKey: "step1.title", subKey: "step1.sub", kind: "address" },
    { id: "cargo",   titleKey: "step2.title", subKey: "step2.sub", kind: "cargo" },
    { id: "core",    titleKey: "stepCore.title", subKey: "stepCore.sub", questions: ["roadWidth","gateWidth","entryMode","clearRun","dropLength","dropWidth","dropOverhead","dropSurface","powerlineDistance","networkStatus","massLimit"] },
    { id: "advanced", titleKey: "stepAdv.title", subKey: "stepAdv.sub", questions: ["overheadStreet","deadEnd","streetGrade","streetObstruction","drivewayGrade","drivewaySurface","dropLevel","dropPath","timeRestriction","permitCouncil","strata","treeHeritage","siteRules","inductionInsurance"] }
  ];

  var QUESTIONS = {
    networkStatus: { cat: "route", weight: 6, type: "select", options: {
      approved: { s: 1 }, permit: { s: 0.4, flag: 1 }, restricted: { s: 0.1, flag: 1 }, unknown: { s: 0.5, unknown: 1 } } },
    massLimit: { cat: "route", weight: 6, type: "select", options: {
      none: { s: 1 }, marginal: { s: 0.55, flag: 1 }, below: { s: 0, hard: 1 }, unknown: { s: 0.5, unknown: 1 } } },
    permitCouncil: { cat: "route", weight: 4, type: "select", options: {
      notNeeded: { s: 1 }, secured: { s: 1 }, canApply: { s: 0.55, flag: 1 }, refused: { s: 0, flag: 1 }, unknown: { s: 0.5, unknown: 1 } } },
    timeRestriction: { cat: "route", weight: 4, type: "select", options: {
      none: { s: 1 }, minor: { s: 0.6 }, major: { s: 0.15, flag: 1 }, unknown: { s: 0.5, unknown: 1 } } },

    roadWidth: { cat: "street", weight: 5, type: "select", options: {
      wide: { s: 1 }, medium: { s: 0.65 }, narrow: { s: 0.25, flag: 1 }, unknown: { s: 0.5, unknown: 1 } } },
    deadEnd: { cat: "street", weight: 4, type: "select", options: {
      through: { s: 1 }, turnaround: { s: 0.7 }, reverse: { s: 0.25, flag: 1 }, unknown: { s: 0.5, unknown: 1 } } },
    overheadStreet: { cat: "street", weight: 4, type: "select", options: {
      high: { s: 1 }, ok: { s: 0.6 }, low: { s: 0, hard: 1 }, unknown: { s: 0.5, unknown: 1 } } },
    streetGrade: { cat: "street", weight: 3, type: "select", options: {
      flat: { s: 1 }, moderate: { s: 0.6 }, steep: { s: 0.2, flag: 1 }, unknown: { s: 0.5, unknown: 1 } } },
    streetObstruction: { cat: "street", weight: 4, type: "select", options: {
      clear: { s: 1 }, sometimes: { s: 0.6 }, frequent: { s: 0.15, flag: 1 }, unknown: { s: 0.5, unknown: 1 } } },

    entryMode: { cat: "entry", weight: 6, type: "select", options: {
      enter: { s: 1 }, kerb: { s: 0.65, flag: 1 }, none: { s: 0.05, hard: 1 }, unknown: { s: 0.5, unknown: 1 } } },
    gateWidth: { cat: "entry", weight: 5, type: "select", options: {
      wide: { s: 1 }, good: { s: 0.85 }, tight: { s: 0.65, flag: 1 }, narrow: { s: 0.3, flag: 1 }, tooNarrow: { s: 0, hard: 1 }, kerb: { s: 0.7, flag: 1 }, unknown: { s: 0.5, unknown: 1 } } },
    clearRun: { cat: "entry", weight: 5, type: "number", min: 0, max: 200, suffix: "m", scoreNum: "clearRun" },
    drivewayGrade: { cat: "entry", weight: 4, type: "select", options: {
      flat: { s: 1 }, moderate: { s: 0.55, flag: 1 }, steep: { s: 0.1, flag: 1 }, unknown: { s: 0.5, unknown: 1 } } },
    drivewaySurface: { cat: "entry", weight: 5, type: "select", options: {
      concrete: { s: 1 }, asphalt: { s: 0.8 }, pavers: { s: 0.35, flag: 1 }, grass: { s: 0.05, flag: 1 }, unknown: { s: 0.5, unknown: 1 } } },

    dropLength: { cat: "drop", weight: 5, type: "number", min: 0, max: 80, suffix: "m", scoreNum: "dropLength" },
    dropWidth: { cat: "drop", weight: 4, type: "number", min: 0, max: 30, suffix: "m", scoreNum: "dropWidth" },
    dropLevel: { cat: "drop", weight: 5, type: "select", options: {
      flat: { s: 1 }, slight: { s: 0.55, flag: 1 }, steep: { s: 0.1, flag: 1 }, unknown: { s: 0.5, unknown: 1 } } },
    dropSurface: { cat: "drop", weight: 5, type: "select", options: {
      concrete: { s: 1 }, asphalt: { s: 0.85 }, rock: { s: 0.7 }, pavers: { s: 0.3, flag: 1 }, soft: { s: 0.05, flag: 1 }, unknown: { s: 0.4, unknown: 1 } } },
    dropOverhead: { cat: "drop", weight: 4, type: "select", options: {
      high: { s: 1 }, ok: { s: 0.6 }, low: { s: 0, hard: 1 }, unknown: { s: 0.5, unknown: 1 } } },
    powerlineDistance: { cat: "drop", weight: 4, type: "select", options: {
      far: { s: 1 }, near: { s: 0.55, flag: 1 }, close: { s: 0, hard: 1 }, unknown: { s: 0.5, unknown: 1 } } },
    dropPath: { cat: "drop", weight: 3, type: "select", options: {
      clear: { s: 1 }, removable: { s: 0.65 }, blocked: { s: 0.1, flag: 1 }, unknown: { s: 0.5, unknown: 1 } } },

    strata: { cat: "admin", weight: 3, type: "select", options: {
      approved: { s: 1 }, pending: { s: 0.5, flag: 1 }, refused: { s: 0.1, flag: 1 }, unknown: { s: 0.5, unknown: 1 } } },
    treeHeritage: { cat: "admin", weight: 2, type: "select", options: {
      none: { s: 1 }, conditions: { s: 0.5, flag: 1 }, refused: { s: 0.1, flag: 1 }, unknown: { s: 0.5, unknown: 1 } } },
    siteRules: { cat: "admin", weight: 2, type: "select", options: {
      flexible: { s: 1 }, limited: { s: 0.6 }, severe: { s: 0.2, flag: 1 }, unknown: { s: 0.5, unknown: 1 } } },
    inductionInsurance: { cat: "admin", weight: 3, type: "select", options: {
      simple: { s: 1 }, paperwork: { s: 0.7 }, difficult: { s: 0.3, flag: 1 }, unknown: { s: 0.5, unknown: 1 } } }
  };

  var NUM_DEFAULTS = {
    clearRun: function(size){ return size === "20GP" ? { min: 10, ideal: 20 } : { min: 18, ideal: 30 }; },
    dropLength: function(size){ var L = SIZES[size].l; return { min: L, ideal: L + 1.6 }; },
    dropWidth: function(size){ return { min: 2.6, ideal: 4.2 }; }
  };

  var REASONS = {
    en: {
      needEntry: "Truck must be able to enter the property",
      noEntry: "No property access",
      needGate: "Gate/opening too narrow",
      needRun: "Clear truck run too short",
      needOverhead: "Overhead clearance too low",
      needPower: "Powerlines too close for lifting",
      softGround: "Ground may not carry a loaded truck",
      steep: "Grade too steep",
      blockedPath: "Fence/wall blocks the placement path",
      mass: "Loaded mass may exceed this method",
      kerb: "Kerbside drop needs a permit and lift equipment",
      notFor40: "40ft container is too long for this method here",
      cost: "Extra handling and transport cost",
      ok: "Meets the measured minimums",
      check: "Verify with carrier"
    },
    zh: {
      needEntry: "卡车需要能开进院内",
      noEntry: "无法进入院内",
      needGate: "门宽/开口不足",
      needRun: "卡车直线通道太短",
      needOverhead: "上方净空不足",
      needPower: "电线太近，不能安全吊装",
      softGround: "地面可能承受不了满载卡车",
      steep: "坡度过陡",
      blockedPath: "围栏/墙体阻挡落柜路径",
      mass: "箱货总重可能超过该车型载重",
      kerb: "路边落柜需要许可与吊装设备",
      notFor40: "此处40尺箱过长，不适合该方式",
      cost: "增加操作与运输成本",
      ok: "满足实测最低要求",
      check: "需与承运人确认"
    }
  };

  function reasonText(code, lang){
    var set = REASONS[lang] || REASONS.en;
    return set[code] || code;
  }

  var SCORE_HELPERS = {
    clearRun: function(n, ctx){
      var d = NUM_DEFAULTS.clearRun(ctx.size);
      var s = clamp((n - d.min * 0.75) / (d.ideal - d.min * 0.75), 0, 1);
      if (n < d.min) return { s: Math.min(s, 0.25), flag: 1 };
      return { s: s };
    },
    dropLength: function(n, ctx){
      var d = NUM_DEFAULTS.dropLength(ctx.size);
      var s = clamp((n - d.min) / (d.ideal - d.min), 0, 1);
      if (n < SIZES[ctx.size].l) return { s: 0, flag: 1 };
      return { s: s };
    },
    dropWidth: function(n){
      var s = clamp((n - 2.44) / (4.2 - 2.44), 0, 1);
      if (n < 2.6) return { s: s, hard: 0, flag: 1 };
      return { s: s };
    }
  };

  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

  function questionWeightAnswered(q, raw){
    if (raw === undefined || raw === null || raw === "") return 0;
    if (raw === "__unknown") return q.weight * 0.35;
    return q.weight;
  }

  function scoreOne(q, raw, ctx){
    if (raw === undefined || raw === null || raw === "") return null;
    if (q.type === "number"){
      if (raw === "__unknown") return { s: 0.5, unknown: 1 };
      var n = Number(raw);
      if (!isFinite(n)) return null;
      var fn = SCORE_HELPERS[q.scoreNum];
      var r = fn ? fn(n, ctx) : { s: 0.5 };
      r.value = n;
      return r;
    }
    var opt = q.options[raw];
    if (!opt) return null;
    return { s: opt.s, hard: opt.hard, flag: opt.flag, unknown: opt.unknown };
  }

  function computeScore(answers, ctx){
    var categories = {}, hardFails = [], flags = [], watchouts = [];
    var totalKnown = 0, totalWeightSum = 0, confWeight = 0, totalScoreParts = 0;
    CATEGORIES.forEach(function(cat){
      var cw = 0, got = 0, knownW = 0, weightedScore = 0;
      Object.keys(QUESTIONS).forEach(function(qid){
        var q = QUESTIONS[qid];
        if (q.cat !== cat.id) return;
        totalWeightSum += q.weight;
        var raw = answers[qid];
        if (raw === undefined || raw === null || raw === "") return;
        var r = scoreOne(q, raw, ctx);
        if (!r) return;
        var w = q.weight;
        knownW += w;
        got += r.s * w;
        confWeight += w * (r.unknown ? 0.35 : 1);
        if (r.hard) hardFails.push({ id: qid, cat: cat.id });
        if (r.flag) flags.push({ id: qid, cat: cat.id });
        if (!r.unknown && r.s < 0.6) watchouts.push({ id: qid, score: r.s, weight: w, cat: cat.id });
      });
      var catScore = knownW > 0 ? Math.round((got / knownW) * 100) : null;
      if (catScore !== null){
        categories[cat.id] = { score: catScore, known: knownW, weight: cat.weight };
        weightedScore = catScore * cat.weight;
        totalScoreParts += weightedScore;
        totalKnown += cat.weight;
      }
      cw = knownW;
    });
    var total = totalKnown > 0 ? Math.round(totalScoreParts / totalKnown) : null;
    var confidence = totalWeightSum > 0 ? clamp(confWeight / totalWeightSum, 0, 1) : 0;
    watchouts.sort(function(a, b){ return (b.weight * (1 - b.score)) - (a.weight * (1 - a.score)); });
    return {
      total: total,
      categories: categories,
      hardFails: hardFails,
      flags: flags,
      watchouts: watchouts.slice(0, 5),
      confidence: confidence,
      answeredWeight: confWeight,
      totalWeight: totalWeightSum
    };
  }

  function evaluate(answers, ctx){
    var score = computeScore(answers, ctx);
    var verdict = "none", labelKey = "verdict.unknown", textKey = "verdict.noAddressText";
    if (score.total !== null && score.answeredWeight / score.totalWeight >= 0.3){
      if (score.hardFails.length){
        verdict = "red"; labelKey = "verdict.hard"; textKey = "verdict.hardText";
      } else if (score.total >= 80){
        verdict = "green"; labelKey = "verdict.green"; textKey = "verdict.greenText";
      } else if (score.total >= 62){
        verdict = "amber"; labelKey = "verdict.amber"; textKey = "verdict.amberText";
      } else if (score.total >= 42){
        verdict = "orange"; labelKey = "verdict.orange"; textKey = "verdict.orangeText";
      } else {
        verdict = "red"; labelKey = "verdict.red"; textKey = "verdict.redText";
      }
    }
    score.verdict = verdict;
    score.labelKey = labelKey;
    score.textKey = textKey;
    return score;
  }

  function getAnswerNumber(answers, id){
    var v = answers[id];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v !== "__unknown" && v !== "") return Number(v);
    return null;
  }

  function recommend(answers, ctx){
    var size = SIZES[ctx.size];
    var L = size.l;
    var gate = answers.gateWidth || "unknown";
    var entry = answers.entryMode || "unknown";
    var run = getAnswerNumber(answers, "clearRun");
    var overhead = answers.overheadStreet || "unknown";
    var dropOverhead = answers.dropOverhead || "unknown";
    var surface = answers.drivewaySurface || "unknown";
    var dropSurface = answers.dropSurface || "unknown";
    var level = answers.dropLevel || "unknown";
    var power = answers.powerlineDistance || "unknown";
    var path = answers.dropPath || "unknown";
    var grade = answers.drivewayGrade || "unknown";
    var mass = ctx.mass;
    var out = [];
    var is40 = ctx.size !== "20GP";

    function gateMeters(){
      var map = { wide: 5.2, good: 4.5, tight: 3.75, narrow: 3.2, tooNarrow: 2.7, kerb: 0, unknown: null };
      return map[gate] !== undefined ? map[gate] : null;
    }
    function overheadMeters(){
      var map = { high: 5.6, ok: 5.0, low: 4.2, unknown: null };
      return map[overhead] !== undefined ? map[overhead] : null;
    }
    function dropOverheadMeters(){
      var map = { high: 5.6, ok: 5.0, low: 4.2, unknown: null };
      return map[dropOverhead] !== undefined ? map[dropOverhead] : null;
    }
    function hardGround(){
      return surface === "grass" || dropSurface === "soft";
    }
    function entryBlocked(){
      return entry === "none";
    }
    function add(id, status, reasons){ out.push({ id: id, status: status, reasons: reasons }); }

    // SEPMI / semi drop
    var semiReasons = [];
    if (entryBlocked()) semiReasons.push("noEntry");
    else if (entry === "kerb") semiReasons.push("kerb");
    if (gateMeters() !== null && gateMeters() < 3.6) semiReasons.push("needGate");
    var semiRunMin = is40 ? 25 : 18;
    if (run !== null && run < semiRunMin) semiReasons.push("needRun");
    if (overheadMeters() !== null && overheadMeters() < 5.0) semiReasons.push("needOverhead");
    if (dropOverheadMeters() !== null && dropOverheadMeters() < 5.0) semiReasons.push("needOverhead");
    if (hardGround()) semiReasons.push("softGround");
    if (grade === "steep") semiReasons.push("steep");
    if (power === "close") semiReasons.push("needPower");
    if (path === "blocked") semiReasons.push("blockedPath");
    if (!is40 && gateMeters() !== null && gateMeters() < 3.2) semiReasons.push("needGate");
    var semiStatus = "no";
    if (entry !== "none"){
      if (!semiReasons.length) semiStatus = "rec";
      else if (entry === "kerb" && semiReasons.length === 1 && semiReasons[0] === "kerb") semiStatus = "possible";
    }
    add("semi", semiStatus, semiReasons);

    // TILT TRAY
    var tiltReasons = [];
    var tiltRun = is40 ? 27 : 20;
    if (entryBlocked()) tiltReasons.push("noEntry");
    if (gateMeters() !== null && gateMeters() < (is40 ? 3.5 : 3.0)) tiltReasons.push("needGate");
    if (run !== null && run < tiltRun) tiltReasons.push("needRun");
    var tiltClear = is40 ? 5.0 : 4.8;
    if (overheadMeters() !== null && overheadMeters() < tiltClear) tiltReasons.push("needOverhead");
    if (dropOverheadMeters() !== null && dropOverheadMeters() < 5.0) tiltReasons.push("needOverhead");
    if (hardGround()) tiltReasons.push("softGround");
    if (grade === "steep") tiltReasons.push("steep");
    if (power === "close") tiltReasons.push("needPower");
    if (path === "blocked") tiltReasons.push("blockedPath");
    var tiltStatus = entryBlocked() || entry === "kerb" ? "no" : (tiltReasons.length ? "no" : (is40 ? "possible" : "rec"));
    add("tilt", tiltStatus, tiltReasons);

    // SIDE LOADER
    var sideReasons = [];
    var sideRun = is40 ? 16 : 10;
    if (entryBlocked()) sideReasons.push("noEntry");
    if (gateMeters() !== null && gateMeters() < 3.5) sideReasons.push("needGate");
    if (run !== null && run < sideRun) sideReasons.push("needRun");
    if (overheadMeters() !== null && overheadMeters() < 4.5) sideReasons.push("needOverhead");
    if (dropOverheadMeters() !== null && dropOverheadMeters() < 4.5) sideReasons.push("needOverhead");
    if (power === "close") sideReasons.push("needPower");
    if (dropSurface === "soft") sideReasons.push("softGround");
    if (grade === "steep") sideReasons.push("steep");
    var sideStatus = (sideReasons.length ? "no" : "possible");
    if (is40 && sideReasons.length === 0 && (run === null || run < 27)) sideStatus = "rec";
    if (!is40 && sideReasons.length === 0 && (run === null || run < 20)) sideStatus = "rec";
    add("side", sideStatus, sideReasons);

    // CRANE / HIAB
    var craneReasons = [];
    if (entryBlocked()) craneReasons.push("noEntry");
    if (gateMeters() !== null && gateMeters() < 3.0) craneReasons.push("needGate");
    if (power === "close") craneReasons.push("needPower");
    if (run !== null && run < 12) craneReasons.push("needRun");
    if (dropOverheadMeters() !== null && dropOverheadMeters() < 5.0) craneReasons.push("needOverhead");
    if (is40) craneReasons.push("notFor40");
    var craneStatus = (craneReasons.length ? "possible" : "possible");
    if (craneReasons.length && craneReasons.indexOf("needPower") >= 0) craneStatus = "no";
    if (path === "blocked" && craneReasons.filter(function(x){ return x !== "blockedPath"; }).length === 0) craneStatus = "rec";
    add("crane", craneStatus, craneReasons);

    // SHUTTLE
    add("shuttle", "possible", []);
    return out;
  }

  var EXTRA_CHECKS = {
    en: {
      powerline: "Powerlines close: ask the network operator for written safety advice before any Hiab or crane lift.",
      deadend: "Dead-end street: plan the reversing manoeuvre and a spotter; check the turn-around area.",
      steep: "Steep grade: plan for a dry day, a spotter and wheel chocks; consider a smaller truck.",
      soft: "Soft ground: use load-spreading mats or a temporary hardstand; have a recovery plan.",
      kerb: "Kerbside drop: confirm council permission to occupy the road reserve and traffic control requirements.",
      lowbridge: "Low bridge/structure: confirm the actual clearance with the road manager (signs can be conservative).",
      mass: "Mass limits: check the route and bridge postings against the loaded VGM.",
      narrow: "Narrow street: check for parked cars, bins and overhanging trees on the day.",
      heritage: "Tree/heritage controls: get anything in writing before pruning or driving over roots.",
      strata: "Strata/estate: get written approval and check delivery hours and insurance requirements."
    },
    zh: {
      powerline: "电线较近：任何随车吊/吊装作业前，向电网公司索取书面安全意见。",
      deadend: "死胡同：提前规划倒车路线与指挥员，核实掉头空间。",
      steep: "坡度较陡：安排干燥天气、指挥员与轮挡，必要时改用小车。",
      soft: "地面偏软：使用承压垫板或临时硬化，并准备拖车方案。",
      kerb: "路边落柜：确认 council 占用道路保护区许可与交通管制要求。",
      lowbridge: "低桥/低结构：向道路管理方核实实际净空（标志值可能保守）。",
      mass: "限重：用核实总重（VGM）逐一核对路线与桥梁限重。",
      narrow: "街道狭窄：当天再次确认路边停车、垃圾桶和低枝情况。",
      heritage: "树木/遗产限制：修剪或压过树根前，先取得书面许可。",
      strata: "物业/小区：取得书面同意，核实送货时段与保险要求。"
    }
  };

  function extraChecks(answers, ctx, scoreResult){
    var keys = [];
    function answered(id, val){ return answers[id] === val; }
    if (answered("powerlineDistance", "near") || answered("powerlineDistance", "close")) keys.push("powerline");
    if (answered("deadEnd", "reverse")) keys.push("deadend");
    if (answered("streetGrade", "steep") || answered("drivewayGrade", "steep")) keys.push("steep");
    if (answered("drivewaySurface", "grass") || answered("dropSurface", "soft")) keys.push("soft");
    if (answered("entryMode", "kerb")) keys.push("kerb");
    if (answered("massLimit", "below") || answered("massLimit", "marginal")) keys.push("mass");
    if (answered("roadWidth", "narrow")) keys.push("narrow");
    if (answered("treeHeritage", "conditions") || answered("treeHeritage", "refused")) keys.push("heritage");
    if (answered("strata", "pending") || answered("strata", "refused")) keys.push("strata");
    return keys;
  }

  var STATES = {
    NSW: { name: "New South Wales", map: "https://www.service.nsw.gov.au/referral/check-approved-routes-for-a-restricted-access-vehicle", council: "https://www.olg.nsw.gov.au/find-my-council/" },
    VIC: { name: "Victoria", map: "https://www.vicroads.vic.gov.au/business-and-industry/heavy-vehicle-industry/heavy-vehicle-map-networks-in-victoria/", council: "https://www.localgovernment.vic.gov.au/council/your-council" },
    QLD: { name: "Queensland", map: "https://www.tmr.qld.gov.au/business-industry/heavy-vehicles/heavy-vehicle-route-maps-and-restrictions/", council: "https://www.localgovernment.qld.gov.au/councils" },
    SA: { name: "South Australia", map: "https://www.sa.gov.au/topics/driving-and-transport/heavy-vehicles/operating-a-heavy-vehicle/approved-areas-and-routes-maps", council: "https://www.lga.sa.gov.au/councils" },
    WA: { name: "Western Australia", map: "https://www.mainroads.wa.gov.au/heavy-vehicles/", council: "https://www.walga.asn.au/councils" },
    TAS: { name: "Tasmania", map: "https://www.transport.tas.gov.au/vehicles_and_vehicle_inspections/heavy_vehicles/heavy-vehicle-access", council: "https://www.lgat.tas.gov.au/" },
    NT: { name: "Northern Territory", map: "https://nt.gov.au/driving/heavy-vehicles", council: "https://www.lgat.nt.gov.au/" },
    ACT: { name: "Australian Capital Territory", map: "https://www.cityservices.act.gov.au/roads-and-traffic/heavy-vehicles", council: "https://www.cityservices.act.gov.au/" }
  };

  function stateInfo(state){
    return STATES[state] || null;
  }

  var CHECKLIST_KEYS = ["measureGate","measureRun","measureDrop","overhead","power","ground","turn","mass","permit","strata","induction","photos","final"];

  function demoAuto(extra){
    var base = {
      demo: true, road: { name: "Demo Road", klass: "industrial", lanes: 2, width: 8.4, widthSource: "demo", speed: 50, surface: "asphalt", oneway: false, noexit: false, tags: {} },
      restrictions: [], powerlines: { count: 0, min: null, voltage: null }, slope: { pct: 1.2 }, warnings: [], fetchedAt: Date.now()
    };
    return Object.assign(base, extra || {});
  }

  var DEMOS = {
    green: {
      address: { display: "45 Industrial Drive, Sunshine West VIC 3020", lat: -37.7926, lon: 144.8325, suburb: "Sunshine West", state: "VIC", postcode: "3020", road: "Industrial Drive" },
      auto: demoAuto({ road: { name: "Industrial Drive", klass: "industrial", lanes: 2, width: 9.2, widthSource: "demo", speed: 50, surface: "asphalt", oneway: false, noexit: false, tags: {} }, slope: { pct: 0.8 }, powerlines: { count: 1, min: 48, voltage: "22000" }, warnings: [] }),
      size: "40GP", method: "semi", mass: 24,
      answers: { networkStatus: "approved", massLimit: "none", permitCouncil: "notNeeded", timeRestriction: "none", roadWidth: "wide", deadEnd: "through", overheadStreet: "high", streetGrade: "flat", streetObstruction: "clear", entryMode: "enter", gateWidth: "wide", clearRun: 34, drivewayGrade: "flat", drivewaySurface: "concrete", dropLength: 16, dropWidth: 6, dropLevel: "flat", dropSurface: "concrete", dropOverhead: "high", powerlineDistance: "far", dropPath: "clear", strata: "approved", treeHeritage: "none", siteRules: "flexible", inductionInsurance: "simple" },
      notes: "Demo: wide industrial estate, straight drive-in, concrete hardstand."
    },
    amber: {
      address: { display: "12 Banksia Street, Marrickville NSW 2204", lat: -33.9112, lon: 151.1558, suburb: "Marrickville", state: "NSW", postcode: "2204", road: "Banksia Street" },
      auto: demoAuto({ road: { name: "Banksia Street", klass: "residential", lanes: 2, width: 6.1, widthSource: "demo", speed: 40, surface: "asphalt", oneway: false, noexit: false, tags: {} }, slope: { pct: 7.4 }, powerlines: { count: 2, min: 8, voltage: "11000" }, warnings: [{ code: "warnClose", severity: "warn", vars: { d: 8 } }] }),
      size: "20GP", method: "side", mass: 18,
      answers: { networkStatus: "permit", massLimit: "none", permitCouncil: "canApply", timeRestriction: "minor", roadWidth: "medium", deadEnd: "turnaround", overheadStreet: "ok", streetGrade: "moderate", streetObstruction: "sometimes", entryMode: "enter", gateWidth: "tight", clearRun: 14, drivewayGrade: "moderate", drivewaySurface: "asphalt", dropLength: 7.2, dropWidth: 3.4, dropLevel: "slight", dropSurface: "rock", dropOverhead: "ok", powerlineDistance: "near", dropPath: "clear", strata: "approved", treeHeritage: "conditions", siteRules: "limited", inductionInsurance: "paperwork" },
      notes: "Demo: 20ft side loader, 3.7 m gate, lines 8 m away, narrow street."
    },
    red: {
      address: { display: "8 Wonga Court, Nerang QLD 4211", lat: -27.9921, lon: 153.3358, suburb: "Nerang", state: "QLD", postcode: "4211", road: "Wonga Court" },
      auto: demoAuto({ road: { name: "Wonga Court", klass: "residential", lanes: 1, width: 4.2, widthSource: "demo", speed: 40, surface: "asphalt", oneway: false, noexit: true, tags: { noexit: "yes" } }, slope: { pct: 11.5 }, powerlines: { count: 2, min: 2.4, voltage: "11000" }, warnings: [{ code: "warnClose", severity: "bad", vars: { d: 2.4 } }, { code: "warnDeadEnd", severity: "warn", vars: {} }, { code: "warnNarrow", severity: "warn", vars: {} }] }),
      size: "40GP", method: "semi", mass: 27,
      answers: { networkStatus: "restricted", massLimit: "below", permitCouncil: "refused", timeRestriction: "major", roadWidth: "narrow", deadEnd: "reverse", overheadStreet: "low", streetGrade: "steep", streetObstruction: "frequent", entryMode: "kerb", gateWidth: "tooNarrow", clearRun: 8, drivewayGrade: "steep", drivewaySurface: "grass", dropLength: 8, dropWidth: 2.8, dropLevel: "steep", dropSurface: "soft", dropOverhead: "low", powerlineDistance: "close", dropPath: "blocked", strata: "refused", treeHeritage: "refused", siteRules: "severe", inductionInsurance: "difficult" },
      notes: "Demo: narrow dead-end court, 2.4 m overhead lines, 2.8 m gate, soft ground."
    }
  };

  window.RULES = {
    SIZES: SIZES, METHODS: METHODS, CATEGORIES: CATEGORIES, STEPS: STEPS, QUESTIONS: QUESTIONS,
    CORE_QUESTIONS: ["roadWidth","gateWidth","entryMode","clearRun","dropLength","dropWidth","dropOverhead","dropSurface","powerlineDistance","networkStatus","massLimit"],
    NUM_DEFAULTS: NUM_DEFAULTS, STATES: STATES, DEMOS: DEMOS, CHECKLIST_KEYS: CHECKLIST_KEYS,
    computeScore: computeScore, evaluate: evaluate, recommend: recommend,
    getAnswerNumber: getAnswerNumber, stateInfo: stateInfo, reasonText: reasonText,
    extraChecks: extraChecks,
    answerScore: function(qid, raw, ctx){ return scoreOne(QUESTIONS[qid], raw, ctx); },
    extraCheckText: function(keys, lang){
      var set = EXTRA_CHECKS[lang] || EXTRA_CHECKS.en;
      return (keys || []).map(function(k){ return set[k] || k; });
    }
  };
})();
