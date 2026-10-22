# Stage 1 执行计划（全栈）— 平台基座与受理闭环

> 状态：**已完成（2026-10-22）**——M0 契约冻结、M1 数据基座、M2 后端、M3 前端、M4 联调验收、M5 交付全部完成；
> 验收记录见 `docs/06-Stage1-验收报告.md`（accept 53/53、e2e 13 阶段/16 截图、v0 回归 34/34、冷启动通过）。
> 上游依据：`docs/03-平台化演进路线.md`（总纲）、`多式联运供应链平台技术架构方案.md`
> 本文回答两个问题：**接下来每一步做什么**、**每一步的产出是什么**（可验收、可检查文件）。

---

## 0. 一句话目标

把当前 v0 的「单车单线路 Demo」升级为 **平台受理闭环**：
**询价 → 报价 → 合同签署 → 下单（多货物/多箱型/收发货人）→ 调度 → 履约 → 签收 → 账单**，
所有数据为 Mock 但按真实业务标准生成；单 Web 端、2 条命令启动、v0 演示路径不回退。

### 本阶段不做（留到后续阶段）

- 一单制主运单/分段单证/电子签章链（Stage 2）
- 箱管中心（放箱/还箱/箱损/堆存）与 EDI 真实报文（Stage 2）
- 调度算法、运力池、可视化大屏、IoT（Stage 3）
- 对账/发票/支付/保理、数据中台指标（Stage 4）
- 国家物流平台、监管报送、运营配置后台（Stage 5）

---

## 1. 交付物总览（文件级）

### 1.1 数据层（Lead 负责）

```
api/db/
├─ schema.sql          # 升级为 v1：v0 7 表 + 19 张平台表（共 26 表），保留 v0 字段兼容
├─ init.mjs            # 重建 + 写入 v1 演示数据（见 §4），幂等
└─ seed/               # 拆分：lib.mjs（编码/价格工具）/ reference.mjs（主数据）/ business.mjs（业务单）
docs/
├─ 04-Stage1-接口契约.md   # 字段级接口契约（新增，前后端唯一依据）
└─ 05-Stage1-执行计划.md   # 本文件
```

### 1.2 后端（api-dev 负责）

```
api/src/
├─ app.ts / index.ts                  # 挂载新增模块；保留 v0 路由
├─ config/permissions.ts              # 11 角色 × 菜单/按钮权限矩阵
├─ middleware/
│  ├─ rbac.ts                         # requirePermission(...)，40301
│  ├─ audit.ts                        # 写操作自动落 audit_log
│  └─ (auth.ts / error.ts 沿用 v0)
├─ modules/
│  ├─ auth/                           # 登录、me、权限集
│  ├─ master/                         # customers/partners/ports/routes/goods/container-types/price-rules/dicts
│  ├─ quote/                          # 询价、报价计算、报价接受转订单
│  ├─ contract/                       # 合同创建、Mock CA 签署
│  ├─ orderV1/                        # 订单 v1：多货物行、合同/报价/线路、取消、查询
│  ├─ dashboard/                      # 总览 KPI、趋势、待办
│  ├─ integration/                    # 网关、系统目录、消息查询/重试、适配器
│  ├─ audit/                          # 审计查询
│  └─ notification/                   # 站内消息
├─ platform/
│  ├─ eventBus.ts / outbox.ts         # 领域事件 → event_outbox → Mock 适配器
│  ├─ priceEngine.ts                  # 计费规则计算（报价/后续结算复用）
│  └─ sequence.ts                     # 单据号：WT/BJ/HT/PR/MSG 等
└─ (routes/services/mock 下 v0 代码保留，不动契约)
```

### 1.3 前端（web-dev 负责）

