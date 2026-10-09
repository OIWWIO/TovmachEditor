import * as fs from 'fs'
import * as path from 'path'
import * as zlib from 'zlib'
import crc32 from 'crc-32'
import { AION_TABLES } from './tables'
import { aionBxmlDecodeFile, aionHtmlDecodeFile, aionBxmlEncodeFile, aionHtmlEncodeFile } from './aionTools.js'

const KEY = Buffer.from('f7a2ff4e2af9be10bbd01237b847dc3cebafd2f77d0ba619da8a39d7f85e8ce3', 'hex')
const ENC_LIMIT = 4096

const SIG_LOCAL_RIFT = Buffer.from([0x50, 0x4B, 0x03, 0x04])
const SIG_LOCAL_STD = Buffer.from([0xAF, 0xB4, 0xFC, 0xFB])
const SIG_CENTRAL_RIFT = Buffer.from([0x02, 0x00, 0x0D, 0xA1])
const SIG_CENTRAL_STD = Buffer.from([0xAF, 0xB4, 0xFE, 0xFD])
const SIG_EOCD_RIFT = Buffer.from([0xAF, 0xB4, 0xFA, 0xF9])
const SIG_EOCD_STD = Buffer.from([0xAF, 0xB4, 0xFA, 0xF9])

const CONSTANTS = new Uint32Array([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574])

function rotl(v: number, n: number): number { return ((v << n) | (v >>> (32 - n))) >>> 0 }
function quarter(s: Uint32Array, a: number, b: number, c: number, d: number) {
  s[a] = (s[a] + s[b]) >>> 0; s[d] = rotl(s[d] ^ s[a], 16)
  s[c] = (s[c] + s[d]) >>> 0; s[b] = rotl(s[b] ^ s[c], 12)
  s[a] = (s[a] + s[b]) >>> 0; s[d] = rotl(s[d] ^ s[a], 8)
  s[c] = (s[c] + s[d]) >>> 0; s[b] = rotl(s[b] ^ s[c], 7)
}
function block(key: Buffer, counter: number, nonce: Buffer): Uint32Array {
  const state = new Uint32Array(16)
  for (let i = 0; i < 4; i++) state[i] = CONSTANTS[i]
  for (let i = 0; i < 8; i++) state[4 + i] = key.readUInt32LE(i * 4)
  state[12] = counter >>> 0
  for (let i = 0; i < 3; i++) state[13 + i] = nonce.readUInt32LE(i * 4)
  const work = new Uint32Array(state)
  for (let i = 0; i < 10; i++) {
    quarter(work, 0, 4, 8, 12); quarter(work, 1, 5, 9, 13); quarter(work, 2, 6, 10, 14); quarter(work, 3, 7, 11, 15)
    quarter(work, 0, 5, 10, 15); quarter(work, 1, 6, 11, 12); quarter(work, 2, 7, 8, 13); quarter(work, 3, 4, 9, 14)
  }
  const out = new Uint32Array(16)
  for (let i = 0; i < 16; i++) out[i] = (work[i] + state[i]) >>> 0
  return out
}
function chacha20(data: Buffer, key: Buffer, nonce: Buffer, counter = 0): Buffer {
  const out = Buffer.alloc(data.length)
  for (let pos = 0; pos < data.length; pos += 64) {
    const ks = block(key, counter + Math.floor(pos / 64), nonce)
    const chunkLen = Math.min(64, data.length - pos)
    const ksBuf = Buffer.alloc(64)
    for (let i = 0; i < 16; i++) ksBuf.writeUInt32LE(ks[i], i * 4)
    for (let i = 0; i < chunkLen; i++) out[pos + i] = data[pos + i] ^ ksBuf[i]
  }
  return out
}

export interface PakEntry { name: string; method: number; crc: number; csize: number; usize: number; lho: number; data_off: number; isStd: boolean; }

