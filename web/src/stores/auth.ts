import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { LoginResult, Role, UserInfo } from '../types';
import { clearSession, readToken, readUser, saveSession } from '../utils/session';

/** 认证状态：token + user（localStorage 持久化） */
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(readToken());
  const user = ref<UserInfo | null>(readUser());

  const isLoggedIn = computed(() => Boolean(token.value));
  const role = computed<Role | ''>(() => user.value?.role ?? '');
  const roleLabel = computed(() => user.value?.roleLabel ?? '');
  const displayName = computed(() => user.value?.displayName ?? '');

  function setSession(result: LoginResult): void {
    token.value = result.token;
    user.value = result.user;
    saveSession(result.token, result.user);
  }

  function logout(): void {
    token.value = '';
    user.value = null;
    clearSession();
  }

  return { token, user, isLoggedIn, role, roleLabel, displayName, setSession, logout };
});
