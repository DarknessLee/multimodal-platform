# Stage 2 接口契约（一单制 / 箱管 / 单证 / 存证 / EDI 适配器）

> 状态：**已实现并验收通过（2026-10-22）**；验收记录见 `docs/09-Stage2-验收报告.md`。基线：`docs/02`（v0）与 `docs/04`（Stage 1）保持有效，本文件只定义 **Stage 2 新增/变更**。
> 通用约定沿用：`/api`、`{code,message,data}`、JWT、camelCase、`YYYY-MM-DD HH:mm:ss`。

---

## 1. 角色与权限新增

- 角色沿用 9 个；新增权限码：
  - 菜单：`menu:waybills`、`menu:containers`、`menu:documents`、`menu:rail`、`menu:sea`
  - 按钮/接口：`waybill:notarize`、`document:upload`、`document:sign`、`document:ocr`、`container:release`、`container:movement`、`container:return`、`rail:apply`、`sea:book`
- 权限矩阵（`role_permission` 种子扩展）：
  - MTO/ADMIN：全部
  - SHIPPER/FORWARDER：menu:waybills/documents（只读）、document:upload/sign（货主回单）
  - CARRIER：menu:waybills/containers（相关运单）、container:movement
  - TERMINAL：menu:waybills/containers、container:movement/return、document:upload
  - RAIL_CARRIER：menu:waybills/rail、rail:apply
  - SEA_CARRIER：menu:waybills/sea、sea:book
  - SETTLEMENT：menu:waybills/documents（只读）

---

## 2. 运单中心（一单制）

### 2.1 `GET /api/waybills?type=&status=&keyword=&page=1&pageSize=10`

角色过滤：SHIPPER 本人客户；CARRIER/RAIL/SEA 其承运段；TERMINAL 在途/到达；SETTLEMENT 已签收/已出账；MTO/ADMIN 全部。
响应 `{ list, total, page, pageSize }`，item：
```json
{ "id": 12, "waybillNo": "WB20261022001", "waybillType": "MASTER", "waybillTypeLabel": "主运单",
  "orderId": 21, "orderNo": "MO202610220020", "customerName": "上海远洋新能源科技有限公司",
  "cargoName": "光伏组件", "containerCount": 2, "segmentCount": 3,
  "status": "IN_TRANSIT", "statusLabel": "运输中", "issuedAt": "2026-10-22 15:40:00",
  "documentCount": 5, "notarizedCount": 9 }
```

### 2.2 `GET /api/waybills/{id}`

```json
{
  "waybill": { "id": 12, "waybillNo": "WB20261022001", "waybillType": "MASTER", "status": "IN_TRANSIT",
               "statusLabel": "运输中", "orderId": 21, "issuedAt": "2026-10-22 15:40:00", "notarizeTxId": "TX-…" },
  "order": { "id": 21, "orderNo": "MO202610220020", "customerName": "...", "cargoName": "光伏组件" },
  "segments": [ { "id": 51, "seq": 1, "mode": "ROAD", "modeLabel": "公路", "carrierName": "安捷卡车队",
                  "status": "COMPLETED", "statusLabel": "已完成" } ],
  "segmentWaybills": [ { "id": 41, "waybillNo": "SW20261022001-01", "mode": "ROAD", "carrierName": "安捷卡车队", "status": "SIGNED" } ],
  "containers": [ { "id": 31, "containerNo": "MSCU7000021", "type": "40HQ", "status": "IN_TRANSIT",
                    "statusLabel": "运输中", "currentNode": "武汉阳逻港", "sealNo": "SEAL0031" } ],
  "events": [ { "id": 101, "eventType": "ISSUE", "eventTypeLabel": "运单签发", "occurredAt": "2026-10-22 15:40:00",
                "nodeName": "上海嘉定工厂", "operator": "MTO", "description": "一单制运单签发", "txId": "TX-…" } ],
  "documents": [ { "id": 61, "docNo": "DOC20261022001", "docType": "WAYBILL_MASTER", "docTypeLabel": "主运单",
                   "fileName": "WB20261022001.pdf", "ocrStatus": "NONE", "signStatus": "SIGNED", "notarizeTxId": "TX-…" } ],
  "notarize": { "verified": true, "recordCount": 9, "lastTxId": "TX-…" }
}
```

### 2.3 `GET /api/waybills/{id}/events?page=&pageSize=`
`{list,total,page,pageSize}`，item 含 `prevHash/hash/txId/blockHeight`。

### 2.4 `GET /api/waybills/{id}/documents`
返回该主运单及其分段运单关联的全部单证（结构同 §2.2 documents）。

