-- 多式联运演示版 v1 — Stage 3 schema（44 张表 = Stage2 33 + 11 张调度/监控/IoT 表，utf8mb4 / InnoDB）
-- 由 api/db/init.mjs 执行：先 DROP 全部表再建表，保证演示数据可重置。
-- 约定：JSON 输出 camelCase；表名 orders 避开 MySQL 保留字 order；v0 字段只增不改。

SET NAMES utf8mb4;

DROP TABLE IF EXISTS exception_ticket;
DROP TABLE IF EXISTS alert;
DROP TABLE IF EXISTS transfer_window;
DROP TABLE IF EXISTS dispatch_plan_item;
DROP TABLE IF EXISTS dispatch_plan;
DROP TABLE IF EXISTS iot_reading;
DROP TABLE IF EXISTS iot_device;
DROP TABLE IF EXISTS geo_fence;
DROP TABLE IF EXISTS vessel_schedule;
DROP TABLE IF EXISTS train_schedule;
DROP TABLE IF EXISTS vehicle;
DROP TABLE IF EXISTS notarize_record;
DROP TABLE IF EXISTS depot_storage;
DROP TABLE IF EXISTS container_movement;
DROP TABLE IF EXISTS waybill_container;
DROP TABLE IF EXISTS waybill_event;
DROP TABLE IF EXISTS document;
DROP TABLE IF EXISTS e_seal;
DROP TABLE IF EXISTS notification;
DROP TABLE IF EXISTS event_outbox;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS integration_message;
DROP TABLE IF EXISTS order_cargo;
DROP TABLE IF EXISTS bill;
DROP TABLE IF EXISTS track_point;
DROP TABLE IF EXISTS waybill_segment;
DROP TABLE IF EXISTS container;
DROP TABLE IF EXISTS waybill;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS quote_item;
DROP TABLE IF EXISTS quote;
DROP TABLE IF EXISTS contract;
DROP TABLE IF EXISTS user;
DROP TABLE IF EXISTS price_rule;
DROP TABLE IF EXISTS container_type;
DROP TABLE IF EXISTS goods_catalog;
DROP TABLE IF EXISTS route_template;
DROP TABLE IF EXISTS port_station;
DROP TABLE IF EXISTS partner;
DROP TABLE IF EXISTS customer;
DROP TABLE IF EXISTS role_permission;
DROP TABLE IF EXISTS permission;
DROP TABLE IF EXISTS role;
DROP TABLE IF EXISTS dict_data;

