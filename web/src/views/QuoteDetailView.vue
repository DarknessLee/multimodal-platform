<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">报价详情</h2>
        <p v-if="quote" class="page-subtitle">
          报价号 <span class="mono">{{ quote.quoteNo }}</span> · 有效期至 {{ formatDate(quote.validUntil) }}
        </p>
      </div>
      <div class="page-actions">
        <el-button @click="goQuotes">返回报价列表</el-button>
        <PermissionGuard permission="quote:send">
          <el-button
            v-if="quote?.status === 'DRAFT'"
            type="primary"
            data-testid="quote-send-btn"
            :loading="sending"
            @click="send"
          >
            发送报价
          </el-button>
        </PermissionGuard>
        <PermissionGuard permission="quote:accept">
          <el-button
            v-if="quote?.status === 'SENT'"
            type="success"
            data-testid="quote-accept-btn"
            :loading="accepting"
            @click="accept"
          >
            接受报价并生成订单
          </el-button>
        </PermissionGuard>
        <el-button v-if="quote?.orderId" type="primary" plain @click="goOrder">查看订单</el-button>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div v-loading="loading">
      <template v-if="quote">
        <div class="card">
          <div class="quote-head">
            <div class="quote-head__item">
              <span class="meta-label">状态</span>
              <StatusTag kind="quote" :status="quote.status" :label="quote.statusLabel" size="large" />
            </div>
            <div class="quote-head__item">
              <span class="meta-label">客户</span>
              <span>{{ quote.customer.name }}</span>
            </div>
            <div class="quote-head__item">
              <span class="meta-label">订单类型</span>
              <span>{{ quote.orderTypeLabel || orderTypeLabel(quote.orderType) }}</span>
            </div>
            <div class="quote-head__item">
              <span class="meta-label">线路</span>
              <span>{{ quote.route.routeName }}</span>
            </div>
            <div class="quote-head__item quote-head__item--right">
              <span class="meta-label">报价总额（元）</span>
              <span class="amount-lg" data-testid="quote-total-amount">{{ formatAmount(quote.totalAmount) }}</span>
            </div>
          </div>
        </div>

        <div class="quote-grid">
          <div class="card">
            <h3 class="card-title"><span class="card-title-text">询价信息</span></h3>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="报价号">
                <span class="mono">{{ quote.quoteNo }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="状态">{{ quote.statusLabel }}</el-descriptions-item>
              <el-descriptions-item label="客户">{{ quote.customer.name }}</el-descriptions-item>
              <el-descriptions-item label="订单类型">
                {{ quote.orderTypeLabel || orderTypeLabel(quote.orderType) }}
              </el-descriptions-item>
              <el-descriptions-item label="线路" :span="2">{{ quote.route.routeName }}</el-descriptions-item>
              <el-descriptions-item label="运输方式">
                {{ quote.route.modes.map((mode) => modeLabel(mode)).join(' / ') }}
              </el-descriptions-item>
              <el-descriptions-item label="运输时效">{{ Number(quote.transitDays).toFixed(1) }} 天</el-descriptions-item>
              <el-descriptions-item label="箱型 / 箱量">
                {{ quote.containerType }} × {{ quote.containerCount }}
              </el-descriptions-item>
              <el-descriptions-item label="货物">{{ quote.cargoName }}</el-descriptions-item>
              <el-descriptions-item label="货物重量">{{ Number(quote.cargoWeight).toFixed(2) }} t</el-descriptions-item>
              <el-descriptions-item label="要求发运日期">{{ formatDate(quote.requiredDate) }}</el-descriptions-item>
              <el-descriptions-item label="有效期至">{{ formatDate(quote.validUntil) }}</el-descriptions-item>
              <el-descriptions-item label="备注">{{ quote.remark || '—' }}</el-descriptions-item>
              <el-descriptions-item v-if="quote.orderNo" label="关联订单">
                <router-link v-if="quote.orderId" :to="`/orders/${quote.orderId}`" class="mono">
                  {{ quote.orderNo }}
                </router-link>
                <span v-else class="mono">{{ quote.orderNo }}</span>
              </el-descriptions-item>
            </el-descriptions>
          </div>

          <div class="card">
            <h3 class="card-title"><span class="card-title-text">报价金额</span></h3>
            <div class="amount-panel">
              <div class="amount-panel__row">
                <span class="meta-label">报价总额</span>
                <span class="amount-lg">¥{{ formatAmount(quote.totalAmount) }}</span>
              </div>
              <div class="amount-panel__row">
                <span class="meta-label">成本合计</span>
                <span>¥{{ formatAmount(quote.costAmount) }}</span>
              </div>
              <div class="amount-panel__row">
                <span class="meta-label">毛利率</span>
                <span class="amount">{{ Number(quote.marginRate).toFixed(2) }}%</span>
              </div>
              <div class="amount-panel__row">
                <span class="meta-label">费用行数</span>
                <span>{{ quote.items.length }} 项</span>
              </div>
            </div>

            <template v-if="quote.status === 'SENT' && auth.hasPermission('quote:accept')">
              <h3 class="card-title mt-16"><span class="card-title-text">关联合同（可选）</span></h3>
              <el-select
                v-model="selectedContractId"
                clearable
                filterable
                placeholder="选择已签署合同（可选）"
                style="width: 100%"
                @change="onContractChange"
              >
                <el-option
                  v-for="contract in contracts"
                  :key="contract.id"
                  :label="`${contract.contractNo} · ${contract.title}`"
                  :value="contract.id"
                />
              </el-select>
              <p class="muted contract-tip">
                选择已签署合同后，接受报价生成的订单状态为「已签合同」；不选择则生成「已确认」订单。
              </p>
            </template>
          </div>
        </div>

        <div class="card mt-16">
          <h3 class="card-title"><span class="card-title-text">费用明细（按运输模式）</span></h3>
          <QuoteBreakdown data-testid="quote-breakdown" :items="quote.items" :total-amount="quote.totalAmount" />
        </div>
      </template>

      <el-empty v-else-if="!loading && !errorText" description="报价不存在或无权查看" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import PermissionGuard from '../components/PermissionGuard.vue';
import QuoteBreakdown from '../components/QuoteBreakdown.vue';
import { acceptQuote, fetchQuote, sendQuote } from '../api/quote';
import { fetchContracts } from '../api/contract';
import { useAuthStore } from '../stores/auth';
import { modeLabel, orderTypeLabel } from '../utils/constants';
import { formatAmount, formatDate } from '../utils/format';
import type { ContractListItem, QuoteDetail } from '../types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const quote = ref<QuoteDetail | null>(null);
const loading = ref(false);
const sending = ref(false);
const accepting = ref(false);
const errorText = ref('');
const contracts = ref<ContractListItem[]>([]);
const selectedContractId = ref<number | null>(null);

const quoteId = computed(() => String(route.params.id ?? ''));

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    quote.value = await fetchQuote(quoteId.value);
    if (quote.value.status === 'SENT' && auth.hasPermission('quote:accept')) {
      try {
        const data = await fetchContracts({
          status: 'SIGNED',
          customerId: quote.value.customer.id,
          page: 1,
          pageSize: 50,
        });
        contracts.value = data.list;
      } catch {
        contracts.value = [];
      }
    }
  } catch (error) {
    quote.value = null;
    errorText.value = error instanceof Error && error.message ? error.message : '报价加载失败';
  } finally {
    loading.value = false;
  }
}

