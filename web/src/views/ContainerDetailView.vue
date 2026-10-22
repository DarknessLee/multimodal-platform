<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">集装箱详情</h2>
        <p v-if="detail" class="page-subtitle">
          箱号 <span class="mono">{{ detail.container.containerNo }}</span> · 全生命周期动态与堆存
        </p>
      </div>
      <div class="page-actions">
        <el-button @click="goCenter">返回箱管中心</el-button>
        <PermissionGuard permission="container:release">
          <el-button type="primary" data-testid="container-release" @click="openRelease">放箱</el-button>
        </PermissionGuard>
        <PermissionGuard permission="container:movement">
          <el-button data-testid="container-movement" @click="openMovement">登记动态</el-button>
        </PermissionGuard>
        <PermissionGuard permission="container:return">
          <el-button type="success" data-testid="container-return" @click="openReturn">还箱</el-button>
        </PermissionGuard>
        <PermissionGuard permission="container:movement">
          <el-button type="warning" plain @click="openRepair">箱损维修</el-button>
        </PermissionGuard>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div v-loading="loading">
      <template v-if="detail">
        <div class="card">
          <div class="container-head">
            <div class="container-head__item">
              <span class="meta-label">箱号</span>
              <span class="mono container-head__no">{{ detail.container.containerNo }}</span>
            </div>
            <div class="container-head__item">
              <span class="meta-label">箱型</span>
              <span>{{ detail.container.type }}</span>
            </div>
            <div class="container-head__item">
              <span class="meta-label">箱状态</span>
              <StatusTag
                kind="container"
                :status="detail.container.status"
                :label="detail.container.statusLabel"
                size="large"
              />
            </div>
            <div class="container-head__item">
              <span class="meta-label">当前位置</span>
              <span>{{ detail.container.currentNode || '—' }}</span>
            </div>
            <div class="container-head__item">
              <span class="meta-label">当前运单</span>
              <router-link v-if="detail.waybill" :to="`/waybills/${detail.waybill.id}`" class="mono">
                {{ detail.waybill.waybillNo }}
              </router-link>
              <span v-else class="muted">—</span>
            </div>
            <div class="container-head__item">
              <span class="meta-label">箱况</span>
              <span>{{ detail.container.conditionText || '—' }}</span>
            </div>
            <div class="container-head__item">
              <span class="meta-label">累计维修费(元)</span>
              <span class="amount">¥{{ formatAmount(detail.container.repairFee ?? 0) }}</span>
            </div>
          </div>
        </div>

        <div class="container-grid">
          <!-- 箱动态 -->
          <div class="card">
            <h3 class="card-title">
              <span class="card-title-text">箱动态（{{ detail.movements.length }}）</span>
              <span class="muted">放箱 / 提箱 / 进场 / 装箱 / 发运 / 卸箱 / 还箱</span>
            </h3>
            <div data-testid="container-movements">
              <el-timeline v-if="detail.movements.length">
                <el-timeline-item
                  v-for="movement in detail.movements"
                  :key="movement.id"
                  :timestamp="formatDateTime(movement.occurredAt)"
                  placement="top"
                  :color="movementColor(movement.movementType)"
                >
                  <div class="movement-line">
                    <el-tag size="small" effect="plain">{{ movement.movementLabel || movementTypeLabel(movement.movementType) }}</el-tag>
                    <span class="movement-node">{{ movement.nodeName || '—' }}</span>
                    <span class="muted">{{ movement.conditionText || '' }}</span>
                  </div>
                  <div class="movement-meta muted">
                    <span v-if="movement.operator">操作人：{{ movement.operator }}</span>
                    <span v-if="movement.remark">备注：{{ movement.remark }}</span>
                  </div>
                </el-timeline-item>
              </el-timeline>
              <el-empty v-else description="暂无箱动态" :image-size="60" />
            </div>
          </div>

          <!-- 堆存记录 -->
          <div class="card">
            <h3 class="card-title"><span class="card-title-text">堆存记录（{{ detail.storage.length }}）</span></h3>
            <el-table v-if="detail.storage.length" :data="detail.storage" size="small" border stripe>
              <el-table-column prop="nodeName" label="堆场" min-width="140" />
              <el-table-column label="起止时间" min-width="220">
                <template #default="{ row }">
                  {{ formatDateTime(row.startAt) }} ~ {{ formatDateTime(row.endAt) }}
                </template>
              </el-table-column>
              <el-table-column label="堆存天数" width="96" align="right">
                <template #default="{ row }">{{ row.storageDays }} 天</template>
              </el-table-column>
              <el-table-column label="堆存费(元)" width="110" align="right">
                <template #default="{ row }">
                  <span class="amount">{{ formatAmount(row.feeAmount) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="96" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.status === 'STACKED' ? 'warning' : 'success'" size="small" effect="plain">
                    {{ row.statusLabel || storageStatusLabel(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无堆存记录" :image-size="60" />
          </div>
        </div>
      </template>

      <el-empty v-else-if="!loading && !errorText" description="集装箱不存在或无权查看" />
    </div>

    <!-- 放箱 -->
    <el-dialog v-model="releaseVisible" title="放箱登记" width="480px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="关联运单">
          <el-select v-model="releaseForm.waybillId" filterable placeholder="选择运单" style="width: 100%">
            <el-option
              v-for="waybill in waybillOptions"
              :key="waybill.id"
              :label="`${waybill.waybillNo}（${waybill.waybillTypeLabel || waybillTypeLabel(waybill.waybillType)}）`"
              :value="waybill.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="放箱节点">
          <el-select v-model="releaseForm.nodeId" filterable clearable placeholder="选择节点（可选）" style="width: 100%">
            <el-option v-for="node in nodeOptions" :key="node.id" :label="`${node.nodeName}（${node.nodeTypeLabel || nodeTypeLabel(node.nodeType)}）`" :value="node.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="acting" @click="releaseVisible = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="submitRelease">确认放箱</el-button>
      </template>
    </el-dialog>

    <!-- 登记动态 -->
    <el-dialog v-model="movementVisible" title="登记箱动态" width="520px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="动态类型">
              <el-select v-model="movementForm.movementType" style="width: 100%">
                <el-option v-for="option in MOVEMENT_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="节点">
              <el-select v-model="movementForm.nodeId" filterable clearable placeholder="选择节点" style="width: 100%">
                <el-option v-for="node in nodeOptions" :key="node.id" :label="node.nodeName" :value="node.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="箱况">
              <el-select v-model="movementForm.conditionText" clearable placeholder="选择箱况" style="width: 100%">
                <el-option v-for="option in CONDITION_OPTIONS" :key="option" :label="option" :value="option" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="movementForm.remark" placeholder="选填" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button :disabled="acting" @click="movementVisible = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="submitMovement">确认登记</el-button>
      </template>
    </el-dialog>

    <!-- 还箱 -->
    <el-dialog v-model="returnVisible" title="还箱登记" width="480px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="还箱节点">
          <el-select v-model="returnForm.nodeId" filterable clearable placeholder="选择节点" style="width: 100%">
            <el-option v-for="node in nodeOptions" :key="node.id" :label="node.nodeName" :value="node.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="箱况">
          <el-select v-model="returnForm.conditionText" clearable placeholder="选择箱况" style="width: 100%">
            <el-option v-for="option in CONDITION_OPTIONS" :key="option" :label="option" :value="option" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="acting" @click="returnVisible = false">取消</el-button>
        <el-button type="success" :loading="acting" @click="submitReturn">确认还箱</el-button>
      </template>
    </el-dialog>

    <!-- 箱损维修 -->
    <el-dialog v-model="repairVisible" title="箱损维修登记" width="480px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="维修节点">
          <el-select v-model="repairForm.nodeId" filterable clearable placeholder="选择节点" style="width: 100%">
            <el-option v-for="node in nodeOptions" :key="node.id" :label="node.nodeName" :value="node.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="维修费用（元）">
          <el-input
            :model-value="String(repairForm.fee)"
            type="number"
            min="0"
            @update:model-value="repairForm.fee = Number($event)"
          />
        </el-form-item>
        <el-form-item label="维修说明">
          <el-input v-model="repairForm.remark" placeholder="如：右侧凹损" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="acting" @click="repairVisible = false">取消</el-button>
        <el-button type="warning" :loading="acting" @click="submitRepair">登记维修</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import PermissionGuard from '../components/PermissionGuard.vue';
import {
  addContainerMovement,
  fetchContainer,
  releaseContainer,
  repairContainer,
  returnContainer,
} from '../api/containers';
import { fetchWaybills } from '../api/waybillCenter';
import { fetchPorts } from '../api/master';
import {
  CONDITION_OPTIONS,
  MOVEMENT_TYPE_OPTIONS,
  movementTypeLabel,
  nodeTypeLabel,
  storageStatusLabel,
  waybillTypeLabel,
} from '../utils/constants';
import { formatAmount, formatDateTime } from '../utils/format';
import type { ContainerDetail, PortStation, WaybillListItem } from '../types';

const route = useRoute();
const router = useRouter();

const detail = ref<ContainerDetail | null>(null);
const loading = ref(false);
const acting = ref(false);
const errorText = ref('');
const nodeOptions = ref<PortStation[]>([]);
const waybillOptions = ref<WaybillListItem[]>([]);

const containerId = computed(() => String(route.params.id ?? ''));

const releaseVisible = ref(false);
const releaseForm = reactive<{ waybillId: number | null; nodeId: number | null }>({
  waybillId: null,
  nodeId: null,
});

const movementVisible = ref(false);
const movementForm = reactive<{
  movementType: string;
  nodeId: number | null;
  conditionText: string;
  remark: string;
}>({
  movementType: 'PICKUP',
  nodeId: null,
  conditionText: CONDITION_OPTIONS[0],
  remark: '',
});

const returnVisible = ref(false);
const returnForm = reactive<{ nodeId: number | null; conditionText: string }>({
  nodeId: null,
  conditionText: CONDITION_OPTIONS[0],
});

const repairVisible = ref(false);
const repairForm = reactive<{ nodeId: number | null; fee: number; remark: string }>({
  nodeId: null,
  fee: 0,
  remark: '',
});

function movementColor(type: string): string {
  if (type === 'RELEASE' || type === 'PICKUP') return '#e6a23c';
  if (type === 'RETURN') return '#67c23a';
  if (type === 'REPAIR') return '#f56c6c';
  if (type === 'LOAD' || type === 'DISCHARGE') return '#409eff';
  return '#909399';
}

async function loadOptions(): Promise<void> {
  try {
    const [ports, waybills] = await Promise.all([
      fetchPorts(),
      fetchWaybills({ type: 'MASTER', page: 1, pageSize: 100 }),
    ]);
    nodeOptions.value = ports;
    waybillOptions.value = waybills.list;
  } catch {
    nodeOptions.value = [];
    waybillOptions.value = [];
  }
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    detail.value = await fetchContainer(containerId.value);
  } catch (error) {
    detail.value = null;
    errorText.value = error instanceof Error && error.message ? error.message : '集装箱详情加载失败';
  } finally {
    loading.value = false;
  }
}

function goCenter(): void {
  void router.push('/containers');
}

function openRelease(): void {
  releaseForm.waybillId = detail.value?.waybill?.id ?? waybillOptions.value[0]?.id ?? null;
  releaseForm.nodeId = null;
  releaseVisible.value = true;
}

function openMovement(): void {
  movementForm.movementType = 'PICKUP';
  movementForm.nodeId = null;
  movementForm.conditionText = CONDITION_OPTIONS[0];
  movementForm.remark = '';
  movementVisible.value = true;
}

function openReturn(): void {
  returnForm.nodeId = null;
  returnForm.conditionText = CONDITION_OPTIONS[0];
  returnVisible.value = true;
}

function openRepair(): void {
  repairForm.nodeId = null;
  repairForm.fee = 280;
  repairForm.remark = '';
  repairVisible.value = true;
}

async function submitRelease(): Promise<void> {
  if (!releaseForm.waybillId) {
    ElMessage.warning('请选择关联运单');
    return;
  }
  acting.value = true;
  try {
    await releaseContainer(containerId.value, {
      waybillId: releaseForm.waybillId,
      nodeId: releaseForm.nodeId,
    });
    ElMessage.success('放箱登记成功');
    releaseVisible.value = false;
    await load();
  } finally {
    acting.value = false;
  }
}

async function submitMovement(): Promise<void> {
  acting.value = true;
  try {
    await addContainerMovement(containerId.value, {
      movementType: movementForm.movementType,
      nodeId: movementForm.nodeId,
      conditionText: movementForm.conditionText || undefined,
      remark: movementForm.remark.trim() || undefined,
    });
    ElMessage.success(`箱动态登记成功：${movementTypeLabel(movementForm.movementType)}`);
    movementVisible.value = false;
    await load();
  } finally {
    acting.value = false;
  }
}

async function submitReturn(): Promise<void> {
  acting.value = true;
  try {
    await returnContainer(containerId.value, {
      nodeId: returnForm.nodeId,
      conditionText: returnForm.conditionText || undefined,
    });
    ElMessage.success('还箱登记成功');
    returnVisible.value = false;
    await load();
  } finally {
    acting.value = false;
  }
}

async function submitRepair(): Promise<void> {
  if (!repairForm.fee || repairForm.fee <= 0) {
    ElMessage.warning('请输入维修费用');
    return;
  }
  acting.value = true;
  try {
    await repairContainer(containerId.value, {
      nodeId: repairForm.nodeId,
      fee: repairForm.fee,
      remark: repairForm.remark.trim() || undefined,
    });
    ElMessage.success('箱损维修登记成功');
    repairVisible.value = false;
    await load();
  } finally {
    acting.value = false;
  }
}

onMounted(() => {
  void load();
  void loadOptions();
});
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}

.retry-btn {
  margin-top: 6px;
}

.container-head {
  display: flex;
  align-items: center;
  gap: 30px;
  flex-wrap: wrap;
}

.container-head__item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
}

.container-head__no {
  font-size: 16px;
  font-weight: 600;
}

.container-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.container-grid .card {
  margin-top: 0;
}

.movement-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.movement-node {
  font-weight: 600;
}

.movement-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 4px;
  font-size: 11.5px;
}

@media (max-width: 1100px) {
  .container-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
