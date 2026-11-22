export type UserRole =
  | 'Super Administrator'
  | 'Manager'
  | 'Storekeeper'
  | 'Employee'
  | 'Auditor';

export type BottleCapRule =
  | 'count_all'
  | 'capped_only'
  | 'sealed_only'
  | 'count_open_separately';

export type BusinessCategoryPreset =
  | 'Bar and Lounge'
  | 'Hotel'
  | 'Restaurant'
  | 'Hospital'
  | 'Pharmacy'
  | 'Supermarket'
  | 'Retail Shop'
  | 'Warehouse'
  | 'Timber Supplier'
  | 'Roofing Sheet Supplier'
  | 'Hardware Store'
  | 'Factory'
  | 'Distribution Company'
  | 'Construction Materials'
  | 'Other';

export interface CustomCategoryField {
  id: string;
  label: string;
  fieldType: 'text' | 'number' | 'date' | 'select';
  required: boolean;
  options?: string[];
}

export interface CustomBusinessCategory {
  id: string;
  name: string;
  productTypes: string[];
  customFields: CustomCategoryField[];
  defaultUnits: string[];
  stockTakingProcedure: string;
  createdAt: string;
}

export interface BusinessProfile {
  id: string;
  workspaceCode: string;
  name: string;
  category: string;
  isCustomCategory: boolean;
  customCategoryId?: string;
  location: string;
  address: string;
  contactInfo: string;
  logoDataUrl?: string;
  currency: string;
  registrationNumber?: string;
  branchCount: number;
  preferences: {
    defaultBottleCapRule: BottleCapRule;
    allowNegativeStock: boolean;
    lowStockAlertPercent: number;
    nearExpiryDays: number;
    requireSupervisorApprovalForDamage: boolean;
    enableAutoSync: boolean;
  };
  updatedAt: string;
}

export interface BranchLocation {
  id: string;
  branchName: string;
  locationName: string;
  locationType: 'Main Store' | 'Department' | 'Counter' | 'Yard' | 'Warehouse' | 'Pharmacy' | 'Other';
  address?: string;
  managerName?: string;
  isActive: boolean;
  createdAt: string;
}

export interface UnitConversionRule {
  id: string;
  fromUnit: string;
  toUnit: string;
  factor: number; // e.g. 1 Carton = 24 Bottles -> fromUnit='Cartons', toUnit='Bottles', factor=24
  productId?: string; // optional product-specific override
  createdAt: string;
}

export interface ProductRecognitionProfile {
  status: 'untrained' | 'basic' | 'verified';
  trainingPhotos: {
    id: string;
    angle: 'front' | 'back' | 'side' | 'packaging' | 'cap';
    dataUrl: string;
    capturedAt: string;
  }[];
  visualSignatureSummary: string;
  distinctiveFeatures: string[];
  labelKeywords: string[];
  dominantColors: string[];
  packagingType: string;
  bottleCapRule: BottleCapRule;
  lastTrainedAt?: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  sku: string;
  barcode: string;
  qrCode: string;
  category: string;
  description: string;
  size: string;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  minStockLevel: number;
  maxStockLevel: number;
  supplierId?: string;
  defaultLocationId: string;
  expirationDate?: string;
  batchNumber?: string;
  status: 'active' | 'inactive' | 'quarantined';
  imageDataUrl?: string;
  customFields?: Record<string, string>;
  recognitionProfile: ProductRecognitionProfile;
  createdAt: string;
  updatedAt: string;
}

// Per-location inventory balance: key = `${productId}::${locationId}`
export interface StockBalance {
  id: string;
  productId: string;
  locationId: string;
  quantity: number;
  openUnitsQuantity: number; // e.g. opened bottles tracked separately when configured
  damagedQuantity: number;
  expiredQuantity: number;
  lastCountedAt?: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  categories: string[];
  leadTimeDays: number;
  notes: string;
  createdAt: string;
}

export type TransactionType =
  | 'INCOMING'
  | 'OUTGOING'
  | 'DAMAGE_DEDUCTION'
  | 'EXPIRED_DISPOSAL'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'STOCK_TAKE_ADJUSTMENT'
  | 'OPENING_BALANCE';

export interface InventoryTransaction {
  id: string;
  mutationId: string; // idempotency key for offline sync
  type: TransactionType;
  productId: string;
  locationId: string;
  relatedLocationId?: string;
  quantityDelta: number; // positive or negative in base product unit
  previousBalance: number;
  newBalance: number;
  unitCost: number;
  totalValue: number;
  referenceNumber: string;
  reason: string;
  performedBy: string;
  approvedBy?: string;
  batchNumber?: string;
  expirationDate?: string;
  createdAt: string;
  clientTimestamp: number;
}

export interface IncomingStockRecord {
  id: string;
  mutationId: string;
  receiptNumber: string;
  dateReceived: string;
  supplierId?: string;
  sourceName: string;
  sourceType: 'Factory' | 'Central Warehouse' | 'Supplier' | 'Distributor' | 'Branch' | 'Direct Purchase' | 'Internal Transfer';
  productId: string;
  locationId: string;
  enteredQuantity: number;
  enteredUnit: string;
  convertedQuantity: number; // in product's base unit
  damagedOnArrival: number;
  acceptedQuantity: number;
  purchasePrice: number;
  batchNumber?: string;
  expirationDate?: string;
  invoiceNumber: string;
  receivedBy: string;
  verifiedBy?: string;
  condition: 'Good' | 'Partial Damage' | 'Inspecting';
  notes: string;
  status: 'pending' | 'confirmed';
  confirmedAt?: string;
  createdAt: string;
}

