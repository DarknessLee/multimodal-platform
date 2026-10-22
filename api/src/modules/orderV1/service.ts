// 订单 v1：快速下单（支持 cargoLines 多货物行）/ 取消 / 报价转单入口
import { ORDER_STATUS_LABELS } from '../../config/labels';
import { txExec, txQueryOne, txQueryRows, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { emitEvent } from '../../platform/eventBus';
import { nextDocNo } from '../../platform/sequence';
import type {
  AuthUser,
  ContainerTypeRow,
  ContractRow,
  GoodsCatalogRow,
  OrderType,
  Priority,
} from '../../types';
import { formatDateTime, nowDate, todayCompact } from '../../utils/datetime';
import { containerNoForOrder, sealNoForOrder } from '../../utils/containerNo';
import { round2, toBool } from '../../utils/json';
import { findSignedContract } from '../contract/service';

export interface CargoLineInput {
  goodsCode?: string | null;
  goodsName?: string;
  quantity?: number | string;
  unit?: string;
  weightT?: number | string;
  volumeCbm?: number | string | null;
  containerType?: string | null;
  containerCount?: number | string;
  dangerousFlag?: boolean | number;
  packaging?: string | null;
  remark?: string | null;
}

export interface CreateQuickOrderInput {
  // v0 快速下单字段（cargoLines 未提供时必填）
  cargoName?: string;
  cargoWeight?: number | string;
  containerType?: string;
  containerCount?: number | string;
  origin: string;
  destination: string;
  requiredPickupDate: string;
  remark?: string | null;
  // Stage 1 可选扩展
  customerId?: number | string | null;
  consigneeCustomerId?: number | string | null;
  notifyCustomerId?: number | string | null;
  contractId?: number | string | null;
  routeTemplateId?: number | string | null;
  orderType?: OrderType;
  priority?: Priority;
  cargoLines?: CargoLineInput[];
}

interface ResolvedCargoLine {
  seq: number;
  goodsCode: string | null;
  goodsName: string;
  quantity: number;
  unit: string;
  weightT: number;
  volumeCbm: number | null;
  containerTypeId: number;
  containerTypeCode: string;
  containerCount: number;
  dangerousFlag: number;
  packaging: string | null;
  remark: string | null;
  estimateAmount: number;
}

/** 快速单演示估价（与 v0 mock 分段价对齐：公路 1280 / 海运 5200 / 铁路 8600 + 港杂 760） */
const ESTIMATE_PER_BOX: Record<string, number> = {
  '20GP': 15840,
  '40GP': 14660,
  '40HQ': 15840,
  '45HQ': 17540,
  '40RF': 20540,
};

async function resolveCargoLines(
  conn: import('mysql2/promise').PoolConnection,
  input: CreateQuickOrderInput,
): Promise<ResolvedCargoLine[]> {
  const rawLines: CargoLineInput[] =
    input.cargoLines && input.cargoLines.length > 0
      ? input.cargoLines
      : [
          {
            goodsName: input.cargoName,
            quantity: input.containerCount,
            weightT: input.cargoWeight,
            containerType: input.containerType,
            containerCount: input.containerCount,
          },
        ];

  const resolved: ResolvedCargoLine[] = [];
  for (let index = 0; index < rawLines.length; index += 1) {
    const line = rawLines[index];
    const containerTypeCode = String(line.containerType ?? input.containerType ?? '40HQ');
    const containerType = await txQueryOne<ContainerTypeRow>(
      conn,
      'SELECT * FROM container_type WHERE code = ?',
      [containerTypeCode],
    );
    if (!containerType) {
      throw new ApiError(40401, `箱型 ${containerTypeCode} 不存在`);
    }
    let goods: GoodsCatalogRow | null = null;
    if (line.goodsCode) {
      goods = await txQueryOne<GoodsCatalogRow>(conn, 'SELECT * FROM goods_catalog WHERE goods_code = ?', [
        line.goodsCode,
      ]);
      if (!goods) {
        throw new ApiError(40401, `货物 ${line.goodsCode} 不存在`);
      }
    }
    const containerCount = Number(line.containerCount ?? input.containerCount ?? 1);
    if (!Number.isInteger(containerCount) || containerCount <= 0 || containerCount > 100) {
      throw new ApiError(40001, '箱量必须为 1~100 的整数');
    }
    const goodsName = String(line.goodsName ?? input.cargoName ?? goods?.goods_name ?? '').trim();
    if (!goodsName) {
      throw new ApiError(40001, '货物名称不能为空');
    }
    const quantity = Number(line.quantity ?? containerCount);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ApiError(40001, '货物数量必须大于 0');
    }
    const weightRaw = line.weightT ?? (goods?.default_weight ? Number(goods.default_weight) * containerCount : input.cargoWeight);
    const weightT = Number(weightRaw ?? 0);
    if (!Number.isFinite(weightT) || weightT < 0) {
      throw new ApiError(40001, '货物重量不合法');
    }
    const volumeCbm = line.volumeCbm === null || line.volumeCbm === undefined
      ? round2(Number(containerType.inner_volume_cbm) * containerCount)
      : round2(Number(line.volumeCbm));
    const dangerousFlag = toBool(line.dangerousFlag ?? goods?.dangerous_flag) ? 1 : 0;
    resolved.push({
      seq: index + 1,
      goodsCode: line.goodsCode ?? goods?.goods_code ?? null,
      goodsName,
      quantity: round2(quantity),
      unit: line.unit ?? '箱',
      weightT: round2(weightT),
      volumeCbm: Number.isFinite(volumeCbm) ? volumeCbm : null,
      containerTypeId: Number(containerType.id),
      containerTypeCode: containerType.code,
      containerCount,
      dangerousFlag,
      packaging: line.packaging ?? goods?.packaging ?? null,
      remark: line.remark ?? null,
      estimateAmount: round2((ESTIMATE_PER_BOX[containerType.code] ?? 15840) * containerCount),
    });
  }
  return resolved;
}

