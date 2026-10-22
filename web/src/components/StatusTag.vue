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
  contractStatusLabel,
  integrationStatusLabel,
  orderStatusLabel,
  partnerTypeLabel,
  quoteStatusLabel,
  segmentStatusLabel,
  waybillStatusLabel,
} from '../utils/constants';

type StatusKind =
  | 'order'
  | 'waybill'
  | 'segment'
  | 'bill'
  | 'container'
  | 'quote'
  | 'contract'
  | 'integration'
  | 'partner'
  | 'customer';
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
    case 'quote':
      return quoteStatusLabel(status);
    case 'contract':
      return contractStatusLabel(status);
    case 'integration':
      return integrationStatusLabel(status);
    case 'partner':
      return partnerTypeLabel(status);
    default:
      return orderStatusLabel(status);
  }
});

const tagType = computed<TagType>(() => {
  const status = props.status ?? '';
  if (
    ['SIGNED', 'BILLED', 'COMPLETED', 'DELIVERED', 'PAID', 'ACCEPTED', 'SUCCESS', 'ACTIVE', 'UP', 'RETURNED', 'STACKED'].includes(
      status,
    )
  ) {
    return 'success';
  }
  if (
    ['ARRIVED', 'PENDING_SIGN', 'URGENT', 'EXPIRED', 'DEGRADED', 'RETRYING', 'AT_DEPOT', 'PENDING'].includes(status)
  ) {
    return 'warning';
  }
  if (['FAILED', 'TERMINATED', 'EXCEPTION', 'IN_REPAIR', 'REJECTED'].includes(status)) {
    return 'danger';
  }
  if (['CREATED', 'PENDING', 'DRAFT', 'CANCELLED', 'DISABLED', 'DOWN', 'EMPTY'].includes(status)) {
    return 'info';
  }
  if (
    [
      'DISPATCHED',
      'IN_TRANSIT',
      'GATE_IN',
      'LOADED',
      'SENT',
      'CONTRACTED',
      'CONFIRMED',
      'RELEASED',
      'GATE_OUT',
      'BOOKED',
      'APPLIED',
    ].includes(status)
  ) {
    return 'primary';
  }
  return 'info';
});
</script>

<style scoped>
.status-tag {
  font-weight: 500;
}
</style>
