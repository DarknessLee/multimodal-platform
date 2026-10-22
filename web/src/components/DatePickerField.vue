<template>
  <div ref="wrapperRef" class="date-field">
    <el-date-picker
      ref="pickerRef"
      v-model="innerValue"
      type="date"
      value-format="YYYY-MM-DD"
      :placeholder="placeholder"
      :disabled-date="disabledDate"
      :clearable="false"
      style="width: 100%"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';

/**
 * el-date-picker 的属性不会透传到内部原生 input，
 * 这里在挂载后把 data-testid 注入原生 input，保证 E2E 可以直接 fill/click。
 */
const props = withDefaults(
  defineProps<{
    modelValue: string;
    testid: string;
    placeholder?: string;
    disablePast?: boolean;
  }>(),
  {
    placeholder: '请选择日期',
    disablePast: true,
  },
);

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>();

const wrapperRef = ref<HTMLDivElement | null>(null);
const pickerRef = ref<{ $el?: HTMLElement } | null>(null);

const innerValue = computed<string>({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value ?? ''),
});

function disabledDate(date: Date): boolean {
  if (!props.disablePast) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

function injectTestId(): void {
  const input = wrapperRef.value?.querySelector('input');
  if (input) {
    input.setAttribute('data-testid', props.testid);
  } else {
    console.warn('[DatePickerField] 未能注入 data-testid', props.testid);
  }
}

onMounted(() => {
  void nextTick(injectTestId);
});

defineExpose({ pickerRef });
</script>

<style scoped>
.date-field {
  width: 100%;
}
</style>
