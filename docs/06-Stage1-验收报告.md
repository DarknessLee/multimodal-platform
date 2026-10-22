# Stage 1 验收报告（平台基座与受理闭环）

> 验收日期：2026-10-22
> 环境：Windows 11 / Node v24.22.0 / MySQL 8.0.46（本机）/ 本机 Edge
> 依据：`docs/04-Stage1-接口契约.md`、`docs/05-Stage1-执行计划.md`
> 结论：**Stage 1 通过**，可进入 Stage 2（一单制运单 + 箱管 + 单证存证 + 95306/港口 EDI 适配器）

---

## 1. 交付范围

| 模块 | 交付内容 |
|---|---|
| 数据基座 | 26 张表（v0 7 表 + 19 张平台表）；程序化种子（真实编码/价格/时效） |
| 后端 | 9 角色 RBAC；主数据、报价（价格引擎）、合同（Mock CA 签章）、订单 v1（双通道/多货物行/取消）、看板、集成中心（适配器+报文+重试）、审计、通知；v0 10 接口保持兼容 |
| 前端 | 平台总览、客户/伙伴、主数据 5 Tab、报价工作台+详情、合同列表+详情（签署）、订单中心 v1、新下单（双通道）、集成消息（详情抽屉/重试）、审计日志、403；v0 全部页面保留 |
| 治理与 Mock | 事件 outbox → 5 类集成报文、审计中间件、站内通知、9 角色权限矩阵、Mock CA 签章 SHA-256、ISO 6346/GB 32100/UN-LOCODE/JT/T 1351 语义 |

---

## 2. 数据基座校验

`npm run setup` 冷启动后：

```
users 9 | customers 12 | partners 24 | port_station 20 | routes 8 | goods 15 | container_types 5
price_rules 42 | contracts 8 | quotes 12 | orders 20 | order_cargo 20 | waybills 15
segments 45 | tracks 104 | bills 6 | integration_messages 42 | audit_logs 30 | notifications 12 | events 26
```

一致性校验（SQL）：
- 报价总额 = 报价明细金额之和：**0 条不一致**
- 账单总额 = 分段费用之和：**0 条不一致**
- 合同签章哈希长度：**64 位**（SHA-256）
- 订单状态分布：BILLED 6 / DISPATCHED 3 / IN_TRANSIT 3 / SIGNED 2 / CONFIRMED 2 / CREATED 2 / CONTRACTED 1 / ARRIVED 1

---

## 3. 自动化验收结果

| 验收项 | 命令 | 结果 |
|---|---|---|
| 冷启动 | `npm run setup` | ✅ 26 表重建 + 种子数据 |
| 构建 | `npm run build` | ✅ 后端 `tsc --noEmit` + 前端 `vue-tsc`/`vite build` 零错误 |
| Stage 1 API | `npm run accept` | ✅ **53/53 断言通过** |
| UI 全流程 | `npm run e2e` | ✅ **13 个阶段通过、16 张截图、无 JS 异常** |
| v0 回归 | `node scripts/accept-v0.mjs` | ✅ **34/34 断言通过** |
| 冷启动串联 | setup → dev → accept | ✅ 53/53（干净种子） |

**accept v2 覆盖**：9 角色登录与权限集、越权 40301、未登录 40101、主数据（客户/伙伴/港站/线路/货物/箱型/价格规则/字典）、报价自动计价（明细=总额）、报价发送、合同创建/发送/Mock 签章（哈希 64 位）、接受报价转订单（合同/报价关联、货物行）、快速单 v0 通道 + cargoLines 多货物行、取消状态机、调度（CONTRACTED 可调度）→ 公路/海运/铁路节点 → 轨迹四类来源 → 签收 → 账单（= 分段之和）、看板 KPI/角色裁剪/趋势、集成报文与 FAILED 重试（40902）、合同/调度事件报文、审计日志、通知已读。

**e2e 覆盖**：货主总览 → 快速下单 → 询价（自动计价）→ MTO 发送报价 → MTO 创建/发送合同 → 货主 Mock 签署 → 接受报价转订单 → MTO 调度 → 承运人接单/提货/送达 → 港站进场/到港/到站 → 货主轨迹与签收 → 结算出账/账单 → 平台运营看板/集成中心/审计。

---

## 4. 截图清单（`docs/screenshots/stage1/`）

| 文件 | 场景 |
|---|---|
| 01-平台总览.png | 货主总览 KPI/趋势/待办/状态分布/集成健康 |
| 02-快速下单-订单详情.png | 快速下单（v0 兼容）订单详情 |
| 03-货主询价-报价明细.png | 询价自动报价 + 分段费用明细 |
| 04-MTO-发送报价.png | MTO 报价发送 |
| 05-MTO-合同待签署.png | 合同创建并发送 |
| 06-货主-合同已签署.png | Mock CA 签章 |
| 07-货主-报价转单订单.png | 接受报价生成订单 |
| 08-MTO-调度后运单跟踪.png | 调度生成运单/分段 |
| 09-承运人-任务完成.png | 公路承运人节点上报 |
| 10-港站作业完成.png | 港站进场/到港/到站 |
| 11-货主-全程轨迹.png | ECharts 全程轨迹 |
| 12-货主-签收完成.png | 运单签收 |
| 13-分段账单.png | 分段账单（¥15080.00） |
| 14-平台运营总览.png | 平台运营视角 |
| 15-集成中心-报文详情.png | 集成报文列表 + 详情抽屉 |
| 16-审计日志.png | 审计日志 |

---

## 5. 已知简化（Stage 1，后续阶段处理）

- FORWARDER 暂无「所服务客户」映射，读数据暂按全量可见（同 MTO）；Stage 2 增加映射表。
- 调度沿用 v0 固定「公路→海运→铁路」三段（R1 走廊），线路模板当前用于报价/展示；Stage 2/3 按模板生成分段。
- 事件投递为事务内同步写 outbox + 报文 + 通知，失败标 FAILED 不阻断业务；Stage 2 评估异步化。
- 权限矩阵以 `role_permission` 种子为准，个别写权限比文档标注宽一档（见 docs/04 §1.2 实现口径）。
- 报价接受暂不强制关联合同（UI 一键接受），合同签署作为独立闭环演示。

---

## 6. 复现命令

```powershell
npm run setup          # 冷启动：依赖 + 26 表 + 种子
npm run dev            # API:8080 + Web:5173
npm run build          # 后端 tsc + 前端 vue-tsc/vite build
npm run accept         # Stage 1 API 验收（53 断言）
node scripts/accept-v0.mjs   # v0 回归（34 断言）
npm run e2e            # UI E2E（13 阶段、16 张截图）
```
