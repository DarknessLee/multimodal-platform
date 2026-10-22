<template>
  <el-dialog
    v-model="visible"
    title="合同签署（Mock CA）"
    width="460px"
    :close-on-click-modal="false"
    @closed="reset"
  >
    <div class="sign-contract-info">
      <div class="sign-contract-info__row">
        <span class="meta-label">合同号</span>
        <span class="mono">{{ contractNo || '—' }}</span>
      </div>
      <div class="sign-contract-info__row">
        <span class="meta-label">签署方式</span>
        <span>模拟 CA 数字签章（SHA-256）</span>
      </div>
    </div>

    <el-form label-position="top" @submit.prevent>
      <el-form-item label="签署人">
        <el-input
          v-model="signerName"
          data-testid="signer-name"
          placeholder="请输入签署人姓名"
          maxlength="20"
          clearable
          @keyup.enter="submit"
        />
      </el-form-item>
      <div class="sign-tip muted">
        签署后合同状态变为「已签署」，记录签署人/时间并生成 signHash，同时写入 CA 集成报文与站内通知。
      </div>
    </el-form>

    <template #footer>
      <el-button :disabled="loading" @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        data-testid="contract-sign-submit"
        :loading="loading"
        @click="submit"
      >
        确认签署
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { signContract } from '../api/contract';
import type { ContractDetail } from '../types';

const visible = defineModel<boolean>({ required: true });
const props = defineProps<{
  contractId: number | string | null;
  contractNo?: string;
}>();

const emit = defineEmits<{ (event: 'signed', contract: ContractDetail): void }>();

const signerName = ref('王海');
const loading = ref(false);

function reset(): void {
  signerName.value = '王海';
  loading.value = false;
}

async function submit(): Promise<void> {
  const name = signerName.value.trim();
  if (!name) {
    ElMessage.warning('请输入签署人姓名');
    return;
  }
  if (!props.contractId) {
    ElMessage.warning('合同不存在');
    return;
  }
  loading.value = true;
  try {
    const contract = await signContract(props.contractId, name);
    ElMessage.success(`签署成功：${contract.contractNo}`);
    visible.value = false;
    emit('signed', contract);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.sign-contract-info {
  background: #f7f9fc;
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
}

.sign-contract-info__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  padding: 3px 0;
}

.sign-tip {
  font-size: 12px;
  line-height: 1.7;
}
</style>
