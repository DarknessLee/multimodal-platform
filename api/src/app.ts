import express from 'express';
import cors from 'cors';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './routes/auth';
import { billsRouter } from './routes/bills';
import { ordersRouter } from './routes/orders';
import { segmentsRouter } from './routes/segments';
import { waybillsRouter } from './routes/waybills';
import { auditRouter } from './modules/audit/router';
import { contractsRouter } from './modules/contract/router';
import { dashboardRouter } from './modules/dashboard/router';
import { integrationRouter } from './modules/integration/router';
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
import { notificationsRouter } from './modules/notification/router';
import { quotesRouter } from './modules/quote/router';

/** 组装 Express 应用：统一 /api 前缀 + JSON 响应 + 全局错误处理 */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // 根路径仅作健康文本，不属于业务接口
  app.get('/', (_req, res) => {
    res.type('text/plain; charset=utf-8').send('多式联运平台 API 运行中（Stage 1 /api）');
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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
