import { PARAM_DEFS, GRADIENT_TYPES, getDefaults, generateRandomParams } from './parameters.js';
import { StarRenderer } from './star-renderer.js';
import { Tweener } from './animation.js';
import { GradientEditor } from './gradient-editor.js';
import { buildShareUrl, loadFromUrl, syncUrl, endSession } from './url-codec.js';
import { textureManager, SAMPLE_TEXTURES } from './texture-manager.js';

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
  buildTextureTab();
  setupWelcomeModal();
  syncControlsFromParams();
  startRenderLoop();
  setupKeyboard();
  setupZoom();
  setupTextureDrag();
  setupCanvasTap();
  setupHistory();
  applyTexture();
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

function setupCanvasTap() {
  const canvas = document.getElementById('starCanvas');
  const TAP_TOLERANCE = 8;
  const LONG_PRESS_MS = 600;
  let downX = 0, downY = 0, downTime = 0;
  let multiTouch = false;
  let cancelled = false;
  let feedbackTimer = null;
  let longPressReady = false;

  function onDown(x, y) {
    downX = x; downY = y; downTime = performance.now();
    cancelled = false;
    longPressReady = false;
    clearTimeout(feedbackTimer);
    // Haptic + flag at threshold; the actual save runs in onUp so
    // navigator.share() stays inside a user-gesture handler.
    feedbackTimer = setTimeout(() => {
      if (cancelled) return;
      longPressReady = true;
      if (navigator.vibrate) navigator.vibrate(40);
      showToast('Release to save image…', 1500);
    }, LONG_PRESS_MS);
  }

  function cancel() {
    cancelled = true;
    clearTimeout(feedbackTimer);
    feedbackTimer = null;
  }

  function moved(x, y) {
    const dx = Math.abs(x - downX), dy = Math.abs(y - downY);
    return dx >= TAP_TOLERANCE || dy >= TAP_TOLERANCE;
  }

  function onUp(x, y) {
    clearTimeout(feedbackTimer);
    feedbackTimer = null;
    if (cancelled) return;
    const dt = performance.now() - downTime;
    const movedToo = moved(x, y);
    if (movedToo) return; // drag, ignore
    if (dt >= LONG_PRESS_MS || longPressReady) {
      saveOrShareImage(); // call synchronously inside the up-handler
    } else {
      generateOneRandomStar();
    }
    longPressReady = false;
  }

  // ---- Mouse ----
  canvas.addEventListener('mousedown', (e) => onDown(e.clientX, e.clientY));
  canvas.addEventListener('mousemove', (e) => {
    if (feedbackTimer && moved(e.clientX, e.clientY)) cancel();
  });
  canvas.addEventListener('mouseup', (e) => onUp(e.clientX, e.clientY));
  canvas.addEventListener('mouseleave', cancel);

  // ---- Touch ----
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) { multiTouch = true; cancel(); return; }
    multiTouch = false;
    onDown(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) { cancel(); return; }
    const t = e.touches[0];
    if (feedbackTimer && moved(t.clientX, t.clientY)) cancel();
  }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (multiTouch || e.touches.length > 0) {
      multiTouch = false;
      cancel();
      return;
    }
    const t = e.changedTouches[0];
    onUp(t.clientX, t.clientY);
  });
  canvas.addEventListener('touchcancel', cancel);
}

function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches;
}

async function saveOrShareImage() {
  const transparent = document.getElementById('chooseTransparent')?.checked ?? false;
  const offscreen = renderer.renderExport(params, !transparent);

  offscreen.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], 'chaos-star.png', { type: 'image/png' });

    // Touch devices (phones/tablets): open share sheet → Save to Photos / share
    if (isTouchDevice() && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Chaos Star',
          text: 'Chaos Star Generator',
        });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // user cancelled
        // otherwise fall through to download
      }
    }

    // Desktop (or share unavailable): plain download to disk
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chaos-star.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Image downloaded');
  }, 'image/png');
}

