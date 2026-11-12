<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">监管报送</h2>
        <p class="page-subtitle">按周期聚合生成报送单 → 提交监管 → 受理回执</p>
      </div>
      <div class="page-actions">
        <PermissionGuard permission="regulator:report-create">
          <el-button type="primary" data-testid="report-create" @click="openCreate">生成报送</el-button>
        </PermissionGuard>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="card filter-bar">
      <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 140px" @change="search">
        <el-option v-for="option in REPORT_STATUS_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-select v-model="typeFilter" placeholder="全部类型" clearable style="width: 150px" @change="search">
        <el-option v-for="option in REPORT_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <span class="muted filter-tip">共 {{ total }} 份报送</span>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card table-card">
      <el-table v-loading="loading" :data="rows" size="small" border stripe>
        <el-table-column label="报送单号" min-width="160">
          <template #default="{ row }">
            <span class="row-link mono" data-testid="report-row" @click="openDetail(row.id)">{{ row.reportNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">{{ row.reportTypeLabel || reportTypeLabel(row.reportType) }}</template>
        </el-table-column>
        <el-table-column prop="period" label="周期" width="90" align="center" />
        <el-table-column prop="regulatorName" label="监管机构" min-width="180" show-overflow-tooltip />
        <el-table-column label="状态" width="96" align="center">
          <template #default="{ row }">
            <el-tag :type="reportStatusTagType(row.status)" size="small" effect="plain" data-testid="report-status">
              {{ row.statusLabel || reportStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" width="140">
          <template #default="{ row }">{{ formatDateTime(row.submittedAt) }}</template>
        </el-table-column>
        <el-table-column label="受理时间" width="140">
          <template #default="{ row }">{{ formatDateTime(row.acceptedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" align="center">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openDetail(row.id)">详情</el-button>
            <PermissionGuard permission="regulator:report-submit">
              <el-button
                v-if="row.status === 'DRAFT'"
                size="small"
                text
                type="success"
                data-testid="report-submit"
                :loading="actingId === row.id"
                @click="submit(row as RegulatorReport)"
              >
                提交
              </el-button>
            </PermissionGuard>
            <PermissionGuard permission="regulator:report-accept">
              <el-button
                v-if="row.status === 'SUBMITTED'"
                size="small"
                text
                type="warning"
                data-testid="report-accept"
                :loading="actingId === row.id"
                @click="openAccept(row as RegulatorReport)"
              >
                受理
              </el-button>
            </PermissionGuard>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无报送数据" :image-size="64" />
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

    <!-- 生成报送 -->
    <el-dialog v-model="createVisible" title="生成监管报送" width="520px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="报送类型">
          <el-select v-model="createForm.reportType" style="width: 100%">
            <el-option v-for="option in REPORT_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="报送周期">
          <el-input v-model="createForm.period" placeholder="YYYY-MM，如 2026-10" maxlength="7" />
        </el-form-item>
        <el-form-item label="监管机构">
          <el-input v-model="createForm.regulatorName" placeholder="监管机构名称" />
        </el-form-item>
        <p class="muted create-tip">系统将聚合该周期订单/运单/账单/告警数据生成报送内容（JSON）。</p>
      </el-form>
      <template #footer>
        <el-button :disabled="creating" @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">生成报送单</el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-drawer v-model="detailVisible" title="报送详情" size="640px">
      <div v-loading="detailLoading">
        <template v-if="detail">
          <div class="detail-head">
            <span class="mono detail-no">{{ detail.report.reportNo }}</span>
            <el-tag :type="reportStatusTagType(detail.report.status)" effect="dark">
              {{ detail.report.statusLabel || reportStatusLabel(detail.report.status) }}
            </el-tag>
          </div>
          <el-descriptions :column="2" border size="small" class="mt-12">
            <el-descriptions-item label="类型">
              {{ detail.report.reportTypeLabel || reportTypeLabel(detail.report.reportType) }}
            </el-descriptions-item>
            <el-descriptions-item label="周期">{{ detail.report.period }}</el-descriptions-item>
            <el-descriptions-item label="监管机构">{{ detail.report.regulatorName }}</el-descriptions-item>
            <el-descriptions-item label="提交时间">{{ formatDateTime(detail.report.submittedAt) }}</el-descriptions-item>
            <el-descriptions-item label="受理时间">{{ formatDateTime(detail.report.acceptedAt) }}</el-descriptions-item>
            <el-descriptions-item label="备注">{{ detail.report.remark || '—' }}</el-descriptions-item>
          </el-descriptions>
          <h4 class="sub-title">报送内容（聚合摘要）</h4>
          <pre class="payload">{{ prettyContent }}</pre>
        </template>
      </div>
    </el-drawer>

    <!-- 受理回执 -->
    <el-dialog v-model="acceptVisible" title="监管受理回执" width="500px" :close-on-click-modal="false">
      <div v-if="acceptTarget" class="accept-info">
        <div class="accept-info__row">
          <span class="meta-label">报送单号</span>
          <span class="mono">{{ acceptTarget.reportNo }}</span>
        </div>
      </div>
      <el-form label-position="top">
        <el-form-item label="受理结果">
          <el-radio-group v-model="acceptForm.accepted">
            <el-radio :value="true">受理通过</el-radio>
            <el-radio :value="false">退回补正</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="受理意见">
          <el-input v-model="acceptForm.comment" type="textarea" :rows="2" placeholder="如：材料齐全" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="accepting" @click="acceptVisible = false">取消</el-button>
        <el-button type="primary" :loading="accepting" @click="submitAccept">提交回执</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PermissionGuard from '../components/PermissionGuard.vue';
import {
  acceptRegulatorReport,
  createRegulatorReport,
  fetchRegulatorReport,
  fetchRegulatorReports,
  submitRegulatorReport,
} from '../api/regulator';
import {
  REPORT_STATUS_OPTIONS,
  REPORT_TYPE_OPTIONS,
  reportStatusLabel,
  reportStatusTagType,
  reportTypeLabel,
} from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { RegulatorReport, RegulatorReportDetail } from '../types';

const loading = ref(false);
const errorText = ref('');
const rows = ref<RegulatorReport[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const statusFilter = ref('');
const typeFilter = ref('');
const actingId = ref<number | null>(null);

const createVisible = ref(false);
const creating = ref(false);
const createForm = reactive({
  reportType: 'OPERATION_MONTHLY',
  period: currentMonth(),
  regulatorName: '上海市交通委员会',
});

const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<RegulatorReportDetail | null>(null);

const acceptVisible = ref(false);
const accepting = ref(false);
const acceptTarget = ref<RegulatorReport | null>(null);
const acceptForm = reactive({ accepted: true, comment: '材料齐全' });

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

const prettyContent = computed(() => {
  if (!detail.value?.content) return '（暂无内容）';
  try {
    return JSON.stringify(detail.value.content, null, 2);
  } catch {
    return String(detail.value.content);
  }
});

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchRegulatorReports({
      status: statusFilter.value || undefined,
      reportType: typeFilter.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    rows.value = [];
    total.value = 0;
    errorText.value = error instanceof Error && error.message ? error.message : '监管报送加载失败';
  } finally {
    loading.value = false;
  }
}

function search(): void {
  page.value = 1;
  void load();
}

async function openCreate(): Promise<void> {
  createVisible.value = true;
  createForm.period = currentMonth();
}

async function submitCreate(): Promise<void> {
  if (!/^\d{4}-\d{2}$/.test(createForm.period)) {
    ElMessage.warning('报送周期格式为 YYYY-MM');
    return;
  }
  creating.value = true;
  try {
    const result = await createRegulatorReport({
      reportType: createForm.reportType,
      period: createForm.period,
      regulatorName: createForm.regulatorName.trim(),
    });
    ElMessage.success(`报送单生成成功：${result.report.reportNo}`);
    createVisible.value = false;
    await load();
  } finally {
    creating.value = false;
  }
}

async function openDetail(id: number): Promise<void> {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    detail.value = await fetchRegulatorReport(id);
  } catch {
    detail.value = null;
  } finally {
    detailLoading.value = false;
  }
}

async function submit(row: RegulatorReport): Promise<void> {
  actingId.value = row.id;
  try {
    await submitRegulatorReport(row.id);
    ElMessage.success(`报送已提交：${row.reportNo}`);
    await load();
  } finally {
    actingId.value = null;
  }
}

function openAccept(row: RegulatorReport): void {
  acceptTarget.value = row;
  acceptForm.accepted = true;
  acceptForm.comment = '材料齐全';
  acceptVisible.value = true;
}

async function submitAccept(): Promise<void> {
  if (!acceptTarget.value) return;
  accepting.value = true;
  try {
    await acceptRegulatorReport(acceptTarget.value.id, {
      accepted: acceptForm.accepted,
      comment: acceptForm.comment.trim(),
    });
    ElMessage.success(acceptForm.accepted ? '已受理并生成回执' : '已退回补正');
    acceptVisible.value = false;
    await load();
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

.mt-12 {
  margin-top: 12px;
}

.retry-btn {
  margin-top: 6px;
}

.filter-tip {
  margin-left: auto;
  font-size: 12px;
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

.detail-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.detail-no {
  font-size: 15px;
  font-weight: 600;
}

.sub-title {
  margin: 16px 0 10px;
  font-size: 13px;
  font-weight: 600;
}

.payload {
  background: #0f172a;
  color: #d7e0f0;
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 12px;
  line-height: 1.6;
  max-height: 420px;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.create-tip {
  margin: 0;
  font-size: 12px;
}

.accept-info {
  background: #f7f9fc;
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 12px;
}

.accept-info__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}
</style>
