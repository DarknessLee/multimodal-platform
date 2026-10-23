<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">运单跟踪</h2>
        <p v-if="track" class="page-subtitle">
          运单号 <span class="mono">{{ track.waybill.waybillNo }}</span> · 共
          {{ track.points.length }} 个轨迹节点
        </p>
      </div>
      <div class="page-actions">
        <el-button @click="goOrders">返回订单列表</el-button>
        <el-button data-testid="waybill-detail-link" @click="goWaybillDetail">一单制运单</el-button>
        <el-button data-testid="document-center-link" @click="goDocuments">单证 / 箱动态</el-button>
        <el-button v-if="canSign" type="success" data-testid="sign-btn" @click="openSignDialog">
          签收运单
        </el-button>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert
      v-if="errorText"
      :title="errorText"
      type="error"
      :closable="false"
      show-icon
      class="mb-16"
    >
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div v-loading="loading">
      <template v-if="track">
        <!-- 概览 -->
        <div class="card">
          <div class="track-overview">
            <div class="track-overview__item">
              <span class="meta-label">运单号</span>
              <span class="mono track-overview__no">{{ track.waybill.waybillNo }}</span>
            </div>
            <div class="track-overview__item">
              <span class="meta-label">运单状态</span>
              <StatusTag
                kind="waybill"
                :status="track.waybill.status"
                :label="track.waybill.statusLabel"
              />
            </div>
            <div class="track-overview__item">
              <span class="meta-label">签收人</span>
              <span>{{ track.waybill.signerName || '—' }}</span>
            </div>
            <div class="track-overview__item">
              <span class="meta-label">签收时间</span>
              <span>{{ formatDateTime(track.waybill.signedAt) }}</span>
            </div>
            <div class="track-overview__item">
              <span class="meta-label">分段进度</span>
              <span>
                {{ completedSegments }} / {{ track.segments.length }} 段已完成
              </span>
            </div>
            <div class="track-overview__item track-overview__item--right">
              <template v-if="canSign">
                <el-tag type="success" effect="plain">全部分段已完成，可签收</el-tag>
              </template>
              <template v-else-if="track.waybill.status === 'SIGNED'">
                <el-tag type="success" effect="dark">已签收</el-tag>
              </template>
              <template v-else>
                <el-tag type="info" effect="plain">等待全部分段完成</el-tag>
              </template>
            </div>
          </div>
        </div>

        <!-- 实时定位 / IoT / 预警（Stage 3） -->
        <div class="card mt-16">
          <h3 class="card-title">
            <span class="card-title-text">实时定位 / IoT / 预警</span>
            <span v-if="liveError" class="muted live-tip">{{ liveError }}</span>
            <span v-else-if="!live" class="muted live-tip">加载中…</span>
          </h3>
          <div v-if="live" class="live-grid">
            <div class="live-block" data-testid="live-position">
              <div class="live-block__title">实时位置</div>
              <template v-if="live.livePosition">
                <div class="live-value">{{ live.livePosition.nodeName || '—' }}</div>
                <div class="live-meta mono">
                  {{ Number(live.livePosition.lng).toFixed(4) }}, {{ Number(live.livePosition.lat).toFixed(4) }}
                </div>
                <div class="live-meta muted">{{ formatDateTime(live.livePosition.occurredAt) }}</div>
              </template>
              <div v-else class="muted">暂无实时定位</div>
            </div>
            <div class="live-block" data-testid="iot-reading">
              <div class="live-block__title">IoT 读数</div>
              <template v-if="live.readings">
                <div class="live-kv"><span>温度</span><span>{{ live.readings.temperature ?? '—' }} ℃</span></div>
                <div class="live-kv"><span>湿度</span><span>{{ live.readings.humidity ?? '—' }} %</span></div>
                <div class="live-kv"><span>门磁</span><span>{{ live.readings.doorOpen ? '开门' : '关闭' }}</span></div>
                <div class="live-kv"><span>上报时间</span><span>{{ formatDateTime(live.readings.reportedAt) }}</span></div>
              </template>
              <div v-else class="muted">暂无 IoT 读数</div>
              <div v-if="live.devices.length" class="live-devices muted">
                设备：{{ live.devices.map((device) => device.deviceTypeLabel || iotDeviceTypeLabel(device.deviceType)).join(' / ') }}
              </div>
            </div>
            <div class="live-block live-block--alerts" data-testid="live-alerts">
              <div class="live-block__title">实时预警（{{ live.alerts.length }}）</div>
              <div v-if="live.alerts.length" class="live-alert-list">
                <div v-for="alert in live.alerts" :key="alert.id" class="live-alert">
                  <el-tag :type="alertLevelTagType(alert.level)" size="small" effect="dark">
                    {{ alert.levelLabel || alertLevelLabel(alert.level) }}
                  </el-tag>
                  <span class="live-alert__title">{{ alert.title }}</span>
                  <span class="muted">{{ formatDateTime(alert.occurredAt) }}</span>
                </div>
              </div>
              <div v-else class="muted">暂无实时预警</div>
            </div>
          </div>
          <el-empty v-else-if="!loading" description="暂无实时监控数据" :image-size="56" />
        </div>

        <!-- 轨迹图 -->
        <div class="card mt-16">
          <h3 class="card-title">
            <span class="card-title-text">全程轨迹（经纬度，按分段配色）</span>
            <span class="muted chart-legend-tip">鼠标悬停节点可查看时间 / 来源 / 说明</span>
          </h3>
          <TrackChart data-testid="track-chart" :points="track.points" :segments="track.segments" />
        </div>

        <!-- 分段明细 -->
        <div class="card mt-16">
          <h3 class="card-title"><span class="card-title-text">分段明细</span></h3>
          <div class="scroll-x">
            <SegmentTable data-testid="segment-table" :segments="track.segments" />
          </div>
        </div>

        <!-- 轨迹时间轴 -->
        <div class="card mt-16">
          <h3 class="card-title"><span class="card-title-text">轨迹时间轴</span></h3>
          <el-timeline v-if="orderedPoints.length">
            <el-timeline-item
              v-for="point in orderedPoints"
              :key="point.id"
              :timestamp="formatDateTime(point.occurredAt)"
              placement="top"
              :color="sourceColor(point.source)"
            >
              <div class="timeline-line">
                <span class="timeline-line__node">{{ point.nodeName }}</span>
                <el-tag size="small" effect="plain">{{ trackSourceLabel(point.source) }}</el-tag>
                <span class="timeline-line__desc muted">{{ point.description }}</span>
              </div>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无轨迹数据" :image-size="70" />
        </div>
      </template>

      <el-empty v-else-if="!loading && !errorText" description="运单不存在或无权查看" />
    </div>

    <!-- 签收弹窗 -->
    <el-dialog v-model="signDialogVisible" title="运单签收" width="430px" :close-on-click-modal="false">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="签收人">
          <el-input
            v-model="signerName"
            data-testid="signer-name"
            placeholder="请输入签收人姓名"
            maxlength="20"
            clearable
            @keyup.enter="submitSign"
          />
        </el-form-item>
        <div class="sign-tip muted">
          签收后运单 →「已签收」、订单 →「已签收」，集装箱 →「已送达」，并追加平台签收轨迹。
        </div>
      </el-form>
      <template #footer>
        <el-button :disabled="signing" @click="signDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          data-testid="sign-submit"
          :loading="signing"
          @click="submitSign"
        >
          确认签收
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import StatusTag from '../components/StatusTag.vue';
import SegmentTable from '../components/SegmentTable.vue';
import TrackChart from '../components/TrackChart.vue';
import { fetchTrack, signWaybill } from '../api';
import { fetchMonitorLive } from '../api/monitor';
import { useAuthStore } from '../stores/auth';
import {
  alertLevelLabel,
  alertLevelTagType,
  iotDeviceTypeLabel,
  trackSourceLabel,
} from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { MonitorLive, TrackData } from '../types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const track = ref<TrackData | null>(null);
const loading = ref(false);
const errorText = ref('');
const signDialogVisible = ref(false);
const signerName = ref('李经理');
const signing = ref(false);
const live = ref<MonitorLive | null>(null);
const liveError = ref('');

