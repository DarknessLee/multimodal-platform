<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">平台总览</h2>
        <p class="page-subtitle">
          {{ auth.roleLabel }}工作台 · 业务受理与履约全景
          <span v-if="loading" class="muted">（加载中…）</span>
        </p>
      </div>
      <div class="page-actions">
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

    <div v-loading="loading" class="dashboard-body">
      <!-- KPI -->
      <div class="kpi-grid">
        <KpiCard
          data-testid="kpi-orders-total"
          label="订单总数"
          :value="kpis.ordersTotal"
          suffix="票"
          tone="primary"
          hint="当前角色可见订单"
        />
        <KpiCard
          data-testid="kpi-in-transit"
          label="运输中"
          :value="kpis.inTransit"
          suffix="票"
          tone="warning"
          hint="在途运单"
        />
        <KpiCard
          data-testid="kpi-revenue"
          label="营收金额"
          :value="formatAmount(kpis.revenue)"
          suffix="元"
          tone="success"
          hint="已出账营收"
        />
        <KpiCard
          data-testid="kpi-on-time"
          label="准时率"
          :value="formatAmount(kpis.onTimeRate)"
          suffix="%"
          tone="default"
          hint="按计划到达统计"
        />
      </div>

      <div class="kpi-grid kpi-grid--secondary">
        <KpiCard label="待调度" :value="kpis.pendingDispatch" suffix="票" />
        <KpiCard label="已签收" :value="kpis.signed" suffix="票" />
        <KpiCard label="已出账" :value="kpis.billed" suffix="票" />
        <KpiCard label="异常数" :value="kpis.exceptionCount" suffix="项" tone="danger" />
      </div>

      <div class="dashboard-grid">
        <div class="card trend-card">
          <h3 class="card-title">
            <span class="card-title-text">订单与营收趋势（近 14 天）</span>
            <span class="muted trend-card__tip">ECharts 本地渲染</span>
          </h3>
          <TrendChart data-testid="trend-chart" :trend="trend" />
        </div>

        <div class="card todo-card">
          <h3 class="card-title"><span class="card-title-text">我的待办</span></h3>
          <div data-testid="todo-list" class="todo-list">
            <el-empty v-if="todos.length === 0" description="暂无待办事项" :image-size="60" />
            <div v-for="(todo, index) in todos" :key="index" class="todo-item">
              <span class="todo-item__dot" />
              <div class="todo-item__body">
                <div class="todo-item__title">{{ todo.title }}</div>
                <div class="todo-item__type muted">{{ todo.typeLabel }}</div>
              </div>
            </div>
          </div>

          <h3 class="card-title mt-16"><span class="card-title-text">状态分布</span></h3>
          <div class="status-dist">
            <div v-for="item in summary?.statusDistribution ?? []" :key="item.status" class="status-dist__row">
              <span class="status-dist__label">{{ item.statusLabel }}</span>
              <div class="status-dist__bar">
                <div
                  class="status-dist__fill"
                  :style="{ width: `${statusPercent(item.count)}%` }"
                />
              </div>
              <span class="status-dist__count">{{ item.count }}</span>
            </div>
            <div v-if="(summary?.statusDistribution ?? []).length === 0" class="muted small">
              暂无状态分布数据
            </div>
          </div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <h3 class="card-title">
            <span class="card-title-text">最近订单</span>
            <router-link v-if="auth.hasPermission('menu:orders')" to="/orders">查看全部 →</router-link>
          </h3>
          <el-table
            data-testid="recent-orders"
            :data="summary?.recentOrders ?? []"
            size="small"
            class="clickable-table"
            @row-click="goOrder"
          >
            <el-table-column prop="orderNo" label="订单号" min-width="150">
              <template #default="{ row }">
                <span class="mono">{{ row.orderNo }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="cargoName" label="货物" min-width="110" />
            <el-table-column prop="statusLabel" label="状态" width="90" align="center" />
            <el-table-column label="金额(元)" width="110" align="right">
              <template #default="{ row }">
                <span class="amount">{{ formatAmount(row.totalAmount) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" width="140">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
        </div>

        <div class="card" data-testid="integration-health">
          <h3 class="card-title">
            <span class="card-title-text">集成健康度</span>
            <router-link v-if="auth.hasPermission('menu:integration')" to="/integration/messages">
              集成中心 →
            </router-link>
          </h3>
          <div class="integration-health">
            <div class="integration-health__rate">
              <el-progress
                type="dashboard"
                :percentage="Number(summary?.integration.successRate ?? 0)"
                :width="112"
                :stroke-width="9"
                color="#67c23a"
              />
              <div class="muted">报文成功率</div>
            </div>
            <div class="integration-health__stats">
              <div class="integration-health__row">
                <span class="muted">报文总数</span>
                <span>{{ summary?.integration.total ?? 0 }}</span>
              </div>
              <div class="integration-health__row">
                <span class="muted">成功</span>
                <span class="success-text">{{ summary?.integration.success ?? 0 }}</span>
              </div>
              <div class="integration-health__row">
                <span class="muted">失败（可重试）</span>
                <span class="error-text">{{ summary?.integration.failed ?? 0 }}</span>
              </div>
              <div class="integration-health__row">
                <span class="muted">在途模式分布</span>
                <span>
                  {{
                    (summary?.modeDistribution ?? [])
                      .map((item) => `${modeLabel(item.mode)} ${item.count}`)
                      .join(' / ') || '—'
                  }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import KpiCard from '../components/KpiCard.vue';
import TrendChart from '../components/TrendChart.vue';
import { fetchDashboardSummary, fetchDashboardTrend } from '../api/dashboard';
import { useAuthStore } from '../stores/auth';
import { modeLabel } from '../utils/constants';
import { formatAmount, formatDateTime } from '../utils/format';
import type { DashboardKpis, DashboardSummary, DashboardTrend } from '../types';

const router = useRouter();
const auth = useAuthStore();

const loading = ref(false);
const errorText = ref('');
const summary = ref<DashboardSummary | null>(null);
const trend = ref<DashboardTrend | null>(null);

const emptyKpis: DashboardKpis = {
  ordersTotal: 0,
  inTransit: 0,
  pendingDispatch: 0,
  signed: 0,
  billed: 0,
  revenue: 0,
  onTimeRate: 0,
  exceptionCount: 0,
};

const kpis = computed<DashboardKpis>(() => summary.value?.kpis ?? emptyKpis);

const todos = computed(() =>
  (summary.value?.todos ?? []).map((todo) => ({
    ...todo,
    typeLabel: todo.type === 'DISPATCH' ? '调度待办' : todo.type === 'SETTLE' ? '结算待办' : '业务待办',
  })),
);

function statusPercent(count: number): number {
  const total = (summary.value?.statusDistribution ?? []).reduce((sum, item) => sum + item.count, 0);
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  const [summaryResult, trendResult] = await Promise.allSettled([
    fetchDashboardSummary(),
    fetchDashboardTrend(14),
  ]);
  if (summaryResult.status === 'fulfilled') {
    summary.value = summaryResult.value;
  } else {
    const error = summaryResult.reason;
    errorText.value = error instanceof Error && error.message
      ? `看板概览加载失败：${error.message}`
      : '看板概览加载失败，请重试';
  }
  if (trendResult.status === 'fulfilled') {
    trend.value = trendResult.value;
  }
  loading.value = false;
}

function goOrder(row: { id: number }): void {
  void router.push(`/orders/${row.id}`);
}

onMounted(load);
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

.dashboard-body {
  min-height: 200px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.kpi-grid--secondary {
  margin-top: 14px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr);
  gap: 16px;
  margin-top: 16px;
}

.trend-card__tip {
  font-size: 12px;
  font-weight: 400;
}

.todo-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #f0f2f5;
  border-radius: 8px;
  background: #fafcff;
}

.todo-item__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e6a23c;
  margin-top: 6px;
  flex-shrink: 0;
}

.todo-item__title {
  font-size: 13px;
  font-weight: 500;
}

.todo-item__type {
  font-size: 11.5px;
  margin-top: 2px;
}

.status-dist {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-dist__row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) 34px;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.status-dist__label {
  color: var(--app-text-regular);
}

.status-dist__bar {
  height: 7px;
  border-radius: 999px;
  background: #f0f2f5;
  overflow: hidden;
}

.status-dist__fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #a0cfff, #409eff);
}

.status-dist__count {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--app-text-secondary);
}

.clickable-table :deep(.el-table__row) {
  cursor: pointer;
}

.integration-health {
  display: flex;
  align-items: center;
  gap: 24px;
}

.integration-health__rate {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.integration-health__stats {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.integration-health__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.success-text {
  color: #67c23a;
}

.error-text {
  color: #f56c6c;
}

.small {
  font-size: 12px;
}

@media (max-width: 1200px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
