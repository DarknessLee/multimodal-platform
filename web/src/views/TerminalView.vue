<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">港站作业</h2>
        <p class="page-subtitle">
          港站/操作员：{{ auth.displayName }} · 待办作业 {{ tasks.length }} 项
        </p>
      </div>
      <div class="page-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert
      title="作业流程：确认进场（可录箱况）→ 到港/到站，海运段、铁路段按顺序依次推进"
      type="info"
      :closable="false"
      show-icon
      class="mb-16"
    />

    <div class="card condition-bar">
      <div class="condition-bar__label">进场箱况</div>
      <el-select
        v-model="conditionText"
        data-testid="terminal-condition-select"
        placeholder="选择箱况"
        style="width: 280px"
      >
        <el-option v-for="option in CONDITION_OPTIONS" :key="option" :label="option" :value="option" />
      </el-select>
      <span class="muted condition-bar__tip">确认进场时写入集装箱档案与 EDI 轨迹</span>
    </div>

    <el-alert
      v-if="errorText"
      :title="errorText"
      type="error"
      :closable="false"
      show-icon
      class="mb-16 mt-12"
    >
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div v-loading="loading" class="terminal-list">
      <el-empty
        v-if="!loading && !errorText && tasks.length === 0"
        description="暂无待处理的港站作业"
      />

      <article
        v-for="task in tasks"
        :key="task.segment.id"
        class="card terminal-card"
        data-testid="terminal-card"
      >
        <div class="terminal-card__head">
          <div class="terminal-card__title">
            <router-link :to="`/orders/${task.order.id}`" class="mono terminal-card__order-no">
              {{ task.order.orderNo }}
            </router-link>
            <el-tag size="small" :type="task.segment.mode === 'SEA' ? 'primary' : 'warning'" effect="plain">
              {{ task.segment.modeLabel }}
            </el-tag>
            <StatusTag
              data-testid="terminal-status"
              kind="segment"
              :status="task.segment.status"
              :label="task.segment.statusLabel"
              :mode="task.segment.mode"
              size="small"
            />
          </div>
          <div class="terminal-card__actions">
            <el-button
              v-if="task.action === 'GATE_IN'"
              type="primary"
              size="small"
              data-testid="terminal-gate-in"
              :loading="actingId === task.segment.id"
              @click="act(task, 'GATE_IN')"
            >
              确认进场
            </el-button>
            <el-button
              v-if="task.action === 'ARRIVE'"
              type="success"
              size="small"
              data-testid="terminal-arrive"
              :loading="actingId === task.segment.id"
              @click="act(task, 'ARRIVE')"
            >
              {{ task.segment.mode === 'SEA' ? '确认到港' : '确认到站' }}
            </el-button>
            <el-button size="small" @click="viewOrder(task.order.id)">订单详情</el-button>
          </div>
        </div>

        <div class="terminal-card__grid">
          <div class="terminal-field">
            <span class="meta-label">货物</span>
            <span class="meta-value">{{ task.order.cargoName }} · {{ formatWeight(task.order.cargoWeight) }}</span>
          </div>
          <div class="terminal-field">
            <span class="meta-label">箱型/箱量</span>
            <span class="meta-value">{{ task.order.containerType }} × {{ task.order.containerCount }}</span>
          </div>
          <div class="terminal-field terminal-field--wide">
            <span class="meta-label">作业节点</span>
            <span class="meta-value">{{ task.segment.startNode }} → {{ task.segment.endNode }}</span>
          </div>
          <div class="terminal-field">
            <span class="meta-label">承运商</span>
            <span class="meta-value">{{ task.segment.carrierName }}</span>
          </div>
          <div class="terminal-field">
            <span class="meta-label">计划开始</span>
            <span class="meta-value">{{ formatDateTime(task.segment.plannedStart) }}</span>
          </div>
          <div class="terminal-field">
            <span class="meta-label">计划到达</span>
            <span class="meta-value">{{ formatDateTime(task.segment.plannedEnd) }}</span>
          </div>
          <div class="terminal-field">
            <span class="meta-label">实际开始</span>
            <span class="meta-value">{{ formatDateTime(task.segment.actualStart) }}</span>
          </div>
          <div class="terminal-field">
            <span class="meta-label">实际到达</span>
            <span class="meta-value">{{ formatDateTime(task.segment.actualEnd) }}</span>
          </div>
          <div class="terminal-field">
            <span class="meta-label">箱况</span>
            <span class="meta-value">
              {{ task.containers.map((item) => item.conditionText).filter(Boolean).join('；') || '—' }}
            </span>
          </div>
        </div>

        <div class="terminal-card__hint muted">
          <template v-if="task.action === 'GATE_IN'">
            点击「确认进场」：{{ task.segment.startNode }} 进场，将录入箱况「{{ conditionText }}」并追加 EDI/港站轨迹。
          </template>
          <template v-else>
            点击「{{ task.segment.mode === 'SEA' ? '确认到港' : '确认到站' }}」：完成{{ task.segment.modeLabel }}段，
            系统自动追加到达轨迹，铁路段完成后订单进入「已到达」。
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
import { CONDITION_OPTIONS } from '../utils/constants';
import { formatDateTime, formatWeight } from '../utils/format';
import type { ContainerInfo, OrderListItem, Segment, SegmentAction } from '../types';

