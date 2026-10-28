// src/lib/apkMeta.ts
//
// Reads versionCode + versionName straight out of an .apk file in the browser,
// so the admin never types them (and they can never disagree with the build).
// An APK is a ZIP; AndroidManifest.xml inside is Android's binary XML (AXML).

export interface ApkMeta {
  versionCode: number;
  versionName: string;
  packageName: string | null;
}

const u16 = (d: DataView, o: number) => d.getUint16(o, true);
const u32 = (d: DataView, o: number) => d.getUint32(o, true);

async function readSlice(file: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await file.slice(start, end).arrayBuffer());
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Pull AndroidManifest.xml out of the APK (ZIP) without loading the whole file. */
async function extractManifest(file: Blob): Promise<Uint8Array> {
  const tailLen = Math.min(file.size, 65557);
  const tail = await readSlice(file, file.size - tailLen, file.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a valid APK (no ZIP directory)");
  const entries = u16(tail, eocd + 10);
  const cdSize = u32(tail, eocd + 12);
  const cdOffset = u32(tail, eocd + 16);

  const cd = await readSlice(file, cdOffset, cdOffset + cdSize);
  const dec = new TextDecoder();
  let p = 0;
  for (let n = 0; n < entries && p + 46 <= cd.byteLength; n++) {
    if (u32(cd, p) !== 0x02014b50) break;
    const method = u16(cd, p + 10);
    const compSize = u32(cd, p + 20);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    const localOffset = u32(cd, p + 42);
    const name = dec.decode(new Uint8Array(cd.buffer, p + 46, nameLen));
    if (name === "AndroidManifest.xml") {
      const lh = await readSlice(file, localOffset, localOffset + 30);
      const dataStart = localOffset + 30 + u16(lh, 26) + u16(lh, 28);
      const raw = new Uint8Array(await file.slice(dataStart, dataStart + compSize).arrayBuffer());
      if (method === 0) return raw;
      if (method === 8) return inflateRaw(raw);
      throw new Error("Unsupported APK compression");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("AndroidManifest.xml not found in APK");
}

function readStringPool(d: DataView, chunk: number): string[] {
  const headerSize = u16(d, chunk + 2);
  const count = u32(d, chunk + 8);
  const flags = u32(d, chunk + 16);
  const stringsStart = u32(d, chunk + 20);
  const utf8 = (flags & 0x100) !== 0;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let o = chunk + stringsStart + u32(d, chunk + headerSize + i * 4);
    if (utf8) {
      let len = d.getUint8(o++); if (len & 0x80) len = ((len & 0x7f) << 8) | d.getUint8(o++);
      let blen = d.getUint8(o++); if (blen & 0x80) blen = ((blen & 0x7f) << 8) | d.getUint8(o++);
      out.push(new TextDecoder().decode(new Uint8Array(d.buffer, d.byteOffset + o, blen)));
    } else {
      let len = u16(d, o); o += 2;
      if (len & 0x8000) { len = ((len & 0x7fff) << 16) | u16(d, o); o += 2; }
      let s = "";
      for (let k = 0; k < len; k++) s += String.fromCharCode(u16(d, o + k * 2));
      out.push(s);
    }
  }
  return out;
}

export async function readApkMeta(file: File): Promise<ApkMeta> {
  const xml = await extractManifest(file);
  const d = new DataView(xml.buffer, xml.byteOffset, xml.byteLength);
  if (u16(d, 0) !== 0x0003) throw new Error("Unreadable AndroidManifest");

  let strings: string[] = [];
  let pos = u16(d, 2); // skip file header
  while (pos + 8 <= d.byteLength) {
    const type = u16(d, pos);
    const size = u32(d, pos + 4);
    if (size < 8) break;
    if (type === 0x0001) {
      strings = readStringPool(d, pos);
    } else if (type === 0x0102) {
      const name = strings[u32(d, pos + 20)];
      if (name === "manifest") {
        const attrStart = u16(d, pos + 24);
        const attrSize = u16(d, pos + 26);
        const attrCount = u16(d, pos + 28);
        let code: number | null = null;
        let vname = "";
        let pkg: string | null = null;
        for (let i = 0; i < attrCount; i++) {
          const a = pos + 16 + attrStart + i * attrSize;
          const aName = strings[u32(d, a + 4)];
          const raw = u32(d, a + 8);
          const dataType = d.getUint8(a + 15);
          const data = u32(d, a + 16);
          const str = raw !== 0xffffffff ? strings[raw] : dataType === 0x03 ? strings[data] : "";
          if (aName === "versionCode") code = data;
          else if (aName === "versionName") vname = str;
          else if (aName === "package") pkg = str;
        }
        if (code == null || !Number.isInteger(code) || code < 1) throw new Error("versionCode missing in APK");
        return { versionCode: code, versionName: vname || String(code), packageName: pkg };
      }
    }
    pos += size;
  }
  throw new Error("Manifest element not found");
}
