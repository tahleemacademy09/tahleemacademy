// src/lib/modelTestStore.ts
// Keeps the admin Model Test alive across page refreshes: the audio (as a Blob), the reference, the model
// choices and every finished result are stored in IndexedDB (browser storage — nothing is uploaded).
// Also: trimToMinutes() cuts a recording to its first N minutes so test runs are much faster.
import { decodeBlobTo16k } from "@/lib/tarteelOnDevice";
import { pcm16kToWav } from "@/lib/toWav16k";

const DB = "hifdh-model-test-v1";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const db = await open();
    return await new Promise<T | null>((resolve) => {
      const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      r.onsuccess = () => resolve((r.result as T) ?? null);
      r.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch { /* private mode / quota → the test simply isn't remembered */ }
}

async function kvDel(key: string): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* noop */ }
}

export interface SavedMeta {
  audioName: string; pageInput: string; refText: string;
  use: Record<string, boolean>; runs: Record<string, any>;
  limitMin: number;
  /** true while a run was in progress when the page was last saved → resume it after a refresh */
  pending: boolean;
  savedAt: number;
}

export const saveTestAudio = (blob: Blob | null) => (blob ? kvSet("audio", blob) : kvDel("audio"));
export const saveTestMeta = (m: SavedMeta) => kvSet("meta", m);
export async function loadTestState(): Promise<{ meta: SavedMeta | null; audio: Blob | null }> {
  const [meta, audio] = await Promise.all([kvGet<SavedMeta>("meta"), kvGet<Blob>("audio")]);
  return { meta, audio };
}
export async function clearTestState() { await Promise.all([kvDel("meta"), kvDel("audio")]); }

/** Cut a recording to its first `minutes` minutes (16 kHz mono WAV). Returns the original if it is already shorter. */
export async function trimToMinutes(blob: Blob, minutes: number): Promise<Blob> {
  const pcm = await decodeBlobTo16k(blob);
  const keep = Math.round(minutes * 60 * 16000);
  if (pcm.length <= keep) return blob;
  return pcm16kToWav(pcm.subarray(0, keep));
}
