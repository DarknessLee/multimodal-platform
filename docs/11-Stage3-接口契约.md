# Stage 3 接口契约（调度中心 / 监控大屏 / 预警 / IoT）

> 状态：**已实现并验收通过（2026-10-22）**；验收记录见 `docs/12-Stage3-验收报告.md`。基线：`docs/02`（v0）、`docs/04`（Stage1）、`docs/08`（Stage2）保持有效；
> 本文件只定义 **Stage 3 新增/变更**。通用约定沿用（`/api`、`{code,message,data}`、JWT、camelCase、时间格式）。

---

## 1. 权限新增

- 菜单：`menu:monitor`（监控大屏）、`menu:alerts`（预警中心）、`menu:capacity`（运力池）；`menu:dispatch` 复用（调度中心）。
- 按钮/接口：`dispatch:generate`、`dispatch:confirm`、`alert:ack`、`alert:close`、`exception:handle`、`iot:ingest`。
- 矩阵：MTO/ADMIN 全部；CARRIER/TERMINAL 可看 monitor（只读）；MTO 可生成/确认方案、处理告警/工单。

---

## 2. 智能调度

### 2.1 `POST /api/dispatch/plans/generate`

```json
{ "orderId": 21 }
```
服务端：读取订单/线路模板/运力池，生成 **3 套方案**（COST / TIME / BALANCED），持久化为 `DRAFT`。
响应 `data`：
```json
{
  "order": { "id": 21, "orderNo": "MO202610220021", "status": "CONFIRMED" },
  "plans": [
    {
      "id": 1, "planNo": "DP202610220001", "strategy": "COST", "strategyLabel": "成本优先",
      "totalCost": 29680.00, "totalHours": 150.5, "reliability": 92.5, "score": 86.3,
      "status": "DRAFT", "summary": "公路+海运+铁路，成本最低",
      "items": [
        { "seq": 1, "mode": "ROAD", "modeLabel": "公路", "carrierName": "安捷卡车队",
          "resourceType": "VEHICLE", "resourceName": "沪A·D1234（40HQ 集卡）",
          "startNode": "上海嘉定工厂", "endNode": "上海洋山港",
          "startAt": "2026-10-23 08:00:00", "endAt": "2026-10-23 14:00:00",
          "cost": 2800.00, "transitHours": 6, "reliability": 96 },
        { "seq": 2, "mode": "SEA", "modeLabel": "海运", "carrierName": "中远海运集运",
          "resourceType": "VESSEL", "resourceName": "COSCO SHIPPING / 2026E",
          "startNode": "上海洋山港", "endNode": "武汉阳逻港",
          "startAt": "2026-10-23 20:00:00", "endAt": "2026-10-25 08:00:00",
          "cost": 10400.00, "transitHours": 36, "reliability": 94 },
        { "seq": 3, "mode": "RAIL", "modeLabel": "铁路", "carrierName": "中铁集装箱",
          "resourceType": "TRAIN", "resourceName": "X8021 班列",
          "startNode": "武汉吴家山站", "endNode": "成都城厢站",
          "startAt": "2026-10-25 18:00:00", "endAt": "2026-10-27 06:00:00",
          "cost": 16480.00, "transitHours": 36, "reliability": 93 }
      ],
      "transferWindows": [
        { "nodeName": "武汉阳逻港", "arrivalAt": "2026-10-25 08:00:00", "departureAt": "2026-10-25 18:00:00", "waitHours": 10, "status": "OK" }
      ]
    },
    { "id": 2, "strategy": "TIME", "totalCost": 33600, "totalHours": 128.5, "score": 81.2, "items": [] },
    { "id": 3, "strategy": "BALANCED", "totalCost": 31020, "totalHours": 136.5, "score": 88.7, "items": [] }
  ]
}
```
规则：同一订单重复生成时，先作废旧 `DRAFT` 方案再生成新方案；订单须为 `CREATED/CONFIRMED/CONTRACTED`，否则 40901。

### 2.2 `GET /api/dispatch/plans?orderId=&strategy=&status=&page=1&pageSize=10`
分页列表：`id、planNo、orderNo、strategy/strategyLabel、totalCost、totalHours、score、status、createdAt`。

### 2.3 `GET /api/dispatch/plans/{id}`
详情：方案字段 + `order` + `items` + `transferWindows`（结构同 2.1）。

