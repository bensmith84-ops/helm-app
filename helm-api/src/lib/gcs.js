// Minimal Google Cloud Storage client using the Cloud Run service account
// (metadata-server token, no key files).

const SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write';
let cached = { token: null, exp: 0 };

async function gcsToken({ fetchImpl = fetch, now = Date.now } = {}) {
  if (cached.token && cached.exp - 60_000 > now()) return cached.token;
  const r = await fetchImpl(
    `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=${encodeURIComponent(SCOPE)}`,
    { headers: { 'Metadata-Flavor': 'Google' } },
  );
  if (!r.ok) throw new Error(`metadata token ${r.status}`);
  const d = await r.json();
  cached = { token: d.access_token, exp: now() + (d.expires_in || 300) * 1000 };
  return cached.token;
}

const API = 'https://storage.googleapis.com';
const enc = (name) => encodeURIComponent(name);

function gcsClient({ fetchImpl = fetch, tokenFn = gcsToken } = {}) {
  const call = async (method, url, { body, headers = {}, raw = false } = {}) => {
    const token = await tokenFn({ fetchImpl });
    const r = await fetchImpl(url, { method, body, headers: { Authorization: `Bearer ${token}`, ...headers } });
    if (raw) return r;
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: r.status, ok: r.ok, data };
  };
  return {
    upload: (bucket, name, body, contentType, { ifNotExists = false } = {}) =>
      call('POST', `${API}/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${enc(name)}${ifNotExists ? '&ifGenerationMatch=0' : ''}`,
        { body, headers: { 'Content-Type': contentType || 'application/octet-stream' } }),
    download: (bucket, name) => call('GET', `${API}/storage/v1/b/${bucket}/o/${enc(name)}?alt=media`, { raw: true }),
    remove: (bucket, name) => call('DELETE', `${API}/storage/v1/b/${bucket}/o/${enc(name)}`),
    copy: (srcBucket, src, dstBucket, dst) =>
      call('POST', `${API}/storage/v1/b/${srcBucket}/o/${enc(src)}/rewriteTo/b/${dstBucket}/o/${enc(dst)}`, { body: '{}', headers: { 'Content-Type': 'application/json' } }),
    publicUrl: (bucket, name) => `${API}/${bucket}/${name.split('/').map(encodeURIComponent).join('/')}`,
  };
}

module.exports = { gcsClient, gcsToken };
