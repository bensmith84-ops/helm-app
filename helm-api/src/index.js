
// helm-api: Cloud Run service hosting Helm's API endpoints (formerly Supabase edge functions).
// Architecture:
//   - Firebase Admin SDK verifies the Authorization: Bearer <firebase-id-token>
//   - pg.Pool connects to Cloud SQL Postgres (helm-db) via the Cloud SQL connector socket
//     in /cloudsql/helm-496923:us-central1:helm-db (Cloud Run native integration)
//   - Each request opens a pg client, sets request.jwt.claims at the transaction level,
//     runs the handler, then releases. RLS in Cloud SQL reads auth.uid() from that setting.

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const admin = require('firebase-admin');

// ─── Firebase Admin init ────────────────────────────────────────────────────
admin.initializeApp({
  // Cloud Run runtime SA has roles/firebase.admin — credentials inferred from env
  projectId: process.env.FIREBASE_PROJECT_ID || 'helm-496923',
});

// ─── Postgres pool ──────────────────────────────────────────────────────────
const pool = new Pool({
  host: process.env.PGHOST || '/cloudsql/helm-496923:us-central1:helm-db',
  user: process.env.PGUSER || 'helmuser',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'helm',
  port: parseInt(process.env.PGPORT || '5432', 10),
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('Postgres pool error:', err);
});

// Helper: run a function with a checked-out client that has JWT claims set as session var
async function withAuthedClient(claims, fn) {
  const client = await pool.connect();
  try {
    // SET LOCAL only inside a tx; use SET (session) and reset after
    await client.query('BEGIN');
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      claims ? JSON.stringify(claims) : '',
    ]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

// ─── Express app ────────────────────────────────────────────────────────────
const app = express();
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['authorization', 'content-type', 'x-client-info'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Health check (no auth)
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Firebase JWT verification middleware
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_authorization' });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.firebase = decoded;       // raw firebase claims
    req.jwtClaims = decoded;       // what we'll put into request.jwt.claims for RLS
    next();
  } catch (err) {
    console.error('verifyIdToken failed:', err?.message);
    res.status(401).json({ error: 'invalid_token' });
  }
}

// Optional-auth — webhooks and cron-fired endpoints use this and validate their own auth
function optionalAuth(req, _res, next) {
  req.jwtClaims = null;
  next();
}

// ─── Route registration ─────────────────────────────────────────────────────
// Each ported edge function lives in src/routes/<slug>.js and exports a function
// that takes the Express app and a helpers object: { requireAuth, optionalAuth, withAuthedClient, pool }.
const helpers = { requireAuth, optionalAuth, withAuthedClient, pool };

require('./routes/scoreboard-chat')(app, helpers);
require('./routes/slack-notify')(app, helpers);
require('./routes/ai-chat')(app, helpers);
require('./routes/ai-deploy')(app, helpers);
require('./routes/plm-ai')(app, helpers);
require('./routes/whoami')(app, helpers);

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled:', err);
  res.status(500).json({ error: 'internal', message: err?.message || String(err) });
});

const PORT = parseInt(process.env.PORT || '8080', 10);
app.listen(PORT, () => {
  console.log(`helm-api listening on :${PORT}`);
});
