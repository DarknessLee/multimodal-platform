<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">铁路工作台</h2>
        <p class="page-subtitle">95306 需求车提报与受理回执（JT/T 1351 语义）</p>
      </div>
      <div class="page-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert
      title="流程：需求车提报（RAIL_DEMAND_APPLY）→ 95306 受理回执（RAIL_DEMAND_ACCEPT）→ 装车/到达；报文可在集成中心追溯"
      type="info"
      :closable="false"
      show-icon
      class="mb-16"
    />

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card table-card">
      <el-table v-loading="loading" :data="rows" size="small" border stripe>
        <el-table-column label="运单号" min-width="170">
          <template #default="{ row }">
            <router-link :to="`/waybills/${row.waybillId}`" class="row-link mono" data-testid="rail-task">
              {{ row.waybillNo }}
            </router-link>
          </template>
        </el-table-column>
        <el-table-column label="订单号" min-width="150">
          <template #default="{ row }">
            <span class="mono">{{ row.orderNo || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="发站 → 到站" min-width="230">
          <template #default="{ row }">{{ row.fromStation }} → {{ row.toStation }}</template>
        </el-table-column>
        <el-table-column label="箱数" width="70" align="right">
          <template #default="{ row }">{{ row.containerCount }}</template>
        </el-table-column>
        <el-table-column label="分段状态" width="110" align="center">
          <template #default="{ row }">
            <StatusTag kind="segment" :status="row.segmentStatus" :label="row.segmentStatusLabel" mode="RAIL" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="需求车状态" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="demandTagType(row.demandStatus)" size="small" effect="plain">
              {{ row.demandStatusLabel || railDemandStatusLabel(row.demandStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近报文" width="140">
          <template #default="{ row }">{{ formatDateTime(row.lastMessageAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="190" align="center">
          <template #default="{ row }">
            <PermissionGuard permission="rail:apply">
              <el-button
                size="small"
                type="primary"
                text
                data-testid="rail-apply"
                :disabled="!canApply(row as RailTask)"
                :loading="actingKey === `apply-${row.waybillId}`"
                @click="apply(row as RailTask)"
              >
                需求车提报
              </el-button>
              <el-button
                size="small"
                type="success"
                text
                data-testid="rail-confirm"
                :disabled="!confirmMessageId(row as RailTask)"
                :loading="actingKey === `confirm-${row.waybillId}`"
                @click="confirm(row as RailTask)"
              >
                确认回执
              </el-button>
            </PermissionGuard>
            <el-button size="small" text @click="goWaybill(row.waybillId)">运单</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无铁路运输任务" :image-size="70" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import PermissionGuard from '../components/PermissionGuard.vue';
import { applyRailDemand, confirmRailDemand, fetchRailTasks } from '../api/rail';
import { railDemandStatusLabel } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { RailTask } from '../types';

const router = useRouter();

const loading = ref(false);
const errorText = ref('');
const rows = ref<RailTask[]>([]);
const actingKey = ref('');
const messageIds = ref<Record<number, number>>({});

function demandTagType(status: string): 'success' | 'warning' | 'info' | 'danger' {
  if (['ACCEPTED', 'CONFIRMED'].includes(status)) return 'success';
  if (['PENDING', 'APPLIED'].includes(status)) return 'warning';
  if (['FAILED', 'REJECTED'].includes(status)) return 'danger';
  return 'info';
}

function canApply(task: RailTask): boolean {
  return !['PENDING', 'APPLIED', 'ACCEPTED', 'CONFIRMED'].includes(task.demandStatus);
}

function confirmMessageId(task: RailTask): number | null {
  // 仅本会话内已提报（报文 PENDING）或接口直接返回 messageId 时可确认回执
  return messageIds.value[task.waybillId] ?? task.messageId ?? null;
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    rows.value = await fetchRailTasks();
  } catch (error) {
    rows.value = [];
    errorText.value = error instanceof Error && error.message ? error.message : '铁路任务加载失败';
  } finally {
    loading.value = false;
  }
}

async function apply(task: RailTask): Promise<void> {
  actingKey.value = `apply-${task.waybillId}`;
  try {
    const result = await applyRailDemand(task.waybillId);
    messageIds.value = { ...messageIds.value, [task.waybillId]: result.messageId };
    ElMessage.success(`需求车提报成功：${result.msgNo}`);
    await load();
  } finally {
    actingKey.value = '';
  }
}

async function confirm(task: RailTask): Promise<void> {
  const messageId = confirmMessageId(task);
  if (!messageId) {
    ElMessage.warning('暂无可确认的提报报文，请先提报需求车');
    return;
  }
  actingKey.value = `confirm-${task.waybillId}`;
  try {
    const result = await confirmRailDemand(messageId);
    ElMessage.success(
      `95306 受理回执已接收${result.matchedCars ? `（承认车 ${result.matchedCars} 车）` : ''}`,
    );
    await load();
  } finally {
    actingKey.value = '';
  }
}

function goWaybill(id: number): void {
  void router.push(`/waybills/${id}`);
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

.table-card {
  padding-top: 14px;
}

.row-link {
  color: var(--app-primary);
}

.row-link:hover {
  text-decoration: underline;
}
</style>
