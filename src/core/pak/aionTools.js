/* =========================================================================
   AION PAK TOOLS — порт на JavaScript
   Джерело: aionpak.py, aiontool.py, bxml.py, aionhtml.py (+ table1.bin, table2.bin)

   Без залежностей: працює в браузері й у Node 18+ (потрібні atob, TextDecoder,
   TextEncoder, DecompressionStream / CompressionStream).

   Усі дані — Uint8Array. "Папка" з python-версії — це Map<string, Uint8Array>
   (відносний шлях з "/" -> байти). Для інтеграції в App.jsx прибери `export`,
   якщо вставляєш фрагмент прямо у файл.

   Публічне API:
     aionPak*   — aionpak.py  (unpack / pack / pak<->zip, XOR-ключі)
     aionTool*  — aiontool.py (unpack з декодуванням .xml/.html, pack з кодуванням)
     aionBxml*  — bxml.py     (бінарний XML <-> дерево <-> текстовий XML)
     aionHtml*  — aionhtml.py (шифрований .html)
   ========================================================================= */

/* ---------------------------------------------------------------- tables */
function _b64ToBytes(s) {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

// table1.bin (1024 B) і table2.bin (1056 B), вбудовані в код
const AION_TABLES = {
  1: _b64ToBytes([
    "L11R9wHptJNOUYE+rz/fmYBeE4ObRle1G1zssSl8qTFo5dqn9k+uFpp/A88dXtBRWuUC2RHQ+/T4",
    "fKKIJtgfokPaM6msTloN7XiGLbJqxJuqd4VXaqbYNdiXaxckt3od0zueefKunwHmnSlA7S+cFtoY",
    "0ZkO1ApjLZLX67SnUCHYD0XWxr/MR8xZ7T5x/qAm/NEHhYruEjYRWmDhj72e97ZkOc1JWpr3kBzB",
    "oguzgffKuCpLlRPcLkrlZBaUmcmxe1N2rsTfJvfIX3gxrq9af6TnKV4O4ruRQTIs8M5gnifc+twT",
    "rDf38bSkzfR63Kl7lYLaffuNa24MQ+cjbMBT+TmCON6b0P5XPXVlQ7CuWm5Os/uujMQPm2Unr6LG",
    "8YSRlBo5OVOlkGTwYsy1vx68pyiuMz8WxjC3sfKDsV6wNyCd93uVvjVuGwcFdzI6roo5Ja8QxRhW",
    "wiv5xEvW3ETXnahcf63viLxGX/7A495p4wPt+AYfOMEiI/TB1+ERezzLtI2vgiMwDXiC+e0+keFS",
    "p9XVdXFG2hGX+xbf6vOroDJm215euUNVDp6lKv1eMcaT1JqiKzcAuUYT9wVRp7KqIgydxdI9YvQo",
    "jLyJJXn6mv2NobwCKxWwtuakzbxy+Gi0mjMIumK3sbHKAAgBQGiO4UlP2PJnhfA3yWGrHsZqTcqv",
    "Ay82AvC8XoE5iiU4LMoE+Q32RFtG2963e/SsO382DZB8LLAgSKupfznbbQuA4vE3UPqDndM+jFRI",
    "6+eSNGrrKxja2uV8ftM92bH9kCjNAEWTs4brMkvm6iS2l7QRlKAWU/uuptea6dn7pkHCbexLC1nX",
    "bC7sm11vdmbLsCPKLI22Om7cKdG9HYk/68ciCbgdLgSYcRo1Jn2q8tvAAYpWdtEnoyvIWOp2cub5",
    "6qBU9LKkwLvsVIE/WDc8aUXIt7FgOz0gW5fO0vyx8q+iy2d0rVh5yP7BVHHqmAtZxiGglH+R3v1h",
    "/DyhcUefl4kNQ3SX7IX+Lg3nScpVDt30OPgisX5VnlbqD0o6PQ+GZFdR+aMMI+Qqat8gMfjdbajE",
    "30J9rtKsfdcfhWekT5chJWHQqWt3R8eXRxMDGvrI4gXXpg7acRhCxarYsJZTL9N4rY8rxJE7B9eQ",
    "CctVzPfMvc/FO8E0HTU8WY11Nff3t9vWkFPbZiAO95iwvVGkSbQ/HeKCKwQ8E0s5tr2oAOczYOX6",
    "8XvVmytMn4G2ubhVFl96BQfmsz68i8MvNyMZOdGiTLqBeKOZ07BTuThEK/yPew/+mcr7Nz4d1Jk8",
    "3dVvSMLhgyOrf1KpicRhb64CZul6Z2ett4B/yKi1Yckas1dzbOnToPr+Q3DDcUYuvi4CF8p4oA==",
  ].join("")),
  2: _b64ToBytes([
    "hvoaHAe92GTO7lmIzakdBvc9MViDoVx+36ZQnomoEtIlSXXiBw/rAZdKZjWrMp2nTqKJYg9VQcVS",
    "EB9HsKBjpvAcHEybPKzis06f8aSRKYLkdg2NT6M0SswcxxhIjv4YeQiHKI4kt2s48lgBLahYDpxU",
    "Kc+hrgrSO0oQ+NgZMX3zrhuQ0i8Wx+U7zO/h4SyGAN01Z40l/O0yH6kaEm2w9z22H+iBTTbnJTAh",
    "kIYwDu5Avm7awTqv8uwoLPHNRJhy2s3G2d/37ogE4WIACA7NFjer+fUUqi4ATvgYQQvZb5v6rStU",
    "Vi5/LDtqgqF8fKaPZl7nz4O56vziMdQQ8/Qi7HMUT5R4eY8eKepfIR4IN7j2mi3FNjTBl9x1sq3X",
    "4wSnwMkcGgDpLW/WjbxzUsCKtrospn17b/RHGnLpsjB91NMJnGWw0BfP/PL/RtKmQxF2K+Ud5clH",
    "L0sb3Zr9nSC2Qxpk42jzIVdo1ASPw86vo6tpozw0vh+EqA50y7fmsTmNaAA6m5yxCRx9UhUSprCD",
    "00BHm+Qi424wxPxvT/6fURQTV/HrJfeVTJK2PNA0eVkzIL64v+AK0ne8Q1x9/OFZAN5afUQRrBPy",
    "ZIRPXaLENtcj+vjRFI353RcdUkEi9RpCOf421QoQAdLqEoJaSNKUlQr3q3D38piJoWj54dbhvZI4",
    "RV8Z4upGdsXD8rSfcFMJP7gGOvNGyGrNCuPwqjTZcpg0I9GWjDIyOwCjnk/tvJfUSiYVlh0ONrju",
    "hkVXBG0rwNuRCkbOfB88OoGUIiaCbYO9Ey2WkVNsJgxE/r3u2sy9UqYRPhBCIGDrX1sNfLuArC+5",
    "+dJK61SAYGKF5RrwMEW3RILvOgzg5ZT6/S7Z641awu85UXGS+tvvFIgA/+P2tTQ0QPW7yNO1vfbP",
    "x7H5GD2idO9AvGs58shuAGR4UogT9Cd0FI/ONF754G1H/DhtsAPtbPZoAKwr/nMslJ4/FwwzuY8z",
    "NN4FGOEruUI/X6K0HulF8zhDu46wCpQ57v+a9C1sS2axHg/CGDLhdP+QlPI43VbceJGW0QQDCSE5",
    "stTMKqir6Jkc5+RDO1jBWVTovZwoxoH8rTNPJBagR9FMTTl6wfcdBM/nrhdx2TfcnAoOnQ4E1yTB",
    "UAxJ47zKmIlVhnPxw42PmTT3S+dpCrDBL4WXv8P90GJ1sa3zBPPzdwaqd1rn62c/tUChnFOW/YVT",
    "bu1SBTtuie+VmLZmNNCKP0TqBoYTOe8greRzLGF3ED25C8IM/fKZ2LFXgxskpqCrlz7lCQc/Q+0S",
    "4zbOFljyeABj92fc2V8Nqj6ao4Ny/rqS6dQi8Dg4YeJ5m16KYidZhHHA65UoDTTLqyXGO7xSpcpr",
    "k8ojbTWHQYc+SLnfDv0wuNG4EGg9vAkEMZRcka9s",
  ].join("")),
};

/* ------------------------------------------------------- generic helpers */
const _utf8Enc = new TextEncoder();
const _utf8Dec = new TextDecoder("utf-8", { ignoreBOM: true }); // як python decode('utf-8','replace')

class _ByteBuf {
  constructor(cap = 1024) { this.a = new Uint8Array(cap); this.n = 0; }
  _need(k) {
    if (this.n + k > this.a.length) {
      let c = this.a.length * 2;
      while (c < this.n + k) c *= 2;
      const b = new Uint8Array(c);
      b.set(this.a.subarray(0, this.n));
      this.a = b;
    }
  }
  u8(v) { this._need(1); this.a[this.n++] = v & 255; }
  u16(v) { this._need(2); this.a[this.n++] = v & 255; this.a[this.n++] = (v >>> 8) & 255; }
  u32(v) {
    this._need(4); v = v >>> 0;
    this.a[this.n++] = v & 255; this.a[this.n++] = (v >>> 8) & 255;
    this.a[this.n++] = (v >>> 16) & 255; this.a[this.n++] = (v >>> 24) & 255;
  }
  bytes(u) { this._need(u.length); this.a.set(u, this.n); this.n += u.length; }
  get length() { return this.n; }
  done() { return this.a.slice(0, this.n); }
}

function _concat(chunks) {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Uint8Array(n);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

const _CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** zlib.crc32(data) & 0xffffffff */
export function aionCrc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = _CRC_TABLE[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function _u8(v) {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  throw new TypeError("expected Uint8Array / ArrayBuffer");
}

/** Map | [[path, bytes], ...] | {path: bytes}  ->  Map<string, Uint8Array> */
function _toFileMap(files) {
  const m = new Map();
  if (files instanceof Map) { for (const [k, v] of files) m.set(k, _u8(v)); }
  else if (Array.isArray(files)) { for (const [k, v] of files) m.set(k, _u8(v)); }
  else { for (const k of Object.keys(files)) m.set(k, _u8(files[k])); }
  return m;
}

function _hex(u8, p, n) {
  return Array.from(u8.subarray(p, p + n), (b) => b.toString(16).padStart(2, "0")).join(" ");
}

/* -------------------------------------------- raw deflate (zlib wbits=-15) */
// За замовчуванням — нативні CompressionStream/DecompressionStream ('deflate-raw').
// Рівень стиснення браузер обирає сам (python використовував level=9), формат
// результату валідний і розпаковується грою так само. За потреби можна підставити
// pako/fflate через aionSetZlib().
async function _runStream(stream, data) {
  const writer = stream.writable.getWriter();
  writer.write(data).catch(() => {});
  writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks = [];
  let error = null;
  for (;;) {
    try {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    } catch (e) { error = e; break; }
  }
  return { data: _concat(chunks), error };
}

async function _nativeInflateRaw(u8) {
  if (u8.length === 0) return new Uint8Array(0);   // zlib.decompressobj(-15).decompress(b'') == b''
  const { data, error } = await _runStream(new DecompressionStream("deflate-raw"), u8);
  if (error) { const e = new Error("inflate failed: " + (error.message || error)); e.partial = data; throw e; }
  return data;
}

async function _nativeDeflateRaw(u8 /*, level */) {
  const { data, error } = await _runStream(new CompressionStream("deflate-raw"), u8);
  if (error) throw error;
  return data;
}

let _zlib = { inflateRaw: _nativeInflateRaw, deflateRaw: _nativeDeflateRaw };

/**
 * Підмінити реалізацію deflate (необов'язково).
 *   inflateRaw: async (Uint8Array) => Uint8Array   (кидає помилку, якщо потік битий;
 *                                                   error.partial = вже розпаковане)
 *   deflateRaw: async (Uint8Array, level) => Uint8Array
 */
export function aionSetZlib(impl) { _zlib = { ..._zlib, ...impl }; }

/* =========================================================================
   1. aionpak.py — читання / запис .pak
   ========================================================================= */
const SIG_LFH = [0xaf, 0xb4, 0xfc, 0xfb];
const SIG_CDH = [0xaf, 0xb4, 0xfe, 0xfd];
const SIG_EOCD = [0xaf, 0xb4, 0xfa, 0xf9];
const ZIP_SIGS = [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x01, 0x02], [0x50, 0x4b, 0x05, 0x06]];
const PAK_SIGS = [SIG_LFH, SIG_CDH, SIG_EOCD];

const LFH_SIZE = 30, CDH_SIZE = 46;
const DOS_DATE_2005_01_01 = 12833;
const DOS_TIME_ZERO = 0;

const _eq4 = (buf, p, sig) => buf[p] === sig[0] && buf[p + 1] === sig[1] && buf[p + 2] === sig[2] && buf[p + 3] === sig[3];
const _dv = (buf) => new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

/** Зсув у таблиці ключів. */
export function aionPakTblOff(version, csize) {
  return version === 1 ? (csize & 31) * 32 : csize & 1023;
}

/** XOR перших min(32, len) байтів ключем; симетрична (шифрує = розшифровує). Повертає копію. */
export function aionPakXorHead(data, version) {
  const n = Math.min(32, data.length);
  const off = aionPakTblOff(version, data.length);
  const t = AION_TABLES[version];
  const out = data.slice();
  for (let i = 0; i < n; i++) out[i] ^= t[off + i];
  return out;
}

/** Перевірка, чи підходить версія ключа до запису. */
export async function aionPakCheck(cdata, usize, crc, method, version) {
  const raw = aionPakXorHead(cdata, version);
  let out;
  if (method === 0) out = raw;
  else if (method === 8) {
    try { out = await _zlib.inflateRaw(raw); } catch (e) { console.log('inflate err:', e); return false; }
  } else throw new Error("unknown compression method " + method);
  return out.length === usize && aionCrc32(out) === (crc >>> 0);
}

/** Послідовний обхід файлу: [{name, method, crc, csize, usize, cdata}, ...] */
export function aionPakReadEntries(buf) {
  buf = _u8(buf);
  const dv = _dv(buf);
  let p = 0;
  const entries = [];
  while (p + 4 <= buf.length) {
    if (_eq4(buf, p, SIG_LFH)) {
      const method = dv.getUint16(p + 8, true);
      const crc = dv.getUint32(p + 14, true);
      const csize = dv.getUint32(p + 18, true);
      const usize = dv.getUint32(p + 22, true);
      const nameLen = dv.getUint16(p + 26, true);
      const extraLen = dv.getUint16(p + 28, true);
      const name = _utf8Dec.decode(buf.subarray(p + LFH_SIZE, p + LFH_SIZE + nameLen));
      const start = p + LFH_SIZE + nameLen + extraLen;
      const cdata = buf.subarray(start, start + csize);
      entries.push({ name, method, crc, csize, usize, cdata });
      p = start + csize;
    } else if (_eq4(buf, p, SIG_CDH)) {
      p += CDH_SIZE + dv.getUint16(p + 28, true) + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
    } else if (_eq4(buf, p, SIG_EOCD)) {
      break;
    } else {
      throw new Error(`Bad signature [${_hex(buf, p, 4)}] at ${p}`);
    }
  }
  return entries;
}

/** Визначає версію ключа (1 або 2) за першим непорожнім записом. */
export async function aionPakDetectVersion(entries) {
  for (const e of entries) {
    if (e.usize > 0) {
      for (const v of [1, 2]) {
        let r = await aionPakCheck(e.cdata, e.usize, e.crc, e.method, v); console.log('Checking v=', v, 'for', e.name, '->', r); if (r) return v;
      }
      throw new Error("Unknown AION version");
    }
  }
  return 1;
}

/**
 * Розпакувати .pak у пам'яті.
 * @returns {Promise<{version:number, bad:number, files:Map<string,Uint8Array>,
 *                    entries:{name:string, ok:boolean, size:number}[]}>}
 * opts.onLog(line) — ті самі рядки, що python друкував через print().
 */
export async function aionPakUnpack(buf, opts = {}) {
  const log = opts.onLog || (() => {});
  buf = _u8(buf);
  const entries = aionPakReadEntries(buf);
  const version = await aionPakDetectVersion(entries);
  log(`pak version ${version} | entries ${entries.length}`);
  const files = new Map();
  const list = [];
  let bad = 0;
  let _i = 0;
  for (const e of entries) {
    if (opts.onProgress) opts.onProgress({ phase: "unpack", current: _i, total: entries.length });
    if (_i++ % 500 === 0) await new Promise(r => setTimeout(r, 0));
    const raw = aionPakXorHead(e.cdata, version);
    let data, failed = false;
    if (e.method === 0) data = raw;
    else {
      try { data = await _zlib.inflateRaw(raw); }
      catch (err) { data = err && err.partial ? err.partial : new Uint8Array(0); failed = true; }
    }
    const ok = !failed && data.length === e.usize && aionCrc32(data) === (e.crc >>> 0);
    if (!ok) bad++;
    files.set(e.name.replace(/\\/g, "/"), data);
    list.push({ name: e.name, ok, size: data.length });
    log(`${ok ? "OK" : "BAD"}`.padEnd(4) + " " + e.name.padEnd(45) + " " + String(data.length).padStart(8));
  }
  return { version, bad, files, entries: list };
}

function _lowerKey(s) { return Array.from(s.toLowerCase(), (c) => c.codePointAt(0)); }
function _cmpKeys(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/**
 * Зібрати .pak з набору файлів.
 * @param files  Map | [[path, bytes]] | {path: bytes}
 * @param version 2 = актуальна гра, 1 = ранні версії
 * @returns {Promise<{data:Uint8Array, count:number}>}
 */
export async function aionPakPack(files, version = 2, level = 9) {
  const list = [..._toFileMap(files)].map(([rel, data]) => ({ rel, data, key: _lowerKey(rel) }));
  list.sort((a, b) => _cmpKeys(a.key, b.key));   // як files.sort(key=lambda x: x[0].lower())

  const body = new _ByteBuf(1 << 16), cd = new _ByteBuf(1 << 12);
  for (const { rel, data } of list) {
    const name = _utf8Enc.encode(rel);
    const comp = await _zlib.deflateRaw(data, level);
    const crc = aionCrc32(data);
    const offset = body.length;
    const enc = aionPakXorHead(comp, version);

    body.bytes(Uint8Array.from(SIG_LFH));
    body.u8(20); body.u8(0);
    body.u16(0); body.u16(8); body.u16(DOS_TIME_ZERO); body.u16(DOS_DATE_2005_01_01);
    body.u32(crc); body.u32(comp.length); body.u32(data.length);
    body.u16(name.length); body.u16(0);
    body.bytes(name); body.bytes(enc);

    cd.bytes(Uint8Array.from(SIG_CDH));
    cd.u8(20); cd.u8(0); cd.u8(20); cd.u8(0);
    cd.u16(0); cd.u16(8); cd.u16(DOS_TIME_ZERO); cd.u16(DOS_DATE_2005_01_01);
    cd.u32(crc); cd.u32(comp.length); cd.u32(data.length);
    cd.u16(name.length); cd.u16(0); cd.u16(0); cd.u16(0); cd.u16(0);
    cd.u32(32); cd.u32(offset);
    cd.bytes(name);
  }
  const out = new _ByteBuf(body.length + cd.length + 22);
  out.bytes(body.done()); out.bytes(cd.done());
  out.bytes(Uint8Array.from(SIG_EOCD));
  out.u16(0); out.u16(0); out.u16(list.length); out.u16(list.length);
  out.u32(cd.length); out.u32(body.length); out.u16(0);
  return { data: out.done(), count: list.length };
}

/* ------------------------------------------------- pak <-> zip transforms */
function _walkConvert(buf, sigFrom, sigTo, version) {
  buf = _u8(buf);
  const dv = _dv(buf);
  const out = new _ByteBuf(buf.length + 64);
  let p = 0;
  while (p + 4 <= buf.length) {
    if (_eq4(buf, p, sigFrom[0])) {
      const flags = dv.getUint16(p + 6, true);
      const csize = dv.getUint32(p + 18, true);
      const nameLen = dv.getUint16(p + 26, true);
      const extraLen = dv.getUint16(p + 28, true);
      if (flags & 8) throw new Error("zip data descriptors are not supported (same as AIONencdec)");
      const hdrEnd = p + LFH_SIZE + nameLen + extraLen;
      out.bytes(Uint8Array.from(sigTo[0]));
      out.bytes(buf.subarray(p + 4, hdrEnd));
      out.bytes(aionPakXorHead(buf.subarray(hdrEnd, hdrEnd + csize), version));
      p = hdrEnd + csize;
    } else if (_eq4(buf, p, sigFrom[1])) {
      const n = CDH_SIZE + dv.getUint16(p + 28, true) + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
      out.bytes(Uint8Array.from(sigTo[1]));
      out.bytes(buf.subarray(p + 4, p + n));
      p += n;
    } else if (_eq4(buf, p, sigFrom[2])) {
      out.bytes(Uint8Array.from(sigTo[2]));
      out.bytes(buf.subarray(p + 4));
      break;
    } else {
      throw new Error(`Bad signature [${_hex(buf, p, 4)}] at ${p}`);
    }
  }
  return out.done();
}

/** .pak -> звичайний .zip (версію ключа визначає автоматично, якщо не задана). */
export async function aionPakToZip(buf, version = null) {
  buf = _u8(buf);
  version = version || (await aionPakDetectVersion(aionPakReadEntries(buf)));
  return _walkConvert(buf, PAK_SIGS, ZIP_SIGS, version);
}

/** звичайний .zip -> .pak */
export function aionZipToPak(buf, version = 2) {
  return _walkConvert(buf, ZIP_SIGS, PAK_SIGS, version);
}

/* =========================================================================
   2. bxml.py — бінарний XML Aion
   ========================================================================= */
export function aionBxmlRdVarint(b, p) {
  let r = 0, s = 0;
  for (;;) {
    if (p >= b.length) throw new Error("unexpected end of data while reading varint");
    const x = b[p++];
    if (x < 128) return [r + x * 2 ** s, p];
    r += (x & 127) * 2 ** s; s += 7;
  }
}

export function aionBxmlWrVarint(n) {
  const out = [];
  while (n >= 128) { out.push((n % 128) | 128); n = Math.floor(n / 128); }
  out.push(n);
  return out;
}

export class AionBxmlNode {
  constructor() { this.name = ""; this.value = null; this.attrs = []; this.children = []; }
}

const _utf16Dec = new TextDecoder("utf-16le", { fatal: true, ignoreBOM: true });

/** Бінарний XML -> дерево. Повертає {root, end, table}. */
export function aionBxmlDecode(buf) {
  buf = _u8(buf);
  if (buf[0] !== 0x80) throw new Error("not binary xml");
  let [n, p] = aionBxmlRdVarint(buf, 1);
  if (p + n > buf.length) throw new Error("string table runs past end of file");
  const table = buf.subarray(p, p + n); p += n;

  const cache = new Map();
  const S = (i) => {
    if (i === 0) return "";
    if (cache.has(i)) return cache.get(i);
    const off = 2 * i;
    if (off >= table.length) throw new Error(`string offset ${i} is outside the string table`);
    let e = off;
    while (!(table[e] === 0 && table[e + 1] === 0)) {
      e += 2;
      if (e + 2 > table.length) throw new Error("unterminated string in table");
    }
    const s = _utf16Dec.decode(table.subarray(off, e));
    cache.set(i, s);
    return s;
  };

  const rd = (p) => {
    const nd = new AionBxmlNode();
    let i;
    [i, p] = aionBxmlRdVarint(buf, p); nd.name = S(i);
    if (p >= buf.length) throw new Error("unexpected end of data");
    const fl = buf[p]; p += 1;
    if (fl & 1) { [i, p] = aionBxmlRdVarint(buf, p); nd.value = S(i); }
    if (fl & 2) {
      let c; [c, p] = aionBxmlRdVarint(buf, p);
      for (let j = 0; j < c; j++) {
        let k, v;
        [k, p] = aionBxmlRdVarint(buf, p); [v, p] = aionBxmlRdVarint(buf, p);
        nd.attrs.push([S(k), S(v)]);
      }
    }
    if (fl & 4) {
      let c; [c, p] = aionBxmlRdVarint(buf, p);
      for (let j = 0; j < c; j++) { let ch; [ch, p] = rd(p); nd.children.push(ch); }
    }
    if (fl & ~7) throw new Error("unknown flags " + fl.toString(16));
    return [nd, p];
  };
  const [root, end] = rd(p);
  return { root, end, table };
}

/** Дерево -> бінарний XML. Таблиця рядків = унікальні рядки в порядку першого використання.
 * baseTable (необов'язково) — таблиця рядків оригінального файлу (aionBxmlDecode().table):
 * тоді всі її рядки (навіть ті, на які ніщо не посилається) лишаються на своїх місцях,
 * а нові дописуються в кінець — незмінений файл кодується побайтово ідентично оригіналу.
 */
export function aionBxmlEncode(root, baseTable = null) {
  const index = new Map([["", 0]]);
  const table = new _ByteBuf(1024);
  if (baseTable && baseTable.length >= 2) {
    table.bytes(_u8(baseTable));
    let start = 0;
    for (let i = 0; i + 1 < baseTable.length; i += 2) {
      if (baseTable[i] === 0 && baseTable[i + 1] === 0) {
        const s = _utf16Dec.decode(baseTable.subarray(start, i));
        if (!index.has(s)) index.set(s, start / 2);
        start = i + 2;
      }
    }
  } else {
    table.u16(0);                                  // індекс 0 = порожній рядок
  }
  const I = (s) => {
    let ix = index.get(s);
    if (ix === undefined) {
      ix = table.length / 2;
      index.set(s, ix);
      for (let i = 0; i < s.length; i++) table.u16(s.charCodeAt(i));
      table.u16(0);
    }
    return ix;
  };
  const body = new _ByteBuf(4096);
  const vi = (n) => { for (const b of aionBxmlWrVarint(n)) body.u8(b); };
  const wr = (n) => {
    vi(I(n.name));
    const fl = (n.value !== null && n.value !== undefined ? 1 : 0) | (n.attrs.length ? 2 : 0) | (n.children.length ? 4 : 0);
    body.u8(fl);
    if (fl & 1) vi(I(n.value));
    if (fl & 2) {
      vi(n.attrs.length);
      for (const [k, v] of n.attrs) { vi(I(k)); vi(I(v)); }
    }
    if (fl & 4) {
      vi(n.children.length);
      for (const c of n.children) wr(c);
    }
  };
  wr(root);
  const tb = table.done();
  const out = new _ByteBuf(tb.length + body.length + 16);
  out.u8(0x80);
  for (const b of aionBxmlWrVarint(tb.length)) out.u8(b);
  out.bytes(tb); out.bytes(body.done());
  return out.done();
}

/* ------------------------------------------------------- text XML layer */
const _escText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
const _escAttr = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
   .replace(/\n/g, "&#xA;").replace(/\r/g, "&#xD;").replace(/\t/g, "&#x9;");

function _encodeUtf16LE(str, withBom) {
  const out = new Uint8Array((str.length + (withBom ? 1 : 0)) * 2);
  let p = 0;
  if (withBom) { out[p++] = 0xff; out[p++] = 0xfe; }
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    out[p++] = c & 255; out[p++] = c >>> 8;
  }
  return out;
}

/**
 * Дерево -> текстовий XML (формат xml.exe: відступ 2 пробіли, '<a />' для порожніх).
 * encoding: 'utf-16' (завжди UTF-16 LE + BOM) або 'utf-8'. Повертає Uint8Array.
 */
export function aionBxmlToXml(root, encoding = "utf-16") {
  if (encoding !== "utf-16" && encoding !== "utf-8") throw new Error("KeyError: " + encoding);
  const out = [];
  const wr = (n, depth) => {
    const pad = "  ".repeat(depth);
    const attrs = n.attrs.map(([k, v]) => ` ${k}="${_escAttr(v)}"`).join("");
    const hasValue = n.value !== null && n.value !== undefined;
    if (!n.children.length) {
      out.push(hasValue ? `${pad}<${n.name}${attrs}>${_escText(n.value)}</${n.name}>` : `${pad}<${n.name}${attrs} />`);
      return;
    }
    out.push(`${pad}<${n.name}${attrs}>`);
    for (const c of n.children) wr(c, depth + 1);
    if (hasValue) out[out.length - 1] += _escText(n.value);   // xml.exe пише value після дітей
    out.push(`${pad}</${n.name}>`);
  };
  wr(root, 0);
  const text = `<?xml version="1.0" encoding="${encoding}"?>\r\n` + out.join("\r\n");
  return encoding === "utf-16" ? _encodeUtf16LE(text, true) : _utf8Enc.encode(text);
}

/** Байти XML (BOM / оголошена кодировка) -> рядок. */
function _xmlBytesToText(data) {
  data = _u8(data);
  const dec = (label, bytes) => new TextDecoder(label, { fatal: true, ignoreBOM: true }).decode(bytes);
  if (data[0] === 0xff && data[1] === 0xfe) return dec("utf-16le", data.subarray(2));
  if (data[0] === 0xfe && data[1] === 0xff) return dec("utf-16be", data.subarray(2));
  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) return dec("utf-8", data.subarray(3));
  let gt = data.indexOf(0x3e);
  gt = gt < 0 ? data.length : gt + 1;
  let head = "";
  for (let i = 0; i < gt; i++) head += String.fromCharCode(data[i]);
  const m = /^<\?xml[^>]*encoding=["']([A-Za-z0-9._-]+)["']/.exec(head);
  return dec(m ? m[1] : "utf-8", data);
}

// python str.strip() — whitespace за правилами Python (не JS trim: там є \uFEFF, а \x1c-\x1f, \x85 немає)
const _PY_WS_SET = new Set([9, 10, 11, 12, 13, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000]);
for (let c = 0x2000; c <= 0x200a; c++) _PY_WS_SET.add(c);
function _pyStrip(s) {
  let a = 0, b = s.length;
  while (a < b && _PY_WS_SET.has(s.charCodeAt(a))) a++;
  while (b > a && _PY_WS_SET.has(s.charCodeAt(b - 1))) b--;
  return s.slice(a, b);
}

const _NAME_RE = /[A-Za-z_:\u00C0-\uFFFF][A-Za-z0-9_:.\-\u00B7\u00C0-\uFFFF]*/y;
const _BAD_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/;
const _NAMED_ENT = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/**
 * Власний XML-парсер (замінює expat у python). Поведінка, важлива для bxml:
 *  - '<a/>' -> value null, '<a></a>' -> value ''
 *  - текст поруч з дітьми: value = trim(текст) або null (форматування відкидається)
 *  - атрибути зберігають порядок, \t \n в значеннях нормалізуються в пробіл, &#xA; зберігається
 *  - \r\n і \r у вхідному тексті нормалізуються в \n
 */
function _parseXmlText(src) {
  const s = src.replace(/\r\n?/g, "\n");
  const len = s.length;
  let i = 0, root = null;
  const stack = [];
  const fail = (msg) => { throw new Error(`XML parse error: ${msg} (at offset ${i})`); };

  const expand = (raw) =>
    raw.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z_:][A-Za-z0-9_:.\-]*);|&/g, (m, body) => {
      if (body === undefined) fail("not well-formed (invalid token): bare '&'");
      if (body[0] === "#") {
        const cp = body[1] === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        const ok = cp === 9 || cp === 10 || cp === 13 || (cp >= 0x20 && cp <= 0xd7ff) ||
                   (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);
        if (!ok) fail("reference to invalid character number");
        return String.fromCodePoint(cp);
      }
      if (!(body in _NAMED_ENT)) fail(`undefined entity &${body};`);
      return _NAMED_ENT[body];
    });

  const readName = () => {
    _NAME_RE.lastIndex = i;
    const m = _NAME_RE.exec(s);
    if (!m) fail("not well-formed (invalid token)");
    i += m[0].length;
    return m[0];
  };
  const skipWs = () => {
    const st = i;
    while (i < len && (s[i] === " " || s[i] === "\t" || s[i] === "\n")) i++;
    return i > st;
  };
  const finish = (fr, selfClosing) => {
    const n = fr.node, text = fr.text.join("");
    if (n.children.length) n.value = _pyStrip(text) || null;
    else if (!text && selfClosing) n.value = null;
    else n.value = text;
  };

  while (i < len) {
    if (s[i] !== "<") {
      let j = s.indexOf("<", i);
      if (j < 0) j = len;
      const raw = s.slice(i, j);
      if (!stack.length) {
        if (/[^ \t\n]/.test(raw)) fail(root ? "junk after document element" : "syntax error");
      } else {
        if (raw.includes("]]>")) fail("not well-formed: ']]>' in character data");
        if (_BAD_CHARS.test(raw)) fail("not well-formed (invalid token)");
        stack[stack.length - 1].text.push(expand(raw));
      }
      i = j;
      continue;
    }
    if (s.startsWith("<?", i)) {
      const j = s.indexOf("?>", i + 2);
      if (j < 0) fail("unclosed token");
      const target = /^[^\s]*/.exec(s.slice(i + 2, j))[0];
      if (!target) fail("not well-formed (invalid token)");
      if (target.toLowerCase() === "xml" && (target !== "xml" || i !== 0)) fail("XML or text declaration not at start of entity");
      i = j + 2;
      continue;
    }
    if (s.startsWith("<!--", i)) {
      const j = s.indexOf("-->", i + 4);
      if (j < 0) fail("unclosed token");
      const body = s.slice(i + 4, j);
      if (body.includes("--") || body.endsWith("-")) fail("not well-formed (invalid token): '--' in comment");
      i = j + 3;
      continue;
    }
    if (s.startsWith("<![CDATA[", i)) {
      if (!stack.length) fail("syntax error: CDATA outside root");
      const j = s.indexOf("]]>", i + 9);
      if (j < 0) fail("unclosed CDATA section");
      const raw = s.slice(i + 9, j);
      if (_BAD_CHARS.test(raw)) fail("not well-formed (invalid token)");
      stack[stack.length - 1].text.push(raw);
      i = j + 3;
      continue;
    }
    if (s.startsWith("<!DOCTYPE", i)) {
      if (root || stack.length) fail("syntax error: DOCTYPE not allowed here");
      let depth = 0, q = null;
      i += 9;
      for (; i < len; i++) {
        const c = s[i];
        if (q) { if (c === q) q = null; }
        else if (c === '"' || c === "'") q = c;
        else if (c === "[") depth++;
        else if (c === "]") depth--;
        else if (c === ">" && depth <= 0) break;
      }
      if (i >= len) fail("unclosed token");
      i++;
      continue;
    }
    if (s.startsWith("</", i)) {
      if (!stack.length) fail("junk after document element");
      i += 2;
      const name = readName();
      skipWs();
      if (s[i] !== ">") fail("not well-formed (invalid token)");
      i++;
      const fr = stack.pop();
      if (fr.node.name !== name) fail(`mismatched tag </${name}> (expected </${fr.node.name}>)`);
      finish(fr, false);
      continue;
    }
    // start tag
    i++;
    const node = new AionBxmlNode();
    node.name = readName();
    const seen = new Set();
    let selfClosing = false;
    for (;;) {
      const hadWs = skipWs();
      if (s[i] === ">") { i++; break; }
      if (s.startsWith("/>", i)) { selfClosing = true; i += 2; break; }
      if (i >= len) fail("unclosed token");
      if (!hadWs) fail("not well-formed (invalid token): no whitespace before attribute");
      const k = readName();
      skipWs();
      if (s[i] !== "=") fail("not well-formed (invalid token): attribute without '='");
      i++; skipWs();
      const q = s[i];
      if (q !== '"' && q !== "'") fail("not well-formed (invalid token): unquoted attribute value");
      const j = s.indexOf(q, i + 1);
      if (j < 0) fail("unclosed token");
      const raw = s.slice(i + 1, j);
      if (raw.includes("<")) fail("not well-formed (invalid token): '<' in attribute value");
      if (_BAD_CHARS.test(raw)) fail("not well-formed (invalid token)");
      if (seen.has(k)) fail("duplicate attribute");
      seen.add(k);
      node.attrs.push([k, expand(raw.replace(/[\t\n]/g, " "))]);
      i = j + 1;
    }
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else if (root) fail("junk after document element");
    else root = node;
    const fr = { node, text: [] };
    if (selfClosing) finish(fr, true);
    else stack.push(fr);
  }
  if (stack.length) fail("no element found / unclosed token");
  if (!root) fail("no element found");
  return root;
}

