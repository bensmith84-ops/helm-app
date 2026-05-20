// helm-bq-proxy: minimal Express service exposing Helm-shaped JSON endpoints
// backed by BigQuery views. Deployed to Cloud Run.
//
// Auth (Phase 1): single shared bearer token via Authorization: Bearer <token>.
// Token lives in Secret Manager and is injected as env BQ_PROXY_TOKEN.
// Same token is set in Vercel as NEXT_PUBLIC_BQ_PROXY_TOKEN. Read-only, two
// endpoints. Phase 3 will replace with proper OIDC.

const express = require("express");
const cors = require("cors");
const { BigQuery } = require("@google-cloud/bigquery");

const app = express();
const bq = new BigQuery();
const PROJECT = process.env.GCP_PROJECT || "helm-490123";
const DATASET = process.env.BQ_DATASET || "helm_prod";
const TOKEN = process.env.BQ_PROXY_TOKEN;

if (!TOKEN) {
  console.error("FATAL: BQ_PROXY_TOKEN not set. Refusing to start.");
  process.exit(1);
}

app.use(cors({
  origin: [
    "https://helm-app-six.vercel.app",
    /^https:\/\/helm-app-six-.*\.vercel\.app$/,
  ],
  methods: ["GET", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  maxAge: 86400,
}));

app.use((req, res, next) => {
  if (req.path === "/health" || req.method === "OPTIONS") return next();
  const auth = req.header("Authorization") || "";
  if (auth !== `Bearer ${TOKEN}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", project: PROJECT, dataset: DATASET, ts: new Date().toISOString() });
});

app.get("/dp/orders", async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const limit  = Math.min(parseInt(req.query.limit  || "50000", 10), 200000);
    const offset = Math.max(parseInt(req.query.offset || "0",     10), 0);

    if (!isYmd(start_date) || !isYmd(end_date)) {
      return res.status(400).json({ error: "start_date and end_date required, format YYYY-MM-DD" });
    }

    const sql = `
      SELECT *
      FROM \`${PROJECT}.${DATASET}.dp_orders_v1\`
      WHERE order_date BETWEEN @start AND @end
      ORDER BY order_date DESC, order_timestamp DESC
      LIMIT @limit OFFSET @offset
    `;
    const [rows] = await bq.query({
      query: sql,
      params: { start: start_date, end: end_date, limit, offset },
      types:  { start: "DATE",    end: "DATE",    limit: "INT64", offset: "INT64" },
    });
    const flat = rows.map(normalizeRow);
    res.json({ rows: flat, count: flat.length });
  } catch (err) {
    console.error("dp/orders error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/dp/warehouse-sales", async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const limit  = Math.min(parseInt(req.query.limit  || "50000", 10), 200000);
    const offset = Math.max(parseInt(req.query.offset || "0",     10), 0);

    if (!isYmd(start_date) || !isYmd(end_date)) {
      return res.status(400).json({ error: "start_date and end_date required, format YYYY-MM-DD" });
    }

    const sql = `
      SELECT *
      FROM \`${PROJECT}.${DATASET}.dp_daily_sales_by_warehouse_v1\`
      WHERE sale_date BETWEEN @start AND @end
      ORDER BY sale_date DESC
      LIMIT @limit OFFSET @offset
    `;
    const [rows] = await bq.query({
      query: sql,
      params: { start: start_date, end: end_date, limit, offset },
      types:  { start: "DATE",    end: "DATE",    limit: "INT64", offset: "INT64" },
    });
    const flat = rows.map(normalizeRow);
    res.json({ rows: flat, count: flat.length });
  } catch (err) {
    console.error("dp/warehouse-sales error:", err);
    res.status(500).json({ error: err.message });
  }
});

function isYmd(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }

function normalizeRow(row) {
  const out = {};
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (v && typeof v === "object" && "value" in v && Object.keys(v).length === 1) {
      out[k] = v.value;
    } else if (typeof v === "string" && (k === "line_items" || k === "discount_codes")) {
      try { out[k] = JSON.parse(v); } catch { out[k] = v; }
    } else {
      out[k] = v;
    }
  }
  return out;
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`helm-bq-proxy listening on :${PORT} (project=${PROJECT}, dataset=${DATASET})`);
});
