// 全局类型定义：角色 / 状态机 / 数据库行 / DTO
// v0 字段只增不改；Stage 1 扩展 9 角色、订单 v1 状态与平台表。

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

export type OrderType = 'ROAD_RAIL' | 'RAIL_SEA' | 'ROAD_RAIL_SEA';
export type OrderSource = 'QUICK' | 'QUOTE';
export type Priority = 'NORMAL' | 'URGENT';

export type WaybillStatus = 'PENDING' | 'IN_TRANSIT' | 'ARRIVED' | 'SIGNED';
export type SegmentStatus = 'PENDING' | 'ACCEPTED' | 'IN_TRANSIT' | 'ARRIVED' | 'COMPLETED';
export type SegmentMode = 'ROAD' | 'SEA' | 'RAIL';
export type SegmentAction = 'ACCEPT' | 'DEPART' | 'ARRIVE' | 'GATE_IN';
export type ContainerStatus =
  | 'EMPTY'
  | 'RELEASED'
  | 'GATE_IN'
  | 'LOADED'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'DELIVERED'
  | 'RETURNED'
  | 'IN_REPAIR'
  | 'AT_DEPOT';
export type BillStatus = 'ISSUED' | 'PAID';
export type TrackSource = 'MOCK_GPS' | 'MOCK_EDI' | 'CARRIER_REPORT' | 'TERMINAL_REPORT' | 'MTO';

export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED';
export type ContractStatus = 'DRAFT' | 'PENDING_SIGN' | 'SIGNED' | 'TERMINATED';
export type ContractType = 'FRAMEWORK' | 'SPOT';
export type PartnerType =
  | 'ROAD_CARRIER'
  | 'RAIL_OPERATOR'
  | 'SEA_CARRIER'
  | 'PORT'
  | 'RAIL_STATION'
  | 'DEPOT'
  | 'WAREHOUSE'
  | 'FORWARDER'
  | 'FINANCE'
  | 'INSURANCE'
  | 'REGULATOR';
export type NodeType = 'PORT' | 'RAIL_STATION' | 'DEPOT' | 'WAREHOUSE';
export type ActiveStatus = 'ACTIVE' | 'DISABLED';
export type PriceRuleMode = SegmentMode | 'PORT' | 'OTHER';
export type ChargeType = 'BASE' | 'SURCHARGE';
export type CalcMethod = 'PER_CONTAINER' | 'PER_KM' | 'PER_TON' | 'PER_TEU' | 'FLAT';
export type IntegrationDirection = 'IN' | 'OUT';
export type IntegrationStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRYING';
export type NotificationType = 'TODO' | 'ALERT' | 'INFO';

// ── Stage 2：一单制 / 单证 / 存证 / 箱管 ────────────────────────────────────
export type WaybillType = 'MASTER' | 'SEGMENT';
export type DocType = 'ORDER_CONFIRM' | 'WAYBILL_MASTER' | 'WAYBILL_SEGMENT' | 'PACKING_LIST' | 'POD' | 'OTHER';
export type DocBizType = 'ORDER' | 'WAYBILL' | 'BILL' | 'CONTRACT';
export type OcrStatus = 'NONE' | 'PENDING' | 'SUCCESS' | 'FAILED';
export type DocSignStatus = 'UNSIGNED' | 'SIGNED';
export type WaybillEventType =
  | 'ISSUE'
  | 'RELEASE'
  | 'PICKUP'
  | 'GATE_IN'
  | 'LOAD'
  | 'DEPART'
  | 'ARRIVE'
  | 'DISCHARGE'
  | 'HANDOVER'
  | 'POD'
  | 'SIGN'
  | 'NOTARIZE';
export type ContainerMovementType =
  | 'RELEASE'
  | 'PICKUP'
  | 'GATE_IN'
  | 'LOAD'
  | 'DEPART'
  | 'ARRIVE'
  | 'DISCHARGE'
  | 'GATE_OUT'
  | 'RETURN'
  | 'REPAIR';
