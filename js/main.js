import { PARAM_DEFS, GRADIENT_TYPES, getDefaults, generateRandomParams } from './parameters.js';
import { StarRenderer } from './star-renderer.js';
import { Tweener } from './animation.js';
import { GradientEditor } from './gradient-editor.js';
import { exportPNG } from './export.js';
import { buildShareUrl, loadFromUrl, syncUrl, endSession } from './url-codec.js';

let params = { ...getDefaults(), ...generateRandomParams() };
let renderer, tweener, gradientEditor;
let inspireActive = false;
let inspireTimer = null;
let inspireSpeed = 1700;
let firstInspireIteration = true;

function init() {
  const canvas = document.getElementById('starCanvas');
  renderer = new StarRenderer(canvas);
  tweener = new Tweener();

  const urlParams = loadFromUrl();
  if (urlParams) Object.assign(params, urlParams);

  setupResize(canvas);
  buildShapeTab();
  buildColorsTab();
  wireActionsTab();
  wirePanelChrome();
  setupWelcomeModal();
  syncControlsFromParams();
  startRenderLoop();
  setupKeyboard();
  setupZoom();
  setupHistory();
  // initial URL is the current location (preserve incoming ?design=); don't
  // push a new entry just for page load — only sync if there was no design.
  if (!urlParams) syncUrl(params, { mode: 'replace' });
}

function setupWelcomeModal() {
  const modal = document.getElementById('welcome-modal');
  const closeBtn = document.getElementById('wmClose');
  const helpBtn = document.getElementById('cpHelp');

  function open() {
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('visible'));
  }
  function close() {
    modal.classList.remove('visible');
    setTimeout(() => { modal.style.display = 'none'; }, 400);
    try { localStorage.setItem('caostar_seen', '1'); } catch {}
  }

  closeBtn.addEventListener('click', close);
  helpBtn.addEventListener('click', open);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  modal.querySelectorAll('.wm-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      close();
      if (action === 'inspire') startInspire();
      else if (action === 'random') generateOneRandomStar();
      else if (action === 'customize') {
        // already visible — just make sure panel is expanded
        document.getElementById('controls-panel').classList.remove('collapsed');
      }
    });
  });

  let seen = false;
  try { seen = localStorage.getItem('caostar_seen') === '1'; } catch {}
  // Show on first visit (unless arriving via shared design URL)
  const hasDesign = new URL(window.location.href).searchParams.has('design');
  if (!seen && !hasDesign) open();
}

const SCALE_MIN = 0.1;
const SCALE_MAX = 5;
let zoomTarget = 1;

function tweenScaleTo(target) {
  target = Math.max(SCALE_MIN, Math.min(SCALE_MAX, target));
  if (target === zoomTarget) return;
  zoomTarget = target;

  // Use a direct GSAP tween (the Tweener class is reserved for full design
  // transitions). onUpdate keeps the slider in sync with the animating value.
  gsap.killTweensOf(params, 'globalScale');
  gsap.to(params, {
    globalScale: target,
    duration: 0.3,
    ease: 'power2.out',
    onUpdate: () => {
      const slider = document.getElementById('slider-globalScale');
      const val = document.getElementById('val-globalScale');
      if (slider) slider.value = params.globalScale;
      if (val) val.textContent = formatNum(params.globalScale, 0.05);
    },
  });

  // URL reflects the target (final) value, not the animating value
  syncUrl({ ...params, globalScale: target });
}

function adjustScale(delta) {
  if (inspireActive) stopInspire();
  const base = zoomTarget ?? params.globalScale;
  tweenScaleTo(base + delta);
}

function setupZoom() {
  zoomTarget = params.globalScale;

  // --- Mouse wheel ---
  window.addEventListener('wheel', (e) => {
    if (e.target.closest('#controls-panel')) return;
    if (e.target.closest('#welcome-modal')) return;
    e.preventDefault();
    const factor = (e.ctrlKey || e.metaKey) ? 0.005 : 0.0015;
    adjustScale(-e.deltaY * factor);
  }, { passive: false });

  // --- Ctrl/Cmd +/-/0 ---
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === '=' || e.key === '+') { e.preventDefault(); adjustScale(0.1); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); adjustScale(-0.1); }
    else if (e.key === '0') { e.preventDefault(); tweenScaleTo(1); }
  });

  // --- Mobile pinch zoom ---
  let pinchStartDist = 0;
  let pinchStartScale = 1;

  function pinchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  window.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) return;
    if (e.target.closest('#controls-panel')) return;
    if (e.target.closest('#welcome-modal')) return;
    pinchStartDist = pinchDist(e.touches);
    pinchStartScale = zoomTarget ?? params.globalScale;
    if (inspireActive) stopInspire();
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2 || pinchStartDist === 0) return;
    if (e.target.closest('#controls-panel')) return;
    e.preventDefault();
    const factor = pinchDist(e.touches) / pinchStartDist;
    tweenScaleTo(pinchStartScale * factor);
  }, { passive: false });

  window.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinchStartDist = 0;
  });

  // --- iOS gesture events (additional pinch support on Safari) ---
  let gestureStartScale = 1;
  window.addEventListener('gesturestart', (e) => {
    if (e.target.closest('#controls-panel')) return;
    if (e.target.closest('#welcome-modal')) return;
    e.preventDefault();
    gestureStartScale = zoomTarget ?? params.globalScale;
    if (inspireActive) stopInspire();
  });
  window.addEventListener('gesturechange', (e) => {
    if (e.target.closest('#controls-panel')) return;
    e.preventDefault();
    tweenScaleTo(gestureStartScale * e.scale);
  });
  window.addEventListener('gestureend', (e) => {
    if (e.target.closest('#controls-panel')) return;
    e.preventDefault();
  });
}

