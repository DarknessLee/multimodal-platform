<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">主数据</h2>
        <p class="page-subtitle">线路模板 / 港站节点 / 货物 / 箱型 / 价格规则</p>
      </div>
      <div class="page-actions">
        <el-button :loading="loading" @click="loadAll">刷新</el-button>
      </div>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="loadAll">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card master-card">
      <el-tabs v-model="activeTab" class="master-tabs">
        <!-- 线路 -->
        <el-tab-pane name="routes">
          <template #label>
            <span data-testid="master-tab-routes">线路模板</span>
          </template>
          <el-table v-loading="loading" :data="routes" size="small" border stripe>
            <el-table-column prop="routeCode" label="线路编码" width="130">
              <template #default="{ row }">
                <span class="mono">{{ row.routeCode }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="routeName" label="线路名称" min-width="220" show-overflow-tooltip />
            <el-table-column label="起讫节点" min-width="220">
              <template #default="{ row }">
                {{ row.originNode?.nodeName }} → {{ row.destinationNode?.nodeName }}
              </template>
            </el-table-column>
            <el-table-column label="途经节点" min-width="230">
              <template #default="{ row }">
                <span v-if="row.transitNodes?.length">
                  {{ row.transitNodes.map((node: RouteNode) => node.nodeName).join(' / ') }}
                </span>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="运输方式" width="150">
              <template #default="{ row }">
                <el-tag v-for="mode in row.modes" :key="mode" size="small" effect="plain" class="mode-tag">
                  {{ modeLabel(mode) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="里程(km)" width="100" align="right">
              <template #default="{ row }">{{ row.distanceKm }}</template>
            </el-table-column>
            <el-table-column label="时效(天)" width="94" align="right">
              <template #default="{ row }">{{ Number(row.transitDays).toFixed(1) }}</template>
            </el-table-column>
            <el-table-column label="基础成本(元)" width="120" align="right">
              <template #default="{ row }">
                <span class="amount">{{ formatAmount(row.baseCost) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="可靠度" width="92" align="right">
              <template #default="{ row }">{{ Number(row.reliability).toFixed(1) }}%</template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!loading && routes.length === 0" description="暂无线路模板" :image-size="70" />
        </el-tab-pane>

        <!-- 港站 -->
        <el-tab-pane name="ports">
          <template #label>
            <span data-testid="master-tab-ports">港站节点</span>
          </template>
          <el-table v-loading="loading" :data="ports" size="small" border stripe>
            <el-table-column prop="nodeCode" label="节点代码" width="120">
              <template #default="{ row }">
                <span class="mono">{{ row.nodeCode }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="nodeName" label="节点名称" min-width="180" />
            <el-table-column label="类型" width="110">
              <template #default="{ row }">
                <el-tag size="small" effect="plain">{{ row.nodeTypeLabel || nodeTypeLabel(row.nodeType) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="regionCode" label="区域码" width="90" align="center" />
            <el-table-column prop="address" label="地址" min-width="220" show-overflow-tooltip />
            <el-table-column label="经纬度" width="160">
              <template #default="{ row }">
                <span class="mono">{{ Number(row.lng).toFixed(3) }}, {{ Number(row.lat).toFixed(3) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="吞吐(TEU)" width="110" align="right">
              <template #default="{ row }">{{ row.capacityTeu ?? '—' }}</template>
            </el-table-column>
            <el-table-column prop="operatingHours" label="作业时间" width="140" />
          </el-table>
          <el-empty v-if="!loading && ports.length === 0" description="暂无港站节点" :image-size="70" />
        </el-tab-pane>

        <!-- 货物 -->
        <el-tab-pane name="goods">
          <template #label>
            <span data-testid="master-tab-goods">货物</span>
          </template>
          <el-table v-loading="loading" :data="goods" size="small" border stripe>
            <el-table-column prop="goodsCode" label="货物编码" width="110">
              <template #default="{ row }">
                <span class="mono">{{ row.goodsCode }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="goodsName" label="货物名称" min-width="160" />
            <el-table-column prop="category" label="品类" width="120" />
            <el-table-column prop="hsCode" label="HS 编码" width="130">
              <template #default="{ row }">
                <span class="mono">{{ row.hsCode || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="危险品" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="isDangerous(row.dangerousFlag) ? 'danger' : 'info'" size="small" effect="plain">
                  {{ isDangerous(row.dangerousFlag) ? '是' : '否' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="packaging" label="包装" width="120" />
            <el-table-column prop="unit" label="计量单位" width="100" align="center" />
          </el-table>
          <el-empty v-if="!loading && goods.length === 0" description="暂无货物数据" :image-size="70" />
        </el-tab-pane>

        <!-- 箱型 -->
        <el-tab-pane name="container-types">
          <template #label>
            <span data-testid="master-tab-container-types">箱型</span>
          </template>
          <el-table v-loading="loading" :data="containerTypes" size="small" border stripe>
            <el-table-column prop="code" label="箱型代码" width="110">
              <template #default="{ row }">
                <span class="mono">{{ row.code }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="箱型名称" min-width="180" />
            <el-table-column label="内容积(m³)" width="120" align="right">
              <template #default="{ row }">{{ Number(row.innerVolumeCbm).toFixed(1) }}</template>
            </el-table-column>
            <el-table-column label="最大载重(t)" width="120" align="right">
              <template #default="{ row }">{{ Number(row.maxPayloadT).toFixed(1) }}</template>
            </el-table-column>
            <el-table-column label="皮重(t)" width="100" align="right">
              <template #default="{ row }">{{ Number(row.tareWeightT).toFixed(1) }}</template>
            </el-table-column>
            <el-table-column label="TEU" width="80" align="right">
              <template #default="{ row }">{{ Number(row.teu).toFixed(1) }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!loading && containerTypes.length === 0" description="暂无箱型数据" :image-size="70" />
        </el-tab-pane>

        <!-- 价格规则 -->
        <el-tab-pane name="price-rules">
          <template #label>
            <span data-testid="master-tab-price-rules">价格规则</span>
          </template>
          <div class="tab-toolbar">
            <span class="muted">共 {{ priceRuleTotal }} 条规则（合同价 > 客户协议价 > 线路公开价，按优先级匹配）</span>
            <PermissionGuard permission="price:create">
              <el-button type="primary" size="small" data-testid="price-rule-create-btn" @click="openPriceRuleCreate">
                新增价格规则
              </el-button>
            </PermissionGuard>
          </div>
          <el-table v-loading="loading" data-testid="price-rule-table" :data="priceRules" size="small" border stripe>
            <el-table-column prop="ruleNo" label="规则号" width="120">
              <template #default="{ row }">
                <span class="mono">{{ row.ruleNo }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="ruleName" label="规则名称" min-width="220" show-overflow-tooltip />
            <el-table-column label="模式" width="86" align="center">
              <template #default="{ row }">
                <el-tag size="small" effect="plain">{{ row.modeLabel || modeLabel(row.mode) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="费用类型" width="96" align="center">
              <template #default="{ row }">{{ row.chargeTypeLabel || chargeTypeLabel(row.chargeType) }}</template>
            </el-table-column>
            <el-table-column prop="routeTemplateName" label="线路" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">{{ row.routeTemplateName || '—' }}</template>
            </el-table-column>
            <el-table-column prop="containerTypeCode" label="箱型" width="80" align="center">
              <template #default="{ row }">{{ row.containerTypeCode || '—' }}</template>
            </el-table-column>
            <el-table-column label="客户" min-width="130" show-overflow-tooltip>
              <template #default="{ row }">{{ row.customerName || '公开价' }}</template>
            </el-table-column>
            <el-table-column label="计费方式" width="94" align="center">
              <template #default="{ row }">{{ row.calcMethodLabel || calcMethodLabel(row.calcMethod) }}</template>
            </el-table-column>
            <el-table-column label="单价(元)" width="110" align="right">
              <template #default="{ row }">
                <span class="amount">{{ formatAmount(row.unitPrice) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="有效期" width="190">
              <template #default="{ row }">
                {{ formatDate(row.effectiveFrom) }} ~ {{ formatDate(row.effectiveTo) }}
              </template>
            </el-table-column>
            <el-table-column prop="priority" label="优先级" width="80" align="right" />
          </el-table>
          <el-empty v-if="!loading && priceRules.length === 0" description="暂无价格规则" :image-size="70" />
          <div class="pagination-wrap">
            <el-pagination
              v-model:current-page="priceRulePage"
              :page-size="priceRulePageSize"
              :total="priceRuleTotal"
              layout="total, prev, pager, next"
              background
              @current-change="loadPriceRules"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 新增价格规则 -->
    <el-dialog v-model="priceRuleVisible" title="新增价格规则" width="680px" :close-on-click-modal="false">
      <el-form ref="priceRuleFormRef" :model="priceRuleForm" :rules="priceRuleRules" label-position="top">
        <el-row :gutter="16">
          <el-col :span="24">
            <el-form-item label="规则名称" prop="ruleName">
              <el-input v-model="priceRuleForm.ruleName" placeholder="如：上海—成都 公铁水 40HQ 公开价" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="运输模式" prop="mode">
              <el-select v-model="priceRuleForm.mode" style="width: 100%">
                <el-option v-for="mode in modeOptions" :key="mode.value" :label="mode.label" :value="mode.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="费用类型" prop="chargeType">
              <el-select v-model="priceRuleForm.chargeType" style="width: 100%">
                <el-option label="基础费" value="BASE" />
                <el-option label="附加费" value="SURCHARGE" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="线路模板">
              <el-select v-model="priceRuleForm.routeTemplateId" clearable placeholder="选填" style="width: 100%">
                <el-option v-for="route in routes" :key="route.id" :label="route.routeName" :value="route.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="箱型">
              <el-select v-model="priceRuleForm.containerTypeCode" clearable placeholder="选填" style="width: 100%">
                <el-option v-for="type in containerTypes" :key="type.code" :label="`${type.code} ${type.name}`" :value="type.code" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="计费方式" prop="calcMethod">
              <el-select v-model="priceRuleForm.calcMethod" style="width: 100%">
                <el-option v-for="option in CALC_METHOD_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="优先级（数字越小越优先）">
              <el-input
                :model-value="String(priceRuleForm.priority ?? 100)"
                type="number"
                @update:model-value="priceRuleForm.priority = Number($event)"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单价（元）" prop="unitPrice">
              <el-input
                :model-value="String(priceRuleForm.unitPrice)"
                type="number"
                min="0"
                @update:model-value="priceRuleForm.unitPrice = Number($event)"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="最低收费（元）">
              <el-input
                :model-value="String(priceRuleForm.minCharge ?? 0)"
                type="number"
                min="0"
                @update:model-value="priceRuleForm.minCharge = Number($event)"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="生效日期" prop="effectiveFrom">
              <el-date-picker v-model="priceRuleForm.effectiveFrom" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="失效日期" prop="effectiveTo">
              <el-date-picker v-model="priceRuleForm.effectiveTo" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button :disabled="creatingRule" @click="priceRuleVisible = false">取消</el-button>
        <el-button type="primary" :loading="creatingRule" @click="submitPriceRule">保存规则</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import PermissionGuard from '../components/PermissionGuard.vue';
import {
  createPriceRule,
  fetchContainerTypes,
  fetchGoods,
  fetchPorts,
  fetchPriceRules,
  fetchRoutes,
} from '../api/master';
import {
  CALC_METHOD_OPTIONS,
  chargeTypeLabel,
  calcMethodLabel,
  modeLabel,
  nodeTypeLabel,
} from '../utils/constants';
import { formatAmount, formatDate } from '../utils/format';
import type {
  ContainerTypeItem,
  CreatePriceRulePayload,
  GoodsItem,
  PortStation,
  PriceRule,
  RouteNode,
  RouteTemplate,
} from '../types';

const activeTab = ref('routes');
const loading = ref(false);
const errorText = ref('');

const routes = ref<RouteTemplate[]>([]);
const ports = ref<PortStation[]>([]);
const goods = ref<GoodsItem[]>([]);
const containerTypes = ref<ContainerTypeItem[]>([]);
const priceRules = ref<PriceRule[]>([]);
const priceRuleTotal = ref(0);
const priceRulePage = ref(1);
const priceRulePageSize = ref(10);

const modeOptions = [
  { value: 'ROAD', label: '公路' },
  { value: 'SEA', label: '海运' },
  { value: 'RAIL', label: '铁路' },
  { value: 'PORT', label: '港杂' },
];

const priceRuleVisible = ref(false);
const creatingRule = ref(false);
const priceRuleFormRef = ref<FormInstance>();
const today = new Date();
const endOfYear = `${today.getFullYear()}-12-31`;
const priceRuleForm = reactive<CreatePriceRulePayload>({
  ruleName: '',
  mode: 'RAIL',
  chargeType: 'BASE',
  routeTemplateId: null,
  containerTypeCode: '40HQ',
  customerId: null,
  calcMethod: 'PER_CONTAINER',
  unitPrice: 0,
  minCharge: 0,
  effectiveFrom: `${today.getFullYear()}-01-01`,
  effectiveTo: endOfYear,
  priority: 100,
});

const priceRuleRules: FormRules = {
  ruleName: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  mode: [{ required: true, message: '请选择运输模式', trigger: 'change' }],
  chargeType: [{ required: true, message: '请选择费用类型', trigger: 'change' }],
  calcMethod: [{ required: true, message: '请选择计费方式', trigger: 'change' }],
  unitPrice: [{ required: true, message: '请输入单价', trigger: 'blur' }],
  effectiveFrom: [{ required: true, message: '请选择生效日期', trigger: 'change' }],
  effectiveTo: [{ required: true, message: '请选择失效日期', trigger: 'change' }],
};

function isDangerous(flag: boolean | number): boolean {
  return flag === true || flag === 1;
}

async function loadPriceRules(): Promise<void> {
  try {
    const data = await fetchPriceRules({ page: priceRulePage.value, pageSize: priceRulePageSize.value });
    priceRules.value = data.list;
    priceRuleTotal.value = data.total;
  } catch {
    priceRules.value = [];
    priceRuleTotal.value = 0;
  }
}

async function loadAll(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const [routeData, portData, goodsData, containerTypeData] = await Promise.all([
      fetchRoutes(),
      fetchPorts(),
      fetchGoods(),
      fetchContainerTypes(),
    ]);
    routes.value = routeData;
    ports.value = portData;
    goods.value = goodsData;
    containerTypes.value = containerTypeData;
    await loadPriceRules();
  } catch (error) {
    errorText.value = error instanceof Error && error.message ? error.message : '主数据加载失败，请重试';
  } finally {
    loading.value = false;
  }
}

function openPriceRuleCreate(): void {
  priceRuleVisible.value = true;
}

async function submitPriceRule(): Promise<void> {
  const formEl = priceRuleFormRef.value;
  if (!formEl) return;
  try {
    await formEl.validate();
  } catch {
    return;
  }
  creatingRule.value = true;
  try {
    const rule = await createPriceRule({
      ...priceRuleForm,
      routeTemplateId: priceRuleForm.routeTemplateId || null,
      containerTypeCode: priceRuleForm.containerTypeCode || null,
      unitPrice: Number(priceRuleForm.unitPrice),
      minCharge: Number(priceRuleForm.minCharge) || 0,
      priority: Number(priceRuleForm.priority) || 100,
    });
    ElMessage.success(`价格规则创建成功：${rule.ruleNo}`);
    priceRuleVisible.value = false;
    priceRuleForm.ruleName = '';
    priceRulePage.value = 1;
    await loadPriceRules();
    activeTab.value = 'price-rules';
  } finally {
    creatingRule.value = false;
  }
}

onMounted(loadAll);
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}

.retry-btn {
  margin-top: 6px;
}

.master-card {
  padding-top: 8px;
}

.master-tabs :deep(.el-tabs__header) {
  margin-bottom: 14px;
}

.mode-tag + .mode-tag {
  margin-left: 4px;
}

.tab-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
