# Stage 4 验收报告（结算中心 v2 / 对账 / 发票 / 支付 / 保理 / 保险 / 经营分析）

> 验收日期：2026-10-22
> 环境：Windows 11 / Node v24.22.0 / MySQL 8.0.46（本机）/ 本机 Edge
> 依据：`docs/13-Stage4-执行计划.md`、`docs/14-Stage4-接口契约.md`
> 结论：**Stage 4 通过**，可进入 Stage 5（集成中心 / 监管 / 运营后台 / 全链路验收）

---

## 1. 交付范围

| 模块 | 交付内容 |
|---|---|
| 数据基座 | 53 表（Stage3 44 + 9 张财务表 + bill 扩展）；11 角色（新增 FINANCE/INSURANCE）、11 个演示账号 |
| 计费引擎 | 签收出账：应收（客户价+附加费+税额+成本/毛利）逐段 `bill_item` + 自动生成各段承运人应付账单 |
| 账单 | 应收/应付列表、账单详情（明细/发票/支付/对账）、账单状态 |
| 对账 | 按对手方/周期汇总应付账单 → 生成 → 发送 → 确认（确认额/差异）→ 异议 |
| 发票 | 按应收账单开票（FP 号、9% 税额、TAX 报文）、作废 |
| 支付 | 登记收付款 → 银行回执 Mock → 核销账单（全额 PAID/部分核销）、超额 42201 |
| 保理 | 申请 → 审批（手续费）→ 放款（生成 IN 支付） |
| 保险 | 货运险保单（BX 号、保额×费率=保费） |
| 经营分析 | 收入/成本/毛利/毛利率、AR 账龄、14/30 天趋势、按客户/模式；财务看板 |
| 页面 | 结算中心改造、对账、发票、收付款、保理、经营分析（ECharts）、保险保单 |
| 兼容 | v0 34 + Stage1 53 + Stage2 33 + Stage3 33 回归全部通过 |

---

## 2. 数据校验

```
bill 24（应收 12 / 应付 12，¥315,694 / ¥111,184）| bill_item 48（逐单明细和 = 账单总额，0 不一致）
invoice 10（ISSUED 8 / PENDING 1 / VOID 1）| payment 8（SUCCESS 5 / PENDING 2 / FAILED 1）
payment_allocation 5 | reconciliation 6（DRAFT 1 / SENT 2 / CONFIRMED 2 / DISPUTED 1）
factoring_application 4（SUBMITTED/APPROVED/REJECTED/SETTLED 各 1）| insurance_policy 8 | stat_daily 90
```

---

## 3. 自动化验收结果

| 验收项 | 命令 | 结果 |
|---|---|---|
| 构建 | `npm run build` | ✅ 后端 tsc + 前端 vue-tsc/vite build 零错误 |
| Stage 4 API | `npm run accept:stage4` | ✅ **31/31 断言** |
| Stage 3 API | `npm run accept:stage3` | ✅ **33/33 断言** |
| Stage 2 API | `npm run accept:stage2` | ✅ **33/33 断言** |
| Stage 1 API | `npm run accept` | ✅ **53/53 断言** |
| v0 回归 | `npm run accept:v0` | ✅ **34/34 断言** |
| Stage 4 UI | `npm run e2e:stage4` | ✅ **7 阶段 / 8 张截图 / 无 JS 异常** |
| Stage 3 UI | `npm run e2e:stage3` | ✅ **7 阶段 / 8 张截图** |
| Stage 2 UI | `npm run e2e:stage2` | ✅ **6 阶段 / 6 张截图** |
| Stage 1 UI | `npm run e2e` | ✅ **13 阶段 / 16 张截图** |

API 断言合计 **184 项**（53+34+33+33+31）；UI E2E 合计 **33 个阶段 / 38 张截图**。

**accept:stage4 覆盖**：签收→出账（应收+应付+逐段明细、明细和=总额、税额/毛利）、重复出账 40901（v0 兼容）、订单列表去重（行数=唯一 id 数）、对账创建/发送/确认/异议、开票（FP 号/9% 税额）/重复开票 40902/作废、支付回执/核销/超额 42201、保理申请/审批/手续费、投保（BX/保费）、经营分析 KPI/AR 账龄/趋势/客户/模式、财务看板、权限隔离（货主/结算/保险）。

**e2e:stage4 覆盖**：结算中心 KPI/账单/详情抽屉、对账创建发送确认、发票作废、支付回执、保理审批、经营分析 4 图、保险投保。

---

## 4. 截图清单（`docs/screenshots/stage4/`）

| 文件 | 场景 |
|---|---|
| 01-结算中心.png | AR/AP/毛利 KPI、应收/应付账单列表 |
| 02-账单详情.png | 账单明细/发票/支付/对账抽屉 |
| 03-对账管理.png | 对账单列表与创建/发送/确认 |
| 04-发票管理.png | 电子发票列表与作废 |
| 05-收付款.png | 收付款列表与银行回执确认 |
| 06-保理工作台.png | 保理申请与审批 |
| 07-经营分析.png | 收入/成本/毛利趋势、客户/模式、AR 账龄 ECharts |
| 08-保险保单.png | 保单列表与投保 |

---

## 5. 已知简化（Stage 5+ 处理）

- 银行/税务/保理/保险均为 Mock 适配器（同步回执），无真实资金流与发票签章。
- 数据中台用 `stat_daily` 汇总表模拟 ADS，不做完整 ODS/DWD/DWS 分层。
- 账单列表未含发票状态，已作废发票的账单仍显示「开票」入口（点击返回 40902 业务提示）。
- 账期/逾期按日期计算；差异工单以对账明细差异原因记录。

---

## 6. 复现命令

```powershell
npm run setup            # 冷启动：53 表 + Stage4 种子
npm run dev              # API:8080 + Web:5173
npm run build
npm run accept           # Stage 1（53）
npm run accept:stage2    # Stage 2（33）
npm run accept:stage3    # Stage 3（33）
npm run accept:stage4    # Stage 4（31）
npm run accept:v0        # v0 回归（34）
npm run e2e              # Stage 1 UI（13 阶段 / 16 截图）
npm run e2e:stage2       # Stage 2 UI（6 阶段 / 6 截图）
npm run e2e:stage3       # Stage 3 UI（7 阶段 / 8 截图）
npm run e2e:stage4       # Stage 4 UI（7 阶段 / 8 截图）
```
