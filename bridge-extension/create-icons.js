/**
 * Generate Bridge extension icons (16, 48, 128) - pure Node, no npm deps.
 * Run: node create-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const dir = path.join(__dirname, 'icons');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Blue accent #58a6ff
const R = 0x58, G = 0xa6, B = 0xff;

function crc32(data) {
  let c = 0xffffffff;
  const table = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  for (let i = 0; i < data.length; i++) {
    c = table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function writeChunk(out, type, data) {
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, data.length, false);
  out.push(...len);
  out.push(...type);
  out.push(...data);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(Buffer.from([...type, ...data])), false);
  out.push(...crc);
}

function createPng(size) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const out = [...signature];
  writeChunk(out, [0x49, 0x48, 0x44, 0x52], [...ihdr]);
  const raw = [];
  for (let y = 0; y < size; y++) {
    raw.push(0);
    for (let x = 0; x < size; x++) {
      raw.push(R, G, B);
    }
  }
  const deflated = zlib.deflateSync(Buffer.from(raw), { level: 9 });
  writeChunk(out, [0x49, 0x44, 0x41, 0x54], [...deflated]);
  writeChunk(out, [0x49, 0x45, 0x4e, 0x44], []);
  return Buffer.from(out);
}

[16, 48, 128].forEach((size) => {
  const file = path.join(dir, `icon${size}.png`);
  fs.writeFileSync(file, createPng(size));
  console.log('Written', file);
});