/** Текстовий XML (байти: UTF-16/UTF-8 з BOM або без) -> дерево. */
export function aionBxmlFromXml(data) {
  return _parseXmlText(_xmlBytesToText(data));
}

export function aionBxmlSameTree(a, b) {
  if (a.name !== b.name || a.value !== b.value || a.attrs.length !== b.attrs.length ||
      a.children.length !== b.children.length) return false;
  for (let i = 0; i < a.attrs.length; i++)
    if (a.attrs[i][0] !== b.attrs[i][0] || a.attrs[i][1] !== b.attrs[i][1]) return false;
  return a.children.every((x, i) => aionBxmlSameTree(x, b.children[i]));
}

/**
 * Бінарний xml -> текстовий (завжди UTF-16 LE + BOM). Файли, що не є бінарним xml,
 * повертаються без змін. @returns {{data:Uint8Array, decoded:boolean, table?:Uint8Array}}
 */
export function aionBxmlDecodeFile(data) {
  data = _u8(data);
  if (data[0] !== 0x80) return { data, decoded: false };
  const { root, end, table } = aionBxmlDecode(data);
  if (end !== data.length) throw new Error("trailing data after root node");
  return { data: aionBxmlToXml(root, "utf-16"), decoded: true, table };
}

/** Текстовий xml -> бінарний. Вже бінарні повертає без змін. @returns {{data, encoded}} */
export function aionBxmlEncodeFile(data, baseTable = null) {
  data = _u8(data);
  if (data[0] === 0x80) return { data, encoded: false };
  return { data: aionBxmlEncode(aionBxmlFromXml(data), baseTable), encoded: true };
}