```
web/src/
├─ router/index.ts                    # 新增 9 条路由 + 权限守卫
├─ layouts/MainLayout.vue             # 角色化菜单、通知抽屉、用户信息
├─ stores/auth.ts                     # 增加 permissions；登录后拉取权限集
├─ api/                               # 新增 master/quote/contract/orderV1/dashboard/integration/audit
├─ views/
│  ├─ DashboardView.vue               # 平台总览
│  ├─ master/CustomersView.vue        # 客户管理
│  ├─ master/PartnersView.vue         # 伙伴管理
│  ├─ master/MasterDataView.vue       # 线路/港站/货物/箱型/价格规则（Tabs）
│  ├─ quote/QuotesView.vue            # 报价工作台（列表 + 新建询价/报价）
│  ├─ quote/QuoteDetailView.vue       # 报价明细/接受
│  ├─ contract/ContractsView.vue      # 合同列表
│  ├─ contract/ContractDetailView.vue # 合同详情 + 签署
│  ├─ orders/OrderCenterView.vue      # 订单中心 v1（列表/筛选）
│  ├─ orders/OrderNewV1View.vue       # 新下单（线路/合同/多货物）
│  ├─ integration/IntegrationMessagesView.vue
│  └─ audit/AuditLogsView.vue
├─ components/
│  ├─ KpiCard.vue / TrendChart.vue    # 总览
│  ├─ QuoteBreakdown.vue              # 费用明细（分段/模式/金额）
│  ├─ CargoLinesEditor.vue            # 多货物行编辑
│  ├─ ContractSignDialog.vue          # Mock 签章
│  ├─ IntegrationMessageDrawer.vue    # 报文查看（XML/JSON）
│  └─ PermissionGuard.vue             # 按钮级权限
└─ types/index.ts                     # 扩展类型
```

### 1.4 验收与文档（Lead 负责）

```
scripts/
├─ accept.mjs        # 升级 v2：≥50 断言，覆盖受理闭环 + v0 履约回归
└─ e2e-smoke.mjs     # 升级 v2：双通道下单（报价单 + 快速单）+ 截图
docs/
├─ 00/01/02/03/04/05  # 阶段完成同步
docs/screenshots/     # 新增总览/报价/合同/主数据/集成消息等截图
README.md             # 版本、路线图、演示脚本
```

---

## 2. 数据模型（v1，26 张表）

### 2.1 保留的 v0 表（结构不破坏）

`user`（扩展角色/联系方式/所属客户或伙伴）、`orders`（扩展字段）、`container`、`waybill`、`waybill_segment`、`track_point`、`bill`。

### 2.2 新增表（19 张）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `customer` | 客户主数据（货主/收货人/通知方） | customer_no、name、credit_code、contact、region_code、address、industry、credit_level、status |
| `partner` | 伙伴主数据 | partner_no、name、type(公路/铁路/水运/港口/货场/堆场/货代/金融/保险/监管)、qualifications(JSON)、rating、settlement_account |
| `port_station` | 港站/堆场/仓库节点 | node_code(UN/LOCODE 或车站电报码)、type、region_code、lng/lat、operator_partner_id、capacity_teu |
| `route_template` | 联运线路模板 | route_code、origin/destination_node_id、transit_node_ids(JSON)、modes(JSON)、distance_km、transit_days、base_cost、reliability |
| `goods_catalog` | 货物品类 | goods_code、name、category、hs_code、dangerous_flag、packaging、default_weight |
| `container_type` | 箱型主数据 | code(20GP…)、inner_volume_cbm、max_payload_t、tare_weight_t、teu |
| `price_rule` | 价格规则 | rule_no、mode、carrier/route/customer/contract 维度、charge_type、calc_method、unit_price、min_charge、ladder(JSON)、有效期、priority |
| `contract` | 合同 | contract_no、customer_id、type、effective_from/to、payment_terms、credit_limit、discount_rate、status、signer、signed_at、sign_hash |
| `quote` | 报价单 | quote_no、customer_id、order_type、route_template_id、container_type/count、cargo、required_date、transit_days、valid_until、total_amount、status |
| `quote_item` | 报价费用明细 | quote_id、seq、mode、charge_type、description、quantity、unit_price、amount、cost_amount、calculation(JSON) |
| `order_cargo` | 订单货物行（多货物） | order_id、seq、goods_code/name、quantity、weight_t、volume_cbm、container_type/count、dangerous_flag |
| `role` / `permission` / `role_permission` | RBAC | role_code、permission_code（菜单/按钮）、角色-权限映射 |
| `audit_log` | 操作审计 | user、role、action、module、target、detail(JSON)、ip、created_at |
| `integration_message` | 外部报文日志 | msg_no、system_code、direction、msg_type、standard、payload、status、retry_count、response、error |
| `notification` | 站内消息/待办 | user_id、type、title、content、related、read_flag |
| `event_outbox` | 事务性事件发件箱 | event_type、aggregate、payload、status、published_at |
| `dict_data` | 数据字典 | dict_type、dict_key、dict_value、label、sort_no |

