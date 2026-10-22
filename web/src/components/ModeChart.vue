<template>
  <div class="mode-chart">
    <div v-show="distribution.length > 0" ref="chartRef" class="mode-chart__canvas" />
    <el-empty v-if="distribution.length === 0" description="暂无模式分布" :image-size="64" />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import type { MonitorOverview } from '../types';
import { MODE_COLORS, MODE_LABELS } from '../utils/constants';

const props = defineProps<{ distribution: MonitorOverview['modeDistribution'] }>();

const chartRef = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;
let observer: ResizeObserver | null = null;

function render(): void {
  if (!chartRef.value || props.distribution.length === 0) return;
  if (!chart) chart = echarts.init(chartRef.value);
  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: 'rgba(9, 19, 36, 0.92)',
      borderColor: '#1e3a5f',
      textStyle: { color: '#dbe7f7', fontSize: 12 },
      formatter: (params: unknown) => {
        const item = params as { name?: string; value?: number; percent?: number };
        return `${item.name ?? ''}<br/>${item.value ?? 0} 票（${item.percent ?? 0}%）`;
      },
    },
    legend: {
      bottom: 0,
      icon: 'circle',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: '#9fb3d1', fontSize: 11 },
    },
    series: [
      {
        name: '运输模式',
        type: 'pie',
        radius: ['46%', '70%'],
        center: ['50%', '44%'],
        itemStyle: { borderColor: '#0b1220', borderWidth: 2 },
        label: {
          show: true,
          color: '#c9d6ea',
          fontSize: 11,
          formatter: (params: unknown) => {
            const item = params as { name?: string; value?: number };
            return `${item.name ?? ''}\n${item.value ?? 0}`;
          },
        },
        data: props.distribution.map((item) => ({
          name: MODE_LABELS[item.mode] ?? item.mode,
          value: item.count,
          itemStyle: { color: MODE_COLORS[item.mode] ?? '#909399' },
        })),
      },
    ],
  };
  chart.setOption(option, true);
  chart.resize();
}

onMounted(() => {
  void nextTick(() => {
    render();
    if (chartRef.value && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(chartRef.value);
    }
  });
});

watch(
  () => props.distribution,
  () => void nextTick(render),
  { deep: true },
);

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
.mode-chart {
  width: 100%;
}

.mode-chart__canvas {
  width: 100%;
  height: 240px;
}
</style>
