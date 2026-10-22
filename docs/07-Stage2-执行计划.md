# Stage 2 执行计划（一单制运单 + 箱管 + 单证存证 + EDI 适配器）

> 状态：**已完成（2026-10-22）**——M1 数据基座、M2 后端、M3 前端、M4 联调验收、M5 交付全部完成；
> 验收记录见 `docs/09-Stage2-验收报告.md`（build 零错误、accept:stage2 33/33、e2e:stage2 6 阶段/6 截图、Stage1/v0 回归通过）。
> 上游：`docs/03-平台化演进路线.md` Stage 2
> 目标：把 Stage 1 的「报价-合同-订单-履约」闭环升级为 **一单到底 + 一箱到底 + 单证可追溯**，
> 并用 Mock 适配器补齐 95306 需求车、港口 EDI 进出场/装卸船的报文闭环。

---

## 0. 一句话目标

同一票订单在 Stage 1 完成后，额外具备：
**一单制主运单（1 张）+ 分段运单（N 张）+ 交接事件链 + 电子单证（运单/装箱单/回单）+ Mock CA 签章 + 哈希链存证**；
**箱管中心**完成 放箱→提箱→进场→装箱→发运→卸箱→出场→还箱 全生命周期，并记录箱况/堆存；
**回单**可上传、Mock OCR 识别、签章、存证；**95306 / 港口 EDI** 以适配器输出标准语义报文并可追溯。

---

## 1. 范围

### 做

- 一单制运单：主运单（MASTER）+ 分段运单（SEGMENT，随 dispatch 生成）+ 交接事件链 + 电子签章 + 哈希链存证。
- 单证中心：运单/装箱单/回单/其他文档，上传（base64）/下载/OCR Mock/签章/存证。
- 箱管中心：箱档案扩展（当前节点/当前运单/箱主/箱损）、放箱、提箱、进场、装箱、卸箱、出场、还箱、维修登记、堆存计费（Mock）。
- 承运人工作台（铁路/水路）：需求车提报/订舱、装车/装船、发运、到达确认。
- Mock 适配器：95306 需求车提报 + 受理回执 + 装车/到达确报；港口 EDI CODECO（进出场）/COARRI（装卸船）；CA 签章；哈希链。
- 页面：运单中心、箱管中心、单证中心、铁路/水路工作台、存证查询（并入运单详情）。

### 不做（Stage 3+）

- 真实 EDI 网络/证书、真实 IoT、调度算法、大屏 GIS、发票/支付/对账。
- 不引入 MQ/时序库/区块链节点，继续用 MySQL + 本地文件 + 哈希链模拟。

---

## 2. 数据模型（33 表 = Stage 1 的 26 + 7 新表 + 2 表扩展）

### 2.1 扩展

- `waybill`：`waybill_type(MASTER/SEGMENT)`、`parent_waybill_id`、`mode`、`carrier_partner_id`、`issued_at`、`document_no`、`notarize_tx_id`。
- `container`：`current_node_id`、`current_waybill_id`、`owner_partner_id`、`repair_fee`。

### 2.2 新增

| 表 | 用途 | 关键字段 |
|---|---|---|
| `waybill_event` | 一单制交接事件链 | waybill_id、segment_id、event_type(ISSUE/RELEASE/PICKUP/GATE_IN/LOAD/DEPART/ARRIVE/DISCHARGE/HANDOVER/POD/SIGN/NOTARIZE)、occurred_at、node_id、operator_user_id、payload、prev_hash、hash、tx_id |
| `document` | 电子单证 | doc_no、doc_type(WAYBILL_MASTER/WAYBILL_SEGMENT/PACKING_LIST/POD/OTHER)、biz_type/biz_id、file_name/path/size、content_hash、ocr_status/ocr_result、sign_status/sign_hash/seal_id、notarize_tx_id |
| `e_seal` | Mock 电子印章 | seal_no、seal_name、owner_type/owner_id、ca_serial、status、issued_at |
| `waybill_container` | 运单-箱关联 | waybill_id、container_id、seal_no、loaded_at、discharged_at |
| `container_movement` | 箱动态 | container_id、waybill_id、movement_type(RELEASE/PICKUP/GATE_IN/LOAD/DEPART/ARRIVE/DISCHARGE/GATE_OUT/RETURN/REPAIR)、node_id、occurred_at、operator_user_id、condition_text、photo_url |
| `depot_storage` | 堆存 | container_id、node_id、waybill_id、start_at/end_at、storage_days、fee_amount、status |
| `notarize_record` | 哈希链存证 | biz_type/biz_id、event_type、payload_hash、prev_hash、hash、block_height、tx_id |

---

## 3. 接口（新增约 22 个，详见 `docs/08-Stage2-接口契约.md`）

| 模块 | 接口 |
|---|---|
| 运单中心 | `GET /waybills`、`GET /waybills/:id`、`GET /waybills/:id/events`、`GET /waybills/:id/documents` |
| 单证中心 | `GET /documents`、`POST /documents`（base64 上传）、`GET /documents/:id`、`GET /documents/:id/download`、`POST /documents/:id/ocr`、`POST /documents/:id/sign` |
| 存证 | `GET /notarize/records?bizType=&bizId=`、`GET /notarize/verify/:txId` |
| 箱管中心 | `GET /containers`、`GET /containers/:id`、`POST /containers/:id/release`、`POST /containers/:id/movements`、`POST /containers/:id/return`、`POST /containers/:id/repair`、`GET /depots/storage` |
| 铁路/水路工作台 | `GET /rail/tasks`、`POST /rail/tasks/:waybillId/apply`、`POST /rail/demands/:messageId/confirm`、`GET /sea/tasks`、`POST /sea/tasks/:waybillId/book`、`POST /sea/bookings/:messageId/confirm` |
| 运单签发（内部） | dispatch 事务内自动生成主运单/分段运单/单证/事件；签收后生成回单待上传 |
| 事件联动 | 各节点动作自动追加 `waybill_event` + `container_movement` + 对应 EDI 报文（95306/港口） |

