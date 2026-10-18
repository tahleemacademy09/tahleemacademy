const SUPABASE_URL = "https://qasmwzwaorncalximemy.supabase.co";
const RING_WINDOW_MIN = 2;
const GM_LAUNCH_WINDOW_MIN = 10;

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
  return rows.some((ev) => {
    const k = kickoffMs(ev);
    return k !== null && k <= now + 5 * 60_000 && k >= now - (GM_LAUNCH_WINDOW_MIN * 60_000 + 25 * 3600_000);
  });
}

async function gate(env, name, hasWork, now) {
  let run = true;
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
