# Stage 1 接口契约（v1 增量）

> 状态：**已实现并验收通过（2026-10-22）**；实现细节与验收记录见 `docs/06-Stage1-验收报告.md`，后续变更以代码与本文件同步为准。
> 基线：`docs/02-接口契约.md` 的 v0 接口保持不变；本文件只定义 **Stage 1 新增/变更**。
> 通用约定沿用 v0：`/api` 前缀、`{code,message,data}`、JWT Bearer、camelCase、时间 `YYYY-MM-DD HH:mm:ss`、金额 number。
> 错误码沿用 v0，并新增 `40902`（重复操作/已完成）、`40903`（无可用价格规则）、`42201`（业务规则不满足）。

---

## 1. 角色与权限

### 1.1 角色（Stage 1 共 9 个）

| role | 中文 | 账号 | 主要菜单 |
|---|---|---|---|
| `SHIPPER` | 货主 | `shipper01` | 总览、我的订单、询价/报价、合同、运单跟踪、账单 |
| `FORWARDER` | 货代 | `forwarder01` | 总览、订单、报价、合同、客户、运单跟踪 |
| `MTO` | 多式联运经营人 | `mto01` | 总览、订单、报价、合同、客户/伙伴、主数据、调度、集成、审计 |
| `CARRIER` | 公路承运人 | `carrier01` | 总览、我的订单、运输任务、运单跟踪 |
| `RAIL_CARRIER` | 铁路承运人 | `rail01` | 总览、相关订单、运单跟踪（任务工作台 Stage 2） |
| `SEA_CARRIER` | 水路承运人 | `sea01` | 总览、相关订单、运单跟踪（任务工作台 Stage 2） |
| `TERMINAL` | 港站 | `terminal01` | 总览、港站作业、运单跟踪 |
| `SETTLEMENT` | 结算 | `settlement01` | 总览、结算工作台、账单、订单 |
| `ADMIN` | 平台运营 | `admin01` | 全部菜单 + 主数据 + 集成 + 审计 |

密码统一 `demo123`。`user.role` 存角色码；`role`/`permission`/`role_permission` 存权限矩阵。

### 1.2 权限码

- 菜单：`menu:dashboard`、`menu:orders`、`menu:quotes`、`menu:contracts`、`menu:customers`、`menu:partners`、`menu:master`、`menu:dispatch`、`menu:tasks`、`menu:terminal`、`menu:track`、`menu:settlement`、`menu:bills`、`menu:integration`、`menu:audit`。
- 按钮/接口：`order:create`、`order:cancel`、`order:dispatch`、`quote:create`、`quote:send`、`quote:accept`、`contract:create`、`contract:send`、`contract:sign`、`price:create`、`customer:create`、`partner:create`、`integration:retry`、`segment:status`、`waybill:sign`、`bill:settle`。
- 登录响应返回 `permissions: string[]`；前端菜单/按钮按权限码渲染，后端 `requirePermission` 二次校验（40301）。
- **实现口径（以 `role_permission` 种子为准）**：`customer:create`/`partner:create` 允许 MTO；`contract:create` 允许 FORWARDER；`quote:accept` 允许 SHIPPER/FORWARDER/MTO/ADMIN（SHIPPER 仅本人客户）。

### 1.3 `POST /api/auth/login`（兼容扩展）

请求不变。响应 `data` 同时提供 `user.permissions` 与顶层 `permissions`（同一数组，兼容不同读法），并新增 `menus`（菜单码数组）：
```json
{
  "token": "eyJ...",
  "user": {
    "id": 3, "username": "mto01", "displayName": "中远海联运 MTO",
    "role": "MTO", "roleLabel": "多式联运经营人",
    "permissions": ["menu:dashboard", "menu:orders", "quote:send", "contract:send"]
  },
  "permissions": ["menu:dashboard", "menu:orders", "quote:send", "contract:send"],
  "menus": ["menu:dashboard", "menu:orders", "menu:quotes", "menu:contracts"]
}
```
前端读取 `data.user.permissions ?? data.permissions`；登录成功默认落地 `/dashboard`（带 `redirect` 参数时优先跳转），`GET /auth/me` 返回结构同 `user` + `permissions`。

### 1.4 `GET /api/auth/me`

响应 `data`：`{ id, username, displayName, role, roleLabel, permissions[] }`。

---

## 2. 主数据

### 2.1 客户 `customer`