function setupHistory() {
  window.addEventListener('popstate', () => {
    const newParams = loadFromUrl();
    if (!newParams) return;
    const merged = { ...getDefaults(), ...newParams };
    if (inspireActive) stopInspire();
    tweener.transitionTo(params, merged, 600);
    // Texture params aren't tweened — apply them immediately
    params.textureMode = merged.textureMode;
    params.textureIndex = merged.textureIndex;
    params.textureOffsetX = merged.textureOffsetX ?? 0;
    params.textureOffsetY = merged.textureOffsetY ?? 0;
    applyTexture();
    setTimeout(() => {
      syncControlsFromParams();
      refreshTextureUi();
    }, 650);
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
    if (key === 'textureScale') continue;
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

/* ---------- Texture tab ---------- */

let textureDragMode = false;

function buildTextureTab() {
  const container = document.getElementById('tabTexture');

  // None / sample / custom mode buttons row
  const modeRow = document.createElement('div');
  modeRow.className = 'cs-row';
  modeRow.innerHTML = '<div class="cs-label">Mode</div>';
  const modeBtns = document.createElement('div');
  modeBtns.className = 'tx-mode-row';
  for (const m of ['none', 'sample', 'custom']) {
    const b = document.createElement('button');
    b.className = 'ctrl-tab';
    b.dataset.mode = m;
    b.textContent = m === 'none' ? 'No texture' : m === 'sample' ? 'Sample' : 'Custom';
    b.addEventListener('click', () => setTextureMode(m));
    modeBtns.appendChild(b);
  }
  modeRow.appendChild(modeBtns);
  container.appendChild(modeRow);

  // Sample grid
  const grid = document.createElement('div');
  grid.className = 'tx-grid';
  grid.id = 'textureGrid';
  for (let i = 0; i < SAMPLE_TEXTURES.length; i++) {
    const cell = document.createElement('button');
    cell.className = 'tx-cell';
    cell.dataset.index = i;
    cell.style.backgroundImage = `url('${textureManager.sampleSrc(i)}')`;
    cell.title = `Sample ${i + 1}`;
    cell.addEventListener('click', () => {
      params.textureMode = 'sample';
      params.textureIndex = i;
      params.textureOffsetX = 0;
      params.textureOffsetY = 0;
      onParamChange();
      applyTexture();
      refreshTextureUi();
    });
    grid.appendChild(cell);
  }
  container.appendChild(grid);

  // Custom upload row
  const uploadRow = document.createElement('div');
  uploadRow.className = 'cs-row';
  uploadRow.innerHTML = '<div class="cs-label">Custom Image</div>';
  const uploadWrap = document.createElement('div');
  uploadWrap.className = 'cs-slider-wrap';
  const uploadLabel = document.createElement('label');
  uploadLabel.className = 'cp-btn';
  uploadLabel.style.flex = '1';
  uploadLabel.style.textAlign = 'center';
  uploadLabel.style.margin = '0';
  uploadLabel.textContent = '📁 Choose file…';
  const uploadInput = document.createElement('input');
  uploadInput.type = 'file';
  uploadInput.accept = 'image/*';
  uploadInput.style.display = 'none';
  uploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await textureManager.loadCustomFromFile(file);
      params.textureMode = 'custom';
      params.textureOffsetX = 0;
      params.textureOffsetY = 0;
      onParamChange();
      applyTexture();
      refreshTextureUi();
      showToast(
        "Your custom texture is stored only in this browser and won't appear " +
        'for others opening a shared link.'
      );
    } catch (err) {
      showToast('Failed to load image');
    }
    uploadInput.value = '';
  });
  uploadLabel.appendChild(uploadInput);
  uploadWrap.appendChild(uploadLabel);
  uploadRow.appendChild(uploadWrap);
  container.appendChild(uploadRow);

  // Texture scale slider (textureScale param)
  const scaleDef = PARAM_DEFS.textureScale;
  container.appendChild(createSliderRow('textureScale', scaleDef, (value) => {
    params.textureScale = value;
    onParamChange();
  }));

  // Drag mode toggle + reset position
  const dragRow = document.createElement('div');
  dragRow.className = 'cs-row';
  const dragLabel = document.createElement('label');
  dragLabel.className = 'cs-toggle-wrap';
  dragLabel.style.gap = '8px';
  const dragToggle = document.createElement('input');
  dragToggle.type = 'checkbox';
  dragToggle.id = 'textureDragMode';
  dragToggle.className = 'cs-toggle';
  dragToggle.addEventListener('change', (e) => {
    textureDragMode = e.target.checked;
    document.body.classList.toggle('texture-drag', textureDragMode);
  });
  const dragInd = document.createElement('span');
  dragInd.className = 'cs-toggle-indicator';
  const dragText = document.createElement('span');
  dragText.style.fontSize = '10px';
  dragText.style.color = '#aaa';
  dragText.textContent = 'Drag mode (move texture on canvas)';
  dragLabel.appendChild(dragToggle);
  dragLabel.appendChild(dragInd);
  dragLabel.appendChild(dragText);
  dragRow.appendChild(dragLabel);
  container.appendChild(dragRow);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'cp-btn';
  resetBtn.textContent = '⟲ Reset texture position';
  resetBtn.addEventListener('click', () => {
    params.textureOffsetX = 0;
    params.textureOffsetY = 0;
    params.textureScale = 1;
    onParamChange();
    syncControlsFromParams();
  });
  container.appendChild(resetBtn);

  refreshTextureUi();
}

