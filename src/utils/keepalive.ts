// src/utils/keepalive.ts
// ─────────────────────────────────────────────────────────────────────────────
// Render's free tier spins down after 15 minutes of inactivity.
// A sleeping server means webhooks from Nomba will 404 or timeout.
// This module pings our own /health endpoint every 10 minutes to stay awake.
//
// Only runs in production (pointless locally).
// ─────────────────────────────────────────────────────────────────────────────

export function startKeepalive() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[keepalive] Skipped — only runs in production");
    return;
  }

  const selfUrl = process.env.APP_URL;
  if (!selfUrl) {
    console.warn("[keepalive] APP_URL not set — keepalive disabled");
    return;
  }

  const INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes

  const ping = async () => {
    try {
      const res = await fetch(`${selfUrl}/health`);
      if (res.ok) {
        console.log(`[keepalive] Pinged ${selfUrl}/health — server awake`);
      } else {
        console.warn(`[keepalive] Ping returned ${res.status}`);
      }
    } catch (err) {
      console.error("[keepalive] Ping failed:", err);
    }
  };

  // First ping immediately on startup
  ping();

  // Then every 10 minutes
  setInterval(ping, INTERVAL_MS);

  console.log(`[keepalive] Started — pinging every ${INTERVAL_MS / 60000} mins`);
}
