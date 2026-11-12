<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">收付款</h2>
        <p class="page-subtitle">登记收款/付款 → 银行回执确认 → 核销账单</p>
      </div>
      <div class="page-actions">
        <PermissionGuard permission="payment:record">
          <el-button type="primary" data-testid="payment-record" @click="openRecord">登记收付款</el-button>
        </PermissionGuard>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="card filter-bar">
      <el-select v-model="directionFilter" placeholder="全部方向" clearable style="width: 130px" @change="search">
        <el-option v-for="option in PAYMENT_DIRECTION_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 140px" @change="search">
        <el-option v-for="option in PAYMENT_STATUS_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <span class="muted filter-tip">共 {{ total }} 笔收付款</span>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card table-card">
      <el-table v-loading="loading" :data="rows" size="small" border stripe>
        <el-table-column label="支付单号" min-width="160">
          <template #default="{ row }">
            <span class="mono" data-testid="payment-row">{{ row.paymentNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="方向" width="86" align="center">
          <template #default="{ row }">
            <el-tag :type="row.direction === 'IN' ? 'success' : 'warning'" size="small" effect="plain">
              {{ paymentDirectionLabel(row.direction) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="交易对手" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.counterparty?.name || '—' }}</template>
        </el-table-column>
        <el-table-column label="账单号" min-width="150">
          <template #default="{ row }">
            <span class="mono">{{ row.billNo || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="金额(元)" width="130" align="right">
          <template #default="{ row }"><span class="amount">{{ formatAmount(row.amount) }}</span></template>
        </el-table-column>
        <el-table-column label="支付方式" width="110" align="center">
          <template #default="{ row }">{{ paymentMethodLabel(row.method) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="96" align="center">
          <template #default="{ row }">
            <el-tag :type="paymentStatusTagType(row.status)" size="small" effect="plain" data-testid="payment-status">
              {{ row.statusLabel || paymentStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="银行流水号" min-width="160">
          <template #default="{ row }">
            <span class="mono muted">{{ row.bankSerial || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="登记时间" width="140">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" align="center">
          <template #default="{ row }">
            <PermissionGuard permission="payment:confirm">
              <el-button
                v-if="row.status === 'PENDING'"
                size="small"
                text
                type="primary"
                data-testid="payment-confirm"
                :loading="confirmingId === row.id"
                @click="confirm(row as PaymentListItem)"
              >
                银行回执确认
              </el-button>
            </PermissionGuard>
            <span v-if="row.status !== 'PENDING'" class="muted small">
              {{ row.paidAt ? formatDateTime(row.paidAt) : '—' }}
            </span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无收付款数据" :image-size="64" />
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          background
          @current-change="load"
        />
      </div>
    </div>

    <!-- 登记收付款 -->
    <el-dialog v-model="recordVisible" title="登记收付款" width="560px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="收付方向">
              <el-select v-model="recordForm.direction" style="width: 100%">
                <el-option v-for="option in PAYMENT_DIRECTION_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="账单">
              <el-select v-model="recordForm.billId" filterable placeholder="选择账单" style="width: 100%" @change="onBillChange">
                <el-option
                  v-for="bill in billOptions"
                  :key="bill.id"
                  :label="`${bill.billNo} · ${bill.billTypeLabel} · ¥${formatAmount(bill.totalAmount)}`"
                  :value="bill.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="金额（元）">
              <el-input
                :model-value="String(recordForm.amount)"
                type="number"
                min="0"
                @update:model-value="recordForm.amount = Number($event)"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="支付方式">
              <el-select v-model="recordForm.method" style="width: 100%">
                <el-option v-for="option in PAYMENT_METHOD_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="付款方">
              <el-input v-model="recordForm.payerName" placeholder="付款方名称" />
            </el-form-item>
          </el-col>
        </el-row>
        <p class="muted record-tip">登记后状态为「待确认」，确认银行回执后核销账单（金额不得超过未核销金额）。</p>
      </el-form>
      <template #footer>
        <el-button :disabled="recording" @click="recordVisible = false">取消</el-button>
        <el-button type="primary" :loading="recording" @click="submitRecord">登记</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PermissionGuard from '../components/PermissionGuard.vue';
import { confirmPayment, createPayment, fetchPayments } from '../api/payment';
import { fetchBills } from '../api/billing';
import {
  PAYMENT_DIRECTION_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  paymentDirectionLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  paymentStatusTagType,
} from '../utils/constants';
import { formatAmount, formatDateTime } from '../utils/format';
import type { BillListItem, PaymentListItem } from '../types';

const loading = ref(false);
const errorText = ref('');
const rows = ref<PaymentListItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const directionFilter = ref('');
const statusFilter = ref('');
const confirmingId = ref<number | null>(null);

const recordVisible = ref(false);
const recording = ref(false);
const billOptions = ref<BillListItem[]>([]);
const recordForm = reactive({
  direction: 'IN',
  billId: null as number | null,
  amount: 0,
  method: 'BANK_TRANSFER',
  payerName: '',
});

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchPayments({
      direction: directionFilter.value || undefined,
      status: statusFilter.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    rows.value = [];
    total.value = 0;
    errorText.value = error instanceof Error && error.message ? error.message : '收付款列表加载失败';
  } finally {
    loading.value = false;
  }
}

function search(): void {
  page.value = 1;
  void load();
}

async function loadBills(): Promise<void> {
  try {
    const data = await fetchBills({ page: 1, pageSize: 100 });
    billOptions.value = data.list.filter((bill) => bill.status !== 'PAID' && bill.status !== 'VOID');
    const first = billOptions.value[0] ?? null;
    recordForm.billId = first?.id ?? null;
    recordForm.amount = Number(first?.totalAmount ?? 0);
    recordForm.payerName = first?.counterparty?.name ?? '';
    recordForm.direction = first?.billType === 'PAYABLE' ? 'OUT' : 'IN';
  } catch {
    billOptions.value = [];
  }
}

function onBillChange(billId: number): void {
  const bill = billOptions.value.find((item) => item.id === billId);
  if (!bill) return;
  recordForm.amount = Number(bill.totalAmount);
  recordForm.payerName = bill.counterparty?.name ?? '';
  recordForm.direction = bill.billType === 'PAYABLE' ? 'OUT' : 'IN';
}

async function openRecord(): Promise<void> {
  recordVisible.value = true;
  await loadBills();
}

async function submitRecord(): Promise<void> {
  if (!recordForm.billId) {
    ElMessage.warning('请选择账单');
    return;
  }
  if (!recordForm.amount || recordForm.amount <= 0) {
    ElMessage.warning('请输入有效金额');
    return;
  }
  recording.value = true;
  try {
    const payment = await createPayment({
      direction: recordForm.direction,
      billId: recordForm.billId,
      amount: recordForm.amount,
      method: recordForm.method,
      payerName: recordForm.payerName.trim() || undefined,
    });
    ElMessage.success(`已登记${paymentDirectionLabel(recordForm.direction)}：${payment.paymentNo}，待银行回执确认`);
    recordVisible.value = false;
    await load();
  } finally {
    recording.value = false;
  }
}

async function confirm(row: PaymentListItem): Promise<void> {
  confirmingId.value = row.id;
  try {
    const result = await confirmPayment(row.id);
    ElMessage.success(
      `银行回执确认成功：${row.paymentNo}，核销 ¥${formatAmount(result.allocation?.amount ?? row.amount)}`,
    );
    await load();
  } finally {
    confirmingId.value = null;
  }
}

onMounted(load);
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}

.filter-tip {
  margin-left: auto;
  font-size: 12px;
}

.retry-btn {
  margin-top: 6px;
}

.table-card {
  padding-top: 14px;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.small {
  font-size: 12px;
}

.record-tip {
  margin: 0;
  font-size: 12px;
}
</style>