---

## 4. 页面与角色

| 路由 | 页面 | 角色 |
|---|---|---|
| `/waybills` | 运单中心：一单制列表（主运单/分段运单、箱数、单证数、存证状态） | 全部（按角色过滤） |
| `/waybills/:id` | 一单制详情：事件时间轴、箱列表、单证列表、哈希链存证校验 | 全部 |
| `/containers` | 箱管中心：箱列表（状态/当前位置/当前运单） | MTO/TERMINAL/ADMIN/CARRIER |
| `/containers/:id` | 箱详情：动态时间轴、堆存、箱损/维修、放箱/提箱/还箱 | 同上 |
| `/documents` | 单证中心：类型/业务筛选、OCR 结果、签章、下载 | MTO/SHIPPER/FORWARDER/ADMIN |
| `/rail/tasks` | 铁路承运人：需求车提报/确认、装车/到达 | RAIL_CARRIER |
| `/sea/tasks` | 水路承运人：订舱/确认、装船/到达 | SEA_CARRIER |
| 既有页面 | 订单详情/运单跟踪增加「一单制运单」「单证」「箱动态」入口 | 保持 v0/v1 可用 |

---

## 5. Mock 数据（Stage 2 追加）

- 运单：15 张主运单 + 45 张分段运单；事件链 116 条（ISSUE/PICKUP/GATE_IN/LOAD/DEPART/ARRIVE/SIGN）；单证 83 张（主单/分段单/装箱单/回单）；存证 312 条。
- 箱：现有箱档案 30 个 + 动态 172 条（放箱/提箱/进场/装箱/发运/到港/卸船/出场/还箱/维修）；堆存 4 条；箱损 3 条。
- 签章：3 个 Mock 电子印章（平台/MTO、承运人、货主）。
- 存证：运单签发/单证签章/回单/签收共 312 条哈希链记录（可校验 prev_hash）。
- 集成报文：95306 需求车提报/受理、港口 CODECO/COARRI、CA 签章等共 67 条（含 FAILED 样例）。
- 文件：本地 `api/storage/documents/` 下的 Mock 单证文件（随 seed 生成或首次上传生成，已 gitignore）。

---

## 6. 演示闭环（Stage 2 新增段落）

货主下单/报价转单 → MTO 调度（生成主运单 + 3 张分段运单 + 单证）→ **MTO 放箱** → 公路承运人 **提箱/装箱** → 港站 **进场/装船**（港口 EDI CODECO/COARRI + 事件链）→ 铁路 **需求车提报/受理/装车/到达**（95306 报文）→ 水运 **订舱/装船/到达** → 货主/收货人 **上传回单**（OCR 识别）→ 单证 **Mock 签章 + 哈希链存证** → 签收 → 账单。
验收时可打开「运单中心 → 一单制详情」看到：主运单、分段运单、N 个交接事件、箱动态、单证与存证哈希链，且 95306/港口报文可追溯。

---

## 7. 执行顺序与分工

| 里程碑 | 内容 | 负责 | 产出 |
|---|---|---|---|
| M0 契约冻结 | docs/07、docs/08、状态机/权限/报文样例 | Lead | 文档 |
| M1 数据基座 | schema v2（33 表）+ Stage 2 seed + 计数校验 | Lead | api/db |
| M2 后端 | 运单/单证/箱管/存证/适配器/工作台 API + 事件联动 | api-dev（api/src） | 后端代码 |
| M3 前端 | 运单中心/箱管/单证/铁路水运工作台 + 现有页面入口 | web-dev（web/src） | 前端代码 |
| M4 验收 | accept v3（≥65 断言）、e2e v3（≥18 截图）、Stage 1 回归 | Lead | 脚本/截图/报告 |
| M5 交付 | docs 00/01/03/07/08/09 + README、Gitea 推送 | Lead | 提交 |

---

## 8. 验收标准

1. `npm run setup` 冷启动：33 表、主运单 15/分段 45、事件 ≥120、单证 ≥70、箱动态 ≥120、存证 ≥40、EDI 报文 ≥60（允许 ±10%）。
2. `npm run build` 零错误；Stage 1 accept(53)/v0 accept(34) 继续通过。
3. `npm run accept` 升级 v3 ≥65 断言：运单中心/单证上传 OCR/签章/存证校验/箱动态/放箱提箱还箱/95306 需求车/港口 EDI/角色权限 + Stage 1 主链路。
4. `npm run e2e` v3：UI 完成「一单制运单查看、单证上传 OCR 签章、箱放箱提箱还箱、铁路/水路工作台」+ Stage 1 主链路，≥18 张截图，无 JS 异常。
5. 存证链可校验（prev_hash 连续、hash 重算一致）；Mock 报文结构符合 JT/T 1351 / UN/EDIFACT 语义。

---

## 9. 已知简化

- 区块链为本地哈希链（非节点），单证签章为 Mock CA 序列号。
- EDI 适配器为同步 Mock，无真实网络/证书/重试队列（复用集成中心的失败重试）。
- 箱 GPS 轨迹仍在 Stage 3 接入；Stage 2 只记录箱节点动态。
- OCR 为规则识别（文件名/内容关键字），不接真实 OCR 服务。
