// Stage 1 seed 公共工具：编码生成、价格计算、线路节点
// 真实感标准：ISO 6346 箱号校验位、GB 32100 统一社会信用代码校验位、UN/LOCODE/车站电报码、标准单据号

export const pad = (n, width = 2) => String(n).padStart(width, '0');

export function dateStr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateTimeStr(date) {
  return `${dateStr(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

export function docNo(prefix, date, seq, seqWidth = 5) {
  return `${prefix}${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(seq, seqWidth)}`;
}

// ── GB 32100 统一社会信用代码校验位 ─────────────────────────────────────────
const CREDIT_CHARS = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const CREDIT_WEIGHTS = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];

export function creditCode(regionCode, serial) {
  const body = `91${regionCode}${pad(serial, 9)}`;
  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    sum += CREDIT_CHARS.indexOf(body[i]) * CREDIT_WEIGHTS[i];
  }
  const check = 31 - (sum % 31);
  return `${body}${CREDIT_CHARS[check === 31 ? 0 : check]}`;
}

export function isValidCreditCode(code) {
  if (!code || code.length !== 18) return false;
  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    const index = CREDIT_CHARS.indexOf(code[i]);
    if (index < 0) return false;
    sum += index * CREDIT_WEIGHTS[i];
  }
  const check = 31 - (sum % 31);
  return CREDIT_CHARS[check === 31 ? 0 : check] === code[17];
}

// ── ISO 6346 集装箱号校验位 ────────────────────────────────────────────────
const LETTER_VALUE = (letter) => {
  let value = letter.charCodeAt(0) - 64;
  if (value > 11) value -= 1;
  if (value > 22) value -= 1;
  return value;
};

export function containerNo(ownerPrefix, serial) {
  const digits = pad(serial, 6);
  let sum = 0;
  for (let i = 0; i < 4; i += 1) sum += LETTER_VALUE(ownerPrefix[i]) * 2 ** i;
  for (let i = 0; i < 6; i += 1) sum += Number(digits[i]) * 2 ** (4 + i);
  const check = sum % 11 === 10 ? 0 : sum % 11;
  return `${ownerPrefix}${digits}${check}`;
}

export function isValidContainerNo(value) {
  return value.length === 11 && Number(value[10]) === Number(containerNo(value.slice(0, 4), value.slice(4, 10)).slice(10));
}

// ── 线路节点（与 v0 mock 坐标一致，Stage 1 使用同一走廊） ─────────────────
export const NODES = {
  jiading: { code: 'CNJDG', name: '上海嘉定工厂', type: 'WAREHOUSE', region: '310114', lng: 121.265, lat: 31.375 },
  yangshan: { code: 'CNSHA', name: '上海洋山港', type: 'PORT', region: '310115', lng: 122.045, lat: 30.625 },
  yangluo: { code: 'CNWUH', name: '武汉阳逻港', type: 'PORT', region: '420117', lng: 114.55, lat: 30.7 },
  wujiashan: { code: '21001', name: '武汉吴家山站', type: 'RAIL_STATION', region: '420112', lng: 114.13, lat: 30.61 },
  chengxiang: { code: '47085', name: '成都城厢站', type: 'RAIL_STATION', region: '510113', lng: 104.3, lat: 30.87 },
  qingbaijiang: { code: 'CNCDU', name: '成都青白江', type: 'WAREHOUSE', region: '510113', lng: 104.3, lat: 30.87 },
};

export const ROUTE_NODES = [
  { ...NODES.jiading, seq: 1 },
  { ...NODES.yangshan, seq: 2 },
  { ...NODES.yangluo, seq: 3 },
  { ...NODES.wujiashan, seq: 4 },
  { ...NODES.chengxiang, seq: 5 },
];

export const MODE_LABELS = { ROAD: '公路', SEA: '海运', RAIL: '铁路', PORT: '港杂' };
export const MODE_ORDER = { ROAD: 1, SEA: 2, RAIL: 3, PORT: 4 };

// ── 价格计算（与 platform/priceEngine 保持一致的最小实现） ─────────────────
export function calcAmount(rule, { containerCount, distanceKm, weightT, teu }) {
  let amount;
  switch (rule.calcMethod) {
    case 'PER_KM':
      amount = rule.unitPrice * distanceKm * containerCount;
      break;
    case 'PER_TON':
      amount = rule.unitPrice * weightT;
      break;
    case 'PER_TEU':
      amount = rule.unitPrice * teu * containerCount;
      break;
    case 'FLAT':
      amount = rule.unitPrice;
      break;
    case 'PER_CONTAINER':
    default:
      amount = rule.unitPrice * containerCount;
      break;
  }
  return Math.max(amount, rule.minCharge ?? 0);
}

export function round2(value) {
  return Math.round(value * 100) / 100;
}