function setupHistory() {
  window.addEventListener('popstate', () => {
    const newParams = loadFromUrl();
    if (!newParams) return;
    const merged = { ...getDefaults(), ...newParams };
    if (inspireActive) stopInspire();
    tweener.transitionTo(params, merged, 600);
    setTimeout(() => syncControlsFromParams(), 650);
    endSession();
  });
}

function setupResize() {
  function doResize() {
    renderer.resize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', doResize);
  doResize();
}

function startRenderLoop() {
  function frame() {
    renderer.render(params);
    if (tweener.isAnimating()) syncControlsFromParams();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---------- Panel chrome ---------- */

function wirePanelChrome() {
  const panel = document.getElementById('controls-panel');
  const header = document.getElementById('cpTabHeader');
  header.addEventListener('click', () => panel.classList.toggle('collapsed'));

  document.querySelectorAll('.ctrl-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ctrl-tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.ctrl-tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      document.querySelector(`[data-content="${target}"]`).classList.add('active');
    });
  });
}

/* ---------- Shape tab ---------- */

function buildShapeTab() {
  const container = document.getElementById('tabShape');
  for (const [key, def] of Object.entries(PARAM_DEFS)) {
    if (key === 'gradientRotation') continue;
    container.appendChild(createSliderRow(key, def, (value) => {
      if (key === 'globalScale') {
        gsap.killTweensOf(params, 'globalScale');
        zoomTarget = value;
      }
      params[key] = value;
      onParamChange();
    }));
  }
}

/* ---------- Colors tab ---------- */

function buildColorsTab() {
  const container = document.getElementById('tabColors');

  // Gradient type
  const typeRow = document.createElement('div');
  typeRow.className = 'cs-row';
  typeRow.innerHTML = '<div class="cs-label">Gradient Type</div>';
  const typeWrap = document.createElement('div');
  typeWrap.className = 'cs-slider-wrap';
  const typeSelect = document.createElement('select');
  typeSelect.className = 'cs-select';
  typeSelect.id = 'gradientType';
  for (const t of GRADIENT_TYPES) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    typeSelect.appendChild(opt);
  }
  typeSelect.value = params.gradientType;
  typeSelect.addEventListener('change', (e) => {
    params.gradientType = e.target.value;
    onParamChange();
  });
  typeWrap.appendChild(typeSelect);
  typeRow.appendChild(typeWrap);
  container.appendChild(typeRow);

  // Background color
  const bgRow = document.createElement('div');
  bgRow.className = 'cs-color-row';
  const bgLabel = document.createElement('div');
  bgLabel.className = 'cs-label';
  bgLabel.textContent = 'Background';
  const bgInput = document.createElement('input');
  bgInput.type = 'color';
  bgInput.id = 'bgColor';
  bgInput.className = 'cs-color';
  bgInput.value = params.backgroundColor;
  bgInput.addEventListener('input', (e) => {
    params.backgroundColor = e.target.value;
    onParamChange();
  });
  bgRow.appendChild(bgLabel);
  bgRow.appendChild(bgInput);
  container.appendChild(bgRow);

  // Gradient rotation
  const rotDef = PARAM_DEFS.gradientRotation;
  container.appendChild(createSliderRow('gradientRotation', rotDef, (value) => {
    params.gradientRotation = value;
    onParamChange();
  }));

  // Color stops
  const stopsLabel = document.createElement('div');
  stopsLabel.className = 'cs-label';
  stopsLabel.style.marginTop = '8px';
  stopsLabel.textContent = 'Color Stops';
  container.appendChild(stopsLabel);

  const gradContainer = document.createElement('div');
  gradContainer.id = 'gradientEditor';
  container.appendChild(gradContainer);

  gradientEditor = new GradientEditor(gradContainer, (stops) => {
    params.gradientStops = stops;
    onParamChange();
  });
  gradientEditor.setStops(params.gradientStops);
}

/* ---------- Actions tab ---------- */

function wireActionsTab() {
  const speedSlider = document.getElementById('speedSlider');
  const speedVal = document.getElementById('speedVal');
  speedSlider.value = inspireSpeed;
  speedVal.textContent = inspireSpeed;
  speedSlider.addEventListener('input', (e) => {
    inspireSpeed = parseInt(e.target.value);
    speedVal.textContent = inspireSpeed;
  });

  document.getElementById('reRandom').addEventListener('click', toggleInspire);
  document.getElementById('saveIt').addEventListener('click', () => {
    const transparent = document.getElementById('chooseTransparent').checked;
    exportPNG(renderer, params, !transparent);
  });
  document.getElementById('copyUrlBtn').addEventListener('click', copyShareUrl);
  document.getElementById('goFullScreen').addEventListener('click', toggleFullscreen);
}

