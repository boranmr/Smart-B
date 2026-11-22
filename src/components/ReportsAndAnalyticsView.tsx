import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { exportReportAsCSV, exportReportAsPDF, exportReportAsXLSX } from '../lib/reportExports';

export const ReportsAndAnalyticsView: React.FC<{ initialMode?: 'reports' | 'analytics' }> = ({
  initialMode = 'reports',
}) => {
  const { workspace, user, formatCurrency, getProductStock } = useInventory();
  const [mode, setMode] = useState<'reports' | 'analytics'>(initialMode);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(Date.now() - 30 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [locationFilter, setLocationFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [brandFilter, setBrandFilter] = useState('All');
  const [txTypeFilter, setTxTypeFilter] = useState('All');

  React.useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const applyPeriodPreset = (p: 'daily' | 'weekly' | 'monthly') => {
    setPeriod(p);
    const now = new Date();
    const days = p === 'daily' ? 0 : p === 'weekly' ? 7 : 30;
    const from = new Date(now.getTime() - days * 86400000);
    setStartDate(from.toISOString().slice(0, 10));
    setEndDate(now.toISOString().slice(0, 10));
  };

  const reportData = useMemo(() => {
    if (!workspace) return null;
    const startMs = Date.parse(`${startDate}T00:00:00`);
    const endMs = Date.parse(`${endDate}T23:59:59`);

    const filteredProducts = workspace.products.filter(
      (p) =>
        (categoryFilter === 'All' || p.category === categoryFilter) &&
        (brandFilter === 'All' || p.brand === brandFilter)
    );
    const productIds = new Set(filteredProducts.map((p) => p.id));

    const filteredTxs = workspace.transactions.filter((tx) => {
      const ts = Date.parse(tx.createdAt);
      if (ts < startMs || ts > endMs) return false;
      if (!productIds.has(tx.productId)) return false;
      if (locationFilter !== 'All' && tx.locationId !== locationFilter) return false;
      if (txTypeFilter !== 'All' && tx.type !== txTypeFilter) return false;
      return true;
    });

    let totalIncoming = 0;
    let totalOutgoing = 0;
    let totalDamaged = 0;
    let totalExpired = 0;
    let totalVariance = 0;
    let lossValue = 0;

    for (const tx of filteredTxs) {
      if (tx.type === 'INCOMING') totalIncoming += tx.quantityDelta;
      if (tx.type === 'OUTGOING') totalOutgoing += Math.abs(tx.quantityDelta);
      if (tx.type === 'DAMAGE_DEDUCTION') {
        totalDamaged += Math.abs(tx.quantityDelta);
        lossValue += tx.totalValue;
      }
      if (tx.type === 'EXPIRED_DISPOSAL') {
        totalExpired += Math.abs(tx.quantityDelta);
        lossValue += tx.totalValue;
      }
      if (tx.type === 'STOCK_TAKE_ADJUSTMENT') {
        totalVariance += tx.quantityDelta;
        if (tx.quantityDelta < 0) lossValue += tx.totalValue;
      }
    }

    const closingBalance = filteredProducts.reduce(
      (s, p) => s + getProductStock(p.id, locationFilter === 'All' ? undefined : locationFilter),
      0
    );
    const netPeriodChange = filteredTxs.reduce((s, t) => s + t.quantityDelta, 0);
    const openingBalance = Math.max(0, closingBalance - netPeriodChange);
    const closingValuation = filteredProducts.reduce(
      (s, p) =>
        s + getProductStock(p.id, locationFilter === 'All' ? undefined : locationFilter) * (p.purchasePrice || 0),
      0
    );

    const lowStockCount = filteredProducts.filter((p) => {
      const q = getProductStock(p.id, locationFilter === 'All' ? undefined : locationFilter);
      return q > 0 && q <= p.minStockLevel;
    }).length;
    const outOfStockCount = filteredProducts.filter(
      (p) => getProductStock(p.id, locationFilter === 'All' ? undefined : locationFilter) <= 0
    ).length;

    const movementByProduct = new Map<string, number>();
    for (const p of filteredProducts) movementByProduct.set(p.id, 0);
    for (const tx of filteredTxs) {
      movementByProduct.set(tx.productId, (movementByProduct.get(tx.productId) || 0) + Math.abs(tx.quantityDelta));
    }

    const rankedProducts = filteredProducts
      .map((p) => ({
        product: p,
        moved: movementByProduct.get(p.id) || 0,
        stock: getProductStock(p.id, locationFilter === 'All' ? undefined : locationFilter),
      }))
      .sort((a, b) => b.moved - a.moved);

    const topMoving = rankedProducts.slice(0, 5);
    const slowMoving = [...rankedProducts].reverse().slice(0, 5);
    const missingUnits = Math.abs(Math.min(0, totalVariance));
    const turnoverRatio = closingBalance > 0 ? (totalOutgoing / closingBalance).toFixed(2) : '0.00';

    const productRows = filteredProducts.map((p) => {
      const pTxs = filteredTxs.filter((t) => t.productId === p.id);
      const inc = pTxs.filter((t) => t.type === 'INCOMING').reduce((s, t) => s + t.quantityDelta, 0);
      const out = pTxs.filter((t) => t.type === 'OUTGOING').reduce((s, t) => s + Math.abs(t.quantityDelta), 0);
      const dmg = pTxs.filter((t) => t.type === 'DAMAGE_DEDUCTION').reduce((s, t) => s + Math.abs(t.quantityDelta), 0);
      const exp = pTxs.filter((t) => t.type === 'EXPIRED_DISPOSAL').reduce((s, t) => s + Math.abs(t.quantityDelta), 0);
      const disc = pTxs.filter((t) => t.type === 'STOCK_TAKE_ADJUSTMENT').reduce((s, t) => s + t.quantityDelta, 0);
      const close = getProductStock(p.id, locationFilter === 'All' ? undefined : locationFilter);
      const open = Math.max(0, close - pTxs.reduce((s, t) => s + t.quantityDelta, 0));
      return {
        product: p,
        open,
        inc,
        out,
        dmg,
        exp,
        disc,
        close,
        val: close * (p.purchasePrice || 0),
      };
    });

    // Analytics datasets (Charts A-I)
    const dayBuckets = new Map<string, { incoming: number; outgoing: number; valuation: number; level: number }>();
    for (let i = 13; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      dayBuckets.set(day, { incoming: 0, outgoing: 0, valuation: closingValuation, level: closingBalance });
    }
    for (const tx of workspace.transactions) {
      const d = tx.createdAt.slice(0, 10);
      const b = dayBuckets.get(d);
      if (b) {
        if (tx.quantityDelta > 0) b.incoming += tx.quantityDelta;
        else b.outgoing += Math.abs(tx.quantityDelta);
      }
    }

    const damageByType = new Map<string, number>();
    for (const d of workspace.damageReports) {
      if (d.status === 'approved') {
        damageByType.set(d.damageType, (damageByType.get(d.damageType) || 0) + d.quantity);
      }
    }
    if (totalExpired > 0) damageByType.set('Expired Disposal', totalExpired);

    const monthlyMap = new Map<string, { incoming: number; outgoing: number }>();
    for (const tx of workspace.transactions) {
      const ym = tx.createdAt.slice(0, 7);
      const prev = monthlyMap.get(ym) || { incoming: 0, outgoing: 0 };
      if (tx.quantityDelta > 0) prev.incoming += tx.quantityDelta;
      else prev.outgoing += Math.abs(tx.quantityDelta);
      monthlyMap.set(ym, prev);
    }

    const categoryDist = new Map<string, number>();
    for (const p of workspace.products) {
      const q = getProductStock(p.id);
      categoryDist.set(p.category, (categoryDist.get(p.category) || 0) + q);
    }

    const varianceItems = workspace.stockTakingSessions
      .flatMap((s) => s.items)
      .filter((i) => i.variance !== 0)
      .slice(0, 8);

    return {
      openingBalance,
      totalIncoming,
      totalOutgoing,
      totalDamaged,
      totalExpired,
      missingUnits,
      closingBalance,
      totalVariance,
      closingValuation,
      lossValue,
      lowStockCount,
      outOfStockCount,
      turnoverRatio,
      topMoving,
      slowMoving,
      productRows,
      daySeries: Array.from(dayBuckets.entries()).map(([date, v]) => ({ date: date.slice(5), ...v })),
      damageBreakdown: Array.from(damageByType.entries()).map(([type, qty]) => ({ type, qty })),
      monthlySeries: Array.from(monthlyMap.entries()).map(([month, v]) => ({ month, ...v })).slice(-6),
      categoryDist: Array.from(categoryDist.entries()).map(([cat, qty]) => ({ cat, qty })),
      varianceItems,
    };
  }, [workspace, startDate, endDate, locationFilter, categoryFilter, brandFilter, txTypeFilter, getProductStock]);

  if (!workspace || !reportData) return null;

  const categories = ['All', ...Array.from(new Set(workspace.products.map((p) => p.category)))];
  const brands = ['All', ...Array.from(new Set(workspace.products.map((p) => p.brand)))];

  const buildExportPayload = () => ({
    businessName: workspace.business?.name || 'Smart Inventory AI',
    businessLocation: workspace.business?.location,
    logoDataUrl: workspace.business?.logoDataUrl,
    reportTitle: `${period.toUpperCase()} INVENTORY REPORT`,
    periodLabel: `${startDate} to ${endDate}`,
    preparedBy: user?.name || 'Inventory Staff',
    approvedBy: 'Authorized Manager',
    columns: ['Product', 'Brand', 'SKU', 'Opening', 'Incoming', 'Outgoing', 'Damaged', 'Expired', 'Variance', 'Closing', 'Valuation'],
    rows: reportData.productRows.map((r) => [
      r.product.name,
      r.product.brand,
      r.product.sku,
      r.open,
      r.inc,
      r.out,
      r.dmg,
      r.exp,
      r.disc,
      r.close,
      formatCurrency(r.val),
    ]),
    summaryMetrics: [
      { label: 'Opening Balance', value: String(reportData.openingBalance) },
      { label: 'Total Received', value: String(reportData.totalIncoming) },
      { label: 'Total Issued/Sold', value: String(reportData.totalOutgoing) },
      { label: 'Damaged / Expired', value: `${reportData.totalDamaged} / ${reportData.totalExpired}` },
      { label: 'Closing Balance', value: String(reportData.closingBalance) },
      { label: 'Stock Valuation', value: formatCurrency(reportData.closingValuation) },
      { label: 'Loss Valuation', value: formatCurrency(reportData.lossValue) },
      { label: 'Turnover Ratio', value: `${reportData.turnoverRatio}x` },
    ],
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
            Inventory Reports &amp; Visual Analytics
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Generated strictly from permanent inventory transactions and stock balances.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setMode('reports')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
              mode === 'reports' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Reports &amp; Export
          </button>
          <button
            type="button"
            onClick={() => setMode('analytics')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
              mode === 'analytics' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Analytics Suite (9 Charts)
          </button>
        </div>
      </div>

      {mode === 'reports' ? (
        <>
          {/* Filter Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 no-print">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(['daily', 'weekly', 'monthly'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyPeriodPreset(p)}
                    className={`px-3 py-1 rounded-md text-xs font-medium capitalize cursor-pointer ${
                      period === p ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportReportAsPDF(buildExportPayload())}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 px-3 py-2 text-xs font-medium text-white cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => exportReportAsXLSX(buildExportPayload())}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Excel (XLSX)
                </button>
                <button
                  type="button"
                  onClick={() => exportReportAsCSV(buildExportPayload())}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-xs">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 font-mono text-slate-900 dark:text-white"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 font-mono text-slate-900 dark:text-white"
              />
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-slate-900 dark:text-white"
              >
                <option value="All">All Locations</option>
                {workspace.locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.locationName}</option>
                ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-slate-900 dark:text-white"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>
                ))}
              </select>
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-slate-900 dark:text-white"
              >
                {brands.map((b) => (
                  <option key={b} value={b}>{b === 'All' ? 'All Brands' : b}</option>
                ))}
              </select>
              <select
                value={txTypeFilter}
                onChange={(e) => setTxTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-slate-900 dark:text-white"
              >
                <option value="All">All Transactions</option>
                <option value="INCOMING">Incoming</option>
                <option value="OUTGOING">Outgoing</option>
                <option value="DAMAGE_DEDUCTION">Damaged</option>
                <option value="EXPIRED_DISPOSAL">Expired</option>
                <option value="STOCK_TAKE_ADJUSTMENT">Variance Adj.</option>
              </select>
            </div>
          </div>

          {/* Printable Comprehensive Report Sheet */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                {workspace.business?.logoDataUrl && (
                  <img src={workspace.business.logoDataUrl} alt="Logo" className="w-12 h-12 rounded-lg object-cover border border-slate-200" />
                )}
                <div>
                  <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
                    {workspace.business?.name || 'Smart Inventory AI'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {period.toUpperCase()} INVENTORY RECONCILIATION REPORT · {startDate} to {endDate}
                  </p>
                </div>
              </div>
              <div className="text-right text-xs text-slate-500">
                <div>Generated: {new Date().toLocaleString()}</div>
                <div>Prepared By: {user?.name || 'Staff'}</div>
              </div>
            </div>

            {/* 18-Metric Monthly Executive Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              {[
                ['Opening Balance', reportData.openingBalance],
                ['Stock Received', `+${reportData.totalIncoming}`],
                ['Stock Issued / Sold', `-${reportData.totalOutgoing}`],
                ['Damaged Stock', reportData.totalDamaged],
                ['Expired Stock', reportData.totalExpired],
                ['Missing / Shrinkage', reportData.missingUnits],
                ['Closing Balance', reportData.closingBalance],
                ['Net Discrepancy', reportData.totalVariance],
                ['Stock Valuation', formatCurrency(reportData.closingValuation)],
                ['Loss Valuation', formatCurrency(reportData.lossValue)],
                ['Low / Out of Stock', `${reportData.lowStockCount} / ${reportData.outOfStockCount}`],
                ['Inventory Turnover', `${reportData.turnoverRatio}x`],
              ].map(([label, val]) => (
                <div key={String(label)} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">{label}</div>
                  <div className="font-mono text-sm font-semibold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    {val}
                  </div>
                </div>
              ))}
            </div>

            {/* Product Breakdown Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3">Product</th>
                    <th className="py-2.5 px-3 text-right">Opening</th>
                    <th className="py-2.5 px-3 text-right">Received</th>
                    <th className="py-2.5 px-3 text-right">Issued</th>
                    <th className="py-2.5 px-3 text-right">Damaged</th>
                    <th className="py-2.5 px-3 text-right">Expired</th>
                    <th className="py-2.5 px-3 text-right">Variance</th>
                    <th className="py-2.5 px-3 text-right">Closing</th>
                    <th className="py-2.5 px-3 text-right">Valuation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {reportData.productRows.map((r) => (
                    <tr key={r.product.id}>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900 dark:text-white">{r.product.name}</div>
                        <div className="text-[11px] text-slate-400">{r.product.brand} · {r.product.sku}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{r.open}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-600">+{r.inc}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">-{r.out}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-red-600">{r.dmg}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-600">{r.exp}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{r.disc}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">{r.close}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatCurrency(r.val)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-6 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs text-slate-600 dark:text-slate-400">
              <div>Prepared By: <strong>{user?.name || 'Staff'}</strong> ___________________________</div>
              <div>Approved By: <strong>Supervisor / Manager</strong> ___________________________</div>
            </div>
          </div>
        </>
      ) : (
        /* 9-CHART VISUAL ANALYTICS SUITE */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* A. Stock Level Over Time */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">A. Stock Level Trend</h3>
            <p className="text-[11px] text-slate-500 mb-3">14-day physical balance trajectory</p>
            <div className="h-36 flex items-end gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1">
              {reportData.daySeries.map((d) => {
                const max = Math.max(1, ...reportData.daySeries.map((x) => x.level));
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div className="w-full bg-blue-600/80 rounded-t" style={{ height: `${Math.max(8, (d.level / max) * 100)}%` }} title={`${d.date}: ${d.level}`} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* B. Incoming vs Outgoing */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">B. Incoming vs Outgoing</h3>
            <p className="text-[11px] text-slate-500 mb-3">Daily receipts vs issues</p>
            <div className="h-36 flex items-end gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1">
              {reportData.daySeries.slice(-7).map((d) => {
                const max = Math.max(1, ...reportData.daySeries.flatMap((x) => [x.incoming, x.outgoing]));
                return (
                  <div key={d.date} className="flex-1 flex items-end justify-center gap-0.5 h-full">
                    <div className="w-2 bg-emerald-600 rounded-t" style={{ height: `${Math.max(4, (d.incoming / max) * 100)}%` }} />
                    <div className="w-2 bg-slate-400 rounded-t" style={{ height: `${Math.max(4, (d.outgoing / max) * 100)}%` }} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* C. Damaged & Loss Stock */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">C. Damaged &amp; Expired Loss</h3>
            <p className="text-[11px] text-slate-500 mb-3">Approved deductions by loss reason</p>
            <div className="space-y-2.5">
              {reportData.damageBreakdown.map((d) => (
                <div key={d.type} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-300">{d.type}</span>
                  <span className="font-mono font-semibold text-red-600">{d.qty} units</span>
                </div>
              ))}
              {reportData.damageBreakdown.length === 0 && (
                <div className="text-xs text-slate-400 py-8 text-center">Zero approved damage or expiry losses.</div>
              )}
            </div>
          </div>

          {/* D. Monthly Comparison */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">D. Monthly Comparison</h3>
            <p className="text-[11px] text-slate-500 mb-3">Inflows vs outflows by month</p>
            <div className="space-y-2">
              {reportData.monthlySeries.map((m) => (
                <div key={m.month} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-500">{m.month}</span>
                  <span>
                    <span className="text-emerald-600">+{m.incoming}</span> / <span className="text-slate-500">-{m.outgoing}</span>
                  </span>
                </div>
              ))}
              {reportData.monthlySeries.length === 0 && <div className="text-xs text-slate-400 py-8 text-center">No monthly transactions yet.</div>}
            </div>
          </div>

          {/* E. Category Distribution */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">E. Category Distribution</h3>
            <p className="text-[11px] text-slate-500 mb-3">Units on hand per category</p>
            <div className="space-y-2">
              {reportData.categoryDist.slice(0, 5).map((c) => (
                <div key={c.cat} className="flex items-center justify-between text-xs">
                  <span className="truncate text-slate-700 dark:text-slate-300">{c.cat}</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">{c.qty}</span>
                </div>
              ))}
            </div>
          </div>

          {/* F. Stock Valuation */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">F. Stock Valuation</h3>
            <p className="text-[11px] text-slate-500 mb-3">Total asset value &amp; loss impact</p>
            <div className="mt-4">
              <div className="text-xs text-slate-500">Current Inventory Asset Value</div>
              <div className="font-mono text-2xl font-semibold text-slate-900 dark:text-white mt-1">
                {formatCurrency(reportData.closingValuation)}
              </div>
              <div className="mt-3 text-xs text-red-600 font-mono">
                Period Loss Value: {formatCurrency(reportData.lossValue)}
              </div>
            </div>
          </div>

          {/* G. Top-Moving Products */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">G. Top-Moving Products</h3>
            <p className="text-[11px] text-slate-500 mb-3">Highest cumulative unit movement</p>
            <div className="space-y-2">
              {reportData.topMoving.map((t) => (
                <div key={t.product.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-slate-700 dark:text-slate-300">{t.product.name}</span>
                  <span className="font-mono font-semibold text-blue-600">{t.moved} moved</span>
                </div>
              ))}
            </div>
          </div>

          {/* H. Slow-Moving / Dead Stock */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">H. Slow-Moving &amp; Dead Stock</h3>
            <p className="text-[11px] text-slate-500 mb-3">Lowest turnover products</p>
            <div className="space-y-2">
              {reportData.slowMoving.map((t) => (
                <div key={t.product.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-slate-700 dark:text-slate-300">{t.product.name}</span>
                  <span className="font-mono text-slate-500">{t.moved} moved ({t.stock} on hand)</span>
                </div>
              ))}
            </div>
          </div>

          {/* I. Stock Variance Chart */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">I. Stock-Take Variances</h3>
            <p className="text-[11px] text-slate-500 mb-3">Expected vs physically counted discrepancies</p>
            <div className="space-y-2">
              {reportData.varianceItems.map((v) => {
                const p = workspace.products.find((x) => x.id === v.productId);
                return (
                  <div key={v.id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-slate-700 dark:text-slate-300">{p?.name || 'SKU'}</span>
                    <span className={`font-mono font-semibold ${v.variance < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                      {v.variance > 0 ? `+${v.variance}` : v.variance}
                    </span>
                  </div>
                );
              })}
              {reportData.varianceItems.length === 0 && (
                <div className="text-xs text-slate-400 py-8 text-center">No stock-taking variances recorded.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
