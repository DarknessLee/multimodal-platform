<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">保理工作台</h2>
        <p class="page-subtitle">基于应收账单申请保理 → 审批（手续费）→ 放款</p>
      </div>
      <div class="page-actions">
        <PermissionGuard permission="factoring:apply">
          <el-button type="primary" data-testid="factoring-apply" @click="openApply">保理申请</el-button>
        </PermissionGuard>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="card filter-bar">
      <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 150px" @change="search">
        <el-option v-for="option in FACTORING_STATUS_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <span class="muted filter-tip">共 {{ total }} 笔保理申请</span>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card table-card">
      <el-table v-loading="loading" :data="rows" size="small" border stripe>
        <el-table-column label="申请单号" min-width="160">
          <template #default="{ row }">
            <span class="mono" data-testid="factoring-row">{{ row.appNo }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="orderNo" label="订单号" min-width="150">
          <template #default="{ row }"><span class="mono">{{ row.orderNo || '—' }}</span></template>
        </el-table-column>
        <el-table-column label="账单号" min-width="150">
          <template #default="{ row }"><span class="mono">{{ row.billNo || '—' }}</span></template>
        </el-table-column>
        <el-table-column prop="applicantName" label="申请人" min-width="170" show-overflow-tooltip />
        <el-table-column prop="financePartnerName" label="资金方" min-width="150" show-overflow-tooltip />
        <el-table-column label="金额(元)" width="130" align="right">
          <template #default="{ row }"><span class="amount">{{ formatAmount(row.amount) }}</span></template>
        </el-table-column>
        <el-table-column label="贴现率" width="90" align="right">
          <template #default="{ row }">{{ Number(row.discountRate).toFixed(2) }}%</template>
        </el-table-column>
        <el-table-column label="手续费(元)" width="110" align="right">
          <template #default="{ row }">{{ formatAmount(row.fee) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="factoringStatusTagType(row.status)" size="small" effect="plain">
              {{ row.statusLabel || factoringStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="140">
          <template #default="{ row }">{{ formatDateTime(row.appliedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" align="center">
          <template #default="{ row }">
            <PermissionGuard permission="factoring:approve">
              <el-button
                v-if="row.status === 'SUBMITTED'"
                size="small"
                text
                type="primary"
                data-testid="factoring-approve"
                @click="openApprove(row as FactoringApplication)"
              >
                审批
              </el-button>
              <el-button
                v-if="row.status === 'APPROVED'"
                size="small"
                text
                type="success"
                data-testid="factoring-settle"
                :loading="settlingId === row.id"
                @click="settle(row as FactoringApplication)"
              >
                放款
              </el-button>
            </PermissionGuard>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无保理申请" :image-size="64" />
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

    <!-- 保理申请 -->
    <el-dialog v-model="applyVisible" title="保理申请" width="560px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-row :gutter="16">
          <el-col :span="24">
            <el-form-item label="应收账单">
              <el-select v-model="applyForm.billId" filterable placeholder="选择应收账单" style="width: 100%" @change="onBillChange">
                <el-option
                  v-for="bill in billOptions"
                  :key="bill.id"
                  :label="`${bill.billNo} · ${bill.counterparty?.name || ''} · ¥${formatAmount(bill.totalAmount)}`"
                  :value="bill.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="资金方">
              <el-select v-model="applyForm.financePartnerId" filterable placeholder="选择金融机构" style="width: 100%">
                <el-option v-for="partner in financePartners" :key="partner.id" :label="partner.name" :value="partner.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="申请金额（元）">
              <el-input
                :model-value="String(applyForm.amount)"
                type="number"
                min="0"
                @update:model-value="applyForm.amount = Number($event)"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="贴现率（%）">
              <el-input
                :model-value="String(applyForm.discountRate)"
                type="number"
                min="0"
                step="0.1"
                @update:model-value="applyForm.discountRate = Number($event)"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预估手续费（元）">
              <span class="amount">¥{{ formatAmount(estimatedFee) }}</span>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button :disabled="applying" @click="applyVisible = false">取消</el-button>
        <el-button type="primary" :loading="applying" @click="submitApply">提交申请</el-button>
      </template>
    </el-dialog>

    <!-- 审批 -->
    <el-dialog v-model="approveVisible" title="保理审批" width="480px" :close-on-click-modal="false">
      <div v-if="approveTarget" class="approve-info">
        <div class="approve-info__row"><span class="meta-label">申请单号</span><span class="mono">{{ approveTarget.appNo }}</span></div>
        <div class="approve-info__row"><span class="meta-label">申请金额</span><span class="amount">¥{{ formatAmount(approveTarget.amount) }}</span></div>
      </div>
      <el-form label-position="top">
        <el-form-item label="审批结果">
          <el-radio-group v-model="approveForm.approved">
            <el-radio :value="true">通过</el-radio>
            <el-radio :value="false">拒绝</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="approving" @click="approveVisible = false">取消</el-button>
        <el-button type="primary" :loading="approving" @click="submitApprove">提交审批</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PermissionGuard from '../components/PermissionGuard.vue';
import {
  applyFactoring,
  approveFactoring,
  fetchFactoringApplications,
  settleFactoring,
} from '../api/factoring';
import { fetchBills } from '../api/billing';
import { fetchPartners } from '../api/master';
import {
  FACTORING_STATUS_OPTIONS,
  factoringStatusLabel,
  factoringStatusTagType,
} from '../utils/constants';
import { formatAmount, formatDateTime } from '../utils/format';
import type { BillListItem, FactoringApplication } from '../types';

const loading = ref(false);
const errorText = ref('');
const rows = ref<FactoringApplication[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const statusFilter = ref('');
const settlingId = ref<number | null>(null);

const applyVisible = ref(false);
const applying = ref(false);
const billOptions = ref<BillListItem[]>([]);
const financePartners = ref<Array<{ id: number; name: string }>>([]);
const applyForm = reactive({
  billId: null as number | null,
  financePartnerId: null as number | null,
  amount: 0,
  discountRate: 6.5,
});

const approveVisible = ref(false);
const approving = ref(false);
const approveTarget = ref<FactoringApplication | null>(null);
const approveForm = reactive({ approved: true });

const estimatedFee = computed(() =>
  Number(((applyForm.amount * applyForm.discountRate) / 100).toFixed(2)),
);

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchFactoringApplications({
      status: statusFilter.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    rows.value = [];
    total.value = 0;
    errorText.value = error instanceof Error && error.message ? error.message : '保理申请加载失败';
  } finally {
    loading.value = false;
  }
}

function search(): void {
  page.value = 1;
  void load();
}

async function openApply(): Promise<void> {
  applyVisible.value = true;
  try {
    const [billData, partnerData] = await Promise.all([
      fetchBills({ billType: 'RECEIVABLE', page: 1, pageSize: 100 }),
      fetchPartners({ type: 'FINANCE', page: 1, pageSize: 100 }),
    ]);
    billOptions.value = billData.list.filter((bill) => bill.status !== 'PAID' && bill.status !== 'VOID');
    financePartners.value = partnerData.list.map((partner) => ({ id: partner.id, name: partner.name }));
    const first = billOptions.value[0] ?? null;
    applyForm.billId = first?.id ?? null;
    applyForm.amount = Number(first?.totalAmount ?? 0);
    applyForm.financePartnerId = financePartners.value[0]?.id ?? null;
  } catch {
    billOptions.value = [];
    financePartners.value = [];
  }
}

function onBillChange(billId: number): void {
  const bill = billOptions.value.find((item) => item.id === billId);
  if (bill) applyForm.amount = Number(bill.totalAmount);
}

async function submitApply(): Promise<void> {
  if (!applyForm.billId || !applyForm.financePartnerId) {
    ElMessage.warning('请选择应收账单与资金方');
    return;
  }
  applying.value = true;
  try {
    const result = await applyFactoring({
      billId: applyForm.billId,
      financePartnerId: applyForm.financePartnerId,
      amount: applyForm.amount,
      discountRate: applyForm.discountRate,
    });
    ElMessage.success(`保理申请已提交：${result.appNo}`);
    applyVisible.value = false;
    await load();
  } finally {
    applying.value = false;
  }
}

function openApprove(row: FactoringApplication): void {
  approveTarget.value = row;
  approveForm.approved = true;
  approveVisible.value = true;
}

async function submitApprove(): Promise<void> {
  if (!approveTarget.value) return;
  approving.value = true;
  try {
    const result = await approveFactoring(approveTarget.value.id, approveForm.approved);
    ElMessage.success(approveForm.approved ? `审批通过：${result.appNo}` : `已拒绝：${result.appNo}`);
    approveVisible.value = false;
    await load();
  } finally {
    approving.value = false;
  }
}

async function settle(row: FactoringApplication): Promise<void> {
  settlingId.value = row.id;
  try {
    await settleFactoring(row.id);
    ElMessage.success(`保理放款成功：${row.appNo}`);
    await load();
  } finally {
    settlingId.value = null;
  }
}

onMounted(load);
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

.approve-info {
  background: #f7f9fc;
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 14px;
}

.approve-info__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  padding: 3px 0;
}
</style>
