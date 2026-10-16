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
  /* ---------------- SOP 回复生成（共情 → 事实 → 情理 → 方案 → 优惠 → 行动） ---------------- */
  var SOP = {
    inquiry: {
      empathy: { en: 'Thanks for reaching out — happy to put numbers on this straight away.', zh: '先给确定性：外贸客户最怕"发了没回"，第一句就表明马上给方案。' },
      fact: { en: 'To keep it accurate, here is what I need: cargo ready date, exact pickup address, and whether it is cartons or pallets. With that I can lock {port} drayage, terminal access and empty return in one number — no surprises later.', zh: '要资料不要空话：把"报价"变成"填三个空就出准价"，降低对方动作成本。' },
      reason: { en: 'All-in rates that come without a breakdown are usually missing terminal access, empty return or the fuel surcharge — that is where the "cheap" quote turns expensive on the invoice.', zh: '先立专业标准：告诉对方"全包价"往往漏项，把你塑造成解释成本结构的人。' },
      option: { en: 'Two ways to go: (A) FCL 20GP/40HQ direct drayage, best landed cost per CBM; (B) if the volume is small, LCL with weekly consolidation — lower cash outlay, slightly longer transit.', zh: '给选项不给单一定价：让对方做"选哪个"而不是"买不买"的决定。' },
      offer: { en: 'If you can share the numbers by tomorrow, I will quote and hold space for 48 hours at no cost.', zh: '用"免费锁舱 48 小时"代替降价：零成本换来对方的决策时间承诺。' },
      cta: { en: 'Send me the pickup suburb and the cargo ready date, and I will have the number back to you today.', zh: '行动指令必须具体到"发什么"+"什么时候"，不要写"looking forward to your reply"。' }
    },
    negotiation: {
      empathy: { en: 'Thanks for being straight with me on the number — I would rather work this out with you than lose you over a few dollars.', zh: '接住对方的直白：不辩解、不喊冤，先把"一起解决"摆前面。' },
      fact: { en: 'Here is exactly what sits inside the figure: base cartage, fuel surcharge (FSC), terminal access, VBS slot, empty return and the port infrastructure charge. Nothing is padded — I can send the breakdown line by line.', zh: '拆解成本而不是喊"已经很便宜"：把透明度当武器，让对方无法拿一个模糊的对比价压你。' },
      reason: { en: 'The quote you compared with may well be real — but check whether it includes empty return and terminal access. If those land later, the A$200 you save today becomes a A$400 conversation next week.', zh: '不攻击同行，只提醒漏项：让客户自己得出"低价不安全"的结论，比你直接说更有效。' },
      option: { en: 'Two clean options: (A) keep the current sailing and service level — I hold the rate; (B) move to the following vessel and I can bring it down, with a later ETA you can plan around.', zh: '给 A/B 两个可执行方案：把"降价"换成"用时效换价格"，守住服务价值。' },
      offer: { en: 'I have asked my Melbourne partner for a one-off review. If you can confirm the booking by Friday, I will push for a reduction on the drayage and hold the rate for 30 days.', zh: '让价必须绑定条件（周五确认 + 30 天锁价）：既显诚意，又拿到承诺，避免"降了还不签"。' },
      cta: { en: 'Shall I hold the space while you check with your customer? Reply "hold" and I will keep the slot for 48 hours.', zh: '给出一个极低门槛的动作（回一个词），把大决定拆成小决定。' }
    },
    timing: {
      empathy: { en: 'I understand — after a delay, "about three weeks" is not an answer you can give your customer.', zh: '承认上次的问题，不做辩解，直接进入"能验证的时间"。' },
      fact: { en: 'Concrete timeline for this shipment: vessel departs {etd}; port-to-port transit {transit}; discharge and availability 1–2 days; drayage to {port} booked same day; delivery window 2–3 days. Total door-to-door: {total} days.', zh: '把时效拆成可核对的节点（开船/在途/提柜/派送），比形容词有说服力 10 倍。' },
      reason: { en: 'The reason I can commit to those dates is that I book the drayage slot before the vessel arrives, not after — that is usually where the extra week goes missing.', zh: '解释"为什么我能保证"：把流程差异讲清楚，暗示别家做不到。' },
      option: { en: 'If you need it earlier, we can pre-pull the container and store it near {port} so delivery happens the day it clears — small extra cost, removes the port queue entirely.', zh: '主动给加速方案（预提+近港堆存）：让客户感到你在帮他控风险。' },
      offer: { en: 'I will add a written ETA commitment on the booking confirmation, and if we miss the delivery window by more than 2 days I will cover the storage.', zh: '用"书面承诺 + 赔付"换信任：比降价更能拿下被延误伤过的客户。' },
      cta: { en: 'Confirm the shipper name and pickup address and I will lock this vessel today.', zh: '收口到一个动作：今天订舱，不给犹豫空间。' }
    },
    hesitation: {
      empathy: { en: 'That makes sense — it is a big decision and you should not rush it.', zh: '先允许对方犹豫：抗拒感一消失，对话才能继续。' },
      fact: { en: 'To make it easier, here is what a first shipment actually requires: booking confirmation, commercial invoice, packing list, and the pickup address. Everything else I handle.', zh: '把"大决定"拆成清单：让未知变已知，降低决策恐惧。' },
      reason: { en: 'Most customers start with one container to test us — the rate, the communication and the delivery date. If we do not perform, you have lost one shipment, not a year.', zh: '把风险缩到最小单位（先试一票）：这是最有效的破犹豫话术。' },
      option: { en: 'Option A: start with the 20GP and see how we run. Option B: if you prefer, I can hold the rate for 30 days while you decide, no deposit needed.', zh: '给"不用现在决定"的台阶，同时把价格锁住。' },
      offer: { en: 'For the first booking I will waive the documentation fee — treat it as a test run on us.', zh: '用小额让步换首次合作：首单让利是最划算的投资。' },
      cta: { en: 'Just tell me the cargo ready date and I will prepare the booking — you can still cancel free of charge up to 5 days before the cut-off.', zh: '给可撤销的承诺（截止前 5 天可免费取消）：把"要不要"变成"先占位"。' }
    },
    closing: {
      empathy: { en: 'Great — thank you for the trust. Let us make this one smooth.', zh: '成交后不返价、不啰嗦：直接进入执行，让对方感到"选对了人"。' },
      fact: { en: 'Here is what I need to lock the booking: shipper name, pickup address and contact, cargo ready date, and the commercial invoice + packing list for customs.', zh: '一次把资料清单给全：减少来回就是最好的服务体验。' },
      reason: { en: 'I will send the booking confirmation, the sailing schedule and the delivery plan in one email today, so your customer has the dates in writing.', zh: '主动给"可转发给终端客户"的材料：帮你客户对他自己的客户交差。' },
      option: { en: 'Payment: 50% on booking, balance against the bill of lading — or full payment up front if you prefer the discount.', zh: '付款条件给两选一，默认引导到对双方都稳的选项。' },
      offer: { en: 'Because you confirmed early, I can apply this week\'s rate instead of next week\'s — that alone saves you the peak adjustment.', zh: '把"已给的优惠"包装成"因为你早确认":强化对方决策正确性。' },
      cta: { en: 'Send the invoice and packing list today and I will issue the booking confirmation before 5pm.', zh: '给出明确的时间点，让成交立刻落地。' }
    },
    risk: {
      empathy: { en: 'I am sorry — that is on us, and I understand why you are frustrated.', zh: '先认账：此时任何解释都像推责，先把情绪接住。' },
      fact: { en: 'Here is what happened, in order, and what it cost you: the container was held for inspection, and the delay was 6 days rather than the 2 we quoted.', zh: '用事实复述而不是理由堆砌：让对方确认"你搞清楚了"。' },
      reason: { en: 'I am not going to promise it will never happen; I am going to change the part I control — I now book the drayage slot in advance and pre-check the inspection flags before the vessel berths.', zh: '不空口保证，只承诺"可执行的改变"：这比道歉更值钱。' },
      option: { en: 'For the next shipment I will (A) send you a daily status update from discharge, and (B) absorb the storage if we miss the window.', zh: '给补偿 + 机制：让客户看到你为"不再发生"付了成本。' },
      offer: { en: 'I have also credited the storage charge on this shipment — you should not pay for our delay.', zh: '实打实的减免：一次真诚的赔付能换回长期客户。' },
      cta: { en: 'May I set up the next booking so we can show you the difference?', zh: '用"下一次"收尾：把事故变成继续合作的理由。' }
    },
    silence: {
      empathy: { en: 'No pressure at all — I know how busy things get on your side.', zh: '不催单：先给对方台阶，避免"被推销"的抵触。' },
      fact: { en: 'One thing that changed since my last message: the carrier released extra space on the {etd} sailing, so the rate is A$180 lower than what I quoted you.', zh: '跟进必须带"新信息"：没有新信息的追问就是打扰。' },
      reason: { en: 'I am passing it on because it is genuinely time-limited — not to push you.', zh: '点明"我在帮你抓机会"而不是"我要业绩"。' },
      option: { en: 'If the timing is not right, tell me the month you are planning and I will pencil it in and send you the rates when they open.', zh: '给"现在不买"的出口，同时拿到未来的档期信息。' },
      offer: { en: 'Either way, the number below is held for 7 days for you.', zh: '锁定有效期：制造温和的紧迫感。' },
      cta: { en: 'Just reply with a word — "later" is a perfectly good answer.', zh: '极低门槛回复：让对方回一个字，关系就续上了。' }
    }
  };
  var TONES = {
    steady: { zh: '稳妥推进', pick: ['empathy', 'fact', 'reason', 'option', 'offer', 'cta'] },
    push: { zh: '主动逼单', pick: ['fact', 'option', 'offer', 'cta'] },
    warm: { zh: '修复关系', pick: ['empathy', 'reason', 'option', 'offer', 'cta'] }
  };
  function reply(an, opt) {
    opt = opt || {};
    var tone = TONES[opt.tone] || TONES.steady;
    var set = SOP[an.stage] || SOP.inquiry;
    var slots = Object.assign({ port: (an.facts.port[0] || 'the destination port'), etd: (an.facts.time[0] || 'the next available sailing'), transit: '18 days', total: '21–23' }, opt.slots || {});
    function fill(s) { return String(s).replace(/\{([a-z]+)\}/gi, function (m, k) { return slots[k] != null ? slots[k] : m; }); }
    var out = [];
    for (var i = 0; i < tone.pick.length; i++) {
      var k = tone.pick[i], t = set[k];
      if (!t) continue;
      out.push({ key: k, en: fill(t.en), zh: t.zh });
    }
    return {
      stage: an.stage, stageZh: an.stageZh, tone: opt.tone || 'steady', toneZh: tone.zh,
      parts: out,
      fullEn: out.map(function (x) { return x.en; }).join('\n\n'),
      fullZh: out.map(function (x) { return x.zh; }).join('\n')
    };
  }
  window.WAEngine = { clean: clean, parse: parse, analyze: analyze, facts: facts, reply: reply, SOP: SOP, TONES: TONES, SIG: SIG, uniq: uniq };
})();
