// Stage 1 seed：角色权限、字典、客户、伙伴、港站、线路、货物、箱型、价格规则、账号、合同
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { NODES, ROUTE_NODES, creditCode, docNo, dateStr, dateTimeStr } from './lib.mjs';

const DEMO_PASSWORD = 'demo123';

const ROLE_DEFS = [
  { code: 'SHIPPER', name: '货主', desc: '托运人：下单、询价、签合同、签收、看账单' },
  { code: 'FORWARDER', name: '货代', desc: '货运代理：代客户询价、下单、签合同' },
  { code: 'MTO', name: '多式联运经营人', desc: '平台运营方：报价、调度、履约、结算' },
  { code: 'CARRIER', name: '公路承运人', desc: '公路段承运、司机接单与节点上报' },
  { code: 'RAIL_CARRIER', name: '铁路承运人', desc: '铁路段承运（Stage 2 工作台）' },
  { code: 'SEA_CARRIER', name: '水路承运人', desc: '水路段承运（Stage 2 工作台）' },
  { code: 'TERMINAL', name: '港站', desc: '港口/货场/堆场作业与箱况录入' },
  { code: 'SETTLEMENT', name: '结算', desc: '账单生成、对账、结算' },
  { code: 'ADMIN', name: '平台运营', desc: '主数据、集成、审计与平台配置' },
];

const MENU_PERMS = [
  ['menu:dashboard', '平台总览', 'dashboard'],
  ['menu:orders', '订单管理', 'order'],
  ['menu:quotes', '报价管理', 'quote'],
  ['menu:contracts', '合同管理', 'contract'],
  ['menu:customers', '客户管理', 'master'],
  ['menu:partners', '伙伴管理', 'master'],
  ['menu:master', '主数据', 'master'],
  ['menu:dispatch', '人工调度', 'dispatch'],
  ['menu:tasks', '运输任务', 'carrier'],
  ['menu:terminal', '港站作业', 'terminal'],
  ['menu:track', '运单跟踪', 'track'],
  ['menu:settlement', '结算工作台', 'settlement'],
  ['menu:bills', '账单', 'settlement'],
  ['menu:integration', '集成中心', 'integration'],
  ['menu:audit', '审计日志', 'audit'],
];

const BUTTON_PERMS = [
  ['order:create', '创建订单'], ['order:cancel', '取消订单'], ['order:dispatch', '调度订单'],
  ['quote:create', '创建询价/报价'], ['quote:send', '发送报价'], ['quote:accept', '接受报价'],
  ['contract:create', '创建合同'], ['contract:send', '发送合同'], ['contract:sign', '签署合同'],
  ['price:create', '维护价格规则'], ['customer:create', '维护客户'], ['partner:create', '维护伙伴'],
  ['integration:retry', '重试集成报文'], ['segment:status', '推进运输节点'], ['waybill:sign', '运单签收'], ['bill:settle', '生成账单'],
];

const ROLE_PERMISSIONS = {
  SHIPPER: ['menu:dashboard', 'menu:orders', 'menu:quotes', 'menu:contracts', 'menu:track', 'menu:bills',
    'order:create', 'order:cancel', 'quote:create', 'quote:accept', 'contract:sign', 'waybill:sign'],
  FORWARDER: ['menu:dashboard', 'menu:orders', 'menu:quotes', 'menu:contracts', 'menu:customers', 'menu:track',
    'order:create', 'order:cancel', 'quote:create', 'quote:send', 'quote:accept', 'contract:create', 'contract:send', 'contract:sign', 'customer:create'],
  MTO: ['menu:dashboard', 'menu:orders', 'menu:quotes', 'menu:contracts', 'menu:customers', 'menu:partners', 'menu:master',
    'menu:dispatch', 'menu:track', 'menu:settlement', 'menu:bills', 'menu:integration', 'menu:audit',
    'order:create', 'order:cancel', 'order:dispatch', 'quote:create', 'quote:send', 'quote:accept',
    'contract:create', 'contract:send', 'price:create', 'customer:create', 'partner:create', 'integration:retry'],
  CARRIER: ['menu:dashboard', 'menu:orders', 'menu:tasks', 'menu:track', 'segment:status'],
  RAIL_CARRIER: ['menu:dashboard', 'menu:orders', 'menu:track'],
  SEA_CARRIER: ['menu:dashboard', 'menu:orders', 'menu:track'],
  TERMINAL: ['menu:dashboard', 'menu:terminal', 'menu:track', 'segment:status'],
  SETTLEMENT: ['menu:dashboard', 'menu:settlement', 'menu:bills', 'menu:orders', 'bill:settle'],
  ADMIN: [...MENU_PERMS.map(([code]) => code), ...BUTTON_PERMS.map(([code]) => code)],
};

