import React, { useState } from 'react';
import {
  Bell,
  CheckCheck,
  Copy,
  Database,
  Download,
  History,
  Moon,
  RefreshCw,
  Shield,
  Sun,
  Upload,
  Users,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { exportServerBackup, restoreServerBackup } from '../lib/syncClient';
import type { UserRole, WorkspaceState } from '../types/inventory';
import { BusinessSetupWizard } from './AuthAndOnboarding';

export const NotificationsView: React.FC = () => {
  const { workspace, dispatchMutation } = useInventory();
  if (!workspace) return null;

  const unread = workspace.notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
            Notifications &amp; Inventory Alerts
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {unread} unread alerts across low stock, expirations, damage approvals, and variances.
          </p>
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => dispatchMutation('MARK_NOTIFICATIONS_READ', {})}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark All Read
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
        {workspace.notifications.map((n) => (
          <div key={n.id} className={`p-4 flex items-start justify-between gap-4 ${n.read ? 'opacity-65' : ''}`}>
            <div className="flex items-start gap-3">
              <Bell
                className={`w-4 h-4 mt-0.5 shrink-0 ${
                  n.severity === 'critical'
                    ? 'text-red-600'
                    : n.severity === 'warning'
                    ? 'text-amber-600'
                    : 'text-blue-600'
                }`}
              />
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-white">{n.title}</div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{n.message}</p>
                <div className="text-[11px] font-mono text-slate-400 mt-1">
                  {new Date(n.createdAt).toLocaleString()} · {n.severity.toUpperCase()}
                </div>
              </div>
            </div>
            {!n.read && (
              <button
                type="button"
                onClick={() => dispatchMutation('MARK_NOTIFICATIONS_READ', { ids: [n.id] })}
                className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap cursor-pointer"
              >
                Mark read
              </button>
            )}
          </div>
        ))}
        {workspace.notifications.length === 0 && (
          <div className="py-10 text-center text-xs text-slate-500">All clear — no active inventory alerts.</div>
        )}
      </div>
    </div>
  );
};

export const UsersAndAuditView: React.FC = () => {
  const { workspace, user, dispatchMutation } = useInventory();
  const [copied, setCopied] = useState(false);

  if (!workspace) return null;

  const isSuperAdmin = user?.role === 'Super Administrator';
  const roles: UserRole[] = ['Super Administrator', 'Manager', 'Storekeeper', 'Employee', 'Auditor'];

  const copySyncCode = () => {
    navigator.clipboard?.writeText(workspace.workspaceCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
          Team Roles &amp; Audit History
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Manage role-based permissions and connect additional Android phones, tablets, or desktops.
        </p>
      </div>

      {/* Multi-device Sync Code Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            Multi-Device Workspace Sync Code
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            To sync another device automatically, select "Join Device" on sign-in and enter this Workspace Sync Code:
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-semibold px-3.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
            {workspace.workspaceCode}
          </span>
          <button
            type="button"
            onClick={copySyncCode}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? 'Copied' : 'Copy Code'}
          </button>
        </div>
      </div>

      {/* Team Members Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600" />
          Workspace Users ({workspace.users.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="py-2.5 px-4">Name</th>
                <th className="py-2.5 px-4">Email</th>
                <th className="py-2.5 px-4">Role</th>
                <th className="py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {workspace.users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">{u.name}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-500">{u.email}</td>
                  <td className="py-2.5 px-4">
                    {isSuperAdmin && u.id !== user?.id ? (
                      <select
                        value={u.role}
                        onChange={(e) =>
                          dispatchMutation('UPDATE_USER_ROLE', {
                            userId: u.id,
                            role: e.target.value as UserRole,
                            isActive: u.isActive,
                          })
                        }
                        className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1 text-xs text-slate-900 dark:text-white"
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-medium text-slate-700 dark:text-slate-200">{u.role}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4">{u.isActive ? 'Active' : 'Disabled'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit History */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <History className="w-4 h-4 text-blue-600" />
          Security &amp; Inventory Audit Log
        </div>
        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {workspace.auditLogs.slice(0, 50).map((log) => (
            <div key={log.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 mr-2">{log.action}</span>
                <span className="text-slate-600 dark:text-slate-300">{log.summary}</span>
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                {log.actorName} ({log.actorRole}) · {new Date(log.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const SettingsView: React.FC = () => {
  const { workspace, user, theme, toggleTheme, syncStatus, pendingCount, forceSyncNow, replaceWorkspaceFromServer } =
    useInventory();
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  if (!workspace) return null;

  const isSuperAdmin = user?.role === 'Super Administrator';

  const handleDownloadBackup = async () => {
    try {
      const data = await exportServerBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smart-inventory-backup-${workspace.workspaceCode}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupMsg('Full workspace backup exported successfully.');
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : 'Backup export failed.');
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { workspace?: WorkspaceState };
      if (!parsed.workspace) throw new Error('Invalid backup structure.');
      const res = await restoreServerBackup(parsed.workspace);
      await replaceWorkspaceFromServer(res.workspace);
      setBackupMsg('Backup restored and synchronized across connected devices.');
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : 'Restore failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
            Application Settings &amp; Backups
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Appearance, multi-device sync health, encrypted backups, and business configuration.
          </p>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode
        </button>
      </div>

      {/* Sync & Backup Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-blue-600" />
            Offline &amp; Multi-Device Sync
          </h2>
          <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <div>Status: <strong className="capitalize">{syncStatus}</strong></div>
            <div>Pending Offline Mutations: <strong className="font-mono">{pendingCount}</strong></div>
            <div>Server Ledger Version: <strong className="font-mono">v{workspace.version}</strong></div>
            <div>Last Synced: <strong className="font-mono">{new Date(workspace.lastSyncedAt).toLocaleString()}</strong></div>
          </div>
          <button
            type="button"
            onClick={forceSyncNow}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync Devices Now
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600" />
            Database Backup &amp; Recovery
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Export a full JSON snapshot of products, balances, transactions, and AI recognition profiles.
          </p>
          {backupMsg && (
            <div className="text-xs text-blue-600 dark:text-blue-400">{backupMsg}</div>
          )}
          {isSuperAdmin ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadBackup}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export Backup
              </button>
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Restore Backup
                <input type="file" accept=".json" onChange={handleRestoreBackup} className="hidden" />
              </label>
            </div>
          ) : (
            <p className="text-xs text-amber-600">Only Super Administrators can export or restore full database backups.</p>
          )}
        </div>
      </div>

      {/* Business Profile Editor */}
      <BusinessSetupWizard existing={workspace.business} />
    </div>
  );
};
