<template>
  <el-container class="layout">
    <el-aside width="224px" class="layout-aside">
      <div class="brand">
        <div class="brand-logo">联</div>
        <div class="brand-text">
          <div class="brand-name">多式联运演示版</div>
          <div class="brand-version">v0 · 多角色协同</div>
        </div>
      </div>

      <el-menu :default-active="activeMenu" router class="layout-menu">
        <el-menu-item
          v-for="item in menuItems"
          :key="item.path"
          :index="item.path"
          :data-testid="item.testid"
        >
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>

      <div class="aside-footer">
        <div class="aside-footer__line">公路 · 海运 · 铁路</div>
        <div class="aside-footer__line subtle">mock 全程轨迹演示</div>
      </div>
    </el-aside>

    <el-container class="layout-body">
      <el-header class="layout-header" height="60px">
        <div class="header-page-title">{{ pageTitle }}</div>
        <div class="header-right">
          <el-tag data-testid="role-badge" type="primary" effect="dark" round size="large">
            {{ auth.roleLabel || '未登录' }}
          </el-tag>
          <span class="header-user">{{ auth.displayName }}</span>
          <span class="header-username mono">{{ auth.user?.username }}</span>
          <el-button data-testid="logout-btn" size="small" @click="handleLogout">退出登录</el-button>
        </div>
      </el-header>

      <el-main class="layout-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';

interface MenuItem {
  path: string;
  label: string;
  testid: string;
}

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const menuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [{ path: '/orders', label: '订单列表', testid: 'nav-orders' }];
  if (auth.role === 'CARRIER') {
    items.push({ path: '/tasks', label: '我的运输任务', testid: 'nav-tasks' });
  }
  if (auth.role === 'TERMINAL') {
    items.push({ path: '/terminal', label: '港站作业', testid: 'nav-terminal' });
  }
  if (auth.role === 'SETTLEMENT') {
    items.push({ path: '/settlement', label: '结算工作台', testid: 'nav-settlement' });
  }
  return items;
});

const pageTitle = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : '多式联运'));

const activeMenu = computed<string>(() => {
  const path = route.path;
  if (path.startsWith('/orders')) return '/orders';
  if (path.startsWith('/waybills') || path.startsWith('/bills')) return '/orders';
  return path;
});

function handleLogout(): void {
  auth.logout();
  ElMessage.success('已退出登录');
  void router.replace('/login');
}
</script>

<style scoped>
.layout {
  height: 100vh;
  overflow: hidden;
}

.layout-aside {
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-right: 1px solid var(--app-border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px;
  border-bottom: 1px solid var(--app-border);
}

.brand-logo {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, #409eff, #36cfc9);
  color: #ffffff;
  font-size: 20px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.brand-version {
  margin-top: 2px;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.layout-menu {
  border-right: none;
  padding: 12px 8px;
  flex: 1;
}

.layout-menu :deep(.el-menu-item) {
  height: 44px;
  line-height: 44px;
  border-radius: 8px;
  margin-bottom: 4px;
  font-size: 14px;
}

.layout-menu :deep(.el-menu-item.is-active) {
  background: #ecf5ff;
  font-weight: 600;
}

.aside-footer {
  padding: 14px 16px;
  border-top: 1px solid var(--app-border);
  font-size: 12px;
  color: var(--app-text-secondary);
  line-height: 1.8;
}

.aside-footer__line.subtle {
  color: #c0c4cc;
}

.layout-body {
  min-width: 0;
}

.layout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  border-bottom: 1px solid var(--app-border);
  padding: 0 24px;
}

.header-page-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-user {
  font-size: 13px;
  color: var(--app-text-regular);
}

.header-username {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.layout-main {
  background: var(--app-bg);
  padding: 0;
  overflow-y: auto;
}
</style>
