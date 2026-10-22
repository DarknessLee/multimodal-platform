<template>
  <el-container class="layout">
    <el-aside width="228px" class="layout-aside">
      <div class="brand">
        <div class="brand-logo">联</div>
        <div class="brand-text">
          <div class="brand-name">多式联运平台</div>
          <div class="brand-version">Stage 5 · 集成/监管/运营与验收</div>
        </div>
      </div>

      <el-scrollbar class="menu-scroll">
        <el-menu :default-active="activeMenu" router class="layout-menu">
          <el-menu-item-group v-for="group in menuGroups" :key="group.name" :title="group.name">
            <el-menu-item
              v-for="item in group.items"
              :key="item.path"
              :index="item.path"
              :data-testid="item.testid"
            >
              <span>{{ item.label }}</span>
            </el-menu-item>
          </el-menu-item-group>
        </el-menu>
      </el-scrollbar>

      <div class="aside-footer">
        <div class="aside-footer__line">公路 · 海运 · 铁路</div>
        <div class="aside-footer__line subtle">Mock 全链路演示</div>
      </div>
    </el-aside>

    <el-container class="layout-body">
      <el-header class="layout-header" height="60px">
        <div class="header-page-title">{{ pageTitle }}</div>
        <div class="header-right">
          <el-tooltip content="站内消息 / 待办" placement="bottom">
            <el-badge :value="unreadCount" :hidden="unreadCount === 0" :max="99" class="notice-badge">
              <el-button
                class="notice-btn"
                data-testid="notification-bell"
                :icon="Bell"
                circle
                @click="openNotifications"
              />
            </el-badge>
          </el-tooltip>
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

    <!-- 通知抽屉 -->
    <el-drawer v-model="notificationVisible" title="站内消息 / 待办" size="440px">
      <div class="notice-toolbar">
        <span class="muted">未读 {{ unreadCount }} 条</span>
        <el-button size="small" :loading="notificationLoading" @click="loadNotifications">刷新</el-button>
      </div>
      <el-empty v-if="!notificationLoading && notifications.length === 0" description="暂无消息" :image-size="70" />
      <div v-else class="notice-list">
        <div
          v-for="item in notifications"
          :key="item.id"
          class="notice-item"
          :class="{ 'notice-item--unread': !isRead(item) }"
          @click="markRead(item)"
        >
          <div class="notice-item__head">
            <el-tag size="small" :type="notificationTagType(item.type)" effect="light">
              {{ item.typeLabel || notificationTypeLabel(item.type) }}
            </el-tag>
            <span class="notice-item__time">{{ formatDateTime(item.createdAt) }}</span>
          </div>
          <div class="notice-item__title">{{ item.title }}</div>
          <div class="notice-item__content">{{ item.content }}</div>
        </div>
      </div>
    </el-drawer>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Bell } from '@element-plus/icons-vue';
import { fetchNotifications, readNotification } from '../api/notification';
import { useAuthStore } from '../stores/auth';
import { MENU_DEFS, notificationTypeLabel, type MenuDef } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { NotificationItem } from '../types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const notificationVisible = ref(false);
const notificationLoading = ref(false);
const notifications = ref<NotificationItem[]>([]);
let pollTimer: number | undefined;

const MENU_GROUP_ORDER = ['业务受理', '主数据', '履约执行', '监控预警', '财务结算', '平台治理'];

const visibleMenus = computed<MenuDef[]>(() =>
  MENU_DEFS.filter((item) => auth.hasPermission(item.code)),
);

const menuGroups = computed(() => {
  return MENU_GROUP_ORDER.map((name) => ({
    name,
    items: visibleMenus.value.filter((item) => item.group === name),
  })).filter((group) => group.items.length > 0);
});

const unreadCount = computed(() => notifications.value.filter((item) => !isRead(item)).length);

const pageTitle = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : '多式联运平台'));

