# Stage 3 执行计划（调度中心 + 可视化大屏 + 异常预警 + IoT Mock）

> 状态：**已完成（2026-10-22）**——M1 数据基座、M2 后端、M3 前端、M4 联调验收、M5 交付全部完成；
> 验收记录见 `docs/12-Stage3-验收报告.md`（build 零错误、accept:stage3 33/33、e2e:stage3 7 阶段/8 截图、Stage1/2/v0 回归通过）。
> 上游：`docs/03-平台化演进路线.md` Stage 3
> 目标：从「人工调度 + 运单可视化」升级为「**智能方案推荐 → 调度确认 → 全程监控 → 异常处置**」的调度与监控闭环。

---

## 1. 范围

### 做

- **运力池**：公路车辆（含司机/GPS）、铁路班列、水路班轮/舱位；利用率与状态。
- **智能调度**：按「成本优先 / 时效优先 / 综合平衡」生成 3 套方案（分段+运力+衔接窗口+评分），人工确认后按方案签发运单/分段。
- **调度看板**：待调度订单、运力利用率、近期班列/班轮、中转衔接窗口、异常提醒。
- **可视化大屏**：在线运单、模式分布、时效达成、告警统计、GPS/经纬度轨迹、最近预警。
- **异常预警**：延误 / 偏航 / 温湿度 / 异常停留 / 开门 / 异常工单；告警确认与关闭、异常工单处置。
- **IoT Mock**：GPS/温湿度/门磁设备与读数；超阈值自动生成预警（温度、开门、停留）。
- **角色**：MTO 调度、平台运营、承运人/港站看板视角；新增权限 menu:monitor、menu:alerts、menu:capacity 等。

### 不做（Stage 4+）

- 真实 GIS 瓦片/高德地图、真实 IoT 接入、AI 路径规划算法（用确定性 Mock 评分规则）、发票/支付/对账。

---

## 2. 数据模型（44 表 = Stage2 33 + 11 新表）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `vehicle` | 公路运力 | vehicle_no、plate_no、vehicle_type、carrier_partner_id、driver_name/phone、capacity_t、container_slots、gps_device_no、status(IDLE/IN_TASK/MAINTENANCE)、current_node_id、lng/lat、last_seen_at |
| `train_schedule` | 铁路班列 | train_no、operator_partner_id、origin/dest_node_id、departure_at/arrival_at、capacity_teu、booked_teu、status、price_index |
| `vessel_schedule` | 水路班轮 | vessel_name、voyage、carrier_partner_id、origin/dest_node_id、etd/eta、capacity_teu、booked_teu、status、price_index |
| `dispatch_plan` | 调度方案 | plan_no、order_id、waybill_id、strategy(COST/TIME/BALANCED)、total_cost、total_hours、reliability、score、status(DRAFT/CONFIRMED/REJECTED)、summary |
| `dispatch_plan_item` | 方案分段 | plan_id、seq、mode、carrier_partner_id、resource_type(VEHICLE/TRAIN/VESSEL)、resource_id、start/end_node_id、start_at/end_at、cost、transit_hours、reliability |
| `transfer_window` | 中转衔接 | plan_id、node_id、from_seq/to_seq、arrival_at、departure_at、wait_hours、status(OK/TIGHT/MISSED) |
| `alert` | 预警 | alert_no、alert_type(DELAY/DEVIATION/TEMP_HUMIDITY/STAY/DOOR_OPEN/EXCEPTION)、level、waybill_id、segment_id、container_id、node_id、title、content、status(OPEN/ACK/CLOSED)、occurred_at、acked_by/at、closed_at |
| `exception_ticket` | 异常工单 | ticket_no、alert_id、order_id、waybill_id、type、description、assignee_user_id、status(OPEN/PROCESSING/RESOLVED/CLOSED)、resolution |
| `iot_device` | IoT 设备 | device_no、device_type(GPS/TEMP_HUMIDITY/DOOR/IMPACT)、container_id、vehicle_id、status(ONLINE/OFFLINE)、last_seen_at |
| `iot_reading` | IoT 读数 | device_id、container_id、temperature、humidity、door_open、impact_g、lng/lat、reported_at |
| `geo_fence` | 电子围栏 | name、fence_type(PORT/STATION/WAREHOUSE/DEPOT)、node_id、center_lng/lat、radius_m、status |

---

## 3. 接口（新增约 20 个，详见 `docs/11-Stage3-接口契约.md`）

| 模块 | 接口 |
|---|---|
| 智能调度 | `POST /dispatch/plans/generate`（orderId，生成 COST/TIME/BALANCED 三方案）、`GET /dispatch/plans`、`GET /dispatch/plans/:id`、`POST /dispatch/plans/:id/confirm`（按方案签发运单/分段、订单 DISPATCHED） |
| 调度看板 | `GET /dispatch/board`（待调度/运力利用率/近期班列班轮/衔接窗口/异常） |
| 运力池 | `GET /capacity/summary`、`GET /capacity/vehicles`、`GET /capacity/trains`、`GET /capacity/vessels` |
| 监控大屏 | `GET /monitor/overview`、`GET /monitor/waybills/:id/live`、`GET /monitor/trend` |
| 预警中心 | `GET /alerts`、`POST /alerts/:id/ack`、`POST /alerts/:id/close` |
| 异常工单 | `GET /exceptions`、`POST /exceptions/:id/handle` |
| IoT | `GET /iot/devices`、`GET /iot/readings`、`POST /iot/readings`（Mock 上报，超阈值自动预警）、`GET /geo-fences` |

