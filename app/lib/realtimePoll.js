// Stand-in for supabase.channel(...).on("postgres_changes", ...) on Google
// Cloud, where there is no realtime socket: polls for new rows instead.
// Supports what Helm uses: INSERT events with an optional "col=eq.value" filter.
"use client";

const INTERVAL_MS = 5000;

export function installRealtimePoll(client) {
  const channels = new Set();

  client.channel = (name) => {
    const handlers = [];
    let timers = [];
    const ch = {
      name,
      on(type, opts, cb) { if (type === "postgres_changes") handlers.push({ opts: opts || {}, cb }); return ch; },
      subscribe(statusCb) {
        for (const h of handlers) {
          const ev = (h.opts.event || "*").toUpperCase();
          if (ev !== "INSERT" && ev !== "*") continue;
          let since = null; const seen = new Set(); let stopped = false;
          const base = () => {
            let q = client.from(h.opts.table).select("*");
            const m = /^([a-zA-Z0-9_]+)=eq\.(.*)$/.exec(h.opts.filter || "");
            if (m) q = q.eq(m[1], m[2]);
            return q;
          };
          const prime = async () => {
            const { data } = await base().order("created_at", { ascending: false }).limit(1);
            since = data?.[0]?.created_at || new Date().toISOString();
          };
          const tick = async () => {
            if (stopped || (typeof document !== "undefined" && document.hidden)) return;
            if (!since) { await prime(); return; }
            const { data } = await base().gt("created_at", since).order("created_at", { ascending: true }).limit(100);
            for (const row of data || []) {
              if (seen.has(row.id)) continue; seen.add(row.id);
              since = row.created_at > since ? row.created_at : since;
              try { h.cb({ eventType: "INSERT", schema: "public", table: h.opts.table, new: row, old: {} }); } catch (e) { console.error(e); }
            }
          };
          prime().catch(() => {});
          const t = setInterval(() => tick().catch(() => {}), INTERVAL_MS);
          timers.push(() => { stopped = true; clearInterval(t); });
        }
        channels.add(ch);
        if (statusCb) setTimeout(() => statusCb("SUBSCRIBED"), 0);
        return ch;
      },
      unsubscribe() { timers.forEach((s) => s()); timers = []; channels.delete(ch); return Promise.resolve("ok"); },
    };
    return ch;
  };
  client.removeChannel = (ch) => (ch && ch.unsubscribe ? ch.unsubscribe() : Promise.resolve("ok"));
  client.removeAllChannels = () => Promise.all([...channels].map((c) => c.unsubscribe()));
  client.getChannels = () => [...channels];
}
