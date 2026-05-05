// Shader registry: built-in fragments + ShaderToy adapter.

const BUILTIN_IDS = [
  'iridescent', 'plasma', 'voronoi', 'psychedelic',
  'matrix', 'lava', 'crystalline', 'starfield',
];

const SHADER_LABELS = {
  iridescent: 'Iridescent',
  plasma:     'Plasma',
  voronoi:    'Voronoi',
  psychedelic:'Psychedelic',
  matrix:     'Matrix',
  lava:       'Lava',
  crystalline:'Crystalline',
  starfield:  'Starfield',
  custom:     'Custom…',
};

const cache = { vertex: null, wrapper: null, builtins: {} };

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.text();
}

export async function loadVertex() {
  if (cache.vertex) return cache.vertex;
  cache.vertex = await fetchText('shaders/common/vertex.glsl');
  return cache.vertex;
}

export async function loadWrapper() {
  if (cache.wrapper) return cache.wrapper;
  cache.wrapper = await fetchText('shaders/common/shadertoy-wrapper.frag');
  return cache.wrapper;
}

let triplanarSrc = null;
export async function loadTriplanar() {
  if (triplanarSrc) return triplanarSrc;
  triplanarSrc = await fetchText('shaders/common/triplanar.frag');
  return triplanarSrc;
}

export async function loadBuiltin(id) {
  if (cache.builtins[id]) return cache.builtins[id];
  cache.builtins[id] = await fetchText(`shaders/builtin/${id}.frag`);
  return cache.builtins[id];
}

export function listBuiltins() {
  return BUILTIN_IDS.map(id => ({ id, label: SHADER_LABELS[id] }));
}

export function shaderLabel(id) {
  return SHADER_LABELS[id] || id;
}

export async function buildFragment(userCode) {
  const wrapper = await loadWrapper();
  return wrapper.replace('// __USER_CODE__', userCode);
}

// Resolve the active fragment source for a parameter set.
// Returns { vertex, fragment, source } where `source` is the user's `mainImage`.
export async function resolveShader(params) {
  const vertex = await loadVertex();
  let source;
  if (params.shaderId === 'custom' && params.shaderSource) {
    source = params.shaderSource;
  } else {
    const id = BUILTIN_IDS.includes(params.shaderId) ? params.shaderId : BUILTIN_IDS[0];
    source = await loadBuiltin(id);
  }
  const fragment = await buildFragment(source);
  return { vertex, fragment, source };
}

// Minimal ShaderToy URL parser. Pulls `mainImage` from a public shader.
// Uses the well-known anonymous public API key.
const SHADERTOY_API_KEY = 'NdrtRH';

export async function fetchShaderToy(input) {
  const m = input.match(/shadertoy\.com\/view\/([A-Za-z0-9]+)/);
  if (!m) throw new Error('Not a ShaderToy URL');
  const id = m[1];
  const url = `https://www.shadertoy.com/api/v1/shaders/${id}?key=${SHADERTOY_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ShaderToy API ${res.status}`);
  const data = await res.json();
  if (data.Error) throw new Error(data.Error);
  const passes = data.Shader?.renderpass || [];
  const image = passes.find(p => p.type === 'image') || passes[0];
  if (!image) throw new Error('No image pass found');
  const author = data.Shader?.info?.username || 'unknown';
  const name   = data.Shader?.info?.name || id;
  return `// "${name}" by ${author} — https://www.shadertoy.com/view/${id}\n${image.code}`;
}