- `GET /api/customers?keyword=&page=1&pageSize=10`（SHIPPER/FORWARDER/MTO/ADMIN）
  → `{ list, total, page, pageSize }`；item：
  ```json
  { "id": 1, "customerNo": "CUS000001", "name": "上海远洋新能源科技有限公司", "shortName": "远洋新能源",
    "creditCode": "91310114MA1G00001X", "contactName": "王海", "contactPhone": "13800000001",
    "email": "wanghai@example.com", "regionCode": "310114", "address": "上海市嘉定区安亭镇…",
    "industry": "光伏制造", "creditLevel": "AA", "status": "ACTIVE", "statusLabel": "正常" }
  ```
- `GET /api/customers/{id}`；`POST /api/customers`（MTO/ADMIN）请求字段同上（customerNo 自动生成）。
- 校验：`name`、`creditCode`（18 位）、`contactName/Phone`、`regionCode`（6 位）必填；`creditCode` 唯一。

### 2.2 伙伴 `partner`

- `GET /api/partners?type=&keyword=&page=&pageSize=`
- `POST /api/partners`（ADMIN）
- 类型：`ROAD_CARRIER/RAIL_OPERATOR/SEA_CARRIER/PORT/RAIL_STATION/DEPOT/WAREHOUSE/FORWARDER/FINANCE/INSURANCE/REGULATOR`。
- 关键字段：`partnerNo、name、shortName、type、creditCode、contactName、contactPhone、regionCode、address、qualifications（JSON：证照名称/编号/有效期）、rating、settlementAccount、status`。

### 2.3 港站节点 `port_station`

- `GET /api/ports?type=`（PORT/RAIL_STATION/DEPOT/WAREHOUSE）
- 字段：`nodeCode`（UN/LOCODE 或 5 位车站电报码）、`nodeName`、`nodeType`、`regionCode`、`address`、`lng/lat`、`operatorPartnerId`、`capacityTeu`、`operatingHours`。

### 2.4 线路模板 `route_template`

- `GET /api/routes`
- 字段：`routeCode、routeName、originNode{id,nodeCode,nodeName}、destinationNode{...}、transitNodes[]、modes[]（ROAD/SEA/RAIL）、distanceKm、transitDays、baseCost、reliability`。

### 2.5 其他主数据

- `GET /api/goods` → `goodsCode、goodsName、category、hsCode、dangerousFlag、packaging、unit`
- `GET /api/container-types` → `code、name、innerVolumeCbm、maxPayloadT、tareWeightT、teu`
- `GET /api/dicts/{type}` → `[{ key, value, label, sortNo }]`（类型：order_status/order_type/quote_status/contract_status/partner_type/node_type/charge_type/payment_terms）

### 2.6 价格规则 `price_rule`

- `GET /api/price-rules?mode=&routeTemplateId=&customerId=&page=&pageSize=`
- `POST /api/price-rules`（MTO/ADMIN）：
  ```json
  {
    "ruleName": "上海—成都 公铁水 40HQ 公开价", "mode": "RAIL", "chargeType": "BASE",
    "routeTemplateId": 1, "containerTypeCode": "40HQ", "customerId": null, "contractId": null,
    "calcMethod": "PER_CONTAINER", "unitPrice": 8600, "minCharge": 0,
    "effectiveFrom": "2026-01-01", "effectiveTo": "2026-12-31", "priority": 100
  }
  ```
- 计算方式：`PER_CONTAINER`（单价×箱量）、`PER_KM`（单价×里程×箱量）、`PER_TON`（单价×吨位）、`PER_TEU`（单价×TEU×箱量）、`FLAT`（一口价）；`min_charge` 兜底；`ladder` 预留阶梯价（Stage 1 不启用，仅存取）。

---

## 3. 询价 / 报价

状态：`DRAFT（询价/草稿）→ SENT（已报价）→ ACCEPTED（已接受，生成订单）/ EXPIRED / CANCELLED`。

### 3.1 `POST /api/quotes`（SHIPPER/FORWARDER/MTO）

```json
{
  "customerId": 1, "orderType": "ROAD_RAIL_SEA", "routeTemplateId": 1,
  "containerTypeCode": "40HQ", "containerCount": 2,
  "goodsCode": "G001", "cargoName": "光伏组件", "cargoWeight": 22.5,
  "requiredDate": "2026-10-30", "remark": "月底前发运"
}
```
服务端：按线路模板取 `modes/transit_days`，调用价格引擎逐模式匹配规则生成 `items`，计算 `totalAmount/costAmount`，`validUntil = today + 7 天`，`quoteNo = BJ + yyyyMMdd + 5 位`，`status = DRAFT`。
响应 `data`：报价详情（结构见 3.3）。
无可用规则时返回 `40903`（message 指明缺失的模式/线路/箱型）。

