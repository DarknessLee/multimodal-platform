import { request } from './http';
import type { SeaBookResult, SeaConfirmResult, SeaTask } from '../types';

export function fetchSeaTasks(): Promise<SeaTask[]> {
  return request<SeaTask[]>({ url: '/sea/tasks', method: 'GET' });
}

export function bookSea(waybillId: number | string): Promise<SeaBookResult> {
  return request<SeaBookResult>({
    url: `/sea/tasks/${waybillId}/book`,
    method: 'POST',
  });
}

export function confirmSeaBooking(messageId: number | string): Promise<SeaConfirmResult> {
  return request<SeaConfirmResult>({
    url: `/sea/bookings/${messageId}/confirm`,
    method: 'POST',
  });
}
