-- 多式联运演示版 v0 — 7 张表（utf8mb4 / InnoDB）
-- 由 api/db/init.mjs 执行：先 DROP 全部表再建表，保证演示数据可重置。
-- 约定：JSON 输出用 camelCase；表名用 orders（避开 MySQL 保留字 order）。

DROP TABLE IF EXISTS bill;
DROP TABLE IF EXISTS track_point;
DROP TABLE IF EXISTS waybill_segment;
DROP TABLE IF EXISTS waybill;
DROP TABLE IF EXISTS container;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS user;

CREATE TABLE user (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)  NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  display_name  VARCHAR(50)  NOT NULL,
  role          ENUM('SHIPPER','MTO','CARRIER','TERMINAL','SETTLEMENT') NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE orders (
  id                  BIGINT        NOT NULL AUTO_INCREMENT,
  order_no            VARCHAR(32)   NOT NULL,
  shipper_id          BIGINT        NOT NULL,
  status              ENUM('CREATED','DISPATCHED','IN_TRANSIT','ARRIVED','SIGNED','BILLED') NOT NULL DEFAULT 'CREATED',
  cargo_name          VARCHAR(100)  NOT NULL,
  cargo_weight        DECIMAL(12,2) NOT NULL,
  container_type      VARCHAR(20)   NOT NULL,
  container_count     INT           NOT NULL,
  origin              VARCHAR(100)  NOT NULL,
  destination         VARCHAR(100)  NOT NULL,
  required_pickup_date DATE         NOT NULL,
  remark              VARCHAR(255)  NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_orders_no (order_no),
  KEY idx_orders_shipper (shipper_id),
  KEY idx_orders_status (status),
  CONSTRAINT fk_orders_shipper FOREIGN KEY (shipper_id) REFERENCES user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
