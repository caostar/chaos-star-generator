// =============================================================================
//  TWEAK CONTROL RANGES HERE
// -----------------------------------------------------------------------------
//  Every slider in the UI reads its min/max/step/default from this single map.
//  Change a number here, reload the page — that's it.
// =============================================================================

export const PARAM_DEFS = {
  globalScale:    { key: 'gs', min: 0.2,  max: 3.0,  step: 0.05, default: 1.0   },
  sphereRadius:   { key: 'sr', min: 1,    max: 60,   step: 1,    default: 20    },
  sphereSegments: { key: 'ss', min: 16,   max: 128,  step: 8,    default: 64    },
  shaftRadius:    { key: 'wr', min: 0.5,  max: 20,   step: 0.1,  default: 3.5   },
  shaftLength:    { key: 'wl', min: 5,    max: 250,  step: 1,    default: 100   },
  coneRadius:     { key: 'kr', min: 1,    max: 30,   step: 0.5,  default: 10    },
  coneLength:     { key: 'kl', min: 1,    max: 60,   step: 0.5,  default: 10    },
  rotateSpeed:    { key: 'rs', min: 0,    max: 5,    step: 0.1,  default: 1     },
  cameraDistance: { key: 'cd', min: 30,   max: 600,  step: 1,    default: 220   },
  textureScale:   { key: 'ts', min: 0.1,  max: 5,    step: 0.05, default: 1     },
  metalness:      { key: 'mt', min: 0,    max: 1,    step: 0.05, default: 0.5   },
  roughness:      { key: 'rg', min: 0,    max: 1,    step: 0.05, default: 0.4   },
};

// Which params are numeric (live-tweenable). Anything in PARAM_DEFS is numeric.
export const NUMERIC_KEYS = Object.keys(PARAM_DEFS);

// =============================================================================
//  Defaults / state shape
// =============================================================================

export function getDefaults() {
  const p = {};
  for (const [k, def] of Object.entries(PARAM_DEFS)) p[k] = def.default;
  p.backgroundColor = '#000000';
  p.materialMode    = 'shader';   // 'shader' | 'texture' | 'solid'
  p.shaderId        = 'iridescent';
  p.shaderSource    = null;
  p.solidColor      = '#4fc3f7';
  p.textureMode     = 'sample';   // 'none' | 'sample' | 'custom'
  p.textureIndex    = 0;
  p.textureOffsetX  = 0;
  p.textureOffsetY  = 0;
  p.triplanar       = false;
  p.lighting        = 'shaded';   // 'shaded' | 'flat' | 'wireframe'
  return p;
}

export function clamp(v, def) {
  return Math.max(def.min, Math.min(def.max, v));
}

export function validateParams(input) {
  const p = getDefaults();
  if (!input || typeof input !== 'object') return p;
  for (const [k, def] of Object.entries(PARAM_DEFS)) {
    if (typeof input[k] === 'number' && Number.isFinite(input[k])) {
      p[k] = clamp(input[k], def);
    }
  }
  for (const k of [
    'backgroundColor', 'solidColor', 'materialMode', 'shaderId',
    'shaderSource', 'textureMode', 'lighting',
  ]) if (typeof input[k] === 'string') p[k] = input[k];
  for (const k of ['textureIndex', 'textureOffsetX', 'textureOffsetY']) {
    if (typeof input[k] === 'number') p[k] = input[k];
  }
  if (typeof input.triplanar === 'boolean') p.triplanar = input.triplanar;
  return p;
}

// =============================================================================
//  Random generator — biased toward visually-balanced designs
// =============================================================================

import { BUILTIN_SHADERS } from './shader-manager.js';

function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr)      { return arr[Math.floor(Math.random() * arr.length)]; }

export function generateRandomParams() {
  const p = getDefaults();
  p.globalScale  = +rand(0.7, 1.3).toFixed(2);
  p.sphereRadius = Math.round(rand(12, 35));
  p.shaftRadius  = +rand(2, 6).toFixed(1);
  p.shaftLength  = Math.round(rand(60, 150));
  p.coneRadius   = +rand(7, 16).toFixed(1);
  p.coneLength   = +rand(8, 22).toFixed(1);
  p.rotateSpeed  = +rand(0.3, 2.5).toFixed(2);

  const r = Math.random();
  if (r < 0.65) {
    p.materialMode = 'shader';
    p.shaderId     = pick(BUILTIN_SHADERS).id;
  } else if (r < 0.85) {
    p.materialMode = 'solid';
    const h = Math.random() * 360, s = 60 + Math.random() * 30, l = 45 + Math.random() * 20;
    p.solidColor = hslToHex(h, s, l);
  } else {
    p.materialMode = 'texture';
    p.textureMode  = 'sample';
    p.textureIndex = Math.floor(Math.random() * 28);
    p.triplanar    = Math.random() < 0.6;
  }
  return p;
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
