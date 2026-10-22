<template>
  <div class="trend-chart">
    <div v-show="hasData" ref="chartRef" class="trend-chart__canvas" />
    <el-empty v-if="!hasData" description="暂无趋势数据" :image-size="72" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import type { DashboardTrend } from '../types';
import { formatAmount } from '../utils/format';

const props = defineProps<{ trend: DashboardTrend | null }>();

const chartRef = ref<HTMLDivElement | null>(null);
const hasData = computed(() => Boolean(props.trend && props.trend.dates?.length));

let chart: echarts.ECharts | null = null;
let observer: ResizeObserver | null = null;

function buildOption(): echarts.EChartsOption {
  const trend = props.trend;
  const dates = trend?.dates ?? [];
  const orders = trend?.orders ?? [];
  const revenue = trend?.revenue ?? [];
  return {
    color: ['#409eff', '#67c23a'],
    grid: { left: 52, right: 66, top: 52, bottom: 44 },
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const list = params as Array<{ axisValue?: string; seriesName?: string; value?: number; marker?: string }>;
        if (!Array.isArray(list) || list.length === 0) return '';
        const rows = list.map((item) => {
          const value = item.seriesName === '营收(元)' ? formatAmount(item.value ?? 0) : String(item.value ?? 0);
          return `${item.marker ?? ''}${item.seriesName ?? ''}：${value}`;
        });
        return `<div style="font-weight:600;margin-bottom:4px">${list[0]?.axisValue ?? ''}</div>${rows.join('<br/>')}`;
      },
    },
    legend: { top: 0, right: 8, itemWidth: 14, itemHeight: 8, textStyle: { fontSize: 11, color: '#606266' } },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { fontSize: 10, color: '#909399' },
      axisLine: { lineStyle: { color: '#dcdfe6' } },
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        name: '订单数',
        nameTextStyle: { fontSize: 11, color: '#909399' },
        minInterval: 1,
        axisLabel: { fontSize: 10, color: '#909399' },
        splitLine: { lineStyle: { color: '#f0f2f5' } },
      },
      {
        type: 'value',
        name: '营收(元)',
        nameTextStyle: { fontSize: 11, color: '#909399' },
        axisLabel: { fontSize: 10, color: '#909399', formatter: (value: number) => (value >= 10000 ? `${value / 10000}w` : String(value)) },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '订单数',
        type: 'bar',
        barMaxWidth: 18,
        itemStyle: { borderRadius: [3, 3, 0, 0], color: '#a0cfff' },
        data: orders,
      },
      {
        name: '营收(元)',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2.5, color: '#67c23a' },
        itemStyle: { color: '#67c23a' },
        data: revenue,
      },
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
.trend-chart {
  width: 100%;
  min-height: 300px;
}

.trend-chart__canvas {
  width: 100%;
  height: 320px;
}
</style>
