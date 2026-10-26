# 多式联运供应链协同平台（V1.0，软著演示版）

单 Web 端多角色协同的多式联运演示平台：以 MTO 为核心，拉通货主、货代、公路/铁路/水路承运人、港站、结算、金融、保险、监管与平台运营，
全链路覆盖「**询价 → 报价 → 合同 → 订单 → 智能调度 → 一单制运单 → 公铁水履约 → 箱管/单证/存证 → 签收 → 应收应付 → 对账/发票/支付/保理 → 经营分析 → 集成/监管/运营**」。

- **形态**：单 Web 端（Vue 3）/ 模块化单体后端（Node + Express）/ 本地 MySQL 8
- **数据**：59 张表、12 角色、全量 Mock 种子，一键重建
- **启动**：2 条命令（`npm run setup` → `npm run dev`）
- **外部系统**：95306、港口 EDI、CA、银行、税务、保险、监管、GPS 全部 Mock，但编码/价格/时效/报文结构按真实业务标准生成
- **验收**：217 项 API 断言、38 阶段 UI E2E、build 零错误、全链路检查 passed=true

---

## 核心能力

| 领域 | 能力 |
|---|---|
| 受理 | 客户/伙伴/港站/线路/价格规则、询价报价、合同签署、订单管理 |
| 智能调度 | 成本/时效/平衡三方案推荐（评分/分段/中转衔接）、调度确认、运力池（车辆/班列/班轮）、调度看板 |
| 一单制 | 主运单 + 分段运单 + 交接事件链 + 箱关联 + 单证 + 哈希链存证 |
| 履约 | 公路/铁路/水路分段状态、港站作业、箱全生命周期、单证 OCR/签章、95306/港口 EDI 报文 |
| 监控 | 可视化大屏（KPI/轨迹/模式分布）、预警中心、异常工单、IoT Mock 阈值告警 |
| 结算 | 自动计费（应收+应付+明细+税额/毛利）、对账、电子发票、支付核销、保理、保险、经营分析 |
| 治理 | 集成中心（适配器/报文/重试/统计）、监管报送与合规检查、运营配置/字典/任务/健康巡检、全链路验收、审计 |

---

## 技术栈

- **前端**：Vue 3 + Vite + TypeScript + Element Plus + Pinia + Vue Router + Axios + ECharts（离线渲染）
- **后端**：Node 24 + Express 5 + TypeScript + mysql2 + zod + JWT + bcryptjs（tsx 运行）
- **数据库**：MySQL 8（本机服务，utf8mb4/InnoDB）
- **无需** Docker / JDK / Maven / MQ / ES / Redis

---

## 目录结构

```
multimodal-platform/
├─ api/        # 后端（src/modules 领域模块；db/schema.sql、db/seed 种子）
├─ web/        # 前端（views/components/api/router）
├─ docs/       # 最终方案、演示脚本、接口契约、验收报告、截图
├─ scripts/    # setup / dev / accept / e2e 脚本
├─ README.md
└─ package.json
```

> 前后端业务代码分别只放在 `web/`、`api/` 两个子目录。

---

## 环境要求

- Node.js ≥ 20（已验证 v24.22.0）、npm
- MySQL 8 本机服务（已验证 8.0.46），首次执行一次 `scripts/init-db.sql` 建库建号
- 本机 Edge（仅 UI E2E 需要）

---

## 启动（2 条命令）

```powershell
npm run setup     # 首次：安装依赖 → 重建 59 表 → 写入全量 Mock 种子
npm run dev       # 同时启动 API(8080) + Web(5173)
```

浏览器打开 <http://127.0.0.1:5173>，登录后进入 `/dashboard`；停止用 `Ctrl+C`。

> 重置演示数据：`npm run db:init`（清空并重建 59 表，恢复干净种子）。

---

## 演示账号（密码统一 `demo123`）

