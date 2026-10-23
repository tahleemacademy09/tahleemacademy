/*
  src/pages/admin/AppReleases.tsx — Tahleem Academy
  ─────────────────────────────────────────────────
  Admin uploads the Android APK here. Flow:
    1. APK goes straight from the browser to Cloudflare R2 (presigned PUT from
       the `app-release-url` edge function) — it never touches Supabase storage.
    2. A row is saved in `app_releases` (version, notes, file path, size).
    3. Optionally every student gets a notification (push + in-app) linking to
       /student/app. Students already on the app see the update banner and the
       star in their sidebar.

  IMPORTANT: "Version code" must match `versionCode` in
  android/app/build.gradle for the APK you're uploading. The app compares its
  own build number with this to know an update exists.
*/
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Smartphone, Trash2, Eye, EyeOff, Download, Bell, Loader2, Star, FileUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatBytes, startReleaseDownload, type AppRelease } from "@/hooks/useAppRelease";
import { useQueryClient } from "@tanstack/react-query";

const db = supabase as any;

const G = "#064E3B";
const G2 = "#075E54";
const GOLD = "#c9a84c";
const APK_TYPE = "application/vnd.android.package-archive";
const MAX_BYTES = 200 * 1024 * 1024;

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none",
  background: "#FAFAFA", boxSizing: "border-box", fontFamily: "inherit",
};
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6, display: "block" };
const card: React.CSSProperties = {
  background: "#fff", borderRadius: 16, border: "1px solid #F0F0F0",
  padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,.04)",
};

function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", APK_TYPE);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

async function r2Call(path: string, action: "upload" | "delete") {
  const { data, error } = await supabase.functions.invoke("app-release-url", { body: { path, action } });
  if (error || (!data?.url && !data?.ok)) throw new Error(error?.message || data?.error || "Storage request failed");
  return data as { url?: string; ok?: boolean };
}

async function notifyAllStudents(r: { version_name: string; release_notes: string | null }) {
  const { data: roleRows, error } = await supabase.from("user_roles").select("user_id").eq("role", "student");
  if (error) throw error;
  const ids = Array.from(new Set((roleRows ?? []).map((x: any) => x.user_id)));
  if (!ids.length) return 0;
  const message = (r.release_notes?.split("\n")[0] || "A new version of the Tahleem Academy app is ready. Tap to update.").slice(0, 180);
  const rows = ids.map((user_id) => ({
    user_id,
    type: "announcement",
    priority: "important",
    title: `📲 App update — version ${r.version_name}`,
    title_ar: `📲 تحديث التطبيق — الإصدار ${r.version_name}`,
    message,
    link: "/student/app",
  }));
  for (let i = 0; i < rows.length; i += 400) {
    const { error: insErr } = await supabase.from("notifications").insert(rows.slice(i, i + 400));
    if (insErr) throw insErr;
  }
  return ids.length;
}

