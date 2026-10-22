<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">集成中心</h2>
        <p class="page-subtitle">外部适配器健康度 · 报文请求/响应 · 单条/批量重试 · 成功率统计</p>
      </div>
      <div class="page-actions">
        <el-button :loading="loading" @click="loadAll">刷新</el-button>
      </div>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="loadAll">重新加载</el-button>
      </template>
    </el-alert>

    <!-- 适配器 -->
    <div class="adapter-grid">
      <div v-for="adapter in adapters" :key="adapter.id" class="card adapter-card" data-testid="adapter-card">
        <div class="adapter-card__head">
          <div class="adapter-card__title">
            <span class="adapter-card__name">{{ adapter.name }}</span>
            <span class="muted mono">{{ adapter.adapterCode }}</span>
          </div>
          <el-tag :type="adapterStatusTagType(adapter.status)" size="small" effect="light" data-testid="adapter-status">
            {{ adapter.statusLabel || adapterStatusLabel(adapter.status) }}
          </el-tag>
        </div>
        <div class="adapter-card__meta muted">
          {{ adapter.systemTypeLabel || adapterSystemLabel(adapter.systemType) }} · {{ adapter.protocol }}
        </div>
        <div class="adapter-card__metrics">
          <div class="adapter-metric">
            <span class="adapter-metric__value">{{ Number(adapter.successRate ?? 0).toFixed(1) }}%</span>
            <span class="adapter-metric__label">成功率</span>
          </div>
          <div class="adapter-metric">
            <span class="adapter-metric__value">{{ adapter.totalMessages ?? 0 }}</span>
            <span class="adapter-metric__label">报文量</span>
          </div>
          <div class="adapter-metric">
            <span class="adapter-metric__value error-text">{{ adapter.failedMessages ?? 0 }}</span>
            <span class="adapter-metric__label">失败</span>
          </div>
        </div>
        <div class="adapter-card__footer">
          <span class="muted">最近同步 {{ formatDateTime(adapter.lastSyncAt) }}</span>
          <div class="adapter-card__actions">
            <PermissionGuard permission="integration:adapter-test">
              <el-button
                size="small"
                text
                type="primary"
                data-testid="adapter-test"
                :loading="testingId === adapter.id"
                @click="testAdapter(adapter)"
              >
                连通测试
              </el-button>
            </PermissionGuard>
            <el-button size="small" text @click="openHealth(adapter)">健康检查</el-button>
          </div>
        </div>
        <div v-if="testResults[adapter.id]" class="adapter-test-result" :class="{ 'is-failed': !testResults[adapter.id]?.success }">
          {{ testResults[adapter.id]?.message }}（{{ testResults[adapter.id]?.latencyMs }} ms）
        </div>
      </div>
      <div v-if="!adapterLoading && adapters.length === 0" class="card muted adapter-empty">暂无适配器数据</div>
    </div>

    <!-- 统计 -->
    <div class="card mt-16" data-testid="integration-stats">
      <h3 class="card-title">
        <span class="card-title-text">报文统计（近 {{ statsDays }} 天）</span>
        <el-select v-model="statsDays" size="small" style="width: 110px" @change="loadStats">
          <el-option :value="7" label="近 7 天" />
          <el-option :value="14" label="近 14 天" />
          <el-option :value="30" label="近 30 天" />
        </el-select>
      </h3>
      <div class="stats-grid">
        <div class="stats-kpi">
          <div class="stats-kpi__value">{{ stats?.total ?? 0 }}</div>
          <div class="stats-kpi__label">报文总量</div>
        </div>
        <div class="stats-kpi">
          <div class="stats-kpi__value success-text">{{ stats?.success ?? 0 }}</div>
          <div class="stats-kpi__label">成功</div>
        </div>
        <div class="stats-kpi">
          <div class="stats-kpi__value error-text">{{ stats?.failed ?? 0 }}</div>
          <div class="stats-kpi__label">失败</div>
        </div>
        <div class="stats-kpi">
          <div class="stats-kpi__value">{{ Number(stats?.successRate ?? 0).toFixed(1) }}%</div>
          <div class="stats-kpi__label">成功率</div>
        </div>
      </div>
      <div class="stats-body">
        <div class="stats-chart">
          <SimpleBarChart
            v-if="statsTrendLabels.length"
            :labels="statsTrendLabels"
            :series="statsTrendSeries"
            :height="220"
          />
          <el-empty v-else description="暂无趋势数据" :image-size="56" />
        </div>
        <div class="stats-side">
          <h4 class="sub-title">按外部系统</h4>
          <el-table :data="stats?.bySystem ?? []" size="small" border>
            <el-table-column label="系统" min-width="120">
              <template #default="{ row }">{{ adapterSystemLabel(row.systemType) }}</template>
            </el-table-column>
            <el-table-column prop="count" label="总数" width="70" align="right" />
            <el-table-column prop="failed" label="失败" width="70" align="right" />
            <el-table-column label="成功率" width="90" align="right">
              <template #default="{ row }">{{ Number(row.successRate ?? 0).toFixed(1) }}%</template>
            </el-table-column>
          </el-table>
          <h4 class="sub-title">最近失败</h4>
          <ul v-if="(stats?.recentFailures ?? []).length" class="failure-list">
            <li v-for="item in stats?.recentFailures ?? []" :key="item.id" class="failure-item" @click="openDetailById(item.id)">
              <span class="mono">{{ item.msgNo }}</span>
              <span class="muted">{{ item.msgType }}</span>
              <el-tag size="small" type="danger" effect="plain">{{ item.errorCode || 'ERROR' }}</el-tag>
            </li>
          </ul>
          <el-empty v-else description="暂无失败报文" :image-size="48" />
        </div>
      </div>
    </div>

    <!-- 报文列表 -->
    <div class="card filter-bar mt-16">
      <el-select v-model="systemFilter" placeholder="全部系统" clearable style="width: 170px" @change="search">
        <el-option
          v-for="system in systemOptions"
          :key="system.value"
          :label="system.label"
          :value="system.value"
        />
      </el-select>
      <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 140px" @change="search">
        <el-option v-for="(label, value) in INTEGRATION_STATUS_LABELS" :key="value" :label="label" :value="value" />
      </el-select>
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="reset">重置</el-button>
      <PermissionGuard permission="integration:retry-batch">
        <el-button
          type="warning"
          data-testid="message-retry-batch"
          :disabled="selectedIds.length === 0"
          :loading="batchRetrying"
          @click="retrySelected"
        >
          批量重试（{{ selectedIds.length }}）
        </el-button>
      </PermissionGuard>
      <span class="muted filter-tip">共 {{ total }} 条报文</span>
    </div>

    <div class="card table-card">
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="rows"
        size="small"
        border
        stripe
        row-key="id"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="44" />
        <el-table-column label="报文号" min-width="165">
          <template #default="{ row }">
            <span class="row-link mono" data-testid="message-row" @click="openDetail(row as IntegrationMessage)">
              {{ row.msgNo }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="外部系统" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.systemName }}（{{ row.systemCode }}）</template>
        </el-table-column>
        <el-table-column label="方向" width="76" align="center">
          <template #default="{ row }">{{ row.direction === 'OUT' ? '发送' : '接收' }}</template>
        </el-table-column>
        <el-table-column prop="msgType" label="报文类型" min-width="160" show-overflow-tooltip />
        <el-table-column label="状态" width="96" align="center">
          <template #default="{ row }">
            <StatusTag data-testid="message-status" kind="integration" :status="row.status" :label="row.statusLabel" size="small" />
          </template>
        </el-table-column>
        <el-table-column prop="retryCount" label="重试" width="70" align="right" />
        <el-table-column prop="errorMessage" label="错误信息" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span :class="{ 'error-text': row.errorMessage }">{{ row.errorMessage || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="140">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" align="center">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openDetail(row as IntegrationMessage)">详情</el-button>
            <PermissionGuard permission="integration:retry">
              <el-button
                v-if="row.status === 'FAILED'"
                size="small"
                text
                type="danger"
                data-testid="message-retry"
                :loading="retryingId === row.id"
                @click="retry(row as IntegrationMessage)"
              >
                重试
              </el-button>
            </PermissionGuard>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无集成报文" :image-size="70" />
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

    <!-- 报文详情 -->
    <el-drawer v-model="detailVisible" title="报文详情" size="640px">
      <div v-loading="detailLoading" data-testid="message-detail" class="message-detail">
        <template v-if="detail">
          <div class="detail-head">
            <span class="mono detail-no">{{ detail.msgNo }}</span>
            <StatusTag kind="integration" :status="detail.status" :label="detail.statusLabel" size="small" />
            <el-tag size="small" effect="plain">{{ detail.direction === 'OUT' ? '发送' : '接收' }}</el-tag>
          </div>
          <el-descriptions :column="2" border size="small" class="mt-12">
            <el-descriptions-item label="报文类型">{{ detail.msgType }}</el-descriptions-item>
            <el-descriptions-item label="外部系统">
              {{ detail.systemTypeLabel || adapterSystemLabel(detail.systemType) || '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="重试次数">{{ detail.retryCount ?? 0 }}</el-descriptions-item>
            <el-descriptions-item label="错误码">{{ detail.errorCode || '—' }}</el-descriptions-item>
            <el-descriptions-item label="发送时间">{{ formatDateTime(detail.sentAt) }}</el-descriptions-item>
            <el-descriptions-item label="最近重试">{{ formatDateTime(detail.lastRetryAt) }}</el-descriptions-item>
          </el-descriptions>
          <h4 class="sub-title">请求报文</h4>
          <pre class="payload">{{ prettyPayload(detail.requestBody) }}</pre>
          <h4 class="sub-title">响应报文</h4>
          <pre class="payload">{{ prettyPayload(detail.responseBody) }}</pre>
        </template>
        <el-empty v-else-if="!detailLoading" description="暂无报文详情" :image-size="60" />
      </div>
    </el-drawer>

    <!-- 健康检查 -->
    <el-dialog v-model="healthVisible" title="适配器健康检查" width="560px">
      <div v-if="health">
        <div class="detail-head">
          <span class="mono">{{ health.adapter?.name }}</span>
          <el-tag :type="adapterStatusTagType(health.status)" size="small">{{ adapterStatusLabel(health.status) }}</el-tag>
          <span class="muted">检查于 {{ formatDateTime(health.checkedAt) }}</span>
        </div>
        <el-table :data="health.checks ?? []" size="small" border class="mt-12">
          <el-table-column prop="name" label="检查项" min-width="140" />
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="checkItemTagType(row.status)" size="small" effect="plain">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="detail" label="详情" min-width="200" show-overflow-tooltip />
          <el-table-column prop="latencyMs" label="耗时(ms)" width="90" align="right" />
        </el-table>
      </div>
      <el-empty v-else description="暂无健康检查数据" :image-size="56" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import PermissionGuard from '../components/PermissionGuard.vue';
import SimpleBarChart from '../components/SimpleBarChart.vue';
import {
  fetchAdapterHealth,
  fetchIntegrationAdapters,
  fetchIntegrationMessageDetail,
  fetchIntegrationMessages,
  fetchIntegrationStats,
  retryIntegrationMessagesBatch,
  retryIntegrationMessage,
  testIntegrationAdapter,
} from '../api/integration';
import {
  INTEGRATION_STATUS_LABELS,
  adapterStatusLabel,
  adapterStatusTagType,
  adapterSystemLabel,
  checkItemTagType,
} from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type {
  AdapterHealthResult,
  AdapterTestResult,
  IntegrationAdapter,
  IntegrationMessage,
  IntegrationMessageDetail,
  IntegrationStats,
} from '../types';

const loading = ref(false);
const adapterLoading = ref(false);
const errorText = ref('');
const adapters = ref<IntegrationAdapter[]>([]);
const rows = ref<IntegrationMessage[]>([]);
const tableRef = ref<{ clearSelection: () => void }>();
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const systemFilter = ref('');
const statusFilter = ref('');
const retryingId = ref<number | null>(null);
const batchRetrying = ref(false);
const selectedIds = ref<number[]>([]);
const testingId = ref<number | null>(null);
const testResults = reactive<Record<number, AdapterTestResult>>({});

const statsDays = ref(7);
const stats = ref<IntegrationStats | null>(null);

const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<IntegrationMessageDetail | null>(null);

const healthVisible = ref(false);
const health = ref<AdapterHealthResult | null>(null);

const systemOptions = computed(() =>
  adapters.value.map((adapter) => ({
    value: adapter.systemType,
    label: adapter.systemTypeLabel || adapterSystemLabel(adapter.systemType),
  })),
);

const statsTrendLabels = computed(() => (stats.value?.trend ?? []).map((item) => item.date.slice(5)));
const statsTrendSeries = computed(() => [
  { name: '报文量', data: (stats.value?.trend ?? []).map((item) => item.count), color: '#409eff' },
  { name: '失败', data: (stats.value?.trend ?? []).map((item) => item.failed), color: '#f56c6c' },
]);

async function loadAdapters(): Promise<void> {
  adapterLoading.value = true;
  try {
    adapters.value = await fetchIntegrationAdapters();
  } catch {
    adapters.value = [];
  } finally {
    adapterLoading.value = false;
  }
}

async function loadStats(): Promise<void> {
  try {
    stats.value = await fetchIntegrationStats(statsDays.value);
  } catch {
    stats.value = null;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchIntegrationMessages({
      systemCode: systemFilter.value || undefined,
      status: statusFilter.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    rows.value = [];
    total.value = 0;
    errorText.value = error instanceof Error && error.message ? error.message : '集成报文加载失败';
  } finally {
    loading.value = false;
  }
}

async function loadAll(): Promise<void> {
  await Promise.allSettled([loadAdapters(), loadStats(), load()]);
}

function search(): void {
  page.value = 1;
  void load();
}

function reset(): void {
  systemFilter.value = '';
  statusFilter.value = '';
  search();
}

function onSelectionChange(selection: IntegrationMessage[]): void {
  selectedIds.value = selection.map((item) => item.id);
}

async function testAdapter(adapter: IntegrationAdapter): Promise<void> {
  testingId.value = adapter.id;
  try {
    const result = await testIntegrationAdapter(adapter.id);
    testResults[adapter.id] = result;
    if (result.success) {
      ElMessage.success(`${adapter.name} 连通测试通过（${result.latencyMs} ms）`);
    } else {
      ElMessage.warning(`${adapter.name} 连通测试失败：${result.message}`);
    }
  } finally {
    testingId.value = null;
  }
}

async function openHealth(adapter: IntegrationAdapter): Promise<void> {
  healthVisible.value = true;
  health.value = null;
  try {
    health.value = await fetchAdapterHealth(adapter.id);
  } catch {
    health.value = null;
  }
}

async function openDetail(row: IntegrationMessage): Promise<void> {
  detailVisible.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    detail.value = await fetchIntegrationMessageDetail(row.id);
  } catch {
    detail.value = {
      id: row.id,
      msgNo: row.msgNo,
      systemName: row.systemName,
      msgType: row.msgType,
      direction: row.direction,
      relatedType: row.relatedType,
      relatedId: row.relatedId,
      status: row.status,
      statusLabel: row.statusLabel,
      retryCount: row.retryCount,
      errorCode: row.errorCode ?? null,
      requestBody: row.payloadPreview ?? null,
      responseBody: null,
      sentAt: row.createdAt,
      lastRetryAt: null,
    };
  } finally {
    detailLoading.value = false;
  }
}

function openDetailById(id: number): void {
  const row = rows.value.find((item) => item.id === id);
  if (row) {
    void openDetail(row);
    return;
  }
  detailVisible.value = true;
  detailLoading.value = true;
  detail.value = null;
  void fetchIntegrationMessageDetail(id)
    .then((data) => {
      detail.value = data;
    })
    .catch(() => {
      detail.value = null;
    })
    .finally(() => {
      detailLoading.value = false;
    });
}

function prettyPayload(payload: unknown): string {
  if (payload === null || payload === undefined || payload === '') return '（空）';
  if (typeof payload === 'string') {
    try {
      return JSON.stringify(JSON.parse(payload), null, 2);
    } catch {
      return payload;
    }
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

async function retry(row: IntegrationMessage): Promise<void> {
  retryingId.value = row.id;
  try {
    await retryIntegrationMessage(row.id);
    ElMessage.success(`报文 ${row.msgNo} 重试成功`);
    await Promise.allSettled([load(), loadStats(), loadAdapters()]);
    if (detail.value?.id === row.id) {
      detail.value = await fetchIntegrationMessageDetail(row.id).catch(() => detail.value);
    }
  } finally {
    retryingId.value = null;
  }
}

async function retrySelected(): Promise<void> {
  const ids = selectedIds.value.slice(0, 20);
  if (ids.length === 0) return;
  if (selectedIds.value.length > 20) {
    ElMessage.warning('批量重试最多 20 条，已取前 20 条');
  }
  batchRetrying.value = true;
  try {
    const result = await retryIntegrationMessagesBatch(ids);
    ElMessage.success(`批量重试完成：成功 ${result.success} / 失败 ${result.failed}（共 ${result.retried} 条）`);
    tableRef.value?.clearSelection();
    selectedIds.value = [];
    await Promise.allSettled([load(), loadStats()]);
  } finally {
    batchRetrying.value = false;
  }
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

.mt-12 {
  margin-top: 12px;
}

.retry-btn {
  margin-top: 6px;
}

.filter-tip {
  margin-left: auto;
  font-size: 12px;
}

.adapter-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.adapter-card {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.adapter-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.adapter-card__title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.adapter-card__name {
  font-size: 14px;
  font-weight: 600;
}

.adapter-card__meta {
  font-size: 12px;
}

.adapter-card__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  background: #f7f9fc;
  border-radius: 6px;
  padding: 8px 0;
}

.adapter-metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.adapter-metric__value {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.adapter-metric__label {
  font-size: 11px;
  color: var(--app-text-secondary);
}

.adapter-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.adapter-card__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.adapter-test-result {
  font-size: 12px;
  color: #67c23a;
  border-top: 1px dashed var(--app-border);
  padding-top: 6px;
}

.adapter-test-result.is-failed {
  color: #f56c6c;
}

.adapter-empty {
  grid-column: span 3;
  font-size: 13px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.stats-kpi {
  background: #f7f9fc;
  border-radius: 8px;
  padding: 12px 16px;
}

.stats-kpi__value {
  font-size: 22px;
  font-weight: 700;
  color: var(--app-text);
}

.stats-kpi__label {
  margin-top: 2px;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.stats-body {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 16px;
}

.stats-chart {
  min-width: 0;
}

.stats-side {
  min-width: 0;
}

.sub-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.stats-side .sub-title:not(:first-child) {
  margin-top: 14px;
}

.failure-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 150px;
  overflow: auto;
}

.failure-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.failure-item:hover {
  background: #f7f9fc;
}

.table-card {
  padding-top: 14px;
}

.row-link {
  color: var(--app-primary);
  cursor: pointer;
}

.row-link:hover {
  text-decoration: underline;
}

.error-text {
  color: #f56c6c;
}

.success-text {
  color: #67c23a;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.detail-no {
  font-size: 15px;
  font-weight: 600;
}

.payload {
  background: #0f172a;
  color: #d7e0f0;
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 12px;
  line-height: 1.6;
  max-height: 260px;
  overflow: auto;
  margin: 0 0 6px;
  white-space: pre-wrap;
  word-break: break-all;
}

@media (max-width: 1200px) {
  .adapter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .stats-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .adapter-empty {
    grid-column: span 2;
  }
}
</style>
