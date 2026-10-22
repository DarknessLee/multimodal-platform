<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">订单列表</h2>
        <p class="page-subtitle">
          当前角色：{{ auth.roleLabel }} · 共 {{ orders.length }} 票订单
          <span v-if="loading" class="muted">（加载中…）</span>
        </p>
      </div>
      <div class="page-actions">
        <el-button v-if="auth.role === 'SHIPPER'" type="primary" data-testid="create-order-btn" @click="goCreate">
          新建订单
        </el-button>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="card filter-bar">
      <el-select
        v-model="filterStatus"
        placeholder="全部状态"
        clearable
        style="width: 150px"
        @change="load"
      >
        <el-option
          v-for="option in ORDER_STATUS_OPTIONS"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
      <el-input
        v-model="keyword"
        placeholder="搜索订单号 / 货物 / 起讫地"
        clearable
        style="width: 300px"
        @keyup.enter="load"
        @clear="load"
      />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button @click="resetFilter">重置</el-button>
      <span class="muted filter-tip">列表按当前角色自动过滤</span>
    </div>

    <el-alert
      v-if="errorText"
      :title="errorText"
      type="error"
      :closable="false"
      show-icon
      class="mb-12"
    >
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div v-loading="loading" class="order-list">
      <el-empty v-if="!loading && !errorText && orders.length === 0" description="暂无订单数据" />

      <article v-for="order in orders" :key="order.id" class="card order-row" data-testid="order-row">
        <div class="order-row__head">
          <div class="order-row__no">
            <router-link :to="`/orders/${order.id}`" class="mono order-no" data-testid="order-no">
              {{ order.orderNo }}
            </router-link>
            <StatusTag
              data-testid="order-status"
              :status="order.status"
              :label="order.statusLabel"
              size="small"
            />
          </div>
          <div class="order-row__actions">
            <el-button size="small" @click="goDetail(order.id)">查看详情</el-button>
            <el-button
              v-if="canDispatch(order)"
              size="small"
              type="primary"
              data-testid="dispatch-btn"
              @click="goDispatch(order.id)"
            >
              人工调度
            </el-button>
            <el-button
              v-if="order.waybillId"
              size="small"
              data-testid="track-btn"
              @click="goTrack(order.waybillId)"
            >
              运单跟踪
            </el-button>
          </div>
        </div>

        <div class="order-row__grid">
          <div class="order-field">
            <span class="meta-label">货物</span>
            <span class="meta-value">{{ order.cargoName }} · {{ formatWeight(order.cargoWeight) }}</span>
          </div>
          <div class="order-field">
            <span class="meta-label">箱型/箱量</span>
            <span class="meta-value">{{ order.containerType }} × {{ order.containerCount }}</span>
          </div>
          <div class="order-field order-field--wide">
            <span class="meta-label">路线</span>
            <span class="meta-value">{{ order.origin }} → {{ order.destination }}</span>
          </div>
          <div class="order-field">
            <span class="meta-label">要求提货日</span>
            <span class="meta-value">{{ formatDate(order.requiredPickupDate) }}</span>
          </div>
          <div class="order-field">
            <span class="meta-label">货主</span>
            <span class="meta-value">{{ order.shipperName }}</span>
          </div>
          <div class="order-field">
            <span class="meta-label">运单</span>
            <span class="meta-value mono">{{ order.waybillNo || '—' }}</span>
          </div>
          <div class="order-field">
            <span class="meta-label">当前分段</span>
            <span class="meta-value">
              <template v-if="order.currentSegment">
                {{ order.currentSegment.seq }}. {{ order.currentSegment.modeLabel }}
                · {{ order.currentSegment.statusLabel }}
              </template>
              <template v-else>—</template>
            </span>
          </div>
          <div class="order-field">
            <span class="meta-label">账单</span>
            <span class="meta-value mono">
              <router-link v-if="order.billId" :to="`/bills/${order.billId}`">
                {{ order.billNo || `账单 #${order.billId}` }}
              </router-link>
              <template v-else>—</template>
            </span>
          </div>
          <div class="order-field">
            <span class="meta-label">创建时间</span>
            <span class="meta-value">{{ formatDateTime(order.createdAt) }}</span>
          </div>
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
import { fetchOrders } from '../api';
import { useAuthStore } from '../stores/auth';
import { ORDER_STATUS_OPTIONS } from '../utils/constants';
import { formatDate, formatDateTime, formatWeight } from '../utils/format';
import type { OrderListItem } from '../types';

const router = useRouter();
const auth = useAuthStore();

const orders = ref<OrderListItem[]>([]);
const loading = ref(false);
const errorText = ref('');
const filterStatus = ref('');
const keyword = ref('');

function canDispatch(order: OrderListItem): boolean {
  return auth.role === 'MTO' && order.status === 'CREATED';
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const params: { status?: string; keyword?: string } = {};
    if (filterStatus.value) params.status = filterStatus.value;
    if (keyword.value.trim()) params.keyword = keyword.value.trim();
    orders.value = await fetchOrders(params);
  } catch (error) {
    orders.value = [];
    errorText.value = error instanceof Error && error.message ? error.message : '订单加载失败，请重试';
  } finally {
    loading.value = false;
  }
}

function resetFilter(): void {
  filterStatus.value = '';
  keyword.value = '';
  void load();
}

function goCreate(): void {
  void router.push('/orders/new');
}

function goDetail(orderId: number): void {
  void router.push(`/orders/${orderId}`);
}

function goDispatch(orderId: number): void {
  void router.push(`/orders/${orderId}/dispatch`);
}

function goTrack(waybillId: number | null): void {
  if (!waybillId) {
    ElMessage.warning('该订单暂未生成运单');
    return;
  }
  void router.push(`/waybills/${waybillId}`);
}

onMounted(load);
</script>

<style scoped>
.mb-12 {
  margin-bottom: 12px;
}

.filter-tip {
  margin-left: auto;
  font-size: 12px;
}

.retry-btn {
  margin-top: 6px;
}

.order-list {
  min-height: 160px;
}

.order-row {
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.order-row:hover {
  border-color: #c6e2ff;
  box-shadow: 0 4px 14px rgba(64, 158, 255, 0.08);
}

.order-row__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--app-border);
}

.order-row__no {
  display: flex;
  align-items: center;
  gap: 10px;
}

.order-no {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  letter-spacing: 0.4px;
}

.order-no:hover {
  color: var(--app-primary);
}

.order-row__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.order-row__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px 18px;
  padding-top: 12px;
}

.order-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.order-field--wide {
  grid-column: span 2;
}

.order-field .meta-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .order-row__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
