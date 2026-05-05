import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { getDefaults, generateRandomParams, PARAM_DEFS, NUMERIC_KEYS, validateParams } from './parameters.js';
import { buildChaosSphereGeometry } from './sphere-builder.js';
import {
  loadVertex, loadWrapper, loadTriplanar, resolveShader, listBuiltins, fetchShaderToy,
} from './shader-manager.js';
import {
  loadSample, loadStoredCustom, setCustomFromFile, hasCustom, clearCustom, SAMPLE_TEXTURES,
} from './texture-manager-3d.js';
import { Tweener } from './animation.js';
import { syncUrl, loadFromUrl, endSession, buildShareUrl, SHADER_SOURCE_MAX } from './url-codec-3d.js';
import { exportSphere } from './exporters.js';
import { populateShape, populateMaterial, populateShader, populateLighting } from './ui.js';

const state = {
  params: getDefaults(),
  scene:    null,
  camera:   null,
  renderer: null,
  controls: null,
  mesh:     null,
  material: null,
  uniforms: null,
  geometry: null,
  lights:   null,
  textureMap: null,
  inspireActive: false,
  inspireTimer:  null,
  speedMs: 1700,
  rebuildScheduled: false,
  shapeRebuildScheduled: false,
  lastShaderSource: null,
  lastTouchTs: 0,
  startTs: performance.now(),
};

window.__chaosphere = state; // debug handle
window.__rebuildMaterial = async () => rebuildMaterial();
window.__rebuildGeometry = async () => rebuildGeometry();
window.__refreshUI       = () => refreshUI();

init();

async function init() {
  installShaderErrorCapture();
  const fromUrl = loadFromUrl();
  state.params = fromUrl || generateRandomParams();

  setupRenderer();
  await rebuildGeometry();
  await rebuildMaterial();
  setupLights();
  setupControls();
  setupGestures();
  setupUI();
  setupHistory();

  animate();
  syncUrlSoon('replace');
}

function setupRenderer() {
  const canvas = document.getElementById('sphereCanvas');
  state.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  state.renderer.setSize(window.innerWidth, window.innerHeight, false);
  state.renderer.setClearColor(state.params.backgroundColor || '#000000', 1);

  state.scene = new THREE.Scene();
  state.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 5000);
  state.camera.position.set(0, 0, state.params.cameraDistance);

  window.addEventListener('resize', onResize);
}

function onResize() {
  state.renderer.setSize(window.innerWidth, window.innerHeight, false);
  state.camera.aspect = window.innerWidth / window.innerHeight;
  state.camera.updateProjectionMatrix();
}

async function rebuildGeometry() {
  const geom = buildChaosSphereGeometry(state.params);
  if (state.geometry) state.geometry.dispose();
  state.geometry = geom;
  if (state.mesh) state.mesh.geometry = geom;
}

