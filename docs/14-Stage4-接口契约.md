# Stage 4 接口契约（结算中心 v2 / 对账 / 发票 / 支付 / 保理 / 经营分析）

> 状态：**已实现并验收通过（2026-10-22）**；验收记录见 `docs/15-Stage4-验收报告.md`。基线：`docs/02`（v0）、`docs/04`（Stage1）、`docs/08`（Stage2）、`docs/11`（Stage3）保持有效；
> 本文件只定义 **Stage 4 新增/变更**。通用约定沿用（`/api`、`{code,message,data}`、JWT、camelCase、时间格式）。

---

## 1. 角色与权限

- 角色扩展：`FINANCE`（金融/保理）、`INSURANCE`（保险）；新增账号 `finance01`、`insurance01`。
- 权限新增：菜单 `menu:reconciliation`、`menu:invoice`、`menu:payment`、`menu:factoring`、`menu:insurance`、`menu:analytics`；
  按钮 `bill:issue-invoice`、`invoice:issue`、`invoice:void`、`payment:record`、`payment:confirm`、`recon:create`、`recon:send`、`recon:confirm`、`recon:dispute`、`factoring:apply`、`factoring:approve`、`insurance:create`、`analytics:read`。
- 矩阵：SETTLEMENT/FINANCE/ADMIN 结算与财务菜单；INSURANCE 保单 + 订单查看；MTO 可看经营分析；CARRIER 可确认对账单（只读/确认）。

---

## 2. 账单（应收/应付）

### 2.1 `GET /api/bills?billType=&status=&keyword=&page=1&pageSize=10`
item：
```json
{ "id": 1, "billNo": "BL202610220001", "billType": "RECEIVABLE", "billTypeLabel": "应收账单",
  "counterparty": { "type": "CUSTOMER", "id": 1, "name": "上海远洋新能源科技有限公司" },
  "orderId": 21, "orderNo": "MO202610220020", "period": "2026-10",
  "totalAmount": 15080.00, "taxAmount": 1245.14, "profitAmount": 1850.00,
  "dueDate": "2026-11-21", "status": "ISSUED", "statusLabel": "已出账", "issuedAt": "2026-10-22 16:00:00" }
```

### 2.2 `GET /api/bills/{id}`
同 v0 基础上扩展：`billType/counterparty/items/invoice/payments/reconciliation`：
```json
{
  "bill": { "...": "同 2.1" },
  "order": { "id": 21, "orderNo": "MO202610220020" },
  "items": [
    { "seq": 1, "mode": "ROAD", "modeLabel": "公路", "chargeType": "FREIGHT", "description": "上海嘉定—洋山港 拖车",
      "quantity": 2, "unit": "箱", "unitPrice": 1400, "amount": 2800.00, "taxRate": 9, "taxAmount": 231.19, "costAmount": 2408.00 }
  ],
  "invoice": { "id": 3, "invoiceNo": "FP202610220003", "status": "ISSUED", "totalAmount": 15080.00 },
  "payments": [ { "id": 2, "paymentNo": "PAY202610220002", "amount": 15080.00, "status": "SUCCESS", "paidAt": "2026-10-22 17:00:00" } ],
  "reconciliation": { "id": 1, "reconNo": "DZ202610220001", "status": "CONFIRMED" }
}
```

### 2.3 `POST /api/orders/{id}/settle`（扩展）
保持原响应字段（`bill`/`breakdown`），新增：
- 应收账单 `bill.billType = RECEIVABLE`，按客户价格规则生成 `bill_item`（含税额/成本/毛利）；
- 自动生成各分段承运人的应付账单（`billType=PAYABLE`，`counterparty=carrier`），响应附 `payableBills`。
- 幂等：重复出账 40901（**沿用 v0 冻结契约**，与 `docs/02` 一致；Stage4 不新增错误码）；订单须已签收（40901）。

---

## 3. 对账

### 3.1 `GET /api/reconciliations?status=&counterpartyType=&page=`
item：`id、reconNo、counterparty{type,name}、periodStart/End、totalAmount、confirmedAmount、differenceAmount、status/statusLabel、sentAt、confirmedAt`。

