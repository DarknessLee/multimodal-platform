<template>
  <el-table :data="segments" size="small" border stripe class="segment-table">
    <el-table-column prop="seq" label="段序" width="68" align="center" />
    <el-table-column label="运输方式" width="92" align="center">
      <template #default="{ row }">
        <el-tag size="small" effect="plain">{{ row.modeLabel || modeLabel(row.mode) }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column prop="carrierName" label="承运商" min-width="130" show-overflow-tooltip />
    <el-table-column label="起止节点" min-width="210">
      <template #default="{ row }">{{ row.startNode }} → {{ row.endNode }}</template>
    </el-table-column>
    <el-table-column label="计划时间" min-width="185">
      <template #default="{ row }">
        {{ formatDateTime(row.plannedStart) }} ~ {{ formatDateTime(row.plannedEnd) }}
      </template>
    </el-table-column>
    <el-table-column label="实际时间" min-width="185">
      <template #default="{ row }">
        {{ formatDateTime(row.actualStart) }} ~ {{ formatDateTime(row.actualEnd) }}
      </template>
    </el-table-column>
    <el-table-column label="状态" width="96" align="center">
      <template #default="{ row }">
        <StatusTag kind="segment" :status="row.status" :label="row.statusLabel" :mode="row.mode" size="small" />
      </template>
    </el-table-column>
    <el-table-column label="费用(元)" width="104" align="right">
      <template #default="{ row }">
        <span class="amount">{{ formatAmount(row.costAmount) }}</span>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup lang="ts">
import StatusTag from './StatusTag.vue';
import { formatAmount, formatDateTime } from '../utils/format';
import { modeLabel } from '../utils/constants';
import type { Segment } from '../types';

defineProps<{ segments: Segment[] }>();
</script>
