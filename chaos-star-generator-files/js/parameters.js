export const PARAM_DEFS = {
  globalScale:    { min: 0.1, max: 5,   default: 1,   step: 0.05, label: 'Global Scale' },
  centerRadius:   { min: 0,   max: 150, default: 30,  step: 1,   label: 'Center Radius' },
  barWidth:       { min: 1,   max: 200, default: 30,  step: 1,   label: 'Bar Width' },
  barLength:      { min: 0,   max: 400, default: 120, step: 1,   label: 'Bar Length' },
  barSidesAngle:  { min: -15, max: 15,  default: 2,   step: 0.5, label: 'Bar Taper (deg)' },
  tipWidth:       { min: 1,   max: 300, default: 80,  step: 1,   label: 'Tip Width' },
  tipLength:      { min: 1,   max: 300, default: 100, step: 1,   label: 'Tip Length' },
  tipBottomAngle: { min: 0,   max: 90,  default: 30,  step: 1,   label: 'Tip Notch (deg)' },
  gradientRotation: { min: 0, max: 360, default: 0,   step: 1,   label: 'Gradient Rotation' },
  textureScale:    { min: 0.1, max: 5,  default: 1,   step: 0.05, label: 'Texture Scale' },
};

export const GRADIENT_TYPES = ['angular', 'linear', 'radial', 'solid'];

export function getDefaults() {
  const params = {};
  for (const [k, v] of Object.entries(PARAM_DEFS)) {
    params[k] = v.default;
  }
  params.gradientType = 'angular';
  params.gradientStops = [
    { color: '#00aaff', position: 0 },
    { color: '#ffffff', position: 0.5 },
    { color: '#00aaff', position: 1 },
  ];
  params.backgroundColor = '#000000';
  params.textureMode = 'none'; // 'none' | 'sample' | 'custom'
  params.textureIndex = 0;
  params.textureOffsetX = 0;
  params.textureOffsetY = 0;
  params.textureScale = 1;
  return params;
}

export function clampParam(name, value) {
  const def = PARAM_DEFS[name];
  if (!def) return value;
  return Math.min(def.max, Math.max(def.min, value));
}

export function generateRandomParams() {
  const p = {};

  p.centerRadius = randRange(5, 80);
  p.barLength = randRange(40, 300);
  p.barWidth = randRange(3, Math.min(120, p.barLength * 0.8));
  p.barSidesAngle = randRange(-10, 12);
  p.tipLength = randRange(20, 250);
  p.tipWidth = randRange(10, 250);
  p.tipBottomAngle = randRange(0, 70);
  p.gradientRotation = randRange(0, 360);

  const typeRoll = Math.random();
  if (typeRoll < 0.6) p.gradientType = 'angular';
  else if (typeRoll < 0.8) p.gradientType = 'linear';
  else if (typeRoll < 0.95) p.gradientType = 'radial';
  else p.gradientType = 'solid';

  const numUnique = randInt(2, 4);
  const hueBase = randRange(0, 360);
  const hueSpread = randRange(40, 220);
  const sat = randRange(50, 95);
  const lit = randRange(45, 80);

  p.gradientStops = [];
  for (let i = 0; i < numUnique; i++) {
    const t = i / numUnique;
    const hue = (hueBase + t * hueSpread) % 360;
    const localSat = sat + randRange(-10, 10);
    const localLit = lit + randRange(-15, 15);
    p.gradientStops.push({
      color: hslToHex(hue, clampPct(localSat), clampPct(localLit)),
      position: t,
    });
  }
  p.gradientStops.push({
    color: p.gradientStops[0].color,
    position: 1,
  });

  p.backgroundColor = '#000000';
  return p;
}

function clampPct(v) {
  return Math.max(0, Math.min(100, v));
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}
