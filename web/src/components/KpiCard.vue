<template>
  <div class="kpi-card" :class="`kpi-card--${tone}`">
    <div class="kpi-card__label">{{ label }}</div>
    <div class="kpi-card__value">
      {{ value }}<span v-if="suffix" class="kpi-card__suffix">{{ suffix }}</span>
    </div>
    <div v-if="hint" class="kpi-card__hint">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    suffix?: string;
    hint?: string;
    tone?: 'primary' | 'success' | 'warning' | 'danger' | 'default';
  }>(),
  {
    suffix: '',
    hint: '',
    tone: 'default',
  },
);
</script>

<style scoped>
.kpi-card {
  border-radius: 10px;
  padding: 16px 18px;
  background: #ffffff;
  border: 1px solid var(--app-border);
  border-left: 4px solid #909399;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  min-width: 0;
}

.kpi-card--primary {
  border-left-color: #409eff;
}

.kpi-card--success {
  border-left-color: #67c23a;
}

.kpi-card--warning {
  border-left-color: #e6a23c;
}

.kpi-card--danger {
  border-left-color: #f56c6c;
}

.kpi-card__label {
  font-size: 12.5px;
  color: var(--app-text-secondary);
}

.kpi-card__value {
  margin-top: 8px;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  color: var(--app-text);
}

.kpi-card__suffix {
  margin-left: 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-secondary);
}

.kpi-card__hint {
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--app-text-secondary);
}
</style>
