import React, { useState } from 'react';
import {
  AlertOctagon,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Camera,
  ClipboardCheck,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  RefreshCw,
  Settings,
  Sun,
  Truck,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { AuthScreen, BusinessSetupWizard } from './components/AuthAndOnboarding';
import { AICameraScanner } from './components/AICameraScanner';
import { DashboardView, type NavSection } from './components/DashboardView';
import { NotificationsView, SettingsView, UsersAndAuditView } from './components/GovernanceViews';
import { ProductsView } from './components/ProductsView';
import { PWAInstallButton } from './components/PWAInstallBanner';
import { ReportsAndAnalyticsView } from './components/ReportsAndAnalyticsView';
import { StockOperationsView } from './components/StockOperationsView';
import { StockTakingView } from './components/StockTakingView';
import { SuppliersAndLocationsView } from './components/SuppliersAndLocationsView';
import { InventoryProvider, useInventory } from './context/InventoryContext';

const MainShell: React.FC = () => {
  const {
    user,
    workspace,
    isLoading,
    isOnline,
    syncStatus,
    pendingCount,
    theme,
    toggleTheme,
    logout,
    forceSyncNow,
  } = useInventory();

  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [cameraTargetProductId, setCameraTargetProductId] = useState<string | null>(null);
  const [cameraSessionId, setCameraSessionId] = useState<string | null>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-[#090D16] text-slate-600 dark:text-slate-300">
        <img src="/icon.svg" alt="Smart Inventory AI" className="w-12 h-12 rounded-xl mb-3" />
        <div className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Smart Inventory AI
        </div>
        <p className="text-xs text-slate-500 mt-1">Loading local &amp; cloud ledger...</p>
      </div>
    );
  }

  if (!user || !workspace) {
    return <AuthScreen />;
  }

  if (!workspace.business) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#090D16]">
        <header className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="Smart Inventory AI" className="w-7 h-7 rounded-lg" />
            <span className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Smart Inventory AI
            </span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            Sign Out
          </button>
        </header>
        <BusinessSetupWizard />
      </div>
    );
  }

  const unreadNotifications = workspace.notifications.filter((n) => !n.read).length;

  const navItems: { key: NavSection; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'products', label: 'Products', icon: Package },
    { key: 'ai_camera', label: 'AI Camera', icon: Camera },
    { key: 'stock_taking', label: 'Stock Taking', icon: ClipboardCheck },
    { key: 'incoming', label: 'Incoming Stock', icon: ArrowDownLeft },
    { key: 'outgoing', label: 'Outgoing Stock', icon: ArrowUpRight },
    { key: 'damaged', label: 'Damaged & Expired', icon: AlertOctagon },
    { key: 'transfers', label: 'Transfers', icon: ArrowLeftRight },
    { key: 'suppliers', label: 'Suppliers & Branches', icon: Truck },
    { key: 'reports', label: 'Reports', icon: FileBarChart },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    { key: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifications },
    { key: 'users', label: 'Users & Audit', icon: Users },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  const openAICameraFor = (productId: string, sessionId?: string) => {
    setCameraTargetProductId(productId);
    setCameraSessionId(sessionId || null);
    setActiveNav('ai_camera');
  };

  const activeNavLabel = navItems.find((n) => n.key === activeNav)?.label || 'Dashboard';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090D16] flex">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 no-print">
        <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
          <img src="/icon.svg" alt="Smart Inventory AI" className="w-7 h-7 rounded-lg shrink-0" />
          <span className="font-display text-base font-semibold text-slate-900 dark:text-white truncate">
            Smart Inventory AI
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveNav(item.key)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={`font-mono text-[11px] ${isActive ? 'text-blue-100' : 'text-red-600 dark:text-red-400'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="px-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{user.name}</div>
            <div className="text-[11px] text-slate-500 truncate">
              {user.role} · {workspace.workspaceCode}
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Sticky Top Bar (compact on mobile to respect <=15% sticky cap) */}
        <header className="sticky top-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/icon.svg" alt="" className="w-6 h-6 rounded-md lg:hidden shrink-0" />
            <span className="text-xs text-slate-400 hidden sm:inline whitespace-nowrap">
              {workspace.business.name} /
            </span>
            <span className="font-display text-sm font-semibold text-slate-900 dark:text-white truncate">
              {activeNavLabel}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={forceSyncNow}
              title="Click to sync devices now"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
            >
              {!isOnline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                  <span>Offline ({pendingCount})</span>
                </>
              ) : syncStatus === 'syncing' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                  <span>Syncing...</span>
                </>
              ) : pendingCount > 0 ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                  <span>Pending ({pendingCount})</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">Synced v{workspace.version}</span>
                </>
              )}
            </button>

            <PWAInstallButton />

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Active Viewport */}
        <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-8 max-w-7xl w-full mx-auto">
          {activeNav === 'dashboard' && <DashboardView onNavigate={setActiveNav} />}
          {activeNav === 'products' && (
            <ProductsView onOpenAICameraForProduct={(id) => openAICameraFor(id)} />
          )}
          {activeNav === 'ai_camera' && (
            <AICameraScanner
              initialProductId={cameraTargetProductId}
              activeSessionId={cameraSessionId}
            />
          )}
          {activeNav === 'stock_taking' && (
            <StockTakingView onLaunchAICamera={(prodId, sessId) => openAICameraFor(prodId, sessId)} />
          )}
          {activeNav === 'incoming' && <StockOperationsView initialTab="incoming" />}
          {activeNav === 'outgoing' && <StockOperationsView initialTab="outgoing" />}
          {activeNav === 'damaged' && <StockOperationsView initialTab="damaged" />}
          {activeNav === 'transfers' && <StockOperationsView initialTab="transfers" />}
          {activeNav === 'suppliers' && <SuppliersAndLocationsView />}
          {activeNav === 'reports' && <ReportsAndAnalyticsView initialMode="reports" />}
          {activeNav === 'analytics' && <ReportsAndAnalyticsView initialMode="analytics" />}
          {activeNav === 'notifications' && <NotificationsView />}
          {activeNav === 'users' && <UsersAndAuditView />}
          {activeNav === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation (compact 56px height) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 h-14 pb-safe no-print">
        {[
          { key: 'dashboard' as NavSection, label: 'Home', icon: LayoutDashboard },
          { key: 'products' as NavSection, label: 'Products', icon: Package },
          { key: 'ai_camera' as NavSection, label: 'AI Scan', icon: Camera },
          { key: 'stock_taking' as NavSection, label: 'Count', icon: ClipboardCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeNav === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveNav(tab.key);
                setMobileMoreOpen(false);
              }}
              className={`flex flex-col items-center justify-center text-[10px] font-medium cursor-pointer ${
                active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="mt-0.5">{tab.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMoreOpen(true)}
          className="flex flex-col items-center justify-center text-[10px] font-medium text-slate-500 dark:text-slate-400 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
          <span className="mt-0.5">More</span>
        </button>
      </nav>

      {/* Mobile More Modules Sheet */}
      {mobileMoreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end">
          <div className="w-full bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 max-h-[82vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  All Inventory Modules
                </h3>
                <p className="text-[11px] text-slate-500">{user.name} · {user.role}</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setActiveNav(item.key);
                      setMobileMoreOpen(false);
                    }}
                    className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border text-xs font-medium text-left cursor-pointer ${
                      activeNav === item.key
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={logout}
              className="mt-4 w-full py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-red-600 flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <InventoryProvider>
      <MainShell />
    </InventoryProvider>
  );
}
