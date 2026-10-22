<template>
  <el-dialog v-model="visible" title="哈希链存证校验" width="560px" @open="verify">
    <div v-loading="loading">
      <template v-if="result">
        <el-alert
          :title="result.message"
          :type="result.valid ? 'success' : 'error'"
          :closable="false"
          show-icon
          class="mb-12"
        />
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="校验结果">
            <el-tag :type="result.valid ? 'success' : 'danger'" size="small" effect="dark">
              {{ result.valid ? '校验通过' : '校验失败' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="链长度">{{ result.chainLength }}</el-descriptions-item>
          <el-descriptions-item label="交易号" :span="2">
            <span class="mono break-all">{{ result.record?.txId || '—' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="区块高度">{{ result.record?.blockHeight ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="事件类型">{{ result.record?.eventType || '—' }}</el-descriptions-item>
          <el-descriptions-item label="payloadHash" :span="2">
            <span class="mono break-all hash">{{ result.record?.payloadHash || '—' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="prevHash" :span="2">
            <span class="mono break-all hash">{{ result.record?.prevHash || '—' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="hash" :span="2">
            <span class="mono break-all hash">{{ result.record?.hash || '—' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="存证时间" :span="2">
            {{ formatDateTime(result.record?.createdAt) }}
          </el-descriptions-item>
        </el-descriptions>
        <p class="muted verify-tip">
          校验规则：hash = sha256(payloadHash + prevHash + blockHeight)，且 prevHash 与上一条 hash 连续。
        </p>
      </template>
      <el-empty v-else-if="!loading" description="暂无存证记录可校验" :image-size="70" />
    </div>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" :loading="loading" @click="verify">重新校验</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { verifyNotarize } from '../api/waybillCenter';
import { formatDateTime } from '../utils/format';
import type { NotarizeVerifyResult } from '../types';

const visible = defineModel<boolean>({ required: true });
const props = defineProps<{ txId: string | null }>();

const loading = ref(false);
const result = ref<NotarizeVerifyResult | null>(null);

async function verify(): Promise<void> {
  if (!props.txId) {
    ElMessage.warning('暂无可校验的存证交易号');
    visible.value = false;
    return;
  }
  loading.value = true;
  try {
    result.value = await verifyNotarize(props.txId);
    if (result.value.valid) {
      ElMessage.success(`存证校验通过（链长度 ${result.value.chainLength}）`);
    } else {
      ElMessage.error(result.value.message || '存证校验失败');
    }
  } catch {
    result.value = null;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.mb-12 {
  margin-bottom: 12px;
}

.break-all {
  word-break: break-all;
}

.hash {
  font-size: 11.5px;
  line-height: 1.6;
}

.verify-tip {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.7;
}
</style>