/* =========================================================================
   3. aionhtml.py — шифрований .html ("htmlblob")
   ========================================================================= */
const HTML_TAG = 0x81;

/** Ім'я файлу без каталогу й без останнього розширення — як bytes (UTF-8). */
export function aionHtmlBaseName(pathOrName) {
  let n = pathOrName.split(/[\\/]/).pop();
  const dot = n.lastIndexOf(".");
  if (dot >= 0) n = n.slice(0, dot);
  return _utf8Enc.encode(n);
}

export function aionHtmlKeystream(name, length) {
  let s = 0, x = 0;
  for (let i = 0; i < name.length; i++) {
    const v = (name[i] & 0xf) + i;
    s += v; x ^= v;
  }
  s = s >>> 0; x = x >>> 0;
  const out = new Uint8Array(length);
  for (let j = 0; j < length; j++) {
    s = ((s + 0x1d) ^ x) >>> 0;
    x = (x + 3) >>> 0;
    out[j] = s & 255;
  }
  return out;
}

function _htmlXor(data, name) {
  const ks = aionHtmlKeystream(name, data.length);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ ks[i];
  return out;
}

export function aionHtmlIsEncrypted(data, name) {
  data = _u8(data);
  if (data.length < 3 || data[0] !== HTML_TAG) return false;
  return (data[1] ^ aionHtmlKeystream(aionHtmlBaseName(name), 1)[0]) === HTML_TAG;
}

