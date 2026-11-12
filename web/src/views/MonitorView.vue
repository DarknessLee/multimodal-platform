<template>
  <div class="page monitor-page">
    <div class="monitor-header">
      <div class="monitor-title">
        <span class="monitor-title__dot" />
        <span>多式联运可视化监控大屏</span>
        <span class="monitor-title__sub">实时调度与异常监控</span>
      </div>
      <div class="monitor-tools">
        <span class="monitor-clock mono">{{ clock }}</span>
        <el-button size="small" :loading="loading" class="monitor-refresh" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert
      v-if="errorText"
      :title="errorText"
      type="error"
      :closable="false"
      show-icon
      class="mb-12 monitor-alert"
    >
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div v-loading="loading" class="monitor-body">
      <template v-if="overview">
        <!-- KPI -->
        <div class="monitor-kpis">
          <div class="monitor-kpi monitor-kpi--blue" data-testid="monitor-kpi-online">
            <div class="monitor-kpi__label">在线运单</div>
            <div class="monitor-kpi__value">{{ overview.kpis.onlineWaybills }}<span class="monitor-kpi__unit">票</span></div>
            <div class="monitor-kpi__hint">运输中 {{ overview.kpis.inTransit }} 票</div>
          </div>
          <div class="monitor-kpi monitor-kpi--green" data-testid="monitor-kpi-ontime">
            <div class="monitor-kpi__label">准时率</div>
            <div class="monitor-kpi__value">{{ Number(overview.kpis.onTimeRate).toFixed(1) }}<span class="monitor-kpi__unit">%</span></div>
            <div class="monitor-kpi__hint">平均在途 {{ Number(overview.kpis.avgTransitHours).toFixed(1) }} h</div>
          </div>
          <div class="monitor-kpi monitor-kpi--red" data-testid="monitor-kpi-alerts">
            <div class="monitor-kpi__label">待处理预警</div>
            <div class="monitor-kpi__value">{{ overview.kpis.alertsOpen }}<span class="monitor-kpi__unit">条</span></div>
            <div class="monitor-kpi__hint">在途箱 {{ overview.kpis.containersInTransit }} 个</div>
          </div>
          <div class="monitor-kpi monitor-kpi--cyan">
            <div class="monitor-kpi__label">在途箱量</div>
            <div class="monitor-kpi__value">{{ overview.kpis.containersInTransit }}<span class="monitor-kpi__unit">箱</span></div>
            <div class="monitor-kpi__hint">在线运单 {{ overview.kpis.onlineWaybills }} 票</div>
          </div>
        </div>

        <div class="monitor-grid">
          <!-- 在线运单地图 -->
          <div class="monitor-card monitor-card--map">
            <div class="monitor-card__title">
              <span>在线运单实时位置</span>
              <span class="monitor-card__sub">{{ overview.livePoints.length }} 个定位点（经纬度 ECharts 离线渲染）</span>
            </div>
            <MonitorMap data-testid="monitor-map" :points="overview.livePoints" />
          </div>

          <div class="monitor-side">
            <!-- 模式分布 -->
            <div class="monitor-card">
              <div class="monitor-card__title"><span>运输模式分布</span></div>
              <ModeChart data-testid="monitor-mode-chart" :distribution="overview.modeDistribution" />
            </div>

            <!-- 最近预警 -->
            <div class="monitor-card monitor-card--alerts">
              <div class="monitor-card__title">
                <span>实时预警</span>
                <router-link to="/alerts" class="monitor-link">预警中心 →</router-link>
              </div>
              <div data-testid="monitor-alerts" class="monitor-alert-list">
                <el-empty v-if="overview.recentAlerts.length === 0" description="暂无预警" :image-size="50" />
                <div v-for="alert in overview.recentAlerts" :key="alert.id" class="monitor-alert-item">
                  <span class="monitor-alert-item__level" :class="`level-${alert.level.toLowerCase()}`">
                    {{ alert.levelLabel }}
                  </span>
                  <div class="monitor-alert-item__body">
                    <div class="monitor-alert-item__title">{{ alert.title }}</div>
                    <div class="monitor-alert-item__time">{{ formatDateTime(alert.occurredAt) }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 在线运单列表 -->
        <div class="monitor-card mt-12">
          <div class="monitor-card__title">
            <span>在线运单</span>
            <span class="monitor-card__sub">经纬度 / 模式 / 状态</span>
          </div>
          <div data-testid="monitor-waybills">
            <el-table
              :data="overview.livePoints"
              size="small"
              class="monitor-table"
              :row-style="{ background: 'transparent' }"
            >
              <el-table-column prop="waybillNo" label="运单号" min-width="160">
                <template #default="{ row }">
                  <router-link :to="`/waybills/${row.waybillId}`" class="monitor-waybill-link mono">
                    {{ row.waybillNo }}
                  </router-link>
                </template>
              </el-table-column>
              <el-table-column prop="containerNo" label="箱号" min-width="140">
                <template #default="{ row }">
                  <span class="mono">{{ row.containerNo || '—' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="模式" width="90" align="center">
                <template #default="{ row }">
                  <el-tag size="small" effect="plain" :color="modeColor(row.mode)" class="mode-tag">
                    {{ modeLabel(row.mode) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="100" align="center">
                <template #default="{ row }">{{ row.statusLabel }}</template>
              </el-table-column>
              <el-table-column label="经度" width="110" align="right">
                <template #default="{ row }">
                  <span class="mono">{{ Number(row.lng).toFixed(3) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="纬度" width="110" align="right">
                <template #default="{ row }">
                  <span class="mono">{{ Number(row.lat).toFixed(3) }}</span>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-if="overview.livePoints.length === 0" description="暂无在线运单" :image-size="56" />
          </div>
        </div>

        <!-- 状态分布 -->
        <div class="monitor-card mt-12">
          <div class="monitor-card__title"><span>运单状态分布</span></div>
          <div class="monitor-status">
            <div v-for="item in overview.statusDistribution" :key="item.status" class="monitor-status__item">
              <span class="monitor-status__label">{{ item.statusLabel }}</span>
              <span class="monitor-status__count">{{ item.count }}</span>
            </div>
            <span v-if="overview.statusDistribution.length === 0" class="muted">暂无数据</span>
          </div>
        </div>
      </template>

      <el-empty v-else-if="!loading && !errorText" description="暂无监控数据" :image-size="70" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import MonitorMap from '../components/MonitorMap.vue';
import ModeChart from '../components/ModeChart.vue';
import { fetchMonitorOverview } from '../api/monitor';
import { MODE_COLORS, modeLabel } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { MonitorOverview } from '../types';

const loading = ref(false);
const errorText = ref('');
const overview = ref<MonitorOverview | null>(null);
const clock = ref('');
let refreshTimer: number | undefined;
let clockTimer: number | undefined;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function updateClock(): void {
  const now = new Date();
  clock.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function modeColor(mode: string): string {
  return MODE_COLORS[mode] ?? '#909399';
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    overview.value = await fetchMonitorOverview();
  } catch (error) {
    overview.value = null;
    errorText.value = error instanceof Error && error.message ? error.message : '监控数据加载失败';
    ElMessage.warning('监控数据加载失败，请稍后刷新');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  updateClock();
  clockTimer = window.setInterval(updateClock, 1000);
  void load();
  refreshTimer = window.setInterval(() => void load(), 60000);
});

onBeforeUnmount(() => {
  if (clockTimer) window.clearInterval(clockTimer);
  if (refreshTimer) window.clearInterval(refreshTimer);
});
</script>

<style scoped>
.monitor-page {
  max-width: none;
  min-height: calc(100vh - 60px);
  margin: 0;
  padding: 16px 20px 24px;
  background:
    radial-gradient(circle at 15% 0%, rgba(28, 78, 150, 0.35), transparent 45%),
    radial-gradient(circle at 85% 10%, rgba(12, 120, 130, 0.2), transparent 40%),
    #070d18;
  color: #dbe7f7;
}

.monitor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 4px 2px 14px;
}

.monitor-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #eaf3ff;
}

.monitor-title__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #38e0c5;
  box-shadow: 0 0 12px #38e0c5;
}

.monitor-title__sub {
  font-size: 12px;
  font-weight: 400;
  color: #7c94b8;
  letter-spacing: 0;
}

.monitor-tools {
  display: flex;
  align-items: center;
  gap: 12px;
}

.monitor-clock {
  font-size: 12.5px;
  color: #8fb0d8;
}

.monitor-refresh {
  background: rgba(41, 68, 104, 0.6);
  border-color: #294468;
  color: #cfe2ff;
}

.mb-12 {
  margin-bottom: 12px;
}

.mt-12 {
  margin-top: 12px;
}

.retry-btn {
  margin-top: 4px;
}

.monitor-body {
  min-height: 200px;
}

.monitor-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.monitor-kpi {
  border-radius: 10px;
  padding: 14px 18px;
  background: rgba(12, 25, 44, 0.86);
  border: 1px solid rgba(41, 68, 104, 0.75);
  border-left: 3px solid #409eff;
  box-shadow: inset 0 0 24px rgba(24, 60, 110, 0.25);
}

.monitor-kpi--blue {
  border-left-color: #409eff;
}

.monitor-kpi--green {
  border-left-color: #38e0c5;
}

.monitor-kpi--red {
  border-left-color: #ff6b6b;
}

.monitor-kpi--cyan {
  border-left-color: #22b8cf;
}

.monitor-kpi__label {
  font-size: 12.5px;
  color: #8fb0d8;
}

.monitor-kpi__value {
  margin-top: 6px;
  font-size: 28px;
  font-weight: 700;
  color: #f0f7ff;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.monitor-kpi__unit {
  margin-left: 4px;
  font-size: 12px;
  font-weight: 400;
  color: #7c94b8;
}

.monitor-kpi__hint {
  margin-top: 6px;
  font-size: 11.5px;
  color: #6f88aa;
}

.monitor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.monitor-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.monitor-card {
  border-radius: 10px;
  background: rgba(10, 21, 38, 0.88);
  border: 1px solid rgba(41, 68, 104, 0.7);
  padding: 12px 16px 14px;
}

.monitor-card__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #d7e6fb;
  margin-bottom: 10px;
}

.monitor-card__sub {
  font-size: 11.5px;
  font-weight: 400;
  color: #6f88aa;
}

.monitor-card--map {
  min-height: 430px;
}

.monitor-link {
  font-size: 12px;
  color: #4fa3ff;
  font-weight: 400;
}

.monitor-alert-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 190px;
  overflow-y: auto;
}

.monitor-alert-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(20, 36, 60, 0.7);
  border: 1px solid rgba(41, 68, 104, 0.5);
}

.monitor-alert-item__level {
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(230, 162, 60, 0.16);
  color: #f0b44c;
}

.monitor-alert-item__level.level-critical {
  background: rgba(255, 107, 107, 0.16);
  color: #ff8585;
}

.monitor-alert-item__level.level-info {
  background: rgba(79, 163, 255, 0.16);
  color: #79b8ff;
}

.monitor-alert-item__title {
  font-size: 12.5px;
  color: #dbe7f7;
}

.monitor-alert-item__time {
  margin-top: 2px;
  font-size: 11px;
  color: #6f88aa;
}

.monitor-waybill-link {
  color: #4fa3ff;
}

.monitor-table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: rgba(20, 36, 60, 0.8);
  --el-table-border-color: rgba(41, 68, 104, 0.6);
  --el-table-text-color: #cfe0f5;
  --el-table-header-text-color: #8fb0d8;
  --el-table-row-hover-bg-color: rgba(30, 58, 95, 0.5);
  background: transparent;
}

.monitor-table :deep(.el-table__inner-wrapper::before) {
  background: transparent;
}

.mode-tag {
  border: none;
}

.monitor-status {
  display: flex;
  align-items: center;
  gap: 22px;
  flex-wrap: wrap;
}

.monitor-status__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 72px;
}

.monitor-status__label {
  font-size: 11.5px;
  color: #8fb0d8;
}

.monitor-status__count {
  font-size: 20px;
  font-weight: 700;
  color: #eaf3ff;
  font-variant-numeric: tabular-nums;
}

.monitor-alert {
  background: rgba(60, 20, 24, 0.85);
  border-color: rgba(255, 107, 107, 0.35);
}

@media (max-width: 1200px) {
  .monitor-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .monitor-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
