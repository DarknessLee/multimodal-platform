<template>
  <div class="quote-breakdown">
    <el-table :data="items" size="small" border stripe show-summary :summary-method="summaryMethod">
      <el-table-column prop="seq" label="序号" width="64" align="center" />
      <el-table-column label="运输方式" width="94" align="center">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">{{ row.modeLabel || modeLabel(row.mode) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="费用说明" min-width="190" show-overflow-tooltip />
      <el-table-column label="数量" width="84" align="right">
        <template #default="{ row }">{{ row.quantity }} {{ row.unit }}</template>
      </el-table-column>
      <el-table-column label="单价(元)" width="110" align="right">
        <template #default="{ row }">{{ formatAmount(row.unitPrice) }}</template>
      </el-table-column>
      <el-table-column label="金额(元)" width="120" align="right">
        <template #default="{ row }">
          <span class="amount">{{ formatAmount(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="calcMethod" label="计费方式" width="100" align="center">
        <template #default="{ row }">{{ calcMethodLabel(row.calcMethod) }}</template>
      </el-table-column>
    </el-table>
    <div class="quote-breakdown__total">
      <span class="muted">费用合计（含附加费）</span>
      <span class="amount-lg">¥{{ formatAmount(totalAmount) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { calcMethodLabel, modeLabel } from '../utils/constants';
import { formatAmount } from '../utils/format';
import type { QuoteItem } from '../types';

const props = withDefaults(
  defineProps<{
    items: QuoteItem[];
    totalAmount?: number;
  }>(),
  { totalAmount: 0 },
);

function summaryMethod(params: { columns: Array<{ property?: string; label?: string }>; data: QuoteItem[] }): string[] {
  const sums: string[] = params.columns.map(() => '');
  const total = params.data.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  sums[0] = '合计';
  const amountIndex = params.columns.findIndex((column) => column.label === '金额(元)');
  sums[amountIndex >= 0 ? amountIndex : params.columns.length - 2] = formatAmount(props.totalAmount || total);
  return sums;
}
</script>

<style scoped>
.quote-breakdown__total {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 14px;
  padding: 14px 4px 0;
  border-top: 1px dashed var(--app-border);
  margin-top: 8px;
}
</style>
