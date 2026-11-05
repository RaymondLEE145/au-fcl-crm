/* report.js — printable site verification report */
(function(){
  function esc(s){
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function pad(n){ return n < 10 ? "0" + n : "" + n; }
  function fmtDate(d){
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function clsScore(s, hard){
    if (hard) return "bad";
    if (s === null || s === undefined) return "muted";
    if (s >= 0.8) return "good";
    if (s >= 0.5) return "mid";
    return "bad";
  }
  function answerText(qid, raw){
    var q = RULES.QUESTIONS[qid];
    if (!q) return "";
    if (raw === undefined || raw === null || raw === "") return t("report.notAnswered");
    if (q.type === "number"){
      if (raw === "__unknown") return t("report.unknown");
      return String(raw) + " " + t("units.m");
    }
    if (raw === "unknown") return t("report.unknown");
    var v = t("q." + qid + ".opt." + raw);
    return v === "q." + qid + ".opt." + raw ? raw : v;
  }
  function verdictColor(v){
    return { green: "good", amber: "mid", orange: "warn", red: "bad", none: "muted" }[v] || "muted";
  }

  function buildCss(){
    return [
      "*{box-sizing:border-box}",
      "body{margin:0;background:#f3f5f9;color:#1a2434;font-family:'Segoe UI',Arial,'PingFang SC','Microsoft YaHei',sans-serif;font-size:11.5px;line-height:1.5}",
      ".rpage{max-width:210mm;margin:16px auto;background:#fff;padding:18mm 15mm;box-shadow:0 8px 30px rgba(0,0,0,.12)}",
      ".rhead{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #ff6a2b;padding-bottom:10px}",
      ".rbrand{display:flex;gap:10px;align-items:center}",
      ".rlogo{width:34px;height:34px;border-radius:8px;background:#ff6a2b;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:15px}",
      ".rbrand b{display:block;font-size:14px;letter-spacing:.1em}",
      ".rbrand span{display:block;font-size:8.5px;color:#66758c;letter-spacing:.12em;text-transform:uppercase}",
      ".rmeta{text-align:right;font-size:9px;color:#66758c;line-height:1.6}",
      "h1{font-size:20px;margin:20px 0 4px;letter-spacing:-.01em}",
      "h2{font-size:12.5px;margin:20px 0 7px;text-transform:uppercase;letter-spacing:.08em;color:#40506a;border-bottom:1px solid #dfe5ef;padding-bottom:4px}",
      "h3{font-size:11.5px;margin:12px 0 4px}",
      "p{margin:4px 0}",
      ".rsub{font-size:10px;color:#66758c}",
      ".verdict-box{display:flex;gap:16px;align-items:center;border:1px solid #dfe5ef;border-left:6px solid #999;border-radius:8px;padding:12px 14px;margin-top:14px;background:#fafbfd}",
      ".verdict-box.good{border-left-color:#16a34a;background:#f0fbf3}",
      ".verdict-box.mid{border-left-color:#d9971a;background:#fdf9ee}",
      ".verdict-box.warn{border-left-color:#f97316;background:#fff7ef}",
      ".verdict-box.bad{border-left-color:#dc2626;background:#fdf1f1}",
      ".vscore{font-size:34px;font-weight:800;line-height:1;min-width:74px;text-align:center}",
      ".vscore small{display:block;font-size:8px;color:#66758c;font-weight:600;margin-top:3px;letter-spacing:.06em}",
      ".vbody strong{font-size:14px}",
      ".vbody p{font-size:10px;color:#4b5a72;margin-top:3px}",
      ".vconf{margin-left:auto;text-align:right;font-size:9px;color:#66758c}",
      ".facts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}",
      ".fact{border:1px solid #e3e8f0;border-radius:6px;padding:7px 9px}",
      ".fact .k{font-size:7.5px;text-transform:uppercase;letter-spacing:.08em;color:#7a889d}",
      ".fact .v{font-size:11px;font-weight:700;margin-top:2px;word-break:break-word}",
      "table{width:100%;border-collapse:collapse;margin:6px 0;font-size:9.5px}",
      "th{text-align:left;font-size:7.5px;text-transform:uppercase;letter-spacing:.07em;color:#7a889d;padding:5px 6px;border-bottom:1px solid #cbd4e1}",
      "td{padding:5px 6px;border-bottom:1px solid #eef1f6;vertical-align:top}",
      "tr.hard td{background:#fdf1f1}",
      ".tag{display:inline-block;font-size:7.5px;font-weight:700;padding:2px 5px;border-radius:4px;letter-spacing:.04em}",
      ".tag.good{background:#dcfce7;color:#166534}.tag.mid{background:#fef3c7;color:#92400e}.tag.bad{background:#fee2e2;color:#991b1b}.tag.warn{background:#ffedd5;color:#9a3412}.tag.muted{background:#eef1f6;color:#64748b}",
      ".cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}",
      ".box{border:1px solid #e3e8f0;border-radius:6px;padding:9px 11px;background:#fafbfd}",
      ".list{margin:4px 0 0 14px;padding:0}.list li{margin:2px 0}",
      ".warn{color:#b45309}.bad{color:#b91c1c}",
      ".checklist{list-style:none;padding:0;margin:4px 0;display:grid;grid-template-columns:1fr 1fr;gap:3px 18px}",
      ".checklist li{font-size:9.5px;padding:2px 0 2px 18px;position:relative}",
      ".checklist li:before{content:'';position:absolute;left:0;top:3px;width:9px;height:9px;border:1px solid #94a3b8;border-radius:2px}",
      ".links-src{font-size:8.5px;color:#55657d;word-break:break-all}",
      ".rfoot{margin-top:18px;border-top:1px solid #dfe5ef;padding-top:8px;font-size:8px;color:#7a889d;line-height:1.5}",
      ".rprint{position:fixed;top:12px;right:12px;display:flex;gap:8px}",
      ".rprint button{border:0;border-radius:6px;padding:8px 12px;font-size:11px;cursor:pointer;background:#ff6a2b;color:#fff;font-weight:700}",
      ".rprint button.alt{background:#e2e8f0;color:#1a2434}",
      "@media print{body{background:#fff}.rpage{box-shadow:none;margin:0;max-width:none;padding:10mm 10mm;width:210mm}.rprint{display:none}.cols{grid-template-columns:1fr 1fr}tr,.box,.verdict-box{page-break-inside:avoid}h2{page-break-after:avoid}}",
      "@page{size:A4;margin:10mm}"
    ].join("");
  }

  function buildReport(st){
    var lang = window.currentLang;
    var result = st.result;
    var vc = verdictColor(result.verdict);
    var addr = st.address || {};
    var rows = [];
    RULES.STEPS.forEach(function(step){
      if (!step.questions) return;
      rows.push("<h3>" + esc(step.cat ? t("catLabels." + step.cat) : t(step.titleKey)) + "</h3>");
      rows.push("<table><thead><tr><th style=\"width:44%\">" + esc(t("report.question")) + "</th><th style=\"width:34%\">" + esc(t("report.answer")) + "</th><th>" + esc(t("report.result")) + "</th></tr></thead><tbody>");
      step.questions.forEach(function(qid){
        var raw = st.answers[qid];
        var q = RULES.QUESTIONS[qid];
        var sc = raw === undefined || raw === null || raw === "" ? null : RULES.answerScore(qid, raw, { size: st.size });
        var hard = !!(sc && sc.hard);
        var cls = clsScore(sc ? sc.s : null, hard);
        var label = t("q." + qid + ".label");
        var status = t("report.notAnswered");
        if (sc) status = hard ? t("verdict.blockers") : (sc.s >= 0.8 ? t("misc.high") : (sc.s >= 0.5 ? t("misc.medium") : t("misc.low")));
        rows.push("<tr class=\"" + (hard ? "hard" : "") + "\"><td>" + esc(label) + "</td><td>" + esc(answerText(qid, raw)) + "</td><td><span class=\"tag " + cls + "\">" + esc(status) + "</span></td></tr>");
      });
      rows.push("</tbody></table>");
    });

    var autoRows = "";
    if (st.auto && st.auto.road){
      var a = st.auto;
      var list = [
        [t("auto.road"), a.road.name + " · " + (a.road.klass || "")],
        [t("auto.tileLanes"), a.road.laneText || t("auto.notMapped")],
        [t("auto.width"), a.road.width + " m (" + a.road.widthSource + ")"],
        [t("auto.tileSpeed"), a.road.speed ? a.road.speed + " km/h" : t("auto.notMapped")],
        [t("auto.tileSurface"), a.road.surface || t("auto.notMapped")],
        [t("auto.slope"), a.slope ? a.slope.pct + "%" : t("auto.notMapped")],
        [t("auto.powerlines"), a.powerlines && a.powerlines.min !== null ? a.powerlines.min + " m" + (a.powerlines.voltage ? " · " + a.powerlines.voltage + " V" : "") : t("auto.none")],
        [t("auto.deadend"), a.road.noexit ? t("misc.yes") : t("misc.no")]
      ];
      autoRows = list.map(function(x){ return "<tr><td>" + esc(x[0]) + "</td><td>" + esc(x[1]) + "</td></tr>"; }).join("");
      var hazards = "";
      if (a.lowStructures && a.lowStructures.length) hazards += "<li class=\"bad\">" + esc(t("auto.warnBridgeTitle")) + ": " + esc(a.lowStructures[0].name) + " — " + esc(a.lowStructures[0].height) + " m</li>";
      if (a.massLimits && a.massLimits.length) hazards += "<li class=\"warn\">" + esc(t("auto.warnWeightTitle")) + ": " + esc(a.massLimits[0].name) + " — " + esc(a.massLimits[0].weight) + " t</li>";
      (a.warnings || []).forEach(function(w){ hazards += "<li class=\"" + (w.severity === "bad" ? "bad" : "warn") + "\">" + esc(t("auto." + w.code, w.vars || {})) + "</li>"; });
      autoRows += "<tr><td>" + esc(t("auto.restrictions")) + "</td><td>" + (hazards ? "<ul class=\"list\">" + hazards + "</ul>" : esc(t("auto.none"))) + "</td></tr>";
    } else {
      autoRows = "<tr><td colspan=\"2\">" + esc(t("auto.error")) + "</td></tr>";
    }

    var blockerHtml = "";
    if (result.hardFails && result.hardFails.length){
      blockerHtml = "<ul class=\"list\">" + result.hardFails.map(function(b){ return "<li class=\"bad\">" + esc(t("q." + b.id + ".label")) + " — " + esc(answerText(b.id, st.answers[b.id])) + "</li>"; }).join("") + "</ul>";
    } else {
      blockerHtml = "<p>" + esc(t("auto.none")) + "</p>";
    }

    var watchHtml = "";
    if (result.watchouts && result.watchouts.length){
      watchHtml = "<ul class=\"list\">" + result.watchouts.map(function(w){ return "<li>" + esc(t("q." + w.id + ".label")) + " — " + esc(answerText(w.id, st.answers[w.id])) + "</li>"; }).join("") + "</ul>";
    }

    var methodHtml = (st.methods || []).filter(function(m){ return m.id !== "auto"; }).map(function(m){
      var status = m.status === "rec" ? t("methods.rec") : (m.status === "possible" ? t("methods.possible") : t("methods.no"));
      var cls = m.status === "rec" ? "good" : (m.status === "possible" ? "mid" : "bad");
      var reasons = "";
      if (m.reasons && m.reasons.length){
        reasons = "<div style=\"font-size:8.5px;color:#7a889d;margin-top:2px\">" + m.reasons.map(function(r){ return esc(RULES.reasonText(r, lang)); }).join(" · ") + "</div>";
      }
      var name = t("method." + m.id);
      if (m.id === "tilt") name = t("method.tilt");
      if (m.id === "side") name = t("method.side");
      if (m.id === "crane") name = t("method.crane");
      if (m.id === "semi") name = t("method.semi");
      if (m.id === "shuttle") name = t("method.shuttle");
      return "<tr><td><strong>" + esc(name) + "</strong>" + reasons + "</td><td><span class=\"tag " + cls + "\">" + esc(status) + "</span></td></tr>";
    }).join("");
    methodHtml = "<table><thead><tr><th>" + esc(t("methods.title")) + "</th><th>" + esc(t("report.result")) + "</th></tr></thead><tbody>" + methodHtml + "</tbody></table>";

    var checklist = (t("checklist.items") || []).slice();
    if (st.extras && st.extras.length){
      RULES.extraCheckText(st.extras, lang).forEach(function(x){ checklist.push(x); });
    }
    var checklistHtml = "<ul class=\"checklist\">" + checklist.map(function(x){ return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";

    var state = RULES.stateInfo(addr.state);
    var links = [
      ["NHVR Route Planner", "https://www.nhvr.gov.au/road-access/route-planner"],
      ["NHVR National Network Map", "https://maps.nhvr.gov.au/"]
    ];
    if (state && state.map) links.push([t("next.state") + " (" + (addr.state || "") + ")", state.map]);
    if (state && state.council) links.push([t("next.council"), state.council]);
    var linkHtml = links.map(function(x){ return "<li><strong>" + esc(x[0]) + "</strong> — " + esc(x[1]) + "</li>"; }).join("");

    var notes = st.notes ? "<h2>" + esc(t("report.notes")) + "</h2><p>" + esc(st.notes).replace(/\n/g, "<br>") + "</p>" : "";
    var confLabel = result.confidence >= 0.85 ? t("verdict.confHigh") : (result.confidence >= 0.6 ? t("verdict.confMed") : t("verdict.confLow"));
    var ref = "CA-" + (st.id || String(Date.now())).slice(-8).toUpperCase();
    var now = new Date();
    var facts = [
      [t("report.container"), st.size + " · " + (RULES.SIZES[st.size] ? RULES.SIZES[st.size].l + " × " + RULES.SIZES[st.size].w + " × " + RULES.SIZES[st.size].h + " m" : "")],
      [t("cargo.massLabel"), (st.mass ? st.mass + " t" : t("report.na"))],
      [t("report.method"), t("method." + (st.method || "auto"))],
      [t("report.confidence"), confLabel]
    ];
    var factsHtml = facts.map(function(f){ return "<div class=\"fact\"><div class=\"k\">" + esc(f[0]) + "</div><div class=\"v\">" + esc(f[1]) + "</div></div>"; }).join("");
    var verdictText = t(result.textKey || "verdict.noAddressText");
    var labelText = t(result.labelKey || "verdict.unknown");

    var html = "<!doctype html><html lang=\"" + (lang === "zh" ? "zh-CN" : "en-AU") + "\"><head><meta charset=\"utf-8\"><title>" +
      esc(t("report.title")) + " — " + esc(addr.display || "") + "</title><style>" + buildCss() + "</style></head><body>" +
      "<div class=\"rprint\"><button onclick=\"window.print()\">" + esc(t("actions.print")) + "</button><button class=\"alt\" onclick=\"window.close()\">" + esc(t("actions.close")) + "</button></div>" +
      "<div class=\"rpage\">" +
      "<div class=\"rhead\"><div class=\"rbrand\"><div class=\"rlogo\">CA</div><div><b>CONTAINER ACCESS AU</b><span>" + esc(t("app.tagline")) + "</span></div></div>" +
      "<div class=\"rmeta\">" + esc(t("report.ref")) + ": " + esc(ref) + "<br>" + esc(t("report.date")) + ": " + esc(fmtDate(now)) + "<br>" + esc(t("report.generated")) + " " + esc(t("app.name")) + "</div></div>" +
      "<h1>" + esc(t("report.title")) + "</h1><div class=\"rsub\">" + esc(t("report.subtitle")) + "</div>" +
      "<div class=\"verdict-box " + vc + "\"><div class=\"vscore\">" + (result.total === null ? "—" : result.total) + "<small>/100 " + esc(t("report.score")) + "</small></div>" +
      "<div class=\"vbody\"><strong>" + esc(labelText) + "</strong><p>" + esc(verdictText) + "</p></div>" +
      "<div class=\"vconf\">" + esc(t("report.confidence")) + "<br><b>" + esc(confLabel) + "</b></div></div>" +
      "<div class=\"facts\">" + factsHtml + "</div>" +
      "<h2>" + esc(t("report.address")) + "</h2><p><strong>" + esc(addr.display || "—") + "</strong><br><span class=\"rsub\">" +
      esc(addr.suburb || "") + " " + esc(addr.state || "") + " " + esc(addr.postcode || "") + " · " + (st.address ? st.address.lat.toFixed(5) + ", " + st.address.lon.toFixed(5) : "") + "</span></p>" +
      "<h2>" + esc(t("report.auto")) + "</h2><table><tbody>" + autoRows + "</tbody></table>" +
      "<div class=\"cols\"><div class=\"box\"><h3>" + esc(t("verdict.blockers")) + "</h3>" + blockerHtml + "</div>" +
      "<div class=\"box\"><h3>" + esc(t("verdict.watchouts")) + "</h3>" + (watchHtml || "<p>" + esc(t("auto.none")) + "</p>") + "</div></div>" +
      "<h2>" + esc(t("report.answers")) + "</h2>" + rows.join("") + notes +
      "<h2>" + esc(t("report.methods")) + "</h2>" + methodHtml +
      "<h2>" + esc(t("checklist.title")) + "</h2><p class=\"rsub\">" + esc(t("checklist.intro")) + "</p>" + checklistHtml +
      "<h2>" + esc(t("report.next")) + "</h2><ul class=\"list links-src\">" + linkHtml + "</ul>" +
      "<div class=\"rfoot\">" + esc(t("report.disclaimer")) + "<br>" + esc(t("sources.note")) + "<br>Data: © OpenStreetMap contributors · Overpass API · Open-Meteo · Sources: NHVR, state road managers, Qube, Royal Wolf, ContainerCo.</div>" +
      "</div></body></html>";
    return html;
  }

  function generate(st){
    var html = buildReport(st);
    var w = window.open("", "_blank");
    if (!w){
      window.__lastReportHtml = html;
      return false;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    return true;
  }

  function summaryText(st){
    var r = st.result;
    var lines = [];
    lines.push("CONTAINER ACCESS AU — " + t("report.title"));
    lines.push(t("report.date") + ": " + fmtDate(new Date()));
    lines.push(t("report.address") + ": " + ((st.address && st.address.display) || "—"));
    lines.push(t("report.container") + ": " + st.size + (st.mass ? " · " + st.mass + " t" : ""));
    lines.push(t("report.score") + ": " + (r.total === null ? "—" : r.total + "/100") + " · " + t(r.labelKey));
    lines.push(t("report.confidence") + ": " + (r.confidence >= 0.85 ? t("verdict.confHigh") : (r.confidence >= 0.6 ? t("verdict.confMed") : t("verdict.confLow"))));
    if (r.hardFails && r.hardFails.length){
      lines.push(t("verdict.blockers") + ":");
      r.hardFails.forEach(function(b){ lines.push("- " + t("q." + b.id + ".label") + " — " + answerText(b.id, st.answers[b.id])); });
    }
    if (r.watchouts && r.watchouts.length){
      lines.push(t("verdict.watchouts") + ":");
      r.watchouts.forEach(function(w){ lines.push("- " + t("q." + w.id + ".label")); });
    }
    var rec = (st.methods || []).filter(function(m){ return m.status === "rec"; }).map(function(m){ return t("method." + m.id); });
    if (rec.length) lines.push(t("methods.rec") + ": " + rec.join(", "));
    lines.push(t("verdict.disclaimer"));
    return lines.join("\n");
  }

  window.REPORT = { generate: generate, summaryText: summaryText, esc: esc };
})();