**方案生成规则（确定性 Mock）**：
- 线路取订单/线路模板；按 ROAD/SEA/RAIL 组合，运力从 vehicle/train/vessel 池中按可用性、价格指数、时效选择。
- 三策略：COST（运费最低）、TIME（总时长最短）、BALANCED（成本/时效加权 + 可靠度）。
- 评分：`score = 100 - 成本归一化*40 - 时长归一化*40 + 可靠度*20`；输出总价/总时长/可靠度/衔接窗口。
- 确认：事务内创建主运单+分段运单+分段（复用 Stage2 签发逻辑）+ 更新订单/方案状态+事件/存证。

---

## 4. 页面与角色

| 路由 | 页面 | 角色 |
|---|---|---|
| `/dispatch/plans` | 智能调度中心：待调度订单、生成 3 方案对比、方案详情、确认调度 | MTO/ADMIN |
| `/dispatch/board` | 调度看板：运力利用率、班列/班轮、衔接窗口、待办 | MTO/ADMIN |
| `/capacity` | 运力池：车辆/班列/班轮 Tabs、状态与利用率 | MTO/ADMIN/承运人 |
| `/monitor` | 可视化大屏：KPI、模式分布、在线运单轨迹、预警滚动、时效达成 | MTO/ADMIN/CARRIER/TERMINAL |
| `/alerts` | 预警中心：告警列表/级别筛选/确认/关闭；异常工单处置 | MTO/ADMIN/TERMINAL |
| 既有页面 | 订单详情「智能调度」入口；运单跟踪显示实时位置/IoT 读数/预警 | 保持 Stage1/2 可用 |

---

## 5. Mock 数据（Stage 3 追加）

- 运力：车辆 12、班列 8、班轮 8、电子围栏 12、IoT 设备 20（GPS 12 / 温湿度 5 / 门磁 3）、读数 199。
- 调度方案：10 套（3 策略 × 3 订单 + 1 已确认），含分段/衔接窗口/评分。
- 预警：20 条（延误/偏航/温湿度/停留/开门/异常），其中 12 OPEN、4 ACK、4 CLOSED；异常工单 6 条。
- 复用 Stage2 的 60 运单/172 箱动态/312 存证。

---

## 6. 演示闭环

订单（待调度）→ 智能调度中心生成 3 套方案（成本/时效/平衡）→ 选择方案确认 → 自动签发一单制运单/分段 →
调度看板查看运力与衔接 → 监控大屏查看在线运单轨迹/模式分布/预警 → 预警中心确认告警并生成/处置异常工单 →
运单跟踪（Stage2）继续节点/箱/单证/存证。

---

## 7. 执行顺序与分工

| 里程碑 | 内容 | 负责 | 产出 |
|---|---|---|---|
| M0 | docs/10、docs/11、权限/状态/评分规则 | Lead | 文档 |
| M1 | schema v3（44 表）+ Stage3 种子 + 校验 | Lead | api/db |
| M2 | 调度/运力/监控/预警/IoT API + 方案确认签发 | api-dev | api/src |
| M3 | 调度中心/看板/运力池/大屏/预警页 + testid | web-dev | web/src |
| M4 | accept:stage3（≥30 断言）、e2e:stage3（≥6 阶段/8 截图）、Stage1/2 回归 | Lead | 脚本/截图/报告 |
| M5 | docs 00/01/03/10/11/12 + README、Gitea 推送 | Lead | 提交 |

---

## 8. 验收标准

1. `npm run setup`：44 表；车辆 12/班列 8/班轮 8/方案 10/预警 20/异常工单 6/IoT 设备 20/读数 199/围栏 12。
2. `npm run build` 零错误；Stage1 53 + Stage2 33 + v0 34 回归通过。
3. `npm run accept:stage3` **33 项断言**：三方案生成与评分、方案确认签发运单、运力池、调度看板、大屏 overview/trend、实时位置、预警 ack/close、异常工单处置、IoT 超阈值自动预警与去重、权限。
4. `npm run e2e:stage3` **7 阶段 / 8 张截图**：调度中心方案对比→确认、看板、运力池、大屏、预警/工单处置、运单实时监控。
5. 监控数字与种子数据一致；大屏 ECharts 离线渲染；无 JS 异常。

---

## 9. 已知简化

- 评分/推荐为确定性规则（非 AI 算法）；运力选择按池内可用资源模拟。
- 大屏为 ECharts 经纬度散点/折线，不接真实地图瓦片；电子围栏只做展示与 Mock 判定。
- IoT 为 Mock 上报（定时/手动），无 MQTT Broker；超阈值自动生成预警。
- 方案确认按模式生成分段；复杂多走廊调度留给后续迭代。