### 3.2 `GET /api/quotes?status=&keyword=&page=&pageSize=`

角色过滤：SHIPPER 仅自己（customerId 对应）；FORWARDER 所服务客户；MTO/ADMIN 全部。
item：`{ id, quoteNo, customer{id,name}, orderType, routeName, containerType, containerCount, cargoName, totalAmount, status, statusLabel, validUntil, createdAt }`

### 3.3 `GET /api/quotes/{id}`

```json
{
  "id": 1, "quoteNo": "BJ2026102200001", "customer": { "id": 1, "name": "上海远洋新能源科技有限公司" },
  "orderType": "ROAD_RAIL_SEA", "orderTypeLabel": "公铁水联运",
  "route": { "id": 1, "routeName": "上海嘉定—成都青白江（公铁水）", "modes": ["ROAD","SEA","RAIL"], "transitDays": 5.5, "distanceKm": 2150 },
  "containerType": "40HQ", "containerCount": 2,
  "goodsCode": "G001", "cargoName": "光伏组件", "cargoWeight": 22.5,
  "requiredDate": "2026-10-30", "transitDays": 5.5, "validUntil": "2026-10-29",
  "totalAmount": 31920.00, "costAmount": 27451.20, "marginRate": 14.00,
  "status": "DRAFT", "statusLabel": "询价中", "remark": "月底前发运",
  "items": [
    { "seq": 1, "mode": "ROAD", "modeLabel": "公路", "description": "嘉定工厂—洋山港 集装箱拖车",
      "quantity": 2, "unit": "箱", "unitPrice": 1400, "amount": 2800.00, "calcMethod": "PER_CONTAINER" },
    { "seq": 2, "mode": "SEA", "modeLabel": "海运", "description": "洋山港—阳逻港 内贸海运",
      "quantity": 2, "unit": "箱", "unitPrice": 5200, "amount": 10400.00, "calcMethod": "PER_CONTAINER" },
    { "seq": 3, "mode": "RAIL", "modeLabel": "铁路", "description": "吴家山—城厢 铁路班列",
      "quantity": 2, "unit": "箱", "unitPrice": 8600, "amount": 17200.00, "calcMethod": "PER_CONTAINER" },
    { "seq": 4, "mode": "PORT", "modeLabel": "港杂", "description": "港口装卸/堆存/理货",
      "quantity": 4, "unit": "箱次", "unitPrice": 380, "amount": 1520.00, "calcMethod": "PER_CONTAINER" }
  ]
}
```

### 3.4 `POST /api/quotes/{id}/send`（MTO/FORWARDER）

`DRAFT → SENT`；通知客户账号；写审计与事件 `quote.sent`。响应：报价详情。

### 3.5 `POST /api/quotes/{id}/accept`（SHIPPER/FORWARDER）

```json
{ "contractId": 3 }
```
`SENT → ACCEPTED`；`contractId` 可选（须 `SIGNED` 且属于该客户，否则 `42201`）。
事务内：创建订单（`source=QUOTE`，`status=CONTRACTED`（有合同）/`CONFIRMED`（无合同））、`order_cargo`、复制 `quote_item` 到订单金额字段；事件 `quote.accepted`；通知 MTO。
响应：`{ "orderId": 21, "orderNo": "MO202610220021" }`

---

## 4. 合同

状态：`DRAFT → PENDING_SIGN → SIGNED → TERMINATED`。

- `GET /api/contracts?status=&customerId=&page=&pageSize=`（SHIPPER 自己；MTO/ADMIN 全部）
- `POST /api/contracts`（MTO/FORWARDER）：
  ```json
  { "customerId": 1, "contractType": "FRAMEWORK", "title": "2026 年度多式联运框架合同",
    "effectiveFrom": "2026-01-01", "effectiveTo": "2026-12-31",
    "paymentTerms": "月结30天", "creditLimit": 2000000, "discountRate": 3 }
  ```
  生成 `contractNo = HT + yyyyMM + 4 位`，`status=DRAFT`。
- `POST /api/contracts/{id}/send`（MTO/FORWARDER）→ `PENDING_SIGN`，通知客户。
- `POST /api/contracts/{id}/sign`（SHIPPER/FORWARDER）：
  ```json
  { "signerName": "王海" }
  ```
  Mock CA：`signHash = sha256(contractNo|customerId|signerName|signedAt|platformSalt)`；
  `status=SIGNED`、记录签署人/时间；写集成报文 `CA_SIGN`（成功）、审计、事件 `contract.signed`。
  响应：合同详情（含 `signHash`、`signedAt`）。
