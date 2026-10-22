# Stage 5 接口契约（集成中心 v2 / 监管 / 运营后台 / 全链路验收）

> 状态：**已实现并验收通过（2026-10-22）**；验收记录见 `docs/18-Stage5与全链路验收报告.md`。基线：`docs/02`（v0）、`docs/04`（Stage1）、`docs/08`（Stage2）、`docs/11`（Stage3）、`docs/14`（Stage4）保持有效；
> 本文件只定义 **Stage 5 新增/变更**。通用约定沿用（`/api`、`{code,message,data}`、JWT、camelCase、时间格式）。

---

## 1. 角色与权限

- 新增角色 `REGULATOR`（监管机构），账号 `regulator01`。
- 权限新增：菜单 `menu:regulator`、`menu:ops`；按钮 `integration:adapter-test`、`integration:retry-batch`、`regulator:report-create`、`regulator:report-submit`、`regulator:report-accept`、`regulator:check-run`、`ops:config-update`、`ops:dict-manage`、`ops:job-run`、`ops:full-chain-check`。
- 矩阵：ADMIN 全部；REGULATOR 监管菜单/报送/合规（只读+受理）；MTO 可查看全链路验收结果。

---

## 2. 集成中心 v2

### 2.1 `GET /api/integration/adapters`
item：`id、adapterCode、name、systemType/Label、protocol、endpoint、status(ONLINE/DEGRADED/OFFLINE)/Label、successRate、totalMessages、failedMessages、lastSyncAt、retryPolicy`。

### 2.2 `GET /api/integration/adapters/{id}/health`
`{ adapter, status, checks: [ { name, status, detail, latencyMs } ], checkedAt }`

### 2.3 `POST /api/integration/adapters/{id}/test`
Mock 连通性测试：`{ adapterId, success, latencyMs, message, testedAt }`；写审计。

### 2.4 `GET /api/integration/messages/{id}`
报文详情：`id、msgNo、systemType/Label、msgType、direction、relatedType/Id、status、retryCount、errorCode、requestBody、responseBody、sentAt、lastRetryAt`。

### 2.5 `POST /api/integration/messages/retry-batch`
`{ "ids": [1, 2, 3] }` → `{ retried, success, failed, results: [ { id, msgNo, status, errorMessage } ] }`；最多 20 条；成功写审计。

### 2.6 `GET /api/integration/stats?days=7`
```json
{
  "total": 235, "success": 220, "failed": 15, "successRate": 93.6,
  "bySystem": [ { "systemType": "RAIL_95306", "count": 80, "failed": 5, "successRate": 93.8 } ],
  "trend": [ { "date": "2026-10-16", "count": 30, "failed": 2 } ],
  "recentFailures": [ { "id": 1, "msgNo": "MSG…", "msgType": "PORT_CODECO", "errorCode": "EDI-500" } ]
}
```

---

## 3. 监管

### 3.1 `GET /api/regulator/reports?status=&reportType=&page=`
item：`id、reportNo、reportType/Label、period、regulatorName、status/Label、submittedAt、acceptedAt、createdAt`。

### 3.2 `POST /api/regulator/reports`
`{ "reportType": "OPERATION_MONTHLY", "period": "2026-10", "regulatorName": "上海市交通委员会" }`
服务端从订单/运单/账单/告警聚合生成 `content`（JSON 摘要），`reportNo = JG + yyyyMMdd + 序号`，状态 `DRAFT`。
### 3.3 `GET /api/regulator/reports/{id}` → `{ report, content }`
### 3.4 `POST /api/regulator/reports/{id}/submit` → `DRAFT → SUBMITTED`（写 `REGULATOR_SUBMIT` 报文）
### 3.5 `POST /api/regulator/reports/{id}/accept`
`{ "accepted": true, "comment": "材料齐全" }` → `SUBMITTED → ACCEPTED`；`accepted:false` → `RETURNED`（写 `REGULATOR_RECEIPT` 报文）。

### 3.6 `GET /api/regulator/compliance-checks?result=&checkType=&page=`
item：`id、checkNo、checkType/Label、targetType、targetId、result(PASS/WARN/FAIL)/Label、detail、checkedAt`。

