// Chaos Sphere Generator — parameter definitions

export const PARAM_DEFS = {
  sphereRadius:     { key: 'sr', min: 5,    max: 50,  step: 1,    default: 20    },
  sphereSegments:   { key: 'ss', min: 16,   max: 128, step: 8,    default: 64    },
  shaftRadiusRatio: { key: 'cr', min: 0.05, max: 0.4, step: 0.01, default: 0.167 },
  shaftLengthRatio: { key: 'cl', min: 1,    max: 8,   step: 0.1,  default: 5     },
  coneRadiusRatio:  { key: 'kr', min: 0.2,  max: 1.0, step: 0.05, default: 0.5   },
  coneLengthRatio:  { key: 'kl', min: 0.2,  max: 2.0, step: 0.05, default: 0.5   },
  rotateSpeed:      { key: 'rs', min: 0,    max: 5,   step: 0.1,  default: 1     },
  cameraDistance:   { key: 'cd', min: 30,   max: 300, step: 1,    default: 120   },
  textureScale:     { key: 'ts', min: 0.1,  max: 5,   step: 0.05, default: 1     },
};

export const NUMERIC_KEYS = Object.keys(PARAM_DEFS);

export const SHADE_PRESETS = ['shaded', 'flat', 'wireframe'];

export function getDefaults() {
  const p = {};
  for (const [k, def] of Object.entries(PARAM_DEFS)) p[k] = def.default;
  p.backgroundColor = '#000000';
  p.materialMode    = 'shader';   // 'shader' | 'texture' | 'solid'
  p.shaderId        = 'iridescent';
  p.shaderSource    = null;       // populated only when shaderId === 'custom'
  p.solidColor      = '#4fc3f7';
  p.metalness       = 0.5;
  p.roughness       = 0.4;
  p.textureMode     = 'none';     // 'none' | 'sample' | 'custom'
  p.textureIndex    = 0;
  p.textureOffsetX  = 0;
  p.textureOffsetY  = 0;
  p.triplanar       = false;
  p.lighting        = 'shaded';
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
  if (typeof input.backgroundColor === 'string') p.backgroundColor = input.backgroundColor;
  if (typeof input.solidColor === 'string')      p.solidColor      = input.solidColor;
  if (typeof input.materialMode === 'string')    p.materialMode    = input.materialMode;
  if (typeof input.shaderId === 'string')        p.shaderId        = input.shaderId;
  if (typeof input.shaderSource === 'string')    p.shaderSource    = input.shaderSource;
  if (typeof input.textureMode === 'string')     p.textureMode     = input.textureMode;
  if (typeof input.textureIndex === 'number')    p.textureIndex    = input.textureIndex;
  if (typeof input.textureOffsetX === 'number')  p.textureOffsetX  = input.textureOffsetX;
  if (typeof input.textureOffsetY === 'number')  p.textureOffsetY  = input.textureOffsetY;
  if (typeof input.triplanar === 'boolean')      p.triplanar       = input.triplanar;
  if (typeof input.lighting === 'string')        p.lighting        = input.lighting;
  if (typeof input.metalness === 'number')       p.metalness       = input.metalness;
  if (typeof input.roughness === 'number')       p.roughness       = input.roughness;
  return p;
}

const BUILTIN_SHADERS = [
  'iridescent', 'plasma', 'voronoi', 'psychedelic',
  'matrix', 'lava', 'crystalline', 'starfield',
];

function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr)      { return arr[Math.floor(Math.random() * arr.length)]; }

export function generateRandomParams() {
  const p = getDefaults();
  p.sphereRadius     = Math.round(rand(12, 30));
  p.shaftRadiusRatio = +rand(0.08, 0.25).toFixed(2);
  p.shaftLengthRatio = +rand(2.5, 6).toFixed(1);
  p.coneRadiusRatio  = +rand(0.35, 0.8).toFixed(2);
  p.coneLengthRatio  = +rand(0.4, 1.2).toFixed(2);
  p.rotateSpeed      = +rand(0.3, 2.5).toFixed(2);

  const r = Math.random();
  if (r < 0.7) {
    p.materialMode = 'shader';
    p.shaderId     = pick(BUILTIN_SHADERS);
  } else if (r < 0.9) {
    p.materialMode = 'solid';
    const h = Math.random() * 360, s = 60 + Math.random() * 30, l = 45 + Math.random() * 20;
    p.solidColor = hslToHex(h, s, l);
  } else {
    p.materialMode = 'texture';
    p.textureMode  = 'sample';
    p.textureIndex = Math.floor(Math.random() * 28);
    p.triplanar    = Math.random() < 0.5;
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
