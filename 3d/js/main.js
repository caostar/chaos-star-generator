import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { getDefaults, generateRandomParams, PARAM_DEFS, NUMERIC_KEYS, validateParams } from './parameters.js';
import { buildChaosSphereGeometry } from './sphere-builder.js';
import {
  loadVertex, loadWrapper, resolveShader, listBuiltins, fetchShaderToy,
} from './shader-manager.js';
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

init();

async function init() {
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
  } else if (params.materialMode === 'texture') {
    const tex = await loadActiveTexture();
    if (params.lighting === 'wireframe') {
      material = new THREE.MeshBasicMaterial({ wireframe: true, color: 0x4fc3f7 });
    } else if (params.lighting === 'flat') {
      material = new THREE.MeshBasicMaterial({ map: tex || null, color: tex ? 0xffffff : 0x4fc3f7 });
    } else {
      material = new THREE.MeshStandardMaterial({
        map: tex || null,
        color: tex ? 0xffffff : 0x4fc3f7,
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

  if (state.mesh) {
    state.mesh.material = material;
  } else {
    state.mesh = new THREE.Mesh(state.geometry, material);
    state.scene.add(state.mesh);
  }
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
  if (p.textureMode !== 'sample') return null;
  // Reuse 2D texture filenames. Indices map to /chaos-star-generator-files/textures/N.jpg
  const idx = p.textureIndex | 0;
  const url = idx === 0
    ? '../chaos-star-generator-files/textures/sygilexample.jpg'
    : `../chaos-star-generator-files/textures/${idx}.jpg`;
  return await new Promise((resolve) => {
    new THREE.TextureLoader().load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      resolve(t);
    }, undefined, () => resolve(null));
  });
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
  clearTimeout(urlDebounce);
  urlDebounce = setTimeout(() => {
    syncUrl(state.params, { mode });
  }, mode === 'replace' || mode === 'push' ? 0 : 1000);
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
  if (opts.shape) {
    // debounce CSG rebuilds during slider drag
    clearTimeout(state.shapeDebounce);
    state.shapeDebounce = setTimeout(() => rebuildGeometry(), 200);
  }
  if (opts.material) {
    await rebuildMaterial();
  }
  syncUrlSoon();
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
  // For v1, only sample textures from the 2D folder are supported.
  toast('Custom texture upload coming in v1.1 — using sample textures for now');
}

/* ---------- Gestures ---------- */

function setupGestures() {
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
