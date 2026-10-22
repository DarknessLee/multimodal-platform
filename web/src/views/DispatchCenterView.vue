<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">智能调度中心</h2>
        <p class="page-subtitle">选择待调度订单 → 生成成本 / 时效 / 平衡三套方案 → 确认后自动签发一单制运单</p>
      </div>
      <div class="page-actions">
        <el-button :loading="loading" @click="loadOrders">刷新</el-button>
      </div>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="loadOrders">重新加载</el-button>
      </template>
    </el-alert>

    <div class="dispatch-layout">
      <!-- 待调度订单 -->
      <div class="card order-panel">
        <h3 class="card-title">
          <span class="card-title-text">待调度订单（{{ pendingOrders.length }}）</span>
        </h3>
        <div v-loading="loading" class="pending-list">
          <el-empty v-if="!loading && pendingOrders.length === 0" description="暂无待调度订单" :image-size="64" />
          <div
            v-for="order in pendingOrders"
            :key="order.id"
            class="pending-order"
            :class="{ 'pending-order--active': selectedOrderId === order.id }"
            data-testid="dispatch-order-row"
            @click="selectOrder(order.id)"
          >
            <div class="pending-order__head">
              <span class="mono pending-order__no">{{ order.orderNo }}</span>
              <StatusTag :status="order.status" :label="order.statusLabel" size="small" />
            </div>
            <div class="pending-order__meta">
              <span>{{ order.cargoName }}</span>
              <span class="muted">{{ order.origin }} → {{ order.destination }}</span>
            </div>
            <div class="pending-order__actions">
              <el-button
                size="small"
                type="primary"
                data-testid="plan-generate"
                :loading="generatingOrderId === order.id"
                @click.stop="generate(order)"
              >
                生成方案
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 方案对比 -->
      <div class="plan-panel">
        <div class="card">
          <h3 class="card-title">
            <span class="card-title-text">
              {{ selectedOrder ? `方案对比 · ${selectedOrder.orderNo}` : '方案对比' }}
            </span>
            <span v-if="planResult" class="muted">生成时间 {{ formatDateTime(planGeneratedAt) }}</span>
          </h3>

          <el-empty
            v-if="!planResult && !generating"
            description="请在左侧选择订单并点击「生成方案」"
            :image-size="72"
          />
          <div v-else v-loading="generating" class="plan-cards">
            <div
              v-for="plan in planResult?.plans ?? []"
              :key="plan.id"
              class="plan-card"
              :class="[
                `plan-card--${plan.strategy.toLowerCase()}`,
                { 'plan-card--active': selectedPlanId === plan.id },
              ]"
              :data-testid="`plan-card-${plan.strategy}`"
              @click="selectPlan(plan.id)"
            >
              <div class="plan-card__head">
                <span class="plan-card__strategy">{{ plan.strategyLabel || planStrategyLabel(plan.strategy) }}</span>
                <StatusTag :status="plan.status" :label="plan.statusLabel || planStatusLabel(plan.status)" size="small" />
              </div>
              <div class="plan-card__score">
                <span class="plan-card__score-label">综合评分</span>
                <span class="plan-card__score-value" data-testid="plan-score">{{ Number(plan.score).toFixed(1) }}</span>
              </div>
              <div class="plan-card__metrics">
                <div class="plan-metric">
                  <span class="meta-label">总成本(元)</span>
                  <span class="amount">¥{{ formatAmount(plan.totalCost) }}</span>
                </div>
                <div class="plan-metric">
                  <span class="meta-label">总时长(h)</span>
                  <span>{{ Number(plan.totalHours).toFixed(1) }}</span>
                </div>
                <div class="plan-metric">
                  <span class="meta-label">可靠度</span>
                  <span>{{ Number(plan.reliability).toFixed(1) }}%</span>
                </div>
              </div>
              <div class="plan-card__summary muted">{{ plan.summary || '—' }}</div>
            </div>
          </div>
        </div>

        <!-- 方案明细 -->
        <div v-if="selectedPlan" class="card mt-16">
          <h3 class="card-title">
            <span class="card-title-text">
              方案明细 · {{ selectedPlan.planNo }}（{{ selectedPlan.strategyLabel || planStrategyLabel(selectedPlan.strategy) }}）
            </span>
            <PermissionGuard permission="dispatch:confirm">
              <el-button
                type="primary"
                data-testid="plan-confirm"
                :loading="confirming"
                @click="confirm"
              >
                确认调度
              </el-button>
            </PermissionGuard>
          </h3>

          <el-table :data="selectedPlan.items" size="small" border stripe>
            <el-table-column prop="seq" label="段序" width="62" align="center" />
            <el-table-column label="方式" width="78" align="center">
              <template #default="{ row }">
                <span data-testid="plan-item">
                  <el-tag size="small" effect="plain">{{ row.modeLabel || modeLabel(row.mode) }}</el-tag>
                </span>
              </template>
            </el-table-column>
            <el-table-column label="承运商 / 运力" min-width="220">
              <template #default="{ row }">
                <div>{{ row.carrierName }}</div>
                <div class="muted resource-line">
                  {{ resourceTypeLabel(row.resourceType) }}：{{ row.resourceName }}
                </div>
              </template>
            </el-table-column>
            <el-table-column label="起止节点" min-width="200">
              <template #default="{ row }">{{ row.startNode }} → {{ row.endNode }}</template>
            </el-table-column>
            <el-table-column label="起止时间" min-width="220">
              <template #default="{ row }">
                {{ formatDateTime(row.startAt) }} ~ {{ formatDateTime(row.endAt) }}
              </template>
            </el-table-column>
            <el-table-column label="时长(h)" width="86" align="right">
              <template #default="{ row }">{{ Number(row.transitHours).toFixed(1) }}</template>
            </el-table-column>
            <el-table-column label="成本(元)" width="110" align="right">
              <template #default="{ row }">
                <span class="amount">{{ formatAmount(row.cost) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="可靠度" width="86" align="right">
              <template #default="{ row }">{{ Number(row.reliability).toFixed(1) }}%</template>
            </el-table-column>
          </el-table>

          <h4 class="sub-title">中转衔接窗口</h4>
          <el-table v-if="selectedPlan.transferWindows.length" :data="selectedPlan.transferWindows" size="small" border>
            <el-table-column label="中转节点" min-width="180">
              <template #default="{ row }">
                <span data-testid="transfer-window">{{ row.nodeName }}</span>
              </template>
            </el-table-column>
            <el-table-column label="到达 / 发运" min-width="220">
              <template #default="{ row }">
                {{ formatDateTime(row.arrivalAt) }} → {{ formatDateTime(row.departureAt) }}
              </template>
            </el-table-column>
            <el-table-column label="等待(h)" width="90" align="right">
              <template #default="{ row }">{{ Number(row.waitHours).toFixed(1) }}</template>
            </el-table-column>
            <el-table-column label="衔接状态" width="110" align="center">
              <template #default="{ row }">
                <el-tag :type="transferTagType(row.status)" size="small" effect="plain">
                  {{ row.statusLabel || transferStatusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="无中转衔接窗口" :image-size="56" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import PermissionGuard from '../components/PermissionGuard.vue';
import { fetchOrders } from '../api';
import { confirmPlan, generatePlans } from '../api/dispatch';
import {
  modeLabel,
  planStatusLabel,
  planStrategyLabel,
  resourceTypeLabel,
  transferStatusLabel,
} from '../utils/constants';
import { formatAmount, formatDateTime } from '../utils/format';
import type { DispatchPlan, OrderListItem, PlanGenerateResult } from '../types';

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const errorText = ref('');
const orders = ref<OrderListItem[]>([]);
const selectedOrderId = ref<number | null>(null);
const generatingOrderId = ref<number | null>(null);
const generating = ref(false);
const planResult = ref<PlanGenerateResult | null>(null);
const planGeneratedAt = ref('');
const selectedPlanId = ref<number | null>(null);
const confirming = ref(false);

const PENDING_STATUSES = ['CREATED', 'CONTRACTED', 'CONFIRMED'];

const pendingOrders = computed(() =>
  orders.value.filter((order) => PENDING_STATUSES.includes(order.status)),
);

const selectedOrder = computed(
  () => orders.value.find((order) => order.id === selectedOrderId.value) ?? null,
);

const selectedPlan = computed<DispatchPlan | null>(() => {
  const plans = planResult.value?.plans ?? [];
  return plans.find((plan) => plan.id === selectedPlanId.value) ?? null;
});

function transferTagType(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'OK') return 'success';
  if (status === 'TIGHT') return 'warning';
  return 'danger';
}

async function loadOrders(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    orders.value = await fetchOrders();
    // 支持从订单详情带 orderId 进入
    const queryOrderId = Number(route.query.orderId);
    if (Number.isFinite(queryOrderId) && pendingOrders.value.some((order) => order.id === queryOrderId)) {
      selectedOrderId.value = queryOrderId;
    }
  } catch (error) {
    orders.value = [];
    errorText.value = error instanceof Error && error.message ? error.message : '待调度订单加载失败';
  } finally {
    loading.value = false;
  }
}

function selectOrder(orderId: number): void {
  selectedOrderId.value = orderId;
  planResult.value = null;
  selectedPlanId.value = null;
}

async function generate(order: OrderListItem): Promise<void> {
  selectedOrderId.value = order.id;
  generatingOrderId.value = order.id;
  generating.value = true;
  planResult.value = null;
  selectedPlanId.value = null;
  try {
    const result = await generatePlans(order.id);
    planResult.value = result;
    planGeneratedAt.value = formatDateTime(new Date().toISOString());
    const balanced = result.plans.find((plan) => plan.strategy === 'BALANCED') ?? result.plans[0];
    selectedPlanId.value = balanced?.id ?? null;
    ElMessage.success(`已生成 ${result.plans.length} 套调度方案`);
  } catch {
    planResult.value = null;
  } finally {
    generating.value = false;
    generatingOrderId.value = null;
  }
}

function selectPlan(planId: number): void {
  selectedPlanId.value = planId;
}

async function confirm(): Promise<void> {
  if (!selectedPlan.value || !selectedOrder.value) {
    ElMessage.warning('请先选择方案');
    return;
  }
  confirming.value = true;
  try {
    const result = await confirmPlan(selectedPlan.value.id);
    ElMessage.success(`调度确认成功：订单 ${selectedOrder.value.orderNo} 已生成运单 ${result.waybillNo}`);
    await router.push(`/orders/${result.orderId}`);
  } finally {
    confirming.value = false;
  }
}

onMounted(loadOrders);
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}

.mt-16 {
  margin-top: 16px;
}

.retry-btn {
  margin-top: 6px;
}

.dispatch-layout {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.order-panel {
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 150px);
  display: flex;
  flex-direction: column;
}

.pending-list {
  overflow-y: auto;
  min-height: 120px;
}

.pending-order {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.pending-order:hover {
  border-color: #c6e2ff;
  background: #fafcff;
}

.pending-order--active {
  border-color: var(--app-primary);
  background: #f2f8ff;
}

.pending-order__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pending-order__no {
  font-weight: 600;
  font-size: 13.5px;
}

.pending-order__meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 6px 0 8px;
  font-size: 12.5px;
}

.pending-order__actions {
  display: flex;
  justify-content: flex-end;
}

.plan-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  min-height: 160px;
}