const waybillId = computed(() => String(route.params.id ?? ''));

const completedSegments = computed(
  () => track.value?.segments.filter((segment) => segment.status === 'COMPLETED').length ?? 0,
);

const canSign = computed(() => {
  if (!track.value) return false;
  if (auth.role !== 'SHIPPER') return false;
  if (track.value.waybill.status !== 'ARRIVED') return false;
  return (
    track.value.segments.length > 0 &&
    track.value.segments.every((segment) => segment.status === 'COMPLETED')
  );
});

const orderedPoints = computed(() => {
  const points = track.value?.points ?? [];
  return [...points].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.seq - b.seq);
});

function sourceColor(source: string): string {
  if (source === 'MOCK_GPS') return '#409eff';
  if (source === 'MOCK_EDI') return '#13c2c2';
  if (source === 'TERMINAL_REPORT') return '#fa8c16';
  if (source === 'CARRIER_REPORT') return '#67c23a';
  return '#67c23a';
}

async function loadLive(): Promise<void> {
  try {
    live.value = await fetchMonitorLive(waybillId.value);
    liveError.value = '';
  } catch {
    live.value = null;
    liveError.value = '实时监控数据暂不可用';
  }
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    track.value = await fetchTrack(waybillId.value);
    void loadLive();
  } catch (error) {
    track.value = null;
    errorText.value = error instanceof Error && error.message ? error.message : '轨迹加载失败，请重试';
  } finally {
    loading.value = false;
  }
}

