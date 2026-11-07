// Detects a slow / metered link BEFORE LiveKit's own quality score reacts.
// navigator.connection exists on Chrome/Android/WebView (the Capacitor app) but not Safari/Firefox,
// where we simply report "not slow" and let LiveKit's ConnectionQuality events handle it.

type NetInfo = {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  addEventListener?: (t: string, cb: () => void) => void;
  removeEventListener?: (t: string, cb: () => void) => void;
};

const getConn = (): NetInfo | undefined =>
  typeof navigator === "undefined" ? undefined : (navigator as any).connection;

export const isSlowLink = (): boolean => {
  const c = getConn();
  if (!c) return false;
  if (c.saveData) return true;
  if (c.effectiveType && /(^|-)(2g|3g)$/.test(c.effectiveType)) return true;
  if (typeof c.downlink === "number" && c.downlink > 0 && c.downlink < 1.0) return true;
  if (typeof c.rtt === "number" && c.rtt > 800) return true;
  return false;
};

export const onLinkChange = (cb: () => void): (() => void) => {
  const c = getConn();
  c?.addEventListener?.("change", cb);
  return () => c?.removeEventListener?.("change", cb);
};
