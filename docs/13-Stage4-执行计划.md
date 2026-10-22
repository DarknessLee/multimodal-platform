# Stage 4 执行计划（结算中心 v2 + 对账/发票/支付/保理 + 经营分析）

> 状态：**已完成（2026-10-22）**——M1 数据基座、M2 后端、M3 前端、M4 联调验收、M5 交付全部完成；
> 验收记录见 `docs/15-Stage4-验收报告.md`（build 零错误、accept:stage4 31/31、e2e:stage4 7 阶段/8 截图、Stage1~3/v0 回归通过）。
> 上游：`docs/03-平台化演进路线.md` Stage 4
> 目标：从「单一分段账单」升级为「**自动计费 → 应收应付 → 在线对账 → 电子发票 → 支付/保理 → 经营分析**」的结算闭环。

---

## 1. 范围

### 做

- **计费引擎**：按价格规则 + 附加费自动生成应收账单（客户）与应付账单（各段承运人）明细 `bill_item`。
- **应收/应付**：账单类型、账期、到期日、税额、毛利；结算中心总览（AR/AP、逾期）。
- **在线对账**：按交易对手/周期生成对账单，发送→承运人确认/差异→差异工单。
- **电子发票**：从应收账单开票（Mock 税务适配器）、发票状态（待开/已开/作废）。
- **支付**：登记付款/收款、银行回执 Mock、支付核销账单。
- **保理（Mock）**：基于应收账单申请保理、审批、放款状态。
- **保险（Mock）**：货运险保单（保额/费率/保费/状态）。
- **经营分析**：收入/成本/毛利/毛利率、按客户/模式、AR 账龄、趋势；数据中台 Mock（`stat_daily` 日汇总）。
- **角色**：新增 FINANCE（金融/保理）、INSURANCE（保险）两个账号；SETTLEMENT 扩展对账/发票/支付。

### 不做（Stage 5）

- 真实银行/税务/保理对接、真实电子发票 OFD/PDF 签章、监管报送、运营配置后台。

---

## 2. 数据模型（53 表 = Stage3 44 + 9 新表 + bill 扩展）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `bill`（扩展） | 应收/应付账单 | bill_type(RECEIVABLE/PAYABLE)、counterparty_type/id、source、period、due_date、tax_amount、profit_amount、status |
| `bill_item` | 账单明细 | bill_id、seq、charge_type、mode、description、quantity、unit_price、amount、tax_rate、tax_amount、cost_amount、segment_id |
| `reconciliation` | 对账单 | recon_no、counterparty_type/id、period_start/end、total_amount、confirmed_amount、difference_amount、status(DRAFT/SENT/CONFIRMED/DISPUTED) |
| `reconciliation_item` | 对账明细 | recon_id、bill_id、amount、confirmed_amount、difference_reason、status(MATCH/DIFF) |
| `invoice` | 电子发票 | invoice_no、invoice_type、bill_id、buyer/seller name/tax_no、amount、tax_rate、tax_amount、total_amount、status(PENDING/ISSUED/VOID)、issued_at |
| `payment` | 收付款 | payment_no、direction(IN/OUT)、counterparty_type/id、bill_id、amount、method、status(PENDING/SUCCESS/FAILED)、bank_serial、paid_at |
| `payment_allocation` | 支付核销 | payment_id、bill_id、amount |
| `factoring_application` | 保理申请 | app_no、order_id、bill_id、applicant_customer_id、finance_partner_id、amount、discount_rate、fee、status(DRAFT/SUBMITTED/APPROVED/REJECTED/SETTLED) |
| `insurance_policy` | 货运险保单 | policy_no、order_id、waybill_id、insurer_partner_id、insured_amount、rate、premium、status、effective_from/to |
| `stat_daily` | 经营分析日汇总（ADS Mock） | stat_date、customer_id、mode、order_count、revenue、cost、profit、margin |

角色扩展：`user.role` 增加 FINANCE、INSURANCE；新增账号 `finance01`、`insurance01`。

---

## 3. 接口（新增约 24 个，详见 `docs/14-Stage4-接口契约.md`）

| 模块 | 接口 |
|---|---|
| 账单 | `GET /bills`（类型/状态/客户/分页）、`GET /bills/:id`（含明细/发票/支付）、`POST /orders/:id/settle` 扩展（应收+应付+明细） |
| 对账 | `GET /reconciliations`、`POST /reconciliations`（按对手方/周期汇总账单）、`GET /:id`、`POST /:id/send`、`POST /:id/confirm`、`POST /:id/dispute` |
| 发票 | `GET /invoices`、`POST /invoices`（按账单开票）、`GET /:id`、`POST /:id/void` |
| 支付 | `GET /payments`、`POST /payments`（登记收/付款）、`POST /:id/confirm`（银行回执 Mock + 核销） |
| 保理 | `GET /factoring/applications`、`POST /factoring/applications`、`POST /:id/approve`、`POST /:id/settle` |
| 保险 | `GET /insurance/policies`、`POST /insurance/policies`、`GET /:id` |
| 经营分析 | `GET /analytics/overview`、`GET /analytics/trend`、`GET /analytics/by-customer`、`GET /analytics/by-mode`、`GET /finance/dashboard` |

