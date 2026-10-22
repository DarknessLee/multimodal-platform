<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">结算中心</h2>
        <p class="page-subtitle">应收 / 应付 / 毛利总览 · 账单明细 · 开票与收款</p>
      </div>
      <div class="page-actions">
        <PermissionGuard permission="menu:reconciliation">
          <el-button @click="go('/finance/reconciliations')">对账管理</el-button>
        </PermissionGuard>
        <PermissionGuard permission="menu:invoice">
          <el-button @click="go('/finance/invoices')">发票管理</el-button>
        </PermissionGuard>
        <PermissionGuard permission="menu:payment">
          <el-button @click="go('/finance/payments')">收付款</el-button>
        </PermissionGuard>
        <el-button :loading="loading" @click="loadAll">刷新</el-button>
      </div>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="loadAll">重新加载</el-button>
      </template>
    </el-alert>

    <!-- KPI -->
    <div class="kpi-grid">
      <KpiCard
        data-testid="settlement-kpi-ar"
        label="应收总额（元）"
        :value="formatAmount(dashboard?.arTotal ?? 0)"
        tone="primary"
        :hint="`逾期应收 ¥${formatAmount(dashboard?.arOverdue ?? 0)}`"
      />
      <KpiCard
        data-testid="settlement-kpi-ap"
        label="应付总额（元）"
        :value="formatAmount(dashboard?.apTotal ?? 0)"
        tone="warning"
        hint="各承运商应付合计"
      />
      <KpiCard
        data-testid="settlement-kpi-profit"
        label="毛利（元）"
        :value="formatAmount(profitAmount)"
        tone="success"
        :hint="`毛利率 ${formatAmount(marginRate)}%`"
      />
      <KpiCard
        label="待开票 / 待确认支付"
        :value="`${pendingInvoiceCount} / ${pendingPaymentCount}`"
        tone="default"
        :hint="`对账中 ${dashboard?.reconciliation?.inProgress ?? 0} · 差异 ${dashboard?.reconciliation?.disputed ?? 0}`"
      />
    </div>

    <!-- 待出账订单（Stage1 保留） -->
    <div class="card mt-16">
      <h3 class="card-title">
        <span class="card-title-text">待出账订单（已签收，{{ pendingSettleOrders.length }}）</span>
        <span class="muted">签收后自动生成应收账单与各承运商应付账单</span>
      </h3>
      <div v-loading="loading">
        <el-empty
          v-if="!loading && pendingSettleOrders.length === 0"
          description="暂无待出账订单"
          :image-size="60"
        />
        <div class="settle-list">
          <article
            v-for="card in settleCards"
            :key="card.order.id"
            class="settle-card"
            data-testid="settle-card"
          >
            <div class="settle-card__head">
              <div class="settle-card__title">
                <router-link :to="`/orders/${card.order.id}`" class="mono settle-card__order-no">
                  {{ card.order.orderNo }}
                </router-link>
                <StatusTag :status="card.order.status" :label="card.order.statusLabel" size="small" />
                <el-tag v-if="card.bill" size="small" type="success" effect="plain">
                  账单 {{ card.bill.billNo }}
                </el-tag>
              </div>
              <div class="settle-card__actions">
                <PermissionGuard permission="bill:settle">
                  <el-button
                    v-if="canSettle(card)"
                    type="primary"
                    size="small"
                    data-testid="settle-btn"
                    :loading="settlingId === card.order.id"
                    @click="settle(card)"
                  >
                    生成账单
                  </el-button>
                </PermissionGuard>
                <el-button
                  v-if="card.bill"
                  size="small"
                  data-testid="view-bill-btn"
                  @click="viewBill(card)"
                >
                  查看账单
                </el-button>
              </div>
            </div>
            <div class="settle-card__grid">
              <div class="settle-field">
                <span class="meta-label">货物</span>
                <span class="meta-value">{{ card.order.cargoName }} · {{ formatWeight(card.order.cargoWeight) }}</span>
              </div>
              <div class="settle-field">
                <span class="meta-label">客户</span>
                <span class="meta-value">{{ card.order.customerName || card.order.shipperName }}</span>
              </div>
              <div class="settle-field">
                <span class="meta-label">路线</span>
                <span class="meta-value">{{ card.order.origin }} → {{ card.order.destination }}</span>
              </div>
              <div class="settle-field">
                <span class="meta-label">运单号</span>
                <span class="meta-value mono">{{ card.order.waybillNo || '—' }}</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>

    <!-- 账单列表 -->
    <div class="card mt-16">
      <div class="card-title">
        <span class="card-title-text">账单列表（{{ billTotal }}）</span>
        <div class="card-title__filters">
          <el-select v-model="billTypeFilter" placeholder="全部类型" clearable style="width: 130px" @change="searchBills">
            <el-option v-for="option in BILL_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
          <el-select v-model="billStatusFilter" placeholder="全部状态" clearable style="width: 130px" @change="searchBills">
            <el-option
              v-for="option in BILL_STATUS_FILTER_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-input
            v-model="billKeyword"
            placeholder="搜索账单号 / 订单号"
            clearable
            style="width: 220px"
            @keyup.enter="searchBills"
          />
          <el-button @click="searchBills">查询</el-button>
        </div>
      </div>

      <el-table v-loading="loading" data-testid="bill-table" :data="bills" size="small" border stripe>
        <el-table-column label="账单号" min-width="160">
          <template #default="{ row }">
            <span class="row-link mono" data-testid="bill-row" @click="openBillDetail(row.id)">
              {{ row.billNo }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="100" align="center">
          <template #default="{ row }">
            <el-tag
              :type="row.billType === 'RECEIVABLE' ? 'primary' : 'warning'"
              size="small"
              effect="plain"
              data-testid="bill-type"
            >
              {{ row.billTypeLabel || billTypeLabel(row.billType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="交易对手" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.counterparty?.name || '—' }}</template>
        </el-table-column>
        <el-table-column label="订单号" min-width="150">
          <template #default="{ row }">
            <router-link v-if="row.orderId" :to="`/orders/${row.orderId}`" class="mono">
              {{ row.orderNo || `#${row.orderId}` }}
            </router-link>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="period" label="账期" width="90" align="center">
          <template #default="{ row }">{{ row.period || '—' }}</template>
        </el-table-column>
        <el-table-column label="金额(元)" width="120" align="right">
          <template #default="{ row }">
            <span class="amount" data-testid="bill-amount">{{ formatAmount(row.totalAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="税额(元)" width="110" align="right">
          <template #default="{ row }">{{ formatAmount(row.taxAmount) }}</template>
        </el-table-column>
        <el-table-column label="毛利(元)" width="110" align="right">
          <template #default="{ row }">
            <span :class="Number(row.profitAmount) >= 0 ? 'success-text' : 'error-text'">
              {{ formatAmount(row.profitAmount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="到期日" width="110" align="center">
          <template #default="{ row }">{{ formatDate(row.dueDate) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="96" align="center">
          <template #default="{ row }">
            <el-tag :type="billStatusTagType(row.status)" size="small" effect="plain">
              {{ row.statusLabel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" align="center">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openBillDetail(row.id)">详情</el-button>
            <PermissionGuard permission="bill:issue-invoice">
              <el-button
                v-if="canIssueInvoice(row as BillListItem)"
                size="small"
                text
                type="success"
                data-testid="bill-issue-invoice"
                @click="openInvoice(row as BillListItem)"
              >
                开票
              </el-button>
            </PermissionGuard>
            <PermissionGuard permission="payment:record">
              <el-button
                v-if="row.status !== 'PAID' && row.status !== 'VOID'"
                size="small"
                text
                type="warning"
                data-testid="bill-record-payment"
                @click="openPayment(row as BillListItem)"
              >
                收款
              </el-button>
            </PermissionGuard>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && bills.length === 0" description="暂无账单数据" :image-size="64" />
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="billPage"
          :page-size="billPageSize"
          :total="billTotal"
          layout="total, prev, pager, next"
          background
          @current-change="loadBills"
        />
      </div>
    </div>

    <!-- 账单详情抽屉 -->
    <el-drawer v-model="detailVisible" title="账单详情" size="620px">
      <div v-loading="detailLoading">
        <template v-if="billDetail">
          <div class="bill-detail-head">
            <div>
              <div class="meta-label">账单号</div>
              <div class="mono bill-detail-no">{{ billDetail.bill.billNo }}</div>
            </div>
            <el-tag :type="billDetail.bill.billType === 'RECEIVABLE' ? 'primary' : 'warning'" effect="dark">
              {{ billDetail.bill.billTypeLabel || billTypeLabel(billDetail.bill.billType) }}
            </el-tag>
            <el-tag :type="billStatusTagType(billDetail.bill.status)" effect="plain">
              {{ billDetail.bill.statusLabel }}
            </el-tag>
            <span class="amount-lg">¥{{ formatAmount(billDetail.bill.totalAmount) }}</span>
          </div>

          <el-descriptions :column="2" border size="small" class="mt-12">
            <el-descriptions-item label="交易对手">{{ billDetail.bill.counterparty?.name || '—' }}</el-descriptions-item>
            <el-descriptions-item label="订单号">
              <router-link v-if="billDetail.order" :to="`/orders/${billDetail.order.id}`" class="mono">
                {{ billDetail.order.orderNo }}
              </router-link>
              <span v-else>—</span>
            </el-descriptions-item>
            <el-descriptions-item label="账期">{{ billDetail.bill.period || '—' }}</el-descriptions-item>
            <el-descriptions-item label="到期日">{{ formatDate(billDetail.bill.dueDate) }}</el-descriptions-item>
            <el-descriptions-item label="税额">¥{{ formatAmount(billDetail.bill.taxAmount) }}</el-descriptions-item>
            <el-descriptions-item label="毛利">¥{{ formatAmount(billDetail.bill.profitAmount) }}</el-descriptions-item>
            <el-descriptions-item label="发票">{{ billDetail.invoice?.invoiceNo || '未开票' }}</el-descriptions-item>
            <el-descriptions-item label="对账单">{{ billDetail.reconciliation?.reconNo || '—' }}</el-descriptions-item>
          </el-descriptions>

          <h4 class="sub-title">账单明细（{{ billDetail.items.length }}）</h4>
          <el-table :data="billDetail.items" size="small" border stripe>
            <el-table-column prop="seq" label="序号" width="60" align="center" />
            <el-table-column label="方式" width="80" align="center">
              <template #default="{ row }">{{ row.modeLabel || modeLabel(row.mode) }}</template>
            </el-table-column>
            <el-table-column prop="description" label="费用说明" min-width="180" show-overflow-tooltip />
            <el-table-column label="数量" width="84" align="right">
              <template #default="{ row }">{{ row.quantity }} {{ row.unit }}</template>
            </el-table-column>
            <el-table-column label="单价(元)" width="100" align="right">
              <template #default="{ row }">{{ formatAmount(row.unitPrice) }}</template>
            </el-table-column>
            <el-table-column label="金额(元)" width="110" align="right">
              <template #default="{ row }">
                <span class="amount">{{ formatAmount(row.amount) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="税额(元)" width="100" align="right">
              <template #default="{ row }">{{ formatAmount(row.taxAmount) }}</template>
            </el-table-column>
            <el-table-column label="成本(元)" width="100" align="right">
              <template #default="{ row }">{{ formatAmount(row.costAmount) }}</template>
            </el-table-column>
          </el-table>

          <h4 class="sub-title">支付记录（{{ billDetail.payments.length }}）</h4>
          <el-table v-if="billDetail.payments.length" :data="billDetail.payments" size="small" border>
            <el-table-column prop="paymentNo" label="支付单号" min-width="150">
              <template #default="{ row }"><span class="mono">{{ row.paymentNo }}</span></template>
            </el-table-column>
            <el-table-column label="金额(元)" width="120" align="right">
              <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">{{ paymentStatusLabel(row.status) }}</template>
            </el-table-column>
            <el-table-column label="支付时间" width="140">
              <template #default="{ row }">{{ formatDateTime(row.paidAt) }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="暂无支付记录" :image-size="56" />
        </template>
      </div>
    </el-drawer>

    <!-- 开票弹窗 -->
    <el-dialog v-model="invoiceVisible" title="账单开票" width="520px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="账单">
          <span class="mono">{{ invoiceTarget?.billNo }}（¥{{ formatAmount(invoiceTarget?.totalAmount ?? 0) }}）</span>
        </el-form-item>
        <el-form-item label="发票类型">
          <el-select v-model="invoiceForm.invoiceType" style="width: 100%">
            <el-option v-for="option in INVOICE_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="购方名称">
          <el-input v-model="invoiceForm.title" placeholder="购方名称" />
        </el-form-item>
        <el-form-item label="购方税号">
          <el-input v-model="invoiceForm.taxNo" placeholder="18 位统一社会信用代码" maxlength="18" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="issuing" @click="invoiceVisible = false">取消</el-button>
        <el-button type="primary" :loading="issuing" @click="submitInvoice">开具发票</el-button>
      </template>
    </el-dialog>

    <!-- 收款弹窗 -->
    <el-dialog v-model="paymentVisible" title="登记收付款" width="520px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="账单">
          <span class="mono">{{ paymentTarget?.billNo }}（{{ paymentTarget?.billTypeLabel }}）</span>
        </el-form-item>
        <el-form-item label="收付方向">
          <el-select v-model="paymentForm.direction" style="width: 100%">
            <el-option v-for="option in PAYMENT_DIRECTION_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="金额（元）">
          <el-input
            :model-value="String(paymentForm.amount)"
            type="number"
            min="0"
            @update:model-value="paymentForm.amount = Number($event)"
          />
        </el-form-item>
        <el-form-item label="支付方式">
          <el-select v-model="paymentForm.method" style="width: 100%">
            <el-option v-for="option in PAYMENT_METHOD_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="付款方">
          <el-input v-model="paymentForm.payerName" placeholder="付款方名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="recordingPayment" @click="paymentVisible = false">取消</el-button>
        <el-button type="primary" :loading="recordingPayment" @click="submitPayment">登记</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import KpiCard from '../components/KpiCard.vue';
import StatusTag from '../components/StatusTag.vue';
import PermissionGuard from '../components/PermissionGuard.vue';
import { fetchOrders, settleOrder } from '../api';
import { fetchBills, fetchBillDetail } from '../api/billing';
import { fetchFinanceDashboard } from '../api/analytics';
import { issueInvoice } from '../api/invoice';
import { createPayment } from '../api/payment';
import { useAuthStore } from '../stores/auth';
import {
  BILL_STATUS_FILTER_OPTIONS,
  BILL_TYPE_OPTIONS,
  INVOICE_TYPE_OPTIONS,
  PAYMENT_DIRECTION_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  billStatusTagType,
  billTypeLabel,
  modeLabel,
  paymentStatusLabel,
} from '../utils/constants';
import { formatAmount, formatDate, formatDateTime, formatWeight } from '../utils/format';
import type {
  BillDetailResult,
  BillListItem,
  FinanceDashboard,
  OrderListItem,
} from '../types';

const router = useRouter();
const auth = useAuthStore();

const loading = ref(false);
const errorText = ref('');
const dashboard = ref<FinanceDashboard | null>(null);
const orders = ref<OrderListItem[]>([]);
const bills = ref<BillListItem[]>([]);
const billTotal = ref(0);
const billPage = ref(1);
const billPageSize = ref(10);
const billTypeFilter = ref('');
const billStatusFilter = ref('');
const billKeyword = ref('');
const settlingId = ref<number | null>(null);
const receivableByOrder = ref<Record<number, { id: number; billNo: string }>>({});

const detailVisible = ref(false);
const detailLoading = ref(false);
const billDetail = ref<BillDetailResult | null>(null);

const invoiceVisible = ref(false);
const issuing = ref(false);
const invoiceTarget = ref<BillListItem | null>(null);
const invoiceForm = reactive({ invoiceType: 'VAT_SPECIAL', title: '', taxNo: '' });

const paymentVisible = ref(false);
const recordingPayment = ref(false);
const paymentTarget = ref<BillListItem | null>(null);
const paymentForm = reactive({ direction: 'IN', amount: 0, method: 'BANK_TRANSFER', payerName: '' });

interface SettleCard {
  order: OrderListItem;
  bill: { id: number; billNo: string } | null;
}

const signedOrders = computed(() => orders.value.filter((order) => order.status === 'SIGNED'));

const settleCards = computed<SettleCard[]>(() =>
  signedOrders.value.map((order) => ({
    order,
    bill: receivableByOrder.value[order.id] ?? null,
  })),
);

const pendingSettleOrders = computed(() => signedOrders.value);

const profitAmount = computed(() => {
  const d = dashboard.value;
  if (!d) return 0;
  return Number(d.arTotal ?? 0) - Number(d.apTotal ?? 0);
});

const marginRate = computed(() => {
  const d = dashboard.value;
  if (!d || !Number(d.arTotal)) return 0;
  return (profitAmount.value / Number(d.arTotal)) * 100;
});

const pendingInvoiceCount = computed(
  () => dashboard.value?.pendingInvoices ?? dashboard.value?.invoicePending ?? 0,
);

const pendingPaymentCount = computed(
  () => dashboard.value?.pendingPayments ?? dashboard.value?.paymentPending ?? 0,
);

function canSettle(card: SettleCard): boolean {
  return card.order.status === 'SIGNED';
}

function canIssueInvoice(row: BillListItem): boolean {
  return row.billType === 'RECEIVABLE' && ['ISSUED', 'PARTIAL'].includes(row.status);
}

async function loadAll(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  const [dashboardResult, billResult, orderResult, receivableResult] = await Promise.allSettled([
    fetchFinanceDashboard(),
    fetchBills({
      billType: billTypeFilter.value || undefined,
      status: billStatusFilter.value || undefined,
      keyword: billKeyword.value.trim() || undefined,
      page: billPage.value,
      pageSize: billPageSize.value,
    }),
    fetchOrders(),
    fetchBills({ billType: 'RECEIVABLE', page: 1, pageSize: 200 }),
  ]);
  if (dashboardResult.status === 'fulfilled') dashboard.value = dashboardResult.value;
  if (billResult.status === 'fulfilled') {
    bills.value = billResult.value.list;
    billTotal.value = billResult.value.total;
  } else {
    bills.value = [];
    billTotal.value = 0;
  }
  if (orderResult.status === 'fulfilled') orders.value = orderResult.value;
  if (receivableResult.status === 'fulfilled') {
    const map: Record<number, { id: number; billNo: string }> = {};
    for (const bill of receivableResult.value.list) {
      if (bill.orderId) map[bill.orderId] = { id: bill.id, billNo: bill.billNo };
    }
    receivableByOrder.value = map;
  }

  const failed = [dashboardResult, billResult, orderResult].find((result) => result.status === 'rejected');
  if (failed && failed.status === 'rejected') {
    const error = failed.reason;
    errorText.value = error instanceof Error && error.message ? error.message : '结算数据加载失败';
  }
  loading.value = false;
}

async function loadBills(): Promise<void> {
  loading.value = true;
  try {
    const data = await fetchBills({
      billType: billTypeFilter.value || undefined,
      status: billStatusFilter.value || undefined,
      keyword: billKeyword.value.trim() || undefined,
      page: billPage.value,
      pageSize: billPageSize.value,
    });
    bills.value = data.list;
    billTotal.value = data.total;
  } catch {
    bills.value = [];
    billTotal.value = 0;
  } finally {
    loading.value = false;
  }
}

function searchBills(): void {
  billPage.value = 1;
  void loadBills();
}

async function settle(card: SettleCard): Promise<void> {
  settlingId.value = card.order.id;
  try {
    const data = await settleOrder(card.order.id);
    ElMessage.success(`出账成功：${data.bill.billNo}，合计 ¥${formatAmount(data.bill.totalAmount)}`);
    await loadAll();
  } finally {
    settlingId.value = null;
  }
}

function viewBill(card: SettleCard): void {
  if (!card.bill) return;
  void router.push(`/bills/${card.bill.id}`);
}

async function openBillDetail(id: number): Promise<void> {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    billDetail.value = await fetchBillDetail(id);
  } catch {
    billDetail.value = null;
  } finally {
    detailLoading.value = false;
  }
}

function openInvoice(row: BillListItem): void {
  invoiceTarget.value = row;
  invoiceForm.invoiceType = 'VAT_SPECIAL';
  invoiceForm.title = row.counterparty?.name ?? '';
  invoiceForm.taxNo = '';
  invoiceVisible.value = true;
}

async function submitInvoice(): Promise<void> {
  if (!invoiceTarget.value) return;
  if (!invoiceForm.title.trim()) {
    ElMessage.warning('请输入购方名称');
    return;
  }
  issuing.value = true;
  try {
    const invoice = await issueInvoice({
      billId: invoiceTarget.value.id,
      invoiceType: invoiceForm.invoiceType,
      title: invoiceForm.title.trim(),
      taxNo: invoiceForm.taxNo.trim(),
    });
    ElMessage.success(`发票开具成功：${invoice.invoiceNo}`);
    invoiceVisible.value = false;
    await loadAll();
  } finally {
    issuing.value = false;
  }
}

function openPayment(row: BillListItem): void {
  paymentTarget.value = row;
  paymentForm.direction = row.billType === 'RECEIVABLE' ? 'IN' : 'OUT';
  paymentForm.amount = Number(row.totalAmount);
  paymentForm.method = 'BANK_TRANSFER';
  paymentForm.payerName = row.counterparty?.name ?? '';
  paymentVisible.value = true;
}

async function submitPayment(): Promise<void> {
  if (!paymentTarget.value) return;
  if (!paymentForm.amount || paymentForm.amount <= 0) {
    ElMessage.warning('请输入有效金额');
    return;
  }
  recordingPayment.value = true;
  try {
    const payment = await createPayment({
      direction: paymentForm.direction,
      billId: paymentTarget.value.id,
      amount: paymentForm.amount,
      method: paymentForm.method,
      payerName: paymentForm.payerName.trim() || undefined,
    });
    ElMessage.success(`已登记${paymentDirectionLabel(paymentForm.direction)}：${payment.paymentNo}，待银行回执确认`);
    paymentVisible.value = false;
    await loadAll();
  } finally {
    recordingPayment.value = false;
  }
}

function paymentDirectionLabel(direction: string): string {
  return direction === 'IN' ? '收款' : '付款';
}

function go(path: string): void {
  void router.push(path);
}

onMounted(loadAll);
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}

.mt-12 {
  margin-top: 12px;
}

.mt-16 {
  margin-top: 16px;
}

.retry-btn {
  margin-top: 6px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.settle-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settle-card {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 14px 16px;
  background: #fafcff;
}

.settle-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.settle-card__title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.settle-card__order-no {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--app-text);
}

.settle-card__order-no:hover {
  color: var(--app-primary);
}

.settle-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settle-card__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px 18px;
  margin-top: 12px;
}

.settle-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.card-title__filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-weight: 400;
}

.row-link {
  color: var(--app-primary);
  cursor: pointer;
}

.row-link:hover {
  text-decoration: underline;
}

.success-text {
  color: #67c23a;
}

.error-text {
  color: #f56c6c;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.bill-detail-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--app-border);
}

.bill-detail-no {
  font-size: 15px;
  font-weight: 600;
}

.sub-title {
  margin: 16px 0 10px;
  font-size: 13px;
  font-weight: 600;
}

@media (max-width: 1100px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .settle-card__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
