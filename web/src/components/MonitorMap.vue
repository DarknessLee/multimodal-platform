<template>
  <div class="monitor-map">
    <div v-show="points.length > 0" ref="chartRef" class="monitor-map__canvas" />
    <el-empty v-if="points.length === 0" description="暂无在线运单位置" :image-size="64" />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import type { MonitorLivePoint } from '../types';
import { MODE_COLORS, MODE_LABELS } from '../utils/constants';

const props = defineProps<{ points: MonitorLivePoint[] }>();

const chartRef = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;
let observer: ResizeObserver | null = null;

function buildOption(): echarts.EChartsOption {
  const points = props.points;
  const lngs = points.map((point) => Number(point.lng));
  const lats = points.map((point) => Number(point.lat));
  const lngMin = lngs.length ? Math.min(...lngs) : 100;
  const lngMax = lngs.length ? Math.max(...lngs) : 124;
  const latMin = lats.length ? Math.min(...lats) : 28;
  const latMax = lats.length ? Math.max(...lats) : 34;
  const lngPad = Math.max((lngMax - lngMin) * 0.12, 0.5);
  const latPad = Math.max((latMax - latMin) * 0.2, 0.4);

  const series: echarts.SeriesOption[] = (['ROAD', 'SEA', 'RAIL'] as const).map((mode) => {
    const modePoints = points.filter((point) => point.mode === mode);
    return {
      name: MODE_LABELS[mode] ?? mode,
      type: 'scatter',
      symbolSize: 12,
      z: mode === 'RAIL' ? 4 : 3,
      data: modePoints.map((point) => ({
        value: [Number(point.lng), Number(point.lat)],
        name: point.waybillNo,
        point,
      })),
      itemStyle: {
        color: MODE_COLORS[mode] ?? '#409eff',
        borderColor: '#0b1220',
        borderWidth: 1,
        shadowBlur: 10,
        shadowColor: MODE_COLORS[mode] ?? '#409eff',
      },
      label: {
        show: true,
        position: 'right',
        distance: 4,
        fontSize: 10,
        color: '#c9d6ea',
        formatter: (params: unknown) => (params as { data?: { name?: string } }).data?.name ?? '',
      },
    };
  });

  return {
    backgroundColor: 'transparent',
    grid: { left: 58, right: 46, top: 30, bottom: 40 },
    legend: {
      top: 0,
      right: 4,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: '#9fb3d1', fontSize: 11 },
    },
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: 'rgba(9, 19, 36, 0.92)',
      borderColor: '#1e3a5f',
      textStyle: { color: '#dbe7f7', fontSize: 12 },
      formatter: (params: unknown) => {
        const item = params as { data?: { point?: MonitorLivePoint; name?: string } };
        const point = item.data?.point;
        if (!point) return item.data?.name ?? '';
        return [
          `<div style="font-weight:600;margin-bottom:4px">${point.waybillNo}</div>`,
          `<div>箱号：${point.containerNo || '—'}</div>`,
          `<div>模式：${MODE_LABELS[point.mode] ?? point.mode}</div>`,
          `<div>状态：${point.statusLabel}</div>`,
          `<div>坐标：${Number(point.lng).toFixed(3)}, ${Number(point.lat).toFixed(3)}</div>`,
        ].join('');
      },
    },
    xAxis: {
      type: 'value',
      min: Number((lngMin - lngPad).toFixed(3)),
      max: Number((lngMax + lngPad).toFixed(3)),
      axisLabel: { fontSize: 10, color: '#6b7f9e', formatter: (value: number) => value.toFixed(1) },
      axisLine: { lineStyle: { color: '#1e3050' } },
      splitLine: { lineStyle: { color: 'rgba(41, 68, 104, 0.45)' } },
    },
    yAxis: {
      type: 'value',
      min: Number((latMin - latPad).toFixed(3)),
      max: Number((latMax + latPad).toFixed(3)),
      axisLabel: { fontSize: 10, color: '#6b7f9e', formatter: (value: number) => value.toFixed(1) },
      axisLine: { lineStyle: { color: '#1e3050' } },
      splitLine: { lineStyle: { color: 'rgba(41, 68, 104, 0.45)' } },
    },
    series,
  };
}

function render(): void {
  if (!chartRef.value || props.points.length === 0) return;
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
  () => props.points,
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
.monitor-map {
  width: 100%;
  min-height: 340px;
}

.monitor-map__canvas {
  width: 100%;
  height: 360px;
}
</style>
