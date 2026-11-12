<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">人工调度</h2>
        <p class="page-subtitle">
          为订单选择公路段承运商，调度后自动生成运单与公路 / 海运 / 铁路三段
        </p>
      </div>
      <div class="page-actions">
        <el-button @click="goBack">返回订单</el-button>
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

    <div v-loading="loading">
      <template v-if="detail">
        <!-- 订单摘要 -->
        <div class="card">
          <div class="summary">
            <div>
              <span class="meta-label">订单号</span>
              <div class="summary-no mono">{{ detail.order.orderNo }}</div>
            </div>
            <div>
              <span class="meta-label">订单状态</span>
              <div class="mt-6">
                <StatusTag :status="detail.order.status" :label="detail.order.statusLabel" />
              </div>
            </div>
            <div>
              <span class="meta-label">货物</span>
              <div>{{ detail.order.cargoName }} · {{ formatWeight(detail.order.cargoWeight) }}</div>
            </div>
            <div>
              <span class="meta-label">箱型 / 箱量</span>
              <div>{{ detail.order.containerType }} × {{ detail.order.containerCount }}</div>
            </div>
            <div>
              <span class="meta-label">路线</span>
              <div>{{ detail.order.origin }} → {{ detail.order.destination }}</div>
            </div>
            <div>
              <span class="meta-label">要求提货日</span>
              <div>{{ formatDate(detail.order.requiredPickupDate) }}</div>
            </div>
          </div>
        </div>

        <el-alert
          v-if="!canDispatchNow"
          title="该订单当前状态不允许调度（已调度 / 已在途 / 已取消）"
          type="warning"
          show-icon
          :closable="false"
          class="mt-16"
        />

        <!-- 承运商报价对比 -->
        <div class="card mt-16">
          <h3 class="card-title">
            <span class="card-title-text">公路承运商报价对比（上海嘉定工厂 → 上海洋山港）</span>
          </h3>
          <div class="carrier-grid">
            <div
              v-for="carrier in detail.availableRoadCarriers"
              :key="carrier.code"
              class="carrier-card"
              :class="{ 'carrier-card--selected': selectedCode === carrier.code }"
              :data-testid="`carrier-option-${carrier.code}`"
              @click="selectCarrier(carrier.code)"
            >
              <div class="carrier-card__head">
                <el-radio :model-value="selectedCode" :value="carrier.code" size="large">
                  <span class="carrier-card__name">{{ carrier.name }}</span>
                </el-radio>
                <span class="mono muted">{{ carrier.code }}</span>
              </div>
              <div class="carrier-card__price amount">¥{{ formatAmount(carrier.price) }}</div>
              <div class="carrier-card__meta">
                <el-tag size="small" effect="plain">预计 {{ carrier.etaHours }} 小时</el-tag>
                <el-tag size="small" type="success" effect="plain">公路专线</el-tag>
              </div>
              <div class="carrier-card__desc muted">{{ carrier.description }}</div>
              <div v-if="selectedCode === carrier.code" class="carrier-card__flag">✓ 已选择</div>
            </div>
          </div>
          <el-empty
            v-if="detail.availableRoadCarriers.length === 0"
            description="当前无可选公路承运商（订单可能已调度）"
            :image-size="70"
          />
        </div>

        <!-- 调度预览 -->
        <div v-if="canDispatchNow && selectedCarrier" class="card mt-16">
          <h3 class="card-title"><span class="card-title-text">调度预览</span></h3>
          <div class="preview-line">
            <div class="preview-node">
              <span class="preview-index">1</span>
              <div>
                <div class="preview-mode road">公路 · {{ selectedCarrier.name }}</div>
                <div class="preview-name">上海嘉定工厂 → 上海洋山港</div>
              </div>
              <div class="preview-amount">¥{{ formatAmount(selectedCarrier.price) }}</div>
            </div>
            <div class="preview-node">
              <span class="preview-index">2</span>
              <div>
                <div class="preview-mode sea">海运 · 中远海运</div>
                <div class="preview-name">上海洋山港 → 武汉阳逻港</div>
              </div>
              <div class="preview-amount">¥5200.00</div>
            </div>
            <div class="preview-node">
              <span class="preview-index">3</span>
              <div>
                <div class="preview-mode rail">铁路 · 中铁集装箱</div>
                <div class="preview-name">武汉吴家山站 → 成都城厢站</div>
              </div>
              <div class="preview-amount">¥8600.00</div>
            </div>
          </div>
          <div class="preview-total">
            预估总费用 <span class="amount-lg">¥{{ formatAmount(estimatedTotal) }}</span>
          </div>

          <div class="dispatch-actions">
            <el-button
              type="primary"
              size="large"
              data-testid="dispatch-submit"
              :loading="submitting"
              :disabled="!selectedCode"
              @click="submitDispatch"
            >
              确认调度
            </el-button>
            <span class="muted">调度后将生成运单，公路段进入「待接单」</span>
          </div>
        </div>
      </template>

      <el-empty
        v-else-if="!loading && !errorText"
        description="订单不存在或无权调度"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import { dispatchOrder, fetchOrderDetail } from '../api';
