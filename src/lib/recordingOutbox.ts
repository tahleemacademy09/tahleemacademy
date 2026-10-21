/*
  recordingOutbox.ts — Tahleem Academy
  ─────────────────────────────────────────────────────────────────────
  The "hold it until it's saved" layer behind direct class recording.

  Every 4-second chunk the recorder produces is written to IndexedDB on the
  teacher's device FIRST. A background uploader then ships the chunks to R2
  in exact 5 MiB parts and deletes them only after the part is safely
  uploaded. So:

    • Network drops mid-class      → recording keeps going; chunks pile up on
                                     the device; uploading resumes by itself.
    • Teacher ends class offline   → recording is finalized LOCALLY; it
                                     uploads + completes when the connection
                                     is back (same session, or next app open).
    • App/tab killed or phone dies → chunks are still on disk; the next time
                                     the app opens on that device, the
                                     leftover is finalized and uploaded.

  Nothing is deleted from the device until the server confirms the file is
  complete. Parts and "complete" are idempotent, so retries are always safe.
*/
import { supabase } from "@/integrations/supabase/client";

export const PART_SIZE = 5 * 1024 * 1024; // R2: all parts but the last must be this exact size
const DB_NAME = "tahleem-recording-outbox";

export type Job = {
  rid: string; sessionId: string; subjectId: string; mime: string;
  createdAt: number; partsDone: number; final: boolean; duration: number | null;
};
type Chunk = { rid: string; start: number; size: number; t: number; blob: Blob };

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
// Wait `ms`, but wake immediately when the browser says we're back online.
const waitOnline = (ms: number) => new Promise<void>(res => {
  const done = () => { window.removeEventListener("online", done); clearTimeout(t); res(); };
  const t = setTimeout(done, ms);
  window.addEventListener("online", done);
});

// ── server calls ────────────────────────────────────────────────────────
export async function api(action: string, body: Record<string, any>) {
  const { data, error } = await supabase.functions.invoke("recording-upload", { body: { action, ...body } });
  let msg = data?.error;
  if (error && !msg) {
    try { const b = await (error as any).context?.json(); msg = b?.error || JSON.stringify(b); }
    catch { try { msg = await (error as any).context?.text(); } catch {} }
  }
  if (error || data?.error) {
    const e: any = new Error(msg || error?.message || `recording-upload ${action} failed`);
    if ((error as any)?.context?.status === 404) e.code = "GONE"; // server already finalized/removed it
    throw e;
  }
  return data;
}