/** Зашифровані байти -> UTF-16LE текст (з BOM). */
export function aionHtmlDecrypt(data, name) {
  data = _u8(data);
  if (!aionHtmlIsEncrypted(data, name))
    throw new Error(`not an AION html blob for the name '${name}' (wrong file name?)`);
  return _htmlXor(data.subarray(1), aionHtmlBaseName(name)).subarray(1);
}

/** UTF-16LE текст (з BOM) -> зашифровані байти. */
export function aionHtmlEncrypt(textUtf16, name) {
  const withTag = new Uint8Array(textUtf16.length + 1);
  withTag[0] = HTML_TAG; withTag.set(textUtf16, 1);
  const enc = _htmlXor(withTag, aionHtmlBaseName(name));
  const out = new Uint8Array(enc.length + 1);
  out[0] = HTML_TAG; out.set(enc, 1);
  return out;
}

const _HTML_DECL = /^(<\?xml[^>]*?encoding=")([^"]*)(")/i;

function _htmlToText(data) {
  const dec = (label, bytes) => new TextDecoder(label, { fatal: true, ignoreBOM: true }).decode(bytes);
  if (data[0] === 0xff && data[1] === 0xfe) return dec("utf-16le", data.subarray(2));
  if (data[0] === 0xfe && data[1] === 0xff) return dec("utf-16be", data.subarray(2));
  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) return dec("utf-8", data.subarray(3));
  return dec("utf-8", data);
}

