<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">订单中心</h2>
        <p class="page-subtitle">
          当前角色：{{ auth.roleLabel }} · 共 {{ orders.length }} 票订单
          <span v-if="loading" class="muted">（加载中…）</span>
        </p>
      </div>
      <div class="page-actions">
        <PermissionGuard permission="order:create">
          <el-button type="primary" data-testid="create-order-btn" @click="goCreate">新建订单</el-button>
        </PermissionGuard>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert v-if="viewHint" :title="viewHint" type="info" :closable="false" show-icon class="mb-16" />

    <div class="card filter-bar">
      <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width: 140px" @change="load">
        <el-option v-for="option in ORDER_STATUS_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-select v-model="filterType" placeholder="全部订单类型" clearable style="width: 150px" @change="load">
        <el-option v-for="option in ORDER_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-select v-model="filterSource" placeholder="全部来源" clearable style="width: 130px" @change="load">
        <el-option v-for="option in SOURCE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-select
        v-if="canFilterCustomer"
        v-model="filterCustomer"
        placeholder="全部客户"
        clearable
        filterable
        style="width: 190px"
        @change="load"
      >
        <el-option v-for="customer in customers" :key="customer.id" :label="customer.name" :value="customer.id" />
      </el-select>
      <el-input
        v-model="keyword"
        placeholder="搜索订单号 / 货物 / 起讫地"
        clearable
        style="width: 240px"
        @keyup.enter="load"
        @clear="load"
      />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button @click="resetFilter">重置</el-button>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div v-loading="loading" class="order-list">
      <el-empty v-if="!loading && !errorText && visibleOrders.length === 0" description="暂无订单数据" />

      <article v-for="order in visibleOrders" :key="order.id" class="card order-row" data-testid="order-row">
        <div class="order-row__head">
          <div class="order-row__no">
            <router-link :to="`/orders/${order.id}`" class="mono order-no" data-testid="order-no">
              {{ order.orderNo }}
            </router-link>
            <StatusTag data-testid="order-status" :status="order.status" :label="order.statusLabel" size="small" />
            <el-tag size="small" effect="plain" data-testid="order-type">
              {{ order.orderTypeLabel || orderTypeLabel(order.orderType) }}
            </el-tag>
            <el-tag size="small" effect="plain" type="success" data-testid="order-source">
              {{ order.sourceLabel || sourceLabel(order.source) }}
            </el-tag>
            <el-tag v-if="order.priority === 'URGENT'" size="small" type="warning" effect="dark">加急</el-tag>
          </div>
          <div class="order-row__actions">
            <el-button size="small" @click="goDetail(order.id)">查看详情</el-button>
            <PermissionGuard permission="order:dispatch">
              <el-button
                v-if="canDispatch(order)"
                size="small"
                type="primary"
                data-testid="dispatch-btn"
                @click="goDispatch(order.id)"
              >
                人工调度
              </el-button>
            </PermissionGuard>
            <el-button
              v-if="order.waybillId"
              size="small"
              data-testid="track-btn"
              @click="goTrack(order.waybillId)"
            >
              运单跟踪
            </el-button>
            <PermissionGuard permission="order:cancel">
              <el-button
                v-if="canCancel(order)"
                size="small"
                type="danger"
                plain
                data-testid="order-cancel-btn"
                :loading="cancellingId === order.id"
                @click="cancel(order)"
              >
                取消订单
              </el-button>
            </PermissionGuard>
          </div>
        </div>

        <div class="order-row__grid">
          <div class="order-field">
            <span class="meta-label">客户</span>
            <span class="meta-value">{{ order.customerName || order.shipperName }}</span>
          </div>
          <div class="order-field">
            <span class="meta-label">货物</span>
            <span class="meta-value">{{ order.cargoName }} · {{ formatWeight(order.cargoWeight) }}</span>
          </div>
          <div class="order-field">
            <span class="meta-label">箱型/箱量</span>
            <span class="meta-value">{{ order.containerType }} × {{ order.containerCount }}</span>
          </div>
          <div class="order-field">
            <span class="meta-label">订单金额</span>
            <span class="meta-value amount">¥{{ formatAmount(order.totalAmount ?? 0) }}</span>
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
            <span class="meta-label">运单</span>
            <span class="meta-value mono">{{ order.waybillNo || '—' }}</span>
          </div>
          <div class="order-field">
            <span class="meta-label">当前分段</span>
            <span class="meta-value">
              <template v-if="order.currentSegment">
                {{ order.currentSegment.seq }}. {{ order.currentSegment.modeLabel }} ·
                {{ order.currentSegment.statusLabel }}
              </template>
              <template v-else>—</template>
            </span>
          </div>
          <div class="order-field">
            <span class="meta-label">报价单</span>
            <span class="meta-value mono">
              <router-link v-if="order.quoteId" :to="`/quotes/${order.quoteId}`" data-testid="order-quote-link">
                {{ order.quoteNo || `#${order.quoteId}` }}
              </router-link>
              <template v-else>—</template>
            </span>
          </div>
          <div class="order-field">
            <span class="meta-label">合同</span>
            <span class="meta-value mono">
              <router-link v-if="order.contractId" :to="`/contracts/${order.contractId}`" data-testid="order-contract-link">
                {{ order.contractNo || `#${order.contractId}` }}
              </router-link>
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
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import PermissionGuard from '../components/PermissionGuard.vue';
import { cancelOrder, fetchOrders } from '../api';
import { fetchCustomers } from '../api/master';
import { useAuthStore } from '../stores/auth';
import {
  ORDER_STATUS_OPTIONS,
  ORDER_TYPE_OPTIONS,
  SOURCE_OPTIONS,
  orderTypeLabel,
  sourceLabel,
} from '../utils/constants';
import { formatAmount, formatDate, formatDateTime, formatWeight } from '../utils/format';
import type { Customer, OrderListItem } from '../types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const orders = ref<OrderListItem[]>([]);
const loading = ref(false);
const errorText = ref('');
const cancellingId = ref<number | null>(null);
const filterStatus = ref('');
const filterType = ref('');
const filterSource = ref('');
const filterCustomer = ref<number | null>(null);
const keyword = ref('');
const customers = ref<Customer[]>([]);

