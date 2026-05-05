import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { getDefaults, generateRandomParams, PARAM_DEFS, NUMERIC_KEYS, validateParams } from './parameters.js';
import { ChaosphereMesh } from './chaosphere-mesh.js';
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
  chaosphere: null,    // ChaosphereMesh (Group)
  material: null,
  uniforms: null,
  lights:   null,
  inspireActive: false,
  inspireTimer:  null,
  speedMs: 1700,
  startTs: performance.now(),
};

window.__chaosphere = state;
window.__rebuildMaterial = async () => rebuildMaterial();
window.__refreshUI       = () => refreshUI();

init();

async function init() {
  installShaderErrorCapture();
  state.params = loadFromUrl() || generateRandomParams();

  setupRenderer();
  setupChaosphere();
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

function setupChaosphere() {
  state.chaosphere = new ChaosphereMesh();
  state.chaosphere.scale.setScalar(state.params.globalScale ?? 1);
  state.chaosphere.update(state.params);
  state.scene.add(state.chaosphere);
}

/* ---------- Material ----------------------------------------------------- */

async function rebuildMaterial() {
  const params = state.params;
  let material;

  if (params.lighting === 'wireframe') {
    material = new THREE.MeshBasicMaterial({
      wireframe: true,
      color: params.materialMode === 'solid'
        ? new THREE.Color(params.solidColor)
        : new THREE.Color(0x4fc3f7),
    });
    material.userData.kind = 'wireframe';
    state.uniforms = null;
  } else if (params.materialMode === 'shader') {
    const { vertex, fragment } = await resolveShader(params);
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
    if (!tex) {
      material = new THREE.MeshStandardMaterial({ color: 0x4fc3f7,
        metalness: params.metalness, roughness: params.roughness });
    } else if (params.triplanar) {
      const vertex   = await loadVertex();
      const fragment = await loadTriplanar();
      state.uniforms = {
        uTex:      { value: tex },
        uScale:    { value: 0.005 / Math.max(0.1, params.textureScale) },
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
      state.uniforms = null;
    } else {
      material = new THREE.MeshStandardMaterial({
        map: tex, color: 0xffffff,
        metalness: params.metalness, roughness: params.roughness,
      });
      state.uniforms = null;
    }
    material.userData.kind = 'texture';
  } else {
    // solid
    if (params.lighting === 'flat') {
      material = new THREE.MeshBasicMaterial({ color: new THREE.Color(params.solidColor) });
    } else {
      material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(params.solidColor),
        metalness: params.metalness, roughness: params.roughness,
      });
    }
    material.userData.kind = 'solid';
    state.uniforms = null;
  }

  if (state.material) state.material.dispose();
  state.material = material;
  state.chaosphere.setMaterial(material);
}

function makeUniforms() {
  return {
    iTime:           { value: 0 },
    iResolution:     { value: new THREE.Vector3(window.innerWidth, window.innerHeight, 1) },
    iMouse:          { value: new THREE.Vector4() },
    iChannel0:       { value: null },
    iChannel0Active: { value: 0 },
  };
}

async function loadActiveTexture() {
  const p = state.params;
  if (p.textureMode === 'sample') return loadSample(p.textureIndex);
  if (p.textureMode === 'custom') return loadStoredCustom();
  return null;
}

/* ---------- Lights / OrbitControls --------------------------------------- */

function setupLights() {
  const grp = new THREE.Group();
  grp.add(new THREE.HemisphereLight(0xffffff, 0x222244, 0.85));
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(60, 80, 100);
  grp.add(dir);
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

/* ---------- Per-frame loop ----------------------------------------------- */

function animate() {
  requestAnimationFrame(animate);
  const t = (performance.now() - state.startTs) / 1000;
  // Cheap parametric update: sets scales and positions only.
  state.chaosphere.update(state.params);
  state.chaosphere.scale.setScalar(state.params.globalScale ?? 1);

  if (state.uniforms?.iTime) {
    state.uniforms.iTime.value = t;
    state.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight, 1);
  }
  state.controls.autoRotateSpeed = state.params.rotateSpeed;
  state.controls.update();
  state.renderer.setClearColor(state.params.backgroundColor || '#000000', 1);
  state.renderer.render(state.scene, state.camera);
}

/* ---------- Shader error capture (unchanged) ----------------------------- */

