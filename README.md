# Chaos Star Generator

<p align="center">
  <img src="chaos-star-generator-files/assets/160x160.png" alt="Chaos Star" width="120">
</p>

<p align="center">
  <strong>Generate, customize, and share procedurally-drawn chaos stars.</strong><br>
  <em>Eight arrows radiating from a center — endless variations of color, geometry, and rotation.</em>
</p>

<p align="center">
  <a href="https://caostar.com/">Live</a> · 
  <a href="https://caostar.com/thoughts/the-chaos-star-generator-revamped/2026/05/">About the project</a>
</p>

---

## Features

- 🎛 **Full geometric control** — bar width/length/taper, tip width/length/notch, center radius, global scale
- 🎨 **Multi-stop gradients** — angular (conic), linear, radial, or solid; auto-wrapping seam for smooth angular fills
- 🖼 **28 sample textures + custom upload** — any bitmap can fill the star, drag to position, scale to taste
- ✨ **Inspire mode** — random designs in a smooth GSAP-powered loop, configurable transition speed
- 🔗 **Shareable URLs** — every parameter round-trips through `?design=` (compressed base64)
- ⏪ **Browser history** — every commit is a back/forward navigable state with a smooth transition
- 💾 **PNG export** with transparent or solid background
- 📱 **Mobile native** — pinch zoom, drag-to-pan textures, long-press to save to Photos, "Add to Home Screen"

## Magickal use

Beyond being a creative tool, the Chaos Star Generator can also serve as a magickal instrument. Here's a fun experiment:

1. Upload a texture with a sigil placed at the exact center of the image. Like this one, included on the sample textures:

   <img src="chaos-star-generator-files/textures/sygilexample.jpg" alt="Example sigil texture" width="200">

2. Click on **Inspire me randomly** or just hit "R".
3. Adjust the **Transition** parameter to set your preferred speed.
4. Enter into a state of gnosis and focus on the moving Chaos Star while keeping your sigil in view.
5. Boom. You've just created a powerful ritual moment.

## Quick start

It's a static site — no build step.

```bash
# any static server works
python3 -m http.server 8000
# then open http://localhost:8000
```

ES modules require a real HTTP server; `file://` won't work.

## Controls

### Keyboard

| Key | Action |
|---|---|
| `Space` | Generate a new random star |
| `R` | Toggle inspire loop |
| `F` | Full screen |
| `H` | Hide all controls |
| `Esc` | Exit fullscreen / stop inspire |
| `⌘ ±` / `⌘ 0` | Zoom star in / out / reset |
| Wheel | Zoom star |

### Mouse / touch

| Gesture | Action |
|---|---|
| Click canvas (desktop) | Random star |
| Tap canvas (mobile) | Toggle controls |
| Double-tap canvas (mobile) | Random star |
| Hold canvas (mobile) | Open share sheet → Save to Photos |
| Hold canvas (desktop) | Download PNG |
| Pinch | Zoom star |
| Drag canvas (in Texture Drag Mode) | Pan the texture |

## Tech

