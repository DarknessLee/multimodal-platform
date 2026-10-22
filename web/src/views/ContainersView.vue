<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">箱管中心</h2>
        <p class="page-subtitle">集装箱全生命周期：放箱 → 提箱 → 进场 → 装箱 → 发运 → 卸箱 → 还箱</p>
      </div>
      <div class="page-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="card filter-bar">
      <el-select v-model="statusFilter" placeholder="全部箱状态" clearable style="width: 160px" @change="search">
        <el-option v-for="(label, value) in CONTAINER_STATUS_LABELS" :key="value" :label="label" :value="value" />
      </el-select>
      <el-input
        v-model="keyword"
        placeholder="搜索箱号 / 当前位置"
        clearable
        style="width: 280px"
        @keyup.enter="search"
        @clear="search"
      />
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="reset">重置</el-button>
      <span class="muted filter-tip">共 {{ total }} 个集装箱</span>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card table-card">
      <el-table v-loading="loading" data-testid="container-table" :data="rows" size="small" border stripe>
        <el-table-column label="箱号" min-width="160">
          <template #default="{ row }">
            <router-link :to="`/containers/${row.id}`" class="row-link mono" data-testid="container-row">
              <span data-testid="container-no">{{ row.containerNo }}</span>
            </router-link>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="箱型" width="80" align="center" />
        <el-table-column label="状态" width="104" align="center">
          <template #default="{ row }">
            <StatusTag
              kind="container"
              :status="row.status"
              :label="row.statusLabel"
              size="small"
              data-testid="container-status"
            />
          </template>
        </el-table-column>
        <el-table-column label="当前位置" min-width="150">
          <template #default="{ row }">{{ row.currentNode || '—' }}</template>
        </el-table-column>
        <el-table-column label="当前运单" min-width="160">
          <template #default="{ row }">
            <router-link v-if="row.currentWaybillId" :to="`/waybills/${row.currentWaybillId}`" class="mono">
              {{ row.currentWaybillNo || `#${row.currentWaybillId}` }}
            </router-link>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="箱主" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.ownerPartnerName || '—' }}</template>
        </el-table-column>
        <el-table-column prop="conditionText" label="箱况" min-width="150">
          <template #default="{ row }">{{ row.conditionText || '—' }}</template>
        </el-table-column>
        <el-table-column label="维修费(元)" width="110" align="right">
          <template #default="{ row }">
            <span :class="{ amount: Number(row.repairFee) > 0 }">{{ formatAmount(row.repairFee) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="goDetail(row.id)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无集装箱数据" :image-size="70" />
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          background
          @current-change="load"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import StatusTag from '../components/StatusTag.vue';
import { fetchContainers } from '../api/containers';
import { CONTAINER_STATUS_LABELS } from '../utils/constants';
import { formatAmount } from '../utils/format';
import type { ContainerListItem } from '../types';

const router = useRouter();

const loading = ref(false);
const errorText = ref('');
const rows = ref<ContainerListItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const statusFilter = ref('');
const keyword = ref('');

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchContainers({
      status: statusFilter.value || undefined,
      keyword: keyword.value.trim() || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    rows.value = [];
    total.value = 0;
    errorText.value = error instanceof Error && error.message ? error.message : '集装箱列表加载失败';
  } finally {
    loading.value = false;
  }
}

function search(): void {
  page.value = 1;
  void load();
}

function reset(): void {
  statusFilter.value = '';
  keyword.value = '';
  search();
}

function goDetail(id: number): void {
  void router.push(`/containers/${id}`);
}

onMounted(load);
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}

.filter-tip {
  margin-left: auto;
  font-size: 12px;
}

.retry-btn {
  margin-top: 6px;
}

.table-card {
  padding-top: 14px;
}

.row-link {
  color: var(--app-primary);
}

.row-link:hover {
  text-decoration: underline;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