const DICTS = {
  order_status: [
    ['CREATED', '待调度'], ['CONTRACTED', '已签合同'], ['CONFIRMED', '已确认'], ['DISPATCHED', '已调度'],
    ['IN_TRANSIT', '运输中'], ['ARRIVED', '已到达'], ['SIGNED', '已签收'], ['BILLED', '已出账'], ['CANCELLED', '已取消'],
  ],
  order_type: [['ROAD_RAIL', '公铁联运'], ['RAIL_SEA', '铁水联运'], ['ROAD_RAIL_SEA', '公铁水联运']],
  quote_status: [['DRAFT', '询价中'], ['SENT', '已报价'], ['ACCEPTED', '已接受'], ['EXPIRED', '已过期'], ['CANCELLED', '已取消']],
  contract_status: [['DRAFT', '草稿'], ['PENDING_SIGN', '待签署'], ['SIGNED', '已签署'], ['TERMINATED', '已终止']],
  partner_type: [
    ['ROAD_CARRIER', '公路承运人'], ['RAIL_OPERATOR', '铁路运营方'], ['SEA_CARRIER', '水路承运人'],
    ['PORT', '港口'], ['RAIL_STATION', '铁路货场'], ['DEPOT', '堆场'], ['WAREHOUSE', '仓库'],
    ['FORWARDER', '货代'], ['FINANCE', '金融机构'], ['INSURANCE', '保险机构'], ['REGULATOR', '监管机构'],
  ],
  node_type: [['PORT', '港口'], ['RAIL_STATION', '铁路货场'], ['DEPOT', '堆场'], ['WAREHOUSE', '仓库']],
  charge_type: [['BASE', '基础费'], ['SURCHARGE', '附加费']],
  calc_method: [['PER_CONTAINER', '按箱'], ['PER_KM', '按公里'], ['PER_TON', '按吨'], ['PER_TEU', '按TEU'], ['FLAT', '一口价']],
  priority: [['NORMAL', '普通'], ['URGENT', '加急']],
  payment_terms: [['PREPAID', '预付'], ['MONTHLY_30', '月结30天'], ['MONTHLY_60', '月结60天'], ['COD', '货到付款']],
  source: [['QUICK', '快速下单'], ['QUOTE', '报价转单']],
};

const CUSTOMERS = [
  ['上海远洋新能源科技有限公司', '远洋新能源', '310114', '上海市嘉定区安亭镇曹安公路 4568 号', '光伏制造', '王海', '13800000001'],
  ['成都蜀道汽车零部件有限公司', '蜀道汽配', '510113', '成都市青白江区弥牟镇工业大道 88 号', '汽车零部件', '李静', '13800000002'],
  ['宁波海天家电制造有限公司', '海天家电', '330206', '宁波市北仑区大碶街道科技园路 12 号', '家电制造', '陈磊', '13800000003'],
  ['苏州精细化工集团有限公司', '苏州精化', '320505', '苏州市虎丘区浒墅关镇化工路 9 号', '化工', '周敏', '13800000004'],
  ['武汉粮油食品有限公司', '武汉粮油', '420102', '武汉市江岸区沿江大道 168 号', '食品', '刘洋', '13800000005'],
  ['青岛特钢供应链有限公司', '青岛特钢', '370211', '青岛市黄岛区前湾港路 77 号', '钢材', '赵刚', '13800000006'],
  ['南京医药供应链有限公司', '南京医药', '320115', '南京市江宁区秣陵街道医药谷 6 号', '医药', '孙丽', '13800000007'],
  ['深圳鸿远电子科技有限公司', '鸿远电子', '440305', '深圳市南山区科技园南区 18 栋', '电子', '吴强', '13800000008'],
  ['绍兴柯桥纺织贸易有限公司', '柯桥纺织', '330603', '绍兴市柯桥区中国轻纺城大道 99 号', '纺织', '郑华', '13800000009'],
  ['常州恒力机械制造有限公司', '恒力机械', '320411', '常州市新北区汉江路 260 号', '机械', '冯伟', '13800000010'],
  ['天津滨海建材集团有限公司', '滨海建材', '120116', '天津市滨海新区塘沽新港路 35 号', '建材', '许娟', '13800000011'],
  ['广州快消供应链有限公司', '广州快消', '440106', '广州市天河区黄埔大道 100 号', '快消', '何斌', '13800000012'],
];

