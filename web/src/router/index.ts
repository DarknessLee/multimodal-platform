import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';

/** 路由权限：meta.permission / meta.permissions（任一满足即可） */
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('../views/DashboardView.vue'),
        meta: { title: '平台总览', permission: 'menu:dashboard' },
      },
      {
        path: 'orders',
        name: 'orders',
        component: () => import('../views/OrdersView.vue'),
        meta: { title: '订单中心', permission: 'menu:orders' },
      },
      {
        path: 'orders/new',
        name: 'order-new',
        component: () => import('../views/OrderNewView.vue'),
        meta: { title: '新建订单', permission: 'order:create' },
      },
      {
        path: 'orders/:id',
        name: 'order-detail',
        component: () => import('../views/OrderDetailView.vue'),
        meta: { title: '订单详情', permission: 'menu:orders' },
      },
      {
        path: 'orders/:id/dispatch',
        name: 'order-dispatch',
        component: () => import('../views/DispatchView.vue'),
        meta: { title: '人工调度', permission: 'menu:dispatch' },
      },
      {
        path: 'dispatch/plans',
        name: 'dispatch-plans',
        component: () => import('../views/DispatchCenterView.vue'),
        meta: { title: '智能调度中心', permission: 'menu:dispatch' },
      },
      {
        path: 'dispatch/board',
        name: 'dispatch-board',
        component: () => import('../views/DispatchBoardView.vue'),
        meta: { title: '调度看板', permission: 'menu:dispatch' },
      },
      {
        path: 'capacity',
        name: 'capacity',
        component: () => import('../views/CapacityView.vue'),
        meta: { title: '运力池', permission: 'menu:capacity' },
      },
      {
        path: 'monitor',
        name: 'monitor',
        component: () => import('../views/MonitorView.vue'),
        meta: { title: '监控大屏', permission: 'menu:monitor' },
      },
      {
        path: 'alerts',
        name: 'alerts',
        component: () => import('../views/AlertsView.vue'),
        meta: { title: '预警中心', permission: 'menu:alerts' },
      },
      {
        path: 'quotes',
        name: 'quotes',
        component: () => import('../views/QuotesView.vue'),
        meta: { title: '报价工作台', permission: 'menu:quotes' },
      },
      {
        path: 'quotes/:id',
        name: 'quote-detail',
        component: () => import('../views/QuoteDetailView.vue'),
        meta: { title: '报价详情', permission: 'menu:quotes' },
      },
      {
        path: 'contracts',
        name: 'contracts',
        component: () => import('../views/ContractsView.vue'),
        meta: { title: '合同管理', permission: 'menu:contracts' },
      },
      {
        path: 'contracts/:id',
        name: 'contract-detail',
        component: () => import('../views/ContractDetailView.vue'),
        meta: { title: '合同详情', permission: 'menu:contracts' },
      },
      {
        path: 'master/customers',
        name: 'customers',
        component: () => import('../views/CustomersView.vue'),
        meta: { title: '客户管理', permission: 'menu:customers' },
      },
      {
        path: 'master/partners',
        name: 'partners',
        component: () => import('../views/PartnersView.vue'),
        meta: { title: '伙伴管理', permission: 'menu:partners' },
      },
      {
        path: 'master/data',
        name: 'master-data',
        component: () => import('../views/MasterDataView.vue'),
        meta: { title: '主数据', permission: 'menu:master' },
      },
      {
        path: 'integration/messages',
        name: 'integration-messages',
        component: () => import('../views/IntegrationMessagesView.vue'),
        meta: { title: '集成中心', permission: 'menu:integration' },
      },
      {
        path: 'audit/logs',
        name: 'audit-logs',
        component: () => import('../views/AuditLogsView.vue'),
        meta: { title: '审计日志', permission: 'menu:audit' },
      },
      {
        path: 'tasks',
        name: 'tasks',
        component: () => import('../views/TasksView.vue'),
        meta: { title: '运输任务', permission: 'menu:tasks' },
      },
      {
        path: 'terminal',
        name: 'terminal',
        component: () => import('../views/TerminalView.vue'),
        meta: { title: '港站作业', permission: 'menu:terminal' },
      },
      {
        path: 'waybills',
        name: 'waybills',
        component: () => import('../views/WaybillCenterView.vue'),
        meta: { title: '运单中心', permission: 'menu:waybills' },
      },
      {
        path: 'waybills/:id/track',
        name: 'waybill-track',
        component: () => import('../views/TrackingView.vue'),
        meta: { title: '运单跟踪', permission: 'menu:track' },
      },
      {
        path: 'waybills/:id',
        name: 'waybill-detail',
        component: () => import('../views/WaybillDetailView.vue'),
        meta: { title: '一单制运单', permission: 'menu:waybills' },
      },
      {
        path: 'documents',
        name: 'documents',
        component: () => import('../views/DocumentsView.vue'),
        meta: { title: '单证中心', permission: 'menu:documents' },
      },
      {
        path: 'containers',
        name: 'containers',
        component: () => import('../views/ContainersView.vue'),
        meta: { title: '箱管中心', permission: 'menu:containers' },
      },
      {
        path: 'containers/:id',
        name: 'container-detail',
        component: () => import('../views/ContainerDetailView.vue'),
        meta: { title: '集装箱详情', permission: 'menu:containers' },
      },
      {
        path: 'rail/tasks',
        name: 'rail-tasks',
        component: () => import('../views/RailTasksView.vue'),
        meta: { title: '铁路工作台', permission: 'menu:rail' },
      },
      {
        path: 'sea/tasks',
        name: 'sea-tasks',
        component: () => import('../views/SeaTasksView.vue'),
        meta: { title: '水路工作台', permission: 'menu:sea' },
      },
      {
        path: 'settlement',
        name: 'settlement',
        component: () => import('../views/SettlementView.vue'),
        meta: { title: '结算工作台', permission: 'menu:settlement' },
      },
      {
        path: 'bills/:id',
        name: 'bill-detail',
        component: () => import('../views/BillView.vue'),
        meta: { title: '分段账单', permissions: ['menu:bills', 'menu:settlement'] },
      },
      {
        path: '403',
        name: 'forbidden',
        component: () => import('../views/ForbiddenView.vue'),
        meta: { title: '无权访问' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../views/NotFoundView.vue'),
    meta: { public: true, title: '页面不存在' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (to.meta.public) {
    if (to.name === 'login' && auth.isLoggedIn) {
      return { path: '/dashboard' };
    }
    return true;
  }

  if (!auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  // 权限集为空（旧会话 / 后端 v0）时尝试刷新一次
  if (auth.permissions.length === 0) {
    await auth.refreshPermissions();
  }

  const required = (to.meta.permissions as string[] | undefined)
    ?? (to.meta.permission ? [to.meta.permission as string] : []);
  if (required.length > 0 && !auth.hasPermission(required)) {
    if (to.name !== 'forbidden') {
      ElMessage.warning('当前账号无权访问该页面');
      return { path: '/403' };
    }
    return true;
  }

  return true;
});

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : '';
  document.title = title ? `${title} · 多式联运供应链平台` : '多式联运供应链平台';
});

export default router;
