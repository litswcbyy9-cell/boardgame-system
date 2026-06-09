import { create } from 'zustand';
import type { AppUser, GameTable, Player, Game, Reservation, PlaySession, StaffProfile,
  LeaderboardEntry, RevenueReport, PopularityItem, TableUtilizationItem, Venue } from '../types';
import { authApi } from '../services/endpoints';
import { setAuthToken, clearAuthToken } from '../services/api';

type PageKey = 'dashboard' | 'tables' | 'members' | 'staff' | 'games' | 'sessions' | 'reports' | 'recommend' | 'customer';

interface AppState {
  // Auth
  currentUser: AppUser | null;
  authLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;

  // Nav
  activePage: PageKey;
  setActivePage: (page: PageKey) => void;

  // Data (global cache)
  tables: GameTable[];
  players: Player[];  // active lookup list
  members: Player[];
  staff: StaffProfile[];
  games: Game[];
  reservations: Reservation[];
  openSessions: PlaySession[];
  leaderboard: LeaderboardEntry[];
  revenue: RevenueReport | null;
  popularity: PopularityItem[];
  tableUtilization: TableUtilizationItem[];
  venue: Venue | null;
  loading: boolean;
  error: string | null;
  refreshAll: () => Promise<void>;

  // UI state
  selectedTableId: number | null;
  selectedMemberId: number | null;
  selectedStaffId: number | null;
  setSelectedTableId: (id: number | null) => void;
  setSelectedMemberId: (id: number | null) => void;
  setSelectedStaffId: (id: number | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentUser: null,
  authLoading: true,
  activePage: 'dashboard',

  tables: [], players: [], members: [], staff: [], games: [],
  reservations: [], openSessions: [], leaderboard: [],
  revenue: null, popularity: [], tableUtilization: [], venue: null,
  loading: false, error: null,

  selectedTableId: null,
  selectedMemberId: null,
  selectedStaffId: null,

  setActivePage: (page) => set({ activePage: page }),
  setSelectedTableId: (id) => set({ selectedTableId: id }),
  setSelectedMemberId: (id) => set({ selectedMemberId: id }),
  setSelectedStaffId: (id) => set({ selectedStaffId: id }),

  login: async (username, password) => {
    const { data } = await authApi.login(username, password);
    setAuthToken(data.token);
    set({ currentUser: data.user });
  },
  register: async (username, password, displayName) => {
    const { data } = await authApi.register(username, password, displayName);
    setAuthToken(data.token);
    set({ currentUser: data.user });
  },
  logout: async () => {
    try { await authApi.logout(); } catch { /* noop */ }
    clearAuthToken();
    set({ currentUser: null });
  },
  checkAuth: async () => {
    try {
      const { data } = await authApi.me();
      set({ currentUser: data.user, authLoading: false });
    } catch {
      clearAuthToken();
      set({ currentUser: null, authLoading: false });
    }
  },

  refreshAll: async () => {
    set({ loading: true, error: null });
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [
        tablesRes, membersRes, staffRes, gamesRes,
        reservationsRes, sessionsRes, leaderboardRes,
        revenueRes, popularityRes, utilizationRes, venueRes,
      ] = await Promise.all([
        import('../services/endpoints').then(m => m.tablesApi.floor()),
        import('../services/endpoints').then(m => m.membersApi.search()),
        import('../services/endpoints').then(m => m.staffApi.search()),
        import('../services/endpoints').then(m => m.gamesApi.list()),
        import('../services/endpoints').then(m => m.reservationsApi.list()),
        import('../services/endpoints').then(m => m.sessionsApi.open()),
        import('../services/endpoints').then(m => m.gamesApi.leaderboard()),
        import('../services/endpoints').then(m => m.reportsApi.revenue(today)),
        import('../services/endpoints').then(m => m.reportsApi.gamePopularity(30)),
        import('../services/endpoints').then(m => m.reportsApi.tableUtilization(30)),
        import('../services/endpoints').then(m => m.venueApi.get()),
      ]);

      const state = get();
      set({
        tables: tablesRes.data ?? [],
        members: membersRes.data ?? [],
        staff: staffRes.data ?? [],
        games: gamesRes.data ?? [],
        reservations: reservationsRes.data ?? [],
        openSessions: sessionsRes.data ?? [],
        leaderboard: leaderboardRes.data ?? [],
        revenue: revenueRes.data ?? null,
        popularity: popularityRes.data ?? [],
        tableUtilization: utilizationRes.data ?? [],
        venue: venueRes.data ?? null,
        loading: false,
        // 首次加载自动选第一个
        selectedTableId: state.selectedTableId ?? (tablesRes.data?.[0]?.id ?? null),
        selectedMemberId: state.selectedMemberId ?? (membersRes.data?.[0]?.id ?? null),
        selectedStaffId: state.selectedStaffId ?? (staffRes.data?.[0]?.id ?? null),
      });
    } catch (err: any) {
      set({ loading: false, error: err.message || '数据加载失败' });
    }
  },
}));

// Selectors
export const useCurrentUser = () => useAppStore(s => s.currentUser);
export const useIsAdmin = () => useAppStore(s => s.currentUser?.role === 'admin');
