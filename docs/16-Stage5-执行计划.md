# Stage 5 执行计划（集成中心 / 监管 / 运营后台 / 全链路验收）

> 状态：**已完成（2026-10-22）**——M1 数据基座、M2 后端、M3 前端、M4 全链路验收、M5 交付全部完成；
> 验收记录见 `docs/18-Stage5与全链路验收报告.md`（build 零错误、accept:stage5 31/31、e2e:stage5 5 阶段/9 截图、五阶段回归全绿、59 表）。
> 上游：`docs/03-平台化演进路线.md` Stage 5
> 目标：完成平台化最后一公里——**外部系统集成可观测/可重试、监管报送与合规检查、运营配置与健康巡检、五阶段全链路验收**。

---

## 1. 范围

### 做

- **集成中心 v2**：适配器（95306/港口 EDI/税务/银行/CA/保险）健康度与成功率、报文请求/响应明细、单条/批量重试、失败统计与趋势。
- **监管报送**：按月/类型生成报送单（运营月报/安全/投诉/统计），提交→监管受理→回执；合规检查（箱号校验、单证完整性、发票一致性、数据质量）与监管看板。
- **运营后台**：系统配置（可编辑参数）、数据字典、定时任务（Mock 执行）、系统健康巡检（DB/适配器/任务/数据量）。
- **全链路验收**：一键运行五阶段检查（数据完整性、哈希链、金额一致性、告警闭环、集成报文、权限），输出验收报告。
- **角色**：新增 REGULATOR（监管机构）账号；ADMIN 运营后台；集成中心延续 ADMIN。

### 不做

- 真实监管接口/电子签章/定时调度框架（Mock 任务与回执）；不做跨机房/高可用。

---

## 2. 数据模型（59 表 = Stage4 53 + 6 新表 + integration_message 扩展）

| 表/扩展 | 用途 | 关键字段 |
|---|---|---|
| `integration_adapter` | 外部适配器 | adapter_code、name、system_type(RAIL_95306/PORT_EDI/TAX/BANK/CA/INSURANCE)、protocol、endpoint、status、success_rate、last_sync_at、retry_policy |
| `integration_message`（扩展） | 报文可观测 | adapter_id、direction(IN/OUT)、request_body、response_body、retry_count、next_retry_at、error_code |
| `regulator_report` | 监管报送 | report_no、report_type、period、regulator_name、content(JSON)、status(DRAFT/SUBMITTED/ACCEPTED/RETURNED)、submitted_at、accepted_at |
| `compliance_check` | 合规检查 | check_no、check_type、target_type/id、result(PASS/WARN/FAIL)、detail、checked_at |
| `ops_config` | 系统配置 | config_key、config_value、category、description、editable、updated_by/at |
| `ops_dict` | 数据字典 | dict_type、dict_key、dict_value、sort、status |
| `job_log` | 定时任务日志 | job_code、job_name、cron、status、started_at、finished_at、result |

角色：新增 `REGULATOR`（监管机构），账号 `regulator01`。

---

## 3. 接口（新增约 20 个，详见 `docs/17-Stage5-接口契约.md`）

| 模块 | 接口 |
|---|---|
| 集成中心 | `GET /integration/adapters`、`GET /integration/adapters/:id/health`、`POST /integration/adapters/:id/test`、`GET /integration/messages/:id`、`POST /integration/messages/retry-batch`、`GET /integration/stats` |
| 监管 | `GET /regulator/reports`、`POST /regulator/reports`、`GET /:id`、`POST /:id/submit`、`POST /:id/accept`、`GET /regulator/compliance-checks`、`POST /regulator/compliance-checks/run`、`GET /regulator/dashboard` |
| 运营 | `GET /ops/configs`、`PUT /ops/configs/:key`、`GET /ops/dicts`、`POST /ops/dicts`、`PUT /ops/dicts/:id`、`GET /ops/jobs`、`POST /ops/jobs/:code/run`、`GET /ops/health`、`GET /ops/dashboard`、`GET /ops/full-chain-check` |

---

## 4. 页面