/** POST /api/orders 快速下单通道：生成订单 + 多货物行 + 箱档案（v0 单货物行兼容） */
export async function createQuickOrder(input: CreateQuickOrderInput, user: AuthUser, ip: string | null): Promise<number> {
  const orderId = await withTransaction(async (conn) => {
    const lines = await resolveCargoLines(conn, input);
    const totalContainerCount = lines.reduce((sum, line) => sum + line.containerCount, 0);
    if (totalContainerCount > 100) {
      throw new ApiError(40001, '总箱量不能超过 100');
    }
    const totalCargoWeight = round2(lines.reduce((sum, line) => sum + line.weightT, 0));
    const totalAmount = round2(lines.reduce((sum, line) => sum + line.estimateAmount, 0));

    let customerId: number | null = null;
    if (input.customerId) {
      const customer = await txQueryOne<{ id: number }>(conn, 'SELECT id FROM customer WHERE id = ?', [
        Number(input.customerId),
      ]);
      if (!customer) {
        throw new ApiError(40401, '客户不存在');
      }
      customerId = Number(customer.id);
    } else if (user.role === 'SHIPPER' && user.uid) {
      const shipperRow = await txQueryOne<{ customer_id: number | null }>(
        conn,
        'SELECT customer_id FROM user WHERE id = ?',
        [user.uid],
      );
      customerId = shipperRow?.customer_id === null || shipperRow?.customer_id === undefined
        ? null
        : Number(shipperRow.customer_id);
    }

    let contractRow: ContractRow | null = null;
    if (input.contractId) {
      contractRow = await findSignedContract(Number(input.contractId), customerId ?? -1).catch((error) => {
        throw error;
      });
      customerId = Number(contractRow.customer_id);
    }

    let consigneeCustomerId: number | null = null;
    if (input.consigneeCustomerId) {
      const consignee = await txQueryOne<{ id: number }>(conn, 'SELECT id FROM customer WHERE id = ?', [
        Number(input.consigneeCustomerId),
      ]);
      if (!consignee) {
        throw new ApiError(40401, '收货人不存在');
      }
      consigneeCustomerId = Number(consignee.id);
    }
    const notifyCustomerId = input.notifyCustomerId ? Number(input.notifyCustomerId) : null;

    let routeTemplateId: number | null = null;
    if (input.routeTemplateId) {
      const route = await txQueryOne<{ id: number }>(conn, 'SELECT id FROM route_template WHERE id = ?', [
        Number(input.routeTemplateId),
      ]);
      if (!route) {
        throw new ApiError(40401, '线路模板不存在');
      }
      routeTemplateId = Number(route.id);
    }

    const orderNo = await nextDocNo(conn, {
      table: 'orders',
      column: 'order_no',
      prefix: `MO${todayCompact()}`,
      width: 4,
    });
    const at = formatDateTime(nowDate());
    const firstLine = lines[0];
    const result = await txExec(
      conn,
      `INSERT INTO orders (order_no, shipper_id, status, cargo_name, cargo_weight, container_type, container_count,
         origin, destination, required_pickup_date, remark, order_type, customer_id, consignee_customer_id,
         notify_customer_id, contract_id, quote_id, route_template_id, priority, source, total_amount, currency,
         created_at, updated_at)
       VALUES (?, ?, 'CREATED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'QUICK', ?, 'CNY', ?, ?)`,
      [
        orderNo,
        user.uid,
        firstLine.goodsName,
        totalCargoWeight,
        firstLine.containerTypeCode,
        totalContainerCount,
        input.origin,
        input.destination,
        input.requiredPickupDate,
        input.remark ?? null,
        input.orderType ?? 'ROAD_RAIL_SEA',
        customerId,
        consigneeCustomerId,
        notifyCustomerId,
        input.contractId ? Number(input.contractId) : null,
        routeTemplateId,
        input.priority ?? 'NORMAL',
        totalAmount,
        at,
        at,
      ],
    );
    const newOrderId = Number(result.insertId);

    for (const line of lines) {
      await txExec(
        conn,
        `INSERT INTO order_cargo (order_id, seq, goods_code, goods_name, quantity, unit, weight_t, volume_cbm,
           container_type_id, container_count, dangerous_flag, packaging, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newOrderId,
          line.seq,
          line.goodsCode,
          line.goodsName,
          line.quantity,
          line.unit,
          line.weightT,
          line.volumeCbm,
          line.containerTypeId,
          line.containerCount,
          line.dangerousFlag,
          line.packaging,
          line.remark,
        ],
      );
    }

    let containerIndex = 0;
    for (const line of lines) {
      for (let i = 0; i < line.containerCount; i += 1) {
        containerIndex += 1;
        await txExec(
          conn,
          `INSERT INTO container (order_id, container_no, type, seal_no, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'EMPTY', ?, ?)`,
          [
            newOrderId,
            containerNoForOrder(newOrderId, containerIndex),
            line.containerTypeCode,
            sealNoForOrder(newOrderId, containerIndex),
            at,
            at,
          ],
        );
      }
    }

    await writeAudit(conn, {
      user,
      action: 'ORDER_CREATE',
      actionLabel: '创建订单',
      module: 'order',
      targetType: 'ORDER',
      targetId: newOrderId,
      detail: {
        orderNo,
        source: 'QUICK',
        cargoLines: lines.length,
        containerCount: totalContainerCount,
        totalAmount,
      },
      ip,
    });

    return newOrderId;
  });
  return orderId;
}

/** POST /api/orders/:id/cancel：仅未调度可取消 */
export async function cancelOrder(id: number, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const order = await txQueryOne<{
      id: number;
      order_no: string;
      status: string;
      shipper_id: number;
      customer_id: number | null;
    }>(conn, 'SELECT id, order_no, status, shipper_id, customer_id FROM orders WHERE id = ? FOR UPDATE', [id]);
    if (!order) {
      throw new ApiError(40401, '订单不存在');
    }
    if (user.role === 'SHIPPER') {
      const owns = Number(order.shipper_id) === Number(user.uid) ||
        (user.customer_id !== null && Number(order.customer_id) === Number(user.customer_id));
      if (!owns) {
        throw new ApiError(40301, '只能取消自己的订单');
      }
    } else if (!['MTO', 'ADMIN', 'FORWARDER'].includes(user.role)) {
      throw new ApiError(40301, '无权限取消订单');
    }
    const cancellable = ['CREATED', 'CONTRACTED', 'CONFIRMED'];
    if (!cancellable.includes(order.status)) {
      throw new ApiError(
        40901,
        `当前订单状态（${ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ?? order.status}）不允许取消`,
      );
    }
    const at = formatDateTime(nowDate());
    await txExec(conn, 'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', ['CANCELLED', at, id]);
    await emitEvent(conn, {
      eventType: 'order.cancelled',
      aggregateType: 'ORDER',
      aggregateId: Number(order.id),
      payload: { orderId: Number(order.id), orderNo: order.order_no, customerId: order.customer_id, cancelledAt: at },
    });
    await writeAudit(conn, {
      user,
      action: 'ORDER_CANCEL',
      actionLabel: '取消订单',
      module: 'order',
      targetType: 'ORDER',
      targetId: Number(order.id),
      detail: { orderNo: order.order_no, fromStatus: order.status },
      ip,
    });
    return { id: Number(order.id), status: 'CANCELLED', statusLabel: ORDER_STATUS_LABELS.CANCELLED };
  });
}