### 2.3 `orders` 扩展字段

`order_type`（MULTIMODAL/ROAD_RAIL/RAIL_SEA）、`customer_id`（货主客户主数据）、`consignee_customer_id`、`notify_customer_id`、`contract_id`、`quote_id`、`route_template_id`、`priority`、`total_amount`、`currency`、`source`（QUICK/QUOTE）、`status` 扩展（INQUIRY/QUOTED/CONTRACTED/CONFIRMED/PLANNED/IN_TRANSIT/ARRIVED/SIGNED/SETTLED/CANCELLED/EXCEPTION）。

> 迁移策略：Demo 阶段直接按 v1 `schema.sql` **重建 + 重播种子**（`npm run db:init` 即重置），不做数据迁移；v0 接口返回结构保持兼容（新增字段只增不改）。

---

## 3. 接口契约（Stage 1 新增，约 30 个）

> 详细字段/示例见 M0 产出的 `docs/04-Stage1-接口契约.md`；错误码沿用 v0（40001/40101/40102/40301/40401/40901/50000）。

| 模块 | 接口 | 角色 |
|---|---|---|
| 认证 | `POST /auth/login`、`GET /auth/me`、`GET /auth/permissions` | 公开 / 登录用户 |
| 主数据 | `GET/POST /customers`、`GET/POST /partners`、`GET /ports`、`GET /routes`、`GET /goods`、`GET /container-types`、`GET/POST /price-rules`、`GET /dicts/:type` | MTO/ADMIN/FORWARDER（写：ADMIN/MTO） |
| 报价 | `POST /quotes`（询价→自动按价格规则算报价）、`GET /quotes`、`GET /quotes/:id`、`POST /quotes/:id/send`、`POST /quotes/:id/accept`（生成订单） | SHIPPER/FORWARDER/MTO |
| 合同 | `GET/POST /contracts`、`GET /contracts/:id`、`POST /contracts/:id/sign`（Mock CA 签章） | SHIPPER/FORWARDER/MTO |
| 订单 | `POST /orders`（支持 `quoteId` 或快速下单）、`GET /orders`、`GET /orders/:id`、`POST /orders/:id/cancel` | 按角色过滤 |
| 看板 | `GET /dashboard/summary`、`GET /dashboard/trend` | 登录用户（数据按角色裁剪） |
| 集成 | `GET /integration/systems`、`GET /integration/messages`、`POST /integration/messages/:id/retry` | MTO/ADMIN |
| 审计/消息 | `GET /audit/logs`、`GET /notifications`、`POST /notifications/:id/read` | ADMIN/MTO / 本人 |

**报价计算（priceEngine）**：按 `route_template` + `container_type` + 箱量 + `price_rule`（优先级：合同价 > 客户协议价 > 线路公开价）逐段计算（公路/海运/铁路/港杂），叠加附加费，输出 `quote_item` 明细、成本、毛利、有效期。

**事件驱动（Mock 集成）**：`quote.accepted`/`contract.signed`/`order.dispatched`/`order.settled` 等写 `event_outbox` → `integration/gateway` 调 Mock 适配器 → 生成 `integration_message`（95306 需求车提报、港口 EDI、CA 签章、银行回单、发票等）→ 更新状态 + 站内通知 + 审计。

---

## 4. 演示数据（seed v1）

