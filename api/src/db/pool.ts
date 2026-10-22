import mysql from 'mysql2/promise';
import type { PoolConnection } from 'mysql2/promise';
import { env } from '../config/env';

/** mysql2 连接池：dateStrings 保证时间原样输出，decimalNumbers 让 DECIMAL 以 number 返回 */
export const pool = mysql.createPool({
  host: env.dbHost,
  port: env.dbPort,
  user: env.dbUser,
  password: env.dbPassword,
  database: env.dbName,
  charset: 'utf8mb4',
  dateStrings: true,
  decimalNumbers: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export interface ExecResult {
  insertId: number;
  affectedRows: number;
  changedRows: number;
}

// ---------------------------------------------------------------------------
// 非事务查询（池级）
// ---------------------------------------------------------------------------

export async function queryRows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

export async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await queryRows<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// ---------------------------------------------------------------------------
// 事务封装
// ---------------------------------------------------------------------------

export async function withTransaction<T>(work: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // 回滚失败时不掩盖原始错误
    }
    throw error;
  } finally {
    conn.release();
  }
}

export async function txQueryRows<T>(conn: PoolConnection, sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await conn.query(sql, params);
  return rows as T[];
}

export async function txQueryOne<T>(conn: PoolConnection, sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await txQueryRows<T>(conn, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function txExec(conn: PoolConnection, sql: string, params: unknown[] = []): Promise<ExecResult> {
  const [result] = await conn.execute(sql, params as any[]);
  return result as unknown as ExecResult;
}

/** 事务内查询（别名，便于服务层按 txQuery 调用） */
export const txQuery = txQueryRows;
