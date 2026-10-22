<template>
  <span v-if="allowed" data-testid="permission-guard" class="permission-guard">
    <slot />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../stores/auth';

/**
 * 按钮级权限守卫：具备指定权限码（任一）时渲染默认插槽。
 * 渲染包裹节点带 data-testid="permission-guard"（docs/08 §8 通用 testid），
 * 多个守卫时会出现多个节点，E2E 可按作用域使用。
 */
const props = withDefaults(
  defineProps<{
    permission?: string | string[];
    fallback?: boolean;
  }>(),
  {
    permission: '',
    fallback: false,
  },
);

const auth = useAuthStore();
const allowed = computed(() => {
  if (!props.permission || (Array.isArray(props.permission) && props.permission.length === 0)) {
    return true;
  }
  return auth.hasPermission(props.permission) || props.fallback;
});
</script>

<style scoped>
.permission-guard {
  display: contents;
}
</style>
