<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">我的运输任务</h2>
        <p class="page-subtitle">
          公路承运人：{{ auth.displayName }} · 待办任务 {{ tasks.length }} 项
        </p>
      </div>
      <div class="page-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert
      title="任务流程：接单 → 已提货（进入运输中）→ 已送达（公路段完成，交由港站作业）"
      type="info"
      :closable="false"
      show-icon
      class="mb-16"
    />

    <el-alert
      v-if="errorText"
      :title="errorText"
      type="error"
      :closable="false"
      show-icon
      class="mb-16"
    >
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div v-loading="loading" class="task-list">
      <el-empty
        v-if="!loading && !errorText && tasks.length === 0"
        description="暂无待处理的运输任务"
      />

      <article v-for="task in tasks" :key="task.segment.id" class="card task-card" data-testid="task-card">
        <div class="task-card__head">
          <div class="task-card__title">
            <router-link :to="`/orders/${task.order.id}`" class="mono task-card__order-no">
              {{ task.order.orderNo }}
            </router-link>
            <el-tag size="small" effect="plain">公路段</el-tag>
            <StatusTag
              data-testid="task-status"
              kind="segment"
              :status="task.segment.status"
              :label="task.segment.statusLabel"
              :mode="task.segment.mode"
              size="small"
            />
          </div>
          <div class="task-card__actions">
            <el-button
              v-if="task.segment.status === 'PENDING'"
              type="primary"
              size="small"
              data-testid="task-accept"
              :loading="actingId === task.segment.id"
              @click="act(task, 'ACCEPT')"
            >
              接单
            </el-button>
            <el-button
              v-if="task.segment.status === 'ACCEPTED'"
              type="primary"
              size="small"
              data-testid="task-depart"
              :loading="actingId === task.segment.id"
              @click="act(task, 'DEPART')"
            >
              已提货
            </el-button>
            <el-button
              v-if="task.segment.status === 'IN_TRANSIT'"
              type="success"
              size="small"
              data-testid="task-arrive"
              :loading="actingId === task.segment.id"
              @click="act(task, 'ARRIVE')"
            >
              已送达
            </el-button>
            <el-button size="small" @click="viewOrder(task.order.id)">订单详情</el-button>
          </div>
        </div>

        <div class="task-card__grid">
          <div class="task-field">
            <span class="meta-label">货物</span>
            <span class="meta-value">{{ task.order.cargoName }} · {{ formatWeight(task.order.cargoWeight) }}</span>
          </div>
          <div class="task-field">
            <span class="meta-label">箱型/箱量</span>
            <span class="meta-value">{{ task.order.containerType }} × {{ task.order.containerCount }}</span>
          </div>
          <div class="task-field task-field--wide">
            <span class="meta-label">运输节点</span>
            <span class="meta-value">{{ task.segment.startNode }} → {{ task.segment.endNode }}</span>
          </div>
          <div class="task-field">
            <span class="meta-label">计划发车</span>
            <span class="meta-value">{{ formatDateTime(task.segment.plannedStart) }}</span>
          </div>
          <div class="task-field">
            <span class="meta-label">计划到达</span>
            <span class="meta-value">{{ formatDateTime(task.segment.plannedEnd) }}</span>
          </div>
          <div class="task-field">
            <span class="meta-label">实际发车</span>
            <span class="meta-value">{{ formatDateTime(task.segment.actualStart) }}</span>
          </div>
          <div class="task-field">
            <span class="meta-label">实际到达</span>
            <span class="meta-value">{{ formatDateTime(task.segment.actualEnd) }}</span>
          </div>
          <div class="task-field">
            <span class="meta-label">承运费用</span>
            <span class="meta-value amount">¥{{ formatAmount(task.segment.costAmount) }}</span>
          </div>
          <div class="task-field">
            <span class="meta-label">运单号</span>
            <span class="meta-value mono">{{ task.order.waybillNo || '—' }}</span>
          </div>
        </div>

        <div class="task-card__hint muted">
          <template v-if="task.segment.status === 'PENDING'">点击「接单」确认承接该公路段运输。</template>
          <template v-else-if="task.segment.status === 'ACCEPTED'">
            已接单，点击「已提货」上报实际发车（订单/运单进入运输中）。
          </template>
          <template v-else>
            运输中，点击「已送达」完成公路段，随后由港站确认进场。
          </template>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import { fetchOrderDetail, fetchOrders, updateSegmentStatus } from '../api';
import { useAuthStore } from '../stores/auth';
import { formatAmount, formatDateTime, formatWeight } from '../utils/format';
import type { OrderListItem, Segment, SegmentAction } from '../types';

interface CarrierTask {
  order: OrderListItem;
  segment: Segment;
}

const router = useRouter();
const auth = useAuthStore();

const tasks = ref<CarrierTask[]>([]);
const loading = ref(false);
const errorText = ref('');
const actingId = ref<number | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const orders = await fetchOrders();
    const withWaybill = orders.filter((order) => Boolean(order.waybillId));
    const detailList = await Promise.all(
      withWaybill.map(async (order) => ({ order, detail: await fetchOrderDetail(order.id) })),
    );
    const myUserId = auth.user?.id;
    const collected: CarrierTask[] = [];
    for (const item of detailList) {
      for (const segment of item.detail.segments) {
        if (segment.mode !== 'ROAD') continue;
        if (segment.carrierUserId !== myUserId) continue;
        if (segment.status === 'COMPLETED') continue;
        collected.push({ order: item.order, segment });
      }
    }
    collected.sort((a, b) => a.order.id - b.order.id || a.segment.seq - b.segment.seq);
    tasks.value = collected;
  } catch (error) {
    tasks.value = [];
    errorText.value = error instanceof Error && error.message ? error.message : '任务加载失败，请重试';
  } finally {
    loading.value = false;
  }
}

async function act(task: CarrierTask, action: SegmentAction): Promise<void> {
  const actionLabel = action === 'ACCEPT' ? '接单' : action === 'DEPART' ? '已提货' : '已送达';
  actingId.value = task.segment.id;
  try {
    const result = await updateSegmentStatus(task.segment.id, { action });
    ElMessage.success(
      `${actionLabel}成功：${result.segment.statusLabel}（订单 ${result.orderStatus} / 运单 ${result.waybillStatus}）`,
    );
    await load();
  } finally {
    actingId.value = null;
  }
}

function viewOrder(orderId: number): void {
  void router.push(`/orders/${orderId}`);
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

.task-list {
  min-height: 160px;
}

.task-card + .task-card {
  margin-top: 14px;
}

.task-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--app-border);
}

.task-card__title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.task-card__order-no {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.task-card__order-no:hover {
  color: var(--app-primary);
}

.task-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.task-card__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px 18px;
  padding-top: 12px;
}

.task-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.task-field--wide {
  grid-column: span 2;
}

.task-card__hint {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--app-border);
  font-size: 12px;
}

@media (max-width: 1100px) {
  .task-card__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
