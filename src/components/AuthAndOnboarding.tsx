import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  KeyRound,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import {
  BUSINESS_CATEGORIES,
  CURRENCIES,
  DEFAULT_LOCATIONS_BY_CATEGORY,
  DEFAULT_UNIT_CONVERSIONS,
  STANDARD_UNITS,
} from '../data/presets';
import type {
  BottleCapRule,
  BranchLocation,
  BusinessProfile,
  CustomBusinessCategory,
  CustomCategoryField,
  UnitConversionRule,
} from '../types/inventory';

export const AuthScreen: React.FC = () => {
  const { login, register, isOnline } = useInventory();
  const [mode, setMode] = useState<'login' | 'register' | 'join'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceCode, setWorkspaceCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isOnline) {
      setError('Internet connection is required for initial sign-in or workspace registration. Once signed in, the app works fully offline.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else if (mode === 'register') {
        await register(name, email, password);
      } else {
        if (!workspaceCode.trim()) {
          throw new Error('Please enter the Workspace Sync Code from your administrator.');
        }
        await register(name, email, password, workspaceCode.trim());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090D16] flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left editorial intro */}
        <div className="lg:col-span-6 bg-slate-900 text-white rounded-2xl p-8 sm:p-10 flex flex-col justify-between border border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <img src="/icon.svg" alt="Smart Inventory AI" className="w-10 h-10 rounded-xl" />
              <span className="font-display text-xl font-semibold tracking-tight">Smart Inventory AI</span>
            </div>

            <h1 className="mt-8 font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-tight text-balance">
              Product-specific vision counting and multi-branch stock control.
            </h1>
            <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed max-w-md">
              Built for lounges, hotels, hospitals, pharmacies, supermarkets, warehouses, and construction suppliers.
              Works seamlessly offline and syncs across all devices automatically.
            </p>
          </div>

          <div className="mt-10 pt-8 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
            <div>
              <p className="font-medium text-white">Exact SKU AI Counting</p>
              <p className="mt-1 text-xs text-slate-400">
                Counts only the selected brand and verifies bottle cap rules while ignoring rival items.
              </p>
            </div>
            <div>
              <p className="font-medium text-white">Offline-First &amp; Live Sync</p>
              <p className="mt-1 text-xs text-slate-400">
                Local IndexedDB ledger with idempotent queue syncs automatically across phones and desktops.
              </p>
            </div>
          </div>
        </div>

        {/* Right auth card */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 rounded-2xl p-8 sm:p-10 border border-slate-200 dark:border-slate-800 flex flex-col justify-center">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'login'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'register'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              New Business
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('join');
                setError(null);
              }}
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'join'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Join Device
            </button>
          </div>

          <h2 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
            {mode === 'login' && 'Sign in to your workspace'}
            {mode === 'register' && 'Create a business workspace'}
            {mode === 'join' && 'Join existing workspace'}
          </h2>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            {mode === 'login' && 'Sign in with the same email on any phone, tablet, or desktop to sync automatically.'}
            {mode === 'register' && 'Creates a Super Administrator account and generates a Workspace Sync Code for your team.'}
            {mode === 'join' && 'Enter your Workspace Sync Code to connect this device to an existing inventory ledger.'}
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode !== 'login' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Amina Hassan"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            )}

            {mode === 'join' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Workspace Sync Code
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={workspaceCode}
                    onChange={(e) => setWorkspaceCode(e.target.value.toUpperCase())}
                    placeholder="SIA-XXXX-XXXX"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 pl-10 pr-3.5 py-2.5 text-sm font-mono uppercase text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="manager@company.com"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Password (min. 6 characters)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-3 text-sm font-medium text-white transition-colors cursor-pointer"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  {mode === 'login' ? 'Sign In & Sync' : mode === 'register' ? 'Create Workspace' : 'Connect Device'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              Scrypt encrypted credentials
            </span>
            <span>{isOnline ? 'Server Ready' : 'Offline'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const BusinessSetupWizard: React.FC<{ onComplete?: () => void; existing?: BusinessProfile | null }> = ({
  onComplete,
  existing,
}) => {
  const { workspace, dispatchMutation } = useInventory();
  const [name, setName] = useState(existing?.name || '');
  const [category, setCategory] = useState(existing?.category || 'Bar and Lounge');
  const [isCustomCategory, setIsCustomCategory] = useState(existing?.isCustomCategory || false);
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [customProductTypes, setCustomProductTypes] = useState('');
  const [customUnits, setCustomUnits] = useState('Pieces, Cartons');
  const [customProcedure, setCustomProcedure] = useState('Count physical units by shelf location and verify batch labels.');
  const [customFields, setCustomFields] = useState<CustomCategoryField[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'number' | 'date'>('text');

  const [location, setLocation] = useState(existing?.location || '');
  const [address, setAddress] = useState(existing?.address || '');
  const [contactInfo, setContactInfo] = useState(existing?.contactInfo || '');
  const [currency, setCurrency] = useState(existing?.currency || 'USD');
  const [registrationNumber, setRegistrationNumber] = useState(existing?.registrationNumber || '');
  const [branchCount, setBranchCount] = useState(existing?.branchCount || 1);
  const [logoDataUrl, setLogoDataUrl] = useState(existing?.logoDataUrl || '');
  const [defaultCapRule, setDefaultCapRule] = useState<BottleCapRule>(
    existing?.preferences?.defaultBottleCapRule || 'capped_only'
  );
  const [allowNegativeStock, setAllowNegativeStock] = useState(existing?.preferences?.allowNegativeStock || false);
  const [lowStockPercent, setLowStockPercent] = useState(existing?.preferences?.lowStockAlertPercent || 20);
  const [nearExpiryDays, setNearExpiryDays] = useState(existing?.preferences?.nearExpiryDays || 30);
  const [requireDamageApproval, setRequireDamageApproval] = useState(
    existing?.preferences?.requireSupervisorApprovalForDamage ?? true
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setLogoDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const addCustomField = () => {
    if (!newFieldLabel.trim()) return;
    setCustomFields((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: newFieldLabel.trim(),
        fieldType: newFieldType,
        required: false,
      },
    ]);
    setNewFieldLabel('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Business name is required.');
      return;
    }
    if (isCustomCategory && !customCategoryName.trim()) {
      setError('Please enter your custom business category name.');
      return;
    }
    setSaving(true);
    setError(null);

    const finalCategoryName = isCustomCategory ? customCategoryName.trim() : category;
    let customCatId: string | undefined = existing?.customCategoryId;

    if (isCustomCategory) {
      customCatId = customCatId || crypto.randomUUID();
      const customCatObj: CustomBusinessCategory = {
        id: customCatId,
        name: finalCategoryName,
        productTypes: customProductTypes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        customFields,
        defaultUnits: customUnits
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        stockTakingProcedure: customProcedure,
        createdAt: new Date().toISOString(),
      };
      await dispatchMutation('ADD_CUSTOM_CATEGORY', { category: customCatObj });
    }

    const profile: BusinessProfile = {
      id: existing?.id || crypto.randomUUID(),
      workspaceCode: workspace?.workspaceCode || '',
      name: name.trim(),
      category: finalCategoryName,
      isCustomCategory,
      customCategoryId: customCatId,
      location: location.trim(),
      address: address.trim(),
      contactInfo: contactInfo.trim(),
      logoDataUrl: logoDataUrl || undefined,
      currency,
      registrationNumber: registrationNumber.trim() || undefined,
      branchCount: Math.max(1, Number(branchCount) || 1),
      preferences: {
        defaultBottleCapRule: defaultCapRule,
        allowNegativeStock,
        lowStockAlertPercent: Number(lowStockPercent) || 20,
        nearExpiryDays: Number(nearExpiryDays) || 30,
        requireSupervisorApprovalForDamage: requireDamageApproval,
        enableAutoSync: true,
      },
      updatedAt: new Date().toISOString(),
    };

    const presetLocs =
      DEFAULT_LOCATIONS_BY_CATEGORY[finalCategoryName] || DEFAULT_LOCATIONS_BY_CATEGORY.default;
    const initialLocations: BranchLocation[] =
      (workspace?.locations?.length || 0) === 0
        ? presetLocs.map((l) => ({
            id: crypto.randomUUID(),
            branchName: l.branchName,
            locationName: l.locationName,
            locationType: l.locationType,
            address: address.trim(),
            isActive: true,
            createdAt: new Date().toISOString(),
          }))
        : [];

    const initialConversions: UnitConversionRule[] =
      (workspace?.unitConversions?.length || 0) === 0
        ? DEFAULT_UNIT_CONVERSIONS.map((r) => ({
            id: crypto.randomUUID(),
            ...r,
            createdAt: new Date().toISOString(),
          }))
        : [];

    const res = await dispatchMutation('SAVE_BUSINESS_PROFILE', {
      business: profile,
      locations: initialLocations,
      unitConversions: initialConversions,
    });

    setSaving(false);
    if (!res.ok) {
      setError(res.error || 'Failed to save business profile.');
      return;
    }
    onComplete?.();
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2.5">
              <Building2 className="w-6 h-6 text-blue-600" />
              {existing ? 'Business Profile & Configuration' : 'Register Your Business'}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Configure your business category, storage locations, currency, and inventory rules.
              {workspace?.workspaceCode && (
                <span className="ml-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                  Sync Code: {workspace.workspaceCode}
                </span>
              )}
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="mt-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Business Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Serengeti Grand Lounge & Grill"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Business Category Selection + Custom Category */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Business Category *
              </label>
              <button
                type="button"
                onClick={() => setIsCustomCategory((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {isCustomCategory ? 'Choose Predefined Category' : 'ADD CUSTOM BUSINESS CATEGORY'}
              </button>
            </div>

            {!isCustomCategory ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {BUSINESS_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-2 text-xs font-medium rounded-lg border text-left transition-colors cursor-pointer ${
                      category === cat
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                  <Layers className="w-4 h-4 text-blue-600" />
                  Custom Business Category Configuration
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Custom Category Name *</label>
                    <input
                      type="text"
                      value={customCategoryName}
                      onChange={(e) => setCustomCategoryName(e.target.value)}
                      placeholder="e.g. Agro-Vet & Solar Depot"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                      Product Types (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={customProductTypes}
                      onChange={(e) => setCustomProductTypes(e.target.value)}
                      placeholder="Solar Panels, Inverters, Batteries"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                      Preferred Units (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={customUnits}
                      onChange={(e) => setCustomUnits(e.target.value)}
                      placeholder={STANDARD_UNITS.slice(0, 5).join(', ')}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Stock-Taking Procedure</label>
                    <input
                      type="text"
                      value={customProcedure}
                      onChange={(e) => setCustomProcedure(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Custom inventory fields */}
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1.5">
                    Custom Product Fields (optional)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={newFieldLabel}
                      onChange={(e) => setNewFieldLabel(e.target.value)}
                      placeholder="e.g. Voltage Rating / Timber Grade"
                      className="flex-1 min-w-[180px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                    />
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value as 'text' | 'number' | 'date')}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                    </select>
                    <button
                      type="button"
                      onClick={addCustomField}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium cursor-pointer"
                    >
                      Add Field
                    </button>
                  </div>
                  {customFields.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {customFields.map((f) => (
                        <span
                          key={f.id}
                          className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1 bg-white dark:bg-slate-900"
                        >
                          {f.label} ({f.fieldType})
                          <button
                            type="button"
                            onClick={() => setCustomFields((prev) => prev.filter((x) => x.id !== f.id))}
                            className="text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                City / Region *
              </label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Arusha, Tanzania"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Physical Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Plot 14, Industrial Road"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Contact Phone / Email
              </label>
              <input
                type="text"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="+255 700 000 000"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Registration / Tax ID (Optional)
              </label>
              <input
                type="text"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                placeholder="TIN-1029384"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Number of Branches
              </label>
              <input
                type="number"
                min={1}
                value={branchCount}
                onChange={(e) => setBranchCount(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Business Logo (for Reports)
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <Upload className="w-4 h-4" />
                <span>{logoDataUrl ? 'Logo uploaded (change)' : 'Upload PNG / JPG logo'}</span>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
            </div>
          </div>

          {/* Inventory Governance Preferences */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Inventory &amp; AI Counting Preferences
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Default Bottle-Cap Rule
                </label>
                <select
                  value={defaultCapRule}
                  onChange={(e) => setDefaultCapRule(e.target.value as BottleCapRule)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                >
                  <option value="capped_only">Count capped bottles only</option>
                  <option value="sealed_only">Count sealed bottles only</option>
                  <option value="count_open_separately">Count open bottles separately</option>
                  <option value="count_all">Count all physically present</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Near-Expiration Alert Window (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={nearExpiryDays}
                  onChange={(e) => setNearExpiryDays(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Low-Stock Buffer (%)
                </label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={lowStockPercent}
                  onChange={(e) => setLowStockPercent(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-6">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireDamageApproval}
                  onChange={(e) => setRequireDamageApproval(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                Require supervisor approval before deducting damaged stock
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowNegativeStock}
                  onChange={(e) => setAllowNegativeStock(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                Allow negative stock balances (admin exception)
              </label>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-sm font-medium text-white transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              {saving ? 'Saving Business Setup...' : existing ? 'Update Business Profile' : 'Launch Inventory Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
