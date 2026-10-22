<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">订单详情</h2>
        <p v-if="detail" class="page-subtitle">
          订单号 <span class="mono">{{ detail.order.orderNo }}</span>
          · 创建于 {{ formatDateTime(detail.order.createdAt) }}
        </p>
      </div>
      <div class="page-actions">
        <el-button @click="goBack">返回订单中心</el-button>
        <PermissionGuard permission="order:dispatch">
          <el-button v-if="canDispatch" type="primary" data-testid="dispatch-entry" @click="goDispatch">
            人工调度
          </el-button>
        </PermissionGuard>
        <PermissionGuard permission="dispatch:generate">
          <el-button v-if="canDispatch" data-testid="plan-entry" @click="goDispatchPlans">
            智能调度
          </el-button>
        </PermissionGuard>
        <el-button v-if="detail?.waybill" data-testid="track-entry" @click="goTrack">运单跟踪</el-button>
        <el-button v-if="detail?.waybill" data-testid="waybill-detail-entry" @click="goWaybillDetail">
          一单制运单
        </el-button>
        <el-button v-if="canSign" type="success" @click="goTrack">去签收</el-button>
        <PermissionGuard permission="bill:settle">
          <el-button
            v-if="canSettle"
            type="warning"
            data-testid="settle-entry"
            :loading="settling"
            @click="handleSettle"
          >
            结算出账
          </el-button>
        </PermissionGuard>
        <el-button v-if="detail?.bill" data-testid="bill-entry" @click="goBill">查看账单</el-button>
        <PermissionGuard permission="order:cancel">
          <el-button
            v-if="canCancel"
            type="danger"
            plain
            data-testid="order-cancel-btn"
            :loading="cancelling"
            @click="handleCancel"
          >
            取消订单
          </el-button>
        </PermissionGuard>
      </div>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div v-loading="loading" class="detail-wrap">
      <template v-if="detail">
        <!-- 状态总览 -->
        <div class="card">
          <div class="overview">
            <div class="overview-status">
              <span class="meta-label">订单状态</span>
              <StatusTag :status="detail.order.status" :label="detail.order.statusLabel" size="large" />
            </div>
            <div class="overview-status">
              <span class="meta-label">运单状态</span>
              <StatusTag
                v-if="detail.waybill"
                kind="waybill"
                :status="detail.waybill.status"
                :label="detail.waybill.statusLabel"
              />
              <el-tag v-else type="info" effect="plain">未生成运单</el-tag>
            </div>
            <div class="overview-meta">
              <span>客户：{{ detail.order.customer?.name || detail.order.shipper.displayName }}</span>
              <span>更新：{{ formatDateTime(detail.order.updatedAt) }}</span>
              <span v-if="detail.bill" class="mono">账单：{{ detail.bill.billNo }}</span>
            </div>
          </div>

          <el-alert
            v-if="detail.order.status === 'CANCELLED'"
            title="该订单已取消"
            type="warning"
            show-icon
            :closable="false"
            class="mt-12"
          />

          <el-steps v-else :active="stepActive" finish-status="success" align-center class="steps">
            <el-step v-for="step in ORDER_FLOW_STEPS" :key="step" :title="orderStatusLabel(step)" />
          </el-steps>
        </div>

        <div class="detail-grid">
          <!-- 订单信息 -->
          <div class="card">
            <h3 class="card-title"><span class="card-title-text">订单信息</span></h3>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="订单号">
                <span class="mono">{{ detail.order.orderNo }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="订单状态">{{ detail.order.statusLabel }}</el-descriptions-item>
              <el-descriptions-item label="订单类型">
                <span data-testid="order-type">
                  {{ detail.order.orderTypeLabel || orderTypeLabel(detail.order.orderType) }}
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="订单来源">
                <span data-testid="order-source">
                  {{ detail.order.sourceLabel || sourceLabel(detail.order.source) }}
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="客户">
                {{ detail.order.customer?.name || detail.order.shipper.displayName }}
              </el-descriptions-item>
              <el-descriptions-item label="收货人">
                {{ detail.order.consignee?.name || '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="优先级">
                {{ detail.order.priorityLabel || priorityLabel(detail.order.priority) }}
              </el-descriptions-item>
              <el-descriptions-item label="订单金额">
                <span class="amount">¥{{ formatAmount(detail.order.totalAmount ?? 0) }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="货物名称">{{ detail.order.cargoName }}</el-descriptions-item>
              <el-descriptions-item label="货物重量">
                {{ formatWeight(detail.order.cargoWeight) }}
              </el-descriptions-item>
              <el-descriptions-item label="箱型 / 箱量">
                {{ detail.order.containerType }} × {{ detail.order.containerCount }}
              </el-descriptions-item>
              <el-descriptions-item label="要求提货日">
                {{ formatDate(detail.order.requiredPickupDate) }}
              </el-descriptions-item>
              <el-descriptions-item label="起运地">{{ detail.order.origin }}</el-descriptions-item>
              <el-descriptions-item label="目的地">{{ detail.order.destination }}</el-descriptions-item>
              <el-descriptions-item label="备注" :span="2">{{ detail.order.remark || '—' }}</el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ formatDateTime(detail.order.createdAt) }}</el-descriptions-item>
              <el-descriptions-item label="更新时间">{{ formatDateTime(detail.order.updatedAt) }}</el-descriptions-item>
            </el-descriptions>
          </div>

          <!-- 集装箱 -->
          <div class="card">
            <h3 class="card-title">
              <span class="card-title-text">集装箱（{{ detail.containers.length }}）</span>
            </h3>
            <el-table v-if="detail.containers.length" :data="detail.containers" size="small" border>
              <el-table-column prop="containerNo" label="箱号" min-width="130">
                <template #default="{ row }">
                  <span class="mono">{{ row.containerNo }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="type" label="箱型" width="80" align="center" />
              <el-table-column prop="sealNo" label="铅封号" min-width="120">
                <template #default="{ row }">
                  <span class="mono">{{ row.sealNo || '—' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="92" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.status === 'DELIVERED' ? 'success' : 'info'" size="small" effect="light">
                    {{ row.statusLabel || containerStatusLabel(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="conditionText" label="箱况" min-width="150">
                <template #default="{ row }">{{ row.conditionText || '—' }}</template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无集装箱档案" :image-size="60" />
          </div>
        </div>

        <!-- 货物行（v1） -->
        <div class="card">
          <h3 class="card-title">
            <span class="card-title-text">货物明细（{{ (detail.cargoLines ?? []).length }} 行）</span>
            <el-tag v-if="detail.order.orderType" size="small" effect="plain">
              {{ detail.order.orderTypeLabel || orderTypeLabel(detail.order.orderType) }}
            </el-tag>
          </h3>
          <el-table v-if="(detail.cargoLines ?? []).length" :data="detail.cargoLines" size="small" border stripe>
            <el-table-column prop="seq" label="行号" width="64" align="center">
              <template #default="{ row, $index }">{{ row.seq ?? $index + 1 }}</template>
            </el-table-column>
            <el-table-column label="货物" min-width="150">
              <template #default="{ row }">
                <span>{{ row.goodsName }}</span>
                <span v-if="row.goodsCode" class="muted mono">（{{ row.goodsCode }}）</span>
              </template>
            </el-table-column>
            <el-table-column label="数量" width="100" align="right">
              <template #default="{ row }">{{ row.quantity }} {{ row.unit }}</template>
            </el-table-column>
            <el-table-column label="重量(t)" width="100" align="right">
              <template #default="{ row }">{{ Number(row.weightT).toFixed(2) }}</template>
            </el-table-column>
            <el-table-column label="体积(m³)" width="100" align="right">
              <template #default="{ row }">{{ row.volumeCbm ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="箱型/箱量" width="120" align="center">
              <template #default="{ row }">{{ row.containerType }} × {{ row.containerCount }}</template>
            </el-table-column>
            <el-table-column label="危险品" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.dangerousFlag ? 'danger' : 'info'" size="small" effect="plain">
                  {{ row.dangerousFlag ? '是' : '否' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="packaging" label="包装" width="110" />
          </el-table>
          <el-empty v-else description="暂无多货物行（旧版单货物订单）" :image-size="60" />
        </div>

        <!-- 合同 / 报价 / 运单与分段 -->
        <div class="card">
          <h3 class="card-title">
            <span class="card-title-text">合同 / 报价 / 运单</span>
            <span v-if="detail.waybill" class="mono muted">{{ detail.waybill.waybillNo }}</span>
          </h3>
          <div class="related-bar">
            <div class="related-item">
              <span class="meta-label">关联报价</span>
              <router-link v-if="detail.quote" :to="`/quotes/${detail.quote.id}`" data-testid="order-quote-link" class="mono">
                {{ detail.quote.quoteNo }}
              </router-link>
              <span v-else class="muted">—</span>
            </div>
            <div class="related-item">
              <span class="meta-label">关联合同</span>
              <router-link v-if="detail.contract" :to="`/contracts/${detail.contract.id}`" data-testid="order-contract-link" class="mono">
                {{ detail.contract.contractNo }}
              </router-link>
              <span v-else class="muted">—</span>
            </div>
            <div class="related-item">
              <span class="meta-label">运输线路</span>
              <span>{{ detail.route?.routeName || '—' }}</span>
            </div>
            <div class="related-item">
              <span class="meta-label">报价金额</span>
              <span v-if="detail.quote?.totalAmount !== undefined" class="amount">
                ¥{{ formatAmount(detail.quote.totalAmount) }}
              </span>
              <span v-else class="muted">—</span>
            </div>
          </div>

          <el-empty
            v-if="!detail.waybill"
            description="尚未调度，MTO 调度后将自动生成运单与 3 个分段"
            :image-size="70"
          />
          <template v-else>
            <el-descriptions :column="4" border size="small" class="waybill-desc mt-12">
              <el-descriptions-item label="运单号">
                <span class="mono">{{ detail.waybill.waybillNo }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="运单状态">{{ detail.waybill.statusLabel }}</el-descriptions-item>
              <el-descriptions-item label="签收人">{{ detail.waybill.signerName || '—' }}</el-descriptions-item>
              <el-descriptions-item label="签收时间">{{ formatDateTime(detail.waybill.signedAt) }}</el-descriptions-item>
            </el-descriptions>
            <div class="mt-16 scroll-x">
              <SegmentTable v-if="detail.segments.length" :segments="detail.segments" />
            </div>
          </template>
        </div>

        <!-- 最新轨迹 -->
        <div class="card">
          <h3 class="card-title">
            <span class="card-title-text">最新轨迹</span>
            <router-link v-if="detail.waybill" :to="`/waybills/${detail.waybill.id}/track`">查看全程轨迹 →</router-link>
          </h3>
          <el-timeline v-if="detail.latestTrack.length">
            <el-timeline-item
              v-for="point in detail.latestTrack"
              :key="point.id"
              :timestamp="formatDateTime(point.occurredAt)"
              placement="top"
              :color="sourceColor(point.source)"
            >
              <div class="track-line">
                <span class="track-line__node">{{ point.nodeName }}</span>
                <el-tag size="small" effect="plain">{{ trackSourceLabel(point.source) }}</el-tag>
                <span class="muted">{{ point.description }}</span>
              </div>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无轨迹数据" :image-size="60" />
        </div>

        <!-- 调度候选承运商（仅 MTO 可见） -->
        <div v-if="detail.availableRoadCarriers.length" class="card">
          <h3 class="card-title">
            <span class="card-title-text">公路承运商报价（调度候选）</span>
            <el-button type="primary" size="small" @click="goDispatch">去调度</el-button>
          </h3>
          <div class="carrier-grid">
            <div v-for="carrier in detail.availableRoadCarriers" :key="carrier.code" class="carrier-quote">
              <div class="carrier-quote__head">
                <span class="carrier-quote__name">{{ carrier.name }}</span>
                <span class="mono muted">{{ carrier.code }}</span>
              </div>
              <div class="amount">¥{{ formatAmount(carrier.price) }}</div>
              <div class="muted carrier-quote__desc">
                预计 {{ carrier.etaHours }} 小时 · {{ carrier.description }}
              </div>
            </div>
          </div>
        </div>
      </template>

      <el-empty v-else-if="!loading && !errorText" description="订单不存在或无权查看" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import SegmentTable from '../components/SegmentTable.vue';
import PermissionGuard from '../components/PermissionGuard.vue';
import { cancelOrder, fetchOrderDetail, settleOrder } from '../api';
import { useAuthStore } from '../stores/auth';
import {
  ORDER_FLOW_STEPS,
  containerStatusLabel,
  orderStatusLabel,
  orderTypeLabel,
  priorityLabel,
  sourceLabel,
  trackSourceLabel,
} from '../utils/constants';
import { formatAmount, formatDate, formatDateTime, formatWeight } from '../utils/format';
import type { OrderDetail } from '../types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const detail = ref<OrderDetail | null>(null);
const loading = ref(false);
const settling = ref(false);
const cancelling = ref(false);
const errorText = ref('');

const orderId = computed(() => String(route.params.id ?? ''));
const canDispatchStatus = computed(() =>
  ['CREATED', 'CONTRACTED', 'CONFIRMED'].includes(detail.value?.order.status ?? ''),
);

const canDispatch = computed(() => auth.hasPermission('order:dispatch') && canDispatchStatus.value);
const canCancel = computed(
  () => auth.hasPermission('order:cancel') && canDispatchStatus.value,
);
const canSign = computed(
  () =>
    auth.hasPermission('waybill:sign') &&
    detail.value?.order.status === 'ARRIVED' &&
    Boolean(detail.value?.waybill),
);
const canSettle = computed(
  () =>
    auth.hasPermission('bill:settle') &&
    detail.value?.order.status === 'SIGNED' &&
    !detail.value?.bill,
);

const stepActive = computed(() => {
  const status = detail.value?.order.status;
  if (!status) return 0;
  if (['CREATED', 'CONTRACTED', 'CONFIRMED'].includes(status)) return 0;
  const index = ORDER_FLOW_STEPS.indexOf(status);
  return index < 0 ? 0 : index;
});

function sourceColor(source: string): string {
  if (source === 'MOCK_GPS') return '#409eff';
  if (source === 'MOCK_EDI') return '#13c2c2';
  if (source === 'TERMINAL_REPORT') return '#fa8c16';
  if (source === 'CARRIER_REPORT') return '#67c23a';
  return '#909399';
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    detail.value = await fetchOrderDetail(orderId.value);
  } catch (error) {
    detail.value = null;
    errorText.value = error instanceof Error && error.message ? error.message : '订单详情加载失败';
  } finally {
    loading.value = false;
  }
}

function goBack(): void {
  void router.push('/orders');
}

function goDispatch(): void {
  void router.push(`/orders/${orderId.value}/dispatch`);
}

function goDispatchPlans(): void {
  void router.push(`/dispatch/plans?orderId=${orderId.value}`);
}

function goTrack(): void {
  const waybill = detail.value?.waybill;
  if (!waybill) {
    ElMessage.warning('该订单尚未生成运单');
    return;
  }
  void router.push(`/waybills/${waybill.id}/track`);
}

function goWaybillDetail(): void {
  const waybill = detail.value?.waybill;
  if (!waybill) {
    ElMessage.warning('该订单尚未生成运单');
    return;
  }
  void router.push(`/waybills/${waybill.id}`);
}

function goBill(): void {
  const bill = detail.value?.bill;
  if (!bill) return;
  void router.push(`/bills/${bill.id}`);
}

async function handleSettle(): Promise<void> {
  settling.value = true;
  try {
    const data = await settleOrder(orderId.value);
    ElMessage.success(`出账成功：${data.bill.billNo}，合计 ¥${formatAmount(data.bill.totalAmount)}`);
    await router.push(`/bills/${data.bill.id}`);
  } finally {
    settling.value = false;
  }
}

async function handleCancel(): Promise<void> {
  const order = detail.value?.order;
  if (!order) return;
  try {
    await ElMessageBox.confirm(
      `确认取消订单 ${order.orderNo}？取消后不可恢复。`,
      '取消订单',
      { confirmButtonText: '确认取消', cancelButtonText: '再想想', type: 'warning' },
    );
  } catch {
    return;
  }
  cancelling.value = true;
  try {
    await cancelOrder(order.id);
    ElMessage.success('订单已取消');
    await load();
  } finally {
    cancelling.value = false;
  }
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

.mt-16 {
  margin-top: 16px;
}

.retry-btn {
  margin-top: 6px;
}

.detail-wrap {
  min-height: 180px;
}

.overview {
  display: flex;
  align-items: center;
  gap: 32px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  border-bottom: 1px dashed var(--app-border);
}

.overview-status {
  display: flex;
  align-items: center;
  gap: 10px;
}

.overview-meta {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.steps {
  margin-top: 20px;
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 16px;
  margin-top: 16px;
}

.detail-grid .card {
  margin-top: 0;
}

.waybill-desc {
  margin-bottom: 4px;
}

.related-bar {
  display: flex;
  align-items: center;
  gap: 34px;
  flex-wrap: wrap;
  padding: 12px 16px;
  border-radius: 8px;
  background: #f7f9fc;
  font-size: 13px;
}

.related-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.track-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.track-line__node {
  font-weight: 600;
}

.track-line .muted {
  font-size: 12px;
}

.carrier-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.carrier-quote {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 14px 16px;
  background: #fafcff;
}

.carrier-quote__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.carrier-quote__name {
  font-weight: 600;
}

.carrier-quote__desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 1100px) {
  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .carrier-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
