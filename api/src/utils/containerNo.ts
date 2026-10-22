// ISO 6346 集装箱号生成（Stage 1：前缀 + 6 位序列 + 校验位）
const pad = (value: number, width: number): string => String(value).padStart(width, '0');

const LETTER_VALUE = (letter: string): number => {
  let value = letter.charCodeAt(0) - 64;
  if (value > 11) value -= 1;
  if (value > 22) value -= 1;
  return value;
};

export function isoContainerNo(ownerPrefix: string, serial: number): string {
  const digits = pad(serial, 6);
  let sum = 0;
  for (let i = 0; i < 4; i += 1) sum += LETTER_VALUE(ownerPrefix[i]) * 2 ** i;
  for (let i = 0; i < 6; i += 1) sum += Number(digits[i]) * 2 ** (4 + i);
  const check = sum % 11 === 10 ? 0 : sum % 11;
  return `${ownerPrefix}${digits}${check}`;
}

/** 由订单 id + 箱序派生唯一箱号（不依赖全局计数，可重复播种） */
export function containerNoForOrder(orderId: number, index: number, ownerPrefix = 'MSCU'): string {
  const serial = 900000 + ((Number(orderId) % 90000) - 1) * 10 + Number(index);
  return isoContainerNo(ownerPrefix, serial);
}

export function sealNoForOrder(orderId: number, index: number): string {
  return `SEAL${String(orderId).padStart(6, '0')}${String(index).padStart(2, '0')}`;
}
