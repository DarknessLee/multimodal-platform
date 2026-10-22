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
  | 'FINANCE'
  | 'INSURANCE'
  | 'REGULATOR'
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
  errorCode?: string | null;
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

// ───────────────────────────── Stage 2：一单制 / 单证 / 存证 / 箱管 / 铁路水路 ─────────────────────────────

export interface WaybillListItem {
  id: number;
  waybillNo: string;
  waybillType: string;
  waybillTypeLabel: string;
  orderId: number | null;
  orderNo: string | null;
  customerName: string | null;
  cargoName: string | null;
  containerCount: number;
  segmentCount: number;
  status: string;
  statusLabel: string;
  issuedAt: string | null;
  documentCount: number;
  notarizedCount: number;
}

export interface WaybillEvent {
  id: number;
  waybillId?: number;
  segmentId?: number | null;
  eventType: string;
  eventTypeLabel: string;
  occurredAt: string;
  nodeName?: string | null;
  operator?: string | null;
  description?: string | null;
  prevHash?: string | null;
  hash?: string | null;
  txId?: string | null;
  blockHeight?: number | null;
}

export interface WaybillContainerItem {
  id: number;
  containerNo: string;
  type: string;
  status: string;
  statusLabel: string;
  currentNode?: string | null;
  sealNo?: string | null;
}

export interface SegmentWaybill {
  id: number;
  waybillNo: string;
  mode: string;
  modeLabel?: string;
  carrierName: string;
  status: string;
  statusLabel?: string;
}

export interface WaybillDocBrief {
  id: number;
  docNo: string;
  docType: string;
  docTypeLabel: string;
  fileName: string;
  ocrStatus: string;
  ocrStatusLabel?: string;
  signStatus: string;
  signStatusLabel?: string;
  notarizeTxId?: string | null;
}

export interface WaybillNotarizeSummary {
  verified: boolean;
  recordCount: number;
  lastTxId: string | null;
}

export interface WaybillDetail {
  waybill: {
    id: number;
    waybillNo: string;
    waybillType: string;
    waybillTypeLabel?: string;
    status: string;
    statusLabel: string;
    orderId: number | null;
    issuedAt: string | null;
    notarizeTxId: string | null;
  };
  order: { id: number; orderNo: string; customerName: string | null; cargoName: string | null } | null;
  segments: Array<{
    id: number;
    seq: number;
    mode: string;
    modeLabel: string;
    carrierName: string;
    status: string;
    statusLabel: string;
    startNode?: string;
    endNode?: string;
  }>;
  segmentWaybills: SegmentWaybill[];
  containers: WaybillContainerItem[];
  events: WaybillEvent[];
  documents: WaybillDocBrief[];
  notarize: WaybillNotarizeSummary | null;
}

export interface NotarizeRecord {
  id: number;
  bizType: string;
  bizId: number;
  eventType: string;
  payloadHash: string;
  prevHash: string;
  hash: string;
  blockHeight: number;
  txId: string;
  createdAt: string;
}

export interface NotarizeVerifyResult {
  valid: boolean;
  record: NotarizeRecord;
  chainLength: number;
  message: string;
}

export interface DocumentListItem {
  id: number;
  docNo: string;
  docType: string;
  docTypeLabel: string;
  bizType: string;
  bizId: number;
  fileName: string;
  fileSize: number;
  contentHash: string;
  ocrStatus: string;
  ocrStatusLabel: string;
  signStatus: string;
  signStatusLabel?: string;
  notarizeTxId: string | null;
  createdAt: string;
}

export type OcrResultData = Record<string, unknown>;

export interface DocumentDetail extends DocumentListItem {
  mimeType?: string;
  ocrResult?: OcrResultData | null;
  signHash?: string | null;
  sealId?: number | null;
  signerName?: string | null;
  signedAt?: string | null;
}