export default function AppReleases() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [versionName, setVersionName] = useState("");
  const [versionCode, setVersionCode] = useState("");
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rel }, { data: dl }] = await Promise.all([
      db.from("app_releases").select("*").order("version_code", { ascending: false }),
      db.from("app_release_downloads").select("release_id"),
    ]);
    setReleases((rel ?? []) as AppRelease[]);
    const c: Record<string, number> = {};
    (dl ?? []).forEach((d: any) => { c[d.release_id] = (c[d.release_id] ?? 0) + 1; });
    setCounts(c);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const latestId = useMemo(() => releases.find((r) => r.is_published)?.id, [releases]);
  const highestCode = releases[0]?.version_code ?? 0;

  const resetForm = () => {
    setFile(null); setVersionName(""); setVersionCode(""); setNotes("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleUpload = async () => {
    const code = parseInt(versionCode, 10);
    if (!file) return toast({ title: "Choose the APK file first", variant: "destructive" });
    if (!file.name.toLowerCase().endsWith(".apk")) return toast({ title: "That's not an .apk file", variant: "destructive" });
    if (file.size > MAX_BYTES) return toast({ title: "File too large", description: "Max 200 MB.", variant: "destructive" });
    if (!versionName.trim()) return toast({ title: "Enter the version name", description: "e.g. 1.3.0", variant: "destructive" });
    if (!Number.isInteger(code) || code < 1) return toast({ title: "Enter the version code", description: "A whole number matching versionCode in build.gradle.", variant: "destructive" });
    if (releases.some((r) => r.version_code === code)) return toast({ title: "Version code already used", description: "Each upload needs a higher, unique version code.", variant: "destructive" });
    if (code < highestCode && !window.confirm(`Version code ${code} is lower than your latest (${highestCode}). Phones won't see it as an update. Upload anyway?`)) return;

    const safeVer = versionName.trim().replace(/[^A-Za-z0-9._-]/g, "_");
    const fileName = `tahleem-academy-v${safeVer}-${code}.apk`;
    const path = `app-releases/${fileName}`;

    setUploading(true); setProgress(0);
    try {
      setStage("Preparing upload…");
      const { url } = await r2Call(path, "upload");
      if (!url) throw new Error("No upload URL returned");

      setStage("Uploading APK…");
      await putWithProgress(url, file, setProgress);

      setStage("Saving release…");
      const row = {
        platform: "android",
        version_name: versionName.trim(),
        version_code: code,
        release_notes: notes.trim() || null,
        file_path: path,
        file_name: fileName,
        file_size: file.size,
        is_published: true,
        created_by: user?.id ?? null,
      };
      const { error } = await db.from("app_releases").insert(row);
      if (error) {
        await r2Call(path, "delete").catch(() => {});
        throw error;
      }

      let notified = 0;
      if (notify) {
        setStage("Notifying students…");
        try { notified = await notifyAllStudents(row); }
        catch (e: any) { toast({ title: "Saved, but notifying failed", description: e.message, variant: "destructive" }); }
      }

      toast({ title: "Release published", description: notify ? `${notified} student${notified === 1 ? "" : "s"} notified.` : "Students will see the update banner and star." });
      resetForm();
      qc.invalidateQueries({ queryKey: ["app-release"] });
      await load();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setUploading(false); setStage(""); setProgress(0);
    }
  };

  const togglePublish = async (r: AppRelease) => {
    setRowBusy(r.id);
    const { error } = await db.from("app_releases").update({ is_published: !r.is_published }).eq("id", r.id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["app-release"] });
    await load();
    setRowBusy(null);
  };

  const remove = async (r: AppRelease) => {
    if (!window.confirm(`Delete version ${r.version_name}? The APK file is removed permanently.`)) return;
    setRowBusy(r.id);
    try {
      await r2Call(r.file_path, "delete");
      const { error } = await db.from("app_releases").delete().eq("id", r.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["app-release"] });
      await load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally { setRowBusy(null); }
  };

  const renotify = async (r: AppRelease) => {
    if (!window.confirm(`Send the update notification for ${r.version_name} to all students again?`)) return;
    setRowBusy(r.id);
    try {
      const n = await notifyAllStudents(r);
      toast({ title: "Notification sent", description: `${n} student${n === 1 ? "" : "s"} notified.` });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setRowBusy(null); }
  };

  const testDownload = async (r: AppRelease) => {
    try { await startReleaseDownload(r); }
    catch (e: any) { toast({ title: "Download failed", description: e.message, variant: "destructive" }); }
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px 16px 48px", fontFamily: "'Cairo',system-ui,sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: `linear-gradient(135deg,${G},${G2})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Smartphone size={22} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#111" }}>App Releases</div>
          <div style={{ fontSize: 13, color: "#6B7280" }}>Upload the Android app. Students download it and are told when a new version is out.</div>
        </div>
      </div>

      {/* Upload */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 14, color: "#111" }}>Upload a new version</div>

        <label style={lbl}>APK file</label>
        <div
          onClick={() => !uploading && fileRef.current?.click()}
          style={{
            border: `2px dashed ${file ? G : "#D1D5DB"}`, borderRadius: 14, padding: 18, textAlign: "center",
            cursor: uploading ? "default" : "pointer", background: file ? "#F0FDF4" : "#FAFAFA", marginBottom: 14,
          }}
        >
          <FileUp size={22} color={file ? G : "#9CA3AF"} style={{ margin: "0 auto 6px" }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: file ? G : "#6B7280" }}>
            {file ? `${file.name} · ${formatBytes(file.size)}` : "Tap to choose the .apk file"}
          </div>
          <input ref={fileRef} type="file" accept=".apk,application/vnd.android.package-archive" hidden
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Version name</label>
            <input style={inp} placeholder="1.3.0" value={versionName} onChange={(e) => setVersionName(e.target.value)} disabled={uploading} />
          </div>
          <div>
            <label style={lbl}>Version code</label>
            <input style={inp} inputMode="numeric" placeholder={String((highestCode || 0) + 1)} value={versionCode}
              onChange={(e) => setVersionCode(e.target.value.replace(/\D/g, ""))} disabled={uploading} />
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: -6, marginBottom: 14, lineHeight: 1.5 }}>
          Version code must be the same number as <code>versionCode</code> in <code>android/app/build.gradle</code> for this APK, and higher than the last one.
          {highestCode ? ` Current highest: ${highestCode}.` : ""}
        </div>

        <label style={lbl}>What's new (shown to students)</label>
        <textarea style={{ ...inp, minHeight: 84, resize: "vertical" }} placeholder={"• Smaller app size\n• Fixed live class audio"}
          value={notes} onChange={(e) => setNotes(e.target.value)} disabled={uploading} />

        <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0", fontSize: 13, color: "#374151", cursor: "pointer" }}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} disabled={uploading} />
          <Bell size={14} /> Send a push notification to all students
        </label>

        {uploading && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: G, marginBottom: 6 }}>{stage}{stage.startsWith("Uploading") ? ` ${progress}%` : ""}</div>
            <div style={{ height: 8, borderRadius: 8, background: "#E5E7EB", overflow: "hidden" }}>
              <div style={{ width: `${stage.startsWith("Uploading") ? progress : 100}%`, height: "100%", background: `linear-gradient(90deg,${G},${GOLD})`, transition: "width .2s" }} />
            </div>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading}
          style={{
            width: "100%", padding: 14, borderRadius: 12, border: "none", cursor: uploading ? "default" : "pointer",
            background: `linear-gradient(135deg,${G},${G2})`, color: "#fff", fontWeight: 800, fontSize: 14,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: uploading ? 0.7 : 1,
          }}
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {uploading ? "Please keep this page open…" : "Upload & publish"}
        </button>
      </div>

      {/* List */}
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12, color: "#111" }}>Releases</div>
        {loading ? (
          <div style={{ textAlign: "center", padding: 20 }}><Loader2 className="animate-spin" size={20} color={G} /></div>
        ) : releases.length === 0 ? (
          <div style={{ fontSize: 13, color: "#6B7280", textAlign: "center", padding: 16 }}>No releases uploaded yet.</div>
        ) : releases.map((r) => (
          <div key={r.id} style={{ borderTop: "1px solid #F3F4F6", padding: "14px 0", opacity: r.is_published ? 1 : 0.6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: "#111" }}>v{r.version_name}</span>
              <span style={{ fontSize: 11, color: "#6B7280" }}>code {r.version_code}</span>
              {r.id === latestId && (
                <span style={{ display: "flex", alignItems: "center", gap: 3, background: `${GOLD}22`, color: "#8a6d1c", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>
                  <Star size={10} fill={GOLD} color={GOLD} /> LATEST
                </span>
              )}
              {!r.is_published && <span style={{ background: "#F3F4F6", color: "#6B7280", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>HIDDEN</span>}
            </div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
              {formatBytes(r.file_size)} · {new Date(r.created_at).toLocaleDateString()} · {counts[r.id] ?? 0} download{(counts[r.id] ?? 0) === 1 ? "" : "s"}
            </div>
            {r.release_notes && <div style={{ fontSize: 12.5, color: "#374151", marginTop: 6, whiteSpace: "pre-wrap" }}>{r.release_notes}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {[
                { icon: <Download size={13} />, text: "Test download", on: () => testDownload(r) },
                { icon: <Bell size={13} />, text: "Notify again", on: () => renotify(r) },
                { icon: r.is_published ? <EyeOff size={13} /> : <Eye size={13} />, text: r.is_published ? "Hide" : "Publish", on: () => togglePublish(r) },
                { icon: <Trash2 size={13} />, text: "Delete", on: () => remove(r), danger: true },
              ].map((b) => (
                <button key={b.text} onClick={b.on} disabled={rowBusy === r.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${(b as any).danger ? "#FCA5A5" : "#E5E7EB"}`, background: "#fff",
                    color: (b as any).danger ? "#DC2626" : "#374151", fontSize: 12, fontWeight: 700,
                  }}>
                  {b.icon} {b.text}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
