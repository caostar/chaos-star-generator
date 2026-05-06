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

export function populateShape(container, params, onChange) {
  container.replaceChildren();
  // All shape params are now live: animate() reads them every frame and the
  // ChaosphereMesh applies them via cheap mesh.scale / position updates.
  // No CSG, no debounce, no fade.
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
      onInput: (v) => onChange(k, v, { live: true }),
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
    container.appendChild(colorRow('Color', params.solidColor, (v) => onChange('solidColor', v, { live: true })));
    container.appendChild(slider({ label: 'Metalness', min: PARAM_DEFS.metalness.min, max: PARAM_DEFS.metalness.max,
      step: PARAM_DEFS.metalness.step, value: params.metalness,
      onInput: (v) => onChange('metalness', v, { live: true }) }));
    container.appendChild(slider({ label: 'Roughness', min: PARAM_DEFS.roughness.min, max: PARAM_DEFS.roughness.max,
      step: PARAM_DEFS.roughness.step, value: params.roughness,
      onInput: (v) => onChange('roughness', v, { live: true }) }));
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
      onInput: (v) => onChange('textureScale', v, { live: true }),
    }));
  }

  container.appendChild(colorRow('Background', params.backgroundColor, (v) => onChange('backgroundColor', v, { live: true })));
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

// =============================================================================
//  Actions tab — Inspire / Export 3D / Export Image / Share & Window
// =============================================================================

const FORMAT_INFO = {
  stl: {
    label: 'STL',
    forPrinting: true,
    tooltip:
      'STL — Standard Tessellation Language\n\n' +
      'The de-facto standard for 3D printing. Pure triangles, no color, no materials.\n' +
      'Watertight: CSG-unioned before export so slicers see one solid body.\n\n' +
      'Opens in: PrusaSlicer, Bambu Studio, Cura, OrcaSlicer, Blender, MeshMixer.\n' +
      'Best for: 3D printing — your safest bet.\n' +
      'Trade-off: no color or texture data.',
  },
  '3mf': {
    label: '3MF',
    forPrinting: true,
    tooltip:
      '3MF — 3D Manufacturing Format\n\n' +
      "STL's modern successor. Supports color, multiple materials, units, " +
      'metadata. Watertight via CSG before export.\n\n' +
      'Opens in: PrusaSlicer, Bambu Studio, Microsoft 3D Builder, Blender.\n' +
      'Best for: color 3D printing — recommended over STL on a multi-material printer.',
  },
  glb: {
    label: 'GLB',
    forPrinting: false,
    tooltip:
      'GLB — Binary glTF 2.0\n\n' +
      'Modern web/AR/realtime format. Preserves materials, textures, scene graph.\n' +
      'Exports the parametric Group as-is (8 arrows + sphere) — not watertight.\n\n' +
      'Opens in: gltf-viewer.donmccurdy.com, Blender, Three.js apps, Unreal, Unity, model-viewer.\n' +
      'Best for: sharing online or embedding in a 3D scene.\n' +
      'Not great for 3D printing — most slicers reject it or mis-handle the meshes.',
  },
  obj: {
    label: 'OBJ',
    forPrinting: false,
    tooltip:
      'OBJ — Wavefront\n\n' +
      'Plain-text universal mesh format from the early 90s. No embedded materials\n' +
      "in this export. Larger files than GLB. Exports the Group as-is — not watertight.\n\n" +
      'Opens in: Blender, Maya, 3ds Max, MeshLab, virtually any 3D software.\n' +
      'Best for: archival, hand-editing in older tools.\n' +
      'Some slicers accept it for 3D printing, but STL/3MF are safer.',
  },
};

function section(title) {
  const wrap = el('div', 'actions-section');
  wrap.appendChild(el('div', 'actions-section-title', title));
  return wrap;
}