### 2.5 自动签发（dispatch 事务内）
调度成功时自动：主运单（`WB+日期+5位`）、3 张分段运单（`SW+主单序号-段序`）、主运单单证、每段分段单、装箱单；
写 `waybill_event(ISSUE)` ×4、`notarize_record`（hash 链）、审计；返回体在 Stage 1 dispatch 基础上增加 `waybillId` 不变、新增 `waybillNo/segmentWaybills/documents`。

---

## 3. 单证中心

### 3.1 `GET /api/documents?docType=&bizType=&bizId=&ocrStatus=&page=1&pageSize=10`
item：`id、docNo、docType/docTypeLabel、bizType/bizId、fileName、fileSize、contentHash、ocrStatus/ocrStatusLabel、signStatus、notarizeTxId、createdAt`。

### 3.2 `POST /api/documents`（multipart 不可用时用 base64 JSON）
```json
{ "docType": "POD", "bizType": "WAYBILL", "bizId": 12,
  "fileName": "POD-回单.jpg", "mimeType": "image/jpeg", "contentBase64": "..." }
```
- 服务端落盘到 `api/storage/documents/<docNo>-<safeName>`，计算 SHA-256 `contentHash`；
- `docType=POD` 时自动执行 Mock OCR（识别箱号、签收人、日期、数量），写 `ocrStatus/ocrResult`；
- 写审计/事件/存证；响应单证详情。
- 限制：单文件 ≤ 5MB；允许 pdf/jpg/png/txt。

### 3.3 `GET /api/documents/{id}` / `GET /api/documents/{id}/download`
详情含 `ocrResult`、`signStatus/signHash/seal`、`notarizeTxId`；download 返回文件流（`Content-Disposition`）。

### 3.4 `POST /api/documents/{id}/ocr`
重跑 Mock OCR；响应 `{ ocrStatus, ocrResult }`。

### 3.5 `POST /api/documents/{id}/sign`
```json
{ "signerName": "李经理", "sealId": 1 }
```
Mock CA：`signHash = sha256(docNo|contentHash|signerName|signedAt|PLATFORM_SALT)`；更新单证 `SIGNED`，
写 `CA_SIGN` 集成报文、`waybill_event(SIGN)`、`notarize_record`；响应详情。

---

## 4. 存证（哈希链）

- `GET /api/notarize/records?bizType=&bizId=&page=`
  item：`id、bizType、bizId、eventType、payloadHash、prevHash、hash、blockHeight、txId、createdAt`
- `GET /api/notarize/verify/{txId}`
  ```json
  { "valid": true, "record": { "...": "..." }, "chainLength": 9, "message": "哈希链校验通过" }
  ```
  校验规则：`hash == sha256(payloadHash + prevHash + blockHeight)` 且 `prevHash` 等于前一条 `hash`（创世 prevHash 为 64 个 0）。

---

## 5. 箱管中心

### 5.1 `GET /api/containers?status=&keyword=&page=`
item：`id、containerNo、type、status/statusLabel、currentNode、currentWaybillId/No、ownerPartnerName、conditionText、repairFee`。

### 5.2 `GET /api/containers/{id}`
```json
{
  "container": { "id": 31, "containerNo": "MSCU7000021", "type": "40HQ", "status": "IN_TRANSIT", "statusLabel": "运输中" },
  "waybill": { "id": 12, "waybillNo": "WB20261022001" },
  "movements": [ { "id": 1, "movementType": "RELEASE", "movementLabel": "放箱", "nodeName": "上海洋山港",
                   "occurredAt": "2026-10-22 10:00:00", "conditionText": "箱况良好", "operator": "MTO" } ],
  "storage": [ { "id": 1, "nodeName": "洋山堆场", "startAt": "…", "endAt": "…", "storageDays": 2, "feeAmount": 160 } ]
}
```

### 5.3 `POST /api/containers/{id}/release`
`{ "waybillId": 12, "nodeId": 2 }` → 新增 `RELEASE` 动态；箱状态 `EMPTY→RELEASED`；写事件/审计。

### 5.4 `POST /api/containers/{id}/movements`
`{ "movementType": "PICKUP", "nodeId": 1, "conditionText": "箱况良好", "remark": "空箱提出", "photoUrl": null }`
允许类型：PICKUP/GATE_IN/LOAD/DEPART/ARRIVE/DISCHARGE/GATE_OUT；按类型联动箱状态、事件、EDI（港口/铁路）报文。

### 5.5 `POST /api/containers/{id}/return`
`{ "nodeId": 19, "conditionText": "箱况良好" }` → `RETURN` 动态 + 堆存记录（起止时间/费用 Mock）+ 箱状态 `RETURNED`。

