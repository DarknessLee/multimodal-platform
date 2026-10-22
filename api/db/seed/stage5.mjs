// Stage 5 业务种子：集成适配器 / 报文扩展 / 监管报送 / 合规检查 / 运营配置字典 / 任务日志
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pad = (n, width = 2) => String(n).padStart(width, '0');
function fmt(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function ymd(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}
function at(base, hours) {
  return fmt(new Date(base.getTime() + hours * 3600000));
}
async function insert(conn, sql, params) {
  const [result] = await conn.execute(sql, params);
  return result.insertId;
}

export async function seedStage5(conn, ref) {
  const now = new Date();
  const period = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

  // ── 1) 集成适配器 6 个 ──────────────────────────────────────────────
  const adapterDefs = [
    ['ADP-RAIL', '铁路 95306 适配器', 'RAIL_95306', 'https://mock.95306.cn/api', 'ONLINE', 300],
    ['ADP-PORT', '港口 EDI 适配器', 'PORT_EDI', 'https://mock.port-edi.cn/edi', 'ONLINE', 300],
    ['ADP-TAX', '税务发票适配器', 'TAX', 'https://mock.tax.gov.cn/e-invoice', 'ONLINE', 600],
    ['ADP-BANK', '银行支付适配器', 'BANK', 'https://mock.bank.cn/gateway', 'DEGRADED', 900],
    ['ADP-CA', 'CA 电子签章适配器', 'CA', 'https://mock.ca.cn/sign', 'ONLINE', 600],
    ['ADP-INS', '保险保单适配器', 'INSURANCE', 'https://mock.insurer.cn/api', 'ONLINE', 1200],
  ];
  const adapters = [];
  for (const [adapterCode, name, systemType, endpoint, status, retrySeconds] of adapterDefs) {
    const id = await insert(conn,
      `INSERT INTO integration_adapter (adapter_code, name, system_type, protocol, endpoint, status, success_rate, total_messages,
         failed_messages, last_sync_at, retry_policy, created_at)
       VALUES (?, ?, ?, 'HTTPS', ?, ?, 100.00, 0, 0, ?, ?, ?)`,
      [adapterCode, name, systemType, endpoint, status, at(now, -1), `指数退避，最大 3 次，间隔 ${retrySeconds}s`, at(now, -60)]);
    adapters.push({ id, adapterCode, systemType });
  }
  const adapterBySystem = new Map(adapters.map((a) => [a.systemType, a]));
  for (const [systemType, adapter] of adapterBySystem) {
    await conn.execute('UPDATE integration_message SET adapter_id = ? WHERE system_code = ?', [adapter.id, systemType]);
  }
  for (const adapter of adapters) {
    const [[stat]] = await conn.query(
      "SELECT COUNT(*) total, SUM(status = 'FAILED') failed, MAX(created_at) lastAt FROM integration_message WHERE adapter_id = ?", [adapter.id]);
    const total = Number(stat.total);
    const failed = Number(stat.failed ?? 0);
    const rate = total ? Math.round(((total - failed) / total) * 10000) / 100 : 100;
    await conn.execute(
      'UPDATE integration_adapter SET total_messages = ?, failed_messages = ?, success_rate = ?, last_sync_at = ? WHERE id = ?',
      [total, failed, rate, stat.lastAt ? fmt(new Date(stat.lastAt)) : at(now, -1), adapter.id]);
  }
  await conn.execute("UPDATE integration_adapter SET status = 'DEGRADED' WHERE system_type = 'BANK'");

  // ── 2) 监管报送 5 张 ────────────────────────────────────────────────
  const [orders] = await conn.query('SELECT COUNT(*) c FROM orders');
  const [waybills] = await conn.query('SELECT COUNT(*) c FROM waybill');
  const [alerts] = await conn.query('SELECT COUNT(*) c FROM alert');
  const [[finance]] = await conn.query("SELECT COALESCE(SUM(total_amount),0) revenue FROM bill WHERE bill_type = 'RECEIVABLE'");
  const reportDefs = [
    ['OPERATION_MONTHLY', 'ACCEPTED', '上海市交通委员会', '材料齐全，准予备案'],
    ['SAFETY', 'SUBMITTED', '上海市交通委员会', null],
    ['COMPLAINT', 'RETURNED', '上海市交通委员会', '投诉处理佐证材料不完整，请补充'],
    ['STATISTICS', 'DRAFT', '上海市交通委员会', null],
    ['OPERATION_MONTHLY', 'SUBMITTED', '上海市交通委员会', null],
  ];
  let reportSeq = 0;
  for (const [reportType, status, regulatorName, remark] of reportDefs) {
    reportSeq += 1;
    const content = {
      period, orderCount: Number(orders.c), waybillCount: Number(waybills.c),
      alertCount: Number(alerts.c), revenue: Number(finance.revenue),
      onTimeRate: 96.2, complaintCount: reportType === 'COMPLAINT' ? 2 : 0,
    };
    await insert(conn,
      `INSERT INTO regulator_report (report_no, report_type, period, regulator_name, content, status, submitted_at, accepted_at, remark, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`JG${ymd(now)}${String(reportSeq).padStart(3, '0')}`, reportType, period, regulatorName, JSON.stringify(content),
        status, ['SUBMITTED', 'ACCEPTED', 'RETURNED'].includes(status) ? at(now, -24 * reportSeq) : null,
        status === 'ACCEPTED' ? at(now, -24 * reportSeq + 5) : null, remark, ref.userBy.regulator01.id, at(now, -24 * reportSeq)]);
  }

  // ── 3) 合规检查 10 条 ───────────────────────────────────────────────
  const checkDefs = [
    ['CONTAINER_NO', 'CONTAINER', 'MSCU9002410', 'PASS', 'ISO 6346 校验位正确'],
    ['WAYBILL_COMPLETE', 'WAYBILL', 'WB2026102200001', 'PASS', '主运单/3 分段单/5 单证齐全'],
    ['INVOICE_MATCH', 'INVOICE', 'FP202610220001', 'PASS', '发票金额与账单一致，税额 9%'],
    ['FINANCE_BALANCE', 'BILL', 'BL202610220001', 'PASS', '应收/应付/毛利平衡'],
    ['MESSAGE_QUALITY', 'MESSAGE', 'MSG202610220001', 'WARN', '存在 2 条 FAILED 报文待重试'],
    ['CONTAINER_NO', 'CONTAINER', 'MSCU90024X0', 'FAIL', '箱号校验位错误（应为 0）'],
    ['WAYBILL_COMPLETE', 'WAYBILL', 'WB2026102200002', 'WARN', 'POD 回单待上传'],
    ['INVOICE_MATCH', 'INVOICE', 'FP202610220002', 'PASS', '发票与账单匹配'],
    ['FINANCE_BALANCE', 'BILL', 'BL202610220002', 'PASS', '金额一致'],
    ['MESSAGE_QUALITY', 'MESSAGE', 'MSG202610220002', 'PASS', '报文字段完整'],
  ];
  let checkSeq = 0;
  for (const [checkType, targetType, targetId, result, detail] of checkDefs) {
    checkSeq += 1;
    await insert(conn,
      `INSERT INTO compliance_check (check_no, check_type, target_type, target_id, result, detail, checked_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`HC${ymd(now)}${String(checkSeq).padStart(4, '0')}`, checkType, targetType, targetId, result, detail,
        at(now, -checkSeq), at(now, -checkSeq)]);
  }

  // ── 4) 运营配置 10 项 / 字典 24 项 / 任务日志 12 条 ─────────────────
  const configs = [
    ['system.name', '多式联运供应链平台 Demo', 'SYSTEM', '平台名称', 1],
    ['system.version', '1.0.0', 'SYSTEM', '平台版本（只读）', 0],
    ['dispatch.max_plans', '3', 'DISPATCH', '调度方案生成数量', 1],
    ['finance.tax_rate', '9', 'FINANCE', '增值税率（%）', 1],
    ['finance.bill_due_days', '30', 'FINANCE', '账单默认账期（天）', 1],
    ['integration.retry_max', '3', 'INTEGRATION', '报文最大重试次数', 1],
    ['integration.retry_interval_seconds', '300', 'INTEGRATION', '重试间隔（秒）', 1],
    ['alert.temp_threshold', '8.0', 'ALERT', '冷藏箱温度告警阈值（℃）', 1],
    ['alert.stay_hours', '12', 'ALERT', '车辆异常停留阈值（小时）', 1],
    ['sla.on_time_target', '95', 'SLA', '准时率目标（%）', 1],
  ];
  for (const [key, value, category, description, editable] of configs) {
    await insert(conn,
      `INSERT INTO ops_config (config_key, config_value, category, description, editable, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [key, value, category, description, editable, ref.userBy.admin01.id, at(now, -48)]);
  }
  const dictDefs = [
    ['report_type', 'OPERATION_MONTHLY', '运营月报', 1], ['report_type', 'SAFETY', '安全报告', 2],
    ['report_type', 'COMPLAINT', '投诉处理', 3], ['report_type', 'STATISTICS', '统计报表', 4],
    ['check_type', 'CONTAINER_NO', '箱号校验', 1], ['check_type', 'WAYBILL_COMPLETE', '单证完整性', 2],
    ['check_type', 'INVOICE_MATCH', '发票一致性', 3], ['check_type', 'FINANCE_BALANCE', '财务平衡', 4],
    ['check_type', 'MESSAGE_QUALITY', '报文质量', 5],
    ['adapter_status', 'ONLINE', '在线', 1], ['adapter_status', 'DEGRADED', '降级', 2], ['adapter_status', 'OFFLINE', '离线', 3],
    ['job_status', 'SUCCESS', '成功', 1], ['job_status', 'FAILED', '失败', 2], ['job_status', 'RUNNING', '运行中', 3],
    ['config_category', 'SYSTEM', '系统', 1], ['config_category', 'DISPATCH', '调度', 2], ['config_category', 'FINANCE', '财务', 3],
    ['config_category', 'INTEGRATION', '集成', 4], ['config_category', 'ALERT', '预警', 5], ['config_category', 'SLA', '时效', 6],
    ['settlement_method', 'BANK_TRANSFER', '银行转账', 1], ['settlement_method', 'ONLINE', '在线支付', 2], ['settlement_method', 'FACTORING', '保理放款', 3],
  ];
  for (const [dictType, dictKey, dictValue, sort] of dictDefs) {
    await insert(conn,
      `INSERT INTO ops_dict (dict_type, dict_key, dict_value, sort, status, remark, created_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', 'Stage5 种子字典', ?)`,
      [dictType, dictKey, dictValue, sort, at(now, -60)]);
  }
  const jobDefs = [
    ['JOB_INTEGRATION_RETRY', '集成报文失败重试', '*/5 * * * *', 'SUCCESS', '重试 5 条，成功 4 条'],
    ['JOB_ALERT_SCAN', '预警规则扫描', '*/10 * * * *', 'SUCCESS', '扫描 20 条预警，新增 1 条'],
    ['JOB_BILL_REMINDER', '账单到期提醒', '0 9 * * *', 'SUCCESS', '发送 3 条提醒'],
    ['JOB_REGULATOR_REPORT', '监管报送生成', '0 1 1 * *', 'SUCCESS', '生成月报 1 份'],
    ['JOB_STAT_DAILY', '经营分析日汇总', '0 2 * * *', 'SUCCESS', '写入 90 条日汇总'],
    ['JOB_INTEGRATION_RETRY', '集成报文失败重试', '*/5 * * * *', 'FAILED', '银行适配器超时'],
  ];
  for (let i = 0; i < 12; i += 1) {
    const [jobCode, jobName, cron, status, result] = jobDefs[i % jobDefs.length];
    await insert(conn,
      `INSERT INTO job_log (job_code, job_name, cron, status, started_at, finished_at, duration_ms, result, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [jobCode, jobName, cron, status, at(now, -i * 2), at(now, -i * 2 + 0.05), 180 + i * 7, result, at(now, -i * 2)]);
  }

  // ── 5) 审计/通知补充 ────────────────────────────────────────────────
  const stage5Audits = [
    ['ADAPTER_TEST', '适配器连通测试'], ['MESSAGE_RETRY_BATCH', '批量重试报文'],
    ['REGULATOR_SUBMIT', '提交监管报送'], ['REGULATOR_ACCEPT', '监管受理回执'],
    ['COMPLIANCE_RUN', '执行合规检查'], ['OPS_CONFIG_UPDATE', '更新系统配置'],
    ['OPS_JOB_RUN', '执行定时任务'], ['FULL_CHAIN_CHECK', '全链路验收检查'],
  ];
  for (let i = 0; i < 16; i += 1) {
    const [action, label] = stage5Audits[i % stage5Audits.length];
    await insert(conn,
      `INSERT INTO audit_log (user_id, username, role, action, action_label, module, target_type, target_id, detail, ip, created_at)
       VALUES (?, 'admin01', 'ADMIN', ?, ?, 'ops', 'STAGE5', ?, ?, '127.0.0.1', ?)`,
      [ref.userBy.admin01.id, action, label, String(i + 1), JSON.stringify({ note: `Stage5 种子审计 #${i + 1}` }), at(now, -i % 8)]);
  }
  for (let i = 0; i < 6; i += 1) {
    await insert(conn,
      `INSERT INTO notification (user_id, role, type, title, content, related_type, related_id, read_flag, created_at)
       VALUES (?, ?, 'TODO', ?, ?, 'OPS', ?, 0, ?)`,
      [ref.userBy.admin01.id, null,
        ['适配器降级提醒', '监管报送待提交', '合规检查存在 FAIL', '定时任务失败', '全链路验收待执行', '报文批量重试完成'][i],
        'Stage 5 种子通知，可在集成中心/监管/运营后台查看。', String(i + 1), at(now, -i)]);
  }

  console.log(`[db] Stage5：适配器 ${adapters.length}、监管报送 5、合规检查 10、配置 10、字典 24、任务日志 12`);
  return { adapters, reportCount: reportDefs.length, checkCount: checkDefs.length, configCount: configs.length, dictCount: dictDefs.length };
}
