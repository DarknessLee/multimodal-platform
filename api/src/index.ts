import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/pool';

async function bootstrap(): Promise<void> {
  try {
    await pool.query('SELECT 1');
    console.log(`[api] 数据库连接正常：${env.dbUser}@${env.dbHost}:${env.dbPort}/${env.dbName}`);
  } catch (error) {
    console.error('[api] 数据库连接失败：', (error as Error).message);
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[api] 多式联运演示版 API 已启动：http://127.0.0.1:${env.port}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`[api] 收到 ${signal}，正在关闭服务...`);
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void bootstrap();
