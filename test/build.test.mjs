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
