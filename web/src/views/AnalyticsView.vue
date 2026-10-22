<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">经营分析</h2>
        <p class="page-subtitle">收入 / 成本 / 毛利 · 按客户与运输模式 · AR 账龄</p>
      </div>
      <div class="page-actions">
        <el-select v-model="days" style="width: 130px" @change="loadAll">
          <el-option :value="7" label="近 7 天" />
          <el-option :value="14" label="近 14 天" />
          <el-option :value="30" label="近 30 天" />
          <el-option :value="90" label="近 90 天" />
        </el-select>
        <el-button :loading="loading" @click="loadAll">刷新</el-button>
      </div>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="loadAll">重新加载</el-button>
      </template>
    </el-alert>

    <div class="kpi-grid">
      <KpiCard
        data-testid="analytics-kpi-revenue"
        label="收入（元）"
        :value="formatAmount(overview?.kpis.revenue ?? 0)"
        tone="primary"
        hint="近周期应收合计"
      />
      <KpiCard
        data-testid="analytics-kpi-profit"
        label="毛利（元）"
        :value="formatAmount(overview?.kpis.profit ?? 0)"
        tone="success"
        :hint="`成本 ¥${formatAmount(overview?.kpis.cost ?? 0)}`"
      />
      <KpiCard
        data-testid="analytics-kpi-margin"
        label="毛利率"
        :value="formatAmount(overview?.kpis.margin ?? 0)"
        suffix="%"
        tone="warning"
        hint="毛利 / 收入"
      />
      <KpiCard
        label="AR 应收 / 逾期"
        :value="formatAmount(overview?.kpis.arTotal ?? 0)"
        tone="default"
        :hint="`逾期 ¥${formatAmount(overview?.kpis.arOverdue ?? 0)}`"
      />
    </div>

    <div class="card mt-16">
      <h3 class="card-title">
        <span class="card-title-text">收入 / 成本 / 毛利趋势</span>
        <span class="muted">最近 {{ days }} 天</span>
      </h3>
      <FinanceTrendChart data-testid="analytics-trend" :trend="trend" />
    </div>

    <div class="chart-grid mt-16">
      <div class="card" data-testid="analytics-by-customer">
        <h3 class="card-title"><span class="card-title-text">按客户收入 / 毛利</span></h3>
        <SimpleBarChart
          v-if="customerLabels.length"
          :labels="customerLabels"
          :series="customerSeries"
          horizontal
          :height="320"
          :value-formatter="formatWan"
        />
        <el-empty v-else description="暂无客户维度数据" :image-size="60" />
      </div>

      <div class="card" data-testid="analytics-by-mode">
        <h3 class="card-title"><span class="card-title-text">按运输模式收入 / 成本</span></h3>
        <SimpleBarChart
          v-if="modeLabels.length"
          :labels="modeLabels"
          :series="modeSeries"
          :height="320"
          :value-formatter="formatWan"
        />
        <el-empty v-else description="暂无模式维度数据" :image-size="60" />
      </div>
    </div>

    <div class="card mt-16" data-testid="analytics-ar-aging">
      <h3 class="card-title"><span class="card-title-text">AR 应收账龄</span></h3>
      <SimpleBarChart
        v-if="agingLabels.length"
        :labels="agingLabels"
        :series="agingSeries"
        :height="260"
        :value-formatter="formatWan"
      />
      <el-empty v-else description="暂无账龄数据" :image-size="60" />
    </div>

    <div class="card mt-16">
      <h3 class="card-title"><span class="card-title-text">客户经营明细</span></h3>
      <el-table :data="byCustomer" size="small" border stripe>
        <el-table-column prop="customerName" label="客户" min-width="220" show-overflow-tooltip />
        <el-table-column label="收入(元)" width="140" align="right">
          <template #default="{ row }">{{ formatAmount(row.revenue) }}</template>
        </el-table-column>
        <el-table-column label="成本(元)" width="140" align="right">
          <template #default="{ row }">{{ formatAmount(row.cost) }}</template>
        </el-table-column>
        <el-table-column label="毛利(元)" width="140" align="right">
          <template #default="{ row }">
            <span class="amount">{{ formatAmount(row.profit) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="毛利率" width="110" align="right">
          <template #default="{ row }">{{ Number(row.margin).toFixed(2) }}%</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="byCustomer.length === 0" description="暂无客户经营数据" :image-size="60" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import KpiCard from '../components/KpiCard.vue';
import FinanceTrendChart from '../components/FinanceTrendChart.vue';
import SimpleBarChart from '../components/SimpleBarChart.vue';
import {
  fetchAnalyticsByCustomer,
  fetchAnalyticsByMode,
  fetchAnalyticsOverview,
  fetchAnalyticsTrend,
} from '../api/analytics';
import { formatAmount } from '../utils/format';
import type {
  AnalyticsByCustomer,
  AnalyticsByMode,
  AnalyticsOverview,
  AnalyticsTrend,
} from '../types';

const days = ref(30);
const loading = ref(false);
const errorText = ref('');
const overview = ref<AnalyticsOverview | null>(null);
const trend = ref<AnalyticsTrend | null>(null);
const byCustomer = ref<AnalyticsByCustomer[]>([]);
const byMode = ref<AnalyticsByMode[]>([]);

const customerLabels = computed(() => byCustomer.value.slice(0, 10).map((item) => item.customerName));
const customerSeries = computed(() => [
  { name: '收入', data: byCustomer.value.slice(0, 10).map((item) => Number(item.revenue)), color: '#409eff' },
  { name: '毛利', data: byCustomer.value.slice(0, 10).map((item) => Number(item.profit)), color: '#67c23a' },
]);

const modeLabels = computed(() => byMode.value.map((item) => item.modeLabel));
const modeSeries = computed(() => [
  { name: '收入', data: byMode.value.map((item) => Number(item.revenue)), color: '#409eff' },
  { name: '成本', data: byMode.value.map((item) => Number(item.cost)), color: '#fa8c16' },
]);

const agingLabels = computed(() => (overview.value?.arAging ?? []).map((item) => item.bucket));
const agingSeries = computed(() => [
  { name: 'AR 金额', data: (overview.value?.arAging ?? []).map((item) => Number(item.amount)), color: '#409eff' },
]);

function formatWan(value: number): string {
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)}w`;
  return String(value);
}

async function loadAll(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  const [overviewResult, trendResult, customerResult, modeResult] = await Promise.allSettled([
    fetchAnalyticsOverview(days.value),
    fetchAnalyticsTrend(days.value),
    fetchAnalyticsByCustomer(),
    fetchAnalyticsByMode(),
  ]);
  if (overviewResult.status === 'fulfilled') overview.value = overviewResult.value;
  if (trendResult.status === 'fulfilled') trend.value = trendResult.value;
  if (customerResult.status === 'fulfilled') byCustomer.value = customerResult.value;
  if (modeResult.status === 'fulfilled') byMode.value = modeResult.value;

  const failed = [overviewResult, trendResult, customerResult, modeResult].find(
    (result) => result.status === 'rejected',
  );
  if (failed && failed.status === 'rejected') {
    const error = failed.reason;
    errorText.value = error instanceof Error && error.message ? error.message : '经营分析数据加载失败';
  }
  loading.value = false;
}

onMounted(loadAll);
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

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.chart-grid .card {
  margin-top: 0;
}

@media (max-width: 1100px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .chart-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
