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
        <el-button @click="goBack">返回列表</el-button>
        <el-button v-if="canDispatch" type="primary" data-testid="dispatch-entry" @click="goDispatch">
          人工调度
        </el-button>
        <el-button v-if="detail?.waybill" data-testid="track-entry" @click="goTrack">运单跟踪</el-button>
        <el-button v-if="canSign" type="success" @click="goTrack">去签收</el-button>
        <el-button
          v-if="canSettle"
          type="warning"
          data-testid="settle-entry"
          :loading="settling"
          @click="handleSettle"
        >
          结算出账
        </el-button>
        <el-button v-if="detail?.bill" data-testid="bill-entry" @click="goBill">查看账单</el-button>
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
              <span>货主：{{ detail.order.shipper.displayName }}</span>
              <span>更新：{{ formatDateTime(detail.order.updatedAt) }}</span>
              <span v-if="detail.bill" class="mono">账单：{{ detail.bill.billNo }}</span>
            </div>
          </div>
          <el-steps :active="stepActive" finish-status="success" align-center class="steps">
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
              <el-descriptions-item label="订单状态">
                {{ detail.order.statusLabel }}
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
              <el-descriptions-item label="备注" :span="2">
                {{ detail.order.remark || '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="创建时间">
                {{ formatDateTime(detail.order.createdAt) }}
              </el-descriptions-item>
              <el-descriptions-item label="更新时间">
                {{ formatDateTime(detail.order.updatedAt) }}
              </el-descriptions-item>
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

        <!-- 运单与分段 -->
        <div class="card">
          <h3 class="card-title">
            <span class="card-title-text">运单与分段</span>
            <span v-if="detail.waybill" class="mono muted">{{ detail.waybill.waybillNo }}</span>
          </h3>
          <el-empty
            v-if="!detail.waybill"
            description="尚未调度，MTO 调度后将自动生成运单与 3 个分段"
            :image-size="70"
          />
          <template v-else>
            <el-descriptions :column="4" border size="small" class="waybill-desc">
              <el-descriptions-item label="运单号">
                <span class="mono">{{ detail.waybill.waybillNo }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="运单状态">
                {{ detail.waybill.statusLabel }}
              </el-descriptions-item>
              <el-descriptions-item label="签收人">{{ detail.waybill.signerName || '—' }}</el-descriptions-item>
              <el-descriptions-item label="签收时间">
                {{ formatDateTime(detail.waybill.signedAt) }}
              </el-descriptions-item>
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
            <router-link v-if="detail.waybill" :to="`/waybills/${detail.waybill.id}`">
              查看全程轨迹 →
            </router-link>
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
import { ElMessage } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import SegmentTable from '../components/SegmentTable.vue';
import { fetchOrderDetail, settleOrder } from '../api';
import { useAuthStore } from '../stores/auth';
import {
  ORDER_FLOW_STEPS,
  containerStatusLabel,
  orderStatusLabel,
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
const errorText = ref('');

const orderId = computed(() => String(route.params.id ?? ''));

const canDispatch = computed(
  () => auth.role === 'MTO' && detail.value?.order.status === 'CREATED',
);
const canSign = computed(
  () =>
    auth.role === 'SHIPPER' &&
    detail.value?.order.status === 'ARRIVED' &&
    Boolean(detail.value?.waybill),
);
const canSettle = computed(
  () =>
    auth.role === 'SETTLEMENT' &&
    detail.value?.order.status === 'SIGNED' &&
    !detail.value?.bill,
);

const stepActive = computed(() => {
  const status = detail.value?.order.status;
  if (!status) return 0;
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

function goTrack(): void {
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

onMounted(load);
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
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
