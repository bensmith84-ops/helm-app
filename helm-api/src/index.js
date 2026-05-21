
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const admin = require('firebase-admin');

admin.initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID || 'helm-496923',
});

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

async function withAuthedClient(claims, fn) {
  const client = await pool.connect();
  try {
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

const app = express();
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['authorization', 'content-type', 'x-client-info'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_authorization' });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.firebase = decoded;
    req.jwtClaims = decoded;
    next();
  } catch (err) {
    console.error('verifyIdToken failed:', err?.message);
    res.status(401).json({ error: 'invalid_token' });
  }
}

function optionalAuth(req, _res, next) {
  req.jwtClaims = null;
  next();
}

const helpers = { requireAuth, optionalAuth, withAuthedClient, pool };

require('./routes/health-detailed')(app, helpers);
require('./routes/whoami')(app, helpers);
require('./routes/scoreboard-chat')(app, helpers);
require('./routes/slack-notify')(app, helpers);
require('./routes/slack-update')(app, helpers);
require('./routes/scorecard-auto-calc')(app, helpers);
require('./routes/ai-chat')(app, helpers);
require('./routes/ai-deploy')(app, helpers);
require('./routes/plm-ai')(app, helpers);
require('./routes/plm-advisor')(app, helpers);
require('./routes/doc-ai')(app, helpers);
require('./routes/fin-analyze')(app, helpers);
require('./routes/cx-tone-check')(app, helpers);
require('./routes/automation-engine')(app, helpers);
require('./routes/ar-reminders')(app, helpers);
require('./routes/ap-alerts')(app, helpers);
require('./routes/ical-proxy')(app, helpers);
require('./routes/calendar-manager')(app, helpers);
require('./routes/cx-appreciation-drafter')(app, helpers);
require('./routes/cx-ai-draft')(app, helpers);
require('./routes/cx-moderate')(app, helpers);
require('./routes/cx-kb-gap-report')(app, helpers);
require('./routes/call-ai')(app, helpers);

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled:', err);
  res.status(500).json({ error: 'internal', message: err?.message || String(err) });
});

const PORT = parseInt(process.env.PORT || '8080', 10);
app.listen(PORT, () => {
  console.log(`helm-api listening on :${PORT}`);
});