-- ── 平台基础：角色 / 权限 / 字典 ────────────────────────────────────────────
CREATE TABLE role (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  role_code   VARCHAR(30)  NOT NULL,
  role_name   VARCHAR(50)  NOT NULL,
  description VARCHAR(200) NULL,
  sort_no     INT          NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_role_code (role_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE permission (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  permission_code VARCHAR(80)  NOT NULL,
  permission_name VARCHAR(80)  NOT NULL,
  module          VARCHAR(30)  NOT NULL,
  perm_type       ENUM('MENU','BUTTON','API') NOT NULL DEFAULT 'MENU',
  sort_no         INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_permission_code (permission_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE role_permission (
  role_id       BIGINT NOT NULL,
  permission_id BIGINT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES role (id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permission (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE dict_data (
  id        BIGINT       NOT NULL AUTO_INCREMENT,
  dict_type VARCHAR(50)  NOT NULL,
  dict_key  VARCHAR(50)  NOT NULL,
  dict_label VARCHAR(100) NOT NULL,
  sort_no   INT          NOT NULL DEFAULT 0,
  status    ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (id),
  UNIQUE KEY uk_dict (dict_type, dict_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 主数据：客户 / 伙伴 / 港站 / 线路 / 货物 / 箱型 / 价格 ─────────────────
CREATE TABLE customer (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  customer_no   VARCHAR(20)  NOT NULL,
  name          VARCHAR(100) NOT NULL,
  short_name    VARCHAR(50)  NOT NULL,
  credit_code   CHAR(18)     NOT NULL,
  contact_name  VARCHAR(50)  NOT NULL,
  contact_phone VARCHAR(30)  NOT NULL,
  email         VARCHAR(100) NULL,
  region_code   CHAR(6)      NOT NULL,
  address       VARCHAR(200) NOT NULL,
  industry      VARCHAR(50)  NOT NULL,
  credit_level  ENUM('AAA','AA','A','B','C') NOT NULL DEFAULT 'A',
  status        ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  remark        VARCHAR(255) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_customer_no (customer_no),
  UNIQUE KEY uk_customer_credit (credit_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE partner (
  id                 BIGINT       NOT NULL AUTO_INCREMENT,
  partner_no         VARCHAR(20)  NOT NULL,
  name               VARCHAR(100) NOT NULL,
  short_name         VARCHAR(50)  NOT NULL,
  type               ENUM('ROAD_CARRIER','RAIL_OPERATOR','SEA_CARRIER','PORT','RAIL_STATION','DEPOT','WAREHOUSE','FORWARDER','FINANCE','INSURANCE','REGULATOR') NOT NULL,
  credit_code        CHAR(18)     NOT NULL,
  contact_name       VARCHAR(50)  NOT NULL,
  contact_phone      VARCHAR(30)  NOT NULL,
  email              VARCHAR(100) NULL,
  region_code        CHAR(6)      NOT NULL,
  address            VARCHAR(200) NOT NULL,
  qualifications     JSON         NULL,
  rating             DECIMAL(3,2) NOT NULL DEFAULT 4.50,
  settlement_account VARCHAR(50)  NULL,
  status             ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  remark             VARCHAR(255) NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_partner_no (partner_no),
  UNIQUE KEY uk_partner_credit (credit_code),
  KEY idx_partner_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE port_station (
  id                  BIGINT       NOT NULL AUTO_INCREMENT,
  node_code           VARCHAR(20)  NOT NULL,
  node_name           VARCHAR(100) NOT NULL,
  node_type           ENUM('PORT','RAIL_STATION','DEPOT','WAREHOUSE') NOT NULL,
  region_code         CHAR(6)      NOT NULL,
  address             VARCHAR(200) NOT NULL,
  lng                 DECIMAL(9,6) NOT NULL,
  lat                 DECIMAL(9,6) NOT NULL,
  operator_partner_id BIGINT       NULL,
  capacity_teu        INT          NULL,
  operating_hours     VARCHAR(50)  NULL,
  status              ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_node_code (node_code),
  KEY idx_node_type (node_type),
  CONSTRAINT fk_node_operator FOREIGN KEY (operator_partner_id) REFERENCES partner (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE route_template (
  id                  BIGINT        NOT NULL AUTO_INCREMENT,
  route_code          VARCHAR(20)   NOT NULL,
  route_name          VARCHAR(100)  NOT NULL,
  origin_node_id      BIGINT        NOT NULL,
  destination_node_id BIGINT        NOT NULL,
  transit_node_ids    JSON          NOT NULL,
  modes               JSON          NOT NULL,
  distance_km         INT           NOT NULL,
  transit_days        DECIMAL(4,1)  NOT NULL,
  base_cost           DECIMAL(12,2) NOT NULL,
  reliability         DECIMAL(5,2)  NOT NULL DEFAULT 95.00,
  status              ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  remark              VARCHAR(255)  NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_route_code (route_code),
  CONSTRAINT fk_route_origin FOREIGN KEY (origin_node_id) REFERENCES port_station (id),
  CONSTRAINT fk_route_dest FOREIGN KEY (destination_node_id) REFERENCES port_station (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE goods_catalog (
  id             BIGINT        NOT NULL AUTO_INCREMENT,
  goods_code     VARCHAR(20)   NOT NULL,
  goods_name     VARCHAR(100)  NOT NULL,
  category       VARCHAR(50)   NOT NULL,
  hs_code        VARCHAR(20)   NULL,
  dangerous_flag TINYINT(1)    NOT NULL DEFAULT 0,
  packaging      VARCHAR(50)   NULL,
  unit           VARCHAR(20)   NOT NULL DEFAULT '箱',
  default_weight DECIMAL(10,2) NULL,
  status         ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (id),
  UNIQUE KEY uk_goods_code (goods_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE container_type (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  code             VARCHAR(10)  NOT NULL,
  name             VARCHAR(50)  NOT NULL,
  inner_volume_cbm DECIMAL(6,2) NOT NULL,
  max_payload_t    DECIMAL(6,2) NOT NULL,
  tare_weight_t    DECIMAL(6,2) NOT NULL,
  teu              DECIMAL(3,1) NOT NULL,
  status           ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ct_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE price_rule (
  id                 BIGINT        NOT NULL AUTO_INCREMENT,
  rule_no            VARCHAR(20)   NOT NULL,
  rule_name          VARCHAR(120)  NOT NULL,
  mode               ENUM('ROAD','SEA','RAIL','PORT','OTHER') NOT NULL,
  charge_type        ENUM('BASE','SURCHARGE') NOT NULL DEFAULT 'BASE',
  carrier_partner_id BIGINT        NULL,
  route_template_id  BIGINT        NULL,
  origin_node_id     BIGINT        NULL,
  destination_node_id BIGINT       NULL,
  container_type_id  BIGINT        NULL,
  customer_id        BIGINT        NULL,
  contract_id        BIGINT        NULL,
  calc_method        ENUM('PER_CONTAINER','PER_KM','PER_TON','PER_TEU','FLAT') NOT NULL,
  unit_price         DECIMAL(12,2) NOT NULL,
  unit               VARCHAR(20)   NOT NULL DEFAULT '元',
  min_charge         DECIMAL(12,2) NOT NULL DEFAULT 0,
  ladder             JSON          NULL,
  currency           CHAR(3)       NOT NULL DEFAULT 'CNY',
  priority           INT           NOT NULL DEFAULT 100,
  effective_from     DATE          NOT NULL,
  effective_to       DATE          NOT NULL,
  status             ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  remark             VARCHAR(255)  NULL,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_rule_no (rule_no),
  KEY idx_rule_mode (mode),
  KEY idx_rule_route (route_template_id),
  CONSTRAINT fk_rule_carrier FOREIGN KEY (carrier_partner_id) REFERENCES partner (id),
  CONSTRAINT fk_rule_route FOREIGN KEY (route_template_id) REFERENCES route_template (id),
  CONSTRAINT fk_rule_container_type FOREIGN KEY (container_type_id) REFERENCES container_type (id),
  CONSTRAINT fk_rule_customer FOREIGN KEY (customer_id) REFERENCES customer (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 账号与合同 ─────────────────────────────────────────────────────────────
CREATE TABLE user (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)  NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  display_name  VARCHAR(50)  NOT NULL,
  role          ENUM('SHIPPER','FORWARDER','MTO','CARRIER','RAIL_CARRIER','SEA_CARRIER','TERMINAL','SETTLEMENT','ADMIN') NOT NULL,
  customer_id   BIGINT       NULL,
  partner_id    BIGINT       NULL,
  phone         VARCHAR(30)  NULL,
  email         VARCHAR(100) NULL,
  status        ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  last_login_at DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_username (username),
  KEY idx_user_role (role),
  CONSTRAINT fk_user_customer FOREIGN KEY (customer_id) REFERENCES customer (id),
  CONSTRAINT fk_user_partner FOREIGN KEY (partner_id) REFERENCES partner (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE contract (
  id              BIGINT        NOT NULL AUTO_INCREMENT,
  contract_no     VARCHAR(20)   NOT NULL,
  customer_id     BIGINT        NOT NULL,
  contract_type   ENUM('FRAMEWORK','SPOT') NOT NULL DEFAULT 'FRAMEWORK',
  title           VARCHAR(120)  NOT NULL,
  effective_from  DATE          NOT NULL,
  effective_to    DATE          NOT NULL,
  payment_terms   VARCHAR(50)   NOT NULL,
  credit_limit    DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_rate   DECIMAL(5,2)  NOT NULL DEFAULT 0,
  settle_currency CHAR(3)       NOT NULL DEFAULT 'CNY',
  status          ENUM('DRAFT','PENDING_SIGN','SIGNED','TERMINATED') NOT NULL DEFAULT 'DRAFT',
  signer_name     VARCHAR(50)   NULL,
  signed_at       DATETIME      NULL,
  sign_hash       CHAR(64)      NULL,
  file_url        VARCHAR(255)  NULL,
  created_by      BIGINT        NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_contract_no (contract_no),
  KEY idx_contract_customer (customer_id),
  CONSTRAINT fk_contract_customer FOREIGN KEY (customer_id) REFERENCES customer (id),
  CONSTRAINT fk_contract_creator FOREIGN KEY (created_by) REFERENCES user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 报价 ───────────────────────────────────────────────────────────────────
CREATE TABLE quote (
  id                  BIGINT        NOT NULL AUTO_INCREMENT,
  quote_no            VARCHAR(20)   NOT NULL,
  customer_id         BIGINT        NOT NULL,
  order_type          ENUM('ROAD_RAIL','RAIL_SEA','ROAD_RAIL_SEA') NOT NULL,
  route_template_id   BIGINT        NOT NULL,
  origin_node_id      BIGINT        NOT NULL,
  destination_node_id BIGINT        NOT NULL,
  container_type_id   BIGINT        NOT NULL,
  container_count     INT           NOT NULL,
  goods_code          VARCHAR(20)   NULL,
  cargo_name          VARCHAR(100)  NOT NULL,
  cargo_weight        DECIMAL(12,2) NOT NULL,
  required_date       DATE          NOT NULL,
  transit_days        DECIMAL(4,1)  NOT NULL,
  valid_until         DATE          NOT NULL,
  total_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost_amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency            CHAR(3)       NOT NULL DEFAULT 'CNY',
  status              ENUM('DRAFT','SENT','ACCEPTED','EXPIRED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  created_by          BIGINT        NOT NULL,
  sent_at             DATETIME      NULL,
  accepted_at         DATETIME      NULL,
  order_id            BIGINT        NULL,
  remark              VARCHAR(255)  NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_quote_no (quote_no),
  KEY idx_quote_customer (customer_id),
  KEY idx_quote_status (status),
  CONSTRAINT fk_quote_customer FOREIGN KEY (customer_id) REFERENCES customer (id),
  CONSTRAINT fk_quote_route FOREIGN KEY (route_template_id) REFERENCES route_template (id),
  CONSTRAINT fk_quote_ct FOREIGN KEY (container_type_id) REFERENCES container_type (id),
  CONSTRAINT fk_quote_creator FOREIGN KEY (created_by) REFERENCES user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE quote_item (
  id                 BIGINT        NOT NULL AUTO_INCREMENT,
  quote_id           BIGINT        NOT NULL,
  seq                INT           NOT NULL,
  mode               ENUM('ROAD','SEA','RAIL','PORT') NOT NULL,
  charge_type        ENUM('BASE','SURCHARGE') NOT NULL DEFAULT 'BASE',
  description        VARCHAR(120)  NOT NULL,
  carrier_partner_id BIGINT        NULL,
  quantity           DECIMAL(12,2) NOT NULL,
  unit               VARCHAR(20)   NOT NULL,
  unit_price         DECIMAL(12,2) NOT NULL,
  amount             DECIMAL(12,2) NOT NULL,
  cost_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  calculation        JSON          NULL,
  PRIMARY KEY (id),
  KEY idx_quote_item_quote (quote_id),
  CONSTRAINT fk_quote_item_quote FOREIGN KEY (quote_id) REFERENCES quote (id) ON DELETE CASCADE,
  CONSTRAINT fk_quote_item_carrier FOREIGN KEY (carrier_partner_id) REFERENCES partner (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 订单（v0 字段 + v1 扩展） ───────────────────────────────────────────────
CREATE TABLE orders (
  id                       BIGINT        NOT NULL AUTO_INCREMENT,
  order_no                 VARCHAR(32)   NOT NULL,
  shipper_id               BIGINT        NOT NULL,
  status                   ENUM('CREATED','CONTRACTED','CONFIRMED','DISPATCHED','IN_TRANSIT','ARRIVED','SIGNED','BILLED','CANCELLED') NOT NULL DEFAULT 'CREATED',
  cargo_name               VARCHAR(100)  NOT NULL,
  cargo_weight             DECIMAL(12,2) NOT NULL,
  container_type           VARCHAR(20)   NOT NULL,
  container_count          INT           NOT NULL,
  origin                   VARCHAR(100)  NOT NULL,
  destination              VARCHAR(100)  NOT NULL,
  required_pickup_date     DATE          NOT NULL,
  remark                   VARCHAR(255)  NULL,
  order_type               ENUM('ROAD_RAIL','RAIL_SEA','ROAD_RAIL_SEA') NOT NULL DEFAULT 'ROAD_RAIL_SEA',
  customer_id              BIGINT        NULL,
  consignee_customer_id    BIGINT        NULL,
  notify_customer_id       BIGINT        NULL,
  contract_id              BIGINT        NULL,
  quote_id                 BIGINT        NULL,
  route_template_id        BIGINT        NULL,
  priority                 ENUM('NORMAL','URGENT') NOT NULL DEFAULT 'NORMAL',
  source                   ENUM('QUICK','QUOTE') NOT NULL DEFAULT 'QUICK',
  total_amount             DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency                 CHAR(3)       NOT NULL DEFAULT 'CNY',
  created_at               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_orders_no (order_no),
  KEY idx_orders_shipper (shipper_id),
  KEY idx_orders_status (status),
  KEY idx_orders_customer (customer_id),
  CONSTRAINT fk_orders_shipper FOREIGN KEY (shipper_id) REFERENCES user (id),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customer (id),
  CONSTRAINT fk_orders_consignee FOREIGN KEY (consignee_customer_id) REFERENCES customer (id),
  CONSTRAINT fk_orders_notify FOREIGN KEY (notify_customer_id) REFERENCES customer (id),
  CONSTRAINT fk_orders_contract FOREIGN KEY (contract_id) REFERENCES contract (id),
  CONSTRAINT fk_orders_quote FOREIGN KEY (quote_id) REFERENCES quote (id),
  CONSTRAINT fk_orders_route FOREIGN KEY (route_template_id) REFERENCES route_template (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE order_cargo (
  id                BIGINT        NOT NULL AUTO_INCREMENT,
  order_id          BIGINT        NOT NULL,
  seq               INT           NOT NULL,
  goods_code        VARCHAR(20)   NULL,
  goods_name        VARCHAR(100)  NOT NULL,
  quantity          DECIMAL(12,2) NOT NULL,
  unit              VARCHAR(20)   NOT NULL,
  weight_t          DECIMAL(12,2) NOT NULL,
  volume_cbm        DECIMAL(12,2) NULL,
  container_type_id BIGINT        NULL,
  container_count   INT           NOT NULL DEFAULT 0,
  dangerous_flag    TINYINT(1)    NOT NULL DEFAULT 0,
  packaging         VARCHAR(50)   NULL,
  remark            VARCHAR(255)  NULL,
  PRIMARY KEY (id),
  KEY idx_order_cargo_order (order_id),
  CONSTRAINT fk_order_cargo_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_cargo_ct FOREIGN KEY (container_type_id) REFERENCES container_type (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── v0 履约表（结构保持） ───────────────────────────────────────────────────
CREATE TABLE container (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  order_id       BIGINT       NOT NULL,
  container_no   VARCHAR(30)  NOT NULL,
  type           VARCHAR(20)  NOT NULL,
  seal_no        VARCHAR(30)  NULL,
  status         ENUM('EMPTY','GATE_IN','LOADED','IN_TRANSIT','ARRIVED','DELIVERED') NOT NULL DEFAULT 'EMPTY',
  condition_text VARCHAR(100) NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_container_no (container_no),
  KEY idx_container_order (order_id),
  CONSTRAINT fk_container_order FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE waybill (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  waybill_no   VARCHAR(32)  NOT NULL,
  order_id     BIGINT       NOT NULL,
  status       ENUM('PENDING','IN_TRANSIT','ARRIVED','SIGNED') NOT NULL DEFAULT 'PENDING',
  signer_name  VARCHAR(50)  NULL,
  signed_at    DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_waybill_no (waybill_no),
  KEY idx_waybill_order (order_id),
  CONSTRAINT fk_waybill_order FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE waybill_segment (
  id              BIGINT        NOT NULL AUTO_INCREMENT,
  waybill_id      BIGINT        NOT NULL,
  seq             INT           NOT NULL,
  mode            ENUM('ROAD','SEA','RAIL') NOT NULL,
  carrier_code    VARCHAR(30)   NOT NULL,
  carrier_name    VARCHAR(50)   NOT NULL,
  carrier_user_id BIGINT        NULL,
  start_node      VARCHAR(100)  NOT NULL,
  end_node        VARCHAR(100)  NOT NULL,
  planned_start   DATETIME      NOT NULL,
  planned_end     DATETIME      NOT NULL,
  actual_start    DATETIME      NULL,
  actual_end      DATETIME      NULL,
  accepted_at     DATETIME      NULL,
  status          ENUM('PENDING','ACCEPTED','IN_TRANSIT','ARRIVED','COMPLETED') NOT NULL DEFAULT 'PENDING',
  cost_amount     DECIMAL(12,2) NOT NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_segment_seq (waybill_id, seq),
  KEY idx_segment_carrier_user (carrier_user_id),
  CONSTRAINT fk_segment_waybill FOREIGN KEY (waybill_id) REFERENCES waybill (id),
  CONSTRAINT fk_segment_carrier_user FOREIGN KEY (carrier_user_id) REFERENCES user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE track_point (
  id          BIGINT        NOT NULL AUTO_INCREMENT,
  waybill_id  BIGINT        NOT NULL,
  segment_id  BIGINT        NULL,
  seq         INT           NOT NULL,
  node_name   VARCHAR(100)  NOT NULL,
  lng         DECIMAL(9,6)  NOT NULL,
  lat         DECIMAL(9,6)  NOT NULL,
  occurred_at DATETIME      NOT NULL,
  source      ENUM('MOCK_GPS','MOCK_EDI','CARRIER_REPORT','TERMINAL_REPORT','MTO') NOT NULL,
  description VARCHAR(255)  NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_track_waybill_time (waybill_id, occurred_at),
  KEY idx_track_segment (segment_id),
  CONSTRAINT fk_track_waybill FOREIGN KEY (waybill_id) REFERENCES waybill (id),
  CONSTRAINT fk_track_segment FOREIGN KEY (segment_id) REFERENCES waybill_segment (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bill (
  id                 BIGINT        NOT NULL AUTO_INCREMENT,
  bill_no            VARCHAR(32)   NOT NULL,
  order_id           BIGINT        NOT NULL,
  waybill_id         BIGINT        NOT NULL,
  total_amount       DECIMAL(12,2) NOT NULL,
  status             ENUM('ISSUED','PAID') NOT NULL DEFAULT 'ISSUED',
  segment_breakdown  JSON          NOT NULL,
  issued_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at            DATETIME      NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_bill_no (bill_no),
  UNIQUE KEY uk_bill_order (order_id),
  KEY idx_bill_waybill (waybill_id),
  CONSTRAINT fk_bill_order FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT fk_bill_waybill FOREIGN KEY (waybill_id) REFERENCES waybill (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 平台治理：审计 / 集成 / 通知 / 事件发件箱 ──────────────────────────────
CREATE TABLE audit_log (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  user_id     BIGINT       NULL,
  username    VARCHAR(50)  NULL,
  role        VARCHAR(30)  NULL,
  action      VARCHAR(50)  NOT NULL,
  action_label VARCHAR(50) NOT NULL,
  module      VARCHAR(30)  NOT NULL,
  target_type VARCHAR(30)  NULL,
  target_id   VARCHAR(50)  NULL,
  detail      JSON         NULL,
  ip          VARCHAR(45)  NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_module_time (module, created_at),
  KEY idx_audit_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE integration_message (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  msg_no           VARCHAR(30)  NOT NULL,
  system_code      VARCHAR(30)  NOT NULL,
  system_name      VARCHAR(50)  NOT NULL,
  direction        ENUM('IN','OUT') NOT NULL,
  msg_type         VARCHAR(50)  NOT NULL,
  standard         VARCHAR(50)  NOT NULL,
  related_type     VARCHAR(30)  NULL,
  related_id       VARCHAR(50)  NULL,
  payload          JSON         NULL,
  status           ENUM('PENDING','SUCCESS','FAILED','RETRYING') NOT NULL DEFAULT 'PENDING',
  retry_count      INT          NOT NULL DEFAULT 0,
  response_payload JSON         NULL,
  error_message    VARCHAR(255) NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at     DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_msg_no (msg_no),
  KEY idx_msg_system (system_code),
  KEY idx_msg_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notification (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  user_id      BIGINT       NULL,
  role         VARCHAR(30)  NULL,
  type         ENUM('TODO','ALERT','INFO') NOT NULL DEFAULT 'INFO',
  title        VARCHAR(120) NOT NULL,
  content      VARCHAR(500) NOT NULL,
  related_type VARCHAR(30)  NULL,
  related_id   VARCHAR(50)  NULL,
  read_flag    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notify_user (user_id),
  CONSTRAINT fk_notify_user FOREIGN KEY (user_id) REFERENCES user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE event_outbox (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  event_type     VARCHAR(50)  NOT NULL,
  aggregate_type VARCHAR(30)  NOT NULL,
  aggregate_id   VARCHAR(50)  NOT NULL,
  payload        JSON         NULL,
  status         ENUM('PENDING','PUBLISHED','FAILED') NOT NULL DEFAULT 'PENDING',
  retry_count    INT          NOT NULL DEFAULT 0,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at   DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_outbox_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 2：一单制运单 / 单证 / 存证 / 箱管
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE e_seal (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  seal_no    VARCHAR(30)  NOT NULL,
  seal_name  VARCHAR(80)  NOT NULL,
  owner_type ENUM('PLATFORM','CUSTOMER','CARRIER','TERMINAL') NOT NULL,
  owner_id   BIGINT       NULL,
  ca_serial  VARCHAR(64)  NOT NULL,
  status     ENUM('ACTIVE','REVOKED') NOT NULL DEFAULT 'ACTIVE',
  issued_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_seal_no (seal_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE document (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  doc_no         VARCHAR(32)  NOT NULL,
  doc_type       ENUM('ORDER_CONFIRM','WAYBILL_MASTER','WAYBILL_SEGMENT','PACKING_LIST','POD','OTHER') NOT NULL,
  biz_type       ENUM('ORDER','WAYBILL','BILL','CONTRACT') NOT NULL,
  biz_id         BIGINT       NOT NULL,
  file_name      VARCHAR(120) NOT NULL,
  mime_type      VARCHAR(60)  NOT NULL DEFAULT 'application/pdf',
  file_path      VARCHAR(255) NULL,
  file_size      BIGINT       NOT NULL DEFAULT 0,
  content_hash   CHAR(64)     NULL,
  ocr_status     ENUM('NONE','PENDING','SUCCESS','FAILED') NOT NULL DEFAULT 'NONE',
  ocr_result     JSON         NULL,
  sign_status    ENUM('UNSIGNED','SIGNED') NOT NULL DEFAULT 'UNSIGNED',
  signed_at      DATETIME     NULL,
  sign_hash      CHAR(64)     NULL,
  seal_id        BIGINT       NULL,
  signer_name    VARCHAR(50)  NULL,
  notarize_tx_id VARCHAR(64)  NULL,
  created_by     BIGINT       NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_doc_no (doc_no),
  KEY idx_doc_biz (biz_type, biz_id),
  KEY idx_doc_type (doc_type),
  CONSTRAINT fk_doc_seal FOREIGN KEY (seal_id) REFERENCES e_seal (id),
  CONSTRAINT fk_doc_creator FOREIGN KEY (created_by) REFERENCES user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE waybill_event (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  waybill_id       BIGINT       NOT NULL,
  segment_id       BIGINT       NULL,
  event_type       ENUM('ISSUE','RELEASE','PICKUP','GATE_IN','LOAD','DEPART','ARRIVE','DISCHARGE','HANDOVER','POD','SIGN','NOTARIZE') NOT NULL,
  occurred_at      DATETIME     NOT NULL,
  node_id          BIGINT       NULL,
  operator_user_id BIGINT       NULL,
  description      VARCHAR(255) NULL,
  payload          JSON         NULL,
  prev_hash        CHAR(64)     NULL,
  hash             CHAR(64)     NULL,
  tx_id            VARCHAR(64)  NULL,
  block_height     INT          NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_event_waybill (waybill_id, occurred_at),
  KEY idx_event_segment (segment_id),
  CONSTRAINT fk_event_waybill FOREIGN KEY (waybill_id) REFERENCES waybill (id),
  CONSTRAINT fk_event_segment FOREIGN KEY (segment_id) REFERENCES waybill_segment (id),
  CONSTRAINT fk_event_node FOREIGN KEY (node_id) REFERENCES port_station (id),
  CONSTRAINT fk_event_user FOREIGN KEY (operator_user_id) REFERENCES user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE waybill_container (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  waybill_id    BIGINT       NOT NULL,
  container_id  BIGINT       NOT NULL,
  seal_no       VARCHAR(30)  NULL,
  loaded_at     DATETIME     NULL,
  discharged_at DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_waybill_container (waybill_id, container_id),
  KEY idx_wc_container (container_id),
  CONSTRAINT fk_wc_waybill FOREIGN KEY (waybill_id) REFERENCES waybill (id) ON DELETE CASCADE,
  CONSTRAINT fk_wc_container FOREIGN KEY (container_id) REFERENCES container (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE container_movement (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  container_id     BIGINT       NOT NULL,
  waybill_id       BIGINT       NULL,
  movement_type    ENUM('RELEASE','PICKUP','GATE_IN','LOAD','DEPART','ARRIVE','DISCHARGE','GATE_OUT','RETURN','REPAIR') NOT NULL,
  node_id          BIGINT       NULL,
  occurred_at      DATETIME     NOT NULL,
  operator_user_id BIGINT       NULL,
  condition_text   VARCHAR(120) NULL,
  photo_url        VARCHAR(255) NULL,
  remark           VARCHAR(255) NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_movement_container (container_id, occurred_at),
  KEY idx_movement_waybill (waybill_id),
  CONSTRAINT fk_movement_container FOREIGN KEY (container_id) REFERENCES container (id),
  CONSTRAINT fk_movement_waybill FOREIGN KEY (waybill_id) REFERENCES waybill (id),
  CONSTRAINT fk_movement_node FOREIGN KEY (node_id) REFERENCES port_station (id),
  CONSTRAINT fk_movement_user FOREIGN KEY (operator_user_id) REFERENCES user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE depot_storage (
  id            BIGINT        NOT NULL AUTO_INCREMENT,
  container_id  BIGINT        NOT NULL,
  node_id       BIGINT        NOT NULL,
  waybill_id    BIGINT        NULL,
  start_at      DATETIME      NOT NULL,
  end_at        DATETIME      NULL,
  storage_days  INT           NOT NULL DEFAULT 0,
  fee_amount    DECIMAL(12,2) NOT NULL DEFAULT 0,
  status        ENUM('STACKED','RELEASED') NOT NULL DEFAULT 'STACKED',
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_storage_container (container_id),
  KEY idx_storage_node (node_id),
  CONSTRAINT fk_storage_container FOREIGN KEY (container_id) REFERENCES container (id),
  CONSTRAINT fk_storage_node FOREIGN KEY (node_id) REFERENCES port_station (id),
  CONSTRAINT fk_storage_waybill FOREIGN KEY (waybill_id) REFERENCES waybill (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notarize_record (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  biz_type     ENUM('WAYBILL','DOCUMENT','CONTRACT','BILL','ORDER') NOT NULL,
  biz_id       BIGINT       NOT NULL,
  event_type   VARCHAR(50)  NOT NULL,
  payload_hash CHAR(64)     NOT NULL,
  prev_hash    CHAR(64)     NOT NULL,
  hash         CHAR(64)     NOT NULL,
  block_height INT          NOT NULL,
  tx_id        VARCHAR(64)  NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tx_id (tx_id),
  KEY idx_notarize_biz (biz_type, biz_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Stage 2 表扩展 ─────────────────────────────────────────────────────────
ALTER TABLE waybill
  ADD COLUMN waybill_type ENUM('MASTER','SEGMENT') NOT NULL DEFAULT 'MASTER' AFTER waybill_no,
  ADD COLUMN parent_waybill_id BIGINT NULL AFTER waybill_type,
  ADD COLUMN mode ENUM('ROAD','SEA','RAIL') NULL AFTER parent_waybill_id,
  ADD COLUMN carrier_partner_id BIGINT NULL AFTER mode,
  ADD COLUMN issued_at DATETIME NULL AFTER signed_at,
  ADD COLUMN document_no VARCHAR(32) NULL AFTER issued_at,
  ADD COLUMN notarize_tx_id VARCHAR(64) NULL AFTER document_no,
  ADD KEY idx_waybill_parent (parent_waybill_id),
  ADD CONSTRAINT fk_waybill_parent FOREIGN KEY (parent_waybill_id) REFERENCES waybill (id),
  ADD CONSTRAINT fk_waybill_carrier FOREIGN KEY (carrier_partner_id) REFERENCES partner (id);

ALTER TABLE container
  MODIFY COLUMN status ENUM('EMPTY','RELEASED','GATE_IN','LOADED','IN_TRANSIT','ARRIVED','DELIVERED','RETURNED','IN_REPAIR','AT_DEPOT') NOT NULL DEFAULT 'EMPTY',
  ADD COLUMN current_node_id BIGINT NULL AFTER condition_text,
  ADD COLUMN current_waybill_id BIGINT NULL AFTER current_node_id,
  ADD COLUMN owner_partner_id BIGINT NULL AFTER current_waybill_id,
  ADD COLUMN repair_fee DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER owner_partner_id,
  ADD KEY idx_container_node (current_node_id),
  ADD CONSTRAINT fk_container_node FOREIGN KEY (current_node_id) REFERENCES port_station (id),
  ADD CONSTRAINT fk_container_waybill FOREIGN KEY (current_waybill_id) REFERENCES waybill (id),
  ADD CONSTRAINT fk_container_owner FOREIGN KEY (owner_partner_id) REFERENCES partner (id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 3：运力池 / 智能调度 / 预警 / IoT / 电子围栏
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE vehicle (
  id                 BIGINT       NOT NULL AUTO_INCREMENT,
  vehicle_no         VARCHAR(30)  NOT NULL,
  plate_no           VARCHAR(20)  NOT NULL,
  vehicle_type       ENUM('TRACTOR','TRAILER','VAN') NOT NULL DEFAULT 'TRACTOR',
  carrier_partner_id BIGINT       NOT NULL,
  driver_name        VARCHAR(50)  NOT NULL,
  driver_phone       VARCHAR(30)  NOT NULL,
  capacity_t         DECIMAL(6,2) NOT NULL DEFAULT 30.00,
  container_slots    INT          NOT NULL DEFAULT 1,
  gps_device_no      VARCHAR(30)  NULL,
  status             ENUM('IDLE','IN_TASK','MAINTENANCE') NOT NULL DEFAULT 'IDLE',
  current_node_id    BIGINT       NULL,
  lng                DECIMAL(9,6) NULL,
  lat                DECIMAL(9,6) NULL,
  last_seen_at       DATETIME     NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_vehicle_no (vehicle_no),
  KEY idx_vehicle_status (status),
  CONSTRAINT fk_vehicle_carrier FOREIGN KEY (carrier_partner_id) REFERENCES partner (id),
  CONSTRAINT fk_vehicle_node FOREIGN KEY (current_node_id) REFERENCES port_station (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE train_schedule (
  id                  BIGINT        NOT NULL AUTO_INCREMENT,
  train_no            VARCHAR(20)   NOT NULL,
  operator_partner_id BIGINT        NOT NULL,
  origin_node_id      BIGINT        NOT NULL,
  dest_node_id        BIGINT        NOT NULL,
  departure_at        DATETIME      NOT NULL,
  arrival_at          DATETIME      NOT NULL,
  capacity_teu        INT           NOT NULL DEFAULT 50,
  booked_teu          INT           NOT NULL DEFAULT 0,
  status              ENUM('PLANNED','OPEN','DEPARTED','ARRIVED','CANCELLED') NOT NULL DEFAULT 'PLANNED',
  price_index         DECIMAL(6,2)  NOT NULL DEFAULT 100.00,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_train_no (train_no),
  KEY idx_train_status (status),
  CONSTRAINT fk_train_operator FOREIGN KEY (operator_partner_id) REFERENCES partner (id),
  CONSTRAINT fk_train_origin FOREIGN KEY (origin_node_id) REFERENCES port_station (id),
  CONSTRAINT fk_train_dest FOREIGN KEY (dest_node_id) REFERENCES port_station (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE vessel_schedule (
  id                 BIGINT        NOT NULL AUTO_INCREMENT,
  vessel_name        VARCHAR(50)   NOT NULL,
  voyage             VARCHAR(20)   NOT NULL,
  carrier_partner_id BIGINT        NOT NULL,
  origin_node_id     BIGINT        NOT NULL,
  dest_node_id       BIGINT        NOT NULL,
  etd                DATETIME      NOT NULL,
  eta                DATETIME      NOT NULL,
  capacity_teu       INT           NOT NULL DEFAULT 500,
  booked_teu         INT           NOT NULL DEFAULT 0,
  status             ENUM('PLANNED','OPEN','DEPARTED','ARRIVED','CANCELLED') NOT NULL DEFAULT 'PLANNED',
  price_index        DECIMAL(6,2)  NOT NULL DEFAULT 100.00,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_vessel_voyage (vessel_name, voyage),
  KEY idx_vessel_status (status),
  CONSTRAINT fk_vessel_carrier FOREIGN KEY (carrier_partner_id) REFERENCES partner (id),
  CONSTRAINT fk_vessel_origin FOREIGN KEY (origin_node_id) REFERENCES port_station (id),
  CONSTRAINT fk_vessel_dest FOREIGN KEY (dest_node_id) REFERENCES port_station (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE dispatch_plan (
  id           BIGINT        NOT NULL AUTO_INCREMENT,
  plan_no      VARCHAR(24)   NOT NULL,
  order_id     BIGINT        NOT NULL,
  waybill_id   BIGINT        NULL,
  strategy     ENUM('COST','TIME','BALANCED') NOT NULL,
  total_cost   DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_hours  DECIMAL(6,1)  NOT NULL DEFAULT 0,
  reliability  DECIMAL(5,2)  NOT NULL DEFAULT 0,
  score        DECIMAL(6,2)  NOT NULL DEFAULT 0,
  status       ENUM('DRAFT','CONFIRMED','REJECTED') NOT NULL DEFAULT 'DRAFT',
  summary      VARCHAR(255)  NULL,
  created_by   BIGINT        NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at DATETIME      NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_plan_no (plan_no),
  KEY idx_plan_order (order_id),
  KEY idx_plan_status (status),
  CONSTRAINT fk_plan_order FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT fk_plan_waybill FOREIGN KEY (waybill_id) REFERENCES waybill (id),
  CONSTRAINT fk_plan_creator FOREIGN KEY (created_by) REFERENCES user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE dispatch_plan_item (
  id                 BIGINT        NOT NULL AUTO_INCREMENT,
  plan_id            BIGINT        NOT NULL,
  seq                INT           NOT NULL,
  mode               ENUM('ROAD','SEA','RAIL') NOT NULL,
  carrier_partner_id BIGINT        NULL,
  resource_type      ENUM('VEHICLE','TRAIN','VESSEL') NOT NULL,
  resource_id        BIGINT        NULL,
  start_node_id      BIGINT        NOT NULL,
  end_node_id        BIGINT        NOT NULL,
  start_at           DATETIME      NOT NULL,
  end_at             DATETIME      NOT NULL,
  cost               DECIMAL(12,2) NOT NULL DEFAULT 0,
  transit_hours      DECIMAL(6,1)  NOT NULL DEFAULT 0,
  reliability        DECIMAL(5,2)  NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_plan_item_plan (plan_id, seq),
  CONSTRAINT fk_plan_item_plan FOREIGN KEY (plan_id) REFERENCES dispatch_plan (id) ON DELETE CASCADE,
  CONSTRAINT fk_plan_item_carrier FOREIGN KEY (carrier_partner_id) REFERENCES partner (id),
  CONSTRAINT fk_plan_item_start FOREIGN KEY (start_node_id) REFERENCES port_station (id),
  CONSTRAINT fk_plan_item_end FOREIGN KEY (end_node_id) REFERENCES port_station (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE transfer_window (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  plan_id      BIGINT       NOT NULL,
  node_id      BIGINT       NOT NULL,
  from_seq     INT          NOT NULL,
  to_seq       INT          NOT NULL,
  arrival_at   DATETIME     NOT NULL,
  departure_at DATETIME     NOT NULL,
  wait_hours   DECIMAL(5,1) NOT NULL DEFAULT 0,
  status       ENUM('OK','TIGHT','MISSED') NOT NULL DEFAULT 'OK',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_window_plan (plan_id),
  CONSTRAINT fk_window_plan FOREIGN KEY (plan_id) REFERENCES dispatch_plan (id) ON DELETE CASCADE,
  CONSTRAINT fk_window_node FOREIGN KEY (node_id) REFERENCES port_station (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE alert (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  alert_no    VARCHAR(24)  NOT NULL,
  alert_type  ENUM('DELAY','DEVIATION','TEMP_HUMIDITY','STAY','DOOR_OPEN','EXCEPTION') NOT NULL,
  level       ENUM('INFO','WARN','CRITICAL') NOT NULL DEFAULT 'WARN',
  waybill_id  BIGINT       NULL,
  segment_id  BIGINT       NULL,
  container_id BIGINT      NULL,
  node_id     BIGINT       NULL,
  title       VARCHAR(120) NOT NULL,
  content     VARCHAR(500) NOT NULL,
  status      ENUM('OPEN','ACK','CLOSED') NOT NULL DEFAULT 'OPEN',
  occurred_at DATETIME     NOT NULL,
  acked_by    BIGINT       NULL,
  acked_at    DATETIME     NULL,
  closed_at   DATETIME     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_alert_no (alert_no),
  KEY idx_alert_status (status, occurred_at),
  KEY idx_alert_waybill (waybill_id),
  CONSTRAINT fk_alert_waybill FOREIGN KEY (waybill_id) REFERENCES waybill (id),
  CONSTRAINT fk_alert_segment FOREIGN KEY (segment_id) REFERENCES waybill_segment (id),
  CONSTRAINT fk_alert_container FOREIGN KEY (container_id) REFERENCES container (id),
  CONSTRAINT fk_alert_node FOREIGN KEY (node_id) REFERENCES port_station (id),
  CONSTRAINT fk_alert_user FOREIGN KEY (acked_by) REFERENCES user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE exception_ticket (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  ticket_no       VARCHAR(24)  NOT NULL,
  alert_id        BIGINT       NULL,
  order_id        BIGINT       NULL,
  waybill_id      BIGINT       NULL,
  type            VARCHAR(30)  NOT NULL,
  description     VARCHAR(500) NOT NULL,
  assignee_user_id BIGINT      NULL,
  status          ENUM('OPEN','PROCESSING','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
  resolution      VARCHAR(500) NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at     DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ticket_no (ticket_no),
  KEY idx_ticket_status (status),
  CONSTRAINT fk_ticket_alert FOREIGN KEY (alert_id) REFERENCES alert (id),
  CONSTRAINT fk_ticket_order FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT fk_ticket_waybill FOREIGN KEY (waybill_id) REFERENCES waybill (id),
  CONSTRAINT fk_ticket_assignee FOREIGN KEY (assignee_user_id) REFERENCES user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE iot_device (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  device_no    VARCHAR(30)  NOT NULL,
  device_type  ENUM('GPS','TEMP_HUMIDITY','DOOR','IMPACT') NOT NULL,
  container_id BIGINT       NULL,
  vehicle_id   BIGINT       NULL,
  status       ENUM('ONLINE','OFFLINE') NOT NULL DEFAULT 'ONLINE',
  last_seen_at DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_device_no (device_no),
  KEY idx_device_container (container_id),
  CONSTRAINT fk_device_container FOREIGN KEY (container_id) REFERENCES container (id),
  CONSTRAINT fk_device_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE iot_reading (
  id           BIGINT        NOT NULL AUTO_INCREMENT,
  device_id    BIGINT        NOT NULL,
  container_id BIGINT        NULL,
  temperature  DECIMAL(6,2)  NULL,
  humidity     DECIMAL(6,2)  NULL,
  door_open    TINYINT(1)    NOT NULL DEFAULT 0,
  impact_g     DECIMAL(6,2)  NULL,
  lng          DECIMAL(9,6)  NULL,
  lat          DECIMAL(9,6)  NULL,
  reported_at  DATETIME      NOT NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reading_device_time (device_id, reported_at),
  KEY idx_reading_container (container_id),
  CONSTRAINT fk_reading_device FOREIGN KEY (device_id) REFERENCES iot_device (id),
  CONSTRAINT fk_reading_container FOREIGN KEY (container_id) REFERENCES container (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE geo_fence (
  id         BIGINT        NOT NULL AUTO_INCREMENT,
  name       VARCHAR(80)   NOT NULL,
  fence_type ENUM('PORT','STATION','WAREHOUSE','DEPOT') NOT NULL,
  node_id    BIGINT        NULL,
  center_lng DECIMAL(9,6)  NOT NULL,
  center_lat DECIMAL(9,6)  NOT NULL,
  radius_m   INT           NOT NULL DEFAULT 1000,
  status     ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fence_type (fence_type),
  CONSTRAINT fk_fence_node FOREIGN KEY (node_id) REFERENCES port_station (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
