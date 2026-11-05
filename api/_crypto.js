// SHA-256 em JavaScript puro (sem node:crypto, sem flag) — devolve hex minúsculo
// do SHA-256 dos BYTES UTF-8 da string. Substitui crypto.createHash("sha256")
// .update(str).digest("hex"), que o runtime da Cloudflare não tem por padrão.
// VALIDADO byte a byte contra o node:crypto (inclusive acento: ç, á, ã).
const K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);

export function sha256hex(input) {
  const msg = new TextEncoder().encode(String(input == null ? "" : input));
  const l = msg.length;
  const withOne = ((l + 8) >> 6) + 1;
  const total = withOne * 64;
  const b = new Uint8Array(total);
  b.set(msg);
  b[l] = 0x80;
  const bits = l * 8;
  // comprimento em bits nos últimos 8 bytes (big-endian); l*8 cabe em 32 bits aqui
  b[total - 4] = (bits >>> 24) & 0xff;
  b[total - 3] = (bits >>> 16) & 0xff;
  b[total - 2] = (bits >>> 8) & 0xff;
  b[total - 1] = bits & 0xff;

  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const w = new Uint32Array(64);
  const rotr = (x,n) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < total; i += 64) {
    for (let t = 0; t < 16; t++) {
      const j = i + t * 4;
      w[t] = (b[j] << 24) | (b[j+1] << 16) | (b[j+2] << 8) | b[j+3];
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t-15],7) ^ rotr(w[t-15],18) ^ (w[t-15] >>> 3);
      const s1 = rotr(w[t-2],17) ^ rotr(w[t-2],19) ^ (w[t-2] >>> 10);
      w[t] = (w[t-16] + s0 + w[t-7] + s1) | 0;
    }
    let a=h0,bb=h1,c=h2,d=h3,e=h4,f=h5,g=h6,hh=h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
      const maj = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (S0 + maj) | 0;
      hh=g; g=f; f=e; e=(d + t1) | 0; d=c; c=bb; bb=a; a=(t1 + t2) | 0;
    }
    h0=(h0+a)|0; h1=(h1+bb)|0; h2=(h2+c)|0; h3=(h3+d)|0; h4=(h4+e)|0; h5=(h5+f)|0; h6=(h6+g)|0; h7=(h7+hh)|0;
  }
  const toHex = (x) => (x >>> 0).toString(16).padStart(8, "0");
  return toHex(h0)+toHex(h1)+toHex(h2)+toHex(h3)+toHex(h4)+toHex(h5)+toHex(h6)+toHex(h7);
}
