/* ============================================================================
 * ChAFTA 中澳自由贸易协定 · 关税判定与英文凭证（自包含经典脚本）
 * 暴露 window.ChAFTA = { version, RATE_YEAR, UPDATED, lookup, renderCard,
 *                          evidenceHTML, openEvidence, compactHTML, LEGAL }
 * 说明：数据为常用品类参考（MFN 基准税率 vs ChAFTA 协定税率），
 *       最终以 ABF Tariff / ChAFTA Annex I 官方发布为准。
 * ==========================================================================*/
(function(){
'use strict';
var RATE_YEAR = '2026';
var UPDATED = '2026-07-01';
/* 澳大利亚关税章节默认值：mfn=最惠国基准税率, ch=ChAFTA 协定税率（中国原产） */
var CHAPTERS = {
  '10':{m:0.05,c:0.05,n:'谷物（部分配额管理）'}, '17':{m:0.05,c:0.05,n:'糖类（配额 / 非全面零关税）'},
  '22':{m:0.05,c:0.00,n:'饮料酒类（葡萄酒 2204 已零关税）'}, '24':{m:0.05,c:0.05,n:'烟草（不在零关税范围，另征消费税）'},
  '39':{m:0.05,c:0.00,n:'塑料及其制品'}, '40':{m:0.05,c:0.00,n:'橡胶及其制品'},
  '42':{m:0.05,c:0.00,n:'皮革制品 / 箱包'}, '44':{m:0.05,c:0.00,n:'木及木制品'},
  '48':{m:0.05,c:0.00,n:'纸及纸制品'}, '61':{m:0.05,c:0.00,n:'针织服装'}, '62':{m:0.05,c:0.00,n:'梭织服装'},
  '63':{m:0.10,c:0.00,n:'其他纺织制品 / 家纺'}, '64':{m:0.05,c:0.00,n:'鞋靴'},
  '68':{m:0.05,c:0.00,n:'石料 / 石膏 / 水泥制品'}, '69':{m:0.05,c:0.00,n:'陶瓷制品（瓷砖 6907 等）'},
  '70':{m:0.05,c:0.00,n:'玻璃及玻璃制品'}, '72':{m:0.05,c:0.00,n:'钢铁（可能另征反倾销税）'},
  '73':{m:0.05,c:0.00,n:'钢铁制品（可能另征反倾销税）'}, '76':{m:0.05,c:0.00,n:'铝及铝制品（可能另征反倾销税）'},
  '82':{m:0.05,c:0.00,n:'工具 / 刀具'}, '83':{m:0.05,c:0.00,n:'贱金属杂项制品 / 五金'},
  '84':{m:0.00,c:0.00,n:'机械设备（多数已零关税）'}, '85':{m:0.05,c:0.00,n:'电气设备 / 电子产品'},
  '87':{m:0.05,c:0.00,n:'车辆及其零件'}, '90':{m:0.00,c:0.00,n:'光学 / 医疗仪器（多数零关税）'},
  '94':{m:0.05,c:0.00,n:'家具 / 灯具 / 床垫'}, '95':{m:0.05,c:0.00,n:'玩具 / 运动用品'},
  '96':{m:0.05,c:0.00,n:'杂项制品'}, '33':{m:0.05,c:0.00,n:'化妆品 / 护肤'},
  '34':{m:0.05,c:0.00,n:'洗涤 / 皂类'}, '30':{m:0.00,c:0.00,n:'药品（多数零关税）'},
  '27':{m:0.00,c:0.00,n:'矿物燃料（多数零关税）'}, '38':{m:0.05,c:0.00,n:'化工杂项'}, '31':{m:0.00,c:0.00,n:'肥料'}
};
/* 常用具体税目（比章节默认更精确） */
var LINES = [
  {p:'9403',m:0.05,c:0,n:'家具（木家具 / 金属家具 / 塑料家具）',n2:['木制家具需注意熏蒸/ISPM15 木质包装','含皮革/纺织面料的家具可能涉及材质申报']},
  {p:'9401',m:0.05,c:0,n:'坐具（沙发 / 椅子 / 座椅）',n2:['软包家具注意阻燃与标签要求']},
  {p:'9405',m:0.05,c:0,n:'灯具及照明装置',n2:['LED 灯具需符合澳洲电气安全（RCM 认证/AS-NZS 标准）']},
  {p:'9503',m:0.05,c:0,n:'玩具（儿童玩具 / 益智玩具）',n2:['儿童玩具须符合 AS/NZS ISO 8124 安全标准','含电池玩具注意锂电池运输要求']},
  {p:'6907',m:0.05,c:0,n:'陶瓷砖 / 铺面砖',n2:['瓷砖注意放射性/尺寸申报']},
  {p:'6910',m:0.05,c:0,n:'卫生陶瓷（洗手盆 / 马桶）',n2:['洁具需符合 WaterMark 水效认证（部分州要求）']},
  {p:'6810',m:0.05,c:0,n:'水泥 / 混凝土 / 人造石制品',n2:['⚠ 人造石（结晶二氧化硅 ≥1%）禁止进口 —— ABF 禁令','石材需申报是否含石棉']},
  {p:'6802',m:0.05,c:0,n:'天然石材（花岗岩 / 大理石）',n2:['天然石需熏蒸/清洁证明，防止土壤与种籽']},
  {p:'7308',m:0.05,c:0,n:'钢铁结构件 / 门窗框架',n2:['⚠ 对华钢制门窗/框架可能存在反倾销措施（按出口商裁定）','焊接结构件注意 AS/NZS 标准']},
  {p:'7326',m:0.05,c:0,n:'其他钢铁制品',n2:['可能涉及反倾销（钢制紧固件/支架等）']},
  {p:'7318',m:0.05,c:0,n:'钢铁紧固件（螺丝 / 螺栓）',n2:['⚠ 对华部分紧固件有反倾销措施']},
  {p:'7616',m:0.05,c:0,n:'其他铝制品',n2:['⚠ 铝型材/铝制品可能涉及反倾销']},
  {p:'7604',m:0.05,c:0,n:'铝型材',n2:['⚠ 对华铝型材有反倾销措施（按出口商税率）']},
  {p:'8302',m:0.05,c:0,n:'五金件 / 门窗配件',n2:['注意与整机/结构件的归类区分']},
  {p:'3917',m:0.05,c:0,n:'塑料管材 / 塑料制品',n2:['PVC 管材注意 AS/NZS 认证']},
  {p:'3926',m:0.05,c:0,n:'其他塑料制品',n2:['食品接触类塑料需符合澳新食品标准']},
  {p:'4009',m:0.05,c:0,n:'橡胶管 / 橡胶制品',n2:['工业橡胶件注意材质申报']},
  {p:'4202',m:0.05,c:0,n:'箱包 / 手袋 / 旅行用品',n2:['皮革制品注意濒危物种（CITES）证明']},
  {p:'4821',m:0.05,c:0,n:'纸标签 / 纸制品',n2:['食品接触纸品需符合食品级要求']},
  {p:'6109',m:0.05,c:0,n:'针织 T 恤 / 针织服装',n2:['纺织品需正确申报成分与克重','注意甲醛/偶氮染料合规']},
  {p:'6203',m:0.05,c:0,n:'梭织男装 / 女装',n2:['服装标签需含纤维成分与产地']},
  {p:'6302',m:0.05,c:0,n:'家纺（床品 / 毛巾）',n2:['纺织品阻燃要求（部分品类）']},
  {p:'6403',m:0.05,c:0,n:'皮鞋 / 皮靴',n2:['皮革制鞋注意材质申报']},
  {p:'6404',m:0.05,c:0,n:'运动鞋 / 布鞋',n2:['鞋类注意反倾销风险较低，但需如实申报']},
  {p:'7009',m:0.05,c:0,n:'玻璃镜 / 玻璃制品',n2:['钢化玻璃需符合 AS/NZS 2208 安全玻璃标准']},
  {p:'8414',m:0.00,c:0,n:'风机 / 泵 / 压缩机',n2:['机械设备注意电气安全与能效标签']},
  {p:'8479',m:0.05,c:0,n:'专用机械 / 自动化设备',n2:['大型设备注意木包装 ISPM15 熏蒸']},
  {p:'8481',m:0.05,c:0,n:'阀门 / 管道配件',n2:['压力设备需符合 AS/NZS 标准']},
  {p:'8507',m:0.05,c:0,n:'锂电池 / 蓄电池',n2:['⚠ 锂电池属危险品，需 UN38.3 + MSDS + 危包证','空运/海运需按 IMDG/IATA 申报']},
  {p:'8541',m:0.00,c:0,n:'太阳能板 / 光伏组件',n2:['光伏组件需 CEC 列名与清洁能源认证']},
  {p:'8539',m:0.05,c:0,n:'LED 灯泡 / 灯管',n2:['需符合澳洲 MEPS 能效与 RCM 认证']},
  {p:'8516',m:0.05,c:0,n:'家用电器（电热水器 / 小家电）',n2:['需 RCM 认证与澳洲插头标准 AS/NZS 3112']},
  {p:'8471',m:0.00,c:0,n:'电脑 / 笔记本 / 服务器',n2:['含电池设备注意锂电池运输']},
  {p:'8517',m:0.00,c:0,n:'手机 / 通讯设备',n2:['无线电设备需 ACMA 认证']},
  {p:'8703',m:0.05,c:0,n:'乘用车',n2:['⚠ 车辆需符合澳洲 ADR 认证与进口许可','二手车限制进口']},
  {p:'8704',m:0.05,c:0,n:'货车 / 商用车',n2:['需 ADR 合规与进口许可']},
  {p:'8711',m:0.05,c:0,n:'摩托车 / 电动车',n2:['电动摩托车需符合 ADR / RCM']},
  {p:'8712',m:0.00,c:0,n:'自行车 / 非机动车辆',n2:['自行车需符合 AS/NZS 1927 安全标准']},
  {p:'4412',m:0.05,c:0,n:'胶合板 / 人造板',n2:['⚠ 木制品必须 ISPM15 熏蒸并附植检证书','胶合板可能涉及甲醛释放标准']},
  {p:'4418',m:0.05,c:0,n:'木门 / 木窗 / 木构件',n2:['⚠ 木制品需熏蒸 + 植检证书']},
  {p:'2204',m:0.05,c:0,n:'葡萄酒',n2:['酒类另征 WET 酒税（29%），与关税不同']},
  {p:'1701',m:0.05,c:0.05,n:'蔗糖 / 白糖',n2:['⚠ 糖类为配额管理（TRQ），不在零关税范围']},
  {p:'1006',m:0.05,c:0.05,n:'大米',n2:['⚠ 大米为配额管理（TRQ）']},
  {p:'2402',m:0.05,c:0.05,n:'烟草 / 卷烟',n2:['⚠ 烟草不在零关税范围，另征高额消费税']}
];
/* 品名关键词 → HS 前缀（中英文） */
var KEYS = [
  ['家具','9403'],['沙发','9401'],['椅','9401'],['桌','9403'],['床','9403'],['柜','9403'],['茶几','9403'],['餐桌','9403'],['衣柜','9403'],
  ['furniture','9403'],['chair','9401'],['sofa','9401'],['table','9403'],['cabinet','9403'],['bed','9403'],['mattress','9404'],
  ['灯具','9405'],['灯','9405'],['lamp','9405'],['lighting','9405'],['led','8539'],
  ['玩具','9503'],['toy','9503'],['益智','9503'],
  ['瓷砖','6907'],['陶瓷','6910'],['tile','6907'],['ceramic','6907'],['马桶','6910'],['洗手盆','6910'],
  ['石材','6802'],['大理石','6802'],['花岗岩','6802'],['quartz','6810'],['stone','6802'],['台面','6810'],['人造石','6810'],
  ['钢铁','7308'],['钢结构','7308'],['门窗','7308'],['steel','7308'],['螺丝','7318'],['紧固件','7318'],['bolt','7318'],['screw','7318'],
  ['铝','7604'],['aluminium','7604'],['aluminum','7604'],['铝合金','7604'],
  ['五金','8302'],['hardware','8302'],['配件','8302'],
  ['塑料','3926'],['plastic','3926'],['pvc','3917'],['管','3917'],
  ['橡胶','4009'],['rubber','4009'],['箱包','4202'],['包','4202'],['bag','4202'],['luggage','4202'],
  ['纸','4821'],['paper','4821'],['标签','4821'],
  ['服装','6203'],['衣服','6203'],['t恤','6109'],['衬衫','6203'],['apparel','6203'],['clothing','6203'],['服装面料','6302'],
  ['鞋','6403'],['shoe','6403'],['boot','6403'],['sneaker','6404'],
  ['家纺','6302'],['床品','6302'],['毛巾','6302'],['textile','6302'],
  ['玻璃','7009'],['glass','7009'],['镜','7009'],
  ['机械','8479'],['设备','8479'],['machine','8479'],['machinery','8479'],['泵','8414'],['阀门','8481'],['valve','8481'],
  ['电池','8507'],['battery','8507'],['锂电池','8507'],['蓄电池','8507'],['太阳能','8541'],['光伏','8541'],['solar','8541'],
  ['电器','8516'],['家电','8516'],['appliance','8516'],['电脑','8471'],['computer','8471'],['手机','8517'],['phone','8517'],
  ['汽车','8703'],['车','8703'],['car','8703'],['truck','8704'],['货车','8704'],['摩托车','8711'],['motorcycle','8711'],['自行车','8712'],['bike','8712'],['bicycle','8712'],
  ['胶合板','4412'],['木板','4412'],['plywood','4412'],['木门','4418'],['木窗','4418'],['timber','4412'],['wood','4412'],
  ['葡萄酒','2204'],['wine','2204'],['红酒','2204'],['糖','1701'],['sugar','1701'],['大米','1006'],['rice','1006'],['烟草','2402'],['tobacco','2402']
];
var LEGAL = [
  'China-Australia Free Trade Agreement (ChAFTA), entered into force 20 Dec 2015',
  'ChAFTA Annex I — Australia Schedule of Tariff Commitments (tariff item rates)',
  'ChAFTA Chapter 4 — Rules of Origin (Article 4.2, Product Specific Rules, Annex 4-A)',
  'Customs Tariff Act 1995 (Cth) — Schedule 3 (General/MFN rates) & Schedule 5 (preferential rates)',
  'Australian Border Force — Integrated Cargo System / Tariff Classification guidance',
  'Australian Border Force notice: Prohibited imports (engineered stone, asbestos, etc.)'
];
var KEY_URLS = [
  {t:'ABF Tariff / classification', u:'https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification' },
  {t:'DFAT ChAFTA text & schedules', u:'https://www.dfat.gov.au/trade/agreements/in-force/chafta' },
  {t:'ABF prohibited imports', u:'https://www.abf.gov.au/importing-exporting-and-manufacturing/prohibited-goods' }
];
function norm(s){ return String(s==null?'':s).toLowerCase().replace(/[\s\u3000\-\/（）()【】\[\]:：,，.。_]+/g,' ').trim(); }
function digits(s){ return String(s==null?'':s).replace(/\D/g,''); }
function fmtPct(x){ if(x==null||isNaN(x)) return '—'; return (x*100).toFixed(x*100 % 1 === 0 ? 0 : 1) + '%'; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
function nowStr(){ var d=new Date(); var p=function(n){return String(n).padStart(2,'0');}; return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes()); }
function findByHs(hs){
  if(!hs || hs.length<4) return null;
  var best=null;
  LINES.forEach(function(l){ if(hs.indexOf(l.p)===0 && (!best || l.p.length>best.p.length)) best=l; });
  return best;
}
function findByKeyword(q){
  var s=norm(q), best=null;
  KEYS.forEach(function(k){ if(s.indexOf(norm(k[0]))>=0){ if(!best || k[0].length>best[0].length) best=k; } });
  return best ? best[1] : null;
}
function lookup(q, opt){
  opt=opt||{};
  var raw=String(q==null?'':q).trim();
  var hs=digits(raw);
  var keyed=false, name='';
  if(hs.length>=4){
    var l=findByHs(hs);
    if(l){ name=l.n; } else { name=''; }
  } else {
    var p=findByKeyword(raw);
    if(p){ hs=p; keyed=true; var l2=findByHs(p); if(l2) name=l2.n; }
  }
  if(!hs || hs.length<4) return { ok:false, error:'请输入 4 位以上 HS 编码，或输入产品品名（如：实木餐桌 / Lithium battery）', query:raw };
  var line=findByHs(hs);
  var ch=hs.slice(0,2);
  var chDef=CHAPTERS[ch];
  var mfn, chafta, chapterNote='', notes=[], prohib=[], ad=[];
  if(line){ mfn=line.m; chafta=line.c; name=name||line.n; (line.n2||[]).forEach(function(x){ notes.push(x); }); }
  else if(chDef){ mfn=chDef.m; chafta=chDef.c; chapterNote=chDef.n||''; }
  else { mfn=0.05; chafta=0.00; chapterNote='未收录的章节，按工业品通用参考税率（建议核实 ABF 官方税则）'; }
  var eligible = chafta===0;
  if(!line){ notes.push('该 HS 编码按第 '+ch+' '+(chDef?('章（'+chDef.n+'）'):'章')+'默认税率参考，具体以税目细分为准。'); }
  if(/^(1701|1006|2402)/.test(hs)){ eligible=false; chafta=mfn; notes.push('该品类不适用零关税（配额/消费税管理）。'); }
  if(/^(6810|6802|9403)/.test(hs)){ prohib.push('人造石（结晶二氧化硅 ≥1%）自 2024 年起禁止进口（ABF）'); notes.push('如产品含人造石成分，需先确认是否落入禁令范围。'); }
  if(/^(4412|4418|4411|4407)/.test(hs)){ notes.push('木及木制品：须符合 ISPM15 木质包装，并提供植检/熏蒸证明。'); }
  if(/^(7308|7326|7318|7604|7616|7610|7606)/.test(hs)){ ad.push('中国原产的钢铁/铝制相关产品可能存在反倾销措施，实际税率按出口商裁定（以 ABF 反倾销公告为准）。'); }
  if(/^(8507|8506)/.test(hs)){ notes.push('电池类：须 UN38.3、MSDS、危包证，按 IMDG/IATA 申报。'); }
  if(/^(9405|8539|8516|8508|8467)/.test(hs)){ notes.push('电气类：须 RCM 认证、澳洲插头 AS/NZS 3112、能效 MEPS（适用时）。'); }
  if(/^(9503|9506)/.test(hs)){ notes.push('儿童玩具：须 AS/NZS ISO 8124 安全标准与警示标签。'); }
  if(!prohib.length){ prohib.push('未发现该税目有普遍禁止进口规定（具体以 ABF 禁止/限制进口清单为准）。'); }
  var certReq = eligible;
  var originRule = eligible ? 'RVC ≥ 40% 或 完全获得 或 符合产品特定规则（CTH/CTSH 等），详见 ChAFTA Annex 4-A。' : '—';
  var rate = eligible ? 0 : chafta;
  return {
    ok:true, query:raw, hs:hs.slice(0,10), hs4:hs.slice(0,4), hs6:hs.slice(0,6), name:name||'（按 HS 编码判定）',
    chapter:ch, chapterNote:chapterNote, mfn:mfn, chafta:chafta, eligible:eligible, certReq:certReq,
    originRule:originRule, notes:notes, prohib:prohib, ad:ad, rateYear:RATE_YEAR, updated:UPDATED,
    legal:LEGAL, urls:KEY_URLS, source:'ChAFTA Annex I / Customs Tariff Act 1995 / ABF',
    evidenceRef:'CHAFTA-'+digits(new Date().toISOString().slice(0,10))+'-'+hs.slice(0,6),
    generatedAt:nowStr()
  };
}
function rateBadge(x, label){ var ok = (x===0); return '<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;font-weight:800;font-size:13px;border:1px solid '+(ok?'rgba(27,127,75,.35);background:#F1F9F3;color:#1B7F4B':'rgba(155,59,40,.30);background:#FBF1EE;color:#9B3B28')+'">'+esc(label)+' '+fmtPct(x)+'</span>'; }
function section(title, body){ return '<div style="margin-top:12px"><div style="font-size:12.5px;font-weight:800;color:#7A6B4E;letter-spacing:.3px;margin-bottom:6px">'+esc(title)+'</div>'+body+'</div>'; }
function list(items, cls){ if(!items||!items.length) return '<div style="font-size:12.5px;color:#6E675B">—</div>'; return '<ul style="margin:0 0 0 18px;padding:0;font-size:13px;line-height:1.75;color:#3D3932" class="'+(cls||'')+'">'+items.map(function(t){return '<li>'+esc(t)+'</li>';}).join('')+'</ul>'; }
function renderCard(r, opt){
  opt=opt||{};
  if(!r || !r.ok) return '<div style="padding:12px 14px;border:1px dashed #E5DDCB;border-radius:10px;background:#FBF8F1;color:#8A7A55;font-size:13px">'+esc((r&&r.error)||'无结果')+'</div>';
  var badge = r.eligible ? rateBadge(0,'ChAFTA 协定税率') : rateBadge(r.chafta,'ChAFTA 协定税率');
  var mfnBadge = rateBadge(r.mfn,'MFN 基准税率');
  var h = '<div style="border:1px solid #E5DDCB;border-radius:12px;background:#fff;padding:14px 16px;box-shadow:0 1px 2px rgba(0,0,0,.03)">';
  h += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">' +
    '<span style="font-size:11px;font-weight:800;background:#F2EBDD;color:#8A6D3B;border-radius:999px;padding:2px 9px;letter-spacing:.4px">ChAFTA</span>' +
    '<span style="font-size:15px;font-weight:800;color:#191713">'+esc(r.name)+'</span>' +
    '<span style="font-size:12px;color:#8A8070">HS '+esc(r.hs)+'</span>' + badge + mfnBadge + '</div>';
  h += '<div style="font-size:12.5px;color:#6E675B;margin-bottom:2px">'+(r.eligible ? '✅ 中国原产且符合 ChAFTA 原产地规则时，进口关税可为 0（需有效 ChAFTA 原产地证书）' : '⚠ 该税目不适用 0 关税；按协定/最惠国税率计征，请以官方税则为准')+'</div>';
  h += '<div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:8px;font-size:13px;color:#3D3932">' +
    '<span>MFN 基准：<b>'+fmtPct(r.mfn)+'</b></span><span>ChAFTA：<b>'+fmtPct(r.chafta)+'</b></span>' +
    '<span>适用税率：<b>'+fmtPct(r.eligible?0:r.chafta)+'</b></span><span>证书：<b>'+(r.certReq?'需要':'不需要')+'</b></span>' +
    '<span>年份：<b>'+esc(r.rateYear)+'</b></span></div>';
  if(r.chapterNote) h += '<div style="font-size:12.5px;color:#7A6B4E;margin-top:6px">'+esc(r.chapterNote)+'</div>';
  if(r.originRule) h += section('原产地规则', '<div style="font-size:13px;color:#3D3932;line-height:1.75">'+esc(r.originRule)+'</div>');
  h += section('进口注意事项', list(r.notes));
  h += section('禁止 / 限制要求', list(r.prohib));
  if(r.ad && r.ad.length) h += section('反倾销 / 反补贴提示', list(r.ad));
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">' +
    '<button type="button" data-chafta="evidence" style="height:36px;padding:0 14px;border-radius:9px;border:1px solid #D4B978;background:#FBF7EC;color:#7A5A1F;font-weight:800;font-size:12.5px;cursor:pointer">📄 英文凭证（可截图/打印）</button>' +
    (opt.applyButton ? '<button type="button" data-chafta="apply" style="height:36px;padding:0 14px;border-radius:9px;border:1px solid #1B7F4B;background:#F1F9F3;color:#1B7F4B;font-weight:800;font-size:12.5px;cursor:pointer">✔ 应用到报价（'+fmtPct(r.eligible?0:r.chafta)+'）</button>' : '') +
    '<span style="font-size:11.5px;color:#9C9486;align-self:center">参考依据：'+esc(r.source)+' · 更新 '+esc(r.updated)+'</span></div>';
  h += '</div>';
  return h;
}
function certificateHTML(r){
  var rows = [
    ['1. Exporter\'s name, address, country','________________________（出口商）'],
    ['2. Consignee\'s name, address, country','________________________（进口商）'],
    ['3. Transport details (vessel / B/L / port of discharge)','________________________'],
    ['4. Country of Origin','China (CN)'],
    ['5. HS Code / Tariff item', r.hs],
    ['6. Description of goods', r.name],
    ['7. Origin criterion','RVC ≥ 40% / Wholly Obtained / CTH-CTS (PSR)'],
    ['8. Gross weight or quantity','________ kg  /  ________ pcs'],
    ['9. Invoice number & date','________ / ________'],
    ['10. Declaration by exporter','I declare that the goods comply with the origin requirements of the China-Australia FTA, Article 4.2 and Annex 4-A.'],
    ['11. Certification', 'Issued by CCPIT / China Customs (CIQ) — authorised body']
  ];
  return '<table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-top:6px">'+rows.map(function(x){
    return '<tr><td style="width:38%;border:1px solid #C9C2B4;padding:6px 8px;background:#FBF8F1;font-weight:700;color:#4A4438">'+esc(x[0])+'</td><td style="border:1px solid #C9C2B4;padding:6px 8px;color:#24201A">'+esc(x[1])+'</td></tr>';
  }).join('')+'</table>';
}
function evidenceHTML(r, opt){
  opt=opt||{};
  var t = nowStr();
  var css = 'body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;font-size:12px;line-height:1.55}'+
    'h1{font-size:19px;margin:0 0 2px} h2{font-size:13px;margin:18px 0 6px;border-bottom:1.5px solid #222;padding-bottom:3px}'+
    '.sub{color:#555;font-size:11px;margin-bottom:14px}'+    '.kv{width:100%;border-collapse:collapse;margin:6px 0} .kv td{border:1px solid #bbb;padding:5px 8px;vertical-align:top}'+    '.kv td:first-child{width:32%;background:#F4F4F4;font-weight:700}'+    '.note{font-size:10.5px;color:#444;margin-top:10px} .ref{font-size:10.5px;color:#333}'+    '@media print{body{margin:14mm} .noprint{display:none}}'+    '.noprint{margin:18px 0}';
  var h = '<!doctype html><html><head><meta charset="utf-8"><title>ChAFTA Evidence — '+esc(r.hs)+'</title><style>'+css+'</style></head><body>';
  h += '<h1>ChAFTA TARIFF VERIFICATION — EVIDENCE SHEET</h1>';
  h += '<div class="sub">China–Australia Free Trade Agreement (ChAFTA) · Prepared '+esc(t)+' · Reference '+esc(r.evidenceRef)+'</div>';
  h += '<h2>1. Goods &amp; classification</h2>';
  h += '<table class="kv"><tr><td>Description of goods</td><td>'+esc(r.name)+'</td></tr>'+
    '<tr><td>HS / tariff item</td><td>'+esc(r.hs)+'</td></tr>'+
    '<tr><td>Country of origin</td><td>China (CN)</td></tr>'+
    '<tr><td>Importer / consignee</td><td>'+esc(opt.consignee||'________________________')+'</td></tr>'+
    '<tr><td>Invoice value (AUD)</td><td>'+(opt.value!=null?esc(opt.value):'________')+'</td></tr>'+
    '<tr><td>Rate reference year</td><td>'+esc(r.rateYear)+' (updated '+esc(r.updated)+')</td></tr></table>';
  h += '<h2>2. Duty determination</h2>';
  h += '<table class="kv"><tr><td>MFN (General) rate</td><td>'+fmtPct(r.mfn)+'</td></tr>'+
    '<tr><td>ChAFTA preferential rate</td><td>'+fmtPct(r.chafta)+'</td></tr>'+
    '<tr><td>Applicable rate if origin rules met</td><td><b>'+fmtPct(r.eligible?0:r.chafta)+'</b> ('+(r.eligible?'duty-free':'not eligible for 0%')+')</td></tr>'+
    '<tr><td>Certificate of Origin required</td><td>'+(r.certReq?'Yes — ChAFTA Certificate of Origin (Annex 4-A)':'No')+'</td></tr>'+
    '<tr><td>Origin criterion</td><td>'+esc(r.originRule)+'</td></tr>' +
    '<tr><td>Determination</td><td>'+esc(r.eligible?'The goods, if of Chinese origin and accompanied by a valid ChAFTA Certificate of Origin, may be entered at a preferential rate of 0%.':'The goods do not qualify for a 0% ChAFTA rate; the applicable rate is shown above.')+'</td></tr></table>';
  h += '<h2>3. Import considerations</h2><ul style="margin:0 0 0 18px;padding:0">'+ (r.notes||[]).map(function(x){return '<li>'+esc(x)+'</li>';}).join('') + '</ul>';
  h += '<h2>4. Prohibited / restricted requirements</h2><ul style="margin:0 0 0 18px;padding:0">'+ (r.prohib||[]).map(function(x){return '<li>'+esc(x)+'</li>';}).join('') + '</ul>';
  if(r.ad && r.ad.length) h += '<h2>5. Anti-dumping / countervailing notice</h2><ul style="margin:0 0 0 18px;padding:0">'+r.ad.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul>';
  h += '<h2>6. Certificate of Origin (preview — Annex 4-A format)</h2>' + certificateHTML(r);
  h += '<h2>7. Legal basis &amp; sources</h2><div class="ref">' + r.legal.map(function(x){return '• '+esc(x);}).join('<br>') + '<br>' + r.urls.map(function(u){return '• '+esc(u.t)+': '+esc(u.u);}).join('<br>') + '</div>';
  h += '<div class="note">Disclaimer: This evidence sheet is generated from a reference tariff dataset for operational guidance only. Final duty assessment must be verified against the Australian Border Force tariff and the official ChAFTA schedule before lodgement. ChAFTA preferential treatment requires goods of Chinese origin meeting the applicable rules of origin and a valid certificate of origin (or approved exporter declaration), direct transport, and compliant documentation. Anti-dumping / countervailing duties, if applicable, are levied in addition to customs duty and are not waived by ChAFTA.</div>';
  h += '<div class="noprint"><button onclick="window.print()" style="padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer">🖨 Print / Save as PDF (A4)</button> <button onclick="window.close()" style="padding:8px 16px;font-size:13px;margin-left:8px;cursor:pointer">Close</button></div>';
  h += '</body></html>';
  return h;
}
function openEvidence(r, opt){
  var html = evidenceHTML(r, opt);
  var w = window.open('', '_blank');
  if(!w){ alert('浏览器拦截了弹出窗口，请允许后重试'); return false; }
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}
function compactHTML(r){
  if(!r || !r.ok) return '<div style="font-size:12.5px;color:#8A8070">'+esc((r&&r.error)||'')+'</div>';
  return '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12.5px">'+
    '<span style="font-weight:800;color:#191713">'+esc(r.name)+'</span>'+
    '<span style="color:#8A8070">HS '+esc(r.hs)+'</span>'+
    '<span style="padding:2px 9px;border-radius:999px;background:'+(r.eligible?'#F1F9F3':'#FBF1EE')+';color:'+(r.eligible?'#1B7F4B':'#9B3B28')+';font-weight:800">'+(r.eligible?'ChAFTA 0%':'ChAFTA '+fmtPct(r.chafta))+'</span>'+
    '<span style="color:#6E675B">MFN '+fmtPct(r.mfn)+'</span>'+
    '<button type="button" data-chafta="evidence" style="border:1px solid #D4B978;background:#FBF7EC;color:#7A5A1F;border-radius:7px;padding:3px 9px;font-size:11.5px;font-weight:700;cursor:pointer">英文凭证</button></div>';
}
(typeof window !== 'undefined' ? window : globalThis).ChAFTA = { version:'1.0', RATE_YEAR:RATE_YEAR, UPDATED:UPDATED, lookup:lookup, renderCard:renderCard, evidenceHTML:evidenceHTML, openEvidence:openEvidence, compactHTML:compactHTML, LINES:LINES, CHAPTERS:CHAPTERS, LEGAL:LEGAL, fmtPct:fmtPct, esc:esc };
})();
