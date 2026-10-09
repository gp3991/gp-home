# Chaos homepage — design

## Goal
Personal landing page for `gp3991.dev` (GitHub Pages). It should impress and
work as a contact list: a chaotic coding-themed animation in the background and a
liquid-glass card in the center with four contact buttons (mail, phone,
LinkedIn, GitHub).

## Deliverable shape
- `src/index.src.html` — readable source template. All CSS and JS inline, no external resources.
  Contact data lives in one `CONFIG` block with placeholders (filled in later by the owner).
- `build.mjs` — dependency-free Node compiler: source template -> obfuscated `index.html`.
- `index.html` — build output, committed (GitHub Pages serves it).

## Obfuscation (approach A: layered loader)
This is obfuscation, not encryption: the key must ship in the file, so decoding is
always possible, just very hard to read.

Pipeline in `build.mjs`:
1. Minify the template (strip comments/whitespace from HTML/CSS/JS).
2. `deflate` compress.
3. XOR with a key (derived at build time, random per build).
4. Encode with a custom base-N alphabet into a blob.
5. Emit a tiny loader that decodes the blob in the browser and replaces the document.
6. The loader itself is obfuscated: `_0x…` identifiers, rotated string table,
   index-based lookups, dead code. The output HTML contains no readable page content.

Contact values from `CONFIG` exist only inside the encoded payload and are
assembled at runtime (`mailto:`, `tel:`, URLs) — no plain addresses in the source.

## Background animation (canvas 2D, requestAnimationFrame)
- ~60–100 objects: code tokens, glyphs (`{}`, `</>`, `=>`, `0x`, `;`), small code-snippet windows.
- Physics: wall bounces, object-object collisions, random rotation, glitches
  (character swap, color change, momentary bit flips).
- Cursor repels objects; click triggers an explosion.
- DPR-aware canvas sizing, pauses when the tab is hidden,
  `prefers-reduced-motion` reduces motion, fewer objects on mobile.

## Liquid-glass card
- Centered; `backdrop-filter: blur() saturate()`, translucent fill, gradient border,
  inner highlight, shadow.
- SVG `feDisplacementMap` refraction where supported, graceful fallback to plain blur.
- Subtle cursor tilt and light highlight.
- Title, short subtitle, four inline-SVG icon buttons with hover states.
- Safari support via `-webkit-backdrop-filter`; mobile card ~90% width.

## Verification
After build, load the page in a browser: animation runs, card renders, links are
correct, no console errors. Grep `index.html` to confirm no readable fragments
(`mailto`, `<canvas`, `CONFIG`, contact placeholders).

## Out of scope
Frameworks, external assets/fonts, analytics, multi-page routing.