const activeMenu = computed<string>(() => {
  const fullPath = route.fullPath;
  if (MENU_DEFS.some((item) => item.path === fullPath)) return fullPath;
  const path = route.path;
  if (path.startsWith('/orders')) {
    const view = route.query.view;
    if (view === 'dispatch') return '/orders?view=dispatch';
    if (view === 'track') return '/orders?view=track';
    if (view === 'bills') return '/orders?view=bills';
    return '/orders';
  }
  if (path.startsWith('/dispatch')) {
    if (path.startsWith('/dispatch/board')) return '/dispatch/board';
    return '/dispatch/plans';
  }
  if (path.startsWith('/capacity')) return '/capacity';
  if (path.startsWith('/monitor')) return '/monitor';
  if (path.startsWith('/alerts')) return '/alerts';
  if (path.startsWith('/finance/reconciliations')) return '/finance/reconciliations';
  if (path.startsWith('/finance/invoices')) return '/finance/invoices';
  if (path.startsWith('/finance/payments')) return '/finance/payments';
  if (path.startsWith('/finance/factoring')) return '/finance/factoring';
  if (path.startsWith('/finance/analytics')) return '/finance/analytics';
  if (path.startsWith('/insurance')) return '/insurance';
  if (path.startsWith('/regulator/reports') || path.startsWith('/regulator/compliance')) return '/regulator';
  if (path.startsWith('/regulator')) return '/regulator';
  if (path.startsWith('/ops')) return '/ops';
  if (path.startsWith('/acceptance')) return '/acceptance';
  if (path.startsWith('/quotes')) return '/quotes';
  if (path.startsWith('/contracts')) return '/contracts';
  if (path.startsWith('/master/customers')) return '/master/customers';
  if (path.startsWith('/master/partners')) return '/master/partners';
  if (path.startsWith('/master/data')) return '/master/data';
  if (path.startsWith('/integration')) return '/integration/messages';
  if (path.startsWith('/audit')) return '/audit/logs';
  if (path.startsWith('/waybills')) {
    return path.endsWith('/track') ? '/orders?view=track' : '/waybills';
  }
  if (path.startsWith('/documents')) return '/documents';
  if (path.startsWith('/containers')) return '/containers';
  if (path.startsWith('/rail')) return '/rail/tasks';
  if (path.startsWith('/sea')) return '/sea/tasks';
  if (path.startsWith('/bills')) return '/orders?view=bills';
  return path;
});

function isRead(item: NotificationItem): boolean {
  return item.readFlag === true || item.readFlag === 1;
}

function notificationTagType(type: string): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  if (type === 'TODO') return 'warning';
  if (type === 'ALERT') return 'danger';
  return 'primary';
}

async function loadNotifications(): Promise<void> {
  notificationLoading.value = true;
  try {
    notifications.value = await fetchNotifications({ unread: 0 });
  } catch {
    notifications.value = [];
  } finally {
    notificationLoading.value = false;
  }
}

function openNotifications(): void {
  notificationVisible.value = true;
  void loadNotifications();
}

async function markRead(item: NotificationItem): Promise<void> {
  if (isRead(item)) return;
  try {
    await readNotification(item.id);
    item.readFlag = true;
  } catch {
    // 错误提示由 http 拦截器统一处理
  }
}

function handleLogout(): void {
  auth.logout();
  ElMessage.success('已退出登录');
  void router.replace('/login');
}

onMounted(() => {
  void loadNotifications();
  pollTimer = window.setInterval(() => {
    if (!notificationVisible.value) void loadNotifications();
  }, 60000);
});

onBeforeUnmount(() => {
  if (pollTimer) window.clearInterval(pollTimer);
});
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
  padding: 16px;
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
  flex-shrink: 0;
}

.brand-name {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.brand-version {
  margin-top: 2px;
  font-size: 11px;
  color: var(--app-text-secondary);
}

.menu-scroll {
  flex: 1;
  min-height: 0;
}

.layout-menu {
  border-right: none;
  padding: 8px;
}

.layout-menu :deep(.el-menu-item-group__title) {
  font-size: 11px;
  color: #b1b6c1;
  padding: 8px 12px 4px;
}

.layout-menu :deep(.el-menu-item) {
  height: 40px;
  line-height: 40px;
  border-radius: 8px;
  margin-bottom: 2px;
  font-size: 13.5px;
}

.layout-menu :deep(.el-menu-item.is-active) {
  background: #ecf5ff;
  font-weight: 600;
}

.aside-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--app-border);
  font-size: 11px;
  color: var(--app-text-secondary);
  line-height: 1.7;
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

.notice-badge {
  display: inline-flex;
}

.notice-btn {
  color: #606266;
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

.notice-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.notice-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notice-item {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.notice-item:hover {
  border-color: #c6e2ff;
  background: #fafcff;
}

.notice-item--unread {
  background: #f7fbff;
  border-color: #d9ecff;
}

.notice-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.notice-item__time {
  font-size: 11px;
  color: var(--app-text-secondary);
}

.notice-item__title {
  margin: 8px 0 4px;
  font-size: 13.5px;
  font-weight: 600;
}

.notice-item__content {
  font-size: 12.5px;
  color: var(--app-text-regular);
  line-height: 1.6;
}

:deep(.el-menu-item-group:first-child .el-menu-item-group__title) {
  padding-top: 2px;
}
</style>
