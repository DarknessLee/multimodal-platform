<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">系统配置与数据字典</h2>
        <p class="page-subtitle">可编辑参数在线更新 · 数据字典维护（变更写审计）</p>
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

    <el-tabs v-model="activeTab" class="ops-tabs">
      <el-tab-pane label="系统配置" name="configs">
        <div class="card">
          <div class="card-title">
            <span class="card-title-text">配置项（{{ configs.length }}）</span>
            <span class="muted">不可编辑项由平台固定，更新失败返回 42201</span>
          </div>
          <el-table v-loading="loading" :data="configs" size="small" border stripe>
            <el-table-column label="配置键" min-width="220">
              <template #default="{ row }"><span class="mono" data-testid="ops-config-row">{{ row.configKey }}</span></template>
            </el-table-column>
            <el-table-column prop="category" label="分类" width="110" align="center">
              <template #default="{ row }">{{ OPS_CONFIG_CATEGORY_LABELS[row.category] || row.category }}</template>
            </el-table-column>
            <el-table-column prop="description" label="说明" min-width="200" show-overflow-tooltip />
            <el-table-column label="配置值" min-width="240">
              <template #default="{ row }">
                <el-input
                  v-if="row.editable"
                  v-model="draftValues[row.configKey]"
                  size="small"
                  placeholder="配置值"
                />
                <span v-else class="muted">{{ row.configValue }}（只读）</span>
              </template>
            </el-table-column>
            <el-table-column label="更新时间" width="150">
              <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="center">
              <template #default="{ row }">
                <PermissionGuard permission="ops:config-update">
                  <el-button
                    v-if="row.editable"
                    size="small"
                    text
                    type="primary"
                    data-testid="ops-config-save"
                    :loading="savingKey === row.configKey"
                    @click="saveConfig(row as OpsConfigItem)"
                  >
                    保存
                  </el-button>
                </PermissionGuard>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!loading && configs.length === 0" description="暂无配置数据" :image-size="60" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="数据字典" name="dicts">
        <div class="card">
          <div class="card-title">
            <span class="card-title-text">字典项（{{ dicts.length }}）</span>
            <div class="card-title__actions">
              <el-select v-model="dictTypeFilter" placeholder="全部字典类型" clearable style="width: 180px" @change="loadDicts">
                <el-option v-for="type in dictTypes" :key="type" :label="type" :value="type" />
              </el-select>
              <PermissionGuard permission="ops:dict-manage">
                <el-button type="primary" data-testid="ops-dict-create" @click="openDictCreate">新增字典</el-button>
              </PermissionGuard>
            </div>
          </div>
          <el-table v-loading="dictLoading" :data="dicts" size="small" border stripe>
            <el-table-column label="字典类型 / 键" min-width="200">
              <template #default="{ row }">
                <span class="mono" data-testid="ops-dict-row">{{ row.dictType }} / {{ row.dictKey }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="dictValue" label="字典值" min-width="160" />
            <el-table-column prop="sort" label="排序" width="76" align="right" />
            <el-table-column label="状态" width="96" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" size="small" effect="plain">
                  {{ row.status === 'ACTIVE' ? '启用' : '停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
            <el-table-column label="操作" width="90" align="center">
              <template #default="{ row }">
                <PermissionGuard permission="ops:dict-manage">
                  <el-button size="small" text type="primary" @click="openDictEdit(row as OpsDictItem)">编辑</el-button>
                </PermissionGuard>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!dictLoading && dicts.length === 0" description="暂无字典数据" :image-size="60" />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 新增字典 -->
    <el-dialog v-model="dictCreateVisible" title="新增数据字典" width="520px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="字典类型">
              <el-input v-model="dictForm.dictType" placeholder="如 order_status" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="字典键">
              <el-input v-model="dictForm.dictKey" placeholder="如 CREATED" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="字典值">
              <el-input v-model="dictForm.dictValue" placeholder="如 待调度" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="排序">
              <el-input
                :model-value="String(dictForm.sort)"
                type="number"
                min="0"
                @update:model-value="dictForm.sort = Number($event)"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="dictForm.remark" placeholder="备注（可选）" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button :disabled="dictSaving" @click="dictCreateVisible = false">取消</el-button>
        <el-button type="primary" :loading="dictSaving" @click="submitDictCreate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 编辑字典 -->
    <el-dialog v-model="dictEditVisible" title="编辑数据字典" width="480px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="字典项">
          <span class="mono">{{ editTarget?.dictType }} / {{ editTarget?.dictKey }}</span>
        </el-form-item>
        <el-form-item label="字典值">
          <el-input v-model="dictForm.dictValue" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input
            :model-value="String(dictForm.sort)"
            type="number"
            min="0"
            @update:model-value="dictForm.sort = Number($event)"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="dictForm.status">
            <el-radio value="ACTIVE">启用</el-radio>
            <el-radio value="DISABLED">停用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="dictSaving" @click="dictEditVisible = false">取消</el-button>
        <el-button type="primary" :loading="dictSaving" @click="submitDictEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PermissionGuard from '../components/PermissionGuard.vue';
import {
  createOpsDict,
  fetchOpsConfigs,
  fetchOpsDicts,
  updateOpsConfig,
  updateOpsDict,
} from '../api/ops';
import { OPS_CONFIG_CATEGORY_LABELS } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { OpsConfigItem, OpsDictItem } from '../types';

const loading = ref(false);
const dictLoading = ref(false);
const errorText = ref('');
const activeTab = ref('configs');

const configs = ref<OpsConfigItem[]>([]);
const draftValues = reactive<Record<string, string>>({});
const savingKey = ref<string | null>(null);

const dicts = ref<OpsDictItem[]>([]);
const dictTypeFilter = ref('');
const dictTypes = computed(() => [...new Set(dicts.value.map((item) => item.dictType))].sort());

const dictCreateVisible = ref(false);
const dictEditVisible = ref(false);
const dictSaving = ref(false);
const editTarget = ref<OpsDictItem | null>(null);
const dictForm = reactive({
  dictType: '',
  dictKey: '',
  dictValue: '',
  sort: 0,
  remark: '',
  status: 'ACTIVE',
});

async function loadConfigs(): Promise<void> {
  loading.value = true;
  try {
    configs.value = await fetchOpsConfigs();
    for (const item of configs.value) {
      draftValues[item.configKey] = item.configValue;
    }
  } catch {
    configs.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadDicts(): Promise<void> {
  dictLoading.value = true;
  try {
    dicts.value = await fetchOpsDicts({ dictType: dictTypeFilter.value || undefined });
  } catch {
    dicts.value = [];
  } finally {
    dictLoading.value = false;
  }
}

async function loadAll(): Promise<void> {
  errorText.value = '';
  await Promise.allSettled([loadConfigs(), loadDicts()]);
  if (configs.value.length === 0 && dicts.value.length === 0) {
    errorText.value = '系统配置/字典数据加载失败（后端接口未就绪）';
  }
}

async function saveConfig(row: OpsConfigItem): Promise<void> {
  const value = String(draftValues[row.configKey] ?? '');
  if (value === row.configValue) {
    ElMessage.info('配置值未变更');
    return;
  }
  savingKey.value = row.configKey;
  try {
    const updated = await updateOpsConfig(row.configKey, value);
    ElMessage.success(`配置已更新：${updated.configKey}`);
    await loadConfigs();
  } finally {
    savingKey.value = null;
  }
}

function openDictCreate(): void {
  dictForm.dictType = dictTypeFilter.value || dictTypes.value[0] || '';
  dictForm.dictKey = '';
  dictForm.dictValue = '';
  dictForm.sort = 0;
  dictForm.remark = '';
  dictCreateVisible.value = true;
}

async function submitDictCreate(): Promise<void> {
  if (!dictForm.dictType.trim() || !dictForm.dictKey.trim() || !dictForm.dictValue.trim()) {
    ElMessage.warning('字典类型/键/值不能为空');
    return;
  }
  dictSaving.value = true;
  try {
    await createOpsDict({
      dictType: dictForm.dictType.trim(),
      dictKey: dictForm.dictKey.trim(),
      dictValue: dictForm.dictValue.trim(),
      sort: dictForm.sort,
      remark: dictForm.remark.trim() || undefined,
    });
    ElMessage.success('字典项已新增');
    dictCreateVisible.value = false;
    await loadDicts();
  } finally {
    dictSaving.value = false;
  }
}

function openDictEdit(row: OpsDictItem): void {
  editTarget.value = row;
  dictForm.dictType = row.dictType;
  dictForm.dictKey = row.dictKey;
  dictForm.dictValue = row.dictValue;
  dictForm.sort = row.sort;
  dictForm.remark = row.remark ?? '';
  dictForm.status = row.status;
  dictEditVisible.value = true;
}

async function submitDictEdit(): Promise<void> {
  if (!editTarget.value) return;
  dictSaving.value = true;
  try {
    await updateOpsDict(editTarget.value.id, {
      dictValue: dictForm.dictValue,
      sort: dictForm.sort,
      status: dictForm.status,
      remark: dictForm.remark.trim(),
    });
    ElMessage.success('字典项已更新');
    dictEditVisible.value = false;
    await loadDicts();
  } finally {
    dictSaving.value = false;
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

.ops-tabs {
  margin-top: 4px;
}

.card-title__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