type TerminalAction = 'GATE_IN' | 'ARRIVE';

interface TerminalTask {
  order: OrderListItem;
  segment: Segment;
  containers: ContainerInfo[];
  action: TerminalAction;
}

const router = useRouter();
const auth = useAuthStore();

const tasks = ref<TerminalTask[]>([]);
const loading = ref(false);
const errorText = ref('');
const actingId = ref<number | null>(null);
const conditionText = ref(CONDITION_OPTIONS[0]);

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const orders = await fetchOrders();
    const withWaybill = orders.filter((order) => Boolean(order.waybillId));
    const detailList = await Promise.all(
      withWaybill.map(async (order) => ({ order, detail: await fetchOrderDetail(order.id) })),
    );
    const collected: TerminalTask[] = [];
    for (const item of detailList) {
      const segments = item.detail.segments;
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (segment.mode === 'ROAD') continue;
        if (segment.status === 'IN_TRANSIT') {
          collected.push({ order: item.order, segment, containers: item.detail.containers, action: 'ARRIVE' });
          continue;
        }
        if (segment.status === 'PENDING') {
          const previous = segments[index - 1];
          if (!previous || previous.status === 'COMPLETED') {
            collected.push({ order: item.order, segment, containers: item.detail.containers, action: 'GATE_IN' });
          }
        }
      }
    }
    // 最新订单优先，便于演示与 E2E 定位
    collected.sort((a, b) => b.order.id - a.order.id || a.segment.seq - b.segment.seq);
    tasks.value = collected;
  } catch (error) {
    tasks.value = [];
    errorText.value = error instanceof Error && error.message ? error.message : '港站作业加载失败，请重试';
  } finally {
    loading.value = false;
  }
}

async function act(task: TerminalTask, action: SegmentAction): Promise<void> {
  actingId.value = task.segment.id;
  try {
    const payload = action === 'GATE_IN'
      ? { action, conditionText: conditionText.value }
      : { action };
    const result = await updateSegmentStatus(task.segment.id, payload);
    const actionLabel = action === 'GATE_IN' ? '进场确认' : task.segment.mode === 'SEA' ? '到港确认' : '到站确认';
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

.mt-12 {
  margin-top: 12px;
}

.retry-btn {
  margin-top: 6px;
}

.condition-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.condition-bar__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-regular);
}

.condition-bar__tip {
  font-size: 12px;
  margin-left: auto;
}

.terminal-list {
  min-height: 160px;
}

.terminal-card + .terminal-card {
  margin-top: 14px;
}

.terminal-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--app-border);
}

.terminal-card__title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.terminal-card__order-no {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.terminal-card__order-no:hover {
  color: var(--app-primary);
}

.terminal-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.terminal-card__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px 18px;
  padding-top: 12px;
}

.terminal-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.terminal-field--wide {
  grid-column: span 2;
}

.terminal-card__hint {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--app-border);
  font-size: 12px;
  line-height: 1.7;
}

@media (max-width: 1100px) {
  .terminal-card__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