| 数据 | 数量 | 真实感要点 |
|---|---|---|
| 客户 | 12 | 光伏/汽车零部件/家电/化工/食品/钢材/医药/电子/纺织/机械/建材/快消；统一社会信用代码按 GB 32100 校验位生成 |
| 伙伴 | 24 | 公路 6、铁路 2、水运 3、港口 3、货场 2、堆场 2、仓库 1、货代 2、金融/保险/监管 3；资质字段 |
| 港站节点 | 20 | UN/LOCODE（CNSHA/CNNGB/CNWUH…）+ 车站电报码；真实经纬度 |
| 线路模板 | 8 | 公铁水/铁水/公铁，含节点序列、里程、时效、可靠度 |
| 货物 | 15 | 含 HS 编码、危险品标识、包装 |
| 箱型 | 5 | 20GP/40GP/40HQ/45HQ/40RF，尺寸/载重按行业值 |
| 价格规则 | 42 | 公路按箱、海运按箱、铁路按箱、港杂按箱次；客户协议价优先；含燃油附加费 |
| 合同 | 8 | 框架合同，账期/信用额度/折扣，4 已签、2 待签、2 草稿 |
| 报价 | 12 | 4 询价/草稿、4 已报价、3 已接受（已转订单）、1 过期；含分段费用明细 |
| 订单 | 20 | 覆盖受理/运输/签收/结算各状态；含多货物行；3 票报价转单 + 17 票快速单 |
| 运单/分段/轨迹 | 15/45/104 | 与订单状态一致，轨迹含 GPS/EDI/司机/港站来源 |
| 账单 | 6 | 分段费用汇总，已出账 |
| 集成报文 | 42 | 95306 需求车提报（JT/T 1351 语义）、港口 CODECO、CA 签章、银行回单、税务发票、GPS；含 2 条 FAILED 供重试演示 |
| 审计/通知/事件 | 30/12/26 | 覆盖登录/报价/签合同/调度/签收/出账，事件写入 outbox |

**编码规则**：`WT/BJ/HT/PR/MO/WB/BL/MSG + 日期 + 序号`；箱号 ISO 6346（前缀+6 位序列+校验位）；所有数据确定性生成、可重复播种。

---

## 5. 前端页面与角色（9 个角色先落地）

| 路由 | 页面 | 可见角色 |
|---|---|---|
| `/dashboard` | 平台总览（KPI + 趋势 + 待办 + 集成健康） | 全部（登录后默认落地页） |
| `/orders` | 订单中心 v1（筛选/状态/类型/来源） | 全部（按角色过滤） |
| `/orders/new` | 下单（快速单 / 报价单转单） | SHIPPER/FORWARDER/MTO |
| `/orders/:id` | 订单详情（货物行/合同/报价/分段/轨迹/账单） | 全部 |
| `/quotes` | 报价工作台 | SHIPPER/FORWARDER/MTO |
| `/quotes/:id` | 报价明细 + 发送/接受 | 同上 |
| `/contracts`、`/contracts/:id` | 合同列表/详情/签署 | SHIPPER/FORWARDER/MTO |
| `/master/customers`、`/master/partners` | 客户/伙伴管理 | MTO/ADMIN/FORWARDER |
| `/master/data` | 线路/港站/货物/箱型/价格规则 | MTO/ADMIN |
| `/integration/messages`、`/audit/logs` | 集成报文、审计日志 | MTO/ADMIN |
| v0 页面 | 调度/任务/港站/跟踪/结算/账单 | 保持原角色 |

**角色（Stage 1）**：货主 SHIPPER、货代 FORWARDER、MTO、公路承运人 CARRIER、铁路承运人 RAIL_CARRIER、水路承运人 SEA_CARRIER、港站 TERMINAL、结算 SETTLEMENT、平台运营 ADMIN（金融/保险/监管账号 Stage 4/5 再开）。

**权限**：`role_permission` 控制菜单与按钮；后端 `requirePermission` 双保险；所有写操作落审计。

---

## 6. 执行顺序与分工（M0→M5）

