<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">全链路验收</h2>
        <p class="page-subtitle">一键运行五阶段检查：数据完整性 · 哈希链 · 金额一致性 · 告警闭环 · 集成监管</p>
      </div>
      <div class="page-actions">
        <PermissionGuard permission="ops:full-chain-check">
          <el-button type="primary" data-testid="acceptance-run" :loading="loading" @click="run">
            运行全链路检查
          </el-button>
        </PermissionGuard>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card result-card">
      <div class="result-head">
        <div class="result-badge" data-testid="acceptance-result">
          <el-tag :type="result?.passed ? 'success' : 'danger'" size="large" effect="dark">
            {{ result ? (result.passed ? '全链路通过' : '存在失败项') : '待运行' }}
          </el-tag>
        </div>
        <span v-if="result" class="muted">检查时间：{{ formatDateTime(result.checkedAt) }}</span>
        <span v-if="result" class="muted">Stage 总数：{{ result.stages?.length ?? 0 }}</span>
      </div>
      <div class="summary-row" data-testid="acceptance-summary">
        <div class="summary-item">
          <span class="summary-label">检查项总数</span>
          <span class="summary-value">{{ result?.summary?.total ?? 0 }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">通过</span>
          <span class="summary-value success-text">{{ result?.summary?.pass ?? 0 }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">警告</span>
          <span class="summary-value warning-text">{{ result?.summary?.warn ?? 0 }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">失败</span>
          <span class="summary-value error-text">{{ result?.summary?.fail ?? 0 }}</span>
        </div>
      </div>
    </div>

    <div v-loading="loading" class="stage-list mt-16">
      <div
        v-for="stage in result?.stages ?? []"
        :key="stage.stage"
        class="card stage-card"
        data-testid="acceptance-stage"
      >
        <div class="stage-head">
          <span class="stage-no">Stage {{ stage.stage }}</span>
          <span class="stage-name">{{ stage.name }}</span>
          <el-tag :type="stageStatusType(stage)" size="small" effect="plain">
            {{ stageStatusLabel(stage) }}
          </el-tag>
        </div>
        <el-table :data="stage.checks" size="small" border>
          <el-table-column prop="name" label="检查项" min-width="200" show-overflow-tooltip />
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="checkItemTagType(row.status)" size="small" effect="plain">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="detail" label="详情" min-width="360" show-overflow-tooltip />
        </el-table>
        <el-empty v-if="stage.checks.length === 0" description="该阶段暂无检查项" :image-size="48" />
      </div>
      <div v-if="!loading && !result" class="card empty-result muted">尚未运行全链路检查，点击右上角「运行全链路检查」。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PermissionGuard from '../components/PermissionGuard.vue';
import { fetchFullChainCheck } from '../api/ops';
import { checkItemTagType } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { FullChainCheckResult, FullChainCheckStage } from '../types';

const loading = ref(false);
const errorText = ref('');
const result = ref<FullChainCheckResult | null>(null);

function stageStatusLabel(stage: FullChainCheckStage): string {
  if (stage.checks.some((check) => check.status === 'FAIL')) return '存在失败';
  if (stage.checks.some((check) => check.status === 'WARN')) return '存在警告';
  return '通过';
}

function stageStatusType(stage: FullChainCheckStage): 'success' | 'warning' | 'danger' {
  if (stage.checks.some((check) => check.status === 'FAIL')) return 'danger';
  if (stage.checks.some((check) => check.status === 'WARN')) return 'warning';
  return 'success';
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    result.value = await fetchFullChainCheck();
  } catch (error) {
    result.value = null;
    errorText.value = error instanceof Error && error.message ? error.message : '全链路检查加载失败';
  } finally {
    loading.value = false;
  }
}

async function run(): Promise<void> {
  await load();
  if (result.value) {
    ElMessage.success(
      result.value.passed
        ? `全链路检查通过：${result.value.summary.pass}/${result.value.summary.total} 项`
        : `检查完成：失败 ${result.value.summary.fail} 项，请查看详情`,
    );
  }
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

.result-card {
  padding: 16px 20px;
}

.result-head {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.summary-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.summary-item {
  background: #f7f9fc;
  border-radius: 8px;
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary-label {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.summary-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--app-text);
}

.success-text {
  color: #67c23a;
}

.warning-text {
  color: #e6a23c;
}

.error-text {
  color: #f56c6c;
}

.stage-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.stage-card {
  padding: 14px 18px;
}

.stage-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.stage-no {
  font-size: 14px;
  font-weight: 700;
  color: var(--app-primary);
}

.stage-name {
  font-size: 14px;
  font-weight: 600;
}

.empty-result {
  font-size: 13px;
  text-align: center;
  padding: 30px;
}

@media (max-width: 900px) {
  .summary-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