### 2.4 `POST /api/dispatch/plans/{id}/confirm`
- 仅 `DRAFT`；订单状态须可调度；事务内：方案 `CONFIRMED`、其他同订单方案 `REJECTED`、订单 `DISPATCHED`、按方案 items 创建主运单/分段运单/分段/单证/事件/存证（复用 Stage 2 签发）、写审计/事件。
- 响应：`{ planId, orderId, waybillId, waybillNo, segments: [...] }`

---

## 3. 运力池与调度看板

### 3.1 `GET /api/capacity/summary`
```json
{
  "vehicles": { "total": 12, "idle": 8, "inTask": 3, "maintenance": 1, "utilization": 25.0 },
  "trains": { "total": 8, "upcoming": 5, "capacityTeu": 400, "bookedTeu": 268, "utilization": 67.0 },
  "vessels": { "total": 8, "upcoming": 6, "capacityTeu": 5200, "bookedTeu": 3480, "utilization": 66.9 }
}
```

### 3.2 `GET /api/capacity/vehicles?status=&carrierId=&page=`
item：`id、vehicleNo、plateNo、vehicleType/Label、carrierName、driverName、driverPhone、capacityT、containerSlots、status/Label、currentNode、lng、lat、lastSeenAt`。

### 3.3 `GET /api/capacity/trains?status=&page=`
item：`id、trainNo、operatorName、originNode、destNode、departureAt、arrivalAt、capacityTeu、bookedTeu、utilization、status/Label、priceIndex`。

### 3.4 `GET /api/capacity/vessels?status=&page=`
item：`id、vesselName、voyage、carrierName、originPort、destPort、etd、eta、capacityTeu、bookedTeu、utilization、status/Label、priceIndex`。

### 3.5 `GET /api/dispatch/board`
```json
{
  "pendingOrders": [ { "id": 21, "orderNo": "MO…", "statusLabel": "已确认", "cargoName": "光伏组件" } ],
  "capacity": { "...": "同 3.1" },
  "upcomingTrains": [ { "trainNo": "X8021", "route": "武汉吴家山站 → 成都城厢站", "departureAt": "…", "bookedTeu": 32, "capacityTeu": 50 } ],
  "upcomingVessels": [ { "vesselName": "COSCO SHIPPING", "voyage": "2026E", "route": "上海洋山港 → 武汉阳逻港", "etd": "…" } ],
  "transferWindows": [ { "planNo": "DP…", "nodeName": "武汉阳逻港", "waitHours": 10, "status": "OK" } ],
  "alerts": [ { "id": 1, "alertType": "DELAY", "levelLabel": "严重", "title": "海运段预计延误" } ]
}
```

---

## 4. 监控大屏

### 4.1 `GET /api/monitor/overview`
```json
{
  "kpis": { "onlineWaybills": 14, "inTransit": 6, "onTimeRate": 96.2, "alertsOpen": 8, "containersInTransit": 28, "avgTransitHours": 42.5 },
  "statusDistribution": [ { "status": "IN_TRANSIT", "statusLabel": "运输中", "count": 6 } ],
  "modeDistribution": [ { "mode": "ROAD", "count": 15 }, { "mode": "SEA", "count": 11 }, { "mode": "RAIL", "count": 9 } ],
  "livePoints": [ { "waybillId": 12, "waybillNo": "WB…", "containerNo": "MSCU…", "lng": 114.55, "lat": 30.7, "mode": "SEA", "statusLabel": "运输中" } ],
  "recentAlerts": [ { "id": 3, "level": "CRITICAL", "levelLabel": "严重", "title": "冷藏箱温度超标", "occurredAt": "…" } ],
  "onTimeTrend": { "dates": ["10-09", "…"], "onTime": [96, 95, …], "alerts": [1, 2, …] }
}
```

### 4.2 `GET /api/monitor/waybills/{id}/live`
`{ waybill: {id,waybillNo,status,statusLabel}, livePosition: {lng,lat,nodeName,occurredAt}, devices: [...], readings: {temperature,humidity,doorOpen,reportedAt}, alerts: [...], trail: [...] }`

### 4.3 `GET /api/monitor/trend?days=14`
`{ dates, onTimeRate[], alerts[] }`

---

## 5. 预警与异常工单