- Pure HTML / CSS / vanilla JS (ES modules)
- `<canvas>` 2D API for all rendering — `createConicGradient`, `createLinearGradient`, `createRadialGradient`
- [GSAP 3](https://gsap.com/) for parameter tweening
- IndexedDB for custom-texture persistence
- Web Share API for mobile save-to-photos
- No build step, no framework, no bundler

## Project layout

```
index.html                          ← entry point
manifest.webmanifest                ← PWA manifest
favicon.ico
chaos-star-generator-files/
  css/styles.css
  js/
    main.js                         ← bootstrap, UI wiring, keyboard, gestures
    star-renderer.js                ← canvas geometry + gradient/texture fill
    parameters.js                   ← param defs, defaults, random generator
    animation.js                    ← Tweener wrapping GSAP for params
    gradient-editor.js              ← multi-stop gradient widget
    texture-manager.js              ← sample list, IDB cache, image loading
    url-codec.js                    ← base64-encoded design state in URL + history
    export.js                       ← (legacy, unused)
  assets/                           ← icons + splash
  textures/                         ← 28 sample textures (.jpg)
```

## URL sharing

Every parameter — geometry, gradient stops, gradient type, background, sample texture choice, texture position/scale — is encoded into a compact base64 JSON blob in `?design=`. Open the same URL anywhere and you get the same star.

**Custom uploaded textures** are too large to fit in a URL, so they're stored locally in IndexedDB. The URL marks `tm=custom` so opening a shared link with a custom texture in someone else's browser falls back to no texture with a notice.

## Add to home screen

Manifest is configured for installable PWA — open in Safari/Chrome on mobile, "Add to Home Screen", and it launches chromeless against a black splash.

## Phase 2: Chaos Spheres (`/3d/`)

The 3D companion app, hosted at `https://caostar.com/3d/`, that lets users build, customize, share, and **3D-print** chaos spheres — the volumetric Symbol of Chaos.

A central sphere with 4 arrows (cylinder shaft + cone tip) at tetrahedral angles, CSG-unioned into a single watertight `BufferGeometry` so an applied texture wraps the whole object continuously and STL output is printable.

### 3D-specific features

- 🔮 **Three.js** WebGL rendering with `OrbitControls` (drag to orbit, wheel/pinch to zoom, two-finger to pan)
- ⚡ **Live ShaderToy-compatible GLSL editor** — paste any `mainImage()` shader from shadertoy.com
- 🎨 **8 built-in fragment shaders** — iridescent, plasma, voronoi, psychedelic, matrix, lava, crystalline, starfield
- 🖼 **Texture mode** reuses the 2D app's 28 sample textures (with optional triplanar wrapping for sigil-style images)
- 🧊 **Shaded / Flat / Wireframe** lighting modes
- 🖨 **Export to STL, GLB, OBJ, and 3MF** — drop the STL straight into PrusaSlicer or Bambu Studio
- 🔗 **Share URLs include custom shader source** (gzip + base64 inside `?design=`) for end-to-end shareability
- ⏪ **Browser history** + Inspire mode push history entries, just like the 2D app
- 📱 **PWA** — separate "Add to Home Screen" experience installable independently from the 2D app

### 3D project layout

```
3d/
  index.html                          ← entry point
  manifest.webmanifest
  css/styles.css                      ← @imports tokens from ../chaos-star-generator-files/css/styles.css
  js/
    main.js                           ← bootstrap, UI wiring, render loop
    sphere-builder.js                 ← CSG union → unified BufferGeometry with spherical UVs
    parameters.js                     ← param defs, defaults, random generator
    animation.js                      ← GSAP-based tweener
    shader-manager.js                 ← built-in catalog + ShaderToy adapter
    ui.js                             ← Shape / Material / Shader / Lighting / Actions panels
    url-codec-3d.js                   ← extends 2D codec with gzipped custom shader source
    exporters.js                      ← STL / GLB / OBJ / 3MF
  shaders/
    common/{vertex.glsl,shadertoy-wrapper.frag}
    builtin/                          ← 8 fragment shaders
```

### Tech (3D-specific)

- [Three.js](https://threejs.org/) `0.169.0` — geometry, materials, OrbitControls, exporters
- [`three-bvh-csg`](https://github.com/gkjohnson/three-bvh-csg) — boolean union of sphere + arrows
- [`fflate`](https://github.com/101arrowz/fflate) — gzip (URL shader compression) + 3MF zip writing
- ESM via `<script type="importmap">` from CDN — no build step, same zero-tooling philosophy

### 3D printing

The CSG'd geometry is watertight and slicer-ready. STL is the safest format (raw triangles); 3MF is recommended if you want the model's color baked into the print on a multi-material printer.

## Credits

Inspired by the original [caostar.com](https://caostar.com/thoughts/the-chaos-star-generator/2013/03/) by AD. This is a from-scratch reimplementation.

The Symbol of Chaos itself was popularized by Michael Moorcock in his Eternal Champion novels and adopted by chaos magicians from the 1970s onward — eight arrows radiating from a single point, representing chaos as the source of all possibility.

## License

This repository is under the Do What The Fuck You Want To Public License [WTFPL](http://www.wtfpl.net/about/)

