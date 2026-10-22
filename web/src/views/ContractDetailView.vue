<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">合同详情</h2>
        <p v-if="contract" class="page-subtitle">
          合同号 <span class="mono">{{ contract.contractNo }}</span>
        </p>
      </div>
      <div class="page-actions">
        <el-button @click="goContracts">返回合同列表</el-button>
        <PermissionGuard permission="contract:send">
          <el-button
            v-if="contract?.status === 'DRAFT'"
            type="primary"
            data-testid="contract-send-btn"
            :loading="sending"
            @click="send"
          >
            发送合同
          </el-button>
        </PermissionGuard>
        <PermissionGuard permission="contract:sign">
          <el-button
            v-if="contract?.status === 'PENDING_SIGN'"
            type="success"
            data-testid="contract-sign-btn"
            @click="signVisible = true"
          >
            签署合同
          </el-button>
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
      <template v-if="contract">
        <div class="card">
          <div class="contract-head">
            <div class="contract-head__item">
              <span class="meta-label">合同状态</span>
              <StatusTag kind="contract" :status="contract.status" :label="contract.statusLabel" size="large" />
            </div>
            <div class="contract-head__item">
              <span class="meta-label">客户</span>
              <span>{{ contract.customer.name }}</span>
            </div>
            <div class="contract-head__item">
              <span class="meta-label">合同类型</span>
              <span>{{ contract.contractTypeLabel || contractTypeLabel(contract.contractType) }}</span>
            </div>
            <div class="contract-head__item">
              <span class="meta-label">关联订单</span>
              <span>{{ contract.orderCount ?? 0 }} 票</span>
            </div>
            <div class="contract-head__item contract-head__item--right">
              <span class="meta-label">信用额度（元）</span>
              <span class="amount-lg">{{ formatAmount(contract.creditLimit) }}</span>
            </div>
          </div>
        </div>

        <div class="contract-grid">
          <div class="card">
            <h3 class="card-title"><span class="card-title-text">合同信息</span></h3>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="合同号">
                <span class="mono">{{ contract.contractNo }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="合同状态">{{ contract.statusLabel }}</el-descriptions-item>
              <el-descriptions-item label="合同标题" :span="2">{{ contract.title }}</el-descriptions-item>
              <el-descriptions-item label="客户">{{ contract.customer.name }}</el-descriptions-item>
              <el-descriptions-item label="合同类型">
                {{ contract.contractTypeLabel || contractTypeLabel(contract.contractType) }}
              </el-descriptions-item>
              <el-descriptions-item label="生效日期">{{ formatDate(contract.effectiveFrom) }}</el-descriptions-item>
              <el-descriptions-item label="失效日期">{{ formatDate(contract.effectiveTo) }}</el-descriptions-item>
              <el-descriptions-item label="账期">{{ contract.paymentTerms }}</el-descriptions-item>
              <el-descriptions-item label="结算币种">{{ contract.settleCurrency || 'CNY' }}</el-descriptions-item>
              <el-descriptions-item label="信用额度">
                ¥{{ formatAmount(contract.creditLimit) }}
              </el-descriptions-item>
              <el-descriptions-item label="折扣率">
                {{ Number(contract.discountRate).toFixed(2) }}%
              </el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ formatDateTime(contract.createdAt) }}</el-descriptions-item>
              <el-descriptions-item label="关联订单数">{{ contract.orderCount ?? 0 }}</el-descriptions-item>
              <el-descriptions-item label="备注" :span="2">{{ contract.remark || '—' }}</el-descriptions-item>
            </el-descriptions>
          </div>

          <div class="card">
            <h3 class="card-title"><span class="card-title-text">签署信息（Mock CA）</span></h3>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="签署状态">
                <StatusTag kind="contract" :status="contract.status" :label="contract.statusLabel" size="small" />
              </el-descriptions-item>
              <el-descriptions-item label="签署人">{{ contract.signerName || '—' }}</el-descriptions-item>
              <el-descriptions-item label="签署时间">{{ formatDateTime(contract.signedAt) }}</el-descriptions-item>
              <el-descriptions-item label="signHash">
                <span class="hash-text mono">{{ contract.signHash || '—' }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="签署文件">{{ contract.fileUrl || '—' }}</el-descriptions-item>
            </el-descriptions>
            <p v-if="contract.status === 'PENDING_SIGN'" class="muted sign-tip">
              合同已发送待签署，点击右上角「签署合同」完成 Mock CA 数字签章。
            </p>
            <p v-else-if="contract.status === 'SIGNED'" class="muted sign-tip">
              合同已签署，可用于报价接受时关联订单（订单状态为「已签合同」）。
            </p>
          </div>
        </div>
      </template>

      <el-empty v-else-if="!loading && !errorText" description="合同不存在或无权查看" />
    </div>

    <ContractSignDialog
      v-model="signVisible"
      :contract-id="contract?.id ?? null"
      :contract-no="contract?.contractNo ?? ''"
      @signed="onSigned"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import PermissionGuard from '../components/PermissionGuard.vue';
import ContractSignDialog from '../components/ContractSignDialog.vue';
import { fetchContract, sendContract } from '../api/contract';
import { contractTypeLabel } from '../utils/constants';
import { formatAmount, formatDate, formatDateTime } from '../utils/format';
import type { ContractDetail } from '../types';

const route = useRoute();
const router = useRouter();

const contract = ref<ContractDetail | null>(null);
const loading = ref(false);
const sending = ref(false);
const signVisible = ref(false);
const errorText = ref('');

const contractId = computed(() => String(route.params.id ?? ''));

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    contract.value = await fetchContract(contractId.value);
  } catch (error) {
    contract.value = null;
    errorText.value = error instanceof Error && error.message ? error.message : '合同加载失败';
  } finally {
    loading.value = false;
  }
}

function goContracts(): void {
  void router.push('/contracts');
}

async function send(): Promise<void> {
  if (!contract.value) return;
  sending.value = true;
  try {
    await sendContract(contract.value.id);
    ElMessage.success('合同已发送，等待客户签署');
    await load();
  } finally {
    sending.value = false;
  }
}

async function onSigned(): Promise<void> {
  await load();
}

onMounted(load);
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}

.retry-btn {
  margin-top: 6px;
}

.contract-head {
  display: flex;
  align-items: center;
  gap: 32px;
  flex-wrap: wrap;
}

.contract-head__item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
}

.contract-head__item--right {
  margin-left: auto;
  align-items: flex-end;
}

.contract-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.9fr);
  gap: 16px;
  margin-top: 16px;
}

.contract-grid .card {
  margin-top: 0;
}

.hash-text {
  font-size: 12px;
  word-break: break-all;
  line-height: 1.6;
}

.sign-tip {
  margin-top: 14px;
  font-size: 12px;
  line-height: 1.7;
}

@media (max-width: 1100px) {
  .contract-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