export type StorageStatus = 'STACKED' | 'RELEASED';
export type SealOwnerType = 'PLATFORM' | 'CUSTOMER' | 'CARRIER' | 'TERMINAL';
export type NotarizeBizType = 'WAYBILL' | 'DOCUMENT' | 'CONTRACT' | 'BILL' | 'ORDER';

// ── Stage 3：运力池 / 智能调度 / 预警 / IoT ─────────────────────────────────
export type VehicleType = 'TRACTOR' | 'TRAILER' | 'VAN';
export type VehicleStatus = 'IDLE' | 'IN_TASK' | 'MAINTENANCE';
export type ScheduleStatus = 'PLANNED' | 'OPEN' | 'DEPARTED' | 'ARRIVED' | 'CANCELLED';
export type PlanStrategy = 'COST' | 'TIME' | 'BALANCED';
export type PlanStatus = 'DRAFT' | 'CONFIRMED' | 'REJECTED';
export type ResourceType = 'VEHICLE' | 'TRAIN' | 'VESSEL';
export type TransferWindowStatus = 'OK' | 'TIGHT' | 'MISSED';
export type AlertType = 'DELAY' | 'DEVIATION' | 'TEMP_HUMIDITY' | 'STAY' | 'DOOR_OPEN' | 'EXCEPTION';
export type AlertLevel = 'INFO' | 'WARN' | 'CRITICAL';
export type AlertStatus = 'OPEN' | 'ACK' | 'CLOSED';
export type TicketStatus = 'OPEN' | 'PROCESSING' | 'RESOLVED' | 'CLOSED';
export type DeviceType = 'GPS' | 'TEMP_HUMIDITY' | 'DOOR' | 'IMPACT';
export type DeviceStatus = 'ONLINE' | 'OFFLINE';
export type FenceType = 'PORT' | 'STATION' | 'WAREHOUSE' | 'DEPOT';
export type FenceStatus = 'ACTIVE' | 'DISABLED';

// ── Stage 4：结算 v2 / 对账 / 发票 / 支付 / 保理 / 保险 / 经营分析 ────────────
export type BillType = 'RECEIVABLE' | 'PAYABLE';
export type CounterpartyType = 'CUSTOMER' | 'CARRIER' | 'FINANCE' | 'INSURER';
export type BillSource = 'ORDER' | 'SEGMENT';
export type BillItemMode = 'ROAD' | 'SEA' | 'RAIL' | 'PORT' | 'OTHER';
export type ReconStatus = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'DISPUTED';
export type ReconItemStatus = 'MATCH' | 'DIFF';
export type InvoiceType = 'VAT_SPECIAL' | 'VAT_NORMAL';
export type InvoiceStatus = 'PENDING' | 'ISSUED' | 'VOID';
export type PaymentDirection = 'IN' | 'OUT';
export type PaymentMethod = 'BANK_TRANSFER' | 'ONLINE' | 'FACTORING';
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED';
export type FactoringStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SETTLED';
export type InsuranceStatus = 'QUOTED' | 'ISSUED' | 'EXPIRED' | 'CLAIMED';
export type StatMode = 'ROAD' | 'SEA' | 'RAIL' | 'ALL';

