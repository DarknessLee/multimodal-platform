// dispatch 自动签发：主运单 + 分段运单 + 单证（主单/分段单/装箱单）+ ISSUE 事件与哈希链存证
import type { PoolConnection } from 'mysql2/promise';
import { txExec, txQueryOne, txQueryRows } from '../../db/pool';
import { appendNotarize } from '../../platform/notary';
import type {
  AuthUser,
  ContainerRow,
  DocumentRow,
  ESealRow,
  OrderRow,
  PartnerRow,
  SegmentMode,
  SegmentRow,
  WaybillRow,
} from '../../types';
import { formatDateTime, nowDate } from '../../utils/datetime';
import { createDocumentRecord } from '../documents/service';
import { appendWaybillEvent } from './events';

const CARRIER_PARTNER_TYPE: Record<SegmentMode, string> = {
  ROAD: 'ROAD_CARRIER',
  SEA: 'SEA_CARRIER',
  RAIL: 'RAIL_OPERATOR',
};

const SEGMENT_MODE_LABEL: Record<SegmentMode, string> = {
  ROAD: '公路',
  SEA: '海运',
  RAIL: '铁路',
};

export interface IssueWaybillResult {
  master: WaybillRow;
  segmentWaybills: WaybillRow[];
  documents: DocumentRow[];
}

async function resolveCarrierPartnerId(
  conn: PoolConnection,
  segment: SegmentRow,
): Promise<number | null> {
  const byName = await txQueryOne<PartnerRow>(conn, 'SELECT * FROM partner WHERE name = ? LIMIT 1', [
    segment.carrier_name,
  ]);
  if (byName) return Number(byName.id);
  const fallback = await txQueryOne<PartnerRow>(
    conn,
    'SELECT * FROM partner WHERE type = ? AND status = ? ORDER BY id ASC LIMIT 1',
    [CARRIER_PARTNER_TYPE[segment.mode], 'ACTIVE'],
  );
  return fallback ? Number(fallback.id) : null;
}

async function findSeal(
  conn: PoolConnection,
  ownerType: 'PLATFORM' | 'CUSTOMER' | 'CARRIER' | 'TERMINAL',
): Promise<ESealRow | null> {
  return txQueryOne<ESealRow>(
    conn,
    "SELECT * FROM e_seal WHERE status = 'ACTIVE' AND owner_type = ? ORDER BY id ASC LIMIT 1",
    [ownerType],
  );
}