export interface CreateDocumentPayload {
  docType: string;
  bizType: string;
  bizId: number;
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface ContainerListItem {
  id: number;
  containerNo: string;
  type: string;
  status: string;
  statusLabel: string;
  currentNode: string | null;
  currentWaybillId: number | null;
  currentWaybillNo: string | null;
  ownerPartnerName: string | null;
  conditionText: string | null;
  repairFee: number;
}

export interface ContainerMovement {
  id: number;
  movementType: string;
  movementLabel: string;
  nodeName: string | null;
  occurredAt: string;
  conditionText: string | null;
  operator: string | null;
  remark?: string | null;
}

export interface DepotStorageItem {
  id: number;
  containerNo?: string | null;
  nodeName: string;
  startAt: string;
  endAt: string | null;
  storageDays: number;
  feeAmount: number;
  status: string;
  statusLabel?: string;
}

export interface ContainerDetail {
  container: {
    id: number;
    containerNo: string;
    type: string;
    status: string;
    statusLabel: string;
    currentNode?: string | null;
    conditionText?: string | null;
    repairFee?: number;
  };
  waybill: { id: number; waybillNo: string } | null;
  movements: ContainerMovement[];
  storage: DepotStorageItem[];
}

export interface ContainerReleasePayload {
  waybillId: number;
  nodeId?: number | null;
}

export interface ContainerMovementPayload {
  movementType: string;
  nodeId?: number | null;
  conditionText?: string;
  remark?: string;
  photoUrl?: string | null;
}

export interface RailTask {
  waybillId: number;
  waybillNo: string;
  orderNo: string;
  fromStation: string;
  toStation: string;
  containerCount: number;
  segmentStatus: string;
  segmentStatusLabel?: string;
  demandStatus: string;
  demandStatusLabel?: string;
  lastMessageAt: string | null;
  messageId?: number | null;
}

export interface SeaTask {
  waybillId: number;
  waybillNo: string;
  orderNo: string;
  fromPort: string;
  toPort: string;
  containerCount: number;
  segmentStatus: string;
  segmentStatusLabel?: string;
  bookingStatus: string;
  bookingStatusLabel?: string;
  lastMessageAt: string | null;
  messageId?: number | null;
}

export interface RailApplyResult {
  messageId: number;
  msgNo: string;
  status: string;
  statusLabel?: string;
}

export interface RailConfirmResult {
  status: string;
  matchedCars?: number;
  message: string;
}

export interface SeaBookResult {
  messageId: number;
  msgNo: string;
  status: string;
  statusLabel?: string;
}

export interface SeaConfirmResult {
  status: string;
  vesselName?: string;
  voyageNo?: string;
  slotNo?: string;
  message: string;
}

// ───────────────────────────── Stage 3：智能调度 / 运力 / 监控 / 预警 / IoT ─────────────────────────────

export interface DispatchPlanItem {
  seq: number;
  mode: string;
  modeLabel: string;
  carrierName: string;
  resourceType: string;
  resourceName: string;
  startNode: string;
  endNode: string;
  startAt: string;
  endAt: string;
  cost: number;
  transitHours: number;
  reliability: number;
}

export interface TransferWindow {
  nodeName: string;
  arrivalAt: string;
  departureAt: string;
  waitHours: number;
  status: string;
  statusLabel?: string;
}

export interface DispatchPlan {
  id: number;
  planNo: string;
  strategy: string;
  strategyLabel: string;
  totalCost: number;
  totalHours: number;
  reliability: number;
  score: number;
  status: string;
  statusLabel?: string;
  summary: string | null;
  items: DispatchPlanItem[];
  transferWindows: TransferWindow[];
  createdAt?: string;
}

export interface DispatchPlanListItem {
  id: number;
  planNo: string;
  orderId?: number;
  orderNo: string;
  strategy: string;
  strategyLabel: string;
  totalCost: number;
  totalHours: number;
  score: number;
  status: string;
  statusLabel?: string;
  createdAt: string;
}

export interface PlanGenerateResult {
  order: { id: number; orderNo: string; status: string; statusLabel?: string };
  plans: DispatchPlan[];
}

export interface PlanConfirmResult {
  planId: number;
  orderId: number;
  waybillId: number;
  waybillNo: string;
  segments: Segment[];
}

export interface CapacityMetric {
  total: number;
  idle?: number;
  inTask?: number;
  maintenance?: number;
  upcoming?: number;
  capacityTeu?: number;
  bookedTeu?: number;
  utilization: number;
}

export interface CapacitySummary {
  vehicles: CapacityMetric;
  trains: CapacityMetric;
  vessels: CapacityMetric;
}

export interface Vehicle {
  id: number;
  vehicleNo: string;
  plateNo: string;
  vehicleType: string;
  vehicleTypeLabel?: string;
  carrierName: string;
  driverName: string;
  driverPhone: string;
  capacityT: number;
  containerSlots: number;
  status: string;
  statusLabel: string;
  currentNode: string | null;
  lng: number | null;
  lat: number | null;
  lastSeenAt: string | null;
}

export interface TrainScheduleItem {
  id: number;
  trainNo: string;
  operatorName: string;
  originNode: string;
  destNode: string;
  departureAt: string;
  arrivalAt: string;
  capacityTeu: number;
  bookedTeu: number;
  utilization: number;
  status: string;
  statusLabel: string;
  priceIndex: number;
}

export interface VesselScheduleItem {
  id: number;
  vesselName: string;
  voyage: string;
  carrierName: string;
  originPort: string;
  destPort: string;
  etd: string;
  eta: string;
  capacityTeu: number;
  bookedTeu: number;
  utilization: number;
  status: string;
  statusLabel: string;
  priceIndex: number;
}

export interface DispatchBoard {
  pendingOrders: Array<{
    id: number;
    orderNo: string;
    statusLabel: string;
    cargoName: string;
  }>;
  capacity: CapacitySummary;
  upcomingTrains: Array<{
    trainNo: string;
    route: string;
    departureAt: string;
    bookedTeu: number;
    capacityTeu: number;
  }>;
  upcomingVessels: Array<{
    vesselName: string;
    voyage: string;
    route: string;
    etd: string;
  }>;
  transferWindows: Array<{
    planNo: string;
    nodeName: string;
    waitHours: number;
    status: string;
  }>;
  alerts: Array<{
    id: number;
    alertType: string;
    levelLabel: string;
    title: string;
  }>;
}

export interface MonitorKpis {
  onlineWaybills: number;
  inTransit: number;
  onTimeRate: number;
  alertsOpen: number;
  containersInTransit: number;
  avgTransitHours: number;
}

export interface MonitorLivePoint {
  waybillId: number;
  waybillNo: string;
  containerNo: string | null;
  lng: number;
  lat: number;
  mode: string;
  statusLabel: string;
}

export interface MonitorAlertBrief {
  id: number;
  level: string;
  levelLabel: string;
  title: string;
  occurredAt: string;
}

export interface MonitorOverview {
  kpis: MonitorKpis;
  statusDistribution: Array<{ status: string; statusLabel: string; count: number }>;
  modeDistribution: Array<{ mode: string; count: number }>;
  livePoints: MonitorLivePoint[];
  recentAlerts: MonitorAlertBrief[];
  onTimeTrend: { dates: string[]; onTime: number[]; alerts: number[] };
}

export interface IotReading {
  id?: number;
  deviceNo?: string;
  containerNo?: string | null;
  temperature: number | null;
  humidity: number | null;
  doorOpen: boolean | number;
  impactG?: number | null;
  lng?: number | null;
  lat?: number | null;
  reportedAt: string;
}

export interface MonitorLive {
  waybill: { id: number; waybillNo: string; status: string; statusLabel: string };
  livePosition: { lng: number; lat: number; nodeName: string | null; occurredAt: string } | null;
  devices: Array<{
    id: number;
    deviceNo: string;
    deviceType: string;
    deviceTypeLabel?: string;
    status: string;
    statusLabel?: string;
    lastSeenAt: string | null;
  }>;
  readings: IotReading | null;
  alerts: Array<{
    id: number;
    level: string;
    levelLabel: string;
    alertType: string;
    alertTypeLabel?: string;
    title: string;
    status: string;
    statusLabel?: string;
    occurredAt: string;
  }>;
  trail: Array<{ lng: number; lat: number; occurredAt: string }>;
}

export interface MonitorTrend {
  dates: string[];
  onTimeRate: number[];
  alerts: number[];
}

export interface AlertItem {
  id: number;
  alertNo: string;
  alertType: string;
  alertTypeLabel: string;
  level: string;
  levelLabel: string;
  waybillNo: string | null;
  containerNo: string | null;
  nodeName: string | null;
  title: string;
  content: string;
  status: string;
  statusLabel: string;
  occurredAt: string;
  ackedAt: string | null;
  closedAt: string | null;
}

export interface ExceptionTicket {
  id: number;
  ticketNo: string;
  alertNo: string | null;
  orderNo: string | null;
  waybillNo: string | null;
  type: string;
  typeLabel: string;
  description: string;
  assignee: string | null;
  status: string;
  statusLabel: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface IotDevice {
  id: number;
  deviceNo: string;
  deviceType: string;
  deviceTypeLabel: string;
  containerNo: string | null;
  vehicleNo: string | null;
  status: string;
  statusLabel: string;
  lastSeenAt: string | null;
}

export interface IotIngestResult {
  reading: IotReading;
  alertsCreated: Array<{
    id: number;
    alertNo: string;
    alertType: string;
    level: string;
    title: string;
  }>;
}

export interface GeoFence {
  id: number;
  name: string;
  fenceType: string;
  fenceTypeLabel?: string;
  nodeName?: string | null;
  centerLng: number;
  centerLat: number;
  radiusM: number;
  status: string;
}

// ───────────────────────────── Stage 4：结算 v2 / 对账 / 发票 / 支付 / 保理 / 保险 / 经营分析 ─────────────────────────────

export interface Counterparty {
  type: string;
  id: number | null;
  name: string;
}

export interface BillListItem {
  id: number;
  billNo: string;
  billType: string;
  billTypeLabel: string;
  counterparty: Counterparty | null;
  orderId: number | null;
  orderNo: string | null;
  period: string | null;
  totalAmount: number;
  taxAmount: number;
  profitAmount: number;
  dueDate: string | null;
  status: string;
  statusLabel: string;
  issuedAt: string | null;
}

export interface BillItemDetail {
  seq: number;
  mode: string;
  modeLabel: string;
  chargeType: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  taxRate: number;
  taxAmount: number;
  costAmount: number;
}

export interface InvoiceBrief {
  id: number;
  invoiceNo: string;
  status: string;
  totalAmount: number;
}

export interface PaymentBrief {
  id: number;
  paymentNo: string;
  amount: number;
  status: string;
  paidAt: string | null;
}

export interface BillDetailResult {
  bill: BillListItem;
  order: { id: number; orderNo: string } | null;
  items: BillItemDetail[];
  invoice: InvoiceBrief | null;
  payments: PaymentBrief[];
  reconciliation: { id: number; reconNo: string; status: string } | null;
}

export interface InvoiceListItem {
  id: number;
  invoiceNo: string;
  invoiceType: string;
  invoiceTypeLabel: string;
  billId: number;
  billNo: string;
  buyerName: string;
  sellerName: string;
  amount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  status: string;
  statusLabel: string;
  issuedAt: string | null;
}

export interface InvoiceDetail extends InvoiceListItem {
  buyerTaxNo?: string | null;
  sellerTaxNo?: string | null;
  orderId?: number | null;
  voidedAt?: string | null;
}

export interface CreateInvoicePayload {
  billId: number;
  invoiceType: string;
  title: string;
  taxNo: string;
}

export interface PaymentListItem {
  id: number;
  paymentNo: string;
  direction: string;
  counterparty: Counterparty | null;
  billNo: string | null;
  amount: number;
  method: string;
  status: string;
  statusLabel: string;
  bankSerial: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface CreatePaymentPayload {
  direction: string;
  billId: number;
  amount: number;
  method: string;
  payerName?: string;
  remark?: string;
}

export interface PaymentConfirmResult {
  payment: PaymentListItem;
  allocation: { paymentId: number; billId: number; amount: number };
  bill: BillListItem;
}

export interface ReconciliationListItem {
  id: number;
  reconNo: string;
  counterparty: Counterparty | null;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  confirmedAmount: number;
  differenceAmount: number;
  status: string;
  statusLabel: string;
  sentAt: string | null;
  confirmedAt: string | null;
}

export interface ReconciliationItemDetail {
  billId: number;
  billNo: string;
  amount: number;
  confirmedAmount: number;
  differenceReason: string | null;
  status: string;
  statusLabel?: string;
}

export interface ReconciliationDetail {
  recon: ReconciliationListItem;
  items: ReconciliationItemDetail[];
}

export interface FactoringApplication {
  id: number;
  appNo: string;
  orderNo: string | null;
  billNo: string | null;
  applicantName: string;
  financePartnerName: string;
  amount: number;
  discountRate: number;
  fee: number;
  status: string;
  statusLabel: string;
  appliedAt: string;
  approvedAt: string | null;
}

export interface InsurancePolicy {
  id: number;
  policyNo: string;
  orderNo: string | null;
  waybillNo: string | null;
  insurerName: string;
  insuredAmount: number;
  rate: number;
  premium: number;
  status: string;
  statusLabel: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface FinanceDashboard {
  arTotal: number;
  arOverdue: number;
  apTotal: number;
  apOverdue?: number;
  invoicesIssued?: number;
  pendingInvoices?: number;
  pendingPayments?: number;
  factoringInProgress?: number;
  insurancePolicies?: number;
  reconciliation?: {
    inProgress: number;
    disputed: number;
    differenceAmount: number;
  };
  // 兼容早期字段命名
  invoicePending?: number;
  paymentPending?: number;
  reconciliationOpen?: number;
  reconciliationDiff?: number;
  factoringOpen?: number;
  policyCount?: number;
}

export interface AnalyticsKpis {
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  arTotal: number;
  arOverdue: number;
  apTotal: number;
  invoicesIssued: number;
  paymentsSuccess: number;
}

export interface AnalyticsOverview {
  kpis: AnalyticsKpis;
  arAging: Array<{ bucket: string; amount: number }>;
}

export interface AnalyticsTrend {
  dates: string[];
  revenue: number[];
  cost: number[];
  profit: number[];
}

export interface AnalyticsByCustomer {
  customerName: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
}

export interface AnalyticsByMode {
  mode: string;
  modeLabel: string;
  revenue: number;
  cost: number;
  profit: number;
}

// ───────────────────────────── Stage 5：集成中心 v2 / 监管 / 运营 / 全链路验收 ─────────────────────────────

export interface IntegrationAdapter {
  id: number;
  adapterCode: string;
  name: string;
  systemType: string;
  systemTypeLabel: string;
  protocol: string;
  endpoint: string;
  status: string;
  statusLabel: string;
  successRate: number;
  totalMessages: number;
  failedMessages: number;
  lastSyncAt: string | null;
  retryPolicy: string | null;
}

export interface AdapterHealthCheckItem {
  name: string;
  status: string;
  detail: string;
  latencyMs: number;
}

export interface AdapterHealthResult {
  adapter: IntegrationAdapter;
  status: string;
  checks: AdapterHealthCheckItem[];
  checkedAt: string;
}

export interface AdapterTestResult {
  adapterId: number;
  success: boolean;
  latencyMs: number;
  message: string;
  testedAt: string;
}

export interface IntegrationMessageDetail {
  id: number;
  msgNo: string;
  systemCode?: string;
  systemName?: string;
  systemType?: string;
  systemTypeLabel?: string;
  msgType: string;
  direction: string;
  relatedType: string | null;
  relatedId: string | null;
  status: string;
  statusLabel?: string;
  retryCount: number;
  errorCode: string | null;
  errorMessage?: string | null;
  requestBody: string | Record<string, unknown> | null;
  responseBody: string | Record<string, unknown> | null;
  sentAt: string | null;
  lastRetryAt: string | null;
  createdAt?: string;
}

export interface RetryBatchResult {
  retried: number;
  success: number;
  failed: number;
  results: Array<{ id: number; msgNo: string; status: string; errorMessage: string | null }>;
}

export interface IntegrationStats {
  total: number;
  success: number;
  failed: number;
  successRate: number;
  bySystem: Array<{ systemType: string; count: number; failed: number; successRate: number }>;
  trend: Array<{ date: string; count: number; failed: number }>;
  recentFailures: Array<{ id: number; msgNo: string; msgType: string; errorCode: string | null }>;
}

export interface RegulatorReport {
  id: number;
  reportNo: string;
  reportType: string;
  reportTypeLabel: string;
  period: string;
  regulatorName: string;
  status: string;
  statusLabel: string;
  submittedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
  remark?: string | null;
}

export interface RegulatorReportDetail {
  report: RegulatorReport;
  content: Record<string, unknown> | null;
}

export interface ComplianceCheckItem {
  id: number;
  checkNo: string;
  checkType: string;
  checkTypeLabel: string;
  targetType: string;
  targetId: string;
  result: string;
  resultLabel: string;
  detail: string;
  checkedAt: string;
}

export interface ComplianceRunResult {
  checks: ComplianceCheckItem[];
  summary: { pass: number; warn: number; fail: number; total: number };
}

export interface RegulatorDashboard {
  reports: { total: number; draft: number; submitted: number; accepted: number; returned: number };
  compliance: { pass: number; warn: number; fail: number };
  latestReports: RegulatorReport[];
  latestChecks: ComplianceCheckItem[];
}

export interface OpsConfigItem {
  id: number;
  configKey: string;
  configValue: string;
  category: string;
  description: string | null;
  editable: boolean;
  updatedBy: string | number | null;
  updatedAt: string;
}

export interface OpsDictItem {
  id: number;
  dictType: string;
  dictKey: string;
  dictValue: string;
  sort: number;
  status: string;
  remark: string | null;
}

export interface OpsJobItem {
  jobCode: string;
  jobName: string;
  cron: string | null;
  status: string;
  lastRunAt: string | null;
  lastResult: string | null;
  lastDurationMs: number | null;
}

export interface OpsHealth {
  status: string;
  db: { status: string; latencyMs: number };
  adapters: { online: number; total: number };
  jobs: { success: number; failed: number };
  data: {
    tables?: number;
    orders?: number;
    waybills?: number;
    documents?: number;
    bills?: number;
    invoices?: number;
    alerts?: number;
    [key: string]: number | undefined;
  };
}

export interface OpsDashboard {
  health: OpsHealth;
  recentJobs: Array<OpsJobItem & { id?: number; durationMs?: number; startedAt?: string }>;
  failedMessages: Array<{
    id: number;
    msgNo: string;
    msgType: string;
    errorCode: string | null;
    errorMessage?: string | null;
  }>;
  pendingReports: number;
  dataCounts: Record<string, number>;
  uptimeHours: number;
}

export interface FullChainCheckItem {
  name: string;
  status: string;
  detail: string;
}

export interface FullChainCheckStage {
  stage: number;
  name: string;
  checks: FullChainCheckItem[];
}

export interface FullChainCheckResult {
  checkedAt: string;
  passed: boolean;
  stages: FullChainCheckStage[];
  summary: { total: number; pass: number; warn: number; fail: number };
}