**计费规则**：应收 = 客户合同价/线路公开价 × 箱量 + 附加费（与 Stage1 报价引擎同源）；应付 = 各段承运商成本价；
账单明细逐段生成，税额按 9% 增值税 Mock；毛利 = 应收 - 应付。

---

## 4. 页面与角色

| 路由 | 页面 | 角色 |
|---|---|---|
| `/settlement`（改造） | 结算中心：AR/AP 总览、账单列表、开票/收款/对账入口 | SETTLEMENT/MTO/ADMIN/FINANCE |
| `/finance/reconciliations` | 对账管理：列表/详情/发送/确认/差异 | SETTLEMENT/FINANCE/MTO/ADMIN |
| `/finance/invoices` | 发票管理：开票、作废、状态 | SETTLEMENT/FINANCE/ADMIN |
| `/finance/payments` | 收付款：登记、银行回执、核销 | SETTLEMENT/FINANCE/ADMIN |
| `/finance/factoring` | 保理工作台：申请/审批/放款 | FINANCE/ADMIN |
| `/finance/analytics` | 经营分析：收入/成本/毛利/毛利率、客户/模式、AR 账龄、趋势 | MTO/FINANCE/ADMIN |
| `/insurance` | 保险保单：投保、保单列表 | INSURANCE/ADMIN |
| 既有页面 | 订单详情显示应收账单/发票/保单入口 | 保持 Stage1~3 可用 |

---

## 5. Mock 数据（Stage 4 追加）

- 账单：**应收 12 张 + 应付 12 张**（`bill_item` 48 条，明细之和 = 账单总额，0 不一致）。
- 发票 10 张（已开 8 / 待开 1 / 作废 1）、支付 8 笔（成功 5 / 待确认 2 / 失败 1）、核销记录 5 条。
- 对账单 6 张（草稿 1 / 已发送 2 / 已确认 2 / 有差异 1）+ 明细 10 条。
- 保理申请 4 张（提交/通过/拒绝/放款各 1）、保险保单 8 张。
- 经营分析日汇总 90 条（30 天 × 3 种模式）。
- 新增账号：finance01 / insurance01（密码 demo123）。

---

## 6. 演示闭环

货主签收 → 结算中心自动生成应收账单（含客户价/附加费/税额）与应付账单（各段承运商成本）→
经营分析看收入/成本/毛利 → 对账管理生成对账单并发送承运人确认（差异可提异议）→ 电子发票开具 →
登记收款/付款（银行回执 Mock）并核销账单 → 保理申请/审批 → 保险保单可查。

---

## 7. 执行顺序与分工

| 里程碑 | 内容 | 负责 | 产出 |
|---|---|---|---|
| M0 | docs/13、docs/14、权限/状态/计费规则 | Lead | 文档 |
| M1 | schema v4（53 表）+ Stage4 种子 + 校验 | Lead | api/db |
| M2 | 账单/对账/发票/支付/保理/保险/分析 API + 计费引擎 | api-dev | api/src |
| M3 | 结算中心改造 + 5 个财务页面 + 保单页 + ECharts 分析 | web-dev | web/src |
| M4 | accept:stage4（≥30 断言）、e2e:stage4（≥6 阶段/8 截图）、Stage1~3 回归 | Lead | 脚本/截图/报告 |
| M5 | docs 00/01/03/13/14/15 + README、Gitea 推送 | Lead | 提交 |

---

## 8. 验收标准

1. `npm run setup`：53 表；应收 12 / 应付 12 / 发票 10 / 支付 8 / 对账 6 / 保理 4 / 保单 8 / stat_daily 90。
2. `npm run build` 零错误；Stage1 53 + Stage2 33 + Stage3 33 + v0 34 回归通过。
3. `npm run accept:stage4` **31 项断言**：账单列表/明细、签收后应收应付生成、对账创建/发送/确认/差异、开票/作废 + TAX 报文、支付登记/回执/核销、保理申请/审批、保单、经营分析聚合、权限。
4. `npm run e2e:stage4` **7 阶段 / 8 张截图**：结算中心、账单详情、对账、发票、支付、保理、经营分析、保险。
5. 金额一致性：账单明细之和 = 账单总额；应收 - 应付 = 毛利；税额 = 不含税金额 × 税率；核销金额 ≤ 账单金额。

---

## 9. 已知简化

- 银行/税务/保理/保险均为 Mock 适配器（同步返回回执），无真实资金流与发票签章。
- 数据中台用 `stat_daily` 汇总表模拟 ADS，不做完整 ODS/DWD/DWS 分层。
- 账期与逾期按日期计算；差异工单仅记录原因与确认金额。
