// 全局类型定义：角色 / 状态机 / 数据库行 / DTO
// 契约依据：docs/02-接口契约.md（camelCase 输出由 services/mappers.ts 统一映射）

export type Role = 'SHIPPER' | 'MTO' | 'CARRIER' | 'TERMINAL' | 'SETTLEMENT';

export type OrderStatus = 'CREATED' | 'DISPATCHED' | 'IN_TRANSIT' | 'ARRIVED' | 'SIGNED' | 'BILLED';
export type WaybillStatus = 'PENDING' | 'IN_TRANSIT' | 'ARRIVED' | 'SIGNED';
export type SegmentStatus = 'PENDING' | 'ACCEPTED' | 'IN_TRANSIT' | 'ARRIVED' | 'COMPLETED';
export type SegmentMode = 'ROAD' | 'SEA' | 'RAIL';
export type SegmentAction = 'ACCEPT' | 'DEPART' | 'ARRIVE' | 'GATE_IN';
export type ContainerStatus = 'EMPTY' | 'GATE_IN' | 'LOADED' | 'IN_TRANSIT' | 'ARRIVED' | 'DELIVERED';
export type BillStatus = 'ISSUED' | 'PAID';
export type TrackSource = 'MOCK_GPS' | 'MOCK_EDI' | 'CARRIER_REPORT' | 'TERMINAL_REPORT' | 'MTO';

/** JWT 解出的登录用户 */
export interface AuthUser {
  uid: number;
  username: string;
  role: Role;
  name: string;
}

// ---------------------------------------------------------------------------
// 数据库行（mysql2 已开启 dateStrings + decimalNumbers）
// ---------------------------------------------------------------------------

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  role: Role;
  created_at: string;
}

export interface OrderRow {
  id: number;
  order_no: string;
  shipper_id: number;
  status: OrderStatus;
  cargo_name: string;
  cargo_weight: number;
  container_type: string;
  container_count: number;
  origin: string;
  destination: string;
  required_pickup_date: string;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

/** 订单 + 货主显示名（GET /orders/:id 使用） */
export interface OrderJoinedRow extends OrderRow {
  shipper_name: string;
}

/** GET /orders 列表行（LEFT JOIN waybill / bill） */
export interface OrderListRow {
  id: number;
  order_no: string;
  status: OrderStatus;
  cargo_name: string;
  cargo_weight: number;
  container_type: string;
  container_count: number;
  origin: string;
  destination: string;
  required_pickup_date: string;
  created_at: string;
  shipper_name: string;
  waybill_id: number | null;
  waybill_no: string | null;
  waybill_status: WaybillStatus | null;
  bill_id: number | null;
  bill_no: string | null;
}

export interface ContainerRow {
  id: number;
  order_id: number;
  container_no: string;
  type: string;
  seal_no: string | null;
  status: ContainerStatus;
  condition_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface WaybillRow {
  id: number;
  waybill_no: string;
  order_id: number;
  status: WaybillStatus;
  signer_name: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SegmentRow {
  id: number;
  waybill_id: number;
  seq: number;
  mode: SegmentMode;
  carrier_code: string;
  carrier_name: string;
  carrier_user_id: number | null;
  start_node: string;
  end_node: string;
  planned_start: string;
  planned_end: string;
  actual_start: string | null;
  actual_end: string | null;
  accepted_at: string | null;
  status: SegmentStatus;
  cost_amount: number;
  created_at: string;
  updated_at: string;
}

export interface TrackPointRow {
  id: number;
  waybill_id: number;
  segment_id: number | null;
  seq: number;
  node_name: string;
  lng: number;
  lat: number;
  occurred_at: string;
  source: TrackSource;
  description: string | null;
  created_at: string;
}

export interface BillRow {
  id: number;
  bill_no: string;
  order_id: number;
  waybill_id: number;
  total_amount: number;
  status: BillStatus;
  segment_breakdown: unknown;
  issued_at: string;
  paid_at: string | null;
}

/** 账单明细中的一段（segment_breakdown JSON 元素） */
export interface BillBreakdownItem {
  segmentId: number;
  seq: number;
  mode: SegmentMode;
  modeLabel: string;
  carrierName: string;
  startNode: string;
  endNode: string;
  amount: number;
}

// ---------------------------------------------------------------------------
// API DTO（camelCase）
// ---------------------------------------------------------------------------

export interface SegmentDto {
  id: number;
  seq: number;
  mode: SegmentMode;
  modeLabel: string;
  carrierCode: string;
  carrierName: string;
  carrierUserId: number | null;
  startNode: string;
  endNode: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  acceptedAt: string | null;
  status: SegmentStatus;
  statusLabel: string;
  costAmount: number;
}

export interface CurrentSegmentDto {
  seq: number;
  mode: SegmentMode;
  modeLabel: string;
  status: SegmentStatus;
  statusLabel: string;
  startNode: string;
  endNode: string;
}

export interface ContainerDto {
  id: number;
  containerNo: string;
  type: string;
  sealNo: string | null;
  status: ContainerStatus;
  statusLabel: string;
  conditionText: string | null;
}

export interface TrackPointDto {
  id: number;
  seq: number;
  segmentId: number | null;
  nodeName: string;
  lng: number;
  lat: number;
  occurredAt: string;
  source: TrackSource;
  description: string | null;
}

export interface WaybillDto {
  id: number;
  waybillNo: string;
  status: WaybillStatus;
  statusLabel: string;
  signerName: string | null;
  signedAt: string | null;
  createdAt: string;
}

export interface BillHeaderDto {
  id: number;
  billNo: string;
  totalAmount: number;
  status: BillStatus;
  statusLabel: string;
  issuedAt: string;
}

export interface OrderListItemDto {
  id: number;
  orderNo: string;
  status: OrderStatus;
  statusLabel: string;
  cargoName: string;
  cargoWeight: number;
  containerType: string;
  containerCount: number;
  origin: string;
  destination: string;
  requiredPickupDate: string;
  createdAt: string;
  shipperName: string;
  waybillId: number | null;
  waybillNo: string | null;
  waybillStatus: WaybillStatus | null;
  currentSegment: CurrentSegmentDto | null;
  billId: number | null;
  billNo: string | null;
}

// 把 AuthUser 挂到 Express Request 上（middleware/auth.ts 填充）
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
