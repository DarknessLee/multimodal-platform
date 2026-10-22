<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">发票管理</h2>
        <p class="page-subtitle">按应收账单开具电子发票（Mock 税务适配器）· 已开具可作废</p>
      </div>
      <div class="page-actions">
        <PermissionGuard permission="invoice:issue">
          <el-button type="primary" data-testid="invoice-issue" @click="openIssue">开具发票</el-button>
        </PermissionGuard>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="card filter-bar">
      <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 140px" @change="search">
        <el-option v-for="option in INVOICE_STATUS_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <span class="muted filter-tip">共 {{ total }} 张发票</span>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card table-card">
      <el-table v-loading="loading" :data="rows" size="small" border stripe>
        <el-table-column label="发票号" min-width="160">
          <template #default="{ row }">
            <span class="mono" data-testid="invoice-row">{{ row.invoiceNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="140">
          <template #default="{ row }">{{ row.invoiceTypeLabel || invoiceTypeLabel(row.invoiceType) }}</template>
        </el-table-column>
        <el-table-column label="账单号" min-width="150">
          <template #default="{ row }">
            <span class="mono">{{ row.billNo }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="buyerName" label="购方" min-width="200" show-overflow-tooltip />
        <el-table-column prop="sellerName" label="销方" min-width="160" show-overflow-tooltip />
        <el-table-column label="金额(元)" width="120" align="right">
          <template #default="{ row }">
            <span data-testid="invoice-amount">{{ formatAmount(row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="税率" width="80" align="right">
          <template #default="{ row }">{{ Number(row.taxRate).toFixed(0) }}%</template>
        </el-table-column>
        <el-table-column label="税额(元)" width="110" align="right">
          <template #default="{ row }">{{ formatAmount(row.taxAmount) }}</template>
        </el-table-column>
        <el-table-column label="价税合计(元)" width="130" align="right">
          <template #default="{ row }">
            <span class="amount">{{ formatAmount(row.totalAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="96" align="center">
          <template #default="{ row }">
            <el-tag :type="invoiceStatusTagType(row.status)" size="small" effect="plain" data-testid="invoice-status">
              {{ row.statusLabel || invoiceStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="开具时间" width="140">
          <template #default="{ row }">{{ formatDateTime(row.issuedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default="{ row }">
            <PermissionGuard permission="invoice:void">
              <el-button
                v-if="row.status === 'ISSUED'"
                size="small"
                text
                type="danger"
                data-testid="invoice-void"
                :loading="voidingId === row.id"
                @click="voidInvoice(row as InvoiceListItem)"
              >
                作废
              </el-button>
            </PermissionGuard>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无发票数据" :image-size="64" />
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

    <!-- 开票弹窗 -->
    <el-dialog v-model="issueVisible" title="开具发票" width="560px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="应收账单">
          <el-select v-model="issueForm.billId" filterable placeholder="选择应收账单" style="width: 100%">
            <el-option
              v-for="bill in billOptions"
              :key="bill.id"
              :label="`${bill.billNo} · ${bill.counterparty?.name || ''} · ¥${formatAmount(bill.totalAmount)}`"
              :value="bill.id"
            />
          </el-select>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="发票类型">
              <el-select v-model="issueForm.invoiceType" style="width: 100%">
                <el-option v-for="option in INVOICE_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="购方税号">
              <el-input v-model="issueForm.taxNo" placeholder="18 位统一社会信用代码" maxlength="18" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="购方名称">
              <el-input v-model="issueForm.title" placeholder="购方名称" />
            </el-form-item>
          </el-col>
        </el-row>
        <p class="muted issue-tip">税额 = 金额 × 9%，开票后写入 TAX_INVOICE_ISSUE 集成报文与审计。</p>
      </el-form>
      <template #footer>
        <el-button :disabled="issuing" @click="issueVisible = false">取消</el-button>
        <el-button type="primary" :loading="issuing" @click="submitIssue">确认开票</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PermissionGuard from '../components/PermissionGuard.vue';
import { fetchInvoices, issueInvoice, voidInvoice as voidInvoiceApi } from '../api/invoice';
import { fetchBills } from '../api/billing';
import {
  INVOICE_STATUS_OPTIONS,
  INVOICE_TYPE_OPTIONS,
  invoiceStatusLabel,
  invoiceStatusTagType,
  invoiceTypeLabel,
} from '../utils/constants';
import { formatAmount, formatDateTime } from '../utils/format';
import type { BillListItem, InvoiceListItem } from '../types';

const route = useRoute();

const loading = ref(false);
const errorText = ref('');
const rows = ref<InvoiceListItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const statusFilter = ref('');
const voidingId = ref<number | null>(null);

const issueVisible = ref(false);
const issuing = ref(false);
const billOptions = ref<BillListItem[]>([]);
const issueForm = reactive({
  billId: null as number | null,
  invoiceType: 'VAT_SPECIAL',
  title: '',
  taxNo: '',
});

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchInvoices({
      status: statusFilter.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    rows.value = [];
    total.value = 0;
    errorText.value = error instanceof Error && error.message ? error.message : '发票列表加载失败';
  } finally {
    loading.value = false;
  }
}

function search(): void {
  page.value = 1;
  void load();
}

async function loadBills(selectId?: number): Promise<void> {
  try {
    const data = await fetchBills({ billType: 'RECEIVABLE', page: 1, pageSize: 100 });
    billOptions.value = data.list.filter((bill) => ['ISSUED', 'PARTIAL'].includes(bill.status));
    const targetBill = billOptions.value.find((bill) => bill.id === selectId) ?? billOptions.value[0];
    issueForm.billId = targetBill?.id ?? null;
    issueForm.title = targetBill?.counterparty?.name ?? '';
  } catch {
    billOptions.value = [];
  }
}

async function openIssue(): Promise<void> {
  issueVisible.value = true;
  await loadBills();
}

async function submitIssue(): Promise<void> {
  if (!issueForm.billId) {
    ElMessage.warning('请选择应收账单');
    return;
  }
  if (!issueForm.title.trim()) {
    ElMessage.warning('请输入购方名称');
    return;
  }
  issuing.value = true;
  try {
    const invoice = await issueInvoice({
      billId: issueForm.billId,
      invoiceType: issueForm.invoiceType,
      title: issueForm.title.trim(),
      taxNo: issueForm.taxNo.trim(),
    });
    ElMessage.success(`发票开具成功：${invoice.invoiceNo}，价税合计 ¥${formatAmount(invoice.totalAmount)}`);
    issueVisible.value = false;
    await load();
  } finally {
    issuing.value = false;
  }
}

async function voidInvoice(row: InvoiceListItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认作废发票 ${row.invoiceNo}？`, '作废发票', {
      confirmButtonText: '确认作废',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  voidingId.value = row.id;
  try {
    await voidInvoiceApi(row.id);
    ElMessage.success(`发票已作废：${row.invoiceNo}`);
    await load();
  } finally {
    voidingId.value = null;
  }
}

onMounted(async () => {
  await load();
  const billId = Number(route.query.billId);
  if (Number.isFinite(billId) && billId > 0) {
    issueVisible.value = true;
    await loadBills(billId);
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

.issue-tip {
  margin: 0;
  font-size: 12px;
}
</style>
