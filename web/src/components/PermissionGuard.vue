<template>
  <slot v-if="allowed" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../stores/auth';

/** 按钮级权限守卫：具备指定权限码（任一）时渲染默认插槽 */
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
