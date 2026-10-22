// 事务性发件箱消费者：领域事件 → integration_message（Mock 适配器）+ notification
import type { PoolConnection } from 'mysql2/promise';
import { formatDateTime, nowDate, todayCompact } from '../utils/datetime';
import { txExec, txQueryRows } from '../db/pool';
import { buildMessageForEvent, type IntegrationMessageSpec } from '../modules/integration/adapters';
import { nextDocNo } from './sequence';

export interface DomainEvent {
  eventType: string;
  aggregateType: string;
  aggregateId: number | string;
  payload: Record<string, unknown>;
}

interface NotifyOptions {
  userId?: number | null;
  role?: string | null;
  type: 'TODO' | 'ALERT' | 'INFO';
  title: string;
  content: string;
  relatedType?: string | null;
  relatedId?: string | number | null;
}

async function notify(conn: PoolConnection, options: NotifyOptions): Promise<void> {
  await txExec(
    conn,
    `INSERT INTO notification (user_id, role, type, title, content, related_type, related_id, read_flag, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      options.userId ?? null,
      options.role ?? null,
      options.type,
      options.title,
      options.content,
      options.relatedType ?? null,
      options.relatedId === null || options.relatedId === undefined ? null : String(options.relatedId),
      formatDateTime(nowDate()),
    ],
  );
}

async function notifyCustomerUsers(
  conn: PoolConnection,
  customerId: unknown,
  options: Omit<NotifyOptions, 'userId'>,
): Promise<void> {
  const id = Number(customerId);
  if (!Number.isFinite(id) || id <= 0) {
    return;
  }
  const users = await txQueryRows<{ id: number }>(
    conn,
    "SELECT id FROM user WHERE customer_id = ? AND status = 'ACTIVE'",
    [id],
  );
  for (const user of users) {
    await notify(conn, { ...options, userId: Number(user.id) });
  }
}

/** 写入集成报文（Mock 适配器直接成功） */
export async function createIntegrationMessage(
  conn: PoolConnection,
  spec: IntegrationMessageSpec,
): Promise<void> {
  const msgNo = await nextDocNo(conn, {
    table: 'integration_message',
    column: 'msg_no',
    prefix: `MSG${todayCompact()}`,
    width: 5,
  });
  const at = formatDateTime(nowDate());
  await txExec(
    conn,
    `INSERT INTO integration_message (msg_no, system_code, system_name, direction, msg_type, standard,
       related_type, related_id, payload, status, retry_count, created_at, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', 0, ?, ?)`,
    [
      msgNo,
      spec.systemCode,
      spec.systemName,
      spec.direction,
      spec.msgType,
      spec.standard,
      spec.relatedType,
      spec.relatedId,
      JSON.stringify(spec.payload),
      at,
      at,
    ],
  );
}

async function createNotifications(conn: PoolConnection, event: DomainEvent): Promise<void> {
  const payload = event.payload ?? {};
  switch (event.eventType) {
    case 'quote.sent':
      await notifyCustomerUsers(conn, payload.customerId, {
        type: 'INFO',
        title: '报价已发送',
        content: `报价单 ${String(payload.quoteNo ?? '')} 已生成，请查看并确认后签署合同`,
        relatedType: 'QUOTE',
        relatedId: payload.quoteId as number,
      });
      break;
    case 'quote.accepted':
      await notify(conn, {
        role: 'MTO',
        type: 'TODO',
        title: '报价已接受',
        content: `报价单 ${String(payload.quoteNo ?? '')} 已被客户接受，订单 ${String(payload.orderNo ?? '')} 已生成，请安排调度`,
        relatedType: 'ORDER',
        relatedId: payload.orderId as number,
      });
      break;
    case 'contract.sent':
      await notifyCustomerUsers(conn, payload.customerId, {
        type: 'TODO',
        title: '合同待签署',
        content: `合同 ${String(payload.contractNo ?? '')} 待签署，请完成电子签章`,
        relatedType: 'CONTRACT',
        relatedId: payload.contractId as number,
      });
      break;
    case 'contract.signed':
      await notify(conn, {
        role: 'MTO',
        type: 'INFO',
        title: '合同已签署',
        content: `合同 ${String(payload.contractNo ?? '')} 已完成电子签章，可归档并关联订单`,
        relatedType: 'CONTRACT',
        relatedId: payload.contractId as number,
      });
      break;
    case 'order.dispatched': {
      const carrierUserId = Number(payload.carrierUserId);
      if (Number.isFinite(carrierUserId) && carrierUserId > 0) {
        await notify(conn, {
          userId: carrierUserId,
          type: 'TODO',
          title: '新的公路运输任务',
          content: `订单 ${String(payload.orderNo ?? '')} 已调度，运单 ${String(payload.waybillNo ?? '')} 待接单`,
          relatedType: 'WAYBILL',
          relatedId: payload.waybillId as number,
        });
      } else {
        await notify(conn, {
          role: 'CARRIER',
          type: 'TODO',
          title: '新的公路运输任务',
          content: `订单 ${String(payload.orderNo ?? '')} 已调度，待接单`,
          relatedType: 'WAYBILL',
          relatedId: payload.waybillId as number,
        });
      }
      break;
    }
    case 'order.signed':
      await notify(conn, {
        role: 'SETTLEMENT',
        type: 'TODO',
        title: '订单待结算',
        content: `订单 ${String(payload.orderNo ?? '')} 已签收，请生成分段账单`,
        relatedType: 'ORDER',
        relatedId: payload.orderId as number,
      });
      break;
    case 'order.settled':
      await notifyCustomerUsers(conn, payload.customerId, {
        type: 'INFO',
        title: '账单已生成',
        content: `账单 ${String(payload.billNo ?? '')} 已生成，可在账单页查看明细`,
        relatedType: 'BILL',
        relatedId: payload.billId as number,
      });
      break;
    case 'order.cancelled':
      await notify(conn, {
        role: 'MTO',
        type: 'ALERT',
        title: '订单已取消',
        content: `订单 ${String(payload.orderNo ?? '')} 已被取消`,
        relatedType: 'ORDER',
        relatedId: payload.orderId as number,
      });
      break;
    default:
      break;
  }
}

/** 发布一个领域事件：落集成报文 + 站内通知（Mock 适配器立即成功） */
export async function publishEvent(conn: PoolConnection, event: DomainEvent): Promise<void> {
  const spec = buildMessageForEvent(event.eventType, event.payload ?? {});
  if (spec) {
    await createIntegrationMessage(conn, spec);
  }
  await createNotifications(conn, event);
}
