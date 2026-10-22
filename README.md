# 多式联运供应链平台 Demo

平台化多式联运演示：**货主 / 货代 / MTO / 公路承运人 / 铁路承运人 / 水路承运人 / 港站 / 结算 / 平台运营** 单 Web 端多角色协同；
一次委托从「询价 → 报价 → 合同 → 下单 → 调度 → 公铁水履约 → 签收 → 分段账单」全流程可点通。

- **当前版本：Stage 4（结算与经营分析）**：53 张表 / 11 角色 / 结算中心 v2 + 对账 / 发票 / 支付 / 保理 / 保险 / 经营分析
- 历史版本：Stage 3（调度与监控）、Stage 2（一单制/箱管/单证存证）、Stage 1（平台基座与受理闭环）、v0 演示版 均已保留兼容
- 技术栈：Vue 3 + Vite + TypeScript + Element Plus + ECharts ｜ Node 24 + Express 5 + TypeScript + MySQL 8
- 全部外部系统 Mock（95306 / 港口 EDI / CA / 银行 / 税务 / GPS），但编码、价格、时效、报文结构按真实业务标准生成

## 目录结构

```
multimodal-platform/
├─ api/        # 后端代码（Node/Express/TS；modules 按领域分模块）
├─ web/        # 前端代码（Vue3/Vite/TS；登录 + 总览 + 受理 + 履约 + 治理）
├─ docs/       # 方案、路线图、契约、验收报告、截图
├─ scripts/    # setup / dev / accept / accept-v0 / e2e 脚本
├─ README.md
└─ package.json
```

> 前后端代码分别只放在 `api/`、`web/` 两个子文件夹，根目录不放业务代码。

## 环境要求

- Node.js ≥ 20（已验证 v24.22.0）、npm
- MySQL 8 本机服务（已验证 8.0.46），已执行一次 `scripts/init-db.sql` 建库建号
- 无需 Docker / JDK / Maven

## 启动（2 条命令）

```powershell
npm run setup     # 首次：安装依赖 → 重建 26 表 → 写入 v1 种子（幂等，可重跑）
npm run dev       # 同时启动 API(8080) 与前端(5173)
```

打开 <http://127.0.0.1:5173>，登录后进入 `/dashboard`。停止用 `Ctrl+C`。

> 重置演示数据：`npm run db:init`（会清空并重建 26 张表，恢复冻结种子）。

## 演示账号（密码均为 `demo123`）

| 账号 | 角色 | 主要能力 |
|---|---|---|
| `shipper01` | 货主 | 快速下单、询价、接受报价、签合同、看轨迹、签收、看账单 |
| `forwarder01` | 货代 | 代客户询价/下单/签合同 |
| `mto01` | 多式联运经营人 | 报价、合同、调度、看板、集成/审计 |
| `carrier01` | 公路承运人 | 接单 → 已提货 → 已送达 |
| `rail01` | 铁路承运人 | 运单跟踪（工作台 Stage 2） |
| `sea01` | 水路承运人 | 运单跟踪（工作台 Stage 2） |
| `terminal01` | 港站 | 进场确认、箱况录入、到港/到站 |
| `settlement01` | 结算 | 生成账单、核对分段费用 |
| `admin01` | 平台运营 | 全部菜单 + 主数据 + 集成中心 + 审计日志 |

## Stage 1 演示路径

1. `shipper01` 登录 → **平台总览**（KPI/趋势/待办）→ 订单中心「快速下单」（多货物行）
2. 报价工作台「新建询价」→ 自动按价格规则分段计价 → 生成报价
3. `mto01` 登录 → 发送报价；合同管理「新建合同 → 发送」
4. `shipper01` 登录 → 合同详情「Mock 签署」→ 接受报价生成订单
5. `mto01` 订单详情「人工调度」→ 选择公路承运商
6. `carrier01` 运输任务：接单 → 已提货 → 已送达
7. `terminal01` 港站作业：海运进场/到港 + 铁路进场/到站
8. `shipper01` 运单跟踪查看 ECharts 全程轨迹 → 签收
9. `settlement01` 结算工作台生成账单（¥15080 = 三段费用之和）
10. `admin01` 平台运营：看板 / 集成中心（报文详情、FAILED 重试）/ 审计日志

## Stage 2 演示路径（一单制 / 箱管 / 单证存证）

1. `mto01` 调度订单 → 自动签发主运单 + 3 张分段运单 + 单证 + 交接事件 + 哈希链存证
2. 运单中心（`/waybills`）→ 一单制详情：事件时间轴、箱列表、单证列表、**存证校验通过**
3. 单证中心（`/documents`）→ 上传 POD → Mock OCR 识别箱号/签收人/日期/数量 → 电子签章 → 下载
4. 箱管中心（`/containers`）→ 箱详情：放箱 / 提箱 / 进场 / 装船 / 还箱 / 堆存 / 箱损维修
5. `rail01` 铁路工作台：需求车提报（JT/T 1351 语义）→ 受理回执
6. `sea01` 水路工作台：订舱 → 确认回执
7. `admin01` 集成中心：95306 / 港口 EDI / CA 报文可追溯

> Stage 1 的受理闭环（询价→报价→合同→下单→调度→签收→账单）继续保留可用。

## Stage 4 演示路径（结算 / 对账 / 发票 / 支付 / 保理 / 分析）