async function rebuildMaterial() {
  const params = state.params;
  let material;
  state.lastShaderError = null;

  if (params.materialMode === 'shader') {
    const { vertex, fragment, source } = await resolveShader(params);
    state.lastShaderSource = source;
    state.uniforms = makeUniforms();
    material = new THREE.ShaderMaterial({
      uniforms: state.uniforms,
      vertexShader: vertex,
      fragmentShader: fragment,
      side: THREE.DoubleSide,
      transparent: false,
    });
    material.userData.kind = 'shader';
    state.lastGoodShader = { vertex, fragment };
    hideShaderError();
  } else if (params.materialMode === 'texture') {
    const tex = await loadActiveTexture();
    if (!tex || params.lighting === 'wireframe') {
      material = new THREE.MeshBasicMaterial({
        wireframe: params.lighting === 'wireframe',
        color: tex ? 0xffffff : 0x4fc3f7,
        map: !tex ? null : (params.lighting === 'wireframe' ? null : tex),
      });
    } else if (params.triplanar) {
      const vertex = await loadVertex();
      const fragment = await loadTriplanar();
      state.uniforms = {
        uTex:      { value: tex },
        uScale:    { value: 0.04 / Math.max(0.1, params.textureScale) },
        uOffset:   { value: new THREE.Vector2(params.textureOffsetX, params.textureOffsetY) },
        uLightDir: { value: new THREE.Vector3(0.5, 1.0, 0.7).normalize() },
        uShaded:   { value: params.lighting === 'flat' ? 0 : 1 },
      };
      material = new THREE.ShaderMaterial({
        uniforms: state.uniforms,
        vertexShader: vertex,
        fragmentShader: fragment,
        side: THREE.DoubleSide,
      });
    } else if (params.lighting === 'flat') {
      material = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff });
    } else {
      material = new THREE.MeshStandardMaterial({
        map: tex,
        color: 0xffffff,
        metalness: params.metalness,
        roughness: params.roughness,
      });
    }
    material.userData.kind = 'texture';
  } else {
    if (params.lighting === 'wireframe') {
      material = new THREE.MeshBasicMaterial({ wireframe: true, color: new THREE.Color(params.solidColor) });
    } else if (params.lighting === 'flat') {
      material = new THREE.MeshBasicMaterial({ color: new THREE.Color(params.solidColor) });
    } else {
      material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(params.solidColor),
        metalness: params.metalness,
        roughness: params.roughness,
      });
    }
    material.userData.kind = 'solid';
  }

  if (state.material) state.material.dispose();
  state.material = material;

  // Lighting=wireframe overrides any material with a white wireframe so it
  // works regardless of the chosen material mode.
  if (params.lighting === 'wireframe') {
    if (state.material) state.material.dispose();
    material = new THREE.MeshBasicMaterial({
      wireframe: true,
      color: params.materialMode === 'solid' ? new THREE.Color(params.solidColor) : 0x4fc3f7,
    });
    material.userData.kind = 'wireframe';
    state.material = material;
  }

  if (state.mesh) {
    state.mesh.material = material;
    state.mesh.scale.setScalar(params.globalScale ?? 1);
  } else {
    state.mesh = new THREE.Mesh(state.geometry, material);
    state.mesh.scale.setScalar(params.globalScale ?? 1);
    state.scene.add(state.mesh);
  }
  // Trigger compilation; check for errors a tick later (Three.js attaches
  // material.program after the next render).
  setTimeout(() => checkShaderErrors(), 50);
}

function checkShaderErrors() { /* now driven by installShaderErrorCapture */ }

// Hook console.error to detect THREE.WebGLProgram shader errors. When one
// fires while we're in shader mode with custom code, surface the GLSL error
// in the editor and revert to the last-good shader so the canvas keeps rendering.
function installShaderErrorCapture() {
  const origError = console.error.bind(console);
  let suppressedSince = 0;
  console.error = (...args) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (first.startsWith('THREE.WebGLProgram')) {
      const log = args.join('\n');
      const concise = extractGlslErrors(log);
      // Throttle to one per second; Three.js re-fires every frame
      const now = performance.now();
      if (now - suppressedSince > 1000) {
        suppressedSince = now;
        showShaderError(concise);
        revertToLastGoodShader();
      }
      return;
    }
    origError(...args);
  };
}

function extractGlslErrors(log) {
  const lines = log.split('\n');
  return lines.filter(l => /^ERROR:/.test(l.trim())).slice(0, 6).join('\n')
      || log.slice(0, 600);
}

function revertToLastGoodShader() {
  const last = state.lastGoodShader;
  if (!last || !state.material || state.material.type !== 'ShaderMaterial') return;
  state.material.fragmentShader = last.fragment;
  state.material.vertexShader   = last.vertex;
  state.material.needsUpdate = true;
}

function showShaderError(log) {
  const el = document.getElementById('shaderError');
  if (!el) return;
  // Strip Three.js internal prefix lines, keep just GLSL errors
  const concise = log.split('\n')
    .filter(line => /ERROR|WARN|^\d/.test(line))
    .slice(0, 10).join('\n');
  el.textContent = concise || log.slice(0, 800);
  el.classList.add('visible');
}
function hideShaderError() {
  document.getElementById('shaderError')?.classList.remove('visible');
}

function makeUniforms() {
  return {
    iTime:        { value: 0 },
    iResolution:  { value: new THREE.Vector3(window.innerWidth, window.innerHeight, 1) },
    iMouse:       { value: new THREE.Vector4() },
    iChannel0:    { value: null },
    iChannel0Active: { value: 0 },
  };
}

async function loadActiveTexture() {
  const p = state.params;
  if (p.textureMode === 'sample') return loadSample(p.textureIndex);
  if (p.textureMode === 'custom') return loadStoredCustom();
  return null;
}

function setupLights() {
  const grp = new THREE.Group();
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222244, 0.85);
  const dir  = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(60, 80, 100);
  grp.add(hemi, dir);
  state.scene.add(grp);
  state.lights = grp;
}