| 账号 | 角色 | 主要能力 |
|---|---|---|
| `shipper01` | 货主 | 询价、接受报价、签合同、下单、签收、账单/轨迹 |
| `forwarder01` | 货代 | 代客户询价/合同/下单 |
| `mto01` | 多式联运经营人 | 报价合同、智能调度、一单制运单、箱管单证、监控、财务 |
| `carrier01` | 公路承运人 | 接单/提货/送达、箱动态 |
| `rail01` | 铁路承运人 | 95306 需求车提报/受理 |
| `sea01` | 水路承运人 | 订舱/确认回执 |
| `terminal01` | 港站 | 进出场、箱况、到港到站、单证上传 |
| `settlement01` | 结算 | 出账、对账、发票、收付款 |
| `finance01` | 金融机构 | 支付回执、保理审批/放款、经营分析 |
| `insurance01` | 保险机构 | 货运险保单/投保 |
| `regulator01` | 监管机构 | 监管报送、合规检查、回执 |
| `admin01` | 平台运营 | 全部菜单、主数据、集成、审计、运营、全链路验收 |

---

## 全链路演示路径（约 10 分钟，详见 `docs/01-演示脚本与验收.md`）

1. `shipper01` 平台总览 → 订单中心「快速下单」
2. 报价工作台新建询价 → `mto01` 发送报价 → 合同新建/发送/签章
3. `mto01` 订单详情「智能调度」→ 生成三方案 → 选择「综合平衡」→ 确认调度
4. 运单中心 → 一单制详情（事件链/分段/箱/单证）→ 存证校验通过
5. 单证中心：上传 POD → OCR 识别 → 电子签章 → 存证
6. 箱管中心：放箱 → 提箱 → 进场 → 装箱 → 还箱（堆存费用）
7. `rail01` 铁路工作台需求车提报/回执；`sea01` 水路订舱/确认
8. 监控大屏 / 预警中心：KPI、轨迹、模式分布、预警确认/关闭、异常工单
9. `shipper01` 运单跟踪签收 → `settlement01` 出账（应收+应付+明细）→ 对账 → 开票 → 收款核销
10. `finance01` 保理审批、`insurance01` 投保、经营分析；`regulator01` 监管报送/合规；`admin01` 集成中心/运营后台/全链路验收

---

## 页面地图

| 路由 | 页面 |
|---|---|
| `/dashboard` | 平台总览 |
| `/orders`、`/quotes`、`/contracts`、`/master/*` | 订单、报价、合同、主数据 |
| `/dispatch/plans`、`/dispatch/board`、`/capacity` | 智能调度、调度看板、运力池 |
| `/waybills`、`/waybills/:id`、`/waybills/:id/track` | 运单中心、一单制详情、运单跟踪 |
| `/documents`、`/containers`、`/tasks`、`/terminal`、`/rail/tasks`、`/sea/tasks` | 单证、箱管、运输任务、港站、铁路/水路工作台 |
| `/monitor`、`/alerts` | 监控大屏、预警中心 |
| `/settlement`、`/bills/:id`、`/finance/reconciliations`、`/finance/invoices`、`/finance/payments`、`/finance/factoring`、`/finance/analytics`、`/insurance` | 结算、账单、对账、发票、收付款、保理、经营分析、保险 |
| `/integration/messages`、`/regulator`、`/ops`、`/ops/configs`、`/ops/jobs`、`/acceptance`、`/audit/logs` | 集成、监管、运营后台、配置/任务、全链路验收、审计 |

---

## 各端功能截图（角色视角）

> `docs/screenshots/` 保留 8 张跨端精选场景图；本节按 12 个角色端补充功能点截图，新增图在 `docs/screenshots/roles/`。
> 重叠功能直接复用精选图，不重复生成；所有截图均为 Mock 演示数据（V1.0 最终 UI）。

### 登录入口（12 个演示账号）

<img src="docs/screenshots/roles/00-登录页.png" alt="登录页-12个演示账号" width="760" />

### 货主端（shipper01）