### 5.6 `POST /api/containers/{id}/repair`
`{ "nodeId": 19, "fee": 280, "remark": "右侧凹损" }` → `REPAIR` 动态、`repairFee += fee`、状态 `IN_REPAIR`。

### 5.7 `GET /api/depots/storage?nodeId=&status=`
堆存列表：`containerNo、nodeName、startAt/endAt、storageDays、feeAmount、status`。

---

## 6. 铁路 / 水路工作台（95306 / 港口 EDI Mock）

### 6.1 `GET /api/rail/tasks`
返回该铁路承运人相关运单的任务：`waybillId、waybillNo、orderNo、fromStation、toStation、containerCount、segmentStatus、demandStatus、lastMessageAt`。

### 6.2 `POST /api/rail/tasks/{waybillId}/apply`
生成 `RAIL_95306` `RAIL_DEMAND_APPLY`（OUT，JT/T 1351 语义：报文号、发站/到站电报码、箱型箱量、货物、需求日期、车种）；
状态 `PENDING`；响应 `{ messageId, msgNo, status }`。

### 6.3 `POST /api/rail/demands/{messageId}/confirm`
模拟 95306 受理回执：写 `IN` 报文 `RAIL_DEMAND_ACCEPT`（受理号、承认车数），关联报文状态 SUCCESS，
写 `waybill_event(LOAD 前序)` 与通知；响应 `{ status, matchedCars, message }`。

### 6.4 `GET /api/sea/tasks` / `POST /api/sea/tasks/{waybillId}/book` / `POST /api/sea/bookings/{messageId}/confirm`
与铁路对称：订舱 `PORT_EDI` `SEA_BOOKING`、确认回执 `SEA_BOOKING_CONFIRM`（船名/航次/舱位）。

### 6.5 港口 EDI 自动报文（节点动作触发）
| 动作 | 报文 | 方向 |
|---|---|---|
| 港站 GATE_IN | `PORT_CODECO`（进场） | OUT |
| 港站 ARRIVE | `PORT_COARRI`（卸船/到港） | OUT |
| 箱 LOAD | `PORT_COARRI`（装船） | OUT |
| 箱 DISCHARGE | `PORT_CODECO`（出场） | OUT |

---

## 7. 数据与状态

- 主运单：`PENDING→IN_TRANSIT→ARRIVED→SIGNED`；分段运单随分段状态（`PENDING/IN_TRANSIT/ARRIVED/SIGNED`）。
- 箱状态扩展：`EMPTY/RELEASED/GATE_IN/LOADED/IN_TRANSIT/ARRIVED/DELIVERED/RETURNED/IN_REPAIR/AT_DEPOT`。
- 事件类型：`ISSUE/RELEASE/PICKUP/GATE_IN/LOAD/DEPART/ARRIVE/DISCHARGE/HANDOVER/POD/SIGN/NOTARIZE`。

---

## 8. 新增前端 testid

| 区域 | testid |
|---|---|
| 运单中心 | `waybill-table` `waybill-row` `waybill-no` `waybill-type` `waybill-status` `waybill-events` `waybill-containers` `waybill-documents` `notarize-verify` |
| 单证中心 | `document-table` `document-row` `document-type` `document-ocr` `document-sign-btn` `document-upload` `document-file-input` `document-download` |
| 箱管中心 | `container-table` `container-row` `container-no` `container-status` `container-release` `container-movement` `container-return` `container-movements` |
| 铁路/水路 | `rail-task` `rail-apply` `rail-confirm` `sea-task` `sea-book` `sea-confirm` |
| 通用 | `page-title` `permission-guard`（沿用） |

---

## 9. 自动联动与验收钩子

1. dispatch 后：主运单 + 3 分段运单 + 5 张单证（主单/3 分段单/装箱单）+ 主单 1 条与分段单各 1 条 ISSUE 事件（合计 4 条，分属不同 waybill_id）+ 对应存证（hash 链连续）。
2. 港站 GATE_IN/ARRIVE：箱动态 + `PORT_CODECO/COARRI` 报文 + 事件 + 存证。
3. 铁路 apply/confirm：`RAIL_DEMAND_APPLY`（OUT）+ `RAIL_DEMAND_ACCEPT`（IN），报文可查。
4. 水路 book/confirm：`SEA_BOOKING` + `SEA_BOOKING_CONFIRM`。
5. 单证上传（POD）：OCR 结果含箱号/签收人/日期；签章后 `signHash` 64 位；存证可 verify。
6. 箱 release→pickup→gate_in→load→discharge→return 全链路动态与状态一致；堆存费用可查。
7. 存证校验：`prev_hash` 连续、`hash` 重算一致、verify 返回 valid=true。
8. Stage 1 的 53 项 accept 与 v0 34 项回归继续通过。
