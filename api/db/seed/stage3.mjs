// Stage 3 业务种子：运力池 / 调度方案 / 监控预警 / 异常工单 / IoT 设备与读数 / 电子围栏
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pad = (n, width = 2) => String(n).padStart(width, '0');

function fmt(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function at(base, hours) {
  return fmt(new Date(base.getTime() + hours * 3600000));
}
function ymd(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}
async function insert(conn, sql, params) {
  const [result] = await conn.execute(sql, params);
  return result.insertId;
}

const PLATE_PREFIX = ['沪A', '沪B', '沪C', '苏E', '浙B', '川A'];
const DRIVERS = [
  ['张建国', '13900000001'], ['马强', '13900000002'], ['钱伟', '13900000003'], ['孙浩', '13900000004'],
  ['赵明', '13900000005'], ['周涛', '13900000006'], ['李斌', '13910000001'], ['王军', '13910000002'],
  ['陈刚', '13910000003'], ['杨帆', '13910000004'], ['罗成', '13910000005'], ['徐海', '13910000006'],
];

export async function seedStage3(conn, ref) {
  const now = new Date();
  const [orders] = await conn.query('SELECT * FROM orders ORDER BY id');
  const [waybills] = await conn.query("SELECT * FROM waybill WHERE waybill_type = 'MASTER' ORDER BY id");
  const [segments] = await conn.query('SELECT * FROM waybill_segment ORDER BY waybill_id, seq');
  const [containers] = await conn.query('SELECT * FROM container ORDER BY id');
  const orderById = new Map(orders.map((row) => [Number(row.id), row]));
  const nodeByName = new Map(ref.nodes.map((node) => [node.name, node]));
  const nodeById = new Map(ref.nodes.map((node) => [node.id, node]));
  const partnerByName = (name) => ref.partners.find((p) => p.name.includes(name) || p.shortName === name);
  const roadCarriers = ref.partners.filter((p) => p.type === 'ROAD_CARRIER');
  const railOperators = ref.partners.filter((p) => p.type === 'RAIL_OPERATOR');
  const seaCarriers = ref.partners.filter((p) => p.type === 'SEA_CARRIER');

  // ── 运力池：车辆 / 班列 / 班轮 ───────────────────────────────────────────
  const vehicles = [];
  for (let i = 0; i < 12; i += 1) {
    const carrier = roadCarriers[i % roadCarriers.length];
    const node = nodeByName.get(i % 2 === 0 ? '上海嘉定工厂' : '上海洋山港');
    const status = i < 8 ? 'IDLE' : i < 11 ? 'IN_TASK' : 'MAINTENANCE';
    const id = await insert(conn,
      `INSERT INTO vehicle (vehicle_no, plate_no, vehicle_type, carrier_partner_id, driver_name, driver_phone,
         capacity_t, container_slots, gps_device_no, status, current_node_id, lng, lat, last_seen_at, created_at)
       VALUES (?, ?, 'TRACTOR', ?, ?, ?, 30.00, 1, ?, ?, ?, ?, ?, ?, ?)`,
      [`VEH${String(i + 1).padStart(4, '0')}`, `${PLATE_PREFIX[i % PLATE_PREFIX.length]}·D${String(1200 + i)}`,
        carrier.id, DRIVERS[i][0], DRIVERS[i][1], `GPS-VEH-${String(i + 1).padStart(3, '0')}`, status,
        node.id, node.lng + (i % 3) * 0.01, node.lat + (i % 2) * 0.01, at(now, -i * 0.5), at(now, -30)]);
    vehicles.push({ id, plate: `${PLATE_PREFIX[i % PLATE_PREFIX.length]}·D${String(1200 + i)}`, carrier, node, status });
  }

  const trainDefs = [
    ['X8021', '武汉吴家山站', '成都城厢站'], ['X8022', '武汉吴家山站', '成都城厢站'],
    ['X9101', '宁波舟山港', '成都城厢站'], ['X9102', '宁波舟山港', '成都城厢站'],
    ['X7301', '郑州圃田站', '重庆团结村站'], ['X7302', '西安国际港站', '郑州圃田站'],
    ['X8101', '上海洋山港', '成都城厢站'], ['X8102', '武汉吴家山站', '重庆团结村站'],
  ];
  const trains = [];
  for (let i = 0; i < trainDefs.length; i += 1) {
    const [trainNo, originName, destName] = trainDefs[i];
    const operator = railOperators[i % railOperators.length];
    const origin = nodeByName.get(originName);
    const dest = nodeByName.get(destName);
    const capacity = 50;
    const booked = 22 + (i * 5) % 26;
    const departure = new Date(now.getTime() + (i + 1) * 12 * 3600000);
    const id = await insert(conn,
      `INSERT INTO train_schedule (train_no, operator_partner_id, origin_node_id, dest_node_id, departure_at, arrival_at,
         capacity_teu, booked_teu, status, price_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [trainNo, operator.id, origin.id, dest.id, fmt(departure), fmt(new Date(departure.getTime() + 36 * 3600000)),
        capacity, booked, i < 5 ? 'OPEN' : i < 7 ? 'PLANNED' : 'DEPARTED', (95 + i * 2).toFixed(2), at(now, -30)]);
    trains.push({ id, trainNo, operator, origin, dest, capacity, booked, departure });
  }

  const vesselDefs = [
    ['COSCO SHIPPING', '2026E', '上海洋山港', '武汉阳逻港'], ['COSCO SHIPPING', '2026F', '上海洋山港', '武汉阳逻港'],
    ['CHANGHANG', 'C2601', '上海洋山港', '武汉阳逻港'], ['MINSHENG', 'M2602', '宁波舟山港', '武汉阳逻港'],
    ['COSCO SHIPPING', '2026G', '宁波舟山港', '武汉阳逻港'], ['CHANGHANG', 'C2602', '上海洋山港', '南京龙潭港'],
    ['MINSHENG', 'M2603', '宁波舟山港', '武汉阳逻港'], ['COSCO SHIPPING', '2026H', '上海洋山港', '武汉阳逻港'],
  ];
  const vessels = [];
  for (let i = 0; i < vesselDefs.length; i += 1) {
    const [vesselName, voyage, originName, destName] = vesselDefs[i];
    const carrier = seaCarriers[i % seaCarriers.length];
    const origin = nodeByName.get(originName) ?? ref.nodes.find((n) => n.type === 'PORT');
    const dest = nodeByName.get(destName) ?? ref.nodes.find((n) => n.type === 'PORT');
    const capacity = 500 + (i % 3) * 200;
    const booked = 260 + i * 37;
    const etd = new Date(now.getTime() + (i + 2) * 10 * 3600000);
    const id = await insert(conn,
      `INSERT INTO vessel_schedule (vessel_name, voyage, carrier_partner_id, origin_node_id, dest_node_id, etd, eta,
         capacity_teu, booked_teu, status, price_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [vesselName, voyage, carrier.id, origin.id, dest.id, fmt(etd), fmt(new Date(etd.getTime() + 36 * 3600000)),
        capacity, booked, i < 6 ? 'OPEN' : 'PLANNED', (93 + i * 2).toFixed(2), at(now, -30)]);
    vessels.push({ id, vesselName, voyage, carrier, origin, dest, capacity, booked, etd });
  }

  // ── 电子围栏 ─────────────────────────────────────────────────────────────
  const fenceNodes = ref.nodes.filter((node) => ['PORT', 'RAIL_STATION', 'WAREHOUSE', 'DEPOT'].includes(node.type)).slice(0, 12);
  for (const node of fenceNodes) {
    await insert(conn,
      `INSERT INTO geo_fence (name, fence_type, node_id, center_lng, center_lat, radius_m, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
      [`${node.name}围栏`, node.type === 'RAIL_STATION' ? 'STATION' : node.type, node.id, node.lng, node.lat,
        node.type === 'PORT' ? 1500 : 800, at(now, -60)]);
  }

  // ── IoT 设备与读数 ──────────────────────────────────────────────────────
  const devices = [];
  for (const vehicle of vehicles) {
    const id = await insert(conn,
      `INSERT INTO iot_device (device_no, device_type, vehicle_id, status, last_seen_at, created_at)
       VALUES (?, 'GPS', ?, 'ONLINE', ?, ?)`,
      [`GPS-VEH-${String(vehicle.id).padStart(3, '0')}`, vehicle.id, at(now, -0.2), at(now, -30)]);
    devices.push({ id, type: 'GPS', vehicleId: vehicle.id, containerId: null, no: `GPS-VEH-${String(vehicle.id).padStart(3, '0')}` });
  }
  const reeferContainers = containers.filter((c) => c.type === '40RF').slice(0, 5);
  const targetContainers = reeferContainers.length >= 5 ? reeferContainers : containers.slice(0, 5);
  const tempDevices = [];
  for (let i = 0; i < targetContainers.length; i += 1) {
    const container = targetContainers[i];
    const id = await insert(conn,
      `INSERT INTO iot_device (device_no, device_type, container_id, status, last_seen_at, created_at)
       VALUES (?, 'TEMP_HUMIDITY', ?, 'ONLINE', ?, ?)`,
      [`IOT-TH-${String(i + 1).padStart(3, '0')}`, container.id, at(now, -i * 0.1), at(now, -30)]);
    devices.push({ id, type: 'TEMP_HUMIDITY', containerId: container.id, no: `IOT-TH-${String(i + 1).padStart(3, '0')}` });
    tempDevices.push({ id, containerId: container.id, no: `IOT-TH-${String(i + 1).padStart(3, '0')}` });
  }
  for (let i = 0; i < 3; i += 1) {
    const container = containers[(i + 5) % containers.length];
    const id = await insert(conn,
      `INSERT INTO iot_device (device_no, device_type, container_id, status, last_seen_at, created_at)
       VALUES (?, 'DOOR', ?, 'ONLINE', ?, ?)`,
      [`IOT-DOOR-${String(i + 1).padStart(3, '0')}`, container.id, at(now, -i), at(now, -30)]);
    devices.push({ id, type: 'DOOR', containerId: container.id, no: `IOT-DOOR-${String(i + 1).padStart(3, '0')}` });
  }

  let readingCount = 0;
  for (const temp of tempDevices) {
    for (let r = 0; r < 20; r += 1) {
      const temperature = r === 19 ? 9.6 : 1.5 + (r % 4) * 0.4;
      await insert(conn,
        `INSERT INTO iot_reading (device_id, container_id, temperature, humidity, door_open, lng, lat, reported_at, created_at)
         VALUES (?, ?, ?, ?, 0, 121.5, 31.0, ?, ?)`,
        [temp.id, temp.containerId, temperature.toFixed(2), (70 + r % 10).toFixed(2), at(now, -20 + r), at(now, -20 + r)]);
      readingCount += 1;
    }
  }
  for (const device of devices.filter((d) => d.type === 'GPS')) {
    for (let r = 0; r < 8; r += 1) {
      await insert(conn,
        `INSERT INTO iot_reading (device_id, container_id, lng, lat, reported_at, created_at)
         VALUES (?, NULL, ?, ?, ?, ?)`,
        [device.id, 121.4 + r * 0.05, 31.2 - r * 0.03, at(now, -1 + r * 0.1), at(now, -1 + r * 0.1)]);
      readingCount += 1;
    }
  }
  for (const device of devices.filter((d) => d.type === 'DOOR')) {
    await insert(conn,
      `INSERT INTO iot_reading (device_id, container_id, door_open, lng, lat, reported_at, created_at)
       VALUES (?, ?, 1, 122.04, 30.62, ?, ?)`,
      [device.id, device.containerId, at(now, -2), at(now, -2)]);
    readingCount += 1;
  }

  // ── 调度方案（DRAFT 三策略 + 已确认方案） ───────────────────────────────
  const candidates = orders.filter((o) => ['CREATED', 'CONFIRMED', 'CONTRACTED'].includes(o.status)).slice(0, 3);
  const confirmedOrder = orders.find((o) => o.status === 'DISPATCHED');
  const masterByOrder = new Map(waybills.map((w) => [Number(w.order_id), w]));
  const segmentsByWaybill = new Map();
  for (const segment of segments) {
    const key = Number(segment.waybill_id);
    if (!segmentsByWaybill.has(key)) segmentsByWaybill.set(key, []);
    segmentsByWaybill.get(key).push(segment);
  }
  const planIds = [];
  let planSeq = 0;
  let confirmedPlanId = null;
  const idleVehicle = vehicles.find((v) => v.status === 'IDLE') ?? vehicles[0];
  const openTrain = trains.find((t) => t.status === 'OPEN') ?? trains[0];
  const openVessel = vessels.find((v) => v.status === 'OPEN') ?? vessels[0];
  const baseStart = new Date(now.getTime() + 24 * 3600000);
  const strategies = [
    { code: 'COST', factor: 0.94, hoursFactor: 1.08, reliability: 92.5, summary: '公路+海运+铁路，成本最低' },
    { code: 'TIME', factor: 1.08, hoursFactor: 0.88, reliability: 90.2, summary: '优先班列/班轮，时效最快' },
    { code: 'BALANCED', factor: 1.0, hoursFactor: 0.98, reliability: 93.8, summary: '成本与时效综合最优' },
  ];
  for (const order of candidates) {
    for (const strategy of strategies) {
      planSeq += 1;
      const planNo = `DP${ymd(now)}${String(planSeq).padStart(3, '0')}`;
      const count = Number(order.container_count) || 1;
      const roadCost = 1400 * count * strategy.factor;
      const seaCost = 5200 * count * strategy.factor;
      const railCost = 8600 * count * strategy.factor;
      const totalCost = Math.round((roadCost + seaCost + railCost) * 100) / 100;
      const totalHours = Math.round((6 + 36 + 36 + 10) * strategy.hoursFactor * 10) / 10;
      const score = Math.round((100 - strategy.factor * 20 + strategy.reliability * 0.3) * 10) / 10;
      const planId = await insert(conn,
        `INSERT INTO dispatch_plan (plan_no, order_id, strategy, total_cost, total_hours, reliability, score, status, summary, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
        [planNo, order.id, strategy.code, totalCost, totalHours, strategy.reliability, score, strategy.summary,
          ref.userBy.mto01.id, at(now, -2)]);
      planIds.push(planId);
      const items = [
        { seq: 1, mode: 'ROAD', carrier: idleVehicle.carrier, type: 'VEHICLE', resourceId: idleVehicle.id,
          start: '上海嘉定工厂', end: '上海洋山港', cost: roadCost, hours: 6, reliability: 96 },
        { seq: 2, mode: 'SEA', carrier: openVessel.carrier, type: 'VESSEL', resourceId: openVessel.id,
          start: '上海洋山港', end: '武汉阳逻港', cost: seaCost, hours: 36, reliability: 94 },
        { seq: 3, mode: 'RAIL', carrier: openTrain.operator, type: 'TRAIN', resourceId: openTrain.id,
          start: '武汉吴家山站', end: '成都城厢站', cost: railCost, hours: 36, reliability: 93 },
      ];
      let hour = 0;
      for (const item of items) {
        const startAt = new Date(baseStart.getTime() + hour * 3600000);
        const endAt = new Date(startAt.getTime() + item.hours * 3600000);
        const startNode = nodeByName.get(item.start);
        const endNode = nodeByName.get(item.end);
        await insert(conn,
          `INSERT INTO dispatch_plan_item (plan_id, seq, mode, carrier_partner_id, resource_type, resource_id,
             start_node_id, end_node_id, start_at, end_at, cost, transit_hours, reliability)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [planId, item.seq, item.mode, item.carrier.id, item.type, item.resourceId,
            startNode.id, endNode.id, fmt(startAt), fmt(endAt), Math.round(item.cost * 100) / 100, item.hours, item.reliability]);
        hour += item.hours + 2;
      }
      await insert(conn,
        `INSERT INTO transfer_window (plan_id, node_id, from_seq, to_seq, arrival_at, departure_at, wait_hours, status, created_at)
         VALUES (?, ?, 2, 3, ?, ?, 10.0, 'OK', ?)`,
        [planId, nodeByName.get('武汉阳逻港').id, fmt(new Date(baseStart.getTime() + 42 * 3600000)),
          fmt(new Date(baseStart.getTime() + 52 * 3600000)), at(now, -2)]);
    }
  }
  // 已确认方案（关联已调度订单）
  if (confirmedOrder) {
    const waybill = masterByOrder.get(Number(confirmedOrder.id));
    const segs = waybill ? segmentsByWaybill.get(Number(waybill.id)) ?? [] : [];
    planSeq += 1;
    const planNo = `DP${ymd(now)}${String(planSeq).padStart(3, '0')}`;
    const totalCost = segs.reduce((sum, s) => sum + Number(s.cost_amount), 0);
    confirmedPlanId = await insert(conn,
      `INSERT INTO dispatch_plan (plan_no, order_id, waybill_id, strategy, total_cost, total_hours, reliability, score, status, summary, created_by, created_at, confirmed_at)
       VALUES (?, ?, ?, 'BALANCED', ?, 118.5, 94.0, 89.5, 'CONFIRMED', '已确认：综合平衡方案', ?, ?, ?)`,
      [planNo, confirmedOrder.id, waybill?.id ?? null, totalCost, ref.userBy.mto01.id, at(now, -20), at(now, -18)]);
    for (let i = 0; i < segs.length; i += 1) {
      const seg = segs[i];
      await insert(conn,
        `INSERT INTO dispatch_plan_item (plan_id, seq, mode, resource_type, start_node_id, end_node_id, start_at, end_at, cost, transit_hours, reliability)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 12.0, 96)`,
        [confirmedPlanId, seg.seq, seg.mode, seg.mode === 'ROAD' ? 'VEHICLE' : seg.mode === 'SEA' ? 'VESSEL' : 'TRAIN',
          nodeByName.get(seg.start_node)?.id ?? ref.nodes[0].id, nodeByName.get(seg.end_node)?.id ?? ref.nodes[0].id,
          seg.planned_start, seg.planned_end, seg.cost_amount]);
    }
  }

  // ── 预警 / 异常工单 ─────────────────────────────────────────────────────
  const activeWaybills = waybills.filter((w) => ['IN_TRANSIT', 'ARRIVED', 'SIGNED'].includes(w.status));
  const alertTypes = [
    ['DELAY', 'WARN', '海运段预计延误 6 小时', '受长江口大雾影响，船舶靠泊推迟'],
    ['DEVIATION', 'WARN', '车辆偏离预定路线', 'GPS 显示车辆偏离沪蓉高速 8 公里'],
    ['TEMP_HUMIDITY', 'CRITICAL', '冷藏箱温度超标', '箱内温度 9.6℃，超过阈值 8℃'],
    ['STAY', 'WARN', '车辆异常停留', '车辆在服务区停留超过 4 小时'],
    ['DOOR_OPEN', 'CRITICAL', '集装箱门磁开启', '运输途中检测到箱门开启'],
    ['EXCEPTION', 'CRITICAL', '货物破损异常', '港站验箱发现右侧凹损，需维修评估'],
  ];
  const alerts = [];
  for (let i = 0; i < 20; i += 1) {
    const [type, level, title, content] = alertTypes[i % alertTypes.length];
    const waybill = activeWaybills[i % activeWaybills.length] ?? waybills[0];
    const container = containers[i % containers.length];
    const status = i < 12 ? 'OPEN' : i < 16 ? 'ACK' : 'CLOSED';
    const occurred = at(now, -i * 2);
    const id = await insert(conn,
      `INSERT INTO alert (alert_no, alert_type, level, waybill_id, container_id, node_id, title, content, status,
         occurred_at, acked_by, acked_at, closed_at, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`AL${ymd(now)}${String(i + 1).padStart(4, '0')}`, type, level, waybill?.id ?? null, container.id, title, content,
        status, occurred, status !== 'OPEN' ? ref.userBy.mto01.id : null,
        status !== 'OPEN' ? at(now, -i * 2 + 1) : null, status === 'CLOSED' ? at(now, -i * 2 + 2) : null, occurred]);
    alerts.push({ id, type, level, status });
  }
  const exceptionTypes = [
    ['DELAY', '海运延误导致中转衔接紧张，协调加班船'],
    ['TEMP_HUMIDITY', '冷藏箱温度异常，已通知承运人检查制冷机组'],
    ['DOOR_OPEN', '箱门异常开启，安排港站重新施封'],
    ['DEVIATION', '车辆偏离路线，司机反馈前方事故绕行'],
    ['EXCEPTION', '箱损维修，费用待确认'],
    ['STAY', '车辆长时间停留，核实司机状态'],
  ];
  const criticalAlerts = alerts.filter((a) => a.level === 'CRITICAL');
  for (let i = 0; i < 6; i += 1) {
    const alert = criticalAlerts[i % criticalAlerts.length] ?? alerts[i];
    const [type, description] = exceptionTypes[i];
    const status = i < 3 ? 'OPEN' : i < 4 ? 'PROCESSING' : 'RESOLVED';
    const order = orders[i % orders.length];
    await insert(conn,
      `INSERT INTO exception_ticket (ticket_no, alert_id, order_id, waybill_id, type, description, assignee_user_id,
         status, resolution, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`TK${ymd(now)}${String(i + 1).padStart(4, '0')}`, alert.id, order.id, null, type, description,
        ref.userBy.mto01.id, status, status === 'RESOLVED' ? '已协调处理完成，恢复运输' : null,
        at(now, -i * 3), status === 'RESOLVED' ? at(now, -i * 3 + 5) : null]);
  }

  // ── 审计 / 通知补充 ─────────────────────────────────────────────────────
  const stage3Audits = [
    ['DISPATCH_PLAN_GENERATE', '生成调度方案', 'dispatch'], ['DISPATCH_PLAN_CONFIRM', '确认调度方案', 'dispatch'],
    ['ALERT_ACK', '预警确认', 'monitor'], ['ALERT_CLOSE', '预警关闭', 'monitor'],
    ['EXCEPTION_HANDLE', '异常工单处置', 'monitor'], ['IOT_INGEST', 'IoT 数据上报', 'iot'],
  ];
  for (let i = 0; i < 18; i += 1) {
    const [action, label, module] = stage3Audits[i % stage3Audits.length];
    await insert(conn,
      `INSERT INTO audit_log (user_id, username, role, action, action_label, module, target_type, target_id, detail, ip, created_at)
       VALUES (?, 'mto01', 'MTO', ?, ?, ?, 'STAGE3', ?, ?, '127.0.0.1', ?)`,
      [ref.userBy.mto01.id, action, label, module, String(i + 1),
        JSON.stringify({ note: `Stage3 种子审计 #${i + 1}` }), at(now, -i % 8)]);
  }
  for (let i = 0; i < 6; i += 1) {
    await insert(conn,
      `INSERT INTO notification (user_id, role, type, title, content, related_type, related_id, read_flag, created_at)
       VALUES (?, ?, ?, ?, ?, 'ALERT', ?, 0, ?)`,
      [ref.userBy.mto01.id, null, i < 3 ? 'ALERT' : 'TODO',
        ['冷藏箱温度超标待处理', '车辆偏航预警待确认', '调度方案待确认', '异常工单待处置', '班列舱位余量提醒', '监控大屏预警汇总'][i],
        'Stage 3 种子通知，可在预警中心/调度中心查看。', String(alerts[i].id), at(now, -i)]);
  }

  console.log(`[db] Stage3：车辆 ${vehicles.length}、班列 ${trains.length}、班轮 ${vessels.length}、方案 ${planIds.length + (confirmedPlanId ? 1 : 0)}、预警 ${alerts.length}、IoT 设备 ${devices.length}、读数 ${readingCount}、围栏 ${fenceNodes.length}`);
  return { vehicles, trains, vessels, planIds, confirmedPlanId, alerts, devices, readingCount };
}