import { formatAmount, formatDate, formatWeight } from '../utils/format';
import type { OrderDetail, RoadCarrier } from '../types';

const route = useRoute();
const router = useRouter();

const detail = ref<OrderDetail | null>(null);
const loading = ref(false);
const submitting = ref(false);
const errorText = ref('');
const selectedCode = ref('');

const orderId = computed(() => String(route.params.id ?? ''));

const selectedCarrier = computed<RoadCarrier | null>(() => {
  if (!detail.value) return null;
  return detail.value.availableRoadCarriers.find((carrier) => carrier.code === selectedCode.value) ?? null;
});

const estimatedTotal = computed(() => (selectedCarrier.value?.price ?? 0) + 5200 + 8600);

/** v1：CREATED / CONTRACTED / CONFIRMED 均可调度（docs/04 §5.5） */
const canDispatchNow = computed(() =>
  ['CREATED', 'CONTRACTED', 'CONFIRMED'].includes(detail.value?.order.status ?? ''),
);

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    detail.value = await fetchOrderDetail(orderId.value);
    if (detail.value.availableRoadCarriers.length > 0) {
      const existing = detail.value.availableRoadCarriers.find((carrier) => carrier.code === selectedCode.value);
      selectedCode.value = existing?.code ?? detail.value.availableRoadCarriers[0].code;
    } else {
      selectedCode.value = '';
    }
  } catch (error) {
    detail.value = null;
    errorText.value = error instanceof Error && error.message ? error.message : '订单加载失败';
  } finally {
    loading.value = false;
  }
}

function selectCarrier(code: string): void {
  selectedCode.value = code;
}

function goBack(): void {
  void router.push(`/orders/${orderId.value}`);
}

async function submitDispatch(): Promise<void> {
  if (!selectedCode.value) {
    ElMessage.warning('请先选择公路承运商');
    return;
  }
  submitting.value = true;
  try {
    const result = await dispatchOrder(orderId.value, selectedCode.value);
    ElMessage.success(`调度成功：运单 ${result.waybillNo}，已生成 3 个运输分段`);
    await router.push(`/orders/${orderId.value}`);
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}

.mt-6 {
  margin-top: 6px;
}

.mt-16 {
  margin-top: 16px;
}

.retry-btn {
  margin-top: 6px;
}

.summary {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
}

.summary > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

.summary-no {
  font-size: 15px;
  font-weight: 600;
}

.carrier-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.carrier-card {
  position: relative;
  border: 1.5px solid var(--app-border);
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  background: #ffffff;
}

.carrier-card:hover {
  border-color: #c6e2ff;
}

.carrier-card--selected {
  border-color: var(--app-primary);
  background: #f2f8ff;
  box-shadow: 0 4px 16px rgba(64, 158, 255, 0.12);
}

.carrier-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.carrier-card__name {
  font-size: 15px;
  font-weight: 600;
}

.carrier-card__price {
  font-size: 24px;
  margin: 10px 0 8px;
}

.carrier-card__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.carrier-card__desc {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
}

.carrier-card__flag {
  position: absolute;
  right: 12px;
  bottom: 10px;
  font-size: 12px;
  color: var(--app-primary);
  font-weight: 600;
}

.preview-line {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-node {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) 110px;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: #fafcff;
}

.preview-index {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ecf5ff;
  color: var(--app-primary);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-mode {
  font-size: 12px;
}

.preview-mode.road {
  color: #409eff;
}

.preview-mode.sea {
  color: #13c2c2;
}

.preview-mode.rail {
  color: #fa8c16;
}

.preview-name {
  margin-top: 2px;
  font-size: 13px;
}

.preview-amount {
  text-align: right;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.preview-total {
  margin-top: 16px;
  text-align: right;
  font-size: 14px;
  color: var(--app-text-regular);
}

.dispatch-actions {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px dashed var(--app-border);
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

@media (max-width: 1100px) {
  .summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .carrier-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
