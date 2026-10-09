# Chaos Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file homepage (chaotic canvas animation + liquid-glass contact card) whose shipped `index.html` is an obfuscated loader generated from a readable template.

**Architecture:** `src/index.src.html` is the readable template. `build.mjs` (dependency-free Node ESM) light-minifies it, deflates, XORs, encodes with a per-build shuffled base64 alphabet, and emits a loader (itself obfuscated: renamed identifiers, rotated string table, bracket-notation property access, decoy code) inside a tiny HTML shell. The loader decodes with `DecompressionStream('deflate-raw')` and `document.write`s the page.

**Tech Stack:** Node >= 18 (`node:test`, `node:zlib`, `node:vm`), vanilla HTML/CSS/JS, canvas 2D.

**Spec:** `docs/superpowers/specs/2026-10-09-chaos-homepage-design.md`

## Global Constraints

- Everything in English (code, comments, commit messages, docs).
- No external resources, no frameworks, no npm dependencies.
- Final deliverable is one `index.html`; contact data only inside the encoded payload; no readable `mailto`, `<canvas`, `CONFIG` in `index.html`.
- Contact values are placeholders in one `CONFIG` block (owner fills later).
- Safari support (`-webkit-backdrop-filter`); mobile card ~90% width; `prefers-reduced-motion` respected.
- Commit subject format: `<type>: <message>` (no task number exists for this repo).

## Review Focus

- Browser without `DecompressionStream` or with decode failure: page must show a plain `gp3991.dev` fallback, not a blank screen (tested in Task 1).
- Two builds of the same source must differ (random key/alphabet) yet both decode to the source (tested in Task 1).
- Unicode in the source (e.g. `ś`, `λ`, `∑`) must survive the encode/decode round-trip (tested in Task 1).
- Window resize / DPR change: canvas and objects stay in bounds, no objects stuck outside (manual check in Task 3).
- `prefers-reduced-motion` and hidden tab: reduced object count/speed, no runaway time step on tab return (manual check in Task 3).
- Non-Chromium browsers: card falls back to plain blur without errors (manual check in Task 3).

---

### Task 1: Build pipeline (`build.mjs`) with tests

**Files:**
- Create: `package.json`
- Create: `build.mjs`
- Create: `test/build.test.mjs`

**Interfaces:**
- Produces: `minify(src: string): string`, `pack(text: string): {key:number[], alpha:string, blob:string}`, `unpack(p): string`, `obfuscate(loaderSrc: string): string`, `buildHtml(srcText: string): string`, `build(): void` (reads `src/index.src.html`, writes `index.html`).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "gp-home",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "test": "node --test test/"
  }
}
```

- [ ] **Step 2: Write the failing tests** — `test/build.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { Blob } from 'node:buffer';
import { minify, pack, unpack, buildHtml } from '../build.mjs';

const SAMPLE = [
  '<!doctype html><title>t</title>',
  '<!-- drop me -->',
  '<script>',
  '// drop this line',
  "var CONFIG={mail:'mailto:x@y.z'};",
  "var u='zażółć λ ∑';",
  '</script>',
  '<canvas id="bg"></canvas>',
].join('\n');

function runLoader(html, { withDecompression = true } = {}) {
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const doc = { body: {}, open() {}, close() {}, write(t) { this.written = t; } };
  const ctx = {
    document: doc, atob, Blob, Response,
    DecompressionStream: withDecompression ? DecompressionStream : undefined,
  };
  vm.createContext(ctx);
  ctx.window = ctx;
  return vm.runInContext(script, ctx).then(() => doc);
}

test('minify strips html comments, comment-only lines and indentation', () => {
  const out = minify('<!-- c -->\n  // x\n  a();\n\n  b();\n');
  assert.equal(out, 'a();\nb();');
});

test('pack/unpack round-trips unicode', () => {
  const p = pack(SAMPLE);
  assert.equal(unpack(p), SAMPLE);
});

test('built loader decodes and writes the original document', async () => {
  const doc = await runLoader(buildHtml(SAMPLE));
  assert.equal(doc.written, minify(SAMPLE));
});

test('output contains no readable page fragments', () => {
  const html = buildHtml(SAMPLE);
  for (const frag of ['mailto', '<canvas', 'CONFIG', 'x@y.z', 'drop']) {
    assert.ok(!html.includes(frag), `leaked: ${frag}`);
  }
});

test('two builds differ but both decode', async () => {
  const a = buildHtml(SAMPLE);
  const b = buildHtml(SAMPLE);
  assert.notEqual(a, b);
  assert.equal((await runLoader(b)).written, minify(SAMPLE));
});

