// Cron "gate": runs every minute on Cloudflare (free) and only calls the Supabase
// edge functions when there is real work. Replaces the two every-minute pg_cron jobs.
const SUPABASE_URL = "https://zqniborlnbpkjdmyssnl.supabase.co";

const RING_WINDOW_MIN = 2;        // same window ring-live-class uses
const GM_LAUNCH_WINDOW_MIN = 10;  // same window gm-auto-launch uses

async function rest(env, path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!r.ok) throw new Error(`rest ${r.status}`);
  return r.json();
}

async function callFunction(env, name) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: "{}",
  });
  console.log(`[gate] called ${name} -> ${r.status}`);
}

// ---- ring-live-class: any session scheduled within +-2 min, not ended/cancelled
async function ringHasWork(env, now) {
  const start = new Date(now - RING_WINDOW_MIN * 60_000).toISOString();
  const end = new Date(now + RING_WINDOW_MIN * 60_000).toISOString();
  const rows = await rest(
    env,
    `live_sessions?select=id&scheduled_at=gte.${encodeURIComponent(start)}` +
      `&scheduled_at=lte.${encodeURIComponent(end)}` +
      `&status=not.in.(ended,cancelled)&limit=1`
  );
  return rows.length > 0;
}

// ---- gm-auto-launch: same kickoff calculation as the function (UTC), slightly wider
function kickoffMs(ev) {
  if (!ev.competition_date) {
    if (!ev.start_time) return null;
    const d = new Date(ev.start_time);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  let timeOfDay = "00:00:00";
  if (ev.start_time) {
    const t = new Date(ev.start_time);
    if (!isNaN(t.getTime())) timeOfDay = t.toISOString().slice(11, 19);
  }
  const d = new Date(`${ev.competition_date}T${timeOfDay}`);
  return isNaN(d.getTime()) ? null : d.getTime();
}

async function gmHasWork(env, now) {
  const rows = await rest(
    env,
    `general_musabaqah_events?select=id,start_time,competition_date` +
      `&status=in.(registration_open,registration_closed)&auto_launched_at=is.null`
  );
  // Superset of the function's own filter: the function does the exact check.
  return rows.some((ev) => {
    const k = kickoffMs(ev);
    return k !== null && k <= now + 5 * 60_000 && k >= now - (GM_LAUNCH_WINDOW_MIN * 60_000 + 25 * 3600_000);
  });
}

async function gate(env, name, hasWork, now) {
  let run = true; // fail-open: if the check itself fails, still call the function
  try {
    run = await hasWork(env, now);
  } catch (e) {
    console.warn(`[gate] ${name} check failed, calling anyway:`, e.message);
  }
  if (run) await callFunction(env, name);
}

export default {
  async scheduled(_event, env, ctx) {
    const now = Date.now();
    ctx.waitUntil(
      Promise.all([
        gate(env, "ring-live-class", ringHasWork, now),
        gate(env, "gm-auto-launch", gmHasWork, now),
      ])
    );
  },
  async fetch() {
    return new Response("cron-gate ok");
  },
};
