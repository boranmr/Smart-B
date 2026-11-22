import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  AppNotification,
  AuditLogEntry,
  BranchLocation,
  BusinessProfile,
  CustomBusinessCategory,
  DamageReport,
  ExpiredDisposalRecord,
  IncomingStockRecord,
  InventoryTransaction,
  OutgoingStockRecord,
  Product,
  StockBalance,
  StockTakingSession,
  StockTransferRecord,
  Supplier,
  UnitConversionRule,
  UserAccount,
  UserRole,
  WorkspaceState,
} from '../src/types/inventory.ts';

export interface StoredUserRecord extends UserAccount {
  passwordHash: string;
  passwordSalt: string;
  workspaceId: string;
}

export interface DatabaseFile {
  usersByEmail: Record<string, StoredUserRecord>;
  workspaces: Record<string, WorkspaceState>;
  workspaceCodeIndex: Record<string, string>; // workspaceCode -> workspaceId
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'smart-inventory-db.json');

let dbCache: DatabaseFile | null = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadDatabase(): DatabaseFile {
  if (dbCache) return dbCache;
  ensureDataDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as DatabaseFile;
      dbCache = {
        usersByEmail: parsed.usersByEmail || {},
        workspaces: parsed.workspaces || {},
        workspaceCodeIndex: parsed.workspaceCodeIndex || {},
      };
      return dbCache;
    } catch {
      // If file is corrupted, recover cleanly with empty structure
    }
  }
  dbCache = {
    usersByEmail: {},
    workspaces: {},
    workspaceCodeIndex: {},
  };
  saveDatabase(dbCache);
  return dbCache;
}

export function saveDatabase(db: DatabaseFile): void {
  ensureDataDir();
  dbCache = db;
  const tmpFile = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { hash: derived, salt: actualSalt };
}

export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

export function generateWorkspaceCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += chars[crypto.randomInt(0, chars.length)];
    part2 += chars[crypto.randomInt(0, chars.length)];
  }
  return `SIA-${part1}-${part2}`;
}

export function createEmptyWorkspace(
  workspaceId: string,
  workspaceCode: string,
  initialUser: UserAccount
): WorkspaceState {
  const now = new Date().toISOString();
  return {
    workspaceId,
    workspaceCode,
    version: 1,
    lastSyncedAt: now,
    business: null,
    customCategories: [],
    locations: [],
    unitConversions: [],
    suppliers: [],
    products: [],
    stockBalances: [],
    incomingRecords: [],
    outgoingRecords: [],
    damageReports: [],
    expiredDisposals: [],
    transfers: [],
    stockTakingSessions: [],
    transactions: [],
    notifications: [],
    users: [initialUser],
    auditLogs: [
      {
        id: crypto.randomUUID(),
        actorId: initialUser.id,
        actorName: initialUser.name,
        actorRole: initialUser.role,
        action: 'WORKSPACE_CREATED',
        entityType: 'Workspace',
        entityId: workspaceId,
        summary: `Workspace ${workspaceCode} initialized by ${initialUser.name}`,
        createdAt: now,
      },
    ],
    processedMutationIds: [],
  };
}

function getOrCreateBalance(ws: WorkspaceState, productId: string, locationId: string): StockBalance {
  let bal = ws.stockBalances.find((b) => b.productId === productId && b.locationId === locationId);
  if (!bal) {
    bal = {
      id: `${productId}::${locationId}`,
      productId,
      locationId,
      quantity: 0,
      openUnitsQuantity: 0,
      damagedQuantity: 0,
      expiredQuantity: 0,
      updatedAt: new Date().toISOString(),
    };
    ws.stockBalances.push(bal);
  }
  return bal;
}

function appendAudit(
  ws: WorkspaceState,
  actor: { id: string; name: string; role: UserRole },
  action: string,
  entityType: string,
  entityId: string,
  summary: string
) {
  const entry: AuditLogEntry = {
    id: crypto.randomUUID(),
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    summary,
    createdAt: new Date().toISOString(),
  };
  ws.auditLogs.unshift(entry);
  if (ws.auditLogs.length > 2000) {
    ws.auditLogs = ws.auditLogs.slice(0, 2000);
  }
}

