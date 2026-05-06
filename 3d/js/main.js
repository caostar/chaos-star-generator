import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

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
import { populateShape, populateMaterial, populateShader, populateLighting, populateActions } from './ui.js';

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
  inspireMaterialToo: false,
  imageTransparent: true,
  speedMs: 1700,
  startTs: performance.now(),
};

// Material-related fields (preserved by Inspire when "Material too" is OFF)
const MATERIAL_KEYS = [
  'materialMode', 'shaderId', 'shaderSource', 'solidColor',
  'metalness', 'roughness',
  'textureMode', 'textureIndex', 'textureOffsetX', 'textureOffsetY',
  'textureScale', 'triplanar', 'lighting', 'backgroundColor',
];

window.__chaosphere = state;
window.__rebuildMaterial = async () => rebuildMaterial();
window.__refreshUI       = () => refreshUI();

init();

async function init() {
  installShaderErrorCapture();
  installTooltips();
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
  state.renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true,
    preserveDrawingBuffer: true, // needed for PNG export via toBlob
  });
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

const TONE_MAP_MODES = {
  none:     THREE.NoToneMapping,
  linear:   THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon:   THREE.CineonToneMapping,
  aces:     THREE.ACESFilmicToneMapping,
  agx:      THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping,
};

function setupLights() {
  state.lights = {
    hemi: new THREE.HemisphereLight(0xffffff, 0x222244, 0.85),
    dir:  new THREE.DirectionalLight(0xffffff, 1.0),
  };
  state.scene.add(state.lights.hemi);
  state.scene.add(state.lights.dir);
}

let envTexture = null;
function ensureEnv() {
  if (envTexture) return envTexture;
  const pmrem = new THREE.PMREMGenerator(state.renderer);
  pmrem.compileEquirectangularShader();
  envTexture = pmrem.fromScene(new RoomEnvironment(state.renderer), 0.04).texture;
  pmrem.dispose();
  return envTexture;
}

// Apply lighting / renderer params each frame. All cheap.
function applyLightingState() {
  const p = state.params;
  const d = state.lights.dir;
  d.color.set(p.dirColor);
  d.intensity = p.dirIntensity;
  const az = THREE.MathUtils.degToRad(p.dirAzimuth);
  const el = THREE.MathUtils.degToRad(p.dirElevation);
  d.position.set(
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az),
  ).multiplyScalar(200);

  const h = state.lights.hemi;
  h.color.set(p.hemiSky);
  h.groundColor.set(p.hemiGround);
  h.intensity = p.hemiIntensity;

  state.renderer.toneMappingExposure = p.exposure;
  const tm = TONE_MAP_MODES[p.toneMapping] ?? THREE.ACESFilmicToneMapping;
  if (state.renderer.toneMapping !== tm) {
    state.renderer.toneMapping = tm;
    if (state.material) state.material.needsUpdate = true;
  }

  const envWanted = !!p.envEnabled;
  const hasEnv = !!state.scene.environment;
  if (envWanted !== hasEnv) {
    state.scene.environment = envWanted ? ensureEnv() : null;
  }
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
  state.chaosphere.update(state.params);
  state.chaosphere.scale.setScalar(state.params.globalScale ?? 1);
  applyLightingState();

  if (state.uniforms?.iTime) {
    state.uniforms.iTime.value = t;
    state.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight, 1);
  }
  state.controls.autoRotateSpeed = state.params.rotateSpeed;
  state.controls.update();
  // Reset clear color/alpha to live values every frame; PNG export sets a
  // one-shot override and does NOT depend on this since it renders inline.
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
    const next = generateRandomParams();
    if (!state.inspireMaterialToo) {
      // Preserve current material so only the shape randomizes
      for (const k of MATERIAL_KEYS) next[k] = state.params[k];
    }
    await transitionTo(next, state.speedMs, 'push');
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

  refreshUI(); // Actions tab buttons are wired here (populateActions)
}

