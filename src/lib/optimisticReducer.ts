import type {
  BranchLocation,
  BusinessProfile,
  CustomBusinessCategory,
  DamageReport,
  ExpiredDisposalRecord,
  IncomingStockRecord,
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
} from '../types/inventory';

function cloneWs(ws: WorkspaceState): WorkspaceState {
  return JSON.parse(JSON.stringify(ws)) as WorkspaceState;
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

export function applyOptimisticMutation(
  currentWs: WorkspaceState,
  mutation: { mutationId: string; actionType: string; payload: Record<string, unknown>; clientTimestamp: number },
  actor: { id: string; name: string; role: UserRole }
): { workspace: WorkspaceState; error?: string } {
  const ws = cloneWs(currentWs);
  if (ws.processedMutationIds.includes(mutation.mutationId)) {
    return { workspace: ws };
  }

  const now = new Date().toISOString();
  const p = mutation.payload as Record<string, any>;

  switch (mutation.actionType) {
    case 'SAVE_BUSINESS_PROFILE': {
      ws.business = { ...(p.business as BusinessProfile), updatedAt: now };
      if (Array.isArray(p.locations) && ws.locations.length === 0) {
        ws.locations.push(...(p.locations as BranchLocation[]));
      }
      if (Array.isArray(p.unitConversions) && ws.unitConversions.length === 0) {
        ws.unitConversions.push(...(p.unitConversions as UnitConversionRule[]));
      }
      break;
    }
    case 'ADD_CUSTOM_CATEGORY': {
      const cat = p.category as CustomBusinessCategory;
      const idx = ws.customCategories.findIndex((c) => c.id === cat.id);
      if (idx >= 0) ws.customCategories[idx] = cat;
      else ws.customCategories.push(cat);
      break;
    }
    case 'SAVE_LOCATION': {
      const loc = p.location as BranchLocation;
      const idx = ws.locations.findIndex((l) => l.id === loc.id);
      if (idx >= 0) ws.locations[idx] = loc;
      else ws.locations.push(loc);
      break;
    }
    case 'SAVE_UNIT_CONVERSION': {
      const rule = p.rule as UnitConversionRule;
      const idx = ws.unitConversions.findIndex((r) => r.id === rule.id);
      if (idx >= 0) ws.unitConversions[idx] = rule;
      else ws.unitConversions.push(rule);
      break;
    }
    case 'SAVE_SUPPLIER': {
      const supplier = p.supplier as Supplier;
      const idx = ws.suppliers.findIndex((s) => s.id === supplier.id);
      if (idx >= 0) ws.suppliers[idx] = supplier;
      else ws.suppliers.push(supplier);
      break;
    }
    case 'SAVE_PRODUCT': {
      const product = p.product as Product;
      const initialQty = Number(p.initialQuantity || 0);
      const idx = ws.products.findIndex((item) => item.id === product.id);
      if (idx >= 0) {
        ws.products[idx] = { ...product, updatedAt: now };
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
            reason: 'Initial opening stock',
            performedBy: actor.name,
            createdAt: now,
            clientTimestamp: mutation.clientTimestamp,
          });
        }
      }
      break;
    }
    case 'UPDATE_RECOGNITION_PROFILE': {
      const prod = ws.products.find((item) => item.id === String(p.productId));
      if (prod) {
        prod.recognitionProfile = p.recognitionProfile;
        prod.updatedAt = now;
      }
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
          reason: `Incoming from ${record.sourceName}`,
          performedBy: record.receivedBy,
          approvedBy: record.verifiedBy || actor.name,
          createdAt: now,
          clientTimestamp: mutation.clientTimestamp,
        });
      }
      break;
    }
    case 'CONFIRM_INCOMING_STOCK': {
      const record = ws.incomingRecords.find((r) => r.id === String(p.recordId));
      if (record && record.status !== 'confirmed') {
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
          createdAt: now,
          clientTimestamp: mutation.clientTimestamp,
        });
      }
      break;
    }
    case 'RECORD_OUTGOING_STOCK': {
      const record = p.record as OutgoingStockRecord;
      const bal = getOrCreateBalance(ws, record.productId, record.locationId);
      const allowNeg = Boolean(ws.business?.preferences?.allowNegativeStock) && Boolean(p.adminOverride);
      if (record.status === 'approved' && !allowNeg && bal.quantity < record.convertedQuantity) {
        return { workspace: currentWs, error: `Insufficient stock (${bal.quantity} available).` };
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
          approvedBy: actor.name,
          createdAt: now,
          clientTimestamp: mutation.clientTimestamp,
        });
      }
      break;
    }
    case 'APPROVE_OUTGOING_STOCK': {
      const record = ws.outgoingRecords.find((r) => r.id === String(p.recordId));
      if (record && record.status === 'pending') {
        const bal = getOrCreateBalance(ws, record.productId, record.locationId);
        if (!ws.business?.preferences?.allowNegativeStock && bal.quantity < record.convertedQuantity) {
          return { workspace: currentWs, error: `Insufficient stock (${bal.quantity} available).` };
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
      }
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
          approvedBy: actor.name,
          createdAt: now,
          clientTimestamp: mutation.clientTimestamp,
        });
      }
      break;
    }
    case 'APPROVE_DAMAGE_REPORT': {
      const report = ws.damageReports.find((r) => r.id === String(p.reportId));
      const decision = p.decision as 'approved' | 'rejected';
      if (report && report.status === 'pending' && !report.deductedTransactionId) {
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
        }
      }
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
          reason: `Expired batch disposal (${rec.batchNumber})`,
          performedBy: rec.reportedBy,
          approvedBy: actor.name,
          createdAt: now,
          clientTimestamp: mutation.clientTimestamp,
        });
      }
      break;
    }
    case 'CREATE_TRANSFER': {
      const tr = p.transfer as StockTransferRecord;
      const fromBal = getOrCreateBalance(ws, tr.productId, tr.fromLocationId);
      if (fromBal.quantity < tr.quantity) {
        return { workspace: currentWs, error: `Insufficient stock in source location (${fromBal.quantity} available).` };
      }
      ws.transfers.unshift(tr);
      if (tr.status === 'dispatched' || tr.status === 'received') {
        const prev = fromBal.quantity;
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
      }
      if (tr.status === 'received') {
        const toBal = getOrCreateBalance(ws, tr.productId, tr.toLocationId);
        const prev = toBal.quantity;
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
          previousBalance: prev,
          newBalance: toBal.quantity,
          unitCost: prod?.purchasePrice || 0,
          totalValue: tr.quantity * (prod?.purchasePrice || 0),
          referenceNumber: tr.referenceNumber,
          reason: 'Transfer received',
          performedBy: actor.name,
          createdAt: now,
          clientTimestamp: mutation.clientTimestamp,
        });
      }
      break;
    }
    case 'ADVANCE_TRANSFER': {
      const tr = ws.transfers.find((t) => t.id === String(p.transferId));
      const nextStatus = p.nextStatus as 'dispatched' | 'received' | 'cancelled';
      if (tr) {
        const prod = ws.products.find((pr) => pr.id === tr.productId);
        if (nextStatus === 'dispatched' && tr.status === 'requested') {
          const fromBal = getOrCreateBalance(ws, tr.productId, tr.fromLocationId);
          if (fromBal.quantity < tr.quantity) {
            return { workspace: currentWs, error: `Insufficient stock (${fromBal.quantity} available).` };
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
            reason: 'Transfer received',
            performedBy: actor.name,
            createdAt: now,
            clientTimestamp: mutation.clientTimestamp,
          });
        } else if (nextStatus === 'cancelled' && tr.status === 'requested') {
          tr.status = 'cancelled';
        }
      }
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
              reason: `Stock-taking reconciliation (${item.method})`,
              performedBy: item.countedBy,
              approvedBy: session.finalizedBy || actor.name,
              createdAt: now,
              clientTimestamp: mutation.clientTimestamp,
            });
          }
        }
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
      const u = ws.users.find((usr) => usr.id === String(p.userId));
      if (u) {
        u.role = p.role as UserRole;
        if (typeof p.isActive === 'boolean') u.isActive = p.isActive;
      }
      break;
    }
    case 'CREATE_INVITED_USER': {
      const newUser = p.user as UserAccount;
      if (!ws.users.some((u) => u.email.toLowerCase() === newUser.email.toLowerCase())) {
        ws.users.push(newUser);
      }
      break;
    }
    default:
      break;
  }

  ws.processedMutationIds.push(mutation.mutationId);
  ws.version += 1;
  ws.lastSyncedAt = now;
  return { workspace: ws };
}
