import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useOnlineStatus } from '../hooks/usePWA';
import {
  enqueueOfflineMutation,
  getCachedProfile,
  getPendingMutations,
  getWorkspaceLocally,
  removePendingMutations,
  saveCachedProfile,
  saveWorkspaceLocally,
} from '../lib/offlineDb';
import { applyOptimisticMutation } from '../lib/optimisticReducer';
import {
  CLIENT_INSTANCE_ID,
  fetchCurrentSession,
  loginAccount,
  logoutAccount,
  pullWorkspaceFromServer,
  pushMutationsToServer,
  registerAccount,
} from '../lib/syncClient';
import type { PendingMutation, UserAccount, WorkspaceState } from '../types/inventory';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'pending' | 'error';

interface InventoryContextValue {
  user: UserAccount | null;
  workspace: WorkspaceState | null;
  isLoading: boolean;
  isOnline: boolean;
  syncStatus: SyncStatus;
  pendingCount: number;
  lastSyncError: string | null;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, workspaceCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  dispatchMutation: (actionType: string, payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  forceSyncNow: () => Promise<void>;
  replaceWorkspaceFromServer: (ws: WorkspaceState) => Promise<void>;
  formatCurrency: (amount: number) => string;
  getProductStock: (productId: string, locationId?: string) => number;
  convertUnits: (qty: number, fromUnit: string, toUnit: string, productId?: string) => number;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isOnline = useOnlineStatus();
  const [user, setUser] = useState<UserAccount | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(isOnline ? 'synced' : 'offline');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  const syncingRef = useRef(false);
  const workspaceRef = useRef<WorkspaceState | null>(null);
  workspaceRef.current = workspace;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const refreshPendingCount = useCallback(async (wsId?: string) => {
    const list = await getPendingMutations(wsId);
    setPendingCount(list.length);
    return list;
  }, []);

  const flushOutbox = useCallback(async (wsId: string) => {
    if (syncingRef.current || !navigator.onLine) {
      if (!navigator.onLine) setSyncStatus('offline');
      return;
    }
    syncingRef.current = true;
    try {
      const pending = await getPendingMutations(wsId);
      setPendingCount(pending.length);
      if (pending.length === 0) {
        const pulled = await pullWorkspaceFromServer();
        setWorkspace(pulled.workspace);
        await saveWorkspaceLocally(pulled.workspace);
        setSyncStatus('synced');
        setLastSyncError(null);
        return;
      }

      setSyncStatus('syncing');
      const res = await pushMutationsToServer(pending);
      const ackIds = res.results.map((r) => r.mutationId);
      await removePendingMutations(ackIds);
      const remaining = await getPendingMutations(wsId);
      setPendingCount(remaining.length);
      setWorkspace(res.workspace);
      await saveWorkspaceLocally(res.workspace);
      const firstErr = res.results.find((r) => r.error)?.error || null;
      setLastSyncError(firstErr);
      setSyncStatus(remaining.length > 0 ? 'pending' : 'synced');
    } catch (err) {
      setLastSyncError(err instanceof Error ? err.message : 'Sync interrupted');
      setSyncStatus(navigator.onLine ? 'error' : 'offline');
    } finally {
      syncingRef.current = false;
    }
  }, []);

  // Boot: restore online session OR offline cached IndexedDB workspace
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const cached = await getCachedProfile();
        if (cached) {
          const localWs = await getWorkspaceLocally(cached.workspaceId);
          if (localWs && !cancelled) {
            setUser(cached.user);
            setWorkspace(localWs);
            await refreshPendingCount(cached.workspaceId);
          }
        }

        if (navigator.onLine) {
          try {
            const session = await fetchCurrentSession();
            if (!cancelled) {
              setUser(session.user);
              await saveCachedProfile(session.user, session.workspace.workspaceId);
              const pending = await getPendingMutations(session.workspace.workspaceId);
              if (pending.length > 0) {
                await flushOutbox(session.workspace.workspaceId);
              } else {
                setWorkspace(session.workspace);
                await saveWorkspaceLocally(session.workspace);
                setSyncStatus('synced');
              }
            }
          } catch {
            // Not signed in or offline fallback already loaded if available
            if (!navigator.onLine && !cancelled) setSyncStatus('offline');
          }
        } else {
          setSyncStatus('offline');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [flushOutbox, refreshPendingCount]);

  // Automatic flush when connectivity returns
  useEffect(() => {
    if (!workspace?.workspaceId) return;
    if (isOnline) {
      flushOutbox(workspace.workspaceId);
    } else {
      setSyncStatus('offline');
    }
  }, [isOnline, workspace?.workspaceId, flushOutbox]);

  // Real-time Server-Sent Events (SSE) multi-device sync stream
  useEffect(() => {
    if (!isOnline || !user || !workspace?.workspaceId) return;

    const es = new EventSource('/api/sync/stream', { withCredentials: true });
    es.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'sync-update' && data.sourceClientId !== CLIENT_INSTANCE_ID) {
          const currentVer = workspaceRef.current?.version || 0;
          if (data.version > currentVer) {
            await flushOutbox(workspace.workspaceId);
          }
        }
      } catch {
        // Ignore malformed SSE ping
      }
    };
    es.onerror = () => {
      // Browser EventSource retries automatically when online
    };

    const interval = setInterval(() => {
      if (navigator.onLine && workspaceRef.current?.workspaceId) {
        flushOutbox(workspaceRef.current.workspaceId);
      }
    }, 30000);