const PARTNERS = [
  ['ROAD_CARRIER', '安捷卡车队', '安捷卡车队', '310114', '上海市嘉定区马陆镇宝安公路 2588 号', '张建国', '13900000001'],
  ['ROAD_CARRIER', '华通物流有限公司', '华通物流', '310115', '上海市浦东新区沪南路 3000 号', '马强', '13900000002'],
  ['ROAD_CARRIER', '顺丰重货运输有限公司', '顺丰重货', '310112', '上海市闵行区华翔路 100 号', '钱伟', '13900000003'],
  ['ROAD_CARRIER', '德邦快运股份有限公司', '德邦快运', '310118', '上海市青浦区华新镇华志路 168 号', '孙浩', '13900000004'],
  ['ROAD_CARRIER', '中远海运公路运输有限公司', '中远公路', '310115', '上海市浦东新区滨江大道 999 号', '赵明', '13900000005'],
  ['ROAD_CARRIER', '嘉里大通物流有限公司', '嘉里大通', '310115', '上海市浦东新区外高桥保税区 88 号', '周涛', '13900000006'],
  ['RAIL_OPERATOR', '中铁集装箱运输有限责任公司', '中铁集装箱', '110000', '北京市西城区月坛北街 5 号', '李明', '13900000007'],
  ['RAIL_OPERATOR', '中铁特货物流股份有限公司', '中铁特货', '110000', '北京市西城区广安门内大街 338 号', '王超', '13900000008'],
  ['SEA_CARRIER', '中远海运集装箱运输有限公司', '中远海运集运', '310115', '上海市浦东新区滨江大道 5299 号', '陈航', '13900000009'],
  ['SEA_CARRIER', '中国长江航运集团有限公司', '中国长航', '420102', '武汉市江岸区沿江大道 89 号', '杨帆', '13900000010'],
  ['SEA_CARRIER', '民生轮船股份有限公司', '民生轮船', '500103', '重庆市渝中区民族路 188 号', '罗成', '13900000011'],
  ['PORT', '上海国际港务（集团）股份有限公司', '上港集团', '310115', '上海市浦东新区临港新城环湖西一路 99 号', '徐海', '13900000012'],
  ['PORT', '湖北港口集团有限公司', '湖北港口', '420117', '武汉市新洲区阳逻经济开发区', '胡刚', '13900000013'],
  ['PORT', '宁波舟山港股份有限公司', '宁波舟山港', '330206', '宁波市北仑区新碶街道港区路 1 号', '沈磊', '13900000014'],
  ['RAIL_STATION', '中铁联合国际集装箱有限公司武汉中心站', '吴家山中心站', '420112', '武汉市东西湖区吴家山台商投资区', '黄勇', '13900000015'],
  ['RAIL_STATION', '成都国际铁路港投资发展有限公司', '成都铁路港', '510113', '成都市青白江区香岛大道 1509 号', '田甜', '13900000016'],
  ['DEPOT', '洋山深水港集装箱堆场', '洋山堆场', '310115', '上海市浦东新区洋山深水港区', '顾军', '13900000017'],
  ['DEPOT', '城厢铁路集装箱堆场', '城厢堆场', '510113', '成都市青白江区城厢镇', '邓超', '13900000018'],
  ['WAREHOUSE', '嘉定综合物流仓储中心', '嘉定仓储', '310114', '上海市嘉定区徐行镇宝凤路 66 号', '曹敏', '13900000019'],
  ['FORWARDER', '上海联代国际货运代理有限公司', '联代货代', '310115', '上海市浦东新区张杨路 500 号', '范宁', '13900000020'],
  ['FORWARDER', '成都丝路国际货运代理有限公司', '丝路货代', '510113', '成都市青白江区自贸大道 66 号', '袁媛', '13900000021'],
  ['FINANCE', '中国银行上海市分行', '中国银行', '310115', '上海市浦东新区银城中路 200 号', '林峰', '13900000022'],
  ['INSURANCE', '中国人民财产保险股份有限公司上海市分公司', '人保财险', '310115', '上海市浦东新区世纪大道 100 号', '高翔', '13900000023'],
  ['REGULATOR', '上海市交通委员会', '上海交通委', '310115', '上海市浦东新区世博村路 300 号', '宋洁', '13900000024'],
];

