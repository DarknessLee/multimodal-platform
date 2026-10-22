<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">新建订单</h2>
        <p class="page-subtitle">货主下单 · 提交后订单进入「待调度」状态，等待 MTO 分配公路承运商</p>
      </div>
      <div class="page-actions">
        <el-button :disabled="submitting" @click="goBack">返回</el-button>
      </div>
    </div>

    <el-alert
      v-if="errorText"
      :title="errorText"
      type="error"
      :closable="false"
      show-icon
      class="mb-16"
    />

    <div class="card">
      <h3 class="card-title"><span class="card-title-text">订单信息</span></h3>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="order-form">
        <el-row :gutter="20">
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="货物名称" prop="cargoName">
              <el-input v-model="form.cargoName" data-testid="order-cargo-name" placeholder="如：汽车配件" clearable />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="货物重量（吨）" prop="cargoWeight">
              <el-input
                v-model="form.cargoWeight"
                data-testid="order-weight"
                type="number"
                min="0"
                placeholder="如：18.2"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="箱型" prop="containerType">
              <el-select v-model="form.containerType" data-testid="order-container-type" placeholder="请选择箱型" style="width: 100%">
                <el-option v-for="type in CONTAINER_TYPES" :key="type" :label="type" :value="type" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="箱量（1-20）" prop="containerCount">
              <el-input
                v-model="form.containerCount"
                data-testid="order-container-count"
                type="number"
                min="1"
                max="20"
                placeholder="如：1"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="起运地" prop="origin">
              <el-input v-model="form.origin" data-testid="order-origin" placeholder="如：上海嘉定" clearable />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="目的地" prop="destination">
              <el-input
                v-model="form.destination"
                data-testid="order-destination"
                placeholder="如：成都青白江"
                clearable
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="要求提货日" prop="requiredPickupDate">
              <DatePickerField
                v-model="form.requiredPickupDate"
                testid="order-pickup-date"
                placeholder="选择提货日期"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="16">
            <el-form-item label="备注" prop="remark">
              <el-input v-model="form.remark" placeholder="选填，如：演示订单" clearable />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="form-actions">
          <el-button
            type="primary"
            size="large"
            data-testid="order-submit"
            :loading="submitting"
            @click="submit"
          >
            提交订单
          </el-button>
          <el-button size="large" :disabled="submitting" @click="fillSample">填入示例</el-button>
          <el-button size="large" :disabled="submitting" @click="goBack">取消</el-button>
        </div>
      </el-form>
    </div>

    <div class="card route-preview">
      <h3 class="card-title"><span class="card-title-text">默认联运路线</span></h3>
      <div class="route-line">
        <div class="route-node">
          <div class="route-node__dot road" />
          <div class="route-node__name">{{ form.origin || '起运地' }}</div>
          <div class="route-node__desc">公路段起点</div>
        </div>
        <div class="route-arrow">公路 →</div>
        <div class="route-node">
          <div class="route-node__dot road" />
          <div class="route-node__name">上海洋山港</div>
          <div class="route-node__desc">公路/海运换装</div>
        </div>
        <div class="route-arrow">海运 →</div>
        <div class="route-node">
          <div class="route-node__dot sea" />
          <div class="route-node__name">武汉阳逻港</div>
          <div class="route-node__desc">海运/铁路换装</div>
        </div>
        <div class="route-arrow">铁路 →</div>
        <div class="route-node">
          <div class="route-node__dot rail" />
          <div class="route-node__name">{{ form.destination || '目的地' }}</div>
          <div class="route-node__desc">铁路段终点</div>
        </div>
      </div>
      <p class="muted route-tip">
        调度后线路固定为：上海嘉定工厂 → 上海洋山港（公路）→ 武汉阳逻港（海运）→ 成都城厢站（铁路），
        本页的起运地/目的地用于展示与检索。
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import DatePickerField from '../components/DatePickerField.vue';
import { createOrder } from '../api';
import { CONTAINER_TYPES } from '../utils/constants';
import { toDateString } from '../utils/format';

const router = useRouter();

const formRef = ref<FormInstance>();
const submitting = ref(false);
const errorText = ref('');

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);

const form = reactive({
  cargoName: '汽车配件',
  cargoWeight: '18.2',
  containerType: '40HQ',
  containerCount: '1',
  origin: '上海嘉定',
  destination: '成都青白江',
  requiredPickupDate: toDateString(tomorrow),
  remark: '演示订单',
});

const rules: FormRules = {
  cargoName: [{ required: true, message: '请输入货物名称', trigger: 'blur' }],
  cargoWeight: [
    {
      validator: (_rule, value: string, callback) => {
        const num = Number(value);
        if (value === '' || value === null || value === undefined) {
          callback(new Error('请输入货物重量'));
        } else if (!Number.isFinite(num) || num <= 0) {
          callback(new Error('货物重量需大于 0'));
        } else {
          callback();
        }
      },
      trigger: 'blur',
    },
  ],
  containerType: [{ required: true, message: '请选择箱型', trigger: 'change' }],
  containerCount: [
    {
      validator: (_rule, value: string, callback) => {
        const num = Number(value);
        if (!Number.isInteger(num) || num < 1 || num > 20) {
          callback(new Error('箱量需为 1-20 的整数'));
        } else {
          callback();
        }
      },
      trigger: 'blur',
    },
  ],
  origin: [{ required: true, message: '请输入起运地', trigger: 'blur' }],
  destination: [{ required: true, message: '请输入目的地', trigger: 'blur' }],
  requiredPickupDate: [{ required: true, message: '请选择要求提货日', trigger: 'change' }],
};

function goBack(): void {
  void router.push('/orders');
}

function fillSample(): void {
  form.cargoName = '汽车配件';
  form.cargoWeight = '18.2';
  form.containerType = '40HQ';
  form.containerCount = '1';
  form.origin = '上海嘉定';
  form.destination = '成都青白江';
  form.requiredPickupDate = toDateString(tomorrow);
  form.remark = '演示订单';
}

async function submit(): Promise<void> {
  const formEl = formRef.value;
  if (!formEl) return;
  try {
    await formEl.validate();
  } catch {
    ElMessage.warning('请检查表单填写是否完整');
    return;
  }

  submitting.value = true;
  errorText.value = '';
  try {
    const detail = await createOrder({
      cargoName: form.cargoName.trim(),
      cargoWeight: Number(form.cargoWeight),
      containerType: form.containerType,
      containerCount: Number(form.containerCount),
      origin: form.origin.trim(),
      destination: form.destination.trim(),
      requiredPickupDate: form.requiredPickupDate,
      remark: form.remark.trim() || undefined,
    });
    ElMessage.success(`下单成功：${detail.order.orderNo}`);
    await router.push(`/orders/${detail.order.id}`);
  } catch (error) {
    errorText.value = error instanceof Error && error.message ? error.message : '下单失败，请重试';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}

.order-form {
  max-width: 1100px;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding-top: 18px;
  border-top: 1px dashed var(--app-border);
}

.route-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.route-node {
  min-width: 140px;
  padding: 10px 14px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: #fafcff;
}

.route-node__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-bottom: 6px;
}

.route-node__dot.road {
  background: #409eff;
}

.route-node__dot.sea {
  background: #13c2c2;
}

.route-node__dot.rail {
  background: #fa8c16;
}

.route-node__name {
  font-size: 14px;
  font-weight: 600;
}

.route-node__desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.route-arrow {
  font-size: 12px;
  color: var(--app-text-secondary);
  white-space: nowrap;
}

.route-tip {
  margin: 14px 0 0;
  font-size: 12px;
  line-height: 1.8;
}
</style>
