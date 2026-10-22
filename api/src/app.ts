import express from 'express';
import cors from 'cors';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './routes/auth';
import { billsRouter } from './routes/bills';
import { ordersRouter } from './routes/orders';
import { segmentsRouter } from './routes/segments';
import { waybillsRouter } from './routes/waybills';
import { alertsRouter, exceptionsRouter } from './modules/alerts/router';
import { analyticsRouter, financeRouter } from './modules/analytics/router';
import { auditRouter } from './modules/audit/router';
import { capacityRouter } from './modules/capacity/router';
import { containersRouter, depotsRouter } from './modules/containers/router';
import { contractsRouter } from './modules/contract/router';
import { dashboardRouter } from './modules/dashboard/router';
import { dispatchRouter } from './modules/dispatch/router';
import { documentsRouter } from './modules/documents/router';
import { factoringRouter } from './modules/factoring/router';
import { insuranceRouter } from './modules/insurance/router';
import { integrationRouter } from './modules/integration/router';
import { geoFencesRouter, iotRouter } from './modules/iot/router';
import { invoicesRouter } from './modules/invoice/router';
import {
  containerTypesRouter,
  customersRouter,
  dictsRouter,
  goodsRouter,
  partnersRouter,
  portsRouter,
  priceRulesRouter,
  routesRouter,
} from './modules/master/router';
import { monitorRouter } from './modules/monitor/router';
import { notificationsRouter } from './modules/notification/router';
import { notarizeRouter } from './modules/notarize/router';
import { paymentsRouter } from './modules/payment/router';
import { quotesRouter } from './modules/quote/router';
import { railRouter } from './modules/rail/router';
import { reconciliationsRouter } from './modules/reconciliation/router';
import { seaRouter } from './modules/sea/router';

/** 组装 Express 应用：统一 /api 前缀 + JSON 响应 + 全局错误处理 */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  // base64 单证上传（≤5MB）需要较大 JSON body
  app.use(express.json({ limit: '8mb' }));

  // 根路径仅作健康文本，不属于业务接口
  app.get('/', (_req, res) => {
    res.type('text/plain; charset=utf-8').send('多式联运平台 API 运行中（Stage 3 /api）');
  });

  // v0 接口（保持兼容）
  app.use('/api/auth', authRouter);
  app.use('/api/orders', requireAuth, ordersRouter);
  app.use('/api/segments', requireAuth, segmentsRouter);
  app.use('/api/waybills', requireAuth, waybillsRouter);
  app.use('/api/bills', requireAuth, billsRouter);

  // Stage 1 平台模块
  app.use('/api/customers', requireAuth, customersRouter);
  app.use('/api/partners', requireAuth, partnersRouter);
  app.use('/api/ports', requireAuth, portsRouter);
  app.use('/api/routes', requireAuth, routesRouter);
  app.use('/api/goods', requireAuth, goodsRouter);
  app.use('/api/container-types', requireAuth, containerTypesRouter);
  app.use('/api/price-rules', requireAuth, priceRulesRouter);
  app.use('/api/dicts', requireAuth, dictsRouter);
  app.use('/api/quotes', requireAuth, quotesRouter);
  app.use('/api/contracts', requireAuth, contractsRouter);
  app.use('/api/dashboard', requireAuth, dashboardRouter);
  app.use('/api/integration', requireAuth, integrationRouter);
  app.use('/api/audit', requireAuth, auditRouter);
  app.use('/api/notifications', requireAuth, notificationsRouter);

  // Stage 2 模块
  app.use('/api/documents', requireAuth, documentsRouter);
  app.use('/api/containers', requireAuth, containersRouter);
  app.use('/api/depots', requireAuth, depotsRouter);
  app.use('/api/notarize', requireAuth, notarizeRouter);
  app.use('/api/rail', requireAuth, railRouter);
  app.use('/api/sea', requireAuth, seaRouter);

  // Stage 3 模块：智能调度 / 运力池 / 看板 / 大屏 / 预警 / IoT
  app.use('/api/dispatch', requireAuth, dispatchRouter);
  app.use('/api/capacity', requireAuth, capacityRouter);
  app.use('/api/monitor', requireAuth, monitorRouter);
  app.use('/api/alerts', requireAuth, alertsRouter);
  app.use('/api/exceptions', requireAuth, exceptionsRouter);
  app.use('/api/iot', requireAuth, iotRouter);
  app.use('/api/geo-fences', requireAuth, geoFencesRouter);

  // Stage 4 模块：对账 / 发票 / 支付 / 保理 / 保险 / 经营分析 / 财务看板
  app.use('/api/reconciliations', requireAuth, reconciliationsRouter);
  app.use('/api/invoices', requireAuth, invoicesRouter);
  app.use('/api/payments', requireAuth, paymentsRouter);
  app.use('/api/factoring', requireAuth, factoringRouter);
  app.use('/api/insurance', requireAuth, insuranceRouter);
  app.use('/api/analytics', requireAuth, analyticsRouter);
  app.use('/api/finance', requireAuth, financeRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