/* ---------- Slider row factory ---------- */

function createSliderRow(key, def, onChange) {
  const row = document.createElement('div');
  row.className = 'cs-row';

  const label = document.createElement('div');
  label.className = 'cs-label';
  label.textContent = def.label;

  const wrap = document.createElement('div');
  wrap.className = 'cs-slider-wrap';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = def.min;
  slider.max = def.max;
  slider.step = def.step;
  slider.value = def.default;
  slider.className = 'cs-slider';
  slider.id = `slider-${key}`;

  const val = document.createElement('span');
  val.className = 'cs-val';
  val.id = `val-${key}`;
  val.textContent = def.default;

  slider.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    val.textContent = formatNum(v, def.step);
    onChange(v);
  });

  wrap.appendChild(slider);
  wrap.appendChild(val);
  row.appendChild(label);
  row.appendChild(wrap);
  return row;
}

function formatNum(v, step) {
  if (step >= 1) return Math.round(v);
  if (step >= 0.5) return v.toFixed(1);
  return v.toFixed(2);
}

function syncControlsFromParams() {
  for (const [key, def] of Object.entries(PARAM_DEFS)) {
    const slider = document.getElementById(`slider-${key}`);
    const val = document.getElementById(`val-${key}`);
    if (slider && params[key] !== undefined) {
      slider.value = params[key];
      if (val) val.textContent = formatNum(params[key], def.step);
    }
  }
  const bg = document.getElementById('bgColor');
  if (bg && document.activeElement !== bg) bg.value = params.backgroundColor;
  const gt = document.getElementById('gradientType');
  if (gt && params.gradientType) gt.value = params.gradientType;
  if (gradientEditor) gradientEditor.setStops(params.gradientStops);
}

/* ---------- Param change ---------- */

function onParamChange() {
  stopInspire();
  scheduleUrlSync();
}

// Write URL synchronously on every change. The session logic in url-codec
// pushes only the first event in a session and replaceStates the rest, so
// rapid drags don't pollute history while keeping URL always in sync —
// otherwise pressing Back from a not-yet-pushed state lands on the wrong page.
function scheduleUrlSync() {
  if (urlSyncRaf) return;
  urlSyncRaf = requestAnimationFrame(() => {
    urlSyncRaf = null;
    syncUrl(params);
  });
}
let urlSyncRaf = null;

/* ---------- Inspire mode ---------- */

function generateOneRandomStar() {
  if (inspireActive) stopInspire();
  const target = generateRandomParams();
  tweener.transitionTo(params, target, inspireSpeed);
  setTimeout(() => {
    syncControlsFromParams();
    syncUrl(params, { mode: 'push' });
  }, inspireSpeed + 50);
}

function toggleInspire() {
  if (inspireActive) stopInspire();
  else startInspire();
}

function startInspire() {
  inspireActive = true;
  firstInspireIteration = true;
  document.getElementById('reRandom').classList.add('active');
  document.getElementById('cpStatus').classList.add('active');
  nextInspiration();
}

function stopInspire() {
  if (!inspireActive) return; // idempotent — don't reset history session for no reason
  inspireActive = false;
  clearTimeout(inspireTimer);
  if (tweener) tweener.cancelAll();
  document.getElementById('reRandom').classList.remove('active');
  document.getElementById('cpStatus').classList.remove('active');
  endSession();
}

function nextInspiration() {
  if (!inspireActive) return;
  const target = generateRandomParams();
  tweener.transitionTo(params, target, inspireSpeed);
  inspireTimer = setTimeout(() => {
    syncControlsFromParams();
    // First inspire iteration pushes a new history entry so user can navigate
    // back to the pre-inspire state. Subsequent iterations only replace.
    if (firstInspireIteration) {
      syncUrl(params, { mode: 'push' });
      firstInspireIteration = false;
    } else {
      syncUrl(params, { mode: 'replace' });
    }
    nextInspiration();
  }, inspireSpeed + 50);
}

/* ---------- Share / view ---------- */

function copyShareUrl() {
  const url = buildShareUrl(params);
  navigator.clipboard.writeText(url).then(
    () => showToast('URL copied to clipboard'),
    () => showToast('Failed to copy URL')
  );
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
}

function toggleControls() {
  document.body.classList.toggle('controls-hidden');
}

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    switch (e.key.toLowerCase()) {
      case 'f': toggleFullscreen(); break;
      case 'h': toggleControls(); break;
      case ' ': e.preventDefault(); generateOneRandomStar(); break;
      case 'r': toggleInspire(); break;
      case 'escape':
        if (document.fullscreenElement) document.exitFullscreen();
        else if (inspireActive) stopInspire();
        break;
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
