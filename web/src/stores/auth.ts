import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { LoginResult, Role, UserInfo } from '../types';
import { ROLE_FALLBACK_PERMISSIONS } from '../utils/constants';
import { clearSession, readToken, readUser, saveSession } from '../utils/session';

/**
 * 认证状态：token + user + permissions（localStorage 持久化）。
 * v1 登录返回 permissions；若后端尚未返回（v0 兼容），按角色回退矩阵。
 */
export const useAuthStore = defineStore('auth', () => {
  const storedUser = readUser();
  const token = ref<string>(readToken());
  const user = ref<UserInfo | null>(storedUser);
  const permissions = ref<string[]>(resolvePermissions(storedUser, []));
  const permissionsLoading = ref(false);

  const isLoggedIn = computed(() => Boolean(token.value));
  const role = computed<Role | ''>(() => user.value?.role ?? '');
  const roleLabel = computed(() => user.value?.roleLabel ?? '');
  const displayName = computed(() => user.value?.displayName ?? '');

  function resolvePermissions(targetUser: UserInfo | null, provided: string[] | undefined): string[] {
    if (provided && provided.length > 0) return [...provided];
    const fromUser = targetUser?.permissions;
    if (fromUser && fromUser.length > 0) return [...fromUser];
    if (!targetUser) return [];
    return [...(ROLE_FALLBACK_PERMISSIONS[targetUser.role] ?? [])];
  }

  function applyUser(targetUser: UserInfo, provided?: string[]): void {
    user.value = targetUser;
    permissions.value = resolvePermissions(targetUser, provided);
    user.value = { ...targetUser, permissions: permissions.value };
    saveSession(token.value, user.value);
  }

  function setSession(result: LoginResult): void {
    token.value = result.token;
    const provided = result.user?.permissions ?? result.permissions;
    applyUser(result.user, provided);
  }

  function setPermissions(list: string[]): void {
    if (!user.value) return;
    permissions.value = list.length > 0 ? [...list] : resolvePermissions(user.value, []);
    user.value = { ...user.value, permissions: permissions.value };
    saveSession(token.value, user.value);
  }

  function hasPermission(permission?: string | string[] | null): boolean {
    if (!permission) return true;
    const required = Array.isArray(permission) ? permission : [permission];
    if (required.length === 0) return true;
    return required.some((code) => permissions.value.includes(code));
  }

  async function refreshPermissions(): Promise<void> {
    if (!token.value || permissionsLoading.value) return;
    permissionsLoading.value = true;
    try {
      const { fetchMe } = await import('../api');
      const me = await fetchMe();
      setPermissions(me.permissions ?? []);
      if (me.displayName) {
        user.value = {
          ...(user.value as UserInfo),
          ...me,
          permissions: permissions.value,
        };
        saveSession(token.value, user.value);
      }
    } catch {
      // 拉取失败时保留现有权限（401 由 http 拦截器统一处理）
    } finally {
      permissionsLoading.value = false;
    }
  }

  function logout(): void {
    token.value = '';
    user.value = null;
    permissions.value = [];
    clearSession();
  }

  return {
    token,
    user,
    permissions,
    permissionsLoading,
    isLoggedIn,
    role,
    roleLabel,
    displayName,
    setSession,
    setPermissions,
    hasPermission,
    refreshPermissions,
    logout,
  };
});