const NODE_DEFS = [
  { code: 'CNJDG', name: '上海嘉定工厂', type: 'WAREHOUSE', region: '310114', address: '上海市嘉定区安亭镇曹安公路 4568 号', lng: 121.265, lat: 31.375 },
  { code: 'CNSHA', name: '上海洋山港', type: 'PORT', region: '310115', address: '上海市浦东新区洋山深水港区', lng: 122.045, lat: 30.625, operator: '上港集团' },
  { code: 'CNWUH', name: '武汉阳逻港', type: 'PORT', region: '420117', address: '武汉市新洲区阳逻经济开发区', lng: 114.55, lat: 30.7, operator: '湖北港口集团' },
  { code: '21001', name: '武汉吴家山站', type: 'RAIL_STATION', region: '420112', address: '武汉市东西湖区吴家山台商投资区', lng: 114.13, lat: 30.61, operator: '吴家山中心站' },
  { code: '47085', name: '成都城厢站', type: 'RAIL_STATION', region: '510113', address: '成都市青白江区城厢镇', lng: 104.3, lat: 30.87, operator: '成都铁路港' },
  { code: 'CNCDU', name: '成都青白江', type: 'WAREHOUSE', region: '510113', address: '成都市青白江区香岛大道 1509 号', lng: 104.3, lat: 30.87 },
  { code: 'CNSZX', name: '深圳盐田港', type: 'PORT', region: '440305', address: '深圳市盐田区深盐路 1 号', lng: 114.25, lat: 22.56 },
  { code: 'CNNGB', name: '宁波舟山港', type: 'PORT', region: '330206', address: '宁波市北仑区港区路 1 号', lng: 121.85, lat: 29.87, operator: '宁波舟山港' },
  { code: 'CNTAO', name: '青岛前湾港', type: 'PORT', region: '370211', address: '青岛市黄岛区前湾港路 6 号', lng: 120.25, lat: 36.0 },
  { code: 'CNGZH', name: '广州南沙港', type: 'PORT', region: '440115', address: '广州市南沙区龙穴岛', lng: 113.6, lat: 22.6 },
  { code: 'CNTXG', name: '天津港', type: 'PORT', region: '120116', address: '天津市滨海新区新港路 1 号', lng: 117.75, lat: 38.98 },
  { code: 'CNXMN', name: '厦门港', type: 'PORT', region: '350206', address: '厦门市湖里区东渡路 127 号', lng: 118.08, lat: 24.48 },
  { code: '47001', name: '郑州圃田站', type: 'RAIL_STATION', region: '410104', address: '郑州市管城区圃田乡', lng: 113.75, lat: 34.72 },
  { code: '47031', name: '重庆团结村站', type: 'RAIL_STATION', region: '500106', address: '重庆市沙坪坝区团结村', lng: 106.3, lat: 29.62 },
  { code: '61001', name: '西安国际港站', type: 'RAIL_STATION', region: '610111', address: '西安市灞桥区国际港务区', lng: 109.02, lat: 34.4 },
  { code: '43001', name: '长沙霞凝站', type: 'RAIL_STATION', region: '430105', address: '长沙市开福区霞凝港', lng: 112.98, lat: 28.32 },
  { code: '53001', name: '昆明王家营站', type: 'RAIL_STATION', region: '530111', address: '昆明市官渡区王家营', lng: 102.78, lat: 24.95 },
  { code: '32001', name: '苏州工业园综合保税区', type: 'WAREHOUSE', region: '320505', address: '苏州市工业园区综合保税区', lng: 120.72, lat: 31.32 },
  { code: 'CNSHA-D1', name: '洋山堆场', type: 'DEPOT', region: '310115', address: '上海市浦东新区洋山深水港区', lng: 122.045, lat: 30.625, operator: '洋山堆场' },
  { code: '47085-D1', name: '城厢堆场', type: 'DEPOT', region: '510113', address: '成都市青白江区城厢镇', lng: 104.3, lat: 30.87, operator: '城厢堆场' },
];

const ROUTES = [
  ['RT001', '上海嘉定—成都青白江（公铁水）', '上海嘉定工厂', '成都青白江', ['上海洋山港', '武汉阳逻港', '武汉吴家山站', '成都城厢站'], ['ROAD', 'SEA', 'RAIL'], 2150, 5.5, 31920],
  ['RT002', '上海嘉定—西安国际港（公铁）', '上海嘉定工厂', '西安国际港站', ['上海洋山港', '西安国际港站'], ['ROAD', 'RAIL'], 1450, 4.0, 16800],
  ['RT003', '宁波舟山—成都青白江（铁水）', '宁波舟山港', '成都青白江', ['武汉阳逻港', '武汉吴家山站', '成都城厢站'], ['SEA', 'RAIL'], 1950, 5.0, 24600],
  ['RT004', '青岛前湾—郑州圃田（铁水）', '青岛前湾港', '郑州圃田站', ['郑州圃田站'], ['SEA', 'RAIL'], 780, 2.5, 9800],
  ['RT005', '深圳盐田—长沙霞凝（铁水）', '深圳盐田港', '长沙霞凝站', ['长沙霞凝站'], ['SEA', 'RAIL'], 850, 2.5, 11200],
  ['RT006', '广州南沙—昆明王家营（铁水）', '广州南沙港', '昆明王家营站', ['昆明王家营站'], ['SEA', 'RAIL'], 1650, 4.5, 19800],
  ['RT007', '天津港—西安国际港（公铁）', '天津港', '西安国际港站', ['西安国际港站'], ['ROAD', 'RAIL'], 1250, 3.5, 15600],
  ['RT008', '苏州工业园—重庆团结村（公铁水）', '苏州工业园综合保税区', '重庆团结村站', ['上海洋山港', '武汉阳逻港', '重庆团结村站'], ['ROAD', 'SEA', 'RAIL'], 1900, 5.0, 28600],
];

