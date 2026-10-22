# Stage 5 与五阶段全链路验收报告（v0 → v1 平台化 Mock 演示交付）

> 验收日期：2026-10-22
> 环境：Windows 11 / Node v24.22.0 / MySQL 8.0.46（本机）/ 本机 Edge
> 结论：**五阶段全部交付并通过全链路验收**，v1 平台化 Mock 演示版（59 表 / 12 角色 / 1 个 Web 端 / 2 条启动命令）完成。

---

## 1. 五阶段交付总览

| 阶段 | 主题 | 表数 | 角色 | 验收断言 | E2E |
|---|---|---|---|---|---|
| v0 | 演示版基线（询价→…→账单） | 7 | 5 | 34 | — |
| Stage 1 | 平台基座与受理闭环（主数据/报价/合同/订单/履约/结算/看板） | 26 | 9 | 53 | 13 阶段/16 截图 |
| Stage 2 | 一单制运单 + 箱管 + 单证存证 + 95306/港口 EDI | 33 | 9 | 33 | 6 阶段/6 截图 |
| Stage 3 | 智能调度 + 运力池 + 监控大屏 + 预警 + IoT Mock | 44 | 9 | 33 | 7 阶段/8 截图 |
| Stage 4 | 结算中心 v2（计费/对账/发票/支付/保理/保险）+ 经营分析 | 53 | 11 | 31 | 7 阶段/8 截图 |
| Stage 5 | 集成中心 v2 + 监管 + 运营后台 + 全链路验收 | **59** | **12** | **31** | 5 阶段/9 截图 |

**总计**：API 断言 **215 项**（v0 34 + S1 53 + S2 33 + S3 33 + S4 31 + S5 31）；UI E2E **38 个阶段 / 47 张截图**；build 零错误。

---

## 2. Stage 5 交付范围

| 模块 | 交付内容 |
|---|---|
| 集成中心 v2 | 6 个适配器（95306/港口 EDI/税务/银行/CA/保险）健康与成功率、连通测试、报文请求/响应详情、单条/批量重试（≤20）、集成统计（总量/成功率/系统/趋势/最近失败） |
| 监管 | 监管报送（运营月报/安全/投诉/统计）生成→提交→受理/退回、监管报文；5 类合规检查（箱号校验位/单证完整/发票一致/财务平衡/报文质量）；监管看板 |
| 运营 | 系统配置（只读/可编辑）、数据字典、定时任务 Mock 执行、系统健康巡检、运营看板 |
| 全链路验收 | `GET /ops/full-chain-check`：5 Stage / 22 项检查，输出 stages/summary/passed；页面可一键运行 |
| 页面 | 集成中心改造、监管看板/报送/合规、运营后台、配置与字典、定时任务、全链路验收（新增 7 页） |

---

## 3. 最终数据校验（`npm run setup` 冷启动）

```
59 表 | 12 用户 / 12 角色 / 86 权限 / 270 角色权限映射
客户 12 / 伙伴 24 / 港站 20 / 线路 8 / 价格规则 42 / 合同 8
报价 12 / 订单 20 / 运单 60（15 主单 + 45 分段单）/ 分段 45
单证 83 / 运单事件 116 / 存证 312（哈希链 0 异常）/ 箱动态 172 / 堆存 4
车辆 12 / 班列 8 / 班轮 8 / 调度方案 10 / 预警 20 / 异常工单 6 / IoT 设备 20 / 读数 199 / 围栏 12
应收 12 + 应付 12（明细 48，明细和=账单总额 0 不一致）/ 对账 6 / 发票 10 / 支付 8 / 保理 4 / 保单 8 / 经营汇总 90
集成报文 67 / 适配器 6 / 监管报送 5 / 合规检查 10 / 配置 10 / 字典 24 / 任务日志 12
```

**一键全链路检查**：5 Stage / 22 项 → passed=true（通过 19 / 警告 3 / 失败 0）。

---

## 4. 最终验收结果

