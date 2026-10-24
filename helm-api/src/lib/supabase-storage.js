// Server-side file storage used by routes that save files (QuickBooks bill
// attachments, Gmail/inbound invoices, e-sign PDFs, CX exports).
//
// STORAGE_BACKEND=gcs (set at the cutover): files go to the private Cloud
// Storage bucket as "<bucket>/<path>", served by helm-api's /storage/v1 routes.
// Otherwise (before the cutover): Supabase Storage with the service-role key.
// Same function signatures either way, so callers don't change.

const { gcsClient } = require('./gcs');

const SUPABASE_URL = process.env.SUPABASE_STORAGE_URL || 'https://upbjdmnykheubxkuknuj.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const USE_GCS = (process.env.STORAGE_BACKEND || '').toLowerCase() === 'gcs';
const GCS_BUCKET = process.env.GCS_PRIVATE_BUCKET || 'helm-496923-files-private';
const PUBLIC_BASE = (process.env.HELM_API_PUBLIC_URL || 'https://helm-api-qp7o2dcl5a-uc.a.run.app').replace(/\/+$/, '');
const encPath = (p) => String(p).split('/').map(encodeURIComponent).join('/');

async function uploadToStorage(bucket, path, body, contentType, { gcs = gcsClient() } = {}) {
  if (USE_GCS) {
    const r = await gcs.upload(GCS_BUCKET, `${bucket}/${path}`, body, contentType);
    if (!r.ok) throw new Error(`Storage upload failed (${r.status}): ${JSON.stringify(r.data).slice(0, 200)}`);
    return { path, public_url: `${PUBLIC_BASE}/storage/v1/object/public/${bucket}/${encPath(path)}` };
  }
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body,
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`Storage upload failed (${r.status}): ${errText.slice(0, 200)}`);
  }
  return { path, public_url: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}` };
}

async function deleteFromStorage(bucket, path, { gcs = gcsClient() } = {}) {
  if (USE_GCS) {
    const r = await gcs.remove(GCS_BUCKET, `${bucket}/${path}`);
    return r.ok || r.status === 404;
  }
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}` },
  });
  return r.ok;
}

module.exports = { uploadToStorage, deleteFromStorage, SUPABASE_URL: USE_GCS ? PUBLIC_BASE : SUPABASE_URL };
