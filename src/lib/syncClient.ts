import type { AICountResponse, BottleCapRule, PendingMutation, UserAccount, WorkspaceState } from '../types/inventory';

let memoryAuthToken: string | null = null;
export const CLIENT_INSTANCE_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `client-${Math.random().toString(36).slice(2)}`;

export function setMemoryAuthToken(token: string | null) {
  memoryAuthToken = token;
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'SmartInventoryAI',
    ...extra,
  };
  if (memoryAuthToken) {
    headers['Authorization'] = `Bearer ${memoryAuthToken}`;
  }
  return headers;
}

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: buildHeaders((options.headers as Record<string, string>) || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function registerAccount(payload: {
  name: string;
  email: string;
  password: string;
  workspaceCode?: string;
}): Promise<{ token: string; user: UserAccount; workspace: WorkspaceState }> {
  const res = await apiRequest<{ token: string; user: UserAccount; workspace: WorkspaceState }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setMemoryAuthToken(res.token);
  return res;
}

export async function loginAccount(payload: {
  email: string;
  password: string;
}): Promise<{ token: string; user: UserAccount; workspace: WorkspaceState }> {
  const res = await apiRequest<{ token: string; user: UserAccount; workspace: WorkspaceState }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setMemoryAuthToken(res.token);
  return res;
}

export async function logoutAccount(): Promise<void> {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } finally {
    setMemoryAuthToken(null);
  }
}

export async function fetchCurrentSession(): Promise<{ user: UserAccount; workspace: WorkspaceState }> {
  return apiRequest<{ user: UserAccount; workspace: WorkspaceState }>('/api/auth/me');
}

export async function pullWorkspaceFromServer(): Promise<{ workspace: WorkspaceState }> {
  return apiRequest<{ workspace: WorkspaceState }>('/api/sync/pull');
}

export async function pushMutationsToServer(
  mutations: PendingMutation[]
): Promise<{ workspace: WorkspaceState; results: { mutationId: string; applied: boolean; error?: string }[] }> {
  return apiRequest('/api/sync/push', {
    method: 'POST',
    body: JSON.stringify({ mutations, sourceClientId: CLIENT_INSTANCE_ID }),
  });
}

export async function analyzeProductFrameAI(payload: {
  imageDataUrl: string;
  productId: string;
  bottleCapRule: BottleCapRule;
}): Promise<AICountResponse> {
  return apiRequest<AICountResponse>('/api/ai/count-product', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function buildProductProfileAI(payload: {
  productName: string;
  brand: string;
  size: string;
  images: { angle: string; dataUrl: string }[];
}): Promise<{
  visualSignatureSummary: string;
  distinctiveFeatures: string[];
  labelKeywords: string[];
  dominantColors: string[];
  packagingType: string;
}> {
  return apiRequest('/api/ai/build-profile', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function exportServerBackup(): Promise<unknown> {
  return apiRequest('/api/backup/export');
}

export async function restoreServerBackup(workspace: WorkspaceState): Promise<{ workspace: WorkspaceState }> {
  return apiRequest('/api/backup/restore', {
    method: 'POST',
    body: JSON.stringify({ workspace }),
  });
}
