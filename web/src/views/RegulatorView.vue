<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">监管中心</h2>
        <p class="page-subtitle">监管报送统计 · 合规检查结果 · 监管回执</p>
      </div>
      <div class="page-actions">
        <PermissionGuard permission="menu:regulator">
          <el-button @click="go('/regulator/reports')">监管报送</el-button>
          <el-button @click="go('/regulator/compliance')">合规检查</el-button>
        </PermissionGuard>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="kpi-grid">
      <KpiCard
        data-testid="regulator-kpi-reports"
        label="监管报送（总数）"
        :value="String(dashboard?.reports?.total ?? 0)"
        tone="primary"
        :hint="`草稿 ${dashboard?.reports?.draft ?? 0} · 已提交 ${dashboard?.reports?.submitted ?? 0} · 已受理 ${dashboard?.reports?.accepted ?? 0} · 退回 ${dashboard?.reports?.returned ?? 0}`"
      />
      <KpiCard
        data-testid="regulator-kpi-compliance"
        label="合规检查（总数）"
        :value="String(complianceTotal)"
        tone="success"
        :hint="`通过 ${dashboard?.compliance?.pass ?? 0} · 警告 ${dashboard?.compliance?.warn ?? 0} · 失败 ${dashboard?.compliance?.fail ?? 0}`"
      />
      <KpiCard
        label="待提交 / 待受理"
        :value="`${dashboard?.reports?.draft ?? 0} / ${dashboard?.reports?.submitted ?? 0}`"
        tone="warning"
        hint="草稿可提交；已提交可受理/退回"
      />
      <KpiCard
        label="合规通过率"
        :value="compliancePassRate"
        suffix="%"
        tone="default"
        hint="通过 / 检查总数"
      />
    </div>

    <div class="grid-2 mt-16">
      <div class="card">
        <h3 class="card-title">
          <span class="card-title-text">最近报送</span>
          <el-button size="small" text type="primary" @click="go('/regulator/reports')">查看全部</el-button>
        </h3>
        <el-table :data="dashboard?.latestReports ?? []" size="small" border>
          <el-table-column label="报送单号" min-width="150">
            <template #default="{ row }"><span class="mono" data-testid="report-row">{{ row.reportNo }}</span></template>
          </el-table-column>
          <el-table-column label="类型" width="110">
            <template #default="{ row }">{{ row.reportTypeLabel || reportTypeLabel(row.reportType) }}</template>
          </el-table-column>
          <el-table-column prop="period" label="周期" width="90" />
          <el-table-column label="状态" width="96" align="center">
            <template #default="{ row }">
              <el-tag :type="reportStatusTagType(row.status)" size="small" effect="plain" data-testid="report-status">
                {{ row.statusLabel || reportStatusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!loading && (dashboard?.latestReports ?? []).length === 0" description="暂无报送数据" :image-size="56" />
      </div>

      <div class="card">
        <h3 class="card-title">
          <span class="card-title-text">最近合规检查</span>
          <el-button size="small" text type="primary" @click="go('/regulator/compliance')">查看全部</el-button>
        </h3>
        <el-table :data="dashboard?.latestChecks ?? []" size="small" border>
          <el-table-column label="检查单号" min-width="140">
            <template #default="{ row }"><span class="mono" data-testid="compliance-row">{{ row.checkNo }}</span></template>
          </el-table-column>
          <el-table-column label="类型" width="120">
            <template #default="{ row }">{{ row.checkTypeLabel || complianceTypeLabel(row.checkType) }}</template>
          </el-table-column>
          <el-table-column label="结果" width="86" align="center">
            <template #default="{ row }">
              <el-tag :type="complianceResultTagType(row.result)" size="small" effect="plain">
                {{ row.resultLabel || complianceResultLabel(row.result) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!loading && (dashboard?.latestChecks ?? []).length === 0" description="暂无合规检查数据" :image-size="56" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import KpiCard from '../components/KpiCard.vue';
import PermissionGuard from '../components/PermissionGuard.vue';
import { fetchRegulatorDashboard } from '../api/regulator';
import {
  complianceResultLabel,
  complianceResultTagType,
  complianceTypeLabel,
  reportStatusLabel,
  reportStatusTagType,
  reportTypeLabel,
} from '../utils/constants';
import type { RegulatorDashboard } from '../types';

const router = useRouter();
const loading = ref(false);
const errorText = ref('');
const dashboard = ref<RegulatorDashboard | null>(null);

const complianceTotal = computed(() => {
  const c = dashboard.value?.compliance;
  if (!c) return 0;
  return (c.pass ?? 0) + (c.warn ?? 0) + (c.fail ?? 0);
});

const compliancePassRate = computed(() => {
  if (!complianceTotal.value) return '0.0';
  const pass = dashboard.value?.compliance?.pass ?? 0;
  return ((pass / complianceTotal.value) * 100).toFixed(1);
});

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    dashboard.value = await fetchRegulatorDashboard();
  } catch (error) {
    dashboard.value = null;
    errorText.value = error instanceof Error && error.message ? error.message : '监管看板加载失败';
  } finally {
    loading.value = false;
  }
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

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.grid-2 .card {
  min-width: 0;
}

@media (max-width: 1100px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .grid-2 {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