### 5.1 `GET /api/alerts?status=&level=&alertType=&page=`
item：`id、alertNo、alertType/alertTypeLabel、level/levelLabel、waybillNo、containerNo、nodeName、title、content、status/statusLabel、occurredAt、ackedAt、closedAt`。

### 5.2 `POST /api/alerts/{id}/ack` → `OPEN → ACK`（记录 ackedBy/ackedAt；重复 ack 40902）
### 5.3 `POST /api/alerts/{id}/close` → `ACK/OPEN → CLOSED`（记录 closedAt）
- 严重告警（CRITICAL）关闭时，若存在关联异常工单则提示先处置（42201）。

### 5.4 `GET /api/exceptions?status=&page=`
item：`id、ticketNo、alertNo、orderNo、waybillNo、type/typeLabel、description、assignee、status/statusLabel、createdAt、resolvedAt`。
### 5.5 `POST /api/exceptions/{id}/handle`
`{ "resolution": "已协调加班车，预计延误 2 小时", "status": "RESOLVED" }` → 更新工单，写审计/事件；响应工单详情。

---

## 6. IoT Mock

### 6.1 `GET /api/iot/devices?containerId=&deviceType=&page=`
item：`id、deviceNo、deviceType/Label、containerNo、vehicleNo、status/Label、lastSeenAt`。

### 6.2 `GET /api/iot/readings?deviceId=&containerId=&limit=50`
item：`id、deviceNo、containerNo、temperature、humidity、doorOpen、impactG、lng、lat、reportedAt`。

### 6.3 `POST /api/iot/readings`（Mock 上报/规则触发）
```json
{ "deviceNo": "IOT-TH-001", "temperature": 9.6, "humidity": 78, "doorOpen": false, "lng": 114.5, "lat": 30.7 }
```
规则（自动生成 `alert`，`DEDUP` 同设备同类型 30 分钟内不重复）：
- `temperature > 8`（冷藏箱）→ `TEMP_HUMIDITY / CRITICAL`
- `doorOpen = true` → `DOOR_OPEN / WARN`
- 车辆静止超过 12h（Mock 判定）→ `STAY / WARN`
响应 `{ reading: {...}, alertsCreated: [ { id, alertNo, alertType, level, title } ] }`

### 6.4 `GET /api/geo-fences?fenceType=` → 电子围栏列表（名称/类型/节点/中心经纬度/半径）。

---

## 7. 新增前端 testid

| 区域 | testid |
|---|---|
| 调度中心 | `dispatch-order-row` `plan-generate` `plan-card-COST` `plan-card-TIME` `plan-card-BALANCED` `plan-score` `plan-item` `transfer-window` `plan-confirm` |
| 调度看板 | `board-pending` `board-capacity` `board-trains` `board-vessels` `board-windows` `board-alerts` |
| 运力池 | `capacity-tab-vehicles` `capacity-tab-trains` `capacity-tab-vessels` `vehicle-row` `train-row` `vessel-row` `capacity-utilization` |
| 监控大屏 | `monitor-kpi-online` `monitor-kpi-ontime` `monitor-kpi-alerts` `monitor-map` `monitor-mode-chart` `monitor-alerts` `monitor-waybills` |
| 预警中心 | `alert-row` `alert-level` `alert-type` `alert-ack` `alert-close` `exception-row` `exception-handle` `exception-resolution` |
| 运单实时 | `live-position` `iot-reading` `live-alerts` |

---

## 8. 验收钩子

1. 生成方案：3 套、策略齐全、评分/成本/时长有序（COST 成本最低、TIME 时长最短）。
2. 确认方案：订单 DISPATCHED、生成主运单+分段+事件/存证、方案 CONFIRMED、其他方案 REJECTED。
3. 运力池：车辆/班列/班轮数量与利用率与种子一致；调度看板聚合正确。
4. 大屏：KPI/模式分布/在线运单/轨迹点与种子一致；ECharts 离线渲染。
5. 预警：ack/close 状态机正确；重复 ack 40902；异常工单可处置；CRITICAL 关闭前需先处置（42201）。
6. IoT：超阈值上报自动生成预警；同设备同类型 30 分钟内不重复。
7. 权限：承运人只读监控/预警；MTO/ADMIN 可生成方案/处置。
8. Stage1 53 + Stage2 33 + v0 34 回归通过。
