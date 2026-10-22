<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">客户管理</h2>
        <p class="page-subtitle">客户主数据（货主 / 收货人 / 通知方）· 共 {{ total }} 家</p>
      </div>
      <div class="page-actions">
        <PermissionGuard permission="customer:create">
          <el-button type="primary" data-testid="customer-create-btn" @click="openCreate">新增客户</el-button>
        </PermissionGuard>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="card filter-bar">
      <el-input
        v-model="keyword"
        data-testid="customer-search"
        placeholder="搜索客户名称 / 客户号 / 统一社会信用代码"
        clearable
        style="width: 320px"
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
      <el-table v-loading="loading" data-testid="customer-table" :data="rows" size="small" border stripe>
        <el-table-column label="客户号" min-width="140">
          <template #default="{ row }">
            <span class="row-link mono" data-testid="customer-row" @click="openDetail(row as Customer)">
              {{ row.customerNo }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="客户名称" min-width="230" show-overflow-tooltip />
        <el-table-column prop="shortName" label="简称" width="110" />
        <el-table-column prop="industry" label="行业" width="110" />
        <el-table-column label="信用等级" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" :type="row.creditLevel === 'AAA' || row.creditLevel === 'AA' ? 'success' : 'info'">
              {{ row.creditLevel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="contactName" label="联系人" width="90" />
        <el-table-column prop="contactPhone" label="联系电话" width="130">
          <template #default="{ row }">
            <span class="mono">{{ row.contactPhone }}</span>
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
            <el-button size="small" text type="primary" @click="openDetail(row as Customer)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无客户数据" :image-size="70" />
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
    <el-drawer v-model="detailVisible" title="客户详情" size="460px">
      <template v-if="current">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="客户号">
            <span class="mono">{{ current.customerNo }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="客户名称">{{ current.name }}</el-descriptions-item>
          <el-descriptions-item label="简称">{{ current.shortName }}</el-descriptions-item>
          <el-descriptions-item label="统一社会信用代码">
            <span class="mono">{{ current.creditCode }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="行业">{{ current.industry }}</el-descriptions-item>
          <el-descriptions-item label="信用等级">{{ current.creditLevel }}</el-descriptions-item>
          <el-descriptions-item label="联系人">{{ current.contactName }} / {{ current.contactPhone }}</el-descriptions-item>
          <el-descriptions-item label="邮箱">{{ current.email || '—' }}</el-descriptions-item>
          <el-descriptions-item label="区域码">{{ current.regionCode }}</el-descriptions-item>
          <el-descriptions-item label="地址">{{ current.address }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ current.statusLabel }}</el-descriptions-item>
          <el-descriptions-item label="备注">{{ current.remark || '—' }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>

    <!-- 新增客户 -->
    <el-dialog v-model="createVisible" title="新增客户" width="640px" :close-on-click-modal="false">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="客户名称" prop="name">
              <el-input v-model="createForm.name" placeholder="如：上海远洋新能源科技有限公司" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户简称" prop="shortName">
              <el-input v-model="createForm.shortName" placeholder="如：远洋新能源" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="统一社会信用代码（18 位）" prop="creditCode">
              <el-input v-model="createForm.creditCode" placeholder="18 位信用代码" maxlength="18" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="行业" prop="industry">
              <el-input v-model="createForm.industry" placeholder="如：光伏制造" />
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
              <el-input v-model="createForm.regionCode" placeholder="如 310114" maxlength="6" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="邮箱">
              <el-input v-model="createForm.email" placeholder="选填" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="地址" prop="address">
              <el-input v-model="createForm.address" placeholder="详细地址" />
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
import { createCustomer, fetchCustomer, fetchCustomers } from '../api/master';
import type { Customer, CreateCustomerPayload } from '../types';

const loading = ref(false);
const errorText = ref('');
const rows = ref<Customer[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const keyword = ref('');

const detailVisible = ref(false);
const current = ref<Customer | null>(null);

const createVisible = ref(false);
const creating = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive<CreateCustomerPayload>({
  name: '',
  shortName: '',
  creditCode: '',
  contactName: '',
  contactPhone: '',
  email: '',
  regionCode: '',
  address: '',
  industry: '',
  creditLevel: 'A',
  remark: '',
});

const createRules: FormRules = {
  name: [{ required: true, message: '请输入客户名称', trigger: 'blur' }],
  shortName: [{ required: true, message: '请输入客户简称', trigger: 'blur' }],
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
  industry: [{ required: true, message: '请输入行业', trigger: 'blur' }],
};

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchCustomers({
      keyword: keyword.value.trim() || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    rows.value = [];
    total.value = 0;
    errorText.value = error instanceof Error && error.message ? error.message : '客户列表加载失败';
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
  search();
}

async function openDetail(row: Customer): Promise<void> {
  detailVisible.value = true;
  current.value = row;
  try {
    current.value = await fetchCustomer(row.id);
  } catch {
    // 保留列表行数据作为兜底展示
  }
}

function openCreate(): void {
  createVisible.value = true;
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
    const customer = await createCustomer({
      ...createForm,
      email: createForm.email?.trim() || undefined,
      remark: createForm.remark?.trim() || undefined,
    });
    ElMessage.success(`客户创建成功：${customer.customerNo}`);
    createVisible.value = false;
    Object.assign(createForm, {
      name: '',
      shortName: '',
      creditCode: '',
      contactName: '',
      contactPhone: '',
      email: '',
      regionCode: '',
      address: '',
      industry: '',
      creditLevel: 'A',
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

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
