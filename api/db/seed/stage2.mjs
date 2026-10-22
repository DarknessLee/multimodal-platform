// Stage 2 业务种子：一单制运单（主单/分段单）、单证、哈希链存证、箱动态、堆存、95306/港口 EDI 报文
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docNo } from './lib.mjs';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const storageDir = resolve(apiRoot, 'storage/documents');
const SALT = 'MULTIMODAL_PLATFORM';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const pad = (n, width = 2) => String(n).padStart(width, '0');

function dateOf(value) {
  return new Date(String(value).replace(' ', 'T') + '+08:00');
}

function at(base, hours, minutes = 0) {
  const date = new Date(base.getTime() + hours * 3600000 + minutes * 60000);
  const y = date.getFullYear();
  return `${y}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function ymd(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

async function insert(conn, sql, params) {
  const [result] = await conn.execute(sql, params);
  return result.insertId;
}

const WAYBILL_STATUS_LABEL = {
  PENDING: '待发运', IN_TRANSIT: '运输中', ARRIVED: '已到达', SIGNED: '已签收',
};
const SEGMENT_EVENTS = {
  ROAD: ['PICKUP', 'DEPART', 'ARRIVE'],
  SEA: ['GATE_IN', 'LOAD', 'ARRIVE'],
  RAIL: ['GATE_IN', 'LOAD', 'ARRIVE'],
};
const EVENT_LABEL = {
  ISSUE: '运单签发', RELEASE: '放箱', PICKUP: '提箱', GATE_IN: '进场', LOAD: '装车/装船',
  DEPART: '发运', ARRIVE: '到达', DISCHARGE: '卸箱/卸船', HANDOVER: '交接', POD: '回单', SIGN: '签收', NOTARIZE: '存证',
};

export async function seedStage2(conn, ref) {
  mkdirSync(storageDir, { recursive: true });

  const [waybills] = await conn.query('SELECT * FROM waybill ORDER BY id');
  const [segments] = await conn.query('SELECT * FROM waybill_segment ORDER BY waybill_id, seq');
  const [orders] = await conn.query('SELECT * FROM orders');
  const [containers] = await conn.query('SELECT * FROM container ORDER BY id');
  const orderById = new Map(orders.map((row) => [Number(row.id), row]));
  const segmentsByWaybill = new Map();
  for (const segment of segments) {
    const key = Number(segment.waybill_id);
    if (!segmentsByWaybill.has(key)) segmentsByWaybill.set(key, []);
    segmentsByWaybill.get(key).push(segment);
  }
  const containersByOrder = new Map();
  for (const container of containers) {
    const key = Number(container.order_id);
    if (!containersByOrder.has(key)) containersByOrder.set(key, []);
    containersByOrder.get(key).push(container);
  }
  const nodeByName = new Map(ref.nodes.map((node) => [node.name, node]));
  const partnerByName = new Map(ref.partners.map((partner) => [partner.shortName, partner]));
  const carrierByMode = {
    ROAD: partnerByName.get('安捷卡车队') ?? ref.partners.find((p) => p.type === 'ROAD_CARRIER'),
    SEA: partnerByName.get('中远海运集运') ?? ref.partners.find((p) => p.type === 'SEA_CARRIER'),
    RAIL: partnerByName.get('中铁集装箱') ?? ref.partners.find((p) => p.type === 'RAIL_OPERATOR'),
  };

  // ── Mock 电子印章 ────────────────────────────────────────────────────────
  const seals = [
    ['SEAL-PLATFORM-001', '中远海联运平台电子签章', 'PLATFORM', null, 'CA-2026-0001'],
    ['SEAL-CUSTOMER-001', '上海远洋新能源合同专用章', 'CUSTOMER', ref.customers[0].id, 'CA-2026-0002'],
    ['SEAL-CARRIER-001', '安捷卡车队运输专用章', 'CARRIER', partnerByName.get('安捷卡车队')?.id ?? null, 'CA-2026-0003'],
  ];
  const sealIds = [];
  for (const [no, name, ownerType, ownerId, caSerial] of seals) {
    const id = await insert(conn,
      'INSERT INTO e_seal (seal_no, seal_name, owner_type, owner_id, ca_serial, issued_at) VALUES (?, ?, ?, ?, ?, ?)',
      [no, name, ownerType, ownerId, caSerial, at(new Date(), -30)]);
    sealIds.push({ id, name });
  }

  // ── 哈希链存证（全局链） ─────────────────────────────────────────────────
  let prevHash = '0'.repeat(64);
  let blockHeight = 0;
  async function notarize(bizType, bizId, eventType, payload) {
    const payloadHash = sha256(JSON.stringify(payload));
    blockHeight += 1;
    const hash = sha256(`${payloadHash}|${prevHash}|${blockHeight}`);
    const txId = `TX${String(blockHeight).padStart(8, '0')}${sha256(`${bizType}:${bizId}:${eventType}`).slice(0, 8).toUpperCase()}`;
    await insert(conn,
      `INSERT INTO notarize_record (biz_type, biz_id, event_type, payload_hash, prev_hash, hash, block_height, tx_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bizType, bizId, eventType, payloadHash, prevHash, hash, blockHeight, txId, at(new Date(), -blockHeight % 48)]);
    const result = { txId, hash, prevHash, blockHeight };
    prevHash = hash;
    return result;
  }

  async function writeDocument({ docType, bizType, bizId, fileName, content, sealId, signerName }) {
    const contentHash = sha256(content);
    const path = `documents/${fileName}`;
    writeFileSync(resolve(storageDir, fileName), content, 'utf8');
    const notarized = await notarize('DOCUMENT', bizId, `${docType}_ISSUE`, { docType, fileName, contentHash });
    const id = await insert(conn,
      `INSERT INTO document (doc_no, doc_type, biz_type, biz_id, file_name, mime_type, file_path, file_size,
         content_hash, sign_status, signed_at, sign_hash, seal_id, signer_name, notarize_tx_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'text/plain', ?, ?, ?, 'UNSIGNED', NULL, NULL, NULL, NULL, ?, ?)`,
      [`DOC${ymd(new Date())}${String(blockHeight).padStart(5, '0')}`, docType, bizType, bizId,
        fileName, path, Buffer.byteLength(content, 'utf8'), contentHash, notarized.txId, at(new Date(), -24)]);
    if (sealId) {
      const signedAt = at(new Date(), -20);
      const signHash = sha256(`${id}:${contentHash}:${signerName}:${signedAt}:${SALT}`);
      await conn.execute(
        'UPDATE document SET sign_status = \'SIGNED\', signed_at = ?, sign_hash = ?, seal_id = ?, signer_name = ? WHERE id = ?',
        [signedAt, signHash, sealId, signerName, id]);
      await notarize('DOCUMENT', id, `${docType}_SIGN`, { id, contentHash, signerName });
    }
    return { id, contentHash };
  }

  // ── 主运单 / 分段运单 / 事件链 ───────────────────────────────────────────
  const masterInfo = [];
  let segmentWaybillSeq = 0;
  for (const waybill of waybills) {
    const waybillId = Number(waybill.id);
    const order = orderById.get(Number(waybill.order_id));
    const base = dateOf(waybill.created_at);
    const issuedAt = at(base, 1);
    const segs = segmentsByWaybill.get(waybillId) ?? [];
    const issue = await notarize('WAYBILL', waybillId, 'ISSUE', { waybillNo: waybill.waybill_no, orderNo: order?.order_no });
    await conn.execute(
      `UPDATE waybill SET waybill_type = 'MASTER', issued_at = ?, notarize_tx_id = ? WHERE id = ?`,
      [issuedAt, issue.txId, waybillId]);
    await insert(conn,
      `INSERT INTO waybill_event (waybill_id, segment_id, event_type, occurred_at, node_id, operator_user_id,
         description, payload, prev_hash, hash, tx_id, block_height, created_at)
       VALUES (?, NULL, 'ISSUE', ?, ?, ?, '一单制运单签发', ?, ?, ?, ?, ?, ?)`,
      [waybillId, issuedAt, null, ref.userBy.mto01.id, JSON.stringify({ waybillNo: waybill.waybill_no }),
        issue.prevHash, issue.hash, issue.txId, issue.blockHeight, issuedAt]);

    // 分段运单
    let seq = 0;
    for (const segment of segs) {
      seq += 1;
      segmentWaybillSeq += 1;
      const mode = segment.mode;
      const segNo = `SW${waybill.waybill_no.slice(2)}-${pad(seq)}`;
      const segStatus = segment.status === 'COMPLETED' ? (waybill.status === 'SIGNED' ? 'SIGNED' : 'ARRIVED')
        : segment.status === 'IN_TRANSIT' ? 'IN_TRANSIT' : 'PENDING';
      const segWaybillId = await insert(conn,
        `INSERT INTO waybill (waybill_no, waybill_type, parent_waybill_id, mode, carrier_partner_id, order_id,
           status, issued_at, created_at, updated_at)
         VALUES (?, 'SEGMENT', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [segNo, waybillId, mode, carrierByMode[mode]?.id ?? null, waybill.order_id,
          segStatus, at(base, 2 + seq), waybill.created_at, waybill.created_at]);
      const segIssue = await notarize('WAYBILL', segWaybillId, 'ISSUE', { waybillNo: segNo, parent: waybill.waybill_no, mode });
      await conn.execute('UPDATE waybill SET notarize_tx_id = ? WHERE id = ?', [segIssue.txId, segWaybillId]);

      // 事件链（按段状态）
      const events = SEGMENT_EVENTS[mode] ?? [];
      const limit = segment.status === 'COMPLETED' ? events.length : segment.status === 'IN_TRANSIT' ? 1 : 0;
      let eventHour = 2 + seq * 4;
      for (let index = 0; index < limit; index += 1) {
        const eventType = events[index];
        eventHour += 2;
        const occurredAt = at(base, eventHour);
        const nodeName = index === 0 ? segment.start_node : index === events.length - 1 ? segment.end_node : segment.start_node;
        const node = nodeByName.get(nodeName);
        const payload = { event: eventType, mode, node: nodeName, segmentId: segment.id };
        const notarized = await notarize('WAYBILL', waybillId, eventType, payload);
        await insert(conn,
          `INSERT INTO waybill_event (waybill_id, segment_id, event_type, occurred_at, node_id, operator_user_id,
             description, payload, prev_hash, hash, tx_id, block_height, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [waybillId, segment.id, eventType, occurredAt, node?.id ?? null,
            mode === 'ROAD' ? ref.userBy.carrier01.id : ref.userBy.terminal01.id,
            `${EVENT_LABEL[eventType]}（${mode}）`, JSON.stringify(payload),
            notarized.prevHash, notarized.hash, notarized.txId, notarized.blockHeight, occurredAt]);
      }

      // 分段运单单证
      await writeDocument({
        docType: 'WAYBILL_SEGMENT', bizType: 'WAYBILL', bizId: segWaybillId, fileName: `${segNo}-分段运单.txt`,
        content: `多式联运分段运单\n运单号：${segNo}\n主运单：${waybill.waybill_no}\n运输方式：${mode}\n承运人：${segment.carrier_name}\n起止：${segment.start_node} → ${segment.end_node}\n集装箱：${(containersByOrder.get(Number(waybill.order_id)) ?? []).map((c) => c.container_no).join(', ')}\n`,
        sealId: sealIds[2].id, signerName: segment.carrier_name,
      });
    }

    // 主运单单证 + 装箱单
    const containerNos = (containersByOrder.get(Number(waybill.order_id)) ?? []).map((c) => c.container_no);
    const masterDoc = await writeDocument({
      docType: 'WAYBILL_MASTER', bizType: 'WAYBILL', bizId: waybillId, fileName: `${waybill.waybill_no}-主运单.txt`,
      content: `多式联运一单制运单\n主运单号：${waybill.waybill_no}\n订单号：${order?.order_no}\n货主：${ref.customers[0].name}\n货物：${order?.cargo_name}\n箱号：${containerNos.join(', ')}\n分段：${segs.map((s) => s.mode).join(' / ')}\n签发：中远海联运 MTO\n`,
      sealId: sealIds[0].id, signerName: '中远海联运 MTO',
    });
    await writeDocument({
      docType: 'PACKING_LIST', bizType: 'WAYBILL', bizId: waybillId, fileName: `${waybill.waybill_no}-装箱单.txt`,
      content: `集装箱装箱单\n运单号：${waybill.waybill_no}\n箱号：${containerNos.join(', ')}\n货物：${order?.cargo_name}\n重量：${order?.cargo_weight} t\n`,
    });
    await conn.execute('UPDATE waybill SET document_no = ? WHERE id = ?',
      [`DOC${ymd(new Date())}${String(masterDoc.id).padStart(5, '0')}`, waybillId]);

    // 签收事件 + 回单（仅已签收/已出账）
    if (waybill.status === 'SIGNED') {
      const signedAt = waybill.signed_at ?? at(base, 30);
      const signTx = await notarize('WAYBILL', waybillId, 'SIGN', { signer: waybill.signer_name, signedAt });
      await insert(conn,
        `INSERT INTO waybill_event (waybill_id, segment_id, event_type, occurred_at, node_id, operator_user_id,
           description, payload, prev_hash, hash, tx_id, block_height, created_at)
         VALUES (?, NULL, 'SIGN', ?, NULL, ?, '货主签收', ?, ?, ?, ?, ?, ?)`,
        [waybillId, signedAt, ref.userBy.shipper01.id, JSON.stringify({ signer: waybill.signer_name }),
          signTx.prevHash, signTx.hash, signTx.txId, signTx.blockHeight, signedAt]);
      const podContent = `货物签收回单\n运单号：${waybill.waybill_no}\n订单号：${order?.order_no}\n箱号：${containerNos.join(', ')}\n签收人：${waybill.signer_name}\n签收日期：${String(signedAt).slice(0, 10)}\n数量：${containerNos.length} 箱\n备注：箱况良好，无破损。\n`;
      const pod = await writeDocument({
        docType: 'POD', bizType: 'WAYBILL', bizId: waybillId, fileName: `${waybill.waybill_no}-签收回单.txt`,
        content: podContent, sealId: sealIds[1].id, signerName: waybill.signer_name,
      });
      await conn.execute(
        `UPDATE document SET ocr_status = 'SUCCESS', ocr_result = ? WHERE id = ?`,
        [JSON.stringify({ containerNo: containerNos[0] ?? '', signer: waybill.signer_name, date: String(signedAt).slice(0, 10), quantity: containerNos.length, confidence: 0.97 }), pod.id]);
    }

    masterInfo.push({ waybill, order, base, containerNos });
  }

  // ── 箱关联与动态 ────────────────────────────────────────────────────────
  const nodeId = (name) => nodeByName.get(name)?.id ?? null;
  let movementTotal = 0;
  let repairCount = 0;
  for (const info of masterInfo) {
    const { waybill, base } = info;
    const waybillId = Number(waybill.id);
    const master = await conn.query('SELECT id FROM waybill WHERE id = ?', [waybillId]);
    const containersOfOrder = containersByOrder.get(Number(waybill.order_id)) ?? [];
    for (const container of containersOfOrder) {
      const containerId = Number(container.id);
      await conn.execute(
        'INSERT IGNORE INTO waybill_container (waybill_id, container_id, seal_no, loaded_at) VALUES (?, ?, ?, ?)',
        [waybillId, containerId, container.seal_no, at(base, 4)]);
      const sequence = [
        ['RELEASE', '上海洋山港', 2, '放箱'],
        ['PICKUP', '上海嘉定工厂', 3, '提箱'],
        ['GATE_IN', '上海洋山港', 4, '进场'],
        ['LOAD', '上海洋山港', 5, '装船'],
      ];
      if (waybill.status === 'IN_TRANSIT' || waybill.status === 'ARRIVED' || waybill.status === 'SIGNED') sequence.push(['DEPART', '上海洋山港', 6, '发运']);
      if (waybill.status === 'ARRIVED' || waybill.status === 'SIGNED') sequence.push(['ARRIVE', '武汉阳逻港', 18, '到达']);
      if (waybill.status === 'SIGNED') sequence.push(['DISCHARGE', '武汉阳逻港', 20, '卸船'], ['GATE_OUT', '武汉阳逻港', 21, '出场']);
      for (const [movementType, nodeName, hour, label] of sequence) {
        await insert(conn,
          `INSERT INTO container_movement (container_id, waybill_id, movement_type, node_id, occurred_at,
             operator_user_id, condition_text, remark, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [containerId, waybillId, movementType, nodeId(nodeName), at(base, hour),
            movementType === 'PICKUP' || movementType === 'GATE_OUT' ? ref.userBy.carrier01.id : ref.userBy.terminal01.id,
            '箱况良好，无破损', label, at(base, hour)]);
        movementTotal += 1;
      }
      const last = sequence[sequence.length - 1];
      const currentNode = nodeId(last[1]);
      let status = 'IN_TRANSIT';
      if (waybill.status === 'SIGNED') status = 'DELIVERED';
      else if (waybill.status === 'ARRIVED') status = 'ARRIVED';
      else if (waybill.status === 'IN_TRANSIT') status = 'IN_TRANSIT';
      else status = 'RELEASED';
      await conn.execute(
        `UPDATE container SET current_node_id = ?, current_waybill_id = ?, owner_partner_id = ?, status = ?,
           condition_text = '箱况良好，无破损' WHERE id = ?`,
        [currentNode, waybillId, carrierByMode.ROAD?.id ?? null, status, containerId]);
      if (waybill.status === 'SIGNED' && containerId % 3 === 0) {
        await insert(conn,
          `INSERT INTO container_movement (container_id, waybill_id, movement_type, node_id, occurred_at,
             operator_user_id, condition_text, remark, created_at)
           VALUES (?, ?, 'RETURN', ?, ?, ?, '箱况良好', '空箱还箱', ?)`,
          [containerId, waybillId, nodeId('洋山堆场'), at(base, 30), ref.userBy.carrier01.id, at(base, 30)]);
        await conn.execute('UPDATE container SET status = ?, current_node_id = ? WHERE id = ?',
          ['RETURNED', nodeId('洋山堆场'), containerId]);
        await insert(conn,
          `INSERT INTO depot_storage (container_id, node_id, waybill_id, start_at, end_at, storage_days, fee_amount, status)
           VALUES (?, ?, ?, ?, ?, 2, 160.00, 'RELEASED')`,
          [containerId, nodeId('洋山堆场'), waybillId, at(base, 30), at(base, 54)]);
        movementTotal += 1;
      }
      if (waybill.status === 'SIGNED' && containerId % 5 === 0 && repairCount < 3) {
        repairCount += 1;
        await insert(conn,
          `INSERT INTO container_movement (container_id, waybill_id, movement_type, node_id, occurred_at,
             operator_user_id, condition_text, remark, created_at)
           VALUES (?, ?, 'REPAIR', ?, ?, ?, '右侧凹损', '进场验箱发现箱损，安排维修', ?)`,
          [containerId, waybillId, nodeId('城厢堆场'), at(base, 55), ref.userBy.terminal01.id, at(base, 55)]);
        await conn.execute('UPDATE container SET status = ?, current_node_id = ?, repair_fee = 280.00 WHERE id = ?',
          ['IN_REPAIR', nodeId('城厢堆场'), containerId]);
        movementTotal += 1;
      }
    }
  }

  // ── 95306 / 港口 EDI Mock 报文 ──────────────────────────────────────────
  let msgSeq = 100;
  async function pushMessage({ systemCode, systemName, direction, msgType, standard, relatedType, relatedId, payload, status = 'SUCCESS', createdAt, errorMessage = null }) {
    msgSeq += 1;
    const msgNo = `MSG${ymd(new Date())}${String(msgSeq).padStart(5, '0')}`;
    await insert(conn,
      `INSERT INTO integration_message (msg_no, system_code, system_name, direction, msg_type, standard,
         related_type, related_id, payload, status, error_message, created_at, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [msgNo, systemCode, systemName, direction, msgType, standard, relatedType, String(relatedId),
        JSON.stringify(payload), status, errorMessage, createdAt, createdAt]);
    return msgNo;
  }

  const ediTargets = masterInfo.slice(0, 6);
  for (const info of ediTargets) {
    const { waybill } = info;
    const created = at(info.base, 6);
    await pushMessage({
      systemCode: 'RAIL_95306', systemName: '铁路 95306', direction: 'OUT', msgType: 'RAIL_DEMAND_APPLY',
      standard: 'JT/T 1351-2020', relatedType: 'WAYBILL', relatedId: waybill.id, createdAt: created,
      payload: { messageNo: `RD${waybill.id}`, shipper: '中远海联运 MTO', fromStation: '21001', toStation: '47085',
        containerType: '40HQ', containerCount: info.containerNos.length || 1, cargo: info.order?.cargo_name,
        requiredDate: String(created).slice(0, 10), wagonType: 'X70' },
    });
    await pushMessage({
      systemCode: 'RAIL_95306', systemName: '铁路 95306', direction: 'IN', msgType: 'RAIL_DEMAND_ACCEPT',
      standard: 'JT/T 1351-2020', relatedType: 'WAYBILL', relatedId: waybill.id, createdAt: at(info.base, 7),
      payload: { acceptNo: `95306-${waybill.id}`, matchedCars: 2, acceptDate: String(created).slice(0, 10), status: '已受理' },
    });
    await pushMessage({
      systemCode: 'PORT_EDI', systemName: '港口 EDI', direction: 'OUT', msgType: 'PORT_CODECO',
      standard: 'UN/EDIFACT', relatedType: 'WAYBILL', relatedId: waybill.id, createdAt: at(info.base, 4),
      payload: { messageNo: `CODECO-${waybill.id}`, portCode: 'CNSHA', moveType: 'GATE_IN', containerNos: info.containerNos, eventTime: at(info.base, 4) },
    });
    await pushMessage({
      systemCode: 'PORT_EDI', systemName: '港口 EDI', direction: 'IN', msgType: 'PORT_COARRI',
      standard: 'UN/EDIFACT', relatedType: 'WAYBILL', relatedId: waybill.id, createdAt: at(info.base, 5),
      payload: { messageNo: `COARRI-${waybill.id}`, portCode: 'CNSHA', moveType: 'LOAD', vessel: 'COSCO SHIPPING', voyage: '2026E', eventTime: at(info.base, 5) },
    });
  }
  await pushMessage({
    systemCode: 'RAIL_95306', systemName: '铁路 95306', direction: 'OUT', msgType: 'RAIL_DEMAND_APPLY',
    standard: 'JT/T 1351-2020', relatedType: 'WAYBILL', relatedId: masterInfo[0]?.waybill.id ?? 1,
    status: 'FAILED', errorMessage: '95306 接口超时（Mock）', createdAt: at(new Date(), -1),
    payload: { messageNo: 'RD-FAIL-STAGE2', error: 'timeout' },
  });

  // ── 审计 / 通知补充 ─────────────────────────────────────────────────────
  const stage2Audits = [
    ['DOCUMENT_UPLOAD', '上传单证', 'document'], ['DOCUMENT_SIGN', '单证签章', 'document'],
    ['CONTAINER_RELEASE', '放箱', 'container'], ['CONTAINER_RETURN', '还箱', 'container'],
    ['RAIL_APPLY', '铁路需求车提报', 'rail'], ['SEA_BOOK', '水路订舱', 'sea'],
  ];
  for (let i = 0; i < 18; i += 1) {
    const [action, label, module] = stage2Audits[i % stage2Audits.length];
    await insert(conn,
      `INSERT INTO audit_log (user_id, username, role, action, action_label, module, target_type, target_id, detail, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '127.0.0.1', ?)`,
      [ref.userBy.mto01.id, 'mto01', 'MTO', action, label, module, 'STAGE2',
        String(i + 1), JSON.stringify({ note: `Stage2 种子审计 #${i + 1}` }), at(new Date(), -i % 8)]);
  }
  for (let i = 0; i < 6; i += 1) {
    await insert(conn,
      `INSERT INTO notification (user_id, role, type, title, content, related_type, related_id, read_flag, created_at)
       VALUES (?, ?, 'INFO', ?, ?, 'WAYBILL', ?, 0, ?)`,
      [i % 2 === 0 ? ref.userBy.mto01.id : null, i % 2 === 0 ? null : 'RAIL_CARRIER',
        ['一单制运单已签发', '回单已上传待签章', '箱已放箱待提箱', '铁路需求车已受理', '港口进场报文已发送', '存证链已更新'][i],
        'Stage 2 种子通知，可在运单中心查看。', String(masterInfo[i % masterInfo.length]?.waybill.id ?? 1), at(new Date(), -i)]);
  }

  console.log(`[db] Stage2：主运单 ${masterInfo.length}、分段运单 ${segmentWaybillSeq}、单证 ${masterInfo.length * 5}、事件/存证 ${blockHeight}、箱动态 ${movementTotal}、EDI 报文 ${msgSeq - 100}`);
}
