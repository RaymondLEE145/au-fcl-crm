/* modals.js — guide, standards, disclaimer, saved checks, batch pre-screen */
(function(){
  function $(id){ return document.getElementById(id); }
  function bi(en, zh){ return APP.bi(en, zh); }
  function esc(s){ return APP.escapeHtml(s); }
  function t(key, vars){ return APP.t(key, vars); }
  var KIND_TITLES = { guide: "guide.title", sources: "sources.title", disclaimer: "disclaimer.title", saved: "saved.title", batch: "batch.title", github: "nav.github" };

  function open(kind){
    var backdrop = $("modalBackdrop");
    var body = $("modalBody");
    var title = $("modalTitle");
    if (!backdrop || !body || !KIND_TITLES[kind]) return;
    title.textContent = t(KIND_TITLES[kind]);
    backdrop.setAttribute("data-kind", kind);
    backdrop.hidden = false;
    backdrop.querySelector(".modal").classList.toggle("wide", kind === "guide" || kind === "sources" || kind === "batch");
    body.innerHTML = "";
    if (kind === "guide") buildGuide(body);
    if (kind === "sources") buildSources(body);
    if (kind === "disclaimer") buildDisclaimer(body);
    if (kind === "saved") buildSaved(body);
    if (kind === "batch") buildBatch(body);
    if (kind === "github") buildGithub(body);
    body.scrollTop = 0;
  }
  function close(){
    var backdrop = $("modalBackdrop");
    var body = $("modalBody");
    if (!backdrop) return;
    backdrop.hidden = true;
    backdrop.removeAttribute("data-kind");
    if (body) body.innerHTML = "";
  }

  // ---------- guide ----------
  function diagram(kind){
    var head = '<svg viewBox="0 0 340 130" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="340" height="130" rx="8" fill="#0b1526"/>' +
      '<path d="M10 105h320" stroke="#2b3f61" stroke-width="1.5" stroke-dasharray="5 5"/>';
    var foot = '</svg>';
    if (kind === "tilt"){
      return head +
        '<rect x="40" y="52" width="70" height="30" rx="4" fill="#182a46" stroke="#5f7ba6" stroke-width="1.5"/>' +
        '<circle cx="58" cy="88" r="7" fill="#0b1526" stroke="#8ba3c7" stroke-width="2"/><circle cx="94" cy="88" r="7" fill="#0b1526" stroke="#8ba3c7" stroke-width="2"/>' +
        '<rect x="108" y="46" width="152" height="34" rx="4" fill="#12203a" stroke="#ff8a3d" stroke-width="1.6"/>' +
        '<text x="118" y="67" fill="#ffb072" font-family="Segoe UI,Arial" font-size="10">40ft tilt tray</text>' +
        '<path d="M264 63h56" stroke="#22c55e" stroke-width="1.6" marker-end="url(#arr)"/>' +
        '<text x="266" y="52" fill="#7dd3a6" font-family="Segoe UI,Arial" font-size="8">container + 15 m</text>' +
        '<path d="M156 32v-14M156 18l-4 5M156 18l4 5" stroke="#f5b942" stroke-width="1.4"/>' +
        '<text x="166" y="24" fill="#f5d38a" font-family="Segoe UI,Arial" font-size="8">5.0 m overhead</text>' +
        '<text x="40" y="118" fill="#8ba3c7" font-family="Segoe UI,Arial" font-size="8">min width 3.0–3.5 m · reverse in, tray tilts, container slides off</text>' +
        foot;
    }
    if (kind === "side"){
      return head +
        '<rect x="34" y="60" width="80" height="30" rx="4" fill="#182a46" stroke="#5f7ba6" stroke-width="1.5"/>' +
        '<circle cx="52" cy="96" r="7" fill="#0b1526" stroke="#8ba3c7" stroke-width="2"/><circle cx="94" cy="96" r="7" fill="#0b1526" stroke="#8ba3c7" stroke-width="2"/>' +
        '<rect x="122" y="30" width="120" height="26" rx="4" fill="#12203a" stroke="#ff8a3d" stroke-width="1.6"/>' +
        '<text x="132" y="47" fill="#ffb072" font-family="Segoe UI,Arial" font-size="9">container</text>' +
        '<rect x="122" y="66" width="120" height="26" rx="4" fill="#13243e" stroke="#5f7ba6" stroke-width="1.4"/>' +
        '<text x="132" y="83" fill="#a9c3e6" font-family="Segoe UI,Arial" font-size="9">truck deck</text>' +
        '<path d="M260 48h-14M246 48l5-4M246 48l5 4" stroke="#22c55e" stroke-width="1.5"/>' +
        '<path d="M260 79h-14M246 79l5-4M246 79l5 4" stroke="#22c55e" stroke-width="1.5"/>' +
        '<path d="M118 88h-30M88 88l5-4M88 88l5 4" stroke="#f5b942" stroke-width="1.4"/>' +
        '<text x="196" y="22" fill="#f5d38a" font-family="Segoe UI,Arial" font-size="8">4.5 m overhead · 6 m combined width</text>' +
        '<text x="34" y="118" fill="#8ba3c7" font-family="Segoe UI,Arial" font-size="8">lifts sideways from driver side — best for tight sites</text>' +
        foot;
    }
    return head +
      '<rect x="24" y="56" width="48" height="28" rx="4" fill="#182a46" stroke="#5f7ba6" stroke-width="1.5"/>' +
      '<circle cx="38" cy="90" r="6" fill="#0b1526" stroke="#8ba3c7" stroke-width="2"/>' +
      '<rect x="76" y="50" width="150" height="34" rx="4" fill="#12203a" stroke="#ff8a3d" stroke-width="1.6"/>' +
      '<text x="86" y="71" fill="#ffb072" font-family="Segoe UI,Arial" font-size="10">40ft container on semi-trailer</text>' +
      '<circle cx="206" cy="90" r="6" fill="#0b1526" stroke="#8ba3c7" stroke-width="2"/>' +
      '<path d="M230 67h86" stroke="#22c55e" stroke-width="1.6" marker-end="url(#arr)"/>' +
      '<text x="232" y="56" fill="#7dd3a6" font-family="Segoe UI,Arial" font-size="8">25–30 m clear run</text>' +
      '<text x="24" y="118" fill="#8ba3c7" font-family="Segoe UI,Arial" font-size="8">straight line access · min width 3.5 m · solid hardstand</text>' +
      foot;
  }

  function buildGuide(body){
    var rows = [
      [bi("6 m tilt tray", "6 米倾斜托盘车"), "3.0 m", "5.0 m", bi("container + 15 m", "箱长 + 15 米"), bi("Cheapest 20ft method. Truck reverses, tray tilts, container slides off.", "20 尺最经济。卡车倒车、托盘倾斜、箱体滑落。")],
      [bi("12 m tilt tray", "12 米倾斜托盘车"), "3.5 m", "5.0 m", bi("container + 25–30 m", "箱长 + 25–30 米"), bi("For 40ft containers. Longer approach needed.", "适合 40 尺，需要更长的直线通道。")],
      [bi("Side loader", "侧装机"), "3.5 m", "4.5–5.0 m", bi("10–16 m + 6 m combined width", "10–16 米 + 合并宽度 6 米"), bi("Lifts the container sideways from the driver's side. Best for tight or long narrow sites.", "从司机侧横向吊放，最适合狭窄或进深大的场地。")],
      [bi("Hiab crane truck", "随车吊"), "3.0 m", "5.0 m", bi("13 m", "13 米"), bi("Can lift over fences and walls. Overhead wires are the key constraint.", "可越过围栏和矮墙吊放。主要限制是架空电线。")],
      [bi("Truck & trailer / semi drop", "卡车+挂车 / 半挂落柜"), "3.5 m", "5.0 m", bi("18 m clear; 25–30 m for 40ft side-loader drop", "18 米净空；40 尺侧卸 25–30 米"), bi("Standard FCL delivery. Needs the longest clear run and a solid hardstand.", "标准 FCL 到门，需要最长直线通道与坚实硬化地面。")]
    ];
    var table = '<table><thead><tr><th>' + esc(bi("Method", "方式")) + '</th><th>' + esc(bi("Min width", "最小宽度")) + '</th><th>' + esc(bi("Min overhead", "最小净空")) + '</th><th>' + esc(bi("Working length", "作业长度")) + '</th><th>' + esc(bi("Notes", "说明")) + '</th></tr></thead><tbody>' +
      rows.map(function(r){ return "<tr><td><strong>" + esc(r[0]) + "</strong></td><td>" + esc(r[1]) + "</td><td>" + esc(r[2]) + "</td><td>" + esc(r[3]) + "</td><td>" + esc(r[4]) + "</td></tr>"; }).join("") + "</tbody></table>";
    var measure = [
      bi("Use a tape measure at the narrowest point, with gates fully open and cars moved.", "在最窄处用卷尺测量，门全开、车辆挪走。"),
      bi("Measure the continuous clear straight run from the street centreline to the final container position.", "量从街道中心线到落柜点的连续直线净空。"),
      bi("Measure the drop area length and width; mark the corners with tape or paint.", "量落柜区的长和宽，用胶带或喷漆标出四角。"),
      bi("Check overhead clearance with a laser measure or a long pole — wires, branches, eaves and awnings.", "用激光测距仪或长杆检查上方净空：电线、树枝、屋檐、雨棚。"),
      bi("Use a 1–2 m spirit level or phone inclinometer for street and driveway grades.", "用 1–2 米水平尺或手机测斜仪量街道和车道坡度。"),
      bi("Photograph the gate, driveway, overhead wires and drop point from the street.", "从街边拍摄大门、车道、电线和落柜点。")
    ];
    var glossary = [
      [bi("FCL", "整箱"), bi("Full container load — one shipper's cargo filling the container.", "整箱货 — 一个发货人的货物装满整箱。")],
      [bi("Drop-off / 落柜", "落柜"), bi("The truck leaves the container on site for unpacking, then collects it later.", "卡车把箱放在现场，拆箱后再来提走。")],
      [bi("Live unload / 活卸", "活卸"), bi("The driver waits while the container is unloaded, then leaves with the empty.", "司机等待卸货，然后带走空箱。")],
      [bi("De-hire", "还空柜"), bi("Returning the empty container to the shipping line's nominated depot.", "把空箱还到船公司指定堆场。")],
      [bi("Side loader", "侧装机"), bi("A trailer with hydraulic arms that lifts a container sideways to the ground.", "带液压臂的挂车，把集装箱横向放到地面。")],
      [bi("Tilt tray", "倾斜托盘车"), bi("A truck whose tray tilts so the container slides off the back.", "托盘可倾斜、箱体从尾部滑落的卡车。")],
      [bi("Hiab", "随车吊"), bi("A truck-mounted crane used to lift containers over obstacles.", "车载吊机，可越过障碍物吊放集装箱。")],
      [bi("B-double", "B-double 双挂"), bi("A prime mover towing two trailers, up to 25 m long; restricted to approved networks.", "牵引车拖两个挂车，最长 25 米，只能走批准路网。")]
    ];
    body.innerHTML =
      '<p>' + esc(t("guide.intro")) + '</p>' +
      '<div class="note-box">' + esc(bi("Safety first: never move a container under or near live powerlines. Keep people clear when the truck is reversing.", "安全第一：绝不在带电线路下方或附近移动集装箱；卡车倒车时人员要远离。")) + '</div>' +
      '<h3>' + esc(t("guide.s1")) + '</h3><p>' + esc(t("guide.s1p")) + '</p>' +
      '<h3>' + esc(t("guide.s2")) + '</h3>' + table +
      '<div class="truck-diagram"><div class="diagram">' + diagram("tilt") + '<div class="cap">' + esc(bi("Tilt tray — reverse in, tilt and slide off.", "倾斜托盘车 — 倒车进入，倾斜滑落。")) + '</div></div>' +
      '<div class="diagram">' + diagram("side") + '<div class="cap">' + esc(bi("Side loader — lift sideways, driver's side only.", "侧装机 — 从司机侧横向吊放。")) + '</div></div></div>' +
      '<div class="truck-diagram"><div class="diagram" style="flex:1">' + diagram("semi") + '<div class="cap">' + esc(bi("Semi-trailer drop — longest clear run, best for 40ft FCL.", "半挂落柜 — 需要最长直线通道，适合 40 尺整箱。")) + '</div></div></div>' +
      '<h3>' + esc(t("guide.s3")) + '</h3><p>' + esc(t("guide.s3p")) + '</p><ol>' + measure.map(function(m){ return "<li>" + esc(m) + "</li>"; }).join("") + '</ol>' +
      '<h3>' + esc(t("guide.s4")) + '</h3><p>' + esc(t("guide.s4p")) + '</p>' +
      '<h3>' + esc(t("guide.s5")) + '</h3><p>' + esc(t("guide.s5p")) + '</p>' +
      '<h3>' + esc(bi("Glossary", "术语表")) + '</h3><table><tbody>' + glossary.map(function(g){ return "<tr><td style=\"white-space:nowrap\"><strong>" + esc(g[0]) + "</strong></td><td>" + esc(g[1]) + "</td></tr>"; }).join("") + '</tbody></table>' +
      '<div class="note-box">' + esc(t("guide.disclaimer")) + '</div>';
  }

  // ---------- sources ----------
  function buildSources(body){
    var rows = [
      [bi("6 m tilt tray", "6 米倾斜托盘车"), "3.0 m", "5.0 m", bi("container + 15 m", "箱长 + 15 米"), "ContainerCo"],
      [bi("12 m tilt tray", "12 米倾斜托盘车"), "3.5 m", "5.0 m", bi("container + 25–30 m", "箱长 + 25–30 米"), "ContainerCo"],
      [bi("Semi side loader", "半挂侧装机"), "3.5 m", "5.0 m", bi("25–30 m, 6 m combined width", "25–30 米，合并宽 6 米"), "ContainerCo / Royal Wolf"],
      [bi("6 m Hiab", "6 米随车吊"), "3.0 m", "5.0 m", bi("13 m", "13 米"), "ContainerCo"],
      [bi("Truck & trailer", "卡车+挂车"), "3.5 m", "5.0 m", bi("18 m clear", "18 米净空"), "ContainerCo"],
      [bi("Royal Wolf tilt tray", "Royal Wolf 倾斜托盘车"), "3.0 m", "4.8 m", bi("18 m incl. container", "含箱 18 米"), "Royal Wolf"],
      [bi("Royal Wolf side loader", "Royal Wolf 侧装机"), "3.5 m", "4.5 m", bi("10–16 m", "10–16 米"), "Royal Wolf"]
    ];
    var table = '<table><thead><tr><th>' + esc(bi("Method", "方式")) + '</th><th>' + esc(bi("Min width", "最小宽度")) + '</th><th>' + esc(bi("Min overhead", "最小净空")) + '</th><th>' + esc(bi("Working length", "作业长度")) + '</th><th>' + esc(bi("Reference", "参考")) + '</th></tr></thead><tbody>' +
      rows.map(function(r){ return "<tr><td><strong>" + esc(r[0]) + "</strong></td><td>" + esc(r[1]) + "</td><td>" + esc(r[2]) + "</td><td>" + esc(r[3]) + "</td><td>" + esc(r[4]) + "</td></tr>"; }).join("") + '</tbody></table>';
    var sources = [
      ["NHVR Route Planner", "https://www.nhvr.gov.au/road-access/route-planner"],
      ["NHVR National Network Map", "https://maps.nhvr.gov.au/"],
      ["NHVR — Do I need a permit?", "https://www.nhvr.gov.au/road-access/access-management/do-i-need-a-permit"],
      ["Service NSW — Check approved routes for a Restricted Access Vehicle", "https://www.service.nsw.gov.au/referral/check-approved-routes-for-a-restricted-access-vehicle"],
      ["VicRoads — Heavy vehicle map networks in Victoria", "https://www.vicroads.vic.gov.au/business-and-industry/heavy-vehicle-industry/heavy-vehicle-map-networks-in-victoria/"],
      ["QLD TMR — Heavy vehicle route maps and restrictions", "https://www.tmr.qld.gov.au/business-industry/heavy-vehicles/heavy-vehicle-route-maps-and-restrictions/"],
      ["SA — Approved areas or routes", "https://www.sa.gov.au/topics/driving-and-transport/heavy-vehicles/operating-a-heavy-vehicle/approved-areas-and-routes-maps"],
      ["Main Roads WA — Heavy Vehicle Services", "https://www.mainroads.wa.gov.au/heavy-vehicles/"],
      ["Transport Tasmania — Heavy vehicle access", "https://www.transport.tas.gov.au/vehicles_and_vehicle_inspections/heavy_vehicles/heavy-vehicle-access"],
      ["NT Government — Heavy vehicles", "https://nt.gov.au/driving/heavy-vehicles"],
      ["ACT City Services — Heavy vehicles", "https://www.cityservices.act.gov.au/roads-and-traffic/heavy-vehicles"],
      ["SafeWork NSW — Mobile plant near overhead power lines", "https://www.safework.nsw.gov.au/__data/assets/pdf_file/0005/51908/SW08833-Mobile-plant-operating-near-overhead-power-lines.pdf"],
      ["Energex — Exclusion zones & safety laws", "https://www.energex.com.au/safety/working-near-powerlines/exclusion-zones-and-safety-laws"],
      ["Qube — Container dimensions directory", "https://qube.com.au/wp-content/uploads/2024/04/Container-Dimensions-Directory-v2.pdf"],
      ["Royal Wolf — Container delivery", "https://www.royalwolf.com.au/delivery"],
      ["ContainerCo — Transport delivery requirements", "https://containerco.com.au/transport-delivery-requirements/"],
      ["Hunter Containers — Container delivery methods", "https://huntercontainers.com.au/container-delivery-coverage-nsw/"],
      ["Nominatim usage policy", "https://operations.osmfoundation.org/policies/nominatim/"],
      ["Overpass API — OpenStreetMap wiki", "https://wiki.openstreetmap.org/wiki/Overpass_API"],
      ["Open-Meteo — Elevation API", "https://open-meteo.com/en/docs/elevation-api"],
      ["OpenStreetMap tile usage policy", "https://operations.osmfoundation.org/policies/tiles/"],
      ["AS 2890.2:2018 Off-street commercial vehicle facilities", "https://shop.standards.ie/en-ie/standards/as-2890-2-2018-123559_saig_as_as_2696069/"]
    ];
    body.innerHTML =
      '<p>' + esc(t("sources.intro")) + '</p>' +
      '<h3>' + esc(t("sources.s1")) + '</h3><p>' + esc(t("sources.s1p")) + '</p>' +
      '<h3>' + esc(t("sources.s2")) + '</h3>' + table +
      '<h3>' + esc(t("sources.s3")) + '</h3><p>' + esc(t("sources.s3p")) + '</p>' +
      '<h3>' + esc(t("sources.s4")) + '</h3><p>' + esc(t("sources.s4p")) + '</p>' +
      '<div class="note-box">' + esc(t("sources.note")) + '</div>' +
      '<h3>' + esc(t("sources.s5")) + '</h3><div class="source-list">' +
      sources.map(function(s){ return '<a class="source-item" href="' + esc(s[1]) + '" target="_blank" rel="noopener"><strong>' + esc(s[0]) + '</strong><span>' + esc(s[1]) + '</span></a>'; }).join("") +
      '</div>';
  }

  // ---------- disclaimer ----------
  function buildDisclaimer(body){
    body.innerHTML =
      '<p>' + esc(t("disclaimer.p1")) + '</p>' +
      '<p>' + esc(t("disclaimer.p2")) + '</p>' +
      '<p>' + esc(t("disclaimer.p3")) + '</p>' +
      '<p>' + esc(t("disclaimer.p4")) + '</p>' +
      '<div class="note-box">' + esc(bi("Always follow the road manager's signs, the network operator's exclusion zones and the driver's on-site safety call.", "请始终服从道路管理方标志、电网公司安全距离要求，以及司机的现场安全判断。")) + '</div>';
  }

  // ---------- saved ----------
  function buildSaved(body){
    var arr = APP.loadSaved();
    if (!arr.length){
      body.innerHTML = '<p>' + esc(t("saved.empty")) + '</p>';
      return;
    }
    var html = '<div class="source-list">';
    arr.forEach(function(rec){
      var color = { green: "#22c55e", amber: "#f5b942", orange: "#ff8a3d", red: "#ef4444" }[rec.summary && rec.summary.verdict] || "#64789a";
      var score = rec.summary && rec.summary.total !== null ? rec.summary.total + "/100" : "—";
      html += '<div class="source-item" style="display:flex;align-items:center;gap:10px">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0"></span>' +
        '<div style="flex:1;min-width:0"><strong>' + esc(rec.address ? (rec.address.title || rec.address.display) : "—") + '</strong>' +
        '<span style="display:block;color:var(--dim);font-size:10px;margin-top:2px">' + esc((rec.address && rec.address.suburb) || "") + " " + esc((rec.address && rec.address.state) || "") + ' · ' + esc(score) + ' · ' + esc(new Date(rec.createdAt).toLocaleString()) + '</span></div>' +
        '<button class="btn btn-ghost btn-sm" data-open-saved="' + esc(rec.id) + '">' + esc(t("saved.open")) + '</button>' +
        '<button class="btn btn-ghost btn-sm" data-del-saved="' + esc(rec.id) + '">' + esc(t("saved.delete")) + '</button>' +
        '</div>';
    });
    html += '</div>';
    body.innerHTML = html;
    body.querySelectorAll("[data-open-saved]").forEach(function(btn){
      btn.addEventListener("click", function(){ APP.openSaved(btn.getAttribute("data-open-saved")); close(); });
    });
    body.querySelectorAll("[data-del-saved]").forEach(function(btn){
      btn.addEventListener("click", function(){ APP.deleteSaved(btn.getAttribute("data-del-saved")); buildSaved(body); });
    });
  }

  // ---------- batch ----------
  function batchSignal(auto){
    if (!auto) return { cls: "muted", color: "#64789a", label: bi("Data unavailable", "数据不可用") };
    var bad = (auto.warnings || []).some(function(w){ return w.severity === "bad"; });
    var flags = [];
    if (auto.road && auto.road.width < 5.6) flags.push(bi("narrow", "窄路"));
    if (auto.road && auto.road.noexit) flags.push(bi("dead end", "死胡同"));
    if (auto.lowStructures && auto.lowStructures.length) flags.push(bi("low structure", "限高"));
    if (auto.massLimits && auto.massLimits.length) flags.push(bi("mass limit", "限重"));
    if (auto.powerlines && auto.powerlines.min !== null && auto.powerlines.min < 30) flags.push(bi("powerlines", "电线"));
    if (auto.road && /unpaved|gravel|dirt|ground|grass/i.test(auto.road.surface || "")) flags.push(bi("unsealed", "未硬化"));
    if (auto.warnings && auto.warnings.some(function(w){ return w.code === "warnNoVehicle"; })) flags.push(bi("no vehicle access", "无车辆通道"));
    if (!flags.length) return { cls: "good", color: "#22c55e", label: bi("No flags", "无标记") };
    return { cls: bad ? "bad" : "warn", color: bad ? "#ef4444" : "#f5b942", label: flags.join(", ") };
  }

  function buildBatch(body){
    body.innerHTML =
      '<p>' + esc(t("batch.intro")) + '</p>' +
      '<div class="note-box">' + esc(t("batch.limit")) + ' ' + esc(t("batch.rate")) + '</div>' +
      '<textarea class="batch-area" id="batchInput" placeholder="' + esc(t("batch.placeholder")) + '"></textarea>' +
      '<div class="batch-actions"><button class="btn btn-primary" id="batchRun">' + esc(t("batch.run")) + '</button>' +
      '<span class="batch-progress" id="batchProgress"></span>' +
      '<button class="btn btn-ghost" id="batchExport" disabled>' + esc(t("batch.export")) + '</button></div>' +
      '<div class="batch-results" id="batchResults"><div class="batch-empty">' + esc(bi("Results will appear here.", "结果将在这里显示。")) + '</div></div>';
    var results = [];
    var running = false;
    var runBtn = document.getElementById("batchRun");
    var exportBtn = document.getElementById("batchExport");
    runBtn.addEventListener("click", async function(){
      if (running) return;
      var lines = (document.getElementById("batchInput").value || "").split(/\r?\n/).map(function(s){ return s.trim(); }).filter(function(s){ return s.length > 2; });
      lines = lines.filter(function(v, i, a){ return a.indexOf(v) === i; }).slice(0, 20);
      if (!lines.length){ APP.toast(t("batch.empty"), "err"); return; }
      running = true;
      runBtn.disabled = true;
      exportBtn.disabled = true;
      results = [];
      renderRows();
      for (var i = 0; i < lines.length; i++){
        var prog = document.getElementById("batchProgress");
        if (!prog){ running = false; return; }
        prog.textContent = t("batch.running", { i: i + 1, n: lines.length });
        var row = { input: lines[i], status: "loading" };
        results.push(row);
        renderRows();
        try {
          var places = await API.searchAddress(lines[i], 1);
          if (!places.length){
            row.status = "notfound";
          } else {
            var place = places[0];
            row.place = place;
            var auto = null;
            try {
              var info = await API.roadInfo(place);
              if (info){
                var rd = info.road;
                var rw = [];
                if (rd.width < 5.6) rw.push({ code: "warnNarrow", severity: "warn", vars: {} });
                if (rd.noexit) rw.push({ code: "warnDeadEnd", severity: "warn", vars: {} });
                if (/unpaved|gravel|dirt|ground|grass/i.test(rd.surface || "")) rw.push({ code: "warnUnpaved", severity: "warn", vars: {} });
                if (info.pedestrian) rw.push({ code: "warnNoVehicle", severity: "bad", vars: { road: rd.name } });
                auto = { road: rd, roadOnly: true, warnings: rw, lowStructures: [], massLimits: [], powerlines: { count: 0, min: null, voltage: null }, slope: null };
              }
            } catch (e) { auto = null; row.error = e && e.message ? e.message : "data"; }
            row.auto = auto;
            row.signal = batchSignal(auto);
            row.status = "done";
          }
        } catch (e) {
          row.status = "error";
        }
        renderRows();
      }
      running = false;
      runBtn.disabled = false;
      exportBtn.disabled = false;
      var prog2 = document.getElementById("batchProgress");
      if (prog2) prog2.textContent = t("batch.done", { n: lines.length });
      exportBtn.addEventListener("click", exportCsv, { once: true });
    });

    function renderRows(){
      var wrap = document.getElementById("batchResults");
      if (!wrap) return;
      if (!results.length){ wrap.innerHTML = '<div class="batch-empty">' + esc(bi("Results will appear here.", "结果将在这里显示。")) + '</div>'; return; }
      var html = '<table><thead><tr><th>#</th><th>' + esc(t("batch.colAddress")) + '</th><th>' + esc(t("batch.colSuburb")) + '</th><th>' + esc(t("batch.colRoad")) + '</th><th>' + esc(t("batch.colWidth")) + '</th><th>' + esc(t("batch.colFlags")) + '</th><th></th></tr></thead><tbody>';
      results.forEach(function(r, idx){
        var place = r.place || {};
        var auto = r.auto;
        var signal = r.signal || { color: "#64789a", label: r.status === "loading" ? t("misc.loading") : (r.status === "notfound" ? t("batch.noResult") : "—") };
        html += "<tr><td>" + (idx + 1) + "</td><td>" + esc(r.input) + "</td>" +
          "<td>" + esc((place.suburb || "") + " " + (place.state || "") + " " + (place.postcode || "")) + "</td>" +
          "<td>" + esc(auto && auto.road ? auto.road.name : (place.road || "—")) + "</td>" +
          "<td>" + esc(auto && auto.road ? (auto.road.pedestrian ? "—" : auto.road.width + " m") : "—") + "</td>" +
          "<td><span class=\"batch-signal\" style=\"background:" + signal.color + "\"></span> " + esc(signal.label) + "</td>" +
          "<td>" + (r.status === "done" ? '<button class="btn btn-ghost btn-xs" data-batch-open="' + idx + '">' + esc(t("batch.open")) + '</button>' : "") + "</td></tr>";
      });
      html += "</tbody></table>";
      wrap.innerHTML = html;
      wrap.querySelectorAll("[data-batch-open]").forEach(function(btn){
        btn.addEventListener("click", function(){
          var r = results[Number(btn.getAttribute("data-batch-open"))];
          if (!r || !r.place) return;
          close();
          APP.selectPlace(r.place, r.auto);
        });
      });
    }

    function exportCsv(){
      var rows = [["address", "suburb", "state", "postcode", "lat", "lon", "road", "road_class", "width_est_m", "width_source", "slope_pct", "powerline_min_m", "flags"]];
      results.forEach(function(r){
        if (r.status !== "done" || !r.place) { rows.push([r.input, "", "", "", "", "", "", "", "", "", "", "", "not found"]); return; }
        var a = r.auto || {};
        var sig = batchSignal(r.auto);
        rows.push([r.input, r.place.suburb || "", r.place.state || "", r.place.postcode || "", r.place.lat, r.place.lon, a.road ? a.road.name : "", a.road ? a.road.klass : "", a.road ? a.road.width : "", a.road ? a.road.widthSource : "", a.slope ? a.slope.pct : "", a.powerlines ? a.powerlines.min : "", sig.label]);
      });
      var csv = rows.map(function(row){ return row.map(function(cell){ var s = String(cell === undefined || cell === null ? "" : cell); return '"' + s.replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n");
      var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "container-access-batch-" + Date.now() + ".csv";
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 500);
    }
  }

  // ---------- GitHub Pages guide ----------
  function buildGithub(body){
    var steps = [
      bi("Create an empty GitHub repository, then push this folder from a terminal:", "新建一个空的 GitHub 仓库，然后在项目目录执行："),
      "git init\ngit add .\ngit commit -m \"feat: container access AU\"\ngit branch -M main\ngit remote add origin https://github.com/<your-name>/container-access-au.git\ngit push -u origin main",
      bi("In the repository, open Settings → Pages → Build and deployment → Source, choose GitHub Actions.", "进入仓库 Settings → Pages → Build and deployment → Source，选择 GitHub Actions。"),
      bi("The included .github/workflows/pages.yml deploys automatically. First deployment takes 1–2 minutes; every push to main updates the site.", "仓库已内置 .github/workflows/pages.yml，会自动部署。首次约 1–2 分钟；之后每次 push 到 main 都会更新。"),
      bi("Visit: https://<your-name>.github.io/container-access-au/", "访问：https://<your-name>.github.io/container-access-au/")
    ];
    var structure = [
      "container-access/",
      "├── index.html              # static single-page app",
      "├── assets/css/app.css      # responsive design",
      "├── assets/js/              # i18n, rules, api, map, report, modals, app",
      "├── server.py               # optional local server + API proxy",
      "├── 404.html                # GitHub Pages fallback",
      "├── .github/workflows/      # GitHub Pages deploy workflow",
      "├── docs/                   # report DOCX + deploy guide",
      "└── README.md               # project documentation"
    ].join("\n");
    body.innerHTML =
      '<p>' + esc(bi("This project is a pure static website: no build step, no database, no API key. It can be hosted on GitHub Pages directly.", "本项目是纯静态网站：无需构建、无需数据库、无需 API Key，可直接托管到 GitHub Pages。")) + '</p>' +
      '<h3>' + esc(bi("Deploy in 3 steps", "3 步部署")) + '</h3>' +
      '<ol>' + steps.map(function(s){ return "<li>" + esc(s) + "</li>"; }).join("") + '</ol>' +
      '<div class="codeblock">' + esc(steps[1]) + '</div>' +
      '<h3>' + esc(bi("Repository structure", "仓库结构")) + '</h3>' +
      '<div class="codeblock">' + esc(structure) + '</div>' +
      '<h3>' + esc(bi("Why it works on Pages", "为什么 Pages 可以直接用")) + '</h3>' +
      '<ul>' +
      '<li>' + esc(bi("All paths are relative; it works under https://<user>.github.io/<repo>/.", "所有资源使用相对路径，可在 https://<用户名>.github.io/<仓库>/ 下运行。")) + '</li>' +
      '<li>' + esc(bi("Address, road and elevation data are fetched in the visitor's browser from free public APIs over HTTPS; no server code is required.", "地址、道路、高程数据都在访问者浏览器里通过 HTTPS 调用免费公共 API，不需要服务器代码。")) + '</li>' +
      '<li>' + esc(bi("404.html sends unknown URLs back to the project home, so refreshes on sub-paths do not break.", "404.html 会把未知 URL 跳回首页，刷新子路径不会 404。")) + '</li>' +
      '<li>' + esc(bi("The local Python proxy (/api/...) is optional and is not needed on Pages.", "本地 Python 代理（/api/...）是可选的，Pages 上不需要。")) + '</li>' +
      '</ul>' +
      '<div class="note-box">' + esc(bi("Tip: if you want a custom domain or company branding, edit index.html, assets/js/report.js and add a CNAME file in the repository root.", "提示：需要绑定自定义域名或换公司品牌，改 index.html、assets/js/report.js，并在仓库根目录加 CNAME 文件。")) + '</div>' +
      '<p class="rsub">' + esc(bi("Full guide: docs/deploy-github-pages.md in the repository.", "完整说明见仓库 docs/deploy-github-pages.md。")) + '</p>';
  }

  // backdrop click / close button
  document.addEventListener("DOMContentLoaded", function(){
    var backdrop = $("modalBackdrop");
    var closeBtn = $("modalClose");
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (backdrop) backdrop.addEventListener("click", function(e){ if (e.target === backdrop) close(); });
  });

  window.MODALS = { open: open, close: close };
})();
