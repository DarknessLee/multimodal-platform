// 与 docs/02-接口契约.md（v0）和 docs/04-Stage1-接口契约.md（v1）保持一致的接口类型
// 字段一律 camelCase；v0 类型只增不改，v1 字段以可选为主以兼容旧后端

export type Role =
  | 'SHIPPER'
  | 'FORWARDER'
  | 'MTO'
  | 'CARRIER'
  | 'RAIL_CARRIER'
  | 'SEA_CARRIER'
  | 'TERMINAL'
  | 'SETTLEMENT'
  | 'ADMIN';

export type OrderStatus =
  | 'CREATED'
  | 'CONTRACTED'
  | 'CONFIRMED'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'SIGNED'
  | 'BILLED'
  | 'CANCELLED';
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
  permissions?: string[];
}

export interface LoginResult {
  token: string;
  user: UserInfo;
  /** v1 登录响应顶层权限数组（与 user.permissions 相同） */
  permissions?: string[];
  /** v1 登录响应菜单码数组 */
  menus?: string[];
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
  // ---- v1 新增（v0 后端不返回时应按可选处理） ----
  orderType?: string;
  orderTypeLabel?: string;
  source?: string;
  sourceLabel?: string;
  customerId?: number | null;
  customerName?: string | null;
  totalAmount?: number;
  priority?: string;
  priorityLabel?: string;
  contractId?: number | null;
  contractNo?: string | null;
  quoteId?: number | null;
  quoteNo?: string | null;
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

export interface CustomerBrief {
  id: number;
  name: string;
  creditLevel?: string;
  contactName?: string;
  contactPhone?: string;
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
  // ---- v1 新增 ----
  orderType?: string;
  orderTypeLabel?: string;
  source?: string;
  sourceLabel?: string;
  priority?: string;
  priorityLabel?: string;
  totalAmount?: number;
  currency?: string;
  customer?: CustomerBrief | null;
  consignee?: CustomerBrief | null;
  contractId?: number | null;
  quoteId?: number | null;
  routeTemplateId?: number | null;
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

/** 订单货物行（v1 多货物） */
export interface CargoLine {
  seq?: number;
  goodsCode?: string | null;
  goodsName: string;
  quantity: number;
  unit: string;
  weightT: number;
  volumeCbm?: number | null;
  containerType: string;
  containerCount: number;
  dangerousFlag?: boolean | number;
  packaging?: string | null;
  remark?: string | null;
}

export interface OrderDetail {
  order: OrderInfo;
  containers: ContainerInfo[];
  waybill: WaybillInfo | null;
  segments: Segment[];
  latestTrack: TrackPoint[];
  bill: BillBrief | null;
  availableRoadCarriers: RoadCarrier[];
  // ---- v1 新增 ----
  cargoLines?: CargoLine[];
  contract?: { id: number; contractNo: string; status: string; statusLabel?: string } | null;
  quote?: { id: number; quoteNo: string; totalAmount?: number } | null;
  route?: { id: number; routeName: string; modes?: string[] } | null;
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

export interface CreateOrderQuickPayload {
  // v0 快速下单字段（首行/汇总兼容）
  cargoName: string;
  cargoWeight: number;
  containerType: string;
  containerCount: number;
  origin: string;
  destination: string;
  requiredPickupDate: string;
  remark?: string;
  // v1 扩展：快速单多货物行 + 客户/类型/优先级
  cargoLines?: CargoLine[];
  customerId?: number;
  consigneeCustomerId?: number;
  notifyCustomerId?: number;
  orderType?: string;
  priority?: string;
  routeTemplateId?: number;
}

export interface CreateOrderQuotePayload {
  quoteId: number;
  contractId?: number;
}

export type CreateOrderPayload = CreateOrderQuickPayload | CreateOrderQuotePayload;

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ───────────────────────────── 主数据（v1） ─────────────────────────────

export interface Customer {
  id: number;
  customerNo: string;
  name: string;
  shortName: string;
  creditCode: string;
  contactName: string;
  contactPhone: string;
  email: string | null;
  regionCode: string;
  address: string;
  industry: string;
  creditLevel: string;
  creditLevelLabel?: string;
  status: string;
  statusLabel: string;
  remark?: string | null;
}

export interface Partner {
  id: number;
  partnerNo: string;
  name: string;
  shortName: string;
  type: string;
  typeLabel?: string;
  creditCode: string;
  contactName: string;
  contactPhone: string;
  email: string | null;
  regionCode: string;
  address: string;
  qualifications: unknown;
  rating: number;
  settlementAccount: string | null;
  status: string;
  statusLabel: string;
  remark?: string | null;
}

export interface PortStation {
  id: number;
  nodeCode: string;
  nodeName: string;
  nodeType: string;
  nodeTypeLabel?: string;
  regionCode: string;
  address: string;
  lng: number;
  lat: number;
  operatorPartnerId: number | null;
  operatorName?: string | null;
  capacityTeu: number | null;
  operatingHours: string | null;
  status?: string;
  statusLabel?: string;
}

export interface RouteNode {
  id: number;
  nodeCode: string;
  nodeName: string;
}

export interface RouteTemplate {
  id: number;
  routeCode: string;
  routeName: string;
  originNode: RouteNode;
  destinationNode: RouteNode;
  transitNodes: RouteNode[];
  modes: string[];
  distanceKm: number;
  transitDays: number;
  baseCost: number;
  reliability: number;
  status?: string;
  statusLabel?: string;
}

export interface GoodsItem {
  id: number;
  goodsCode: string;
  goodsName: string;
  category: string;
  hsCode: string | null;
  dangerousFlag: boolean | number;
  packaging: string | null;
  unit: string;
  defaultWeight?: number | null;
  status?: string;
  statusLabel?: string;
}

export interface ContainerTypeItem {
  id: number;
  code: string;
  name: string;
  innerVolumeCbm: number;
  maxPayloadT: number;
  tareWeightT: number;
  teu: number;
  status?: string;
  statusLabel?: string;
}

export interface PriceRule {
  id: number;
  ruleNo: string;
  ruleName: string;
  mode: string;
  modeLabel: string;
  chargeType: string;
  chargeTypeLabel?: string;
  carrierPartnerId?: number | null;
  routeTemplateId: number | null;
  routeTemplateName?: string | null;
  containerTypeId?: number | null;
  containerTypeCode?: string | null;
  customerId: number | null;
  customerName?: string | null;
  contractId?: number | null;
  calcMethod: string;
  calcMethodLabel?: string;
  unitPrice: number;
  unit: string;
  minCharge: number;
  currency: string;
  priority: number;
  effectiveFrom: string;
  effectiveTo: string;
  status: string;
  statusLabel: string;
  remark?: string | null;
}

export interface CreatePriceRulePayload {
  ruleName: string;
  mode: string;
  chargeType: string;
  routeTemplateId?: number | null;
  containerTypeCode?: string | null;
  customerId?: number | null;
  contractId?: number | null;
  calcMethod: string;
  unitPrice: number;
  minCharge?: number;
  effectiveFrom: string;
  effectiveTo: string;
  priority?: number;
}

export interface DictItem {
  key: string;
  value: string;
  label: string;
  sortNo: number;
}

export interface CreateCustomerPayload {
  name: string;
  shortName: string;
  creditCode: string;
  contactName: string;
  contactPhone: string;
  email?: string;
  regionCode: string;
  address: string;
  industry: string;
  creditLevel?: string;
  remark?: string;
}

export interface CreatePartnerPayload {
  name: string;
  shortName: string;
  type: string;
  creditCode: string;
  contactName: string;
  contactPhone: string;
  email?: string;
  regionCode: string;
  address: string;
  rating?: number;
  settlementAccount?: string;
  remark?: string;
}

// ───────────────────────────── 询价 / 报价（v1） ─────────────────────────────

export interface QuoteListItem {
  id: number;
  quoteNo: string;
  customer: { id: number; name: string };
  orderType: string;
  orderTypeLabel: string;
  routeName: string;
  containerType: string;
  containerCount: number;
  cargoName: string;
  totalAmount: number;
  status: string;
  statusLabel: string;
  validUntil: string;
  createdAt: string;
  orderId?: number | null;
  orderNo?: string | null;
}

export interface QuoteItem {
  seq: number;
  mode: string;
  modeLabel: string;
  chargeType?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  costAmount?: number;
  calcMethod: string;
}

export interface QuoteDetail {
  id: number;
  quoteNo: string;
  customer: { id: number; name: string };
  orderType: string;
  orderTypeLabel: string;
  route: {
    id: number;
    routeName: string;
    modes: string[];
    transitDays?: number;
    distanceKm?: number;
  };
  containerType: string;
  containerCount: number;
  goodsCode: string | null;
  cargoName: string;
  cargoWeight: number;
  requiredDate: string;
  transitDays: number;
  validUntil: string;
  totalAmount: number;
  costAmount: number;
  marginRate: number;
  status: string;
  statusLabel: string;
  remark: string | null;
  items: QuoteItem[];
  orderId?: number | null;
  orderNo?: string | null;
  createdAt?: string;
}

export interface CreateQuotePayload {
  customerId: number;
  orderType: string;
  routeTemplateId: number;
  containerTypeCode: string;
  containerCount: number;
  goodsCode?: string;
  cargoName: string;
  cargoWeight: number;
  requiredDate: string;
  remark?: string;
}

// ───────────────────────────── 合同（v1） ─────────────────────────────

export interface ContractListItem {
  id: number;
  contractNo: string;
  customer: { id: number; name: string };
  contractType: string;
  contractTypeLabel: string;
  title: string;
  effectiveFrom: string;
  effectiveTo: string;
  paymentTerms: string;
  creditLimit: number;
  discountRate: number;
  status: string;
  statusLabel: string;
  signerName: string | null;
  signedAt: string | null;
  createdAt: string;
  orderCount?: number;
}

export interface ContractDetail extends ContractListItem {
  settleCurrency?: string;
  signHash?: string | null;
  fileUrl?: string | null;
  remark?: string | null;
}

export interface CreateContractPayload {
  customerId: number;
  contractType: string;
  title: string;
  effectiveFrom: string;
  effectiveTo: string;
  paymentTerms: string;
  creditLimit?: number;
  discountRate?: number;
}

export interface SignContractPayload {
  signerName: string;
}

// ───────────────────────────── 总览看板（v1） ─────────────────────────────

export interface DashboardKpis {
  ordersTotal: number;
  inTransit: number;
  pendingDispatch: number;
  signed: number;
  billed: number;
  revenue: number;
  onTimeRate: number;
  exceptionCount: number;
}

export interface DashboardSummary {
  kpis: DashboardKpis;
  statusDistribution: Array<{ status: string; statusLabel: string; count: number }>;
  modeDistribution: Array<{ mode: string; count: number }>;
  recentOrders: Array<{
    id: number;
    orderNo: string;
    statusLabel: string;
    cargoName: string;
    totalAmount: number;
    createdAt: string;
  }>;
  todos: Array<{ type: string; title: string; relatedId: number | string | null }>;
  integration: { total: number; success: number; failed: number; successRate: number };
}

export interface DashboardTrend {
  dates: string[];
  orders: number[];
  revenue: number[];
}

// ───────────────────────────── 集成 / 审计 / 通知（v1） ─────────────────────────────

export interface IntegrationSystem {
  systemCode: string;
  systemName: string;
  standard: string;
  direction: string;
  status: string;
  lastMessageAt: string | null;
  successRate: number;
}

export interface IntegrationMessage {
  id: number;
  msgNo: string;
  systemCode: string;
  systemName: string;
  direction: string;
  msgType: string;
  standard: string;
  relatedType: string | null;
  relatedId: string | null;
  status: string;
  statusLabel?: string;
  retryCount: number;
  errorMessage: string | null;
  createdAt: string;
  processedAt?: string | null;
  payloadPreview?: string | null;
  payload?: unknown;
  responsePayload?: unknown;
}

export interface AuditLog {
  id: number;
  username: string;
  role: string;
  action: string;
  actionLabel: string;
  module: string;
  targetType: string | null;
  targetId: string | null;
  detail: unknown;
  ip: string | null;
  createdAt: string;
}

export interface NotificationItem {
  id: number;
  type: string;
  typeLabel: string;
  title: string;
  content: string;
  relatedType: string | null;
  relatedId: string | null;
  readFlag: boolean | number;
  createdAt: string;
}
