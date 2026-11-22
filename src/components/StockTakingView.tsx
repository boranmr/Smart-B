import React, { useMemo, useState } from 'react';
import { Camera, CheckCircle2, ClipboardCheck, FileSpreadsheet, Plus } from 'lucide-react';
import { readSheet } from 'read-excel-file/browser';
import { useInventory } from '../context/InventoryContext';
import type { StockTakingItem, StockTakingSession } from '../types/inventory';

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export const StockTakingView: React.FC<{
  onLaunchAICamera: (productId: string, sessionId: string) => void;
}> = ({ onLaunchAICamera }) => {
  const { workspace, user, dispatchMutation, getProductStock } = useInventory();
  const [selectedLocationId, setSelectedLocationId] = useState(workspace?.locations[0]?.id || '');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    workspace?.stockTakingSessions.find((s) => s.status === 'in_progress')?.id || null
  );
  const [manualCounts, setManualCounts] = useState<Record<string, number>>({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const activeSession = useMemo(
    () => workspace?.stockTakingSessions.find((s) => s.id === activeSessionId) || null,
    [workspace?.stockTakingSessions, activeSessionId]
  );

  const categories = useMemo(() => {
    const set = new Set((workspace?.products || []).map((p) => p.category));
    return ['All', ...Array.from(set)];
  }, [workspace?.products]);

  const productsToCount = useMemo(() => {
    return (workspace?.products || []).filter(
      (p) => categoryFilter === 'All' || p.category === categoryFilter
    );
  }, [workspace?.products, categoryFilter]);

  const startNewSession = async () => {
    const locId = selectedLocationId || workspace?.locations[0]?.id || '';
    const loc = workspace?.locations.find((l) => l.id === locId);
    const session: StockTakingSession = {
      id: crypto.randomUUID(),
      mutationId: crypto.randomUUID(),
      title: `${loc?.locationName || 'Store'} Audit · ${new Date().toLocaleDateString()}`,
      locationId: locId,
      categoryFilter,
      status: 'in_progress',
      items: [],
      startedBy: user?.name || 'Staff',
      createdAt: new Date().toISOString(),
    };
    await dispatchMutation('SAVE_STOCK_TAKING_SESSION', { session });
    setActiveSessionId(session.id);
    setFeedback('Started new stock-taking session.');
  };

  const computeProductComparison = (productId: string, locationId: string) => {
    const currentBal = getProductStock(productId, locationId);
    const txs = (workspace?.transactions || []).filter(
      (t) => t.productId === productId && t.locationId === locationId
    );
    const receivedSinceLast = txs
      .filter((t) => t.type === 'INCOMING' || t.type === 'TRANSFER_IN')
      .reduce((s, t) => s + t.quantityDelta, 0);
    const issuedSinceLast = txs
      .filter((t) => t.type === 'OUTGOING' || t.type === 'TRANSFER_OUT')
      .reduce((s, t) => s + Math.abs(t.quantityDelta), 0);
    const damagedSinceLast = txs
      .filter((t) => t.type === 'DAMAGE_DEDUCTION' || t.type === 'EXPIRED_DISPOSAL')
      .reduce((s, t) => s + Math.abs(t.quantityDelta), 0);
    const openingOrPrev = currentBal - receivedSinceLast + issuedSinceLast + damagedSinceLast;

    return {
      previousStock: Math.max(0, openingOrPrev),
      receivedSinceLast,
      issuedSinceLast,
      damagedSinceLast,
      expectedStock: currentBal,
    };
  };

  const saveProductCount = async (
    productId: string,
    physicalCount: number,
    method: StockTakingItem['method'] = 'manual'
  ) => {
    if (!activeSession) return;
    const comp = computeProductComparison(productId, activeSession.locationId);
    const item: StockTakingItem = {
      id: crypto.randomUUID(),
      productId,
      locationId: activeSession.locationId,
      method,
      ...comp,
      physicalCount,
      openBottlesCount: 0,
      uncertainCount: 0,
      variance: physicalCount - comp.expectedStock,
      notes: notesMap[productId] || '',
      countedBy: user?.name || 'Staff',
      countedAt: new Date().toISOString(),
    };
    const updated: StockTakingSession = {
      ...activeSession,
      items: [...activeSession.items.filter((i) => i.productId !== productId), item],
    };
    await dispatchMutation('SAVE_STOCK_TAKING_SESSION', { session: updated });
    setFeedback('Saved product physical count to session.');
  };

  const handleSpreadsheetImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeSession || !workspace) return;

    try {
      const matrix: unknown[][] = file.name.toLowerCase().endsWith('.csv')
        ? parseCsvRows(await file.text())
        : await readSheet(file);

      if (matrix.length < 2) {
        setFeedback('Spreadsheet appears empty or lacks header + data rows.');
        return;
      }

      const headers = matrix[0].map((h) => String(h ?? '').trim());
      const rows: Record<string, unknown>[] = matrix.slice(1).map((r) => {
        const obj: Record<string, unknown> = {};
        headers.forEach((h, idx) => {
          if (h) obj[h] = r[idx];
        });
        return obj;
      });

      const importedItems: StockTakingItem[] = [...activeSession.items];
      let matched = 0;

      for (const row of rows) {
        const sku = String(row.SKU || row.sku || row.Barcode || row.barcode || '').trim().toLowerCase();
        const name = String(row.Product || row.Name || row.name || '').trim().toLowerCase();
        const qty = Number(row.Count ?? row.Quantity ?? row.Physical ?? row.qty ?? NaN);
        if (Number.isNaN(qty)) continue;

        const prod = workspace.products.find(
          (p) => (sku && (p.sku.toLowerCase() === sku || p.barcode.toLowerCase() === sku)) || (name && p.name.toLowerCase() === name)
        );
        if (!prod) continue;
        matched += 1;
        const comp = computeProductComparison(prod.id, activeSession.locationId);
        const item: StockTakingItem = {
          id: crypto.randomUUID(),
          productId: prod.id,
          locationId: activeSession.locationId,
          method: 'spreadsheet',
          ...comp,
          physicalCount: qty,
          openBottlesCount: 0,
          uncertainCount: 0,
          variance: qty - comp.expectedStock,
          countedBy: user?.name || 'Import',
          countedAt: new Date().toISOString(),
        };
        const idx = importedItems.findIndex((i) => i.productId === prod.id);
        if (idx >= 0) importedItems[idx] = item;
        else importedItems.push(item);
      }

      await dispatchMutation('SAVE_STOCK_TAKING_SESSION', {
        session: { ...activeSession, items: importedItems },
      });
      setFeedback(`Imported ${matched} matching product counts from spreadsheet.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to parse spreadsheet file.');
    } finally {
      e.target.value = '';
    }
  };

  const finalizeSession = async () => {
    if (!activeSession) return;
    const finalized: StockTakingSession = {
      ...activeSession,
      status: 'finalized',
      finalizedBy: user?.name || 'Manager',
      finalizedAt: new Date().toISOString(),
    };
    await dispatchMutation('SAVE_STOCK_TAKING_SESSION', { session: finalized });
    setFeedback('Stock-taking session finalized and inventory balances reconciled.');
    setActiveSessionId(null);
  };

  if (!workspace) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
            Stock-Taking &amp; Variance Reconciliation
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Count by location using AI Camera, Barcode/QR, Manual Entry, or Spreadsheet Import (.xlsx / .csv)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!activeSession ? (
            <button
              type="button"
              onClick={startNewSession}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-medium text-white cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Start Stock-Taking Session
            </button>
          ) : (
            <>
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Import Spreadsheet
                <input type="file" accept=".xlsx,.csv" onChange={handleSpreadsheetImport} className="hidden" />
              </label>
              <button
                type="button"
                onClick={finalizeSession}
                disabled={activeSession.items.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-4 py-2 text-xs font-medium text-white cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Submit &amp; Finalize ({activeSession.items.length})
              </button>
            </>
          )}
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 text-xs text-blue-800 dark:text-blue-200 flex justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Location & Category Filter */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Step 1: Branch / Storage Location
          </label>
          <select
            value={activeSession?.locationId || selectedLocationId}
            disabled={Boolean(activeSession)}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
          >
            {workspace.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.branchName} · {l.locationName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Step 2: Product Category
          </label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active Session Counting Table */}
      {activeSession ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-900 dark:text-white">
              Active Session: {activeSession.title} ({activeSession.items.length}/{productsToCount.length} counted)
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Product</th>
                  <th className="py-2.5 px-4 font-medium text-right">Prev</th>
                  <th className="py-2.5 px-4 font-medium text-right">In / Out</th>
                  <th className="py-2.5 px-4 font-medium text-right">Expected</th>
                  <th className="py-2.5 px-4 font-medium text-right">Physical Count</th>
                  <th className="py-2.5 px-4 font-medium text-right">Variance</th>
                  <th className="py-2.5 px-4 font-medium">Investigation Notes</th>
                  <th className="py-2.5 px-4 font-medium text-right">Method / Save</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {productsToCount.map((p) => {
                  const comp = computeProductComparison(p.id, activeSession.locationId);
                  const savedItem = activeSession.items.find((i) => i.productId === p.id);
                  const inputVal = manualCounts[p.id] ?? savedItem?.physicalCount ?? comp.expectedStock;
                  const variance = inputVal - comp.expectedStock;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900 dark:text-white">{p.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {p.brand} · {p.unit}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">{comp.previousStock}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                        +{comp.receivedSinceLast} / -{comp.issuedSinceLast + comp.damagedSinceLast}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                        {comp.expectedStock}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <input
                          type="number"
                          min={0}
                          value={inputVal}
                          onChange={(e) =>
                            setManualCounts((prev) => ({ ...prev, [p.id]: Math.max(0, Number(e.target.value)) }))
                          }
                          className="w-20 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-right font-mono text-xs text-slate-900 dark:text-white"
                        />
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono font-semibold tabular-nums ${
                          variance === 0
                            ? 'text-emerald-600'
                            : variance < 0
                            ? 'text-red-600'
                            : 'text-amber-600'
                        }`}
                      >
                        {variance > 0 ? `+${variance}` : variance}
                      </td>
                      <td className="py-2.5 px-4">
                        <input
                          type="text"
                          value={notesMap[p.id] ?? savedItem?.notes ?? ''}
                          onChange={(e) => setNotesMap((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          placeholder="Reason for variance..."
                          className="w-36 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs text-slate-700 dark:text-slate-200"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onLaunchAICamera(p.id, activeSession.id)}
                            title="Count via AI Camera"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 text-white text-[11px] font-medium cursor-pointer"
                          >
                            <Camera className="w-3 h-3" />
                            AI Scan
                          </button>
                          <button
                            type="button"
                            onClick={() => saveProductCount(p.id, inputVal, 'manual')}
                            className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            {savedItem ? 'Update' : 'Save'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
          <ClipboardCheck className="w-9 h-9 text-slate-400 mx-auto" />
          <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-white">
            No Active Stock-Taking Session
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Select a location above and click "Start Stock-Taking Session" to count products and reconcile variances.
          </p>
        </div>
      )}

      {/* Historical Stock-Taking Sessions */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-display text-sm font-semibold text-slate-900 dark:text-white">
          Stock-Taking Session History
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {workspace.stockTakingSessions.map((s) => {
            const totalVar = s.items.reduce((acc, i) => acc + i.variance, 0);
            return (
              <div key={s.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-medium text-slate-900 dark:text-white">{s.title}</div>
                  <div className="text-[11px] text-slate-500">
                    {s.items.length} products · Started by {s.startedBy} · {new Date(s.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    Net Variance: {totalVar > 0 ? `+${totalVar}` : totalVar}
                  </span>
                  <span className="capitalize font-medium text-slate-700 dark:text-slate-200">{s.status.replace('_', ' ')}</span>
                  {s.status === 'in_progress' && (
                    <button
                      type="button"
                      onClick={() => setActiveSessionId(s.id)}
                      className="text-blue-600 font-medium hover:underline cursor-pointer"
                    >
                      Resume
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {workspace.stockTakingSessions.length === 0 && (
            <div className="py-6 text-center text-xs text-slate-500">No stock-taking sessions recorded yet.</div>
          )}
        </div>
      </div>
    </div>
  );
};