function addNotification(
  ws: WorkspaceState,
  notif: Omit<AppNotification, 'id' | 'read' | 'createdAt'>
) {
  const existingUnread = ws.notifications.find(
    (n) => !n.read && n.type === notif.type && n.relatedId === notif.relatedId
  );
  if (existingUnread) return;
  ws.notifications.unshift({
    ...notif,
    id: crypto.randomUUID(),
    read: false,
    createdAt: new Date().toISOString(),
  });
  if (ws.notifications.length > 500) {
    ws.notifications = ws.notifications.slice(0, 500);
  }
}

function evaluateProductAlerts(ws: WorkspaceState, productId: string) {
  const product = ws.products.find((p) => p.id === productId);
  if (!product) return;
  const totalQty = ws.stockBalances
    .filter((b) => b.productId === productId)
    .reduce((sum, b) => sum + b.quantity, 0);

  if (totalQty <= 0) {
    addNotification(ws, {
      type: 'out_of_stock',
      severity: 'critical',
      title: `Out of Stock: ${product.name}`,
      message: `${product.name} (${product.brand}) has 0 ${product.unit} remaining across locations.`,
      relatedId: product.id,
    });
  } else if (totalQty <= product.minStockLevel) {
    addNotification(ws, {
      type: 'low_stock',
      severity: 'warning',
      title: `Low Stock Alert: ${product.name}`,
      message: `Current balance (${totalQty} ${product.unit}) is at or below minimum threshold (${product.minStockLevel}).`,
      relatedId: product.id,
    });
  }

  if (product.expirationDate) {
    const expMs = Date.parse(product.expirationDate);
    const nowMs = Date.now();
    const nearDays = ws.business?.preferences?.nearExpiryDays ?? 30;
    const daysLeft = Math.ceil((expMs - nowMs) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0 && totalQty > 0) {
      addNotification(ws, {
        type: 'expired',
        severity: 'critical',
        title: `Expired Product: ${product.name}`,
        message: `Batch ${product.batchNumber || 'N/A'} expired on ${product.expirationDate}. Quarantine or dispose immediately.`,
        relatedId: product.id,
      });
    } else if (daysLeft > 0 && daysLeft <= nearDays && totalQty > 0) {
      addNotification(ws, {
        type: 'near_expiry',
        severity: 'warning',
        title: `Near Expiration (${daysLeft}d): ${product.name}`,
        message: `Batch ${product.batchNumber || 'N/A'} expires on ${product.expirationDate}.`,
        relatedId: product.id,
      });
    }
  }
}

export interface MutationApplyResult {
  applied: boolean;
  error?: string;
  workspace: WorkspaceState;
}

