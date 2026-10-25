// Minimal fetch-compatible POST for long-running self-calls. Node's built-in
// fetch (undici) gives up waiting for response headers after 300s, which cut
// off every cron job that takes longer than 5 minutes (e.g. qbo-auto-sync)
// with "fetch failed". node:http has no such limit; the caller's AbortSignal
// still bounds the wait.
const http = require('http');
const https = require('https');

function longFetch(url, { method = 'POST', headers = {}, body, signal } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          headers: { get: (h) => res.headers[String(h).toLowerCase()] ?? null },
          text: async () => buf.toString('utf8'),
          json: async () => JSON.parse(buf.toString('utf8')),
        });
      });
      res.on('error', reject);
    });
    req.setTimeout(0);
    req.on('error', (e) => reject(signal?.aborted ? Object.assign(new Error('aborted'), { name: 'AbortError' }) : e));
    if (signal) {
      if (signal.aborted) { req.destroy(); return reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }
      signal.addEventListener('abort', () => req.destroy(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    }
    if (body !== undefined) req.write(body);
    req.end();
  });
}

module.exports = { longFetch };