| 路由 | 页面 | 角色 |
|---|---|---|
| `/integration/messages`（改造） | 集成中心：适配器健康 + 报文列表/详情/重试 + 统计 | ADMIN |
| `/regulator` | 监管看板：报送统计、合规检查结果 | REGULATOR/ADMIN |
| `/regulator/reports` | 监管报送：生成/提交/受理回执 | REGULATOR/ADMIN |
| `/regulator/compliance` | 合规检查：执行检查、结果明细 | REGULATOR/ADMIN |
| `/ops` | 运营后台：健康巡检、数据量、任务状态 | ADMIN |
| `/ops/configs` | 系统配置 + 数据字典 | ADMIN |
| `/ops/jobs` | 定时任务与执行日志 | ADMIN |
| `/acceptance` | 全链路验收：五阶段检查结果与报告 | ADMIN/MTO |

---

## 5. Mock 数据（Stage 5 追加）

- 适配器 6 个（95306/港口 EDI/税务/银行/CA/保险），健康状态与成功率。
- 报文扩展字段（请求/响应/重试次数）；新增 IN 方向回执与重试样例。
- 监管报送 5 张（草稿/已提交/已受理/退回）、合规检查 10 条（PASS/WARN/FAIL）。
- 系统配置 10 项、数据字典 24 项、任务日志 12 条。
- 新增账号 `regulator01`（密码 demo123）。

---

## 6. 全链路验收（最终交付）

`npm run accept:stage5` + `npm run e2e:stage5` + `npm run accept:all` + 四套 E2E，覆盖：
v0（7 表/10 接口/5 角色）→ Stage1（26 表/9 角色/受理闭环）→ Stage2（33 表/一单制/箱管/存证）
→ Stage3（44 表/调度/大屏/预警/IoT）→ Stage4（53 表/结算/对账/发票/支付/保理）
→ Stage5（59 表/集成/监管/运营/全链路检查）。

验收门槛：`accept` 53 + `accept:v0` 34 + `accept:stage2` 33 + `accept:stage3` 33 + `accept:stage4` 31 + `accept:stage5` ≥30；
E2E 13 + 6 + 7 + 7 + ≥6 阶段；build 零错误；冷启动 `setup` 2 条命令可演示。

---

## 7. 执行顺序与分工

| 里程碑 | 内容 | 负责 | 产出 |
|---|---|---|---|
| M0 | docs/16、docs/17、权限/状态 | Lead | 文档 |
| M1 | schema v5（59 表）+ Stage5 种子 | Lead | api/db |
| M2 | 集成 v2 / 监管 / 运营 / 全链路检查 API | api-dev | api/src |
| M3 | 集成中心改造 + 监管/运营/验收页面 | web-dev | web/src |
| M4 | accept:stage5、e2e:stage5、全量回归 | Lead | 脚本/截图 |
| M5 | docs/18 全链路验收报告 + 00~03/16/17 + README、Gitea 推送 | Lead | 提交 |

---

## 8. 验收标准

1. `npm run setup`：59 表；适配器 6、报文扩展、报送 5、合规 10、配置 10、字典 24、任务日志 12、12 角色。
2. `npm run build` 零错误；Stage1~4 + v0 回归全绿。
3. `npm run accept:stage5` ≥30 断言：适配器健康/测试、报文详情/批量重试/统计、监管报送状态机、合规检查、配置/字典/任务/健康、全链路检查。
4. `npm run e2e:stage5` ≥6 阶段/8 截图：集成中心、监管看板/报送、合规检查、运营后台、配置/字典、全链路验收。
5. `npm run accept:all` 一键全绿；README 2 条命令冷启动可演示完整 5 阶段闭环。

---

## 9. 已知简化

- 适配器健康/测试为 Mock（延迟与成功率确定性），无真实外部网络。
- 监管受理为 Mock 回执；合规检查为规则校验（箱号/单证/发票/金额）。
- 定时任务为手动触发 Mock，无真实 cron 调度器。
- 全链路检查覆盖关键数据与契约，不做全量数据质量平台。
