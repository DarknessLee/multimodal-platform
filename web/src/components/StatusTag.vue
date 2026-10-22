<template>
  <el-tag :type="tagType" :size="size" effect="light" disable-transitions class="status-tag">
    {{ displayLabel }}
  </el-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  billStatusLabel,
  containerStatusLabel,
  orderStatusLabel,
  segmentStatusLabel,
  waybillStatusLabel,
} from '../utils/constants';

type StatusKind = 'order' | 'waybill' | 'segment' | 'bill' | 'container';
type TagType = 'primary' | 'success' | 'info' | 'warning' | 'danger';

const props = withDefaults(
  defineProps<{
    status?: string | null;
    label?: string | null;
    mode?: string | null;
    kind?: StatusKind;
    size?: 'large' | 'default' | 'small';
  }>(),
  {
    status: '',
    label: '',
    mode: '',
    kind: 'order',
    size: 'default',
  },
);

const displayLabel = computed<string>(() => {
  if (props.label) return props.label;
  const status = props.status ?? '';
  switch (props.kind) {
    case 'waybill':
      return waybillStatusLabel(status);
    case 'segment':
      return segmentStatusLabel(status, props.mode);
    case 'bill':
      return billStatusLabel(status);
    case 'container':
      return containerStatusLabel(status);
    default:
      return orderStatusLabel(status);
  }
});

const tagType = computed<TagType>(() => {
  const status = props.status ?? '';
  if (['SIGNED', 'BILLED', 'COMPLETED', 'DELIVERED', 'PAID'].includes(status)) return 'success';
  if (['ARRIVED'].includes(status)) return 'warning';
  if (['CREATED', 'PENDING'].includes(status)) return 'info';
  if (['DISPATCHED', 'ACCEPTED', 'IN_TRANSIT', 'GATE_IN', 'LOADED'].includes(status)) return 'primary';
  return 'info';
});
</script>

<style scoped>
.status-tag {
  font-weight: 500;
}
</style>
