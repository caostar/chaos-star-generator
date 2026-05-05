// UI populators — one function per tab content panel.

import { PARAM_DEFS } from './parameters.js';
import { listBuiltins, shaderLabel, loadBuiltin } from './shader-manager.js';
import { SAMPLE_TEXTURES, sampleUrl, hasCustom } from './texture-manager-3d.js';

function slider(opts) {
  const { label, min, max, step, value, onInput } = opts;
  const row = el('div', 'cs-row');
  row.appendChild(el('div', 'cs-label', label));
  const wrap = el('div', 'cs-slider-wrap');
  const input = el('input', 'cs-slider');
  input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
  const val = el('span', 'cs-val', String(value));
  input.addEventListener('input', () => { val.textContent = input.value; onInput(+input.value); });
  wrap.appendChild(input); wrap.appendChild(val); row.appendChild(wrap);
  return row;
}
function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
}

function colorRow(label, value, onChange) {
  const row = el('div', 'cs-row');
  row.appendChild(el('div', 'cs-label', label));
  const wrap = el('div', 'cs-slider-wrap');
  const input = el('input');
  input.type = 'color'; input.value = value;
  input.style.cssText = 'width:48px;height:24px;border:0;background:transparent;cursor:pointer;';
  input.addEventListener('input', () => onChange(input.value));
  wrap.appendChild(input);
  row.appendChild(wrap);
  return row;
}

function pillsRow(label, options, value, onChange) {
  const row = el('div', 'cs-row');
  row.appendChild(el('div', 'cs-label', label));
  const wrap = el('div', 'mode-pills');
  for (const opt of options) {
    const b = el('button', 'mode-pill', opt.label);
    if (opt.value === value) b.classList.add('active');
    b.addEventListener('click', () => {
      wrap.querySelectorAll('.mode-pill').forEach(p => p.classList.remove('active'));
      b.classList.add('active');
      onChange(opt.value);
    });
    wrap.appendChild(b);
  }
  row.appendChild(wrap);
  return row;
}

// Keys that require re-CSG (geometry rebuild) when changed.
const SHAPE_KEYS = new Set([
  'sphereRadius', 'sphereSegments',
  'shaftRadius', 'shaftLength', 'coneRadius', 'coneLength',
]);

export function populateShape(container, params, onChange) {
  container.replaceChildren();
  const keys = [
    'globalScale',
    'sphereRadius', 'sphereSegments',
    'shaftRadius', 'shaftLength',
    'coneRadius', 'coneLength',
    'rotateSpeed',
  ];
  for (const k of keys) {
    const def = PARAM_DEFS[k];
    container.appendChild(slider({
      label: humanize(k), min: def.min, max: def.max, step: def.step, value: params[k],
      onInput: (v) => {
        const opts = {};
        if (SHAPE_KEYS.has(k)) opts.shape = true;
        if (k === 'globalScale')   opts.scale = true;
        onChange(k, v, opts);
      },
    }));
  }
}

export function populateMaterial(container, params, onChange, onUpload) {
  container.replaceChildren();
  container.appendChild(pillsRow('Mode', [
    { label: 'Shader',  value: 'shader'  },
    { label: 'Texture', value: 'texture' },
    { label: 'Solid',   value: 'solid'   },
  ], params.materialMode, (v) => onChange('materialMode', v, { material: true })));

  if (params.materialMode === 'solid') {
    container.appendChild(colorRow('Color', params.solidColor, (v) => onChange('solidColor', v, { material: true })));
    container.appendChild(slider({ label: 'Metalness', min: 0, max: 1, step: 0.05, value: params.metalness,
      onInput: (v) => onChange('metalness', v, { material: true }) }));
    container.appendChild(slider({ label: 'Roughness', min: 0, max: 1, step: 0.05, value: params.roughness,
      onInput: (v) => onChange('roughness', v, { material: true }) }));
  }

  if (params.materialMode === 'texture') {
    const sources = [
      { label: 'None',   value: 'none'   },
      { label: 'Sample', value: 'sample' },
    ];
    if (hasCustom()) sources.push({ label: 'Custom', value: 'custom' });
    container.appendChild(pillsRow('Source', sources,
      params.textureMode, (v) => onChange('textureMode', v, { material: true })));

    if (params.textureMode === 'sample') {
      const grid = el('div', 'tex-grid');
      for (let idx = 0; idx < SAMPLE_TEXTURES.length; idx++) {
        const tile = el('div', 'tex-tile');
        tile.style.backgroundImage = `url('${sampleUrl(idx)}')`;
        if (idx === params.textureIndex) tile.classList.add('selected');
        tile.addEventListener('click', () => {
          grid.querySelectorAll('.tex-tile').forEach(t => t.classList.remove('selected'));
          tile.classList.add('selected');
          onChange('textureIndex', idx, { material: true });
        });
        grid.appendChild(tile);
      }
      container.appendChild(grid);
    }

    // Custom upload row
    const upWrap = el('div', 'cs-row');
    const upBtn = el('label', 'cp-btn');
    upBtn.style.cssText = 'flex:1; cursor:pointer; text-align:center;';
    upBtn.textContent = '↑ Upload custom image';
    const fileIn = el('input');
    fileIn.type = 'file'; fileIn.accept = 'image/*'; fileIn.style.display = 'none';
    fileIn.addEventListener('change', () => {
      if (fileIn.files?.[0]) onUpload(fileIn.files[0]);
    });
    upBtn.appendChild(fileIn);
    upWrap.style.cssText = 'margin-top:10px;';
    upWrap.appendChild(upBtn);
    container.appendChild(upWrap);

    const triRow = el('label', 'cs-toggle-wrap');
    triRow.style.cssText = 'gap:8px; margin-top:10px;';
    const cb = el('input'); cb.type = 'checkbox'; cb.className = 'cs-toggle'; cb.checked = !!params.triplanar;
    cb.addEventListener('change', () => onChange('triplanar', cb.checked, { material: true }));
    triRow.append(cb, el('span', 'cs-toggle-indicator'),
      el('span', '', 'Triplanar wrapping (no pole pinching)'));
    container.appendChild(triRow);

    container.appendChild(slider({
      label: 'Texture scale', min: PARAM_DEFS.textureScale.min, max: PARAM_DEFS.textureScale.max,
      step: PARAM_DEFS.textureScale.step, value: params.textureScale,
      onInput: (v) => onChange('textureScale', v, { material: true }),
    }));
  }

  container.appendChild(colorRow('Background', params.backgroundColor, (v) => onChange('backgroundColor', v)));
}

