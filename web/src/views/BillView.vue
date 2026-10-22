<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">分段账单</h2>
        <p v-if="bill" class="page-subtitle">
          账单号 <span class="mono">{{ bill.bill.billNo }}</span> · 出账时间
          {{ formatDateTime(bill.bill.issuedAt) }}
        </p>
      </div>
      <div class="page-actions">
        <el-button @click="goOrders">返回订单列表</el-button>
        <el-button v-if="bill" @click="goOrder">查看订单</el-button>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert
      v-if="errorText"
      :title="errorText"
      type="error"
      :closable="false"
      show-icon
      class="mb-16"
    >
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div v-loading="loading">
      <template v-if="bill">
        <!-- 账单金额与信息 -->
        <div class="card bill-summary">
          <div class="bill-total">
            <div class="bill-total__label">账单总额（元）</div>
            <div class="bill-total__value">
              <span class="bill-total__currency">¥</span>
              <span data-testid="bill-total">{{ formatAmount(bill.bill.totalAmount) }}</span>
            </div>
            <div class="bill-total__meta">
              <StatusTag kind="bill" :status="bill.bill.status" :label="bill.bill.statusLabel" />
              <span class="muted">共 {{ bill.breakdown.length }} 个运输分段</span>
            </div>
          </div>

          <el-descriptions :column="2" border size="small" class="bill-desc">
            <el-descriptions-item label="账单号">
              <span class="mono">{{ bill.bill.billNo }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="账单状态">{{ bill.bill.statusLabel }}</el-descriptions-item>
            <el-descriptions-item label="订单号">
              <router-link :to="`/orders/${bill.order.id}`" class="mono">{{ bill.order.orderNo }}</router-link>
            </el-descriptions-item>
            <el-descriptions-item label="运单号">
              <router-link v-if="bill.waybill" :to="`/waybills/${bill.waybill.id}`" class="mono">
                {{ bill.waybill.waybillNo }}
              </router-link>
              <span v-else>—</span>
            </el-descriptions-item>
            <el-descriptions-item label="运输路线" :span="2">
              {{ bill.order.origin }} → {{ bill.order.destination }}
            </el-descriptions-item>
            <el-descriptions-item label="出账时间">{{ formatDateTime(bill.bill.issuedAt) }}</el-descriptions-item>
            <el-descriptions-item label="订单状态">{{ bill.order.statusLabel }}</el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- 费用构成 -->
        <div class="bill-body">
          <div class="card bill-chart-card">
            <h3 class="card-title"><span class="card-title-text">费用构成</span></h3>
            <BillPieChart :breakdown="bill.breakdown" />
          </div>

          <div class="card bill-table-card">
            <h3 class="card-title">
              <span class="card-title-text">分段明细</span>
              <span class="muted">金额单位：元</span>
            </h3>
            <div class="scroll-x">
              <el-table
                data-testid="bill-breakdown"
                :data="bill.breakdown"
                size="small"
                border
                stripe
                show-summary
                :summary-method="summaryMethod"
              >
                <el-table-column prop="seq" label="段序" width="68" align="center" />
                <el-table-column label="运输方式" width="92" align="center">
                  <template #default="{ row }">
                    <el-tag size="small" effect="plain">{{ row.modeLabel || modeLabel(row.mode) }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="carrierName" label="承运商" min-width="130" />
                <el-table-column label="起止节点" min-width="200">
                  <template #default="{ row }">{{ row.startNode }} → {{ row.endNode }}</template>
                </el-table-column>
                <el-table-column label="金额(元)" width="120" align="right">
                  <template #default="{ row }">
                    <span class="amount">{{ formatAmount(row.amount) }}</span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>
        </div>
      </template>

      <el-empty v-else-if="!loading && !errorText" description="账单不存在或无权查看" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import StatusTag from '../components/StatusTag.vue';
import BillPieChart from '../components/BillPieChart.vue';
import { fetchBill } from '../api';
import { modeLabel } from '../utils/constants';
import { formatAmount, formatDateTime } from '../utils/format';
import type { BillData } from '../types';

const route = useRoute();
const router = useRouter();

const bill = ref<BillData | null>(null);
const loading = ref(false);
const errorText = ref('');

const billId = computed(() => String(route.params.id ?? ''));

function summaryMethod(params: { columns: Array<{ property?: string }>; data: Array<{ amount?: number }> }): string[] {
  const sums = params.columns.map(() => '');
  const amountIndex = params.columns.findIndex((column) => column.property === 'amount');
  const totalIndex = amountIndex >= 0 ? amountIndex : params.columns.length - 1;
  sums[0] = '合计';
  const total = params.data.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  sums[totalIndex] = formatAmount(total);
  return sums;
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    bill.value = await fetchBill(billId.value);
  } catch (error) {
    bill.value = null;
    errorText.value = error instanceof Error && error.message ? error.message : '账单加载失败，请重试';
  } finally {
    loading.value = false;
  }
}

function goOrders(): void {
  void router.push('/orders');
}

function goOrder(): void {
  if (!bill.value) return;
  void router.push(`/orders/${bill.value.order.id}`);
}

onMounted(load);
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}

.retry-btn {
  margin-top: 6px;
}

.bill-summary {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 24px;
}

.bill-total {
  padding: 18px 20px;
  border-radius: 10px;
  background: linear-gradient(150deg, #fff5f5, #fffaf5);
  border: 1px solid #fde2e2;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.bill-total__label {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.bill-total__value {
  margin: 8px 0 10px;
  font-size: 34px;
  font-weight: 700;
  color: #f56c6c;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.bill-total__currency {
  font-size: 20px;
  margin-right: 2px;
}

.bill-total__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.bill-desc {
  align-self: start;
}

.bill-body {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.4fr);
  gap: 16px;
  margin-top: 16px;
}

.bill-body .card {
  margin-top: 0;
}

@media (max-width: 1100px) {
  .bill-summary {
    grid-template-columns: minmax(0, 1fr);
  }

  .bill-body {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
