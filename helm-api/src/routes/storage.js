// Supabase Storage-compatible API on Google Cloud Storage, so supabase-js's
// storage client works unchanged when its base URL points at helm-api.
//
// Supabase bucket "b" + path "p" is stored as object "b/p" in one private GCS
// bucket (GCS_PRIVATE_BUCKET). Files in Supabase's public buckets stay
// reachable at their public URL because helm-api serves them; nothing in GCS
// is world-readable. (Set GCS_PUBLIC_BUCKET to a world-readable bucket to
// redirect public reads there instead.)
//
//   POST|PUT /storage/v1/object/:bucket/<path>          upload (raw or multipart)
//   GET      /storage/v1/object/public/:bucket/<path>   302 to the public object
//   POST     /storage/v1/object/sign/:bucket/<path>     create a signed link
//   GET      /storage/v1/object/sign/:bucket/<path>?token=...  serve it
//   GET      /storage/v1/object/authenticated/:bucket/<path>   signed-in download
//   DELETE   /storage/v1/object/:bucket  {prefixes:[...]}      remove
//   POST     /storage/v1/object/copy {bucketId, sourceKey, destinationKey}

const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { gcsClient } = require('../lib/gcs');

const list = (v, d) => new Set((v || d).split(',').map((s) => s.trim()).filter(Boolean));
const PUBLIC_BUCKETS = list(process.env.STORAGE_PUBLIC_BUCKETS, 'avatars,org-logos,rfp-assets,attachments,bill-attachments,asana-attachments,esign-documents');
const KNOWN_BUCKETS = list(process.env.STORAGE_BUCKETS, 'avatars,org-logos,rfp-assets,attachments,bill-attachments,asana-attachments,rfp-submissions,esign-documents');
const EXTERNAL_BUCKETS = list(process.env.STORAGE_EXTERNAL_BUCKETS, 'rfp-submissions,esign-documents,avatars');
const GCS_PUBLIC = process.env.GCS_PUBLIC_BUCKET || '';
const GCS_PRIVATE = process.env.GCS_PRIVATE_BUCKET || 'helm-496923-files-private';
const MAX_BYTES = 50 * 1024 * 1024;