const GOODS = [
  ['G001', '光伏组件', '新能源', '8541400000', 0, '木箱/托盘', '箱', 22.5],
  ['G002', '汽车零部件', '汽车', '8708999990', 0, '纸箱/托盘', '箱', 18.2],
  ['G003', '家用电器', '家电', '8418000000', 0, '纸箱', '箱', 15.8],
  ['G004', '精细化工品', '化工', '3205000000', 0, '桶装', '箱', 20.0],
  ['G005', '粮油食品', '食品', '1006000000', 0, '编织袋', '箱', 24.0],
  ['G006', '特种钢材', '钢材', '7208000000', 0, '捆扎', '箱', 26.0],
  ['G007', '医药制剂', '医药', '3004000000', 0, '纸箱/冷链', '箱', 12.0],
  ['G008', '电子元器件', '电子', '8542000000', 0, '防静电箱', '箱', 10.0],
  ['G009', '纺织面料', '纺织', '5515000000', 0, '卷装', '箱', 16.0],
  ['G010', '机械设备', '机械', '8479000000', 0, '木箱', '箱', 25.0],
  ['G011', '建材制品', '建材', '6810000000', 0, '托盘', '箱', 26.0],
  ['G012', '快消品', '快消', '2106000000', 0, '纸箱', '箱', 14.0],
  ['G013', '锂离子电池', '新能源', '8507600000', 1, 'UN3480 包装', '箱', 20.0],
  ['G014', '冷藏食品', '食品', '0406000000', 0, '冷藏箱', '箱', 21.0],
  ['G015', '工程塑料', '化工', '3901000000', 0, '吨袋', '箱', 22.0],
];

const CONTAINER_TYPES = [
  ['20GP', '20英尺通用箱', 33.2, 28.0, 2.2, 1.0],
  ['40GP', '40英尺通用箱', 67.7, 26.0, 3.8, 2.0],
  ['40HQ', '40英尺高箱', 76.3, 26.0, 3.9, 2.0],
  ['45HQ', '45英尺高箱', 86.0, 25.0, 4.8, 2.0],
  ['40RF', '40英尺冷藏箱', 67.0, 26.0, 4.8, 2.0],
];

const BASE_PRICES = {
  ROAD: { '20GP': 900, '40GP': 1200, '40HQ': 1400, '45HQ': 1600, '40RF': 1800 },
  SEA: { '20GP': 4200, '40GP': 4800, '40HQ': 5200, '45HQ': 5800, '40RF': 7200 },
  RAIL: { '20GP': 6800, '40GP': 7900, '40HQ': 8600, '45HQ': 9600, '40RF': 10800 },
};

