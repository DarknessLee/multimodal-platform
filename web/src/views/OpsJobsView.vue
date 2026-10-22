<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">定时任务</h2>
        <p class="page-subtitle">Mock 手动触发 · 最近执行结果与耗时 · 执行写日志与审计</p>
      </div>
      <div class="page-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card">
      <div class="card-title">
        <span class="card-title-text">任务列表（{{ jobs.length }}）</span>
        <span class="muted">手动触发 Mock 执行，结果写入 job_log</span>
      </div>
      <el-table v-loading="loading" :data="jobs" size="small" border stripe>
        <el-table-column label="任务编码" min-width="180">
          <template #default="{ row }"><span class="mono" data-testid="ops-job-row">{{ row.jobCode }}</span></template>
        </el-table-column>
        <el-table-column prop="jobName" label="任务名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="Cron" min-width="140">
          <template #default="{ row }"><span class="mono muted">{{ row.cron || '—' }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="96" align="center">
          <template #default="{ row }">
            <el-tag :type="jobStatusTagType(row.status)" size="small" effect="plain">
              {{ jobStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近执行" width="150">
          <template #default="{ row }">{{ formatDateTime(row.lastRunAt) }}</template>
        </el-table-column>
        <el-table-column label="最近结果" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.lastResult || '—' }}</template>
        </el-table-column>
        <el-table-column label="耗时" width="100" align="right">
          <template #default="{ row }">{{ row.lastDurationMs ?? 0 }} ms</template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="center">
          <template #default="{ row }">
            <PermissionGuard permission="ops:job-run">
              <el-button
                size="small"
                text
                type="primary"
                data-testid="ops-job-run"
                :loading="runningCode === row.jobCode"
                @click="run(row as OpsJobItem)"
              >
                执行
              </el-button>
            </PermissionGuard>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && jobs.length === 0" description="暂无任务数据" :image-size="64" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PermissionGuard from '../components/PermissionGuard.vue';
import { fetchOpsJobs, runOpsJob } from '../api/ops';
import { jobStatusLabel, jobStatusTagType } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { OpsJobItem } from '../types';

const loading = ref(false);
const errorText = ref('');
const jobs = ref<OpsJobItem[]>([]);
const runningCode = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    jobs.value = await fetchOpsJobs();
  } catch (error) {
    jobs.value = [];
    errorText.value = error instanceof Error && error.message ? error.message : '任务列表加载失败';
  } finally {
    loading.value = false;
  }
}

async function run(row: OpsJobItem): Promise<void> {
  runningCode.value = row.jobCode;
  try {
    const result = await runOpsJob(row.jobCode);
    ElMessage.success(`任务 ${result.jobName || row.jobName} 执行完成：${result.status}`);
    await load();
  } finally {
    runningCode.value = null;
  }
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
</style>