function signingKey() {
  const base = process.env.STORAGE_SIGNING_SECRET || process.env.PGPASSWORD || '';
  if (!base) throw new Error('no signing secret');
  return crypto.createHash('sha256').update('helm-storage-sign:' + base).digest();
}
function signToken(bucket, path, expSec) {
  const mac = crypto.createHmac('sha256', signingKey()).update(`${bucket}/${path}:${expSec}`).digest('base64url');
  return `${expSec}.${mac}`;
}
function verifyToken(bucket, path, token, nowSec = Math.floor(Date.now() / 1000)) {
  const [exp, mac] = String(token || '').split('.');
  if (!exp || !mac || Number(exp) < nowSec) return false;
  const want = crypto.createHmac('sha256', signingKey()).update(`${bucket}/${path}:${exp}`).digest();
  const got = Buffer.from(mac, 'base64url');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const target = (bucket) => (GCS_PUBLIC && PUBLIC_BUCKETS.has(bucket) ? GCS_PUBLIC : GCS_PRIVATE);
const cleanPath = (p) => String(p || '').replace(/^\/+/, '');
const bad = (res, code, message) => res.status(code).json({ statusCode: String(code), error: code === 404 ? 'not_found' : code === 409 ? 'Duplicate' : 'Error', message });

function mount(app, { gcs = gcsClient() } = {}) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } }).any();
  const raw = express.raw({ type: () => true, limit: MAX_BYTES });

  // Who may touch which bucket: signed-in members anywhere; external
  // collaborators only in EXTERNAL_BUCKETS; anonymous callers never write.
  const canWrite = (req, bucket) => {
    if (req.anon) return false;
    if (!KNOWN_BUCKETS.has(bucket)) return false;
    if (req.helmMember?.is_external) return EXTERNAL_BUCKETS.has(bucket);
    return true;
  };

  const doUpload = async (req, res) => {
    const bucket = req.params.bucket; const path = cleanPath(req.params[0]);
    if (!path) return bad(res, 400, 'missing object path');
    if (!canWrite(req, bucket)) return bad(res, req.anon ? 401 : 403, 'not allowed to write to this bucket');
    let body = req.body; let contentType = req.headers['content-type'];
    if (req.files && req.files.length) { body = req.files[0].buffer; contentType = req.files[0].mimetype; }
    // The app-wide express.json() may already have parsed a JSON file upload.
    if (!Buffer.isBuffer(body) && body && typeof body === 'object' && /json/i.test(contentType || '')) body = Buffer.from(JSON.stringify(body));
    if (!Buffer.isBuffer(body) || !body.length) return bad(res, 400, 'empty body');
    const upsert = req.method === 'PUT' || String(req.headers['x-upsert'] || '') === 'true';
    const r = await gcs.upload(target(bucket), `${bucket}/${path}`, body, contentType, { ifNotExists: !upsert });
    if (r.status === 412) return bad(res, 409, 'The resource already exists');
    if (!r.ok) { console.error('[storage] upload', r.status, JSON.stringify(r.data).slice(0, 200)); return bad(res, 502, 'upload failed'); }
    return res.json({ Key: `${bucket}/${path}`, Id: r.data?.id || `${bucket}/${path}` });
  };
  const isMultipart = (req) => /multipart\/form-data/i.test(req.headers['content-type'] || '');
  const bodyParser = (req, res, next) => (isMultipart(req) ? upload : raw)(req, res, next);

  const stream = async (res, bucket, path, { publicCache = false } = {}) => {
    const r = await gcs.download(target(bucket), `${bucket}/${path}`);
    if (r.status === 404) return bad(res, 404, 'Object not found');
    if (!r.ok) return bad(res, 502, 'download failed');
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
    const len = r.headers.get('content-length'); if (len) res.setHeader('Content-Length', len);
    res.setHeader('Cache-Control', publicCache ? 'public, max-age=3600' : 'private, max-age=300');
    return res.end(Buffer.from(await r.arrayBuffer()));
  };

  app.get('/storage/v1/object/public/:bucket/*', async (req, res) => {
    const bucket = req.params.bucket; const path = cleanPath(req.params[0]);
    if (!PUBLIC_BUCKETS.has(bucket)) return bad(res, 400, 'Bucket is not public');
    if (GCS_PUBLIC) return res.redirect(302, gcs.publicUrl(GCS_PUBLIC, `${bucket}/${path}`));
    return stream(res, bucket, path, { publicCache: true });
  });

  app.post('/storage/v1/object/sign/:bucket/*', express.json(), (req, res) => {
    const bucket = req.params.bucket; const path = cleanPath(req.params[0]);
    if (req.anon) return bad(res, 401, 'sign-in required');
    if (!KNOWN_BUCKETS.has(bucket) || (req.helmMember?.is_external && !EXTERNAL_BUCKETS.has(bucket))) return bad(res, 403, 'not allowed');
    const expiresIn = Math.min(Math.max(parseInt(req.body?.expiresIn, 10) || 60, 1), 60 * 60 * 24 * 365);
    const exp = Math.floor(Date.now() / 1000) + expiresIn;
    const url = `/object/sign/${bucket}/${path}?token=${signToken(bucket, path, exp)}`;
    return res.json({ signedURL: url, signedUrl: url });
  });

  app.get('/storage/v1/object/sign/:bucket/*', async (req, res) => {
    const bucket = req.params.bucket; const path = cleanPath(req.params[0]);
    if (!verifyToken(bucket, path, req.query.token)) return bad(res, 400, 'invalid or expired signature');
    return stream(res, bucket, path);
  });

  app.get('/storage/v1/object/authenticated/:bucket/*', async (req, res) => {
    const bucket = req.params.bucket; const path = cleanPath(req.params[0]);
    if (req.anon) return bad(res, 401, 'sign-in required');
    if (!KNOWN_BUCKETS.has(bucket) || (req.helmMember?.is_external && !EXTERNAL_BUCKETS.has(bucket))) return bad(res, 403, 'not allowed');
    return stream(res, bucket, path);
  });

  app.post('/storage/v1/object/copy', express.json(), async (req, res) => {
    const { bucketId, sourceKey, destinationKey } = req.body || {};
    if (!bucketId || !sourceKey || !destinationKey) return bad(res, 400, 'bucketId, sourceKey and destinationKey are required');
    if (!canWrite(req, bucketId)) return bad(res, req.anon ? 401 : 403, 'not allowed');
    const b = target(bucketId);
    const r = await gcs.copy(b, `${bucketId}/${cleanPath(sourceKey)}`, b, `${bucketId}/${cleanPath(destinationKey)}`);
    if (!r.ok) return bad(res, r.status === 404 ? 404 : 502, 'copy failed');
    return res.json({ Key: `${bucketId}/${cleanPath(destinationKey)}` });
  });

  app.delete('/storage/v1/object/:bucket', express.json(), async (req, res) => {
    const bucket = req.params.bucket;
    if (!canWrite(req, bucket)) return bad(res, req.anon ? 401 : 403, 'not allowed');
    const prefixes = Array.isArray(req.body?.prefixes) ? req.body.prefixes : [];
    const out = [];
    for (const p of prefixes.slice(0, 1000)) {
      const name = cleanPath(p);
      const r = await gcs.remove(target(bucket), `${bucket}/${name}`);
      if (r.ok || r.status === 404) out.push({ name, bucket_id: bucket });
    }
    return res.json(out);
  });

  app.post('/storage/v1/object/:bucket/*', bodyParser, doUpload);
  app.put('/storage/v1/object/:bucket/*', bodyParser, doUpload);
}

module.exports = Object.assign((app) => mount(app), { mount, _internal: { signToken, verifyToken, target, PUBLIC_BUCKETS, GCS_PRIVATE } });