export function applyMutationToWorkspace(
  ws: WorkspaceState,
  mutation: {
    mutationId: string;
    actionType: string;
    payload: Record<string, unknown>;
    clientTimestamp: number;
  },
  actor: { id: string; name: string; role: UserRole }
): MutationApplyResult {
  if (ws.processedMutationIds.includes(mutation.mutationId)) {
    return { applied: false, workspace: ws };
  }

  const now = new Date().toISOString();
  const p = mutation.payload as Record<string, any>;

  try {
    switch (mutation.actionType) {
      case 'SAVE_BUSINESS_PROFILE': {
        const profile = p.business as BusinessProfile;
        ws.business = { ...profile, updatedAt: now };
        if (Array.isArray(p.locations) && ws.locations.length === 0) {
          ws.locations.push(...(p.locations as BranchLocation[]));
        }
        if (Array.isArray(p.unitConversions) && ws.unitConversions.length === 0) {
          ws.unitConversions.push(...(p.unitConversions as UnitConversionRule[]));
        }
        appendAudit(ws, actor, 'BUSINESS_UPDATED', 'Business', profile.id, `Updated business setup for ${profile.name}`);
        break;
      }

      case 'ADD_CUSTOM_CATEGORY': {
        const cat = p.category as CustomBusinessCategory;
        const idx = ws.customCategories.findIndex((c) => c.id === cat.id);
        if (idx >= 0) ws.customCategories[idx] = cat;
        else ws.customCategories.push(cat);
        appendAudit(ws, actor, 'CUSTOM_CATEGORY_SAVED', 'Category', cat.id, `Saved custom business category "${cat.name}"`);
        break;
      }

      case 'SAVE_LOCATION': {
        const loc = p.location as BranchLocation;
        const idx = ws.locations.findIndex((l) => l.id === loc.id);
        if (idx >= 0) ws.locations[idx] = loc;
        else ws.locations.push(loc);
        appendAudit(ws, actor, 'LOCATION_SAVED', 'Location', loc.id, `Saved location ${loc.branchName} · ${loc.locationName}`);
        break;
      }

      case 'SAVE_UNIT_CONVERSION': {
        const rule = p.rule as UnitConversionRule;
        const idx = ws.unitConversions.findIndex((r) => r.id === rule.id);
        if (idx >= 0) ws.unitConversions[idx] = rule;
        else ws.unitConversions.push(rule);
        appendAudit(ws, actor, 'UNIT_RULE_SAVED', 'UnitConversion', rule.id, `1 ${rule.fromUnit} = ${rule.factor} ${rule.toUnit}`);
        break;
      }

      case 'SAVE_SUPPLIER': {
        const supplier = p.supplier as Supplier;
        const idx = ws.suppliers.findIndex((s) => s.id === supplier.id);
        if (idx >= 0) ws.suppliers[idx] = supplier;
        else ws.suppliers.push(supplier);
        appendAudit(ws, actor, 'SUPPLIER_SAVED', 'Supplier', supplier.id, `Saved supplier ${supplier.name}`);
        break;
      }

      case 'SAVE_PRODUCT': {
        const product = p.product as Product;
        const initialQty = Number(p.initialQuantity || 0);
        const idx = ws.products.findIndex((item) => item.id === product.id);
        if (idx >= 0) {
          ws.products[idx] = { ...product, updatedAt: now };
          appendAudit(ws, actor, 'PRODUCT_UPDATED', 'Product', product.id, `Updated product ${product.name}`);
        } else {
          ws.products.unshift({ ...product, createdAt: product.createdAt || now, updatedAt: now });
          const bal = getOrCreateBalance(ws, product.id, product.defaultLocationId);
          if (initialQty > 0) {
            const prev = bal.quantity;
            bal.quantity += initialQty;
            bal.updatedAt = now;
            ws.transactions.unshift({
              id: crypto.randomUUID(),
              mutationId: mutation.mutationId,
              type: 'OPENING_BALANCE',
              productId: product.id,
              locationId: product.defaultLocationId,
              quantityDelta: initialQty,
              previousBalance: prev,
              newBalance: bal.quantity,
              unitCost: product.purchasePrice,
              totalValue: initialQty * product.purchasePrice,
              referenceNumber: `OPEN-${product.sku}`,
              reason: 'Initial opening stock upon product registration',
              performedBy: actor.name,
              batchNumber: product.batchNumber,
              expirationDate: product.expirationDate,
              createdAt: now,
              clientTimestamp: mutation.clientTimestamp,
            });
          }
          appendAudit(ws, actor, 'PRODUCT_CREATED', 'Product', product.id, `Registered product ${product.name} (${product.sku})`);
        }
        evaluateProductAlerts(ws, product.id);
        break;
      }

      case 'UPDATE_RECOGNITION_PROFILE': {
        const productId = String(p.productId);
        const prod = ws.products.find((item) => item.id === productId);
        if (!prod) return { applied: false, error: 'Product not found', workspace: ws };
        prod.recognitionProfile = p.recognitionProfile;
        prod.updatedAt = now;
        appendAudit(ws, actor, 'AI_PROFILE_TRAINED', 'Product', prod.id, `Updated AI recognition profile for ${prod.name}`);
        break;
      }

      case 'CREATE_INCOMING_STOCK': {
        const record = p.record as IncomingStockRecord;
        ws.incomingRecords.unshift(record);
        if (record.status === 'confirmed') {
          const bal = getOrCreateBalance(ws, record.productId, record.locationId);
          const prev = bal.quantity;
          bal.quantity += record.acceptedQuantity;
          bal.damagedQuantity += record.damagedOnArrival;
          bal.updatedAt = now;
          ws.transactions.unshift({
            id: crypto.randomUUID(),
            mutationId: mutation.mutationId,
            type: 'INCOMING',
            productId: record.productId,
            locationId: record.locationId,
            quantityDelta: record.acceptedQuantity,
            previousBalance: prev,
            newBalance: bal.quantity,
            unitCost: record.purchasePrice,
            totalValue: record.acceptedQuantity * record.purchasePrice,
            referenceNumber: record.receiptNumber,
            reason: `Incoming from ${record.sourceName} (Received: ${record.convertedQuantity}, Damaged: ${record.damagedOnArrival})`,
            performedBy: record.receivedBy,
            approvedBy: record.verifiedBy || actor.name,
            batchNumber: record.batchNumber,
            expirationDate: record.expirationDate,
            createdAt: now,
            clientTimestamp: mutation.clientTimestamp,
          });
          evaluateProductAlerts(ws, record.productId);
        } else {
          addNotification(ws, {
            type: 'incoming_pending',
            severity: 'info',
            title: `Pending Incoming Receipt: ${record.receiptNumber}`,
            message: `${record.acceptedQuantity} units awaiting verification before stock credit.`,
            relatedId: record.id,
          });
        }
        appendAudit(ws, actor, 'INCOMING_RECORDED', 'IncomingStock', record.id, `Recorded incoming ${record.receiptNumber} (${record.status})`);
        break;
      }

      case 'CONFIRM_INCOMING_STOCK': {
        const recordId = String(p.recordId);
        const record = ws.incomingRecords.find((r) => r.id === recordId);
        if (!record) return { applied: false, error: 'Incoming receipt not found', workspace: ws };
        if (record.status === 'confirmed') return { applied: false, workspace: ws };
        record.status = 'confirmed';
        record.verifiedBy = String(p.verifiedBy || actor.name);
        record.confirmedAt = now;
        const bal = getOrCreateBalance(ws, record.productId, record.locationId);
        const prev = bal.quantity;
        bal.quantity += record.acceptedQuantity;
        bal.damagedQuantity += record.damagedOnArrival;
        bal.updatedAt = now;
        ws.transactions.unshift({
          id: crypto.randomUUID(),
          mutationId: mutation.mutationId,
          type: 'INCOMING',
          productId: record.productId,
          locationId: record.locationId,
          quantityDelta: record.acceptedQuantity,
          previousBalance: prev,
          newBalance: bal.quantity,
          unitCost: record.purchasePrice,
          totalValue: record.acceptedQuantity * record.purchasePrice,
          referenceNumber: record.receiptNumber,
          reason: `Confirmed incoming from ${record.sourceName}`,
          performedBy: record.receivedBy,
          approvedBy: record.verifiedBy,
          batchNumber: record.batchNumber,
          expirationDate: record.expirationDate,
          createdAt: now,
          clientTimestamp: mutation.clientTimestamp,
        });
        evaluateProductAlerts(ws, record.productId);
        appendAudit(ws, actor, 'INCOMING_CONFIRMED', 'IncomingStock', record.id, `Confirmed receipt ${record.receiptNumber} (+${record.acceptedQuantity})`);
        break;
      }

      case 'RECORD_OUTGOING_STOCK': {
        const record = p.record as OutgoingStockRecord;
        const allowNegative = Boolean(ws.business?.preferences?.allowNegativeStock) && Boolean(p.adminOverride);
        const bal = getOrCreateBalance(ws, record.productId, record.locationId);
        if (record.status === 'approved' && !allowNegative && bal.quantity < record.convertedQuantity) {
          return {
            applied: false,
            error: `Insufficient stock in location (Available: ${bal.quantity}, Requested: ${record.convertedQuantity}).`,
            workspace: ws,
          };
        }
        ws.outgoingRecords.unshift(record);
        if (record.status === 'approved') {
          const prod = ws.products.find((pr) => pr.id === record.productId);
          const prev = bal.quantity;
          bal.quantity -= record.convertedQuantity;
          bal.updatedAt = now;
          ws.transactions.unshift({
            id: crypto.randomUUID(),
            mutationId: mutation.mutationId,
            type: 'OUTGOING',
            productId: record.productId,
            locationId: record.locationId,
            quantityDelta: -record.convertedQuantity,
            previousBalance: prev,
            newBalance: bal.quantity,
            unitCost: prod?.purchasePrice || 0,
            totalValue: record.convertedQuantity * (prod?.purchasePrice || 0),
            referenceNumber: record.referenceNumber,
            reason: `${record.reason} -> ${record.destination}`,
            performedBy: record.employee,
            approvedBy: record.approvedBy || actor.name,
            createdAt: now,
            clientTimestamp: mutation.clientTimestamp,
          });
          evaluateProductAlerts(ws, record.productId);
        }
        appendAudit(ws, actor, 'OUTGOING_RECORDED', 'OutgoingStock', record.id, `Outgoing ${record.referenceNumber} (-${record.convertedQuantity})`);
        break;
      }

      case 'APPROVE_OUTGOING_STOCK': {
        const recordId = String(p.recordId);
        const record = ws.outgoingRecords.find((r) => r.id === recordId);
        if (!record || record.status !== 'pending') return { applied: false, workspace: ws };
        const bal = getOrCreateBalance(ws, record.productId, record.locationId);
        const allowNegative = Boolean(ws.business?.preferences?.allowNegativeStock);
        if (!allowNegative && bal.quantity < record.convertedQuantity) {
          return {
            applied: false,
            error: `Insufficient stock to approve outgoing (${bal.quantity} available).`,
            workspace: ws,
          };
        }
        record.status = 'approved';
        record.approvedBy = actor.name;
        const prod = ws.products.find((pr) => pr.id === record.productId);
        const prev = bal.quantity;
        bal.quantity -= record.convertedQuantity;
        bal.updatedAt = now;
        ws.transactions.unshift({
          id: crypto.randomUUID(),
          mutationId: mutation.mutationId,
          type: 'OUTGOING',
          productId: record.productId,
          locationId: record.locationId,
          quantityDelta: -record.convertedQuantity,
          previousBalance: prev,
          newBalance: bal.quantity,
          unitCost: prod?.purchasePrice || 0,
          totalValue: record.convertedQuantity * (prod?.purchasePrice || 0),
          referenceNumber: record.referenceNumber,
          reason: `${record.reason} -> ${record.destination}`,
          performedBy: record.employee,
          approvedBy: actor.name,
          createdAt: now,
          clientTimestamp: mutation.clientTimestamp,
        });
        evaluateProductAlerts(ws, record.productId);
        appendAudit(ws, actor, 'OUTGOING_APPROVED', 'OutgoingStock', record.id, `Approved outgoing ${record.referenceNumber}`);
        break;
      }

      case 'SUBMIT_DAMAGE_REPORT': {
        const report = p.report as DamageReport;
        ws.damageReports.unshift(report);
        if (report.status === 'approved') {
          const bal = getOrCreateBalance(ws, report.productId, report.locationId);
          const prev = bal.quantity;
          bal.quantity = Math.max(0, bal.quantity - report.quantity);
          bal.damagedQuantity += report.quantity;
          bal.updatedAt = now;
          const txId = crypto.randomUUID();
          report.deductedTransactionId = txId;
          const prod = ws.products.find((pr) => pr.id === report.productId);
          ws.transactions.unshift({
            id: txId,
            mutationId: mutation.mutationId,
            type: 'DAMAGE_DEDUCTION',
            productId: report.productId,
            locationId: report.locationId,
            quantityDelta: -report.quantity,
            previousBalance: prev,
            newBalance: bal.quantity,
            unitCost: prod?.purchasePrice || 0,
            totalValue: report.financialLoss,
            referenceNumber: `DMG-${report.id.slice(0, 6).toUpperCase()}`,
            reason: `Damage (${report.damageType}): ${report.description}`,
            performedBy: report.reportedBy,
            approvedBy: report.approvedBy || actor.name,
            createdAt: now,
            clientTimestamp: mutation.clientTimestamp,
          });
          evaluateProductAlerts(ws, report.productId);
        } else {
          addNotification(ws, {
            type: 'damage_pending',
            severity: 'warning',
            title: `Damage Report Pending Approval`,
            message: `${report.quantity} units reported as ${report.damageType} by ${report.reportedBy}.`,
            relatedId: report.id,
          });
        }
        appendAudit(ws, actor, 'DAMAGE_REPORTED', 'DamageReport', report.id, `Reported ${report.quantity} ${report.damageType}`);
        break;
      }

      case 'APPROVE_DAMAGE_REPORT': {
        const reportId = String(p.reportId);
        const decision = p.decision as 'approved' | 'rejected';
        const report = ws.damageReports.find((r) => r.id === reportId);
        if (!report || report.status !== 'pending' || report.deductedTransactionId) {
          return { applied: false, workspace: ws };
        }
        report.status = decision;
        report.approvedBy = actor.name;
        report.approvedAt = now;
        if (decision === 'approved') {
          const bal = getOrCreateBalance(ws, report.productId, report.locationId);
          const prev = bal.quantity;
          bal.quantity = Math.max(0, bal.quantity - report.quantity);
          bal.damagedQuantity += report.quantity;
          bal.updatedAt = now;
          const txId = crypto.randomUUID();
          report.deductedTransactionId = txId;
          const prod = ws.products.find((pr) => pr.id === report.productId);
          ws.transactions.unshift({
            id: txId,
            mutationId: mutation.mutationId,
            type: 'DAMAGE_DEDUCTION',
            productId: report.productId,
            locationId: report.locationId,
            quantityDelta: -report.quantity,
            previousBalance: prev,
            newBalance: bal.quantity,
            unitCost: prod?.purchasePrice || 0,
            totalValue: report.financialLoss,
            referenceNumber: `DMG-${report.id.slice(0, 6).toUpperCase()}`,
            reason: `Approved Damage (${report.damageType}): ${report.description}`,
            performedBy: report.reportedBy,
            approvedBy: actor.name,
            createdAt: now,
            clientTimestamp: mutation.clientTimestamp,
          });
          evaluateProductAlerts(ws, report.productId);
        }
        appendAudit(ws, actor, `DAMAGE_${decision.toUpperCase()}`, 'DamageReport', report.id, `${decision} damage report (${report.quantity} units)`);
        break;
      }

      case 'RECORD_EXPIRED_DISPOSAL': {
        const rec = p.record as ExpiredDisposalRecord;
        ws.expiredDisposals.unshift(rec);
        if (rec.status === 'approved' && rec.actionType === 'disposed') {
          const bal = getOrCreateBalance(ws, rec.productId, rec.locationId);
          const prev = bal.quantity;
          bal.quantity = Math.max(0, bal.quantity - rec.quantity);
          bal.expiredQuantity += rec.quantity;
          bal.updatedAt = now;
          const prod = ws.products.find((pr) => pr.id === rec.productId);
          ws.transactions.unshift({
            id: crypto.randomUUID(),
            mutationId: mutation.mutationId,
            type: 'EXPIRED_DISPOSAL',
            productId: rec.productId,
            locationId: rec.locationId,
            quantityDelta: -rec.quantity,
            previousBalance: prev,
            newBalance: bal.quantity,
            unitCost: prod?.purchasePrice || 0,
            totalValue: rec.financialLoss,
            referenceNumber: `EXP-${rec.id.slice(0, 6).toUpperCase()}`,
            reason: `Approved disposal of expired batch ${rec.batchNumber}`,
            performedBy: rec.reportedBy,
            approvedBy: rec.approvedBy || actor.name,
            batchNumber: rec.batchNumber,
            expirationDate: rec.expirationDate,
            createdAt: now,
            clientTimestamp: mutation.clientTimestamp,
          });
          evaluateProductAlerts(ws, rec.productId);
        } else if (rec.actionType === 'quarantined') {
          const prod = ws.products.find((pr) => pr.id === rec.productId);
          if (prod) prod.status = 'quarantined';
        }
        appendAudit(ws, actor, 'EXPIRED_RECORDED', 'ExpiredDisposal', rec.id, `Recorded ${rec.actionType} for ${rec.quantity} expired units`);
        break;
      }

      case 'CREATE_TRANSFER': {
        const tr = p.transfer as StockTransferRecord;
        const fromBal = getOrCreateBalance(ws, tr.productId, tr.fromLocationId);
        if (fromBal.quantity < tr.quantity) {
          return {
            applied: false,
            error: `Insufficient stock in sending location (${fromBal.quantity} available).`,
            workspace: ws,
          };
        }
        ws.transfers.unshift(tr);
        if (tr.status === 'dispatched' || tr.status === 'received') {
          const prevFrom = fromBal.quantity;
          fromBal.quantity -= tr.quantity;
          fromBal.updatedAt = now;
          const prod = ws.products.find((pr) => pr.id === tr.productId);
          ws.transactions.unshift({
            id: crypto.randomUUID(),
            mutationId: `${mutation.mutationId}:out`,
            type: 'TRANSFER_OUT',
            productId: tr.productId,
            locationId: tr.fromLocationId,
            relatedLocationId: tr.toLocationId,
            quantityDelta: -tr.quantity,
            previousBalance: prevFrom,
            newBalance: fromBal.quantity,
            unitCost: prod?.purchasePrice || 0,
            totalValue: tr.quantity * (prod?.purchasePrice || 0),
            referenceNumber: tr.referenceNumber,
            reason: `Transfer dispatched to destination location`,
            performedBy: tr.dispatchedBy || actor.name,
            createdAt: now,
            clientTimestamp: mutation.clientTimestamp,
          });
        }
        if (tr.status === 'received') {
          const toBal = getOrCreateBalance(ws, tr.productId, tr.toLocationId);
          const prevTo = toBal.quantity;
          toBal.quantity += tr.quantity;
          toBal.updatedAt = now;
          const prod = ws.products.find((pr) => pr.id === tr.productId);
          ws.transactions.unshift({
            id: crypto.randomUUID(),
            mutationId: `${mutation.mutationId}:in`,
            type: 'TRANSFER_IN',
            productId: tr.productId,
            locationId: tr.toLocationId,
            relatedLocationId: tr.fromLocationId,
            quantityDelta: tr.quantity,
            previousBalance: prevTo,
            newBalance: toBal.quantity,
            unitCost: prod?.purchasePrice || 0,
            totalValue: tr.quantity * (prod?.purchasePrice || 0),
            referenceNumber: tr.referenceNumber,
            reason: `Transfer received from source location`,
            performedBy: tr.receivedBy || actor.name,
            createdAt: now,
            clientTimestamp: mutation.clientTimestamp,
          });
        }
        appendAudit(ws, actor, 'TRANSFER_CREATED', 'StockTransfer', tr.id, `Transfer ${tr.referenceNumber} (${tr.status})`);
        break;
      }

      case 'ADVANCE_TRANSFER': {
        const transferId = String(p.transferId);
        const nextStatus = p.nextStatus as 'dispatched' | 'received' | 'cancelled';
        const tr = ws.transfers.find((t) => t.id === transferId);
        if (!tr) return { applied: false, error: 'Transfer not found', workspace: ws };
        const prod = ws.products.find((pr) => pr.id === tr.productId);

        if (nextStatus === 'dispatched' && tr.status === 'requested') {
          const fromBal = getOrCreateBalance(ws, tr.productId, tr.fromLocationId);
          if (fromBal.quantity < tr.quantity) {
            return { applied: false, error: `Insufficient stock to dispatch (${fromBal.quantity} available).`, workspace: ws };
          }
          const prev = fromBal.quantity;
          fromBal.quantity -= tr.quantity;
          fromBal.updatedAt = now;
          tr.status = 'dispatched';
          tr.dispatchedBy = actor.name;
          tr.dispatchedAt = now;
          ws.transactions.unshift({
            id: crypto.randomUUID(),
            mutationId: mutation.mutationId,
            type: 'TRANSFER_OUT',
            productId: tr.productId,
            locationId: tr.fromLocationId,
            relatedLocationId: tr.toLocationId,
            quantityDelta: -tr.quantity,
            previousBalance: prev,
            newBalance: fromBal.quantity,
            unitCost: prod?.purchasePrice || 0,
            totalValue: tr.quantity * (prod?.purchasePrice || 0),
            referenceNumber: tr.referenceNumber,
            reason: 'Transfer dispatched',
            performedBy: actor.name,
            createdAt: now,
            clientTimestamp: mutation.clientTimestamp,
          });
        } else if (nextStatus === 'received' && tr.status === 'dispatched') {
          const toBal = getOrCreateBalance(ws, tr.productId, tr.toLocationId);
          const prev = toBal.quantity;
          toBal.quantity += tr.quantity;
          toBal.updatedAt = now;
          tr.status = 'received';
          tr.receivedBy = actor.name;
          tr.receivedAt = now;
          ws.transactions.unshift({
            id: crypto.randomUUID(),
            mutationId: mutation.mutationId,
            type: 'TRANSFER_IN',
            productId: tr.productId,
            locationId: tr.toLocationId,
            relatedLocationId: tr.fromLocationId,
            quantityDelta: tr.quantity,
            previousBalance: prev,
            newBalance: toBal.quantity,
            unitCost: prod?.purchasePrice || 0,
            totalValue: tr.quantity * (prod?.purchasePrice || 0),
            referenceNumber: tr.referenceNumber,
            reason: 'Transfer received and verified',
            performedBy: actor.name,
            createdAt: now,
            clientTimestamp: mutation.clientTimestamp,
          });
        } else if (nextStatus === 'cancelled' && tr.status === 'requested') {
          tr.status = 'cancelled';
        }
        appendAudit(ws, actor, `TRANSFER_${nextStatus.toUpperCase()}`, 'StockTransfer', tr.id, `Transfer ${tr.referenceNumber} -> ${nextStatus}`);
        break;
      }

      case 'SAVE_STOCK_TAKING_SESSION': {
        const session = p.session as StockTakingSession;
        const idx = ws.stockTakingSessions.findIndex((s) => s.id === session.id);
        if (idx >= 0) ws.stockTakingSessions[idx] = session;
        else ws.stockTakingSessions.unshift(session);

        if (session.status === 'finalized') {
          for (const item of session.items) {
            const bal = getOrCreateBalance(ws, item.productId, item.locationId);
            const prev = bal.quantity;
            const delta = item.physicalCount - prev;
            bal.quantity = item.physicalCount;
            bal.openUnitsQuantity = item.openBottlesCount;
            bal.lastCountedAt = now;
            bal.updatedAt = now;

            if (delta !== 0) {
              const prod = ws.products.find((pr) => pr.id === item.productId);
              ws.transactions.unshift({
                id: crypto.randomUUID(),
                mutationId: `${mutation.mutationId}:${item.id}`,
                type: 'STOCK_TAKE_ADJUSTMENT',
                productId: item.productId,
                locationId: item.locationId,
                quantityDelta: delta,
                previousBalance: prev,
                newBalance: item.physicalCount,
                unitCost: prod?.purchasePrice || 0,
                totalValue: Math.abs(delta) * (prod?.purchasePrice || 0),
                referenceNumber: `STK-${session.id.slice(0, 6).toUpperCase()}`,
                reason: `Stock-taking reconciliation (${item.method}) variance: ${delta > 0 ? `+${delta}` : delta}`,
                performedBy: item.countedBy,
                approvedBy: session.finalizedBy || actor.name,
                createdAt: now,
                clientTimestamp: mutation.clientTimestamp,
              });
              if (Math.abs(delta) > 0) {
                addNotification(ws, {
                  type: 'discrepancy',
                  severity: Math.abs(delta) >= 5 ? 'critical' : 'warning',
                  title: `Stock Variance Detected`,
                  message: `${prod?.name || 'Product'} variance of ${delta > 0 ? `+${delta}` : delta} recorded in ${session.title}.`,
                  relatedId: session.id,
                });
              }
            }
            evaluateProductAlerts(ws, item.productId);
          }
          appendAudit(ws, actor, 'STOCK_TAKE_FINALIZED', 'StockTakingSession', session.id, `Finalized ${session.title} (${session.items.length} products)`);
        }
        break;
      }

      case 'MARK_NOTIFICATIONS_READ': {
        const ids = Array.isArray(p.ids) ? (p.ids as string[]) : null;
        for (const n of ws.notifications) {
          if (!ids || ids.includes(n.id)) n.read = true;
        }
        break;
      }

      case 'UPDATE_USER_ROLE': {
        const userId = String(p.userId);
        const role = p.role as UserRole;
        const isActive = typeof p.isActive === 'boolean' ? p.isActive : true;
        const user = ws.users.find((u) => u.id === userId);
        if (user) {
          user.role = role;
          user.isActive = isActive;
          appendAudit(ws, actor, 'USER_ROLE_UPDATED', 'User', user.id, `Updated ${user.name} role to ${role}`);
        }
        break;
      }

      case 'CREATE_INVITED_USER': {
        const newUser = p.user as UserAccount;
        if (!ws.users.some((u) => u.email.toLowerCase() === newUser.email.toLowerCase())) {
          ws.users.push(newUser);
          appendAudit(ws, actor, 'USER_ADDED', 'User', newUser.id, `Added team member ${newUser.name} (${newUser.role})`);
        }
        break;
      }

      default:
        return { applied: false, error: `Unknown actionType: ${mutation.actionType}`, workspace: ws };
    }

    ws.processedMutationIds.push(mutation.mutationId);
    if (ws.processedMutationIds.length > 5000) {
      ws.processedMutationIds = ws.processedMutationIds.slice(-3000);
    }
    ws.version += 1;
    ws.lastSyncedAt = now;
    return { applied: true, workspace: ws };
  } catch (err) {
    return {
      applied: false,
      error: err instanceof Error ? err.message : 'Mutation processing error',
      workspace: ws,
    };
  }
}