### 3.2 `POST /api/reconciliations`
```json
{ "counterpartyType": "CARRIER", "counterpartyId": 12, "periodStart": "2026-10-01", "periodEnd": "2026-10-31" }
```
服务端汇总该对手方期间内 `PAYABLE` 账单生成明细（`MATCH`）；`reconNo = DZ + yyyyMMdd + 序号`；状态 `DRAFT`。无账单 42201。

### 3.3 `GET /api/reconciliations/{id}`
`{ recon, items: [ { billId, billNo, amount, confirmedAmount, differenceReason, status } ] }`

### 3.4 `POST /api/reconciliations/{id}/send` → `DRAFT → SENT`（通知对手方）
### 3.5 `POST /api/reconciliations/{id}/confirm`
`{ "confirmedAmount": 15080.00, "items": [ { "billId": 1, "confirmedAmount": 15080.00 } ] }` → `SENT → CONFIRMED`；差异金额 = 总额 - 确认额。
### 3.6 `POST /api/reconciliations/{id}/dispute`
`{ "reason": "运杂费差异 200 元", "items": [ { "billId": 1, "differenceReason": "堆存费争议" } ] }` → `SENT → DISPUTED`；明细 `DIFF`。

---

## 4. 发票

### 4.1 `GET /api/invoices?status=&billId=&page=`
item：`id、invoiceNo、invoiceType/Label、billId、billNo、buyerName、sellerName、amount、taxRate、taxAmount、totalAmount、status/Label、issuedAt`。

### 4.2 `POST /api/invoices`
```json
{ "billId": 1, "invoiceType": "VAT_SPECIAL", "title": "上海远洋新能源科技有限公司", "taxNo": "91310114000100000W" }
```
仅 `RECEIVABLE` 且未开票账单；生成 `invoiceNo = FP + yyyyMMdd + 序号`，销方=平台（税号 Mock），
税额 = amount × 9%；状态 `ISSUED`；写 `TAX_INVOICE_ISSUE` 集成报文、审计、事件。重复开票 40902。

### 4.3 `GET /api/invoices/{id}` / `POST /api/invoices/{id}/void`
`ISSUED → VOID`（写 TAX 作废报文、审计）。已支付账单禁止作废（42201）。

---

## 5. 支付

### 5.1 `GET /api/payments?direction=&status=&page=`
item：`id、paymentNo、direction(IN/OUT)、counterparty{type,name}、billNo、amount、method、status/Label、bankSerial、paidAt、createdAt`。

### 5.2 `POST /api/payments`
```json
{ "direction": "IN", "billId": 1, "amount": 15080.00, "method": "BANK_TRANSFER", "payerName": "上海远洋新能源科技有限公司" }
```
状态 `PENDING`；金额 ≤ 账单未核销金额，否则 42201。

### 5.3 `POST /api/payments/{id}/confirm`
银行回执 Mock：状态 `SUCCESS`，生成 `bankSerial`，写入 `payment_allocation`（核销账单）；
账单核销后状态 `PAID`（全额）/ 部分核销保持 `ISSUED`；写 `BANK_PAYMENT_RECEIPT` 报文、审计、事件。
响应 `{ payment, allocation, bill }`。

---

## 6. 保理

### 6.1 `GET /api/factoring/applications?status=&page=`
item：`id、appNo、orderNo、billNo、applicantName、financePartnerName、amount、discountRate、fee、status/Label、appliedAt、approvedAt`。

### 6.2 `POST /api/factoring/applications`
`{ "billId": 1, "financePartnerId": 22, "amount": 15080.00, "discountRate": 6.5 }` → `SUBMITTED`；仅 `RECEIVABLE` 且未结清。
### 6.3 `POST /api/factoring/applications/{id}/approve`
`{ "approved": true }` → `APPROVED`（fee = amount × rate × 期限/360）或 `REJECTED`。
### 6.4 `POST /api/factoring/applications/{id}/settle`
→ `SETTLED`，生成一条 `IN` 支付记录（保理放款）与报文。

