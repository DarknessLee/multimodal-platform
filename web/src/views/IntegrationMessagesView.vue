<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">集成中心</h2>
        <p class="page-subtitle">Mock 适配器报文日志 · 铁路 95306 / 港口 EDI / CA 签章 / 银行 / 税务</p>
      </div>
      <div class="page-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <!-- 系统健康度 -->
    <div class="system-grid">
      <div v-for="system in systems" :key="system.systemCode" class="card system-card">
        <div class="system-card__head">
          <span class="system-card__name">{{ system.systemName }}</span>
          <el-tag :type="system.status === 'UP' ? 'success' : 'danger'" size="small" effect="light">
            {{ system.status === 'UP' ? '正常' : system.status }}
          </el-tag>
        </div>
        <div class="system-card__meta muted">
          {{ system.standard }} · {{ system.direction === 'OUT' ? '发送' : '接收' }}
        </div>
        <div class="system-card__footer">
          <span class="muted">成功率 {{ Number(system.successRate).toFixed(1) }}%</span>
          <span class="muted">{{ formatDateTime(system.lastMessageAt) }}</span>
        </div>
      </div>
      <div v-if="systems.length === 0" class="card muted system-empty">暂无系统目录数据</div>
    </div>

    <div class="card filter-bar mt-16">
      <el-select v-model="systemFilter" placeholder="全部系统" clearable style="width: 170px" @change="search">
        <el-option v-for="system in systems" :key="system.systemCode" :label="system.systemName" :value="system.systemCode" />
      </el-select>
      <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 140px" @change="search">
        <el-option v-for="(label, value) in INTEGRATION_STATUS_LABELS" :key="value" :label="label" :value="value" />
      </el-select>
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="reset">重置</el-button>
      <span class="muted filter-tip">共 {{ total }} 条报文</span>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card table-card">
      <el-table v-loading="loading" :data="rows" size="small" border stripe>
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
          <template #default="{ row }">
            {{ row.direction === 'OUT' ? '发送' : '接收' }}
          </template>
        </el-table-column>
        <el-table-column prop="msgType" label="报文类型" min-width="160" show-overflow-tooltip />
        <el-table-column prop="standard" label="标准" min-width="150" show-overflow-tooltip />
        <el-table-column label="状态" width="96" align="center">
          <template #default="{ row }">
            <StatusTag
              data-testid="message-status"
              kind="integration"
              :status="row.status"
              :label="row.statusLabel"
              size="small"
            />
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

    <IntegrationMessageDrawer
      v-model="detailVisible"
      :message="current"
      @retried="onRetried"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import PermissionGuard from '../components/PermissionGuard.vue';
import IntegrationMessageDrawer from '../components/IntegrationMessageDrawer.vue';
import {
  fetchIntegrationMessages,
  fetchIntegrationSystems,
  retryIntegrationMessage,
} from '../api/integration';
import { INTEGRATION_STATUS_LABELS } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { IntegrationMessage, IntegrationSystem } from '../types';

const loading = ref(false);
const errorText = ref('');
const systems = ref<IntegrationSystem[]>([]);
const rows = ref<IntegrationMessage[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const systemFilter = ref('');
const statusFilter = ref('');
const retryingId = ref<number | null>(null);

const detailVisible = ref(false);
const current = ref<IntegrationMessage | null>(null);

async function loadSystems(): Promise<void> {
  try {
    systems.value = await fetchIntegrationSystems();
  } catch {
    systems.value = [];
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

function search(): void {
  page.value = 1;
  void load();
}

function reset(): void {
  systemFilter.value = '';
  statusFilter.value = '';
  search();
}

function openDetail(row: IntegrationMessage): void {
  current.value = row;
  detailVisible.value = true;
}

async function retry(row: IntegrationMessage): Promise<void> {
  retryingId.value = row.id;
  try {
    const updated = await retryIntegrationMessage(row.id);
    ElMessage.success(`报文 ${row.msgNo} 重试成功`);
    if (current.value?.id === updated.id) current.value = updated;
    await load();
  } finally {
    retryingId.value = null;
  }
}

async function onRetried(updated: IntegrationMessage): Promise<void> {
  current.value = updated;
  await load();
}

onMounted(() => {
  void loadSystems();
  void load();
});
</script>

<style scoped>
.mt-16 {
  margin-top: 16px;
}

.mb-16 {
  margin-bottom: 16px;
}

.retry-btn {
  margin-top: 6px;
}

.filter-tip {
  margin-left: auto;
  font-size: 12px;
}

.system-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.system-card {
  padding: 12px 14px;
}

.system-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.system-card__name {
  font-size: 13.5px;
  font-weight: 600;
}

.system-card__meta {
  margin-top: 6px;
  font-size: 11.5px;
  line-height: 1.6;
}

.system-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  font-size: 11.5px;
}

.system-empty {
  grid-column: span 5;
  font-size: 13px;
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

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

@media (max-width: 1200px) {
  .system-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .system-empty {
    grid-column: span 3;
  }
}
</style>