function refreshUI() {
  populateShape(document.getElementById('tabShape'), state.params, onParamChange);
  populateMaterial(document.getElementById('tabMaterial'), state.params, onParamChange, onTextureUpload);
  populateShader(document.getElementById('tabShader'), state.params, onShaderChange, onShaderToyImport);
  populateLighting(document.getElementById('tabLighting'), state.params, onParamChange);
  populateActions(document.getElementById('tabActions'), state.params, {
    getInspireActive: () => state.inspireActive,
    toggleInspire:    () => { state.inspireActive ? stopInspire() : startInspire(); },
    speedMs:          state.speedMs,
    setSpeedMs:       (v) => { state.speedMs = v; },
    inspireMaterialToo: state.inspireMaterialToo,
    setInspireMaterialToo: (v) => { state.inspireMaterialToo = v; },
    imageTransparent: state.imageTransparent,
    setImageTransparent: (v) => { state.imageTransparent = v; },
    onExport3D:       (fmt) => {
      toast(`Preparing ${fmt.toUpperCase()}…`);
      exportSphere(fmt, state)
        .then(() => toast(`Exported chaos-sphere.${fmt}`))
        .catch(err => toast(err.message));
    },
    onExportImage:    ({ transparent }) => exportPng(transparent),
    onCopyUrl:        () => {
      const url = buildShareUrl(state.params);
      navigator.clipboard?.writeText(url).then(() => toast('Share URL copied'));
    },
    onFullscreen:     toggleFullscreen,
  });
}

function exportPng(transparent) {
  const renderer = state.renderer;
  // Render synchronously with the chosen alpha. preserveDrawingBuffer keeps
  // these pixels alive until toBlob's async callback fires.
  if (transparent) {
    renderer.setClearColor(0x000000, 0);
  } else {
    renderer.setClearColor(state.params.backgroundColor || '#000000', 1);
  }
  renderer.render(state.scene, state.camera);
  renderer.domElement.toBlob((blob) => {
    // Restore live clear settings; animate() also resets them next frame.
    renderer.setClearColor(state.params.backgroundColor || '#000000', 1);
    if (!blob) { toast('PNG export failed'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'chaos-sphere.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Exported chaos-sphere.png');
  }, 'image/png');
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
  // Discrete material/mode flips are share-worthy → push immediately.
  // Numeric live updates stay debounced.
  const pushNow = ['materialMode', 'textureMode', 'lighting', 'triplanar', 'textureIndex'].includes(key);
  syncUrlSoon(pushNow ? 'push' : 'auto');
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
  // Push immediately so back/forward steps through shader changes and the
  // URL is share-ready right away (no 1s debounce).
  syncUrlSoon('push');
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

/* ---------- Custom instant tooltip ------------------------------------- */

function installTooltips() {
  const root = document.createElement('div');
  root.className = 'tooltip-root';
  document.body.appendChild(root);
  let active = null;

  function place(el) {
    const r = el.getBoundingClientRect();
    let x = Math.max(8, r.left);
    let y = r.bottom + 8;
    const tw = root.offsetWidth, th = root.offsetHeight;
    if (x + tw > window.innerWidth - 8)  x = window.innerWidth - tw - 8;
    if (y + th > window.innerHeight - 8) y = Math.max(8, r.top - th - 8);
    root.style.left = `${x}px`;
    root.style.top  = `${y}px`;
  }
  function show(el) {
    if (active === el) return;
    active = el;
    root.textContent = el.getAttribute('data-tooltip');
    root.classList.add('visible');
    requestAnimationFrame(() => place(el));
  }
  function hide() {
    active = null;
    root.classList.remove('visible');
  }
  document.addEventListener('mouseover', (e) => {
    const el = e.target?.closest?.('[data-tooltip]');
    if (el) show(el); else hide();
  }, true);
  document.addEventListener('mouseleave', hide, true);
  document.addEventListener('scroll',     hide, true);
  // Touch / focus accessibility
  document.addEventListener('focusin', (e) => {
    const el = e.target?.closest?.('[data-tooltip]');
    if (el) show(el);
  });
  document.addEventListener('focusout', hide);
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