- 平台总览：订单/运单/账单 KPI 与趋势
- 订单详情：货物、线路、运单、分段、账单
- 运单跟踪：全程轨迹、分段状态、签收入口

<img src="docs/screenshots/roles/01-货主-平台总览.png" alt="货主-平台总览" width="760" />
<img src="docs/screenshots/roles/02-货主-订单详情.png" alt="货主-订单详情" width="760" />
<img src="docs/screenshots/roles/03-货主-运单跟踪.png" alt="货主-运单跟踪" width="760" />

### 货代端（forwarder01）

- 报价工作台：按线路/箱型询价、发送报价、跟进合同

<img src="docs/screenshots/roles/04-货代-报价工作台.png" alt="货代-报价工作台" width="760" />

### MTO 端（mto01）

- 智能调度：三方案对比与确认（复用精选图）
- 一单制运单：主单/分段/事件/箱/单证/存证校验（复用精选图）
- 监控大屏：KPI、轨迹、模式分布、预警（复用精选图）

<img src="docs/screenshots/01-智能调度三方案.png" alt="MTO-智能调度三方案" width="760" />
<img src="docs/screenshots/02-一单制运单详情.png" alt="MTO-一单制运单详情" width="760" />
<img src="docs/screenshots/04-监控大屏.png" alt="MTO-监控大屏" width="760" />

### 公路承运人（carrier01）

- 运输任务：接单、提货、送达、任务状态

<img src="docs/screenshots/roles/05-公路承运人-运输任务.png" alt="公路承运人-运输任务" width="760" />

### 铁路承运人（rail01）

- 95306 工作台：需求车提报、受理回执、分段状态

<img src="docs/screenshots/roles/06-铁路承运人-铁路工作台.png" alt="铁路承运人-铁路工作台" width="760" />

### 水路承运人（sea01）

- 水路工作台：订舱、确认回执、分段状态

<img src="docs/screenshots/roles/07-水路承运人-水路工作台.png" alt="水路承运人-水路工作台" width="760" />

### 港站端（terminal01）

- 港站作业：进出场、箱况、到港/到站
- 箱管中心：箱动态、堆存、放箱/还箱/维修

<img src="docs/screenshots/roles/08-港站-港站作业.png" alt="港站-港站作业" width="760" />
<img src="docs/screenshots/roles/09-港站-箱管中心.png" alt="港站-箱管中心" width="760" />

### 结算端（settlement01）

- 结算中心：AR/AP/毛利、应收应付账单（复用精选图）
- 对账管理：对账单创建/发送/确认/差异

<img src="docs/screenshots/05-结算中心.png" alt="结算-结算中心" width="760" />
<img src="docs/screenshots/roles/10-结算-对账管理.png" alt="结算-对账管理" width="760" />

### 金融端（finance01）

- 保理工作台：申请、审批、放款
- 经营分析：收入/成本/毛利、客户/模式、AR 账龄（复用精选图）

<img src="docs/screenshots/roles/11-金融-保理工作台.png" alt="金融-保理工作台" width="760" />
<img src="docs/screenshots/06-经营分析.png" alt="金融-经营分析" width="760" />

### 保险端（insurance01）

- 保险保单：保单列表、投保、保费/保额

<img src="docs/screenshots/roles/12-保险-保险保单.png" alt="保险-保险保单" width="760" />

### 监管端（regulator01）

- 监管中心：报送/合规 KPI、最近报送与检查
- 监管报送：生成、提交、受理回执、退回

<img src="docs/screenshots/roles/13-监管-监管中心.png" alt="监管-监管中心" width="760" />
<img src="docs/screenshots/roles/14-监管-监管报送.png" alt="监管-监管报送" width="760" />

### 平台运营端（admin01）

- 集成中心：适配器健康、报文详情/重试、统计（复用精选图）
- 运营后台：健康巡检、数据量、任务执行、失败报文
- 全链路验收：5 Stage / 22 项检查（复用精选图）