test('loader falls back to plain text without DecompressionStream', async () => {
  const doc = await runLoader(buildHtml(SAMPLE), { withDecompression: false });
  assert.equal(doc.written, undefined);
  assert.equal(doc.body.textContent, 'gp3991.dev');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test test/`
Expected: FAIL (cannot import `../build.mjs`).

- [ ] **Step 4: Implement `build.mjs`**

```js
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
    '<body style="background:#05070d"><noscript>gp3991.dev</noscript>' +
    `<script>${script}</script></body></html>`
  );
}

export function build() {
  const src = readFileSync(join(ROOT, 'src/index.src.html'), 'utf8');
  writeFileSync(join(ROOT, 'index.html'), buildHtml(src));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) build();
```

Note: the `loaderSource` data strings (alphabet, blob) are plain `'...'` literals, so they flow into the string table like any other string.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/`
Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json build.mjs test/build.test.mjs
git commit -m "feat: add obfuscating build pipeline"
```

---

### Task 2: Readable page source

**Files:**
- Create: `src/index.src.html`

**Interfaces:**
- Consumes: nothing (plain HTML). `build.mjs` removes whole-line `//` comments and HTML comments, so do not start JS template-literal lines with `//`.
- Produces: a page with `<canvas id="bg">`, `.card#card`, `#name`, `#tag`, four `<a class="btn" data-k="mail|phone|linkedin|github">`, and a `CONFIG` object.

