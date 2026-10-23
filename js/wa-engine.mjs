/* ============================================================================
 * 客户沟通分析引擎（WhatsApp / 邮件 / 微信 聊天记录 → 状态判断 + SOP 回复建议）
 *   · 纯本地规则引擎：不需要任何 AI Key、不联网、不上传聊天内容
 *   · 只做「读 + 分析 + 建议」，不含任何发送能力，也不接触 WhatsApp 本身
 * ==========================================================================*/
(function () {
  'use strict';
  /* ---------------- 文本清洗（OCR 常见问题） ---------------- */
  function clean(s) {
    var t = String(s == null ? '' : s);
    t = t.replace(/\r/g, '');
    /* CJK 之间被 OCR/复制插入的空格去掉 */
    t = t.replace(/([\u4e00-\u9fa5])[ \t]+(?=[\u4e00-\u9fa5])/g, '$1');
    t = t.replace(/[ \t]+([，。！？、；：（）《》])/g, '$1');
    /* 常见 OCR 误recognize 修正 */
    t = t.replace(/授\s*衩/g, '授权').replace(/徵\s*信/g, '微信').replace(/亻壬务/g, '任务');
    return t;
  }
  /* ---------------- 解析：支持 WhatsApp 导出格式 / 网页复制 / 手工标注 ---------------- */
  var RE_EXPORT = /^\[?(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap]\.?[Mm]\.?)?)\]?\s*[-–]?\s*([^:]{1,60}):\s*([\s\S]*)$/;
  var RE_TIME = /^\[?(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap]\.?[Mm]\.?)?)\]?$/;
  var RE_MARK = /^(客户|买家|对方|Customer|Them|Buyer|我|我方|Me|Us)\s*[：:>]\s*([\s\S]*)$/i;
  function isMyName(n, myNames) {
    var s = String(n || '').toLowerCase();
    for (var i = 0; i < myNames.length; i++) { if (s && s.indexOf(String(myNames[i]).toLowerCase()) >= 0) return true; }
    return /^(我|我方|me|us|my side|raymond|globalvertical)$/i.test(String(n || '').trim());
  }
  /* 导出格式带冒号：非我方即客户方（1:1 或群里其他人均算客户侧） */
  function whoOf(name, myNames) {
    var n = String(name || '').trim();
    if (!n) return '?';
    if (isMyName(n, myNames)) return 'me';
    return 'them';
  }
  /* 仅判断「单独一行是否为联系人名」，避免把 Thanks/ok 当人名 */
  function looksLikeName(line) {
    var s = String(line || '').trim();
    if (!s || s.length > 40) return false;
    if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*\s*\([^)]+\)$/.test(s)) return true;
    if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(s)) return true;
    if (/^[\u4e00-\u9fa5]{2,4}$/.test(s)) return true;
    return false;
  }
  function parse(text, myNames) {
    myNames = myNames && myNames.length ? myNames : ['RAYMOND', 'GlobalVertical', '我'];
    var raw = clean(text).split('\n');
    var msgs = [], lastWho = null, pendingName = null, structured = 0;
    for (var i = 0; i < raw.length; i++) {
      var line = raw[i].replace(/\s+$/, '');
      if (!line.trim()) continue;
      var me = line.match(RE_MARK);
      if (me) { lastWho = /^(客户|买家|对方|Customer|Them|Buyer)$/i.test(me[1]) ? 'them' : 'me'; msgs.push({ who: lastWho, t: '', text: me[2].trim() }); continue; }
      var ex = line.match(RE_EXPORT);
      if (ex) { lastWho = whoOf(ex[3], myNames); structured++; msgs.push({ who: lastWho, t: ex[2], text: ex[4].trim() }); pendingName = null; continue; }
      if (RE_TIME.test(line)) { if (msgs.length) msgs[msgs.length - 1].t = msgs[msgs.length - 1].t || line; continue; }
      /* 单独的姓名行（WhatsApp 网页复制常见） */
      /* 网页复制/截图 OCR 版式：姓名行 + 下一行是时间 → 判定为发言人 */
      var nxt = (i + 1 < raw.length) ? String(raw[i + 1]).trim() : '';
      if (nxt && RE_TIME.test(nxt) && line.length <= 30 && !/[.!?。！？]$/.test(line)) {
        pendingName = isMyName(line, myNames) ? 'me' : 'them';
        continue;
      }
      if (isMyName(line, myNames) && line.length <= 40) { pendingName = 'me'; continue; }
      if (/^(客户|买家|对方|Customer|Them|Buyer)$/i.test(line.trim())) { pendingName = 'them'; continue; }
      if (looksLikeName(line)) { pendingName = 'them'; continue; }
      /* 「姓名: 内容」行（无时间戳也能正确拆条） */
      var nm = line.match(/^([A-Za-z\u4e00-\u9fa5][^:：]{0,30})[:：]\s*(.+)$/);
      if (nm) {
        var nmWho = isMyName(nm[1], myNames) ? 'me' : 'them';
        if (/^(客户|买家|对方|Customer|Them|Buyer)$/i.test(nm[1].trim())) nmWho = 'them';
        msgs.push({ who: nmWho, t: '', text: nm[2].trim() });
        lastWho = nmWho; pendingName = null;
        continue;
      }
      /* 普通文本行：并入上一条或新建 */
      var who = pendingName || lastWho || '?';
      pendingName = null;
      if (msgs.length && msgs[msgs.length - 1].who === who && !msgs[msgs.length - 1].t) msgs[msgs.length - 1].text += ' ' + line.trim();
      else msgs.push({ who: who, t: '', text: line.trim() });
      lastWho = who;
    }
    msgs = msgs.filter(function (m) { return m.text && m.text.length > 0; });
    /* 未识别说话人：交替推断（同人连续则合并） */
    var unknown = msgs.filter(function (m) { return m.who === '?'; }).length;
    if (structured >= 2) unknown = 0;   /* 导出格式已明确说话人，不做交替推断 */
    if (unknown && unknown > msgs.length * 0.5) { var flip = 'them'; for (var k = 0; k < msgs.length; k++) { if (msgs[k].who === '?') { msgs[k].who = flip; } flip = (msgs[k].who === 'them') ? 'me' : 'them'; } }
    return msgs.map(function (m, i) { return { i: i, who: m.who, t: m.t, text: m.text }; });
  }
  /* ---------------- 信号词典 ---------------- */
  var SIG = [
    { k: 'priceAsk', w: 3, re: /(price|quote|quotation|rate|how much|cost|pricing|报价|什么价|多少钱|费用)/i, zh: '询价' },
    { k: 'bargain', w: 4, re: /(too expensive|too high|expensive|discount|cheaper|best price|lower|reduce|competitive|tight budget|do better on the price|better (price|rate)|work on the price|sharpest|improve the price|sharpen|any room|match (it|the price|that)|beat (it|the price)|优惠|太贵|便宜|折扣|降点|预算|少一点|再低|让点|价格高)/i, zh: '议价/压价' },
    { k: 'competitor', w: 5, re: /(another (supplier|forwarder|company)|other forwarder|competitor|quoted me|they offered|someone else|别的货代|其他货代|同行报|别家)/i, zh: '比价（同行介入）' },
    { k: 'urgency', w: 3, re: /(urgent|asap|as soon as possible|immediately|rush|by (this|next) week|deadline|急|尽快|赶)/i, zh: '交期紧迫' },
    { k: 'delayWorry', w: 4, re: /(delay|delayed|late|still waiting|how long|when will|taking so long|not yet|延期|还没|多久|拖)/i, zh: '时效担忧' },
    { k: 'quality', w: 4, re: /(quality|damage|damaged|broken|missing|inspect|crack|dent|质量|破损|少货|损坏|验货)/i, zh: '质量/货损顾虑' },
    { k: 'customs', w: 3, re: /(customs|clearance|duty|gst|quarantine|fumigation|biosecurity|清关|关税|检疫|熏蒸|清关费)/i, zh: '清关合规关注' },
    { k: 'payment', w: 3, re: /(payment|deposit|terms|invoice|bank|tt\b|credit|付款|定金|账期|发票|开票)/i, zh: '付款条件' },
    { k: 'docIssue', w: 3, re: /(document|docs|b\/l|bill of lading|packing list|invoice copy|coo|原产地|提单|单据|单证)/i, zh: '单证事务' },
    { k: 'trust', w: 3, re: /(are you (legit|real)|scam|guarantee|insurance|reliable|trust|靠谱|保证|保险|放心)/i, zh: '信任/风险顾虑' },
    { k: 'positive', w: 2, re: /(thank(s| you)|great|perfect|excellent|appreciate|sounds good|well done|awesome|好的|谢谢|不错|可以|赞)/i, zh: '正面反馈' },
    { k: 'confirm', w: 4, re: /(confirm|confirmed|agree|deal|go ahead|proceed|approved|book it|下单|确认|同意|成交|安排)/i, zh: '成交意向' },
    { k: 'hesitate', w: 3, re: /(let me (think|check|discuss|consider)|maybe|perhaps|not sure|need to (check|ask)|later|next month|考虑|再想想|商量|回头|缓一缓)/i, zh: '犹豫/观望' },
    { k: 'negative', w: 5, re: /(disappointed|unacceptable|complaint|refund|cancel|terrible|worst|angry|frustrat|不满意|投诉|取消|退款|生气)/i, zh: '不满/投诉风险' },
    { k: 'ready', w: 5, re: /(ready to (book|proceed|confirm)|place (the )?order|issue (the )?invoice|send (me )?(the )?invoice|purchase order|\bpo\b|booking|订舱|开票|下单|打款)/i, zh: '准备下单' },
    { k: 'silence', w: 3, re: /(no reply|any update|following up|still there|在吗|有回复|催)/i, zh: '跟进/沉默' }
  ];
  /* ---------------- 事实抽取 ---------------- */
  function facts(msgs) {
    var all = msgs.map(function (m) { return m.text; }).join(' \n ');
    var out = { money: [], qty: [], time: [], port: [], incoterm: [], product: [] };
    var m1 = all.match(/(?:USD|AUD|RMB|CNY|\$|￥|¥)\s?[\d,\.]+(?:\s?(?:k|K))?|[\d,\.]+\s?(?:USD|AUD|RMB|dollars?|美金|美元|澳元|人民币)/gi);
    if (m1) out.money = uniq(m1).slice(0, 6);
    var m2 = all.match(/\d+\s?(?:x\s?)?(?:cartons?|ctns?|pallets?|pcs|pieces?|sets?|boxes?|units?|cbm|kgs?|tons?|t\b|件|箱|托|个|套)/gi);
    if (m2) out.qty = uniq(m2).slice(0, 8);
    var m3 = all.match(/\b(?:\d{1,2}\s?(?:days?|weeks?)|ETD|ETA|next week|this week|end of (?:the )?month|by (?:the )?\d{1,2}(?:st|nd|rd|th)?|\d{1,2}\/\d{1,2}|\d{1,2}月\d{1,2}日|下周|本周|月底)\b/gi);
    if (m3) out.time = uniq(m3).slice(0, 8);
    var m4 = all.match(/\b(20GP|40GP|40HQ|45HQ|LCL|FCL|20\s?ft|40\s?ft)\b/gi);
    if (m4) out.qty = uniq(out.qty.concat(uniq(m4))).slice(0, 10);
    var m5 = all.match(/\b(Sydney|Melbourne|Brisbane|Perth|Fremantle|Adelaide|Newcastle|Geelong|Townsville|Cairns|Darwin|Hobart|Auckland|NSW|VIC|QLD|WA|SA)\b/gi);
    if (m5) out.port = uniq(m5).slice(0, 6);
    var m6 = all.match(/\b(EXW|FOB|CIF|CFR|DDP|DDU|DAP|CPT)\b/gi);
    if (m6) out.incoterm = uniq(m6).slice(0, 4);
    return out;
  }
  function uniq(a) { var s = {}, o = []; for (var i = 0; i < a.length; i++) { var k = String(a[i]).toLowerCase(); if (!s[k]) { s[k] = 1; o.push(String(a[i]).trim()); } } return o; }
  /* ---------------- 状态分析 ---------------- */
  function analyze(msgs) {
    var them = msgs.filter(function (m) { return m.who === 'them'; });
    var mine = msgs.filter(function (m) { return m.who === 'me'; });
    var hits = {}, score = {};
    var scanText = (them.length ? them : msgs).map(function (m) { return m.text; }).join(' \n ');
    var recentText = (them.slice(-3).length ? them.slice(-3) : msgs.slice(-3)).map(function (m) { return m.text; }).join(' \n ');
    for (var i = 0; i < SIG.length; i++) {
      var s = SIG[i], c = 0, mm = scanText.match(new RegExp(s.re.source, 'gi'));
      if (mm) c = mm.length;
      if (c) { hits[s.k] = { n: c, zh: s.zh }; score[s.k] = c * s.w; }
    }
    /* 阶段判定 */
    var stage = 'inquiry', stageZh = '初次询价 → 待报价', stageAdvice = '先给「结论 + 依据 + 可选方案」，别急着让价。';
    function has(k) { return !!hits[k]; }
    /* 关键：带条件的"价格合适就下单"仍属议价，不算成交 */
    var lt = (them[them.length - 1] || {}).text || '';
    var ltPrice = /(price|expensive|discount|cheaper|lower|rate|cost|quote|budget|match|价|优惠|便宜)/i.test(lt);
    var ltHardYes = /(confirm(ed)?|book(ed)?|go ahead|proceed|invoice|purchase order|\bpo\b|deposit|payment sent|下单|确认|开票|打款|订舱)/i.test(lt) && !ltPrice;
    if (has('negative')) { stage = 'risk'; stageZh = '不满 / 投诉风险'; stageAdvice = '先承认感受 + 给明确时间点的补救方案，不谈价格。'; }
    else if (has('competitor') || has('bargain')) { stage = 'negotiation'; stageZh = '议价 / 比价中'; stageAdvice = '不硬扛价格：拆解成本 + 给选项 + 用条件换让价。'; }
    else if ((has('ready') || has('confirm')) && (ltHardYes || !has('bargain'))) { stage = 'closing'; stageZh = '成交信号明确'; stageAdvice = '直接推进：给单证清单 + 付款方式 + 截止时间，减少来回。'; }
    else if (has('hesitate')) { stage = 'hesitation'; stageZh = '犹豫观望'; stageAdvice = '降低决策压力：给一个小步骤（先锁舱位/先试一票）。'; }
    else if (has('delayWorry') || has('urgency')) { stage = 'timing'; stageZh = '关注时效'; stageAdvice = '用具体时间轴回答，比形容词有用 10 倍。'; }
    var sentiment = 'neutral', sentimentZh = '中性';
    var negN = (hits.negative ? hits.negative.n : 0) + (hits.bargain ? hits.bargain.n : 0) + (hits.delayWorry ? hits.delayWorry.n : 0);
    var posN = (hits.positive ? hits.positive.n : 0) + (hits.confirm ? hits.confirm.n : 0) + (hits.ready ? hits.ready.n : 0);
    if (negN > posN + 1) { sentiment = 'negative'; sentimentZh = '偏负面 · 有情绪或压力'; }
    else if (posN > negN) { sentiment = 'positive'; sentimentZh = '偏正面 · 有推进可能'; }
    /* 沉默判定：最后一条是我方且没有回复痕迹 */
    var last = msgs[msgs.length - 1];
    var waiting = !!(last && last.who === 'me' && msgs.length > 2);
    if (waiting && !has('ready')) { if (stage === 'inquiry') { stage = 'silence'; stageZh = '报价后沉默'; stageAdvice = '换角度跟进：不是催单，是给「新信息」。'; } }
    var concerns = Object.keys(hits).filter(function (k) { return ['bargain', 'competitor', 'delayWorry', 'quality', 'customs', 'payment', 'trust', 'priceAsk'].indexOf(k) >= 0; }).map(function (k) { return hits[k].zh; });
    var signals = Object.keys(hits).map(function (k) { return hits[k].zh + '×' + hits[k].n; });
    var F = facts(msgs);
    var risk = (hits.negative ? '客户已有不满表达，务必当天回应，先给解决时间点。' : (has('competitor') ? '客户正在比价，回复里不要只给价格，要给出「为什么不会出问题」。' : (waiting ? '客户已沉默，继续谈价容易掉单，建议换价值角度跟进。' : '暂无明显风险。')));
    return {
      n: msgs.length, nThem: them.length, nMe: mine.length,
      stage: stage, stageZh: stageZh, stageAdvice: stageAdvice,
      sentiment: sentiment, sentimentZh: sentimentZh,
      concerns: uniq(concerns), signals: signals, facts: F, risk: risk, waiting: waiting,
      lastThem: (them[them.length - 1] || {}).text || '',
      lastMe: (mine[mine.length - 1] || {}).text || ''
    };
  }
  /* ---------------- 按左右气泡分组（OCR 富文本 → 消息） ---------------- */
  /* WhatsApp 网页：我方消息在右侧（cx>0.5），客户在左侧 */
  function fromBubbles(rich, opt) {
    opt = opt || {};
    var lines = (rich && rich.lines) || [];
    if (!lines.length) return [];
    var out = [], cur = null;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i], t = String(l.text || '').trim();
      if (!t) continue;
      /* 过滤明显 UI 噪声 */
      if (/^(WhatsApp|Search|Chats|Status|Calls|Communities|Archived|Unread|Type a message|搜索|聊天|状态|通话)$/i.test(t)) continue;
      if (t.length <= 2 && !/[一-龥]{2}/.test(t)) continue;
      var side = (l.cx != null && l.cx > 0.5) ? 'me' : 'them';
      if (cur && cur.who === side) { cur.text += ' ' + t; }
      else { cur = { who: side, t: '', text: t }; out.push(cur); }
    }
    return out.map(function (m, i) { return { i: i, who: m.who, t: m.t, text: m.text }; });
  }
  /* ---------------- 客户质量评分（0-100 + A/B/C/D） ---------------- */
  function score(msgs, an) {
    an = an || analyze(msgs);
    var hits = {};
    var themTxt = msgs.filter(function (m) { return m.who === 'them'; }).map(function (m) { return m.text; }).join(' ');
    for (var i = 0; i < SIG.length; i++) { var s = SIG[i]; if (new RegExp(s.re.source, 'i').test(themTxt)) hits[s.k] = true; }
    var f = an.facts || {};
    var nFacts = (f.money || []).length + (f.qty || []).length + (f.time || []).length + (f.port || []).length + (f.incoterm || []).length;
    function cl(v) { return Math.max(0, Math.min(100, Math.round(v))); }
    var D = {};
    D.intent = cl(20 + (hits.priceAsk ? 25 : 0) + (hits.confirm ? 25 : 0) + (hits.ready ? 30 : 0) + (hits.bargain ? 15 : 0) + (hits.hesitate ? -15 : 0));
    D.specificity = cl(15 + Math.min(60, nFacts * 12) + (f.port.length ? 15 : 0) + (f.incoterm.length ? 10 : 0));
    D.urgency = cl(20 + (hits.urgency ? 35 : 0) + (hits.delayWorry ? 15 : 0) + (f.time.length ? 20 : 0));
    D.authority = cl(55 + (hits.confirm || hits.ready ? 30 : 0) - (/(my boss|my manager|I will ask|check with my|discuss with|老板|上司|商量|请示)/i.test(themTxt) ? 30 : 0));
    D.professional = cl(35 + (hits.customs ? 20 : 0) + (hits.docIssue ? 20 : 0) + (hits.payment ? 15 : 0) + (f.incoterm.length ? 15 : 0) + (hits.competitor ? 10 : 0));
    D.risk = cl(80 - (hits.negative ? 45 : 0) - (hits.delayWorry ? 15 : 0) - (hits.competitor ? 10 : 0));
    var total = cl(D.intent * 0.3 + D.specificity * 0.2 + D.urgency * 0.15 + D.authority * 0.15 + D.professional * 0.1 + D.risk * 0.1);
    var grade = total >= 75 ? 'A' : (total >= 55 ? 'B' : (total >= 35 ? 'C' : 'D'));
    var zh = { A: '高质量·优先跟进', B: '明确意向·可推进', C: '早期·需培养', D: '弱意向·低优先级' }[grade];
    var action = grade === 'A' ? '今天就给到具体方案与时间点，主动推进订舱。' : (grade === 'B' ? '给两个可选方案 + 一个截止时间，把选择权交给对方。' : (grade === 'C' ? '先建立信任：发一个小而具体的价格或时效信息，别催单。' : '低频跟进，只在有真正新信息时联系，不要消耗关系。'));
    return { total: total, grade: grade, zh: zh, action: action, dims: D, nFacts: nFacts };
  }
  /* ---------------- 跟进漏斗进度（6 段） ---------------- */
  var FUNNEL = ['初次接触', '询价', '已报价', '议价中', '待确认', '已成交'];
  function funnel(msgs, an) {
    an = an || analyze(msgs);
    var them = msgs.filter(function (m) { return m.who === 'them'; });
    var me = msgs.filter(function (m) { return m.who === 'me'; });
    var themTxt = them.map(function (m) { return m.text; }).join(' ');
    var meTxt = me.map(function (m) { return m.text; }).join(' ');
    var step = 0;
    if (them.length) step = 1;
    if (themTxt.match(/(price|quote|rate|how much|报价|价格|多少钱)/i)) step = Math.max(step, 1);
    if (meTxt.match(/(USD|AUD|\$|\d{3,}|per container|all in|报价为|价格是)/i)) step = Math.max(step, 2);
    if (themTxt.match(/(too expensive|discount|cheaper|better price|match|competitor|another forwarder|太贵|便宜|优惠|降价|别家|同行)/i)) step = Math.max(step, 3);
    if (themTxt.match(/(confirm|confirmed|agreed|deal|go ahead|确认|同意|可以定|成交)/i)) step = Math.max(step, 4);
    if (themTxt.match(/(invoice|payment sent|deposit|booked|booking|purchase order|\bpo\b|开票|付款|已付|下单|订舱)/i)) step = Math.max(step, 5);
    if (an.stage === 'risk') step = Math.min(step, 3);
    return { step: step, max: 5, name: FUNNEL[step], all: FUNNEL };
  }
  /* ---------------- SOP 回复生成（共情 → 事实 → 情理 → 方案 → 优惠 → 行动） ---------------- */
  /* ---------------- ABF / DAFF 政策与时效库（用于「时事分析」段落） ---------------- */
  var POLICY = [
    { id: 'bmsb', months: [9, 10, 11, 12, 1, 2, 3, 4], kw: /(furniture|timber|wood|machinery|metal|vehicle|parts|steel|tool|\u5bb6\u5177|\u6728|\u673a\u68b0|\u91d1\u5c5e|\u8f66|\u96f6\u4ef6|\u94a2)/i,
      zh: '\u73b0\u5728\u6b63\u503c BMSB \u81ed\u866b\u5b63\u8282\u63aa\u65bd\uff089/1\u20134/30\uff09\uff0c\u9ad8\u98ce\u9669\u56fd\u8d27\u7269\u9700\u79bb\u5cb8\u5904\u7406\u6216\u5230\u6e2f\u718f\u84b8\uff0c\u6ca1\u5904\u7406\u7684\u67dc\u5b50\u4f1a\u88ab\u5e26\u5f80\u5f81\u6c42\u68c0\u67e5\u533a\uff0c\u6ede\u6e2f 3\u20137 \u5929\u3002',
      en: 'Just so you know — it is BMSB season (Sep 1 to Apr 30). Steel, timber and machinery-based cargo needs offshore treatment or it gets pulled for inspection and sits for days.',
      src: 'DAFF BMSB seasonal measures' },
    { id: 'fum3', months: [0], kw: /(timber|wood|furniture|pallet|\u6728|\u5bb6\u5177|\u6258\u76d8)/i, watch: true,
      zh: '\u718f\u84b8\u8bc1\u4e66\u9700\u7b26\u5408 DAFF \u6eb4\u7532\u70f7\u65b9\u6cd5 v3.0\uff082025-07-01 \u8d77\uff09\uff1a\u5904\u7406\u76ee\u6807\u3001\u8d77\u6b62\u65f6\u95f4\u3001\u6b8b\u7559\u6d53\u5ea6\u3001\u5904\u7406\u5730\u70b9\u7b49\u4e5d\u9879\u5fc5\u987b\u5b8c\u6574\uff0c\u5426\u5219\u5230\u6e2f\u4f1a\u88ab\u62d2\u3002',
      en: 'On the fumigation side — certificates must follow the new Methyl Bromide v3.0 (since 1 Jul 2025), all nine fields included, or they get rejected at the port.',
      src: 'DAFF Methyl Bromide Methodology v3.0' },
    { id: 'stone', months: [0], kw: /(stone|marble|quartz|benchtop|\u77f3|\u5927\u7406\u77f3|\u82b1\u5c97\u5ca9|\u4eba\u9020\u77f3|\u53f0\u9762)/i,
      zh: '\u4eba\u9020\u77f3\uff08\u7ed3\u6676\u4e8c\u6c27\u5316\u7845 \u22651%\uff09\u7981\u6b62\u8fdb\u53e3\uff0cABF \u6709\u6743\u6263\u8d27\uff1b\u5929\u7136\u77f3\u6750\u9700\u77f3\u68c9\u6838\u67e5\u8bc1\u660e\u3002',
      en: 'Quick heads-up on stone — engineered stone with 1% or more crystalline silica is banned at the border now. Natural stone is fine but needs asbestos screening.',
      src: 'ABF prohibited goods — engineered stone' },
    { id: 'alu', months: [0], kw: /(aluminium|aluminum|window|door|\u94dd|\u95e8\u7a97|\u5e55\u5899)/i,
      zh: '\u5bf9\u534e\u94dd\u5236\u95e8\u7a97\u53cd\u503e\u9500/\u53cd\u8865\u8d34\u63aa\u65bd\u751f\u6548\u4e2d\uff0c\u62a5\u4ef7\u9700\u9884\u7559\u7a0e\u53f7\u6838\u5b9a\u4e0e\u62b5\u6263\u53e3\uff0c\u5426\u5219\u5230\u6e2f\u8865\u7a0e\u5f88\u8d35\u3002',
      en: 'One thing to flag — anti-dumping duties are live on Chinese aluminium windows and doors. Worth confirming the exporter code before we quote, so the landed cost is real.',
      src: 'ABF trade measures' },
    { id: 'aicis', months: [0], kw: /(chemical|adhesive|paint|coating|resin|\u5316\u5de5|\u80f6|\u6d82\u6599|\u6811\u8102)/i,
      zh: '\u5de5\u4e1a\u5316\u5b66\u54c1\u9700 AICIS \u5206\u7c7b/\u6ce8\u518c\uff1b2026-09-01 \u65b0\u7248\u5206\u7c7b\u6307\u5357\u751f\u6548\uff0c\u65e7\u7248\u5206\u7c7b\u9700\u91cd\u65b0\u6838\u5bf9\u3002',
      en: 'If any part of the cargo is an industrial chemical, AICIS categorisation applies — and the 2026 guidelines take effect from 1 Sep, so older categorisations may need re-checking.',
      src: 'AICIS 2026 categorisation guidelines' },
    { id: 'gst', months: [0], kw: /.*/, always: true,
      zh: '\u62a5\u4ef7\u53e3\u5f84\u8981\u6e05\u695a\uff1a\u5230\u5cb8\u4ef7\uff08\u4e0d\u542b GST\uff09\u4e0e DDP\uff08\u542b 10% GST + \u5173\u7a0e\uff09\u4e0d\u80fd\u6df7\uff0c\u5426\u5219\u5ba2\u6237\u4ea4\u4ed8\u65f6\u4f1a\u611f\u89c9\u88ab\u9690\u85cf\u6536\u8d39\u3002',
      en: 'To keep it clean — my numbers are landed cost excluding GST. If you want DDP we add 10% GST plus duty, and I will show both side by side so there is no surprise at delivery.',
      src: 'ABF GST & duty' },
    { id: 'port', months: [0], kw: /.*/, always: true,
      zh: '\u6e2f\u53e3\u5b9e\u6536\u8d39\u9879\uff08\u7ec8\u7aef\u63a5\u5165\u3001VBS \u65f6\u6bb5\u3001\u7a7a\u7bb1\u8fd8\u8fd0\uff09\u6bcf\u5468\u5728\u6ce2\u52a8\uff0c\u5c5e\u4e8e\u4ee3\u6536\uff0c\u5efa\u8bae\u5728\u62a5\u4ef7\u91cc\u5355\u5217\u800c\u4e0d\u662f\u5305\u6b7b\uff0c\u907f\u514d\u540e\u7eed\u8d34\u94b1\u3002',
      en: 'Port charges — terminal access, VBS slots, empty return — move weekly. I list them separately so you can see exactly what the shipping line took versus what I charged.',
      src: 'Port infrastructure charges' }
  ];
  /* 选取与当前月份/货物相关的政策（最多 2 条） */
  function policies(month, text) {
    var m = (month == null) ? (new Date().getMonth() + 1) : month;
    var t = String(text || '');
    var out = [];
    for (var i = 0; i < POLICY.length; i++) {
      var p = POLICY[i];
      var inSeason = p.always || (p.months && p.months.indexOf(m) >= 0);
      if (!inSeason && !p.watch) continue;
      if (!p.always && t && !p.kw.test(t)) continue;
      out.push(p);
      if (out.length >= 2) break;
    }
    if (!out.length) out.push(POLICY[POLICY.length - 2]);
    return out;
  }
  /* 性别话术风格 */
  var GENDER = {
    any: { zh: '\u4e0d\u6307\u5b9a', note: '' },
    male: { zh: '\u7537\u5ba2\u6237', note: '\u76f4\u63a5\u3001\u7ed3\u8bba\u5148\u884c\u3001\u6570\u5b57\u8bf4\u8bdd\u3001\u5c11\u5bd2\u6684' },
    female: { zh: '\u5973\u5ba2\u6237', note: '\u5148\u63a5\u60c5\u7eea\u3001\u8bed\u6c14\u67d4\u548c\u3001\u591a\u7528\u201c\u6211\u6765\u5904\u7406/\u4f60\u653e\u5fc3\u201d\u3001\u5c11\u7528\u547d\u4ee4\u53e5' }
  };
  /* ================= ① 界面识别：只认 WhatsApp 会话界面 ================= */
  var APP_SIGNS = {
    whatsapp: { name: 'WhatsApp', strong: /(type a message|search or start new chat|whatsapp web|chats\b|status\b|calls\b|communities\b|archived|unread|last seen|click here for contact info|输入消息|输入信息|键入消息|搜索或开始新聊天|开始新聊天|未读|群组|添加到列表|有回复的客户|特别关注|最后上线|在线|WhatsApp)/gi },
    wechat: { name: '微信', strong: /(微信|通讯录|发现|朋友圈|聊天记录|wechat)/i },
    telegram: { name: 'Telegram', strong: /(telegram|saved messages)/i },
    email: { name: '邮件', strong: /(inbox|outbox|compose|gmail|outlook|收件箱|写信)/i },
    office: { name: 'Excel/Office', strong: /(sheet\d|工作表|excel|formula|插入|公式)/i }
  };
  function detectApp(text) {
    var t = String(text || '');
    var res = { ok: false, app: 'unknown', appZh: '未知界面', score: 0, hits: [], other: null };
    var wa = t.match(new RegExp(APP_SIGNS.whatsapp.strong.source, 'gi')) || [];
    var uniq = {}; wa.forEach(function (h) { uniq[h.toLowerCase()] = 1; });
    var n = Object.keys(uniq).length;
    res.score = n; res.hits = Object.keys(uniq).slice(0, 8);
    ['wechat', 'telegram', 'email', 'office'].forEach(function (k) {
      var a = APP_SIGNS[k];
      var h = t.match(new RegExp(a.strong.source, 'gi')) || [];
      if (h.length >= 2 && !res.other) res.other = { app: k, appZh: a.name, n: h.length };
    });
    var hasTypeBox = /type a message|search or start new chat|输入消息|输入信息|键入消息|搜索或开始新聊天|发送/i.test(t);
    var hasWsWord = /whatsapp/i.test(t);
    res.ok = (n >= 2 || (hasWsWord && n >= 1) || hasTypeBox) && !(res.other && res.other.n >= 3 && n < 2);
    if (res.ok) { res.app = 'whatsapp'; res.appZh = 'WhatsApp'; }
    else if (res.other) { res.app = res.other.app; res.appZh = res.other.appZh; }
    return res;
  }
  /* ================= ② 按客户名定位会话 ================= */
  function findCustomer(text, name) {
    var t = String(text || ''), nm = String(name || '').trim();
    if (!nm) return { found: false, reason: 'no-name' };
    var norm = function (s) { return String(s).toLowerCase().replace(/[\s\u00a0]+/g, '').replace(/[^a-z0-9\u4e00-\u9fa5]/g, ''); };
    var T = norm(t), N = norm(nm);
    if (N.length >= 3 && T.indexOf(N) >= 0) return { found: true, how: 'full' };
    var parts = nm.toLowerCase().split(/[\s\-\.\/&]+/).filter(function (x) { return x.length >= 3; });
    if (parts.length >= 2) {
      var hit = parts.filter(function (p) { return T.indexOf(norm(p)) >= 0; }).length;
      if (hit === parts.length) return { found: true, how: 'words', hit: hit, total: parts.length };
      if (hit >= Math.max(2, Math.ceil(parts.length * 0.6))) return { found: 'partial', how: 'some', hit: hit, total: parts.length };
    }
    if (/[\u4e00-\u9fa5]{2,}/.test(nm) && T.indexOf(norm(nm)) >= 0) return { found: true, how: 'cjk' };
    return { found: false };
  }
  /* ================= ③ 逐句意图 + 一对一回复 ================= */
  /* 顺序=优先级：具体意图优先于泛化意图；greet/question 放最后 */
  var INTENT = [
    { k: 'delayComplain', zh: '抱怨延误', re: /(delay|delayed|late|still waiting|not arrived|延误|还没到|拖了)/i },
    { k: 'tooExpensive', zh: '嫌贵', re: /(too expensive|too high|expensive|pricey|over budget|太贵|高了|超预算)/i },
    { k: 'competitor', zh: '同行比价', re: /(another (forwarder|supplier|company)|other forwarder|competitor|quoted me|they offered|别家|同行|其他货代)/i },
    { k: 'quality', zh: '担心货损', re: /(damage|damaged|broken|missing|quality|inspect|crack|破损|少货|质量)/i },
    { k: 'customs', zh: '清关税费', re: /(customs|clearance|duty|gst|quarantine|fumigation|biosecurity|清关|关税|熏蒸|检疫)/i },
    { k: 'discount', zh: '要优惠', re: /(discount|cheaper|best price|can you do better|any room|reduce|lower the|优惠|便宜点|低一点|让点)/i },
    { k: 'order', zh: '下单订舱', re: /(place the order|book(ing)?|invoice me|purchase order|\bpo\b|下单|订舱|开票)/i },
    { k: 'confirm', zh: '确认同意', re: /(confirm|confirmed|agreed|deal|go ahead|sounds good|确认|同意|成交)/i },
    { k: 'payment', zh: '谈付款', re: /(payment|deposit|terms|tt|bank|credit|付款|定金|账期|打款)/i },
    { k: 'docs', zh: '要单证', re: /(invoice|packing list|bill of lading|b\/l|documents?|coo|发票|装箱单|提单|单证)/i },
    { k: 'hesitate', zh: '犹豫', re: /(think about|let me check|discuss with|not sure|maybe|later|next month|考虑|商量|再说|下个月)/i },
    { k: 'priceAsk', zh: '询价', re: /(price|quote|quotation|rate|how much|cost|pricing|报价|价格|多少钱)/i },
    { k: 'timing', zh: '问时效', re: /(how long|transit time|when will|when can|\beta\b|\betd\b|lead time|transit|多久|几天|什么时候|交期)/i },
    { k: 'thanks', zh: '致谢', re: /(thanks|thank you|appreciate|谢谢|感谢)/i },
    { k: 'greet', zh: '问候', re: /^(hi|hello|hey|good (morning|afternoon)|dear|你好|在吗)[\s!,.]{0,3}$/i },
    { k: 'question', zh: '提问', re: /\?|？/ }
  ];
  function intentOf(text) { var s = String(text || ''); for (var i = 0; i < INTENT.length; i++) { if (INTENT[i].re.test(s)) return INTENT[i]; } return { k: 'other', zh: '其他' }; }
  var REPLY_ONE = {
    priceAsk: { en: 'Happy to quote. 40HQ to Melbourne drayage plus terminal and empty return comes to [rate] all in. Want the line-by-line breakdown?', zh: '直接给数字并邀请看明细，显得有底气。' },
    tooExpensive: { en: 'I hear you. Before we move on price, can I show you what is inside the number? Most of the gap is terminal access and empty return, not the freight.', zh: '不接受结论，拆开给对方看。' },
    competitor: { en: 'Worth comparing properly. Ask them whether empty return and terminal access are included. If they are, I will match what makes sense.', zh: '不攻击同行，给客户一个验证清单。' },
    discount: { en: 'I can look at the drayage if we lock the booking this week. What date is the cargo ready?', zh: '让价换条件，用提问推进。' },
    timing: { en: 'Sailing 18 Oct, 18 days port to port, delivery 2-3 days after clearance. Door to door about 23 days.', zh: '用具体节点回答，不用形容词。' },
    delayComplain: { en: 'That one was on us. What changed: I now pre-book the drayage slot before the vessel berths, so the port queue does not eat your delivery window.', zh: '先认账，再说具体改了什么。' },
    quality: { en: 'Fair concern. I can arrange a pre-shipment inspection and send you photos before the container is sealed.', zh: '用可执行措施回应担忧。' },
    customs: { en: 'Landed cost is separate from GST. If you want DDP I will show duty plus 10% GST next to the landed figure, so there is no surprise.', zh: '把口径说清楚，避免到货争议。' },
    docs: { en: 'I will send the commercial invoice and packing list template now. Fill what you have and I will handle the rest.', zh: '主动提供模板，减少来回。' },
    payment: { en: 'Usual terms are 50% on booking, balance against the B/L. If you prefer to pay in full up front, I can pass on a discount.', zh: '付款条件两选一。' },
    confirm: { en: 'Great. I will send the booking confirmation today. Send me the shipper name and pickup address and we are set.', zh: '一确认就立即推进执行。' },
    order: { en: 'Perfect. Invoice and packing list today and I will lock the space before 5pm.', zh: '给明确时间点。' },
    hesitate: { en: 'No rush. I will hold the rate for 30 days. Tell me when your customer comes back and we pick it up from there.', zh: '降低压力，留下锁价期。' },
    thanks: { en: 'Any time. I will keep an eye on the space for this lane and flag anything that changes.', zh: '展示长期价值。' },
    question: { en: 'Good question. Let me confirm that with the carrier and come back to you today with a definite answer, not a guess.', zh: '不胡答，给确定答复的承诺。' },
    greet: { en: 'Hi — good to hear from you. Anything moving on the Melbourne side this month?', zh: '回应问候并开话题。' },
    other: { en: 'Got it. Let me come back to you on that today with a clear answer.', zh: '不胡答，承诺今天给确定答复。' }
  };
  function replyPerMessage(msgs, opt) {
    opt = opt || {};
    var out = [], them = (msgs || []).filter(function (m) { return m.who === 'them'; });
    them.slice(-6).forEach(function (m) {
      var it = intentOf(m.text), tpl = REPLY_ONE[it.k] || REPLY_ONE.other;
      var en = tpl.en;
      if (opt.gender === 'female') en = en.replace(/^I hear you\. /, 'I understand — ');
      out.push({ text: m.text, intent: it.k, intentZh: it.zh, reply: en, zh: tpl.zh });
    });
    return out;
  }
  /* ================= ④ 带原话证据的专业分析 ================= */
  function evidence(msgs) {
    var why = {
      priceAsk: '开口就问价，说明已经在比价阶段，不是闲聊。',
      tooExpensive: '直接说贵是好事：愿意讨价还价，说明有真实采购计划。',
      competitor: '拿同行价格施压是比价期的典型信号，这时候只跟价格必输。',
      timing: '问时效说明他已在排交期或已有终端客户订单。',
      delayComplain: '提上次延误是风险信号，必须先处理信任再谈价格。',
      customs: '主动问清关/关税说明他懂行，是高质量客户。',
      confirm: '出现确认字眼是成交信号，应立即推进流程。',
      hesitate: '犹豫信号说明决策压力在他这边，要降低风险而不是催单。',
      discount: '明确要优惠，说明价格是当前唯一障碍。',
      payment: '开始谈付款条件，通常已接近成交。'
    };
    var out = [], seen = {};
    (msgs || []).filter(function (m) { return m.who === 'them'; }).slice(-8).forEach(function (m) {
      var it = intentOf(m.text);
      if (!it || seen[it.k] || !why[it.k]) return;
      seen[it.k] = 1;
      out.push({ quote: String(m.text).slice(0, 90), why: why[it.k], intent: it.k, intentZh: it.zh });
    });
    return out.slice(0, 4);
  }

  /* 精炼版话术：每段 1-2 句，像真人发微信/WhatsApp，不啰嗦 */
  var SOP = {
    inquiry: {
      empathy: { en: 'Happy to help — let me get you a number you can actually trust.', zh: '开场给确定性，不寒暄。' },
      fact: { en: 'I need three things: cargo ready date, pickup suburb, and whether it is cartons or pallets. Then I quote drayage, terminal and empty return in one figure.', zh: '把报价变成"填三个空"，降低对方动作成本。' },
      reason: { en: 'All-in rates that skip the breakdown usually miss terminal access or empty return — that is where the surprise lands.', zh: '先立专业标准，暗示低价陷阱。' },
      option: { en: 'Two ways: FCL 20GP/40HQ for best cost per CBM, or LCL if the volume is light.', zh: '给选项而不是单一价格。' },
      offer: { en: 'Send the details by tomorrow and I will hold space 48 hours at no cost.', zh: '零成本换对方的答复期限。' },
      cta: { en: 'Send me the pickup suburb and ready date — quote back to you today.', zh: '行动指令具体到"发什么+什么时候"。' }
    },
    negotiation: {
      empathy: { en: 'Fair point on price — I would rather solve it than lose you over it.', zh: '先接住对方的直白，不辩解。' },
      fact: { en: 'Our number includes drayage, FSC, terminal access, VBS and empty return. I can send it line by line.', zh: '用透明拆解回应"贵"，不说"已经很便宜"。' },
      reason: { en: 'The cheaper quote usually leaves out empty return or terminal access — that is the gap you feel later.', zh: '不攻击同行，只提醒漏项。' },
      option: { en: 'Two options: keep this sailing and I hold the rate, or take the next vessel and I can come down.', zh: '把"降价"换成"用时效换价格"。' },
      offer: { en: 'Confirm by Friday and I will push for a drayage reduction and lock the rate for 30 days.', zh: '让价绑定条件：时间 + 锁价期。' },
      cta: { en: 'Reply "hold" and the space is yours for 48 hours.', zh: '极低门槛动作，一句话就能回。' }
    },
    timing: {
      empathy: { en: 'Understood — after a delay, "about three weeks" is not something you can pass on.', zh: '承认上次问题，不解释推责。' },
      fact: { en: 'Departure {etd}, {transit} port to port, 2 days to release, delivery 2-3 days. Door to door {total} days.', zh: '把时效拆成可核对节点。' },
      reason: { en: 'I pre-book the drayage slot before the vessel berths — that is where the extra week usually disappears.', zh: '解释"为什么我能保证"，暗示流程差异。' },
      option: { en: 'Need it faster? We pre-pull the box and store near the port, so it delivers the day it clears.', zh: '主动给加速方案。' },
      offer: { en: 'I will put the ETA in writing on the booking. Miss it by more than 2 days and I cover the storage.', zh: '用书面承诺+赔付换信任。' },
      cta: { en: 'Send the shipper and pickup address and I will lock this vessel today.', zh: '收口到一个具体动作。' }
    },
    hesitation: {
      empathy: { en: 'Makes sense — it is not a small decision.', zh: '先允许对方犹豫，消除抵触。' },
      fact: { en: 'A first shipment only needs booking confirmation, invoice, packing list and the pickup address. The rest is on me.', zh: '把大决定拆成清单。' },
      reason: { en: 'Most customers test us with one container — if we do not perform, you lose one shipment, not a year.', zh: '把风险缩到最小单位。' },
      option: { en: 'Start with the 20GP, or I can hold the rate 30 days while you decide.', zh: '给"不用现在决定"的台阶。' },
      offer: { en: 'First booking, I will waive the documentation fee.', zh: '小额让步换首次合作。' },
      cta: { en: 'Tell me the ready date and I will draft the booking — free to cancel 5 days before cut-off.', zh: '给可撤销的承诺，降低决策压力。' }
    },
    closing: {
      empathy: { en: 'Great — thank you for the trust. Let us make this one smooth.', zh: '成交后不返价、不啰嗦。' },
      fact: { en: 'To lock it: shipper name, pickup address, ready date, invoice and packing list.', zh: '一次把资料清单给全。' },
      reason: { en: 'I will send confirmation, schedule and delivery plan today, so your customer has dates in writing.', zh: '主动给可转发的材料。' },
      option: { en: 'Payment: 50% on booking, balance against B/L — or full upfront if you want the discount.', zh: '付款条件给两选一。' },
      offer: { en: 'Confirm early and I apply this week\'s rate, not next week\'s.', zh: '把已让的利包装成"因为你早确认"。' },
      cta: { en: 'Send the invoice and packing list today — confirmation out before 5pm.', zh: '明确时间点，让成交落地。' }
    },
    risk: {
      empathy: { en: 'I am sorry — that one is on us, and I understand the frustration.', zh: '先认账，不解释。' },
      fact: { en: 'What happened: the box was held for inspection and we lost 6 days instead of the 2 we quoted.', zh: '用事实复述而不是理由堆砌。' },
      reason: { en: 'I will not promise it never happens again. I will change what I control: pre-booked slots and pre-checked inspection flags.', zh: '只承诺可执行的改变。' },
      option: { en: 'Next shipment: daily status from discharge, and I absorb storage if we miss the window.', zh: '给补偿 + 机制。' },
      offer: { en: 'I have credited the storage on this one — you should not pay for our delay.', zh: '实打实的减免。' },
      cta: { en: 'May I set up the next booking so we can show you the difference?', zh: '用"下一次"收尾。' }
    },
    silence: {
      empathy: { en: 'No pressure — I know how busy it gets.', zh: '不催单，先给台阶。' },
      fact: { en: 'One thing changed: the carrier released space on the {etd} sailing, so the rate is lower than my last quote.', zh: '跟进必须带新信息。' },
      reason: { en: 'Passing it on because it is genuinely time-limited, not to chase you.', zh: '点明"我在帮你抓机会"。' },
      option: { en: 'If the timing is not right, tell me the month and I will send rates when they open.', zh: '给"现在不买"的出口。' },
      offer: { en: 'Either way, this number is held for you for 7 days.', zh: '锁有效期，制造温和紧迫感。' },
      cta: { en: 'One word is enough — "later" is a fine answer.', zh: '极低门槛回复。' }
    }
  };
  /* 补齐 8 维：价格谈判 / 成交 / 维护（合并进 SOP） */
  var SOP_EXTRA = {
    inquiry: {
      price: { en: 'I would rather give you one honest number than three options that hide the cost. If it is tight, tell me your target and I will tell you what can move.', zh: '\u5148\u7acb\u8bda\u5b9e\u4eba\u8bbe\uff0c\u628a\u8ba8\u4ef7\u53d8\u6210\u201c\u4f60\u7ed9\u76ee\u6807\u6211\u7ed9\u65b9\u6848\u201d\u3002' },
      close: { en: 'Send the three details and I will have a firm number to you today \u2014 no placeholder pricing.', zh: '\u7528\u201c\u4eca\u5929\u51fa\u51c6\u4ef7\u201d\u6536\u53e3\uff0c\u4e0d\u7ed9\u6a21\u7cca\u62a5\u4ef7\u3002' },
      maintain: { en: 'I will keep an eye on space for this lane and let you know if anything changes on the AU side.', zh: '\u5c55\u793a\u957f\u671f\u4ef7\u503c\uff1a\u6211\u4f1a\u66ff\u4f60\u76ef\u8231\u4f4d\u3002' }
    },
    negotiation: {
      price: { en: 'I can move on the number, but I cannot move on what you get for it. Tell me which matters more \u2014 price or timing \u2014 and I will build it that way.', zh: '\u8ba9\u4ef7\u4e0d\u964d\u6807\u51c6\uff1a\u8ba9\u5bf9\u65b9\u9009\u201c\u4ef7\u683c\u6216\u65f6\u6548\u201d\uff0c\u800c\u4e0d\u662f\u76f4\u63a5\u780d\u4ef7\u3002' },
      close: { en: 'If we land within 150 of your number, can we lock it this week?', zh: '\u7528\u5c0f\u5e45\u5dee\u8ddd\u6362\u660e\u786e\u627f\u8bfa\uff0c\u63a8\u8fdb\u6210\u4ea4\u3002' },
      maintain: { en: 'Either way, I will keep watching the rate on this lane for you.', zh: '\u5373\u4f7f\u6ca1\u6210\u4e5f\u7559\u4e0b\u597d\u611f\u3002' }
    },
    timing: {
      price: { en: 'Faster costs more, and I will not pretend otherwise \u2014 but I can show you exactly what the extra buys.', zh: '\u628a\u52a0\u4ef7\u8bf4\u6210\u201c\u4e70\u5230\u4ec0\u4e48\u201d\uff0c\u4e0d\u662f\u6da8\u4ef7\u3002' },
      close: { en: 'Confirm the pickup today and I will hold the next vessel.', zh: '\u65f6\u6548\u578b\u5ba2\u6237\u6700\u5bb9\u6613\u88ab\u201c\u4eca\u5929\u786e\u8ba4\u201d\u63a8\u52a8\u3002' },
      maintain: { en: 'I will send you the vessel position every couple of days until it clears.', zh: '\u4e3b\u52a8\u62a5\u8fdb\u5ea6\uff0c\u6d88\u9664\u4e0d\u5b89\u3002' }
    },
    hesitation: {
      price: { en: 'No pressure on price right now \u2014 take the 30-day hold and decide when your customer does.', zh: '\u4e0d\u903c\u4ef7\uff0c\u7ed9\u9501\u4ef7\u671f\u3002' },
      close: { en: 'Try one container with us. If the number and the delivery hold up, the next ones are easy.', zh: '\u9996\u5355\u8bd5\u8fd0\uff0c\u964d\u4f4e\u51b3\u7b56\u98ce\u9669\u3002' },
      maintain: { en: 'I will check in once, not every week \u2014 you will hear from me when there is something worth hearing.', zh: '\u4f4e\u9891\u4f46\u6709\u4ef7\u503c\u7684\u8ddf\u8fdb\u3002' }
    },
    closing: {
      price: { en: 'The rate is locked for 30 days \u2014 the only thing that changes it is which sailing we pick.', zh: '\u9501\u4ef7 30 \u5929\uff0c\u6d88\u9664\u540e\u987e\u4e4b\u5fe7\u3002' },
      close: { en: 'Send the invoice and packing list today and I will issue the booking confirmation before 5pm.', zh: '\u7ed9\u660e\u786e\u65f6\u95f4\u70b9\u843d\u5730\u3002' },
      maintain: { en: 'From here I will send you a daily status from departure through to delivery, so you never have to chase.', zh: '\u4ea4\u4ed8\u540e\u7684\u670d\u52a1\u627f\u8bfa\uff0c\u662f\u7eed\u5355\u7684\u5173\u952e\u3002' }
    },
    risk: {
      price: { en: 'I am not going to discount this one \u2014 you should not pay twice for the same problem. What I will do is absorb the storage.', zh: '\u4e0d\u6253\u6298\u4f46\u8d1f\u62c5\u635f\u5931\uff0c\u6bd4\u7b3c\u7edf\u964d\u4ef7\u66f4\u6709\u8bda\u610f\u3002' },
      close: { en: 'Give me the next booking and I will show you the difference in writing.', zh: '\u7528\u4e0b\u4e00\u5355\u62ff\u56de\u4fe1\u4efb\u3002' },
      maintain: { en: 'I will follow this shipment to the door personally and report back.', zh: '\u4e2a\u4eba\u8ddf\u8fdb\u5230\u95e8\uff0c\u5efa\u7acb\u53ef\u9760\u5f62\u8c61\u3002' }
    }
  };
  Object.keys(SOP_EXTRA).forEach(function (k) { if (SOP[k]) Object.assign(SOP[k], SOP_EXTRA[k]); });
  var TONES = {
    steady: { zh: '稳妥推进', pick: ['empathy', 'fact', 'reason', 'option', 'offer', 'cta'] },
    push: { zh: '主动逼单', pick: ['fact', 'option', 'offer', 'cta'] },
    warm: { zh: '修复关系', pick: ['empathy', 'reason', 'option', 'offer', 'cta'] }
  };
  /* 性别语气微调：只改最影响观感的两三处，保持专业 */
  var GENDER_TWEAK = {
    female: {
      emp: function (s) { return s; },
      cta: function (s) { return s.replace(/^Reply "hold" and the space is yours for 48 hours\.$/, 'If that sounds workable, just reply "hold" and I will keep the space for you for 48 hours.').replace(/^Say the word /, 'Whenever you are ready, just say the word '); },
      tail: ' I will take care of the rest from here.'
    },
    male: {
      emp: function (s) { return s.replace(/^Fair point on price — /, 'Got it on price — ').replace(/^I am sorry — /, 'That is on us — '); },
      cta: function (s) { return s; },
      tail: ''
    }
  };
  function reply(an, opt) {
    opt = opt || {};
    var tone = TONES[opt.tone] || TONES.steady;
    var set = SOP[an.stage] || SOP.inquiry;
    var gender = opt.gender || 'any';
    var slots = Object.assign({ port: (an.facts.port[0] || 'the destination port'), etd: (an.facts.time[0] || 'the next sailing'), transit: '18 days', total: '23' }, opt.slots || {});
    function fill(s) { return String(s).replace(/\{([a-z]+)\}/gi, function (m, k) { return slots[k] != null ? slots[k] : m; }); }
    var pol = policies(opt.month, (an.lastThem || '') + ' ' + (opt.product || ''));
    var polEn = pol.map(function (p) { return p.en; }).join(' ');
    var polZh = pol.map(function (p) { return p.zh; }).join('\uff1b');
    var TW = GENDER_TWEAK[gender] || null;
    var seq = ['empathy', 'fact', 'news', 'option', 'price', 'offer', 'close', 'maintain'];
    var out = [];
    for (var i = 0; i < seq.length; i++) {
      var k = seq[i], t = set[k];
      var en = '', zh = '';
      if (k === 'news') { en = polEn; zh = '\u65f6\u4e8b\u653f\u7b56\uff1a' + polZh; }
      else if (k === 'price') { en = set.price ? fill(set.price.en) : ''; zh = set.price ? set.price.zh : ''; }
      else if (k === 'close') { en = set.close ? fill(set.close.en) : (set.cta ? fill(set.cta.en) : ''); zh = set.close ? set.close.zh : ''; }
      else if (k === 'maintain') { en = set.maintain ? fill(set.maintain.en) : ''; zh = set.maintain ? set.maintain.zh : ''; }
      else { en = t ? fill(t.en) : ''; zh = t ? t.zh : ''; }
      if (!en) continue;
      if (TW && k === 'empathy' && TW.emp) en = TW.emp(en);
      if (TW && (k === 'close') && TW.cta) en = TW.cta(en);
      if (TW && TW.tail && (k === 'maintain' || k === 'close')) en = en; 
      out.push({ key: k, en: en, zh: zh });
    }
    if (TW && TW.tail && out.length) out[out.length - 1].en += TW.tail;
    return {
      stage: an.stage, stageZh: an.stageZh, tone: opt.tone || 'steady', toneZh: tone.zh,
      gender: gender, genderZh: GENDER[gender] ? GENDER[gender].zh : '',
      policy: pol, parts: out,
      fullEn: out.map(function (x) { return x.en; }).join(String.fromCharCode(10, 10)),
      fullZh: out.map(function (x) { return x.zh; }).join(String.fromCharCode(10))
    };
  }

  /* ---------------- 个性化：按客户事实与哈希选中措辞变体（避免所有客户话术雷同） ---------------- */
  function hashOf(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; } return h >>> 0; }
  var VAR = {
    empathy: [
      'Fair point on price — I would rather solve it than lose you over it.',
      'I hear you, and I would rather fix this than lose the business over it.',
      'Got it — price is the sticking point, and I would rather work it out with you.',
      'That is a fair comment, and I am not going to talk around it.'
    ],
    cta: [
      'Reply "hold" and the space is yours for 48 hours.',
      'Say the word and I will lock the space for you today.',
      'One short reply is enough — I will handle the rest.',
      'Tell me to go ahead and I will reserve it now.'
    ],
    other: [
      'Got it. Let me come back to you on that today with a clear answer.',
      'Noted — I will check with the carrier and come back to you today, not next week.',
      'Understood. Give me until this afternoon and I will have a straight answer for you.',
      'Thanks for flagging that. I will confirm it and revert with specifics today.'
    ]
  };
  function personalize(res, msgs, an) {
    try {
      var h = hashOf(String((msgs || []).map(function (m) { return m.text; }).join(' ')).slice(0, 500));
      var name = '';
      (msgs || []).forEach(function (m) { if (!name && m.who === 'them' && m.name && /[A-Za-z\u4e00-\u9fa5]{2,}/.test(m.name)) name = m.name; });
      if (!name) {
        for (var i = 0; i < (msgs || []).length; i++) {
          var t0 = String(msgs[i].text || '');
          var mm = t0.match(/^(?:hi|hello|hey|dear)\s+([A-Z][a-z]{2,})/i);
          if (mm) { name = mm[1]; break; }
        }
      }
      var first = name ? name.split(/[\s@]/)[0] : '';
      (res.parts || []).forEach(function (p) {
        if (!VAR[p.key]) return;
        var v = VAR[p.key][h % VAR[p.key].length];
        if (p.key === 'empathy' || p.key === 'cta') p.en = v;
        else if (p.key === 'other') p.en = v;
      });
      if (first) {
        (res.parts || []).forEach(function (p) {
          if (p.key !== 'empathy') return;
          if (!/^[A-Z]/.test(p.en)) return;
          p.en = 'Hi ' + first + ', ' + p.en.charAt(0).toLowerCase() + p.en.slice(1);
        });
      }
      res.fullEn = (res.parts || []).map(function (x) { return x.en; }).join(String.fromCharCode(10, 10));
      res.customerName = name || '';
      return res;
    } catch (e) { return res; }
  }
  window.WAEngine = { personalize: personalize, hashOf: hashOf, detectApp: detectApp, findCustomer: findCustomer, intentOf: intentOf, INTENT: INTENT, replyPerMessage: replyPerMessage, evidence: evidence, clean: clean, parse: parse, analyze: analyze, facts: facts, reply: reply, score: score, funnel: funnel, fromBubbles: fromBubbles, SOP: SOP, TONES: TONES, GENDER: GENDER, POLICY: POLICY, policies: policies, SIG: SIG, uniq: uniq, FUNNEL: FUNNEL };
})();
