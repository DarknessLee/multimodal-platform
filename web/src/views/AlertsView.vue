<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">预警中心</h2>
        <p class="page-subtitle">延误 / 偏航 / 温湿度 / 异常停留 / 开门预警 · 确认、关闭与异常工单处置</p>
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

    <!-- 预警列表 -->
    <div class="card">
      <div class="card-title">
        <span class="card-title-text">预警列表（{{ alertTotal }}）</span>
        <div class="card-title__filters">
          <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 130px" @change="searchAlerts">
            <el-option v-for="(label, value) in ALERT_STATUS_LABELS" :key="value" :label="label" :value="value" />
          </el-select>
          <el-select v-model="levelFilter" placeholder="全部级别" clearable style="width: 120px" @change="searchAlerts">
            <el-option v-for="(label, value) in ALERT_LEVEL_LABELS" :key="value" :label="label" :value="value" />
          </el-select>
          <el-select v-model="typeFilter" placeholder="全部类型" clearable style="width: 140px" @change="searchAlerts">
            <el-option v-for="(label, value) in ALERT_TYPE_LABELS" :key="value" :label="label" :value="value" />
          </el-select>
          <el-button @click="searchAlerts">查询</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="alerts" size="small" border stripe>
        <el-table-column label="预警号" min-width="150">
          <template #default="{ row }">
            <span class="mono" data-testid="alert-row">{{ row.alertNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="级别" width="92" align="center">
          <template #default="{ row }">
            <el-tag :type="alertLevelTagType(row.level)" size="small" effect="dark" data-testid="alert-level">
              {{ row.levelLabel || alertLevelLabel(row.level) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="104" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" data-testid="alert-type">
              {{ row.alertTypeLabel || alertTypeLabel(row.alertType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="预警标题" min-width="200" show-overflow-tooltip />
        <el-table-column label="运单 / 箱" min-width="180">
          <template #default="{ row }">
            <span class="mono">{{ row.waybillNo || '—' }}</span>
            <span v-if="row.containerNo" class="muted"> / {{ row.containerNo }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="nodeName" label="节点" width="130">
          <template #default="{ row }">{{ row.nodeName || '—' }}</template>
        </el-table-column>
        <el-table-column prop="content" label="内容" min-width="180" show-overflow-tooltip />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'CLOSED' ? 'success' : row.status === 'ACK' ? 'warning' : 'danger'" size="small" effect="plain">
              {{ row.statusLabel || alertStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发生时间" width="140">
          <template #default="{ row }">{{ formatDateTime(row.occurredAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" align="center">
          <template #default="{ row }">
            <PermissionGuard permission="alert:ack">
              <el-button
                v-if="row.status === 'OPEN'"
                size="small"
                text
                type="primary"
                data-testid="alert-ack"
                :loading="actingId === `ack-${row.id}`"
                @click="ack(row as AlertItem)"
              >
                确认
              </el-button>
            </PermissionGuard>
            <PermissionGuard permission="alert:close">
              <el-button
                v-if="row.status !== 'CLOSED'"
                size="small"
                text
                type="success"
                data-testid="alert-close"
                :loading="actingId === `close-${row.id}`"
                @click="close(row as AlertItem)"
              >
                关闭
              </el-button>
            </PermissionGuard>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && alerts.length === 0" description="暂无预警数据" :image-size="64" />
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="alertPage"
          :page-size="alertPageSize"
          :total="alertTotal"
          layout="total, prev, pager, next"
          background
          @current-change="loadAlerts"
        />
      </div>
    </div>

    <!-- 异常工单 -->
    <div class="card mt-16">
      <div class="card-title">
        <span class="card-title-text">异常工单（{{ exceptionTotal }}）</span>
        <div class="card-title__filters">
          <el-select v-model="exceptionStatusFilter" placeholder="全部状态" clearable style="width: 140px" @change="searchExceptions">
            <el-option v-for="(label, value) in EXCEPTION_STATUS_LABELS" :key="value" :label="label" :value="value" />
          </el-select>
        </div>
      </div>
      <el-table v-loading="exceptionLoading" :data="exceptions" size="small" border stripe>
        <el-table-column label="工单号" min-width="150">
          <template #default="{ row }">
            <span class="mono" data-testid="exception-row">{{ row.ticketNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="关联预警/运单" min-width="190">
          <template #default="{ row }">
            <span class="mono">{{ row.alertNo || '—' }}</span>
            <span class="muted"> / {{ row.waybillNo || row.orderNo || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110" align="center">
          <template #default="{ row }">{{ row.typeLabel || exceptionTypeLabel(row.type) }}</template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip />
        <el-table-column label="处理人" width="100" align="center">
          <template #default="{ row }">{{ row.assignee || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="96" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'RESOLVED' || row.status === 'CLOSED' ? 'success' : 'warning'" size="small" effect="plain">
              {{ row.statusLabel || exceptionStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="resolution" label="处置结果" min-width="190" show-overflow-tooltip />
        <el-table-column label="创建 / 解决" width="150">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="center">
          <template #default="{ row }">
            <PermissionGuard permission="exception:handle">
              <el-button
                size="small"
                text
                type="primary"
                data-testid="exception-handle"
                :disabled="row.status === 'RESOLVED' || row.status === 'CLOSED'"
                @click="openHandle(row as ExceptionTicket)"
              >
                处置
              </el-button>
            </PermissionGuard>
          </template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="!exceptionLoading && exceptions.length === 0"
        description="暂无异常工单"
        :image-size="64"
      />
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="exceptionPage"
          :page-size="exceptionPageSize"
          :total="exceptionTotal"
          layout="total, prev, pager, next"
          background
          @current-change="loadExceptions"
        />
      </div>
    </div>

    <!-- 异常处置弹窗 -->
    <el-dialog v-model="handleVisible" title="异常工单处置" width="520px" :close-on-click-modal="false">
      <div v-if="currentException" class="handle-ticket">
        <div class="handle-ticket__row">
          <span class="meta-label">工单号</span>
          <span class="mono">{{ currentException.ticketNo }}</span>
        </div>
        <div class="handle-ticket__row">
          <span class="meta-label">描述</span>
          <span>{{ currentException.description }}</span>
        </div>
      </div>
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="处置结果">
          <el-input
            v-model="resolution"
            data-testid="exception-resolution"
            type="textarea"
            :rows="3"
            placeholder="如：已协调加班车，预计延误 2 小时"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="handling" @click="handleVisible = false">取消</el-button>
        <el-button type="primary" :loading="handling" @click="submitHandle">提交处置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PermissionGuard from '../components/PermissionGuard.vue';
import {
  ackAlert,
  closeAlert,
  fetchAlerts,
  fetchExceptions,
  handleException,
} from '../api/alerts';
import {
  ALERT_LEVEL_LABELS,
  ALERT_STATUS_LABELS,
  ALERT_TYPE_LABELS,
  EXCEPTION_STATUS_LABELS,
  alertLevelLabel,
  alertLevelTagType,
  alertStatusLabel,
  alertTypeLabel,
  exceptionStatusLabel,
  exceptionTypeLabel,
} from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { AlertItem, ExceptionTicket } from '../types';

const loading = ref(false);
const errorText = ref('');
const alerts = ref<AlertItem[]>([]);
const alertTotal = ref(0);
const alertPage = ref(1);
const alertPageSize = ref(10);
const statusFilter = ref('');
const levelFilter = ref('');
const typeFilter = ref('');
const actingId = ref('');

const exceptionLoading = ref(false);
const exceptions = ref<ExceptionTicket[]>([]);
const exceptionTotal = ref(0);
const exceptionPage = ref(1);
const exceptionPageSize = ref(10);
const exceptionStatusFilter = ref('');

const handleVisible = ref(false);
const handling = ref(false);
const resolution = ref('');
const currentException = ref<ExceptionTicket | null>(null);

async function loadAlerts(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchAlerts({
      status: statusFilter.value || undefined,
      level: levelFilter.value || undefined,
      alertType: typeFilter.value || undefined,
      page: alertPage.value,
      pageSize: alertPageSize.value,
    });
    alerts.value = data.list;
    alertTotal.value = data.total;
  } catch (error) {
    alerts.value = [];
    alertTotal.value = 0;
    errorText.value = error instanceof Error && error.message ? error.message : '预警列表加载失败';
  } finally {
    loading.value = false;
  }
}

async function loadExceptions(): Promise<void> {
  exceptionLoading.value = true;
  try {
    const data = await fetchExceptions({
      status: exceptionStatusFilter.value || undefined,
      page: exceptionPage.value,
      pageSize: exceptionPageSize.value,
    });
    exceptions.value = data.list;
    exceptionTotal.value = data.total;
  } catch {
    exceptions.value = [];
    exceptionTotal.value = 0;
  } finally {
    exceptionLoading.value = false;
  }
}

async function loadAll(): Promise<void> {
  await Promise.allSettled([loadAlerts(), loadExceptions()]);
}

function searchAlerts(): void {
  alertPage.value = 1;
  void loadAlerts();
}

function searchExceptions(): void {
  exceptionPage.value = 1;
  void loadExceptions();
}

async function ack(row: AlertItem): Promise<void> {
  actingId.value = `ack-${row.id}`;
  try {
    await ackAlert(row.id);
    ElMessage.success(`预警已确认：${row.alertNo}`);
    await loadAlerts();
  } finally {
    actingId.value = '';
  }
}

async function close(row: AlertItem): Promise<void> {
  actingId.value = `close-${row.id}`;
  try {
    await closeAlert(row.id);
    ElMessage.success(`预警已关闭：${row.alertNo}`);
    await loadAlerts();
  } finally {
    actingId.value = '';
  }
}

function openHandle(row: ExceptionTicket): void {
  currentException.value = row;
  resolution.value = row.status === 'PROCESSING' ? '' : '已协调处理，异常已解除';
  handleVisible.value = true;
}

async function submitHandle(): Promise<void> {
  if (!currentException.value) return;
  const text = resolution.value.trim();
  if (!text) {
    ElMessage.warning('请填写处置结果');
    return;
  }
  handling.value = true;
  try {
    await handleException(currentException.value.id, { resolution: text });
    ElMessage.success(`异常工单已处置：${currentException.value.ticketNo}`);
    handleVisible.value = false;
    await Promise.allSettled([loadExceptions(), loadAlerts()]);
  } finally {
    handling.value = false;
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

.retry-btn {
  margin-top: 6px;
}

.card-title__filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-weight: 400;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.handle-ticket {
  background: #f7f9fc;
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 14px;
}

.handle-ticket__row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 13px;
  padding: 3px 0;
}

.handle-ticket__row .meta-label {
  min-width: 48px;
}
</style>
