import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  Clock,
  PackageCheck,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { STANDARD_UNITS } from '../data/presets';
import type {
  DamageReport,
  DamageType,
  ExpiredDisposalRecord,
  IncomingStockRecord,
  OutgoingStockRecord,
  StockTransferRecord,
} from '../types/inventory';

type OperationTab = 'incoming' | 'outgoing' | 'damaged' | 'expired' | 'transfers';

export const StockOperationsView: React.FC<{ initialTab?: OperationTab }> = ({ initialTab = 'incoming' }) => {
  const { workspace, user, dispatchMutation, formatCurrency, getProductStock, convertUnits } = useInventory();
  const [tab, setTab] = useState<OperationTab>(initialTab);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  React.useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Incoming state
  const [incForm, setIncForm] = useState({
    receiptNumber: `RCV-${Date.now().toString().slice(-6)}`,
    dateReceived: new Date().toISOString().slice(0, 10),
    sourceType: 'Supplier' as IncomingStockRecord['sourceType'],
    supplierId: workspace?.suppliers[0]?.id || '',
    sourceName: '',
    productId: workspace?.products[0]?.id || '',
    locationId: workspace?.locations[0]?.id || '',
    enteredQuantity: 10,
    enteredUnit: workspace?.products[0]?.unit || 'Bottles',
    damagedOnArrival: 0,
    purchasePrice: workspace?.products[0]?.purchasePrice || 0,
    batchNumber: '',
    expirationDate: '',
    invoiceNumber: '',
    condition: 'Good' as IncomingStockRecord['condition'],
    notes: '',
    confirmImmediately: true,
  });

  // Outgoing state
  const [outForm, setOutForm] = useState({
    referenceNumber: `OUT-${Date.now().toString().slice(-6)}`,
    productId: workspace?.products[0]?.id || '',
    locationId: workspace?.locations[0]?.id || '',
    quantity: 1,
    unit: workspace?.products[0]?.unit || 'Bottles',
    destination: 'Main Bar / Customer',
    reason: 'Sale' as OutgoingStockRecord['reason'],
    notes: '',
    approveImmediately: true,
  });

  // Damage state
  const [dmgForm, setDmgForm] = useState({
    productId: workspace?.products[0]?.id || '',
    locationId: workspace?.locations[0]?.id || '',
    quantity: 1,
    damageType: 'Broken' as DamageType,
    description: '',
    photoDataUrl: '',
  });

  // Transfer state
  const [trForm, setTrForm] = useState({
    productId: workspace?.products[0]?.id || '',
    fromLocationId: workspace?.locations[0]?.id || '',
    toLocationId: workspace?.locations[1]?.id || workspace?.locations[0]?.id || '',
    quantity: 1,
    notes: '',
    dispatchImmediately: true,
  });

  if (!workspace) return null;

  const canApprove = user?.role === 'Super Administrator' || user?.role === 'Manager';
  const isReadOnly = user?.role === 'Auditor';

  const incProduct = workspace.products.find((p) => p.id === incForm.productId);
  const convertedIncoming = incProduct
    ? convertUnits(Number(incForm.enteredQuantity) || 0, incForm.enteredUnit, incProduct.unit, incProduct.id)
    : Number(incForm.enteredQuantity) || 0;
  const acceptedIncoming = Math.max(0, convertedIncoming - (Number(incForm.damagedOnArrival) || 0));

  const outProduct = workspace.products.find((p) => p.id === outForm.productId);
  const convertedOutgoing = outProduct
    ? convertUnits(Number(outForm.quantity) || 0, outForm.unit, outProduct.unit, outProduct.id)
    : Number(outForm.quantity) || 0;

  const unitChoices = Array.from(
    new Set([
      ...(incProduct ? [incProduct.unit] : []),
      ...workspace.unitConversions.map((u) => u.fromUnit),
      ...STANDARD_UNITS,
    ])
  );

  const handleCreateIncoming = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incProduct) return;
    const supplierObj = workspace.suppliers.find((s) => s.id === incForm.supplierId);
    const record: IncomingStockRecord = {
      id: crypto.randomUUID(),
      mutationId: crypto.randomUUID(),
      receiptNumber: incForm.receiptNumber.trim() || `RCV-${Date.now().toString().slice(-6)}`,
      dateReceived: incForm.dateReceived,
      supplierId: incForm.supplierId || undefined,
      sourceName: incForm.sourceName.trim() || supplierObj?.name || incForm.sourceType,
      sourceType: incForm.sourceType,
      productId: incProduct.id,
      locationId: incForm.locationId,
      enteredQuantity: Number(incForm.enteredQuantity) || 0,
      enteredUnit: incForm.enteredUnit,
      convertedQuantity: convertedIncoming,
      damagedOnArrival: Number(incForm.damagedOnArrival) || 0,
      acceptedQuantity: acceptedIncoming,
      purchasePrice: Number(incForm.purchasePrice) || incProduct.purchasePrice,
      batchNumber: incForm.batchNumber.trim() || undefined,
      expirationDate: incForm.expirationDate || undefined,
      invoiceNumber: incForm.invoiceNumber.trim(),
      receivedBy: user?.name || 'Staff',
      verifiedBy: incForm.confirmImmediately && canApprove ? user?.name : undefined,
      condition: Number(incForm.damagedOnArrival) > 0 ? 'Partial Damage' : incForm.condition,
      notes: incForm.notes.trim(),
      status: incForm.confirmImmediately && canApprove ? 'confirmed' : 'pending',
      confirmedAt: incForm.confirmImmediately && canApprove ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString(),
    };
    const res = await dispatchMutation('CREATE_INCOMING_STOCK', { record });
    setMessage(
      res.ok
        ? {
            type: 'ok',
            text:
              record.status === 'confirmed'
                ? `Confirmed receipt ${record.receiptNumber}: +${acceptedIncoming} ${incProduct.unit} added to stock.`
                : `Saved receipt ${record.receiptNumber} as Pending Verification (stock not increased until confirmed).`,
          }
        : { type: 'err', text: res.error || 'Failed to save incoming stock.' }
    );
    setIncForm((f) => ({ ...f, receiptNumber: `RCV-${Date.now().toString().slice(-6)}`, notes: '' }));
  };

  const handleConfirmIncoming = async (recordId: string) => {
    const res = await dispatchMutation('CONFIRM_INCOMING_STOCK', { recordId, verifiedBy: user?.name });
    setMessage(res.ok ? { type: 'ok', text: 'Incoming stock confirmed and added to balance.' } : { type: 'err', text: res.error || 'Error confirming receipt.' });
  };

  const handleCreateOutgoing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outProduct) return;
    const record: OutgoingStockRecord = {
      id: crypto.randomUUID(),
      mutationId: crypto.randomUUID(),
      referenceNumber: outForm.referenceNumber.trim() || `OUT-${Date.now().toString().slice(-6)}`,
      productId: outProduct.id,
      locationId: outForm.locationId,
      quantity: Number(outForm.quantity) || 0,
      unit: outForm.unit,
      convertedQuantity: convertedOutgoing,
      destination: outForm.destination.trim(),
      reason: outForm.reason,
      employee: user?.name || 'Staff',
      approvedBy: outForm.approveImmediately && canApprove ? user?.name : undefined,
      status: outForm.approveImmediately && canApprove ? 'approved' : 'pending',
      notes: outForm.notes.trim(),
      createdAt: new Date().toISOString(),
    };
    const res = await dispatchMutation('RECORD_OUTGOING_STOCK', { record });
    setMessage(
      res.ok
        ? { type: 'ok', text: `Recorded outgoing ${record.referenceNumber} (${record.status}).` }
        : { type: 'err', text: res.error || 'Outgoing stock failed.' }
    );
    setOutForm((f) => ({ ...f, referenceNumber: `OUT-${Date.now().toString().slice(-6)}`, notes: '' }));
  };

  const handleDamagePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setDmgForm((d) => ({ ...d, photoDataUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitDamage = async (e: React.FormEvent) => {
    e.preventDefault();
    const prod = workspace.products.find((p) => p.id === dmgForm.productId);
    if (!prod) return;
    const autoApprove = !workspace.business?.preferences?.requireSupervisorApprovalForDamage || canApprove;
    const loss = (Number(dmgForm.quantity) || 0) * (prod.purchasePrice || 0);
    const report: DamageReport = {
      id: crypto.randomUUID(),
      mutationId: crypto.randomUUID(),
      productId: prod.id,
      locationId: dmgForm.locationId,
      quantity: Number(dmgForm.quantity) || 0,
      damageType: dmgForm.damageType,
      reportedAt: new Date().toISOString(),
      reportedBy: user?.name || 'Staff',
      description: dmgForm.description.trim() || `${dmgForm.damageType} reported`,
      photoDataUrl: dmgForm.photoDataUrl || undefined,
      financialLoss: loss,
      status: autoApprove ? 'approved' : 'pending',
      approvedBy: autoApprove ? user?.name : undefined,
      approvedAt: autoApprove ? new Date().toISOString() : undefined,
    };
    const res = await dispatchMutation('SUBMIT_DAMAGE_REPORT', { report });
    setMessage(
      res.ok
        ? {
            type: 'ok',
            text:
              report.status === 'approved'
                ? `Approved damage deduction of ${report.quantity} ${prod.unit} (Loss: ${formatCurrency(loss)}).`
                : 'Damage report submitted for supervisor approval.',
          }
        : { type: 'err', text: res.error || 'Failed to submit damage report.' }
    );
    setDmgForm((d) => ({ ...d, description: '', photoDataUrl: '' }));
  };

  const handleApproveDamage = async (reportId: string, decision: 'approved' | 'rejected') => {
    const res = await dispatchMutation('APPROVE_DAMAGE_REPORT', { reportId, decision });
    setMessage(
      res.ok
        ? { type: 'ok', text: `Damage report ${decision}.` }
        : { type: 'err', text: res.error || 'Action failed.' }
    );
  };

  const handleExpiredAction = async (productId: string, actionType: 'quarantined' | 'disposed') => {
    const prod = workspace.products.find((p) => p.id === productId);
    if (!prod) return;
    const locId = prod.defaultLocationId || workspace.locations[0]?.id || '';
    const qty = getProductStock(prod.id, locId);
    if (qty <= 0) return;

    const record: ExpiredDisposalRecord = {
      id: crypto.randomUUID(),
      mutationId: crypto.randomUUID(),
      productId: prod.id,
      locationId: locId,
      batchNumber: prod.batchNumber || 'N/A',
      expirationDate: prod.expirationDate || new Date().toISOString().slice(0, 10),
      quantity: qty,
      actionType,
      financialLoss: qty * (prod.purchasePrice || 0),
      reportedBy: user?.name || 'Staff',
      approvedBy: canApprove ? user?.name : undefined,
      status: canApprove ? 'approved' : 'pending',
      createdAt: new Date().toISOString(),
      approvedAt: canApprove ? new Date().toISOString() : undefined,
    };
    const res = await dispatchMutation('RECORD_EXPIRED_DISPOSAL', { record });
    setMessage(
      res.ok
        ? { type: 'ok', text: `Recorded ${actionType} for ${qty} ${prod.unit} of ${prod.name}.` }
        : { type: 'err', text: res.error || 'Failed to process expired stock.' }
    );
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (trForm.fromLocationId === trForm.toLocationId) {
      setMessage({ type: 'err', text: 'Sending and receiving locations must be different.' });
      return;
    }
    const transfer: StockTransferRecord = {
      id: crypto.randomUUID(),
      mutationId: crypto.randomUUID(),
      referenceNumber: `TRF-${Date.now().toString().slice(-6)}`,
      fromLocationId: trForm.fromLocationId,
      toLocationId: trForm.toLocationId,
      productId: trForm.productId,
      quantity: Number(trForm.quantity) || 1,
      requestedBy: user?.name || 'Staff',
      dispatchedBy: trForm.dispatchImmediately ? user?.name : undefined,
      status: trForm.dispatchImmediately ? 'dispatched' : 'requested',
      notes: trForm.notes.trim(),
      createdAt: new Date().toISOString(),
      dispatchedAt: trForm.dispatchImmediately ? new Date().toISOString() : undefined,
    };
    const res = await dispatchMutation('CREATE_TRANSFER', { transfer });
    setMessage(
      res.ok
        ? { type: 'ok', text: `Transfer ${transfer.referenceNumber} created (${transfer.status}).` }
        : { type: 'err', text: res.error || 'Transfer failed.' }
    );
  };

  const handleAdvanceTransfer = async (transferId: string, nextStatus: 'dispatched' | 'received' | 'cancelled') => {
    const res = await dispatchMutation('ADVANCE_TRANSFER', { transferId, nextStatus });
    setMessage(res.ok ? { type: 'ok', text: `Transfer marked as ${nextStatus}.` } : { type: 'err', text: res.error || 'Failed.' });
  };

  const expiringProducts = useMemo(() => {
    const nearDays = workspace.business?.preferences?.nearExpiryDays ?? 30;
    const now = Date.now();
    return workspace.products
      .filter((p) => Boolean(p.expirationDate))
      .map((p) => {
        const daysLeft = Math.ceil((Date.parse(p.expirationDate!) - now) / 86400000);
        const qty = getProductStock(p.id);
        return { product: p, daysLeft, qty };
      })
      .filter((x) => x.daysLeft <= nearDays || x.product.status === 'quarantined')
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [workspace.products, workspace.business?.preferences?.nearExpiryDays, getProductStock]);

  const tabs: { key: OperationTab; label: string }[] = [
    { key: 'incoming', label: 'Incoming Stock' },
    { key: 'outgoing', label: 'Outgoing Stock' },
    { key: 'damaged', label: 'Damaged & Loss' },
    { key: 'expired', label: 'Expired Stock' },
    { key: 'transfers', label: 'Transfers' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
            Inventory Operations &amp; Movements
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Every confirmed movement writes an atomic, permanent transaction to the stock ledger.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                tab === t.key
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs flex justify-between items-center ${
            message.type === 'ok'
              ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
              : 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200'
          }`}
        >
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} className="underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* INCOMING STOCK TAB */}
      {tab === 'incoming' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {!isReadOnly && (
            <form
              onSubmit={handleCreateIncoming}
              className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5"
            >
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-blue-600" />
                Record Incoming Stock
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Receipt #</label>
                  <input
                    type="text"
                    value={incForm.receiptNumber}
                    onChange={(e) => setIncForm({ ...incForm, receiptNumber: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Date Received</label>
                  <input
                    type="date"
                    value={incForm.dateReceived}
                    onChange={(e) => setIncForm({ ...incForm, dateReceived: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Source Type</label>
                  <select
                    value={incForm.sourceType}
                    onChange={(e) => setIncForm({ ...incForm, sourceType: e.target.value as IncomingStockRecord['sourceType'] })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option>Supplier</option>
                    <option>Factory</option>
                    <option>Central Warehouse</option>
                    <option>Distributor</option>
                    <option>Branch</option>
                    <option>Direct Purchase</option>
                    <option>Internal Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Source / Supplier</label>
                  <input
                    type="text"
                    value={incForm.sourceName}
                    onChange={(e) => setIncForm({ ...incForm, sourceName: e.target.value })}
                    placeholder="Supplier or Warehouse name"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Product</label>
                  <select
                    value={incForm.productId}
                    onChange={(e) => {
                      const p = workspace.products.find((pr) => pr.id === e.target.value);
                      setIncForm({
                        ...incForm,
                        productId: e.target.value,
                        enteredUnit: p?.unit || incForm.enteredUnit,
                        purchasePrice: p?.purchasePrice || 0,
                      });
                    }}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    {workspace.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.brand})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Destination Location</label>
                  <select
                    value={incForm.locationId}
                    onChange={(e) => setIncForm({ ...incForm, locationId: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    {workspace.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.locationName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Qty Received</label>
                  <input
                    type="number"
                    min={1}
                    value={incForm.enteredQuantity}
                    onChange={(e) => setIncForm({ ...incForm, enteredQuantity: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Unit</label>
                  <select
                    value={incForm.enteredUnit}
                    onChange={(e) => setIncForm({ ...incForm, enteredUnit: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    {unitChoices.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Damaged (Base)</label>
                  <input
                    type="number"
                    min={0}
                    value={incForm.damagedOnArrival}
                    onChange={(e) => setIncForm({ ...incForm, damagedOnArrival: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {incProduct && (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 text-xs flex justify-between">
                  <span className="text-slate-500">Accepted Net Addition ({incProduct.unit}):</span>
                  <span className="font-mono font-semibold text-emerald-600">
                    +{acceptedIncoming} {incProduct.unit}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={incForm.invoiceNumber}
                  onChange={(e) => setIncForm({ ...incForm, invoiceNumber: e.target.value })}
                  placeholder="Invoice #"
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  value={incForm.batchNumber}
                  onChange={(e) => setIncForm({ ...incForm, batchNumber: e.target.value })}
                  placeholder="Batch #"
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
                <input
                  type="date"
                  value={incForm.expirationDate}
                  onChange={(e) => setIncForm({ ...incForm, expirationDate: e.target.value })}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              {canApprove && (
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={incForm.confirmImmediately}
                    onChange={(e) => setIncForm({ ...incForm, confirmImmediately: e.target.checked })}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Verify &amp; confirm receipt immediately (credits stock)
                </label>
              )}

              <button
                type="submit"
                disabled={!incProduct}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-xs font-medium text-white cursor-pointer"
              >
                Submit Incoming Stock
              </button>
            </form>
          )}

          <div className={`${isReadOnly ? 'lg:col-span-12' : 'lg:col-span-7'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}>
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-display text-sm font-semibold text-slate-900 dark:text-white">
              Incoming Stock History
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Receipt</th>
                    <th className="py-2.5 px-4">Product</th>
                    <th className="py-2.5 px-4">Source</th>
                    <th className="py-2.5 px-4 text-right">Accepted</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {workspace.incomingRecords.map((r) => {
                    const p = workspace.products.find((x) => x.id === r.productId);
                    return (
                      <tr key={r.id}>
                        <td className="py-2.5 px-4 font-mono">{r.receiptNumber}</td>
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">{p?.name || 'Unknown'}</td>
                        <td className="py-2.5 px-4 text-slate-500">{r.sourceName}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-emerald-600">+{r.acceptedQuantity}</td>
                        <td className="py-2.5 px-4 capitalize">{r.status}</td>
                        <td className="py-2.5 px-4 text-right">
                          {r.status === 'pending' && canApprove && (
                            <button
                              type="button"
                              onClick={() => handleConfirmIncoming(r.id)}
                              className="px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-medium cursor-pointer"
                            >
                              Confirm
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {workspace.incomingRecords.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No incoming stock receipts yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* OUTGOING STOCK TAB */}
      {tab === 'outgoing' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {!isReadOnly && (
            <form
              onSubmit={handleCreateOutgoing}
              className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5"
            >
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-blue-600" />
                Record Outgoing Stock
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Reference #</label>
                  <input
                    type="text"
                    value={outForm.referenceNumber}
                    onChange={(e) => setOutForm({ ...outForm, referenceNumber: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Reason</label>
                  <select
                    value={outForm.reason}
                    onChange={(e) => setOutForm({ ...outForm, reason: e.target.value as OutgoingStockRecord['reason'] })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option>Sale</option>
                    <option>Internal Consumption</option>
                    <option>Department Issuance</option>
                    <option>Return</option>
                    <option>Business Operation</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Product</label>
                  <select
                    value={outForm.productId}
                    onChange={(e) => {
                      const p = workspace.products.find((pr) => pr.id === e.target.value);
                      setOutForm({ ...outForm, productId: e.target.value, unit: p?.unit || outForm.unit });
                    }}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    {workspace.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({getProductStock(p.id, outForm.locationId)} avail)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Source Location</label>
                  <select
                    value={outForm.locationId}
                    onChange={(e) => setOutForm({ ...outForm, locationId: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    {workspace.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.locationName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={outForm.quantity}
                    onChange={(e) => setOutForm({ ...outForm, quantity: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Unit</label>
                  <select
                    value={outForm.unit}
                    onChange={(e) => setOutForm({ ...outForm, unit: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    {unitChoices.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Destination</label>
                  <input
                    type="text"
                    value={outForm.destination}
                    onChange={(e) => setOutForm({ ...outForm, destination: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!outProduct}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-xs font-medium text-white cursor-pointer"
              >
                Submit Outgoing Stock (-{convertedOutgoing} {outProduct?.unit})
              </button>
            </form>
          )}

          <div className={`${isReadOnly ? 'lg:col-span-12' : 'lg:col-span-7'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}>
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-display text-sm font-semibold text-slate-900 dark:text-white">
              Outgoing Stock Ledger
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Ref</th>
                    <th className="py-2.5 px-4">Product</th>
                    <th className="py-2.5 px-4">Destination</th>
                    <th className="py-2.5 px-4 text-right">Qty</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {workspace.outgoingRecords.map((r) => {
                    const p = workspace.products.find((x) => x.id === r.productId);
                    return (
                      <tr key={r.id}>
                        <td className="py-2.5 px-4 font-mono">{r.referenceNumber}</td>
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">{p?.name || 'Unknown'}</td>
                        <td className="py-2.5 px-4 text-slate-500">{r.reason} · {r.destination}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-red-600">-{r.convertedQuantity}</td>
                        <td className="py-2.5 px-4 capitalize">{r.status}</td>
                        <td className="py-2.5 px-4 text-right">
                          {r.status === 'pending' && canApprove && (
                            <button
                              type="button"
                              onClick={() => dispatchMutation('APPROVE_OUTGOING_STOCK', { recordId: r.id })}
                              className="px-2.5 py-1 rounded bg-blue-600 text-white text-[11px] font-medium cursor-pointer"
                            >
                              Approve
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {workspace.outgoingRecords.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No outgoing stock records yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DAMAGED STOCK TAB */}
      {tab === 'damaged' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {!isReadOnly && (
            <form
              onSubmit={handleSubmitDamage}
              className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5"
            >
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-red-600" />
                Report Broken / Dropped / Damaged Stock
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Product</label>
                  <select
                    value={dmgForm.productId}
                    onChange={(e) => setDmgForm({ ...dmgForm, productId: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    {workspace.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Location</label>
                  <select
                    value={dmgForm.locationId}
                    onChange={(e) => setDmgForm({ ...dmgForm, locationId: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    {workspace.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.locationName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Damage Type</label>
                  <select
                    value={dmgForm.damageType}
                    onChange={(e) => setDmgForm({ ...dmgForm, damageType: e.target.value as DamageType })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    {['Broken', 'Dropped', 'Cracked', 'Leaking', 'Expired', 'Spoiled', 'Missing', 'Contaminated', 'Unusable', 'Other'].map(
                      (dt) => (
                        <option key={dt} value={dt}>
                          {dt}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Quantity Damaged</label>
                  <input
                    type="number"
                    min={1}
                    value={dmgForm.quantity}
                    onChange={(e) => setDmgForm({ ...dmgForm, quantity: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Incident Description</label>
                <textarea
                  rows={2}
                  value={dmgForm.description}
                  onChange={(e) => setDmgForm({ ...dmgForm, description: e.target.value })}
                  placeholder="Describe how the item was damaged or dropped..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{dmgForm.photoDataUrl ? 'Evidence photo attached' : 'Attach damage photograph (optional)'}</span>
                <input type="file" accept="image/*" onChange={handleDamagePhoto} className="hidden" />
              </label>

              <button
                type="submit"
                disabled={workspace.products.length === 0}
                className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-xs font-medium text-white cursor-pointer"
              >
                Submit Damage Report
              </button>
            </form>
          )}

          <div className={`${isReadOnly ? 'lg:col-span-12' : 'lg:col-span-7'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}>
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-display text-sm font-semibold text-slate-900 dark:text-white">
              Damage Reports &amp; Automatic Deductions
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Product</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4 text-right">Qty</th>
                    <th className="py-2.5 px-4 text-right">Loss</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Supervisor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {workspace.damageReports.map((r) => {
                    const p = workspace.products.find((x) => x.id === r.productId);
                    return (
                      <tr key={r.id}>
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-slate-900 dark:text-white">{p?.name || 'Unknown'}</div>
                          <div className="text-[11px] text-slate-400">{r.reportedBy} · {r.description}</div>
                        </td>
                        <td className="py-2.5 px-4">{r.damageType}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-red-600">-{r.quantity}</td>
                        <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(r.financialLoss)}</td>
                        <td className="py-2.5 px-4 capitalize">{r.status}</td>
                        <td className="py-2.5 px-4 text-right">
                          {r.status === 'pending' && canApprove ? (
                            <div className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => handleApproveDamage(r.id, 'approved')}
                                className="p-1 rounded bg-emerald-600 text-white cursor-pointer"
                                title="Approve & Deduct"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApproveDamage(r.id, 'rejected')}
                                className="p-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                                title="Reject"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">{r.approvedBy || '—'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {workspace.damageReports.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No damage reports submitted.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* EXPIRED STOCK TAB */}
      {tab === 'expired' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                Expiration &amp; Batch Monitor
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Product</th>
                    <th className="py-2.5 px-4">Batch</th>
                    <th className="py-2.5 px-4">Expiry Date</th>
                    <th className="py-2.5 px-4 text-right">Stock Affected</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {expiringProducts.map(({ product, daysLeft, qty }) => (
                    <tr key={product.id}>
                      <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">{product.name}</td>
                      <td className="py-2.5 px-4 font-mono">{product.batchNumber || 'N/A'}</td>
                      <td className="py-2.5 px-4 font-mono">{product.expirationDate}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{qty} {product.unit}</td>
                      <td className="py-2.5 px-4">
                        <span className={daysLeft <= 0 ? 'text-red-600 font-semibold' : 'text-amber-600 font-semibold'}>
                          {daysLeft <= 0 ? `Expired (${Math.abs(daysLeft)}d ago)` : `Expires in ${daysLeft}d`}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {!isReadOnly && qty > 0 && (
                          <div className="inline-flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleExpiredAction(product.id, 'quarantined')}
                              className="px-2.5 py-1 rounded border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-[11px] font-medium cursor-pointer"
                            >
                              Quarantine
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExpiredAction(product.id, 'disposed')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-600 text-white text-[11px] font-medium cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              Dispose &amp; Deduct
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {expiringProducts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No near-expiration or expired stock items detected.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TRANSFERS TAB */}
      {tab === 'transfers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {!isReadOnly && (
            <form
              onSubmit={handleCreateTransfer}
              className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5"
            >
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-blue-600" />
                Inter-Location Stock Transfer
              </h2>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Product</label>
                <select
                  value={trForm.productId}
                  onChange={(e) => setTrForm({ ...trForm, productId: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                >
                  {workspace.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({getProductStock(p.id, trForm.fromLocationId)} in source)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">From Location</label>
                  <select
                    value={trForm.fromLocationId}
                    onChange={(e) => setTrForm({ ...trForm, fromLocationId: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    {workspace.locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.locationName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">To Location</label>
                  <select
                    value={trForm.toLocationId}
                    onChange={(e) => setTrForm({ ...trForm, toLocationId: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    {workspace.locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.locationName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={trForm.quantity}
                  onChange={(e) => setTrForm({ ...trForm, quantity: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={trForm.dispatchImmediately}
                  onChange={(e) => setTrForm({ ...trForm, dispatchImmediately: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600"
                />
                Dispatch immediately (deducts from sending location)
              </label>

              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white cursor-pointer"
              >
                Create Stock Transfer
              </button>
            </form>
          )}

          <div className={`${isReadOnly ? 'lg:col-span-12' : 'lg:col-span-7'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}>
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-display text-sm font-semibold text-slate-900 dark:text-white">
              Stock Transfer History
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Ref</th>
                    <th className="py-2.5 px-4">Product</th>
                    <th className="py-2.5 px-4">Route</th>
                    <th className="py-2.5 px-4 text-right">Qty</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Confirmations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {workspace.transfers.map((tr) => {
                    const p = workspace.products.find((x) => x.id === tr.productId);
                    const from = workspace.locations.find((l) => l.id === tr.fromLocationId);
                    const to = workspace.locations.find((l) => l.id === tr.toLocationId);
                    return (
                      <tr key={tr.id}>
                        <td className="py-2.5 px-4 font-mono">{tr.referenceNumber}</td>
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">{p?.name || 'Unknown'}</td>
                        <td className="py-2.5 px-4 text-slate-500">
                          {from?.locationName} → {to?.locationName}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono">{tr.quantity}</td>
                        <td className="py-2.5 px-4 capitalize">{tr.status}</td>
                        <td className="py-2.5 px-4 text-right">
                          {!isReadOnly && tr.status === 'requested' && (
                            <button
                              type="button"
                              onClick={() => handleAdvanceTransfer(tr.id, 'dispatched')}
                              className="px-2.5 py-1 rounded bg-blue-600 text-white text-[11px] font-medium cursor-pointer"
                            >
                              Confirm Dispatch
                            </button>
                          )}
                          {!isReadOnly && tr.status === 'dispatched' && (
                            <button
                              type="button"
                              onClick={() => handleAdvanceTransfer(tr.id, 'received')}
                              className="px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-medium cursor-pointer"
                            >
                              Confirm Receipt
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {workspace.transfers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No stock transfers yet.
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
