<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">调度看板</h2>
        <p class="page-subtitle">待调度订单 · 运力利用率 · 近期班列/班轮 · 中转衔接 · 异常提醒</p>
      </div>
      <div class="page-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div v-loading="loading">
      <template v-if="board">
        <!-- 运力利用率 -->
        <div class="card" data-testid="board-capacity">
          <h3 class="card-title"><span class="card-title-text">运力利用率</span></h3>
          <div class="capacity-grid">
            <div class="capacity-metric">
              <div class="capacity-metric__head">
                <span class="capacity-metric__name">公路车辆</span>
                <span class="capacity-metric__value">{{ Number(board.capacity.vehicles.utilization).toFixed(1) }}%</span>
              </div>
              <el-progress :percentage="clamp(board.capacity.vehicles.utilization)" :stroke-width="8" color="#409eff" />
              <div class="capacity-metric__meta muted">
                共 {{ board.capacity.vehicles.total }} 辆 · 空闲 {{ board.capacity.vehicles.idle ?? 0 }} · 任务中
                {{ board.capacity.vehicles.inTask ?? 0 }} · 维修 {{ board.capacity.vehicles.maintenance ?? 0 }}
              </div>
            </div>
            <div class="capacity-metric">
              <div class="capacity-metric__head">
                <span class="capacity-metric__name">铁路班列</span>
                <span class="capacity-metric__value">{{ Number(board.capacity.trains.utilization).toFixed(1) }}%</span>
              </div>
              <el-progress :percentage="clamp(board.capacity.trains.utilization)" :stroke-width="8" color="#fa8c16" />
              <div class="capacity-metric__meta muted">
                共 {{ board.capacity.trains.total }} 列 · 近期 {{ board.capacity.trains.upcoming ?? 0 }} · 已订
                {{ board.capacity.trains.bookedTeu ?? 0 }}/{{ board.capacity.trains.capacityTeu ?? 0 }} TEU
              </div>
            </div>
            <div class="capacity-metric">
              <div class="capacity-metric__head">
                <span class="capacity-metric__name">水路班轮</span>
                <span class="capacity-metric__value">{{ Number(board.capacity.vessels.utilization).toFixed(1) }}%</span>
              </div>
              <el-progress :percentage="clamp(board.capacity.vessels.utilization)" :stroke-width="8" color="#13c2c2" />
              <div class="capacity-metric__meta muted">
                共 {{ board.capacity.vessels.total }} 艘 · 近期 {{ board.capacity.vessels.upcoming ?? 0 }} · 已订
                {{ board.capacity.vessels.bookedTeu ?? 0 }}/{{ board.capacity.vessels.capacityTeu ?? 0 }} TEU
              </div>
            </div>
          </div>
        </div>

        <div class="board-grid mt-16">
          <!-- 待调度订单 -->
          <div class="card">
            <h3 class="card-title">
              <span class="card-title-text">待调度订单（{{ board.pendingOrders.length }}）</span>
              <router-link to="/dispatch/plans">去调度 →</router-link>
            </h3>
            <div data-testid="board-pending" class="board-list">
              <el-empty v-if="board.pendingOrders.length === 0" description="暂无待调度订单" :image-size="56" />
              <div v-for="order in board.pendingOrders" :key="order.id" class="board-item">
                <div class="board-item__head">
                  <span class="mono">{{ order.orderNo }}</span>
                  <el-tag size="small" effect="plain">{{ order.statusLabel }}</el-tag>
                </div>
                <div class="muted board-item__meta">{{ order.cargoName }}</div>
              </div>
            </div>
          </div>

          <!-- 异常提醒 -->
          <div class="card">
            <h3 class="card-title">
              <span class="card-title-text">异常提醒（{{ board.alerts.length }}）</span>
              <router-link to="/alerts">预警中心 →</router-link>
            </h3>
            <div data-testid="board-alerts" class="board-list">
              <el-empty v-if="board.alerts.length === 0" description="暂无异常提醒" :image-size="56" />
              <div v-for="alert in board.alerts" :key="alert.id" class="board-item board-item--alert">
                <div class="board-item__head">
                  <span>{{ alert.title }}</span>
                  <el-tag :type="alert.levelLabel === '严重' ? 'danger' : 'warning'" size="small" effect="plain">
                    {{ alert.levelLabel }}
                  </el-tag>
                </div>
                <div class="muted board-item__meta">{{ alertTypeLabel(alert.alertType) }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="board-grid mt-16">
          <!-- 近期班列 -->
          <div class="card">
            <h3 class="card-title"><span class="card-title-text">近期班列</span></h3>
            <div data-testid="board-trains">
              <el-table v-if="board.upcomingTrains.length" :data="board.upcomingTrains" size="small" border stripe>
                <el-table-column prop="trainNo" label="班列号" width="100">
                  <template #default="{ row }"><span class="mono">{{ row.trainNo }}</span></template>
                </el-table-column>
                <el-table-column prop="route" label="线路" min-width="200" show-overflow-tooltip />
                <el-table-column label="发车时间" width="140">
                  <template #default="{ row }">{{ formatDateTime(row.departureAt) }}</template>
                </el-table-column>
                <el-table-column label="订舱(TEU)" width="120" align="right">
                  <template #default="{ row }">{{ row.bookedTeu }}/{{ row.capacityTeu }}</template>
                </el-table-column>
              </el-table>
              <el-empty v-else description="暂无近期班列" :image-size="56" />
            </div>
          </div>

          <!-- 近期班轮 -->
          <div class="card">
            <h3 class="card-title"><span class="card-title-text">近期班轮</span></h3>
            <div data-testid="board-vessels">
              <el-table v-if="board.upcomingVessels.length" :data="board.upcomingVessels" size="small" border stripe>
                <el-table-column label="船名 / 航次" min-width="160">
                  <template #default="{ row }">{{ row.vesselName }} / {{ row.voyage }}</template>
                </el-table-column>
                <el-table-column prop="route" label="航线" min-width="200" show-overflow-tooltip />
                <el-table-column label="ETD" width="140">
                  <template #default="{ row }">{{ formatDateTime(row.etd) }}</template>
                </el-table-column>
              </el-table>
              <el-empty v-else description="暂无近期班轮" :image-size="56" />
            </div>
          </div>
        </div>

        <!-- 衔接窗口 -->
        <div class="card mt-16">
          <h3 class="card-title"><span class="card-title-text">中转衔接窗口</span></h3>
          <div data-testid="board-windows">
            <el-table v-if="board.transferWindows.length" :data="board.transferWindows" size="small" border stripe>
              <el-table-column prop="planNo" label="方案号" width="150">
                <template #default="{ row }"><span class="mono">{{ row.planNo }}</span></template>
              </el-table-column>
              <el-table-column prop="nodeName" label="中转节点" min-width="180" />
              <el-table-column label="等待时长(h)" width="120" align="right">
                <template #default="{ row }">{{ Number(row.waitHours).toFixed(1) }}</template>
              </el-table-column>
              <el-table-column label="衔接状态" width="110" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.status === 'OK' ? 'success' : row.status === 'TIGHT' ? 'warning' : 'danger'" size="small" effect="plain">
                    {{ transferStatusLabel(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无衔接窗口" :image-size="56" />
          </div>
        </div>
      </template>

      <el-empty v-else-if="!loading && !errorText" description="暂无看板数据" :image-size="70" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { fetchDispatchBoard } from '../api/dispatch';
import { alertTypeLabel, transferStatusLabel } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { DispatchBoard } from '../types';

const loading = ref(false);
const errorText = ref('');
const board = ref<DispatchBoard | null>(null);

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    board.value = await fetchDispatchBoard();
  } catch (error) {
    board.value = null;
    errorText.value = error instanceof Error && error.message ? error.message : '调度看板加载失败';
  } finally {
    loading.value = false;
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

.capacity-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
}

.capacity-metric__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}

.capacity-metric__name {
  font-size: 13.5px;
  font-weight: 600;
}

.capacity-metric__value {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.capacity-metric__meta {
  margin-top: 8px;
  font-size: 12px;
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.board-grid .card {
  margin-top: 0;
}

.board-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 280px;
  overflow-y: auto;
}

.board-item {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 10px 12px;
  background: #fafcff;
}

.board-item--alert {
  background: #fffaf6;
}

.board-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  font-weight: 500;
}

.board-item__meta {
  margin-top: 4px;
  font-size: 12px;
}

@media (max-width: 1100px) {
  .capacity-grid,
  .board-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