/**
 * Зашифрований html -> читабельний XML (UTF-16 LE + BOM). `name` — ім'я файлу в грі
 * (від нього залежить ключ). Не зашифровані файли повертає без змін.
 * @returns {{data:Uint8Array, decoded:boolean}}
 */
export function aionHtmlDecodeFile(data, name) {
  data = _u8(data);
  if (!aionHtmlIsEncrypted(data, name)) return { data, decoded: false };
  return { data: aionHtmlDecrypt(data, name), decoded: true };
}

/**
 * Читабельний XML (UTF-8 / UTF-16) -> зашифрований html. Вже зашифровані повертає без змін.
 * @returns {{data:Uint8Array, encoded:boolean}}
 */
export function aionHtmlEncodeFile(data, name) {
  data = _u8(data);
  if (aionHtmlIsEncrypted(data, name)) return { data, encoded: false };
  let textBytes = data;
  try {
    const text = _htmlToText(data).replace(_HTML_DECL, (m, a, b, c) => a + "UTF-16" + c);
    textBytes = _encodeUtf16LE(text, true);
  } catch (e) {
    // Якщо файл пошкоджений (не валідний текст), просто шифруємо сирі байти
  }
  return { data: aionHtmlEncrypt(textBytes, name), encoded: true };
}

/* =========================================================================
   4. aiontool.py — повний workflow: .pak <-> папка з розкодованими .xml/.html
   ========================================================================= */
