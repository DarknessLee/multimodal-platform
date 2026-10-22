<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">一单制运单</h2>
        <p v-if="detail" class="page-subtitle">
          运单号 <span class="mono">{{ detail.waybill.waybillNo }}</span>
          <span v-if="detail.order" class="muted"> · 订单 {{ detail.order.orderNo }}</span>
        </p>
      </div>
      <div class="page-actions">
        <el-button @click="goCenter">返回运单中心</el-button>
        <el-button @click="goTrack">运单跟踪（轨迹）</el-button>
        <PermissionGuard permission="waybill:notarize">
          <el-button type="success" data-testid="notarize-verify" :disabled="!notarizeTxId" @click="verifyVisible = true">
            存证校验
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
      <template v-if="detail">
        <!-- 运单头 -->
        <div class="card">
          <div class="waybill-head">
            <div class="waybill-head__item">
              <span class="meta-label">运单号</span>
              <span class="mono waybill-head__no">{{ detail.waybill.waybillNo }}</span>
            </div>
            <div class="waybill-head__item">
              <span class="meta-label">运单类型</span>
              <el-tag
                :type="detail.waybill.waybillType === 'MASTER' ? 'primary' : 'info'"
                effect="plain"
                size="large"
              >
                {{ detail.waybill.waybillTypeLabel || waybillTypeLabel(detail.waybill.waybillType) }}
              </el-tag>
            </div>
            <div class="waybill-head__item">
              <span class="meta-label">运单状态</span>
              <StatusTag kind="waybill" :status="detail.waybill.status" :label="detail.waybill.statusLabel" size="large" />
            </div>
            <div class="waybill-head__item">
              <span class="meta-label">签发时间</span>
              <span>{{ formatDateTime(detail.waybill.issuedAt) }}</span>
            </div>
            <div class="waybill-head__item">
              <span class="meta-label">关联订单</span>
              <router-link v-if="detail.order" :to="`/orders/${detail.order.id}`" class="mono">
                {{ detail.order.orderNo }}
              </router-link>
              <span v-else class="muted">—</span>
            </div>
            <div class="waybill-head__item waybill-head__item--right">
              <span class="meta-label">单证 / 存证</span>
              <span>{{ detail.documents.length }} 张 / {{ detail.notarize?.recordCount ?? 0 }} 条</span>
            </div>
          </div>
        </div>

        <!-- 存证摘要 -->
        <div class="card mt-16">
          <h3 class="card-title">
            <span class="card-title-text">哈希链存证</span>
            <el-button size="small" type="success" plain data-testid="notarize-verify-inline" :disabled="!notarizeTxId" @click="verifyVisible = true">
              校验存证链
            </el-button>
          </h3>
          <div class="notarize-bar">
            <div class="notarize-item">
              <span class="meta-label">存证状态</span>
              <el-tag :type="detail.notarize?.verified ? 'success' : 'warning'" size="small" effect="dark">
                {{ detail.notarize?.verified ? '链校验通过' : '待校验' }}
              </el-tag>
            </div>
            <div class="notarize-item">
              <span class="meta-label">存证条数</span>
              <span>{{ detail.notarize?.recordCount ?? 0 }} 条</span>
            </div>
            <div class="notarize-item notarize-item--wide">
              <span class="meta-label">最新交易号</span>
              <span class="mono">{{ detail.notarize?.lastTxId || detail.waybill.notarizeTxId || '—' }}</span>
            </div>
          </div>
        </div>

        <!-- 交接事件 -->
        <div class="card mt-16">
          <h3 class="card-title">
            <span class="card-title-text">交接事件链（{{ detail.events.length }}）</span>
            <span class="muted">事件按时间倒序，含哈希与存证交易号</span>
          </h3>
          <div data-testid="waybill-events">
            <el-timeline v-if="detail.events.length">
              <el-timeline-item
                v-for="event in detail.events"
                :key="event.id"
                :timestamp="formatDateTime(event.occurredAt)"
                placement="top"
                :color="eventColor(event.eventType)"
              >
                <div class="event-line">
                  <el-tag size="small" effect="plain">{{ event.eventTypeLabel || eventTypeLabel(event.eventType) }}</el-tag>
                  <span class="event-node">{{ event.nodeName || '—' }}</span>
                  <span class="muted">{{ event.description || '' }}</span>
                </div>
                <div class="event-meta muted mono">
                  <span v-if="event.operator">操作人：{{ event.operator }}</span>
                  <span v-if="event.txId">txId：{{ event.txId }}</span>
                  <span v-if="event.hash">hash：{{ shortHash(event.hash) }}</span>
                </div>
              </el-timeline-item>
            </el-timeline>
            <el-empty v-else description="暂无交接事件" :image-size="60" />
          </div>
        </div>

        <div class="detail-grid">
          <!-- 分段运单 -->
          <div class="card">
            <h3 class="card-title"><span class="card-title-text">分段运单（{{ detail.segmentWaybills.length }}）</span></h3>
            <el-table v-if="detail.segmentWaybills.length" :data="detail.segmentWaybills" size="small" border stripe>
              <el-table-column label="分段运单号" min-width="170">
                <template #default="{ row }">
                  <router-link :to="`/waybills/${row.id}`" class="mono row-link">
                    {{ row.waybillNo }}
                  </router-link>
                </template>
              </el-table-column>
              <el-table-column label="方式" width="80" align="center">
                <template #default="{ row }">{{ row.modeLabel || modeLabel(row.mode) }}</template>
              </el-table-column>
              <el-table-column prop="carrierName" label="承运商" min-width="130" show-overflow-tooltip />
              <el-table-column label="状态" width="96" align="center">
                <template #default="{ row }">
                  <StatusTag kind="waybill" :status="row.status" :label="row.statusLabel" size="small" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="80" align="center">
                <template #default="{ row }">
                  <el-button size="small" text type="primary" @click="goTrackById(row.id)">跟踪</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无分段运单" :image-size="60" />
          </div>

          <!-- 集装箱 -->
          <div class="card">
            <h3 class="card-title"><span class="card-title-text">集装箱（{{ detail.containers.length }}）</span></h3>
            <div data-testid="waybill-containers">
              <el-table v-if="detail.containers.length" :data="detail.containers" size="small" border>
                <el-table-column label="箱号" min-width="140">
                  <template #default="{ row }">
                    <router-link :to="`/containers/${row.id}`" class="mono row-link">{{ row.containerNo }}</router-link>
                  </template>
                </el-table-column>
                <el-table-column prop="type" label="箱型" width="80" align="center" />
                <el-table-column label="状态" width="100" align="center">
                  <template #default="{ row }">
                    <el-tag size="small" effect="plain">{{ row.statusLabel || containerStatusLabel(row.status) }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="currentNode" label="当前位置" min-width="140">
                  <template #default="{ row }">{{ row.currentNode || '—' }}</template>
                </el-table-column>
                <el-table-column prop="sealNo" label="铅封号" width="130">
                  <template #default="{ row }">
                    <span class="mono">{{ row.sealNo || '—' }}</span>
                  </template>
                </el-table-column>
              </el-table>
              <el-empty v-else description="暂无集装箱" :image-size="60" />
            </div>
          </div>
        </div>

        <!-- 单证 -->
        <div class="card mt-16">
          <h3 class="card-title">
            <span class="card-title-text">电子单证（{{ detail.documents.length }}）</span>
            <router-link :to="`/documents?bizType=WAYBILL&bizId=${detail.waybill.id}`">前往单证中心 →</router-link>
          </h3>
          <div data-testid="waybill-documents">
            <el-table v-if="detail.documents.length" :data="detail.documents" size="small" border stripe>
              <el-table-column label="单证号" min-width="160">
                <template #default="{ row }">
                  <span class="mono">{{ row.docNo }}</span>
                </template>
              </el-table-column>
              <el-table-column label="类型" width="130">
                <template #default="{ row }">
                  <el-tag size="small" effect="plain">{{ row.docTypeLabel || docTypeLabel(row.docType) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="fileName" label="文件名" min-width="180" show-overflow-tooltip />
              <el-table-column label="OCR" width="100" align="center">
                <template #default="{ row }">
                  <el-tag :type="ocrTagType(row.ocrStatus)" size="small" effect="plain">
                    {{ row.ocrStatusLabel || ocrStatusLabel(row.ocrStatus) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="签章" width="100" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.signStatus === 'SIGNED' ? 'success' : 'info'" size="small" effect="plain">
                    {{ row.signStatusLabel || signStatusLabel(row.signStatus) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="存证 txId" min-width="160">
                <template #default="{ row }">
                  <span class="mono muted">{{ row.notarizeTxId || '—' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="90" align="center">
                <template #default="{ row }">
                  <el-button size="small" text type="primary" @click="goDocuments(row.id)">查看</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无单证" :image-size="60" />
          </div>
        </div>

        <!-- 分段运输明细 -->
        <div class="card mt-16">
          <h3 class="card-title"><span class="card-title-text">分段运输明细</span></h3>
          <el-table v-if="detail.segments.length" :data="detail.segments" size="small" border stripe>
            <el-table-column prop="seq" label="段序" width="64" align="center" />
            <el-table-column label="方式" width="80" align="center">
              <template #default="{ row }">{{ row.modeLabel || modeLabel(row.mode) }}</template>
            </el-table-column>
            <el-table-column prop="carrierName" label="承运商" min-width="140" />
            <el-table-column label="起止节点" min-width="220">
              <template #default="{ row }">{{ row.startNode }} → {{ row.endNode }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">
                <StatusTag kind="segment" :status="row.status" :label="row.statusLabel" :mode="row.mode" size="small" />
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="暂无分段" :image-size="60" />
        </div>
      </template>

      <el-empty v-else-if="!loading && !errorText" description="运单不存在或无权查看" />
    </div>

    <NotarizeVerifyDialog v-model="verifyVisible" :tx-id="notarizeTxId" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import StatusTag from '../components/StatusTag.vue';
import PermissionGuard from '../components/PermissionGuard.vue';
import NotarizeVerifyDialog from '../components/NotarizeVerifyDialog.vue';
import { fetchWaybillDetail } from '../api/waybillCenter';
import {
  containerStatusLabel,
  docTypeLabel,
  eventTypeLabel,
  modeLabel,
  ocrStatusLabel,
  signStatusLabel,
  waybillTypeLabel,
} from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { WaybillDetail } from '../types';

const route = useRoute();
const router = useRouter();

const detail = ref<WaybillDetail | null>(null);
const loading = ref(false);
const errorText = ref('');
const verifyVisible = ref(false);

const waybillId = computed(() => String(route.params.id ?? ''));

const notarizeTxId = computed<string | null>(
  () => detail.value?.notarize?.lastTxId ?? detail.value?.waybill.notarizeTxId ?? null,
);

function eventColor(type: string): string {
  if (type === 'ISSUE' || type === 'NOTARIZE') return '#409eff';
  if (type === 'SIGN' || type === 'POD') return '#67c23a';
  if (type === 'RELEASE' || type === 'PICKUP') return '#e6a23c';
  return '#909399';
}

function shortHash(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;
}

function ocrTagType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'SUCCESS') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'FAILED') return 'danger';
  return 'info';
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    detail.value = await fetchWaybillDetail(waybillId.value);
  } catch (error) {
    detail.value = null;
    errorText.value = error instanceof Error && error.message ? error.message : '一单制运单加载失败';
  } finally {
    loading.value = false;
  }
}

function goCenter(): void {
  void router.push('/waybills');
}

function goTrack(): void {
  void router.push(`/waybills/${waybillId.value}/track`);
}

function goTrackById(id: number): void {
  void router.push(`/waybills/${id}/track`);
}

function goDocuments(docId: number): void {
  void router.push(`/documents?docId=${docId}`);
}

onMounted(load);
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}

.mt-16 {
  margin-top: 16px;
}

.retry-btn {
  margin-top: 6px;
}

.waybill-head {
  display: flex;
  align-items: center;
  gap: 30px;
  flex-wrap: wrap;
}

.waybill-head__item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
}

.waybill-head__item--right {
  margin-left: auto;
  align-items: flex-end;
}

.waybill-head__no {
  font-size: 16px;
  font-weight: 600;
}

.notarize-bar {
  display: flex;
  align-items: center;
  gap: 34px;
  flex-wrap: wrap;
  padding: 12px 16px;
  border-radius: 8px;
  background: #f7f9fc;
  font-size: 13px;
}

.notarize-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.notarize-item--wide {
  flex: 1;
  min-width: 260px;
}

.event-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.event-node {
  font-weight: 600;
}

.event-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 4px;
  font-size: 11.5px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.detail-grid .card {
  margin-top: 0;
}

.row-link {
  color: var(--app-primary);
}

.row-link:hover {
  text-decoration: underline;
}

@media (max-width: 1100px) {
  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
