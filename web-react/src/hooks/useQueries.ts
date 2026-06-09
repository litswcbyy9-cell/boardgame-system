import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  tablesApi, gamesApi, membersApi, staffApi,
  reservationsApi, sessionsApi, reportsApi, recommendationsApi,
} from '../services/endpoints';

// ==================== Tables ====================
export function useTables() {
  return useQuery({ queryKey: ['tables'], queryFn: () => tablesApi.floor().then(r => r.data) });
}

export function useTableMatch(partySize: number, startAt: string, endAt: string, enabled = false) {
  return useQuery({
    queryKey: ['tables', 'match', partySize, startAt, endAt],
    queryFn: () => tablesApi.match(partySize, startAt, endAt).then(r => r.data),
    enabled,
  });
}

// ==================== Games ====================
export function useGames() {
  return useQuery({ queryKey: ['games'], queryFn: () => gamesApi.list().then(r => r.data) });
}

export function useLeaderboard() {
  return useQuery({ queryKey: ['leaderboard'], queryFn: () => gamesApi.leaderboard().then(r => r.data) });
}

// ==================== Members ====================
export function useMembers(q?: string, status?: string) {
  return useQuery({
    queryKey: ['members', q, status],
    queryFn: () => membersApi.search(q, status).then(r => r.data),
  });
}

export function useMemberReservations(id: number | null) {
  return useQuery({
    queryKey: ['members', id, 'reservations'],
    queryFn: () => membersApi.reservations(id!).then(r => r.data),
    enabled: !!id,
  });
}

export function useCreateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { displayName: string; phone?: string; initialBalanceYuan: number }) =>
      membersApi.create(data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); },
  });
}

export function useMemberRecharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amountYuan }: { id: number; amountYuan: number }) =>
      membersApi.recharge(id, amountYuan),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); },
  });
}

export function useMemberConsume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amountYuan }: { id: number; amountYuan: number }) =>
      membersApi.consume(id, amountYuan),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); },
  });
}

export function useDisableMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => membersApi.disable(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); },
  });
}

// ==================== Staff ====================
export function useStaff(q?: string, status?: string) {
  return useQuery({
    queryKey: ['staff', q, status],
    queryFn: () => staffApi.search(q, status).then(r => r.data),
  });
}

// ==================== Reservations ====================
export function useReservations() {
  return useQuery({ queryKey: ['reservations'], queryFn: () => reservationsApi.list().then(r => r.data) });
}

export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, any>) => reservationsApi.create(data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['tables'] });
    },
  });
}

export function useCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => reservationsApi.checkin(id).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['tables'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useCancelReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => reservationsApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['tables'] });
    },
  });
}

// ==================== Sessions ====================
export function useOpenSessions() {
  return useQuery({ queryKey: ['sessions', 'open'], queryFn: () => sessionsApi.open().then(r => r.data) });
}

export function useWalkin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { tableId: number; guestName?: string; guestPhone?: string; partySize: number }) =>
      sessionsApi.walkin(data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useSettle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; billedMinutes: number; amountCents: number; notes?: string }) =>
      sessionsApi.settle(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

// ==================== Reports ====================
export function useRevenue(date: string) {
  return useQuery({ queryKey: ['reports', 'revenue', date], queryFn: () => reportsApi.revenue(date).then(r => r.data) });
}

export function useGamePopularity(days = 30) {
  return useQuery({ queryKey: ['reports', 'popularity', days], queryFn: () => reportsApi.gamePopularity(days).then(r => r.data) });
}

// ==================== Recommendations ====================
export function useGameRecommendations(params: { playerId?: number; partySize: number; minutes: number; category?: string }, enabled = false) {
  return useQuery({
    queryKey: ['recommend', 'games', params],
    queryFn: () => recommendationsApi.games(params).then(r => r.data),
    enabled,
  });
}