/** JWT 解出的登录用户（customer_id 由 requireAuth 从 DB 补全，便于按客户过滤） */
export interface AuthUser {
  uid: number;
  username: string;
  role: Role;
  name: string;
  customer_id?: number | null;
  partner_id?: number | null;
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
  customer_id: number | null;
  partner_id: number | null;
  phone: string | null;
  email: string | null;
  status: ActiveStatus;
  last_login_at: string | null;
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
  order_type: OrderType;
  customer_id: number | null;
  consignee_customer_id: number | null;
  notify_customer_id: number | null;
  contract_id: number | null;
  quote_id: number | null;
  route_template_id: number | null;
  priority: Priority;
  source: OrderSource;
  total_amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

/** 订单 + 关联主数据（GET /orders/:id 使用） */
export interface OrderJoinedRow extends OrderRow {
  shipper_name: string;
  customer_name: string | null;
  customer_credit_level: string | null;
  consignee_name: string | null;
  consignee_contact_name: string | null;
  contract_no: string | null;
  quote_no: string | null;
  quote_total_amount: number | null;
  route_name: string | null;
  route_modes: unknown;
}

/** GET /orders 列表行（LEFT JOIN waybill / bill / customer / contract / quote） */
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
  order_type: OrderType;
  source: OrderSource;
  priority: Priority;
  total_amount: number;
  currency: string;
  customer_name: string | null;
  contract_no: string | null;
  quote_no: string | null;
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
  current_node_id: number | null;
  current_waybill_id: number | null;
  owner_partner_id: number | null;
  repair_fee: number;
  created_at: string;
  updated_at: string;
}

export interface ESealRow {
  id: number;
  seal_no: string;
  seal_name: string;
  owner_type: SealOwnerType;
  owner_id: number | null;
  ca_serial: string;
  status: 'ACTIVE' | 'REVOKED';
  issued_at: string;
}

