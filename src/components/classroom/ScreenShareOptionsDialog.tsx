import { useState, useEffect } from "react";
import { AppWindow, Monitor, BellOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { loadShareOptions, saveShareOptions, type ShareOptions, type ShareMode, type ShareQuality } from "@/lib/nativeScreenShare";
import { Capacitor } from "@capacitor/core";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (o: ShareOptions) => void;
}

const card = (active: boolean): React.CSSProperties => ({
  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 8px",
  borderRadius: 12, cursor: "pointer", textAlign: "center", fontSize: 12,
  border: active ? "2px solid #8ab4f8" : "1px solid rgba(128,128,128,.35)",
  background: active ? "rgba(138,180,248,.12)" : "transparent",
});

export default function ScreenShareOptionsDialog({ open, onOpenChange, onConfirm }: Props) {
  const [o, setO] = useState<ShareOptions>(loadShareOptions);
  const native = Capacitor.isNativePlatform();
  useEffect(() => { if (open) setO(loadShareOptions()); }, [open]);

  const mode = (m: ShareMode) => setO(p => ({ ...p, mode: m }));
  const q = (v: ShareQuality) => setO(p => ({ ...p, quality: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Share screen</DialogTitle>
          <DialogDescription>Choose what the class can see.</DialogDescription>
        </DialogHeader>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={card(o.mode === "app")} onClick={() => mode("app")}>
            <AppWindow className="h-6 w-6" />
            <b>One app</b>
            <span style={{ opacity: .7 }}>Only that app. Notifications stay hidden.</span>
          </button>
          <button type="button" style={card(o.mode === "screen")} onClick={() => mode("screen")}>
            <Monitor className="h-6 w-6" />
            <b>Entire screen</b>
            <span style={{ opacity: .7 }}>Everything on screen.</span>
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
          <span style={{ opacity: .7, marginRight: 4 }}>Quality</span>
          {(["low", "medium", "high"] as ShareQuality[]).map(v => (
            <Button key={v} size="sm" variant={o.quality === v ? "default" : "outline"} className="h-7 px-3 text-xs capitalize" onClick={() => q(v)}>{v}</Button>
          ))}
        </div>

        {native && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <BellOff className="h-4 w-4" /> Silence notifications while sharing
            </span>
            <Switch checked={o.silenceNotifications} onCheckedChange={v => setO(p => ({ ...p, silenceNotifications: v }))} />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { saveShareOptions(o); onOpenChange(false); onConfirm(o); }}>Start sharing</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