1. `settlement01` 结算中心（`/settlement`）：签收后出账，应收 + 各段承运人应付 + 明细/税额/毛利，账单详情/开票/收款
2. 对账管理（`/finance/reconciliations`）：按对手方/周期创建对账单 → 发送 → 确认/差异
3. 发票管理（`/finance/invoices`）：按应收账单开票（FP 号、9% 税额）、作废
4. 收付款（`/finance/payments`）：登记收付款 → 银行回执确认 → 核销账单
5. 保理工作台（`/finance/factoring`，`finance01`）：申请 → 审批（手续费）→ 放款
6. 保险保单（`/insurance`，`insurance01`）：投保 → BX 保单号/保费
7. 经营分析（`/finance/analytics`）：收入/成本/毛利/毛利率、趋势、客户/模式、AR 账龄
8. 演示账号：11 个（新增 `finance01` 金融机构、`insurance01` 保险机构）

## Stage 3 演示路径（智能调度 / 监控 / 预警 / IoT）

1. `mto01` 智能调度中心（`/dispatch/plans`）→ 选择待调度订单 → 生成 COST/TIME/BALANCED 三方案 → 确认调度
2. 调度看板（`/dispatch/board`）：待调度、运力利用率、班列/班轮、衔接窗口、预警
3. 运力池（`/capacity`）：车辆 / 班列 / 班轮与利用率
4. 监控大屏（`/monitor`）：KPI、在线运单经纬度 ECharts、模式环图、实时预警、在线运单
5. 预警中心（`/alerts`）：预警确认/关闭、异常工单处置
6. 运单跟踪：实时位置 / IoT 读数 / 实时预警
7. `POST /iot/readings`（Mock）：温度超阈值自动生成 CRITICAL 预警，30 分钟去重

## 自动化验收

```powershell
npm run build                 # 后端 tsc --noEmit + 前端 vue-tsc/vite build
npm run accept                # Stage 1 API 验收：53 项断言
npm run accept:stage2         # Stage 2 API 验收：33 项断言
npm run accept:stage3         # Stage 3 API 验收：33 项断言
npm run accept:stage4         # Stage 4 API 验收：31 项断言
npm run accept:v0             # v0 基线回归：34 项断言
npm run e2e                   # Stage 1 UI E2E：13 阶段、16 张截图（本机 Edge，无头）
npm run e2e:stage2            # Stage 2 UI E2E：6 阶段、6 张截图
npm run e2e:stage3            # Stage 3 UI E2E：7 阶段、8 张截图
npm run e2e:stage4            # Stage 4 UI E2E：7 阶段、8 张截图
```

- 验收报告：`docs/06-Stage1-验收报告.md`、`docs/09-Stage2-验收报告.md`、`docs/12-Stage3-验收报告.md`、`docs/15-Stage4-验收报告.md`
- 截图：`docs/screenshots/stage1/`、`stage2/`、`stage3/`、`stage4/`；v0 截图在 `docs/screenshots/`
- 契约：`docs/04`、`docs/08`、`docs/11`、`docs/14`（v0 基线：`docs/02`）

## 版本与路线图

- **v0 演示版（已交付）**：7 表 / 10 接口 / 5 角色，下单→调度→三段运输→签收→分段账单
- **v1 平台化演进（进行中）**：
  - ✅ **Stage 1 平台基座与受理闭环**（26 表、9 角色、报价/合同/订单 v1、集成与审计 Mock）
  - ✅ **Stage 2 一单制运单 + 箱管 + 单证存证 + 95306/港口 EDI**（33 表、哈希链存证、单证 OCR/签章）
  - ✅ **Stage 3 调度中心 + 可视化大屏 + 异常预警 + IoT Mock**（44 表、三方案推荐、运力池、大屏、预警工单）
  - ✅ **Stage 4 结算中心 v2 + 对账 / 发票 / 支付 / 保理 / 保险 / 经营分析**（53 表、应收应付、核销、ECharts 分析）
  - ⏭ Stage 5：集成中心 / 监管 / 运营后台 / 全链路验收
  - Stage 3：调度中心 + 可视化大屏 + 异常预警 + IoT Mock
  - Stage 4：结算中心 v2（计费引擎/对账/发票/支付/保理）+ 经营分析
  - Stage 5：集成中心 + 监管 + 运营后台 + 全链路验收
- 总纲与差距分析：[docs/03-平台化演进路线.md](docs/03-平台化演进路线.md)

## 常见问题

- **启动报数据库连接失败**：确认 MySQL 服务已启动，且已执行 `scripts/init-db.sql`；
  账号密码在 `api/.env`（默认 `mto_demo / Mto_demo_2026`）。
- **端口被占用**：8080 / 5173 可分别改 `api/.env` 与 `web/vite.config.ts`。
- **角色菜单缺失**：权限由 `role_permission` 种子决定，执行 `npm run setup` 重建。
- **报价提示无可用价格规则**：检查线路/箱型/模式是否有生效价格规则。
- **集成报文 FAILED**：集成中心可重试；成功后重复重试返回 40902。
- **想恢复初始数据**：`npm run db:init`。
- **构建报 esbuild Temp 权限错误**：将 `TEMP`/`TMP` 指向项目内 `.tmp` 后重试。
- **修改 web 源码后 dev 崩溃（Vite watcher EBUSY）**：重启 `npm run dev`（已忽略原子写临时目录）。

## 明确不做（演示范围）

微服务拆分、K8s 部署、真实 95306/港口 EDI/银行/税务/CA 对接、真实地图瓦片、区块链真节点、IoT 真设备、
MQ/ES/时序库、多端 APP、在线支付。上述能力以「模块化单体 + Mock 适配器 + 标准报文样例」模拟，后续阶段逐步增强。
