import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

function start(name, args) {
  const child = spawn('npm.cmd', args, {
    cwd: root,
    stdio: 'inherit',
    shell: isWindows,
    env: process.env,
  });
  child.on('exit', (code) => {
    console.log(`[dev] ${name} 已退出（exit ${code}）`);
    if (code) process.exitCode = code;
  });
  return child;
}

function stop(child) {
  if (!child.pid) return;
  if (isWindows) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGINT');
  }
}

const api = start('api', ['run', 'dev', '--prefix', 'api']);
const web = start('web', ['run', 'dev', '--prefix', 'web']);

console.log('\n[dev] API  http://127.0.0.1:8080');
console.log('[dev] Web  http://127.0.0.1:5173');
console.log('[dev] 按 Ctrl+C 停止\n');

function shutdown() {
  stop(api);
  stop(web);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