// ── IndexedDB ───────────────────────────────────────────────────────────
let dbp: Promise<IDBDatabase> | null = null;
const db = () => dbp || (dbp = new Promise((res, rej) => {
  const r = indexedDB.open(DB_NAME, 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore("jobs", { keyPath: "rid" });
    r.result.createObjectStore("chunks", { keyPath: ["rid", "start"] });
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));
const done = (t: IDBTransaction) => new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
const rq = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const range = (rid: string) => IDBKeyRange.bound([rid, 0], [rid, Number.MAX_SAFE_INTEGER]);

export async function createJob(job: Job) {
  const t = (await db()).transaction("jobs", "readwrite"); t.objectStore("jobs").put(job); await done(t); notify();
}
export async function listJobs(): Promise<Job[]> {
  try { return await rq((await db()).transaction("jobs").objectStore("jobs").getAll()); } catch { return []; }
}
const getJob = async (rid: string): Promise<Job | undefined> => rq((await db()).transaction("jobs").objectStore("jobs").get(rid));
// read-modify-write in ONE transaction, so a late "final" flag can never be overwritten
async function updateJob(rid: string, fn: (j: Job) => void) {
  const t = (await db()).transaction("jobs", "readwrite");
  const st = t.objectStore("jobs");
  const g = st.get(rid);
  g.onsuccess = () => { if (g.result) { fn(g.result); st.put(g.result); } };
  await done(t);
}
export async function appendChunk(rid: string, start: number, blob: Blob) {
  const t = (await db()).transaction("chunks", "readwrite");
  t.objectStore("chunks").put({ rid, start, size: blob.size, t: Date.now(), blob } as Chunk);
  await done(t);
}
async function lastChunk(rid: string): Promise<Chunk | null> {
  const c = await rq((await db()).transaction("chunks").objectStore("chunks").openCursor(range(rid), "prev"));
  return c ? (c.value as Chunk) : null;
}
async function readRange(rid: string, from: number, to: number): Promise<Blob> {
  const parts: Blob[] = [];
  await new Promise<void>(async (res, rej) => {
    const req = (await db()).transaction("chunks").objectStore("chunks").openCursor(range(rid));
    req.onerror = () => rej(req.error);
    req.onsuccess = () => {
      const c = req.result; if (!c) return res();
      const k = c.value as Chunk;
      if (k.start >= to) return res();
      if (k.start + k.size > from) parts.push(k.blob.slice(Math.max(from, k.start) - k.start, Math.min(to, k.start + k.size) - k.start));
      c.continue();
    };
  });
  return new Blob(parts);
}
async function deleteBelow(rid: string, offset: number) {
  const t = (await db()).transaction("chunks", "readwrite");
  const req = t.objectStore("chunks").openCursor(range(rid));
  req.onsuccess = () => { const c = req.result; if (c && c.value.start + c.value.size <= offset) { c.delete(); c.continue(); } };
  await done(t);
}
async function deleteJob(rid: string) {
  const t = (await db()).transaction(["jobs", "chunks"], "readwrite");
  t.objectStore("jobs").delete(rid); t.objectStore("chunks").delete(range(rid));
  await done(t);
}

// ── who owns a job right now ────────────────────────────────────────────
const live = new Set<string>(); // recordings actively being captured in THIS page
export const markLive = (rid: string) => { live.add(rid); };
export const unmarkLive = (rid: string) => { live.delete(rid); };
const withLock = async <T,>(rid: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
  const locks = (navigator as any).locks;
  if (!locks?.request) return fn();
  return locks.request(`tahleem-rec-${rid}`, { ifAvailable: true }, (l: any) => (l ? fn() : fallback));
};

// ── listeners (UI badge) ────────────────────────────────────────────────
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(f => { try { f(); } catch {} });
export const pendingCount = async () => (await listJobs()).length;
export function subscribePending(cb: (n: number) => void) {
  const f = async () => cb(await pendingCount());
  listeners.add(f); f();
  return () => { listeners.delete(f); };
}
export const hasJobForSession = async (sessionId: string) => (await listJobs()).some(j => j.sessionId === sessionId);

// ── uploader ────────────────────────────────────────────────────────────
const running = new Set<string>();

async function retrying<T>(fn: () => Promise<T>, until: number): Promise<T> {
  for (let a = 0; ; a++) {
    try { return await fn(); }
    catch (e: any) {
      if (e?.code === "GONE") throw e;
      if (until && Date.now() > until) throw e;
      await waitOnline(Math.min(30_000, 1000 * 2 ** Math.min(a, 5)));
    }
  }
}

/** Upload everything that's ready. Returns "done" (file complete on server),
 *  "pending" (more to do later / waiting for data or network), or "busy". */
export async function drain(rid: string, until = 0): Promise<"done" | "pending" | "busy"> {
  if (running.has(rid)) return "busy";
  running.add(rid);
  try {
    for (;;) {
      const job = await getJob(rid);
      if (!job) return "done";
      const last = await lastChunk(rid);
      const total = Math.max(last ? last.start + last.size : 0, job.partsDone * PART_SIZE);
      const offset = job.partsDone * PART_SIZE;
      const avail = total - offset;

      if (avail >= PART_SIZE || (job.final && avail > 0)) {
        const end = offset + Math.min(avail, PART_SIZE);
        const blob = await readRange(rid, offset, end);
        const n = job.partsDone + 1;
        await retrying(async () => {
          const { url } = await api("part", { recording_id: rid, part_number: n });
          const r = await fetch(url, { method: "PUT", body: blob });
          if (!r.ok) throw new Error(`Part ${n} upload failed (${r.status})`);
        }, until);
        await updateJob(rid, j => { j.partsDone = Math.max(j.partsDone, n); });
        await deleteBelow(rid, end);
        continue;
      }
      if (job.final) {
        await retrying(() => api("complete", { recording_id: rid, duration_seconds: job.duration || undefined }), until);
        await deleteJob(rid); notify();
        return "done";
      }
      return "pending"; // live recorder hasn't produced a full part yet
    }
  } catch (e: any) {
    if (e?.code === "GONE") { await deleteJob(rid).catch(() => {}); notify(); return "done"; } // server closed it already
    return "pending";
  } finally { running.delete(rid); }
}

export async function drainUntilIdle(rid: string, until = 0) {
  for (;;) {
    const r = await drain(rid, until);
    if (r !== "busy") return r;
    await sleep(300);
  }
}

/** Mark a recording as finished capturing (all chunks are on disk). */
export async function finalizeJob(rid: string, durationSeconds: number) {
  await updateJob(rid, j => { j.final = true; j.duration = durationSeconds; });
}

/** Find unfinished recordings on this device and push them to the server.
 *  Safe to call any time, as often as you like. */
let resuming = false;
export async function resumePendingRecordings() {
  if (resuming) return; resuming = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    for (const job of await listJobs()) {
      if (live.has(job.rid)) continue; // being captured right now
      void withLock(job.rid, async () => {
        const j = await getJob(job.rid); if (!j) return;
        if (!j.final) { // device died mid-class: close the recording at its last chunk
          const last = await lastChunk(j.rid);
          await finalizeJob(j.rid, Math.max(1, Math.round(((last?.t || Date.now()) - j.createdAt) / 1000)));
        }
        await drainUntilIdle(j.rid, 0); // retries until saved, for as long as the app stays open
      }, undefined);
    }
  } finally { resuming = false; }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { resumePendingRecordings(); });
  setInterval(() => { pendingCount().then(n => { if (n) resumePendingRecordings(); }); }, 30_000);
}
