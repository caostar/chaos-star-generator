// UI populators — one function per tab content panel.

import { PARAM_DEFS, TONE_MAPPING_IDS } from './parameters.js';
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

function subSection(title) {
  const w = el('div', 'light-subsection');
  w.appendChild(el('div', 'light-subsection-title', title));
  return w;
}

function selectRow(label, options, value, onChange) {
  const row = el('div', 'cs-row');
  row.appendChild(el('div', 'cs-label', label));
  const wrap = el('div', 'cs-slider-wrap');
  const sel = document.createElement('select');
  sel.style.cssText = 'flex:1; background:rgba(0,0,0,0.5); color:#d8e6f5; border:1px solid rgba(255,255,255,0.1); border-radius:3px; font-family:inherit; font-size:11px; padding:3px 6px;';
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value; o.textContent = opt.label;
    if (opt.value === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  wrap.appendChild(sel);
  row.appendChild(wrap);
  return row;
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
    note.textContent = 'Shader mode bakes its own lighting — most controls below only affect Texture and Solid modes. Camera distance, exposure, tone mapping, and environment work everywhere.';
    container.appendChild(note);
  }

  container.appendChild(slider({
    label: 'Camera distance',
    min: PARAM_DEFS.cameraDistance.min, max: PARAM_DEFS.cameraDistance.max,
    step: PARAM_DEFS.cameraDistance.step, value: params.cameraDistance,
    onInput: (v) => onChange('cameraDistance', v, { camera: true }),
  }));

  // ---- Directional light
  const dir = subSection('Directional Light (sun)');
  dir.appendChild(colorRow('Color',
    params.dirColor, (v) => onChange('dirColor', v, { live: true })));
  dir.appendChild(slider({
    label: 'Intensity', min: PARAM_DEFS.dirIntensity.min, max: PARAM_DEFS.dirIntensity.max,
    step: PARAM_DEFS.dirIntensity.step, value: params.dirIntensity,
    onInput: (v) => onChange('dirIntensity', v, { live: true }),
  }));
  dir.appendChild(slider({
    label: 'Azimuth (°)', min: PARAM_DEFS.dirAzimuth.min, max: PARAM_DEFS.dirAzimuth.max,
    step: PARAM_DEFS.dirAzimuth.step, value: params.dirAzimuth,
    onInput: (v) => onChange('dirAzimuth', v, { live: true }),
  }));
  dir.appendChild(slider({
    label: 'Elevation (°)', min: PARAM_DEFS.dirElevation.min, max: PARAM_DEFS.dirElevation.max,
    step: PARAM_DEFS.dirElevation.step, value: params.dirElevation,
    onInput: (v) => onChange('dirElevation', v, { live: true }),
  }));
  container.appendChild(dir);

  // ---- Hemisphere light
  const hemi = subSection('Ambient (sky / ground)');
  hemi.appendChild(colorRow('Sky',
    params.hemiSky, (v) => onChange('hemiSky', v, { live: true })));
  hemi.appendChild(colorRow('Ground',
    params.hemiGround, (v) => onChange('hemiGround', v, { live: true })));
  hemi.appendChild(slider({
    label: 'Intensity', min: PARAM_DEFS.hemiIntensity.min, max: PARAM_DEFS.hemiIntensity.max,
    step: PARAM_DEFS.hemiIntensity.step, value: params.hemiIntensity,
    onInput: (v) => onChange('hemiIntensity', v, { live: true }),
  }));
  container.appendChild(hemi);

  // ---- Renderer / global look
  const ren = subSection('Renderer');
  ren.appendChild(selectRow('Tone mapping',
    TONE_MAPPING_IDS.map(id => ({ value: id, label: id.toUpperCase() })),
    params.toneMapping, (v) => onChange('toneMapping', v, { live: true })));
  ren.appendChild(slider({
    label: 'Exposure', min: PARAM_DEFS.exposure.min, max: PARAM_DEFS.exposure.max,
    step: PARAM_DEFS.exposure.step, value: params.exposure,
    onInput: (v) => onChange('exposure', v, { live: true }),
  }));

  const envRow = el('label', 'cs-toggle-wrap');
  envRow.style.cssText = 'gap:8px; margin-top:8px;';
  envRow.setAttribute('data-tooltip',
    'Adds a procedural Three.js Room environment map.\nMakes metallic / glossy materials reflect a soft studio scene — much fancier highlights.\nNo external HDR file needed.');
  const envCb = el('input');
  envCb.type = 'checkbox'; envCb.className = 'cs-toggle';
  envCb.checked = !!params.envEnabled;
  envCb.addEventListener('change', () => onChange('envEnabled', envCb.checked, { live: true }));
  envRow.append(envCb, el('span', 'cs-toggle-indicator'),
    el('span', '', 'Environment reflections'));
  ren.appendChild(envRow);

  container.appendChild(ren);
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
  matRow.setAttribute('data-tooltip', 'When OFF, only the shape randomizes — your current shader / texture / colour stays put.');
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
    btn.setAttribute('data-tooltip', info.tooltip);
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
  transparentRow.setAttribute('data-tooltip',
    'ON  = transparent PNG (no background colour, alpha channel preserved).\nOFF = include the current background colour as opaque pixels.');
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
  pngBtn.setAttribute('data-tooltip',
    'Capture the current canvas as a PNG at native resolution.\nThe transparent toggle above controls whether the background is preserved.');
  // Read the live checkbox state at click time — fixes a snapshot bug where
  // toggling didn't take effect until UI was refreshed.
  pngBtn.addEventListener('click', () => ctx.onExportImage({ transparent: transCb.checked }));
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