---

## 7. 保险

### 7.1 `GET /api/insurance/policies?status=&page=`
item：`id、policyNo、orderNo、waybillNo、insurerName、insuredAmount、rate、premium、status/Label、effectiveFrom/To`。
### 7.2 `POST /api/insurance/policies`
`{ "orderId": 21, "insuredAmount": 500000, "rate": 0.12 }` → `policyNo = BX + yyyyMMdd + 序号`，`premium = insuredAmount × rate / 100`，状态 `ISSUED`。
### 7.3 `GET /api/insurance/policies/{id}`

---

## 8. 经营分析

### 8.1 `GET /api/analytics/overview?days=30`
```json
{
  "kpis": { "revenue": 486320.50, "cost": 412850.00, "profit": 73470.50, "margin": 15.1,
            "arTotal": 128400.00, "arOverdue": 12800.00, "apTotal": 98600.00,
            "invoicesIssued": 10, "paymentsSuccess": 8 },
  "arAging": [ { "bucket": "0-30", "amount": 80000 }, { "bucket": "31-60", "amount": 35600 }, { "bucket": "60+", "amount": 12800 } ]
}
```
### 8.2 `GET /api/analytics/trend?days=14` → `{ dates, revenue[], cost[], profit[] }`
### 8.3 `GET /api/analytics/by-customer` → `[ { customerName, revenue, cost, profit, margin } ]`
### 8.4 `GET /api/analytics/by-mode` → `[ { mode, modeLabel, revenue, cost, profit } ]`
### 8.5 `GET /api/finance/dashboard`
```json
{
  "arTotal": 128400.00, "arOverdue": 12800.00, "apTotal": 98600.00,
  "pendingInvoices": 2, "pendingPayments": 2,
  "reconciliation": { "inProgress": 3, "disputed": 1, "differenceAmount": 200.00 },
  "factoringInProgress": 2, "insurancePolicies": 8
}
```
> 说明：实现以实际字段为准（上表已按实现校准）；`reconciliation` 为对象，含进行中/差异单数与差异金额。

---

## 9. 新增前端 testid

| 区域 | testid |
|---|---|
| 结算中心 | `settlement-kpi-ar` `settlement-kpi-ap` `settlement-kpi-profit` `bill-table` `bill-row` `bill-type` `bill-amount` `bill-issue-invoice` `bill-record-payment` |
| 对账 | `recon-row` `recon-status` `recon-create` `recon-send` `recon-confirm` `recon-dispute` `recon-item` |
| 发票 | `invoice-row` `invoice-status` `invoice-amount` `invoice-issue` `invoice-void` |
| 支付 | `payment-row` `payment-status` `payment-record` `payment-confirm` |
| 保理 | `factoring-row` `factoring-apply` `factoring-approve` `factoring-settle` |
| 保险 | `insurance-row` `insurance-create` `insurance-status` |
| 经营分析 | `analytics-kpi-revenue` `analytics-kpi-profit` `analytics-kpi-margin` `analytics-trend` `analytics-by-customer` `analytics-by-mode` `analytics-ar-aging` |

---

## 10. 验收钩子

1. 签收后 settle：应收账单 + 应付账单生成，明细之和 = 账单总额；应收 - 应付 = 毛利；税额 = 金额 × 税率。
2. 对账：按对手方/周期汇总账单 → 发送 → 确认（确认额/差异）或提异议；差异明细 `DIFF`。
3. 发票：开票生成发票号/税额/TAX 报文；重复开票 40902；作废状态与报文。
4. 支付：登记 → 回执 → 核销；金额超未核销 42201；账单核销后 PAID。
5. 保理：申请 → 审批（手续费）→ 放款；状态机与报文。
6. 保险：投保生成保单号/保费。
7. 经营分析：KPI/趋势/客户/模式/AR 账龄与账单数据一致；财务看板聚合正确。
8. 权限：FINANCE/INSURANCE/SETTLEMENT 菜单与操作隔离；越权 40301。
9. 回归：Stage1 53 + Stage2 33 + Stage3 33 + v0 34 全部通过。
