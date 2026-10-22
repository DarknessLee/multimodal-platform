<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title" data-testid="page-title">运单中心</h2>
        <p class="page-subtitle">一单制运单：主运单 + 分段运单 · 交接事件 · 电子单证 · 哈希链存证</p>
      </div>
      <div class="page-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="card filter-bar">
      <el-select v-model="typeFilter" placeholder="全部运单类型" clearable style="width: 150px" @change="search">
        <el-option v-for="option in WAYBILL_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 140px" @change="search">
        <el-option v-for="option in WAYBILL_STATUS_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-input
        v-model="keyword"
        placeholder="搜索运单号 / 订单号 / 货物"
        clearable
        style="width: 280px"
        @keyup.enter="search"
        @clear="search"
      />
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="reset">重置</el-button>
      <span class="muted filter-tip">共 {{ total }} 张运单</span>
    </div>

    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon class="mb-16">
      <template #default>
        <el-button size="small" class="retry-btn" @click="load">重新加载</el-button>
      </template>
    </el-alert>

    <div class="card table-card">
      <el-table v-loading="loading" data-testid="waybill-table" :data="rows" size="small" border stripe>
        <el-table-column label="运单号" min-width="170">
          <template #default="{ row }">
            <router-link :to="`/waybills/${row.id}`" class="row-link mono" data-testid="waybill-row">
              <span data-testid="waybill-no">{{ row.waybillNo }}</span>
            </router-link>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="100" align="center">
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="row.waybillType === 'MASTER' ? 'primary' : 'info'"
              effect="plain"
              data-testid="waybill-type"
            >
              {{ row.waybillTypeLabel || waybillTypeLabel(row.waybillType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="96" align="center">
          <template #default="{ row }">
            <StatusTag
              kind="waybill"
              :status="row.status"
              :label="row.statusLabel"
              size="small"
              data-testid="waybill-status"
            />
          </template>
        </el-table-column>
        <el-table-column label="订单号" min-width="150">
          <template #default="{ row }">
            <router-link v-if="row.orderId" :to="`/orders/${row.orderId}`" class="mono">
              {{ row.orderNo || `#${row.orderId}` }}
            </router-link>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="customerName" label="客户" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.customerName || '—' }}</template>
        </el-table-column>
        <el-table-column prop="cargoName" label="货物" width="120" show-overflow-tooltip />
        <el-table-column label="箱数" width="70" align="right">
          <template #default="{ row }">{{ row.containerCount }}</template>
        </el-table-column>
        <el-table-column label="分段数" width="78" align="right">
          <template #default="{ row }">{{ row.segmentCount }}</template>
        </el-table-column>
        <el-table-column label="单证" width="70" align="right">
          <template #default="{ row }">
            <span class="doc-count">{{ row.documentCount }}</span>
          </template>
        </el-table-column>
        <el-table-column label="存证" width="80" align="right">
          <template #default="{ row }">
            <el-tag v-if="row.notarizedCount > 0" size="small" type="success" effect="plain">
              {{ row.notarizedCount }} 条
            </el-tag>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="签发时间" width="140">
          <template #default="{ row }">{{ formatDateTime(row.issuedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" align="center">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="goDetail(row.id)">一单制详情</el-button>
            <el-button size="small" text @click="goTrack(row.id)">跟踪</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无运单数据" :image-size="70" />
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
import { fetchWaybills } from '../api/waybillCenter';
import {
  WAYBILL_STATUS_OPTIONS,
  WAYBILL_TYPE_OPTIONS,
  waybillTypeLabel,
} from '../utils/constants';
import { formatDateTime } from '../utils/format';
import type { WaybillListItem } from '../types';

const router = useRouter();

const loading = ref(false);
const errorText = ref('');
const rows = ref<WaybillListItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const typeFilter = ref('');
const statusFilter = ref('');
const keyword = ref('');

async function load(): Promise<void> {
  loading.value = true;
  errorText.value = '';
  try {
    const data = await fetchWaybills({
      type: typeFilter.value || undefined,
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
    errorText.value = error instanceof Error && error.message ? error.message : '运单列表加载失败';
  } finally {
    loading.value = false;
  }
}

function search(): void {
  page.value = 1;
  void load();
}

function reset(): void {
  typeFilter.value = '';
  statusFilter.value = '';
  keyword.value = '';
  search();
}

function goDetail(id: number): void {
  void router.push(`/waybills/${id}`);
}

function goTrack(id: number): void {
  void router.push(`/waybills/${id}/track`);
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
  cursor: pointer;
}

.row-link:hover {
  text-decoration: underline;
}

.doc-count {
  font-variant-numeric: tabular-nums;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
