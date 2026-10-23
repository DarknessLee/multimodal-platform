// v1 初始化：重建 26 张表 → 种子数据（主数据 + 业务数据）
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { seedReference } from './seed/reference.mjs';
import { seedBusiness } from './seed/business.mjs';
import { seedStage2 } from './seed/stage2.mjs';
import { seedStage3 } from './seed/stage3.mjs';
import { seedStage4 } from './seed/stage4.mjs';
import { seedStage5 } from './seed/stage5.mjs';
import { isValidContainerNo, isValidCreditCode } from './seed/lib.mjs';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: resolve(apiRoot, '.env') });

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    multipleStatements: true,
    dateStrings: true,
  });

  console.log(`[db] 连接 ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

  const schemaSql = readFileSync(resolve(apiRoot, 'db/schema.sql'), 'utf8');
  await conn.query(schemaSql);
  console.log('[db] v1 schema 已重建（59 张表）');

  const ref = await seedReference(conn);
  console.log(`[db] 主数据：客户 ${ref.customers.length}、伙伴 ${ref.partners.length}、港站 ${ref.nodes.length}、线路 ${ref.routes.length}、货物 ${ref.goods.length}、箱型 ${ref.containerTypes.length}、价格规则 ${ref.priceRules.length}、账号 ${ref.users.length}、合同 ${ref.contracts.length}`);

  await seedBusiness(conn, ref);
  await seedStage2(conn, ref);
  await seedStage3(conn, ref);
  await seedStage4(conn, ref);
  await seedStage5(conn, ref);

  // 软著/演示数据质量校验：ISO 6346 箱号、GB 32100 统一社会信用代码
  const [containerRows] = await conn.query('SELECT container_no FROM container');
  const badContainers = containerRows.filter((row) => !isValidContainerNo(String(row.container_no)));
  if (badContainers.length > 0) {
    throw new Error(`存在 ${badContainers.length} 个非法 ISO 6346 箱号：${badContainers.slice(0, 5).map((row) => row.container_no).join(',')}`);
  }
  const [invoiceRows] = await conn.query('SELECT invoice_no, buyer_tax_no, seller_tax_no FROM invoice');
  const badInvoices = invoiceRows.filter((row) => !isValidCreditCode(row.buyer_tax_no) || !isValidCreditCode(row.seller_tax_no));
  if (badInvoices.length > 0) {
    throw new Error(`存在 ${badInvoices.length} 张发票税号不符合 GB 32100：${badInvoices.slice(0, 5).map((row) => row.invoice_no).join(',')}`);
  }
  console.log(`[db] 数据质量校验：箱号 ${containerRows.length} 个全部符合 ISO 6346；发票 ${invoiceRows.length} 张税号全部符合 GB 32100`);

  const [counts] = await conn.query(
    `SELECT
      (SELECT COUNT(*) FROM user) users,
      (SELECT COUNT(*) FROM customer) customers,
      (SELECT COUNT(*) FROM partner) partners,
      (SELECT COUNT(*) FROM port_station) nodes,
      (SELECT COUNT(*) FROM route_template) routes,
      (SELECT COUNT(*) FROM price_rule) price_rules,
      (SELECT COUNT(*) FROM contract) contracts,
      (SELECT COUNT(*) FROM quote) quotes,
      (SELECT COUNT(*) FROM orders) orders,
      (SELECT COUNT(*) FROM order_cargo) order_cargo,
      (SELECT COUNT(*) FROM waybill) waybills,
      (SELECT COUNT(*) FROM waybill_segment) segments,
      (SELECT COUNT(*) FROM track_point) tracks,
      (SELECT COUNT(*) FROM bill) bills,
      (SELECT COUNT(*) FROM integration_message) integration_messages,
      (SELECT COUNT(*) FROM audit_log) audit_logs,
      (SELECT COUNT(*) FROM notification) notifications,
      (SELECT COUNT(*) FROM document) documents,
      (SELECT COUNT(*) FROM waybill_event) waybill_events,
      (SELECT COUNT(*) FROM notarize_record) notarize_records,
      (SELECT COUNT(*) FROM container_movement) container_movements,
      (SELECT COUNT(*) FROM depot_storage) depot_storage,
      (SELECT COUNT(*) FROM e_seal) e_seals,
      (SELECT COUNT(*) FROM vehicle) vehicles,
      (SELECT COUNT(*) FROM train_schedule) trains,
      (SELECT COUNT(*) FROM vessel_schedule) vessels,
      (SELECT COUNT(*) FROM dispatch_plan) dispatch_plans,
      (SELECT COUNT(*) FROM alert) alerts,
      (SELECT COUNT(*) FROM exception_ticket) exception_tickets,
      (SELECT COUNT(*) FROM iot_device) iot_devices,
      (SELECT COUNT(*) FROM iot_reading) iot_readings,
      (SELECT COUNT(*) FROM geo_fence) geo_fences,
      (SELECT COUNT(*) FROM bill_item) bill_items,
      (SELECT COUNT(*) FROM reconciliation) reconciliations,
      (SELECT COUNT(*) FROM invoice) invoices,
      (SELECT COUNT(*) FROM payment) payments,
      (SELECT COUNT(*) FROM factoring_application) factoring,
      (SELECT COUNT(*) FROM insurance_policy) policies,
      (SELECT COUNT(*) FROM stat_daily) stat_daily,
      (SELECT COUNT(*) FROM integration_adapter) adapters,
      (SELECT COUNT(*) FROM regulator_report) regulator_reports,
      (SELECT COUNT(*) FROM compliance_check) compliance_checks,
      (SELECT COUNT(*) FROM ops_config) ops_configs,
      (SELECT COUNT(*) FROM ops_dict) ops_dicts,
      (SELECT COUNT(*) FROM job_log) job_logs`,
  );
  console.log('[db] 数据写入完成：', JSON.stringify(counts[0]));
  await conn.end();
  console.log('[db] ✅ 初始化完成');
}

main().catch((err) => {
  console.error('[db] ❌ 初始化失败：', err.stack || err.message);
  process.exit(1);
});
