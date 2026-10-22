<template>
  <div class="simple-bar">
    <div v-show="hasData" ref="chartRef" class="simple-bar__canvas" :style="{ height: `${height}px` }" />
    <el-empty v-if="!hasData" description="暂无数据" :image-size="56" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';

interface BarSeries {
  name: string;
  data: number[];
  color?: string;
}

const props = withDefaults(
  defineProps<{
    labels: string[];
    series: BarSeries[];
    horizontal?: boolean;
    height?: number;
    valueFormatter?: (value: number) => string;
  }>(),
  {
    horizontal: false,
    height: 300,
    valueFormatter: undefined,
  },
);

const chartRef = ref<HTMLDivElement | null>(null);
const hasData = computed(() => props.labels.length > 0 && props.series.length > 0);
let chart: echarts.ECharts | null = null;
let observer: ResizeObserver | null = null;

function formatValue(value: number): string {
  if (props.valueFormatter) return props.valueFormatter(value);
  return value >= 10000 ? `${(value / 10000).toFixed(1)}w` : String(value);
}

function buildOption(): echarts.EChartsOption {
  const categoryAxis = {
    type: 'category' as const,
    data: props.labels,
    axisLabel: { fontSize: 10, color: '#909399', interval: 0, rotate: props.horizontal ? 0 : 18 },
    axisLine: { lineStyle: { color: '#dcdfe6' } },
    axisTick: { show: false },
  };
  const valueAxis = {
    type: 'value' as const,
    axisLabel: { fontSize: 10, color: '#909399', formatter: (value: number) => formatValue(value) },
    splitLine: { lineStyle: { color: '#f0f2f5' } },
  };
  return {
    color: props.series.map((item, index) => item.color ?? ['#409eff', '#fa8c16', '#67c23a'][index % 3]),
    grid: {
      left: props.horizontal ? 110 : 52,
      right: 24,
      top: 34,
      bottom: props.horizontal ? 24 : 54,
    },
    legend: { top: 0, right: 4, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11, color: '#606266' } },
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'shadow' },
      valueFormatter: (value: unknown) => formatValue(Number(value ?? 0)),
    },
    xAxis: props.horizontal ? valueAxis : categoryAxis,
    yAxis: props.horizontal ? categoryAxis : valueAxis,
    series: props.series.map((item) => ({
      name: item.name,
      type: 'bar' as const,
      barMaxWidth: 18,
      itemStyle: { borderRadius: props.horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] },
      data: item.data,
    })),
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
  () => [props.labels, props.series],
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
.simple-bar {
  width: 100%;
}

.simple-bar__canvas {
  width: 100%;
}
</style>
