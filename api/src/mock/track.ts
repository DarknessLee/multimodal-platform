// 轨迹 mock：节点线性插值 MOCK_GPS + CARRIER_REPORT / TERMINAL_REPORT / MOCK_EDI 节点与文案
// 数据确定性：全部由固定节点坐标与动作推导，不落随机数。
import type { SegmentAction, SegmentMode, SegmentRow, TrackSource } from '../types';
import { formatDateTime } from '../utils/datetime';
import { getRouteNodes, type RouteNode } from './routes';

/** EDI mock 节点文案（契约 5.4 冻结） */
export const EDI_TEXTS = {
  seaGateIn: '已确认进场，箱况良好',
  seaArrive: '船舶靠泊阳逻港，卸船完成',
  railGateIn: '吴家山站确认进场，集装箱已进站',
  railArrive: '到达成都城厢站，铁路段完成',
  roadHandover: '集装箱已交至洋山港堆场',
} as const;

export interface TrackPointDraft {
  segmentId: number | null;
  nodeName: string;
  lng: number;
  lat: number;
  occurredAt: string;
  source: TrackSource;
  description: string;
}

interface Seed {
  nodeName: string;
  lng: number;
  lat: number;
  source: TrackSource;
  description: string;
}

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

/** 两个线路节点间线性插值（经纬度保留 6 位，与 DECIMAL(9,6) 对齐） */
function interpolate(from: RouteNode, to: RouteNode, ratio: number): { lng: number; lat: number } {
  return {
    lng: round6(from.lng + (to.lng - from.lng) * ratio),
    lat: round6(from.lat + (to.lat - from.lat) * ratio),
  };
}

function nodeSeed(node: RouteNode, source: TrackSource, description: string): Seed {
  return { nodeName: node.name, lng: node.lng, lat: node.lat, source, description };
}

/**
 * 每个节点动作追加 1~3 个轨迹点（契约 4.6）：
 * - ACCEPT/DEPART/ARRIVE 的操作点 CARRIER_REPORT；GATE_IN/到港到站的港站点 TERMINAL_REPORT
 * - 途中补点 MOCK_GPS（段内节点线性插值）；EDI mock 节点 MOCK_EDI
 */
export function seedsForAction(mode: SegmentMode, action: SegmentAction): Seed[] {
  const nodes = getRouteNodes(mode);
  const start = nodes[0];
  const end = nodes[nodes.length - 1];
  const prev = nodes.length > 1 ? nodes[nodes.length - 2] : start;

  switch (action) {
    case 'ACCEPT':
      return [nodeSeed(start, 'CARRIER_REPORT', '司机已接单')];

    case 'DEPART':
      return [
        nodeSeed(start, 'CARRIER_REPORT', '司机已提货，车辆出发'),
        { nodeName: '在途位置', ...interpolate(start, nodes[1], 0.5), source: 'MOCK_GPS', description: '在途位置' },
      ];

    case 'GATE_IN': {
      const text = mode === 'SEA' ? EDI_TEXTS.seaGateIn : EDI_TEXTS.railGateIn;
      return [
        nodeSeed(start, 'TERMINAL_REPORT', text),
        { nodeName: '在途位置', ...interpolate(start, nodes[1], 0.25), source: 'MOCK_GPS', description: '在途位置' },
      ];
    }

    case 'ARRIVE': {
      if (mode === 'ROAD') {
        return [
          { nodeName: '在途位置', ...interpolate(prev, end, 0.55), source: 'MOCK_GPS', description: '在途位置' },
          nodeSeed(end, 'CARRIER_REPORT', `已送达${end.name}`),
          nodeSeed(end, 'MOCK_EDI', EDI_TEXTS.roadHandover),
        ];
      }
      const text = mode === 'SEA' ? EDI_TEXTS.seaArrive : EDI_TEXTS.railArrive;
      return [
        { nodeName: '在途位置', ...interpolate(prev, end, 0.6), source: 'MOCK_GPS', description: '在途位置' },
        nodeSeed(end, 'TERMINAL_REPORT', text),
        nodeSeed(end, 'MOCK_EDI', `EDI 确认：${text}`),
      ];
    }

    default:
      return [];
  }
}

/** 节点动作对应的一批轨迹点（同批 occurred_at = 动作发生时间，排序由 seq 兜底） */
export function buildActionTrackPoints(params: {
  segment: SegmentRow;
  action: SegmentAction;
  at: Date;
}): TrackPointDraft[] {
  const seeds = seedsForAction(params.segment.mode, params.action);
  const occurredAt = formatDateTime(params.at);
  return seeds.map((seed) => ({
    segmentId: Number(params.segment.id),
    nodeName: seed.nodeName,
    lng: seed.lng,
    lat: seed.lat,
    occurredAt,
    source: seed.source,
    description: seed.description,
  }));
}

/** 货主签收轨迹：source=MTO，取最后一个分段的终点坐标（契约 4.8） */
export function buildSignTrackPoint(params: {
  segments: SegmentRow[];
  signerName: string;
  at: Date;
}): TrackPointDraft {
  const sorted = [...params.segments].sort((a, b) => Number(a.seq) - Number(b.seq));
  const last = sorted[sorted.length - 1];
  const nodes = last ? getRouteNodes(last.mode) : [];
  const endNode = nodes[nodes.length - 1] ?? { name: last?.end_node ?? '目的地', lng: 104.3, lat: 30.87 };
  return {
    segmentId: last ? Number(last.id) : null,
    nodeName: last?.end_node ?? endNode.name,
    lng: round6(endNode.lng),
    lat: round6(endNode.lat),
    occurredAt: formatDateTime(params.at),
    source: 'MTO',
    description: `货主签收（${params.signerName}）`,
  };
}
