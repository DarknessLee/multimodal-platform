<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">水路工作台</h2>
        <p class="page-subtitle">订舱与订舱确认（港口 EDI：SEA_BOOKING / SEA_BOOKING_CONFIRM）</p>
      </div>
      <div class="page-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert
      title="流程：订舱（SEA_BOOKING）→ 船公司确认回执（SEA_BOOKING_CONFIRM）→ 装船/到港；报文可在集成中心追溯"
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
            <router-link :to="`/waybills/${row.waybillId}`" class="row-link mono" data-testid="sea-task">
              {{ row.waybillNo }}
            </router-link>
          </template>
        </el-table-column>
        <el-table-column label="订单号" min-width="150">
          <template #default="{ row }">
            <span class="mono">{{ row.orderNo || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="起运港 → 目的港" min-width="230">
          <template #default="{ row }">{{ row.fromPort }} → {{ row.toPort }}</template>
        </el-table-column>
        <el-table-column label="箱数" width="70" align="right">
          <template #default="{ row }">{{ row.containerCount }}</template>
        </el-table-column>
        <el-table-column label="分段状态" width="110" align="center">
          <template #default="{ row }">
            <StatusTag kind="segment" :status="row.segmentStatus" :label="row.segmentStatusLabel" mode="SEA" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="订舱状态" width="116" align="center">
          <template #default="{ row }">
            <el-tag :type="bookingTagType(row.bookingStatus)" size="small" effect="plain">
              {{ row.bookingStatusLabel || seaBookingStatusLabel(row.bookingStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近报文" width="140">
          <template #default="{ row }">{{ formatDateTime(row.lastMessageAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="center">
          <template #default="{ row }">
            <PermissionGuard permission="sea:book">
              <el-button
                size="small"
                type="primary"
                text
                data-testid="sea-book"
                :disabled="!canBook(row as SeaTask)"
                :loading="actingKey === `book-${row.waybillId}`"
                @click="book(row as SeaTask)"
              >
                订舱
              </el-button>
              <el-button
                size="small"
                type="success"
                text
                data-testid="sea-confirm"
                :disabled="!confirmMessageId(row as SeaTask)"
                :loading="actingKey === `confirm-${row.waybillId}`"
                @click="confirm(row as SeaTask)"
              >
                确认回执
              </el-button>
            </PermissionGuard>
            <el-button size="small" text @click="goWaybill(row.waybillId)">运单</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无水路运输任务" :image-size="70" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import PermissionGuard from '../components/PermissionGuard.vue';
import { bookSea, confirmSeaBooking, fetchSeaTasks } from '../api/sea';
import { seaBookingStatusLabel } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { SeaTask } from '../types';

const router = useRouter();

const loading = ref(false);
const errorText = ref('');
const rows = ref<SeaTask[]>([]);
const actingKey = ref('');
const messageIds = ref<Record<number, number>>({});

function bookingTagType(status: string): 'success' | 'warning' | 'info' | 'danger' {
  if (['BOOKED', 'CONFIRMED'].includes(status)) return 'success';
  if (['PENDING'].includes(status)) return 'warning';
  if (['FAILED'].includes(status)) return 'danger';
  return 'info';
}

function canBook(task: SeaTask): boolean {
  return ['NOT_BOOKED', 'NONE'].includes(task.bookingStatus);
}

function confirmMessageId(task: SeaTask): number | null {
  // 仅本会话内已订舱（接口返回 messageId）时可确认回执
  return messageIds.value[task.waybillId] ?? task.messageId ?? null;
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    rows.value = await fetchSeaTasks();
  } catch (error) {
    rows.value = [];
    errorText.value = error instanceof Error && error.message ? error.message : '水路任务加载失败';
  } finally {
    loading.value = false;
  }
}

async function book(task: SeaTask): Promise<void> {
  actingKey.value = `book-${task.waybillId}`;
  try {
    const result = await bookSea(task.waybillId);
    messageIds.value = { ...messageIds.value, [task.waybillId]: result.messageId };
    ElMessage.success(`订舱报文已发送：${result.msgNo}`);
    await load();
  } finally {
    actingKey.value = '';
  }
}

async function confirm(task: SeaTask): Promise<void> {
  const messageId = confirmMessageId(task);
  if (!messageId) {
    ElMessage.warning('暂无可确认的订舱报文，请先订舱');
    return;
  }
  actingKey.value = `confirm-${task.waybillId}`;
  try {
    const result = await confirmSeaBooking(messageId);
    ElMessage.success(
      `订舱确认回执已接收${result.vesselName ? `（${result.vesselName} ${result.voyageNo || ''}）` : ''}`,
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