### 3.7 `POST /api/regulator/compliance-checks/run`
规则（确定性 Mock）：
- `CONTAINER_NO`：ISO 6346 箱号校验位；
- `WAYBILL_COMPLETE`：主运单/分段/单证齐全；
- `INVOICE_MATCH`：发票金额 = 账单金额、税额 = 9%；
- `FINANCE_BALANCE`：应收/应付/毛利一致性；
- `MESSAGE_QUALITY`：报文请求/响应非空、失败可重试。
响应 `{ checks: [...], summary: { pass, warn, fail, total } }`。

### 3.8 `GET /api/regulator/dashboard`
`{ reports: { total, draft, submitted, accepted, returned }, compliance: { pass, warn, fail }, latestReports, latestChecks }`

---

## 4. 运营后台

### 4.1 `GET /api/ops/configs?category=`
item：`id、configKey、configValue、category、description、editable、updatedBy、updatedAt`。
### 4.2 `PUT /api/ops/configs/{key}`
`{ "configValue": "..." }` → 更新并写审计；不可编辑项 42201。
### 4.3 `GET /api/ops/dicts?dictType=` item：`id、dictType、dictKey、dictValue、sort、status、remark`。
### 4.4 `POST /api/ops/dicts`、`PUT /api/ops/dicts/{id}`：新增/修改字典（唯一键冲突 40902）。
### 4.5 `GET /api/ops/jobs` item：`jobCode、jobName、cron、status、lastRunAt、lastResult、lastDurationMs`。
### 4.6 `POST /api/ops/jobs/{code}/run`：Mock 执行（生成 job_log，SUCCESS/FAILED），写审计。
### 4.7 `GET /api/ops/health`
`{ status, db: { status, latencyMs }, adapters: { online, total }, jobs: { success, failed }, data: { tables, orders, waybills, documents, bills, invoices, alerts } }`
### 4.8 `GET /api/ops/dashboard`
`{ health, recentJobs, failedMessages, pendingReports, dataCounts, uptimeHours }`

### 4.9 `GET /api/ops/full-chain-check`
```json
{
  "checkedAt": "2026-10-22 18:00:00", "passed": true,
  "stages": [
    { "stage": 1, "name": "受理闭环", "checks": [ { "name": "用户/角色", "status": "PASS", "detail": "11 个用户 / 12 角色" } ] },
    { "stage": 2, "name": "一单制/箱管/存证", "checks": [ { "name": "哈希链", "status": "PASS", "detail": "312 条 0 异常" } ] },
    { "stage": 3, "name": "调度/预警/IoT", "checks": [] },
    { "stage": 4, "name": "结算/财务", "checks": [ { "name": "金额一致性", "status": "PASS", "detail": "24 账单 0 差异" } ] },
    { "stage": 5, "name": "集成/监管/运营", "checks": [] }
  ],
  "summary": { "total": 30, "pass": 29, "warn": 1, "fail": 0 }
}
```

---

## 5. 新增前端 testid

| 区域 | testid |
|---|---|
| 集成中心 | `adapter-card` `adapter-status` `adapter-test` `integration-stats` `message-row` `message-detail` `message-retry` `message-retry-batch` |
| 监管 | `regulator-kpi-reports` `regulator-kpi-compliance` `report-row` `report-status` `report-create` `report-submit` `report-accept` `compliance-row` `compliance-run` `compliance-result` |
| 运营 | `ops-health` `ops-config-row` `ops-config-save` `ops-dict-row` `ops-dict-create` `ops-job-row` `ops-job-run` |
| 全链路验收 | `acceptance-run` `acceptance-stage` `acceptance-summary` `acceptance-result` |

---

## 6. 验收钩子

1. 适配器 6 个、健康检查/测试返回确定性结果；报文详情含 request/response；批量重试成功并更新状态；统计成功率与失败列表。
2. 监管报送：生成→提交→受理（ACCEPTED/RETURNED）状态机与监管报文。
3. 合规检查：5 类规则返回 PASS/WARN/FAIL，汇总正确；箱号校验位可识别错误。
4. 运营：配置读取/更新（不可编辑 42201）、字典增改、任务 Mock 执行写日志、健康巡检数据量正确。
5. 全链路检查：5 个 Stage、≥20 项检查、passed=true（正常种子）；失败项可定位。
6. 权限：REGULATOR 仅监管菜单；ADMIN 全部；越权 40301。
7. 回归：Stage1 53 + Stage2 33 + Stage3 33 + Stage4 31 + v0 34 全部通过。
