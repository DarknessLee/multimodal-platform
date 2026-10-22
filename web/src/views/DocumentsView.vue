<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">单证中心</h2>
        <p class="page-subtitle">运单/装箱单/回单电子单证 · 上传 → Mock OCR → 签章 → 哈希链存证</p>
      </div>
      <div class="page-actions">
        <PermissionGuard permission="document:upload">
          <el-button type="primary" data-testid="document-upload" @click="openUpload">上传单证</el-button>
        </PermissionGuard>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="card filter-bar">
      <el-select v-model="docTypeFilter" placeholder="全部单证类型" clearable style="width: 160px" @change="search">
        <el-option v-for="option in DOC_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-select v-model="ocrFilter" placeholder="全部 OCR 状态" clearable style="width: 150px" @change="search">
        <el-option v-for="option in OCR_STATUS_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-select v-model="bizTypeFilter" placeholder="全部业务类型" clearable style="width: 130px" @change="search">
        <el-option v-for="option in DOC_BIZ_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-input v-model="bizIdFilter" placeholder="业务 ID" clearable style="width: 110px" @keyup.enter="search" />
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="reset">重置</el-button>
      <span class="muted filter-tip">共 {{ total }} 张单证</span>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card table-card">
      <el-table v-loading="loading" data-testid="document-table" :data="rows" size="small" border stripe>
        <el-table-column label="单证号" min-width="160">
          <template #default="{ row }">
            <span class="row-link mono" data-testid="document-row" @click="openDetail(row.id)">
              {{ row.docNo }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="130">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" data-testid="document-type">
              {{ row.docTypeLabel || docTypeLabel(row.docType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="业务" min-width="130">
          <template #default="{ row }">
            {{ row.bizType }} #{{ row.bizId }}
          </template>
        </el-table-column>
        <el-table-column prop="fileName" label="文件名" min-width="180" show-overflow-tooltip />
        <el-table-column label="大小" width="90" align="right">
          <template #default="{ row }">{{ formatFileSize(row.fileSize) }}</template>
        </el-table-column>
        <el-table-column label="OCR" width="104" align="center">
          <template #default="{ row }">
            <el-tag
              :type="ocrTagType(row.ocrStatus)"
              size="small"
              effect="plain"
              data-testid="document-ocr"
            >
              {{ row.ocrStatusLabel || ocrStatusLabel(row.ocrStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="签章" width="96" align="center">
          <template #default="{ row }">
            <el-tag :type="row.signStatus === 'SIGNED' ? 'success' : 'info'" size="small" effect="plain">
              {{ row.signStatusLabel || signStatusLabel(row.signStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="contentHash" min-width="150">
          <template #default="{ row }">
            <span class="mono muted" :title="row.contentHash">{{ shortHash(row.contentHash) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="140">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openDetail(row.id)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无单证数据" :image-size="70" />
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

    <!-- 单证详情抽屉 -->
    <el-drawer v-model="detailVisible" title="单证详情" size="560px">
      <div v-loading="detailLoading">
        <template v-if="current">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="单证号">
              <span class="mono">{{ current.docNo }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="单证类型">
              {{ current.docTypeLabel || docTypeLabel(current.docType) }}
            </el-descriptions-item>
            <el-descriptions-item label="业务对象">{{ current.bizType }} #{{ current.bizId }}</el-descriptions-item>
            <el-descriptions-item label="文件名">{{ current.fileName }}</el-descriptions-item>
            <el-descriptions-item label="文件大小">{{ formatFileSize(current.fileSize) }}</el-descriptions-item>
            <el-descriptions-item label="contentHash">
              <span class="mono break-all">{{ current.contentHash || '—' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="OCR 状态">
              {{ current.ocrStatusLabel || ocrStatusLabel(current.ocrStatus) }}
            </el-descriptions-item>
            <el-descriptions-item label="签章状态">
              {{ current.signStatusLabel || signStatusLabel(current.signStatus) }}
            </el-descriptions-item>
            <el-descriptions-item label="签章人 / 时间">
              {{ current.signerName || '—' }} / {{ formatDateTime(current.signedAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="signHash">
              <span class="mono break-all">{{ current.signHash || '—' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="存证交易号">
              <span class="mono break-all">{{ current.notarizeTxId || '—' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatDateTime(current.createdAt) }}</el-descriptions-item>
          </el-descriptions>

          <h4 class="section-title">OCR 识别结果</h4>
          <div v-if="current.ocrResult" class="ocr-box">
            <el-descriptions v-if="ocrRows.length" :column="2" border size="small">
              <el-descriptions-item v-for="item in ocrRows" :key="item.key" :label="item.key">
                {{ item.value }}
              </el-descriptions-item>
            </el-descriptions>
            <pre class="ocr-raw">{{ prettyOcr }}</pre>
          </div>
          <el-empty v-else description="暂无 OCR 结果" :image-size="60" />

          <div class="detail-actions">
            <PermissionGuard permission="document:ocr">
              <el-button
                :disabled="ocrLoading"
                :loading="ocrLoading"
                @click="rerunOcr"
              >
                重新识别（Mock OCR）
              </el-button>
            </PermissionGuard>
            <PermissionGuard permission="document:sign">
              <el-button
                type="primary"
                data-testid="document-sign-btn"
                :disabled="current.signStatus === 'SIGNED'"
                @click="openSign"
              >
                {{ current.signStatus === 'SIGNED' ? '已签章' : '电子签章' }}
              </el-button>
            </PermissionGuard>
            <el-button data-testid="document-download" :loading="downloadLoading" @click="download">
              下载文件
            </el-button>
          </div>
        </template>
      </div>
    </el-drawer>

    <!-- 上传单证 -->
    <el-dialog v-model="uploadVisible" title="上传单证" width="560px" :close-on-click-modal="false">
      <el-form ref="uploadFormRef" :model="uploadForm" :rules="uploadRules" label-position="top">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="单证类型" prop="docType">
              <el-select v-model="uploadForm.docType" style="width: 100%">
                <el-option v-for="option in DOC_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="业务类型" prop="bizType">
              <el-select v-model="uploadForm.bizType" style="width: 100%">
                <el-option v-for="option in DOC_BIZ_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="业务 ID（运单/订单 ID）" prop="bizId">
              <el-input
                :model-value="String(uploadForm.bizId ?? '')"
                type="number"
                placeholder="如：12"
                @update:model-value="uploadForm.bizId = Number($event)"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="文件（≤5MB，pdf/jpg/png/txt）" prop="fileName">
              <div class="file-picker">
                <input
                  ref="fileInputRef"
                  class="file-input"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.txt"
                  data-testid="document-file-input"
                  @change="onFileChange"
                />
                <el-button size="small" @click="triggerFilePick">选择文件</el-button>
                <span class="file-name muted">{{ uploadForm.fileName || '未选择文件' }}</span>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-alert
          v-if="uploadForm.fileName && uploadForm.fileSize > 5 * 1024 * 1024"
          title="文件超过 5MB 限制"
          type="error"
          :closable="false"
          show-icon
        />
        <p class="muted upload-tip">
          POD 回单上传后自动执行 Mock OCR（识别箱号 / 签收人 / 日期 / 数量），并写入审计、事件与哈希链存证。
        </p>
      </el-form>
      <template #footer>
        <el-button :disabled="uploading" @click="uploadVisible = false">取消</el-button>
        <el-button type="primary" :loading="uploading" @click="submitUpload">上传并识别</el-button>
      </template>
    </el-dialog>

    <!-- 签章 -->
    <el-dialog v-model="signVisible" title="单证电子签章（Mock CA）" width="440px" :close-on-click-modal="false">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="签章人">
          <el-input v-model="signerName" data-testid="signer-name" placeholder="请输入签章人姓名" maxlength="20" clearable />
        </el-form-item>
        <div class="muted sign-tip">
          签章后写入 signHash（SHA-256）、CA_SIGN 集成报文、运单事件与哈希链存证。
        </div>
      </el-form>
      <template #footer>
        <el-button :disabled="signing" @click="signVisible = false">取消</el-button>
        <el-button type="primary" data-testid="document-sign-submit" :loading="signing" @click="submitSign">
          确认签章
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PermissionGuard from '../components/PermissionGuard.vue';
import {
  downloadDocument,
  fetchDocument,
  fetchDocuments,
  runDocumentOcr,
  signDocument,
  uploadDocument,
} from '../api/documents';
import {
  DOC_BIZ_TYPE_OPTIONS,
  DOC_TYPE_OPTIONS,
  OCR_STATUS_OPTIONS,
  docTypeLabel,
  ocrStatusLabel,
  signStatusLabel,
} from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { DocumentDetail, DocumentListItem } from '../types';

const route = useRoute();

const loading = ref(false);
const errorText = ref('');
const rows = ref<DocumentListItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const docTypeFilter = ref('');
const ocrFilter = ref('');
const bizTypeFilter = ref('');
const bizIdFilter = ref('');

const detailVisible = ref(false);
const detailLoading = ref(false);
const current = ref<DocumentDetail | null>(null);
const ocrLoading = ref(false);
const downloadLoading = ref(false);
const signing = ref(false);
const signVisible = ref(false);
const signerName = ref('王海');

const uploadVisible = ref(false);
const uploading = ref(false);
const uploadFormRef = ref<FormInstance>();
const fileInputRef = ref<HTMLInputElement | null>(null);
const selectedMime = ref('application/pdf');
const selectedBase64 = ref('');

const uploadForm = reactive({
  docType: 'POD',
  bizType: 'WAYBILL',
  bizId: 0 as number,
  fileName: '',
  fileSize: 0,
});

const uploadRules: FormRules = {
  docType: [{ required: true, message: '请选择单证类型', trigger: 'change' }],
  bizType: [{ required: true, message: '请选择业务类型', trigger: 'change' }],
  bizId: [{ required: true, message: '请输入业务 ID', trigger: 'blur' }],
  fileName: [{ required: true, message: '请选择文件', trigger: 'change' }],
};

const ocrRows = computed<Array<{ key: string; value: string }>>(() => {
  const result = current.value?.ocrResult;
  if (!result || typeof result !== 'object') return [];
  return Object.entries(result as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object')
    .map(([key, value]) => ({ key: OCR_FIELD_LABELS[key] ?? key, value: String(value) }));
});

const prettyOcr = computed(() => {
  const result = current.value?.ocrResult;
  if (result === null || result === undefined) return '';
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
});

const OCR_FIELD_LABELS: Record<string, string> = {
  containerNo: '识别箱号',
  signerName: '签收人',
  date: '签收日期',
  quantity: '数量',
  rawText: '识别原文',
  confidence: '置信度',
};

function ocrTagType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'SUCCESS') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'FAILED') return 'danger';
  return 'info';
}

function shortHash(hash: string | null | undefined): string {
  if (!hash) return '—';
  return hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;
}

function formatFileSize(size: number | null | undefined): string {
  const value = Number(size ?? 0);
  if (!value) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchDocuments({
      docType: docTypeFilter.value || undefined,
      ocrStatus: ocrFilter.value || undefined,
      bizType: bizTypeFilter.value || undefined,
      bizId: bizIdFilter.value.trim() || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    rows.value = [];
    total.value = 0;
    errorText.value = error instanceof Error && error.message ? error.message : '单证列表加载失败';
  } finally {
    loading.value = false;
  }
}

function search(): void {
  page.value = 1;
  void load();
}

function reset(): void {
  docTypeFilter.value = '';
  ocrFilter.value = '';
  bizTypeFilter.value = '';
  bizIdFilter.value = '';
  search();
}

async function openDetail(id: number): Promise<void> {
  detailVisible.value = true;
  detailLoading.value = true;
  current.value = null;
  try {
    current.value = await fetchDocument(id);
  } catch {
    current.value = null;
  } finally {
    detailLoading.value = false;
  }
}

function openUpload(): void {
  uploadVisible.value = true;
  uploadForm.bizId = Number(bizIdFilter.value) || 0;
  uploadForm.fileName = '';
  uploadForm.fileSize = 0;
  selectedBase64.value = '';
  selectedMime.value = 'application/pdf';
  if (fileInputRef.value) fileInputRef.value.value = '';
}

function triggerFilePick(): void {
  fileInputRef.value?.click();
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('文件超过 5MB 限制');
    input.value = '';
    return;
  }
  uploadForm.fileName = file.name;
  uploadForm.fileSize = file.size;
  selectedMime.value = file.type || 'application/octet-stream';
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result ?? '');
    selectedBase64.value = result.includes(',') ? result.slice(result.indexOf(',') + 1) : result;
  };
  reader.onerror = () => ElMessage.error('文件读取失败');
  reader.readAsDataURL(file);
}

async function submitUpload(): Promise<void> {
  const formEl = uploadFormRef.value;
  if (formEl) {
    try {
      await formEl.validate();
    } catch {
      return;
    }
  }
  if (!selectedBase64.value) {
    ElMessage.warning('请选择要上传的文件');
    return;
  }
  uploading.value = true;
  try {
    const doc = await uploadDocument({
      docType: uploadForm.docType,
      bizType: uploadForm.bizType,
      bizId: Number(uploadForm.bizId),
      fileName: uploadForm.fileName,
      mimeType: selectedMime.value,
      contentBase64: selectedBase64.value,
    });
    ElMessage.success(`单证上传成功：${doc.docNo}`);
    uploadVisible.value = false;
    await load();
    await openDetail(doc.id);
  } finally {
    uploading.value = false;
  }
}

async function rerunOcr(): Promise<void> {
  if (!current.value) return;
  ocrLoading.value = true;
  try {
    const result = await runDocumentOcr(current.value.id);
    ElMessage.success(`OCR 已重新识别：${result.ocrStatus}`);
    current.value = await fetchDocument(current.value.id);
    await load();
  } finally {
    ocrLoading.value = false;
  }
}

function openSign(): void {
  signerName.value = '王海';
  signVisible.value = true;
}

async function submitSign(): Promise<void> {
  if (!current.value) return;
  const name = signerName.value.trim();
  if (!name) {
    ElMessage.warning('请输入签章人姓名');
    return;
  }
  signing.value = true;
  try {
    current.value = await signDocument(current.value.id, name);
    signVisible.value = false;
    ElMessage.success('单证签章成功，已写入存证');
    await load();
  } finally {
    signing.value = false;
  }
}

async function download(): Promise<void> {
  if (!current.value) return;
  downloadLoading.value = true;
  try {
    const { blob, fileName } = await downloadDocument(current.value.id);
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName || current.value.fileName || `document-${current.value.id}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 2000);
    ElMessage.success('文件下载已开始');
  } finally {
    downloadLoading.value = false;
  }
}

onMounted(() => {
  const queryBizType = typeof route.query.bizType === 'string' ? route.query.bizType : '';
  const queryBizId = typeof route.query.bizId === 'string' ? route.query.bizId : '';
  if (queryBizType) bizTypeFilter.value = queryBizType;
  if (queryBizId) bizIdFilter.value = queryBizId;
  void load();
  const queryDocId = typeof route.query.docId === 'string' ? Number(route.query.docId) : 0;
  if (queryDocId > 0) void openDetail(queryDocId);
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

.row-link {
  color: var(--app-primary);
  cursor: pointer;
}

.row-link:hover {
  text-decoration: underline;
}

.break-all {
  word-break: break-all;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.section-title {
  margin: 18px 0 10px;
  font-size: 13px;
  font-weight: 600;
}

.ocr-box {
  background: #f7f9fc;
  border-radius: 8px;
  padding: 12px 14px;
}

.ocr-raw {
  margin: 10px 0 0;
  max-height: 220px;
  overflow: auto;
  font-size: 11.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--app-text-regular);
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px dashed var(--app-border);
}

.file-picker {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  flex-wrap: wrap;
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
}

.file-name {
  font-size: 12px;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-tip {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.7;
}

.sign-tip {
  font-size: 12px;
  line-height: 1.7;
}
</style>