    return () => {
      es.close();
      clearInterval(interval);
    };
  }, [isOnline, user, workspace?.workspaceId, flushOutbox]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await loginAccount({ email, password });
    setUser(res.user);
    setWorkspace(res.workspace);
    await saveCachedProfile(res.user, res.workspace.workspaceId);
    await saveWorkspaceLocally(res.workspace);
    await refreshPendingCount(res.workspace.workspaceId);
    setSyncStatus('synced');
  }, [refreshPendingCount]);

  const register = useCallback(async (name: string, email: string, password: string, workspaceCode?: string) => {
    const res = await registerAccount({ name, email, password, workspaceCode });
    setUser(res.user);
    setWorkspace(res.workspace);
    await saveCachedProfile(res.user, res.workspace.workspaceId);
    await saveWorkspaceLocally(res.workspace);
    await refreshPendingCount(res.workspace.workspaceId);
    setSyncStatus('synced');
  }, [refreshPendingCount]);

  const logout = useCallback(async () => {
    await logoutAccount();
    await saveCachedProfile(null, null);
    setUser(null);
    setWorkspace(null);
    setPendingCount(0);
  }, []);

  const dispatchMutation = useCallback(
    async (actionType: string, payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> => {
      if (!workspaceRef.current || !user) {
        return { ok: false, error: 'No active workspace session.' };
      }
      const ws = workspaceRef.current;
      const mutation: PendingMutation = {
        mutationId: crypto.randomUUID(),
        workspaceId: ws.workspaceId,
        actionType,
        payload,
        clientTimestamp: Date.now(),
        attempts: 0,
        createdAt: new Date().toISOString(),
      };

      const optimistic = applyOptimisticMutation(ws, mutation, {
        id: user.id,
        name: user.name,
        role: user.role,
      });

      if (optimistic.error) {
        return { ok: false, error: optimistic.error };
      }

      setWorkspace(optimistic.workspace);
      await saveWorkspaceLocally(optimistic.workspace);
      await enqueueOfflineMutation(mutation);
      const pending = await refreshPendingCount(ws.workspaceId);

      if (navigator.onLine) {
        setSyncStatus('syncing');
        try {
          const res = await pushMutationsToServer(pending);
          const ackIds = res.results.map((r) => r.mutationId);
          await removePendingMutations(ackIds);
          await refreshPendingCount(ws.workspaceId);
          setWorkspace(res.workspace);
          await saveWorkspaceLocally(res.workspace);
          const mutRes = res.results.find((r) => r.mutationId === mutation.mutationId);
          if (mutRes?.error) {
            setSyncStatus('synced');
            return { ok: false, error: mutRes.error };
          }
          setSyncStatus('synced');
          setLastSyncError(null);
        } catch (err) {
          setSyncStatus('pending');
          setLastSyncError(err instanceof Error ? err.message : 'Queued for background sync');
        }
      } else {
        setSyncStatus('offline');
      }

      return { ok: true };
    },
    [user, refreshPendingCount]
  );

  const forceSyncNow = useCallback(async () => {
    if (workspaceRef.current?.workspaceId) {
      await flushOutbox(workspaceRef.current.workspaceId);
    }
  }, [flushOutbox]);

  const replaceWorkspaceFromServer = useCallback(async (ws: WorkspaceState) => {
    setWorkspace(ws);
    await saveWorkspaceLocally(ws);
  }, []);

  const formatCurrency = useCallback(
    (amount: number) => {
      const code = workspace?.business?.currency || 'USD';
      const symbolMap: Record<string, string> = {
        USD: '$',
        TZS: 'TZS ',
        KES: 'KES ',
        UGX: 'UGX ',
        EUR: '€',
        GBP: '£',
        ZAR: 'R',
        NGN: '₦',
      };
      const sym = symbolMap[code] || `${code} `;
      return `${sym}${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },
    [workspace?.business?.currency]
  );

  const getProductStock = useCallback(
    (productId: string, locationId?: string) => {
      if (!workspace) return 0;
      return workspace.stockBalances
        .filter((b) => b.productId === productId && (!locationId || b.locationId === locationId))
        .reduce((sum, b) => sum + b.quantity, 0);
    },
    [workspace]
  );

  const convertUnits = useCallback(
    (qty: number, fromUnit: string, toUnit: string, productId?: string) => {
      if (!fromUnit || !toUnit || fromUnit.toLowerCase() === toUnit.toLowerCase()) return qty;
      const rules = workspace?.unitConversions || [];
      const direct =
        rules.find((r) => r.productId === productId && r.fromUnit === fromUnit && r.toUnit === toUnit) ||
        rules.find((r) => !r.productId && r.fromUnit === fromUnit && r.toUnit === toUnit);
      if (direct) return qty * direct.factor;
      const inverse =
        rules.find((r) => r.productId === productId && r.fromUnit === toUnit && r.toUnit === fromUnit) ||
        rules.find((r) => !r.productId && r.fromUnit === toUnit && r.toUnit === fromUnit);
      if (inverse && inverse.factor > 0) return qty / inverse.factor;
      return qty;
    },
    [workspace?.unitConversions]
  );

  return (
    <InventoryContext.Provider
      value={{
        user,
        workspace,
        isLoading,
        isOnline,
        syncStatus,
        pendingCount,
        lastSyncError,
        theme,
        toggleTheme,
        login,
        register,
        logout,
        dispatchMutation,
        forceSyncNow,
        replaceWorkspaceFromServer,
        formatCurrency,
        getProductStock,
        convertUnits,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
};

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider');
  return ctx;
}