function goQuotes(): void {
  void router.push('/quotes');
}

function goOrder(): void {
  if (!quote.value?.orderId) return;
  void router.push(`/orders/${quote.value.orderId}`);
}

function onContractChange(value: number | null): void {
  selectedContractId.value = value ?? null;
}

async function send(): Promise<void> {
  if (!quote.value) return;
  sending.value = true;
  try {
    await sendQuote(quote.value.id);
    ElMessage.success('报价已发送，客户可在报价工作台查看');
    await load();
  } finally {
    sending.value = false;
  }
}

async function accept(): Promise<void> {
  if (!quote.value) return;
  accepting.value = true;
  try {
    const result = await acceptQuote(quote.value.id, selectedContractId.value);
    ElMessage.success(`接受报价成功，已生成订单 ${result.orderNo}`);
    await router.push(`/orders/${result.orderId}`);
  } finally {
    accepting.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}

.mt-16 {
  margin-top: 16px;
}

.retry-btn {
  margin-top: 6px;
}

.quote-head {
  display: flex;
  align-items: center;
  gap: 32px;
  flex-wrap: wrap;
}

.quote-head__item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
  min-width: 0;
}

.quote-head__item--right {
  margin-left: auto;
  align-items: flex-end;
}

.quote-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(0, 0.85fr);
  gap: 16px;
  margin-top: 16px;
}

.quote-grid .card {
  margin-top: 0;
}

.amount-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #fff7f7;
  border: 1px solid #fde2e2;
  border-radius: 10px;
  padding: 16px 18px;
}

.amount-panel__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
}

.contract-tip {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.7;
}

@media (max-width: 1100px) {
  .quote-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