export function readEntries(raw: Buffer): PakEntry[] {
  let isStd = raw.length >= 4 && raw.subarray(0, 4).equals(SIG_LOCAL_STD)
  let i = -1
  for (let offset = raw.length - 4; offset >= 0; offset--) {
    if (raw.subarray(offset, offset + 4).equals(SIG_EOCD_STD)) { i = offset; break; }
  }
  if (i < 0) throw new Error('EOCD signature not found')
  const total = raw.readUInt16LE(i + 10)
  const cd_off = raw.readUInt32LE(i + 16)
  const out: PakEntry[] = []
  let off = cd_off
  for (let k = 0; k < total; k++) {
    const method = raw.readUInt16LE(off + 10)
    const crc = raw.readUInt32LE(off + 16) >>> 0
    const csize = raw.readUInt32LE(off + 20)
    const usize = raw.readUInt32LE(off + 24)
    const nlen = raw.readUInt16LE(off + 28)
    const elen = raw.readUInt16LE(off + 30)
    const cmlen = raw.readUInt16LE(off + 32)
    const lho = raw.readUInt32LE(off + 42)
    const name = raw.toString('utf8', off + 46, off + 46 + nlen)
    const lnlen = raw.readUInt16LE(lho + 26)
    const lelen = raw.readUInt16LE(lho + 28)
    const data_off = lho + 30 + lnlen + lelen
    out.push({ name, method, crc, csize, usize, lho, data_off, isStd })
    off += 46 + nlen + elen + cmlen
  }
  return out
}

function nonceFor(lho: number, crc: number, csize: number): Buffer {
  const buf = Buffer.alloc(12)
  buf.writeUInt32LE(lho, 0); buf.writeUInt32LE(crc, 4); buf.writeUInt32LE(csize, 8)
  return buf
}

function aionPakTblOff(version: number, csize: number) {
  return version === 1 ? (csize & 31) * 32 : csize & 1023;
}

export function detectVersion(rawOriginal: Buffer, e: PakEntry): number {
  if (!e.isStd) return 0;
  if (e.csize === 0) return 2;
  const blob = Buffer.from(rawOriginal.subarray(e.data_off, e.data_off + Math.min(32, e.csize)));
  
  const off2 = aionPakTblOff(2, e.csize);
  const t2 = AION_TABLES[2];
  const dec2 = Buffer.from(blob);
  for(let i=0; i<dec2.length; i++) dec2[i] ^= t2[off2+i];
  if (e.method === 8 && dec2.length >= 2 && dec2[0] === 0x78) return 2;
  if (e.method === 0 && dec2.length > 0) {
    if (dec2[0] === 0xFF || dec2[0] === 0xEF || dec2[0] === 0x80) return 2;
  }
  
  const off1 = aionPakTblOff(1, e.csize);
  const t1 = AION_TABLES[1];
  const dec1 = Buffer.from(blob);
  for(let i=0; i<dec1.length; i++) dec1[i] ^= t1[off1+i];
  if (e.method === 8 && dec1.length >= 2 && dec1[0] === 0x78) return 1;
  
  return 2; // Default to v2
}

export function decryptEntry(raw: Buffer, e: PakEntry, version: number = 2): Buffer {
  const blob = Buffer.from(raw.subarray(e.data_off, e.data_off + e.csize))
  if (e.isStd) {
    const n = Math.min(32, blob.length)
    const off = aionPakTblOff(version, blob.length)
    const t = AION_TABLES[version]
    for (let i = 0; i < n; i++) blob[i] ^= t[off + i]
    return blob
  } else {
    const n = Math.min(e.csize, ENC_LIMIT)
    if (n > 0) {
      const nonce = nonceFor(e.lho, e.crc, e.csize)
      const dec = chacha20(blob.subarray(0, n), KEY, nonce)
      dec.copy(blob, 0, 0, n)
    }
    return blob
  }
}

export function inflate(blob: Buffer, method: number): Buffer {
  if (method === 8) return zlib.inflateRawSync(blob)
  if (method === 0) return blob
  throw new Error('Unknown compression method ' + method)
}