export function populateActions(container, params, ctx) {
  // ctx provides: getInspireActive, toggleInspire, speedMs, setSpeedMs,
  //   inspireMaterialToo, setInspireMaterialToo,
  //   onExport3D(format), onExportImage({ transparent }), onCopyUrl, onFullscreen
  container.replaceChildren();

  // --- Inspire section
  const inspire = section('Inspire');
  const inspBtn = el('button', 'cp-btn cp-btn-start', '⟳ Inspire me randomly');
  inspBtn.id = 'reRandom';
  if (ctx.getInspireActive()) inspBtn.classList.add('active');
  inspBtn.addEventListener('click', () => {
    ctx.toggleInspire();
    inspBtn.classList.toggle('active', ctx.getInspireActive());
  });
  inspire.appendChild(inspBtn);

  inspire.appendChild(slider({
    label: 'Transition (ms)', min: 100, max: 3000, step: 50, value: ctx.speedMs,
    onInput: (v) => ctx.setSpeedMs(v),
  }));

  const matRow = el('label', 'cs-toggle-wrap');
  matRow.style.cssText = 'gap:8px; margin-top:6px;';
  matRow.title = 'When off, only the shape randomizes — your current shader / texture / colour stays put.';
  const matCb = el('input');
  matCb.type = 'checkbox'; matCb.className = 'cs-toggle';
  matCb.checked = ctx.inspireMaterialToo;
  matCb.addEventListener('change', () => ctx.setInspireMaterialToo(matCb.checked));
  matRow.append(matCb, el('span', 'cs-toggle-indicator'),
    el('span', '', 'Material too'));
  inspire.appendChild(matRow);

  container.appendChild(inspire);

  // --- Export 3D section
  const ex3d = section('Export 3D');
  const intro = el('div');
  intro.style.cssText = 'font-size:10px; color:rgba(255,255,255,0.45); margin-bottom:6px; line-height:1.4;';
  intro.textContent = 'Hover a button for what each format is, what opens it, and whether it prints well.';
  ex3d.appendChild(intro);

  const grid = el('div', 'export-grid');
  for (const fmt of ['stl', '3mf', 'glb', 'obj']) {
    const info = FORMAT_INFO[fmt];
    const btn = el('button', 'cp-btn export-btn');
    btn.dataset.fmt = fmt;
    btn.textContent = `↓ ${info.label}${info.forPrinting ? ' ⚙' : ''}`;
    btn.title = info.tooltip;
    btn.addEventListener('click', () => ctx.onExport3D(fmt));
    grid.appendChild(btn);
  }
  ex3d.appendChild(grid);
  const printNote = el('div');
  printNote.style.cssText = 'font-size:9px; color:rgba(255,255,255,0.35); margin-top:6px;';
  printNote.textContent = '⚙ = slicer-ready (watertight CSG union)';
  ex3d.appendChild(printNote);
  container.appendChild(ex3d);

  // --- Export Image section
  const exImg = section('Export Image');
  const transparentRow = el('label', 'cs-toggle-wrap');
  transparentRow.style.cssText = 'gap:8px; margin-bottom:8px;';
  transparentRow.title = 'On = transparent PNG (no background colour). Off = include the current background.';
  const transCb = el('input');
  transCb.type = 'checkbox'; transCb.className = 'cs-toggle';
  transCb.checked = !!ctx.imageTransparent;
  transCb.addEventListener('change', () => ctx.setImageTransparent(transCb.checked));
  transparentRow.append(transCb, el('span', 'cs-toggle-indicator'),
    el('span', '', 'Transparent background'));
  exImg.appendChild(transparentRow);

  const pngBtn = el('button', 'cp-btn');
  pngBtn.style.width = '100%';
  pngBtn.textContent = '↓ Save PNG';
  pngBtn.title = 'PNG screenshot of the current canvas at native resolution. Optional alpha channel.';
  pngBtn.addEventListener('click', () => ctx.onExportImage({ transparent: !!ctx.imageTransparent }));
  exImg.appendChild(pngBtn);
  container.appendChild(exImg);

  // --- Share / Window section
  const share = section('Share & Window');
  const copyBtn = el('button', 'cp-btn');
  copyBtn.id = 'copyUrlBtn';
  copyBtn.style.cssText = 'width:100%; margin-bottom:6px;';
  copyBtn.textContent = '⌘ Copy share URL';
  copyBtn.addEventListener('click', () => ctx.onCopyUrl());
  share.appendChild(copyBtn);

  const fsBtn = el('button', 'cp-btn hiddenOnMobile');
  fsBtn.id = 'goFullScreen';
  fsBtn.style.width = '100%';
  fsBtn.textContent = '⛶ Full screen';
  fsBtn.addEventListener('click', () => ctx.onFullscreen());
  share.appendChild(fsBtn);
  container.appendChild(share);
}
