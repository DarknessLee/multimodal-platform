<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">保险保单</h2>
        <p class="page-subtitle">货运险投保（保险机构）· 保费 = 保额 × 费率</p>
      </div>
      <div class="page-actions">
        <PermissionGuard permission="insurance:create">
          <el-button type="primary" data-testid="insurance-create" @click="openCreate">投保</el-button>
        </PermissionGuard>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="card filter-bar">
      <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 140px" @change="search">
        <el-option v-for="option in INSURANCE_STATUS_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <span class="muted filter-tip">共 {{ total }} 张保单</span>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card table-card">
      <el-table v-loading="loading" :data="rows" size="small" border stripe>
        <el-table-column label="保单号" min-width="160">
          <template #default="{ row }">
            <span class="mono" data-testid="insurance-row">{{ row.policyNo }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="orderNo" label="订单号" min-width="150">
          <template #default="{ row }"><span class="mono">{{ row.orderNo || '—' }}</span></template>
        </el-table-column>
        <el-table-column label="运单号" min-width="150">
          <template #default="{ row }"><span class="mono">{{ row.waybillNo || '—' }}</span></template>
        </el-table-column>
        <el-table-column prop="insurerName" label="保险人" min-width="200" show-overflow-tooltip />
        <el-table-column label="保额(元)" width="140" align="right">
          <template #default="{ row }">{{ formatAmount(row.insuredAmount) }}</template>
        </el-table-column>
        <el-table-column label="费率(%)" width="90" align="right">
          <template #default="{ row }">{{ Number(row.rate).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="保费(元)" width="110" align="right">
          <template #default="{ row }"><span class="amount">{{ formatAmount(row.premium) }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="96" align="center">
          <template #default="{ row }">
            <el-tag :type="insuranceStatusTagType(row.status)" size="small" effect="plain" data-testid="insurance-status">
              {{ row.statusLabel || insuranceStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="保障期间" width="210">
          <template #default="{ row }">
            {{ formatDate(row.effectiveFrom) }} ~ {{ formatDate(row.effectiveTo) }}
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无保单数据" :image-size="64" />
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          background
          @current-change="load"
        />
      </div>
    </div>

    <!-- 投保 -->
    <el-dialog v-model="createVisible" title="货运险投保" width="560px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="订单">
          <el-select v-model="createForm.orderId" filterable placeholder="选择订单" style="width: 100%">
            <el-option
              v-for="order in orderOptions"
              :key="order.id"
              :label="`${order.orderNo} · ${order.cargoName} · ${order.origin} → ${order.destination}`"
              :value="order.id"
            />
          </el-select>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="保额（元）">
              <el-input
                :model-value="String(createForm.insuredAmount)"
                type="number"
                min="0"
                @update:model-value="createForm.insuredAmount = Number($event)"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="费率（%）">
              <el-input
                :model-value="String(createForm.rate)"
                type="number"
                min="0"
                step="0.01"
                @update:model-value="createForm.rate = Number($event)"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <p class="premium-preview">
          预估保费：<span class="amount">¥{{ formatAmount(premium) }}</span>
        </p>
      </el-form>
      <template #footer>
        <el-button :disabled="creating" @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">确认投保</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import PermissionGuard from '../components/PermissionGuard.vue';
import { createInsurancePolicy, fetchInsurancePolicies } from '../api/insurance';
import { fetchOrders } from '../api';
import {
  INSURANCE_STATUS_OPTIONS,
  insuranceStatusLabel,
  insuranceStatusTagType,
} from '../utils/constants';
import { formatAmount, formatDate } from '../utils/format';
import type { InsurancePolicy, OrderListItem } from '../types';

const route = useRoute();

const loading = ref(false);
const errorText = ref('');
const rows = ref<InsurancePolicy[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const statusFilter = ref('');

const createVisible = ref(false);
const creating = ref(false);
const orderOptions = ref<OrderListItem[]>([]);
const createForm = reactive({
  orderId: null as number | null,
  insuredAmount: 500000,
  rate: 0.12,
});

const premium = computed(() =>
  Number(((createForm.insuredAmount * createForm.rate) / 100).toFixed(2)),
);

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchInsurancePolicies({
      status: statusFilter.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    rows.value = [];
    total.value = 0;
    errorText.value = error instanceof Error && error.message ? error.message : '保单列表加载失败';
  } finally {
    loading.value = false;
  }
}

function search(): void {
  page.value = 1;
  void load();
}

async function loadOrders(selectId?: number): Promise<void> {
  try {
    const data = await fetchOrders();
    orderOptions.value = data;
    const target = data.find((order) => order.id === selectId) ?? data[0];
    createForm.orderId = target?.id ?? null;
  } catch {
    orderOptions.value = [];
  }
}

async function openCreate(): Promise<void> {
  createVisible.value = true;
  await loadOrders();
}

async function submitCreate(): Promise<void> {
  if (!createForm.orderId) {
    ElMessage.warning('请选择订单');
    return;
  }
  if (!createForm.insuredAmount || createForm.insuredAmount <= 0) {
    ElMessage.warning('请输入有效保额');
    return;
  }
  creating.value = true;
  try {
    const policy = await createInsurancePolicy({
      orderId: createForm.orderId,
      insuredAmount: createForm.insuredAmount,
      rate: createForm.rate,
    });
    ElMessage.success(`投保成功：${policy.policyNo}，保费 ¥${formatAmount(policy.premium)}`);
    createVisible.value = false;
    await load();
  } finally {
    creating.value = false;
  }
}

onMounted(async () => {
  await load();
  const orderId = Number(route.query.orderId);
  if (Number.isFinite(orderId) && orderId > 0) {
    createVisible.value = true;
    await loadOrders(orderId);
  }
});
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}

.filter-tip {
  margin-left: auto;
  font-size: 12px;
}

.retry-btn {
  margin-top: 6px;
}

.table-card {
  padding-top: 14px;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.premium-preview {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-regular);
}
</style>