export interface DocumentRow {
  id: number;
  doc_no: string;
  doc_type: DocType;
  biz_type: DocBizType;
  biz_id: number;
  file_name: string;
  mime_type: string;
  file_path: string | null;
  file_size: number;
  content_hash: string | null;
  ocr_status: OcrStatus;
  ocr_result: unknown;
  sign_status: DocSignStatus;
  signed_at: string | null;
  sign_hash: string | null;
  seal_id: number | null;
  signer_name: string | null;
  notarize_tx_id: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface WaybillEventRow {
  id: number;
  waybill_id: number;
  segment_id: number | null;
  event_type: WaybillEventType;
  occurred_at: string;
  node_id: number | null;
  operator_user_id: number | null;
  description: string | null;
  payload: unknown;
  prev_hash: string | null;
  hash: string | null;
  tx_id: string | null;
  block_height: number | null;
  created_at: string;
}

export interface WaybillContainerRow {
  id: number;
  waybill_id: number;
  container_id: number;
  seal_no: string | null;
  loaded_at: string | null;
  discharged_at: string | null;
}

export interface ContainerMovementRow {
  id: number;
  container_id: number;
  waybill_id: number | null;
  movement_type: ContainerMovementType;
  node_id: number | null;
  occurred_at: string;
  operator_user_id: number | null;
  condition_text: string | null;
  photo_url: string | null;
  remark: string | null;
  created_at: string;
}

export interface DepotStorageRow {
  id: number;
  container_id: number;
  node_id: number;
  waybill_id: number | null;
  start_at: string;
  end_at: string | null;
  storage_days: number;
  fee_amount: number;
  status: StorageStatus;
  created_at: string;
}

export interface NotarizeRecordRow {
  id: number;
  biz_type: NotarizeBizType;
  biz_id: number;
  event_type: string;
  payload_hash: string;
  prev_hash: string;
  hash: string;
  block_height: number;
  tx_id: string;
  created_at: string;
}

export interface WaybillRow {
  id: number;
  waybill_no: string;
  waybill_type: WaybillType;
  parent_waybill_id: number | null;
  mode: SegmentMode | null;
  carrier_partner_id: number | null;
  order_id: number;
  status: WaybillStatus;
  signer_name: string | null;
  signed_at: string | null;
  issued_at: string | null;
  document_no: string | null;
  notarize_tx_id: string | null;
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
  bill_type: BillType;
  counterparty_type: CounterpartyType | null;
  counterparty_id: number | null;
  source: BillSource;
  period: string | null;
  due_date: string | null;
  order_id: number;
  waybill_id: number;
  total_amount: number;
  tax_amount: number;
  profit_amount: number;
  status: BillStatus;
  segment_breakdown: unknown;
  issued_at: string;
  paid_at: string | null;
}

export interface BillItemRow {
  id: number;
  bill_id: number;
  seq: number;
  mode: BillItemMode;
  charge_type: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
  tax_rate: number;
  tax_amount: number;
  cost_amount: number;
  segment_id: number | null;
  created_at: string;
}

export interface ReconciliationRow {
  id: number;
  recon_no: string;
  counterparty_type: CounterpartyType;
  counterparty_id: number;
  period_start: string;
  period_end: string;
  total_amount: number;
  confirmed_amount: number;
  difference_amount: number;
  status: ReconStatus;
  sent_at: string | null;
  confirmed_at: string | null;
  created_by: number | null;
  created_at: string;
}

export interface ReconciliationItemRow {
  id: number;
  recon_id: number;
  bill_id: number;
  amount: number;
  confirmed_amount: number;
  difference_reason: string | null;
  status: ReconItemStatus;
}

export interface InvoiceRow {
  id: number;
  invoice_no: string;
  invoice_type: InvoiceType;
  bill_id: number;
  order_id: number | null;
  buyer_name: string;
  buyer_tax_no: string | null;
  seller_name: string;
  seller_tax_no: string | null;
  amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  status: InvoiceStatus;
  issued_at: string | null;
  voided_at: string | null;
  created_by: number | null;
  created_at: string;
}

export interface PaymentRow {
  id: number;
  payment_no: string;
  direction: PaymentDirection;
  counterparty_type: CounterpartyType;
  counterparty_id: number | null;
  bill_id: number | null;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  bank_serial: string | null;
  paid_at: string | null;
  remark: string | null;
  created_by: number | null;
  created_at: string;
}

export interface PaymentAllocationRow {
  id: number;
  payment_id: number;
  bill_id: number;
  amount: number;
  created_at: string;
}

export interface FactoringApplicationRow {
  id: number;
  app_no: string;
  order_id: number | null;
  bill_id: number;
  applicant_customer_id: number;
  finance_partner_id: number;
  amount: number;
  discount_rate: number;
  fee: number;
  status: FactoringStatus;
  applied_at: string;
  approved_at: string | null;
  settled_at: string | null;
  created_by: number | null;
}

export interface InsurancePolicyRow {
  id: number;
  policy_no: string;
  order_id: number;
  waybill_id: number | null;
  insurer_partner_id: number;
  insured_amount: number;
  rate: number;
  premium: number;
  status: InsuranceStatus;
  effective_from: string;
  effective_to: string;
  created_by: number | null;
  created_at: string;
}

export interface StatDailyRow {
  id: number;
  stat_date: string;
  customer_id: number | null;
  mode: StatMode;
  order_count: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  created_at: string;
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

// ── Stage 1 平台表 ──────────────────────────────────────────────────────────

export interface CustomerRow {
  id: number;
  customer_no: string;
  name: string;
  short_name: string;
  credit_code: string;
  contact_name: string;
  contact_phone: string;
  email: string | null;
  region_code: string;
  address: string;
  industry: string;
  credit_level: 'AAA' | 'AA' | 'A' | 'B' | 'C';
  status: ActiveStatus;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerRow {
  id: number;
  partner_no: string;
  name: string;
  short_name: string;
  type: PartnerType;
  credit_code: string;
  contact_name: string;
  contact_phone: string;
  email: string | null;
  region_code: string;
  address: string;
  qualifications: unknown;
  rating: number;
  settlement_account: string | null;
  status: ActiveStatus;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortStationRow {
  id: number;
  node_code: string;
  node_name: string;
  node_type: NodeType;
  region_code: string;
  address: string;
  lng: number;
  lat: number;
  operator_partner_id: number | null;
  capacity_teu: number | null;
  operating_hours: string | null;
  status: ActiveStatus;
  created_at: string;
}

export interface RouteTemplateRow {
  id: number;
  route_code: string;
  route_name: string;
  origin_node_id: number;
  destination_node_id: number;
  transit_node_ids: unknown;
  modes: unknown;
  distance_km: number;
  transit_days: number;
  base_cost: number;
  reliability: number;
  status: ActiveStatus;
  remark: string | null;
  created_at: string;
}

export interface GoodsCatalogRow {
  id: number;
  goods_code: string;
  goods_name: string;
  category: string;
  hs_code: string | null;
  dangerous_flag: number | boolean;
  packaging: string | null;
  unit: string;
  default_weight: number | null;
  status: ActiveStatus;
}

export interface ContainerTypeRow {
  id: number;
  code: string;
  name: string;
  inner_volume_cbm: number;
  max_payload_t: number;
  tare_weight_t: number;
  teu: number;
  status: ActiveStatus;
}

export interface PriceRuleRow {
  id: number;
  rule_no: string;
  rule_name: string;
  mode: PriceRuleMode;
  charge_type: ChargeType;
  carrier_partner_id: number | null;
  route_template_id: number | null;
  origin_node_id: number | null;
  destination_node_id: number | null;
  container_type_id: number | null;
  customer_id: number | null;
  contract_id: number | null;
  calc_method: CalcMethod;
  unit_price: number;
  unit: string;
  min_charge: number;
  ladder: unknown;
  currency: string;
  priority: number;
  effective_from: string;
  effective_to: string;
  status: ActiveStatus;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractRow {
  id: number;
  contract_no: string;
  customer_id: number;
  contract_type: ContractType;
  title: string;
  effective_from: string;
  effective_to: string;
  payment_terms: string;
  credit_limit: number;
  discount_rate: number;
  settle_currency: string;
  status: ContractStatus;
  signer_name: string | null;
  signed_at: string | null;
  sign_hash: string | null;
  file_url: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteRow {
  id: number;
  quote_no: string;
  customer_id: number;
  order_type: OrderType;
  route_template_id: number;
  origin_node_id: number;
  destination_node_id: number;
  container_type_id: number;
  container_count: number;
  goods_code: string | null;
  cargo_name: string;
  cargo_weight: number;
  required_date: string;
  transit_days: number;
  valid_until: string;
  total_amount: number;
  cost_amount: number;
  currency: string;
  status: QuoteStatus;
  created_by: number;
  sent_at: string | null;
  accepted_at: string | null;
  order_id: number | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteItemRow {
  id: number;
  quote_id: number;
  seq: number;
  mode: 'ROAD' | 'SEA' | 'RAIL' | 'PORT';
  charge_type: ChargeType;
  description: string;
  carrier_partner_id: number | null;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
  cost_amount: number;
  calculation: unknown;
}

export interface OrderCargoRow {
  id: number;
  order_id: number;
  seq: number;
  goods_code: string | null;
  goods_name: string;
  quantity: number;
  unit: string;
  weight_t: number;
  volume_cbm: number | null;
  container_type_id: number | null;
  container_count: number;
  dangerous_flag: number | boolean;
  packaging: string | null;
  remark: string | null;
}

export interface IntegrationMessageRow {
  id: number;
  msg_no: string;
  system_code: string;
  system_name: string;
  direction: IntegrationDirection;
  msg_type: string;
  standard: string;
  related_type: string | null;
  related_id: string | null;
  payload: unknown;
  status: IntegrationStatus;
  retry_count: number;
  response_payload: unknown;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface AuditLogRow {
  id: number;
  user_id: number | null;
  username: string | null;
  role: string | null;
  action: string;
  action_label: string;
  module: string;
  target_type: string | null;
  target_id: string | null;
  detail: unknown;
  ip: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: number;
  user_id: number | null;
  role: string | null;
  type: NotificationType;
  title: string;
  content: string;
  related_type: string | null;
  related_id: string | null;
  read_flag: number | boolean;
  created_at: string;
}

export interface EventOutboxRow {
  id: number;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  retry_count: number;
  created_at: string;
  published_at: string | null;
}

export interface DictDataRow {
  id: number;
  dict_type: string;
  dict_key: string;
  dict_label: string;
  sort_no: number;
  status: ActiveStatus;
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
  // Stage 1 新增字段
  orderType: OrderType;
  orderTypeLabel: string;
  source: OrderSource;
  sourceLabel: string;
  customerName: string | null;
  totalAmount: number;
  currency: string;
  priority: Priority;
  priorityLabel: string;
  contractNo: string | null;
  quoteNo: string | null;
}

export interface VehicleRow {
  id: number;
  vehicle_no: string;
  plate_no: string;
  vehicle_type: VehicleType;
  carrier_partner_id: number;
  driver_name: string;
  driver_phone: string;
  capacity_t: number;
  container_slots: number;
  gps_device_no: string | null;
  status: VehicleStatus;
  current_node_id: number | null;
  lng: number | null;
  lat: number | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface TrainScheduleRow {
  id: number;
  train_no: string;
  operator_partner_id: number;
  origin_node_id: number;
  dest_node_id: number;
  departure_at: string;
  arrival_at: string;
  capacity_teu: number;
  booked_teu: number;
  status: ScheduleStatus;
  price_index: number;
  created_at: string;
}

export interface VesselScheduleRow {
  id: number;
  vessel_name: string;
  voyage: string;
  carrier_partner_id: number;
  origin_node_id: number;
  dest_node_id: number;
  etd: string;
  eta: string;
  capacity_teu: number;
  booked_teu: number;
  status: ScheduleStatus;
  price_index: number;
  created_at: string;
}

export interface DispatchPlanRow {
  id: number;
  plan_no: string;
  order_id: number;
  waybill_id: number | null;
  strategy: PlanStrategy;
  total_cost: number;
  total_hours: number;
  reliability: number;
  score: number;
  status: PlanStatus;
  summary: string | null;
  created_by: number | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface DispatchPlanItemRow {
  id: number;
  plan_id: number;
  seq: number;
  mode: SegmentMode;
  carrier_partner_id: number | null;
  resource_type: ResourceType;
  resource_id: number | null;
  start_node_id: number;
  end_node_id: number;
  start_at: string;
  end_at: string;
  cost: number;
  transit_hours: number;
  reliability: number;
}

export interface TransferWindowRow {
  id: number;
  plan_id: number;
  node_id: number;
  from_seq: number;
  to_seq: number;
  arrival_at: string;
  departure_at: string;
  wait_hours: number;
  status: TransferWindowStatus;
  created_at: string;
}

export interface AlertRow {
  id: number;
  alert_no: string;
  alert_type: AlertType;
  level: AlertLevel;
  waybill_id: number | null;
  segment_id: number | null;
  container_id: number | null;
  node_id: number | null;
  title: string;
  content: string;
  status: AlertStatus;
  occurred_at: string;
  acked_by: number | null;
  acked_at: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface ExceptionTicketRow {
  id: number;
  ticket_no: string;
  alert_id: number | null;
  order_id: number | null;
  waybill_id: number | null;
  type: string;
  description: string;
  assignee_user_id: number | null;
  status: TicketStatus;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface IotDeviceRow {
  id: number;
  device_no: string;
  device_type: DeviceType;
  container_id: number | null;
  vehicle_id: number | null;
  status: DeviceStatus;
  last_seen_at: string | null;
  created_at: string;
}

export interface IotReadingRow {
  id: number;
  device_id: number;
  container_id: number | null;
  temperature: number | null;
  humidity: number | null;
  door_open: number | boolean;
  impact_g: number | null;
  lng: number | null;
  lat: number | null;
  reported_at: string;
  created_at: string;
}

export interface GeoFenceRow {
  id: number;
  name: string;
  fence_type: FenceType;
  node_id: number | null;
  center_lng: number;
  center_lat: number;
  radius_m: number;
  status: FenceStatus;
  created_at: string;
}

// 把 AuthUser / permissions 挂到 Express Request 上
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      permissions?: string[];
    }
  }
}