/** 调度事务内自动签发一单制运单（主单/分段单/单证/事件/存证） */
export async function issueWaybillsForDispatch(
  conn: PoolConnection,
  params: {
    master: WaybillRow;
    order: OrderRow;
    segments: SegmentRow[];
    containers: ContainerRow[];
    user: AuthUser;
  },
): Promise<IssueWaybillResult> {
  const { master, order, segments, user } = params;
  const issuedAt = formatDateTime(nowDate());
  const containers = params.containers;

  await txExec(
    conn,
    "UPDATE waybill SET waybill_type = 'MASTER', issued_at = ?, updated_at = ? WHERE id = ?",
    [issuedAt, issuedAt, master.id],
  );

  // 主运单 ISSUE 事件 + 存证
  await appendWaybillEvent(conn, {
    waybillId: Number(master.id),
    eventType: 'ISSUE',
    operatorUserId: user.uid,
    description: '一单制运单签发',
    payload: { waybillNo: master.waybill_no, orderNo: order.order_no, waybillType: 'MASTER' },
    occurredAt: issuedAt,
  });

  const platformSeal = await findSeal(conn, 'PLATFORM');
  const carrierSeal = (await findSeal(conn, 'CARRIER')) ?? platformSeal;
  const containerNos = containers.map((container) => container.container_no);

  // 分段运单 + 分段单
  const segmentWaybills: WaybillRow[] = [];
  const documents: DocumentRow[] = [];
  const orderedSegments = [...segments].sort((a, b) => Number(a.seq) - Number(b.seq));
  for (const segment of orderedSegments) {
    const seq = Number(segment.seq);
    const segmentWaybillNo = `SW${master.waybill_no.slice(2)}-${String(seq).padStart(2, '0')}`;
    const carrierPartnerId = await resolveCarrierPartnerId(conn, segment);
    const inserted = await txExec(
      conn,
      `INSERT INTO waybill (waybill_no, waybill_type, parent_waybill_id, mode, carrier_partner_id, order_id,
         status, issued_at, created_at, updated_at)
       VALUES (?, 'SEGMENT', ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [
        segmentWaybillNo,
        master.id,
        segment.mode,
        carrierPartnerId,
        order.id,
        issuedAt,
        issuedAt,
        issuedAt,
      ],
    );
    const segmentWaybillId = Number(inserted.insertId);
    await appendWaybillEvent(conn, {
      waybillId: segmentWaybillId,
      eventType: 'ISSUE',
      operatorUserId: user.uid,
      description: `分段运单签发（${SEGMENT_MODE_LABEL[segment.mode]}）`,
      payload: {
        waybillNo: segmentWaybillNo,
        parent: master.waybill_no,
        mode: segment.mode,
        segmentId: Number(segment.id),
      },
      occurredAt: issuedAt,
    });

    const segmentDoc = await createDocumentRecord(conn, {
      docType: 'WAYBILL_SEGMENT',
      bizType: 'WAYBILL',
      bizId: segmentWaybillId,
      fileName: `${segmentWaybillNo}-分段运单.txt`,
      mimeType: 'text/plain',
      content: [
        '多式联运分段运单',
        `运单号：${segmentWaybillNo}`,
        `主运单：${master.waybill_no}`,
        `订单号：${order.order_no}`,
        `运输方式：${SEGMENT_MODE_LABEL[segment.mode]}（${segment.mode}）`,
        `承运人：${segment.carrier_name}`,
        `起止：${segment.start_node} → ${segment.end_node}`,
        `集装箱：${containerNos.join(', ') || '—'}`,
        '签发：中远海联运 MTO',
      ].join('\n'),
      createdBy: user.uid,
      signSealId: carrierSeal ? Number(carrierSeal.id) : null,
      signerName: segment.carrier_name,
    });
    documents.push(segmentDoc);

    const refreshed = await txQueryOne<WaybillRow>(conn, 'SELECT * FROM waybill WHERE id = ?', [
      segmentWaybillId,
    ]);
    if (refreshed) segmentWaybills.push(refreshed);
  }

  // 主运单单证 + 装箱单
  const masterDoc = await createDocumentRecord(conn, {
    docType: 'WAYBILL_MASTER',
    bizType: 'WAYBILL',
    bizId: Number(master.id),
    fileName: `${master.waybill_no}-主运单.txt`,
    mimeType: 'text/plain',
    content: [
      '多式联运一单制运单',
      `主运单号：${master.waybill_no}`,
      `订单号：${order.order_no}`,
      `货物：${order.cargo_name} / ${Number(order.cargo_weight)} t`,
      `箱型箱量：${order.container_type} × ${Number(order.container_count)}`,
      `箱号：${containerNos.join(', ') || '—'}`,
      `分段：${orderedSegments.map((segment) => SEGMENT_MODE_LABEL[segment.mode]).join(' / ')}`,
      `起止：${order.origin} → ${order.destination}`,
      '签发：中远海联运 MTO',
    ].join('\n'),
    createdBy: user.uid,
    signSealId: platformSeal ? Number(platformSeal.id) : null,
    signerName: '中远海联运 MTO',
  });
  documents.push(masterDoc);

  const packingList = await createDocumentRecord(conn, {
    docType: 'PACKING_LIST',
    bizType: 'WAYBILL',
    bizId: Number(master.id),
    fileName: `${master.waybill_no}-装箱单.txt`,
    mimeType: 'text/plain',
    content: [
      '集装箱装箱单',
      `运单号：${master.waybill_no}`,
      `订单号：${order.order_no}`,
      `箱号：${containerNos.join(', ') || '—'}`,
      `货物：${order.cargo_name}`,
      `重量：${Number(order.cargo_weight)} t`,
      `箱型箱量：${order.container_type} × ${Number(order.container_count)}`,
    ].join('\n'),
    createdBy: user.uid,
  });
  documents.push(packingList);

  await txExec(conn, 'UPDATE waybill SET document_no = ?, updated_at = ? WHERE id = ?', [
    masterDoc.doc_no,
    issuedAt,
    master.id,
  ]);

  // 运单-箱关联 + 当前运单/箱主
  for (const container of containers) {
    await txExec(
      conn,
      'INSERT IGNORE INTO waybill_container (waybill_id, container_id, seal_no, loaded_at) VALUES (?, ?, ?, NULL)',
      [master.id, container.id, container.seal_no],
    );
    await txExec(
      conn,
      `UPDATE container SET current_waybill_id = COALESCE(current_waybill_id, ?),
         owner_partner_id = COALESCE(owner_partner_id, ?), updated_at = ?
       WHERE id = ?`,
      [
        master.id,
        segmentWaybills[0]?.carrier_partner_id ?? null,
        issuedAt,
        container.id,
      ],
    );
  }

  const refreshedMaster = await txQueryOne<WaybillRow>(conn, 'SELECT * FROM waybill WHERE id = ?', [
    master.id,
  ]);
  return {
    master: refreshedMaster ?? master,
    segmentWaybills,
    documents,
  };
}