.plan-card {
  border: 1.5px solid var(--app-border);
  border-radius: 10px;
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.plan-card:hover {
  border-color: #c6e2ff;
}

.plan-card--active {
  border-color: var(--app-primary);
  background: #f2f8ff;
  box-shadow: 0 4px 16px rgba(64, 158, 255, 0.12);
}

.plan-card--cost.plan-card--active {
  border-color: #67c23a;
  background: #f3fbf0;
}

.plan-card--time.plan-card--active {
  border-color: #e6a23c;
  background: #fffaf2;
}

.plan-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.plan-card__strategy {
  font-size: 15px;
  font-weight: 600;
}

.plan-card__score {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 10px 0;
}

.plan-card__score-label {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.plan-card__score-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--app-primary);
  font-variant-numeric: tabular-nums;
}

.plan-card__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 10px 0;
  border-top: 1px dashed var(--app-border);
  border-bottom: 1px dashed var(--app-border);
}

.plan-metric {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 13px;
}

.plan-card__summary {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
}

.resource-line {
  font-size: 11.5px;
  margin-top: 2px;
}

.sub-title {
  margin: 18px 0 10px;
  font-size: 13px;
  font-weight: 600;
}

@media (max-width: 1200px) {
  .dispatch-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .order-panel {
    position: static;
    max-height: none;
  }

  .plan-cards {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
