import express from 'express';
import cors from 'cors';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './routes/auth';
import { billsRouter } from './routes/bills';
import { ordersRouter } from './routes/orders';
import { segmentsRouter } from './routes/segments';
import { waybillsRouter } from './routes/waybills';

/** 组装 Express 应用：统一 /api 前缀 + JSON 响应 + 全局错误处理 */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // 根路径仅作健康文本，不属于业务接口
  app.get('/', (_req, res) => {
    res.type('text/plain; charset=utf-8').send('多式联运演示版 v0 API 运行中（/api）');
  });

  app.use('/api/auth', authRouter);
  app.use('/api/orders', requireAuth, ordersRouter);
  app.use('/api/segments', requireAuth, segmentsRouter);
  app.use('/api/waybills', requireAuth, waybillsRouter);
  app.use('/api/bills', requireAuth, billsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
