import { request } from './http';
import type { NotificationItem } from '../types';

export function fetchNotifications(params?: { unread?: number }): Promise<NotificationItem[]> {
  return request<NotificationItem[]>({ url: '/notifications', method: 'GET', params });
}

export function readNotification(id: number | string): Promise<{ id: number; readFlag: boolean }> {
  return request<{ id: number; readFlag: boolean }>({
    url: `/notifications/${id}/read`,
    method: 'POST',
  });
}