export function populateShader(container, params, onShaderChange, onImportUrl) {
  container.replaceChildren();

  const toolbar = el('div', 'shader-toolbar');
  const select = document.createElement('select');
  for (const { id, label } of listBuiltins()) {
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = label;
    if (id === params.shaderId) opt.selected = true;
    select.appendChild(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = 'custom'; customOpt.textContent = 'Custom…';
  if (params.shaderId === 'custom') customOpt.selected = true;
  select.appendChild(customOpt);

  select.addEventListener('change', async () => {
    if (select.value === 'custom') {
      onShaderChange('custom', textarea.value || '');
    } else {
      const src = await loadBuiltin(select.value);
      textarea.value = src;
      updateLineNumbers();
      onShaderChange(select.value, null);
    }
  });
  toolbar.appendChild(select);

  const importBtn = el('button', 'cp-btn', 'Import ShaderToy');
  importBtn.style.flex = '0 0 auto';
  importBtn.addEventListener('click', () => {
    const url = prompt('Paste a ShaderToy URL (e.g. https://www.shadertoy.com/view/XdfXRf)');
    if (url) onImportUrl(url);
  });
  toolbar.appendChild(importBtn);
  container.appendChild(toolbar);

  // Editor
  const wrap = el('div', 'shader-editor-wrap');
  const lineNums = el('div', 'shader-line-numbers');
  const textarea = el('textarea', 'shader-editor');
  textarea.spellcheck = false;
  textarea.value = params.shaderSource || '';

  if (!params.shaderSource && params.shaderId && params.shaderId !== 'custom') {
    loadBuiltin(params.shaderId).then(src => { textarea.value = src; updateLineNumbers(); }).catch(() => {});
  }

  function updateLineNumbers() {
    const lines = textarea.value.split('\n').length;
    lineNums.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  }
  updateLineNumbers();

  let debounce = null;
  textarea.addEventListener('input', () => {
    updateLineNumbers();
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      onShaderChange('custom', textarea.value);
    }, 300);
  });
  textarea.addEventListener('scroll', () => {
    lineNums.scrollTop = textarea.scrollTop;
  });
  wrap.append(lineNums, textarea);
  container.appendChild(wrap);

  const err = el('div', 'shader-error');
  err.id = 'shaderError';
  container.appendChild(err);
}

export function populateLighting(container, params, onChange) {
  container.replaceChildren();
  container.appendChild(pillsRow('Mode', [
    { label: 'Shaded',    value: 'shaded'    },
    { label: 'Flat',      value: 'flat'      },
    { label: 'Wireframe', value: 'wireframe' },
  ], params.lighting, (v) => onChange('lighting', v, { material: true })));

  if (params.materialMode === 'shader' && params.lighting !== 'wireframe') {
    const note = el('div');
    note.style.cssText = 'font-size:10px; color:rgba(255,255,255,0.45); margin:6px 0 12px; line-height:1.4;';
    note.textContent = 'Shader mode bakes its own lighting — Shaded/Flat have no effect. Wireframe always works.';
    container.appendChild(note);
  }

  container.appendChild(slider({
    label: 'Camera distance',
    min: PARAM_DEFS.cameraDistance.min, max: PARAM_DEFS.cameraDistance.max,
    step: PARAM_DEFS.cameraDistance.step, value: params.cameraDistance,
    onInput: (v) => onChange('cameraDistance', v, { camera: true }),
  }));
}

function humanize(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}