function goOrders(): void {
  void router.push('/orders');
}

function goWaybillDetail(): void {
  void router.push(`/waybills/${waybillId.value}`);
}

function goDocuments(): void {
  void router.push(`/documents?bizType=WAYBILL&bizId=${waybillId.value}`);
}

function openSignDialog(): void {
  signerName.value = '李经理';
  signDialogVisible.value = true;
}

async function submitSign(): Promise<void> {
  const name = signerName.value.trim();
  if (!name) {
    ElMessage.warning('请输入签收人姓名');
    return;
  }
  signing.value = true;
  try {
    const result = await signWaybill(waybillId.value, name);
    signDialogVisible.value = false;
    ElMessage.success(`签收成功（${result.waybill.signerName}），运单与订单已更新为已签收`);
    await load();
  } finally {
    signing.value = false;
  }
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

.track-overview {
  display: flex;
  align-items: center;
  gap: 26px;
  flex-wrap: wrap;
}

.track-overview__item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
}

.track-overview__item--right {
  margin-left: auto;
}

.track-overview__no {
  font-size: 15px;
  font-weight: 600;
}

.chart-legend-tip {
  font-size: 12px;
  font-weight: 400;
}

.timeline-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.timeline-line__node {
  font-weight: 600;
}

.timeline-line__desc {
  font-size: 12px;
}

.sign-tip {
  font-size: 12px;
  line-height: 1.7;
}

.live-tip {
  font-size: 12px;
  font-weight: 400;
}

.live-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.live-block {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 12px 14px;
  background: #fafcff;
  min-height: 128px;
}

.live-block__title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
  color: var(--app-text-regular);
}

.live-value {
  font-size: 15px;
  font-weight: 600;
}

.live-meta {
  margin-top: 4px;
  font-size: 12px;
}

.live-kv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
  padding: 2px 0;
}

.live-devices {
  margin-top: 6px;
  font-size: 11.5px;
}

.live-alert-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.live-alert {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12.5px;
}

.live-alert__title {
  flex: 1;
  min-width: 120px;
}

@media (max-width: 1100px) {
  .live-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