export interface OutgoingStockRecord {
  id: string;
  mutationId: string;
  referenceNumber: string;
  productId: string;
  locationId: string;
  quantity: number;
  unit: string;
  convertedQuantity: number;
  destination: string;
  reason: 'Sale' | 'Internal Consumption' | 'Department Issuance' | 'Return' | 'Business Operation' | 'Other';
  employee: string;
  approvedBy?: string;
  status: 'pending' | 'approved' | 'rejected';
  notes: string;
  createdAt: string;
}

export type DamageType =
  | 'Broken'
  | 'Dropped'
  | 'Cracked'
  | 'Leaking'
  | 'Expired'
  | 'Spoiled'
  | 'Missing'
  | 'Contaminated'
  | 'Unusable'
  | 'Other';

export interface DamageReport {
  id: string;
  mutationId: string;
  productId: string;
  locationId: string;
  quantity: number;
  damageType: DamageType;
  reportedAt: string;
  reportedBy: string;
  description: string;
  photoDataUrl?: string;
  financialLoss: number;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  deductedTransactionId?: string; // prevents double deduction
}

export interface ExpiredDisposalRecord {
  id: string;
  mutationId: string;
  productId: string;
  locationId: string;
  batchNumber: string;
  expirationDate: string;
  quantity: number;
  actionType: 'quarantined' | 'disposed';
  financialLoss: number;
  reportedBy: string;
  approvedBy?: string;
  status: 'pending' | 'approved';
  createdAt: string;
  approvedAt?: string;
}

export interface StockTransferRecord {
  id: string;
  mutationId: string;
  referenceNumber: string;
  fromLocationId: string;
  toLocationId: string;
  productId: string;
  quantity: number;
  requestedBy: string;
  dispatchedBy?: string;
  receivedBy?: string;
  status: 'requested' | 'dispatched' | 'received' | 'cancelled';
  notes: string;
  createdAt: string;
  dispatchedAt?: string;
  receivedAt?: string;
}

export interface StockTakingItem {
  id: string;
  productId: string;
  locationId: string;
  method: 'ai_camera' | 'barcode' | 'qr' | 'manual' | 'spreadsheet';
  previousStock: number;
  receivedSinceLast: number;
  issuedSinceLast: number;
  damagedSinceLast: number;
  expectedStock: number;
  physicalCount: number;
  openBottlesCount: number;
  uncertainCount: number;
  variance: number;
  confidenceAvg?: number;
  notes?: string;
  countedBy: string;
  countedAt: string;
}

export interface StockTakingSession {
  id: string;
  mutationId: string;
  title: string;
  locationId: string;
  categoryFilter: string;
  status: 'in_progress' | 'submitted' | 'finalized';
  items: StockTakingItem[];
  startedBy: string;
  finalizedBy?: string;
  createdAt: string;
  finalizedAt?: string;
}

export interface AppNotification {
  id: string;
  type:
    | 'low_stock'
    | 'out_of_stock'
    | 'near_expiry'
    | 'expired'
    | 'incoming_pending'
    | 'damage_pending'
    | 'discrepancy'
    | 'incomplete_session'
    | 'system';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  relatedId?: string;
  read: boolean;
  createdAt: string;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  assignedLocationIds: string[];
  isActive: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: string;
}

export interface WorkspaceState {
  workspaceId: string;
  workspaceCode: string;
  version: number;
  lastSyncedAt: string;
  business: BusinessProfile | null;
  customCategories: CustomBusinessCategory[];
  locations: BranchLocation[];
  unitConversions: UnitConversionRule[];
  suppliers: Supplier[];
  products: Product[];
  stockBalances: StockBalance[];
  incomingRecords: IncomingStockRecord[];
  outgoingRecords: OutgoingStockRecord[];
  damageReports: DamageReport[];
  expiredDisposals: ExpiredDisposalRecord[];
  transfers: StockTransferRecord[];
  stockTakingSessions: StockTakingSession[];
  transactions: InventoryTransaction[];
  notifications: AppNotification[];
  users: UserAccount[];
  auditLogs: AuditLogEntry[];
  processedMutationIds: string[];
}

export interface PendingMutation {
  mutationId: string;
  workspaceId: string;
  actionType: string;
  payload: Record<string, unknown>;
  clientTimestamp: number;
  attempts: number;
  createdAt: string;
}

export interface AuthSession {
  user: UserAccount;
  workspaceId: string;
  workspaceCode: string;
  token?: string;
}

export interface AIDetectionBox {
  id: string;
  label: string;
  brandDetected: string;
  confidence: number;
  capStatus: 'capped' | 'uncapped' | 'sealed' | 'open' | 'not_applicable' | 'uncertain';
  eligibleForCount: boolean;
  reason: string;
  bbox: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0..1000
}

export interface AICountResponse {
  matchedCount: number;
  openCount: number;
  uncertainCount: number;
  ignoredCount: number;
  ignoredBrands: string[];
  overallConfidence: number;
  needsManualVerification: boolean;
  summary: string;
  detections: AIDetectionBox[];
}
