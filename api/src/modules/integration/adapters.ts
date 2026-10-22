// Mock 集成适配器：领域事件 → 外部系统报文规格（docs/04 §7 冻结映射）
import type { IntegrationDirection } from '../../types';

export interface IntegrationMessageSpec {
  systemCode: string;
  systemName: string;
  direction: IntegrationDirection;
  msgType: string;
  standard: string;
  relatedType: string;
  relatedId: string;
  payload: Record<string, unknown>;
}

type EventPayload = Record<string, unknown>;

function str(payload: EventPayload, key: string, fallback = ''): string {
  const value = payload[key];
  return value === null || value === undefined ? fallback : String(value);
}

function num(payload: EventPayload, key: string, fallback = 0): number {
  const value = Number(payload[key]);
  return Number.isFinite(value) ? value : fallback;
}

/** 事件 → 报文（未映射事件返回 null，仅记 outbox） */
export function buildMessageForEvent(eventType: string, payload: EventPayload): IntegrationMessageSpec | null {
  switch (eventType) {
    case 'quote.accepted':
      return {
        systemCode: 'PORT_EDI',
        systemName: '港口 EDI',
        direction: 'OUT',
        msgType: 'PORT_CODECO',
        standard: 'UN/EDIFACT 语义',
        relatedType: 'QUOTE',
        relatedId: str(payload, 'quoteId'),
        payload: {
          messageNo: `CODECO-${str(payload, 'quoteId')}-${Date.now()}`,
          quoteNo: str(payload, 'quoteNo'),
          orderNo: str(payload, 'orderNo'),
          portCode: 'CNSHA',
          containerType: str(payload, 'containerType'),
          containerCount: num(payload, 'containerCount'),
          moveType: 'GATE_IN',
          vessel: 'COSCO SHIPPING',
          voyage: '2026E',
          eventTime: str(payload, 'acceptedAt'),
        },
      };
    case 'contract.signed':
      return {
        systemCode: 'CA',
        systemName: 'CA 电子认证',
        direction: 'OUT',
        msgType: 'CA_SIGN',
        standard: 'JSON 签章记录',
        relatedType: 'CONTRACT',
        relatedId: str(payload, 'contractId'),
        payload: {
          contractNo: str(payload, 'contractNo'),
          customerId: num(payload, 'customerId'),
          signerName: str(payload, 'signerName'),
          signHash: str(payload, 'signHash'),
          caSerial: `CA-2026-${str(payload, 'contractId')}`,
          signedAt: str(payload, 'signedAt'),
          algorithm: 'SHA-256',
          platform: 'MULTIMODAL_PLATFORM',
        },
      };
    case 'order.dispatched':
      return {
        systemCode: 'RAIL_95306',
        systemName: '铁路 95306',
        direction: 'OUT',
        msgType: 'RAIL_DEMAND_APPLY',
        standard: 'JT/T 1351-2020 语义',
        relatedType: 'WAYBILL',
        relatedId: str(payload, 'waybillId'),
        payload: {
          messageNo: `RD-${str(payload, 'waybillId')}-${Date.now()}`,
          orderNo: str(payload, 'orderNo'),
          waybillNo: str(payload, 'waybillNo'),
          fromStation: '21001',
          toStation: '47085',
          containerType: str(payload, 'containerType'),
          containerCount: num(payload, 'containerCount'),
          cargoName: str(payload, 'cargoName'),
          requiredDate: str(payload, 'requiredPickupDate'),
          wagonType: 'X70',
          status: '已受理',
        },
      };
    case 'order.signed':
      return {
        systemCode: 'TAX',
        systemName: '税务电子发票',
        direction: 'OUT',
        msgType: 'TAX_INVOICE_ISSUE',
        standard: '电子发票要素',
        relatedType: 'WAYBILL',
        relatedId: str(payload, 'waybillId'),
        payload: {
          invoiceNo: `FP${str(payload, 'waybillId')}${Date.now()}`,
          orderNo: str(payload, 'orderNo'),
          waybillNo: str(payload, 'waybillNo'),
          buyer: str(payload, 'customerName'),
          seller: '中远海联运 MTO',
          amount: num(payload, 'amount'),
          taxRate: 9,
          taxAmount: Math.round(num(payload, 'amount') * 9 / 109 * 100) / 100,
          signedAt: str(payload, 'signedAt'),
        },
      };
    case 'order.settled':
      return {
        systemCode: 'BANK',
        systemName: '银行支付',
        direction: 'OUT',
        msgType: 'BANK_PAYMENT_RECEIPT',
        standard: 'JSON 回执',
        relatedType: 'BILL',
        relatedId: str(payload, 'billId'),
        payload: {
          paymentNo: `PAY-${str(payload, 'billId')}`,
          billNo: str(payload, 'billNo'),
          orderNo: str(payload, 'orderNo'),
          payer: str(payload, 'customerName'),
          payee: '中远海联运 MTO',
          amount: num(payload, 'amount'),
          bankSerial: `BANK2026${str(payload, 'billId')}`,
          paidAt: str(payload, 'issuedAt'),
          status: 'SUCCESS',
        },
      };
    default:
      return null;
  }
}
