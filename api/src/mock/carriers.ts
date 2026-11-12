// Mock 承运商与固定分段（契约 5.1 / 5.2 冻结）
import type { SegmentMode } from '../types';

export interface RoadCarrier {
  code: string;
  name: string;
  price: number;
  etaHours: number;
  description: string;
}

/** MTO 可选的 3 家公路承运商 */
export const ROAD_CARRIERS: readonly RoadCarrier[] = [
  { code: 'AJ-001', name: '安捷卡车队', price: 1280, etaHours: 6, description: '嘉定—洋山港专线，自有车队' },
  { code: 'HT-002', name: '华通物流', price: 1350, etaHours: 7, description: '华东集卡，可夜班' },
  { code: 'SF-003', name: '顺丰重货', price: 1580, etaHours: 5, description: '时效优先，全程 GPS' },
];

export function findRoadCarrier(code: string): RoadCarrier | undefined {
  return ROAD_CARRIERS.find((carrier) => carrier.code === code);
}

export interface FixedSegmentTemplate {
  seq: number;
  mode: SegmentMode;
  carrierCode: string;
  carrierName: string;
  startNode: string;
  endNode: string;
  costAmount: number;
  /** planned_start = 调度时刻 + N 小时 */
  plannedStartHours: number;
  /** planned_end = 调度时刻 + N 小时 */
  plannedEndHours: number;
}

/** 公路段计划时间偏移：now +2h / +8h */
export const ROAD_PLANNED_START_HOURS = 2;
export const ROAD_PLANNED_END_HOURS = 8;

/** 固定海运段（no carrier_user_id） */
export const SEA_SEGMENT: FixedSegmentTemplate = {
  seq: 2,
  mode: 'SEA',
  carrierCode: 'COSCO-EDI',
  carrierName: '中远海运',
  startNode: '上海洋山港',
  endNode: '武汉阳逻港',
  costAmount: 5200,
  plannedStartHours: 24,
  plannedEndHours: 36,
};

/** 固定铁路段（no carrier_user_id） */
export const RAIL_SEGMENT: FixedSegmentTemplate = {
  seq: 3,
  mode: 'RAIL',
  carrierCode: 'CR-95306',
  carrierName: '中铁集装箱',
  startNode: '武汉吴家山站',
  endNode: '成都城厢站',
  costAmount: 8600,
  plannedStartHours: 48,
  plannedEndHours: 57,
};

/** 调度生成的固定分段顺序：公路（MTO 选）→ 海运 → 铁路 */
export const FIXED_SEGMENT_TEMPLATES: readonly FixedSegmentTemplate[] = [SEA_SEGMENT, RAIL_SEGMENT];
