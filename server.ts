import 'dotenv/config';
import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import {
  applyMutationToWorkspace,
  createEmptyWorkspace,
  generateWorkspaceCode,
  hashPassword,
  loadDatabase,
  saveDatabase,
  verifyPassword,
  type StoredUserRecord,
} from './server/store.ts';
import { analyzeCameraFrameForProduct, buildProductRecognitionProfile } from './server/aiVision.ts';
import type { UserAccount, UserRole, WorkspaceState } from './src/types/inventory.ts';

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE_NAME = 'sia_session';

interface SessionPayload {
  userId: string;
  email: string;
  workspaceId: string;
  exp: number;
}

function signToken(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): SessionPayload | null {
  try {
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      result[k] = v;
    }
  }
  return result;
}

function setSessionCookie(res: Response, token: string, req: Request) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${60 * 60 * 24 * 30}`,
    isHttps ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(res: Response, req: Request) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    isHttps ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function sanitizeUser(u: StoredUserRecord): UserAccount {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    assignedLocationIds: u.assignedLocationIds,
    isActive: u.isActive,
    createdAt: u.createdAt,
  };
}

interface AuthedRequest extends Request {
  authUser?: StoredUserRecord;
  authWorkspace?: WorkspaceState;
}

function verifyCsrfOrBearer(req: Request): boolean {
  if (req.headers.authorization?.startsWith('Bearer ')) return true;
  if (req.headers['x-requested-with'] === 'SmartInventoryAI') return true;
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (origin && host) {
    try {
      return new URL(origin).host === String(host);
    } catch {
      return false;
    }
  }
  return false;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : null;
  const cookies = parseCookies(req.headers.cookie);
  const token = bearer || cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !verifyCsrfOrBearer(req)) {
    return res.status(403).json({ error: 'Cross-origin request verification failed.' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Session expired or invalid.' });
  }

  const db = loadDatabase();
  const user = db.usersByEmail[payload.email.toLowerCase()];
  const ws = db.workspaces[payload.workspaceId];
  if (!user || !ws || !user.isActive) {
    return res.status(401).json({ error: 'Account or workspace unavailable.' });
  }
  req.authUser = user;
  req.authWorkspace = ws;
  next();
}

// Real-time SSE subscriber registry per workspace
const sseClients = new Map<string, Set<Response>>();

function broadcastWorkspaceUpdate(workspaceId: string, version: number, sourceClientId?: string) {
  const clients = sseClients.get(workspaceId);
  if (!clients || clients.size === 0) return;
  const payload = JSON.stringify({ type: 'sync-update', workspaceId, version, sourceClientId, ts: Date.now() });
  for (const clientRes of clients) {
    clientRes.write(`data: ${payload}\n\n`);
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'smart-inventory-ai', ts: new Date().toISOString() });
  });

  // Register account & create or join workspace
  app.post('/api/auth/register', (req, res) => {
    const { name, email, password, workspaceCode } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !email.includes('@') || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Valid name, email, and password (min 6 characters) are required.' });
    }

    const db = loadDatabase();
    const normEmail = email.trim().toLowerCase();
    if (db.usersByEmail[normEmail]) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }

    const now = new Date().toISOString();
    const { hash, salt } = hashPassword(password);
    let workspaceId = '';
    let finalWorkspaceCode = '';
    let assignedRole: UserRole = 'Super Administrator';

    if (typeof workspaceCode === 'string' && workspaceCode.trim()) {
      const code = workspaceCode.trim().toUpperCase();
      const targetWsId = db.workspaceCodeIndex[code];
      if (!targetWsId || !db.workspaces[targetWsId]) {
        return res.status(404).json({ error: `Workspace sync code "${code}" not found.` });
      }
      workspaceId = targetWsId;
      finalWorkspaceCode = code;
      assignedRole = 'Employee';
    } else {
      workspaceId = crypto.randomUUID();
      finalWorkspaceCode = generateWorkspaceCode();
      while (db.workspaceCodeIndex[finalWorkspaceCode]) {
        finalWorkspaceCode = generateWorkspaceCode();
      }
    }

    const newUser: StoredUserRecord = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: normEmail,
      role: assignedRole,
      assignedLocationIds: [],
      isActive: true,
      createdAt: now,
      passwordHash: hash,
      passwordSalt: salt,
      workspaceId,
    };

    if (!db.workspaces[workspaceId]) {
      db.workspaces[workspaceId] = createEmptyWorkspace(workspaceId, finalWorkspaceCode, sanitizeUser(newUser));
      db.workspaceCodeIndex[finalWorkspaceCode] = workspaceId;
    } else {
      db.workspaces[workspaceId].users.push(sanitizeUser(newUser));
      db.workspaces[workspaceId].version += 1;
      db.workspaces[workspaceId].lastSyncedAt = now;
    }

    db.usersByEmail[normEmail] = newUser;
    saveDatabase(db);

    const token = signToken({
      userId: newUser.id,
      email: newUser.email,
      workspaceId,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
    });
    setSessionCookie(res, token, req);
    broadcastWorkspaceUpdate(workspaceId, db.workspaces[workspaceId].version);

    res.status(201).json({
      token,
      user: sanitizeUser(newUser),
      workspace: db.workspaces[workspaceId],
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const db = loadDatabase();
    const user = db.usersByEmail[email.trim().toLowerCase()];
    if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'This account has been deactivated by an administrator.' });
    }
    const ws = db.workspaces[user.workspaceId];
    if (!ws) {
      return res.status(404).json({ error: 'Associated workspace not found.' });
    }
    // Sync user's latest role from workspace
    const wsUser = ws.users.find((u) => u.id === user.id);
    if (wsUser) user.role = wsUser.role;

    const token = signToken({
      userId: user.id,
      email: user.email,
      workspaceId: user.workspaceId,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
    });
    setSessionCookie(res, token, req);

    res.json({
      token,
      user: sanitizeUser(user),
      workspace: ws,
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(res, req);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const ws = req.authWorkspace!;
    const wsUser = ws.users.find((u) => u.id === user.id);
    res.json({
      user: wsUser || sanitizeUser(user),
      workspace: ws,
    });
  });

  app.get('/api/sync/pull', requireAuth, (req: AuthedRequest, res) => {
    const ws = req.authWorkspace!;
    res.json({ workspace: ws });
  });

  app.post('/api/sync/push', requireAuth, (req: AuthedRequest, res) => {
    const { mutations, sourceClientId } = req.body || {};
    if (!Array.isArray(mutations)) {
      return res.status(400).json({ error: 'mutations array is required.' });
    }

    const db = loadDatabase();
    const user = req.authUser!;
    const ws = db.workspaces[user.workspaceId];
    if (!ws) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }
    const wsUser = ws.users.find((u) => u.id === user.id);
    const actor = {
      id: user.id,
      name: wsUser?.name || user.name,
      role: wsUser?.role || user.role,
    };

    // Role enforcement for administrative mutations
    const adminOrManagerActions = ['APPROVE_DAMAGE_REPORT', 'APPROVE_OUTGOING_STOCK', 'CONFIRM_INCOMING_STOCK'];
    const superAdminActions = ['UPDATE_USER_ROLE', 'CREATE_INVITED_USER'];

    const sorted = [...mutations].sort((a, b) => Number(a.clientTimestamp || 0) - Number(b.clientTimestamp || 0));
    const results: { mutationId: string; applied: boolean; error?: string }[] = [];

    for (const mut of sorted) {
      if (!mut || typeof mut.mutationId !== 'string' || typeof mut.actionType !== 'string') {
        continue;
      }
      if (actor.role === 'Auditor') {
        results.push({ mutationId: mut.mutationId, applied: false, error: 'Auditor role is read-only.' });
        continue;
      }
      if (superAdminActions.includes(mut.actionType) && actor.role !== 'Super Administrator') {
        results.push({ mutationId: mut.mutationId, applied: false, error: 'Super Administrator role required.' });
        continue;
      }
      if (adminOrManagerActions.includes(mut.actionType) && !['Super Administrator', 'Manager'].includes(actor.role)) {
        results.push({ mutationId: mut.mutationId, applied: false, error: 'Manager or Super Administrator approval required.' });
        continue;
      }

      const outcome = applyMutationToWorkspace(ws, mut, actor);
      results.push({ mutationId: mut.mutationId, applied: outcome.applied, error: outcome.error });
    }

    saveDatabase(db);
    broadcastWorkspaceUpdate(ws.workspaceId, ws.version, typeof sourceClientId === 'string' ? sourceClientId : undefined);

    res.json({
      workspace: ws,
      results,
    });
  });

  app.get('/api/sync/stream', requireAuth, (req: AuthedRequest, res) => {
    const wsId = req.authWorkspace!.workspaceId;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    if (!sseClients.has(wsId)) {
      sseClients.set(wsId, new Set());
    }
    sseClients.get(wsId)!.add(res);
    res.write(`data: ${JSON.stringify({ type: 'connected', workspaceId: wsId, version: req.authWorkspace!.version })}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.get(wsId)?.delete(res);
    });
  });

  // Server-side Gemini Vision AI endpoints
  app.post('/api/ai/count-product', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const { imageDataUrl, productId, bottleCapRule } = req.body || {};
      if (typeof imageDataUrl !== 'string' || typeof productId !== 'string') {
        return res.status(400).json({ error: 'imageDataUrl and productId are required.' });
      }
      const product = req.authWorkspace!.products.find((p) => p.id === productId);
      if (!product) {
        return res.status(404).json({ error: 'Selected product not found in workspace.' });
      }
      const result = await analyzeCameraFrameForProduct({
        imageDataUrl,
        product,
        bottleCapRule: bottleCapRule || product.recognitionProfile?.bottleCapRule || 'capped_only',
      });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI vision analysis failed.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/build-profile', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const { productName, brand, size, images } = req.body || {};
      if (typeof productName !== 'string' || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: 'productName and at least one training image are required.' });
      }
      const profile = await buildProductRecognitionProfile({
        productName,
        brand: String(brand || ''),
        size: String(size || ''),
        images,
      });
      res.json(profile);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI training profile extraction failed.';
      res.status(500).json({ error: message });
    }
  });

  // Backup & Restore (Super Administrator)
  app.get('/api/backup/export', requireAuth, (req: AuthedRequest, res) => {
    const ws = req.authWorkspace!;
    const wsUser = ws.users.find((u) => u.id === req.authUser!.id);
    if ((wsUser?.role || req.authUser!.role) !== 'Super Administrator') {
      return res.status(403).json({ error: 'Super Administrator role required to export database backups.' });
    }
    res.json({
      exportedAt: new Date().toISOString(),
      app: 'Smart Inventory AI',
      workspace: ws,
    });
  });

  app.post('/api/backup/restore', requireAuth, (req: AuthedRequest, res) => {
    const ws = req.authWorkspace!;
    const wsUser = ws.users.find((u) => u.id === req.authUser!.id);
    if ((wsUser?.role || req.authUser!.role) !== 'Super Administrator') {
      return res.status(403).json({ error: 'Super Administrator role required to restore database backups.' });
    }
    const { workspace: incomingWs } = req.body || {};
    if (!incomingWs || !Array.isArray(incomingWs.products) || !Array.isArray(incomingWs.transactions)) {
      return res.status(400).json({ error: 'Invalid backup file format.' });
    }
    const db = loadDatabase();
    db.workspaces[ws.workspaceId] = {
      ...incomingWs,
      workspaceId: ws.workspaceId,
      workspaceCode: ws.workspaceCode,
      version: ws.version + 1,
      lastSyncedAt: new Date().toISOString(),
    };
    saveDatabase(db);
    broadcastWorkspaceUpdate(ws.workspaceId, db.workspaces[ws.workspaceId].version);
    res.json({ workspace: db.workspaces[ws.workspaceId] });
  });

  const httpServer = http.createServer(app);

  // Vite dev middleware or static dist serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: { server: httpServer },
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Inventory AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Smart Inventory AI server:', err);
  process.exit(1);
});
