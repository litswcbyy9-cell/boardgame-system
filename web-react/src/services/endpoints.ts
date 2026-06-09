import { apiClient } from './api';
import type {
  AppUser, GameTable, TableMatch, Game, GameRecommendation,
  Player, Reservation, PlaySession, StaffProfile,
  LeaderboardEntry, RevenueReport, PopularityItem, TableUtilizationItem, Venue,
} from '../types';

// ==================== Auth ====================
export const authApi = {
  login: (username: string, password: string) =>
    apiClient.post<{ token: string; user: AppUser }>('/auth/login', { username, password }),
  register: (username: string, password: string, displayName: string) =>
    apiClient.post<{ token: string; user: AppUser }>('/auth/register', { username, password, displayName }),
  me: () => apiClient.get<{ user: AppUser | null }>('/auth/me'),
  logout: () => apiClient.post('/auth/logout'),
  health: () => apiClient.get('/health'),
};

// ==================== Tables ====================
export const tablesApi = {
  floor: () => apiClient.get<GameTable[]>('/tables'),
  match: (partySize: number, startAt: string, endAt: string) =>
    apiClient.get<TableMatch[]>('/tables/match', { params: { partySize, startAt, endAt } }),
};

// ==================== Games ====================
export const gamesApi = {
  list: () => apiClient.get<Game[]>('/games'),
  leaderboard: () => apiClient.get<LeaderboardEntry[]>('/games/leaderboard'),
};

// ==================== Members ====================
export const membersApi = {
  search: (q?: string, status?: string) =>
    apiClient.get<Player[]>('/members', { params: { q, status } }),
  create: (data: { displayName: string; phone?: string; initialBalanceYuan: number }) =>
    apiClient.post<{ id: number; memberNo: string }>('/members', data),
  recharge: (id: number, amountYuan: number) =>
    apiClient.post(`/members/${id}/recharge`, { amountYuan }),
  consume: (id: number, amountYuan: number) =>
    apiClient.post(`/members/${id}/consume`, { amountYuan }),
  disable: (id: number) => apiClient.delete(`/members/${id}`),
  reservations: (id: number) =>
    apiClient.get<Reservation[]>(`/members/${id}/reservations`),
};

// ==================== Staff ====================
export const staffApi = {
  search: (q?: string, status?: string) =>
    apiClient.get<StaffProfile[]>('/staff', { params: { q, status } }),
  create: (data: { fullName: string; phone?: string; position?: string }) =>
    apiClient.post<{ id: number; employeeNo: string }>('/staff', data),
  update: (id: number, data: Record<string, any>) =>
    apiClient.patch(`/staff/${id}`, data),
  disable: (id: number) => apiClient.delete(`/staff/${id}`),
  createAccount: (staffId: number, data: { username: string; password: string; role: string }) =>
    apiClient.post(`/staff/${staffId}/account`, data),
};

// ==================== Reservations ====================
export const reservationsApi = {
  list: () => apiClient.get<Reservation[]>('/reservations'),
  create: (data: Record<string, any>) =>
    apiClient.post<{ reservationId: number }>('/reservations', data),
  publicCreate: (data: Record<string, any>) =>
    apiClient.post<{ reservationId: number; tableCode?: string }>('/reservations/public', data),
  checkin: (id: number) =>
    apiClient.post<{ sessionId: number }>(`/reservations/${id}/checkin`),
  cancel: (id: number) =>
    apiClient.post(`/reservations/${id}/cancel`),
};

// ==================== Sessions ====================
export const sessionsApi = {
  open: () => apiClient.get<PlaySession[]>('/sessions/open'),
  walkin: (data: { tableId: number; guestName?: string; guestPhone?: string; partySize: number }) =>
    apiClient.post<{ sessionId: number }>('/sessions/walkin', data),
  settle: (id: number, data: { billedMinutes: number; amountCents: number; notes?: string }) =>
    apiClient.post(`/sessions/${id}/settle`, data),
  addGameRecord: (sessionId: number, data: Record<string, any>) =>
    apiClient.post<{ recordId: number }>(`/sessions/${sessionId}/game-records`, data),
};

// ==================== Reports ====================
export const reportsApi = {
  revenue: (date: string) =>
    apiClient.get<RevenueReport>('/reports/revenue', { params: { date } }),
  gamePopularity: (days = 30) =>
    apiClient.get<PopularityItem[]>('/reports/game-popularity', { params: { days } }),
  tableUtilization: (days = 30) =>
    apiClient.get<TableUtilizationItem[]>('/reports/table-utilization', { params: { days } }),
};

// ==================== Recommendations ====================
export const recommendationsApi = {
  games: (params: { playerId?: number; partySize: number; minutes: number; category?: string }) =>
    apiClient.get<GameRecommendation[]>('/recommendations/games', { params }),
  tables: (partySize: number, startAt: string, endAt: string) =>
    apiClient.get<TableMatch[]>('/recommendations/tables', { params: { partySize, startAt, endAt } }),
};

// ==================== Venue ====================
export const venueApi = {
  get: () => apiClient.get<Venue | null>('/venue'),
};
