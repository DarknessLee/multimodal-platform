<template>
  <el-drawer v-model="visible" title="集成报文详情" size="560px">
    <div v-if="message" class="message-detail" data-testid="message-detail">
      <el-descriptions :column="1" border size="small">
        <el-descriptions-item label="报文号">
          <span class="mono">{{ message.msgNo }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="外部系统">
          {{ message.systemName }}（{{ message.systemCode }}）
        </el-descriptions-item>
        <el-descriptions-item label="报文类型">
          {{ message.msgType }} · {{ message.standard }}
        </el-descriptions-item>
        <el-descriptions-item label="方向 / 状态">
          {{ directionLabel }} / {{ message.statusLabel || integrationStatusLabel(message.status) }}
        </el-descriptions-item>
        <el-descriptions-item label="重试次数">{{ message.retryCount }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDateTime(message.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="关联对象">
          {{ message.relatedType || '—' }} {{ message.relatedId || '' }}
        </el-descriptions-item>
        <el-descriptions-item v-if="message.errorMessage" label="错误信息">
          <span class="error-text">{{ message.errorMessage }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <h4 class="message-detail__title">请求报文（payload）</h4>
      <pre class="message-detail__payload">{{ payloadText }}</pre>

      <template v-if="message.responsePayload">
        <h4 class="message-detail__title">响应报文（responsePayload）</h4>
        <pre class="message-detail__payload">{{ responseText }}</pre>
      </template>

      <div class="message-detail__actions">
        <PermissionGuard permission="integration:retry">
          <el-button
            type="primary"
            :disabled="message.status !== 'FAILED'"
            :loading="retrying"
            @click="retry"
          >
            重试报文
          </el-button>
        </PermissionGuard>
        <span v-if="message.status !== 'FAILED'" class="muted">仅「失败」状态报文可重试</span>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PermissionGuard from './PermissionGuard.vue';
import { retryIntegrationMessage } from '../api/integration';
import { INTEGRATION_DIRECTION_LABELS, integrationStatusLabel } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { IntegrationMessage } from '../types';

const visible = defineModel<boolean>({ required: true });
const props = defineProps<{ message: IntegrationMessage | null }>();
const emit = defineEmits<{ (event: 'retried', message: IntegrationMessage): void }>();

const retrying = ref(false);

const directionLabel = computed(
  () => INTEGRATION_DIRECTION_LABELS[props.message?.direction ?? ''] ?? props.message?.direction ?? '—',
);

function pretty(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const payloadText = computed(() => pretty(props.message?.payload ?? props.message?.payloadPreview));
const responseText = computed(() => pretty(props.message?.responsePayload));

async function retry(): Promise<void> {
  if (!props.message) return;
  retrying.value = true;
  try {
    const updated = await retryIntegrationMessage(props.message.id);
    ElMessage.success('报文重试成功');
    emit('retried', updated);
  } finally {
    retrying.value = false;
  }
}
</script>

<style scoped>
.message-detail__title {
  margin: 18px 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.message-detail__payload {
  margin: 0;
  padding: 12px 14px;
  background: #0f172a;
  color: #d6e4ff;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.message-detail__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px dashed var(--app-border);
}

.error-text {
  color: #f56c6c;
}
</style>
