// 初始化数据库：重建 7 张表 + 写入演示账号与 2 条历史订单（幂等：每次重跑都会重置演示数据）
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: resolve(apiRoot, '.env') });

const DEMO_PASSWORD = 'demo123';
const bcryptHash = bcrypt.hashSync(DEMO_PASSWORD, 10);

const users = [
  { username: 'shipper01', displayName: '上海远洋物流（货主）', role: 'SHIPPER' },
  { username: 'mto01', displayName: '中远海联运 MTO', role: 'MTO' },
  { username: 'carrier01', displayName: '安捷卡车队（公路承运人）', role: 'CARRIER' },
  { username: 'terminal01', displayName: '洋山港/阳逻港操作员', role: 'TERMINAL' },
  { username: 'settlement01', displayName: '联运结算中心', role: 'SETTLEMENT' },
];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    multipleStatements: true,
    dateStrings: true,
  });

  console.log(`[db] 连接 ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

  const schemaSql = readFileSync(resolve(apiRoot, 'db/schema.sql'), 'utf8');
  await conn.query(schemaSql);
  console.log('[db] 7 张表已重建');

  // ---------- 账号 ----------
  for (const u of users) {
    await conn.execute(
      'INSERT INTO user (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
      [u.username, bcryptHash, u.displayName, u.role],
    );
  }
  const [userRows] = await conn.query('SELECT id, username FROM user');
  const uid = Object.fromEntries(userRows.map((r) => [r.username, r.id]));
  console.log(`[db] 演示账号 ${userRows.length} 个（密码 ${DEMO_PASSWORD}）`);

  // ---------- 历史订单 A：已完成并出账 ----------
  const [oa] = await conn.execute(
    `INSERT INTO orders (order_no, shipper_id, status, cargo_name, cargo_weight, container_type, container_count,
       origin, destination, required_pickup_date, remark, created_at, updated_at)
     VALUES (?, ?, 'BILLED', '光伏组件', 22.50, '40HQ', 2, '上海嘉定', '成都青白江', '2026-10-08', '演示历史单：全流程已完成',
       '2026-10-08 09:00:00', '2026-10-10 16:30:00')`,
    ['MO202610080001', uid.shipper01],
  );
  const orderAId = oa.insertId;
  await conn.execute(
    `INSERT INTO container (order_id, container_no, type, seal_no, status, condition_text) VALUES
       (?, 'MSCU7000001', '40HQ', 'SEAL20261008001', 'DELIVERED', '箱况良好，无破损'),
       (?, 'MSCU7000002', '40HQ', 'SEAL20261008002', 'DELIVERED', '箱况良好，无破损')`,
    [orderAId, orderAId],
  );
  const [wbA] = await conn.execute(
    `INSERT INTO waybill (waybill_no, order_id, status, signer_name, signed_at, created_at, updated_at)
     VALUES ('WB20261008001', ?, 'SIGNED', '李经理', '2026-10-10 16:20:00', '2026-10-08 10:00:00', '2026-10-10 16:20:00')`,
    [orderAId],
  );
  const waybillAId = wbA.insertId;

  const segmentsA = [
    {
      seq: 1, mode: 'ROAD', carrierCode: 'AJ-001', carrierName: '安捷卡车队', carrierUserId: uid.carrier01,
      startNode: '上海嘉定工厂', endNode: '上海洋山港',
      plannedStart: '2026-10-08 12:00:00', plannedEnd: '2026-10-08 18:00:00',
      actualStart: '2026-10-08 12:10:00', actualEnd: '2026-10-08 17:40:00',
      acceptedAt: '2026-10-08 11:00:00', status: 'COMPLETED', costAmount: 1280,
    },
    {
      seq: 2, mode: 'SEA', carrierCode: 'COSCO-EDI', carrierName: '中远海运（mock）', carrierUserId: null,
      startNode: '上海洋山港', endNode: '武汉阳逻港',
      plannedStart: '2026-10-09 08:00:00', plannedEnd: '2026-10-09 20:00:00',
      actualStart: '2026-10-09 08:30:00', actualEnd: '2026-10-09 19:30:00',
      acceptedAt: null, status: 'COMPLETED', costAmount: 5200,
    },
    {
      seq: 3, mode: 'RAIL', carrierCode: 'CR-95306', carrierName: '中铁集装箱（mock）', carrierUserId: null,
      startNode: '武汉吴家山站', endNode: '成都城厢站',
      plannedStart: '2026-10-10 06:00:00', plannedEnd: '2026-10-10 15:00:00',
      actualStart: '2026-10-10 06:40:00', actualEnd: '2026-10-10 14:50:00',
      acceptedAt: null, status: 'COMPLETED', costAmount: 8600,
    },
  ];
  const segAIds = [];
  for (const s of segmentsA) {
    const [r] = await conn.execute(
      `INSERT INTO waybill_segment (waybill_id, seq, mode, carrier_code, carrier_name, carrier_user_id,
         start_node, end_node, planned_start, planned_end, actual_start, actual_end, accepted_at, status, cost_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [waybillAId, s.seq, s.mode, s.carrierCode, s.carrierName, s.carrierUserId,
        s.startNode, s.endNode, s.plannedStart, s.plannedEnd, s.actualStart, s.actualEnd,
        s.acceptedAt, s.status, s.costAmount],
    );
    segAIds.push(r.insertId);
  }

  const trackA = [
    [1, segAIds[0], '上海嘉定工厂', 121.265, 31.375, '2026-10-08 11:00:00', 'CARRIER_REPORT', '司机已接单'],
    [2, segAIds[0], '外环高速', 121.45, 31.32, '2026-10-08 13:00:00', 'MOCK_GPS', '在途位置'],
    [3, segAIds[0], '东海大桥', 121.9, 30.78, '2026-10-08 15:30:00', 'MOCK_GPS', '在途位置'],
    [4, segAIds[0], '上海洋山港', 122.045, 30.625, '2026-10-08 17:40:00', 'CARRIER_REPORT', '已送达上海洋山港'],
    [5, segAIds[1], '上海洋山港', 122.045, 30.625, '2026-10-09 08:30:00', 'TERMINAL_REPORT', '已确认进场，箱况良好'],
    [6, segAIds[1], '长江口', 121.5, 31.0, '2026-10-09 12:00:00', 'MOCK_GPS', '在途位置'],
    [7, segAIds[1], '武汉阳逻港', 114.55, 30.7, '2026-10-09 19:30:00', 'MOCK_EDI', '船舶靠泊阳逻港，卸船完成'],
    [8, segAIds[2], '武汉吴家山站', 114.13, 30.61, '2026-10-10 06:40:00', 'TERMINAL_REPORT', '吴家山站确认进场，集装箱已进站'],
    [9, segAIds[2], '襄阳', 112.14, 32.04, '2026-10-10 09:30:00', 'MOCK_GPS', '在途位置'],
    [10, segAIds[2], '安康', 109.03, 32.69, '2026-10-10 12:00:00', 'MOCK_GPS', '在途位置'],
    [11, segAIds[2], '成都城厢站', 104.3, 30.87, '2026-10-10 14:50:00', 'MOCK_EDI', '到达成都城厢站，铁路段完成'],
    [12, null, '成都青白江', 104.3, 30.87, '2026-10-10 16:20:00', 'MTO', '货主签收（李经理）'],
  ];
  for (const t of trackA) {
    await conn.execute(
      `INSERT INTO track_point (seq, waybill_id, segment_id, node_name, lng, lat, occurred_at, source, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [t[0], waybillAId, t[1], t[2], t[3], t[4], t[5], t[6], t[7]],
    );
  }

  const breakdownA = [
    { segmentId: segAIds[0], seq: 1, mode: 'ROAD', modeLabel: '公路', carrierName: '安捷卡车队', startNode: '上海嘉定工厂', endNode: '上海洋山港', amount: 1280 },
    { segmentId: segAIds[1], seq: 2, mode: 'SEA', modeLabel: '海运', carrierName: '中远海运（mock）', startNode: '上海洋山港', endNode: '武汉阳逻港', amount: 5200 },
    { segmentId: segAIds[2], seq: 3, mode: 'RAIL', modeLabel: '铁路', carrierName: '中铁集装箱（mock）', startNode: '武汉吴家山站', endNode: '成都城厢站', amount: 8600 },
  ];
  await conn.execute(
    `INSERT INTO bill (bill_no, order_id, waybill_id, total_amount, status, segment_breakdown, issued_at)
     VALUES ('BL20261010001', ?, ?, 15080.00, 'ISSUED', ?, '2026-10-10 16:30:00')`,
    [orderAId, waybillAId, JSON.stringify(breakdownA)],
  );

  // ---------- 历史订单 B：运输中 ----------
  const [ob] = await conn.execute(
    `INSERT INTO orders (order_no, shipper_id, status, cargo_name, cargo_weight, container_type, container_count,
       origin, destination, required_pickup_date, remark, created_at, updated_at)
     VALUES (?, ?, 'IN_TRANSIT', '汽车配件', 18.20, '40HQ', 1, '上海嘉定', '成都青白江', '2026-10-20', '演示历史单：海运在途',
       '2026-10-20 09:00:00', '2026-10-20 18:00:00')`,
    ['MO202610200001', uid.shipper01],
  );
  const orderBId = ob.insertId;
  await conn.execute(
    `INSERT INTO container (order_id, container_no, type, seal_no, status, condition_text)
     VALUES (?, 'MSCU7000003', '40HQ', 'SEAL20261020001', 'IN_TRANSIT', '箱况良好，无破损')`,
    [orderBId],
  );
  const [wbB] = await conn.execute(
    `INSERT INTO waybill (waybill_no, order_id, status, created_at, updated_at)
     VALUES ('WB20261020001', ?, 'IN_TRANSIT', '2026-10-20 10:00:00', '2026-10-20 18:00:00')`,
    [orderBId],
  );
  const waybillBId = wbB.insertId;

  const segmentsB = [
    {
      seq: 1, mode: 'ROAD', carrierCode: 'HT-002', carrierName: '华通物流', carrierUserId: uid.carrier01,
      startNode: '上海嘉定工厂', endNode: '上海洋山港',
      plannedStart: '2026-10-20 11:00:00', plannedEnd: '2026-10-20 17:00:00',
      actualStart: '2026-10-20 10:30:00', actualEnd: '2026-10-20 16:10:00',
      acceptedAt: '2026-10-20 10:15:00', status: 'COMPLETED', costAmount: 1350,
    },
    {
      seq: 2, mode: 'SEA', carrierCode: 'COSCO-EDI', carrierName: '中远海运（mock）', carrierUserId: null,
      startNode: '上海洋山港', endNode: '武汉阳逻港',
      plannedStart: '2026-10-21 08:00:00', plannedEnd: '2026-10-21 20:00:00',
      actualStart: '2026-10-20 18:00:00', actualEnd: null,
      acceptedAt: null, status: 'IN_TRANSIT', costAmount: 5200,
    },
    {
      seq: 3, mode: 'RAIL', carrierCode: 'CR-95306', carrierName: '中铁集装箱（mock）', carrierUserId: null,
      startNode: '武汉吴家山站', endNode: '成都城厢站',
      plannedStart: '2026-10-22 06:00:00', plannedEnd: '2026-10-22 15:00:00',
      actualStart: null, actualEnd: null,
      acceptedAt: null, status: 'PENDING', costAmount: 8600,
    },
  ];
  const segBIds = [];
  for (const s of segmentsB) {
    const [r] = await conn.execute(
      `INSERT INTO waybill_segment (waybill_id, seq, mode, carrier_code, carrier_name, carrier_user_id,
         start_node, end_node, planned_start, planned_end, actual_start, actual_end, accepted_at, status, cost_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [waybillBId, s.seq, s.mode, s.carrierCode, s.carrierName, s.carrierUserId,
        s.startNode, s.endNode, s.plannedStart, s.plannedEnd, s.actualStart, s.actualEnd,
        s.acceptedAt, s.status, s.costAmount],
    );
    segBIds.push(r.insertId);
  }

  const trackB = [
    [1, segBIds[0], '上海嘉定工厂', 121.265, 31.375, '2026-10-20 10:15:00', 'CARRIER_REPORT', '司机已接单'],
    [2, segBIds[0], '外环高速', 121.45, 31.32, '2026-10-20 12:00:00', 'MOCK_GPS', '在途位置'],
    [3, segBIds[0], '东海大桥', 121.9, 30.78, '2026-10-20 14:30:00', 'MOCK_GPS', '在途位置'],
    [4, segBIds[0], '上海洋山港', 122.045, 30.625, '2026-10-20 16:10:00', 'CARRIER_REPORT', '已送达上海洋山港'],
    [5, segBIds[1], '上海洋山港', 122.045, 30.625, '2026-10-20 18:00:00', 'TERMINAL_REPORT', '已确认进场，箱况良好'],
    [6, segBIds[1], '长江口', 121.5, 31.0, '2026-10-20 21:00:00', 'MOCK_GPS', '在途位置'],
  ];
  for (const t of trackB) {
    await conn.execute(
      `INSERT INTO track_point (seq, waybill_id, segment_id, node_name, lng, lat, occurred_at, source, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [t[0], waybillBId, t[1], t[2], t[3], t[4], t[5], t[6], t[7]],
    );
  }

  const [counts] = await conn.query(
    `SELECT (SELECT COUNT(*) FROM user) users, (SELECT COUNT(*) FROM orders) orders,
            (SELECT COUNT(*) FROM container) containers, (SELECT COUNT(*) FROM waybill) waybills,
            (SELECT COUNT(*) FROM waybill_segment) segments, (SELECT COUNT(*) FROM track_point) tracks,
            (SELECT COUNT(*) FROM bill) bills`,
  );
  console.log('[db] 数据写入完成：', JSON.stringify(counts[0]));
  await conn.end();
  console.log('[db] ✅ 初始化完成');
}

main().catch((err) => {
  console.error('[db] ❌ 初始化失败：', err.message);
  process.exitCode = 1;
});