function setupControls() {
  state.controls = new OrbitControls(state.camera, state.renderer.domElement);
  state.controls.enableDamping = true;
  state.controls.dampingFactor = 0.08;
  state.controls.autoRotate = true;
  state.controls.autoRotateSpeed = state.params.rotateSpeed;
  state.controls.minDistance = PARAM_DEFS.cameraDistance.min;
  state.controls.maxDistance = PARAM_DEFS.cameraDistance.max;
  state.controls.addEventListener('change', () => {
    state.params.cameraDistance = state.camera.position.length();
    syncUrlSoon();
  });
  state.controls.addEventListener('start', () => stopInspire());
}

function animate() {
  requestAnimationFrame(animate);
  const t = (performance.now() - state.startTs) / 1000;
  if (state.uniforms) {
    state.uniforms.iTime.value = t;
    state.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight, 1);
  }
  state.controls.autoRotateSpeed = state.params.rotateSpeed;
  state.controls.update();
  state.renderer.setClearColor(state.params.backgroundColor || '#000000', 1);
  state.renderer.render(state.scene, state.camera);
}

/* ---------- Inspire mode ---------- */

function startInspire() {
  state.inspireActive = true;
  document.getElementById('reRandom')?.classList.add('active');
  scheduleNextInspire(0);
}

function stopInspire() {
  if (!state.inspireActive) return;
  state.inspireActive = false;
  document.getElementById('reRandom')?.classList.remove('active');
  if (state.inspireTimer) { clearTimeout(state.inspireTimer); state.inspireTimer = null; }
}

function scheduleNextInspire(delay = state.speedMs) {
  if (!state.inspireActive) return;
  state.inspireTimer = setTimeout(async () => {
    if (!state.inspireActive) return;
    await transitionTo(generateRandomParams(), state.speedMs, 'push');
    scheduleNextInspire();
  }, delay);
}

/* ---------- Transitions ---------- */

const tweener = new Tweener({
  params: null,
  onUpdate: () => {
    state.rebuildScheduled = true;
  },
  onShapeUpdate: () => { state.shapeRebuildScheduled = true; },
});

async function transitionTo(target, durationMs = state.speedMs, urlMode = 'push') {
  const next = validateParams({ ...state.params, ...target });
  // Apply non-numeric immediately and rebuild material first so the tween
  // shows the new look right away.
  const numericTarget = {};
  for (const k of NUMERIC_KEYS) numericTarget[k] = next[k];
  for (const k of Object.keys(next)) {
    if (!NUMERIC_KEYS.includes(k)) state.params[k] = next[k];
  }
  await rebuildMaterial();
  // also rebuild geometry if shape changed at the discrete level (segments)
  await rebuildGeometry();

  tweener.params = state.params;
  tweener.to(numericTarget, durationMs);

  // shape geometry rebuilds happen after tween completes (avoids per-frame CSG)
  setTimeout(() => {
    if (state.shapeRebuildScheduled) {
      state.shapeRebuildScheduled = false;
      rebuildGeometry();
    }
  }, durationMs + 50);

  syncUrlSoon(urlMode);
}

/* ---------- URL sync (1s debounce, 3s session) ---------- */

let urlDebounce = null;
function syncUrlSoon(mode = 'auto') {
  if (mode === 'push' || mode === 'replace') {
    clearTimeout(urlDebounce);
    syncUrl(state.params, { mode });
    return;
  }
  clearTimeout(urlDebounce);
  urlDebounce = setTimeout(() => syncUrl(state.params, { mode: 'auto' }), 1000);
}

function setupHistory() {
  window.addEventListener('popstate', async () => {
    const fromUrl = loadFromUrl();
    if (!fromUrl) return;
    stopInspire();
    await transitionTo(fromUrl, 700, 'replace');
    refreshUI();
  });
  window.addEventListener('pagehide', () => { endSession(); });
}

/* ---------- UI wiring ---------- */

