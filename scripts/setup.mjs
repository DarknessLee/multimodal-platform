import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, env = process.env) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: true, env });
  if (result.status !== 0) {
    console.error(`\n[setup] 命令失败（exit ${result.status}）：${command} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

const envPath = resolve(root, 'api/.env');
if (!existsSync(envPath)) {
  copyFileSync(resolve(root, 'api/.env.example'), envPath);
  console.log('[setup] 已从 api/.env.example 生成 api/.env');
}

// 根目录只保留工具依赖（Playwright Core，用本机 Edge，不下载 Chromium）
run(npm, ['install']);
run(npm, ['install', '--prefix', 'api']);
run(npm, ['install', '--prefix', 'web']);
run(process.execPath, [resolve(root, 'api/db/init.mjs')]);

console.log('\n✅ 初始化完成');
console.log('   启动演示：npm run dev');
console.log('   前端 http://127.0.0.1:5173  |  API http://127.0.0.1:8080');
console.log('   演示账号：shipper01 / mto01 / carrier01 / terminal01 / settlement01（密码均为 demo123）');
