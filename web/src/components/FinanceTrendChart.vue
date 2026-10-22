<template>
  <div class="finance-trend">
    <div v-show="hasData" ref="chartRef" class="finance-trend__canvas" />
    <el-empty v-if="!hasData" description="暂无趋势数据" :image-size="64" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import type { AnalyticsTrend } from '../types';
import { formatAmount } from '../utils/format';

const props = defineProps<{ trend: AnalyticsTrend | null }>();

const chartRef = ref<HTMLDivElement | null>(null);
const hasData = computed(() => Boolean(props.trend && props.trend.dates?.length));
let chart: echarts.ECharts | null = null;
let observer: ResizeObserver | null = null;

function buildOption(): echarts.EChartsOption {
  const trend = props.trend;
  return {
    color: ['#409eff', '#fa8c16', '#67c23a'],
    grid: { left: 60, right: 40, top: 36, bottom: 44 },
    legend: { top: 0, right: 8, itemWidth: 14, itemHeight: 8, textStyle: { fontSize: 11, color: '#606266' } },
    tooltip: {
      trigger: 'axis',
      confine: true,
      formatter: (params: unknown) => {
        const list = params as Array<{ axisValue?: string; seriesName?: string; value?: number; marker?: string }>;
        if (!Array.isArray(list) || list.length === 0) return '';
        const rows = list.map((item) => `${item.marker ?? ''}${item.seriesName ?? ''}：¥${formatAmount(item.value ?? 0)}`);
        return `<div style="font-weight:600;margin-bottom:4px">${list[0]?.axisValue ?? ''}</div>${rows.join('<br/>')}`;
      },
    },
    xAxis: {
      type: 'category',
      data: trend?.dates ?? [],
      axisLabel: { fontSize: 10, color: '#909399' },
      axisLine: { lineStyle: { color: '#dcdfe6' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        fontSize: 10,
        color: '#909399',
        formatter: (value: number) => (value >= 10000 ? `${(value / 10000).toFixed(0)}w` : String(value)),
      },
      splitLine: { lineStyle: { color: '#f0f2f5' } },
    },
    series: [
      { name: '收入', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2.5 }, data: trend?.revenue ?? [] },
      { name: '成本', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2.5 }, data: trend?.cost ?? [] },
      { name: '毛利', type: 'bar', barMaxWidth: 14, itemStyle: { borderRadius: [3, 3, 0, 0] }, data: trend?.profit ?? [] },
    ],
  };
}

function render(): void {
  if (!chartRef.value || !hasData.value) return;
  if (!chart) chart = echarts.init(chartRef.value);
  chart.setOption(buildOption(), true);
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
  () => props.trend,
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
.finance-trend {
  width: 100%;
  min-height: 300px;
}

.finance-trend__canvas {
  width: 100%;
  height: 320px;
}
</style>
