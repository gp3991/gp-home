import { readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { randomBytes, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const ROOT = dirname(fileURLToPath(import.meta.url));

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const hex = (n) => '0x' + n.toString(16);
const rname = () => '_0x' + randomBytes(3).toString('hex');

export function minify(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .join('\n');
}

const xor = (buf, key) => Buffer.from(buf.map((b, i) => b ^ key[i % key.length]));

export function pack(text) {
  const key = [...randomBytes(16)];
  const alpha = shuffle([...STD]).join('');
  const raw = deflateRawSync(Buffer.from(text, 'utf8'));
  const b64 = xor(raw, key).toString('base64').replace(/=+$/, '');
  const blob = [...b64].map((c) => alpha[STD.indexOf(c)]).join('');
  return { key, alpha, blob };
}

export function unpack({ key, alpha, blob }) {
  const b64 = [...blob].map((c) => STD[alpha.indexOf(c)]).join('');
  const raw = xor(Buffer.from(b64, 'base64'), key);
  return inflateRawSync(raw).toString('utf8');
}

// Plain loader. Rules the obfuscator relies on: only single-quoted strings
// (no quote chars inside), property access via brackets, no regex/template literals.
const loaderSource = (p) => `(async function(){
var G=window;
try{
var alpha='${p.alpha}';
var std='${STD}';
var blob='${p.blob}';
var key=[${p.key.join(',')}];
var b64='';
for(var i=0;i<blob['length'];i++){b64+=std[alpha['indexOf'](blob[i])]}
var bin=G['atob'](b64);
var buf=new G['Uint8Array'](bin['length']);
for(var j=0;j<bin['length'];j++){buf[j]=bin['charCodeAt'](j)^key[j%key['length']]}
var ds=new G['DecompressionStream']('deflate-raw');
var txt=await new G['Response'](new G['Blob']([buf])['stream']()['pipeThrough'](ds))['text']();
var doc=G['document'];doc['open']();doc['write'](txt);doc['close']();
}catch(e){G['document']['body']['textContent']='gp3991.dev'}
})()`;

const IDENTS = ['G', 'alpha', 'std', 'blob', 'key', 'b64', 'bin', 'buf', 'ds', 'txt', 'doc', 'i', 'j', 'e'];

export function obfuscate(src) {
  const strings = [];
  let code = src.replace(/'([^']*)'/g, (_, s) => {
    strings.push(s);
    return `\u0001${strings.length - 1}\u0002`;
  });

  const used = new Set();
  for (const id of IDENTS) {
    let n;
    do { n = rname(); } while (used.has(n));
    used.add(n);
    code = code.replace(new RegExp(`\\b${id}\\b`, 'g'), n);
  }

  for (let k = 0; k < 8; k++) strings.push(randomBytes(randomInt(4, 24)).toString('base64'));

  const order = shuffle(strings.map((_, i) => i));
  const pos = new Map(order.map((o, p) => [o, p]));
  const L = order.length;
  const m = randomInt(1, L);
  const stored = new Array(L);
  order.forEach((o, i) => { stored[(i + m) % L] = strings[o]; });

  const T = rname();
  code = code.replace(/\u0001(\d+)\u0002/g, (_, n) => `${T}[${hex(pos.get(Number(n)))}]`);

  const decoys = Array.from({ length: 5 }, () => {
    const [f, a, b] = [rname(), rname(), rname()];
    return `function ${f}(${a},${b}){return ${a}^${b}^${hex(randomInt(1, 255))}}`;
  });
  const table = `var ${T}=${JSON.stringify(stored)};(function(a,n){while(--n)a.push(a.shift())})(${T},${m + 1});`;
  return `${table}${decoys.join(';')};${code}`;
}

export function buildHtml(srcText) {
  const script = obfuscate(loaderSource(pack(minify(srcText))));
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>gp3991.dev</title></head>' +
    '<body style="background:#070a14"><noscript>gp3991.dev</noscript>' +
    `<script>${script}</script></body></html>`
  );
}

export function build() {
  const src = readFileSync(join(ROOT, 'src/index.src.html'), 'utf8');
  writeFileSync(join(ROOT, 'index.html'), buildHtml(src));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) build();
