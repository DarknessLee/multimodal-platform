<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">运力池</h2>
        <p class="page-subtitle">公路车辆 / 铁路班列 / 水路班轮 · 状态、利用率与订舱情况</p>
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

    <div class="card" data-testid="capacity-utilization">
      <h3 class="card-title"><span class="card-title-text">运力利用率</span></h3>
      <div class="util-grid">
        <div class="util-item">
          <div class="util-item__head">
            <span>公路车辆</span>
            <span class="util-item__value">{{ Number(summary?.vehicles.utilization ?? 0).toFixed(1) }}%</span>
          </div>
          <el-progress :percentage="clamp(summary?.vehicles.utilization)" :stroke-width="8" color="#409eff" />
          <div class="util-item__meta muted">
            {{ summary?.vehicles.total ?? 0 }} 辆 · 空闲 {{ summary?.vehicles.idle ?? 0 }} · 任务中
            {{ summary?.vehicles.inTask ?? 0 }}
          </div>
        </div>
        <div class="util-item">
          <div class="util-item__head">
            <span>铁路班列</span>
            <span class="util-item__value">{{ Number(summary?.trains.utilization ?? 0).toFixed(1) }}%</span>
          </div>
          <el-progress :percentage="clamp(summary?.trains.utilization)" :stroke-width="8" color="#fa8c16" />
          <div class="util-item__meta muted">
            {{ summary?.trains.capacityTeu ?? 0 }} TEU · 已订 {{ summary?.trains.bookedTeu ?? 0 }} TEU
          </div>
        </div>
        <div class="util-item">
          <div class="util-item__head">
            <span>水路班轮</span>
            <span class="util-item__value">{{ Number(summary?.vessels.utilization ?? 0).toFixed(1) }}%</span>
          </div>
          <el-progress :percentage="clamp(summary?.vessels.utilization)" :stroke-width="8" color="#13c2c2" />
          <div class="util-item__meta muted">
            {{ summary?.vessels.capacityTeu ?? 0 }} TEU · 已订 {{ summary?.vessels.bookedTeu ?? 0 }} TEU
          </div>
        </div>
      </div>
    </div>

    <div class="card mt-16">
      <el-tabs v-model="activeTab">
        <el-tab-pane name="vehicles">
          <template #label><span data-testid="capacity-tab-vehicles">公路车辆</span></template>
          <el-table v-loading="loading" :data="vehicles" size="small" border stripe>
            <el-table-column label="车辆编号" min-width="140">
              <template #default="{ row }">
                <span class="mono" data-testid="vehicle-row">{{ row.vehicleNo }}</span>
              </template>
            </el-table-column>
            <el-table-column label="车牌号" width="120">
              <template #default="{ row }"><span class="mono">{{ row.plateNo }}</span></template>
            </el-table-column>
            <el-table-column label="类型" width="100" align="center">
              <template #default="{ row }">{{ vehicleTypeLabel(row.vehicleType) }}</template>
            </el-table-column>
            <el-table-column prop="carrierName" label="承运商" min-width="150" show-overflow-tooltip />
            <el-table-column label="司机" width="150">
              <template #default="{ row }">{{ row.driverName }} / {{ row.driverPhone }}</template>
            </el-table-column>
            <el-table-column label="载重/箱位" width="120" align="center">
              <template #default="{ row }">{{ Number(row.capacityT).toFixed(1) }}t / {{ row.containerSlots }} 箱</template>
            </el-table-column>
            <el-table-column label="当前位置" min-width="140">
              <template #default="{ row }">{{ row.currentNode || '—' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="96" align="center">
              <template #default="{ row }">
                <el-tag :type="vehicleTagType(row.status)" size="small" effect="plain">
                  {{ row.statusLabel || vehicleStatusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="最后定位" width="140">
              <template #default="{ row }">{{ formatDateTime(row.lastSeenAt) }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!loading && vehicles.length === 0" description="暂无车辆运力" :image-size="64" />
        </el-tab-pane>

        <el-tab-pane name="trains">
          <template #label><span data-testid="capacity-tab-trains">铁路班列</span></template>
          <el-table v-loading="loading" :data="trains" size="small" border stripe>
            <el-table-column label="班列号" width="120">
              <template #default="{ row }">
                <span class="mono" data-testid="train-row">{{ row.trainNo }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="operatorName" label="运营方" min-width="150" show-overflow-tooltip />
            <el-table-column label="线路" min-width="220">
              <template #default="{ row }">{{ row.originNode }} → {{ row.destNode }}</template>
            </el-table-column>
            <el-table-column label="发车/到达" min-width="220">
              <template #default="{ row }">
                {{ formatDateTime(row.departureAt) }} ~ {{ formatDateTime(row.arrivalAt) }}
              </template>
            </el-table-column>
            <el-table-column label="订舱/容量(TEU)" width="140" align="right">
              <template #default="{ row }">{{ row.bookedTeu }}/{{ row.capacityTeu }}</template>
            </el-table-column>
            <el-table-column label="利用率" width="90" align="right">
              <template #default="{ row }">{{ Number(row.utilization).toFixed(1) }}%</template>
            </el-table-column>
            <el-table-column label="价格指数" width="96" align="right">
              <template #default="{ row }">{{ Number(row.priceIndex).toFixed(1) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="96" align="center">
              <template #default="{ row }">
                <el-tag size="small" effect="plain">{{ row.statusLabel || scheduleStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!loading && trains.length === 0" description="暂无班列运力" :image-size="64" />
        </el-tab-pane>

        <el-tab-pane name="vessels">
          <template #label><span data-testid="capacity-tab-vessels">水路班轮</span></template>
          <el-table v-loading="loading" :data="vessels" size="small" border stripe>
            <el-table-column label="船名 / 航次" min-width="180">
              <template #default="{ row }">
                <span data-testid="vessel-row" class="mono">{{ row.vesselName }}</span>
                <span class="muted"> / {{ row.voyage }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="carrierName" label="承运商" min-width="150" show-overflow-tooltip />
            <el-table-column label="航线" min-width="220">
              <template #default="{ row }">{{ row.originPort }} → {{ row.destPort }}</template>
            </el-table-column>
            <el-table-column label="ETD / ETA" min-width="220">
              <template #default="{ row }">{{ formatDateTime(row.etd) }} ~ {{ formatDateTime(row.eta) }}</template>
            </el-table-column>
            <el-table-column label="订舱/容量(TEU)" width="140" align="right">
              <template #default="{ row }">{{ row.bookedTeu }}/{{ row.capacityTeu }}</template>
            </el-table-column>
            <el-table-column label="利用率" width="90" align="right">
              <template #default="{ row }">{{ Number(row.utilization).toFixed(1) }}%</template>
            </el-table-column>
            <el-table-column label="价格指数" width="96" align="right">
              <template #default="{ row }">{{ Number(row.priceIndex).toFixed(1) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="96" align="center">
              <template #default="{ row }">
                <el-tag size="small" effect="plain">{{ row.statusLabel || scheduleStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!loading && vessels.length === 0" description="暂无班轮运力" :image-size="64" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  fetchCapacitySummary,
  fetchTrains,
  fetchVehicles,
  fetchVessels,
} from '../api/capacity';
import { scheduleStatusLabel, vehicleStatusLabel, vehicleTypeLabel } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type {
  CapacitySummary,
  TrainScheduleItem,
  Vehicle,
  VesselScheduleItem,
} from '../types';

const activeTab = ref('vehicles');
const loading = ref(false);
const errorText = ref('');
const summary = ref<CapacitySummary | null>(null);
const vehicles = ref<Vehicle[]>([]);
const trains = ref<TrainScheduleItem[]>([]);
const vessels = ref<VesselScheduleItem[]>([]);

function clamp(value: number | undefined): number {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function vehicleTagType(status: string): 'success' | 'primary' | 'warning' {
  if (status === 'IDLE') return 'success';
  if (status === 'IN_TASK') return 'primary';
  return 'warning';
}

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  const [summaryResult, vehicleResult, trainResult, vesselResult] = await Promise.allSettled([
    fetchCapacitySummary(),
    fetchVehicles({ page: 1, pageSize: 50 }),
    fetchTrains({ page: 1, pageSize: 50 }),
    fetchVessels({ page: 1, pageSize: 50 }),
  ]);
  if (summaryResult.status === 'fulfilled') summary.value = summaryResult.value;
  if (vehicleResult.status === 'fulfilled') vehicles.value = vehicleResult.value.list;
  if (trainResult.status === 'fulfilled') trains.value = trainResult.value.list;
  if (vesselResult.status === 'fulfilled') vessels.value = vesselResult.value.list;

  const failed = [summaryResult, vehicleResult, trainResult, vesselResult].find(
    (result) => result.status === 'rejected',
  );
  if (failed && failed.status === 'rejected') {
    const error = failed.reason;
    errorText.value = error instanceof Error && error.message ? error.message : '运力池加载失败';
  }
  loading.value = false;
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

.util-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
}

.util-item__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13.5px;
  font-weight: 600;
}

.util-item__value {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.util-item__meta {
  margin-top: 8px;
  font-size: 12px;
}

@media (max-width: 1100px) {
  .util-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
