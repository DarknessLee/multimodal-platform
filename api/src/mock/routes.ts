// 线路节点与经纬度（契约 5.3 冻结）——轨迹 MOCK_GPS 线性插值的依据
import type { SegmentMode } from '../types';

export interface RouteNode {
  name: string;
  lng: number;
  lat: number;
}

export const ROUTE_NODES: Record<SegmentMode, RouteNode[]> = {
  ROAD: [
    { name: '上海嘉定工厂', lng: 121.265, lat: 31.375 },
    { name: '外环高速', lng: 121.45, lat: 31.32 },
    { name: '东海大桥', lng: 121.9, lat: 30.78 },
    { name: '上海洋山港', lng: 122.045, lat: 30.625 },
  ],
  SEA: [
    { name: '上海洋山港', lng: 122.045, lat: 30.625 },
    { name: '长江口', lng: 121.5, lat: 31.0 },
    { name: '武汉阳逻港', lng: 114.55, lat: 30.7 },
  ],
  RAIL: [
    { name: '武汉吴家山站', lng: 114.13, lat: 30.61 },
    { name: '襄阳', lng: 112.14, lat: 32.04 },
    { name: '安康', lng: 109.03, lat: 32.69 },
    { name: '成都城厢站', lng: 104.3, lat: 30.87 },
  ],
};

export function getRouteNodes(mode: SegmentMode): RouteNode[] {
  return ROUTE_NODES[mode];
}

export function routeStartNode(mode: SegmentMode): RouteNode {
  return getRouteNodes(mode)[0];
}

export function routeEndNode(mode: SegmentMode): RouteNode {
  const nodes = getRouteNodes(mode);
  return nodes[nodes.length - 1];
}
