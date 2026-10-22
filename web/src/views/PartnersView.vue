<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">伙伴管理</h2>
        <p class="page-subtitle">承运商 / 港口 / 货场 / 堆场 / 货代等伙伴主数据 · 共 {{ total }} 家</p>
      </div>
      <div class="page-actions">
        <PermissionGuard permission="partner:create">
          <el-button type="primary" data-testid="partner-create-btn" @click="createVisible = true">新增伙伴</el-button>
        </PermissionGuard>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="card filter-bar">
      <el-select
        v-model="typeFilter"
        data-testid="partner-type-filter"
        placeholder="全部伙伴类型"
        clearable
        style="width: 170px"
        @change="search"
      >
        <el-option v-for="option in PARTNER_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-input
        v-model="keyword"
        placeholder="搜索伙伴名称 / 伙伴号 / 联系人"
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
      <el-table v-loading="loading" data-testid="partner-table" :data="rows" size="small" border stripe>
        <el-table-column label="伙伴号" min-width="140">
          <template #default="{ row }">
            <span class="row-link mono" data-testid="partner-row" @click="openDetail(row as Partner)">
              {{ row.partnerNo }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="伙伴名称" min-width="210" show-overflow-tooltip />
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.typeLabel || partnerTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="shortName" label="简称" width="100" />
        <el-table-column prop="contactName" label="联系人" width="90" />
        <el-table-column prop="contactPhone" label="联系电话" width="130">
          <template #default="{ row }">
            <span class="mono">{{ row.contactPhone }}</span>
          </template>
        </el-table-column>
        <el-table-column label="评分" width="90" align="center">
          <template #default="{ row }">
            <span class="success-text">{{ Number(row.rating).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="regionCode" label="区域码" width="90" align="center" />
        <el-table-column label="状态" width="86" align="center">
          <template #default="{ row }">
            <StatusTag :status="row.status" :label="row.statusLabel" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openDetail(row as Partner)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无伙伴数据" :image-size="70" />
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

    <el-drawer v-model="detailVisible" title="伙伴详情" size="480px">
      <template v-if="current">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="伙伴号">
            <span class="mono">{{ current.partnerNo }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="伙伴名称">{{ current.name }}</el-descriptions-item>
          <el-descriptions-item label="简称">{{ current.shortName }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ current.typeLabel || partnerTypeLabel(current.type) }}</el-descriptions-item>
          <el-descriptions-item label="统一社会信用代码">
            <span class="mono">{{ current.creditCode }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="联系人">{{ current.contactName }} / {{ current.contactPhone }}</el-descriptions-item>
          <el-descriptions-item label="邮箱">{{ current.email || '—' }}</el-descriptions-item>
          <el-descriptions-item label="区域码">{{ current.regionCode }}</el-descriptions-item>
          <el-descriptions-item label="地址">{{ current.address }}</el-descriptions-item>
          <el-descriptions-item label="评分">{{ Number(current.rating).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="结算账号">{{ current.settlementAccount || '—' }}</el-descriptions-item>
          <el-descriptions-item label="资质">
            <pre class="qualifications">{{ JSON.stringify(current.qualifications, null, 2) }}</pre>
          </el-descriptions-item>
          <el-descriptions-item label="状态">{{ current.statusLabel }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>

    <el-dialog v-model="createVisible" title="新增伙伴" width="640px" :close-on-click-modal="false">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="伙伴名称" prop="name">
              <el-input v-model="createForm.name" placeholder="如：某某运输有限公司" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="伙伴简称" prop="shortName">
              <el-input v-model="createForm.shortName" placeholder="如：某某运输" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="伙伴类型" prop="type">
              <el-select v-model="createForm.type" placeholder="选择类型" style="width: 100%">
                <el-option v-for="option in PARTNER_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="统一社会信用代码（18 位）" prop="creditCode">
              <el-input v-model="createForm.creditCode" maxlength="18" placeholder="18 位信用代码" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系人" prop="contactName">
              <el-input v-model="createForm.contactName" placeholder="联系人姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话" prop="contactPhone">
              <el-input v-model="createForm.contactPhone" placeholder="手机号" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="区域码（6 位）" prop="regionCode">
              <el-input v-model="createForm.regionCode" maxlength="6" placeholder="如 310115" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="评分">
              <el-input v-model="ratingInput" type="number" placeholder="4.5" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="地址" prop="address">
              <el-input v-model="createForm.address" placeholder="详细地址" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="结算账号">
              <el-input v-model="createForm.settlementAccount" placeholder="选填" />
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
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import PermissionGuard from '../components/PermissionGuard.vue';
import { createPartner, fetchPartners } from '../api/master';
import { PARTNER_TYPE_OPTIONS, partnerTypeLabel } from '../utils/constants';
import type { CreatePartnerPayload, Partner } from '../types';

const loading = ref(false);
const errorText = ref('');
const rows = ref<Partner[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const keyword = ref('');
const typeFilter = ref('');

const detailVisible = ref(false);
const current = ref<Partner | null>(null);

const createVisible = ref(false);
const creating = ref(false);
const ratingInput = ref('4.5');
const createFormRef = ref<FormInstance>();
const createForm = reactive<CreatePartnerPayload>({
  name: '',
  shortName: '',
  type: '',
  creditCode: '',
  contactName: '',
  contactPhone: '',
  email: '',
  regionCode: '',
  address: '',
  rating: 4.5,
  settlementAccount: '',
  remark: '',
});

const createRules: FormRules = {
  name: [{ required: true, message: '请输入伙伴名称', trigger: 'blur' }],
  shortName: [{ required: true, message: '请输入伙伴简称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择伙伴类型', trigger: 'change' }],
  creditCode: [
    { required: true, message: '请输入统一社会信用代码', trigger: 'blur' },
    { len: 18, message: '统一社会信用代码需为 18 位', trigger: 'blur' },
  ],
  contactName: [{ required: true, message: '请输入联系人', trigger: 'blur' }],
  contactPhone: [{ required: true, message: '请输入联系电话', trigger: 'blur' }],
  regionCode: [
    { required: true, message: '请输入区域码', trigger: 'blur' },
    { len: 6, message: '区域码需为 6 位', trigger: 'blur' },
  ],
  address: [{ required: true, message: '请输入地址', trigger: 'blur' }],
};

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchPartners({
      type: typeFilter.value || undefined,
      keyword: keyword.value.trim() || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    rows.value = [];
    total.value = 0;
    errorText.value = error instanceof Error && error.message ? error.message : '伙伴列表加载失败';
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
  typeFilter.value = '';
  search();
}

function openDetail(row: Partner): void {
  current.value = row;
  detailVisible.value = true;
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
    const partner = await createPartner({
      ...createForm,
      rating: Number(ratingInput.value) || 4.5,
      email: createForm.email?.trim() || undefined,
      settlementAccount: createForm.settlementAccount?.trim() || undefined,
    });
    ElMessage.success(`伙伴创建成功：${partner.partnerNo}`);
    createVisible.value = false;
    Object.assign(createForm, {
      name: '',
      shortName: '',
      type: '',
      creditCode: '',
      contactName: '',
      contactPhone: '',
      email: '',
      regionCode: '',
      address: '',
      rating: 4.5,
      settlementAccount: '',
      remark: '',
    });
    await load();
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

.success-text {
  color: #67c23a;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.qualifications {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
