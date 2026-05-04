const SHORT_KEYS = {
  globalScale: 'gs',
  centerRadius: 'cr',
  barWidth: 'bw',
  barLength: 'bl',
  barSidesAngle: 'ba',
  tipWidth: 'tw',
  tipLength: 'tl',
  tipBottomAngle: 'ta',
  gradientRotation: 'gr',
  gradientStops: 'g',
  gradientType: 'gt',
  backgroundColor: 'bg',
  textureMode: 'tm',
  textureIndex: 'ti',
  textureOffsetX: 'tx',
  textureOffsetY: 'ty',
  textureScale: 'ts',
};

const REVERSE_KEYS = Object.fromEntries(
  Object.entries(SHORT_KEYS).map(([k, v]) => [v, k])
);

export function encodeParams(params) {
  const compact = {};
  for (const [key, shortKey] of Object.entries(SHORT_KEYS)) {
    if (key === 'gradientStops') {
      compact[shortKey] = params.gradientStops.map((s) => [
        Math.round(s.position * 1000) / 1000,
        s.color,
      ]);
    } else if (key === 'backgroundColor') {
      compact[shortKey] = params.backgroundColor;
    } else if (key === 'gradientType') {
      compact[shortKey] = params.gradientType;
    } else if (key === 'textureMode') {
      compact[shortKey] = params.textureMode;
    } else if (typeof params[key] === 'number') {
      compact[shortKey] = Math.round(params[key] * 100) / 100;
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
      if (fullKey === 'gradientStops') {
        params.gradientStops = value.map(([position, color]) => ({ position, color }));
      } else if (fullKey === 'backgroundColor') {
        params.backgroundColor = value;
      } else if (fullKey === 'gradientType') {
        params.gradientType = value;
      } else if (fullKey === 'textureMode') {
        params.textureMode = value;
      } else if (typeof value === 'number') {
        params[fullKey] = value;
      }
    }
    return params;
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

/* ---------- History session management ----------
 * Session-based pushState/replaceState so continuous slider drags don't
 * pollute history but discrete changes create a back-able entry.
 *
 * "auto":    push on first change of a session, replace within 1s window
 * "push":    always pushState (used to snapshot before a discrete action)
 * "replace": always replaceState (used during inspire iterations)
 */
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
  // Within this window any further auto-mode write replaces the entry rather
  // than pushing a new one. Combined with the 1s debounce in main.js this lets
  // an edit session of any length collapse into ONE history entry — the user
  // has to be idle for ~3s for the next change to start a new entry.
  sessionTimer = setTimeout(() => { inSession = false; }, 3000);
}

export function endSession() {
  clearTimeout(sessionTimer);
  inSession = false;
}