function installShaderErrorCapture() {
  const origError = console.error.bind(console);
  let last = 0;
  console.error = (...args) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (first.startsWith('THREE.WebGLProgram')) {
      const log = args.join('\n');
      const now = performance.now();
      if (now - last > 1000) {
        last = now;
        showShaderError(extractGlslErrors(log));
        revertToLastGoodShader();
      }
      return;
    }
    origError(...args);
  };
}
function extractGlslErrors(log) {
  return log.split('\n').filter(l => /^ERROR:/.test(l.trim())).slice(0, 6).join('\n')
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
  el.textContent = log;
  el.classList.add('visible');
}
function hideShaderError() {
  document.getElementById('shaderError')?.classList.remove('visible');
}

/* ---------- Inspire mode ------------------------------------------------- */

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

/* ---------- Transitions (used by inspire / popstate / Space) ------------ */

const tweener = new Tweener({
  params: null,
  onUpdate: () => { /* params mutate; animate() picks them up */ },
  onShapeUpdate: () => {},
});

async function transitionTo(target, durationMs = state.speedMs, urlMode = 'push') {
  const next = validateParams({ ...state.params, ...target });
  // Apply non-numeric immediately
  for (const k of Object.keys(next)) {
    if (!NUMERIC_KEYS.includes(k)) state.params[k] = next[k];
  }
  await rebuildMaterial();

  // GSAP-tween numeric params; animate() reads them every frame.
  const numericTarget = {};
  for (const k of NUMERIC_KEYS) numericTarget[k] = next[k];
  tweener.params = state.params;
  tweener.to(numericTarget, durationMs);

  syncUrlSoon(urlMode);
}

/* ---------- URL sync ----------------------------------------------------- */

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
  window.addEventListener('pagehide', () => endSession());
}

/* ---------- UI wiring --------------------------------------------------- */

function setupUI() {
  document.querySelectorAll('.ctrl-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ctrl-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.ctrl-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`[data-content="${btn.dataset.tab}"]`)?.classList.add('active');
    });
  });

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
      toast(`Preparing ${btn.dataset.fmt.toUpperCase()}…`);
      exportSphere(btn.dataset.fmt, state)
        .then(() => toast(`Exported chaos-sphere.${btn.dataset.fmt}`))
        .catch(err => toast(err.message));
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

  // Per-frame animate() picks up shape changes for free — no rebuild.
  // Live updates mutate existing material/uniforms in place.
  if (opts.live) {
    liveUpdateParam(key, value);
  } else if (opts.camera && state.camera) {
    const dir = state.camera.position.clone().normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    state.camera.position.copy(dir.multiplyScalar(value));
    state.controls.update();
  } else if (opts.material) {
    if (key === 'materialMode' && value === 'texture'
        && state.params.textureMode === 'none') {
      state.params.textureMode = 'sample';
    }
    await rebuildMaterial();
  }

  if (['materialMode', 'textureMode', 'lighting', 'triplanar'].includes(key)) {
    refreshUI();
  }
  syncUrlSoon();
}

function liveUpdateParam(key, value) {
  const m = state.material;
  switch (key) {
    case 'solidColor':   m?.color?.set(value); break;
    case 'metalness':    if (m && 'metalness' in m) m.metalness = value; break;
    case 'roughness':    if (m && 'roughness' in m) m.roughness = value; break;
    case 'textureScale':
      if (state.uniforms?.uScale) state.uniforms.uScale.value = 0.005 / Math.max(0.1, value);
      if (m?.map) { m.map.repeat.setScalar(value); m.map.needsUpdate = true; }
      break;
    case 'rotateSpeed':  if (state.controls) state.controls.autoRotateSpeed = value; break;
    case 'backgroundColor': /* applied each frame in animate() */ break;
  }
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
    if (code.length > SHADER_SOURCE_MAX) toast(`Shader exceeds ${SHADER_SOURCE_MAX} byte URL limit`);
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

/* ---------- Gestures ---------------------------------------------------- */

function setupCanvasGestures() {
  const canvas = state.renderer.domElement;
  let lastTap = 0, pressTimer = null, pressed = false;

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      return;
    }
    state.lastTouchTs = performance.now();
    pressed = true;
    pressTimer = setTimeout(() => {
      if (!pressed) return;
      pressTimer = null;
      exportSphere('stl', state).catch(err => toast(err.message));
      toast('Exporting STL…');
    }, 700);
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
  window.addEventListener('keydown', (e) => {
    if (e.target?.matches?.('input, textarea, select')) return;
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

/* ---------- Toast ------------------------------------------------------- */

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
