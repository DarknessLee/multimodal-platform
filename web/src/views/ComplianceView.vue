<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">合规检查</h2>
        <p class="page-subtitle">箱号校验位 / 单证完整 / 发票一致 / 财务平衡 / 报文质量</p>
      </div>
      <div class="page-actions">
        <PermissionGuard permission="regulator:check-run">
          <el-button type="primary" data-testid="compliance-run" :loading="running" @click="run">
            执行合规检查
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

    <div class="card summary-card" data-testid="compliance-result">
      <div class="summary-item">
        <span class="summary-label">检查总数</span>
        <span class="summary-value">{{ runResult?.summary?.total ?? total }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">通过</span>
        <span class="summary-value success-text">{{ runResult?.summary?.pass ?? '-' }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">警告</span>
        <span class="summary-value warning-text">{{ runResult?.summary?.warn ?? '-' }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">失败</span>
        <span class="summary-value error-text">{{ runResult?.summary?.fail ?? '-' }}</span>
      </div>
      <span class="muted summary-tip">
        {{ runResult ? `最近执行：${formatDateTime(runResult.checks?.[0]?.checkedAt)}` : '点击「执行合规检查」运行 5 类规则' }}
      </span>
    </div>

    <div class="card filter-bar mt-16">
      <el-select v-model="resultFilter" placeholder="全部结果" clearable style="width: 130px" @change="search">
        <el-option v-for="option in COMPLIANCE_RESULT_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-select v-model="typeFilter" placeholder="全部类型" clearable style="width: 160px" @change="search">
        <el-option v-for="option in COMPLIANCE_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <span class="muted filter-tip">共 {{ total }} 条检查记录</span>
    </div>

    <div class="card table-card">
      <el-table v-loading="loading" :data="rows" size="small" border stripe>
        <el-table-column label="检查单号" min-width="150">
          <template #default="{ row }"><span class="mono" data-testid="compliance-row">{{ row.checkNo }}</span></template>
        </el-table-column>
        <el-table-column label="检查类型" width="140">
          <template #default="{ row }">{{ row.checkTypeLabel || complianceTypeLabel(row.checkType) }}</template>
        </el-table-column>
        <el-table-column label="对象" min-width="170">
          <template #default="{ row }">{{ row.targetType }} · {{ row.targetId }}</template>
        </el-table-column>
        <el-table-column label="结果" width="86" align="center">
          <template #default="{ row }">
            <el-tag :type="complianceResultTagType(row.result)" size="small" effect="plain">
              {{ row.resultLabel || complianceResultLabel(row.result) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="detail" label="详情" min-width="260" show-overflow-tooltip />
        <el-table-column label="检查时间" width="150">
          <template #default="{ row }">{{ formatDateTime(row.checkedAt) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无合规检查记录" :image-size="64" />
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
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PermissionGuard from '../components/PermissionGuard.vue';
import { fetchComplianceChecks, runComplianceChecks } from '../api/regulator';
import {
  COMPLIANCE_RESULT_OPTIONS,
  COMPLIANCE_TYPE_OPTIONS,
  complianceResultLabel,
  complianceResultTagType,
  complianceTypeLabel,
} from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { ComplianceCheckItem, ComplianceRunResult } from '../types';

const loading = ref(false);
const running = ref(false);
const errorText = ref('');
const rows = ref<ComplianceCheckItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const resultFilter = ref('');
const typeFilter = ref('');
const runResult = ref<ComplianceRunResult | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchComplianceChecks({
      result: resultFilter.value || undefined,
      checkType: typeFilter.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    rows.value = [];
    total.value = 0;
    errorText.value = error instanceof Error && error.message ? error.message : '合规检查加载失败';
  } finally {
    loading.value = false;
  }
}

function search(): void {
  page.value = 1;
  void load();
}

async function run(): Promise<void> {
  running.value = true;
  try {
    runResult.value = await runComplianceChecks();
    const summary = runResult.value.summary;
    ElMessage.success(`合规检查完成：通过 ${summary.pass} / 警告 ${summary.warn} / 失败 ${summary.fail}（共 ${summary.total} 项）`);
    page.value = 1;
    await load();
  } finally {
    running.value = false;
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

.filter-tip {
  margin-left: auto;
  font-size: 12px;
}

.summary-card {
  display: flex;
  align-items: center;
  gap: 32px;
  flex-wrap: wrap;
  padding: 16px 20px;
}

.summary-item {
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

.summary-tip {
  margin-left: auto;
  font-size: 12px;
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

.table-card {
  padding-top: 14px;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
