/* ============================================================================
 * AI 深度分析（多引擎，默认免密钥免费通道）
 *   free:Pollinations(免密钥) / gemini / groq / openrouter / deepseek / custom
 *   失败一律回落到本地规则引擎（不联网、不上传）
 * ==========================================================================*/
(function () {
  'use strict';
  var PROVIDERS = {
    free: { zh: '免费在线 AI（免密钥）', needKey: false, kind: 'openai', base: 'https://text.pollinations.ai/openai', model: 'openai' },
    gemini: { zh: 'Google Gemini（免费额度）', needKey: true, kind: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta/models/', model: 'gemini-2.0-flash' },
    groq: { zh: 'Groq（免费额度·快）', needKey: true, kind: 'openai', base: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
    openrouter: { zh: 'OpenRouter（免费模型）', needKey: true, kind: 'openai', base: 'https://openrouter.ai/api/v1/chat/completions', model: 'meta-llama/llama-3.3-70b-instruct:free' },
    deepseek: { zh: 'DeepSeek', needKey: true, kind: 'openai', base: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
    custom: { zh: '自定义（OpenAI 兼容）', needKey: true, kind: 'openai', base: '', model: '' }
  };
  var LANGS = { en: 'English', yue: 'Cantonese (spoken Hong Kong style, written in Traditional Chinese)', es: 'Spanish (Latin American business Spanish)', ar: 'Arabic (Modern Standard, business register)', pt: 'Portuguese (Brazilian business)' };
  function sysPrompt(lang, tone, country, product, opt) {
    opt = opt || {};
    var toneZh = { steady: '\u7a33\u59a5\u63a8\u8fdb', push: '\u4e3b\u52a8\u903c\u5355', warm: '\u4fee\u590d\u5173\u7cfb' }[tone] || '\u7a33\u59a5\u63a8\u8fdb';
    var genderZh = { male: '\u7537\u5ba2\u6237\uff08\u76f4\u63a5\u3001\u7ed3\u8bba\u5148\u884c\u3001\u6570\u5b57\u8bf4\u8bdd\u3001\u5c11\u5bd2\u6684\uff09', female: '\u5973\u5ba2\u6237\uff08\u5148\u63a5\u60c5\u7eea\u3001\u8bed\u6c14\u67d4\u548c\u3001\u591a\u7528\u201c\u6211\u6765\u5904\u7406/\u4f60\u653e\u5fc3\u201d\uff09', any: '\u4e0d\u6307\u5b9a' }[opt.gender || 'any'] || '\u4e0d\u6307\u5b9a';
    var L = [
      'You are a senior business manager at GlobalVertical, a Chinese freight forwarder running the China to Australia FCL trade lane. You know ABF (Australian Border Force) and DAFF rules, biosecurity, fumigation, GST/duty, port charges and drayage by heart.',
      'You are reading a chat between us and an overseas customer. Your job: read the real intent, then draft replies that a real human would send on WhatsApp - not a corporate email, not AI-speak.',
      'Draft language: ' + (LANGS[lang] || LANGS.en) + '. All Chinese fields stay in Simplified Chinese. Tone: ' + toneZh + '. Customer profile: ' + genderZh + '.',
      country ? ('Customer market: ' + country + '.') : '',
      product ? ('Main product: ' + product + '.') : '',
      opt.news ? ('Live policy facts you may reference (only if relevant): ' + opt.news) : '',
      'STYLE - sound like a real person, not AI:',
      '- Short sentences. WhatsApp length. No formal openings like I hope this email finds you well.',
      '- No corporate connectives: avoid Furthermore, Moreover, In addition, Additionally, I would like to.',
      '- No perfect parallel lists, no em-dash overuse, no emojis.',
      '- Use one natural human touch max per paragraph: Actually, Honestly, Just so you know, Fair enough, Got it.',
      '- Sound like someone who has shipped this lane many times and is not desperate for the order.',
    ];
    L.push('Return PLAIN TEXT in EXACTLY this line format (one field per line, NO JSON, no markdown):');
    L.push('STAGE: inquiry|negotiation|timing|hesitation|closing|risk|silence');
    L.push('STAGE_ZH: \u9636\u6bb5\u4e2d\u6587');
    L.push('SENTIMENT: positive|neutral|negative');
    L.push('SENTIMENT_ZH: \u60c5\u7eea\u4e2d\u6587');
    L.push('CONCERNS: \u987e\u86511 | \u987e\u86512');
    L.push('SIGNALS: \u4fe1\u53f71 | \u4fe1\u53f72');
    L.push('FACTS: \u91d1\u989d/\u6570\u91cf/\u65f6\u95f4/\u6e2f\u53e3\u7b49\u4e8b\u5b9e');
    L.push('RISK: \u4e00\u53e5\u4e2d\u6587\u98ce\u9669\u63d0\u793a');
    L.push('ADVICE: \u4e00\u53e5\u4e2d\u6587\u7b56\u7565');
    L.push('READING: 2-3\u53e5\u4e2d\u6587\uff0c\u6309\u897f\u65b9\u5ba2\u6237\u601d\u7ef4\u8bfb\u61c2\u6f5c\u53f0\u8bcd');
    L.push('NEWS: \u4e00\u53e5\u4e2d\u6587\u65f6\u4e8b\u5206\u6790\uff08ABF/DAFF \u653f\u7b56\u5982\u4f55\u5f71\u54cd\u8fd9\u7968\u8d27\uff09');
    ['empathy', 'fact', 'news', 'option', 'price', 'offer', 'close', 'maintain'].forEach(function (k, i) {
      L.push('R' + (i + 1) + '_KEY: ' + k);
      L.push('R' + (i + 1) + '_TEXT: \u5bf9\u5e94\u6bb5\u843d\uff08\u76ee\u6807\u8bed\u8a00\uff0c1-2\u53e5\uff09');
      L.push('R' + (i + 1) + '_ZH: \u4e2d\u6587\u89e3\u6790\uff08\u4e3a\u4ec0\u4e48\u8fd9\u4e48\u5199\uff09');
    });
    L.push('8 sections in this fixed SOP order: empathy (\u5171\u60c5), fact (\u4e8b\u5b9e\u5206\u6790), news (\u65f6\u4e8b/\u653f\u7b56), option (\u65b9\u6848\u63a8\u8350), price (\u4ef7\u683c\u8c08\u5224), offer (\u4f18\u60e0\u7533\u8bf7), close (\u6c9f\u901a\u6210\u4ea4), maintain (\u7ef4\u62a4).');
    L.push('Every *_TEXT must be ONE line, 1-2 sentences, sendable as-is. No placeholders unless the number is unknown (then use [rate]).');
    L.push('All Chinese fields (stageZh, sentimentZh, concerns, signals, risk, advice, reading, news, noteZh) stay in Simplified Chinese.');
    return L.filter(Boolean).join(String.fromCharCode(10));
  }
  function pick(o, keys, d) { for (var i = 0; i < keys.length; i++) { if (o && o[keys[i]] != null && o[keys[i]] !== '') return o[keys[i]]; } return d; }
  function extractJson(txt) {
    var s = String(txt || '').replace(/```json/gi, '```').replace(/```/g, ' ');
    var i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i < 0 || j <= i) throw new Error('模型未返回 JSON');
    var raw = s.slice(i, j + 1);
    try { return JSON.parse(raw); } catch (e) { return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')); }
  }
  function chat(messages, cfg) {
    cfg = cfg || {};
    var pid = cfg.provider || 'free', P = PROVIDERS[pid] || PROVIDERS.free;
    var base = cfg.base || P.base, model = cfg.model || P.model, key = cfg.key || '';
    if (P.needKey && !key) return Promise.reject(new Error('该引擎需要 API Key：' + P.zh));
    var headers = { 'Content-Type': 'application/json' }, url = base, body;
    if (P.kind === 'gemini') {
      url = base + model + ':generateContent?key=' + encodeURIComponent(key);
      body = { contents: [{ parts: [{ text: messages.map(function (m) { return m.content; }).join(String.fromCharCode(10, 10)) }] }] };
    } else {
      if (key) headers.Authorization = 'Bearer ' + key;
      body = { model: model, messages: messages, temperature: 0.3, max_tokens: 1800 };
    }
    var attempt = function (n) {
      var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var to = setTimeout(function () { if (ctl) { try { ctl.abort(); } catch (e) {} } }, cfg.timeout || 75000);
      return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
        .then(function (r) { clearIt(); return r; }, function (e) { clearIt(); throw e; });
      function clearIt() { clearTimeout(to); }
    };
    var once = function () { return attempt().then(function (r) {
      return r.text().then(function (t) {
        if (!r.ok) throw new Error('AI 接口 ' + r.status + '：' + t.slice(0, 150));
        var j = null; try { j = JSON.parse(t); } catch (e) { return t; }
        if (P.kind === 'gemini') {
          try { return j.candidates[0].content.parts.map(function (p) { return p.text; }).join(''); } catch (e) { throw new Error('Gemini 返回异常'); }
        }
        if (j.choices && j.choices[0]) return (j.choices[0].message && j.choices[0].message.content) || j.choices[0].text || '';
        return String(t);
      });
    }); };
    return once().catch(function (e) {
      var msg = String((e && e.message) || e);
      if (/abort/i.test(msg)) msg = '请求超时（免费通道偶发拥堵，请重试或换通道）';
      return new Promise(function (r) { setTimeout(r, 900); }).then(once).catch(function (e2) {
        var m2 = String((e2 && e2.message) || e2);
        if (/abort/i.test(m2)) m2 = '请求超时（已重试一次）';
        throw new Error(m2);
      });
    });
  }
  function parseLines(txt) {
    var out = { parts: [], concerns: [], signals: [], facts: { money: [], qty: [], time: [], port: [], incoterm: [] }, extra: '' };
    var lines = String(txt || '').replace(/\*\*/g, '').split(/\r?\n/);
    var byKey = {};
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^\s*[-*•]?\s*([A-Za-z_][A-Za-z0-9_]{1,14})\s*[:：]\s*(.+?)\s*$/);
      if (!m) { if (out.extra.length < 400 && lines[i].trim()) out.extra += ' ' + lines[i].trim(); continue; }
      byKey[m[1].toUpperCase()] = m[2];
    }
    var g = function (k, d) { return byKey[k] != null ? byKey[k] : (d || ''); };
    var splitBar = function (v) { return String(v || '').split(/\s*[|｜]\s*/).map(function (x) { return x.trim(); }).filter(Boolean); };
    out.stage = (g('STAGE', 'inquiry').split(/[\s(（]/)[0] || 'inquiry').toLowerCase();
    out.stageZh = g('STAGE_ZH'); out.sentiment = (g('SENTIMENT', 'neutral').split(/[\s(（]/)[0] || 'neutral').toLowerCase();
    out.sentimentZh = g('SENTIMENT_ZH'); out.concerns = splitBar(g('CONCERNS')); out.signals = splitBar(g('SIGNALS'));
    var fx = splitBar(g('FACTS'));
    out.facts.money = fx.filter(function (x) { return /(USD|AUD|RMB|\$|￥|¥|\d+)/.test(x); });
    out.risk = g('RISK'); out.stageAdvice = g('ADVICE'); out.reading = g('READING'); out.news = g('NEWS');
    for (var r = 1; r <= 8; r++) {
      var t = g('R' + r + '_TEXT'); if (!t) continue;
      out.parts.push({ key: (g('R' + r + '_KEY', 'cta') || 'cta').toLowerCase(), en: t, zh: g('R' + r + '_ZH') });
    }
    return out;
  }
  function analyze(transcript, opt) {
    opt = opt || {};
    var newsLine = (window.WAEngine && opt.month != null) ? '' : '';
    var pol = (window.WAEngine && window.WAEngine.policies) ? window.WAEngine.policies(opt.month, (opt.product || '') + ' ' + (opt.lastThem || '')) : [];
    var newsTxt = pol.map(function (p) { return p.zh; }).join('\uff1b');
    var msgs = [{ role: 'system', content: sysPrompt(opt.lang, opt.tone, opt.country, opt.product, { gender: opt.gender, news: newsTxt }) },
      { role: 'user', content: 'Draft language: ' + (LANGS[opt.lang] || LANGS.en) + '. Write every *_TEXT value in that language only. Follow the line format exactly.' + String.fromCharCode(10) + 'Chat transcript:' + String.fromCharCode(10) + String(transcript).slice(0, 12000) }];
    return chat(msgs, opt).then(function (txt) {
      var j = null;
      if (String(txt).trim().charAt(0) === '{') { try { j = extractJson(txt); } catch (e) { j = null; } }
      var o;
      if (j) {
        o = { stage: pick(j, ['stage'], 'inquiry'), stageZh: pick(j, ['stageZh'], ''), sentiment: pick(j, ['sentiment'], 'neutral'), sentimentZh: pick(j, ['sentimentZh'], ''),
          concerns: j.concerns || [], signals: j.signals || [], facts: j.facts || { money: [], qty: [], time: [], port: [], incoterm: [] },
          risk: pick(j, ['risk'], ''), stageAdvice: pick(j, ['advice'], ''), reading: pick(j, ['reading'], ''),
          parts: (j.replies || []).map(function (r) { return { key: pick(r, ['key'], 'cta'), en: pick(r, ['text', 'en'], ''), zh: pick(r, ['noteZh', 'zh'], '') }; }) };
      } else {
        o = parseLines(txt);
      }
      if (!o.parts.length) throw new Error('模型未按格式返回（可重试或改用本地规则引擎）');
      if (o.news == null) o.news = '';
      if (o.parts.length > 8) o.parts = o.parts.slice(0, 8);
      o.ai = true; o.provider = opt.provider || 'free';
      o.fullEn = o.parts.map(function (p) { return p.en; }).join(String.fromCharCode(10, 10));
      return o;
    });
  }
  function test(cfg) { return chat([{ role: 'user', content: 'Reply with the single word OK' }], cfg); }
  window.WAAI = { PROVIDERS: PROVIDERS, LANGS: LANGS, chat: chat, analyze: analyze, test: test, extractJson: extractJson, sysPrompt: sysPrompt };
})();
