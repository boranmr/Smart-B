import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Camera,
  ClipboardCheck,
  Package,
  Plus,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';

export type NavSection =
  | 'dashboard'
  | 'products'
  | 'ai_camera'
  | 'stock_taking'
  | 'incoming'
  | 'outgoing'
  | 'damaged'
  | 'transfers'
  | 'suppliers'
  | 'reports'
  | 'analytics'
  | 'notifications'
  | 'users'
  | 'settings';

export const DashboardView: React.FC<{ onNavigate: (section: NavSection) => void }> = ({ onNavigate }) => {
  const { workspace, formatCurrency, getProductStock } = useInventory();

  const metrics = useMemo(() => {
    if (!workspace) {
      return {
        totalProducts: 0,
        totalQuantity: 0,
        totalValue: 0,
        availableStock: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
        damagedQty: 0,
        expiredQty: 0,
        incomingQty: 0,
        outgoingQty: 0,
        pendingSessions: 0,
        lastStockTakeDate: 'None yet',
        categoryTotals: [] as { category: string; value: number; qty: number }[],
        dailyFlows: [] as { date: string; incoming: number; outgoing: number }[],
      };
    }

    const totalProducts = workspace.products.length;
    let totalQuantity = 0;
    let totalValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let expiredQty = 0;
    const catMap = new Map<string, { value: number; qty: number }>();

    const nowMs = Date.now();
    for (const p of workspace.products) {
      const qty = getProductStock(p.id);
      totalQuantity += qty;
      const val = qty * (p.purchasePrice || 0);
      totalValue += val;

      if (qty <= 0) outOfStockCount += 1;
      else if (qty <= p.minStockLevel) lowStockCount += 1;

      if (p.expirationDate && Date.parse(p.expirationDate) <= nowMs && qty > 0) {
        expiredQty += qty;
      }

      const prev = catMap.get(p.category) || { value: 0, qty: 0 };
      catMap.set(p.category, { value: prev.value + val, qty: prev.qty + qty });
    }

    const damagedQty = workspace.damageReports
      .filter((d) => d.status === 'approved')
      .reduce((s, d) => s + d.quantity, 0);

    const incomingQty = workspace.incomingRecords
      .filter((r) => r.status === 'confirmed')
      .reduce((s, r) => s + r.acceptedQuantity, 0);

    const outgoingQty = workspace.outgoingRecords
      .filter((r) => r.status === 'approved')
      .reduce((s, r) => s + r.convertedQuantity, 0);

    const pendingSessions = workspace.stockTakingSessions.filter((s) => s.status !== 'finalized').length;
    const finalized = workspace.stockTakingSessions
      .filter((s) => s.status === 'finalized' && s.finalizedAt)
      .sort((a, b) => Date.parse(b.finalizedAt!) - Date.parse(a.finalizedAt!));

    const lastStockTakeDate = finalized[0]?.finalizedAt
      ? new Date(finalized[0].finalizedAt).toLocaleDateString()
      : 'None yet';

    const categoryTotals = Array.from(catMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    // Build 7-day real transaction flow
    const flowMap = new Map<string, { incoming: number; outgoing: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      flowMap.set(d, { incoming: 0, outgoing: 0 });
    }
    for (const tx of workspace.transactions) {
      const day = tx.createdAt.slice(0, 10);
      const bucket = flowMap.get(day);
      if (bucket) {
        if (tx.quantityDelta > 0) bucket.incoming += tx.quantityDelta;
        else bucket.outgoing += Math.abs(tx.quantityDelta);
      }
    }
    const dailyFlows = Array.from(flowMap.entries()).map(([date, v]) => ({ date: date.slice(5), ...v }));

    return {
      totalProducts,
      totalQuantity,
      totalValue,
      availableStock: Math.max(0, totalQuantity - expiredQty),
      lowStockCount,
      outOfStockCount,
      damagedQty,
      expiredQty,
      incomingQty,
      outgoingQty,
      pendingSessions,
      lastStockTakeDate,
      categoryTotals,
      dailyFlows,
    };
  }, [workspace, getProductStock]);

  if (!workspace) return null;

  const maxFlow = Math.max(1, ...metrics.dailyFlows.flatMap((d) => [d.incoming, d.outgoing]));
  const maxCatVal = Math.max(1, ...metrics.categoryTotals.map((c) => c.value));

  const kpis = [
    { label: 'Total Stock Value', value: formatCurrency(metrics.totalValue), sub: `${metrics.totalProducts} registered SKUs` },
    { label: 'Available Stock Units', value: metrics.availableStock.toLocaleString(), sub: `${metrics.totalQuantity.toLocaleString()} total on hand` },
    { label: 'Low Stock Alerts', value: String(metrics.lowStockCount), sub: `${metrics.outOfStockCount} out-of-stock SKUs`, warn: metrics.lowStockCount > 0 || metrics.outOfStockCount > 0 },
    { label: 'Incoming / Outgoing', value: `+${metrics.incomingQty.toLocaleString()} / -${metrics.outgoingQty.toLocaleString()}`, sub: 'Confirmed receipts vs issues' },
    { label: 'Damaged Units', value: metrics.damagedQty.toLocaleString(), sub: `${metrics.expiredQty.toLocaleString()} expired units`, warn: metrics.damagedQty > 0 || metrics.expiredQty > 0 },
    { label: 'Stock-Taking Status', value: `${metrics.pendingSessions} Pending`, sub: `Last completed: ${metrics.lastStockTakeDate}` },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
            {workspace.business?.name || 'Inventory Dashboard'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {workspace.business?.category} · {workspace.locations.length} storage locations · Workspace {workspace.workspaceCode}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('ai_camera')}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            AI Camera Count
          </button>
          <button
            type="button"
            onClick={() => onNavigate('products')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Product
          </button>
          <button
            type="button"
            onClick={() => onNavigate('stock_taking')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            Stock Take
          </button>
        </div>
      </div>

      {/* 12-Metric KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{k.label}</span>
              {k.warn && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Attention
                </span>
              )}
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
              {k.value}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {workspace.products.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
          <Package className="w-10 h-10 text-slate-400 mx-auto" />
          <h2 className="mt-3 font-display text-lg font-semibold text-slate-900 dark:text-white">
            Register your first product to start tracking
          </h2>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Add products manually, capture multi-angle photos for AI recognition training, or import your catalog spreadsheet.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('products')}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-medium text-white cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Register First Product
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Incoming vs Outgoing 7-day Flow Chart */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  7-Day Stock Flow
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Real-time incoming vs outgoing unit movements
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-600" />
                  Incoming
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 dark:bg-slate-600" />
                  Outgoing
                </span>
              </div>
            </div>

            <div className="h-52 flex items-end justify-between gap-2 pt-4 border-b border-slate-100 dark:border-slate-800 pb-2">
              {metrics.dailyFlows.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <div className="w-full flex items-end justify-center gap-1 h-40">
                    <div
                      title={`Incoming: ${d.incoming}`}
                      className="w-3 sm:w-4 bg-blue-600 rounded-t transition-all"
                      style={{ height: `${Math.max(4, (d.incoming / maxFlow) * 100)}%` }}
                    />
                    <div
                      title={`Outgoing: ${d.outgoing}`}
                      className="w-3 sm:w-4 bg-slate-300 dark:bg-slate-700 rounded-t transition-all"
                      style={{ height: `${Math.max(4, (d.outgoing / maxFlow) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{d.date}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Category Valuation Breakdown */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Valuation by Category
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Current stock value across product groups
            </p>
            <div className="space-y-3.5">
              {metrics.categoryTotals.map((c) => (
                <div key={c.category}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{c.category}</span>
                    <span className="font-mono text-slate-900 dark:text-white tabular-nums">
                      {formatCurrency(c.value)} ({c.qty})
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${Math.max(4, (c.value / maxCatVal) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Permanent Ledger Transactions */}
          <div className="lg:col-span-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Recent Inventory Ledger Transactions
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Every stock movement is permanently recorded with before/after balances
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                Full Reports →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Reference</th>
                    <th className="py-2.5 px-4 font-medium">Type</th>
                    <th className="py-2.5 px-4 font-medium">Product</th>
                    <th className="py-2.5 px-4 font-medium">Location</th>
                    <th className="py-2.5 px-4 font-medium text-right">Delta</th>
                    <th className="py-2.5 px-4 font-medium text-right">New Balance</th>
                    <th className="py-2.5 px-4 font-medium">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {workspace.transactions.slice(0, 8).map((tx) => {
                    const prod = workspace.products.find((p) => p.id === tx.productId);
                    const loc = workspace.locations.find((l) => l.id === tx.locationId);
                    const isPositive = tx.quantityDelta >= 0;
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-300">{tx.referenceNumber}</td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{tx.type.replace(/_/g, ' ')}</td>
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">{prod?.name || 'Unknown'}</td>
                        <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">{loc?.locationName || 'Store'}</td>
                        <td
                          className={`py-2.5 px-4 font-mono text-right tabular-nums ${
                            isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          <span className="inline-flex items-center gap-0.5">
                            {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {isPositive ? `+${tx.quantityDelta}` : tx.quantityDelta}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right text-slate-900 dark:text-white tabular-nums">
                          {tx.newBalance}
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">{tx.performedBy}</td>
                      </tr>
                    );
                  })}
                  {workspace.transactions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500">
                        No transactions recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
