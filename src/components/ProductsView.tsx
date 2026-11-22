import React, { useMemo, useState } from 'react';
import {
  Camera,
  Eye,
  Package,
  Plus,
  Ruler,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { PRODUCT_CATEGORIES_BY_BUSINESS, STANDARD_UNITS } from '../data/presets';
import type { Product, UnitConversionRule } from '../types/inventory';
import { ProductTrainingModal } from './ProductTrainingModal';

export const ProductsView: React.FC<{ onOpenAICameraForProduct?: (productId: string) => void }> = ({
  onOpenAICameraForProduct,
}) => {
  const { workspace, dispatchMutation, formatCurrency, getProductStock } = useInventory();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [trainingProduct, setTrainingProduct] = useState<Product | null>(null);
  const [showUnitsModal, setShowUnitsModal] = useState(false);

  // Unit conversion form state
  const [fromUnit, setFromUnit] = useState('Cartons');
  const [toUnit, setToUnit] = useState('Bottles');
  const [convFactor, setConvFactor] = useState(24);

  // Product Form State
  const [form, setForm] = useState({
    name: '',
    brand: '',
    sku: '',
    barcode: '',
    qrCode: '',
    category: '',
    description: '',
    size: '',
    unit: 'Bottles',
    purchasePrice: 0,
    sellingPrice: 0,
    initialQuantity: 0,
    minStockLevel: 10,
    maxStockLevel: 500,
    supplierId: '',
    defaultLocationId: '',
    expirationDate: '',
    batchNumber: '',
    status: 'active' as 'active' | 'inactive' | 'quarantined',
    imageDataUrl: '',
    customFields: {} as Record<string, string>,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryOptions = useMemo(() => {
    const bizCat = workspace?.business?.category || '';
    const customCat = workspace?.customCategories.find((c) => c.name === bizCat);
    const preset = customCat?.productTypes?.length
      ? customCat.productTypes
      : PRODUCT_CATEGORIES_BY_BUSINESS[bizCat] || PRODUCT_CATEGORIES_BY_BUSINESS.default;
    const used = (workspace?.products || []).map((p) => p.category);
    return Array.from(new Set([...preset, ...used])).filter(Boolean);
  }, [workspace]);

  const unitOptions = useMemo(() => {
    const bizCat = workspace?.business?.category || '';
    const customCat = workspace?.customCategories.find((c) => c.name === bizCat);
    return Array.from(new Set([...(customCat?.defaultUnits || []), ...STANDARD_UNITS]));
  }, [workspace]);

  const activeCustomFields = useMemo(() => {
    const customCat = workspace?.customCategories.find((c) => c.id === workspace?.business?.customCategoryId);
    return customCat?.customFields || [];
  }, [workspace]);

  const openNewForm = () => {
    setEditingProduct(null);
    setForm({
      name: '',
      brand: '',
      sku: `SKU-${Math.floor(100000 + Math.random() * 900000)}`,
      barcode: '',
      qrCode: '',
      category: categoryOptions[0] || 'General',
      description: '',
      size: '',
      unit: unitOptions[0] || 'Pieces',
      purchasePrice: 0,
      sellingPrice: 0,
      initialQuantity: 0,
      minStockLevel: 10,
      maxStockLevel: 500,
      supplierId: workspace?.suppliers[0]?.id || '',
      defaultLocationId: workspace?.locations[0]?.id || '',
      expirationDate: '',
      batchNumber: '',
      status: 'active',
      imageDataUrl: '',
      customFields: {},
    });
    setError(null);
    setShowForm(true);
  };

  const openEditForm = (p: Product) => {
    setEditingProduct(p);
    setForm({
      name: p.name,
      brand: p.brand,
      sku: p.sku,
      barcode: p.barcode,
      qrCode: p.qrCode,
      category: p.category,
      description: p.description,
      size: p.size,
      unit: p.unit,
      purchasePrice: p.purchasePrice,
      sellingPrice: p.sellingPrice,
      initialQuantity: 0,
      minStockLevel: p.minStockLevel,
      maxStockLevel: p.maxStockLevel,
      supplierId: p.supplierId || '',
      defaultLocationId: p.defaultLocationId,
      expirationDate: p.expirationDate || '',
      batchNumber: p.batchNumber || '',
      status: p.status,
      imageDataUrl: p.imageDataUrl || '',
      customFields: p.customFields || {},
    });
    setError(null);
    setShowForm(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 512 / img.width);
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          setForm((f) => ({ ...f, imageDataUrl: canvas.toDataURL('image/jpeg', 0.8) }));
        };
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.brand.trim()) {
      setError('Product name and brand are required for accurate AI recognition.');
      return;
    }
    setSaving(true);
    setError(null);

    const now = new Date().toISOString();
    const productPayload: Product = {
      id: editingProduct?.id || crypto.randomUUID(),
      name: form.name.trim(),
      brand: form.brand.trim(),
      sku: form.sku.trim() || `SKU-${Date.now().toString().slice(-6)}`,
      barcode: form.barcode.trim(),
      qrCode: form.qrCode.trim(),
      category: form.category.trim() || 'General',
      description: form.description.trim(),
      size: form.size.trim(),
      unit: form.unit,
      purchasePrice: Number(form.purchasePrice) || 0,
      sellingPrice: Number(form.sellingPrice) || 0,
      minStockLevel: Number(form.minStockLevel) || 0,
      maxStockLevel: Number(form.maxStockLevel) || 0,
      supplierId: form.supplierId || undefined,
      defaultLocationId: form.defaultLocationId || workspace?.locations[0]?.id || '',
      expirationDate: form.expirationDate || undefined,
      batchNumber: form.batchNumber.trim() || undefined,
      status: form.status,
      imageDataUrl: form.imageDataUrl || undefined,
      customFields: form.customFields,
      recognitionProfile: editingProduct?.recognitionProfile || {
        status: form.imageDataUrl ? 'basic' : 'untrained',
        trainingPhotos: form.imageDataUrl
          ? [{ id: crypto.randomUUID(), angle: 'front', dataUrl: form.imageDataUrl, capturedAt: now }]
          : [],
        visualSignatureSummary: '',
        distinctiveFeatures: [],
        labelKeywords: [form.brand.trim(), form.name.trim(), form.size.trim()].filter(Boolean),
        dominantColors: [],
        packagingType: form.unit,
        bottleCapRule: workspace?.business?.preferences?.defaultBottleCapRule || 'capped_only',
      },
      createdAt: editingProduct?.createdAt || now,
      updatedAt: now,
    };

    const res = await dispatchMutation('SAVE_PRODUCT', {
      product: productPayload,
      initialQuantity: editingProduct ? 0 : Number(form.initialQuantity) || 0,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error || 'Failed to save product.');
      return;
    }
    setShowForm(false);
  };

  const handleSaveUnitRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (convFactor <= 0 || fromUnit === toUnit) return;
    const rule: UnitConversionRule = {
      id: crypto.randomUUID(),
      fromUnit,
      toUnit,
      factor: Number(convFactor),
      createdAt: new Date().toISOString(),
    };
    await dispatchMutation('SAVE_UNIT_CONVERSION', { rule });
  };

  if (!workspace) return null;

  const filteredProducts = workspace.products.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.barcode.toLowerCase().includes(q);
    const matchCat = categoryFilter === 'All' || p.category === categoryFilter;
    const matchLoc =
      locationFilter === 'All' ||
      workspace.stockBalances.some((b) => b.productId === p.id && b.locationId === locationFilter && b.quantity > 0) ||
      p.defaultLocationId === locationFilter;
    return matchSearch && matchCat && matchLoc;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
            Product Catalog &amp; Recognition Profiles
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {workspace.products.length} products · Train multi-angle photos for brand-specific AI camera counting
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowUnitsModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <Ruler className="w-3.5 h-3.5" />
            Unit Conversions
          </button>
          <button
            type="button"
            onClick={openNewForm}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-medium text-white whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Register Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, brand, SKU, or barcode..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
        >
          <option value="All">All Categories</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
        >
          <option value="All">All Locations</option>
          {workspace.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.branchName} · {l.locationName}
            </option>
          ))}
        </select>
      </div>

      {/* Product Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-3 px-4 font-medium">Product</th>
                <th className="py-3 px-4 font-medium">SKU / Barcode</th>
                <th className="py-3 px-4 font-medium">Category</th>
                <th className="py-3 px-4 font-medium text-right">Stock</th>
                <th className="py-3 px-4 font-medium text-right">Cost / Sell</th>
                <th className="py-3 px-4 font-medium">AI Profile</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredProducts.map((p) => {
                const stock = getProductStock(p.id, locationFilter === 'All' ? undefined : locationFilter);
                const isLow = stock > 0 && stock <= p.minStockLevel;
                const isOut = stock <= 0;
                return (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {p.imageDataUrl ? (
                          <img src={p.imageDataUrl} alt={p.name} className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                            <Package className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">{p.name}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {p.brand} · {p.size || p.unit}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                      <div>{p.sku}</div>
                      {p.barcode && <div className="text-[11px] text-slate-400">{p.barcode}</div>}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{p.category}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <span
                        className={
                          isOut
                            ? 'text-red-600 dark:text-red-400 font-semibold'
                            : isLow
                            ? 'text-amber-600 dark:text-amber-400 font-semibold'
                            : 'text-slate-900 dark:text-white font-semibold'
                        }
                      >
                        {stock} {p.unit}
                      </span>
                      <div className="text-[11px] text-slate-400">
                        {isOut ? 'Out of stock' : isLow ? `Low (min ${p.minStockLevel})` : 'Healthy'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      <div>{formatCurrency(p.purchasePrice)}</div>
                      <div className="text-[11px] text-slate-400">Sell {formatCurrency(p.sellingPrice)}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 capitalize">
                      {p.recognitionProfile?.status || 'untrained'} ({p.recognitionProfile?.trainingPhotos?.length || 0} photos)
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {onOpenAICameraForProduct && (
                          <button
                            type="button"
                            onClick={() => onOpenAICameraForProduct(p.id)}
                            title="Count with AI Camera"
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
                          >
                            <Camera className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setTrainingProduct(p)}
                          title="Train AI Recognition"
                          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Sparkles className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailProduct(p)}
                          title="View Details"
                          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditForm(p)}
                          className="px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No matching products found. Click "Register Product" to add inventory items.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Registration / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl my-auto">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {editingProduct ? `Edit Product · ${editingProduct.name}` : 'Register New Product'}
              </h2>
              <button type="button" onClick={() => setShowForm(false)} className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveProduct} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Bonite Soda"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Brand *</label>
                  <input
                    type="text"
                    required
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    placeholder="e.g. Bonite Bottlers"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Size / Pack</label>
                  <input
                    type="text"
                    value={form.size}
                    onChange={(e) => setForm({ ...form, size: e.target.value })}
                    placeholder="e.g. 500ml / 2.4m / 50kg"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">SKU</label>
                  <input
                    type="text"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Barcode (EAN/UPC)</label>
                  <input
                    type="text"
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">QR Code</label>
                  <input
                    type="text"
                    value={form.qrCode}
                    onChange={(e) => setForm({ ...form, qrCode: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                  <input
                    list="product-categories-list"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <datalist id="product-categories-list">
                    {categoryOptions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Base Unit</label>
                  <select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    {unitOptions.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Purchase Price</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.purchasePrice}
                    onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Selling Price</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.sellingPrice}
                    onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Min Stock Alert</label>
                  <input
                    type="number"
                    min={0}
                    value={form.minStockLevel}
                    onChange={(e) => setForm({ ...form, minStockLevel: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                {!editingProduct && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Opening Stock</label>
                    <input
                      type="number"
                      min={0}
                      value={form.initialQuantity}
                      onChange={(e) => setForm({ ...form, initialQuantity: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Default Location</label>
                  <select
                    value={form.defaultLocationId}
                    onChange={(e) => setForm({ ...form, defaultLocationId: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    {workspace.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.branchName} · {l.locationName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Supplier</label>
                  <select
                    value={form.supplierId}
                    onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="">None / Direct</option>
                    {workspace.suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Batch Number</label>
                  <input
                    type="text"
                    value={form.batchNumber}
                    onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
                    placeholder="BATCH-2026-01"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Expiration Date</label>
                  <input
                    type="date"
                    value={form.expirationDate}
                    onChange={(e) => setForm({ ...form, expirationDate: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {activeCustomFields.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {activeCustomFields.map((f) => (
                    <div key={f.id}>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{f.label}</label>
                      <input
                        type={f.fieldType === 'number' ? 'number' : f.fieldType === 'date' ? 'date' : 'text'}
                        value={form.customFields[f.label] || ''}
                        onChange={(e) =>
                          setForm({ ...form, customFields: { ...form.customFields, [f.label]: e.target.value } })
                        }
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Packaging, shelf details, handling notes..."
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Primary Product Photo</label>
                  <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{form.imageDataUrl ? 'Photo attached (replace)' : 'Upload product image'}</span>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white cursor-pointer"
                >
                  {saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Register Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      {detailProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 my-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3.5">
                {detailProduct.imageDataUrl ? (
                  <img src={detailProduct.imageDataUrl} alt={detailProduct.name} className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                    <Package className="w-6 h-6" />
                  </div>
                )}
                <div>
                  <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">{detailProduct.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {detailProduct.brand} · {detailProduct.size} · SKU {detailProduct.sku}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setDetailProduct(null)} className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-400">Total On Hand</div>
                <div className="font-mono text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                  {getProductStock(detailProduct.id)} {detailProduct.unit}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-400">Purchase Price</div>
                <div className="font-mono text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                  {formatCurrency(detailProduct.purchasePrice)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-400">Selling Price</div>
                <div className="font-mono text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                  {formatCurrency(detailProduct.sellingPrice)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-400">AI Training</div>
                <div className="font-mono text-base font-semibold text-slate-900 dark:text-white mt-0.5 capitalize">
                  {detailProduct.recognitionProfile?.status || 'untrained'}
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-white mb-2">Balance by Storage Location</h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                {workspace.locations.map((l) => {
                  const bal = getProductStock(detailProduct.id, l.id);
                  return (
                    <div key={l.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                      <span className="text-slate-700 dark:text-slate-300">
                        {l.branchName} · {l.locationName}
                      </span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">
                        {bal} {detailProduct.unit}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const p = detailProduct;
                  setDetailProduct(null);
                  setTrainingProduct(p);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Train AI Profile
              </button>
              {onOpenAICameraForProduct && (
                <button
                  type="button"
                  onClick={() => {
                    const id = detailProduct.id;
                    setDetailProduct(null);
                    onOpenAICameraForProduct(id);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-xs font-medium text-white cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Count with AI Camera
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unit Conversion Rules Modal */}
      {showUnitsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Unit Conversion Rules
              </h3>
              <button type="button" onClick={() => setShowUnitsModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Example: 1 Carton = 24 Bottles. Receiving 5 Cartons automatically calculates 120 Bottles.
            </p>
            <form onSubmit={handleSaveUnitRule} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-4">
                <label className="block text-[11px] text-slate-500 mb-1">1 Bulk Unit</label>
                <select
                  value={fromUnit}
                  onChange={(e) => setFromUnit(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                >
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-3">
                <label className="block text-[11px] text-slate-500 mb-1">Equals Qty</label>
                <input
                  type="number"
                  min={1}
                  value={convFactor}
                  onChange={(e) => setConvFactor(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-[11px] text-slate-500 mb-1">Base Unit</label>
                <select
                  value={toUnit}
                  onChange={(e) => setToUnit(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                >
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <button type="submit" className="w-full py-2 rounded-lg bg-blue-600 text-xs font-medium text-white cursor-pointer">
                  Add
                </button>
              </div>
            </form>

            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
              {workspace.unitConversions.map((r) => (
                <div key={r.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-900 dark:text-white">
                    1 {r.fromUnit} = {r.factor} {r.toUnit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {trainingProduct && (
        <ProductTrainingModal product={trainingProduct} onClose={() => setTrainingProduct(null)} />
      )}
    </div>
  );
};