export const AION_MANIFEST = ".aion_manifest.json";

function _kind(name) {
  const n = name.toLowerCase();
  return n.endsWith(".xml") ? "xml" : n.endsWith(".html") ? "html" : null;
}

/**
 * .pak -> файли, кожен закодований .xml/.html розкодовано (UTF-16 LE + BOM).
 * У `files` додається .aion_manifest.json зі списком реально розкодованих файлів.
 * Якщо CRC якогось запису не збігся — кидає Error('some entries failed their CRC check, stopping')
 * з полем error.result (частково розпаковане).
 * @returns {Promise<{version:number, files:Map<string,Uint8Array>, decoded:Object<string,string>, entries:Array}>}
 */
export async function aionToolUnpack(pak, opts = {}) {
  const log = opts.onLog || (() => {});
  const kind = aionDetectPakKind(pak);
  const r = kind === "rift" ? await aionRiftUnpack(pak, opts) : await aionPakUnpack(pak, opts);
  if (r.bad) {
    const e = new Error("some entries failed their CRC check, stopping");
    e.result = r;
    throw e;
  }
  const decoded = {};
  let _d = 0;
  for (const [rel, data] of r.files) {
    if (opts.onProgress) opts.onProgress({ phase: "decode", current: _d++, total: r.files.size });
    if (_d % 500 === 0) await new Promise(r => setTimeout(r, 0));
    const k = _kind(rel);
    if (k === null) continue;
    const res = k === "xml" ? aionBxmlDecodeFile(data) : aionHtmlDecodeFile(data, rel);
    r.files.set(rel, res.data);
    if (res.table) r.files.set(rel + "?table", res.table);
    if (res.decoded) decoded[rel] = k;
  }
  const total = r.files.size;
  const json = JSON.stringify({ kind, version: r.version, decoded }, null, 1).replace(/[\u0080-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  r.files.set(AION_MANIFEST, _utf8Enc.encode(json));
  log(`decoded ${Object.keys(decoded).length} of ${total} files (UTF-16 LE + BOM)`);
  return { version: r.version, kind, files: r.files, decoded, entries: r.entries };
}

/**
 * Файли (Map | [[path, bytes]] | object) -> .pak. Кодує текстові .xml/.html
 * (усі, або лише з маніфесту, якщо .aion_manifest.json є серед файлів). Маніфест у .pak не потрапляє.
 * @returns {Promise<{data:Uint8Array, encoded:number, packed:number}>}
 */
export async function aionToolPack(files, version = 2, opts = {}) {
  const log = opts.onLog || (() => {});
  const src = _toFileMap(files);
  const mdata = src.get(AION_MANIFEST);
  const m = mdata ? JSON.parse(_utf8Dec.decode(mdata)) : { kind: "std", decoded: {} };
  const only = mdata ? new Set(Object.keys(m.decoded)) : null;

  const stage = new Map();
  let encoded = 0;
  for (const [rel, data] of src) {
    if (rel === AION_MANIFEST || rel.endsWith("?table")) continue;
    const k = _kind(rel);
    if (k && (only === null || only.has(rel))) {
      const res = k === "xml" ? aionBxmlEncodeFile(data, src.get(rel + "?table")) : aionHtmlEncodeFile(data, rel.split("/").pop());
      encoded += res.encoded ? 1 : 0;
      stage.set(rel, res.data);
    } else {
      stage.set(rel, data);
    }
  }
  const { data, count } = m.kind === "rift" ? await aionRiftPack(stage, 9) : await aionPakPack(stage, version);
  log(`encoded ${encoded} files, packed ${count} files` + (opts.pakName ? ` -> ${opts.pakName}` : ""));
  return { data, encoded, packed: count };
}

/* =========================================================================
   5. riftshade_pak.py — оверлей ~~riftshade.pak (ZIP з підміненими сигнатурами
      + часткове шифрування ChaCha20-IETF)
      локальний заголовок 50 4B 03 04 | каталог 02 00 0D A1 | EOCD AF B4 FA F9
      шифруються лише перші min(csize, 4096) байтів стиснених даних;
      nonce = pack('<III', local_header_offset, crc32, compressed_size)
   ========================================================================= */
const RIFT_KEY = Uint8Array.from(
  "f7a2ff4e2af9be10bbd01237b847dc3cebafd2f77d0ba619da8a39d7f85e8ce3".match(/../g), (h) => parseInt(h, 16));
const RIFT_ENC_LIMIT = 4096;
const RIFT_SIG_LOCAL = [0x50, 0x4b, 0x03, 0x04];
const RIFT_SIG_CENTRAL = [0x02, 0x00, 0x0d, 0xa1];
const RIFT_SIG_EOCD = [0xaf, 0xb4, 0xfa, 0xf9];

const _rotl = (v, n) => ((v << n) | (v >>> (32 - n))) >>> 0;

function _chachaBlock(keyW, counter, nonceW, out, outPos) {
  const st = new Uint32Array(16);
  st[0] = 0x61707865; st[1] = 0x3320646e; st[2] = 0x79622d32; st[3] = 0x6b206574;
  for (let i = 0; i < 8; i++) st[4 + i] = keyW[i];
  st[12] = counter >>> 0;
  st[13] = nonceW[0]; st[14] = nonceW[1]; st[15] = nonceW[2];
  const w = Uint32Array.from(st);
  const qr = (a, b, c, d) => {
    w[a] = (w[a] + w[b]) >>> 0; w[d] = _rotl(w[d] ^ w[a], 16);
    w[c] = (w[c] + w[d]) >>> 0; w[b] = _rotl(w[b] ^ w[c], 12);
    w[a] = (w[a] + w[b]) >>> 0; w[d] = _rotl(w[d] ^ w[a], 8);
    w[c] = (w[c] + w[d]) >>> 0; w[b] = _rotl(w[b] ^ w[c], 7);
  };
  for (let r = 0; r < 10; r++) {
    qr(0, 4, 8, 12); qr(1, 5, 9, 13); qr(2, 6, 10, 14); qr(3, 7, 11, 15);
    qr(0, 5, 10, 15); qr(1, 6, 11, 12); qr(2, 7, 8, 13); qr(3, 4, 9, 14);
  }
  for (let i = 0; i < 16; i++) {
    const v = (w[i] + st[i]) >>> 0;
    out[outPos + i * 4] = v & 255; out[outPos + i * 4 + 1] = (v >>> 8) & 255;
    out[outPos + i * 4 + 2] = (v >>> 16) & 255; out[outPos + i * 4 + 3] = (v >>> 24) & 255;
  }
}

/** ChaCha20-IETF (RFC 8439): XOR даних із гамою; шифрування = розшифрування. Повертає копію. */
export function aionChaCha20(data, key, nonce, counter = 0) {
  data = _u8(data);
  const kd = _dv(key), nd = _dv(nonce);
  const keyW = Uint32Array.from({ length: 8 }, (_, i) => kd.getUint32(i * 4, true));
  const nonceW = Uint32Array.from({ length: 3 }, (_, i) => nd.getUint32(i * 4, true));
  const out = data.slice(), ks = new Uint8Array(64);
  for (let pos = 0; pos < out.length; pos += 64) {
    _chachaBlock(keyW, counter + pos / 64, nonceW, ks, 0);
    const n = Math.min(64, out.length - pos);
    for (let i = 0; i < n; i++) out[pos + i] ^= ks[i];
  }
  return out;
}

/** Самоперевірка на тестовому векторі RFC 8439 §2.4.2. */
export function aionChaChaSelfTest() {
  const key = Uint8Array.from({ length: 32 }, (_, i) => i);
  const nonce = Uint8Array.from("000000000000004a00000000".match(/../g), (h) => parseInt(h, 16));
  const plain = _utf8Enc.encode("Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.");
  const expect = "6e2e359a2568f98041ba0728dd0d6981e97e7aec1d4360c20a27afccfd9fae0bf91b65c5524733ab8f593dabcd62b3571639d624e65152ab8f530c359f0861d807ca0dbf500d6a6156a38e088a22b65e52bc514d16ccf806818ce91ab77937365af90bbf74a35be6b40b8eedf2785e42874d";
  const got = Array.from(aionChaCha20(plain, key, nonce, 1), (b) => b.toString(16).padStart(2, "0")).join("");
  return got === expect;
}

function _riftNonce(lho, crc, csize) {
  const n = new Uint8Array(12), dv = _dv(n);
  dv.setUint32(0, lho >>> 0, true); dv.setUint32(4, crc >>> 0, true); dv.setUint32(8, csize >>> 0, true);
  return n;
}

function _riftCrypt(blob, lho, crc, csize) {
  const out = blob.slice(), n = Math.min(csize, RIFT_ENC_LIMIT);
  out.set(aionChaCha20(out.subarray(0, n), RIFT_KEY, _riftNonce(lho, crc, csize)), 0);
  return out;
}

/** true, якщо це оверлей Riftshade (локальний заголовок PK + EOCD AF B4 FA F9). */
export function aionIsRiftPak(buf) {
  buf = _u8(buf);
  if (buf.length < 26 || !_eq4(buf, 0, RIFT_SIG_LOCAL)) return false;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (_eq4(buf, i, RIFT_SIG_EOCD)) return true;
  return false;
}

/** true, якщо це звичайний AION .pak (сигнатури AF B4 FC FB). */
export function aionIsStdPak(buf) {
  buf = _u8(buf);
  return buf.length >= 4 && _eq4(buf, 0, SIG_LFH);
}

/** Записи каталогу оверлея: [{name, method, crc, csize, usize, lho, dataOff}] у порядку каталогу. */
export function aionRiftReadEntries(buf) {
  buf = _u8(buf);
  const dv = _dv(buf);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (_eq4(buf, i, RIFT_SIG_EOCD)) { eocd = i; break; }
  if (eocd < 0) throw new Error("EOCD із сигнатурою AF B4 FA F9 не знайдено");
  const total = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
  const out = [];
  let off = cdOff;
  for (let k = 0; k < total; k++) {
    if (!_eq4(buf, off, RIFT_SIG_CENTRAL)) throw new Error(`очікував підпис каталогу 02 00 0D A1 на ${off}`);
    const method = dv.getUint16(off + 10, true), crc = dv.getUint32(off + 16, true);
    const csize = dv.getUint32(off + 20, true), usize = dv.getUint32(off + 24, true);
    const nlen = dv.getUint16(off + 28, true), elen = dv.getUint16(off + 30, true), cmlen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = _utf8Dec.decode(buf.subarray(off + 46, off + 46 + nlen));
    if (!_eq4(buf, lho, RIFT_SIG_LOCAL)) throw new Error(`${name}: локальний заголовок не PK\\x03\\x04`);
    const dataOff = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    out.push({ name, method, crc, csize, usize, lho, dataOff });
    off += 46 + nlen + elen + cmlen;
  }
  return out;
}

/**
 * Розпакувати оверлей Riftshade.
 * @returns {Promise<{files:Map<string,Uint8Array>, bad:number, entries:{name,ok,size,error?}[]}>}
 * Розмір і CRC звіряються з каталогом; запис, що не пройшов перевірку, позначається ok:false.
 */
export async function aionRiftUnpack(buf, opts = {}) {
  const log = opts.onLog || (() => {});
  buf = _u8(buf);
  const files = new Map(), list = [];
  let bad = 0;
  for (const e of aionRiftReadEntries(buf)) {
    let data = new Uint8Array(0), ok = false, error;
    try {
      const blob = _riftCrypt(buf.subarray(e.dataOff, e.dataOff + e.csize), e.lho, e.crc, e.csize);
      if (e.method === 8) data = await _zlib.inflateRaw(blob);
      else if (e.method === 0) data = blob;
      else throw new Error("невідомий метод стиснення " + e.method);
      ok = data.length === e.usize && aionCrc32(data) === (e.crc >>> 0);
      if (!ok) error = `розмір/CRC не збігаються (${data.length} / ${e.usize})`;
    } catch (err) { error = err.message || String(err); }
    if (!ok) bad++;
    files.set(e.name.replace(/\\/g, "/"), data);
    list.push({ name: e.name, ok, size: data.length, error });
    log(`${ok ? "OK" : "BAD"}`.padEnd(4) + " " + e.name.padEnd(45) + " " + String(data.length).padStart(8));
  }
  return { files, bad, entries: list };
}

/**
 * Зібрати оверлей Riftshade. Зміщення, CRC і розміри рахуються заново.
 * Порядок записів = порядок у `files` (Map зберігає порядок вставки).
 * @returns {Promise<{data:Uint8Array, count:number}>}
 */
export async function aionRiftPack(files, level = 9) {
  const list = [..._toFileMap(files)];
  const body = new _ByteBuf(1 << 16), cd = new _ByteBuf(1 << 12);
  for (const [rel, data] of list) {
    const crc = aionCrc32(data);
    const comp = await _zlib.deflateRaw(data, level);
    const lho = body.length;
    const enc = _riftCrypt(comp, lho, crc, comp.length);
    const name = _utf8Enc.encode(rel);
    body.bytes(Uint8Array.from(RIFT_SIG_LOCAL));
    body.u16(20); body.u16(0); body.u16(8); body.u16(0); body.u16(0x3221);
    body.u32(crc); body.u32(comp.length); body.u32(data.length);
    body.u16(name.length); body.u16(0);
    body.bytes(name); body.bytes(enc);
    cd.bytes(Uint8Array.from(RIFT_SIG_CENTRAL));
    cd.u16(20); cd.u16(20); cd.u16(0); cd.u16(8); cd.u16(0); cd.u16(0x3221);
    cd.u32(crc); cd.u32(comp.length); cd.u32(data.length);
    cd.u16(name.length); cd.u16(0); cd.u16(0); cd.u16(0); cd.u16(0); cd.u32(0); cd.u32(lho);
    cd.bytes(name);
  }
  const out = new _ByteBuf(body.length + cd.length + 22);
  out.bytes(body.done()); out.bytes(cd.done());
  out.bytes(Uint8Array.from(RIFT_SIG_EOCD));
  out.u16(0); out.u16(0); out.u16(list.length); out.u16(list.length);
  out.u32(cd.length); out.u32(body.length); out.u16(0);
  return { data: out.done(), count: list.length };
}

/** Тип паку за вмістом: "std" | "rift" | "unknown". */
export function aionDetectPakKind(buf) {
  if (aionIsStdPak(buf)) return "std";
  if (aionIsRiftPak(buf)) return "rift";
  return "unknown";
}