function setupUI() {
  // Tab switching
  document.querySelectorAll('.ctrl-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ctrl-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.ctrl-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`[data-content="${btn.dataset.tab}"]`)?.classList.add('active');
    });
  });

  // Header click toggles body
  const cpBody = document.getElementById('cpBody');
  document.getElementById('cpTabHeader')?.addEventListener('click', () => {
    cpBody.style.display = cpBody.style.display === 'none' ? '' : 'none';
  });

  refreshUI();

  document.getElementById('reRandom')?.addEventListener('click', () => {
    if (state.inspireActive) stopInspire(); else startInspire();
  });
  const speedSlider = document.getElementById('speedSlider');
  const speedVal = document.getElementById('speedVal');
  speedSlider?.addEventListener('input', () => {
    state.speedMs = +speedSlider.value;
    speedVal.textContent = speedSlider.value;
  });

  document.querySelectorAll('.export-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      exportSphere(btn.dataset.fmt, state).catch(err => toast(err.message));
    });
  });
  document.getElementById('copyUrlBtn')?.addEventListener('click', () => {
    const url = buildShareUrl(state.params);
    navigator.clipboard?.writeText(url).then(() => toast('Share URL copied'));
  });
  document.getElementById('goFullScreen')?.addEventListener('click', toggleFullscreen);
}

function refreshUI() {
  populateShape(document.getElementById('tabShape'), state.params, onParamChange);
  populateMaterial(document.getElementById('tabMaterial'), state.params, onParamChange, onTextureUpload);
  populateShader(document.getElementById('tabShader'), state.params, onShaderChange, onShaderToyImport);
  populateLighting(document.getElementById('tabLighting'), state.params, onParamChange);
}

async function onParamChange(key, value, opts = {}) {
  state.params[key] = value;

  // Live-update path: mutate existing material/uniforms in place. Used for
  // anything that can be tweaked without recreating the material — keeps
  // slider drags buttery smooth.
  if (opts.live) {
    liveUpdateParam(key, value);
    syncUrlSoon();
    return;
  }

  if (opts.shape) {
    // Smooth CSG swap: fade material out, rebuild, fade back in.
    clearTimeout(state.shapeDebounce);
    state.shapeDebounce = setTimeout(() => smoothShapeRebuild(), 220);
  }
  if (opts.scale && state.mesh) {
    // GSAP-tween mesh.scale from current to target so globalScale slider feels fluid
    window.gsap.killTweensOf(state.mesh.scale);
    window.gsap.to(state.mesh.scale, {
      x: value, y: value, z: value,
      duration: 0.18, ease: 'power2.out',
      overwrite: 'auto',
    });
  }
  if (opts.camera && state.camera) {
    window.gsap.killTweensOf(state.camera.position);
    const dir = state.camera.position.clone().normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    const target = dir.multiplyScalar(value);
    window.gsap.to(state.camera.position, {
      x: target.x, y: target.y, z: target.z,
      duration: 0.25, ease: 'power2.out',
      onUpdate: () => state.controls.update(),
    });
  }
  if (opts.material) {
    if (key === 'materialMode') {
      if (value === 'texture' && state.params.textureMode === 'none') {
        state.params.textureMode = 'sample';
      }
    }
    await rebuildMaterial();
  }
  if (['materialMode', 'textureMode', 'lighting', 'triplanar'].includes(key)) {
    refreshUI();
  }
  syncUrlSoon();
}

// Mutate existing material/uniforms in place — no rebuild, no garbage.
function liveUpdateParam(key, value) {
  const m = state.material;
  switch (key) {
    case 'solidColor':
      m?.color?.set(value);
      break;
    case 'metalness':
      if (m && 'metalness' in m) m.metalness = value;
      break;
    case 'roughness':
      if (m && 'roughness' in m) m.roughness = value;
      break;
    case 'textureScale':
      if (state.uniforms?.uScale) state.uniforms.uScale.value = 0.04 / Math.max(0.1, value);
      if (m?.map) {
        m.map.repeat.setScalar(value);
        m.map.needsUpdate = true;
      }
      break;
    case 'rotateSpeed':
      if (state.controls) state.controls.autoRotateSpeed = value;
      break;
    case 'backgroundColor':
      // applied each frame in animate()
      break;
  }
}

// Smooth CSG swap: fade out → rebuild geometry → fade back in.
let smoothInFlight = false;
async function smoothShapeRebuild() {
  if (smoothInFlight) return;
  smoothInFlight = true;
  const fadeable = state.material;
  const startOpacity = fadeable?.opacity ?? 1;
  const fadeOut = (fadeable && 'opacity' in fadeable)
    ? new Promise(r => window.gsap.to(fadeable, {
        opacity: 0.15, duration: 0.12, ease: 'power2.in',
        onStart: () => { fadeable.transparent = true; },
        onComplete: r,
      }))
    : Promise.resolve();
  await fadeOut;
  await rebuildGeometry();
  if (fadeable && 'opacity' in fadeable) {
    window.gsap.to(fadeable, {
      opacity: startOpacity, duration: 0.18, ease: 'power2.out',
      onComplete: () => {
        if (startOpacity >= 1) fadeable.transparent = false;
      },
    });
  }
  smoothInFlight = false;
}

