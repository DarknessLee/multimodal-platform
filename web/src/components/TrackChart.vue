<template>
  <div class="track-chart">
    <div v-show="hasPoints" ref="chartRef" class="track-chart__canvas" />
    <el-empty v-if="!hasPoints" description="暂无轨迹数据" :image-size="72" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import type { Segment, TrackPoint } from '../types';
import { MODE_COLORS, modeLabel, trackSourceLabel } from '../utils/constants';

const props = defineProps<{ points: TrackPoint[]; segments: Segment[] }>();

const chartRef = ref<HTMLDivElement | null>(null);
const hasPoints = computed(() => props.points.length > 0);

let chart: echarts.ECharts | null = null;
let observer: ResizeObserver | null = null;

const SEGMENT_COLORS = [MODE_COLORS.ROAD, MODE_COLORS.SEA, MODE_COLORS.RAIL, '#9254de'];

function buildOption(): echarts.EChartsOption {
  const segmentIds = new Set(props.segments.map((segment) => segment.id));
  const colorBySegment = new Map<number, string>();
  props.segments.forEach((segment, index) => {
    colorBySegment.set(segment.id, SEGMENT_COLORS[index % SEGMENT_COLORS.length]);
  });

  const lngs = props.points.map((point) => point.lng);
  const lats = props.points.map((point) => point.lat);
  const lngMin = lngs.length ? Math.min(...lngs) : 104;
  const lngMax = lngs.length ? Math.max(...lngs) : 122;
  const latMin = lats.length ? Math.min(...lats) : 30;
  const latMax = lats.length ? Math.max(...lats) : 33;
  const lngPad = Math.max((lngMax - lngMin) * 0.12, 0.6);
  const latPad = Math.max((latMax - latMin) * 0.25, 0.4);

  const series: echarts.SeriesOption[] = [];
  const labelSeen = new Set<string>();
  const shouldShowLabel = (point: TrackPoint): boolean => {
    // 途中 GPS 补点太多，只标注业务节点（司机/港站/EDI/签收）
    if (point.source === 'MOCK_GPS') return false;
    const key = `${point.lng.toFixed(3)},${point.lat.toFixed(3)}`;
    if (labelSeen.has(key)) return false;
    labelSeen.add(key);
    return true;
  };

  for (const segment of props.segments) {
    const segmentPoints = props.points
      .filter((point) => point.segmentId === segment.id)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.seq - b.seq);
    if (segmentPoints.length === 0) continue;
    const color = colorBySegment.get(segment.id) ?? '#409eff';
    series.push({
      name: `${segment.seq}. ${segment.modeLabel || modeLabel(segment.mode)} · ${segment.carrierName}`,
      type: 'line',
      smooth: false,
      symbol: 'circle',
      symbolSize: 7,
      z: 3,
      data: segmentPoints.map((point) => ({
        value: [point.lng, point.lat],
        name: point.nodeName,
        point,
        showLabel: shouldShowLabel(point),
      })),
      lineStyle: { width: 3, color },
      itemStyle: { color, borderColor: '#ffffff', borderWidth: 1.5 },
      label: {
        show: true,
        position: 'right',
        distance: 5,
        fontSize: 11,
        color: '#606266',
        formatter: (params: unknown) => {
          const data = (params as { data?: { name?: string; showLabel?: boolean } }).data;
          return data?.showLabel ? data.name ?? '' : '';
        },
      },
      labelLayout: { hideOverlap: true },
      emphasis: { focus: 'series' },
    });
  }

  const signPoints = props.points.filter(
    (point) => point.segmentId === null || !segmentIds.has(point.segmentId as number),
  );
  if (signPoints.length > 0) {
    series.push({
      name: '签收/平台节点',
      type: 'scatter',
      symbol: 'pin',
      symbolSize: 34,
      z: 5,
      data: signPoints.map((point) => ({
        value: [point.lng, point.lat],
        name: point.nodeName,
        point,
        showLabel: shouldShowLabel(point),
      })),
      itemStyle: { color: '#67c23a' },
      label: {
        show: true,
        position: 'top',
        distance: 4,
        fontSize: 11,
        color: '#67c23a',
        formatter: (params: unknown) => {
          const data = (params as { data?: { name?: string; showLabel?: boolean } }).data;
          return data?.showLabel ? data.name ?? '' : '';
        },
      },
      labelLayout: { hideOverlap: true },
    });
  }

  return {
    color: SEGMENT_COLORS,
    grid: { left: 64, right: 96, top: 36, bottom: 72 },
    legend: {
      bottom: 8,
      type: 'scroll',
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 6,
      textStyle: { fontSize: 11, color: '#606266' },
    },
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (params: unknown) => {
        const item = params as { data?: { point?: TrackPoint; name?: string } };
        const point = item.data?.point;
        if (!point) return item.data?.name ?? '';
        return [
          `<div style="font-weight:600;margin-bottom:4px">${point.nodeName}</div>`,
          `<div>时间：${point.occurredAt}</div>`,
          `<div>来源：${trackSourceLabel(point.source)}</div>`,
          `<div>说明：${point.description || '—'}</div>`,
        ].join('');
      },
    },
    xAxis: {
      type: 'value',
      name: '经度',
      nameTextStyle: { fontSize: 11, color: '#909399' },
      min: Number((lngMin - lngPad).toFixed(3)),
      max: Number((lngMax + lngPad).toFixed(3)),
      axisLabel: { fontSize: 10, color: '#909399', formatter: (value: number) => value.toFixed(1) },
      splitLine: { lineStyle: { color: '#f0f2f5' } },
      axisLine: { lineStyle: { color: '#dcdfe6' } },
    },
    yAxis: {
      type: 'value',
      name: '纬度',
      nameTextStyle: { fontSize: 11, color: '#909399' },
      min: Number((latMin - latPad).toFixed(3)),
      max: Number((latMax + latPad).toFixed(3)),
      axisLabel: { fontSize: 10, color: '#909399', formatter: (value: number) => value.toFixed(1) },
      splitLine: { lineStyle: { color: '#f0f2f5' } },
      axisLine: { lineStyle: { color: '#dcdfe6' } },
    },
    series,
  };
}

function render(): void {
  if (!chartRef.value || !hasPoints.value) return;
  if (!chart) {
    chart = echarts.init(chartRef.value);
  }
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
  () => [props.points, props.segments],
  () => {
    void nextTick(() => {
      render();
      if (props.points.length > 0 && !observer && chartRef.value && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => chart?.resize());
        observer.observe(chartRef.value);
      }
    });
  },
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
.track-chart {
  width: 100%;
  min-height: 420px;
}

.track-chart__canvas {
  width: 100%;
  height: 460px;
}
</style>
