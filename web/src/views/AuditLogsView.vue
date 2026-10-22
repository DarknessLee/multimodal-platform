<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">审计日志</h2>
        <p class="page-subtitle">平台写操作留痕 · 共 {{ total }} 条</p>
      </div>
      <div class="page-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="card filter-bar">
      <el-select v-model="moduleFilter" placeholder="全部模块" clearable style="width: 150px" @change="search">
        <el-option v-for="module in MODULE_OPTIONS" :key="module.value" :label="module.label" :value="module.value" />
      </el-select>
      <el-input
        v-model="actionFilter"
        placeholder="搜索动作（如 quote.send）"
        clearable
        style="width: 260px"
        @keyup.enter="search"
        @clear="search"
      />
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="reset">重置</el-button>
      <span class="muted filter-tip">共 {{ total }} 条</span>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card table-card">
      <el-table v-loading="loading" :data="rows" size="small" border stripe>
        <el-table-column label="时间" width="150">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作人" min-width="130">
          <template #default="{ row }">
            <span class="row-link" data-testid="audit-row">{{ row.username }}</span>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="120">
          <template #default="{ row }">{{ ROLE_LABELS[row.role] || row.role }}</template>
        </el-table-column>
        <el-table-column label="动作" min-width="150">
          <template #default="{ row }">
            <span data-testid="audit-action" class="audit-action">{{ row.actionLabel || row.action }}</span>
            <div class="muted audit-code mono">{{ row.action }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="module" label="模块" width="110" align="center" />
        <el-table-column label="对象" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.targetType || '—' }} {{ row.targetId || '' }}
          </template>
        </el-table-column>
        <el-table-column label="详情" min-width="220">
          <template #default="{ row }">
            <el-popover placement="left" :width="420" trigger="click">
              <template #reference>
                <span class="detail-preview mono">{{ detailText(row.detail) }}</span>
              </template>
              <pre class="detail-json">{{ prettyJson(row.detail) }}</pre>
            </el-popover>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="120">
          <template #default="{ row }">
            <span class="mono">{{ row.ip || '—' }}</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无审计日志" :image-size="70" />
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
import { fetchAuditLogs } from '../api/audit';
import { ROLE_LABELS } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { AuditLog } from '../types';

const MODULE_OPTIONS = [
  { value: 'quote', label: '报价' },
  { value: 'contract', label: '合同' },
  { value: 'order', label: '订单' },
  { value: 'dispatch', label: '调度' },
  { value: 'settlement', label: '结算' },
  { value: 'auth', label: '认证' },
  { value: 'integration', label: '集成' },
  { value: 'master', label: '主数据' },
];

const loading = ref(false);
const errorText = ref('');
const rows = ref<AuditLog[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(15);
const moduleFilter = ref('');
const actionFilter = ref('');

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchAuditLogs({
      module: moduleFilter.value || undefined,
      action: actionFilter.value.trim() || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    rows.value = [];
    total.value = 0;
    errorText.value = error instanceof Error && error.message ? error.message : '审计日志加载失败';
  } finally {
    loading.value = false;
  }
}

function search(): void {
  page.value = 1;
  void load();
}

function reset(): void {
  moduleFilter.value = '';
  actionFilter.value = '';
  search();
}

function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function detailText(value: unknown): string {
  const text = prettyJson(value).replace(/\s+/g, ' ');
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
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

.row-link {
  color: var(--app-primary);
}

.audit-action {
  font-size: 13px;
  font-weight: 500;
}

.audit-code {
  font-size: 11px;
}

.detail-preview {
  font-size: 12px;
  color: var(--app-text-secondary);
  cursor: pointer;
}

.detail-json {
  margin: 0;
  max-height: 320px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
