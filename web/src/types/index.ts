// 与 docs/02-接口契约.md 第 3/4 节保持一致的接口类型（字段一律 camelCase）

export type Role = 'SHIPPER' | 'MTO' | 'CARRIER' | 'TERMINAL' | 'SETTLEMENT';

export type OrderStatus = 'CREATED' | 'DISPATCHED' | 'IN_TRANSIT' | 'ARRIVED' | 'SIGNED' | 'BILLED';
export type WaybillStatus = 'PENDING' | 'IN_TRANSIT' | 'ARRIVED' | 'SIGNED';
export type SegmentStatus = 'PENDING' | 'ACCEPTED' | 'IN_TRANSIT' | 'ARRIVED' | 'COMPLETED';
export type SegmentMode = 'ROAD' | 'SEA' | 'RAIL';
export type SegmentAction = 'ACCEPT' | 'DEPART' | 'ARRIVE' | 'GATE_IN';
export type TrackSource = 'MOCK_GPS' | 'MOCK_EDI' | 'CARRIER_REPORT' | 'TERMINAL_REPORT' | 'MTO';

export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export interface UserInfo {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  roleLabel: string;
}

export interface LoginResult {
  token: string;
  user: UserInfo;
}

export interface SegmentBrief {
  seq: number;
  mode: SegmentMode | string;
  modeLabel: string;
  status: string;
  statusLabel: string;
  startNode: string;
  endNode: string;
}

export interface OrderListItem {
  id: number;
  orderNo: string;
  status: OrderStatus | string;
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
  waybillStatus: string | null;
  currentSegment: SegmentBrief | null;
  billId: number | null;
  billNo: string | null;
}

export interface ContainerInfo {
  id: number;
  containerNo: string;
  type: string;
  sealNo: string | null;
  status: string;
  statusLabel: string;
  conditionText: string | null;
}

export interface WaybillInfo {
  id: number;
  waybillNo: string;
  status: WaybillStatus | string;
  statusLabel: string;
  signerName: string | null;
  signedAt: string | null;
  createdAt?: string;
}

export interface OrderInfo {
  id: number;
  orderNo: string;
  status: OrderStatus | string;
  statusLabel: string;
  shipper: { id: number; displayName: string };
  cargoName: string;
  cargoWeight: number;
  containerType: string;
  containerCount: number;
  origin: string;
  destination: string;
  requiredPickupDate: string;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Segment {
  id: number;
  seq: number;
  mode: SegmentMode | string;
  modeLabel: string;
  carrierCode: string;
  carrierName: string;
  carrierUserId: number | null;
  startNode: string;
  endNode: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  acceptedAt: string | null;
  status: SegmentStatus | string;
  statusLabel: string;
  costAmount: number;
}

export interface TrackPoint {
  id: number;
  seq: number;
  segmentId: number | null;
  nodeName: string;
  lng: number;
  lat: number;
  occurredAt: string;
  source: TrackSource | string;
  description: string;
}

export interface RoadCarrier {
  code: string;
  name: string;
  price: number;
  etaHours: number;
  description: string;
}

export interface BillBrief {
  id: number;
  billNo: string;
  totalAmount: number;
  status: string;
  statusLabel: string;
  issuedAt: string;
  paidAt?: string | null;
}

export interface OrderDetail {
  order: OrderInfo;
  containers: ContainerInfo[];
  waybill: WaybillInfo | null;
  segments: Segment[];
  latestTrack: TrackPoint[];
  bill: BillBrief | null;
  availableRoadCarriers: RoadCarrier[];
}

export interface DispatchResult {
  orderId: number;
  waybillId: number;
  waybillNo: string;
  segments: Segment[];
}

export interface SegmentActionPayload {
  action: SegmentAction;
  conditionText?: string;
}

export interface SegmentActionData {
  segment: Segment;
  orderStatus: string;
  waybillStatus: string;
  containers: ContainerInfo[];
  newTrackPoints: TrackPoint[];
}

export interface TrackData {
  waybill: WaybillInfo;
  segments: Segment[];
  points: TrackPoint[];
}

export interface SignResult {
  waybill: WaybillInfo;
  order: { id: number; status: string; statusLabel: string };
}

export interface BillBreakdownItem {
  segmentId: number;
  seq: number;
  mode: SegmentMode | string;
  modeLabel: string;
  carrierName: string;
  startNode: string;
  endNode: string;
  amount: number;
}

export interface BillData {
  bill: BillBrief;
  order: {
    id: number;
    orderNo: string;
    origin: string;
    destination: string;
    status: string;
    statusLabel: string;
  };
  waybill: { id: number; waybillNo: string };
  breakdown: BillBreakdownItem[];
}

export interface CreateOrderPayload {
  cargoName: string;
  cargoWeight: number;
  containerType: string;
  containerCount: number;
  origin: string;
  destination: string;
  requiredPickupDate: string;
  remark?: string;
}