const canFilterCustomer = computed(() => auth.hasPermission('menu:customers'));

const viewMode = computed(() => String(route.query.view ?? ''));

const visibleOrders = computed<OrderListItem[]>(() => {
  let list = orders.value;
  if (viewMode.value === 'dispatch') {
    list = list.filter((order) => ['CREATED', 'CONTRACTED', 'CONFIRMED'].includes(order.status));
  } else if (viewMode.value === 'track') {
    list = list.filter((order) => Boolean(order.waybillId));
  } else if (viewMode.value === 'bills') {
    list = list.filter((order) => Boolean(order.billId));
  }
  return list;
});

const viewHint = computed(() => {
  if (viewMode.value === 'dispatch') {
    return '调度中心视图：仅显示待调度（待调度 / 已签合同 / 已确认）的订单，可进入人工调度。';
  }
  if (viewMode.value === 'track') {
    return '运单跟踪视图：仅显示已生成运单的订单，点击「运单跟踪」查看全程轨迹。';
  }
  if (viewMode.value === 'bills') {
    return '账单中心视图：仅显示已出账订单，点击账单号查看分段账单。';
  }
  return '';
});

function canDispatch(order: OrderListItem): boolean {
  return ['CREATED', 'CONTRACTED', 'CONFIRMED'].includes(order.status);
}

function canCancel(order: OrderListItem): boolean {
  return ['CREATED', 'CONTRACTED', 'CONFIRMED'].includes(order.status);
}

async function loadCustomers(): Promise<void> {
  if (!canFilterCustomer.value) return;
  try {
    const data = await fetchCustomers({ page: 1, pageSize: 100 });
    customers.value = data.list;
  } catch {
    customers.value = [];
  }
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    orders.value = await fetchOrders({
      status: filterStatus.value || undefined,
      orderType: filterType.value || undefined,
      source: filterSource.value || undefined,
      customerId: filterCustomer.value ?? undefined,
      keyword: keyword.value.trim() || undefined,
    });
  } catch (error) {
    orders.value = [];
    errorText.value = error instanceof Error && error.message ? error.message : '订单加载失败，请重试';
  } finally {
    loading.value = false;
  }
}

function resetFilter(): void {
  filterStatus.value = '';
  filterType.value = '';
  filterSource.value = '';
  filterCustomer.value = null;
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
  void router.push(`/waybills/${waybillId}/track`);
}

async function cancel(order: OrderListItem): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认取消订单 ${order.orderNo}？取消后不可恢复。`,
      '取消订单',
      { confirmButtonText: '确认取消', cancelButtonText: '再想想', type: 'warning' },
    );
  } catch {
    return;
  }
  cancellingId.value = order.id;
  try {
    await cancelOrder(order.id);
    ElMessage.success(`订单 ${order.orderNo} 已取消`);
    await load();
  } finally {
    cancellingId.value = null;
  }
}

onMounted(() => {
  void loadCustomers();
  void load();
});
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
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
  flex-wrap: wrap;
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