export function getEntryContent(pakPath: string, e: PakEntry): Buffer {
  try {
    const raw = fs.readFileSync(pakPath)
    const version = detectVersion(raw, e)
    const dec = decryptEntry(raw, e, version)
    return inflate(dec, e.method)
  } catch (err: any) {
    throw new Error(e.isStd ? ('XOR+Deflate Error: ' + err.message) : ('ChaCha20+Deflate Error: ' + err.message))
  }
}

export async function extractPakAsync(pakPath: string, outDir: string, onProgress: (current: number, total: number, fileName: string) => void): Promise<boolean> {
  const raw = await fs.promises.readFile(pakPath)
  const entries = readEntries(raw)
  let current = 0
  
  let version = 2;
  if (entries.length > 0 && entries[0].isStd) {
     version = detectVersion(raw, entries[0]);
  }

  for (const e of entries) {
    current++
    onProgress(current, entries.length, e.name)
    if (current % 100 === 0) await new Promise(r => setTimeout(r, 0));
if (current % 1000 === 0) console.log(`Processed ${current}/${entries.length}`);
    try {
      const dec = decryptEntry(raw, e, version)
      let data = inflate(dec, e.method)
      
      if (e.name.endsWith('.xml')) {
        try {
          const res = aionBxmlDecodeFile(data)
          if (res.decoded) data = Buffer.from(res.data)
        } catch(err) {}
      } else if (e.name.endsWith('.html')) {
        try {
          const res = aionHtmlDecodeFile(data, e.name)
          if (res.decoded) data = Buffer.from(res.data)
        } catch(err) {}
      }
      
      const outPath = path.join(outDir, e.name.replace(/\\/g, '/'))
      await fs.promises.mkdir(path.dirname(outPath), { recursive: true })
      await fs.promises.writeFile(outPath, data)
    } catch (err) {
      console.error(err)
    }
  }
  return true
}

function ensureUtf16Bom(data: Buffer): Buffer {
  const hasBom16 = data.length >= 2 && data[0] === 0xFF && data[1] === 0xFE;
  if (hasBom16) return data;
  
  const hasBom8 = data.length >= 3 && data[0] === 0xEF && data[1] === 0xBB && data[2] === 0xBF;
  
  let isUtf16Le = false;
  let nullCount = 0;
  for (let i = 1; i < Math.min(data.length, 100); i += 2) {
    if (data[i] === 0) nullCount++;
  }
  if (nullCount > 10) isUtf16Le = true;

  let text = '';
  if (isUtf16Le) {
    text = data.toString('utf16le');
  } else {
    if (hasBom8) {
      text = data.toString('utf8').replace(/^\uFEFF/, '');
    } else {
      text = data.toString('utf8');
    }
  }
  
  const buf = Buffer.from(text, 'utf16le');
  return Buffer.concat([Buffer.from([0xFF, 0xFE]), buf]);
}

