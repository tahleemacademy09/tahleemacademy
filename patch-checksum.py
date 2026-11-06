p='scripts/publish-ota.mjs'
s=open(p).read()
if 'checksum' not in s:
    s=s.replace('import { writeFileSync, rmSync, statSync } from "node:fs";','import { writeFileSync, rmSync, statSync, readFileSync } from "node:fs";\nimport { createHash } from "node:crypto";')
    old='const manifest = { version, url: `${BASE}/ota/${version}.zip`, minNativeBuild, notes };'
    assert old in s, "manifest line not found"
    s=s.replace(old,'const checksum = createHash("sha256").update(readFileSync("ota.zip")).digest("hex");\nconst manifest = { version, url: `${BASE}/ota/${version}.zip`, checksum, minNativeBuild, notes };')
    open(p,'w').write(s); print("publish script patched")
else: print("publish script already patched")
p='src/lib/otaUpdate.ts'
s=open(p).read()
if 'm.checksum' not in s:
    s=s.replace('interface Manifest { version: string; url: string;','interface Manifest { version: string; url: string; checksum?: string;')
    n=s.count('url: m.url, version: m.version')
    assert n>=1, "download call not found"
    s=s.replace('url: m.url, version: m.version','url: m.url, version: m.version, checksum: m.checksum')
    open(p,'w').write(s); print("ota client patched", n)
else: print("ota client already patched")