function refreshTextureUi() {
  // Highlight active mode button
  document.querySelectorAll('#tabTexture [data-mode]').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === params.textureMode);
  });
  // Highlight active sample
  document.querySelectorAll('#tabTexture .tx-cell').forEach((c) => {
    const i = parseInt(c.dataset.index);
    c.classList.toggle(
      'active',
      params.textureMode === 'sample' && params.textureIndex === i
    );
  });
}

function setTextureMode(mode) {
  if (mode === params.textureMode) return;
  params.textureMode = mode;
  if (mode === 'sample' && params.textureIndex == null) params.textureIndex = 0;
  onParamChange();
  applyTexture();
  refreshTextureUi();
}

async function applyTexture() {
  try {
    if (params.textureMode === 'none') {
      renderer.setTexture(null);
      return;
    }
    if (params.textureMode === 'sample') {
      const img = await textureManager.loadSample(params.textureIndex || 0);
      renderer.setTexture(img);
      return;
    }
    if (params.textureMode === 'custom') {
      const img = await textureManager.loadStoredCustom();
      if (img) {
        renderer.setTexture(img);
      } else {
        // No custom image available (e.g. shared URL on a fresh browser)
        renderer.setTexture(null);
        params.textureMode = 'none';
        refreshTextureUi();
        showToast('Custom texture not available — pick a sample or upload your own');
      }
    }
  } catch (e) {
    renderer.setTexture(null);
  }
}

function setupTextureDrag() {
  const canvas = document.getElementById('starCanvas');

  let dragging = false;
  let startX = 0, startY = 0;
  let baseOffX = 0, baseOffY = 0;

  function shouldHandle(targetEl) {
    if (!textureDragMode) return false;
    if (params.textureMode === 'none') return false;
    if (targetEl.closest('#controls-panel')) return false;
    if (targetEl.closest('#welcome-modal')) return false;
    return true;
  }

  function start(clientX, clientY) {
    dragging = true;
    startX = clientX;
    startY = clientY;
    baseOffX = params.textureOffsetX || 0;
    baseOffY = params.textureOffsetY || 0;
  }

  function move(clientX, clientY) {
    if (!dragging) return;
    params.textureOffsetX = baseOffX + (clientX - startX);
    params.textureOffsetY = baseOffY + (clientY - startY);
    scheduleUrlSync();
  }

  function end() { dragging = false; }

  canvas.addEventListener('mousedown', (e) => {
    if (!shouldHandle(e.target)) return;
    e.preventDefault();
    start(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
  window.addEventListener('mouseup', end);

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    if (!shouldHandle(e.target)) return;
    start(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1 || !dragging) return;
    move(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('touchend', end);
  window.addEventListener('touchcancel', end);
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
  document.getElementById('saveIt').addEventListener('click', saveOrShareImage);
  document.getElementById('copyUrlBtn').addEventListener('click', copyShareUrl);
  document.getElementById('goFullScreen').addEventListener('click', toggleFullscreen);

  // Tappable shortcut rows — essential on mobile where there's no keyboard
  document.querySelectorAll('.ctrl-key-row.clickable').forEach((row) => {
    row.addEventListener('click', () => runAction(row.dataset.action));
  });
}

function runAction(action) {
  switch (action) {
    case 'random': generateOneRandomStar(); break;
    case 'inspire': toggleInspire(); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'hide': toggleControls(); break;
    case 'escape':
      if (document.fullscreenElement) document.exitFullscreen();
      else if (inspireActive) stopInspire();
      break;
  }
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
    () => {
      if (params.textureMode === 'custom') {
        showToast(
          'URL copied — note: your custom texture is stored only in this browser ' +
          'and won\'t appear for others opening the link',
          4500
        );
      } else {
        showToast('URL copied to clipboard');
      }
    },
    () => showToast('Failed to copy URL')
  );
}

function showToast(msg, duration = 10000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), duration);
  toast.onclick = () => {
    clearTimeout(toast._t);
    toast.classList.remove('show');
  };
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
