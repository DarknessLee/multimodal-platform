import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';

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
    redirect: '/orders',
    children: [
      {
        path: 'orders',
        name: 'orders',
        component: () => import('../views/OrdersView.vue'),
        meta: { title: '订单列表' },
      },
      {
        path: 'orders/new',
        name: 'order-new',
        component: () => import('../views/OrderNewView.vue'),
        meta: { title: '新建订单', roles: ['SHIPPER'] },
      },
      {
        path: 'orders/:id',
        name: 'order-detail',
        component: () => import('../views/OrderDetailView.vue'),
        meta: { title: '订单详情' },
      },
      {
        path: 'orders/:id/dispatch',
        name: 'order-dispatch',
        component: () => import('../views/DispatchView.vue'),
        meta: { title: '人工调度', roles: ['MTO'] },
      },
      {
        path: 'tasks',
        name: 'tasks',
        component: () => import('../views/TasksView.vue'),
        meta: { title: '我的运输任务', roles: ['CARRIER'] },
      },
      {
        path: 'terminal',
        name: 'terminal',
        component: () => import('../views/TerminalView.vue'),
        meta: { title: '港站作业', roles: ['TERMINAL'] },
      },
      {
        path: 'waybills/:id',
        name: 'waybill-track',
        component: () => import('../views/TrackingView.vue'),
        meta: { title: '运单跟踪' },
      },
      {
        path: 'settlement',
        name: 'settlement',
        component: () => import('../views/SettlementView.vue'),
        meta: { title: '结算工作台', roles: ['SETTLEMENT'] },
      },
      {
        path: 'bills/:id',
        name: 'bill-detail',
        component: () => import('../views/BillView.vue'),
        meta: { title: '分段账单' },
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

router.beforeEach((to) => {
  const auth = useAuthStore();
  const isPublic = Boolean(to.meta.public);

  if (isPublic) {
    if (to.name === 'login' && auth.isLoggedIn) {
      return { path: '/orders' };
    }
    return true;
  }

  if (!auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  const roles = to.meta.roles as string[] | undefined;
  if (roles && roles.length > 0 && !roles.includes(auth.role)) {
    ElMessage.warning('当前角色无权访问该页面');
    return { path: '/orders' };
  }

  return true;
});

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : '';
  document.title = title ? `${title} · 多式联运演示版 v0` : '多式联运演示版 v0';
});

export default router;
