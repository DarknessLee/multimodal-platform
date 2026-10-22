<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">运营后台</h2>
        <p class="page-subtitle">系统健康巡检 · 数据量 · 任务状态 · 配置与字典入口</p>
      </div>
      <div class="page-actions">
        <el-button @click="go('/ops/configs')">系统配置 / 字典</el-button>
        <el-button @click="go('/ops/jobs')">定时任务</el-button>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card ops-health" data-testid="ops-health">
      <div class="health-head">
        <span class="health-title">系统健康巡检</span>
        <el-tag :type="healthStatusType" size="small" effect="dark">{{ health?.status ?? '未知' }}</el-tag>
        <span v-if="dashboard" class="muted">运行 {{ Number(dashboard.uptimeHours ?? 0).toFixed(1) }} 小时</span>
      </div>
      <div class="health-grid">
        <div class="health-item">
          <span class="health-label">数据库</span>
          <span class="health-value">
            {{ health?.db?.status ?? '—' }}
            <span class="muted">（{{ health?.db?.latencyMs ?? 0 }} ms）</span>
          </span>
        </div>
        <div class="health-item">
          <span class="health-label">适配器在线</span>
          <span class="health-value">{{ health?.adapters?.online ?? 0 }} / {{ health?.adapters?.total ?? 0 }}</span>
        </div>
        <div class="health-item">
          <span class="health-label">任务成功 / 失败</span>
          <span class="health-value">
            <span class="success-text">{{ health?.jobs?.success ?? 0 }}</span> /
            <span class="error-text">{{ health?.jobs?.failed ?? 0 }}</span>
          </span>
        </div>
        <div class="health-item">
          <span class="health-label">待处理报送</span>
          <span class="health-value">{{ dashboard?.pendingReports ?? 0 }}</span>
        </div>
      </div>
      <div class="data-grid">
        <div v-for="item in dataEntries" :key="item.key" class="data-item">
          <span class="data-value">{{ item.value }}</span>
          <span class="data-label">{{ item.label }}</span>
        </div>
      </div>
    </div>

    <div class="grid-2 mt-16">
      <div class="card">
        <h3 class="card-title">
          <span class="card-title-text">最近任务执行</span>
          <el-button size="small" text type="primary" @click="go('/ops/jobs')">全部任务</el-button>
        </h3>
        <el-table :data="dashboard?.recentJobs ?? []" size="small" border>
          <el-table-column label="任务" min-width="150">
            <template #default="{ row }">
              <span class="mono" data-testid="ops-job-row">{{ row.jobCode }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="jobName" label="名称" min-width="140" show-overflow-tooltip />
          <el-table-column label="状态" width="86" align="center">
            <template #default="{ row }">
              <el-tag :type="jobStatusTagType(row.status)" size="small" effect="plain">
                {{ row.statusLabel || jobStatusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="耗时" width="90" align="right">
            <template #default="{ row }">{{ row.durationMs ?? row.lastDurationMs ?? 0 }} ms</template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!loading && (dashboard?.recentJobs ?? []).length === 0" description="暂无任务执行记录" :image-size="56" />
      </div>

      <div class="card">
        <h3 class="card-title">
          <span class="card-title-text">失败报文（待重试）</span>
          <el-button size="small" text type="primary" @click="go('/integration/messages')">集成中心</el-button>
        </h3>
        <el-table :data="dashboard?.failedMessages ?? []" size="small" border>
          <el-table-column label="报文号" min-width="150">
            <template #default="{ row }"><span class="mono">{{ row.msgNo }}</span></template>
          </el-table-column>
          <el-table-column prop="msgType" label="类型" min-width="140" show-overflow-tooltip />
          <el-table-column label="错误码" width="100">
            <template #default="{ row }">
              <el-tag size="small" type="danger" effect="plain">{{ row.errorCode || 'ERROR' }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!loading && (dashboard?.failedMessages ?? []).length === 0" description="暂无失败报文" :image-size="56" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fetchOpsDashboard, fetchOpsHealth } from '../api/ops';
import { jobStatusLabel, jobStatusTagType } from '../utils/constants';
import type { OpsDashboard, OpsHealth } from '../types';

const router = useRouter();
const loading = ref(false);
const errorText = ref('');
const health = ref<OpsHealth | null>(null);
const dashboard = ref<OpsDashboard | null>(null);

const healthStatusType = computed<'success' | 'warning' | 'danger' | 'info'>(() => {
  const status = health.value?.status?.toUpperCase();
  if (status === 'UP' || status === 'OK' || status === 'HEALTHY') return 'success';
  if (status === 'DEGRADED') return 'warning';
  return 'danger';
});

const DATA_LABELS: Record<string, string> = {
  tables: '数据表',
  orders: '订单',
  waybills: '运单',
  documents: '单证',
  bills: '账单',
  invoices: '发票',
  alerts: '预警',
  users: '用户',
  containers: '集装箱',
  payments: '支付',
};

const dataEntries = computed(() => {
  const data = dashboard.value?.dataCounts ?? health.value?.data ?? {};
  return Object.entries(data)
    .filter(([, value]) => typeof value === 'number')
    .map(([key, value]) => ({ key, label: DATA_LABELS[key] ?? key, value: value as number }));
});

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  const [healthResult, dashboardResult] = await Promise.allSettled([fetchOpsHealth(), fetchOpsDashboard()]);
  if (healthResult.status === 'fulfilled') health.value = healthResult.value;
  if (dashboardResult.status === 'fulfilled') dashboard.value = dashboardResult.value;
  const failed = [healthResult, dashboardResult].find((item) => item.status === 'rejected');
  if (failed && failed.status === 'rejected') {
    const error = failed.reason;
    errorText.value = error instanceof Error && error.message ? error.message : '运营数据加载失败';
  }
  loading.value = false;
}

function go(path: string): void {
  void router.push(path);
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

.ops-health {
  padding: 16px 20px;
}

.health-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.health-title {
  font-size: 15px;
  font-weight: 600;
}

.health-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.health-item {
  background: #f7f9fc;
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.health-label {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.health-value {
  font-size: 16px;
  font-weight: 600;
}

.data-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.data-item {
  text-align: center;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 10px 6px;
}

.data-value {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text);
}

.data-label {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.grid-2 .card {
  min-width: 0;
}

.success-text {
  color: #67c23a;
}

.error-text {
  color: #f56c6c;
}

@media (max-width: 1200px) {
  .health-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .data-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .grid-2 {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
