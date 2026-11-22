import { BusinessCategoryPreset } from '../types/inventory';

export const BUSINESS_CATEGORIES: BusinessCategoryPreset[] = [
  'Bar and Lounge',
  'Hotel',
  'Restaurant',
  'Hospital',
  'Pharmacy',
  'Supermarket',
  'Retail Shop',
  'Warehouse',
  'Timber Supplier',
  'Roofing Sheet Supplier',
  'Hardware Store',
  'Factory',
  'Distribution Company',
  'Construction Materials',
  'Other',
];

export const STANDARD_UNITS: string[] = [
  'Pieces',
  'Bottles',
  'Cartons',
  'Boxes',
  'Packs',
  'Kilograms',
  'Grams',
  'Litres',
  'Millilitres',
  'Metres',
  'Rolls',
  'Sheets',
  'Bags',
  'Pallets',
];

export const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'TZS', symbol: 'TZS ', label: 'TZS (Tanzanian Shilling)' },
  { code: 'KES', symbol: 'KES ', label: 'KES (Kenyan Shilling)' },
  { code: 'UGX', symbol: 'UGX ', label: 'UGX (Ugandan Shilling)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP (£)' },
  { code: 'ZAR', symbol: 'R', label: 'ZAR (Rand)' },
  { code: 'NGN', symbol: '₦', label: 'NGN (Naira)' },
];

export const DEFAULT_LOCATIONS_BY_CATEGORY: Record<
  string,
  { branchName: string; locationName: string; locationType: 'Main Store' | 'Department' | 'Counter' | 'Yard' | 'Warehouse' | 'Pharmacy' | 'Other' }[]
> = {
  'Bar and Lounge': [
    { branchName: 'Main Branch', locationName: 'Main Store', locationType: 'Main Store' },
    { branchName: 'Main Branch', locationName: 'Large Counter', locationType: 'Counter' },
    { branchName: 'Main Branch', locationName: 'Small Counter', locationType: 'Counter' },
    { branchName: 'Main Branch', locationName: 'Bar', locationType: 'Counter' },
    { branchName: 'Main Branch', locationName: 'Kitchen', locationType: 'Department' },
  ],
  Hotel: [
    { branchName: 'Main Property', locationName: 'Main Store', locationType: 'Main Store' },
    { branchName: 'Main Property', locationName: 'Bar', locationType: 'Counter' },
    { branchName: 'Main Property', locationName: 'Restaurant', locationType: 'Department' },
    { branchName: 'Main Property', locationName: 'Kitchen', locationType: 'Department' },
    { branchName: 'Main Property', locationName: 'Housekeeping', locationType: 'Department' },
  ],
  Hospital: [
    { branchName: 'Central Campus', locationName: 'Main Pharmacy', locationType: 'Pharmacy' },
    { branchName: 'Central Campus', locationName: 'Emergency Department', locationType: 'Department' },
    { branchName: 'Central Campus', locationName: 'Laboratory', locationType: 'Department' },
    { branchName: 'Central Campus', locationName: 'Medical Supplies Store', locationType: 'Main Store' },
  ],
  Pharmacy: [
    { branchName: 'Main Pharmacy', locationName: 'Dispensary Shelf', locationType: 'Pharmacy' },
    { branchName: 'Main Pharmacy', locationName: 'Cold Chain Storage', locationType: 'Main Store' },
    { branchName: 'Main Pharmacy', locationName: 'Backroom Store', locationType: 'Warehouse' },
  ],
  'Timber Supplier': [
    { branchName: 'Central Yard', locationName: 'Main Warehouse', locationType: 'Warehouse' },
    { branchName: 'Central Yard', locationName: 'Timber Yard', locationType: 'Yard' },
    { branchName: 'Central Yard', locationName: 'Cutting Section', locationType: 'Department' },
    { branchName: 'Central Yard', locationName: 'Delivery Area', locationType: 'Other' },
  ],
  'Roofing Sheet Supplier': [
    { branchName: 'Main Depot', locationName: 'Sheet Warehouse', locationType: 'Warehouse' },
    { branchName: 'Main Depot', locationName: 'Roll Forming Bay', locationType: 'Department' },
    { branchName: 'Main Depot', locationName: 'Dispatch Yard', locationType: 'Yard' },
  ],
  default: [
    { branchName: 'Headquarters', locationName: 'Main Store', locationType: 'Main Store' },
    { branchName: 'Headquarters', locationName: 'Sales Floor', locationType: 'Counter' },
    { branchName: 'Headquarters', locationName: 'Warehouse Bay A', locationType: 'Warehouse' },
  ],
};

export const PRODUCT_CATEGORIES_BY_BUSINESS: Record<string, string[]> = {
  'Bar and Lounge': ['Soft Drinks & Sodas', 'Wines', 'Spirits & Whiskey', 'Beers & Ciders', 'Bottled Water', 'Mixers & Syrups', 'Shisha & Accessories', 'Kitchen Supplies'],
  Hotel: ['Beverages', 'Dry Goods', 'Housekeeping Supplies', 'Guest Amenities', 'Kitchen & Dairy', 'Linen & Maintenance'],
  Hospital: ['Pharmaceuticals', 'Surgical Consumables', 'Laboratory Reagents', 'IV Fluids', 'PPE & Sterile Supplies'],
  Pharmacy: ['Prescription Medicines', 'OTC Medications', 'Supplements', 'First Aid', 'Medical Devices'],
  'Timber Supplier': ['Hardwood Planks', 'Softwood Beams', 'Plywood & MDF', 'Treated Poles', 'Wood Adhesives & Nails'],
  'Roofing Sheet Supplier': ['Corrugated Iron Sheets', 'Box Profile Sheets', 'Stone-Coated Tiles', 'Ridge Caps & Flashings', 'Roofing Fasteners'],
  'Hardware Store': ['Fasteners & Bolts', 'Plumbing Fittings', 'Electrical Supplies', 'Paints & Coatings', 'Hand & Power Tools'],
  default: ['Beverages', 'Packaged Goods', 'Raw Materials', 'Consumables', 'Equipment & Parts', 'General Merchandise'],
};

export const DEFAULT_UNIT_CONVERSIONS = [
  { fromUnit: 'Cartons', toUnit: 'Bottles', factor: 24 },
  { fromUnit: 'Boxes', toUnit: 'Pieces', factor: 12 },
  { fromUnit: 'Packs', toUnit: 'Bottles', factor: 6 },
  { fromUnit: 'Pallets', toUnit: 'Cartons', factor: 40 },
  { fromUnit: 'Kilograms', toUnit: 'Grams', factor: 1000 },
  { fromUnit: 'Litres', toUnit: 'Millilitres', factor: 1000 },
];