| 里程碑 | 内容 | 负责 | 产出 | 验收 |
|---|---|---|---|---|
| **M0 契约冻结** | `docs/04` 字段级契约、权限矩阵、价格引擎规则 | Lead | docs/04 | 你审核确认 |
| **M1 数据基座** | schema v1 + seed v1 + 计数校验 | Lead | api/db/* | `npm run setup` 成功，表/行数符合预期 |
| **M2 后端** | 主数据/报价/合同/订单 v1/看板/集成/审计/RBAC | api-dev（写 `api/src/modules`） | 后端代码 + curl 自测 | `npm --prefix api run build` 零错误；curl 串通受理闭环 |
| **M3 前端** | 8 个新页面 + 布局/权限/图表 + testid | web-dev（写 `web/src`） | 前端代码 | `npm --prefix web run build` 零错误 |
| **M4 联调验收** | accept v2（≥50 断言）、e2e v2、截图、v0 回归 | Lead | scripts + screenshots | accept/e2e 全绿 |
| **M5 交付** | docs 00~05、README、阶段报告、git 提交 | Lead | 文档 + commit | 冷启动彩排 + 推送 Gitea |

**写范围隔离**：Lead（`api/db/**`、`docs/**`、`scripts/**`、根文件）｜api-dev（`api/src/**`）｜web-dev（`web/src/**`），互不覆盖。

---

## 7. 验收清单（Stage 1 完成定义）

1. `npm run setup` 冷启动：26 张表、9 账号、12 客户、24 伙伴、20 港站、8 线路、42 价格规则、8 合同、12 报价、20 订单、15 运单、45 分段、104 轨迹、6 账单、42 集成报文、30 审计、12 通知、26 事件（数量允许 ±10%）。
2. `npm run build`：后端 `tsc --noEmit` + 前端 `vue-tsc`/`vite build` 零错误。
3. `npm run accept`（v2）≥ 50 断言，覆盖：
   - 登录 9 角色 + 权限拒绝（40301）；
   - 主数据查询/新增价格规则；
   - 询价 → 自动报价（金额=分段明细之和）→ 货主接受 → 生成订单（含多货物行）；
   - 合同创建 → Mock 签章（sign_hash 可校验）→ 订单关联合同；
   - 快速下单通道回归；
   - 调度 → 公路/海运/铁路节点 → 轨迹 → 签收 → 账单；
   - 看板 KPI 与订单一致；审计/集成消息/通知已写入。
4. `npm run e2e`（v2）：UI 全流程（询价→报价→合同→下单→履约→签收→结算）+ 新增页面截图，无 JS 异常。
5. v0 演示路径与 10 个接口不回退。
6. 文档同步：`docs/00` 状态、`docs/01` 演示脚本、`docs/02` 基线契约、`docs/03` 阶段勾选、`docs/04` 新增契约、`README`。

### 8.7 Stage 1 已知简化（写入验收说明）

- FORWARDER 暂无「所服务客户」映射表，读订单/报价/合同/看板时暂按全量可见（与 MTO 一致）；Stage 2 增加 partner-customer 绑定后按客户裁剪。
- 调度沿用 v0 的固定「公路→海运→铁路」三段（R1 走廊）与 mock 价格；线路模板当前用于报价/展示，Stage 2/3 再按模板生成分段与多走廊调度。
- 事件投递为事务内同步写 outbox + 报文 + 通知，失败标 FAILED 不阻断业务；Stage 2 评估异步化。
- 权限矩阵以 `role_permission` 种子为准（见 docs/04 §1.2 实现口径），部分写权限比文档标注宽一档。

---

## 8. 风险与回滚

| 风险 | 应对 |
|---|---|
| v0 回归失败 | 保留 v0 路由与返回结构；accept 同时跑快速单与报价单两条链路 |
| 表/数据量大导致 seed 慢 | 种子数据程序化生成；`setup` 一次重建 < 10s |
| 角色/页面膨胀 | Stage 1 只开 9 角色；金融/保险/监管延后；每个角色 1~2 个工作台 |
| 报价规则复杂 | 先支持 PER_CONTAINER/PER_KM/PER_TON/FLAT 四种算法 + 附加费，复杂阶梯留字段后续启用 |
| 事件/集成做了但看不见 | 每次事件必落 integration_message + 审计 + 通知，UI 可查 |
| 与 v0 契约冲突 | 只增不改；v0 的 `/orders` 返回保留原字段，新增字段可选 |

---

## 9. 已确认决策（2026-10-22）

1. **角色范围**：Stage 1 落地 **9 个角色**（货主/货代/MTO/公路/铁路/水运/港站/结算/平台运营）；金融/保险/监管在 Stage 4/5 开启。
2. **下单通道**：**双通道**——保留 v0「快速下单」，新增「询价→报价→合同→下单」；accept/e2e 同时覆盖两条链路。
3. **推送节奏**：**每个 Stage 完成即 commit + push 到 Gitea**，便于按阶段审核。
4. **数据库策略**（已说明）：Demo 阶段按 v1 schema 重建 + 重播种子，不做增量迁移；v0 接口只增字段不改结构。
