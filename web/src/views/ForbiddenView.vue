<template>
  <div class="page forbidden-page">
    <el-result icon="warning" title="403" sub-title="当前账号无权访问该页面">
      <template #extra>
        <el-button type="primary" @click="goBack">返回平台总览</el-button>
        <el-button @click="goOrders">去订单中心</el-button>
      </template>
    </el-result>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function goBack(): void {
  void router.push('/dashboard');
}

function goOrders(): void {
  void router.push('/orders');
}
</script>

<style scoped>
.forbidden-page {
  display: flex;
  justify-content: center;
  padding-top: 80px;
}
</style>