- `GET /api/contracts/{id}`：含客户、期限、账期、信用额度、折扣、状态、签署信息、关联订单数。

---

## 5. 订单（v1 扩展，v0 兼容）

### 5.1 `POST /api/orders`

**双通道**：
1. **报价单转单**：`{ "quoteId": 1, "contractId": 3 }`（accept 接口内部也会走同一逻辑）；
2. **快速下单（v0 兼容）**：原字段 `cargoName/cargoWeight/containerType/containerCount/origin/destination/requiredPickupDate/remark`，行为不变，`source=QUICK`、`orderType=ROAD_RAIL_SEA`、`status=CREATED`。
   **可选**携带 `cargoLines` 数组（多货物行），元素结构：
   ```json
   { "goodsCode": "G001", "goodsName": "光伏组件", "quantity": 2, "unit": "箱", "weightT": 22.5,
     "volumeCbm": 76.3, "containerType": "40HQ", "containerCount": 2, "dangerousFlag": false, "packaging": "木箱" }
   ```
   规则：提供 `cargoLines` 时以它为准（`container_count` = 各行 `containerCount` 之和，`cargo_weight` = 各行 `weightT` 之和），并保留 v0 聚合字段作为首行/汇总兼容；未提供时由 v0 字段生成单货物行。

### 5.2 `GET /api/orders`

保持 v0 数组返回；新增 query：`orderType`、`source`、`customerId`（MTO/ADMIN）。item 新增字段：
`orderType、orderTypeLabel、source、sourceLabel、customerName、totalAmount、priority、contractNo、quoteNo`。

### 5.3 `GET /api/orders/{id}`

在 v0 聚合结构上新增：
```json
{
  "order": { "...v0 字段": "…", "orderType": "ROAD_RAIL_SEA", "source": "QUOTE", "priority": "NORMAL",
             "totalAmount": 30962.40, "currency": "CNY",
             "customer": { "id": 1, "name": "上海远洋新能源科技有限公司", "creditLevel": "AA" },
             "consignee": { "id": 2, "name": "成都青白江…", "contactName": "李经理" } },
  "cargoLines": [ { "seq": 1, "goodsCode": "G001", "goodsName": "光伏组件", "quantity": 2, "unit": "箱",
                    "weightT": 22.5, "volumeCbm": 76, "containerType": "40HQ", "containerCount": 2 } ],
  "contract": { "id": 3, "contractNo": "HT2026100003", "status": "SIGNED" },
  "quote": { "id": 1, "quoteNo": "BJ2026102200001", "totalAmount": 31920.00 },
  "route": { "id": 1, "routeName": "上海嘉定—成都青白江（公铁水）", "modes": ["ROAD","SEA","RAIL"] }
}
```
v0 字段（containers/waybill/segments/latestTrack/bill/availableRoadCarriers）保持不变。

### 5.4 `POST /api/orders/{id}/cancel`（SHIPPER/MTO/ADMIN）

仅 `status ∈ (CREATED, CONFIRMED, CONTRACTED)`；`→ CANCELLED`；写审计/事件；已调度后禁止（40901）。

### 5.5 调度兼容

`POST /api/orders/{id}/dispatch` 允许 `status ∈ (CREATED, CONTRACTED, CONFIRMED)`；调度后 `→ DISPATCHED`（v0 行为不变）。

---

## 6. 总览看板

### 6.1 `GET /api/dashboard/summary`

按角色裁剪；响应：
```json
{
  "kpis": { "ordersTotal": 20, "inTransit": 6, "pendingDispatch": 3, "signed": 4, "billed": 5,
            "revenue": 486320.50, "onTimeRate": 96.2, "exceptionCount": 1 },
  "statusDistribution": [ { "status": "CREATED", "statusLabel": "待调度", "count": 3 } ],
  "modeDistribution": [ { "mode": "ROAD", "count": 20 }, { "mode": "SEA", "count": 14 }, { "mode": "RAIL", "count": 11 } ],
  "recentOrders": [ { "id": 21, "orderNo": "MO202610220021", "statusLabel": "待调度", "cargoName": "光伏组件", "totalAmount": 30962.40, "createdAt": "…" } ],
  "todos": [ { "type": "DISPATCH", "title": "3 票订单待调度", "relatedId": null } ],
  "integration": { "total": 40, "success": 38, "failed": 2, "successRate": 95.0 }
}
```

### 6.2 `GET /api/dashboard/trend?days=14`

`{ "dates": ["10-09", …], "orders": [1,2,…], "revenue": [0, 12800, …] }`

---

## 7. 集成中心（Mock 适配器）

