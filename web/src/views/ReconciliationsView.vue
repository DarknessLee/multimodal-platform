<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">对账管理</h2>
        <p class="page-subtitle">按交易对手 / 周期汇总应付账单 → 发送 → 确认或提差异</p>
      </div>
      <div class="page-actions">
        <PermissionGuard permission="recon:create">
          <el-button type="primary" data-testid="recon-create" @click="openCreate">新建对账单</el-button>
        </PermissionGuard>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="card filter-bar">
      <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 140px" @change="search">
        <el-option v-for="option in RECON_STATUS_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-select v-model="typeFilter" placeholder="全部对手方类型" clearable style="width: 160px" @change="search">
        <el-option label="承运商" value="CARRIER" />
        <el-option label="客户" value="CUSTOMER" />
      </el-select>
      <span class="muted filter-tip">共 {{ total }} 张对账单</span>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card table-card">
      <el-table v-loading="loading" :data="rows" size="small" border stripe>
        <el-table-column label="对账单号" min-width="160">
          <template #default="{ row }">
            <span class="row-link mono" data-testid="recon-row" @click="openDetail(row.id)">
              {{ row.reconNo }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="对手方" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.counterparty?.name || '—' }}</template>
        </el-table-column>
        <el-table-column label="对账周期" width="200">
          <template #default="{ row }">{{ formatDate(row.periodStart) }} ~ {{ formatDate(row.periodEnd) }}</template>
        </el-table-column>
        <el-table-column label="对账总额(元)" width="130" align="right">
          <template #default="{ row }"><span class="amount">{{ formatAmount(row.totalAmount) }}</span></template>
        </el-table-column>
        <el-table-column label="确认额(元)" width="120" align="right">
          <template #default="{ row }">{{ formatAmount(row.confirmedAmount) }}</template>
        </el-table-column>
        <el-table-column label="差异额(元)" width="120" align="right">
          <template #default="{ row }">
            <span :class="Number(row.differenceAmount) !== 0 ? 'error-text' : ''">
              {{ formatAmount(row.differenceAmount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="reconStatusTagType(row.status)" size="small" effect="plain" data-testid="recon-status">
              {{ row.statusLabel || reconStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发送/确认时间" width="150">
          <template #default="{ row }">{{ formatDateTime(row.confirmedAt || row.sentAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="center">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openDetail(row.id)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无对账单数据" :image-size="64" />
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

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailVisible" title="对账单详情" size="640px">
      <div v-loading="detailLoading">
        <template v-if="detail">
          <div class="recon-head">
            <div>
              <div class="meta-label">对账单号</div>
              <div class="mono recon-no">{{ detail.recon.reconNo }}</div>
            </div>
            <el-tag :type="reconStatusTagType(detail.recon.status)" effect="dark">
              {{ detail.recon.statusLabel || reconStatusLabel(detail.recon.status) }}
            </el-tag>
            <span class="amount-lg">¥{{ formatAmount(detail.recon.totalAmount) }}</span>
          </div>

          <el-descriptions :column="2" border size="small" class="mt-12">
            <el-descriptions-item label="对手方">{{ detail.recon.counterparty?.name || '—' }}</el-descriptions-item>
            <el-descriptions-item label="对账周期">
              {{ formatDate(detail.recon.periodStart) }} ~ {{ formatDate(detail.recon.periodEnd) }}
            </el-descriptions-item>
            <el-descriptions-item label="确认金额">¥{{ formatAmount(detail.recon.confirmedAmount) }}</el-descriptions-item>
            <el-descriptions-item label="差异金额">¥{{ formatAmount(detail.recon.differenceAmount) }}</el-descriptions-item>
            <el-descriptions-item label="发送时间">{{ formatDateTime(detail.recon.sentAt) }}</el-descriptions-item>
            <el-descriptions-item label="确认时间">{{ formatDateTime(detail.recon.confirmedAt) }}</el-descriptions-item>
          </el-descriptions>

          <div class="detail-actions">
            <PermissionGuard permission="recon:send">
              <el-button
                v-if="detail.recon.status === 'DRAFT'"
                type="primary"
                data-testid="recon-send"
                :loading="acting"
                @click="send"
              >
                发送对账单
              </el-button>
            </PermissionGuard>
            <PermissionGuard permission="recon:confirm">
              <el-button
                v-if="detail.recon.status === 'SENT'"
                type="success"
                data-testid="recon-confirm"
                :loading="acting"
                @click="confirm"
              >
                确认对账（全额）
              </el-button>
            </PermissionGuard>
            <PermissionGuard permission="recon:dispute">
              <el-button
                v-if="detail.recon.status === 'SENT'"
                type="warning"
                data-testid="recon-dispute"
                :disabled="acting"
                @click="openDispute"
              >
                提出差异
              </el-button>
            </PermissionGuard>
          </div>

          <h4 class="sub-title">对账明细（{{ detail.items.length }}）</h4>
          <el-table :data="detail.items" size="small" border stripe>
            <el-table-column label="账单号" min-width="160">
              <template #default="{ row }">
                <span class="mono" data-testid="recon-item">{{ row.billNo }}</span>
              </template>
            </el-table-column>
            <el-table-column label="金额(元)" width="120" align="right">
              <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="确认额(元)" width="120" align="right">
              <template #default="{ row }">{{ formatAmount(row.confirmedAmount) }}</template>
            </el-table-column>
            <el-table-column label="差异原因" min-width="170">
              <template #default="{ row }">{{ row.differenceReason || '—' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'DIFF' ? 'danger' : 'success'" size="small" effect="plain">
                  {{ row.status === 'DIFF' ? '差异' : '匹配' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </div>
    </el-drawer>

    <!-- 新建对账单 -->
    <el-dialog v-model="createVisible" title="新建对账单" width="560px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="对手方类型">
              <el-select v-model="createForm.counterpartyType" style="width: 100%" @change="loadCounterparties">
                <el-option label="承运商" value="CARRIER" />
                <el-option label="客户" value="CUSTOMER" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="对手方">
              <el-select v-model="createForm.counterpartyId" filterable placeholder="选择对手方" style="width: 100%">
                <el-option v-for="item in counterparties" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="周期开始">
              <el-date-picker v-model="createForm.periodStart" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="周期结束">
              <el-date-picker v-model="createForm.periodEnd" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <p class="muted create-tip">系统将汇总该对手方在周期内的应付账单生成对账明细。</p>
      </el-form>
      <template #footer>
        <el-button :disabled="creating" @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">生成对账单</el-button>
      </template>
    </el-dialog>

    <!-- 差异弹窗 -->
    <el-dialog v-model="disputeVisible" title="提出对账差异" width="500px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="差异原因">
          <el-input v-model="disputeReason" type="textarea" :rows="3" placeholder="如：运杂费差异 200 元" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="acting" @click="disputeVisible = false">取消</el-button>
        <el-button type="warning" :loading="acting" @click="submitDispute">提交差异</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PermissionGuard from '../components/PermissionGuard.vue';
import {
  confirmReconciliation,
  createReconciliation,
  disputeReconciliation,
  fetchReconciliation,
  fetchReconciliations,
  sendReconciliation,
} from '../api/reconciliation';
import { fetchPartners, fetchCustomers } from '../api/master';
import {
  RECON_STATUS_OPTIONS,
  reconStatusLabel,
  reconStatusTagType,
} from '../utils/constants';
import { formatAmount, formatDate, formatDateTime } from '../utils/format';
import type { ReconciliationDetail, ReconciliationListItem } from '../types';

const loading = ref(false);
const errorText = ref('');
const rows = ref<ReconciliationListItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const statusFilter = ref('');
const typeFilter = ref('');

const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<ReconciliationDetail | null>(null);
const acting = ref(false);

const createVisible = ref(false);
const creating = ref(false);
const counterparties = ref<Array<{ id: number; name: string }>>([]);
const createForm = reactive({
  counterpartyType: 'CARRIER',
  counterpartyId: null as number | null,
  periodStart: monthStart(),
  periodEnd: todayStr(),
});

const disputeVisible = ref(false);
const disputeReason = ref('运杂费差异，需复核');

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchReconciliations({
      status: statusFilter.value || undefined,
      counterpartyType: typeFilter.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    rows.value = [];
    total.value = 0;
    errorText.value = error instanceof Error && error.message ? error.message : '对账单加载失败';
  } finally {
    loading.value = false;
  }
}

function search(): void {
  page.value = 1;
  void load();
}

async function openDetail(id: number): Promise<void> {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    detail.value = await fetchReconciliation(id);
  } catch {
    detail.value = null;
  } finally {
    detailLoading.value = false;
  }
}

async function loadCounterparties(): Promise<void> {
  try {
    if (createForm.counterpartyType === 'CUSTOMER') {
      const data = await fetchCustomers({ page: 1, pageSize: 100 });
      counterparties.value = data.list.map((item) => ({ id: item.id, name: item.name }));
    } else {
      const data = await fetchPartners({ page: 1, pageSize: 100 });
      counterparties.value = data.list
        .filter((item) => ['ROAD_CARRIER', 'RAIL_OPERATOR', 'SEA_CARRIER'].includes(item.type))
        .map((item) => ({ id: item.id, name: item.name }));
    }
    createForm.counterpartyId = counterparties.value[0]?.id ?? null;
  } catch {
    counterparties.value = [];
  }
}

async function openCreate(): Promise<void> {
  createVisible.value = true;
  await loadCounterparties();
}

async function submitCreate(): Promise<void> {
  if (!createForm.counterpartyId) {
    ElMessage.warning('请选择对手方');
    return;
  }
  creating.value = true;
  try {
    const result = await createReconciliation({
      counterpartyType: createForm.counterpartyType,
      counterpartyId: createForm.counterpartyId,
      periodStart: createForm.periodStart,
      periodEnd: createForm.periodEnd,
    });
    ElMessage.success(`对账单创建成功：${result.recon.reconNo}（${result.items.length} 条明细）`);
    createVisible.value = false;
    await load();
    await openDetail(result.recon.id);
  } finally {
    creating.value = false;
  }
}

async function send(): Promise<void> {
  if (!detail.value) return;
  acting.value = true;
  try {
    detail.value = await sendReconciliation(detail.value.recon.id);
    ElMessage.success('对账单已发送，等待对手方确认');
    await load();
  } finally {
    acting.value = false;
  }
}

async function confirm(): Promise<void> {
  if (!detail.value) return;
  acting.value = true;
  try {
    const totalAmount = Number(detail.value.recon.totalAmount);
    const items = detail.value.items.map((item) => ({
      billId: item.billId,
      confirmedAmount: Number(item.amount),
    }));
    detail.value = await confirmReconciliation(detail.value.recon.id, {
      confirmedAmount: totalAmount,
      items,
    });
    ElMessage.success('对账确认成功');
    await load();
  } finally {
    acting.value = false;
  }
}

function openDispute(): void {
  disputeReason.value = '运杂费差异，需复核';
  disputeVisible.value = true;
}

async function submitDispute(): Promise<void> {
  if (!detail.value) return;
  const reason = disputeReason.value.trim();
  if (!reason) {
    ElMessage.warning('请填写差异原因');
    return;
  }
  acting.value = true;
  try {
    const items = detail.value.items.map((item) => ({
      billId: item.billId,
      differenceReason: reason,
    }));
    detail.value = await disputeReconciliation(detail.value.recon.id, { reason, items });
    disputeVisible.value = false;
    ElMessage.success('差异已提交');
    await load();
  } finally {
    acting.value = false;
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

.error-text {
  color: #f56c6c;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.recon-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--app-border);
}

.recon-no {
  font-size: 15px;
  font-weight: 600;
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 14px;
}

.sub-title {
  margin: 16px 0 10px;
  font-size: 13px;
  font-weight: 600;
}

.create-tip {
  margin: 0;
  font-size: 12px;
}
</style>
