// DB snake_case -> API camelCase 的统一映射
import {
  BILL_STATUS_LABELS,
  CONTAINER_STATUS_LABELS,
  MODE_LABELS,
  ORDER_STATUS_LABELS,
  WAYBILL_STATUS_LABELS,
  segmentStatusLabel,
} from '../config/labels';
import type {
  BillHeaderDto,
  BillRow,
  ContainerDto,
  ContainerRow,
  CurrentSegmentDto,
  OrderListItemDto,
  OrderListRow,
  SegmentDto,
  SegmentRow,
  TrackPointDto,
  TrackPointRow,
  WaybillDto,
  WaybillRow,
} from '../types';

function toNumber(value: unknown): number {
  return Number(value);
}

function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function dtoSegment(row: SegmentRow): SegmentDto {
  return {
    id: toNumber(row.id),
    seq: toNumber(row.seq),
    mode: row.mode,
    modeLabel: MODE_LABELS[row.mode],
    carrierCode: row.carrier_code,
    carrierName: row.carrier_name,
    carrierUserId: toNullableNumber(row.carrier_user_id),
    startNode: row.start_node,
    endNode: row.end_node,
    plannedStart: row.planned_start,
    plannedEnd: row.planned_end,
    actualStart: row.actual_start,
    actualEnd: row.actual_end,
    acceptedAt: row.accepted_at,
    status: row.status,
    statusLabel: segmentStatusLabel(row.mode, row.status),
    costAmount: toNumber(row.cost_amount),
  };
}

export function dtoCurrentSegment(row: SegmentRow): CurrentSegmentDto {
  return {
    seq: toNumber(row.seq),
    mode: row.mode,
    modeLabel: MODE_LABELS[row.mode],
    status: row.status,
    statusLabel: segmentStatusLabel(row.mode, row.status),
    startNode: row.start_node,
    endNode: row.end_node,
  };
}

export function dtoContainer(row: ContainerRow): ContainerDto {
  return {
    id: toNumber(row.id),
    containerNo: row.container_no,
    type: row.type,
    sealNo: row.seal_no,
    status: row.status,
    statusLabel: CONTAINER_STATUS_LABELS[row.status],
    conditionText: row.condition_text,
  };
}

export function dtoTrackPoint(row: TrackPointRow): TrackPointDto {
  return {
    id: toNumber(row.id),
    seq: toNumber(row.seq),
    segmentId: toNullableNumber(row.segment_id),
    nodeName: row.node_name,
    lng: toNumber(row.lng),
    lat: toNumber(row.lat),
    occurredAt: row.occurred_at,
    source: row.source,
    description: row.description,
  };
}

export function dtoWaybill(row: WaybillRow): WaybillDto {
  return {
    id: toNumber(row.id),
    waybillNo: row.waybill_no,
    status: row.status,
    statusLabel: WAYBILL_STATUS_LABELS[row.status],
    signerName: row.signer_name,
    signedAt: row.signed_at,
    createdAt: row.created_at,
  };
}

export function dtoBillHeader(row: BillRow): BillHeaderDto {
  return {
    id: toNumber(row.id),
    billNo: row.bill_no,
    totalAmount: toNumber(row.total_amount),
    status: row.status,
    statusLabel: BILL_STATUS_LABELS[row.status],
    issuedAt: row.issued_at,
  };
}

export function dtoOrderListItem(row: OrderListRow, currentSegment: CurrentSegmentDto | null): OrderListItemDto {
  return {
    id: toNumber(row.id),
    orderNo: row.order_no,
    status: row.status,
    statusLabel: ORDER_STATUS_LABELS[row.status],
    cargoName: row.cargo_name,
    cargoWeight: toNumber(row.cargo_weight),
    containerType: row.container_type,
    containerCount: toNumber(row.container_count),
    origin: row.origin,
    destination: row.destination,
    requiredPickupDate: row.required_pickup_date,
    createdAt: row.created_at,
    shipperName: row.shipper_name,
    waybillId: toNullableNumber(row.waybill_id),
    waybillNo: row.waybill_no ?? null,
    waybillStatus: row.waybill_status ?? null,
    currentSegment,
    billId: toNullableNumber(row.bill_id),
    billNo: row.bill_no ?? null,
  };
}