- [ ] **Step 1: Write the page** — `src/index.src.html`

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>gp3991.dev</title>
<style>
:root{color-scheme:dark}
html,body{margin:0;height:100%;overflow:hidden;background:#05070d;color:#eaf2ff;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
canvas{position:fixed;inset:0;width:100%;height:100%}
.stage{position:fixed;inset:0;display:grid;place-items:center;perspective:900px;pointer-events:none}
.card{pointer-events:auto;position:relative;width:min(90vw,420px);box-sizing:border-box;padding:38px 26px 28px;border-radius:34px;text-align:center;
background:linear-gradient(135deg,rgba(255,255,255,.22),rgba(255,255,255,.05));
-webkit-backdrop-filter:blur(18px) saturate(180%);backdrop-filter:blur(18px) saturate(180%);
border:1px solid rgba(255,255,255,.32);
box-shadow:0 24px 70px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.65),inset 0 -1px 0 rgba(255,255,255,.12);
transition:transform .15s ease-out;will-change:transform}
.card.refract{backdrop-filter:blur(8px) url(#lg) saturate(180%)}
.card::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
background:radial-gradient(circle at var(--mx,30%) var(--my,0%),rgba(255,255,255,.38),transparent 55%)}
h1{margin:0 0 6px;font-size:26px;letter-spacing:.5px;text-shadow:0 2px 14px rgba(0,0,0,.4)}
.tag{margin:0 0 26px;font-size:13px;opacity:.78}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
a.btn{display:flex;align-items:center;justify-content:center;gap:9px;padding:14px 10px;border-radius:20px;color:#fff;text-decoration:none;font-size:14px;
background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);
box-shadow:inset 0 1px 0 rgba(255,255,255,.4);transition:transform .15s,background .15s}
a.btn:hover,a.btn:focus-visible{background:rgba(255,255,255,.24);transform:translateY(-2px) scale(1.03);outline:none}
a.btn svg{width:20px;height:20px;flex:none}
@media (prefers-reduced-motion:reduce){.card,a.btn{transition:none}}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
<filter id="lg" x="0" y="0" width="100%" height="100%">
<feTurbulence type="fractalNoise" baseFrequency=".012 .02" numOctaves="2" seed="7" result="n"/>
<feDisplacementMap in="SourceGraphic" in2="n" scale="28" xChannelSelector="R" yChannelSelector="G"/>
</filter>
</svg>
<canvas id="bg"></canvas>
<div class="stage">
<main class="card" id="card">
<h1 id="name"></h1>
<p class="tag" id="tag"></p>
<div class="row">
<a class="btn" data-k="mail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6h18v12H3zM3 6l9 7 9-7"/></svg>Mail</a>
<a class="btn" data-k="phone"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>Phone</a>
<a class="btn" data-k="linkedin"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="4" opacity=".25"/><path d="M7 10h2.4v7H7zM8.2 6.6a1.4 1.4 0 110 2.8 1.4 1.4 0 010-2.8zM11 10h2.3v1c.4-.7 1.2-1.2 2.3-1.2 2 0 2.4 1.3 2.4 3V17h-2.4v-3.6c0-.8 0-1.6-1-1.6s-1.2.8-1.2 1.6V17H11z"/></svg>LinkedIn</a>
<a class="btn" data-k="github"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="6" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 7.5v9M18 10.5c0 4-12 2-12 6"/></svg>GitHub</a>
</div>
</main>
</div>
<script>
(function(){
var CONFIG={
name:'Piotr Gościniak',
tagline:'Software developer',
mail:'you@example.com',
phone:'+48000000000',
linkedin:'https://www.linkedin.com/in/your-handle',
github:'https://github.com/your-handle'
};
var links={mail:'mailto:'+CONFIG.mail,phone:'tel:'+CONFIG.phone,linkedin:CONFIG.linkedin,github:CONFIG.github};
document.getElementById('name').textContent=CONFIG.name;
document.getElementById('tag').textContent=CONFIG.tagline;
document.querySelectorAll('[data-k]').forEach(function(a){
var k=a.getAttribute('data-k');
a.href=links[k];
if(k==='linkedin'||k==='github'){a.target='_blank';a.rel='noopener noreferrer'}
});

var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
var card=document.getElementById('card');
if(!reduce&&/Chrome\//.test(navigator.userAgent))card.classList.add('refract');

var cv=document.getElementById('bg'),ctx=cv.getContext('2d');
var W=0,H=0,mouse={x:-1e4,y:-1e4};
var TOK=['{}','</>','=>','0x1F','&&','!==','[]','();','#include','git push -f','sudo','NaN','null','404','++i','::','/**/','<?php','rm -rf','async','await','0101','SELECT *','|>','$_','try{}','fn main()','λ','∑'];
var COL=['#7dd3fc','#a78bfa','#f472b6','#34d399','#fbbf24','#f87171'];
var CODE=['const x = () => {','  return null;','}','for(;;) fork();','if (bug) ship();','git commit -m "fix"','while(1) {}','SELECT * FROM life;'];
var objs=[];
function rnd(a,b){return a+Math.random()*(b-a)}
function pick(a){return a[Math.random()*a.length|0]}

function Obj(){
var win=Math.random()<.14;
this.win=win;
this.col=pick(COL);
this.size=win?10:rnd(13,30);
this.text=pick(TOK);
this.lines=[pick(CODE),pick(CODE),pick(CODE)];
if(win)this.r=62;
else{ctx.font=this.size+'px monospace';this.r=Math.max(this.size*.7,ctx.measureText(this.text).width/2)}
this.x=rnd(this.r,Math.max(this.r+1,W-this.r));
this.y=rnd(this.r,Math.max(this.r+1,H-this.r));
var a=rnd(0,6.283),s=rnd(1.2,4)*(reduce?.35:1);
this.vx=Math.cos(a)*s;this.vy=Math.sin(a)*s;
this.rot=rnd(0,6.283);this.vr=rnd(-.03,.03);
this.g=0;this.flash=0;
}

function resize(){
var dpr=Math.min(window.devicePixelRatio||1,2);
W=window.innerWidth;H=window.innerHeight;
cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
ctx.setTransform(dpr,0,0,dpr,0,0);
ctx.fillStyle='#05070d';ctx.fillRect(0,0,W,H);
var want=reduce?25:Math.min(90,Math.round(W*H/14000)+20);
while(objs.length<want)objs.push(new Obj());
objs.length=want;
objs.forEach(function(o){
o.x=Math.min(Math.max(o.x,o.r),Math.max(o.r,W-o.r));
o.y=Math.min(Math.max(o.y,o.r),Math.max(o.r,H-o.r));
});
}

function step(dt){
var i,j,o,p;
for(i=0;i<objs.length;i++){
o=objs[i];
var dx=o.x-mouse.x,dy=o.y-mouse.y,d=Math.sqrt(dx*dx+dy*dy);
if(d<150&&d>0){var f=(150-d)/150*.9;o.vx+=dx/d*f;o.vy+=dy/d*f}
o.x+=o.vx*dt;o.y+=o.vy*dt;o.rot+=o.vr*dt;
if(o.x<o.r){o.x=o.r;o.vx=Math.abs(o.vx)}
if(o.x>W-o.r){o.x=Math.max(o.r,W-o.r);o.vx=-Math.abs(o.vx)}
if(o.y<o.r){o.y=o.r;o.vy=Math.abs(o.vy)}
if(o.y>H-o.r){o.y=Math.max(o.r,H-o.r);o.vy=-Math.abs(o.vy)}
var sp=Math.sqrt(o.vx*o.vx+o.vy*o.vy),cap=reduce?3:9;
if(sp>cap){o.vx*=cap/sp;o.vy*=cap/sp}
else if(sp<1){o.vx+=rnd(-1,1);o.vy+=rnd(-1,1)}
else{o.vx*=.9995;o.vy*=.9995}
if(o.g>0)o.g--;
else if(!reduce&&Math.random()<.004){
o.g=8;
if(!o.win)o.text=Math.random()<.5?pick(TOK):o.text.replace(/[01]/g,function(c){return c==='0'?'1':'0'});
}
if(o.flash>0)o.flash--;
}
for(i=0;i<objs.length;i++){
for(j=i+1;j<objs.length;j++){
o=objs[i];p=objs[j];
var cx=p.x-o.x,cy=p.y-o.y,dist=Math.sqrt(cx*cx+cy*cy),min=o.r+p.r;
if(dist<min&&dist>0){
var nx=cx/dist,ny=cy/dist,push=(min-dist)/2;
o.x-=nx*push;o.y-=ny*push;p.x+=nx*push;p.y+=ny*push;
var dvn=(o.vx-p.vx)*nx+(o.vy-p.vy)*ny;
if(dvn>0){
o.vx-=dvn*nx;o.vy-=dvn*ny;p.vx+=dvn*nx;p.vy+=dvn*ny;
o.vr=rnd(-.06,.06);p.vr=rnd(-.06,.06);
o.flash=p.flash=6;
}
}
}
}
}

function draw(){
var i,o,k;
ctx.globalAlpha=1;
ctx.fillStyle='rgba(5,7,13,.28)';
ctx.fillRect(0,0,W,H);
for(i=0;i<objs.length;i++){
o=objs[i];
ctx.save();
var jx=o.g>0?rnd(-3,3):0;
ctx.translate(o.x+jx,o.y);
ctx.rotate(o.rot);
var col=o.flash>0||o.g>0?'#ffffff':o.col;
ctx.strokeStyle=col;ctx.fillStyle=col;
if(o.win){
ctx.globalAlpha=.85;
ctx.lineWidth=1.5;
ctx.strokeRect(-70,-36,140,72);
for(k=0;k<3;k++){ctx.beginPath();ctx.arc(-60+k*10,-28,2.5,0,6.283);ctx.fill()}
ctx.font='9px monospace';ctx.textAlign='left';ctx.textBaseline='middle';
for(k=0;k<3;k++)ctx.fillText(o.lines[k],-62,-12+k*15);
}else{
ctx.font=o.size+'px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
ctx.shadowColor=col;ctx.shadowBlur=10;
ctx.fillText(o.text,0,0);
}
ctx.restore();
}
}

var last=performance.now();
function frame(t){
var dt=Math.min(3,(t-last)/16.667);
last=t;
step(dt);draw();
requestAnimationFrame(frame);
}

window.addEventListener('resize',resize);
window.addEventListener('pointermove',function(e){
mouse.x=e.clientX;mouse.y=e.clientY;
if(reduce)return;
var r=card.getBoundingClientRect();
card.style.setProperty('--mx',((e.clientX-r.left)/r.width*100)+'%');
card.style.setProperty('--my',((e.clientY-r.top)/r.height*100)+'%');
card.style.transform='rotateX('+((e.clientY/H-.5)*-10)+'deg) rotateY('+((e.clientX/W-.5)*10)+'deg)';
});
window.addEventListener('pointerleave',function(){mouse.x=mouse.y=-1e4;card.style.transform=''});
window.addEventListener('pointerdown',function(e){
if(e.target.closest&&e.target.closest('a'))return;
objs.forEach(function(o){
var dx=o.x-e.clientX,dy=o.y-e.clientY,d=Math.sqrt(dx*dx+dy*dy)||1;
if(d<320){var f=(320-d)/320*(reduce?3:9);o.vx+=dx/d*f;o.vy+=dy/d*f;o.vr=rnd(-.1,.1)}
});
});
document.addEventListener('visibilitychange',function(){last=performance.now()});

resize();
requestAnimationFrame(frame);
})();
</script>
</body>
</html>
```

- [ ] **Step 2: Sanity-check the template in a browser**

Run: `python3 -m http.server 8000` (in repo root, in a terminal tab), open `http://localhost:8000/src/index.src.html`.
Expected: objects fly and bounce, the glass card is centered, four buttons visible, no console errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.src.html
git commit -m "feat: add homepage source template"
```

---

### Task 3: Build, verify, commit output

**Files:**
- Modify: `index.html` (regenerated by the build)

**Interfaces:**
- Consumes: `build()` from Task 1, `src/index.src.html` from Task 2.

- [ ] **Step 1: Build and run tests**

Run: `npm run build && npm test`
Expected: `index.html` regenerated; all tests PASS.

- [ ] **Step 2: Confirm the output is opaque**

Run: `grep -c -E "mailto|<canvas|CONFIG|your-handle|example.com" index.html`
Expected: `0`

- [ ] **Step 3: Verify in a browser**

Open `http://localhost:8000/index.html` (server from Task 2). Check: animation runs, the card renders, mail/phone/LinkedIn/GitHub hrefs resolve to the `CONFIG` placeholders (inspect with devtools), console has no errors. Then: resize the window and confirm no objects get stuck outside; toggle `prefers-reduced-motion` in devtools and confirm slower, fewer objects; switch tabs for a few seconds and return and confirm no jump; open in Safari/Firefox if available and confirm the card falls back to plain blur without errors.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: build obfuscated homepage"
```
