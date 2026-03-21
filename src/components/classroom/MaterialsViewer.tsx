import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FileText, Video, Music, Link as LinkIcon, Image, Download,
  File, ExternalLink, Play, Eye, X
} from "lucide-react";

interface Props {
  materials: any[];
  sessions?: any[];
}

/* Detect file type from URL or material_type */
type FileKind = "pdf" | "image" | "video" | "audio" | "youtube" | "link" | "office" | "other";

function detectKind(mat: any): FileKind {
  const url: string = mat.file_url || "";
  const type: string = (mat.material_type || "").toLowerCase();
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "";

  if (type === "video" || ["mp4", "webm", "ogg", "mov"].includes(ext)) return "video";
  if (type === "audio" || ["mp3", "wav", "ogg", "m4a", "aac"].includes(ext)) return "audio";
  if (type === "pdf" || ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("drive.google.com") || url.includes("docs.google.com")) return "office";
  if (["doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(ext)) return "office";
  if (type === "link") return "link";
  return "other";
}

/* Icon for each type */
function KindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  const map: Record<FileKind, React.ElementType> = {
    pdf: FileText, image: Image, video: Video, audio: Music,
    youtube: Play, link: LinkIcon, office: FileText, other: File,
  };
  const Icon = map[kind];
  return <Icon className={className} />;
}

/* Colour scheme per type */
const kindStyle: Record<FileKind, { bg: string; border: string; icon: string; badge: string }> = {
  pdf:     { bg: "#FEF2F2", border: "#FECACA", icon: "#DC2626", badge: "bg-red-100 text-red-700" },
  image:   { bg: "#EFF6FF", border: "#BFDBFE", icon: "#2563EB", badge: "bg-blue-100 text-blue-700" },
  video:   { bg: "#F0FDF4", border: "#BBF7D0", icon: "#16A34A", badge: "bg-green-100 text-green-700" },
  audio:   { bg: "#FDF4FF", border: "#E9D5FF", icon: "#9333EA", badge: "bg-purple-100 text-purple-700" },
  youtube: { bg: "#FFF7ED", border: "#FED7AA", icon: "#EA580C", badge: "bg-orange-100 text-orange-700" },
  link:    { bg: "#F0FDFA", border: "#99F6E4", icon: "#0D9488", badge: "bg-teal-100 text-teal-700" },
  office:  { bg: "#EFF6FF", border: "#BFDBFE", icon: "#1D4ED8", badge: "bg-blue-100 text-blue-700" },
  other:   { bg: "#F9FAFB", border: "#E5E7EB", icon: "#6B7280", badge: "bg-gray-100 text-gray-600" },
};

const kindLabel: Record<FileKind, string> = {
  pdf: "PDF", image: "Image", video: "Video", audio: "Audio",
  youtube: "YouTube", link: "Link", office: "Document", other: "File",
};

/* ── Inline viewer ─────────────────────────────────────── */
function FileViewer({ mat, kind, onClose }: { mat: any; kind: FileKind; onClose: () => void }) {
  const url: string = mat.file_url || "";

  // Resolve to absolute URL
  const resolveUrl = (u: string) => {
    if (!u) return "";
    if (u.startsWith("http")) return u;
    return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/subject-files/${u}`;
  };
  const absUrl = resolveUrl(url);

  // YouTube embed
  const ytEmbed = (u: string) => {
    const m = u.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
    return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1` : u;
  };

  // Google Docs/Drive viewer for office files
  const officeEmbed = (u: string) => {
    if (u.includes("docs.google.com") || u.includes("drive.google.com")) return u;
    return `https://docs.google.com/gviewer?url=${encodeURIComponent(u)}&embedded=true`;
  };

  return (
    <div className="flex flex-col" style={{ maxHeight: "80vh" }}>
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h3 className="font-bold text-base">{mat.title}</h3>
          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-1 ${kindStyle[kind].badge}`}>
            {kindLabel[kind]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a href={absUrl} download target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
          </a>
          <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {kind === "pdf" && (
          <iframe
            src={absUrl}
            className="w-full"
            style={{ height: "70vh", border: "none" }}
            title={mat.title}
          />
        )}
        {kind === "image" && (
          <div className="flex items-center justify-center p-4 bg-muted/30" style={{ minHeight: 300 }}>
            <img src={absUrl} alt={mat.title} className="max-w-full max-h-96 rounded-xl object-contain shadow-md" />
          </div>
        )}
        {kind === "video" && (
          <div className="bg-black">
            <video
              src={absUrl}
              controls
              autoPlay
              className="w-full"
              style={{ maxHeight: "60vh" }}
            />
          </div>
        )}
        {kind === "audio" && (
          <div className="p-8 flex flex-col items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center">
              <Music className="h-10 w-10 text-purple-600" />
            </div>
            <audio src={absUrl} controls className="w-full" />
          </div>
        )}
        {kind === "youtube" && (
          <div className="aspect-video">
            <iframe
              src={ytEmbed(absUrl)}
              className="w-full h-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              title={mat.title}
            />
          </div>
        )}
        {kind === "office" && (
          <iframe
            src={officeEmbed(absUrl)}
            className="w-full"
            style={{ height: "70vh", border: "none" }}
            title={mat.title}
          />
        )}
        {kind === "link" && (
          <div className="p-8 text-center">
            <LinkIcon className="h-12 w-12 text-teal-500 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-4 break-all">{absUrl}</p>
            <a href={absUrl} target="_blank" rel="noopener noreferrer">
              <Button className="gap-2"><ExternalLink className="h-4 w-4" /> Open Link</Button>
            </a>
          </div>
        )}
        {kind === "other" && (
          <div className="p-8 text-center">
            <File className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-4">Preview not available for this file type.</p>
            <a href={absUrl} download target="_blank" rel="noopener noreferrer">
              <Button className="gap-2"><Download className="h-4 w-4" /> Download File</Button>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────── */
const MaterialsViewer = ({ materials, sessions = [] }: Props) => {
  const { t } = useLanguage();
  const [viewing, setViewing] = useState<any | null>(null);
  const viewingKind = viewing ? detectKind(viewing) : "other";

  if (materials.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <FileText className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <p className="font-medium text-muted-foreground">{t("No materials yet", "لا توجد مواد بعد")}</p>
        <p className="text-sm text-muted-foreground mt-1">{t("Your teacher will upload files here.", "سيرفع المعلم الملفات هنا.")}</p>
      </div>
    );
  }

  // Group by session
  const sessioned   = materials.filter((m: any) => m.session_id);
  const unsessioned = materials.filter((m: any) => !m.session_id);

  const renderMat = (mat: any) => {
    const kind = detectKind(mat);
    const st   = kindStyle[kind];
    const session = mat.session_id ? sessions.find((s: any) => s.id === mat.session_id) : null;
    const canPreview = !!mat.file_url;

    return (
      <div
        key={mat.id}
        className="flex items-center gap-3 rounded-2xl p-3.5 border transition-all hover:shadow-md cursor-pointer"
        style={{ background: st.bg, borderColor: st.border }}
        onClick={() => canPreview && setViewing(mat)}
      >
        {/* Icon */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${st.icon}18` }}
        >
          <KindIcon kind={kind} className="h-5 w-5" style={{ color: st.icon } as any} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{mat.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${st.badge}`}>
              {kindLabel[kind]}
            </span>
            {session && (
              <span className="text-xs text-muted-foreground">
                Session #{(session as any).session_number}
              </span>
            )}
            {mat.created_at && (
              <span className="text-xs text-muted-foreground">
                {new Date(mat.created_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Action */}
        {canPreview ? (
          <Button size="sm" variant="ghost" className="gap-1.5 rounded-xl text-xs font-semibold shrink-0" style={{ color: st.icon }}>
            <Eye className="h-3.5 w-3.5" />
            {t("View", "عرض")}
          </Button>
        ) : (
          <a href={mat.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
            <Button size="sm" variant="ghost" className="gap-1.5 rounded-xl text-xs shrink-0">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </a>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* General materials */}
      {unsessioned.length > 0 && (
        <div>
          {sessioned.length > 0 && (
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
              {t("General", "عام")}
            </p>
          )}
          <div className="space-y-2">{unsessioned.map(renderMat)}</div>
        </div>
      )}

      {/* Session-grouped materials */}
      {sessioned.length > 0 && (() => {
        const bySession: Record<string, any[]> = {};
        sessioned.forEach((m: any) => {
          if (!bySession[m.session_id]) bySession[m.session_id] = [];
          bySession[m.session_id].push(m);
        });
        return Object.entries(bySession).map(([sid, mats]) => {
          const sess = sessions.find((s: any) => s.id === sid);
          return (
            <div key={sid}>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
                {t("Session", "الحصة")} #{(sess as any)?.session_number || "?"} — {(sess as any)?.topic || ""}
              </p>
              <div className="space-y-2">{mats.map(renderMat)}</div>
            </div>
          );
        });
      })()}

      {/* Viewer dialog */}
      <Dialog open={!!viewing} onOpenChange={v => !v && setViewing(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden rounded-2xl">
          {viewing && (
            <FileViewer mat={viewing} kind={viewingKind} onClose={() => setViewing(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MaterialsViewer;
