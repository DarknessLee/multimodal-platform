<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">报价工作台</h2>
        <p class="page-subtitle">询价 → 自动按价格规则生成报价 → 发送 → 货主接受并生成订单</p>
      </div>
      <div class="page-actions">
        <PermissionGuard permission="quote:create">
          <el-button type="primary" data-testid="quote-create-btn" @click="openCreate">新建询价</el-button>
        </PermissionGuard>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="card filter-bar">
      <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 140px" @change="search">
        <el-option v-for="option in QUOTE_STATUS_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-input
        v-model="keyword"
        placeholder="搜索报价号 / 客户 / 货物"
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
        <el-table-column label="报价号" min-width="170">
          <template #default="{ row }">
            <span class="row-link mono" data-testid="quote-row" @click="goDetail(row.id)">
              <span data-testid="quote-no">{{ row.quoteNo }}</span>
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="customer.name" label="客户" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">{{ row.customer?.name || '—' }}</template>
        </el-table-column>
        <el-table-column label="订单类型" width="110" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.orderTypeLabel || orderTypeLabel(row.orderType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="routeName" label="线路" min-width="200" show-overflow-tooltip />
        <el-table-column label="箱型/箱量" width="110" align="center">
          <template #default="{ row }">{{ row.containerType }} × {{ row.containerCount }}</template>
        </el-table-column>
        <el-table-column prop="cargoName" label="货物" width="110" show-overflow-tooltip />
        <el-table-column label="报价总额(元)" width="130" align="right">
          <template #default="{ row }">
            <span class="amount" data-testid="quote-total">{{ formatAmount(row.totalAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="96" align="center">
          <template #default="{ row }">
            <StatusTag data-testid="quote-status" kind="quote" :status="row.status" :label="row.statusLabel" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="有效期至" width="110" align="center">
          <template #default="{ row }">{{ formatDate(row.validUntil) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" align="center">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="goDetail(row.id)">详情</el-button>
            <PermissionGuard permission="quote:send">
              <el-button
                v-if="row.status === 'DRAFT'"
                size="small"
                text
                type="primary"
                data-testid="quote-send-btn"
                :loading="actingId === row.id"
                @click="send(row as QuoteListItem)"
              >
                发送报价
              </el-button>
            </PermissionGuard>
            <PermissionGuard permission="quote:accept">
              <el-button
                v-if="row.status === 'SENT'"
                size="small"
                text
                type="success"
                data-testid="quote-accept-btn"
                :loading="actingId === row.id"
                @click="accept(row as QuoteListItem)"
              >
                接受报价
              </el-button>
            </PermissionGuard>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无报价数据" :image-size="70" />
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

    <!-- 新建询价 -->
    <el-dialog v-model="createVisible" title="新建询价（自动生成报价）" width="720px" :close-on-click-modal="false">
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
            <el-form-item label="订单类型" prop="orderType">
              <el-select v-model="createForm.orderType" style="width: 100%">
                <el-option v-for="option in orderTypeOptions" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="联运线路" prop="routeTemplateId">
              <el-select v-model="createForm.routeTemplateId" placeholder="选择线路模板" style="width: 100%">
                <el-option
                  v-for="route in routes"
                  :key="route.id"
                  :label="`${route.routeName}（${route.modes.map((m) => modeLabel(m)).join('/')}）`"
                  :value="route.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="箱型" prop="containerTypeCode">
              <el-select v-model="createForm.containerTypeCode" style="width: 100%">
                <el-option v-for="type in containerTypes" :key="type.code" :label="`${type.code} ${type.name}`" :value="type.code" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="箱量" prop="containerCount">
              <el-input
                :model-value="String(createForm.containerCount)"
                type="number"
                min="1"
                @update:model-value="createForm.containerCount = Number($event)"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="货物" prop="goodsCode">
              <el-select v-model="createForm.goodsCode" filterable clearable placeholder="选择货物（自动带出货名）" style="width: 100%" @change="onGoodsChange">
                <el-option v-for="item in goods" :key="item.goodsCode" :label="item.goodsName" :value="item.goodsCode" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="货物名称（可改）" prop="cargoName">
              <el-input v-model="createForm.cargoName" placeholder="如：光伏组件" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="货物重量（吨）" prop="cargoWeight">
              <el-input
                :model-value="String(createForm.cargoWeight)"
                type="number"
                min="0"
                @update:model-value="createForm.cargoWeight = Number($event)"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="要求发运日期" prop="requiredDate">
              <el-date-picker v-model="createForm.requiredDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="createForm.remark" placeholder="选填" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button :disabled="creating" @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">生成报价</el-button>
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
import { acceptQuote, createQuote, fetchQuotes, sendQuote } from '../api/quote';
import { fetchCustomers, fetchContainerTypes, fetchGoods, fetchRoutes } from '../api/master';
import { QUOTE_STATUS_OPTIONS, ORDER_TYPE_OPTIONS, modeLabel, orderTypeLabel } from '../utils/constants';
import { formatAmount, formatDate } from '../utils/format';
import type {
  ContainerTypeItem,
  CreateQuotePayload,
  Customer,
  GoodsItem,
  QuoteListItem,
  RouteTemplate,
} from '../types';

const router = useRouter();

const loading = ref(false);
const errorText = ref('');
const rows = ref<QuoteListItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const keyword = ref('');
const statusFilter = ref('');
const actingId = ref<number | null>(null);

const createVisible = ref(false);
const creating = ref(false);
const createFormRef = ref<FormInstance>();
const customers = ref<Customer[]>([]);
const routes = ref<RouteTemplate[]>([]);
const goods = ref<GoodsItem[]>([]);
const containerTypes = ref<ContainerTypeItem[]>([]);
const orderTypeOptions = ORDER_TYPE_OPTIONS;

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const pad = (n: number) => String(n).padStart(2, '0');
const defaultDate = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;

const createForm = reactive<CreateQuotePayload>({
  customerId: 1,
  orderType: 'ROAD_RAIL_SEA',
  routeTemplateId: 1,
  containerTypeCode: '40HQ',
  containerCount: 1,
  goodsCode: undefined,
  cargoName: '光伏组件',
  cargoWeight: 22.5,
  requiredDate: defaultDate,
  remark: '',
});

const createRules: FormRules = {
  customerId: [{ required: true, message: '请选择客户', trigger: 'change' }],
  orderType: [{ required: true, message: '请选择订单类型', trigger: 'change' }],
  routeTemplateId: [{ required: true, message: '请选择线路模板', trigger: 'change' }],
  containerTypeCode: [{ required: true, message: '请选择箱型', trigger: 'change' }],
  containerCount: [{ required: true, message: '请输入箱量', trigger: 'blur' }],
  cargoName: [{ required: true, message: '请输入货物名称', trigger: 'blur' }],
  cargoWeight: [{ required: true, message: '请输入货物重量', trigger: 'blur' }],
  requiredDate: [{ required: true, message: '请选择要求发运日期', trigger: 'change' }],
};

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchQuotes({
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
    errorText.value = error instanceof Error && error.message ? error.message : '报价列表加载失败';
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
  void router.push(`/quotes/${id}`);
}

async function send(row: QuoteListItem): Promise<void> {
  actingId.value = row.id;
  try {
    await sendQuote(row.id);
    ElMessage.success(`报价已发送：${row.quoteNo}`);
    await load();
  } finally {
    actingId.value = null;
  }
}

async function accept(row: QuoteListItem): Promise<void> {
  actingId.value = row.id;
  try {
    const result = await acceptQuote(row.id);
    ElMessage.success(`接受报价成功，已生成订单 ${result.orderNo}`);
    await router.push(`/orders/${result.orderId}`);
  } finally {
    actingId.value = null;
  }
}

async function openCreate(): Promise<void> {
  createVisible.value = true;
  try {
    const [customerData, routeData, goodsData, containerTypeData] = await Promise.all([
      fetchCustomers({ page: 1, pageSize: 100 }),
      fetchRoutes(),
      fetchGoods(),
      fetchContainerTypes(),
    ]);
    customers.value = customerData.list;
    routes.value = routeData;
    goods.value = goodsData;
    containerTypes.value = containerTypeData;
    if (customerData.list.length > 0) createForm.customerId = customerData.list[0].id;
    if (routeData.length > 0) createForm.routeTemplateId = routeData[0].id;
    if (containerTypeData.length > 0) createForm.containerTypeCode = containerTypeData[0].code;
  } catch {
    // 选项加载失败时仍可手工填写（错误提示由拦截器给出）
  }
}

function onGoodsChange(code: string): void {
  const item = goods.value.find((entry) => entry.goodsCode === code);
  if (item) {
    createForm.cargoName = item.goodsName;
    if (item.defaultWeight) createForm.cargoWeight = Number(item.defaultWeight);
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
    const quote = await createQuote({
      customerId: Number(createForm.customerId),
      orderType: createForm.orderType,
      routeTemplateId: Number(createForm.routeTemplateId),
      containerTypeCode: createForm.containerTypeCode,
      containerCount: Number(createForm.containerCount),
      goodsCode: createForm.goodsCode,
      cargoName: createForm.cargoName.trim(),
      cargoWeight: Number(createForm.cargoWeight),
      requiredDate: createForm.requiredDate,
      remark: createForm.remark?.trim() || undefined,
    });
    ElMessage.success(`询价已生成报价：${quote.quoteNo}，合计 ¥${formatAmount(quote.totalAmount)}`);
    createVisible.value = false;
    await router.push(`/quotes/${quote.id}`);
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
