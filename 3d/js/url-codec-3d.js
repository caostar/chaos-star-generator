// URL state for 3D app. Same compact-JSON-base64-url scheme as the 2D app,
// extended with 3D keys + optional gzip+base64 custom shader source.

import { gzipSync, gunzipSync, strFromU8, strToU8 } from 'fflate';
import { validateParams, getDefaults } from './parameters.js';

const SHORT_KEYS = {
  globalScale:      'gs',
  sphereRadius:     'sr',
  sphereSegments:   'ss',
  shaftRadius:      'wr',
  shaftLength:      'wl',
  coneRadius:       'kr',
  coneLength:       'kl',
  rotateSpeed:      'rs',
  cameraDistance:   'cd',
  textureScale:     'ts',
  metalness:        'mt',
  roughness:        'rg',
  backgroundColor:  'bg',
  materialMode:     'mm',
  shaderId:         'si',
  shaderSource:     'sc',
  solidColor:       'sx',
  textureMode:      'tm',
  textureIndex:     'ti',
  textureOffsetX:   'tx',
  textureOffsetY:   'ty',
  triplanar:        'tp',
  lighting:         'lg',
  // Lighting / renderer
  dirColor:         'lc',
  dirIntensity:     'li',
  dirAzimuth:       'la',
  dirElevation:     'le',
  hemiSky:          'hk',
  hemiGround:       'hb',
  hemiIntensity:    'hi',
  toneMapping:      'tn',
  exposure:         'ex',
  envEnabled:       'ev',
};

const REVERSE_KEYS = Object.fromEntries(
  Object.entries(SHORT_KEYS).map(([k, v]) => [v, k])
);

// 6 KB cap on raw shader source — keeps URLs sane.
const SHADER_SOURCE_MAX = 6144;

function base64encode(uint8) {
  let s = '';
  for (let i = 0; i < uint8.length; i++) s += String.fromCharCode(uint8[i]);
  return btoa(s);
}
function base64decode(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeParams(params) {
  const compact = {};
  for (const [key, shortKey] of Object.entries(SHORT_KEYS)) {
    const v = params[key];
    if (v === undefined || v === null) continue;
    if (key === 'shaderSource') {
      if (typeof v === 'string' && v.length > 0 && v.length <= SHADER_SOURCE_MAX
          && params.shaderId === 'custom') {
        const gz = gzipSync(strToU8(v), { level: 9 });
        compact[shortKey] = base64encode(gz);
      }
    } else if (typeof v === 'number') {
      compact[shortKey] = Math.round(v * 1000) / 1000;
    } else if (typeof v === 'boolean') {
      compact[shortKey] = v ? 1 : 0;
    } else {
      compact[shortKey] = v;
    }
  }
  const json = JSON.stringify(compact);
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeParams(encoded) {
  try {
    let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = atob(b64);
    const compact = JSON.parse(json);

    const params = {};
    for (const [shortKey, value] of Object.entries(compact)) {
      const fullKey = REVERSE_KEYS[shortKey];
      if (!fullKey) continue;
      if (fullKey === 'shaderSource') {
        try {
          const gz = base64decode(value);
          params.shaderSource = strFromU8(gunzipSync(gz));
        } catch { /* ignore corrupt shader */ }
      } else if (fullKey === 'triplanar' || fullKey === 'envEnabled') {
        params[fullKey] = !!value;
      } else {
        params[fullKey] = value;
      }
    }
    return validateParams(params);
  } catch {
    return null;
  }
}

export function buildShareUrl(params) {
  const encoded = encodeParams(params);
  const base = window.location.origin + window.location.pathname;
  return `${base}?design=${encoded}`;
}

export function loadFromUrl() {
  const url = new URL(window.location.href);
  const design = url.searchParams.get('design');
  if (!design) return null;
  return decodeParams(design);
}

let inSession = false;
let sessionTimer = null;

export function syncUrl(params, { mode = 'auto' } = {}) {
  const url = buildShareUrl(params);
  if (mode === 'replace') {
    window.history.replaceState(null, '', url);
    return;
  }
  if (mode === 'push' || !inSession) {
    window.history.pushState(null, '', url);
    inSession = true;
  } else {
    window.history.replaceState(null, '', url);
  }
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => { inSession = false; }, 3000);
}

export function endSession() {
  clearTimeout(sessionTimer);
  inSession = false;
}

export { SHADER_SOURCE_MAX };
