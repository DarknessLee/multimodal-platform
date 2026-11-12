<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">合同管理</h2>
        <p class="page-subtitle">框架合同 / 单票合同 · 创建 → 发送 → 电子签章</p>
      </div>
      <div class="page-actions">
        <PermissionGuard permission="contract:create">
          <el-button type="primary" data-testid="contract-create-btn" @click="openCreate">新建合同</el-button>
        </PermissionGuard>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="card filter-bar">
      <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 140px" @change="search">
        <el-option v-for="option in CONTRACT_STATUS_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-input
        v-model="keyword"
        placeholder="搜索合同号 / 客户 / 标题"
        clearable
        style="width: 300px"
        @keyup.enter="search"
        @clear="search"
      />
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="reset">重置</el-button>
      <span class="muted filter-tip">共 {{ total }} 条</span>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card table-card">
      <el-table v-loading="loading" :data="rows" size="small" border stripe>
        <el-table-column label="合同号" min-width="150">
          <template #default="{ row }">
            <span class="row-link mono" data-testid="contract-row" @click="goDetail(row.id)">
              {{ row.contractNo }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="customer.name" label="客户" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">{{ row.customer?.name || '—' }}</template>
        </el-table-column>
        <el-table-column prop="title" label="合同标题" min-width="220" show-overflow-tooltip />
        <el-table-column label="类型" width="98" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.contractTypeLabel || contractTypeLabel(row.contractType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="有效期" width="190">
          <template #default="{ row }">
            {{ formatDate(row.effectiveFrom) }} ~ {{ formatDate(row.effectiveTo) }}
          </template>
        </el-table-column>
        <el-table-column prop="paymentTerms" label="账期" width="100" align="center" />
        <el-table-column label="信用额度(元)" width="130" align="right">
          <template #default="{ row }">
            <span class="amount">{{ formatAmount(row.creditLimit) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="折扣" width="80" align="right">
          <template #default="{ row }">{{ Number(row.discountRate).toFixed(2) }}%</template>
        </el-table-column>
        <el-table-column label="状态" width="96" align="center">
          <template #default="{ row }">
            <StatusTag data-testid="contract-status" kind="contract" :status="row.status" :label="row.statusLabel" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="签署人" width="90" align="center">
          <template #default="{ row }">{{ row.signerName || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="230" align="center">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="goDetail(row.id)">详情</el-button>
            <PermissionGuard permission="contract:send">
              <el-button
                v-if="row.status === 'DRAFT'"
                size="small"
                text
                type="primary"
                data-testid="contract-send-btn"
                :loading="actingId === row.id"
                @click="send(row as ContractListItem)"
              >
                发送
              </el-button>
            </PermissionGuard>
            <PermissionGuard permission="contract:sign">
              <el-button
                v-if="row.status === 'PENDING_SIGN'"
                size="small"
                text
                type="success"
                data-testid="contract-sign-btn"
                @click="openSign(row as ContractListItem)"
              >
                签署
              </el-button>
            </PermissionGuard>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无合同数据" :image-size="70" />
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

    <ContractSignDialog
      v-model="signVisible"
      :contract-id="signContractId"
      :contract-no="signContractNo"
      @signed="onSigned"
    />

    <!-- 新建合同 -->
    <el-dialog v-model="createVisible" title="新建合同" width="640px" :close-on-click-modal="false">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="客户" prop="customerId">
              <el-select v-model="createForm.customerId" filterable placeholder="选择客户" style="width: 100%">
                <el-option v-for="customer in customers" :key="customer.id" :label="customer.name" :value="customer.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="合同类型" prop="contractType">
              <el-select v-model="createForm.contractType" style="width: 100%">
                <el-option label="框架合同" value="FRAMEWORK" />
                <el-option label="单票合同" value="SPOT" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="合同标题" prop="title">
              <el-input v-model="createForm.title" placeholder="如：2026 年度多式联运框架合同" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="生效日期" prop="effectiveFrom">
              <el-date-picker v-model="createForm.effectiveFrom" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="失效日期" prop="effectiveTo">
              <el-date-picker v-model="createForm.effectiveTo" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="账期" prop="paymentTerms">
              <el-select v-model="createForm.paymentTerms" style="width: 100%">
                <el-option v-for="option in PAYMENT_TERMS_OPTIONS" :key="option.value" :label="option.label" :value="option.label" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="信用额度（元）">
              <el-input
                :model-value="String(createForm.creditLimit ?? 0)"
                type="number"
                min="0"
                @update:model-value="createForm.creditLimit = Number($event)"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="折扣率（%）">
              <el-input
                :model-value="String(createForm.discountRate ?? 0)"
                type="number"
                min="0"
                @update:model-value="createForm.discountRate = Number($event)"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button :disabled="creating" @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import PermissionGuard from '../components/PermissionGuard.vue';
import ContractSignDialog from '../components/ContractSignDialog.vue';
import { createContract, fetchContracts, sendContract } from '../api/contract';
import { fetchCustomers } from '../api/master';
import {
  CONTRACT_STATUS_OPTIONS,
  PAYMENT_TERMS_OPTIONS,
  contractTypeLabel,
} from '../utils/constants';
import { formatAmount, formatDate } from '../utils/format';
import type { ContractListItem, CreateContractPayload, Customer } from '../types';

const router = useRouter();

const loading = ref(false);
const errorText = ref('');
const rows = ref<ContractListItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const keyword = ref('');
const statusFilter = ref('');
const actingId = ref<number | null>(null);

const signVisible = ref(false);
const signContractId = ref<number | null>(null);
const signContractNo = ref('');

const createVisible = ref(false);
const creating = ref(false);
const createFormRef = ref<FormInstance>();
const customers = ref<Customer[]>([]);
const today = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
const yearEnd = `${today.getFullYear()}-12-31`;

const createForm = reactive<CreateContractPayload>({
  customerId: 1,
  contractType: 'FRAMEWORK',
  title: `${today.getFullYear()} 年度多式联运框架合同`,
  effectiveFrom: todayStr,
  effectiveTo: yearEnd,
  paymentTerms: '月结30天',
  creditLimit: 2000000,
  discountRate: 3,
});

const createRules: FormRules = {
  customerId: [{ required: true, message: '请选择客户', trigger: 'change' }],
  contractType: [{ required: true, message: '请选择合同类型', trigger: 'change' }],
  title: [{ required: true, message: '请输入合同标题', trigger: 'blur' }],
  effectiveFrom: [{ required: true, message: '请选择生效日期', trigger: 'change' }],
  effectiveTo: [{ required: true, message: '请选择失效日期', trigger: 'change' }],
  paymentTerms: [{ required: true, message: '请选择账期', trigger: 'change' }],
};

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchContracts({
      status: statusFilter.value || undefined,
      keyword: keyword.value.trim() || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    rows.value = [];
    total.value = 0;
    errorText.value = error instanceof Error && error.message ? error.message : '合同列表加载失败';
  } finally {
    loading.value = false;
  }
}

function search(): void {
  page.value = 1;
  void load();
}

function reset(): void {
  keyword.value = '';
  statusFilter.value = '';
  search();
}

function goDetail(id: number): void {
  void router.push(`/contracts/${id}`);
}

async function send(row: ContractListItem): Promise<void> {
  actingId.value = row.id;
  try {
    await sendContract(row.id);
    ElMessage.success(`合同已发送待签署：${row.contractNo}`);
    await load();
  } finally {
    actingId.value = null;
  }
}

function openSign(row: ContractListItem): void {
  signContractId.value = row.id;
  signContractNo.value = row.contractNo;
  signVisible.value = true;
}

async function onSigned(): Promise<void> {
  await load();
}

async function openCreate(): Promise<void> {
  createVisible.value = true;
  try {
    const data = await fetchCustomers({ page: 1, pageSize: 100 });
    customers.value = data.list;
    if (data.list.length > 0) createForm.customerId = data.list[0].id;
  } catch {
    customers.value = [];
  }
}

async function submitCreate(): Promise<void> {
  const formEl = createFormRef.value;
  if (!formEl) return;
  try {
    await formEl.validate();
  } catch {
    return;
  }
  creating.value = true;
  try {
    const contract = await createContract({
      ...createForm,
      customerId: Number(createForm.customerId),
      creditLimit: Number(createForm.creditLimit) || 0,
      discountRate: Number(createForm.discountRate) || 0,
    });
    ElMessage.success(`合同创建成功：${contract.contractNo}`);
    createVisible.value = false;
    await router.push(`/contracts/${contract.id}`);
  } finally {
    creating.value = false;
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

.row-link {
  color: var(--app-primary);
  cursor: pointer;
}

.row-link:hover {
  text-decoration: underline;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
