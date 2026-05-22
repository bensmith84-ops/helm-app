
// Thin wrapper around Supabase Storage REST API.
// Keeps file storage on Supabase post-migration; helm-api uses the service role key.
// Re-evaluate if file storage volume grows.

const SUPABASE_URL = process.env.SUPABASE_STORAGE_URL || 'https://upbjdmnykheubxkuknuj.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function uploadToStorage(bucket, path, body, contentType) {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body,
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`Storage upload failed (${r.status}): ${errText.slice(0, 200)}`);
  }
  return {
    path,
    public_url: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`,
  };
}

async function deleteFromStorage(bucket, path) {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}` },
  });
  return r.ok;
}

module.exports = { uploadToStorage, deleteFromStorage, SUPABASE_URL };
