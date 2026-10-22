// 订单数据行级范围（按角色裁剪，列表/看板复用）
import type { AuthUser } from '../../types';

export interface SqlScope {
  where: string;
  params: unknown[];
}

/** 生成 orders 表的角色范围条件（alias 默认为 o） */
export function orderScopeForRole(user: AuthUser, alias = 'o'): SqlScope {
  const a = alias;
  switch (user.role) {
    case 'SHIPPER':
      return {
        where: `(${a}.customer_id = ? OR ${a}.shipper_id = ?)`,
        params: [user.customer_id ?? -1, user.uid],
      };
    case 'CARRIER':
      return {
        where: `EXISTS (SELECT 1 FROM waybill w JOIN waybill_segment s ON s.waybill_id = w.id WHERE w.order_id = ${a}.id AND s.carrier_user_id = ?)`,
        params: [user.uid],
      };
    case 'RAIL_CARRIER':
      return {
        where: `EXISTS (SELECT 1 FROM waybill w JOIN waybill_segment s ON s.waybill_id = w.id WHERE w.order_id = ${a}.id AND s.mode = 'RAIL')`,
        params: [],
      };
    case 'SEA_CARRIER':
      return {
        where: `EXISTS (SELECT 1 FROM waybill w JOIN waybill_segment s ON s.waybill_id = w.id WHERE w.order_id = ${a}.id AND s.mode = 'SEA')`,
        params: [],
      };
    case 'TERMINAL':
      return {
        where: `${a}.status IN ('DISPATCHED', 'IN_TRANSIT', 'ARRIVED')`,
        params: [],
      };
    case 'SETTLEMENT':
      return {
        where: `${a}.status IN ('SIGNED', 'BILLED')`,
        params: [],
      };
    case 'MTO':
    case 'ADMIN':
    case 'FORWARDER':
    default:
      return { where: '1 = 1', params: [] };
  }
}

/** 是否只读订单（承运人/港站/结算） */
export function isReadOnlyOrderRole(user: AuthUser): boolean {
  return ['CARRIER', 'RAIL_CARRIER', 'SEA_CARRIER', 'TERMINAL', 'SETTLEMENT'].includes(user.role);
}