<img src="docs/screenshots/07-集成中心.png" alt="平台运营-集成中心" width="760" />
<img src="docs/screenshots/roles/15-平台运营-运营后台.png" alt="平台运营-运营后台" width="760" />
<img src="docs/screenshots/08-全链路验收.png" alt="平台运营-全链路验收" width="760" />

---

## 自动化验收

```powershell
npm run build          # 后端 tsc + 前端 vue-tsc/vite build
npm run accept:all     # v0 + Stage1~5 API 验收：217 项断言
npm run e2e:all        # Stage1~5 UI E2E：38 个阶段
npm run audit:accounts # 全账号只读巡检：12 账号可见页面（API/控制台零错误）
```

| 项 | 结果 |
|---|---|
| 构建 | ✅ 零错误 |
| API 断言 | ✅ 217/217（34+53+34+33+32+31） |
| UI E2E | ✅ 38 阶段，无页面 JS 异常 |
| 全账号巡检 | ✅ 183/183 页，0 API/Console/JS 错误 |
| 冷启动 | ✅ 59 表 + 全量种子 |
| 全链路检查 | ✅ 5 Stage / 22 项，passed=true |

> 需要逐阶段验证时可用 `npm run accept`、`accept:stage2~5`、`accept:v0`、`e2e`、`e2e:stage2~5`。

---

## 文档与截图

| 文档 | 内容 |
|---|---|
| `docs/00-平台方案.md` | 最终架构、59 表数据模型、12 角色、模块与 Mock 标准 |
| `docs/01-演示脚本与验收.md` | 全链路演示脚本、验收命令与结果、截图索引 |
| `docs/02-接口契约.md` | 最终接口索引、错误码、核心状态机 |
| `docs/03-验收报告.md` | 全链路验收报告、数据校验、Mock 边界 |
| `docs/04-架构对照检查.md` | 与原始技术架构方案的对照、核心闭环核验、遗漏/过度开发审查与整改建议 |
| `docs/05-软著合规检查.md` | 软著登记材料要求对照、名称/版本/数据整改、申报缺口与材料清单 |
| `docs/06-全账号功能测试报告.md` | 12 账号全量页面巡检、错误修复、截图更新与复现命令 |
| `docs/screenshots/` | 8 张跨端精选场景截图（调度、一单制、单证、大屏、结算、分析、集成、验收） |
| `docs/screenshots/roles/` | 16 张角色端功能截图（登录、货主、货代、承运人、港站、结算、金融、保险、监管、运营） |

---

## Mock 标准与边界

- 箱号 **ISO 6346** 校验位；统一社会信用代码 **GB 32100**；UN/LOCODE、铁路车站电报码。
- 单据编码规范：`HT/BJ/MO/WB/SW/DOC/BL/FP/PAY/DZ/JG/BX`。
- 报文样例：95306 需求车（JT/T 1351 语义）、港口 CODECO/COARRI、电子发票、银行回执、CA 签章、保险、监管回执。
- 明确不做：真实外部系统网络/证书/资金流、真实区块链节点、真实地图瓦片、MQTT/真实 IoT、MQ/ES/时序库、多端 APP、在线支付。

---

## 常见问题

- **数据库连接失败**：确认 MySQL 已启动且执行过 `scripts/init-db.sql`；账号密码在 `api/.env`（默认 `mto_demo / Mto_demo_2026`）。
- **端口占用**：8080 / 5173 可分别调整 `api/.env` 与 `web/vite.config.ts`。
- **角色菜单缺失**：权限由 `role_permission` 种子决定，执行 `npm run setup` 重建。
- **集成报文 FAILED**：集成中心可单条/批量重试；成功后重复重试返回 40902（预期）。
- **构建 esbuild Temp 权限错误**：将 `TEMP`/`TMP` 指向项目内 `.tmp` 后重试。
- **修改前端源码后 dev 异常**：重启 `npm run dev`（已忽略原子写临时目录）。
- **想恢复初始数据**：`npm run db:init`。
