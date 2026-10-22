import { txExec, withTransaction } from '../db/pool';
import { formatDateTime, nowDate, todayCompact } from '../utils/datetime';
import { nextDailyNo } from './sequence';

export interface CreateOrderInput {
  cargoName: string;
  cargoWeight: number;
  containerType: string;
  containerCount: number;
  origin: string;
  destination: string;
  requiredPickupDate: string;
  remark?: string | null;
}

/**
 * POST /api/orders：货主下单（事务：订单 + 按箱量生成 container）
 * order_no = MO + yyyyMMdd + 4 位当日序号；箱号由订单 id 派生，保证唯一。
 */
export async function createOrder(input: CreateOrderInput, shipperId: number): Promise<number> {
  return withTransaction(async (conn) => {
    const orderNo = await nextDailyNo(conn, 'orders', 'order_no', `MO${todayCompact()}`, 4);
    const at = formatDateTime(nowDate());

    const result = await txExec(
      conn,
      `INSERT INTO orders (order_no, shipper_id, status, cargo_name, cargo_weight, container_type, container_count,
         origin, destination, required_pickup_date, remark, created_at, updated_at)
       VALUES (?, ?, 'CREATED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNo,
        shipperId,
        input.cargoName,
        input.cargoWeight,
        input.containerType,
        input.containerCount,
        input.origin,
        input.destination,
        input.requiredPickupDate,
        input.remark ?? null,
        at,
        at,
      ],
    );
    const orderId = Number(result.insertId);

    for (let index = 1; index <= input.containerCount; index += 1) {
      const containerNo = `MSCU${String(7000000 + (orderId - 1) * 10 + index).padStart(7, '0')}`;
      const sealNo = `SEAL${orderNo.slice(2)}${String(index).padStart(2, '0')}`;
      await txExec(
        conn,
        `INSERT INTO container (order_id, container_no, type, seal_no, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'EMPTY', ?, ?)`,
        [orderId, containerNo, input.containerType, sealNo, at, at],
      );
    }

    return orderId;
  });
}
