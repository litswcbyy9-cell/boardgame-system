// ============================================================
// 桌游门店运营系统 — 共享类型定义
// ============================================================

export interface AppUser {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'staff';
  staffId: number | null;
  employeeNo: string | null;
  staffName: string | null;
  staffPhone: string | null;
  position: string | null;
}

export interface Venue {
  id: number;
  name: string;
  address: string | null;
  logoUrl: string | null;
}

export type TableStatus = 'idle' | 'reserved' | 'occupied';

export interface GameTable {
  id: number;
  code: string;
  venueId: number;
  posX: number;
  posY: number;
  sortOrder: number;
  seatCapacity: number;
  areaType: string;
  floorPhotoUrl: string | null;
  status: TableStatus;
  currentReservationId: number | null;
  currentSessionId: number | null;
  currentReservationPlayerId?: number | null;
  currentReservationPlayerName?: string | null;
  currentReservationGuestName?: string | null;
  currentReservationPartySize?: number;
  currentReservationStart?: string;
  currentReservationEnd?: string;
  currentSessionGuestName?: string | null;
  currentSessionPartySize?: number;
  currentSessionStartedAt?: string;
}

export interface TableMatch {
  tableId: number;
  code: string;
  seatCapacity: number;
  areaType: string;
  posX: number;
  posY: number;
  status: string;
  recentSessions: number;
  score: number;
  scores: { capacity: number; availability: number; utilization: number };
  reason: string;
}

export interface Game {
  id: number;
  title: string;
  coverImageUrl: string | null;
  rulesPdfUrl: string | null;
  minPlayers: number;
  maxPlayers: number;
  category: string;
  difficultyLevel: number;
  avgMinutes: number;
  recommendWeight: number;
}

export interface GameRecommendation {
  gameId: number;
  title: string;
  coverImageUrl: string | null;
  minPlayers: number;
  maxPlayers: number;
  category: string;
  difficultyLevel: number;
  avgMinutes: number;
  totalPlayRecords: number;
  recent30Records: number;
  score: number;
  scores: { people: number; duration: number; category: number; history: number; hot: number; weight: number };
  reason: string;
}

export interface Player {
  id: number;
  memberNo: string;
  displayName: string;
  phone: string | null;
  avatarUrl: string | null;
  balanceCents: number;
  totalRechargedCents: number;
  totalSpentCents: number;
  status: 'active' | 'disabled';
  createdAt?: string;
}

export interface Reservation {
  id: number;
  tableId: number;
  tableCode?: string;
  playerId: number | null;
  playerName?: string;
  playerPhone?: string;
  guestName: string;
  guestPhone: string | null;
  partySize: number;
  reservedStart: string;
  reservedEnd: string;
  status: ReservationStatus;
  seatCapacity?: number;
  areaType?: string;
  createdAt?: string;
}

export type ReservationStatus = 'pending' | 'active' | 'cancelled' | 'completed' | 'no_show';

export interface PlaySession {
  id: number;
  tableId: number;
  tableCode?: string;
  reservationId: number | null;
  guestName: string | null;
  guestPhone: string | null;
  partySize: number;
  startedAt: string;
  endedAt: string | null;
  playerId?: number | null;
  playerName?: string | null;
  playerPhone?: string | null;
}

export interface StaffProfile {
  id: number;
  employeeNo: string;
  fullName: string;
  phone: string | null;
  position: string;
  status: 'active' | 'disabled';
  hiredAt: string | null;
  createdAt: string;
  userId: number | null;
  username: string | null;
  role: string | null;
  userStatus: string | null;
}

export interface LeaderboardEntry {
  playerId: number;
  displayName: string;
  avatarUrl: string;
  wins: number;
  games: number;
  winRate: number;
  lastWinAt: string | null;
}

export interface RevenueReport {
  reportDay: string;
  revenueYuan: number;
  settledSessions: number;
  totalBilledMinutes: number;
}

export interface PopularityItem {
  gameId?: number;
  title: string;
  coverImageUrl?: string;
  recordCount: number;
}

export interface TableUtilizationItem {
  tableId: number;
  code: string;
  settledSessionsInRange: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
}

export interface ApiError {
  error: string;
  message: string;
  description?: string;
}