async function onShaderChange(shaderId, source) {
  state.params.shaderId = shaderId;
  state.params.shaderSource = shaderId === 'custom' ? source : null;
  state.params.materialMode = 'shader';
  await rebuildMaterial();
  syncUrlSoon();
}

async function onShaderToyImport(url) {
  try {
    const code = await fetchShaderToy(url);
    if (code.length > SHADER_SOURCE_MAX) {
      toast(`Shader exceeds ${SHADER_SOURCE_MAX} byte URL limit`);
    }
    await onShaderChange('custom', code);
    refreshUI();
  } catch (e) {
    toast(`ShaderToy import failed: ${e.message}`);
  }
}

async function onTextureUpload(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('That doesn\'t look like an image'); return; }
  if (file.size > 8 * 1024 * 1024) { toast('Image is over 8MB — try a smaller file'); return; }
  await setCustomFromFile(file);
  state.params.textureMode = 'custom';
  state.params.materialMode = 'texture';
  await rebuildMaterial();
  refreshUI();
  syncUrlSoon();
  toast('Custom texture applied — won\'t travel through share URL');
}

/* ---------- Gestures ---------- */

function setupCanvasGestures() {
  const canvas = state.renderer.domElement;
  let lastTap = 0;
  let pressTimer = null;
  let pressed = false;

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      return;
    }
    state.lastTouchTs = performance.now();
    pressed = true;
    // Long press → save STL (or share on mobile)
    pressTimer = setTimeout(() => {
      if (!pressed) return;
      pressTimer = null;
      exportSphere('stl', state).catch(err => toast(err.message));
      toast('Exported STL');
    }, 700);

    // Double tap → toggle controls (matches 2D app's mobile UX)
    const now = performance.now();
    if (now - lastTap < 350) {
      e.preventDefault();
      toggleControls();
      lastTap = 0;
    } else {
      lastTap = now;
    }
  }, { passive: false });

  const cancel = () => { pressed = false; if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
  canvas.addEventListener('touchmove',   cancel, { passive: true });
  canvas.addEventListener('touchend',    cancel, { passive: true });
  canvas.addEventListener('touchcancel', cancel, { passive: true });
}

function setupGestures() {
  setupCanvasGestures();
  // Space → random / Click → random / R → toggle inspire / F → fullscreen / H → hide controls
  window.addEventListener('keydown', (e) => {
    if (e.target?.matches('input, textarea, select')) return;
    if (e.code === 'Space') { e.preventDefault(); transitionTo(generateRandomParams(), state.speedMs, 'push'); }
    else if (e.key === 'r' || e.key === 'R') { state.inspireActive ? stopInspire() : startInspire(); }
    else if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); }
    else if (e.key === 'h' || e.key === 'H') { toggleControls(); }
    else if (e.key === 'w' || e.key === 'W') {
      state.params.lighting = state.params.lighting === 'wireframe' ? 'shaded' : 'wireframe';
      rebuildMaterial(); refreshUI(); syncUrlSoon();
    }
    else if (e.key === 't' || e.key === 'T') {
      state.controls.autoRotate = !state.controls.autoRotate;
    }
    else if (e.key === 'Escape') { stopInspire(); if (document.fullscreenElement) document.exitFullscreen(); }
  });
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}
function toggleControls() {
  document.body.classList.toggle('controls-hidden');
}

/* ---------- Toast ---------- */

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 10000);
  el.onclick = () => el.classList.remove('visible');
}

/* ---------- Per-frame rebuild trigger ---------- */
function rebuildLoop() {
  requestAnimationFrame(rebuildLoop);
  if (state.rebuildScheduled) {
    state.rebuildScheduled = false;
    if (state.material?.userData.kind === 'solid' && state.material.color) {
      state.material.color.set(state.params.solidColor);
    }
    if (state.uniforms) {
      // nothing per-frame here — handled in animate()
    }
  }
}
rebuildLoop();