async function insert(conn, sql, params) {
  const [result] = await conn.execute(sql, params);
  return result.insertId;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function seedReference(conn) {
  const today = new Date();
  const roleIds = {};
  for (let i = 0; i < ROLE_DEFS.length; i += 1) {
    const role = ROLE_DEFS[i];
    roleIds[role.code] = await insert(conn,
      'INSERT INTO role (role_code, role_name, description, sort_no) VALUES (?, ?, ?, ?)',
      [role.code, role.name, role.desc, i + 1]);
  }

  const permIds = {};
  let permSort = 0;
  for (const [code, name, module] of MENU_PERMS) {
    permSort += 1;
    permIds[code] = await insert(conn,
      'INSERT INTO permission (permission_code, permission_name, module, perm_type, sort_no) VALUES (?, ?, ?, ?, ?)',
      [code, name, module, 'MENU', permSort]);
  }
  for (const [code, name] of BUTTON_PERMS) {
    permSort += 1;
    permIds[code] = await insert(conn,
      'INSERT INTO permission (permission_code, permission_name, module, perm_type, sort_no) VALUES (?, ?, ?, ?, ?)',
      [code, name, 'button', 'BUTTON', permSort]);
  }
  for (const [roleCode, codes] of Object.entries(ROLE_PERMISSIONS)) {
    for (const code of codes) {
      await conn.execute('INSERT INTO role_permission (role_id, permission_id) VALUES (?, ?)',
        [roleIds[roleCode], permIds[code]]);
    }
  }

  let dictSort = 0;
  for (const [dictType, items] of Object.entries(DICTS)) {
    for (const [key, label] of items) {
      dictSort += 1;
      await conn.execute(
        'INSERT INTO dict_data (dict_type, dict_key, dict_label, sort_no) VALUES (?, ?, ?, ?)',
        [dictType, key, label, dictSort]);
    }
  }

  const customers = [];
  for (let i = 0; i < CUSTOMERS.length; i += 1) {
    const [name, shortName, regionCode, address, industry, contactName, phone] = CUSTOMERS[i];
    const id = await insert(conn,
      `INSERT INTO customer (customer_no, name, short_name, credit_code, contact_name, contact_phone, email,
         region_code, address, industry, credit_level, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`CUS${String(i + 1).padStart(6, '0')}`, name, shortName, creditCode(regionCode, 100000 + i),
        contactName, phone, `contact${i + 1}@example.com`, regionCode, address, industry,
        ['AAA', 'AA', 'AA', 'A', 'AA', 'A', 'AA', 'A', 'A', 'A', 'AA', 'A'][i],
        i === 0 ? '重点客户，月结30天' : null]);
    customers.push({ id, name, shortName, contactName, phone, regionCode });
  }

  const partners = [];
  for (let i = 0; i < PARTNERS.length; i += 1) {
    const [type, name, shortName, regionCode, address, contactName, phone] = PARTNERS[i];
    const qualifications = type.includes('CARRIER') || type === 'RAIL_OPERATOR' || type === 'SEA_CARRIER'
      ? JSON.stringify([{ name: '运输经营许可证', no: `YS-2026-${String(i + 1).padStart(4, '0')}`, expire: '2029-12-31' }])
      : type === 'PORT'
        ? JSON.stringify([{ name: '港口经营许可证', no: `GK-2026-${String(i + 1).padStart(4, '0')}`, expire: '2030-12-31' }])
        : null;
    const id = await insert(conn,
      `INSERT INTO partner (partner_no, name, short_name, type, credit_code, contact_name, contact_phone, email,
         region_code, address, qualifications, rating, settlement_account) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`P${String(i + 1).padStart(6, '0')}`, name, shortName, type, creditCode(regionCode, 200000 + i),
        contactName, phone, `partner${i + 1}@example.com`, regionCode, address, qualifications,
        (4.2 + (i % 7) * 0.1).toFixed(2), `6222${String(100000000000 + i * 137).slice(0, 12)}`]);
    partners.push({ id, type, name, shortName });
  }
  const partnerBy = (type, namePart) => partners.find(
    (p) => p.type === type && (p.name.includes(namePart) || p.shortName.includes(namePart)),
  );
  const portOperator = { CNSHA: partnerBy('PORT', '上港'), CNWUH: partnerBy('PORT', '湖北港口'), CNNGB: partnerBy('PORT', '宁波舟山港') };
  const railOperator = { '21001': partnerBy('RAIL_STATION', '吴家山'), '47085': partnerBy('RAIL_STATION', '成都') };
  const depotOperator = { '洋山堆场': partnerBy('DEPOT', '洋山'), '城厢堆场': partnerBy('DEPOT', '城厢') };

  const nodeIdMap = new Map();
  const nodeRows = [];
  for (const def of NODE_DEFS) {
    const operatorId = def.operator
      ? (partners.find((p) => p.name.includes(def.operator) || p.shortName === def.operator)?.id ?? null)
      : null;
    const id = await insert(conn,
      `INSERT INTO port_station (node_code, node_name, node_type, region_code, address, lng, lat,
         operator_partner_id, capacity_teu, operating_hours) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [def.code, def.name, def.type, def.region, def.address, def.lng, def.lat, operatorId,
        def.type === 'PORT' ? 500000 : null, def.type === 'PORT' ? '00:00-24:00' : '08:00-22:00']);
    nodeIdMap.set(def.code, id);
    nodeIdMap.set(def.name, id);
    nodeRows.push({ id, code: def.code, name: def.name, type: def.type, regionCode: def.region, lng: def.lng, lat: def.lat });
  }

  const routes = [];
  for (let i = 0; i < ROUTES.length; i += 1) {
    const [code, name, originName, destName, transitNames, modes, distanceKm, transitDays, baseCost] = ROUTES[i];
    const originId = nodeIdMap.get(originName);
    const destId = nodeIdMap.get(destName);
    const transitIds = transitNames.map((n) => nodeIdMap.get(n));
    const id = await insert(conn,
      `INSERT INTO route_template (route_code, route_name, origin_node_id, destination_node_id, transit_node_ids,
         modes, distance_km, transit_days, base_cost, reliability) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, name, originId, destId, JSON.stringify(transitIds), JSON.stringify(modes), distanceKm, transitDays, baseCost,
        (96 - i * 0.6).toFixed(2)]);
    routes.push({ id, code, name, modes, transitDays, distanceKm, baseCost, originId, destId });
  }

  const goods = [];
  for (let i = 0; i < GOODS.length; i += 1) {
    const [code, name, category, hsCode, dangerous, packaging, unit, weight] = GOODS[i];
    const id = await insert(conn,
      `INSERT INTO goods_catalog (goods_code, goods_name, category, hs_code, dangerous_flag, packaging, unit, default_weight)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, name, category, hsCode, dangerous, packaging, unit, weight]);
    goods.push({ id, code, name, dangerous: Boolean(dangerous), packaging, weight });
  }

  const containerTypes = [];
  for (const [code, name, volume, payload, tare, teu] of CONTAINER_TYPES) {
    const id = await insert(conn,
      `INSERT INTO container_type (code, name, inner_volume_cbm, max_payload_t, tare_weight_t, teu)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [code, name, volume, payload, tare, teu]);
    containerTypes.push({ id, code, name, volume, payload, teu });
  }
  const ctBy = Object.fromEntries(containerTypes.map((c) => [c.code, c]));

  const priceRules = [];
  let ruleSeq = 0;
  for (const route of routes) {
    for (const mode of route.modes) {
      for (const code of ['20GP', '40HQ']) {
        ruleSeq += 1;
        const unitPrice = BASE_PRICES[mode][code];
        const id = await insert(conn,
          `INSERT INTO price_rule (rule_no, rule_name, mode, charge_type, route_template_id, container_type_id,
             calc_method, unit_price, unit, priority, effective_from, effective_to)
           VALUES (?, ?, ?, 'BASE', ?, ?, 'PER_CONTAINER', ?, '箱', 100, '2026-01-01', '2026-12-31')`,
          [`PR${String(ruleSeq).padStart(6, '0')}`, `${route.name} ${code} ${mode}`, mode, route.id, ctBy[code].id, unitPrice]);
        priceRules.push({ id, mode, routeId: route.id, containerTypeId: ctBy[code].id, unitPrice, calcMethod: 'PER_CONTAINER', minCharge: 0 });
      }
    }
  }
  for (const code of ['20GP', '40HQ']) {
    ruleSeq += 1;
    const id = await insert(conn,
      `INSERT INTO price_rule (rule_no, rule_name, mode, charge_type, container_type_id, calc_method, unit_price, unit, priority,
         effective_from, effective_to) VALUES (?, ?, 'PORT', 'BASE', ?, 'PER_CONTAINER', ?, '箱次', 100, '2026-01-01', '2026-12-31')`,
      [`PR${String(ruleSeq).padStart(6, '0')}`, `港口装卸堆存费 ${code}`, ctBy[code].id, code === '20GP' ? 260 : 380]);
    priceRules.push({ id, mode: 'PORT', routeId: null, containerTypeId: ctBy[code].id, unitPrice: code === '20GP' ? 260 : 380, calcMethod: 'PER_CONTAINER', minCharge: 0 });
  }
  // 客户 1 协议价（优先于公开价）
  for (const code of ['20GP', '40HQ']) {
    ruleSeq += 1;
    const unitPrice = Math.round(BASE_PRICES.RAIL[code] * 0.97);
    const id = await insert(conn,
      `INSERT INTO price_rule (rule_no, rule_name, mode, charge_type, route_template_id, container_type_id, customer_id,
         calc_method, unit_price, unit, priority, effective_from, effective_to)
       VALUES (?, ?, 'RAIL', 'BASE', ?, ?, ?, 'PER_CONTAINER', ?, '箱', 10, '2026-01-01', '2026-12-31')`,
      [`PR${String(ruleSeq).padStart(6, '0')}`, `远洋新能源协议价 铁路 ${code}`, routes[0].id, ctBy[code].id, customers[0].id, unitPrice]);
    priceRules.push({ id, mode: 'RAIL', routeId: routes[0].id, containerTypeId: ctBy[code].id, customerId: customers[0].id, unitPrice, calcMethod: 'PER_CONTAINER', minCharge: 0, priority: 10 });
  }
  for (const mode of ['ROAD', 'SEA']) {
    ruleSeq += 1;
    const id = await insert(conn,
      `INSERT INTO price_rule (rule_no, rule_name, mode, charge_type, route_template_id, container_type_id, calc_method,
         unit_price, unit, priority, effective_from, effective_to)
       VALUES (?, ?, ?, 'SURCHARGE', ?, ?, 'PER_CONTAINER', ?, '箱', 50, '2026-01-01', '2026-12-31')`,
      [`PR${String(ruleSeq).padStart(6, '0')}`, `${mode} 燃油附加费`, mode, routes[0].id, ctBy['40HQ'].id, mode === 'ROAD' ? 80 : 150]);
    priceRules.push({ id, mode, routeId: routes[0].id, containerTypeId: ctBy['40HQ'].id, unitPrice: mode === 'ROAD' ? 80 : 150, calcMethod: 'PER_CONTAINER', minCharge: 0, chargeType: 'SURCHARGE' });
  }

  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const users = [];
  const userDefs = [
    ['shipper01', '上海远洋物流（货主）', 'SHIPPER', customers[0].id, null, '13800000001'],
    ['forwarder01', '上海联代国际货代', 'FORWARDER', null, partnerBy('FORWARDER', '联代').id, '13900000020'],
    ['mto01', '中远海联运 MTO', 'MTO', null, null, '13900000030'],
    ['carrier01', '安捷卡车队（公路承运人）', 'CARRIER', null, partnerBy('ROAD_CARRIER', '安捷').id, '13900000001'],
    ['rail01', '中铁集装箱（铁路承运人）', 'RAIL_CARRIER', null, partnerBy('RAIL_OPERATOR', '中铁集装箱').id, '13900000007'],
    ['sea01', '中远海运集运（水路承运人）', 'SEA_CARRIER', null, partnerBy('SEA_CARRIER', '中远海运集运').id, '13900000009'],
    ['terminal01', '洋山港/阳逻港操作员', 'TERMINAL', null, partnerBy('PORT', '上港').id, '13900000012'],
    ['settlement01', '联运结算中心', 'SETTLEMENT', null, null, '13900000031'],
    ['admin01', '平台运营管理员', 'ADMIN', null, null, '13900000032'],
  ];
  for (const [username, displayName, role, customerId, partnerId, phone] of userDefs) {
    const id = await insert(conn,
      `INSERT INTO user (username, password_hash, display_name, role, customer_id, partner_id, phone, email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, passwordHash, displayName, role, customerId, partnerId, phone, `${username}@demo.local`]);
    users.push({ id, username, displayName, role, customerId, partnerId });
  }
  const userBy = Object.fromEntries(users.map((u) => [u.username, u]));

  const contracts = [];
  for (let i = 0; i < 8; i += 1) {
    const customer = customers[i];
    const status = i < 4 ? 'SIGNED' : i < 6 ? 'PENDING_SIGN' : 'DRAFT';
    const signedAt = status === 'SIGNED' ? new Date(today.getFullYear(), 0, 10 + i * 3, 10, 0, 0) : null;
    const signHash = signedAt
      ? sha256(`${docNo('HT', new Date(today.getFullYear(), 0, 1), i + 1, 4)}|${customer.id}|${customer.contactName}|${dateTimeStr(signedAt)}|MULTIMODAL_PLATFORM`)
      : null;
    const id = await insert(conn,
      `INSERT INTO contract (contract_no, customer_id, contract_type, title, effective_from, effective_to,
         payment_terms, credit_limit, discount_rate, status, signer_name, signed_at, sign_hash, created_by)
       VALUES (?, ?, 'FRAMEWORK', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [docNo('HT', new Date(today.getFullYear(), 0, 1), i + 1, 4), customer.id,
        `${today.getFullYear()} 年度多式联运框架合同（${customer.shortName}）`,
        `${today.getFullYear()}-01-01`, `${today.getFullYear()}-12-31`,
        ['MONTHLY_30', 'PREPAID', 'MONTHLY_60', 'COD'][i % 4],
        [2000000, 1500000, 800000, 1200000, 600000, 500000, 300000, 400000][i],
        [3, 2, 5, 2.5, 1, 1, 0, 0][i], status,
        signedAt ? customer.contactName : null, signedAt ? dateTimeStr(signedAt) : null, signHash,
        userBy.mto01.id]);
    contracts.push({ id, customerId: customer.id, status, discountRate: [3, 2, 5, 2.5, 1, 1, 0, 0][i], title: `${today.getFullYear()} 年度多式联运框架合同` });
  }

  return {
    roleIds, permIds, customers, partners, nodes: nodeRows, nodeIdMap, routes, goods, containerTypes, ctBy,
    priceRules, users, userBy, contracts, partnerBy,
  };
}
