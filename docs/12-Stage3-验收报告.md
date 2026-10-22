# Stage 3 验收报告（调度中心 / 可视化大屏 / 异常预警 / IoT Mock）

> 验收日期：2026-10-22
> 环境：Windows 11 / Node v24.22.0 / MySQL 8.0.46（本机）/ 本机 Edge
> 依据：`docs/10-Stage3-执行计划.md`、`docs/11-Stage3-接口契约.md`
> 结论：**Stage 3 通过**，可进入 Stage 4（结算中心 v2 + 对账/发票/支付/保理 + 经营分析）

---

## 1. 交付范围

| 模块 | 交付内容 |
|---|---|
| 数据基座 | 44 表（Stage2 33 + 11 张运力/调度/预警/IoT 表）；种子 12 车辆、8 班列、8 班轮、10 方案、20 预警、6 工单、20 IoT 设备、199 读数、12 围栏 |
| 智能调度 | 三方案（COST/TIME/BALANCED）生成、评分/成本/时长/可靠度、分段与衔接窗口；确认后事务签发一单制运单（主单+3 分段单+5 单证+事件+存证） |
| 运力池 | 车辆/班列/班轮列表与利用率、状态、价格指数 |
| 调度看板 | 待调度订单、运力利用率、近期班列/班轮、中转衔接窗口、预警 |
| 监控大屏 | KPI（在线运单/准时率/待处理预警/在途箱量）、在线运单经纬度 ECharts、模式分布、实时预警、在线运单列表、14 天趋势 |
| 预警/工单 | 预警 ack/close 状态机（重复 40902、CRITICAL 未处置工单 42201）、异常工单处置 |
| IoT | 设备/读数查询、Mock 上报、温度/开门/停留规则自动预警、30 分钟去重、电子围栏 |
| 页面 | 智能调度中心、调度看板、运力池、深色监控大屏、预警中心；运单跟踪实时位置/IoT/预警 |
| 兼容 | v0 34 + Stage1 53 + Stage2 33 回归全部通过 |

---

## 2. 数据校验

```
vehicle 12 | train_schedule 8 | vessel_schedule 8 | dispatch_plan 10（3 策略×3 + 1 确认）
alert 20（OPEN 12 / ACK 4 / CLOSED 4）| exception_ticket 6（OPEN 3 / PROCESSING 1 / RESOLVED 2）
iot_device 20（GPS 12 / 温湿度 5 / 门磁 3）| iot_reading 199 | geo_fence 12
每个方案 3 分段 + 1 衔接窗口；车辆 8 空闲 / 3 在途 / 1 维修
```

---

## 3. 自动化验收结果

| 验收项 | 命令 | 结果 |
|---|---|---|
| 构建 | `npm run build` | ✅ 后端 tsc + 前端 vue-tsc/vite build 零错误 |
| Stage 3 API | `npm run accept:stage3` | ✅ **33/33 断言** |
| Stage 2 API | `npm run accept:stage2` | ✅ **33/33 断言** |
| Stage 1 API | `npm run accept` | ✅ **53/53 断言** |
| v0 回归 | `npm run accept:v0` | ✅ **34/34 断言** |
| Stage 3 UI | `npm run e2e:stage3` | ✅ **7 阶段 / 8 张截图 / 无 JS 异常** |
| Stage 2 UI | `npm run e2e:stage2` | ✅ **6 阶段 / 6 张截图** |
| Stage 1 UI | `npm run e2e` | ✅ **13 阶段 / 16 张截图** |

API 断言合计 **153 项**（53+34+33+33）；UI E2E 合计 **26 个阶段 / 30 张截图**。

**accept:stage3 覆盖**：三方案生成（策略齐全、COST 成本最低、TIME 时长最短、评分 0~100、总价=分段之和、衔接窗口）、方案确认（订单 DISPATCHED、签发一单制运单、同单其他方案 REJECTED）、运力池汇总/列表、调度看板、大屏 overview/trend、运单实时监控、预警 ack/close、重复 ack 40902、CRITICAL 工单约束 42201、异常工单处置、IoT 设备/读数/超阈值告警/去重、电子围栏、权限（承运人只读大屏、货主不可访问、承运人不可生成方案）。

**e2e:stage3 覆盖**：智能调度三方案对比 → 确认调度 → 订单已调度、调度看板 6 区块、运力池 3 Tabs、监控大屏 KPI/轨迹/环图/预警、预警中心确认/关闭/异常工单处置、运单实时监控。

---

## 4. 截图清单（`docs/screenshots/stage3/`）

| 文件 | 场景 |
|---|---|
| 01-智能调度三方案.png | COST/TIME/BALANCED 方案对比（评分/成本/时长/可靠度/分段/衔接窗口） |
| 02-调度确认-订单详情.png | 方案确认后订单已调度、一单制运单已签发 |
| 03-调度看板.png | 待调度/运力/班列/班轮/衔接窗口/预警 6 区块 |
| 04-运力池.png | 车辆/班列/班轮 Tabs 与利用率 |
| 05-监控大屏.png | 深色大屏 KPI / 在线运单经纬度 / 模式环图 / 实时预警 / 在线运单 |
| 06-预警中心.png | 预警列表、确认/关闭、异常工单 |
| 07-异常工单处置.png | 异常工单处置弹窗 |
| 08-运单实时监控.png | 运单跟踪实时位置 / IoT / 实时预警 |

---

## 5. 已知简化（Stage 4+ 处理）

- 方案生成与评分是确定性 Mock 规则（非 AI 算法）；运力池为空时有固定 Mock 资源兜底。
- 大屏使用 ECharts 经纬度散点/环图，不接真实地图瓦片；电子围栏仅展示与 Mock 判定。
- 预警去重未新增 `device_id`（alert 表冻结），按「同容器/标题 + 同类型 + 30 分钟」实现；STAY 用同设备位置未变且 ≥12h 判定。
- IoT 为 Mock 上报（手动/接口触发），无 MQTT Broker 与真实设备。
- 大屏 `modeDistribution` 按覆盖订单数统计；方案确认按模式生成分段，复杂多走廊留待后续。

---

## 6. 复现命令

```powershell
npm run setup            # 冷启动：44 表 + Stage3 种子
npm run dev              # API:8080 + Web:5173
npm run build
npm run accept           # Stage 1（53）
npm run accept:stage2    # Stage 2（33）
npm run accept:stage3    # Stage 3（33）
npm run accept:v0        # v0 回归（34）
npm run e2e              # Stage 1 UI（13 阶段 / 16 截图）
npm run e2e:stage2       # Stage 2 UI（6 阶段 / 6 截图）
npm run e2e:stage3       # Stage 3 UI（7 阶段 / 8 截图）
```
