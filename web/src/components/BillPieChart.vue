<template>
  <div class="bill-pie">
    <div ref="chartRef" class="bill-pie__canvas" />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import type { BillBreakdownItem } from '../types';
import { MODE_COLORS } from '../utils/constants';
import { formatAmount } from '../utils/format';

const props = defineProps<{ breakdown: BillBreakdownItem[] }>();

const chartRef = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;
let observer: ResizeObserver | null = null;

function render(): void {
  if (!chartRef.value || props.breakdown.length === 0) return;
  if (!chart) chart = echarts.init(chartRef.value);
  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (params: unknown) => {
        const item = params as { name?: string; value?: number; percent?: number };
        return `${item.name ?? ''}<br/>¥${formatAmount(item.value ?? 0)}（${item.percent ?? 0}%）`;
      },
    },
    legend: {
      bottom: 4,
      icon: 'circle',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { fontSize: 12, color: '#606266' },
    },
    series: [
      {
        name: '分段费用',
        type: 'pie',
        radius: ['42%', '66%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
        label: {
          show: true,
          formatter: (params: unknown) => {
            const item = params as { name?: string; value?: number };
            return `${item.name ?? ''}\n¥${formatAmount(item.value ?? 0)}`;
          },
          fontSize: 11,
          color: '#606266',
        },
        data: props.breakdown.map((item) => ({
          name: `${item.seq}. ${item.modeLabel}`,
          value: item.amount,
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
  () => props.breakdown,
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
.bill-pie {
  width: 100%;
}

.bill-pie__canvas {
  width: 100%;
  height: 300px;
}
</style>