| 验收项 | 命令 | 结果 |
|---|---|---|
| 构建 | `npm run build` | ✅ 零错误 |
| v0 基线 | `npm run accept:v0` | ✅ 34/34 |
| Stage 1 | `npm run accept` | ✅ 53/53 |
| Stage 2 | `npm run accept:stage2` | ✅ 33/33 |
| Stage 3 | `npm run accept:stage3` | ✅ 33/33 |
| Stage 4 | `npm run accept:stage4` | ✅ 31/31 |
| Stage 5 | `npm run accept:stage5` | ✅ 31/31 |
| Stage 1 UI | `npm run e2e` | ✅ 13 阶段 / 16 截图 |
| Stage 2 UI | `npm run e2e:stage2` | ✅ 6 阶段 / 6 截图 |
| Stage 3 UI | `npm run e2e:stage3` | ✅ 7 阶段 / 8 截图 |
| Stage 4 UI | `npm run e2e:stage4` | ✅ 7 阶段 / 8 截图 |
| Stage 5 UI | `npm run e2e:stage5` | ✅ 5 阶段 / 9 截图 |

---

## 5. 全链路演示脚本（2 条命令 + 单 Web 端）

```powershell
npm run setup     # 初始化 59 表 + 全部 Mock 种子
npm run dev       # API:8080 + Web:5173，打开 http://127.0.0.1:5173
```

演示路径（12 个账号密码 `demo123`）：
1. `shipper01` 下单 → `mto01` 生成三套调度方案并确认 → 自动签发一单制运单
2. 运单中心：事件链 / 3 分段 / 箱 / 单证 / 哈希链存证校验
3. 单证中心：POD 上传 → OCR → 电子签章 → 存证
4. 箱管中心：放箱/提箱/进场/装箱/还箱 + 堆存
5. 铁路/水路工作台：95306 提报/回执、订舱/确认
6. 监控大屏：KPI / 轨迹 / 模式分布 / 预警；预警中心确认/关闭/异常工单
7. 货主签收 → `settlement01` 出账（应收+应付+明细）→ 对账 → 开票 → 收款核销
8. `finance01` 保理审批/放款；`insurance01` 投保
9. 经营分析：收入/成本/毛利/毛利率/AR 账龄/趋势/客户/模式
10. `admin01` 集成中心（适配器/报文/重试/统计）→ 运营后台（健康/配置/字典/任务）→ 全链路验收
11. `regulator01` 监管看板 → 报送生成/提交/受理 → 合规检查

---

## 6. 截图索引

| 阶段 | 目录 | 张数 |
|---|---|---|
| v0 | `docs/screenshots/` | 7 |
| Stage 1 | `docs/screenshots/stage1/` | 16 |
| Stage 2 | `docs/screenshots/stage2/` | 6 |
| Stage 3 | `docs/screenshots/stage3/` | 8 |
| Stage 4 | `docs/screenshots/stage4/` | 8 |
| Stage 5 | `docs/screenshots/stage5/` | 9 |

---

## 7. Mock 标准与边界

- 箱号 ISO 6346 校验位、统一社会信用代码 GB 32100、UN/LOCODE 与铁路电报码、单据编码规则
- 95306 需求车（JT/T 1351 语义）、港口 CODECO/COARRI、电子发票、银行回执、CA 签章、监管报文
- 哈希链存证（本地链，非联盟链）、Mock CA / 银行 / 税务 / 保险 / 监管回执
- ECharts 离线渲染（地图为经纬度视图，不接瓦片）；IoT 为 Mock 上报（无 MQTT Broker）
- 全部外部系统与数据 Mock，无真实资金流、发票签章、监管网络

---

## 8. 复现全部验收

```powershell
npm run build
npm run accept          # Stage 1（53）
npm run accept:v0       # v0（34）
npm run accept:stage2   # Stage 2（33）
npm run accept:stage3   # Stage 3（33）
npm run accept:stage4   # Stage 4（31）
npm run accept:stage5   # Stage 5（31）
npm run e2e             # Stage 1（13 阶段/16 截图）
npm run e2e:stage2      # Stage 2（6/6）
npm run e2e:stage3      # Stage 3（7/8）
npm run e2e:stage4      # Stage 4（7/8）
npm run e2e:stage5      # Stage 5（5/9）
```