export async function buildPakAsync(inDir: string, outPak: string, originalPak: string, onProgress: (current: number, total: number, fileName: string) => void): Promise<boolean> {
  const rawOriginal = await fs.promises.readFile(originalPak)
  const isStd = rawOriginal.length >= 4 && rawOriginal.subarray(0, 4).equals(SIG_LOCAL_STD)
  const entries = readEntries(rawOriginal)
  
  let version = 2;
  if (isStd && entries.length > 0) {
     version = detectVersion(rawOriginal, entries[0]);
  }
  
  const body: Buffer[] = []
  const central: Buffer[] = []
  let currentOffset = 0
  let current = 0
  
  for (const e of entries) {
    current++
    onProgress(current, entries.length, e.name)
    if (current % 100 === 0) await new Promise(r => setTimeout(r, 0))
    
    const srcPath = path.join(inDir, e.name.replace(/\\/g, '/'))
      let data: Buffer
      
      try {
        let rawData = await fs.promises.readFile(srcPath)
        
        if (e.name.endsWith('.xml')) {
           try {
              const res = aionBxmlEncodeFile(rawData)
              if (res.encoded) rawData = Buffer.from(res.data)
           } catch(err) {}
        } else if (e.name.endsWith('.html')) {
           try {
              const res = aionHtmlEncodeFile(rawData, e.name)
              if (res.encoded) rawData = Buffer.from(res.data)
           } catch(err) {}
        }
        data = rawData
      } catch (err) {
        // Fallback to original pak
        const origDec = decryptEntry(rawOriginal, e, version)
        data = inflate(origDec, e.method)
      }
      
      const crc = crc32.buf(data) >>> 0
    let comp = zlib.deflateRawSync(data, { level: 1 })
    let finalMethod = 8
    
    if (comp.length >= data.length || e.method === 0) {
      comp = data
      finalMethod = 0
    }
    
    const lho = currentOffset
    let enc: Buffer
    if (isStd) {
      enc = Buffer.from(comp)
      const n = Math.min(32, enc.length)
      const off = aionPakTblOff(version, enc.length)
      const t = AION_TABLES[version]
      for (let i = 0; i < n; i++) enc[i] ^= t[off + i]
    } else {
      const n = Math.min(comp.length, ENC_LIMIT)
      enc = Buffer.from(comp)
      if (n > 0) {
        const nonce = nonceFor(lho, crc, comp.length)
        const dec = chacha20(enc.subarray(0, n), KEY, nonce)
        dec.copy(enc, 0, 0, n)
      }
    }
    
    const nameBuf = Buffer.from(e.name, 'utf8')
    const lhBuf = Buffer.alloc(30)
    const sigLocal = isStd ? SIG_LOCAL_STD : SIG_LOCAL_RIFT
    sigLocal.copy(lhBuf, 0)
    lhBuf.writeUInt16LE(20, 4); lhBuf.writeUInt16LE(0, 6); lhBuf.writeUInt16LE(finalMethod, 8); lhBuf.writeUInt16LE(0, 10); lhBuf.writeUInt16LE(0x3221, 12);
    lhBuf.writeUInt32LE(crc, 14); lhBuf.writeUInt32LE(comp.length, 18); lhBuf.writeUInt32LE(data.length, 22); lhBuf.writeUInt16LE(nameBuf.length, 26); lhBuf.writeUInt16LE(0, 28);
    body.push(lhBuf, nameBuf, enc)
    currentOffset += lhBuf.length + nameBuf.length + enc.length
    
    const cdBuf = Buffer.alloc(46)
    const sigCentral = isStd ? SIG_CENTRAL_STD : SIG_CENTRAL_RIFT
    sigCentral.copy(cdBuf, 0)
    cdBuf.writeUInt16LE(20, 4); cdBuf.writeUInt16LE(20, 6); cdBuf.writeUInt16LE(0, 8); cdBuf.writeUInt16LE(finalMethod, 10); cdBuf.writeUInt16LE(0, 12); cdBuf.writeUInt16LE(0x3221, 14);
    cdBuf.writeUInt32LE(crc, 16); cdBuf.writeUInt32LE(comp.length, 20); cdBuf.writeUInt32LE(data.length, 24); cdBuf.writeUInt16LE(nameBuf.length, 28);
    cdBuf.writeUInt32LE(lho, 42)
    central.push(cdBuf, nameBuf)
  }
  
  const cdOffset = currentOffset
  let cdSize = 0
  for (const b of central) cdSize += b.length
  const eocdBuf = Buffer.alloc(22)
  const sigEocd = isStd ? SIG_EOCD_STD : SIG_EOCD_RIFT
  sigEocd.copy(eocdBuf, 0)
  eocdBuf.writeUInt16LE(entries.length, 8); eocdBuf.writeUInt16LE(entries.length, 10);
  eocdBuf.writeUInt32LE(cdSize, 12); eocdBuf.writeUInt32LE(cdOffset, 16);
  const finalOut = Buffer.concat([...body, ...central, eocdBuf])
  await fs.promises.writeFile(outPak, finalOut)
  return true
}
