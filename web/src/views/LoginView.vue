<template>
  <div class="login-page">
    <div class="login-panel">
      <section class="login-brand">
        <div class="login-brand__logo">联</div>
        <h1 class="login-brand__title">多式联运演示版 v0</h1>
        <p class="login-brand__subtitle">公路 · 海运 · 铁路一站式联运平台（多角色协同演示）</p>

        <div class="demo-title">演示账号（密码统一为 demo123，点击即可一键登录）</div>
        <div class="demo-list">
          <button
            v-for="account in demoAccounts"
            :key="account.role"
            type="button"
            class="demo-item"
            :data-testid="`quick-login-${account.role}`"
            :disabled="loading"
            @click="quickLogin(account)"
          >
            <span class="demo-item__role">{{ account.roleLabel }}</span>
            <span class="demo-item__name">{{ account.displayName }}</span>
            <span class="demo-item__user mono">{{ account.username }}</span>
            <span class="demo-item__duty">{{ account.duty }}</span>
          </button>
        </div>
      </section>

      <section class="login-form-wrap">
        <div class="login-form-card">
          <h2 class="login-form__title">账号登录</h2>
          <p class="login-form__subtitle">使用演示账号登录，体验对应角色工作台</p>

          <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
            <el-form-item label="账号" prop="username">
              <el-input
                v-model="form.username"
                data-testid="login-username"
                placeholder="请输入账号，如 shipper01"
                size="large"
                clearable
                autocomplete="username"
              />
            </el-form-item>
            <el-form-item label="密码" prop="password">
              <el-input
                v-model="form.password"
                data-testid="login-password"
                type="password"
                placeholder="演示密码 demo123"
                size="large"
                show-password
                autocomplete="current-password"
                @keyup.enter="submit"
              />
            </el-form-item>
            <el-button
              data-testid="login-submit"
              type="primary"
              size="large"
              class="login-submit"
              :loading="loading"
              @click="submit"
            >
              登 录
            </el-button>
          </el-form>

          <el-alert
            v-if="errorText"
            :title="errorText"
            type="error"
            :closable="false"
            show-icon
            class="mt-16"
          />

          <div class="login-hint">
            <div>提示：先运行 <span class="mono">npm run setup</span> 与 <span class="mono">npm run dev</span>。</div>
            <div>若接口未启动，页面会给出网络错误提示。</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { login } from '../api';
import { useAuthStore } from '../stores/auth';
import { DEMO_ACCOUNTS, type DemoAccount } from '../utils/constants';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const demoAccounts = DEMO_ACCOUNTS;
const formRef = ref<FormInstance>();
const loading = ref(false);
const errorText = ref('');

const form = reactive({
  username: '',
  password: '',
});

const rules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

async function doLogin(username: string, password: string): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const result = await login(username, password);
    auth.setSession(result);
    ElMessage.success(`欢迎，${result.user.displayName}`);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/orders';
    await router.replace(redirect);
  } catch (error) {
    errorText.value = error instanceof Error && error.message ? error.message : '登录失败，请检查账号与密码';
  } finally {
    loading.value = false;
  }
}

async function submit(): Promise<void> {
  const formEl = formRef.value;
  if (!formEl) return;
  try {
    await formEl.validate();
  } catch {
    return;
  }
  await doLogin(form.username.trim(), form.password);
}

async function quickLogin(account: DemoAccount): Promise<void> {
  form.username = account.username;
  form.password = account.password;
  errorText.value = '';
  await doLogin(account.username, account.password);
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  background:
    radial-gradient(circle at 12% 18%, rgba(64, 158, 255, 0.12), transparent 42%),
    radial-gradient(circle at 88% 82%, rgba(54, 207, 201, 0.14), transparent 46%),
    #f5f7fa;
}

.login-panel {
  width: 100%;
  max-width: 1080px;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: 28px;
}

.login-brand {
  background: linear-gradient(150deg, #1f4e8c 0%, #2563a8 48%, #1f8f8b 100%);
  border-radius: 14px;
  padding: 34px 32px;
  color: #ffffff;
  box-shadow: 0 18px 40px rgba(31, 78, 140, 0.18);
  display: flex;
  flex-direction: column;
}

.login-brand__logo {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
}

.login-brand__title {
  margin: 18px 0 8px;
  font-size: 26px;
  letter-spacing: 1px;
}

.login-brand__subtitle {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.78);
}

.demo-title {
  margin: 26px 0 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
  letter-spacing: 0.5px;
}

.demo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.demo-item {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr) 90px;
  grid-template-areas:
    'role name user'
    'role duty duty';
  align-items: center;
  gap: 2px 10px;
  text-align: left;
  padding: 9px 12px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s ease, transform 0.15s ease;
}

.demo-item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.18);
  transform: translateY(-1px);
}

.demo-item:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.demo-item__role {
  grid-area: role;
  font-size: 13px;
  font-weight: 700;
  color: #ffe9a8;
}

.demo-item__name {
  grid-area: name;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-item__user {
  grid-area: user;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  text-align: right;
}

.demo-item__duty {
  grid-area: duty;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.62);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.login-form-wrap {
  display: flex;
  align-items: center;
}

.login-form-card {
  width: 100%;
  background: #ffffff;
  border-radius: 14px;
  padding: 34px 32px 28px;
  box-shadow: 0 18px 40px rgba(15, 35, 70, 0.08);
  border: 1px solid #ebeef5;
}

.login-form__title {
  margin: 0;
  font-size: 21px;
}

.login-form__subtitle {
  margin: 8px 0 22px;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.login-submit {
  width: 100%;
  margin-top: 6px;
  letter-spacing: 6px;
}

.login-hint {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px dashed #ebeef5;
  font-size: 12px;
  color: var(--app-text-secondary);
  line-height: 1.9;
}

@media (max-width: 920px) {
  .login-panel {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
