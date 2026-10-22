<template>
  <div class="cargo-lines-editor">
    <div class="cargo-lines-editor__head">
      <span class="card-title-text">货物明细（多货物行）</span>
      <el-button type="primary" size="small" data-testid="add-cargo-line" :icon="Plus" @click="addLine">
        添加货物行
      </el-button>
    </div>

    <el-empty v-if="lines.length === 0" description="暂无货物行，点击「添加货物行」" :image-size="64" />

    <div
      v-for="(line, index) in lines"
      :key="index"
      class="cargo-line"
      data-testid="cargo-line"
    >
      <div class="cargo-line__index">#{{ index + 1 }}</div>
      <div class="cargo-line__fields">
        <el-form-item label="货物名称" class="cargo-line__field cargo-line__field--wide">
          <el-input
            v-model="line.goodsName"
            :data-testid="props.v0Testids && index === 0 ? 'order-cargo-name' : undefined"
            placeholder="如：光伏组件"
            clearable
          />
        </el-form-item>
        <el-form-item label="数量" class="cargo-line__field">
          <el-input
            :model-value="String(line.quantity)"
            type="number"
            min="1"
            placeholder="1"
            @update:model-value="line.quantity = Number($event)"
          />
        </el-form-item>
        <el-form-item label="单位" class="cargo-line__field">
          <el-input v-model="line.unit" placeholder="箱" />
        </el-form-item>
        <el-form-item label="重量(吨)" class="cargo-line__field">
          <el-input
            :model-value="String(line.weightT)"
            :data-testid="props.v0Testids && index === 0 ? 'order-weight' : undefined"
            type="number"
            min="0"
            placeholder="如 22.5"
            @update:model-value="line.weightT = Number($event)"
          />
        </el-form-item>
        <el-form-item label="体积(m³)" class="cargo-line__field">
          <el-input
            :model-value="line.volumeCbm === null || line.volumeCbm === undefined ? '' : String(line.volumeCbm)"
            type="number"
            min="0"
            placeholder="选填"
            @update:model-value="line.volumeCbm = $event === '' ? null : Number($event)"
          />
        </el-form-item>
        <el-form-item label="箱型" class="cargo-line__field">
          <el-select
            v-model="line.containerType"
            :data-testid="props.v0Testids && index === 0 ? 'order-container-type' : undefined"
            placeholder="箱型"
            style="width: 100%"
          >
            <el-option v-for="type in CONTAINER_TYPES" :key="type" :label="type" :value="type" />
          </el-select>
        </el-form-item>
        <el-form-item label="箱量" class="cargo-line__field">
          <el-input
            :model-value="String(line.containerCount)"
            :data-testid="props.v0Testids && index === 0 ? 'order-container-count' : undefined"
            type="number"
            min="0"
            placeholder="1"
            @update:model-value="line.containerCount = Number($event)"
          />
        </el-form-item>
      </div>
      <el-button
        class="cargo-line__remove"
        type="danger"
        text
        size="small"
        :disabled="lines.length <= 1"
        @click="removeLine(index)"
      >
        删除
      </el-button>
    </div>

    <div class="cargo-lines-editor__summary muted">
      共 {{ lines.length }} 行货物，箱量合计 {{ totalContainerCount }}，重量合计
      {{ totalWeight.toFixed(2) }} t
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { CONTAINER_TYPES } from '../utils/constants';
import type { CargoLine } from '../types';

const props = withDefaults(
  defineProps<{
    /** 首行字段是否绑定 v0 下单 testid（order-cargo-name 等），用于 v0 快速下单回归 */
    v0Testids?: boolean;
  }>(),
  { v0Testids: false },
);

const lines = defineModel<CargoLine[]>({ required: true });

const totalContainerCount = computed(() =>
  lines.value.reduce((sum, line) => sum + (Number(line.containerCount) || 0), 0),
);

const totalWeight = computed(() =>
  lines.value.reduce((sum, line) => sum + (Number(line.weightT) || 0), 0),
);

function createLine(): CargoLine {
  return {
    goodsName: '',
    quantity: 1,
    unit: '箱',
    weightT: 0,
    volumeCbm: null,
    containerType: '40HQ',
    containerCount: 1,
    dangerousFlag: 0,
  };
}

function addLine(): void {
  lines.value = [...lines.value, createLine()];
}

function removeLine(index: number): void {
  if (lines.value.length <= 1) return;
  const next = [...lines.value];
  next.splice(index, 1);
  lines.value = next;
}
</script>

<style scoped>
.cargo-lines-editor {
  border-top: 1px dashed var(--app-border);
  padding-top: 16px;
  margin-top: 4px;
}

.cargo-lines-editor__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.cargo-line {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 12px 14px 2px;
  margin-bottom: 10px;
  background: #fafcff;
}

.cargo-line__index {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--app-text-secondary);
  padding-top: 8px;
}

.cargo-line__fields {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0 12px;
}

.cargo-line__field {
  margin-bottom: 10px;
}

.cargo-line__field--wide {
  grid-column: span 2;
}

.cargo-line__field :deep(.el-form-item__label) {
  font-size: 12px;
  color: var(--app-text-secondary);
  padding-bottom: 2px !important;
  line-height: 1.4;
}

.cargo-line__remove {
  margin-top: 6px;
}

.cargo-lines-editor__summary {
  font-size: 12px;
  padding-left: 4px;
}

@media (max-width: 1200px) {
  .cargo-line__fields {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
