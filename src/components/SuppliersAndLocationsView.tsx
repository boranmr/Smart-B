import React, { useMemo, useState } from 'react';
import { Building, MapPin, Plus, Truck } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import type { BranchLocation, Supplier } from '../types/inventory';

export const SuppliersAndLocationsView: React.FC = () => {
  const { workspace, dispatchMutation, formatCurrency } = useInventory();
  const [subTab, setSubTab] = useState<'suppliers' | 'locations'>('suppliers');

  const [supForm, setSupForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    leadTimeDays: 3,
  });

  const [locForm, setLocForm] = useState({
    branchName: 'Main Branch',
    locationName: '',
    locationType: 'Department' as BranchLocation['locationType'],
    managerName: '',
  });

  const supplierStats = useMemo(() => {
    if (!workspace) return new Map<string, { deliveries: number; accepted: number; damaged: number; spend: number }>();
    const map = new Map<string, { deliveries: number; accepted: number; damaged: number; spend: number }>();
    for (const r of workspace.incomingRecords) {
      if (r.status !== 'confirmed') continue;
      const key = r.supplierId || r.sourceName;
      const prev = map.get(key) || { deliveries: 0, accepted: 0, damaged: 0, spend: 0 };
      prev.deliveries += 1;
      prev.accepted += r.acceptedQuantity;
      prev.damaged += r.damagedOnArrival;
      prev.spend += r.acceptedQuantity * r.purchasePrice;
      map.set(key, prev);
    }
    return map;
  }, [workspace]);

  if (!workspace) return null;

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supForm.name.trim()) return;
    const supplier: Supplier = {
      id: crypto.randomUUID(),
      name: supForm.name.trim(),
      contactPerson: supForm.contactPerson.trim(),
      phone: supForm.phone.trim(),
      email: supForm.email.trim(),
      address: supForm.address.trim(),
      categories: [],
      leadTimeDays: Number(supForm.leadTimeDays) || 3,
      notes: '',
      createdAt: new Date().toISOString(),
    };
    await dispatchMutation('SAVE_SUPPLIER', { supplier });
    setSupForm({ name: '', contactPerson: '', phone: '', email: '', address: '', leadTimeDays: 3 });
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locForm.locationName.trim()) return;
    const location: BranchLocation = {
      id: crypto.randomUUID(),
      branchName: locForm.branchName.trim() || 'Main Branch',
      locationName: locForm.locationName.trim(),
      locationType: locForm.locationType,
      managerName: locForm.managerName.trim() || undefined,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    await dispatchMutation('SAVE_LOCATION', { location });
    setLocForm({ branchName: locForm.branchName, locationName: '', locationType: 'Department', managerName: '' });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
            Suppliers, Branches &amp; Storage Locations
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage vendor performance and isolated per-location inventory balances.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('suppliers')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
              subTab === 'suppliers' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Suppliers ({workspace.suppliers.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('locations')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
              subTab === 'locations' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Branches &amp; Locations ({workspace.locations.length})
          </button>
        </div>
      </div>

      {subTab === 'suppliers' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleAddSupplier}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
          >
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600" />
              Add Supplier
            </h2>
            <input
              type="text"
              required
              value={supForm.name}
              onChange={(e) => setSupForm({ ...supForm, name: e.target.value })}
              placeholder="Supplier / Distributor Name *"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <input
              type="text"
              value={supForm.contactPerson}
              onChange={(e) => setSupForm({ ...supForm, contactPerson: e.target.value })}
              placeholder="Contact Person"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={supForm.phone}
                onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })}
                placeholder="Phone"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
              <input
                type="number"
                min={0}
                value={supForm.leadTimeDays}
                onChange={(e) => setSupForm({ ...supForm, leadTimeDays: Number(e.target.value) })}
                placeholder="Lead Days"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
              />
            </div>
            <input
              type="email"
              value={supForm.email}
              onChange={(e) => setSupForm({ ...supForm, email: e.target.value })}
              placeholder="Email"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <button type="submit" className="w-full py-2.5 rounded-lg bg-blue-600 text-xs font-medium text-white cursor-pointer">
              <Plus className="w-3.5 h-3.5 inline mr-1" />
              Save Supplier
            </button>
          </form>

          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-display text-sm font-semibold text-slate-900 dark:text-white">
              Supplier Directory &amp; Delivery Performance
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Supplier</th>
                    <th className="py-2.5 px-4">Contact</th>
                    <th className="py-2.5 px-4 text-right">Deliveries</th>
                    <th className="py-2.5 px-4 text-right">Units Accepted</th>
                    <th className="py-2.5 px-4 text-right">Damaged %</th>
                    <th className="py-2.5 px-4 text-right">Total Spend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {workspace.suppliers.map((s) => {
                    const st = supplierStats.get(s.id) || supplierStats.get(s.name) || { deliveries: 0, accepted: 0, damaged: 0, spend: 0 };
                    const totalRec = st.accepted + st.damaged;
                    const dmgPct = totalRec > 0 ? ((st.damaged / totalRec) * 100).toFixed(1) : '0.0';
                    return (
                      <tr key={s.id}>
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">{s.name}</td>
                        <td className="py-2.5 px-4 text-slate-500">{s.contactPerson} · {s.phone}</td>
                        <td className="py-2.5 px-4 text-right font-mono">{st.deliveries}</td>
                        <td className="py-2.5 px-4 text-right font-mono">{st.accepted}</td>
                        <td className="py-2.5 px-4 text-right font-mono">{dmgPct}%</td>
                        <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(st.spend)}</td>
                      </tr>
                    );
                  })}
                  {workspace.suppliers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No suppliers registered yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleAddLocation}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
          >
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-600" />
              Add Branch / Storage Location
            </h2>
            <input
              type="text"
              required
              value={locForm.branchName}
              onChange={(e) => setLocForm({ ...locForm, branchName: e.target.value })}
              placeholder="Branch Name (e.g. Downtown Branch)"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <input
              type="text"
              required
              value={locForm.locationName}
              onChange={(e) => setLocForm({ ...locForm, locationName: e.target.value })}
              placeholder="Location Name (e.g. Large Counter / Yard)"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <select
              value={locForm.locationType}
              onChange={(e) => setLocForm({ ...locForm, locationType: e.target.value as BranchLocation['locationType'] })}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            >
              <option>Main Store</option>
              <option>Counter</option>
              <option>Department</option>
              <option>Warehouse</option>
              <option>Yard</option>
              <option>Pharmacy</option>
              <option>Other</option>
            </select>
            <input
              type="text"
              value={locForm.managerName}
              onChange={(e) => setLocForm({ ...locForm, managerName: e.target.value })}
              placeholder="Location Supervisor (optional)"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <button type="submit" className="w-full py-2.5 rounded-lg bg-blue-600 text-xs font-medium text-white cursor-pointer">
              Add Storage Location
            </button>
          </form>

          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {workspace.locations.map((l) => {
              const balances = workspace.stockBalances.filter((b) => b.locationId === l.id);
              const totalUnits = balances.reduce((s, b) => s + b.quantity, 0);
              const totalVal = balances.reduce((s, b) => {
                const p = workspace.products.find((x) => x.id === b.productId);
                return s + b.quantity * (p?.purchasePrice || 0);
              }, 0);
              return (
                <div key={l.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[11px] text-slate-500">{l.branchName} · {l.locationType}</div>
                      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                        <MapPin className="w-4 h-4 text-blue-600" />
                        {l.locationName}
                      </h3>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between text-xs">
                    <span className="text-slate-500">Units: <strong className="font-mono text-slate-900 dark:text-white">{totalUnits}</strong></span>
                    <span className="text-slate-500">Value: <strong className="font-mono text-slate-900 dark:text-white">{formatCurrency(totalVal)}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
