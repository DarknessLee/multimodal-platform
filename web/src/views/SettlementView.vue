<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">结算工作台</h2>
        <p class="page-subtitle">
          结算中心：{{ auth.displayName }} · 已签收订单可生成分段账单
        </p>
      </div>
      <div class="page-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="card stat-card">
        <div class="stat-card__label">待出账订单</div>
        <div class="stat-card__value">{{ pendingCount }}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-card__label">已出账订单</div>
        <div class="stat-card__value">{{ billedCount }}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-card__label">已出账总额（元）</div>
        <div class="stat-card__value amount">{{ formatAmount(billedTotal) }}</div>
      </div>
    </div>

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

    <div v-loading="loading" class="settle-list">
      <el-empty
        v-if="!loading && !errorText && cards.length === 0"
        description="暂无待出账/已出账订单"
      />

      <article
        v-for="card in cards"
        :key="card.order.id"
        class="card settle-card"
        data-testid="settle-card"
      >
        <div class="settle-card__head">
          <div class="settle-card__title">
            <router-link :to="`/orders/${card.order.id}`" class="mono settle-card__order-no">
              {{ card.order.orderNo }}
            </router-link>
            <StatusTag :status="card.order.status" :label="card.order.statusLabel" size="small" />
            <el-tag v-if="card.detail.bill" size="small" type="success" effect="plain">
              账单 {{ card.detail.bill.billNo }}
            </el-tag>
          </div>
          <div class="settle-card__actions">
            <el-button
              v-if="canSettle(card)"
              type="primary"
              size="small"
              data-testid="settle-btn"
              :loading="settlingId === card.order.id"
              @click="settle(card)"
            >
              生成账单
            </el-button>
            <el-button
              v-if="card.detail.bill"
              size="small"
              data-testid="view-bill-btn"
              @click="viewBill(card)"
            >
              查看账单
            </el-button>
            <el-button size="small" @click="viewOrder(card.order.id)">订单详情</el-button>
          </div>
        </div>

        <div class="settle-card__grid">
          <div class="settle-field">
            <span class="meta-label">货物</span>
            <span class="meta-value">{{ card.order.cargoName }} · {{ formatWeight(card.order.cargoWeight) }}</span>
          </div>
          <div class="settle-field">
            <span class="meta-label">箱型/箱量</span>
            <span class="meta-value">{{ card.order.containerType }} × {{ card.order.containerCount }}</span>
          </div>
          <div class="settle-field settle-field--wide">
            <span class="meta-label">路线</span>
            <span class="meta-value">{{ card.order.origin }} → {{ card.order.destination }}</span>
          </div>
          <div class="settle-field">
            <span class="meta-label">运单号</span>
            <span class="meta-value mono">{{ card.order.waybillNo || '—' }}</span>
          </div>
          <div class="settle-field">
            <span class="meta-label">签收人</span>
            <span class="meta-value">{{ card.detail.waybill?.signerName || '—' }}</span>
          </div>
          <div class="settle-field">
            <span class="meta-label">签收时间</span>
            <span class="meta-value">{{ formatDateTime(card.detail.waybill?.signedAt) }}</span>
          </div>
          <div class="settle-field">
            <span class="meta-label">账单状态</span>
            <span class="meta-value">{{ card.detail.bill?.statusLabel || '未出账' }}</span>
          </div>
          <div class="settle-field">
            <span class="meta-label">账单金额</span>
            <span class="meta-value amount">¥{{ formatAmount(card.amount) }}</span>
          </div>
        </div>

        <div class="settle-card__breakdown">
          <span
            v-for="segment in card.detail.segments"
            :key="segment.id"
            class="breakdown-chip"
            :class="`breakdown-chip--${segment.mode.toLowerCase()}`"
          >
            {{ segment.seq }}. {{ segment.modeLabel }} · {{ segment.carrierName }} · ¥{{ formatAmount(segment.costAmount) }}
          </span>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import { fetchOrderDetail, fetchOrders, settleOrder } from '../api';
import { useAuthStore } from '../stores/auth';
import { formatAmount, formatDateTime, formatWeight } from '../utils/format';
import type { OrderDetail, OrderListItem } from '../types';

interface SettleCard {
  order: OrderListItem;
  detail: OrderDetail;
  amount: number;
}

const router = useRouter();
const auth = useAuthStore();

const cards = ref<SettleCard[]>([]);
const loading = ref(false);
const errorText = ref('');
const settlingId = ref<number | null>(null);

const pendingCount = computed(() => cards.value.filter((card) => !card.detail.bill).length);
const billedCount = computed(() => cards.value.filter((card) => Boolean(card.detail.bill)).length);
const billedTotal = computed(() =>
  cards.value.reduce((sum, card) => sum + (card.detail.bill?.totalAmount ?? 0), 0),
);

function canSettle(card: SettleCard): boolean {
  return card.order.status === 'SIGNED' && !card.detail.bill;
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const orders = await fetchOrders();
    const detailList = await Promise.all(
      orders.map(async (order) => ({ order, detail: await fetchOrderDetail(order.id) })),
    );
    cards.value = detailList.map((item) => ({
      order: item.order,
      detail: item.detail,
      amount:
        item.detail.bill?.totalAmount ??
        item.detail.segments.reduce((sum, segment) => sum + segment.costAmount, 0),
    }));
  } catch (error) {
    cards.value = [];
    errorText.value = error instanceof Error && error.message ? error.message : '结算数据加载失败，请重试';
  } finally {
    loading.value = false;
  }
}

async function settle(card: SettleCard): Promise<void> {
  settlingId.value = card.order.id;
  try {
    const data = await settleOrder(card.order.id);
    ElMessage.success(
      `出账成功：${data.bill.billNo}，合计 ¥${formatAmount(data.bill.totalAmount)}`,
    );
    await load();
  } finally {
    settlingId.value = null;
  }
}

function viewBill(card: SettleCard): void {
  const bill = card.detail.bill;
  if (!bill) return;
  void router.push(`/bills/${bill.id}`);
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

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  margin-top: 0;
}

.stat-card__label {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.stat-card__value {
  margin-top: 8px;
  font-size: 26px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.settle-list {
  min-height: 160px;
}

.settle-card + .settle-card {
  margin-top: 14px;
}

.settle-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--app-border);
}

.settle-card__title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.settle-card__order-no {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.settle-card__order-no:hover {
  color: var(--app-primary);
}

.settle-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.settle-card__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px 18px;
  padding-top: 12px;
}

.settle-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.settle-field--wide {
  grid-column: span 2;
}

.settle-card__breakdown {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--app-border);
}

.breakdown-chip {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #f4f6f9;
  color: var(--app-text-regular);
}

.breakdown-chip--road {
  background: #ecf5ff;
  color: #337ecc;
}

.breakdown-chip--sea {
  background: #e6fffb;
  color: #08979c;
}

.breakdown-chip--rail {
  background: #fff7e6;
  color: #ad6800;
}

@media (max-width: 1100px) {
  .stat-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .settle-card__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