- `GET /api/integration/systems` → 系统目录与运行状态：
  ```json
  [ { "systemCode": "RAIL_95306", "systemName": "铁路 95306", "standard": "JT/T 1351-2020",
      "direction": "OUT", "status": "UP", "lastMessageAt": "2026-10-22 10:31:00", "successRate": 97.5 } ]
  ```
- `GET /api/integration/messages?systemCode=&status=&relatedType=&relatedId=&page=&pageSize=` →
  `{ list, total, page, pageSize }`；item：`msgNo、systemCode/Name、direction、msgType、standard、status、retryCount、errorMessage、createdAt、payloadPreview`。
- `POST /api/integration/messages/{id}/retry`（MTO/ADMIN）：仅 `FAILED` 可重试 → 模拟成功，追加 `responsePayload`。

**事件 → 报文映射（Stage 1）**：
| 事件 | 系统 | 报文类型 | 标准 |
|---|---|---|---|
| `quote.accepted` | `PORT_EDI` | `PORT_CODECO`（预进场） | UN/EDIFACT 语义 |
| `contract.signed` | `CA` | `CA_SIGN` | JSON 签章记录 |
| `order.dispatched` | `RAIL_95306` | `RAIL_DEMAND_APPLY` | JT/T 1351-2020 语义 |
| `order.settled` | `BANK` | `BANK_PAYMENT_RECEIPT` | JSON 回执 |
| `order.signed` | `TAX` | `TAX_INVOICE_ISSUE` | 电子发票要素 |

报文 `payload` 为结构化 JSON（含标准字段）；前端抽屉可查看格式化内容。

**Stage 1 投递口径**：业务事务内**同步**写 `event_outbox` + `integration_message` + `notification`，成功后置 `PUBLISHED`；投递失败置 `FAILED`、不阻断业务（可重试）。Stage 2 再评估异步投递。

---

## 8. 审计与通知

- `GET /api/audit/logs?module=&action=&userId=&page=&pageSize=`（ADMIN/MTO）→ `{list,total,page,pageSize}`
  item：`id、username、role、action、actionLabel、module、targetType、targetId、detail、ip、createdAt`。
- `GET /api/notifications?unread=1` → 数组：`{ id, type, typeLabel, title, content, relatedType, relatedId, readFlag, createdAt }`
- `POST /api/notifications/{id}/read`

---

## 9. 新增前端 testid（E2E v2 依赖）

| 区域 | testid |
|---|---|
| 总览 | `kpi-orders-total` `kpi-in-transit` `kpi-revenue` `kpi-on-time` `trend-chart` `recent-orders` `integration-health` `todo-list` |
| 客户/伙伴 | `customer-search` `customer-table` `customer-row` `customer-create-btn` `partner-table` `partner-row` `partner-type-filter` |
| 主数据 | `master-tab-routes` `master-tab-ports` `master-tab-goods` `master-tab-container-types` `master-tab-price-rules` `price-rule-table` `price-rule-create-btn` |
| 报价 | `quote-create-btn` `quote-row` `quote-no` `quote-status` `quote-total` `quote-send-btn` `quote-accept-btn` `quote-breakdown` `quote-total-amount` |
| 合同 | `contract-row` `contract-status` `contract-send-btn` `contract-sign-btn` `signer-name` `contract-sign-submit` |
| 订单 v1 | `order-source` `order-type` `add-cargo-line` `cargo-line` `order-quote-link` `order-contract-link` `order-cancel-btn` |
| 集成/审计 | `message-row` `message-status` `message-detail` `audit-row` `audit-action` |

---

## 10. 验收钩子（accept/e2e 将断言）

1. 9 角色登录成功，权限集非空；越权请求返回 40301；
2. 主数据：客户/伙伴/线路/港站/货物/箱型可查；新增价格规则后报价使用新规则；
3. 报价：创建询价 → 金额 = items 之和 → MTO 发送 → 货主接受 → 生成订单（多货物行、金额一致）；
4. 合同：创建 → 发送 → 货主 Mock 签章 → `signHash` 64 位且状态 SIGNED；订单可关联合同；
5. 订单：快速下单 v0 通道回归；报价单通道订单可调度；取消仅限未调度；
6. 履约：调度 → 公路/海运/铁路节点 → 轨迹 → 签收 → 账单（v0 链路）；
7. 事件与治理：报价接受/签合同/调度/出账后，集成消息、审计、通知有对应记录；
8. 看板：KPI 与订单数据一致；趋势返回 14 天；
9. 集成重试：FAILED 报文重试后变 SUCCESS；
10. 前端 build + e2e 全绿，新增页面截图产出。
