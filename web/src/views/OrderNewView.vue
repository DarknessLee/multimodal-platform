<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">新建订单</h2>
        <p class="page-subtitle">
          双通道下单：快速下单（v0 兼容）或报价单转单（询价→报价→合同→订单）
        </p>
      </div>
      <div class="page-actions">
        <el-button @click="goBack">返回订单中心</el-button>
      </div>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16" />

    <div class="card channel-card">
      <el-radio-group v-model="channel" size="large" @change="onChannelChange">
        <el-radio-button value="QUICK">快速下单（v0 兼容）</el-radio-button>
        <el-radio-button value="QUOTE">报价单转单</el-radio-button>
      </el-radio-group>
      <span class="muted channel-tip">
        {{ channel === 'QUICK'
          ? '填写货物行与起讫信息，生成状态为「待调度」的订单'
          : '选择已报价的询价单（可关联已签署合同），直接转成订单' }}
      </span>
    </div>

    <!-- 快速下单 -->
    <div v-if="channel === 'QUICK'" class="card">
      <h3 class="card-title"><span class="card-title-text">基础信息</span></h3>
      <el-form ref="quickFormRef" :model="quickForm" :rules="quickRules" label-position="top">
        <el-row :gutter="20">
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="客户" prop="customerId">
              <el-select
                v-model="quickForm.customerId"
                filterable
                clearable
                placeholder="选择客户（可选）"
                style="width: 100%"
              >
                <el-option v-for="customer in customers" :key="customer.id" :label="customer.name" :value="customer.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="订单类型" prop="orderType">
              <el-select v-model="quickForm.orderType" style="width: 100%">
                <el-option v-for="option in ORDER_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="优先级">
              <el-select v-model="quickForm.priority" style="width: 100%">
                <el-option label="普通" value="NORMAL" />
                <el-option label="加急" value="URGENT" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="起运地" prop="origin">
              <el-input v-model="quickForm.origin" data-testid="order-origin" placeholder="如：上海嘉定" clearable />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="目的地" prop="destination">
              <el-input v-model="quickForm.destination" data-testid="order-destination" placeholder="如：成都青白江" clearable />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="要求提货日" prop="requiredPickupDate">
              <DatePickerField
                v-model="quickForm.requiredPickupDate"
                testid="order-pickup-date"
                placeholder="选择提货日期"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="quickForm.remark" placeholder="选填，如：演示订单" clearable />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <CargoLinesEditor v-model="cargoLines" v0-testids />

      <div class="quick-summary">
        <div class="quick-summary__item">
          <span class="meta-label">货物行</span>
          <span>{{ cargoLines.length }} 行</span>
        </div>
        <div class="quick-summary__item">
          <span class="meta-label">合计箱量</span>
          <span>{{ totalContainerCount }} 箱</span>
        </div>
        <div class="quick-summary__item">
          <span class="meta-label">合计重量</span>
          <span>{{ totalWeight.toFixed(2) }} t</span>
        </div>
        <div class="quick-summary__item">
          <span class="meta-label">预计金额</span>
          <span class="muted">提交后由平台计价</span>
        </div>
      </div>

      <div class="form-actions">
        <el-button
          type="primary"
          size="large"
          data-testid="order-submit"
          :loading="submitting"
          @click="submitQuick"
        >
          提交订单
        </el-button>
        <el-button size="large" :disabled="submitting" @click="fillSample">填入示例</el-button>
        <el-button size="large" :disabled="submitting" @click="goBack">取消</el-button>
      </div>
    </div>

    <!-- 报价单转单 -->
    <div v-else class="card">
      <h3 class="card-title"><span class="card-title-text">选择已报价询价单</span></h3>
      <el-empty v-if="!quotesLoading && quotes.length === 0" description="暂无可转单的报价（状态为「已报价」）" :image-size="70" />
      <template v-else>
        <el-radio-group v-model="selectedQuoteId" class="quote-radio-group" @change="onQuoteChange">
          <el-radio
            v-for="quote in quotes"
            :key="quote.id"
            :value="quote.id"
            border
            class="quote-radio"
          >
            <div class="quote-radio__body">
              <div class="quote-radio__head">
                <span class="mono">{{ quote.quoteNo }}</span>
                <StatusTag kind="quote" :status="quote.status" :label="quote.statusLabel" size="small" />
              </div>
              <div class="quote-radio__meta muted">
                {{ quote.customer?.name }} · {{ quote.orderTypeLabel || orderTypeLabel(quote.orderType) }} ·
                {{ quote.routeName }}
              </div>
              <div class="quote-radio__amount amount">¥{{ formatAmount(quote.totalAmount) }}</div>
            </div>
          </el-radio>
        </el-radio-group>

        <div v-if="selectedQuote" class="selected-quote">
          <el-descriptions :column="3" border size="small">
            <el-descriptions-item label="报价号">
              <router-link :to="`/quotes/${selectedQuote.id}`" class="mono">{{ selectedQuote.quoteNo }}</router-link>
            </el-descriptions-item>
            <el-descriptions-item label="客户">{{ selectedQuote.customer?.name }}</el-descriptions-item>
            <el-descriptions-item label="报价总额">
              <span class="amount">¥{{ formatAmount(selectedQuote.totalAmount) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="订单类型">
              {{ selectedQuote.orderTypeLabel || orderTypeLabel(selectedQuote.orderType) }}
            </el-descriptions-item>
            <el-descriptions-item label="线路">{{ selectedQuote.routeName }}</el-descriptions-item>
            <el-descriptions-item label="箱型/箱量">
              {{ selectedQuote.containerType }} × {{ selectedQuote.containerCount }}
            </el-descriptions-item>
          </el-descriptions>

          <el-form label-position="top" class="quote-contract-form">
            <el-form-item label="关联合同（可选，需为已签署合同）">
              <el-select
                v-model="selectedContractId"
                clearable
                filterable
                placeholder="不关联合同则订单状态为「已确认」"
                style="width: 100%"
              >
                <el-option
                  v-for="contract in contracts"
                  :key="contract.id"
                  :label="`${contract.contractNo} · ${contract.title}`"
                  :value="contract.id"
                />
              </el-select>
            </el-form-item>
          </el-form>
        </div>

        <div class="form-actions">
          <el-button
            type="primary"
            size="large"
            data-testid="order-submit"
            :loading="submitting"
            :disabled="!selectedQuoteId"
            @click="submitQuoteOrder"
          >
            由报价单生成订单
          </el-button>
          <el-button size="large" :disabled="submitting" @click="goBack">取消</el-button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import DatePickerField from '../components/DatePickerField.vue';
import CargoLinesEditor from '../components/CargoLinesEditor.vue';
import StatusTag from '../components/StatusTag.vue';
import { createOrder } from '../api';
import { fetchContracts } from '../api/contract';
import { fetchCustomers } from '../api/master';
import { fetchQuotes } from '../api/quote';
import { ORDER_TYPE_OPTIONS, orderTypeLabel } from '../utils/constants';
import { formatAmount, toDateString } from '../utils/format';
import type {
  CargoLine,
  ContractListItem,
  Customer,
  OrderDetail,
  QuoteListItem,
} from '../types';

const router = useRouter();

const channel = ref<'QUICK' | 'QUOTE'>('QUICK');
const submitting = ref(false);
const errorText = ref('');

// ── 快速下单 ──
const quickFormRef = ref<FormInstance>();
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);

const quickForm = reactive({
  customerId: null as number | null,
  orderType: 'ROAD_RAIL_SEA',
  priority: 'NORMAL',
  origin: '上海嘉定',
  destination: '成都青白江',
  requiredPickupDate: toDateString(tomorrow),
  remark: '演示订单',
});

const cargoLines = ref<CargoLine[]>([
  {
    goodsName: '汽车配件',
    quantity: 1,
    unit: '箱',
    weightT: 18.2,
    volumeCbm: null,
    containerType: '40HQ',
    containerCount: 1,
    dangerousFlag: 0,
  },
]);

const customers = ref<Customer[]>([]);

const quickRules: FormRules = {
  origin: [{ required: true, message: '请输入起运地', trigger: 'blur' }],
  destination: [{ required: true, message: '请输入目的地', trigger: 'blur' }],
  requiredPickupDate: [{ required: true, message: '请选择要求提货日', trigger: 'change' }],
  orderType: [{ required: true, message: '请选择订单类型', trigger: 'change' }],
};

const totalContainerCount = computed(() =>
  cargoLines.value.reduce((sum, line) => sum + (Number(line.containerCount) || 0), 0),
);
const totalWeight = computed(() =>
  cargoLines.value.reduce((sum, line) => sum + (Number(line.weightT) || 0), 0),
);

// ── 报价转单 ──
const quotes = ref<QuoteListItem[]>([]);
const quotesLoading = ref(false);
const selectedQuoteId = ref<number | undefined>(undefined);
const contracts = ref<ContractListItem[]>([]);
const selectedContractId = ref<number | null>(null);

const selectedQuote = computed(
  () => quotes.value.find((quote) => quote.id === selectedQuoteId.value) ?? null,
);

async function loadQuotes(): Promise<void> {
  quotesLoading.value = true;
  try {
    const data = await fetchQuotes({ status: 'SENT', page: 1, pageSize: 50 });
    quotes.value = data.list;
    if (data.list.length > 0 && selectedQuoteId.value === undefined) {
      selectedQuoteId.value = data.list[0].id;
      await onQuoteChange(data.list[0].id);
    }
  } catch {
    quotes.value = [];
  } finally {
    quotesLoading.value = false;
  }
}

async function onQuoteChange(value: unknown): Promise<void> {
  const quoteId = Number(value);
  selectedQuoteId.value = Number.isFinite(quoteId) && quoteId > 0 ? quoteId : undefined;
  selectedContractId.value = null;
  const quote = quotes.value.find((item) => item.id === quoteId);
  if (!quote) return;
  try {
    const data = await fetchContracts({
      status: 'SIGNED',
      customerId: quote.customer.id,
      page: 1,
      pageSize: 50,
    });
    contracts.value = data.list;
  } catch {
    contracts.value = [];
  }
}

async function loadCustomers(): Promise<void> {
  try {
    const data = await fetchCustomers({ page: 1, pageSize: 100 });
    customers.value = data.list;
  } catch {
    customers.value = [];
  }
}

function onChannelChange(): void {
  errorText.value = '';
  if (channel.value === 'QUOTE' && quotes.value.length === 0) {
    void loadQuotes();
  }
}

function goBack(): void {
  void router.push('/orders');
}

function fillSample(): void {
  quickForm.origin = '上海嘉定';
  quickForm.destination = '成都青白江';
  quickForm.requiredPickupDate = toDateString(tomorrow);
  quickForm.remark = '演示订单';
  cargoLines.value = [
    {
      goodsName: '汽车配件',
      quantity: 1,
      unit: '箱',
      weightT: 18.2,
      volumeCbm: null,
      containerType: '40HQ',
      containerCount: 1,
      dangerousFlag: 0,
    },
  ];
}

function normalizeLines(): CargoLine[] {
  return cargoLines.value.map((line, index) => ({
    seq: index + 1,
    goodsCode: line.goodsCode || undefined,
    goodsName: line.goodsName.trim(),
    quantity: Number(line.quantity) || 0,
    unit: line.unit || '箱',
    weightT: Number(line.weightT) || 0,
    volumeCbm: line.volumeCbm === null || line.volumeCbm === undefined ? null : Number(line.volumeCbm),
    containerType: line.containerType || '40HQ',
    containerCount: Number(line.containerCount) || 0,
    dangerousFlag: line.dangerousFlag ? 1 : 0,
    packaging: line.packaging || null,
  }));
}

async function submitQuick(): Promise<void> {
  errorText.value = '';
  const formEl = quickFormRef.value;
  if (formEl) {
    try {
      await formEl.validate();
    } catch {
      ElMessage.warning('请检查基础信息填写');
      return;
    }
  }
  const lines = normalizeLines();
  if (lines.length === 0) {
    ElMessage.warning('请至少填写一行货物');
    return;
  }
  if (lines.some((line) => !line.goodsName)) {
    ElMessage.warning('请填写每行货物的名称');
    return;
  }
  if (lines.some((line) => line.weightT <= 0)) {
    ElMessage.warning('货物重量需大于 0');
    return;
  }
  if (lines.some((line) => line.containerCount <= 0)) {
    ElMessage.warning('箱量需大于 0');
    return;
  }

  const first = lines[0];
  submitting.value = true;
  try {
    const detail: OrderDetail = await createOrder({
      cargoName: first.goodsName,
      cargoWeight: Number(totalWeight.value.toFixed(2)),
      containerType: first.containerType,
      containerCount: totalContainerCount.value,
      origin: quickForm.origin.trim(),
      destination: quickForm.destination.trim(),
      requiredPickupDate: quickForm.requiredPickupDate,
      remark: quickForm.remark.trim() || undefined,
      cargoLines: lines,
      customerId: quickForm.customerId ?? undefined,
      orderType: quickForm.orderType,
      priority: quickForm.priority,
    });
    ElMessage.success(`下单成功：${detail.order.orderNo}`);
    await router.push(`/orders/${detail.order.id}`);
  } catch (error) {
    errorText.value = error instanceof Error && error.message ? error.message : '下单失败，请重试';
  } finally {
    submitting.value = false;
  }
}

async function submitQuoteOrder(): Promise<void> {
  if (!selectedQuoteId.value) {
    ElMessage.warning('请选择要转单的报价');
    return;
  }
  submitting.value = true;
  errorText.value = '';
  try {
    const detail: OrderDetail = await createOrder({
      quoteId: selectedQuoteId.value,
      contractId: selectedContractId.value ?? undefined,
    });
    ElMessage.success(`由报价单生成订单成功：${detail.order.orderNo}`);
    await router.push(`/orders/${detail.order.id}`);
  } catch (error) {
    errorText.value = error instanceof Error && error.message ? error.message : '报价单转单失败，请重试';
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void loadCustomers();
});
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}

.channel-card {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  padding: 14px 20px;
  margin-bottom: 16px;
}

.channel-tip {
  font-size: 12.5px;
}

.quick-summary {
  display: flex;
  align-items: center;
  gap: 34px;
  flex-wrap: wrap;
  margin-top: 14px;
  padding: 12px 16px;
  border-radius: 8px;
  background: #f7f9fc;
  font-size: 13px;
}

.quick-summary__item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px dashed var(--app-border);
}

.quote-radio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.quote-radio {
  width: 100%;
  margin-right: 0;
  height: auto;
  padding: 10px 14px;
  align-items: flex-start;
}

.quote-radio :deep(.el-radio__label) {
  width: 100%;
}

.quote-radio__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.quote-radio__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.quote-radio__meta {
  font-size: 12px;
}

.quote-radio__amount {
  font-size: 15px;
}

.selected-quote {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed var(--app-border);
}

.quote-contract-form {
  margin-top: 14px;
  max-width: 620px;
}
</style>
