// 本地文件存储路径（api/storage，随仓库内演示目录，不入库）
import { isAbsolute, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** api/src/platform -> api */
const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const apiRoot = resolve(srcRoot, '..');
export const storageRoot = resolve(apiRoot, 'storage');
export const documentsDir = resolve(storageRoot, 'documents');

/**
 * 解析单证文件物理路径：
 * - 种子约定：file_path = 'documents/<fileName>'（相对 api/storage）
 * - 兼容：'storage/documents/<fileName>'（相对 api）、绝对路径
 */
export function resolveStoragePath(filePath: string): string {
  if (!filePath) return '';
  if (isAbsolute(filePath)) return filePath;
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.startsWith('storage/')) {
    return resolve(apiRoot, normalized);
  }
  return resolve(storageRoot, normalized);
}

/** 生成落库用相对路径（与种子一致） */
export function documentRelativePath(fileName: string): string {
  return `documents/${fileName}`;
}

/** 文件名安全化：去掉路径分隔符与危险字符 */
export function sanitizeFileName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'file';
  const cleaned = base.replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim();
  return (cleaned === '' ? 'file' : cleaned).slice(0, 100);
}
